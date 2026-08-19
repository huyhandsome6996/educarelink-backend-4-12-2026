"""
QA-FIX-1 — Test suite cho 5 🔴 critical bugs + 6 🟡 spec gaps.

Chạy: python manage.py test tracking.tests_qa_fixes --verbosity=2

Mỗi test case tương ứng 1 bug hoặc spec gap trong QA-FIX-1:
  🔴 1.1 — OfflineLocationQueue sync_attempts + per-point skip
  🔴 1.2 — BatchLocationAPIView transaction.atomic
  🔴 1.3 — Verification scheduler chỉ alert parent 1 lần/streak
  🔴 1.4 — send_expo_push_notification parse response + return True/False/None
  🔴 1.5 — acknowledge_offline_alert 400/404 mapping
  🟡 2.2 — DeviceOfflineAlert.acknowledged_by FK
  🟡 2.3 — User model methods set_verification_pin / check_verification_pin / has_verification_pin_set
  🟡 2.4 — Parent verification history + Cancel check
  🟡 2.5 — Batch location: 201, 413, recorded_at validation
  🟡 2.6 — Mobile EmergencyAlarmService (skip — JS, không test Python)
  Bổ sung — logger.warning at max retry
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone

from core.models import User, Task, ServiceCategory, TaskApplication, Notification
from tracking.models import (
    LocationConsent, LiveLocation, LocationHistory,
    DeviceHeartbeat, DeviceOfflineAlert, RandomVerificationCheck,
)
from tracking.services import (
    set_verification_pin, respond_verification_check,
    acknowledge_offline_alert, retry_offline_alert_pushes,
    cancel_verification_check, get_verification_history_for_parent,
    cancel_pending_verification_checks_for_task,
    AlreadyAcknowledgedError,
)
from tracking.verification_scheduler import (
    RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS,
    trigger_verification_check_now, run_verification_check,
    CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT,
)
from tracking.serializers import BatchLocationSerializer


@override_settings(DEBUG=True)
class QAFix1TestCase(TestCase):
    """Test suite cho QA-FIX-1 — 5 🔴 + 6 🟡."""

    def setUp(self):
        """Setup chung: parent + worker + task + accepted + consent granted."""
        self.parent = User.objects.create_user(
            username='qa_parent', password='parent_pass_123',
            role='parent', email='qa_parent@test.com',
        )
        self.worker = User.objects.create_user(
            username='qa_worker', password='worker_pass_123',
            role='worker', email='qa_worker@test.com',
        )
        self.cat = ServiceCategory.objects.create(name='QA Test Cat')
        self.task = Task.objects.create(
            title='QA Task', description='Test', price=100000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted'
        )
        self.consent = LocationConsent.objects.create(
            task=self.task, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )

    # ═══════════════════════════════════════════════════════════════════
    #  🔴 1.1 — OfflineLocationQueue sync_attempts + per-point skip
    #  (Mobile JS — không test Python; test contract qua serializer + view)
    # ═══════════════════════════════════════════════════════════════════

    def test_1_1_batch_with_invalid_recorded_at_skips_per_point_not_whole_batch(self):
        """🔴 1.1 / Spec 2.5: điểm có recorded_at tương lai > 5phút bị SKIP,
        không làm hỏng cả batch — đúng contract cho mobile flushOfflineQueue.
        Trước đây cả batch bị drop → mất dữ liệu vị trí thật."""
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        now = timezone.now()
        # 1 điểm hợp lệ (10 phút trước), 1 điểm future (1 giờ sau), 1 điểm quá cũ (30 ngày trước)
        valid_past = (now - timedelta(minutes=10)).isoformat()
        future_invalid = (now + timedelta(hours=1)).isoformat()
        too_old_invalid = (now - timedelta(days=30)).isoformat()

        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': valid_past},
                {'latitude': 11.0, 'longitude': 107.0, 'recorded_at': future_invalid},
                {'latitude': 12.0, 'longitude': 108.0, 'recorded_at': too_old_invalid},
            ]
        }, format='json')
        force_authenticate(request, user=self.worker)
        view = BatchLocationAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 201, response.data)
        # Chỉ 1 điểm được saved (điểm hợp lệ)
        self.assertEqual(response.data['saved'], 1)
        # 2 điểm bị skip
        self.assertEqual(response.data['skipped_count'], 2)
        # LocationHistory chỉ có 1 row
        self.assertEqual(LocationHistory.objects.filter(task=self.task).count(), 1)

    # ═══════════════════════════════════════════════════════════════════
    #  🔴 1.2 — BatchLocationAPIView transaction.atomic
    # ═══════════════════════════════════════════════════════════════════

    def test_1_2_batch_location_atomic_rollback_on_live_update_fail(self):
        """🔴 1.2: nếu LiveLocation update fail → rollback LocationHistory inserts.
        Trước đây chỉ catch + log → dữ liệu lệch (history có nhưng live không update)."""
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        past = (timezone.now() - timedelta(minutes=5)).isoformat()

        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': past},
            ]
        }, format='json')
        force_authenticate(request, user=self.worker)

        # Patch LiveLocation.update_or_create để raise Exception
        with patch(
            'tracking.models.LiveLocation.objects.update_or_create',
            side_effect=Exception('Simulated DB error')
        ):
            view = BatchLocationAPIView.as_view()
            response = view(request)

        # Phải trả 500 (không phải 200 với saved=1)
        self.assertEqual(response.status_code, 500)
        # LocationHistory phải rollback → 0 rows
        self.assertEqual(LocationHistory.objects.filter(task=self.task).count(), 0)

    # ═══════════════════════════════════════════════════════════════════
    #  🔴 1.3 — Verification scheduler chỉ alert parent 1 lần/streak
    # ═══════════════════════════════════════════════════════════════════

    def test_1_3a_timeout_increments_consecutive_count(self):
        """🔴 1.3a: timeout đầu tiên → consecutive_timeouts_count=1, chưa push parent."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='pending',
        )
        stats = run_verification_check()
        self.assertEqual(stats['timeouts_marked'], 1)
        check.refresh_from_db()
        self.assertEqual(check.status, 'timeout')
        self.assertEqual(check.consecutive_timeouts_count, 1)
        self.assertFalse(check.parent_alert_sent)
        # Parent alert chưa gửi vì 1 < CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT (=2)
        self.assertEqual(stats['parent_alerts_sent'], 0)

    def test_1_3b_second_consecutive_timeout_triggers_parent_alert_once(self):
        """🔴 1.3b: timeout thứ 2 liên tiếp → push parent 1 lần + set parent_alert_sent."""
        # Timeout đầu (đã xử lý)
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=20),
            status='timeout',
            consecutive_timeouts_count=1,
            parent_alert_sent=False,
        )
        # Timeout thứ 2 (pending, sắp được xử lý)
        check2 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='pending',
        )

        # Patch _notify_user để check parent có được notify không
        with patch('tracking.verification_scheduler._notify_user') as mock_notify:
            stats = run_verification_check()

        self.assertEqual(stats['timeouts_marked'], 1)
        self.assertEqual(stats['parent_alerts_sent'], 1)
        check2.refresh_from_db()
        self.assertEqual(check2.consecutive_timeouts_count, 2)
        self.assertTrue(check2.parent_alert_sent)
        # Parent được notify 1 lần
        self.assertEqual(mock_notify.call_count, 1)

    def test_1_3c_third_timeout_does_not_re_alert_parent(self):
        """🔴 1.3c: timeout thứ 3 liên tiếp → KHÔNG push parent lại (flag đã True).
        Trước đây mỗi timeout ≥ threshold đều push → spam 4 push giống nhau."""
        # 2 timeout trước đó (đã xử lý, flag đã set)
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=30),
            status='timeout',
            consecutive_timeouts_count=1,
            parent_alert_sent=False,
        )
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=20),
            status='timeout',
            consecutive_timeouts_count=2,
            parent_alert_sent=True,
        )
        # Timeout thứ 3 (pending)
        check3 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='pending',
        )

        with patch('tracking.verification_scheduler._notify_user') as mock_notify:
            stats = run_verification_check()

        self.assertEqual(stats['timeouts_marked'], 1)
        # KHÔNG push parent lại (flag đã True)
        self.assertEqual(stats['parent_alerts_sent'], 0)
        check3.refresh_from_db()
        self.assertEqual(check3.consecutive_timeouts_count, 3)
        self.assertTrue(check3.parent_alert_sent)
        # Parent KHÔNG được notify
        self.assertEqual(mock_notify.call_count, 0)

    def test_1_3d_confirmed_resets_streak_counters(self):
        """🔴 1.3d: khi check confirmed → reset parent_alert_sent + consecutive_timeouts_count."""
        set_verification_pin(
            user=self.worker, pin='1234',
            current_password='worker_pass_123',
        )
        # Check có streak != 0
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
            consecutive_timeouts_count=2,
            parent_alert_sent=True,
        )
        # Worker nhập đúng PIN
        result = respond_verification_check(
            check_id=check.id, requester=self.worker,
            pin='1234', latitude=10.0, longitude=106.0,
        )
        self.assertEqual(result.status, 'confirmed')
        self.assertEqual(result.consecutive_timeouts_count, 0)
        self.assertFalse(result.parent_alert_sent)

    def test_1_3e_cancelled_resets_streak_counters(self):
        """🔴 1.3e: khi check bị huỷ → reset parent_alert_sent + consecutive_timeouts_count."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
            consecutive_timeouts_count=2,
            parent_alert_sent=True,
        )
        result = cancel_verification_check(
            check_id=check.id, requester=self.parent, reason='False alarm',
        )
        self.assertEqual(result.status, 'cancelled')
        self.assertEqual(result.consecutive_timeouts_count, 0)
        self.assertFalse(result.parent_alert_sent)

    def test_1_3f_streak_resets_after_confirmed_then_new_timeout_starts_streak_anew(self):
        """🔴 1.3f: sau khi confirmed reset streak, timeout mới bắt đầu streak = 1
        (không kế thừa streak cũ)."""
        # Streak cũ: 2 timeout, đã reset vì confirmed
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=40),
            status='timeout',
            consecutive_timeouts_count=2,
            parent_alert_sent=True,
        )
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=30),
            status='confirmed',
            consecutive_timeouts_count=0,
            parent_alert_sent=False,
        )
        # Timeout mới (pending)
        new_check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='pending',
        )

        with patch('tracking.verification_scheduler._notify_user'):
            stats = run_verification_check()

        new_check.refresh_from_db()
        # Streak mới bắt đầu từ 1 (không kế thừa 2 từ streak cũ đã reset)
        self.assertEqual(new_check.consecutive_timeouts_count, 1)
        self.assertFalse(new_check.parent_alert_sent)
        self.assertEqual(stats['parent_alerts_sent'], 0)

    # ═══════════════════════════════════════════════════════════════════
    #  🔴 1.4 — send_expo_push_notification parse response + True/False/None
    # ═══════════════════════════════════════════════════════════════════

    def test_1_4a_expo_push_returns_true_on_ok_response(self):
        """🔴 1.4a: Expo trả {data: {status: 'ok'}} → return True."""
        from core.views import send_expo_push_notification
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'data': {'status': 'ok', 'id': 'fake-receipt'}
        }
        mock_response.status_code = 200
        mock_response.text = ''

        with patch('core.views.requests.post', return_value=mock_response):
            result = send_expo_push_notification(
                'ExponentPushToken[fake]', 'Title', 'Body', {'type': 'sos_alert'}
            )
        self.assertTrue(result)

    def test_1_4b_expo_push_returns_false_on_error_response(self):
        """🔴 1.4b: Expo trả {data: {status: 'error'}} → return False."""
        from core.views import send_expo_push_notification
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'data': {
                'status': 'error',
                'message': 'DeviceNotRegistered',
                'details': {'error': 'DeviceNotRegistered'},
            }
        }
        mock_response.status_code = 200
        mock_response.text = ''

        with patch('core.views.requests.post', return_value=mock_response):
            result = send_expo_push_notification(
                'ExponentPushToken[fake]', 'Title', 'Body', {'type': 'sos_alert'}
            )
        self.assertFalse(result)

    def test_1_4c_expo_push_returns_none_on_network_error(self):
        """🔴 1.4c: requests.Timeout → return None (không rõ kết quả)."""
        import requests as _requests
        from core.views import send_expo_push_notification

        with patch('core.views.requests.post', side_effect=_requests.Timeout('timeout')):
            result = send_expo_push_notification(
                'ExponentPushToken[fake]', 'Title', 'Body', {'type': 'sos_alert'}
            )
        self.assertIsNone(result)

    def test_1_4d_expo_push_returns_none_on_empty_token(self):
        """🔴 1.4d: token=None → return None (không gọi API)."""
        from core.views import send_expo_push_notification
        with patch('core.views.requests.post') as mock_post:
            result = send_expo_push_notification(None, 'Title', 'Body')
        self.assertIsNone(result)
        mock_post.assert_not_called()

    def test_1_4e_offline_alert_push_sent_only_true_when_expo_ok(self):
        """🔴 1.4e: DeviceOfflineAlert.push_sent chỉ True khi _notify_user trả True.
        Trước đây fire-and-forget → set True sai khi Expo reject."""
        # Set token + mock Expo trả error
        self.parent.expo_push_token = 'ExponentPushToken[fake]'
        self.parent.save(update_fields=['expo_push_token'])

        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='online',
        )
        # Mock check_offline_devices → gọi _notify_user → send_expo_push_notification
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'data': {'status': 'error', 'message': 'DeviceNotRegistered'}
        }
        mock_response.status_code = 200
        mock_response.text = ''

        from tracking.services import check_offline_devices
        with patch('core.views.requests.post', return_value=mock_response):
            check_offline_devices()

        alert = DeviceOfflineAlert.objects.get(task=self.task)
        # push_sent PHẢI False (trước đây True sai)
        self.assertFalse(alert.push_sent)

    # ═══════════════════════════════════════════════════════════════════
    #  🔴 1.5 — acknowledge_offline_alert 400/404 mapping
    # ═══════════════════════════════════════════════════════════════════

    def test_1_5a_acknowledge_already_acked_raises_specific_error(self):
        """🔴 1.5a: alert đã acknowledged → raise AlreadyAcknowledgedError (không phải ValueError)."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
            acknowledged_at=timezone.now() - timedelta(seconds=60),
            acknowledged_by=self.parent,
        )
        with self.assertRaises(AlreadyAcknowledgedError):
            acknowledge_offline_alert(
                alert_id=alert.id, requester=self.parent, task_id=self.task.id,
            )

    def test_1_5b_acknowledge_task_id_mismatch_raises_value_error(self):
        """🔴 1.5b: task_id truyền vào không khớp alert.task_id → ValueError (404 ở view)."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        with self.assertRaises(ValueError):
            acknowledge_offline_alert(
                alert_id=alert.id, requester=self.parent, task_id=99999,
            )

    def test_1_5c_acknowledge_view_returns_400_on_already_acked(self):
        """🔴 1.5c: view map AlreadyAcknowledgedError → 400."""
        from tracking.views import AcknowledgeOfflineAlertAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
            acknowledged_at=timezone.now() - timedelta(seconds=60),
            acknowledged_by=self.parent,
        )
        factory = APIRequestFactory()
        request = factory.post('/', {}, format='json')
        force_authenticate(request, user=self.parent)
        view = AcknowledgeOfflineAlertAPIView.as_view()
        response = view(request, task_id=self.task.id, alert_id=alert.id)
        self.assertEqual(response.status_code, 400)

    def test_1_5d_acknowledge_view_returns_404_on_task_id_mismatch(self):
        """🔴 1.5d: view map task_id mismatch ValueError → 404."""
        from tracking.views import AcknowledgeOfflineAlertAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        factory = APIRequestFactory()
        request = factory.post('/', {}, format='json')
        force_authenticate(request, user=self.parent)
        view = AcknowledgeOfflineAlertAPIView.as_view()
        # task_id=99999 (sai) nhưng alert_id đúng
        response = view(request, task_id=99999, alert_id=alert.id)
        self.assertEqual(response.status_code, 404)

    # ═══════════════════════════════════════════════════════════════════
    #  🟡 2.2 — DeviceOfflineAlert.acknowledged_by FK
    # ═══════════════════════════════════════════════════════════════════

    def test_2_2a_acknowledge_sets_acknowledged_by(self):
        """🟡 2.2a: acknowledge_offline_alert set acknowledged_by = requester."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        result = acknowledge_offline_alert(
            alert_id=alert.id, requester=self.parent, task_id=self.task.id,
        )
        self.assertIsNotNone(result.acknowledged_at)
        self.assertEqual(result.acknowledged_by_id, self.parent.id)

    def test_2_2b_acknowledged_by_field_exists_in_schema(self):
        """🟡 2.2b: field acknowledged_by tồn tại trong model + DB."""
        # Model field tồn tại
        field = DeviceOfflineAlert._meta.get_field('acknowledged_by')
        self.assertEqual(field.remote_field.on_delete, __import__('django.db.models', fromlist=['SET_NULL']).SET_NULL)
        self.assertTrue(field.null)
        self.assertTrue(field.blank)
        # DB column tồn tại
        cols = [c.name for c in DeviceOfflineAlert._meta.fields]
        self.assertIn('acknowledged_by', cols)

    # ═══════════════════════════════════════════════════════════════════
    #  🟡 2.3 — User model methods
    # ═══════════════════════════════════════════════════════════════════

    def test_2_3a_set_verification_pin_hashes_pin(self):
        """🟡 2.3a: user.set_verification_pin() hash + save."""
        self.worker.set_verification_pin('1234')
        self.worker.refresh_from_db()
        self.assertIsNotNone(self.worker.verification_pin_hash)
        self.assertNotEqual(self.worker.verification_pin_hash, '1234')
        self.assertTrue(self.worker.verification_pin_hash.startswith('pbkdf2_'))
        self.assertIsNotNone(self.worker.verification_pin_set_at)

    def test_2_3b_check_verification_pin_returns_true_on_correct_pin(self):
        """🟡 2.3b: user.check_verification_pin() True khi đúng."""
        self.worker.set_verification_pin('1234')
        self.assertTrue(self.worker.check_verification_pin('1234'))

    def test_2_3c_check_verification_pin_returns_false_on_wrong_pin(self):
        """🟡 2.3c: user.check_verification_pin() False khi sai."""
        self.worker.set_verification_pin('1234')
        self.assertFalse(self.worker.check_verification_pin('9999'))

    def test_2_3d_check_verification_pin_returns_false_when_no_pin_set(self):
        """🟡 2.3d: user.check_verification_pin() False khi chưa set PIN."""
        # Worker mới chưa set PIN
        self.assertFalse(self.worker.check_verification_pin('1234'))

    def test_2_3e_has_verification_pin_set_property(self):
        """🟡 2.3e: has_verification_pin_set property — True sau khi set, False trước đó."""
        self.assertFalse(self.worker.has_verification_pin_set)
        self.worker.set_verification_pin('1234')
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.has_verification_pin_set)

    # ═══════════════════════════════════════════════════════════════════
    #  🟡 2.4 — Parent verification history + Cancel check
    # ═══════════════════════════════════════════════════════════════════

    def test_2_4a_parent_history_returns_checks_for_own_task(self):
        """🟡 2.4a: parent xem history của task mình — trả list checks."""
        # Tạo 3 checks với status khác nhau
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='timeout',
            consecutive_timeouts_count=1,
        )
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now(),
            status='confirmed',
        )
        result = get_verification_history_for_parent(
            task=self.task, requester=self.parent,
        )
        self.assertEqual(len(result), 3)
        # Sắp xếp theo triggered_at giảm dần
        statuses = [c['status'] for c in result]
        self.assertIn('pending', statuses)
        self.assertIn('timeout', statuses)
        self.assertIn('confirmed', statuses)

    def test_2_4b_parent_history_denied_for_other_parent(self):
        """🟡 2.4b: parent khác không được xem history của task không phải mình."""
        other_parent = User.objects.create_user(
            username='other_p', password='x', role='parent', email='o@t.com',
        )
        with self.assertRaises(PermissionError):
            get_verification_history_for_parent(
                task=self.task, requester=other_parent,
            )

    def test_2_4c_cancel_pending_check_by_parent_succeeds(self):
        """🟡 2.4c: parent huỷ check pending của task mình → status='cancelled'."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        result = cancel_verification_check(
            check_id=check.id, requester=self.parent, reason='False alarm',
        )
        self.assertEqual(result.status, 'cancelled')
        self.assertIsNotNone(result.responded_at)

    def test_2_4d_cancel_check_by_admin_succeeds(self):
        """🟡 2.4d: admin (is_superuser) huỷ check → thành công."""
        admin = User.objects.create_superuser(
            username='admin_qa', password='x', email='admin@t.com',
        )
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        result = cancel_verification_check(
            check_id=check.id, requester=admin,
        )
        self.assertEqual(result.status, 'cancelled')

    def test_2_4e_cancel_check_by_worker_denied(self):
        """🟡 2.4e: worker không được huỷ check (tránh trốn xác minh)."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        with self.assertRaises(PermissionError):
            cancel_verification_check(
                check_id=check.id, requester=self.worker,
            )

    def test_2_4f_cancel_already_ended_check_fails(self):
        """🟡 2.4f: huỷ check đã kết thúc (confirmed/timeout/cancelled) → ValueError."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='confirmed',
        )
        with self.assertRaises(ValueError):
            cancel_verification_check(
                check_id=check.id, requester=self.parent,
            )

    def test_2_4g_cancel_nonexistent_check_fails(self):
        """🟡 2.4g: huỷ check không tồn tại → ValueError."""
        with self.assertRaises(ValueError):
            cancel_verification_check(
                check_id=99999, requester=self.parent,
            )

    def test_2_4h_cancel_check_resets_streak_counters(self):
        """🟡 2.4h: huỷ check reset parent_alert_sent + consecutive_timeouts_count."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
            consecutive_timeouts_count=3,
            parent_alert_sent=True,
        )
        result = cancel_verification_check(
            check_id=check.id, requester=self.parent,
        )
        self.assertEqual(result.consecutive_timeouts_count, 0)
        self.assertFalse(result.parent_alert_sent)

    # ═══════════════════════════════════════════════════════════════════
    #  🟡 2.5 — Batch location: 201, 413, recorded_at validation
    # ═══════════════════════════════════════════════════════════════════

    def test_2_5a_batch_returns_201_on_success(self):
        """🟡 2.5a: POST /tracking/location/batch/ thành công → 201 (không phải 200)."""
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        past = (timezone.now() - timedelta(minutes=5)).isoformat()
        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': past},
            ]
        }, format='json')
        force_authenticate(request, user=self.worker)
        view = BatchLocationAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 201, response.data)

    def test_2_5b_batch_returns_413_when_over_500_points(self):
        """🟡 2.5b: POST /tracking/location/batch/ với 501 points → 413 (không phải 400)."""
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        past = (timezone.now() - timedelta(minutes=5)).isoformat()
        # 501 points
        points = [
            {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': past}
        ] * 501
        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        force_authenticate(request, user=self.worker)
        view = BatchLocationAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 413)
        self.assertIn('max', str(response.data).lower() + str(response.data))

    def test_2_5c_batch_skips_future_recorded_at_over_5min(self):
        """🟡 2.5c: recorded_at vượt quá +5 phút tương lai → skip điểm đó."""
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        now = timezone.now()
        valid = (now - timedelta(minutes=1)).isoformat()
        future_too_far = (now + timedelta(minutes=10)).isoformat()
        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': valid},
                {'latitude': 11.0, 'longitude': 107.0, 'recorded_at': future_too_far},
            ]
        }, format='json')
        force_authenticate(request, user=self.worker)
        view = BatchLocationAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['saved'], 1)
        self.assertEqual(response.data['skipped_count'], 1)

    def test_2_5d_batch_skips_recorded_at_older_than_7_days(self):
        """🟡 2.5d: recorded_at cũ quá 7 ngày → skip điểm đó."""
        from tracking.views import BatchLocationAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        factory = APIRequestFactory()
        now = timezone.now()
        valid = (now - timedelta(minutes=1)).isoformat()
        too_old = (now - timedelta(days=30)).isoformat()
        request = factory.post('/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [
                {'latitude': 10.0, 'longitude': 106.0, 'recorded_at': valid},
                {'latitude': 11.0, 'longitude': 107.0, 'recorded_at': too_old},
            ]
        }, format='json')
        force_authenticate(request, user=self.worker)
        view = BatchLocationAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['saved'], 1)
        self.assertEqual(response.data['skipped_count'], 1)

    def test_2_5e_batch_serializer_field_points_name_preserved(self):
        """🟡 2.5e: serializer field vẫn tên 'points' (không rename)."""
        s = BatchLocationSerializer()
        self.assertIn('points', s.fields)
        # Đảm bảo KHÔNG có field alias như 'location_points' hay 'data'
        self.assertNotIn('location_points', s.fields)
        self.assertNotIn('locations', s.fields)

    # ═══════════════════════════════════════════════════════════════════
    #  Bổ sung — logger.warning at max retry in retry_offline_alert_pushes()
    # ═══════════════════════════════════════════════════════════════════

    def test_sup_1_max_retry_logs_warning_per_alert(self):
        """Bổ sung 1: alert đạt max retry → logger.warning cho từng alert (không phải chỉ đếm).

        QA-FIX-2 / C: sau khi thêm unique constraint (1 active alert per task),
        không thể tạo 2 active alert cho cùng task. Test này dùng 2 task khác nhau
        để verify logger.warning vẫn log per-alert.
        """
        # Tạo thêm 1 task + worker khác để có 2 alert active (mỗi task 1 alert)
        parent2 = User.objects.create_user(
            username='qa_parent2', password='parent_pass_123',
            role='parent', email='qa_parent2@test.com',
        )
        worker2 = User.objects.create_user(
            username='qa_worker2', password='worker_pass_123',
            role='worker', email='qa_worker2@test.com',
        )
        task2 = Task.objects.create(
            title='QA Task 2', description='Test', price=100000,
            status='in_progress', parent=parent2, category=self.cat,
            location='HCM', latitude=10.1, longitude=106.1,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=task2, worker=worker2, status='accepted'
        )
        LocationConsent.objects.create(
            task=task2, worker=worker2, consent='granted',
            granted_at=timezone.now(),
        )

        # Tạo 1 alert active đạt max retry cho mỗi task
        hb1 = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb1,
            last_seen=hb1.last_seen, status='active',
            push_retry_count=5,  # đã đạt max
            acknowledged_at=None,
        )
        hb2 = DeviceHeartbeat.objects.create(
            task=task2, worker=worker2,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        DeviceOfflineAlert.objects.create(
            task=task2, worker=worker2, heartbeat=hb2,
            last_seen=hb2.last_seen, status='active',
            push_retry_count=5,  # đã đạt max
            acknowledged_at=None,
        )

        # Patch logger để capture warnings
        import tracking.services as svc_mod
        with patch.object(svc_mod.logger, 'warning') as mock_warning:
            stats = retry_offline_alert_pushes()

        # 2 alert đạt max → stats['max_reached_count'] = 2
        self.assertEqual(stats['max_reached_count'], 2)
        # Mỗi alert phải có 1 warning log riêng (không phải chỉ 1 log tổng)
        # Log count >= 2 (có thể nhiều hơn do các warning khác)
        self.assertGreaterEqual(mock_warning.call_count, 2)

    # ═══════════════════════════════════════════════════════════════════
    #  Auto-cancel pending verification checks khi task kết thúc
    # ═══════════════════════════════════════════════════════════════════

    def test_auto_cancel_pending_check_on_task_completed(self):
        """Task in_progress có 1 pending check → task completed → check tự cancelled."""
        # Set PIN cho worker
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        # Trigger check (debug mode)
        check = trigger_verification_check_now(self.task.id)
        self.assertEqual(check.status, 'pending')
        self.assertIsNone(check.responded_at)

        # Chuyển task sang completed
        self.task.status = 'completed'
        self.task.save()

        # Verify check đã bị tự huỷ
        check.refresh_from_db()
        self.assertEqual(check.status, 'cancelled')
        self.assertIsNotNone(check.responded_at)
        self.assertFalse(check.parent_alert_sent)
        self.assertEqual(check.consecutive_timeouts_count, 0)

    def test_auto_cancel_pending_check_on_task_cancelled(self):
        """Task cancelled cũng tự cancel pending checks."""
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        check = trigger_verification_check_now(self.task.id)
        self.assertEqual(check.status, 'pending')

        self.task.status = 'cancelled'
        self.task.save()

        check.refresh_from_db()
        self.assertEqual(check.status, 'cancelled')

    def test_auto_cancel_does_not_touch_non_pending_checks(self):
        """Check đã confirmed/timeout/wrong_code KHÔNG bị đụng khi task kết thúc."""
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        check1 = trigger_verification_check_now(self.task.id)
        # Respond correctly
        respond_verification_check(
            check_id=check1.id, requester=self.worker, pin='1234'
        )

        # Tạo check thứ 2 rồi timeout
        self.task.status = 'in_progress'
        self.task.save()
        check2 = trigger_verification_check_now(self.task.id)
        check2.status = 'timeout'
        check2.responded_at = timezone.now()
        check2.save()

        # Task completed
        self.task.status = 'completed'
        self.task.save()

        check1.refresh_from_db()
        check2.refresh_from_db()
        # Các check không pending phải giữ nguyên status
        self.assertEqual(check1.status, 'confirmed')
        self.assertEqual(check2.status, 'timeout')

    def test_auto_cancel_pending_check_not_returned_by_api(self):
        """PendingVerificationCheckAPIView không trả check của task đã completed."""
        from tracking.views import PendingVerificationCheckAPIView
        from rest_framework.test import APIRequestFactory, force_authenticate

        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        check = trigger_verification_check_now(self.task.id)
        self.assertEqual(check.status, 'pending')

        # Task completed → auto-cancel
        self.task.status = 'completed'
        self.task.save()

        # Worker poll pending → phải không còn check
        factory = APIRequestFactory()
        request = factory.get('/tracking/verification-checks/pending/')
        force_authenticate(request, user=self.worker)
        view = PendingVerificationCheckAPIView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data.get('has_pending', True))
