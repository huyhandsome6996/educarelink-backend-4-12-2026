"""
matching/schedulers/matching_scheduler.py — Beat task KHÔNG Celery (Step 10/12).

Thread scheduler theo pattern core/keepalive_scheduler.py (APScheduler),
khởi động trong matching/apps.py ready() khi ENABLE_MATCHING_SCHEDULER=true
hoặc chạy trên Render.

Job mỗi phút (Step 12 AC7 — beat task safe re-run / idempotent):
  - cleanup_expired_locks: dọn soft lock hết hạn (Rule 1 Step 10)
  - auto_commit_bookings: awaiting_commitment quá deadline → committed
  - detect_no_show: start + 15 phút chưa start → suspected_no_show
  - reschedule_watchdog: reminder 50% + expire idle (Phase 3 wire)
"""

import logging
import os
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('educarelink.matching.scheduler')

_scheduler = None
_lock = threading.Lock()


def cleanup_expired_locks():
    """Dọn soft lock hết hạn — idempotent (Step 10 Rule 1)."""
    from django.utils import timezone
    from ..models import SlotLock
    deleted, _ = SlotLock.objects.filter(
        lock_type=SlotLock.LockType.SOFT, expires_at__lt=timezone.now()).delete()
    if deleted:
        logger.info('[MatchingBeat] Dọn %d soft lock hết hạn', deleted)


def auto_commit_bookings():
    """awaiting_commitment quá commit_deadline → committed (Step 5.1.6).

    Lazy check trên GET cũng làm (Step 5 AC4) — beat là mạng lưới dự phòng.
    """
    from django.db import transaction
    from django.utils import timezone
    from ..constants import BookingStatus
    from ..models import Booking
    from ..services.notification_service import NotificationService
    from ..services.state import transition

    now = timezone.now()
    expired = Booking.objects.filter(
        status=BookingStatus.AWAITING_COMMITMENT,
        commit_deadline__lte=now)
    for booking in expired:
        try:
            with transaction.atomic():
                b = Booking.objects.select_for_update().get(pk=booking.pk)
                if b.status != BookingStatus.AWAITING_COMMITMENT:
                    continue  # safe re-run
                b.committed_at = timezone.now()
                b.save(update_fields=['committed_at'])
                transition(b, BookingStatus.COMMITTED, actor='system',
                           reason='Hết cửa sổ cam kết — tự động cam kết')
                NotificationService.enqueue(b.carepartner, 'booking_committed', ctx={
                    'time': b.job.slots.order_by('date').first().time_from.strftime('%H:%M'),
                    'date': b.job.slots.order_by('date').first().date.strftime('%d/%m/%Y'),
                })
                NotificationService.enqueue(
                    b.parent, 'booking_committed',
                    ctx={'time': '', 'date': ''})  # parent copy khác — Phase 3 render riêng
        except Exception:
            logger.exception('[MatchingBeat] Lỗi auto-commit booking %s', booking.pk)


def detect_no_show():
    """start + NO_SHOW_GRACE_MINUTES chưa 'in_progress' → suspected_no_show
    (Step 7.4.1). Safe re-run: chỉ chuyển booking đang committed."""
    from django.utils import timezone
    from datetime import timedelta
    from ..config import get_int
    from ..constants import BookingStatus
    from ..models import Booking
    from ..services.state import transition

    grace = get_int('NO_SHOW_GRACE_MINUTES', 15)
    now = timezone.now()
    candidates = Booking.objects.filter(
        status=BookingStatus.COMMITTED,
        job__slots__date=now.date()).distinct()
    for booking in candidates:
        first_slot = booking.job.slots.order_by('date', 'time_from').first()
        if first_slot is None:
            continue
        slot_start = timezone.make_aware(
            __import__('datetime').datetime.combine(first_slot.date, first_slot.time_from))
        if slot_start + timedelta(minutes=grace) <= now:
            try:
                b = Booking.objects.get(pk=booking.pk)
                if b.status == BookingStatus.COMMITTED:
                    transition(b, BookingStatus.SUSPECTED_NO_SHOW, actor='system',
                               reason=f'Quá {grace} phút chưa bắt đầu')
            except Exception:
                logger.exception('[MatchingBeat] Lỗi no-show booking %s', booking.pk)


def run_all_beats():
    """Chạy mọi beat job — mỗi job tự bắt lỗi để không chặn nhau."""
    for fn in (cleanup_expired_locks, auto_commit_bookings, detect_no_show):
        try:
            fn()
        except Exception:
            logger.exception('[MatchingBeat] Beat %s lỗi', fn.__name__)


def start_matching_scheduler():
    """Khởi động APScheduler thread — chỉ 1 lần, thread-safe."""
    global _scheduler
    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info('[MatchingBeat] Scheduler đã chạy, skip.')
            return
        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1})
        _scheduler.add_job(
            run_all_beats,
            trigger=IntervalTrigger(minutes=1),
            id='matching_beats',
            name='EduCareLink Matching Beat (mỗi phút)',
            replace_existing=True)
        _scheduler.start()
        logger.info('[MatchingBeat] Scheduler STARTED — beats mỗi 60s')
