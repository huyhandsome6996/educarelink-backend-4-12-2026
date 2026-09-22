"""
matching/tests/test_job_alerts.py — Task F + G (2026-09-14).

TASK F — Chuông + popup khi nhận đơn (LUÔN):
  1. Payload push critical PHẢI có data.class='critical' + type='job_assigned'
     + sound='critical_alert.wav' (NotificationListener mobile đọc data.class).
  2. DeviceToken được ghi: POST /api/matching/device-token/ và PATCH
     /profile/ expo_push_token đều upsert DeviceToken.

TASK G — Web + mobile cùng API / cùng tài khoản (parity smoke):
  Tạo job bằng JWT của user A (giống web), đọc bookings bằng JWT Y CHANG
  user đó (giống mobile) — cùng bảng, cùng endpoint /api/matching/*.

Chạy: python manage.py test matching.tests.test_job_alerts --verbosity=2
"""

from datetime import time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from rest_framework.test import APIClient

from matching.models import CarePartnerAvailability, Notification
from matching.services.elo_service import EloService
from matching.services.notification_service import NotificationService
from matching.tests.base import MatchingTestBase

User = get_user_model()


class CriticalPayloadClassTest(MatchingTestBase):
    def test_job_assigned_payload_uses_chuong_carepartner(self):
        """2026-09-20: job_assigned (Phụ huynh chọn CarePartner) → chuông
        'Có Phụ Huynh Lựa Chọn' (chuong_carepartner.wav) trên channel riêng
        educarelink_job_offer + data.sound để listener mobile lặp 60s."""
        worker = User.objects.create_user('fa_worker', password='x',
                                          role='worker', is_approved=True)
        notif = Notification.objects.create(
            user=worker, code='job_assigned', klass='critical',
            title_vi='Bạn có đơn mới', body_vi='Xem ngay.',
            data={'type': 'job_assigned', 'booking_id': 'bk1'},
            channels=['push', 'inapp'], status='queued')

        class FakeToken:
            token = 'ExponentPushToken[abc123]'

        payload = NotificationService._build_payload(notif, FakeToken())
        self.assertEqual(payload['channelId'], 'educarelink_job_offer')
        self.assertEqual(payload['sound'], 'chuong_carepartner.wav')
        self.assertEqual(payload['priority'], 'max')
        self.assertEqual(payload['data']['class'], 'critical')
        self.assertEqual(payload['data']['type'], 'job_assigned')
        self.assertEqual(payload['data']['sound'], 'chuong_carepartner.wav')
        self.assertEqual(payload['data']['booking_id'], 'bk1')
        self.assertIn('notification_id', payload['data'])

    def test_other_critical_keeps_default_siren(self):
        """Critical KHÔNG phải job_assigned (vd commit_expired) giữ nguyên
        chuông hệ thống: channel educarelink_critical + critical_alert.wav."""
        parent = User.objects.create_user('fa_parent_exp', password='x',
                                          role='parent')
        notif = Notification.objects.create(
            user=parent, code='commit_expired', klass='critical',
            title_vi='Hết hạn cam kết', body_vi='Đơn đã quay lại.',
            data={'type': 'commit_expired'},
            channels=['push'], status='queued')

        class FakeToken:
            token = 'ExponentPushToken[def456]'

        payload = NotificationService._build_payload(notif, FakeToken())
        self.assertEqual(payload['channelId'], 'educarelink_critical')
        self.assertEqual(payload['sound'], 'critical_alert.wav')
        self.assertEqual(payload['data']['sound'], 'critical_alert.wav')

    def test_enqueued_job_assigned_has_critical_class(self):
        """Enqueue thật (template seeded) → row Notification critical và
        payload push đi kèm data.class='critical'."""
        worker = User.objects.create_user('fa_enq_worker', password='x',
                                          role='worker', is_approved=True)
        notif = NotificationService.enqueue(
            worker, 'job_assigned', data={'type': 'job_assigned'}, ctx={})
        self.assertEqual(notif.klass, 'critical')

        class FakeToken:
            token = 'ExponentPushToken[xyz]'

        payload = NotificationService._build_payload(notif, FakeToken())
        self.assertEqual(payload['data']['class'], 'critical')


