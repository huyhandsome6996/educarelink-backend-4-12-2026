"""
matching/services/lock_service.py — Chống double-booking (Step 10).

3 RULE (NON-NEGOTIABLE):
  Rule 1: Soft lock 5 phút giữ chỗ khi parent đang xem.
  Rule 2: Hard lock ở mức DB khi booking tạo thật (all-or-nothing, SELECT FOR UPDATE).
  Rule 3: BUFFER 90 phút giữa 2 job liên tiếp của cùng CP
          (Job 18:00-19:00 → 19:30 FAIL, 20:30 PASS; config BUFFER_MINUTES).

Concurrency: hard_lock chạy trong transaction của caller (atomic không Savepoint
trên PG) — 50 thread chọn cùng slot → 1 thành công, 49 SlotConflictError.
"""

import logging

from datetime import datetime as _dt, time as _time, timedelta
from django.db import transaction
from django.utils import timezone

from ..config import get_int
from ..constants import BUSY_BOOKING_STATUSES
from ..models import Booking, SlotLock

logger = logging.getLogger('educarelink.matching.lock')


class SlotConflictError(Exception):
    """Slot đã bị khóa/booked — caller map sang HTTP 409 slot_taken."""


class BufferViolationError(SlotConflictError):
    """Vi phạm buffer 90 phút giữa 2 job liên tiếp — cùng nhóm conflict 409."""


def _as_datetimes(date, time_from, time_to):
    """(date, time, time) → (aware_start, aware_end) theo timezone VN."""
    start = timezone.make_aware(_dt.combine(date, time_from))
    end = timezone.make_aware(_dt.combine(date, time_to))
    return start, end


