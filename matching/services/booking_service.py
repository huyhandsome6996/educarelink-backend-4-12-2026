"""
matching/services/booking_service.py — Auto-commit booking (Step 5, LOCKED).

Parent chọn CP → booking tạo NGAY status=awaiting_commitment (KHÔNG cần CP
bấm đồng ý). "Đã khai rảnh + được chọn = phải đi làm."

MỘT TRANSACTION (Step 5.1.2):
  a. Re-validate slots còn trống (LockService)
  b. Tạo Booking(awaiting_commitment) — commitment window theo bảng 5.2
  c. Hard-lock ALL slots (all-or-nothing, recurring)
  d. Đánh dấu ứng viên khác not_selected
  e. JobPost.status = carepartner_selected
  f. Notify CP (critical, kêu to) + parent — GỬI SAU on_commit
Idempotency-Key: replay trả đúng booking cũ, không tạo mới.
Concurrent race: thua → SlotConflictError → HTTP 409 slot_taken.
"""

import logging

from datetime import datetime as _dt, time as _time, timedelta
from django.db import transaction
from django.utils import timezone

from ..config import get_config, get_int
from ..constants import BookingStatus, JobPostStatus
from ..models import (
    Booking,
    CandidateProposal,
    JobPost,
    JobSlot,
)
from .lock_service import LockService, SlotConflictError
from .notification_service import NotificationService
from .state import transition

logger = logging.getLogger('educarelink.matching.booking')


def compute_commit_deadline(selected_at, first_slot_start):
    """Bảng cửa sổ cam kết Step 5.2 — mọi con số đọc từ MatchingConfig.

    Hard cap: window kết thúc >= 5 phút trước giờ job start; nếu vi phạm →
    window 0 → booking đi thẳng committed (Step 5.2).
    Trả (deadline|None, window_minutes). None = committed ngay.
    """
    minutes_to_start = (first_slot_start - selected_at).total_seconds() / 60.0
    w24 = get_int('COMMIT_WINDOW_24H', 60)
    w6 = get_int('COMMIT_WINDOW_6H', 30)
    w1 = get_int('COMMIT_WINDOW_1H', 15)
    w_urgent = get_int('COMMIT_WINDOW_URGENT', 5)
    margin = get_int('COMMIT_MIN_MARGIN_MIN', 5)

    if minutes_to_start > 24 * 60:
        window = w24
    elif minutes_to_start > 6 * 60:
        window = w6
    elif minutes_to_start > 1 * 60:
        window = w1
    else:
        window = w_urgent

    deadline = selected_at + timedelta(minutes=window)
    # Hard cap: deadline phải cách giờ start ít nhất margin phút
    if deadline > first_slot_start - timedelta(minutes=margin):
        return None, 0
    return deadline, window


def compute_total_value(job):
    """job_value = hourly_rate × số giờ/slot × số slot (Step 7.2)."""
    slots = list(job.slots.all())
    if not slots:
        return 0
    first = slots[0]
    hours = ((first.time_to.hour * 60 + first.time_to.minute) -
             (first.time_from.hour * 60 + first.time_from.minute)) / 60.0
    if hours <= 0:
        hours = 1.0
    return int(job.hourly_rate_vnd * hours * len(slots))


def _first_slot_start(job):
    slot = job.slots.order_by('date', 'time_from').first()
    if slot is None:
        return None
    return timezone.make_aware(_dt.combine(slot.date, slot.time_from))


