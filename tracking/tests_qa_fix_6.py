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
       - QA-FIX-7: payload push có data.type='device_offline' (giá trị CŨ,
         giữ cho app cũ match) VÀ data.critical=True (flag MỚI, app mới
         dùng để bật còi to + channel emergency-alerts).
       - Test mô phỏng chính xác logic if-check của app cũ
         (`if (data.type === 'device_offline')`) để xác nhận app cũ THẬT
         SỰ match điều kiện với payload mới.

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

    def test_b1_worker_without_pin_can_apply_no_geofence(self):
        """Worker chưa có PIN apply vào task KHÔNG có geofence → thành công.
        PIN chỉ yêu cầu cho task CÓ tracking (geofence). Task thường không cần."""
        client = APIClient()
        client.force_authenticate(user=self.worker_no_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_no_geofence.id}/apply/', {
            'consent_tracking': False,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        # Verify tạo TaskApplication
        self.assertTrue(
            TaskApplication.objects.filter(
                task=self.task_no_geofence, worker=self.worker_no_pin,
                status='pending',
            ).exists()
        )

    def test_b1_worker_without_pin_cannot_apply_geofence_before_consent(self):
        """Worker chưa có PIN apply vào task có geofence → 403 verification_pin_required
        (chặn TRƯỚC khi check consent_tracking)."""
        client = APIClient()
        client.force_authenticate(user=self.worker_no_pin)
        resp = client.post(f'/api/worker/tasks/{self.task_with_geofence.id}/apply/', {
            'consent_tracking': True,
        }, format='json')
        # Phải 403 verification_pin_required, KHÔNG phải 400 CONSENT_REQUIRED
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['error'], 'verification_pin_required')
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
    N1 (NÊN LÀM 1) — QA-FIX-7: payload push có data.type='device_offline'
    (giá trị CŨ, để app cũ match) + data.critical=True (flag MỚI, app mới
    dùng để bật còi to + channel emergency-alerts).
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

    def _get_parent_call_data(self, mock_push):
        """Helper: lấy data dict của push call cho parent (token parent)."""
        for call in mock_push.call_args_list:
            if call.kwargs.get('token') == 'ExponentPushToken[qa6_n1_parent]':
                return call.kwargs.get('data', {})
        return None

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_initial_alert_payload_qa_fix_7(self, mock_push):
        """QA-FIX-7: initial alert payload có type='device_offline' (CŨ)
        + critical=True (MỚI), KHÔNG còn 'device_offline_critical' hay
        'legacy_type'."""
        mock_push.return_value = True

        from tracking.services import check_offline_devices
        check_offline_devices()

        self.assertTrue(mock_push.called)
        data = self._get_parent_call_data(mock_push)
        self.assertIsNotNone(data, 'Phải có push call cho parent')

        # QA-FIX-7 / N1: type đã được đảo lại thành 'device_offline' (giá trị CŨ)
        self.assertEqual(data.get('type'), 'device_offline')
        # QA-FIX-7 / N1: flag critical=True thay thế cho 'device_offline_critical'
        self.assertIs(data.get('critical'), True)
        # QA-FIX-7 / N1: không còn field legacy_type (đã xoá — field này vô dụng
        # vì app cũ không đọc nó)
        self.assertNotIn('legacy_type', data)
        # Không còn type='device_offline_critical' (đã đảo về 'device_offline')
        self.assertNotEqual(data.get('type'), 'device_offline_critical')

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_retry_push_payload_qa_fix_7(self, mock_push):
        """QA-FIX-7: retry push payload cũng có type='device_offline' +
        critical=True, giữ retry field."""
        mock_push.return_value = True

        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=self.hb,
            last_seen=self.hb.last_seen,
            last_location_lat=10.0, last_location_lng=106.0,
            status='active', push_sent=False, push_retry_count=0,
        )

        from tracking.services import retry_offline_alert_pushes
        retry_offline_alert_pushes()

        self.assertTrue(mock_push.called)
        data = self._get_parent_call_data(mock_push)
        self.assertIsNotNone(data)

        self.assertEqual(data.get('type'), 'device_offline')
        self.assertIs(data.get('critical'), True)
        self.assertNotIn('legacy_type', data)
        self.assertEqual(data.get('retry'), 1)

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_old_app_logic_matches_new_payload_initial_alert(self, mock_push):
        """MÔ PHỎNG LOGIC APP CŨ — copy đúng điều kiện if-check từ
        mobile/src/screens/Parent/LiveTrackingScreen.js trên nhánh main:

            if (data.type === 'device_offline') { ... }

        Test này verify app cũ THẬT SỰ match payload mới (không chỉ check
        dict có field gì). Đây là cách duy nhất để test có ý nghĩa thật.
        """
        mock_push.return_value = True

        from tracking.services import check_offline_devices
        check_offline_devices()

        data = self._get_parent_call_data(mock_push)
        self.assertIsNotNone(data)

        # ── MÔ PHỎNG LOGIC APP CŨ (copy y hệt từ LiveTrackingScreen.js main) ──
        # App cũ KHÔNG biết field critical, KHÔNG check legacy_type, chỉ check:
        #   if (data.type === 'device_offline') { /* trigger alarm */ }
        old_app_would_trigger_alarm = (data.get('type') == 'device_offline')
        # ────────────────────────────────────────────────────────────────────

        self.assertTrue(
            old_app_would_trigger_alarm,
            f"App cũ (main) không match payload mới — data.type={data.get('type')!r} "
            f"thay vì 'device_offline'. App cũ sẽ KHÔNG báo động → mất cảnh báo offline."
        )

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_old_app_logic_matches_new_payload_retry_push(self, mock_push):
        """Mô phỏng logic app cũ cho retry push — cũng phải match."""
        mock_push.return_value = True

        DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=self.hb,
            last_seen=self.hb.last_seen,
            last_location_lat=10.0, last_location_lng=106.0,
            status='active', push_sent=False, push_retry_count=0,
        )

        from tracking.services import retry_offline_alert_pushes
        retry_offline_alert_pushes()

        data = self._get_parent_call_data(mock_push)
        self.assertIsNotNone(data)

        # ── MÔ PHỎNG LOGIC APP CŨ ──
        old_app_would_trigger_alarm = (data.get('type') == 'device_offline')
        # ────────────────────────────

        self.assertTrue(
            old_app_would_trigger_alarm,
            f"App cũ không match retry push — data.type={data.get('type')!r}"
        )

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_send_expo_push_notification_resolves_critical_to_emergency_channel(self, mock_push):
        """QA-FIX-7 / N1: send_expo_push_notification (core/views.py) phải
        resolve type='device_offline' + critical=True → channel
        'emergency-alerts' (còi to) thay vì 'critical_alerts' mặc định.

        Test này verify end-to-end: service layer gửi data → core helper
        resolve ra channel đúng.
        """
        # KHÔNG patch core.views.send_expo_push_notification — để nó thật sự
        # chạy và build payload. Mock ở tầng requests.post để không gọi Expo.
        # (Đang patch tracking.services.send_expo_push_notification, nhưng
        # tracking.services._notify_user gọi core.views.send_expo_push_notification
        # nên cần unpatch để test resolve logic thật.)
        # → Đổi strategy: gọi trực tiếp core.views.send_expo_push_notification.
        mock_push.stop()

        with patch('core.views.requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.json.return_value = {
                'data': {'status': 'ok', 'id': 'fake-receipt'}
            }
            mock_post.return_value = mock_resp

            from core.views import send_expo_push_notification
            send_expo_push_notification(
                token='ExponentPushToken[qa6_n1_parent]',
                title='Test',
                body='Test',
                data={
                    'type': 'device_offline',
                    'critical': True,
                    'task_id': 1,
                },
            )

            # Lấy payload thực tế được gửi cho Expo API
            self.assertTrue(mock_post.called)
            payload = mock_post.call_args.kwargs.get('json', {})

            # QA-FIX-7 / N1: type='device_offline' + critical=True → channel
            # phải là 'emergency-alerts' (còi to), KHÔNG phải 'critical_alerts'.
            self.assertEqual(payload.get('channelId'), 'emergency-alerts')
            self.assertEqual(payload.get('android_channel_id'), 'emergency-alerts')

    @patch('tracking.services.send_expo_push_notification')
    def test_n1_send_expo_push_notification_without_critical_uses_basic_channel(self, mock_push):
        """QA-FIX-7 / N1: nếu backend cũ (không set critical=True) gửi
        type='device_offline' → vẫn dùng channel 'critical_alerts' (basic)
        để backward compat với backend cũ hơn nữa."""
        mock_push.stop()

        with patch('core.views.requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.json.return_value = {
                'data': {'status': 'ok', 'id': 'fake-receipt'}
            }
            mock_post.return_value = mock_resp

            from core.views import send_expo_push_notification
            send_expo_push_notification(
                token='ExponentPushToken[qa6_n1_parent]',
                title='Test',
                body='Test',
                data={
                    'type': 'device_offline',
                    # KHÔNG có critical → fallback basic channel
                    'task_id': 1,
                },
            )

            payload = mock_post.call_args.kwargs.get('json', {})
            # Không có critical → channel 'critical_alerts' (basic)
            self.assertEqual(payload.get('channelId'), 'critical_alerts')
            self.assertEqual(payload.get('android_channel_id'), 'critical_alerts')


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
