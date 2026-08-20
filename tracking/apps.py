"""AppConfig cho tracking — đăng ký signal handlers.

Deployment modes (QA-FIX-8 / Issue #2):
  1. Render Cron Job (--once): stateless, one-shot. Render's cron cadence
     is authoritative. Check functions are called directly in the command.
     APScheduler is NOT started (it would be decorative — process exits
     before any interval fires).
  2. Background Worker (daemon): APScheduler intervals are authoritative.
     Set TRACKING_SCHEDULER_PROCESS=true to enable scheduler startup.
     These two modes MUST NOT be combined (would double-run checks).
"""

import os
import sys
import logging

from django.apps import AppConfig

logger = logging.getLogger('educarelink.tracking.apps')


class TrackingConfig(AppConfig):
    name = 'tracking'
    verbose_name = 'Định vị Real-time + Chống tắt máy + Xác minh ngẫu nhiên'

    def ready(self):
        """Import signal handlers + khởi động schedulers.

        QA-FIX-2 / C: schedulers chỉ chạy ở 1 process duy nhất trên production.
        QA-FIX-8 / Issue #2: --once mode KHÔNG khởi động APScheduler
        (nó chỉ thêm log noise mà không bao giờ fire).
        """
        from . import signals  # noqa: F401

        # QA-FIX-8 / Issue #2: nếu chạy --once mode, skip APScheduler hoàn toàn.
        # Check functions được gọi trực tiếp bởi command, không cần scheduler.
        _is_once_mode = (
            'run_tracking_schedulers' in sys.argv and '--once' in sys.argv
        )
        if _is_once_mode:
            logger.info(
                '[TrackingConfig] --once mode detected — '
                'skipping APScheduler startup (checks run directly by command).'
            )
            return

        # QA-FIX-2 / C: skip scheduler trong web worker mặc định.
        # Set env TRACKING_SCHEDULER_IN_WEB_WORKER=true để override.
        skip_in_web = (
            os.environ.get('TRACKING_SCHEDULER_IN_WEB_WORKER', 'false').lower() != 'true'
        )
        is_render = os.environ.get('RENDER', '') == 'true'

        if not is_render:
            logger.info('[TrackingConfig] Local dev — schedulers SKIPPED.')
            return

        if skip_in_web and not os.environ.get('TRACKING_SCHEDULER_PROCESS', ''):
            logger.info(
                '[TrackingConfig] Schedulers SKIPPED trong web worker '
                '(set TRACKING_SCHEDULER_IN_WEB_WORKER=true để override, '
                'hoặc chạy `python manage.py run_tracking_schedulers` riêng).'
            )
            return

        # Warn nếu cả TRACKING_SCHEDULER_PROCESS=true VÀ --once
        # (double-run risk).
        if os.environ.get('TRACKING_SCHEDULER_PROCESS', ''):
            if 'run_tracking_schedulers' in sys.argv and '--once' in sys.argv:
                logger.warning(
                    '[TrackingConfig] TRACKING_SCHEDULER_PROCESS=true với --once mode — '
                    'APScheduler skipped to avoid double-run. Checks run via command.'
                )
                return

        # Khởi động Device Offline Check Scheduler
        from .offline_scheduler import start_offline_scheduler
        start_offline_scheduler()

        # Phan 3 — Khởi động Random Verification Check Scheduler
        from .verification_scheduler import start_verification_scheduler
        start_verification_scheduler()
