"""
Helpers để push event qua channel layer từ views / services / signals.

Luôn bọc try/except — nếu Channels chưa cấu hình hoặc channel layer lỗi,
request HTTP vẫn thành công (fallback polling).
"""
import logging
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


def _get_channel_layer():
    try:
        from channels.layers import get_channel_layer
        return get_channel_layer()
    except Exception as e:
        logger.debug('channel layer unavailable: %s', e)
        return None


def _group_send(group: str, event_type: str, payload: dict):
    layer = _get_channel_layer()
    if layer is None:
        return False
    try:
        async_to_sync(layer.group_send)(
            group,
            {
                'type': 'realtime.event',  # maps to RealtimeConsumer.realtime_event
                'event_type': event_type,
                'payload': payload or {},
            },
        )
        return True
    except Exception as e:
        logger.warning('WS broadcast failed group=%s type=%s: %s', group, event_type, e)
        return False


def notify_user(user_id, event_type: str, payload: dict):
    if not user_id:
        return False
    return _group_send(f'user_{user_id}', event_type, payload)


def notify_role(role: str, event_type: str, payload: dict):
    if not role:
        return False
    return _group_send(f'role_{role}', event_type, payload)


def notify_admins(event_type: str, payload: dict):
    return _group_send('role_admin', event_type, payload)


def notify_task(task_id, event_type: str, payload: dict):
    if not task_id:
        return False
    return _group_send(f'task_{task_id}', event_type, payload)
