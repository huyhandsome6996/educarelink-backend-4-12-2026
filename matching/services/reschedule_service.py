"""
matching/services/reschedule_service.py — Đổi giờ thỏa thuận (Step 9 Rule 3).

CP xin đổi → parent nhận critical → deadline theo lead time
(>48h→12h, 24-48h→6h, 6-24h→2h, <6h→30m) → approve: mở lock cũ + khóa mới
ATOMIC + ELO +1; decline/expire → CP có 30 phút chọn [Tiếp tục]/[Hủy],
không chọn → auto-cancel theo tier hiện tại (KHÔNG có lối thoát miễn phí).
Max 2 yêu cầu/booking.
"""

import logging

from datetime import datetime as _dt, timedelta
from django.db import transaction
from django.utils import timezone

from ..config import get_int
from ..constants import BookingStatus
from ..models import Booking, RescheduleRequest
from .availability_service import AvailabilityLockedError
from .lock_service import LockService, SlotConflictError
from .notification_service import NotificationService
from .state import transition

logger = logging.getLogger('educarelink.matching.reschedule')


class RescheduleValidationError(Exception):
    """Yêu cầu đổi giờ không hợp lệ → HTTP 400/409."""


def _parent_deadline_minutes(first_start, now):
    """Bảng deadline trả lời của parent (Step 9.1.3)."""
    hours = (first_start - now).total_seconds() / 3600.0
    if hours > 48:
        return 12 * 60
    if hours > 24:
        return 6 * 60
    if hours > 6:
        return 2 * 60
    return 30


@transaction.atomic
def create_request(booking, new_date, new_time_from, new_time_to, reason=''):
    now = timezone.now()
    if booking.status not in (BookingStatus.AWAITING_COMMITMENT,
                              BookingStatus.COMMITTED):
        raise RescheduleValidationError(
            f'Đơn đang "{booking.get_status_display()}" — không xin đổi giờ được.')
    max_req = get_int('MAX_RESCHEDULE_PER_BOOKING', 2)
    count = RescheduleRequest.objects.filter(booking=booking).count()
    if count >= max_req:
        raise RescheduleValidationError(
            f'Đã xin đổi giờ {count}/{max_req} lần — chỉ còn có thể hủy đơn.')

    if not (new_date and new_time_from and new_time_to):
        raise RescheduleValidationError('Thiếu ngày/giờ mới.')
    from datetime import time as dtime
    try:
        if isinstance(new_date, str):
            new_date = _dt.strptime(new_date, '%Y-%m-%d').date()
        tf = new_time_from if isinstance(new_time_from, dtime) else \
            _dt.strptime(new_time_from[:5], '%H:%M').time()
        tt = new_time_to if isinstance(new_time_to, dtime) else \
            _dt.strptime(new_time_to[:5], '%H:%M').time()
    except ValueError:
        raise RescheduleValidationError('Định dạng ngày/giờ không hợp lệ.')
    if tt <= tf:
        raise RescheduleValidationError('Giờ kết thúc phải sau giờ bắt đầu.')

    # NGHIỆP VỤ: giờ mới PHẢI nằm trong lịch rảnh của CHÍNH CP (Step 9.1.3.1)
    from .lock_service import available_slots
    slots = available_slots(booking.carepartner, new_date, use_cache=False)
    if not any(tf >= s_from and tt <= s_to for s_from, s_to in slots):
        raise RescheduleValidationError(
            'Giờ mới phải nằm trong lịch rảnh bạn đã khai. Hãy khai lịch trước.')

    first_slot = booking.job.slots.order_by('date', 'time_from').first()
    first_start = timezone.make_aware(_dt.combine(first_slot.date, first_slot.time_from)) \
        if first_slot else now
    deadline = now + timedelta(minutes=_parent_deadline_minutes(first_start, now))

    req = RescheduleRequest.objects.create(
        booking=booking, new_date=new_date,
        new_time_from=tf, new_time_to=tt, reason=reason or '',
        parent_deadline=deadline)

    # Booking → reschedule_requested (critical notify parent — Step 9.1.3.2)
    transition(booking, BookingStatus.RESCHEDULE_REQUESTED, actor='carepartner',
               actor_user=booking.carepartner, reason=reason or 'Xin đổi giờ')
    NotificationService.enqueue(
        booking.parent, 'reschedule_requested',
        ctx={'name': booking.carepartner.get_full_name() or booking.carepartner.username,
             'old': f'{first_slot.date} {first_slot.time_from:%H:%M}' if first_slot else '',
             'new': f'{new_date} {tf:%H:%M}'},
        data={'booking_id': str(booking.pk), 'reschedule_id': str(req.pk)})
    return req


