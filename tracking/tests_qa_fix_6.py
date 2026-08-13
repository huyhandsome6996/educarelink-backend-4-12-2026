"""
QA-FIX-6 — Test suite cho 4 vấn đề QA phát hiện ở vòng QA lần 2.

Chạy: python manage.py test tracking.tests_qa_fix_6 --verbosity=2

Các test case cover:

  B1 (BẮT BUỘC 1) — Chặn worker chưa đặt PIN nhận việc:
       - Worker chưa có verification_pin_hash cố apply → 403 PIN_REQUIRED.
       - Worker đã có PIN → apply thành công như cũ.
       - Worker chưa có PIN cố apply cho task có geofence (consent required)
         → vẫn 403 PIN_REQUIRED (chặn TRƯỚC consent check).

  B2 (BẮT BUỘC 2) — CarePartner OAuth đặt được PIN:
       - User đăng ký qua Google (set_unusable_password) đặt PIN lần đầu
         KHÔNG cần current_password → thành công.
       - User đăng ký qua email/password (has_usable_password=True) đặt PIN
         KHÔNG current_password → PermissionError.
       - User đăng ký qua email/password nhập SAI current_password →
         PermissionError.
       - User đăng ký qua email/password nhập ĐÚNG current_password →
         thành công.
       - User đăng ký qua Facebook (set_unusable_password) đặt PIN →
         thành công (như Google).

  N1 (NÊN LÀM 1) — Tương thích ngược push type device_offline:
       - Khi check_offline_devices() tạo alert mới → payload push có
         CẢ 2 field data.type='device_offline_critical' VÀ
         data.legacy_type='device_offline'.
       - Tương tự cho retry push (retry_offline_alert_pushes).

  N2 (NÊN LÀM 2) — LiveLocation không bị batch cũ ghi đè:
       - Real-time update LiveLocation → client_recorded_at = now().
       - Batch gửi điểm cũ hơn (recorded_at < client_recorded_at) →
         LiveLocation KHÔNG bị ghi đè (giữ nguyên toạ độ real-time).
       - Batch gửi điểm mới hơn (recorded_at > client_recorded_at) →
         LiveLocation CẬP NHẬT (ghi đè đúng).
       - Batch gửi điểm khi chưa có LiveLocation → tạo mới OK.
       - LocationHistory vẫn insert đủ cả 2 trường hợp (append-only).
"""

import uuid as _uuid
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication
from tracking.models import (
    LocationConsent, LiveLocation, LocationHistory,
    DeviceHeartbeat, DeviceOfflineAlert,
)