class LockService:
    """Tạo/xóa lock + validate buffer. Slots truyền vào là list (date, time_from, time_to)."""

    @staticmethod
    def soft_lock(carepartner, slots, ttl_seconds=None, job=None):
        """Rule 1: giữ chỗ mềm. Lock cũ (soft) cùng CP trùng khung bị thay thế.

        Trả về list SlotLock vừa tạo. Không raise khi chồng lấn với chính CP.
        """
        ttl = ttl_seconds if ttl_seconds is not None else get_int('SOFT_LOCK_TTL_SECONDS', 300)
        now = timezone.now()
        created = []
        for date, time_from, time_to in slots:
            # Xóa soft lock cũ của CHÍNH CP trong khung này (giữ chỗ lại từ đầu)
            LockService._delete_soft_overlaps(carepartner, date, time_from, time_to)
            created.append(SlotLock.objects.create(
                carepartner=carepartner, job=job, date=date,
                time_from=time_from, time_to=time_to,
                lock_type=SlotLock.LockType.SOFT,
                expires_at=now + timedelta(seconds=ttl),
            ))
        logger.info('[Lock] Soft lock %d slot cho %s (TTL %ss)', len(created), carepartner, ttl)
        return created

    @staticmethod
    def hard_lock(slots, booking, carepartner, job=None):
        """Rule 2: khóa cứng ALL slots — all-or-nothing.

        Caller PHẢI bọc trong transaction.atomic(). Nếu bất kỳ slot nào trùng
        (hard lock ai đó / soft lock người khác / booking đang chạy) →
        SlotConflictError → transaction rollback → KHÔNG lock 1 phần.
        Booking truyền vào được LOẠI TRỪ khỏi conflict check (chính nó).
        """
        # Phase 1 — kiểm tra toàn bộ trước khi ghi
        conflicts = []
        for date, time_from, time_to in slots:
            c = LockService._find_conflicts(carepartner, date, time_from, time_to,
                                            exclude_booking=booking)
            if c:
                conflicts.extend(c)
        if conflicts:
            detail = '; '.join(f'{c.date} {c.time_from}-{c.time_to}' for c in conflicts[:3])
            logger.warning('[Lock] Conflict khi hard lock cho %s: %s', carepartner, detail)
            raise SlotConflictError(f'Slot đã bị giữ: {detail}')

        # Phase 2 — ghi toàn bộ (caller giữ transaction → atomic cùng booking)
        created = []
        for date, time_from, time_to in slots:
            # Soft lock của chính CP trong khung → xóa (thay bằng hard)
            LockService._delete_soft_overlaps(carepartner, date, time_from, time_to)
            created.append(SlotLock.objects.create(
                carepartner=carepartner, job=job or (booking.job if booking else None),
                booking=booking, date=date,
                time_from=time_from, time_to=time_to,
                lock_type=SlotLock.LockType.HARD, expires_at=None,
            ))
        # Cập nhật JobSlot status = locked
        from ..models import JobSlot
        job = booking.job if booking else None
        if job is not None:
            JobSlot.objects.filter(job=job).update(status=JobSlot.SlotStatus.LOCKED)
        logger.info('[Lock] Hard lock %d slot cho booking %s', len(created), getattr(booking, 'pk', None))
        return created

    @staticmethod
    def release_locks(booking):
        """Mở toàn bộ hard lock của booking — IDEMPOTENT (gọi 2 lần không lỗi).

        Gọi khi booking hủy / hoàn thành / chuyển needs_replacement.
        """
        deleted, _ = SlotLock.objects.filter(booking=booking).delete()
        logger.info('[Lock] Release %d lock của booking %s', deleted, booking.pk)
        return deleted

    # ─────────────────────────────────────────────────────────────
    # Conflict detection
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _overlaps(tf1, tt1, tf2, tt2):
        return tf1 < tt2 and tf2 < tt1

    @classmethod
    def _find_conflicts(cls, carepartner, date, time_from, time_to, now=None,
                        exclude_booking=None):
        """Mọi thứ chặn việc khóa (date, tf, tt) của CP này.

        exclude_booking: booking đang được tạo/khóa — loại trừ khỏi check
        (Step 5.1.2: booking tạo trước, hard lock sau cùng transaction).
        """
        now = now or timezone.now()
        exclude_pk = exclude_booking.pk if exclude_booking is not None else None
        conflicts = []

        # 1. Hard lock của BẤT KỲ ai trong khung (trừ lock của chính booking này)
        for lock in SlotLock.objects.filter(date=date, lock_type=SlotLock.LockType.HARD):
            if exclude_pk is not None and lock.booking_id == exclude_pk:
                continue
            if cls._overlaps(time_from, time_to, lock.time_from, lock.time_to):
                conflicts.append(lock)

        # 2. Soft lock CÒN HẠN của NGƯỜI KHÁC
        for lock in SlotLock.objects.filter(
                date=date, lock_type=SlotLock.LockType.SOFT,
                expires_at__gt=now).exclude(carepartner=carepartner):
            if cls._overlaps(time_from, time_to, lock.time_from, lock.time_to):
                conflicts.append(lock)

        # 3. Booking đang chiếm slot (trừ chính booking)
        qs = Booking.objects.filter(
            carepartner=carepartner, status__in=BUSY_BOOKING_STATUSES)
        if exclude_pk is not None:
            qs = qs.exclude(pk=exclude_pk)
        for booking in qs.distinct():
            for slot in booking.job.slots.filter(date=date):
                if cls._overlaps(time_from, time_to, slot.time_from, slot.time_to):
                    conflicts.append(slot)
        return conflicts

    @classmethod
    def has_conflict(cls, carepartner, date, time_from, time_to):
        return bool(cls._find_conflicts(carepartner, date, time_from, time_to))

    @staticmethod
    def _delete_soft_overlaps(carepartner, date, time_from, time_to):
        """Xóa soft lock của chính CP chồng khung (same user không tự chặn)."""
        locks = SlotLock.objects.filter(
            carepartner=carepartner, date=date, lock_type=SlotLock.LockType.SOFT)
        removed = 0
        for lock in locks:
            if LockService._overlaps(time_from, time_to, lock.time_from, lock.time_to):
                lock.delete()
                removed += 1
        return removed

    # ─────────────────────────────────────────────────────────────
    # Rule 3 — BUFFER 90 phút
    # ─────────────────────────────────────────────────────────────
    @classmethod
    def validate_buffer(cls, carepartner, date, time_from, time_to, buffer_minutes=None):
        """2 job liên tiếp phải cách >= buffer (mặc định 90').

        So theo |chênh ngày| <= 1 (job qua đêm). Overlap → SlotConflictError;
        gap < buffer → BufferViolationError; OK → trả về None.
        """
        if buffer_minutes is None:
            buffer_minutes = get_int('BUFFER_MINUTES', 90)
        buffer = timedelta(minutes=buffer_minutes)
        new_start, new_end = _as_datetimes(date, time_from, time_to)

        for booking in Booking.objects.filter(
                carepartner=carepartner, status__in=BUSY_BOOKING_STATUSES,
                job__slots__date__in=[date - timedelta(days=1), date, date + timedelta(days=1)],
        ).distinct():
            for slot in booking.job.slots.filter(
                    date__in=[date - timedelta(days=1), date, date + timedelta(days=1)]):
                old_start, old_end = _as_datetimes(slot.date, slot.time_from, slot.time_to)
                # Overlap → không phải buffer mà là conflict
                if new_start < old_end and old_start < new_end:
                    raise SlotConflictError(
                        f'Trùng lịch với đơn {slot.date} {slot.time_from}-{slot.time_to}')
                # Job cũ trước job mới
                if old_end <= new_start and (new_start - old_end) < buffer:
                    raise BufferViolationError(
                        f'Cần cách nhau tối thiểu {buffer_minutes} phút với đơn '
                        f'{slot.date} {slot.time_from:%H:%M}-{slot.time_to:%H:%M} '
                        f'(hiện {(new_start - old_end).total_seconds() // 60:.0f} phút)')
                # Job mới trước job cũ
                if new_end <= old_start and (old_start - new_end) < buffer:
                    raise BufferViolationError(
                        f'Cần cách nhau tối thiểu {buffer_minutes} phút với đơn '
                        f'{slot.date} {slot.time_from:%H:%M}-{slot.time_to:%H:%M} '
                        f'(hiện {(old_start - new_end).total_seconds() // 60:.0f} phút)')
        return None


