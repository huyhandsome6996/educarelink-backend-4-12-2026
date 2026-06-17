"""
╔══════════════════════════════════════════════════════════════════╗
║   Monthly Settlement Scheduler                                     ║
║   - Ngày 1 hàng tháng lúc 9h00 (Asia/Ho_Chi_Minh):                ║
║       generate_monthly_settlements() — sinh QR cho tháng trước    ║
║   - Mỗi ngày lúc 9h00:                                            ║
║       send_settlement_reminders() — nhắc overdue                  ║
║                                                                   ║
║   Chỉ chạy trên Render (production) — local dev không chạy.       ║
║   Có thể trigger thủ công qua:                                    ║
║     python manage.py run_monthly_settlement                       ║
║   hoặc qua API Admin:                                             ║
║     POST /api/payments/admin/run-settlement/                      ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import logging
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger('educarelink.payments.scheduler')

ENABLED = os.environ.get('PAYMENT_SCHEDULER_ENABLED', 'true').lower() == 'true'
IS_RENDER = os.environ.get('RENDER', '') == 'true'

_scheduler = None
_lock = threading.Lock()

_stats = {
    'last_monthly_run': None,
    'last_monthly_result': None,
    'last_reminder_run': None,
    'last_reminder_result': None,
    'started_at': None,
}


def _run_monthly_settlement():
    """Job chạy ngày 1 hàng tháng — sinh QR cho kỳ thanh toán tháng trước."""
    from .services import generate_monthly_settlements
    try:
        stats = generate_monthly_settlements()
        _stats['last_monthly_run'] = datetime.now().isoformat()
        _stats['last_monthly_result'] = stats
        logger.info(f"[Payments Scheduler] Monthly settlement done: {stats}")
    except Exception as e:
        logger.exception(f"[Payments Scheduler] Monthly settlement FAILED: {e}")


def _run_reminders():
    """Job chạy mỗi ngày — nhắc overdue settlements."""
    from .services import send_settlement_reminders
    try:
        stats = send_settlement_reminders()
        _stats['last_reminder_run'] = datetime.now().isoformat()
        _stats['last_reminder_result'] = stats
        if stats.get('reminders_sent', 0) > 0:
            logger.info(f"[Payments Scheduler] Reminders: {stats}")
    except Exception as e:
        logger.exception(f"[Payments Scheduler] Reminders FAILED: {e}")


def get_stats():
    return {
        'enabled': ENABLED and IS_RENDER,
        'running': _scheduler is not None and _scheduler.running,
        'stats': _stats.copy(),
    }


def start_settlement_scheduler():
    """Khởi động scheduler — thread-safe, chỉ chạy 1 instance."""
    global _scheduler

    if not ENABLED:
        logger.info("[Payments Scheduler] DISABLED (PAYMENT_SCHEDULER_ENABLED != true)")
        return

    if not IS_RENDER:
        logger.info("[Payments Scheduler] SKIPPED — local dev (not Render)")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[Payments Scheduler] Already running, skip.")
            return

        _stats['started_at'] = datetime.now().isoformat()

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        # Ngày 1 hàng tháng lúc 9h sáng
        _scheduler.add_job(
            _run_monthly_settlement,
            trigger=CronTrigger(day=1, hour=9, minute=0),
            id='monthly_settlement',
            name='EduCareLink Monthly Commission Settlement',
            replace_existing=True,
        )

        # Mỗi ngày 9h05 — check overdue
        _scheduler.add_job(
            _run_reminders,
            trigger=CronTrigger(hour=9, minute=5),
            id='settlement_reminders',
            name='EduCareLink Settlement Reminders',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(
            "[Payments Scheduler] STARTED | "
            "Monthly settlement: 1st of month 09:00 | "
            "Reminders: daily 09:05"
        )


def shutdown_scheduler():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Payments Scheduler] stopped.")
