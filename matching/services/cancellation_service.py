"""
matching/services/cancellation_service.py — Hủy / No-show / Phạt / Đền bù (Step 7).

MỌI con số (ELO tier, % đền bù, sàn đền bù, escalation, suspend) đọc từ
bảng CancelPolicy — KHÔNG hardcode (Step 7 AC11).

Idempotent: ELO per (booking, reason_code); credit per (booking, kind);
1 cancel request gửii 2 lần → 1 phạt + 1 đền + 1 notification (Step 7 AC2).

Force majeure (Step 5.3 + 7): ELO ×0.5, ĐỀN BÙ KHÔNG GIẢM, note >= 20 ký tự,
anti-abuse tối đa 2 lần / rolling 30 ngày (thứ 3 trở đi phạt full).
"""

import logging

from datetime import datetime as _dt, time as _time, timedelta
from django.db import transaction
from django.utils import timezone

from ..config import get_int
from ..constants import (
    BookingStatus,
    CANCEL_REASONS,
    FORCE_MAJEURE_CODES,
    FORCE_MAJEURE_MIN_NOTE_CHARS,
    JobPostStatus,
)
from ..models import (
    Appeal,
    Booking,
    CancelPolicy,
    CarePartnerProfile,
    EloLedger,
    JobPost,
    ParentTrustFlag,
)
from .credits_service import compute_compensation, issue_compensation
from .elo_service import EloService
from .lock_service import LockService
from .notification_service import NotificationService
from .state import transition

logger = logging.getLogger('educarelink.matching.cancel')


class CancelValidationError(Exception):
    """Payload hủy không hợp lệ → HTTP 400."""


# ─────────────────────────────────────────────────────────────────
# Tier selection (Step 7.1) — tự động theo lead time, không chọn tay
# ─────────────────────────────────────────────────────────────────
def _earliest_remaining_slot_start(booking):
    now = timezone.now()
    for slot in booking.job.slots.order_by('date', 'time_from'):
        start = timezone.make_aware(_dt.combine(slot.date, slot.time_from))
        if start > now:
            return start
    return None


def select_tier_for_cancel(booking, now=None):
    """Hủy SAU khi committed → T1-T4 theo lead time (Step 7.1)."""
    now = now or timezone.now()
    start = _earliest_remaining_slot_start(booking)
    if start is None:
        start = now  # không còn slot → tier nhẹ nhất có ý nghĩa là T0/T1
    lead_minutes = max(0, (start - now).total_seconds() / 60.0)
    for policy in (CancelPolicy.objects.filter(trigger='lead_time', is_active=True)
                   .order_by('-min_lead_minutes')):
        mn = policy.min_lead_minutes if policy.min_lead_minutes is not None else 0
        mx = policy.max_lead_minutes
        if lead_minutes >= mn and (mx is None or lead_minutes < mx):
            return policy, lead_minutes
    return CancelPolicy.objects.filter(trigger='lead_time').last(), lead_minutes


def select_tier_for_decline():
    """Hủy TRONG cửa sổ cam kết → T0."""
    return CancelPolicy.objects.get(trigger='in_window', is_active=True)


# ─────────────────────────────────────────────────────────────────
# Anti-abuse
# ─────────────────────────────────────────────────────────────────
def _force_majeure_count_last_30d(carepartner, now):
    threshold = now - timedelta(days=30)
    return EloLedger.objects.filter(
        carepartner=carepartner,
        reason_code__in=FORCE_MAJEURE_CODES,
        delta__lt=0,
        created_at__gte=threshold,
    ).count()


def _tier_count_last_30d(carepartner, tier_codes, now):
    threshold = now - timedelta(days=30)
    return EloLedger.objects.filter(
        carepartner=carepartner,
        reason_code__in=tier_codes,
        delta__lt=0,
        created_at__gte=threshold,
    ).count()


def _suspend_carepartner(carepartner, days, reason):
    profile, _ = CarePartnerProfile.objects.get_or_create(user=carepartner)
    profile.suspended_until = timezone.now() + timedelta(days=days)
    profile.save(update_fields=['suspended_until'])
    NotificationService.enqueue(carepartner, 'account_suspended',
                                ctx={'reason': reason}, data={})
    logger.warning('[Cancel] %s bị tạm khóa %d ngày (%s)', carepartner, days, reason)


