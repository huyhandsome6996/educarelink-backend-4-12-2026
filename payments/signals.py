"""
Django signals cho module Payments.

2 signal quan trọng:

  1. post_save trên core.Task (created=True)
     → Tự động tạo PaymentOrder(method=cash, status=not_required) cho task mới.
     → Front-end sau đó có thể gọi /api/payments/momo/create/?task_id=X để "upgrade" sang MoMo.

  2. post_save trên core.Task (status chuyển sang 'completed')
     → Trigger escrow_service.release_escrow_on_task_completed(task)
       (tự phân tiền MoMo HOẶC ghi nợ hoa hồng cash)

  3. post_save trên core.Task (status chuyển sang 'cancelled')
     → Trigger escrow_service.refund_on_task_cancelled(task)
       (hoàn tiền MoMo cho Parent)
"""
import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.db import transaction

from core.models import Task
from payments.models import PaymentOrder

logger = logging.getLogger('educarelink.signals')


# ───────────────────────────────────────────────────────────────────
# TRACKER: Lưu trạng thái cũ của Task để detect chuyển trạng thái
# ───────────────────────────────────────────────────────────────────
# Dùng pre_save để ghi nhớ status cũ vào instance attribute,
# sau đó post_save đọc attribute này để biết có chuyển trạng thái không.

@receiver(pre_save, sender=Task)
def _task_pre_save_track_status(sender, instance: Task, **kwargs):
    """Ghi nhớ status cũ trước khi save."""
    if instance.pk:
        try:
            old = Task.objects.get(pk=instance.pk)
            instance._old_status = old.status
        except Task.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


@receiver(post_save, sender=Task)
def _task_post_save_handler(sender, instance: Task, created: bool, **kwargs):
    """Main handler: tạo PaymentOrder + trigger escrow logic khi task complete/cancel."""

    # 1. Task mới tạo → tự động tạo PaymentOrder cash
    if created:
        try:
            PaymentOrder.objects.get_or_create(
                task=instance,
                defaults={
                    'parent': instance.parent,
                    'amount': instance.price,
                    'payment_method': PaymentOrder.METHOD_CASH,
                    'status': PaymentOrder.STATUS_NOT_REQUIRED,
                },
            )
            logger.info(
                f"[Signals] PaymentOrder created for Task#{instance.id} "
                f"(method=cash default — parent có thể đổi sang momo qua API)"
            )
        except Exception as e:
            logger.exception(f"[Signals] Failed to create PaymentOrder for Task#{instance.id}: {e}")

    # 2. Task chuyển sang 'completed' → release escrow / ghi nợ hoa hồng
    old_status = getattr(instance, '_old_status', None)
    if not created and old_status != 'completed' and instance.status == 'completed':
        # Dùng transaction.on_commit để đảm bảo DB đã commit trước khi gọi service
        # (service layer lại có transaction.atomic nên sẽ chạy trong Tx riêng)
        transaction.on_commit(lambda: _trigger_release(instance.id))

    # 3. Task chuyển sang 'cancelled' → refund nếu có hold tiền
    if not created and old_status != 'cancelled' and instance.status == 'cancelled':
        transaction.on_commit(lambda: _trigger_refund(instance.id))


def _trigger_release(task_id: int):
    """Helper gọi escrow_service trong context an toàn (re-fetch task)."""
    try:
        from payments.services import escrow_service
        task = Task.objects.select_related('payment_order').get(pk=task_id)
        result = escrow_service.release_escrow_on_task_completed(task)
        if result.get('error'):
            logger.warning(
                f"[Signals] release_escrow — Task#{task_id} returned error: {result['error']}"
            )
    except Task.DoesNotExist:
        logger.warning(f"[Signals] release_escrow — Task#{task_id} không tồn tại")
    except Exception as e:
        logger.exception(f"[Signals] release_escrow — Task#{task_id} exception: {e}")


def _trigger_refund(task_id: int):
    try:
        from payments.services import escrow_service
        task = Task.objects.select_related('payment_order').get(pk=task_id)
        result = escrow_service.refund_on_task_cancelled(task)
        if result.get('error') and 'không có tiền' not in (result.get('error') or '') \
                and 'No PaymentOrder' not in (result.get('error') or '') \
                and 'chưa paid' not in (result.get('error') or '') \
                and 'Already' not in (result.get('error') or ''):
            logger.warning(
                f"[Signals] refund_on_cancelled — Task#{task_id}: {result['error']}"
            )
    except Task.DoesNotExist:
        logger.warning(f"[Signals] refund_on_cancelled — Task#{task_id} không tồn tại")
    except Exception as e:
        logger.exception(f"[Signals] refund_on_cancelled — Task#{task_id} exception: {e}")