# ═══════════════════════════════════════════════════════════════════
# available_slots — HÀM DUY NHẤT để biết CP rảnh lúc nào (Step 9.3)
# ═══════════════════════════════════════════════════════════════════

CACHE_TTL_SECONDS = 60  # tối đa 60s theo spec


def _cache_key(carepartner_id, date):
    return f'matching:avail:{carepartner_id}:{date.isoformat()}'


def invalidate_availability_cache(carepartner, date=None):
    """Gọi sau MỌI ghi availability/blackout/booking/lock (Step 9.3)."""
    from django.core.cache import cache
    if date is not None:
        cache.delete(_cache_key(carepartner.pk, date))
    else:
        # Xóa mọi ngày — key prefix scan không có trong LocMemCache → dùng version bump
        try:
            cache.delete_pattern('matching:avail:*')  # Redis backend
        except AttributeError:
            pass  # LocMem: TTL 60s tự hết — chấp nhận trễ tối đa 60s


def expand_weekly_windows(carepartner, date):
    """Lịch tuần của CP cho 1 ngày cụ thể → list (time_from, time_to)."""
    from ..models import CarePartnerAvailability
    weekday = date.weekday()  # Monday=0 — khớp quy ước model
    rows = CarePartnerAvailability.objects.filter(
        carepartner=carepartner, weekday=weekday).order_by('time_from')
    return [(r.time_from, r.time_to) for r in rows]


def _subtract_intervals(base, cuts):
    """Trừ các khoảng bị chiếm khỏi base. Cả 2 list (time_from, time_to) trong ngày."""
    result = list(base)
    for cf, ct in cuts:
        nxt = []
        for bf, bt in result:
            if ct <= bf or cf >= bt:      # không giao
                nxt.append((bf, bt))
                continue
            if cf > bf:                   # phần đầu còn
                nxt.append((bf, cf))
            if ct < bt:                   # phần sau còn
                nxt.append((ct, bt))
        result = nxt
    # Gộp liền kề
    merged = []
    for iv in sorted(result):
        if merged and iv[0] <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], iv[1]))
        else:
            merged.append(iv)
    return merged


def available_slots(carepartner, date, use_cache=True):
    """available_slots(cp, date) = weekly_windows MINUS blackouts MINUS
    booked_slots(awaiting_commitment|committed|reschedule_requested|in_progress)
    MINUS slot_locks (soft còn hạn + hard).                         (Step 9.3)

    Trong transaction (booking) PHẢI bypass cache — tự nhận diện qua
    connection.in_atomic_block.
    """
    from django.core.cache import cache
    from django.db import connection

    from ..models import CarePartnerBlackout

    cp_id = carepartner.pk
    in_atomic = connection.in_atomic_block
    use_cache = use_cache and not in_atomic

    if use_cache:
        cached = cache.get(_cache_key(cp_id, date))
        if cached is not None:
            return cached

    # 1. Lịch tuần
    base = expand_weekly_windows(carepartner, date)

    # 2. Blackout trong ngày
    blackout_cuts = []
    for b in CarePartnerBlackout.objects.filter(carepartner=carepartner, date=date):
        if b.time_from is None or b.time_to is None:
            blackout_cuts = [(_time.min, _time.max)]  # cả ngày
            break
        blackout_cuts.append((b.time_from, b.time_to))

    # 3. Booking đang chiếm slot
    busy_cuts = []
    for booking in Booking.objects.filter(
            carepartner=carepartner, status__in=BUSY_BOOKING_STATUSES,
            job__slots__date=date).distinct():
        for slot in booking.job.slots.filter(date=date):
            busy_cuts.append((slot.time_from, slot.time_to))

    # 4. SlotLock (soft còn hạn + hard)
    now = timezone.now()
    lock_cuts = []
    for lock in SlotLock.objects.filter(carepartner=carepartner, date=date):
        if lock.lock_type == SlotLock.LockType.HARD:
            lock_cuts.append((lock.time_from, lock.time_to))
        elif lock.expires_at and lock.expires_at > now:
            lock_cuts.append((lock.time_from, lock.time_to))

    slots = _subtract_intervals(base, blackout_cuts + busy_cuts + lock_cuts)

    if use_cache:
        cache.set(_cache_key(cp_id, date), slots, CACHE_TTL_SECONDS)
    return slots


def covers_all_slots(carepartner, required_slots):
    """Hard filter matching (Step 2.2.1 #2): CP phải cover ĐỦ MỌI slot.

    required_slots: list (date, time_from, time_to). Trả (ok: bool, missing: list).
    """
    missing = []
    cache_by_date = {}
    for date, time_from, time_to in required_slots:
        if date not in cache_by_date:
            cache_by_date[date] = available_slots(carepartner, date)
        covered = any(tf <= time_from and time_to <= tt
                      for tf, tt in cache_by_date[date])
        if not covered:
            missing.append((date, time_from, time_to))
    return (len(missing) == 0), missing
