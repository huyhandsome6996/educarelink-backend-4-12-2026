"""AppConfig cho tracking — đăng ký signal handlers."""

import os
import logging

from django.apps import AppConfig

logger = logging.getLogger('educarelink.tracking.apps')


class TrackingConfig(AppConfig):
    name = 'tracking'
    verbose_name = 'Định vị Real-time + Chống tắt máy + Xác minh ngẫu nhiên'

    def ready(self):
        """Import signal handlers + khởi động schedulers.

        QA-FIX-2 / C: schedulers chỉ chạy ở 1 process duy nhất trên production.
        Trước đây với WEB_CONCURRENCY=2, mỗi gunicorn worker chạy 1 scheduler
        riêng → 2 scheduler chạy song song → có thể tạo duplicate DeviceOffline
        Alert + RandomVerificationCheck cho cùng task.

        Giải pháp:
          1. Mặc định schedulers KHÔNG chạy trong web worker (gunicorn).
             Set env TRACKING_SCHEDULER_IN_WEB_WORKER=true để override (debug).
          2. Schedulers nên chạy qua management command riêng (Render cron
             hoặc worker dyno): python manage.py run_tracking_schedulers
          3. Dù có chạy nhiều instance, DB unique constraint (unique_active_alert_per_task
             và unique_pending_check_per_task) đảm bảo không tạo duplicate.

        Cách deploy khuyến nghị (Render cron, không tính tiết kiệm):
          - Cron job mỗi 1 phút: python manage.py run_tracking_schedulers --once
          - Hoặc 1 worker dyno chạy daemon: python manage.py run_tracking_schedulers
        """
        from . import signals  # noqa: F401

        # QA-FIX-2 / C: skip scheduler trong web worker mặc định.
        # Set env TRACKING_SCHEDULER_IN_WEB_WORKER=true để override.
        skip_in_web = (
            os.environ.get('TRACKING_SCHEDULER_IN_WEB_WORKER', 'false').lower() != 'true'
        )
        is_render = os.environ.get('RENDER', '') == 'true'

        if not is_render:
            logger.info("[TrackingConfig] Local dev — schedulers SKIPPED.")
            return

        if skip_in_web and not os.environ.get('TRACKING_SCHEDULER_PROCESS', ''):
            logger.info(
                "[TrackingConfig] Schedulers SKIPPED trong web worker "
                "(set TRACKING_SCHEDULER_IN_WEB_WORKER=true để override, "
                "hoặc chạy `python manage.py run_tracking_schedulers` riêng)."
            )
            return

        # Khởi động Device Offline Check Scheduler
        from .offline_scheduler import start_offline_scheduler
        start_offline_scheduler()

        # Phan 3 — Khởi động Random Verification Check Scheduler
        from .verification_scheduler import start_verification_scheduler
        start_verification_scheduler()