@override_settings(DEBUG=True)
class QAFix6B1PinRequiredToApplyTestCase(TestCase):
    """
    B1 (BẮT BUỘC 1) — Worker chưa đặt PIN không được apply vào task.
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='qa6_parent', password='parent_pass_123',
            role='parent', email='qa6_parent@test.com',
        )
        # Worker đã có PIN
        self.worker_with_pin = User.objects.create_user(
            username='qa6_worker_pin', password='worker_pass_123',
            role='worker', email='qa6_worker_pin@test.com',
            is_approved=True,
        )
        self.worker_with_pin.set_verification_pin('1234')
        # Worker chưa có PIN
        self.worker_no_pin = User.objects.create_user(
            username='qa6_worker_nopin', password='worker_pass_123',
            role='worker', email='qa6_worker_nopin@test.com',
            is_approved=True,
        )

        self.cat = ServiceCategory.objects.create(name='QA6 Test Cat')

        # Task KHÔNG có geofence
        self.task_no_geofence = Task.objects.create(
            title='QA6 Task No Geofence', description='Test',
            price=100000, status='open',
            parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )

        # Task CÓ geofence (yêu cầu consent_tracking)
        self.task_with_geofence = Task.objects.create(
            title='QA6 Task Geofence', description='Test geofence',
            price=200000, status='open',
            parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            geofence_lat=10.0, geofence_lng=106.0, geofence_radius=500,
            scheduled_time=timezone.now(),
        )

    def test_b1_worker_without_pin_cannot_apply_no_geofence(self):
        """Worker chưa có PIN apply vào task thường → 403 PIN_REQUIRED."""
        client = APIClient()
        client.force_authenticate(user=self.worker_no_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_no_geofence.id}/apply/', {
            'consent_tracking': False,
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['error'], 'PIN_REQUIRED')
        self.assertIn('mã cá nhân', resp.data['message'].lower())
        # Verify không tạo TaskApplication
        self.assertFalse(
            TaskApplication.objects.filter(
                task=self.task_no_geofence, worker=self.worker_no_pin
            ).exists()
        )

    def test_b1_worker_without_pin_cannot_apply_geofence_before_consent(self):
        """Worker chưa có PIN apply vào task có geofence → 403 PIN_REQUIRED
        (chặn TRƯỚC khi check consent_tracking)."""
        client = APIClient()
        client.force_authenticate(user=self.worker_no_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_with_geofence.id}/apply/', {
            'consent_tracking': True,
        }, format='json')
        # Phải 403 PIN_REQUIRED, KHÔNG phải 400 CONSENT_REQUIRED
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['error'], 'PIN_REQUIRED')
        self.assertFalse(
            TaskApplication.objects.filter(
                task=self.task_with_geofence, worker=self.worker_no_pin
            ).exists()
        )

    def test_b1_worker_with_pin_can_apply_no_geofence(self):
        """Worker đã có PIN apply vào task thường → thành công như cũ."""
        client = APIClient()
        client.force_authenticate(user=self.worker_with_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_no_geofence.id}/apply/', {
            'consent_tracking': False,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(
            TaskApplication.objects.filter(
                task=self.task_no_geofence, worker=self.worker_with_pin,
                status='pending',
            ).exists()
        )

    def test_b1_worker_with_pin_can_apply_geofence_with_consent(self):
        """Worker đã có PIN apply vào task có geofence + đồng ý consent → 201."""
        client = APIClient()
        client.force_authenticate(user=self.worker_with_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_with_geofence.id}/apply/', {
            'consent_tracking': True,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        # Verify consent được tạo
        self.assertTrue(
            LocationConsent.objects.filter(
                task=self.task_with_geofence, worker=self.worker_with_pin,
                consent='granted',
            ).exists()
        )

    def test_b1_worker_with_pin_apply_geofence_without_consent_returns_consent_required(self):
        """Worker đã có PIN apply vào task có geofence nhưng KHÔNG đồng ý
        consent → 400 CONSENT_REQUIRED (không phải 403 PIN_REQUIRED)."""
        client = APIClient()
        client.force_authenticate(user=self.worker_with_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_with_geofence.id}/apply/', {
            'consent_tracking': None,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['error'], 'CONSENT_REQUIRED')


@override_settings(DEBUG=True)
class QAFix6B2OAuthSetPinTestCase(TestCase):
    """
    B2 (BẮT BUỘC 2) — User đăng ký qua Google/Facebook đặt được PIN.
    """

    def setUp(self):
        # User đăng ký qua email/password (has_usable_password=True)
        self.email_user = User.objects.create_user(
            username='qa6_email_user', password='email_pass_123',
            role='worker', email='qa6_email@test.com',
            auth_provider='email', is_approved=True,
        )

        # User đăng ký qua Google (set_unusable_password)
        self.google_user = User.objects.create_user(
            username='qa6_google_user', password='unused',
            role='worker', email='qa6_google@test.com',
            auth_provider='google', is_approved=True,
        )
        self.google_user.set_unusable_password()
        self.google_user.save()

        # User đăng ký qua Facebook (set_unusable_password)
        self.fb_user = User.objects.create_user(
            username='qa6_fb_user', password='unused',
            role='worker', email='qa6_fb@test.com',
            auth_provider='facebook', is_approved=True,
        )
        self.fb_user.set_unusable_password()
        self.fb_user.save()

    def test_b2_google_user_set_pin_without_current_password(self):
        """User Google đặt PIN lần đầu KHÔNG cần current_password → OK."""
        from tracking.services import set_verification_pin
        # Trước: chưa có PIN
        self.assertFalse(self.google_user.has_verification_pin_set)
        # Đặt PIN không current_password
        user = set_verification_pin(user=self.google_user, pin='1234')
        # Sau: đã có PIN
        self.assertTrue(user.has_verification_pin_set)
        self.assertTrue(user.check_verification_pin('1234'))

    def test_b2_facebook_user_set_pin_without_current_password(self):
        """User Facebook đặt PIN lần đầu KHÔNG cần current_password → OK."""
        from tracking.services import set_verification_pin
        self.assertFalse(self.fb_user.has_verification_pin_set)
        user = set_verification_pin(user=self.fb_user, pin='5678')
        self.assertTrue(user.has_verification_pin_set)
        self.assertTrue(user.check_verification_pin('5678'))

    def test_b2_google_user_set_pin_ignores_current_password(self):
        """User Google gửi current_password (bất kỳ) → vẫn OK (bỏ qua)."""
        from tracking.services import set_verification_pin
        user = set_verification_pin(
            user=self.google_user, pin='9999',
            current_password='anything_should_be_ignored',
        )
        self.assertTrue(user.has_verification_pin_set)
        self.assertTrue(user.check_verification_pin('9999'))

    def test_b2_email_user_set_pin_requires_current_password(self):
        """User email/password KHÔNG gửi current_password → PermissionError."""
        from tracking.services import set_verification_pin
        with self.assertRaises(PermissionError) as ctx:
            set_verification_pin(user=self.email_user, pin='1234')
        self.assertIn('mật khẩu', str(ctx.exception).lower())

    def test_b2_email_user_set_pin_wrong_current_password(self):
        """User email/password nhập SAI current_password → PermissionError."""
        from tracking.services import set_verification_pin
        with self.assertRaises(PermissionError) as ctx:
            set_verification_pin(
                user=self.email_user, pin='1234',
                current_password='wrong_password',
            )
        self.assertIn('không đúng', str(ctx.exception).lower())
        # Verify PIN chưa được set
        self.email_user.refresh_from_db()
        self.assertFalse(self.email_user.has_verification_pin_set)

    def test_b2_email_user_set_pin_correct_current_password(self):
        """User email/password nhập ĐÚNG current_password → OK (giữ hành vi cũ)."""
        from tracking.services import set_verification_pin
        user = set_verification_pin(
            user=self.email_user, pin='4321',
            current_password='email_pass_123',
        )
        self.assertTrue(user.has_verification_pin_set)
        self.assertTrue(user.check_verification_pin('4321'))

    def test_b2_endpoint_google_user_set_pin_no_current_password(self):
        """Test endpoint POST /api/tracking/verification-pin/set/ cho user Google
        không gửi current_password → 200 OK."""
        client = APIClient()
        client.force_authenticate(user=self.google_user)
        resp = client.post('/api/tracking/verification-pin/set/', {
            'pin': '1234',
            # KHÔNG gửi current_password
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.google_user.refresh_from_db()
        self.assertTrue(self.google_user.has_verification_pin_set)

    def test_b2_endpoint_email_user_set_pin_no_current_password(self):
        """Endpoint cho user email/password không gửi current_password → 403."""
        client = APIClient()
        client.force_authenticate(user=self.email_user)
        resp = client.post('/api/tracking/verification-pin/set/', {
            'pin': '1234',
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.email_user.refresh_from_db()
        self.assertFalse(self.email_user.has_verification_pin_set)


@override_settings(DEBUG=True)
class QAFix6N1LegacyPushTypeTestCase(TestCase):
    """
    N1 (NÊN LÀM 1) — Payload push có cả 'type'='device_offline_critical'
    và 'legacy_type'='device_offline' cho tương thích ngược app cũ.
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='qa6_n1_parent', password='parent_pass_123',
            role='parent', email='qa6_n1_parent@test.com',
        )
        self.parent.expo_push_token = 'ExponentPushToken[qa6_n1_parent]'
        self.parent.save()

        self.worker = User.objects.create_user(
            username='qa6_n1_worker', password='worker_pass_123',
            role='worker', email='qa6_n1_worker@test.com',
        )
        self.worker.expo_push_token = 'ExponentPushToken[qa6_n1_worker]'
        self.worker.save()

        self.cat = ServiceCategory.objects.create(name='QA6 N1 Cat')
        self.task = Task.objects.create(
            title='QA6 N1 Task', description='Test', price=100000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=self.task, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )
        # Heartbeat đã cũ (>60s = offline threshold)
        self.hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            last_location_lat=10.0, last_location_lng=106.0,
            device_status='online',
        )

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_initial_alert_has_both_type_and_legacy_type(self, mock_push):
        """Khi check_offline_devices() tạo alert mới → payload push có cả
        'type'='device_offline_critical' và 'legacy_type'='device_offline'."""
        # Mock push trả True (Expo accept)
        mock_push.return_value = True

        from tracking.services import check_offline_devices
        check_offline_devices()

        # Verify send_expo_push_notification được gọi cho parent
        self.assertTrue(mock_push.called)
        # Tìm call cho parent (token parent)
        parent_call = None
        for call in mock_push.call_args_list:
            if call.kwargs.get('token') == 'ExponentPushToken[qa6_n1_parent]':
                parent_call = call
                break
        self.assertIsNotNone(parent_call, 'Phải có push call cho parent')

        data = parent_call.kwargs.get('data', {})
        self.assertEqual(data.get('type'), 'device_offline_critical')
        self.assertEqual(data.get('legacy_type'), 'device_offline')

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_retry_push_has_both_type_and_legacy_type(self, mock_push):
        """Khi retry_offline_alert_pushes() gửi lại push → payload cũng có
        cả 'type' và 'legacy_type'."""
        mock_push.return_value = True

        # Tạo alert active nhưng push_sent=False, retry_count=0
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=self.hb,
            last_seen=self.hb.last_seen,
            last_location_lat=10.0, last_location_lng=106.0,
            status='active', push_sent=False, push_retry_count=0,
        )

        from tracking.services import retry_offline_alert_pushes
        retry_offline_alert_pushes()

        self.assertTrue(mock_push.called)
        parent_call = None
        for call in mock_push.call_args_list:
            if call.kwargs.get('token') == 'ExponentPushToken[qa6_n1_parent]':
                parent_call = call
                break
        self.assertIsNotNone(parent_call)

        data = parent_call.kwargs.get('data', {})
        self.assertEqual(data.get('type'), 'device_offline_critical')
        self.assertEqual(data.get('legacy_type'), 'device_offline')
        self.assertEqual(data.get('retry'), 1)


