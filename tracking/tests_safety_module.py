"""
Test cho Phần 1, 2, 3 — Module an toàn CarePartner.
Chạy: python manage.py test tracking.tests_safety_module --verbosity=2
"""

from datetime import timedelta
from decimal import Decimal
from django.test import TestCase, override_settings
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from core.models import User, Task, ServiceCategory, TaskApplication, Notification
from tracking.models import (
    LocationConsent, LiveLocation, LocationHistory,
    DeviceHeartbeat, DeviceOfflineAlert, RandomVerificationCheck,
)
from tracking.services import (
    set_verification_pin, respond_verification_check,
    acknowledge_offline_alert, retry_offline_alert_pushes,
)
from tracking.verification_scheduler import (
    RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS,
    trigger_verification_check_now, run_verification_check,
)
from tracking.serializers import BatchLocationSerializer


@override_settings(DEBUG=True)
class SafetyModuleTestCase(TestCase):
    """Test tổng hợp Phần 1, 2, 3."""

    def setUp(self):
        """Tạo user + task + accepted worker."""
        # Parent
        self.parent = User.objects.create_user(
            username='parent_test', password='parent_pass_123',
            role='parent', email='parent@test.com',
        )
        # Worker (CarePartner)
        self.worker = User.objects.create_user(
            username='worker_test', password='worker_pass_123',
            role='worker', email='worker@test.com',
        )
        # Category
        self.cat = ServiceCategory.objects.create(name='Gia sư')
        # Task
        self.task = Task.objects.create(
            title='Task test an toàn',
            description='Test',
            price=100000,
            status='in_progress',
            parent=self.parent,
            category=self.cat,
            location='HCM',
            latitude=10.0,
            longitude=106.0,
            scheduled_time=timezone.now(),
        )
        # Worker accepted
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted'
        )
        # Consent granted
        self.consent = LocationConsent.objects.create(
            task=self.task, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )

    # ═══════════════════════════════════════════════════════════════
    #  PHẦN 3 — Verification PIN + Random Check
    # ═══════════════════════════════════════════════════════════════

    def test_set_verification_pin_hashes_pin(self):
        """PIN phải được hash, không lưu plaintext."""
        user = set_verification_pin(
            user=self.worker, pin='1234',
            current_password='worker_pass_123',
        )
        self.assertIsNotNone(user.verification_pin_hash)
        self.assertNotEqual(user.verification_pin_hash, '1234')
        self.assertTrue(user.verification_pin_hash.startswith('pbkdf2_'))
        self.assertIsNotNone(user.verification_pin_set_at)

    def test_set_verification_pin_wrong_password_rejected(self):
        """Đổi PIN với sai mật khẩu tài khoản → phải fail."""
        with self.assertRaises(PermissionError):
            set_verification_pin(
                user=self.worker, pin='1234',
                current_password='wrong_password',
            )

    def test_set_verification_pin_invalid_format(self):
        """PIN không phải 4-6 số → phải fail."""
        for bad_pin in ['123', '1234567', 'abcd', '12a4']:
            with self.subTest(pin=bad_pin):
                with self.assertRaises(ValueError):
                    set_verification_pin(
                        user=self.worker, pin=bad_pin,
                        current_password='worker_pass_123',
                    )

    def test_respond_verification_check_correct_pin(self):
        """Nhập đúng PIN → status='confirmed'."""
        set_verification_pin(
            user=self.worker, pin='1234',
            current_password='worker_pass_123',
        )
        # Tạo check thủ công
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
        )
        result = respond_verification_check(
            check_id=check.id, requester=self.worker,
            pin='1234', latitude=10.0, longitude=106.0,
        )
        self.assertEqual(result.status, 'confirmed')
        self.assertIsNotNone(result.responded_at)
        self.assertEqual(result.response_lat, Decimal('10.0'))

    def test_respond_verification_check_wrong_pin_increments_attempts(self):
        """Sai PIN → tăng attempts, vẫn 'pending' nếu < MAX_WRONG_ATTEMPTS."""
        set_verification_pin(
            user=self.worker, pin='1234',
            current_password='worker_pass_123',
        )
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
        )
        # Sai 1 lần → còn 2 lần thử
        with self.assertRaises(ValueError) as ctx:
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='9999',
            )
        self.assertIn('2 lần', str(ctx.exception))
        check.refresh_from_db()
        self.assertEqual(check.attempts, 1)
        self.assertEqual(check.status, 'pending')

        # Sai lần 2 → còn 1 lần thử
        with self.assertRaises(ValueError) as ctx:
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='8888',
            )
        self.assertIn('1 lần', str(ctx.exception))
        check.refresh_from_db()
        self.assertEqual(check.attempts, 2)
        self.assertEqual(check.status, 'pending')

        # Sai lần 3 (= MAX_WRONG_ATTEMPTS) → 'wrong_code' + admin notified
        with self.assertRaises(ValueError) as ctx:
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='7777',
            )
        self.assertIn('bị khoá', str(ctx.exception))
        check.refresh_from_db()
        self.assertEqual(check.status, 'wrong_code')

    def test_respond_verification_check_timeout(self):
        """Quá deadline → status='timeout'."""
        set_verification_pin(
            user=self.worker, pin='1234',
            current_password='worker_pass_123',
        )
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=1),  # đã quá hạn
        )
        with self.assertRaises(ValueError) as ctx:
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='1234',
            )
        self.assertIn('hết thời gian', str(ctx.exception).lower())
        check.refresh_from_db()
        self.assertEqual(check.status, 'timeout')

    def test_trigger_verification_check_now_creates_check(self):
        """Admin trigger → tạo check + push (mocked).

        QA-FIX-1 / Bug 1.4: test trước đây không set expo_push_token +
        không mock requests.post → send_expo_push_notification trả None
        (không gọi Expo) nhưng check.push_sent vẫn True (vì code cũ
        fire-and-forget set True sai). Sau khi fix Bug 1.4, push_sent
        chỉ True khi _notify_user trả True → cần set token + mock Expo
        response để test chạy đúng.
        """
        from unittest.mock import patch, MagicMock

        # Set expo_push_token cho worker — không thì _notify_user trả None.
        self.worker.expo_push_token = 'ExponentPushToken[fake-token-for-test]'
        self.worker.save(update_fields=['expo_push_token'])

        # Mock requests.post để send_expo_push_notification trả True
        # (giả lập Expo trả { data: { status: 'ok', id: 'receipt-xxx' } }).
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'data': {'status': 'ok', 'id': 'fake-receipt-id'}
        }
        mock_response.status_code = 200
        mock_response.text = ''

        set_verification_pin(
            user=self.worker, pin='1234',
            current_password='worker_pass_123',
        )

        with patch('core.views.requests.post', return_value=mock_response):
            check = trigger_verification_check_now(self.task.id)

        self.assertIsNotNone(check)
        self.assertEqual(check.task_id, self.task.id)
        self.assertEqual(check.worker_id, self.worker.id)
        self.assertEqual(check.status, 'pending')
        # QA-FIX-1 / Bug 1.4: push_sent=True chỉ khi _notify_user trả True.
        self.assertTrue(check.push_sent)

    def test_run_verification_check_marks_timeouts(self):
        """Job scheduler → chuyển pending quá deadline thành 'timeout'."""
        # Tạo check đã quá hạn
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='pending',
        )
        stats = run_verification_check()
        self.assertEqual(stats['timeouts_marked'], 1)
        check.refresh_from_db()
        self.assertEqual(check.status, 'timeout')

    # ═══════════════════════════════════════════════════════════════
    #  PHẦN 2 — Acknowledge offline alert
    # ═══════════════════════════════════════════════════════════════

    def test_acknowledge_offline_alert(self):
        """Parent acknowledge → set acknowledged_at, dừng retry."""
        # Tạo heartbeat + alert
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='offline',
            offline_detected_at=timezone.now() - timedelta(seconds=30),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
            push_sent=True, push_sent_at=timezone.now() - timedelta(seconds=30),
            push_retry_count=1,
        )
        # Acknowledge
        result = acknowledge_offline_alert(
            alert_id=alert.id, requester=self.parent,
        )
        self.assertIsNotNone(result.acknowledged_at)
        # Retry push sẽ skip alert này
        stats = retry_offline_alert_pushes()
        # Alert đã acknowledged → không nằm trong pending_alerts
        self.assertEqual(stats['retried_count'], 0)

    def test_acknowledge_offline_alert_wrong_parent_rejected(self):
        """Parent khác không được acknowledge alert của task không phải mình."""
        other_parent = User.objects.create_user(
            username='other_parent', password='x', role='parent',
            email='other@test.com',
        )
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        with self.assertRaises(PermissionError):
            acknowledge_offline_alert(
                alert_id=alert.id, requester=other_parent,
            )

    # ═══════════════════════════════════════════════════════════════
    #  PHẦN 1 — Batch location
    # ═══════════════════════════════════════════════════════════════

    def test_batch_location_serializer_valid(self):
        """Serializer chấp nhận batch hợp lệ."""
        s = BatchLocationSerializer(data={
            'task_id': 1,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': '2026-08-12T10:00:00Z'},
                {'latitude': 10.001, 'longitude': 106.001, 'accuracy': 5.0, 'recorded_at': '2026-08-12T10:00:10Z'},
            ]
        })
        self.assertTrue(s.is_valid(), s.errors)

    def test_batch_location_serializer_rejects_over_500(self):
        """Serializer từ chối batch > 500 điểm."""
        s = BatchLocationSerializer(data={
            'task_id': 1,
            'points': [{'latitude': 10.0, 'longitude': 106.0, 'recorded_at': '2026-08-12T10:00:00Z'}] * 501,
        })
        self.assertFalse(s.is_valid())
        self.assertIn('points', s.errors)

    def test_batch_location_serializer_rejects_missing_recorded_at(self):
        """Serializer từ chối điểm thiếu recorded_at."""
        s = BatchLocationSerializer(data={
            'task_id': 1,
            'points': [{'latitude': 10.0, 'longitude': 106.0}],
        })
        self.assertFalse(s.is_valid())

    def test_batch_location_view_creates_history_with_past_recorded_at(self):
        """POST /tracking/location/batch/ → insert LocationHistory với client_recorded_at quá khứ.

        QA-FIX-1 / Spec 2.5: response status giờ là 201 (không phải 200).
        """
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        # Points với recorded_at 10 phút trước
        past = (timezone.now() - timedelta(minutes=10)).isoformat()
        past2 = (timezone.now() - timedelta(minutes=9, seconds=50)).isoformat()
        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': past},
                {'latitude': 10.001, 'longitude': 106.001, 'recorded_at': past2},
            ]
        }, format='json')
        force_authenticate(request, user=self.worker)
        view = BatchLocationAPIView.as_view()
        response = view(request)
        # QA-FIX-1 / Spec 2.5: trả 201 Created (không phải 200 OK)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['saved'], 2)

        # Verify LocationHistory có đúng 2 row với client_recorded_at ~ 10 phút trước
        history = LocationHistory.objects.filter(task=self.task).order_by('client_recorded_at')
        self.assertEqual(history.count(), 2)
        # client_recorded_at phải ~ past (10 phút trước, không phải now)
        first_dt = history.first().client_recorded_at
        self.assertIsNotNone(first_dt)
        self.assertLess(first_dt, timezone.now() - timedelta(minutes=9))
        # recorded_at (server timestamp) vẫn = now-ish (auto_now_add)
        # nhưng client_recorded_at = past
        self.assertGreater(history.first().recorded_at, timezone.now() - timedelta(minutes=1))

        # Verify LiveLocation được update với điểm mới nhất
        live = LiveLocation.objects.get(task=self.task)
        self.assertEqual(live.latitude, Decimal('10.001'))
