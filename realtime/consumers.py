"""
WebSocket consumer — mỗi user authenticated join group user_{id}.

Events server → client (JSON):
  { "type": "notification", "payload": { id, title, message, created_at, ... } }
  { "type": "task_update",  "payload": { id, status, title, ... } }
  { "type": "payment_update", "payload": { ... } }
  { "type": "tracking_update", "payload": { task_id, lat, lng, ... } }
  { "type": "ping" } / { "type": "pong" }

Client → server:
  { "type": "ping" }
  { "type": "subscribe_task", "task_id": 123 }   # parent theo dõi live location
  { "type": "unsubscribe_task", "task_id": 123 }
"""
import json
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class RealtimeConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user')
        if user is None or not getattr(user, 'is_authenticated', False):
            await self.close(code=4401)
            return

        self.user = user
        self.user_group = f'user_{user.id}'
        self.task_groups = set()

        await self.channel_layer.group_add(self.user_group, self.channel_name)

        # Role broadcast groups (optional fan-out)
        role = getattr(user, 'role', None)
        if role:
            self.role_group = f'role_{role}'
            await self.channel_layer.group_add(self.role_group, self.channel_name)
        else:
            self.role_group = None

        if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
            await self.channel_layer.group_add('role_admin', self.channel_name)

        await self.accept()
        await self.send_json({
            'type': 'connected',
            'payload': {
                'user_id': user.id,
                'role': role,
                'message': 'WebSocket realtime connected',
            },
        })
        logger.info('WS connected user=%s group=%s', user.id, self.user_group)

    async def disconnect(self, close_code):
        if hasattr(self, 'user_group'):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        if getattr(self, 'role_group', None):
            await self.channel_layer.group_discard(self.role_group, self.channel_name)
        user = self.scope.get('user')
        if user and (getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False)):
            await self.channel_layer.group_discard('role_admin', self.channel_name)
        for g in list(getattr(self, 'task_groups', set())):
            await self.channel_layer.group_discard(g, self.channel_name)
        logger.info('WS disconnect code=%s user=%s', close_code, getattr(user, 'id', None))

    async def receive_json(self, content, **kwargs):
        msg_type = content.get('type')
        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})
            return

        if msg_type == 'subscribe_task':
            task_id = content.get('task_id')
            if task_id:
                group = f'task_{task_id}'
                await self.channel_layer.group_add(group, self.channel_name)
                self.task_groups.add(group)
                await self.send_json({'type': 'subscribed', 'payload': {'task_id': task_id}})
            return

        if msg_type == 'unsubscribe_task':
            task_id = content.get('task_id')
            if task_id:
                group = f'task_{task_id}'
                await self.channel_layer.group_discard(group, self.channel_name)
                self.task_groups.discard(group)
                await self.send_json({'type': 'unsubscribed', 'payload': {'task_id': task_id}})
            return

    # ── Handlers called by channel_layer.group_send ─────────────────
    async def realtime_event(self, event):
        """Generic event: event['event_type'] + event['payload']."""
        await self.send_json({
            'type': event.get('event_type', 'event'),
            'payload': event.get('payload', {}),
        })