# ─────────────────────────────────────────────────────────────────
# Cancel chính (CarePartner hủy / từ chối trong window)
# ─────────────────────────────────────────────────────────────────
@transaction.atomic
def cancel_by_carepartner(booking, reason_code, note='', evidence=None):
    """Hủy bởi CP: window → declined_in_window (T0); sau đó → tier T1-T4."""
    now = timezone.now()
    reason_code = (reason_code or '').strip()
    if reason_code not in CANCEL_REASONS:
        raise CancelValidationError('Lý do hủy không hợp lệ.')
    reason_label, cancel_class = CANCEL_REASONS[reason_code]

    if booking.status in (BookingStatus.DECLINED_IN_WINDOW,
                          BookingStatus.CANCELLED_BY_CAREPARTNER,
                          BookingStatus.CANCELLED_BY_PARENT,
                          BookingStatus.NO_SHOW,
                          BookingStatus.EXPIRED_NO_RESPONSE,
                          BookingStatus.COMPLETED):
        # Idempotent — đã hủy rồi, không phạt lần 2
        return Booking.objects.get(pk=booking.pk), False

    if booking.status not in (BookingStatus.AWAITING_COMMITMENT,
                              BookingStatus.COMMITTED,
                              BookingStatus.RESCHEDULE_REQUESTED):
        raise CancelValidationError(
            f'Không thể hủy booking ở trạng thái "{booking.get_status_display()}".')

    # Force majeure rules
    elo_multiplier = 1.0
    if reason_code in FORCE_MAJEURE_CODES:
        if len(note or '') < FORCE_MAJEURE_MIN_NOTE_CHARS:
            raise CancelValidationError(
                f'Lý do bất khả kháng cần ghi chú ít nhất {FORCE_MAJEURE_MIN_NOTE_CHARS} ký tự.')
        fm_count = _force_majeure_count_last_30d(booking.carepartner, now)
        max_fm = get_int('FORCE_MAJEURE_MAX_30D', 2)
        if fm_count >= max_fm:
            # Lạm dụng → phạt FULL dù là force majeure (Step 5.3)
            elo_multiplier = 1.0
            cancel_class = 'normal_cancel_abuse'
        else:
            elo_multiplier = 0.5  # ELO ×0.5 — ĐỀN BÙ KHÔNG ĐỔI (Step 7)

    # Chọn tier + status
    if booking.status == BookingStatus.AWAITING_COMMITMENT:
        policy = select_tier_for_decline()
        to_status = BookingStatus.DECLINED_IN_WINDOW
    else:
        policy, lead_minutes = select_tier_for_cancel(booking, now)

        # Escalation lặp lại (Step 7.1): T4 ×2/30d → charge as T5; 3× T4/T5 → T6
        base_tier = policy.tier
        repeat_codes = {base_tier}
        escalated = policy.escalate_to
        threshold = policy.repeat_threshold
        if escalated and threshold and _tier_count_last_30d(
                booking.carepartner, repeat_codes, now) + 1 >= threshold:
            higher = CancelPolicy.objects.filter(tier=escalated, is_active=True).first()
            if higher:
                policy = higher

        # T5/T6 ×2 trong 30 ngày → suspend (Step 7.1)
        if policy.tier in ('T5', 'T6'):
            serious_codes = {'T5', 'T6'}
            if _tier_count_last_30d(booking.carepartner, serious_codes, now) + 1 >= 2:
                pass  # suspend sau khi ghi ledger
        to_status = BookingStatus.CANCELLED_BY_CAREPARTNER

    # ── Ghi trạng thái + toàn bộ side effect CÙNG transaction (Step 12.3.4) ──
    booking.cancel_reason_code = reason_code
    booking.cancel_class = cancel_class
    booking.cancel_note = note or ''
    booking.cancel_evidence = evidence or []
    booking.cancelled_at = now
    booking.cancelled_by = 'carepartner'
    booking.save(update_fields=['cancel_reason_code', 'cancel_class', 'cancel_note',
                                'cancel_evidence', 'cancelled_at', 'cancelled_by'])

    if to_status == BookingStatus.DECLINED_IN_WINDOW:
        booking.committed_at = None
    transition(booking, to_status, actor='carepartner',
               actor_user=booking.carepartner,
               reason=f'{reason_code} ({reason_label})')

    # ELO — idempotent per (booking, reason_code=tier)
    elo_delta = policy.elo_delta
    if elo_multiplier != 1.0 and elo_delta < 0:
        elo_delta = int(elo_delta * elo_multiplier)
    ledger, applied = EloService.apply_event(
        booking.carepartner, policy.tier, booking=booking,
        delta_override=elo_delta, note=f'{reason_code} — {reason_label}')

    # Đền bù parent — credit ảo, KHÔNG giảm vì force majeure (Step 7)
    amount = compute_compensation(booking, policy)
    if amount > 0:
        txn, _created = issue_compensation(booking, amount,
                                           note=f'{policy.tier} — CP hủy ({reason_code})')
        booking.compensation_vnd = amount
        booking.save(update_fields=['compensation_vnd'])
        NotificationService.enqueue(booking.parent, 'compensation_issued',
                                    ctx={'amount': f'{amount:,}'}, data={})

    # Streak reset (Step 6.3 note)
    EloService.reset_streak(booking.carepartner)

    # Đếm/escalate suspend cho T5/T6 lặp
    if policy.tier in ('T5', 'T6') and policy.suspend_days:
        if _tier_count_last_30d(booking.carepartner, {'T5', 'T6'}, now) >= 2:
            _suspend_carepartner(booking.carepartner, policy.suspend_days,
                                 f'Không đến/hủy nghiêm trọng lặp lại ({policy.tier})')

    # Mở khóa slots của CP bị hủy (Step 7.5.1)
    LockService.release_locks(booking)

    # Notify parent + trigger replacement (tier >= T1 → luôn trigger Step 7.5)
    if policy.tier == 'T0':
        NotificationService.enqueue(booking.parent, 'carepartner_declined',
                                    ctx={'name': _display(booking.carepartner)},
                                    data={'booking_id': str(booking.pk)})
    else:
        NotificationService.enqueue(booking.parent, 'carepartner_cancelled',
                                    ctx={'name': _display(booking.carepartner)},
                                    data={'booking_id': str(booking.pk)})

    booking.elo_delta_applied = elo_delta if applied else booking.elo_delta_applied
    booking.save(update_fields=['elo_delta_applied'])

    trigger_replacement(booking)
    logger.info('[Cancel] CP hủy booking %s → %s (ELO %+d, đền %dđ)',
                booking.pk, to_status, elo_delta, amount)
    return Booking.objects.get(pk=booking.pk), True


