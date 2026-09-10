from django.apps import AppConfig


class ModerationConfig(AppConfig):
    name = 'moderation'
    verbose_name = 'Kiểm duyệt & Khiếu nại (AI)'

    def ready(self):
        from . import signals  # noqa: F401

        # QA 2026-09-10 Vấn đề #1: Background Scanner quét công việc ngoài
        # 3 danh mục (Gia sư, Đón trẻ, Trông trẻ) MỖI 60 GIÂY — nếu việc lọt
        # lưới bằng cách nào đó thì bị quét phát và tự hủy trong vòng 1 phút.
        # Chạy trên Render hoặc khi bật ENABLE_MODERATION_SCHEDULER=true
        # (cùng pattern gating với matching scheduler — local dev không chạy).
        import os
        enabled = os.environ.get('ENABLE_MODERATION_SCHEDULER', '')
        is_render = os.environ.get('RENDER', '') == 'true'
        if not (enabled.lower() == 'true' or (enabled == '' and is_render)):
            print('[Moderation Scanner] SKIPPED — local dev / disabled.')
            return

        from .scheduler import start_moderation_scheduler
        start_moderation_scheduler()
