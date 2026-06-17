"""
Signal handlers — tự động trigger payment flow khi Task thay đổi trạng thái.

KHÔNG sửa code hiện có của core/views.py — chỉ thêm listener.
"""

import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from core.models import Task

logger = logging.getLogger('educarelink.payments.signals')


# Lưu trạng thái cũ để so sánh ở post_save
_old_task_status_cache = {}


@receiver(pre_save, sender=Task)
def _cache_old_task_status(sender, instance: Task, **kwargs):
    """Lưu status hiện tại của Task (trước khi save) vào cache in-process."""
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            _old_task_status_cache[instance.pk] = old.status
        except Task.DoesNotExist:
            _old_task_status_cache[instance.pk] = None
    else:
        _old_task_status_cache[instance.pk] = None


@receiver(post_save, sender=Task)
def _trigger_payment_flow_on_task_save(sender, instance: Task, created: bool, **kwargs):
    """
    Khi Task.status thay đổi:
      - → 'completed' : trigger release_escrow (momo) hoặc record_cash_completion (cash)
      - → 'cancelled' : trigger refund_escrow (nếu đang held)

    Chỉ gọi service khi status thực sự đổi — tránh trigger nhiều lần.
    """
    if kwargs.get('raw'):
        return  # Bỏ qua fixtures

    old_status = _old_task_status_cache.pop(instance.pk, None)
    new_status = instance.status

    if old_status == new_status:
        return

    # Tardy import để tránh circular import khi app loading
    from .services import on_task_status_changed
    try:
        on_task_status_changed(instance, old_status or '', new_status or '')
    except Exception as e:
        logger.exception(
            f"[payments.signals] on_task_status_changed thất bại cho Task#{instance.id} "
            f"({old_status} → {new_status}): {e}"
        )