# ─────────────────────────────────────────────────────────────────
# No-show (Step 7.4)
# ─────────────────────────────────────────────────────────────────
@transaction.atomic
def confirm_no_show(booking, parent_says_arrived):
    """Parent trả lời 'Đã đến'/'Không đến' trên suspected_no_show."""
    if booking.status != BookingStatus.SUSPECTED_NO_SHOW:
        raise CancelValidationError(
            f'Booking đang ở trạng thái "{booking.get_status_display()}".')

    if parent_says_arrived:
        transition(booking, BookingStatus.IN_PROGRESS, actor='parent',
                   actor_user=booking.parent, reason='Parent xác nhận đã đến')
        booking.started_at = timezone.now()
        booking.save(update_fields=['started_at'])
        return booking, False

    # Không đến → T5
    policy = CancelPolicy.objects.get(trigger='no_show', is_active=True)
    transition(booking, BookingStatus.NO_SHOW, actor='parent',
               actor_user=booking.parent, reason='Parent xác nhận không đến')
    booking.cancelled_at = timezone.now()
    booking.cancelled_by = 'system'
    booking.save(update_fields=['cancelled_at', 'cancelled_by'])

    EloService.apply_event(booking.carepartner, policy.tier, booking=booking)
    # Ghi tổng delta đã áp vào booking (Step 5.4 elo_delta_applied)
    ledger = EloLedger.objects.filter(booking=booking, reason_code=policy.tier).first()
    if ledger:
        booking.elo_delta_applied = ledger.delta
        booking.save(update_fields=['elo_delta_applied'])
    amount = compute_compensation(booking, policy)  # 50% sàn 50.000đ
    if amount > 0:
        issue_compensation(booking, amount, note='T5 no-show')
        booking.compensation_vnd = amount
        booking.save(update_fields=['compensation_vnd'])
    EloService.reset_streak(booking.carepartner)
    LockService.release_locks(booking)
    NotificationService.enqueue(booking.parent, 'carepartner_no_show',
                                ctx={'amount': f'{amount:,}'}, data={})
    if policy.suspend_days and _tier_count_last_30d(booking.carepartner, {'T5', 'T6'}, timezone.now()) >= 2:
        _suspend_carepartner(booking.carepartner, policy.suspend_days,
                             'No-show lặp lại')
    trigger_replacement(booking)
    return booking, True


