"""Signal handlers — tự động kiểm duyệt task khi parent đăng."""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from core.models import Task

logger = logging.getLogger('educarelink.moderation.signals')


@receiver(post_save, sender=Task)
def _auto_moderate_task_on_create(sender, instance: Task, created: bool, **kwargs):
    """Khi task mới được tạo → tự động kiểm duyệt bằng AI."""
    if kwargs.get('raw'):
        return
    if not created:
        return
    if instance.status != 'open':
        return

    try:
        from .services import moderate_task
        moderate_task(instance)
    except Exception as e:
        logger.exception(f"Auto moderate Task#{instance.id} failed: {e}")
