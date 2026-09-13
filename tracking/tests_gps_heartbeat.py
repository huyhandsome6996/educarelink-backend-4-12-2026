"""
tracking/tests_gps_heartbeat.py — Test GPS heartbeat (Defect 4 — 2026-09-13,
Task E — 2026-09-14: consent matching-GPS TÁCH khỏi live-tracking).

Kiểm thử:
- POST /api/tracking/gps-heartbeat/ khi KHÔNG có consent nào → 200 với
  gps_sync='no_matching_consent', KHÔNG ghi tọa độ (client dừng gửi, matching
  fallback địa chỉ hồ sơ — không còn 403 im lặng rồi quên GPS mãi).
- Consent live-tracking per-task (LocationConsent 'granted') cũ vẫn được
  chấp nhận → 200 + ghi tọa độ.
- Consent matching (User.matching_gps_consent=True) CHỈ đủ để heartbeat ghi
  dù CHƯA có consent trong ca → Task E "consent matching cho phép ghi".
- Throttle: gọi lại trong < GPS_HEARTBEAT_MIN_INTERVAL_SECONDS (60s) →
  gps_sync='throttled', không cập nhật lại tọa độ.
- Parent gọi → 403 (chỉ CarePartner sync GPS).
- GET/POST /api/tracking/matching-gps-consent/ — toggle consent matching.
- Heartbeat trong ca (POST /api/tracking/heartbeat/) có kèm tọa độ →
  sync thêm GPS real-time vào User.

Chạy: python manage.py test tracking.tests_gps_heartbeat --verbosity=2
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import User
from tracking.models import LocationConsent


@override_settings(DEBUG=True)
class GpsHeartbeatEndpointTestCase(TestCase):
    """POST /api/tracking/gps-heartbeat/ — consent guard + throttle."""

    def setUp(self):
        self.client = APIClient()
        self.worker = User.objects.create_user(
            username='gps_worker', password='worker_pass_123',
            role='worker', email='gps_worker@test.com',
            is_approved=True,
            latitude=16.4680, longitude=107.5890,  # đăng ký tại Huế
        )
        self.parent = User.objects.create_user(
            username='gps_parent', password='parent_pass_123',
            role='parent', email='gps_parent@test.com',
        )
        self.url = '/api/tracking/gps-heartbeat/'
        self.payload = {'latitude': 21.0285, 'longitude': 105.7945}

    def _grant_consent(self, user=None):
        """Tạo 1 LocationConsent 'granted' (per-task như SAFETY-LOC-001 hiện có)."""
        from decimal import Decimal
        from core.models import Task
        task = Task.objects.create(
            title='Task GPS test', description='x', price=Decimal('100000'),
            status='in_progress', parent=self.parent,
            scheduled_time=timezone.now() + timedelta(hours=2),
        )
        LocationConsent.objects.create(
            task=task, worker=user or self.worker, consent='granted',
            granted_at=timezone.now())
        return task

    # ── KHÔNG consent nào → 200 no_matching_consent, KHÔNG ghi tọa độ ──
    # (Task E: không còn 403 im lặng — client nhận cờ để dừng gửi + hiện
    # prompt consent 1 lần; matching fallback địa chỉ hồ sơ)
    def test_no_consent_returns_no_matching_consent_and_does_not_write(self):
        self.client.force_authenticate(self.worker)
        resp = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get('gps_sync'), 'no_matching_consent')
        self.assertEqual(resp.data.get('code'), 'no_matching_consent')
        self.worker.refresh_from_db()
        self.assertIsNone(self.worker.current_latitude)
        self.assertIsNone(self.worker.current_longitude)
        self.assertIsNone(self.worker.last_gps_updated_at)

    def test_revoked_consent_without_matching_flag_does_not_write(self):
        self._grant_consent()
        # revoke consent cuối + chưa bật matching flag → không ghi
        LocationConsent.objects.filter(worker=self.worker).update(consent='revoked')
        self.client.force_authenticate(self.worker)
        resp = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get('gps_sync'), 'no_matching_consent')
        self.worker.refresh_from_db()
        self.assertIsNone(self.worker.current_latitude)

    def test_matching_consent_flag_allows_heartbeat_write(self):
        """Task E: consent matching cho phép ghi dù chưa có in-job tracking consent."""
        self.worker.matching_gps_consent = True
        self.worker.save(update_fields=['matching_gps_consent'])
        self.client.force_authenticate(self.worker)
        resp = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['gps_sync'], 'updated')
        self.worker.refresh_from_db()
        self.assertAlmostEqual(self.worker.current_latitude, 21.0285)

    def test_matching_gps_consent_endpoint_toggle(self):
        """GET/POST /api/tracking/matching-gps-consent/ — bật/tắt consent matching."""
        self.client.force_authenticate(self.worker)
        r0 = self.client.get('/api/tracking/matching-gps-consent/')
        self.assertEqual(r0.status_code, 200)
        self.assertFalse(r0.data['matching_gps_consent'])
        r1 = self.client.post('/api/tracking/matching-gps-consent/',
                              {'granted': True}, format='json')
        self.assertEqual(r1.status_code, 200)
        self.assertTrue(r1.data['matching_gps_consent'])
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.matching_gps_consent)
        # Bật consent matching xong → heartbeat ghi được ngay
        r2 = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(r2.data['gps_sync'], 'updated')

    def test_parent_forbidden(self):
        self.client.force_authenticate(self.parent)
        resp = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_unauthenticated_401(self):
        resp = self.client.post(self.url, self.payload, format='json')
        self.assertIn(resp.status_code, (401, 403))

    # ── 200 khi đã có consent ──
    def test_with_consent_writes_coordinates(self):
        self._grant_consent()
        self.client.force_authenticate(self.worker)
        resp = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['gps_sync'], 'updated')
        self.worker.refresh_from_db()
        self.assertAlmostEqual(self.worker.current_latitude, 21.0285)
        self.assertAlmostEqual(self.worker.current_longitude, 105.7945)
        self.assertIsNotNone(self.worker.last_gps_updated_at)

    def test_throttle_within_60s_skips_write(self):
        self._grant_consent()
        self.client.force_authenticate(self.worker)
        r1 = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(r1.data['gps_sync'], 'updated')
        first_ts = self.worker.last_gps_updated_at

        # Gọi lại ngay sau 1s — tọa độ khác — phải bị throttle, không ghi
        self.worker.refresh_from_db()
        import time as _time
        _time.sleep(0.05)
        r2 = self.client.post(self.url, {'latitude': 10.0, 'longitude': 106.0},
                              format='json')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['gps_sync'], 'throttled')
        self.worker.refresh_from_db()
        self.assertAlmostEqual(self.worker.current_latitude, 21.0285)
        self.assertEqual(self.worker.last_gps_updated_at, first_ts)

    def test_invalid_payload_400(self):
        self._grant_consent()
        self.client.force_authenticate(self.worker)
        resp = self.client.post(self.url, {'latitude': 'abc'}, format='json')
        self.assertEqual(resp.status_code, 400)


@override_settings(DEBUG=True)
class TaskHeartbeatGpsSyncTestCase(TestCase):
    """Heartbeat trong ca (POST /api/tracking/heartbeat/) — kèm tọa độ thì
    sync thêm GPS real-time vào User (đã có consent per-task ở update_heartbeat)."""

    def setUp(self):
        self.client = APIClient()
        self.parent = User.objects.create_user(
            username='hb_parent', password='parent_pass_123', role='parent')
        self.worker = User.objects.create_user(
            username='hb_worker', password='worker_pass_123',
            role='worker', is_approved=True,
            latitude=16.4680, longitude=107.5890)

    def _make_task_with_consent(self):
        from decimal import Decimal
        from core.models import Task, TaskApplication
        task = Task.objects.create(
            title='Task heartbeat GPS', description='x', price=Decimal('100000'),
            status='in_progress', parent=self.parent,
            scheduled_time=timezone.now() + timedelta(hours=2))
        TaskApplication.objects.create(task=task, worker=self.worker,
                                       status='accepted')
        LocationConsent.objects.create(task=task, worker=self.worker,
                                       consent='granted', granted_at=timezone.now())
        return task

    def test_task_heartbeat_without_consent_403_no_gps_write(self):
        from decimal import Decimal
        from core.models import Task
        task = Task.objects.create(
            title='Task chưa consent', description='x', price=Decimal('100000'),
            status='in_progress', parent=self.parent,
            scheduled_time=timezone.now() + timedelta(hours=2))
        self.client.force_authenticate(self.worker)
        resp = self.client.post('/api/tracking/heartbeat/', {
            'task_id': task.id, 'latitude': 21.0, 'longitude': 105.8,
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.worker.refresh_from_db()
        self.assertIsNone(self.worker.current_latitude)
        self.assertIsNone(self.worker.current_longitude)

    def test_task_heartbeat_with_consent_syncs_user_gps(self):
        task = self._make_task_with_consent()
        self.client.force_authenticate(self.worker)
        resp = self.client.post('/api/tracking/heartbeat/', {
            'task_id': task.id, 'latitude': 16.47, 'longitude': 107.59,
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get('gps_sync'), 'updated')
        self.worker.refresh_from_db()
        self.assertAlmostEqual(self.worker.current_latitude, 16.47)
        self.assertAlmostEqual(self.worker.current_longitude, 107.59)