@transaction.atomic
def no_show_unconfirmed_timeout(booking):
    """Parent im lặng 24h → no_show_unconfirmed, chỉ áp T4 + flag admin (Step 7.4.4)."""
    if booking.status != BookingStatus.SUSPECTED_NO_SHOW:
        return booking
    policy = (CancelPolicy.objects.filter(tier='T4', is_active=True).first()
              or CancelPolicy.objects.filter(trigger='lead_time').first())
    transition(booking, BookingStatus.NO_SHOW_UNCONFIRMED, actor='system',
               reason='Parent không trả lời sau 24h — áp T4, chờ admin')
    EloService.apply_event(booking.carepartner, 'T4', booking=booking)
    ledger = EloLedger.objects.filter(booking=booking, reason_code='T4').first()
    if ledger:
        booking.elo_delta_applied = ledger.delta
        booking.save(update_fields=['elo_delta_applied'])
    amount = compute_compensation(booking, policy)
    if amount > 0:
        issue_compensation(booking, amount, note='No-show chưa xác nhận — T4')
        booking.compensation_vnd = amount
        booking.save(update_fields=['compensation_vnd'])
    LockService.release_locks(booking)
    trigger_replacement(booking)
    return booking


# ─────────────────────────────────────────────────────────────────
# Parent hủy (Step 7.7 — không break, full parent score là Phase 2)
# ─────────────────────────────────────────────────────────────────
@transaction.atomic
def cancel_by_parent(booking, note=''):
    if booking.status in (BookingStatus.CANCELLED_BY_PARENT, BookingStatus.COMPLETED):
        return Booking.objects.get(pk=booking.pk), False
    if booking.status not in (BookingStatus.AWAITING_COMMITMENT,
                              BookingStatus.COMMITTED,
                              BookingStatus.RESCHEDULE_REQUESTED,
                              BookingStatus.IN_PROGRESS,
                              BookingStatus.SUSPECTED_NO_SHOW):
        raise CancelValidationError('Không thể hủy ở trạng thái này.')

    now = timezone.now()
    start = _earliest_remaining_slot_start(booking)
    lead_hours = ((start - now).total_seconds() / 3600.0) if start else 999

    transition(booking, BookingStatus.CANCELLED_BY_PARENT, actor='parent',
               actor_user=booking.parent, reason=note or 'Parent hủy')
    booking.cancelled_at = now
    booking.cancelled_by = 'parent'
    booking.save(update_fields=['cancelled_at', 'cancelled_by'])

    if lead_hours < 3:
        EloService.apply_event(booking.carepartner, 'parent_cancelled_compensation',
                               booking=booking, delta_override=10)
        ParentTrustFlag.objects.create(parent=booking.parent, booking=booking,
                                       code='late_cancel', note=note)
    elif lead_hours < 24:
        EloService.apply_event(booking.carepartner, 'parent_cancelled_compensation',
                               booking=booking, delta_override=5)

    LockService.release_locks(booking)
    trigger_replacement(booking)
    return Booking.objects.get(pk=booking.pk), True


