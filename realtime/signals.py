"""
Django signals → WebSocket broadcast.

Khi tạo Notification → push ngay tới recipient (hoặc role_worker nếu broadcast).
Khi Task status/title đổi → push tới parent + accepted worker + task room.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

from core.models import Notification, Task, TaskApplication
from .broadcast import notify_user, notify_role, notify_task

logger = logging.getLogger(__name__)


def _serialize_notification(n: Notification) -> dict:
    return {
        'id': n.id,
        'title': n.title,
        'message': n.message,
        'is_read': n.is_read,
        'created_at': n.created_at.isoformat() if n.created_at else None,
        'recipient_id': n.recipient_id,
    }


def _serialize_task(t: Task) -> dict:
    return {
        'id': t.id,
        'title': t.title,
        'status': t.status,
        'price': str(t.price) if t.price is not None else None,
        'location': t.location,
        'parent_id': t.parent_id,
        'scheduled_time': t.scheduled_time.isoformat() if t.scheduled_time else None,
    }


@receiver(post_save, sender=Notification)
def on_notification_saved(sender, instance: Notification, created, **kwargs):
    if not created:
        return
    payload = _serialize_notification(instance)
    try:
        if instance.recipient_id:
            notify_user(instance.recipient_id, 'notification', payload)
        else:
            # Broadcast thông báo chung → carepartners
            notify_role('worker', 'notification', payload)
            notify_role('parent', 'notification', payload)
            notify_role('admin', 'notification', payload)  # no-op if unused
            notify_admins('notification', payload)
    except Exception as e:
        logger.warning('notification signal broadcast failed: %s', e)


@receiver(post_save, sender=Task)
def on_task_saved(sender, instance: Task, created, **kwargs):
    payload = _serialize_task(instance)
    event = 'task_created' if created else 'task_update'
    try:
        if instance.parent_id:
            notify_user(instance.parent_id, event, payload)
        notify_task(instance.id, event, payload)

        # Workers đã accepted / pending cũng nên biết status change
        if not created:
            worker_ids = TaskApplication.objects.filter(
                task_id=instance.id
            ).values_list('worker_id', flat=True)
            for wid in worker_ids:
                notify_user(wid, event, payload)
        else:
            # Việc mới → fan-out workers (feed realtime)
            notify_role('worker', event, payload)
    except Exception as e:
        logger.warning('task signal broadcast failed: %s', e)
