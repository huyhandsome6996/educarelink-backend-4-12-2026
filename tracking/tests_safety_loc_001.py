"""
SAFETY-LOC-001 — Cảnh báo phụ huynh khi mất tracking vị trí (permission revoked).

Unit tests cho:
  1. report_location_permission_revoked() trong services.py
  2. update_heartbeat() với location_permission_status mới
  3. HeartbeatSerializer + LocationPermissionStatusSerializer
  4. LocationPermissionStatusAPIView
  5. DeviceOfflineAlert.alert_type field
  6. Regression: heartbeat/offline detection cũ không bị ảnh hưởng

Chạy: python manage.py test tracking.tests_safety_loc_001 --verbosity=2
"""

from datetime import timedelta
from decimal import Decimal
from django.test import TestCase, override_settings
from django.utils import timezone
from unittest.mock import patch, MagicMock

from core.models import User, Task, ServiceCategory, TaskApplication, Notification
from tracking.models import (
    LocationConsent, DeviceHeartbeat, DeviceOfflineAlert,
)
from tracking.services import (
    update_heartbeat, report_location_permission_revoked,
    check_offline_devices, AlreadyAcknowledgedError,
)
from tracking.serializers import (
    HeartbeatSerializer, LocationPermissionStatusSerializer,
    DeviceOfflineAlertSerializer,
)