@override_settings(DEBUG=True)
class QAFix6N2LiveLocationNoStaleOverwriteTestCase(TestCase):
    """
    N2 (NÊN LÀM 2) — LiveLocation không bị batch cũ ghi đè.
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='qa6_n2_parent', password='parent_pass_123',
            role='parent', email='qa6_n2_parent@test.com',
        )
        self.worker = User.objects.create_user(
            username='qa6_n2_worker', password='worker_pass_123',
            role='worker', email='qa6_n2_worker@test.com',
        )
        self.cat = ServiceCategory.objects.create(name='QA6 N2 Cat')
        self.task = Task.objects.create(
            title='QA6 N2 Task', description='Test', price=100000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=self.task, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    def test_n2_realtime_sets_client_recorded_at(self):
        """Real-time update LiveLocation → client_recorded_at != None."""
        resp = self.client.post('/api/tracking/location/', {
            'task_id': self.task.id,
            'latitude': 10.0, 'longitude': 106.0,
        }, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)

        live = LiveLocation.objects.get(task=self.task)
        self.assertIsNotNone(live.client_recorded_at)
        # client_recorded_at gần với now (trong 5s)
        delta = abs((timezone.now() - live.client_recorded_at).total_seconds())
        self.assertLess(delta, 5)

    def test_n2_batch_older_does_not_overwrite_realtime(self):
        """Real-time gửi điểm MỚI, sau đó batch gửi điểm CŨ → LiveLocation
        giữ nguyên toạ độ real-time, KHÔNG bị ghi đè."""
        # 1. Real-time update với toạ độ mới (lat=11.0)
        now = timezone.now()
        resp = self.client.post('/api/tracking/location/', {
            'task_id': self.task.id,
            'latitude': 11.0, 'longitude': 107.0,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        live = LiveLocation.objects.get(task=self.task)
        self.assertEqual(float(live.latitude), 11.0)
        realtime_cra = live.client_recorded_at
        self.assertIsNotNone(realtime_cra)

        # 2. Batch gửi điểm CŨ (recorded_at = 2 phút trước, trước realtime_cra)
        old_recorded_at = (now - timedelta(minutes=2)).isoformat()
        resp2 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 9.0, 'longitude': 105.0,
                    'recorded_at': old_recorded_at,
                },
            ],
        }, format='json')
        self.assertEqual(resp2.status_code, 201, resp2.data)

        # 3. Verify LiveLocation KHÔNG bị ghi đè → vẫn (11.0, 107.0)
        live.refresh_from_db()
        self.assertEqual(float(live.latitude), 11.0)
        self.assertEqual(float(live.longitude), 107.0)
        # client_recorded_at vẫn giữ nguyên (= realtime_cra, không bị batch cũ ghi đè)
        self.assertEqual(live.client_recorded_at, realtime_cra)

        # 4. Verify LocationHistory vẫn insert đủ 2 row (real-time + batch)
        # Real-time tạo 1 row (không có client_recorded_at), batch tạo 1 row
        # (có client_recorded_at = old_recorded_at).
        self.assertEqual(
            LocationHistory.objects.filter(task=self.task).count(), 2
        )

    def test_n2_batch_newer_overwrites_realtime(self):
        """Real-time gửi điểm, sau đó batch gửi điểm MỚI HƠN → LiveLocation
        CẬP NHẬT (ghi đè đúng, vì batch thực sự mới hơn)."""
        # 1. Real-time với toạ độ (11.0, 107.0)
        resp = self.client.post('/api/tracking/location/', {
            'task_id': self.task.id,
            'latitude': 11.0, 'longitude': 107.0,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        live = LiveLocation.objects.get(task=self.task)
        realtime_cra = live.client_recorded_at

        # 2. Batch gửi điểm mới hơn (recorded_at = 30s sau realtime_cra)
        new_recorded_at = (realtime_cra + timedelta(seconds=30)).isoformat()
        resp2 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 12.0, 'longitude': 108.0,
                    'recorded_at': new_recorded_at,
                },
            ],
        }, format='json')
        self.assertEqual(resp2.status_code, 201)

        # 3. Verify LiveLocation CẬP NHẬT sang (12.0, 108.0)
        live.refresh_from_db()
        self.assertEqual(float(live.latitude), 12.0)
        self.assertEqual(float(live.longitude), 108.0)
        # client_recorded_at cũng update sang batch last_point recorded_at
        self.assertGreater(live.client_recorded_at, realtime_cra)

    def test_n2_batch_when_no_existing_livelocation_creates_new(self):
        """Batch gửi điểm khi chưa có LiveLocation → tạo mới OK."""
        # Verify chưa có LiveLocation
        self.assertFalse(LiveLocation.objects.filter(task=self.task).exists())

        now = timezone.now()
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 10.5, 'longitude': 106.5,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 201)

        # LiveLocation được tạo mới
        live = LiveLocation.objects.get(task=self.task)
        self.assertEqual(float(live.latitude), 10.5)
        self.assertEqual(float(live.longitude), 106.5)
        self.assertIsNotNone(live.client_recorded_at)

    def test_n2_batch_with_null_existing_cra_still_updates(self):
        """Nếu existing.client_recorded_at = None (row cũ) → batch vẫn update
        (giữ behaviour cũ cho backward compat)."""
        # Tạo LiveLocation thủ công với client_recorded_at=None (mô phỏng row cũ
        # chưa được populate field mới)
        live = LiveLocation.objects.create(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
            client_recorded_at=None,
        )

        # Batch gửi điểm (bất kỳ timestamp nào)
        now = timezone.now()
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 11.0, 'longitude': 107.0,
                    'recorded_at': (now - timedelta(minutes=5)).isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 201)

        # LiveLocation bị ghi đè (vì existing.client_recorded_at=None → không
        # có cơ sở để skip)
        live.refresh_from_db()
        self.assertEqual(float(live.latitude), 11.0)
        self.assertEqual(float(live.longitude), 107.0)
        # Sau khi update, client_recorded_at đã được set (không còn None)
        self.assertIsNotNone(live.client_recorded_at)
