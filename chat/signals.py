"""
Signal hooks cho chat — tích hợp vào Task lifecycle (AGENTS.md §15.2).

KHÔNG sửa core/views.py để gọi chat — đăng ký post_save listener, copy
pattern tracking/signals.py (cache old status ở pre_save vì pre_save +
post_save chạy cùng request).

Trigger:
  - status → 'in_progress'  : open_conversation_for_task (Lựa chọn A-1)
  - status → 'completed'    : close_conversation_for_task (closes_at =
                              completed_at + 24h, đóng thật khi hết hạn)
  - status → 'cancelled'    : close_conversation_for_task (đóng NGAY)

Toàn bộ handler bọc try/except — chat fail KHÔNG được làm hỏng luồng
task chính (approve/complete/cancel là nghiệp vụ tiền + an toàn).
"""

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from core.models import Task

logger = logging.getLogger('educarelink.chat.signals')

_old_task_status_cache = {}


@receiver(pre_save, sender=Task)
def _cache_old_task_status(sender, instance: Task, **kwargs):
    """Lưu status cũ trước khi save (pattern tracking/signals.py)."""
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            _old_task_status_cache[instance.pk] = old.status
        except Task.DoesNotExist:
            _old_task_status_cache[instance.pk] = None
    else:
        _old_task_status_cache[instance.pk] = None


@receiver(post_save, sender=Task)
def _on_task_status_changed(sender, instance: Task, created: bool, **kwargs):
    """Mở/đóng cửa sổ chat theo Task state machine hiện có."""
    if kwargs.get('raw'):
        return

    old_status = _old_task_status_cache.pop(instance.pk, None)
    new_status = instance.status

    if old_status == new_status:
        return

    try:
        if new_status == 'in_progress':
            from .services import open_conversation_for_task
            open_conversation_for_task(instance)

        elif new_status in ('completed', 'cancelled'):
            from .services import close_conversation_for_task
            close_conversation_for_task(instance)

    except Exception as e:
        logger.exception(
            f"[chat.signals] Xử lý Task#{instance.id} ({old_status} → {new_status}) "
            f"thất bại (không chặn luồng task): {e}"
        )
