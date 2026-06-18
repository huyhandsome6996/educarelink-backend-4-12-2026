from django.apps import AppConfig


class ModerationConfig(AppConfig):
    name = 'moderation'
    verbose_name = 'Kiểm duyệt & Khiếu nại (AI)'

    def ready(self):
        from . import signals  # noqa: F401
