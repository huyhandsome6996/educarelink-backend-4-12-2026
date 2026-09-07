"""
matching/services/availability_service.py — Rules cho lịch rảnh + blackout (Step 9).

Rule 1/2: sửa lịch tự do khi không booking; có booking → 409
availability_locked_by_booking (phải hủy chính thức).
Rule 3 (reschedule) nằm ở reschedule_service.py (Phase 3).
Blackout: 409 khi trùng booking, max 30 tương lai, 14 ngày nghỉ liên tiếp → pause.
"""

import logging

from datetime import timedelta
from django.utils import timezone

from ..config import get_int
from ..constants import BUSY_BOOKING_STATUSES
from ..models import Booking, CarePartnerBlackout, CarePartnerProfile

from .lock_service import invalidate_availability_cache

logger = logging.getLogger('educarelink.matching.availability')


class AvailabilityLockedError(Exception):
    """Window đang có booking — map sang HTTP 409 availability_locked_by_booking."""


class BlackoutConflictError(Exception):
    """Blackout trùng booking — HTTP 409 blackout_conflicts_with_booking."""


class TooManyBlackoutsError(Exception):
    """Vượt 30 blackout tương lai — HTTP 400 too_many_blackouts."""


def _overlaps(tf1, tt1, tf2, tt2):
    return tf1 < tt2 and tf2 < tt1


def window_has_active_booking(window):
    """Window (row CarePartnerAvailability) có booking active dùng không?

    Booking sống trên NGÀY CỤ THỂ (không gắn window) — Rule 1/2 xét: mọi booking
    active của CP mà slot nào nằm TRONG window weekday tương ứng → khóa.
    """
    weekday = window.weekday
    for booking in Booking.objects.filter(
            carepartner=window.carepartner, status__in=BUSY_BOOKING_STATUSES,
            job__slots__date__isnull=False).distinct():
        for slot in booking.job.slots.all().only('date', 'time_from', 'time_to'):
            if slot.date.weekday() != weekday:
                continue
            if _overlaps(window.time_from, window.time_to, slot.time_from, slot.time_to):
                return True, booking
    return False, None


def can_delete_window(window):
    """(allowed, booking|None).

    allowed=False khi booking active đang dùng window → caller trả 409
    availability_locked_by_booking (Step 9.1 Rule 2)."""
    has_booking, booking = window_has_active_booking(window)
    return (not has_booking), booking


def check_overlap_same_day(carepartner, weekday, time_from, time_to, exclude_pk=None):
    """Trả về list window overlap cùng ngày (để serializer gợi ý merge)."""
    from ..models import CarePartnerAvailability
    qs = CarePartnerAvailability.objects.filter(carepartner=carepartner, weekday=weekday)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return [w for w in qs if _overlaps(time_from, time_to, w.time_from, w.time_to)]


def split_midnight(weekday, time_from, time_to):
    """Window cắt nửa đêm (22:00→01:00) tách thành 2 row (Step 9.3):
    [(weekday, 22:00, 23:59), (weekday+1 % 7, 00:00, 01:00)].
    Input time_from < time_to → [(weekday, tf, tt)] như cũ."""
    if time_from < time_to:
        return [(weekday, time_from, time_to)]
    from datetime import time as dtime
    rows = [(weekday, time_from, dtime(23, 59))]
    if time_to > dtime(0, 0):
        rows.append(((weekday + 1) % 7, dtime(0, 0), time_to))
    return rows


def create_blackout(carepartner, date, time_from=None, time_to=None, reason='other', note=''):
    """Tạo blackout với toàn bộ rule Step 9.2. Raise Error classes → API map 409/400."""
    today = timezone.localdate()

    # Max 30 blackout tương lai (config)
    max_blackouts = get_int('MAX_BLACKOUTS_FUTURE', 30)
    future_count = CarePartnerBlackout.objects.filter(
        carepartner=carepartner, date__gte=today).count()
    if date >= today and future_count >= max_blackouts:
        raise TooManyBlackoutsError(
            f'Bạn chỉ có thể khai tối đa {max_blackouts} ngày bận trong tương lai.')

    # Trùng booking active → 409 (phải hủy/đổi giờ chính thức)
    conflict = None
    for booking in Booking.objects.filter(
            carepartner=carepartner, status__in=BUSY_BOOKING_STATUSES).distinct():
        for slot in booking.job.slots.filter(date=date):
            if time_from is None:  # blackout cả ngày
                conflict = (booking, slot)
                break
            if _overlaps(time_from, time_to, slot.time_from, slot.time_to):
                conflict = (booking, slot)
                break
        if conflict:
            break
    if conflict:
        raise BlackoutConflictError(
            'Ngày này bạn đang có đơn đã xác nhận. Hãy hủy hoặc đổi giờ đơn trước khi khai bận.')

    blackout = CarePartnerBlackout.objects.create(
        carepartner=carepartner, date=date,
        time_from=time_from, time_to=time_to,
        reason=reason, note=note)
    invalidate_availability_cache(carepartner, date)
    check_14_day_pause(carepartner)
    return blackout


def check_14_day_pause(carepartner):
    """14 ngày nghỉ FULL liên tiếp → matching_paused=True + notification
    blackout_paused (đúng 1 lần — chỉ set khi chưa pause).                 (Step 9.2)
    """
    pause_days = get_int('BLACKOUT_PAUSE_DAYS', 14)
    profile, _ = CarePartnerProfile.objects.get_or_create(user=carepartner)
    if profile.matching_paused:
        return False

    full_dates = set(
        CarePartnerBlackout.objects.filter(
            carepartner=carepartner,
            time_from__isnull=True, time_to__isnull=True,
        ).values_list('date', flat=True))
    if not full_dates:
        return False

    # Tìm chuỗi liên tiếp dài nhất trong các ngày full blackout
    sorted_dates = sorted(full_dates)
    longest, run = 1, 1
    for prev, cur in zip(sorted_dates, sorted_dates[1:]):
        run = run + 1 if (cur - prev).days == 1 else 1
        longest = max(longest, run)
    if longest < pause_days:
        return False

    profile.matching_paused = True
    profile.save(update_fields=['matching_paused'])
    from .notification_service import NotificationService
    NotificationService.enqueue(carepartner, 'blackout_paused', data={})
    logger.warning('[Blackout] %s nghỉ %d ngày liên tiếp → matching_paused', carepartner, longest)
    return True