@transaction.atomic
def respond(req, decision, actor_user=None):
    """approve | decline | continue | cancel (Step 9.1.3.4-5)."""
    booking = req.booking
    now = timezone.now()
    req.responded_at = now

    if decision == 'approve':
        # ATOMIC swap locks: mở cũ + khóa mới trong CÙNG transaction (Step 9 AC12)
        job = booking.job
        # Cập nhật JobSlot sang khung mới
        first_slot = job.slots.order_by('date', 'time_from').first()
        if first_slot:
            from ..models import JobSlot
            old_locks = LockService.release_locks(booking)
            JobSlot.objects.filter(job=job).delete()
            JobSlot.objects.create(job=job, date=req.new_date,
                                   time_from=req.new_time_from,
                                   time_to=req.new_time_to)
            LockService.hard_lock(
                [(req.new_date, req.new_time_from, req.new_time_to)],
                booking, booking.carepartner, job=job)
        req.status = 'approved'
        req.save(update_fields=['status', 'responded_at'])
        booking.status = BookingStatus.RESCHEDULE_REQUESTED  # chuẩn hóa trước transition
        booking.save(update_fields=['status'])
        transition(booking, BookingStatus.COMMITTED, actor='parent',
                   actor_user=actor_user or booking.parent, reason='Duyệt đổi giờ')
        # ELO +1 reschedule_ok (Step 9.1.3.4)
        from .elo_service import EloService
        EloService.apply_event(booking.carepartner, 'reschedule_ok', booking=booking)
        NotificationService.enqueue(booking.carepartner, 'booking_committed', ctx={})
        NotificationService.enqueue(booking.parent, 'booking_committed', ctx={})
        logger.info('[Reschedule] %s approved cho booking %s', req.pk, booking.pk)
        return req

    if decision in ('decline', 'continue'):
        # CP giữ nguyên đơn — quay lại committed
        req.status = 'declined'
        req.save(update_fields=['status', 'responded_at'])
        if booking.status == BookingStatus.RESCHEDULE_REQUESTED:
            transition(booking, BookingStatus.COMMITTED, actor='parent',
                       actor_user=actor_user or booking.parent,
                       reason='Parent từ chối — CP tiếp tục đơn')
        return req

    if decision == 'cancel':
        # CP chọn hủy sau khi bị từ chối → tier theo lead time HIỆN TẠI
        req.status = 'declined'
        req.save(update_fields=['status', 'responded_at'])
        from . import cancellation_service
        cancellation_service.cancel_by_carepartner(
            booking, reason_code='personal', note='Hủy sau khi đổi giờ bị từ chối')
        return req

    raise RescheduleValidationError('decision phải là approve/decline/continue/cancel.')


@transaction.atomic
def expire_idle(req, now=None):
    """Deadline hết + parent im lặng → req expired → CP có 30 phút chọn;
    quá 30 phút → auto-cancel theo tier hiện tại (Step 9.1.3.5)."""
    now = now or timezone.now()
    if req.status != 'pending' or req.parent_deadline > now:
        return False
    req.status = 'expired'
    req.save(update_fields=['status'])
    # Phát event (reschedule_expired) — Phase sau wire thêm hành động
    from .events import publish
    publish('reschedule_expired', booking_id=str(req.booking_id))
    idle_minutes = get_int('RESCHEDULE_IDLE_MINUTES', 30)
    if now >= req.parent_deadline + timedelta(minutes=idle_minutes):
        booking = req.booking
        if booking.status == BookingStatus.RESCHEDULE_REQUESTED:
            from . import cancellation_service
            cancellation_service.cancel_by_carepartner(
                booking, reason_code='personal',
                note='Không phản hồi sau yêu cầu đổi giờ — auto-cancel')
    return True
