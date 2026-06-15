from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        """Khởi động các Scheduler khi Django app sẵn sàng."""
        # Import ở đây để tránh AppRegistryNotReady
        from .keepalive_scheduler import start_scheduler
        start_scheduler()

        from .anomaly_scheduler import start_anomaly_scheduler
        start_anomaly_scheduler()
