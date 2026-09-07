from django.apps import AppConfig


class MatchingConfig(AppConfig):
    name = 'matching'
    verbose_name = 'Ghép cặp Phụ huynh ↔ CarePartner (Flow 1)'

    def ready(self):
        """Đăng ký signals (luôn chạy) + scheduler (tuỳ env).

        Scheduler gồm:
          - lock_cleanup: dọn soft lock hết hạn + commitment window checker
            (bật bằng env ENABLE_MATCHING_SCHEDULER=true, mặc định chỉ chạy
            trên Render như các scheduler khác của project).
        """
        import os

        # Signals (cache invalidate + 14-day pause) — BẮT BUỘC luôn đăng ký
        from . import signals  # noqa: F401

        enabled = os.environ.get('ENABLE_MATCHING_SCHEDULER', '')
        is_render = os.environ.get('RENDER', '') == 'true'
        if not (enabled.lower() == 'true' or (enabled == '' and is_render)):
            print('[Matching Scheduler] SKIPPED — local dev / disabled.')
            return

        from .schedulers.matching_scheduler import start_matching_scheduler
        start_matching_scheduler()