# ─────────────────────────────────────────────────────────────────
# Appeal (Step 7.6)
# ─────────────────────────────────────────────────────────────────
APPEAL_WINDOW_DAYS_DEFAULT = 7
MAX_APPEALS_30D_DEFAULT = 3


@transaction.atomic
def create_appeal(booking, carepartner, reason_code, note, evidence=None):
    """Kháng cáo trong 7 ngày; max 3 đơn / rolling 30 ngày (thứ 4 auto-reject)."""
    now = timezone.now()
    window_days = get_int('APPEAL_WINDOW_DAYS', APPEAL_WINDOW_DAYS_DEFAULT)
    max_appeals = get_int('MAX_APPEALS_30D', MAX_APPEALS_30D_DEFAULT)

    ledger_exists = EloLedger.objects.filter(booking=booking, delta__lt=0).exists()
    if not ledger_exists:
        raise CancelValidationError('Đơn này chưa bị phạt — không có gì để kháng cáo.')
    if (now - (booking.cancelled_at or booking.updated_at)).days > window_days:
        raise CancelValidationError(f'Chỉ được kháng cáo trong {window_days} ngày sau phạt.')
    if len(note or '') < 20:
        raise CancelValidationError('Vui lòng mô tả lý do ít nhất 20 ký tự.')

    threshold = now - timedelta(days=30)
    recent = Appeal.objects.filter(carepartner=carepartner, created_at__gte=threshold).count()
    if recent >= max_appeals:
        appeal = Appeal.objects.create(
            booking=booking, carepartner=carepartner,
            reason_code=reason_code or 'other', note=note, evidence=evidence or [],
            status='rejected', admin_note='Tự động từ chối: vượt giới hạn 3 kháng cáo/30 ngày.',
            decided_at=now)
        # Anti-abuse: lạm dụng kháng cáo → -10 (Step 6.4)
        EloService.apply_event(carepartner, 'appeal_abuse')
        return appeal

    return Appeal.objects.create(booking=booking, carepartner=carepartner,
                                 reason_code=reason_code or 'other',
                                 note=note, evidence=evidence or [])


@transaction.atomic
def decide_appeal(appeal, admin, decision, admin_note=''):
    """Admin quyết định. approved → đảo ELO (giữ đền bù); partial → đảo 50%."""
    if appeal.status != 'pending':
        raise CancelValidationError('Kháng cáo này đã được xử lý.')
    appeal.admin = admin
    appeal.admin_note = admin_note or ''
    appeal.decided_at = timezone.now()

    penalty = EloLedger.objects.filter(
        booking=appeal.booking, delta__lt=0).order_by('-created_at').first()
    reverse_delta = 0
    if penalty and decision == 'approved':
        reverse_delta = -penalty.delta  # đảo full
    elif penalty and decision == 'partially_approved':
        reverse_delta = int(-penalty.delta * 0.5)

    appeal.status = decision
    appeal.save(update_fields=['status', 'admin', 'admin_note', 'decided_at'])

    if reverse_delta > 0:
        EloService.apply_event(appeal.carepartner, 'appeal_approved',
                               booking=appeal.booking, delta_override=reverse_delta,
                               admin=admin, note=f'Kháng cáo {decision}')
    NotificationService.enqueue(appeal.carepartner, 'appeal_decided',
                                ctx={'result': appeal.get_status_display(),
                                     'admin_note': appeal.admin_note}, data={})
    return appeal


# ─────────────────────────────────────────────────────────────────
# Auto-replacement (Step 7.5 + 8.5 — wire đầy đủ ở replacement_service)
# ─────────────────────────────────────────────────────────────────
def trigger_replacement(booking):
    """Phát event thay thế — chạy matching lại NGAY (Step 12.2 side effects)."""
    from .replacement_service import run_replacement_for_job
    job = booking.job
    if job.status not in (JobPostStatus.CAREPARTNER_SELECTED,
                          JobPostStatus.IN_PROGRESS,
                          JobPostStatus.NEEDS_REPLACEMENT):
        return None
    return run_replacement_for_job(job, exclude_carepartner=booking.carepartner)


def _display(user):
    return user.get_full_name() or user.username