def _mock_expo_push_ok():
    """Mock requests.post để send_expo_push_notification trả True."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        'data': {'status': 'ok', 'id': 'fake-receipt'}
    }
    mock_resp.status_code = 200
    mock_resp.text = ''
    return mock_resp


@override_settings(DEBUG=True)
class PermissionRevokedServiceTests(TestCase):
    """Test report_location_permission_revoked()."""

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent', password='pass', role='parent',
            email='parent@test.com',
            expo_push_token='ExponentPushToken[fake-parent]',
        )
        self.worker = User.objects.create_user(
            username='worker', password='pass', role='worker',
            email='worker@test.com',
        )
        self.cat = ServiceCategory.objects.create(name='Test')
        self.task = Task.objects.create(
            title='Task test', description='Test',
            price=100000, status='in_progress',
            parent=self.parent, category=self.cat,
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

    # ---- Permission denied → tạo alert ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_denied_creates_alert(self, mock_post):
        """Permission denied → tạo alert loại 'location_permission_revoked'."""
        result = report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        self.assertEqual(result['permission_status'], 'denied')
        self.assertIsNotNone(result['alert'])
        self.assertEqual(result['alert']['alert_type'], 'location_permission_revoked')
        self.assertEqual(result['alert']['status'], 'active')

        alert = DeviceOfflineAlert.objects.get(task=self.task, status='active')
        self.assertEqual(alert.alert_type, 'location_permission_revoked')
        self.assertTrue(alert.push_sent)

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_denied_sends_push_to_parent(self, mock_post):
        """Permission denied → parent nhận push với nội dung riêng biệt."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        # Verify Notification created cho parent
        notifs = Notification.objects.filter(recipient=self.parent)
        self.assertTrue(notifs.exists())
        notif = notifs.first()
        self.assertIn('tắt', notif.title.lower())
        # Verify Expo push called
        self.assertTrue(mock_post.called)

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_denied_notifies_admin(self, mock_post):
        """Permission denied → admin nhận in-app notification."""
        admin = User.objects.create_user(
            username='admin', password='admin',
            role='worker', is_staff=True, is_active=True,
            email='admin@test.com',
        )
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        admin_notifs = Notification.objects.filter(recipient=admin)
        self.assertTrue(admin_notifs.exists())

    # ---- Debounce: không spam ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_denied_called_twice_no_duplicate_alert(self, mock_post):
        """Gọi denied 2 lần → chỉ tạo 1 alert (debounce)."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        result2 = report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        active_count = DeviceOfflineAlert.objects.filter(
            task=self.task, status='active'
        ).count()
        self.assertEqual(active_count, 1)
        self.assertIsNotNone(result2['alert'])
        self.assertEqual(result2['alert']['id'],
            report_location_permission_revoked(
                task=self.task, worker=self.worker, permission_status='denied'
            )['alert']['id'])

    # ---- Recovery: granted → resolve alert ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_granted_resolves_permission_alert(self, mock_post):
        """Granted sau khi denied → resolve alert + notify parent."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        alert_id = DeviceOfflineAlert.objects.get(
            task=self.task, status='active'
        ).id

        result = report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='granted',
        )
        self.assertEqual(result['permission_status'], 'granted')
        self.assertIsNotNone(result['alert'])
        self.assertEqual(result['alert']['status'], 'recovered')

        alert = DeviceOfflineAlert.objects.get(pk=alert_id)
        self.assertEqual(alert.status, 'recovered')
        self.assertIsNotNone(alert.recovered_at)

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_granted_sends_restored_notification(self, mock_post):
        """Granted → parent nhận thông báo 'đã bật lại vị trí'."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        # Xóa notifications cũ
        Notification.objects.all().delete()

        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='granted',
        )
        notifs = Notification.objects.filter(recipient=self.parent)
        self.assertTrue(notifs.exists())
        self.assertIn('bật lại', notifs.first().title.lower())

    # ---- Không tự revoke consent ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_denied_does_not_revoke_consent(self, mock_post):
        """Permission denied → consent vẫn 'granted' (không tự revoke)."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        self.consent.refresh_from_db()
        self.assertEqual(self.consent.consent, 'granted')

    # ---- Task vẫn in_progress ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_denied_task_still_in_progress(self, mock_post):
        """Permission denied → task.status vẫn 'in_progress'."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, 'in_progress')

    # ---- Verify checks ----

    def test_wrong_worker_rejected(self):
        """Worker không phải người được accept → 403."""
        other_worker = User.objects.create_user(
            username='other_worker', password='pass', role='worker',
            email='other_worker@test.com',
        )
        with self.assertRaises(PermissionError):
            report_location_permission_revoked(
                task=self.task, worker=other_worker,
                permission_status='denied',
            )

    def test_consent_not_granted_rejected(self):
        """Consent != 'granted' → không cho báo cáo."""
        self.consent.consent = 'denied'
        self.consent.save()
        with self.assertRaises(PermissionError):
            report_location_permission_revoked(
                task=self.task, worker=self.worker,
                permission_status='denied',
            )

    def test_task_not_in_progress_rejected(self):
        """Task không in_progress → 400."""
        self.task.status = 'completed'
        self.task.save()
        with self.assertRaises(ValueError):
            report_location_permission_revoked(
                task=self.task, worker=self.worker,
                permission_status='denied',
            )

    # ---- UniqueConstraint: không tạo 2 active alert ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_does_not_overwrite_device_offline_alert(self, mock_post):
        """Đang có device_offline active → không tạo permission alert mới."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='offline',
        )
        DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
            alert_type='device_offline',
        )
        result = report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        # Trả về alert device_offline hiện tại, không tạo mới
        self.assertIsNotNone(result['alert'])
        self.assertEqual(result['alert']['alert_type'], 'device_offline')
        # Chỉ có 1 alert active
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(
                task=self.task, status='active'
            ).count(),
            1,
        )

    # ---- Cập nhật DeviceHeartbeat.location_permission_status ----

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_updates_heartbeat_permission_status(self, mock_post):
        """Gọi report → cập nhật DeviceHeartbeat.location_permission_status."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now(),
            device_status='online',
            location_permission_status='unknown',
        )
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        hb.refresh_from_db()
        self.assertEqual(hb.location_permission_status, 'denied')

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_updates_heartbeat_permission_on_recovery(self, mock_post):
        """Recovery → cập nhật heartbeat permission status về 'granted'."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now(),
            device_status='online',
            location_permission_status='denied',
        )
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='granted',
        )
        hb.refresh_from_db()
        self.assertEqual(hb.location_permission_status, 'granted')


