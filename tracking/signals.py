"""
Signal handlers — tự động clear LiveLocation khi Task completed/cancelled.
KHÔNG sửa code core — chỉ đăng ký listener post_save.
"""

import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from core.models import Task

logger = logging.getLogger('educarelink.tracking.signals')

_old_task_status_cache = {}


@receiver(pre_save, sender=Task)
def _cache_old_task_status(sender, instance: Task, **kwargs):
    """Lưu status cũ trước khi save."""
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            _old_task_status_cache[instance.pk] = old.status
        except Task.DoesNotExist:
            _old_task_status_cache[instance.pk] = None
    else:
        _old_task_status_cache[instance.pk] = None


@receiver(post_save, sender=Task)
def _clear_tracking_on_task_save(sender, instance: Task, created: bool, **kwargs):
    """
    Khi task.status chuyển sang 'completed' hoặc 'cancelled':
      - Xóa LiveLocation (parent không thấy vị trí nữa)
      - Clear DeviceHeartbeat + close DeviceOfflineAlert (chống tắt máy)
      - LocationHistory + Consent vẫn giữ vĩnh viễn
    """
    if kwargs.get('raw'):
        return

    old_status = _old_task_status_cache.pop(instance.pk, None)
    new_status = instance.status

    if old_status == new_status:
        return

    if new_status in ('completed', 'cancelled'):
        from .services import clear_task_tracking, clear_task_heartbeat
        try:
            clear_task_tracking(instance)
            clear_task_heartbeat(instance)
        except Exception as e:
            logger.exception(
                f"[tracking.signals] clear_task_tracking/heartbeat thất bại cho Task#{instance.id}: {e}"
            )
