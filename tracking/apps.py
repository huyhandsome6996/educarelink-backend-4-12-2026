"""AppConfig cho tracking — đăng ký signal handlers."""

from django.apps import AppConfig


class TrackingConfig(AppConfig):
    name = 'tracking'
    verbose_name = 'Định vị Real-time + Chống tắt máy + Xác minh ngẫu nhiên'

    def ready(self):
        """Import signal handlers + khởi động schedulers."""
        from . import signals  # noqa: F401

        # Khởi động Device Offline Check Scheduler (chỉ chạy trên Render)
        from .offline_scheduler import start_offline_scheduler
        start_offline_scheduler()

        # Phan 3 — Khởi động Random Verification Check Scheduler (chỉ chạy trên Render)
        from .verification_scheduler import start_verification_scheduler
        start_verification_scheduler()
