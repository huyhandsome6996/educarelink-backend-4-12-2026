"""
╔══════════════════════════════════════════════════════════════════╗
║   Device Offline Check Scheduler                                   ║
║   Chạy mỗi 1 phút — quét heartbeat có last_seen > 90s              ║
║   → tạo DeviceOfflineAlert + push priority=high cho phụ huynh       ║
║                                                                    ║
║   Chỉ chạy trên Render (production) — local dev không chạy.       ║
║   Có thể trigger thủ công qua:                                    ║
║     POST /api/tracking/admin/run-offline-check/                    ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import logging
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('educarelink.tracking.offline_scheduler')

CHECK_INTERVAL_MINUTES = int(os.environ.get('TRACKING_OFFLINE_CHECK_INTERVAL', '1'))
ENABLE_OFFLINE_CHECK = os.environ.get('TRACKING_OFFLINE_CHECK_ENABLED', 'true').lower() == 'true'
IS_RENDER = os.environ.get('RENDER', '') == 'true'

_scheduler = None
_lock = threading.Lock()

_stats = {
    'last_run': None,
    'last_result': None,
    'started_at': None,
}


def _run_offline_check():
    """Job chạy mỗi 1 phút — check offline devices."""
    from django.db import close_old_connections
    close_old_connections()  # Tránh stale connection sau khi migrate DB
    from .services import check_offline_devices
    try:
        stats = check_offline_devices()
        _stats['last_run'] = datetime.now().isoformat()
        _stats['last_result'] = stats
        if stats.get('new_alerts', 0) > 0 or stats.get('already_alerted', 0) > 0:
            logger.info(f"[Offline Scheduler] Check: {stats}")
    except Exception as e:
        logger.exception(f"[Offline Scheduler] Check FAILED: {e}")


def get_stats():
    return {
        'enabled': ENABLE_OFFLINE_CHECK and IS_RENDER,
        'running': _scheduler is not None and _scheduler.running,
        'interval_minutes': CHECK_INTERVAL_MINUTES,
        'stats': _stats.copy(),
    }


def start_offline_scheduler():
    """Khởi động scheduler — thread-safe, chỉ chạy 1 instance."""
    global _scheduler

    if not ENABLE_OFFLINE_CHECK:
        logger.info("[Offline Scheduler] DISABLED (TRACKING_OFFLINE_CHECK_ENABLED != true)")
        return

    if not IS_RENDER:
        logger.info("[Offline Scheduler] SKIPPED — local dev (not Render)")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[Offline Scheduler] Already running, skip.")
            return

        _stats['started_at'] = datetime.now().isoformat()

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        # Chạy mỗi 1 phút
        _scheduler.add_job(
            _run_offline_check,
            trigger=IntervalTrigger(minutes=CHECK_INTERVAL_MINUTES),
            id='offline_check',
            name='EduCareLink Device Offline Check',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(
            f"[Offline Scheduler] STARTED | "
            f"Interval: every {CHECK_INTERVAL_MINUTES} min | "
            f"Threshold: 90s"
        )

        # Chạy lần đầu sau 30 giây (để server sẵn sàng)
        _scheduler.add_job(
            _run_offline_check,
            trigger='date',
            run_date=datetime.now() + timedelta(seconds=30),
            id='offline_initial_check',
            name='EduCareLink Initial Offline Check',
            replace_existing=True,
        )


def shutdown_offline_scheduler():
    """Dừng scheduler khi Django shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Offline Scheduler] stopped.")
