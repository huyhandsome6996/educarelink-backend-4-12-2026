"""
matching/services/notification_service.py — Notification v2 (Step 8).

Quy tắc Step 12.3.5: ENQUEUE trong transaction, GỬI ở transaction.on_commit —
không bao giờ bắn push cho state đã rollback.

Gửi thật (Expo push + retry backoff + DeviceToken) sẽ hoàn thiện ở Phase 3
(prompt-11). Phase 1 chỉ enqueue + render template + in-app inbox.
"""

import logging

from django.db import transaction
from django.template import Context, Template
from django.utils import timezone

from ..constants import NOTIFICATION_CODES
from ..models import Notification, NotificationTemplate

logger = logging.getLogger('educarelink.matching.notifications')

CHANNELS_BY_CLASS = {
    'critical': ['push', 'inapp', 'webpush'],
    'important': ['push', 'inapp', 'webpush'],
    'info': ['inapp'],
}

SOUND_BY_CLASS = {'critical': 'critical_alert.wav'}


class NotificationService:
    """Enqueue thông báo từ template DB. Template thiếu → fallback generic."""

    @classmethod
    def render_template(cls, code, ctx=None):
        """(title, body, klass, sound) từ NotificationTemplate; raise nếu không có."""
        try:
            tpl = NotificationTemplate.objects.get(code=code, is_active=True)
        except NotificationTemplate.DoesNotExist:
            logger.warning('[Notification] Thiếu template %s — dùng fallback', code)
            return (code, 'Bạn có cập nhật mới trên EduCareLink.', 'info', None)
        ctx = ctx or {}
        title, body = tpl.title_vi, tpl.body_vi
        try:
            title = Template(title).render(Context(ctx))
            body = Template(body).render(Context(ctx))
        except Exception:  # placeholder hỏng → không bao giờ crash nghiệp vụ
            logger.exception('[Notification] Lỗi render template %s', code)
        return title, body, tpl.klass, tpl.sound

    @classmethod
    def enqueue(cls, user, code, data=None, ctx=None):
        """Tạo row Notification status=queued. Gửi sau on_commit (Phase 3 wire)."""
        klass_default = NOTIFICATION_CODES.get(code, ('parent', 'info'))[1]
        title, body, klass, sound = cls.render_template(code, ctx)
        klass = klass or klass_default
        notif = Notification.objects.create(
            user=user, code=code, klass=klass,
            title_vi=title, body_vi=body,
            data=data or {},
            channels=CHANNELS_BY_CLASS.get(klass, ['inapp']),
            status='queued',
        )
        # Gửi sau khi transaction commit (Step 12.3.5)
        transaction.on_commit(lambda: cls._send(notif.pk, sound))
        return notif

    @classmethod
    def _send(cls, notif_pk, sound=None):
        """Gửi push — Phase 3 thay bằng Expo push + retry backoff 10/60/300s."""
        try:
            notif = Notification.objects.get(pk=notif_pk)
        except Notification.DoesNotExist:
            return
        if notif.status != 'queued':
            return
        # MVP Phase 1: đánh dấu sent (in-app inbox đọc trực tiếp bảng này).
        # Phase 3: gọi send_expo_push_notification() với payload critical
        # (channel educarelink_critical, priority max, sound critical_alert.wav).
        notif.status = 'sent'
        notif.sent_at = timezone.now()
        notif.save(update_fields=['status', 'sent_at'])
