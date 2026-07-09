"""AppConfig cho tracking — đăng ký signal handlers."""

from django.apps import AppConfig


class TrackingConfig(AppConfig):
    name = 'tracking'
    verbose_name = 'Định vị Real-time + Chống tắt máy'

    def ready(self):
        """Import signal handlers + khởi động offline scheduler."""
        from . import signals  # noqa: F401

        # Khởi động Device Offline Check Scheduler (chỉ chạy trên Render)
        from .offline_scheduler import start_offline_scheduler
        start_offline_scheduler()
