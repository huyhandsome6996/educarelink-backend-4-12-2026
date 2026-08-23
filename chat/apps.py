"""AppConfig cho chat — đăng ký signal handlers + scheduler (N)."""

import logging

from django.apps import AppConfig

logger = logging.getLogger('educarelink.chat.apps')


class ChatConfig(AppConfig):
    name = 'chat'
    verbose_name = 'N — Cửa sổ chat Parent ↔ CarePartner'

    def ready(self):
        """Import signal handlers + khởi động scheduler (pattern tracking)."""
        from . import signals  # noqa: F401
        from .scheduler import start_chat_scheduler
        start_chat_scheduler()