@override_settings(DEBUG=True)
class HeartbeatWithPermissionStatusTests(TestCase):
    """Test update_heartbeat() với location_permission_status mới."""

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent2', password='pass', role='parent',
            email='parent2@test.com',
            expo_push_token='ExponentPushToken[fake]',
        )
        self.worker = User.objects.create_user(
            username='worker2', password='pass', role='worker',
            email='worker2@test.com',
        )
        self.cat = ServiceCategory.objects.create(name='Test2')
        self.task = Task.objects.create(
            title='Task hb', description='Test',
            price=100000, status='in_progress',
            parent=self.parent, category=self.cat,
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

    def test_heartbeat_stores_permission_status(self):
        """update_heartbeat() lưu location_permission_status."""
        hb = update_heartbeat(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
            location_permission_status='granted',
        )
        self.assertEqual(hb.location_permission_status, 'granted')

    def test_heartbeat_invalid_status_defaults_unknown(self):
        """location_permission_status không hợp lệ → mặc định 'unknown'."""
        hb = update_heartbeat(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
            location_permission_status='invalid_value',
        )
        self.assertEqual(hb.location_permission_status, 'unknown')

    def test_heartbeat_null_coords_works(self):
        """Heartbeat với latitude/longitude=None vẫn hoạt động."""
        hb = update_heartbeat(
            task=self.task, worker=self.worker,
            latitude=None, longitude=None,
            location_permission_status='denied',
        )
        self.assertEqual(hb.location_permission_status, 'denied')
        self.assertIsNone(hb.last_location_lat)

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_heartbeat_resolves_permission_alert(self, mock_post):
        """Heartbeat khi có permission alert active → resolve + notify."""
        report_location_permission_revoked(
            task=self.task, worker=self.worker,
            permission_status='denied',
        )
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(
                task=self.task, status='active'
            ).count(), 1
        )
        # Heartbeat → resolve
        update_heartbeat(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
        )
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(
                task=self.task, status='recovered'
            ).count(), 1
        )

    @patch('core.views.requests.post', return_value=_mock_expo_push_ok())
    def test_heartbeat_resolves_device_offline_alert(self, mock_post):
        """Heartbeat khi có device_offline alert active → resolve (regression)."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='offline',
        )
        DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
            alert_type='device_offline',
        )
        update_heartbeat(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
        )
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(
                task=self.task, status='recovered'
            ).count(), 1
        )


@override_settings(DEBUG=True)
class SerializerTests(TestCase):
    """Test HeartbeatSerializer + LocationPermissionStatusSerializer."""

    def test_heartbeat_serializer_accepts_permission_status(self):
        """HeartbeatSerializer chấp nhận location_permission_status."""
        s = HeartbeatSerializer(data={
            'task_id': 1,
            'location_permission_status': 'granted',
        })
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data['location_permission_status'], 'granted')

    def test_heartbeat_serializer_denied_status(self):
        s = HeartbeatSerializer(data={
            'task_id': 1,
            'location_permission_status': 'denied',
        })
        self.assertTrue(s.is_valid(), s.errors)

    def test_heartbeat_serializer_invalid_status_rejected(self):
        """location_permission_status không hợp lệ → bị reject."""
        s = HeartbeatSerializer(data={
            'task_id': 1,
            'location_permission_status': 'maybe',
        })
        self.assertFalse(s.is_valid())
        self.assertIn('location_permission_status', s.errors)

    def test_heartbeat_serializer_defaults_unknown(self):
        """Không gửi location_permission_status → default 'unknown'."""
        s = HeartbeatSerializer(data={'task_id': 1})
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data['location_permission_status'], 'unknown')

    def test_permission_status_serializer_valid(self):
        """LocationPermissionStatusSerializer valid với 'granted'/'denied'."""
        for val in ['granted', 'denied']:
            s = LocationPermissionStatusSerializer(data={
                'task_id': 1, 'status': val,
            })
            self.assertTrue(s.is_valid(), f"Failed for {val}: {s.errors}")

    def test_permission_status_serializer_rejects_unknown(self):
        """LocationPermissionStatusSerializer từ chối 'unknown'."""
        s = LocationPermissionStatusSerializer(data={
            'task_id': 1, 'status': 'unknown',
        })
        self.assertFalse(s.is_valid())

    def test_device_offline_alert_serializer_includes_alert_type(self):
        """DeviceOfflineAlertSerializer trả alert_type."""
        parent = User.objects.create_user(
            username='p3', password='p', role='parent', email='p3@test.com'
        )
        worker = User.objects.create_user(
            username='w3', password='p', role='worker', email='w3@test.com'
        )
        cat = ServiceCategory.objects.create(name='C3')
        task = Task.objects.create(
            title='T3', description='T', price=100000,
            status='in_progress', parent=parent, category=cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        hb = DeviceHeartbeat.objects.create(
            task=task, worker=worker, last_seen=timezone.now(),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=task, worker=worker, heartbeat=hb,
            last_seen=timezone.now(), status='active',
            alert_type='location_permission_revoked',
        )
        s = DeviceOfflineAlertSerializer(alert)
        data = s.data
        self.assertEqual(data['alert_type'], 'location_permission_revoked')
        self.assertIn('alert_type_display', data)


@override_settings(DEBUG=True)
class AlertTypeMigrationTests(TestCase):
    """Test DeviceOfflineAlert.alert_type field + migration backward compat."""

    def test_existing_alert_gets_default_device_offline(self):
        """Alert tạo không có alert_type → default 'device_offline'."""
        parent = User.objects.create_user(
            username='p4', password='p', role='parent', email='p4@test.com'
        )
        worker = User.objects.create_user(
            username='w4', password='p', role='worker', email='w4@test.com'
        )
        cat = ServiceCategory.objects.create(name='C4')
        task = Task.objects.create(
            title='T4', description='T', price=100000,
            status='in_progress', parent=parent, category=cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        hb = DeviceHeartbeat.objects.create(
            task=task, worker=worker, last_seen=timezone.now(),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=task, worker=worker, heartbeat=hb,
            last_seen=timezone.now(), status='active',
            # KHÔNG set alert_type → phải default 'device_offline'
        )
        self.assertEqual(alert.alert_type, 'device_offline')

    def test_alert_type_choices(self):
        """alert_type chỉ chấp nhận giá trị hợp lệ."""
        valid_types = ['device_offline', 'location_permission_revoked']
        for t in valid_types:
            alert = DeviceOfflineAlert(
                task_id=1, worker_id=1, last_seen=timezone.now(),
                alert_type=t,
            )
            alert.full_clean()  # Không raise


@override_settings(DEBUG=True)
class CheckOfflineDevicesRegressionTests(TestCase):
    """Regression: check_offline_devices() vẫn hoạt động đúng với alert_type mới."""

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent5', password='pass', role='parent',
            email='parent5@test.com',
            expo_push_token='ExponentPushToken[fake5]',
        )
        self.worker = User.objects.create_user(
            username='worker5', password='pass', role='worker',
            email='worker5@test.com',
        )
        self.cat = ServiceCategory.objects.create(name='Test5')
        self.task = Task.objects.create(
            title='Task reg', description='Test',
            price=100000, status='in_progress',
            parent=self.parent, category=self.cat,
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

    def test_offline_check_creates_device_offline_alert_type(self):
        """check_offline_devices() tạo alert với alert_type='device_offline'."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='online',
            location_permission_status='granted',
        )
        stats = check_offline_devices()
        self.assertEqual(stats['new_alerts'], 1)
        alert = DeviceOfflineAlert.objects.get(task=self.task, status='active')
        self.assertEqual(alert.alert_type, 'device_offline')