@transaction.atomic
def select_carepartner(job, carepartner, actor_user=None, idempotency_key=None):
    """Chọn CP → tạo booking auto-commit. Raise SlotConflictError khi race.

    Idempotent: (1) Idempotency-Key cache, (2) unique (job, carepartner),
    (3) job đã có booking active → trả booking đó.
    """
    if job.status in (JobPostStatus.CAREPARTNER_SELECTED,
                      JobPostStatus.NEEDS_REPLACEMENT,
                      JobPostStatus.IN_PROGRESS):
        existing = Booking.objects.filter(
            job=job,
            status__in=(BookingStatus.AWAITING_COMMITMENT, BookingStatus.COMMITTED)
        ).first()
        if existing:
            if existing.carepartner_id == carepartner.pk:
                return existing, False  # Idempotency-Key replay cùng CP
            raise SlotConflictError(
                'Slot đã bị giữ — CarePartner khác đã được chọn cho đơn này.')

    if job.status not in (JobPostStatus.MATCHING, JobPostStatus.AI_PARSED):
        raise SlotConflictError(f'Bài đăng đang ở trạng thái "{job.get_status_display()}".')

    now = timezone.now()
    first_start = _first_slot_start(job)
    if first_start is None:
        raise SlotConflictError('Đơn chưa có khung giờ (chưa parse xong).')
    if first_start <= now:
        raise SlotConflictError('Đơn đã qua giờ bắt đầu — không thể chọn.')

    # (a) Re-validate: toàn bộ slot phải rảnh với CP này (all-or-nothing)
    required_slots = [(s.date, s.time_from, s.time_to) for s in job.slots.all()]
    conflicts = []
    for d, tf, tt in required_slots:
        conflicts.extend(LockService._find_conflicts(carepartner, d, tf, tt))
    if conflicts:
        detail = '; '.join(f'{c.date} {c.time_from}-{c.time_to}' for c in conflicts[:3])
        raise SlotConflictError(f'Slot đã bị giữ: {detail}')

    # Buffer 90 phút với các đơn KHÁC của CP
    for d, tf, tt in required_slots:
        LockService.validate_buffer(carepartner, d, tf, tt)

    # (b) Tạo booking
    deadline, window = compute_commit_deadline(now, first_start)
    booking = Booking.objects.create(
        job=job, carepartner=carepartner, parent=job.parent,
        status=BookingStatus.AWAITING_COMMITMENT,
        selected_at=now,
        commit_deadline=deadline or now,  # window 0 → committed ngay sau đây
        total_value_vnd=compute_total_value(job) or job.hourly_rate_vnd,
    )

    # (c) Hard-lock ALL slots (all-or-nothing) — cùng transaction
    LockService.hard_lock(required_slots, booking, carepartner, job=job)

    # Window 0 → committed ngay (Step 5.2 hard cap)
    if deadline is None:
        booking.committed_at = now
        transition(booking, BookingStatus.COMMITTED, actor='system',
                   reason='Job quá gấp — cam kết ngay (window 0)')
    else:
        StateLog_create(booking, 'awaiting_commitment', 'Parent chọn CP — chờ cam kết',
                        actor_user)

    # (d) Ứng viên khác → not_selected (Step 5.1.2.d)
    other_proposals = (CandidateProposal.objects
                       .filter(job=job).exclude(carepartner=carepartner))
    for proposal in other_proposals:
        Booking.objects.get_or_create(
            job=job, carepartner=proposal.carepartner,
            defaults=dict(parent=job.parent, status=BookingStatus.NOT_SELECTED,
                          selected_at=now,
                          commit_deadline=now,
                          total_value_vnd=max(1, compute_total_value(job))))

    # (e) JobPost → carepartner_selected
    job.selected_carepartner = carepartner
    job.total_matched = job.total_matched or 0
    job.save(update_fields=['selected_carepartner', 'total_matched', 'updated_at'])
    transition(job, JobPostStatus.CAREPARTNER_SELECTED, actor='parent',
               actor_user=actor_user or job.parent, reason='Parent chọn CP')

    # (f) Notify — enqueue trong transaction, gửi sau on_commit (Step 12.3.5)
    NotificationService.enqueue(
        carepartner, 'job_assigned',
        data={'type': 'job_assigned', 'booking_id': str(booking.pk),
              'job_id': str(job.pk)},
        ctx={})
    NotificationService.enqueue(
        job.parent, 'booking_committed' if deadline is None else 'job_assigned',
        data={'type': 'booking_selected', 'booking_id': str(booking.pk)},
        ctx={'time': first_start.strftime('%H:%M'),
             'date': first_start.strftime('%d/%m/%Y')})

    logger.info('[Booking] Parent %s chọn CP %s cho job %s (window %s phút)',
                job.parent, carepartner, job.pk, window)
    return booking, True


def StateLog_create(booking, to_status, reason, actor_user=None):
    """Ghi log transition cho booking vừa tạo (không qua validator vì
    booking khởi tạo trực tiếp ở trạng thái này)."""
    from ..models import StateTransitionLog
    StateTransitionLog.objects.create(
        entity='booking', entity_id=booking.pk,
        from_status='proposed', to_status=to_status,
        actor='parent', actor_user=actor_user or booking.parent,
        reason=reason or '')


def seconds_left(booking, now=None):
    now = now or timezone.now()
    if booking.status != BookingStatus.AWAITING_COMMITMENT:
        return 0
    remaining = (booking.commit_deadline - now).total_seconds()
    return max(0, int(remaining))


def lazy_commit_check(booking):
    """Đọc booking → nếu quá deadline mà vẫn awaiting → committed NGAY
    (Step 5 AC4: scheduler chết thì GET vẫn lật trạng thái)."""
    if booking.status != BookingStatus.AWAITING_COMMITMENT:
        return booking
    now = timezone.now()
    if booking.commit_deadline and booking.commit_deadline <= now:
        with transaction.atomic():
            b = Booking.objects.select_for_update().get(pk=booking.pk)
            if b.status == BookingStatus.AWAITING_COMMITMENT:
                b.committed_at = now
                b.save(update_fields=['committed_at'])
                transition(b, BookingStatus.COMMITTED, actor='system',
                           reason='Hết cửa sổ cam kết (lazy check)')
                NotificationService.enqueue(b.carepartner, 'booking_committed', ctx={})
        return Booking.objects.get(pk=booking.pk)
    return booking
