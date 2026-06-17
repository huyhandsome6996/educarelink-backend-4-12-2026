"""AppConfig cho payments — đăng ký signal handlers khi ready."""

from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    name = 'payments'
    verbose_name = 'Thanh toán MoMo & Hoa hồng'

    def ready(self):
        """Import signal handlers để Django đăng ký."""
        from . import signals  # noqa: F401

        # Khởi động monthly settlement scheduler (chỉ chạy trên Render/production)
        from .scheduler import start_settlement_scheduler
        start_settlement_scheduler()