class DeviceTokenUpsertTest(MatchingTestBase):
    def test_device_token_endpoint_creates_token(self):
        """POST /api/matching/device-token/ {platform, token} → DeviceToken
        được tạo (idempotent — gửi lại không nhân bản)."""
        worker = User.objects.create_user('fa_dt_worker', password='x',
                                          role='worker', is_approved=True)
        client = APIClient()
        client.force_authenticate(worker)
        r1 = client.post('/api/matching/device-token/',
                         {'platform': 'expo',
                          'token': 'ExponentPushToken[device-1]'},
                         format='json')
        self.assertIn(r1.status_code, (200, 201))
        r2 = client.post('/api/matching/device-token/',
                         {'platform': 'expo',
                          'token': 'ExponentPushToken[device-1]'},
                         format='json')
        self.assertEqual(r2.status_code, 200)

        from matching.models import DeviceToken
        self.assertEqual(
            DeviceToken.objects.filter(
                user=worker, token='ExponentPushToken[device-1]').count(), 1)
        row = DeviceToken.objects.get(user=worker)
        self.assertTrue(row.is_active)
        self.assertEqual(row.platform, 'expo')

    def test_profile_patch_expo_token_upserts_device_token(self):
        """PATCH /profile/ expo_push_token → DeviceToken upsert (Task F)."""
        worker = User.objects.create_user('fa_patch_worker', password='x',
                                          role='worker', is_approved=True)
        client = APIClient()
        client.force_authenticate(worker)
        resp = client.patch('/api/profile/', {'expo_push_token': 'ExpoToken[PATCH-1]'},
                            format='json')
        self.assertEqual(resp.status_code, 200)
        from matching.models import DeviceToken
        self.assertTrue(DeviceToken.objects.filter(
            user=worker, token='ExpoToken[PATCH-1]', platform='expo',
            is_active=True).exists())

    def test_device_token_requires_token(self):
        worker = User.objects.create_user('fa_dt_none', password='x',
                                          role='worker', is_approved=True)
        client = APIClient()
        client.force_authenticate(worker)
        r = client.post('/api/matching/device-token/', {'platform': 'expo'},
                        format='json')
        self.assertEqual(r.status_code, 400)


class WebMobileParitySmokeTest(MatchingTestBase):
    """Task G: web và mobile CÙNG token, CÙNG endpoint — đổi bên này bên kia thấy."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.day = tz.localdate() + timedelta(days=7)

    def test_same_account_job_create_and_bookings_read(self):
        """Tạo job bằng JWT của parent (web-like) → GET bookings bằng CÙNG
        JWT đó (mobile-like) — một tài khoản, một nguồn dữ liệu."""
        parent = User.objects.create_user('fa_parity_parent', password='x',
                                          role='parent')
        worker = User.objects.create_user('fa_parity_worker', password='x',
                                          role='worker', is_approved=True)
        profile = EloService.get_profile(worker)
        profile.skills = ['toan']
        profile.save()
        CarePartnerAvailability.objects.create(
            carepartner=worker, weekday=self.day.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))

        # "Web" login — JWT POST /api/auth/login/
        web_client = APIClient()
        r_login = web_client.post('/api/auth/login/',
                                  {'username': 'fa_parity_parent',
                                   'password': 'x'}, format='json')
        self.assertEqual(r_login.status_code, 200)
        access = r_login.data['tokens']['access']

        # "Mobile" dùng Y CHANG access token đó
        mobile_client = APIClient()
        mobile_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        # Web tạo job
        r_job = mobile_client.post('/api/matching/jobs/', {
            'job_type': 'tutoring', 'hourly_rate_vnd': 120000,
            'latitude': 21.0, 'longitude': 105.8,
            'subject': 'Toán', 'child_grade_level': 'primary_grade_1_5',
            'dates': [str(self.day)], 'time_from': '19:00', 'time_to': '21:00',
        }, format='json')
        self.assertEqual(r_job.status_code, 201, r_job.data)

        # Publish → parse (fallback rule khi không có Gemini key)
        job_id = r_job.data['id']
        r_pub = mobile_client.post(f'/api/matching/jobs/{job_id}/publish/',
                                   format='json')
        self.assertEqual(r_pub.status_code, 200)
        self.assertEqual(r_pub.data.get('slots_created'), 1)

        # Mobile đọc bookings cùng account → thấy trạng thái job
        r_bookings = mobile_client.get('/api/matching/bookings/?role=parent')
        self.assertEqual(r_bookings.status_code, 200)

        # Đổi từ mobile sang web — cùng dữ liệu (sync 2 chiều qua cùng bảng)
        r_job_web = APIClient()
        r_job_web.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        r2 = r_job_web.post('/api/matching/candidates/',
                            {'job_id': job_id}, format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertIn('candidates', r2.data)
