"""AppConfig cho tracking — đăng ký signal handlers."""

from django.apps import AppConfig


class TrackingConfig(AppConfig):
    name = 'tracking'
    verbose_name = 'Định vị Real-time'

    def ready(self):
        """Import signal handlers."""
        from . import signals  # noqa: F401
