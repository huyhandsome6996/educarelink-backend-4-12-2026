"""Signal handlers — tạo TaskModeration 'pending' record khi task mới được tạo.

Update 2026-07-21: Signal KHÔNG gọi moderate_task nữa (tránh double-call với
view's perform_create). Việc tạo TaskModeration pending đã được moderate_task_async
đảm nhiệm. Signal chỉ giữ lại làm safety-net cho trường hợp task được tạo qua
admin shell hoặc data migration.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from core.models import Task

logger = logging.getLogger('educarelink.moderation.signals')


@receiver(post_save, sender=Task)
def _create_pending_moderation_on_create(sender, instance: Task, created: bool, **kwargs):
    """
    Khi task mới được tạo → tạo TaskModeration 'pending' record (nếu chưa có).
    AI moderation (Gemini) sẽ được trigger bởi moderate_task_async() trong
    core/views.py::TaskListCreateAPIView.perform_create — KHÔNG gọi ở đây
    để tránh double-call (trước đây gọi 2 lần làm task creation mất 36s).
    """
    if kwargs.get('raw'):
        return
    if not created:
        return
    if instance.status != 'open':
        return

    # Tạo moderation record pending (idempotent — nếu đã có thì skip)
    try:
        from .models import TaskModeration
        TaskModeration.objects.get_or_create(
            task=instance,
            defaults={
                'status': 'pending',
                'ai_verdict': 'Đang chờ AI kiểm duyệt...',
                'ai_confidence': 0.0,
            }
        )
    except Exception as e:
        logger.warning(f"[moderation.signals] Cannot create pending TaskModeration for Task#{instance.id}: {e}")
