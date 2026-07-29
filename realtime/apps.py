from django.apps import AppConfig


class RealtimeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'realtime'
    verbose_name = 'WebSocket Realtime'

    def ready(self):
        # Đăng ký signal broadcast khi Notification / Task thay đổi
        from . import signals  # noqa: F401
