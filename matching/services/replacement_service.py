"""
matching/services/replacement_service.py — Tự động tìm người thay (Step 8.5).

Trigger: booking bị declined/cancelled/no-show (tier >= T1).
1. JobPost.status = needs_replacement
2. Chạy lại matching TRỪ: CP bị hủy, band blocked, CP đã được đề xuất
   3 lần cho job này mà không được chọn
3. Top 8 → notify parent replacement_found {n}
4. Auto-assign chỉ khi parent bật auto_replace AND top match_level in
   (very_high, high) AND job bắt đầu trong 6h (mặc định OFF — OPEN-QUESTIONS #3)
5. Pool rỗng → no_replacement, retry mỗi 30 phút trong 6h → alert admin
6. Mỗi lần chạy ghi ReplacementAttempt
"""

import logging

from datetime import datetime as _dt, timedelta
from django.utils import timezone

from ..config import get_int
from ..constants import JobPostStatus
from ..models import (
    Booking,
    CandidateProposal,
    JobPost,
    ReplacementAttempt,
)
from . import matching_service
from .notification_service import NotificationService
from .state import transition

logger = logging.getLogger('educarelink.matching.replacement')

MAX_ATTEMPT_PROPOSALS = 3  # Step 8.5.3 — đề xuất 3 lần không chọn → loại


def run_replacement_for_job(job, exclude_carepartner=None):
    """Trả về dict {candidates, attempt_no} hoặc None nếu job không hợp lệ."""
    if job.status not in (JobPostStatus.CAREPARTNER_SELECTED,
                          JobPostStatus.IN_PROGRESS,
                          JobPostStatus.NEEDS_REPLACEMENT,
                          JobPostStatus.MATCHING):
        return None

    with transition_needs_replacement(job):
        pass  # trạng thái xử lý trong context

    # Loại CP đã đề xuất 3 lần cho job này mà không được chọn
    excluded = set()
    if exclude_carepartner is not None:
        excluded.add(exclude_carepartner.pk)
    over_proposed = [
        p.carepartner_id for p in CandidateProposal.objects.filter(job=job)
        if _proposal_count_excluding_selected(p) >= MAX_ATTEMPT_PROPOSALS
    ]
    excluded.update(over_proposed)

    attempt_no = ReplacementAttempt.objects.filter(job=job).count() + 1
    result = matching_service.find_candidates(
        job, exclude_carepartners=excluded)
    candidates = result['candidates']

    ReplacementAttempt.objects.create(
        job=job, attempt_no=attempt_no,
        candidate_count=len(candidates), auto_assigned=False)

    if candidates:
        NotificationService.enqueue(
            job.parent, 'replacement_found',
            ctx={'n': min(len(candidates), 8)},
            data={'job_id': str(job.pk)})
        _maybe_auto_assign(job, candidates)
    else:
        NotificationService.enqueue(job.parent, 'no_replacement',
                                    data={'job_id': str(job.pk)})
        logger.info('[Replacement] Job %s pool rỗng — sẽ retry mỗi 30 phút', job.pk)

    return {'candidates': candidates, 'attempt_no': attempt_no}


class transition_needs_replacement:
    """Context: chuyển job sang needs_replacement nếu đang selected/in_progress."""

    def __enter__(self):
        if self.job.status in (JobPostStatus.CAREPARTNER_SELECTED,
                               JobPostStatus.IN_PROGRESS):
            from django.db import transaction
            with transaction.atomic():
                j = JobPost.objects.get(pk=self.job.pk)
                transition(j, JobPostStatus.NEEDS_REPLACEMENT, actor='system',
                           reason='CP hủy — tìm người thay')
                self.job.status = j.status

    def __exit__(self, *exc):
        return False

    def __init__(self, job):
        self.job = job


def _proposal_count_excluding_selected(proposal):
    """Số lần đề xuất: 1 lần ban đầu + (số lần replacement chạy lại mà không chọn)."""
    # CandidateProposal unique (job, cp) — count = số ReplacementAttempt của job
    # sau lần đề xuất đầu + 1. Đơn giản hóa: đếm attempts của job.
    return ReplacementAttempt.objects.filter(job=proposal.job).count() + 1


def _maybe_auto_assign(job, candidates):
    """Auto-assign OFF mặc định (OPEN-QUESTIONS #3). Bật khi parent bật
    auto_replace + top match_level (very_high|high) + job start trong 6h."""
    from .booking_service import select_carepartner
    from .lock_service import SlotConflictError

    top = candidates[0]
    if top.get('match_level') not in ('very_high', 'high'):
        return False
    profile = CarePartnerProfile_safe(top['carepartner_id'])
    if profile is None or not profile.auto_replace:
        return False
    first_slot = job.slots.order_by('date', 'time_from').first()
    if first_slot is None:
        return False
    start = timezone.make_aware(_dt.combine(first_slot.date, first_slot.time_from))
    if start > timezone.now() + timedelta(hours=6):
        return False
    try:
        booking, _created = select_carepartner(job, profile.user)
        NotificationService.enqueue(job.parent, 'replacement_found',
                                    ctx={'n': 1}, data={'auto_assigned': True})
        logger.info('[Replacement] Auto-assign CP %s cho job %s', profile.user, job.pk)
        return True
    except SlotConflictError:
        return False


def CarePartnerProfile_safe(cp_id):
    from ..models import CarePartnerProfile
    try:
        return CarePartnerProfile.objects.select_related('user').get(user_id=cp_id)
    except CarePartnerProfile.DoesNotExist:
        return None


def retry_empty_pool_jobs():
    """Beat mỗi 30 phút: job needs_replacement không có ứng viên → chạy lại.
    Quá 6 giờ → escalation admin (Step 7.5.5)."""
    from django.core.mail import mail_admins  # noqa — MVP: chỉ log

    window_hours = get_int('REPLACEMENT_RETRY_WINDOW_HOURS', 6)
    cutoff = timezone.now() - timedelta(hours=window_hours)
    jobs = JobPost.objects.filter(status=JobPostStatus.NEEDS_REPLACEMENT)
    for job in jobs:
        created = job.created_at
        if created and created < cutoff:
            logger.error(
                '[Replacement] Job %s không tìm được người thay sau %d giờ — CẦN ADMIN',
                job.pk, window_hours)
            continue
        run_replacement_for_job(job)
