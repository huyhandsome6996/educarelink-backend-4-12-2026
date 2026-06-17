"""
Commission Scheduler — chạy định kỳ để:
  1. Cuối tháng (ngày 1 hàng tháng lúc 8h sáng): tổng hợp hoa hồng + gửi QR cho Worker
  2. Hằng ngày lúc 9h sáng: đánh dấu statement quá hạn (>7 ngày chưa paid)

Chạy trong Django process bằng APScheduler BackgroundScheduler (giống keepalive_scheduler).
"""
import os
import logging
import threading
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger('educarelink.commission_scheduler')

ENABLE_COMMISSION_SCHEDULER = os.environ.get('COMMISSION_SCHEDULER_ENABLED', 'true').lower() == 'true'
IS_RENDER = os.environ.get('RENDER', '') == 'true'

_scheduler = None
_lock = threading.Lock()


def _run_generate_monthly_statements():
    """Job chạy ngày 1 hàng tháng — tổng hợp hoa hồng tháng trước."""
    try:
        from payments.services.commission_service import generate_monthly_statements
        result = generate_monthly_statements()
        logger.info(
            f"[CommissionScheduler] Monthly run OK — "
            f"statements_created={result['statements_created']} | "
            f"total_commission={result['total_commission']}"
        )
    except Exception as e:
        logger.exception(f"[CommissionScheduler] Monthly run FAILED: {e}")


def _run_mark_overdue():
    """Job hằng ngày — đánh dấu statement quá hạn."""
    try:
        from payments.services.commission_service import mark_overdue_statements
        count = mark_overdue_statements()
        logger.info(f"[CommissionScheduler] Mark overdue OK — {count} statements marked")
    except Exception as e:
        logger.exception(f"[CommissionScheduler] Mark overdue FAILED: {e}")


def start_commission_scheduler():
    """Khởi động scheduler — chỉ chạy 1 lần, thread-safe."""
    global _scheduler

    if not ENABLE_COMMISSION_SCHEDULER:
        logger.info("[CommissionScheduler] DISABLED")
        return

    # Chỉ chạy trên Render để tránh duplicate khi chạy nhiều worker local
    # (production có thể có nhiều gunicorn worker → mỗi worker đều start scheduler)
    # Workaround: dùng env var để bật tắt từng worker, hoặc dùng DB lock.
    if not IS_RENDER:
        logger.info("[CommissionScheduler] SKIPPED — not running on Render")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[CommissionScheduler] Already running, skip.")
            return

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        # Job 1: Ngày 1 hàng tháng lúc 8h sáng — tổng hợp + gửi QR
        _scheduler.add_job(
            _run_generate_monthly_statements,
            trigger=CronTrigger(day=1, hour=8, minute=0),
            id='commission_monthly_generate',
            name='EduCareLink Monthly Commission Statements',
            replace_existing=True,
        )

        # Job 2: Hằng ngày lúc 9h sáng — đánh dấu quá hạn
        _scheduler.add_job(
            _run_mark_overdue,
            trigger=CronTrigger(hour=9, minute=0),
            id='commission_daily_overdue',
            name='EduCareLink Daily Overdue Mark',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(
            "[CommissionScheduler] STARTED | "
            "Monthly: day=1 08:00 | Daily overdue: 09:00"
        )


def shutdown_commission_scheduler():
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[CommissionScheduler] Stopped.")


def get_stats() -> dict:
    return {
        'enabled': ENABLE_COMMISSION_SCHEDULER and IS_RENDER,
        'running': _scheduler is not None and _scheduler.running,
        'jobs': [
            {'id': 'commission_monthly_generate', 'trigger': 'day=1 08:00'},
            {'id': 'commission_daily_overdue',    'trigger': 'daily 09:00'},
        ],
    }
