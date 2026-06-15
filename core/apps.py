from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        """Khởi động Keep-Alive Scheduler khi Django app sẵn sàng."""
        # Import ở đây để tránh AppRegistryNotReady
        from .keepalive_scheduler import start_scheduler
        start_scheduler()
