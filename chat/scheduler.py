"""
Scheduler đóng cửa sổ chat hết hạn (N — Cửa sổ chat còn hiệu lực).

Job định kỳ quét Conversation status='open' có closes_at <= now →
chuyển 'closed'. Tần suất mỗi 5 phút (thưa hơn verification check 1 phút
vì đóng chat không khẩn cấp — lazy-close ở mọi API read/write bảo đảm
trạng thái LUÔN chính xác kể cả khi scheduler chưa kịp chạy).

Pattern: copy verification_scheduler.py (APScheduler BackgroundScheduler,
thread-safe idempotent, chỉ chạy trên Render, local dev SKIPPED).
"""

import logging
import os
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from django.utils import timezone

logger = logging.getLogger('educarelink.chat.scheduler')

# Interval quét (phút) — env để tinh chỉnh không cần deploy code
CHAT_CLOSE_CHECK_INTERVAL_MINUTES = int(
    os.environ.get('CHAT_CLOSE_CHECK_INTERVAL_MINUTES', '5')
)

ENABLE_CHAT_SCHEDULER = os.environ.get('CHAT_SCHEDULER_ENABLED', 'true').lower() == 'true'
IS_RENDER = os.environ.get('RENDER', '') == 'true'

_scheduler = None
_lock = threading.Lock()

_stats = {
    'last_run': None,
    'last_result': None,
}


def close_expired_conversations() -> int:
    """
    Đóng mọi Conversation 'open' đã quá hạn closes_at.
    Trả về số conversation đã đóng. An toàn chạy nhiều lần (idempotent).
    """
    now = timezone.now()
    from .models import Conversation
    expired = Conversation.objects.filter(
        status='open',
        closes_at__isnull=False,
        closes_at__lte=now,
    )
    count = expired.update(status='closed', closed_at=now)
    if count > 0:
        logger.info(f"[chat.scheduler] Đã đóng {count} conversation hết hạn (quét lúc {now:%H:%M:%S}).")
    return count


def _run_chat_close_job():
    """Job wrapper cho APScheduler."""
    try:
        count = close_expired_conversations()
        _stats['last_run'] = timezone.now().isoformat()
        _stats['last_result'] = {'closed': count}
    except Exception as e:
        logger.exception(f"[chat.scheduler] Job FAILED: {e}")


def get_chat_scheduler_stats():
    """Stats cho debug/monitoring."""
    return {
        'enabled': ENABLE_CHAT_SCHEDULER and IS_RENDER,
        'running': _scheduler is not None and _scheduler.running,
        'interval_minutes': CHAT_CLOSE_CHECK_INTERVAL_MINUTES,
        'stats': _stats.copy(),
    }


def start_chat_scheduler():
    """Khởi động scheduler — thread-safe, chỉ chạy 1 instance."""
    global _scheduler

    if not ENABLE_CHAT_SCHEDULER:
        logger.info("[chat.scheduler] DISABLED (CHAT_SCHEDULER_ENABLED != true)")
        return

    if not IS_RENDER:
        logger.info("[chat.scheduler] SKIPPED — local dev (not Render)")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[chat.scheduler] Already running, skip.")
            return

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )
        _scheduler.add_job(
            _run_chat_close_job,
            trigger=IntervalTrigger(minutes=CHAT_CLOSE_CHECK_INTERVAL_MINUTES),
            id='chat_close_expired_conversations',
            name='EduCareLink Chat Window Close',
            replace_existing=True,
        )
        _scheduler.start()
        logger.info(
            f"[chat.scheduler] STARTED | Interval: every {CHAT_CLOSE_CHECK_INTERVAL_MINUTES} min"
        )


def shutdown_chat_scheduler():
    """Dừng scheduler khi Django shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[chat.scheduler] stopped.")
