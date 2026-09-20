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

# 2026-09-20 — Chuông riêng cho từng mã thông báo (yêu cầu âm thanh mới):
#   job_assigned (Phụ huynh chọn CarePartner) → "Chuông CarePartner - Có
#   Phụ Huynh Lựa Chọn.wav" (file chuong_carepartner.wav trong res/raw +
#   static/sounds). Mobile NotificationListener phát LẶP LIỀN trong 1 PHÚT;
#   push OS dùng channel riêng 'educarelink_job_offer' (sound chuông).
SOUND_BY_CODE = {'job_assigned': 'chuong_carepartner.wav'}
CHANNEL_BY_CODE = {'job_assigned': 'educarelink_job_offer'}


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
        """Gửi push Expo + đánh dấu sent/failed (Step 8.4 — sound bắt buộc
        với class critical). Beat retry failed 3 lần backoff 10/60/300s."""
        try:
            notif = Notification.objects.get(pk=notif_pk)
        except Notification.DoesNotExist:
            return
        if notif.status != 'queued':
            return
        sent = False
        for token_row in cls._tokens_for(notif.user):
            payload = cls._build_payload(notif, token_row)
            try:
                import requests
                resp = requests.post(
                    'https://exp.host/--/api/v2/push/send', json=payload,
                    headers={'Accept': 'application/json',
                             'Accept-encoding': 'gzip, deflate',
                             'Content-Type': 'application/json'},
                    timeout=8)
                body = resp.json() if resp.status_code == 200 else {}
                statuses = [d.get('status') for d in (body.get('data') or [{}])] \
                    if isinstance(body.get('data'), list) else ['ok']
                errors = [d.get('details', {}).get('error')
                          for d in (body.get('data') or [{}])
                          if isinstance(d, dict)]
                if 'ok' in statuses:
                    sent = True
                    token_row.last_success_at = timezone.now()
                    token_row.save(update_fields=['last_success_at'])
                if 'DeviceNotRegistered' in [e for e in errors if e]:
                    # Token chết → deactivate, fallback in-app (Step 8.4)
                    token_row.is_active = False
                    token_row.save(update_fields=['is_active'])
            except Exception:
                logger.exception('[Notification] Gửi push lỗi %s', notif.pk)
        notif.attempts += 1
        notif.status = 'sent' if sent else ('failed' if notif.attempts >= 3 else 'queued')
        if sent:
            notif.sent_at = timezone.now()
        notif.save(update_fields=['status', 'attempts', 'sent_at'])

    @staticmethod
    def _tokens_for(user):
        """Token push active của user — DeviceToken mới + fallback field cũ."""
        from ..models import DeviceToken
        rows = list(DeviceToken.objects.filter(user=user, is_active=True,
                                               platform__in=('expo', 'android', 'ios')))
        if not rows and getattr(user, 'expo_push_token', None):
            rows = [DeviceToken(user=user, platform='expo',
                                token=user.expo_push_token)]
        return rows

    @staticmethod
    def _build_payload(notif, token_row):
        """Payload Expo push Step 8.4 — critical PHẢI kêu to:
        channelId educarelink_critical + sound critical_alert.wav + priority max.
        job_assigned (2026-09-20) → chuông "Có Phụ Huynh Lựa Chọn" trên
        channel riêng educarelink_job_offer + data.sound để listener mobile
        phát LẶP 60 giây khi app foreground.

        Task F (2026-09-14): data PHẢI kèm class + type + sound — mobile
        NotificationListener đọc data.class để phát chuông foreground (trước
        đây thiếu field này → push đến khi app mở có thể KHÔNG kêu).
        """
        if notif.klass == 'critical':
            sound = SOUND_BY_CODE.get(notif.code, SOUND_BY_CLASS.get(notif.klass))
            channel = CHANNEL_BY_CODE.get(notif.code, 'educarelink_critical')
            return {
                'to': token_row.token,
                'title': notif.title_vi, 'body': notif.body_vi,
                'sound': sound or 'default',
                'channelId': channel,
                'priority': 'max', 'ttl': 3600,
                '_displayInForeground': True,
                'data': {**(notif.data or {}), 'type': notif.code,
                         'class': 'critical', 'sound': sound or 'default',
                         'notification_id': str(notif.pk)},
            }
        if notif.klass == 'important':
            return {
                'to': token_row.token,
                'title': notif.title_vi, 'body': notif.body_vi,
                'sound': 'default', 'priority': 'high', 'ttl': 3600,
                '_displayInForeground': True,
                'data': {**(notif.data or {}), 'type': notif.code,
                         'class': 'important', 'notification_id': str(notif.pk)},
            }
        # info — chỉ in-app + badge (Step 8.2), không bắn push
        return {'to': token_row.token, 'title': notif.title_vi,
                'body': notif.body_vi, 'priority': 'default',
                'data': {**(notif.data or {}), 'type': notif.code,
                         'class': 'info', 'notification_id': str(notif.pk)}}
