"""AppConfig cho rewards — đăng ký signal handlers khi ready."""

from django.apps import AppConfig


class RewardsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'rewards'
    verbose_name = 'Tích điểm đổi quà'

    def ready(self):
        from . import signals  # noqa: F401
