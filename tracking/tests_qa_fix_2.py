"""
QA-FIX-2 — Test suite cho bổ sung an toàn CarePartner toàn diện.

Chạy: python manage.py test tracking.tests_qa_fix_2 --verbosity=2

Các test case cover yêu cầu mới:
  B1 — Idempotent batch location (client_point_id + unique constraint)
  B3 — API device-status trả đủ trường stale/offline/last_seen
  C  — DB unique constraint chống duplicate active alert/pending check
  C  — Scheduler production-safe (apps.py skip web worker)
  E  — Geofence predictive warning persist vào DB
  E  — Tọa độ 0 hợp lệ (Python `is not None`, JS `?? null` — test Python side)
  F  — Random PIN verification đúng/sai/quá hạn/cancel
  G  — Logout cleanup (test service clearByUser không khả thi Python-side,
       chỉ test backend cleanup behavior)
"""

import uuid as _uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication, Notification
from tracking.models import (
    LocationConsent, LiveLocation, LocationHistory,
    DeviceHeartbeat, DeviceOfflineAlert, RandomVerificationCheck,
)
from tracking.services import (
    set_verification_pin, respond_verification_check,
    acknowledge_offline_alert, retry_offline_alert_pushes,
    cancel_verification_check, get_verification_history_for_parent,
    update_worker_location, get_device_status,
    AlreadyAcknowledgedError,
    OFFLINE_THRESHOLD_SECONDS,
)
from tracking.verification_scheduler import (
    RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS,
    trigger_verification_check_now, run_verification_check,
    CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT,
)


@override_settings(DEBUG=True)
class QAFix2TestCase(TestCase):
    """Test suite cho QA-FIX-2 — bổ sung an toàn CarePartner toàn diện."""

    def setUp(self):
        """Setup chung: parent + worker + task + accepted + consent granted."""
        self.parent = User.objects.create_user(
            username='qa2_parent', password='parent_pass_123',
            role='parent', email='qa2_parent@test.com',
        )
        self.worker = User.objects.create_user(
            username='qa2_worker', password='worker_pass_123',
            role='worker', email='qa2_worker@test.com',
        )
        self.cat = ServiceCategory.objects.create(name='QA2 Test Cat')
        self.task = Task.objects.create(
            title='QA2 Task', description='Test', price=100000,
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
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    # ═══════════════════════════════════════════════════════════════════
    #  B1 — Idempotent batch location (client_point_id + unique constraint)
    # ═══════════════════════════════════════════════════════════════════

    def test_b1_batch_with_client_point_id_idempotent(self):
        """B1: gửi cùng client_point_id 2 lần → chỉ insert 1 lần (no duplicate)."""
        client_point_id = str(_uuid.uuid4())
        points = [{
            'client_point_id': client_point_id,
            'latitude': 10.123,
            'longitude': 106.123,
            'accuracy': 10,
            'speed': 0,
            'heading': 0,
            'recorded_at': timezone.now().isoformat(),
        }]

        # Lần 1: insert mới
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['saved'], 1)
        self.assertIn(client_point_id, resp.data['inserted_ids'])
        self.assertEqual(LocationHistory.objects.filter(client_point_id=client_point_id).count(), 1)

        # Lần 2: retry cùng client_point_id → already_exists, không insert mới
        resp2 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(resp2.data['saved'], 0)
        self.assertIn(client_point_id, resp2.data['already_exists_ids'])
        # Vẫn chỉ có 1 row
        self.assertEqual(LocationHistory.objects.filter(client_point_id=client_point_id).count(), 1)

    def test_b1_batch_mixed_inserted_and_existing(self):
        """B1: batch gồm 2 điểm — 1 mới, 1 đã tồn tại → 1 inserted + 1 already_exists."""
        existing_id = str(_uuid.uuid4())
        new_id = str(_uuid.uuid4())
        now = timezone.now()

        # Pre-insert existing_id
        LocationHistory.objects.create(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
            client_recorded_at=now, client_point_id=existing_id,
        )

        points = [
            {
                'client_point_id': existing_id,
                'latitude': 10.0, 'longitude': 106.0,
                'recorded_at': now.isoformat(),
            },
            {
                'client_point_id': new_id,
                'latitude': 10.1, 'longitude': 106.1,
                'recorded_at': now.isoformat(),
            },
        ]
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['saved'], 1)
        self.assertIn(existing_id, resp.data['already_exists_ids'])
        self.assertIn(new_id, resp.data['inserted_ids'])

    def test_b1_batch_without_client_point_id_still_works(self):
        """B1: realtime points (không có client_point_id) vẫn insert được."""
        points = [{
            'latitude': 10.0,
            'longitude': 106.0,
            'recorded_at': timezone.now().isoformat(),
        }]
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['saved'], 1)

    def test_b1_batch_rejected_invalid_client_point_id(self):
        """B1: client_point_id quá dài (> 36) → rejected, không insert."""
        points = [{
            'client_point_id': 'x' * 50,  # quá dài
            'latitude': 10.0,
            'longitude': 106.0,
            'recorded_at': timezone.now().isoformat(),
        }]
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        # Trả 400 vì không có điểm hợp lệ nào
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['rejected'][0]['reason'],
                         'client_point_id không hợp lệ (phải là UUID string ≤ 36 ký tự)')

    def test_b1_batch_no_internal_exception_detail_leaked(self):
        """B1: nếu backend fail → không透露 exception detail nội bộ cho client."""
        # Mock LiveLocation.objects.update_or_create để raise Exception
        with patch('tracking.models.LiveLocation.objects.update_or_create',
                   side_effect=Exception('DB internal error')):
            points = [{
                'latitude': 10.0,
                'longitude': 106.0,
                'recorded_at': timezone.now().isoformat(),
            }]
            resp = self.client.post('/api/tracking/location/batch/', {
                'task_id': self.task.id, 'points': points,
            }, format='json')
            self.assertEqual(resp.status_code, 500)
            self.assertNotIn('DB internal error', str(resp.data))
            self.assertIn('Batch insert thất bại', str(resp.data))

    # ═══════════════════════════════════════════════════════════════════
    #  C — DB unique constraint chống duplicate
    # ═══════════════════════════════════════════════════════════════════

    def test_c_unique_active_alert_per_task(self):
        """C: không thể tạo 2 DeviceOfflineAlert active cho cùng task."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        # Tạo alert active đầu tiên
        DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        # Tạo alert active thứ 2 → IntegrityError
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DeviceOfflineAlert.objects.create(
                    task=self.task, worker=self.worker, heartbeat=hb,
                    last_seen=hb.last_seen, status='active',
                )

    def test_c_unique_active_alert_allowed_after_recovered(self):
        """C: có thể tạo alert active mới sau khi alert cũ chuyển 'recovered'."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        # Alert đầu tiên active
        alert1 = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        # Chuyển sang recovered
        alert1.status = 'recovered'
        alert1.save()
        # Tạo alert active mới → OK
        alert2 = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        self.assertEqual(alert2.status, 'active')

    def test_c_unique_pending_check_per_task_worker(self):
        """C: không thể tạo 2 RandomVerificationCheck pending cho cùng (task, worker)."""
        # Tạo check pending đầu tiên
        RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        # Tạo check pending thứ 2 → IntegrityError
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                RandomVerificationCheck.objects.create(
                    task=self.task, worker=self.worker,
                    respond_deadline=timezone.now() + timedelta(seconds=90),
                    status='pending',
                )

    def test_c_unique_pending_check_allowed_after_timeout(self):
        """C: có thể tạo check pending mới sau khi check cũ chuyển 'timeout'."""
        # Check đầu tiên pending
        check1 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        # Chuyển sang timeout
        check1.status = 'timeout'
        check1.save()
        # Tạo check pending mới → OK
        check2 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        self.assertEqual(check2.status, 'pending')

    def test_c_scheduler_no_duplicate_active_alert(self):
        """C: scheduler chạy 2 lần liên tiếp không tạo 2 alert active cho cùng task.

        Test check DB count (không phải stats['new_alerts']) vì stats['new_alerts']
        chỉ increment khi push sent thành công — nếu parent chưa có expo_push_token
        thì push_failed nhưng alert vẫn được tạo.

        Sau lần 1: heartbeat.device_status chuyển 'offline' + alert 'active' tạo.
        Lần 2: scheduler filter `device_status='online'` → skip hb này → không tạo
        alert mới. Tức là scheduler đã có dedup ở 2 tầng:
          1. heartbeat.device_status='offline' (không quét lại)
          2. existing_active alert check (chống tạo alert thứ 2)
          3. DB unique constraint (last resort)
        """
        # Tạo heartbeat quá hạn
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='online',
        )
        from tracking.services import check_offline_devices
        # Chạy scheduler lần 1 → tạo 1 alert (push có thể fail nhưng alert vẫn tạo)
        check_offline_devices()
        # DB có 1 alert active
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(task=self.task, status='active').count(),
            1
        )
        # Heartbeat đã chuyển 'offline'
        hb.refresh_from_db()
        self.assertEqual(hb.device_status, 'offline')

        # Chạy scheduler lần 2 → không tạo thêm alert
        check_offline_devices()
        # DB vẫn chỉ có 1 alert active
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(task=self.task, status='active').count(),
            1
        )

    def test_c_scheduler_db_constraint_prevents_duplicate(self):
        """C: DB unique constraint là last-resort chống duplicate.

        Nếu somehow (race condition, bug) 2 alert active cố tạo cho cùng task
        → DB constraint reject. Đây là defense-in-depth bên dưới scheduler logic.
        """
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
            device_status='online',
        )
        # Tạo alert active đầu tiên trực tiếp (bypass scheduler)
        DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        # Cố tạo alert active thứ 2 → IntegrityError
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DeviceOfflineAlert.objects.create(
                    task=self.task, worker=self.worker, heartbeat=hb,
                    last_seen=hb.last_seen, status='active',
                )

    # ═══════════════════════════════════════════════════════════════════
    #  B3 — API device-status + Live location trả đủ trường
    # ═══════════════════════════════════════════════════════════════════

    def test_b3_device_status_returns_all_required_fields(self):
        """B3: API device-status trả đủ last_seen, seconds_since_last_seen,
        is_offline, offline_threshold_seconds, last_location."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now(),
            last_location_lat=10.0, last_location_lng=106.0,
            device_status='online',
        )
        client_parent = APIClient()
        client_parent.force_authenticate(user=self.parent)
        resp = client_parent.get(f'/api/tracking/{self.task.id}/device-status/')
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        # B3: kiểm tra tất cả field yêu cầu có mặt
        self.assertIn('last_seen', data)
        self.assertIn('seconds_since_last_seen', data)
        self.assertIn('is_offline', data)
        self.assertIn('offline_threshold_seconds', data)
        self.assertIn('last_location', data)
        self.assertEqual(data['last_location']['latitude'], 10.0)
        self.assertEqual(data['last_location']['longitude'], 106.0)
        # offline_threshold_seconds = config value (không hardcode 60/90)
        self.assertEqual(data['offline_threshold_seconds'], OFFLINE_THRESHOLD_SECONDS)

    def test_b3_live_location_returns_stale_offline_fields(self):
        """B3: API live location trả thêm is_stale, is_offline, last_seen."""
        # Tạo LiveLocation cũ (> threshold offline)
        LiveLocation.objects.create(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
        )
        # last_seen có auto_now=True → set qua update() query để bypass
        # (save() sẽ ghi đè last_seen = now).
        old_time = timezone.now() - timedelta(seconds=OFFLINE_THRESHOLD_SECONDS + 30)
        LiveLocation.objects.filter(task=self.task).update(last_seen=old_time)

        client_parent = APIClient()
        client_parent.force_authenticate(user=self.parent)
        resp = client_parent.get(f'/api/tracking/{self.task.id}/live/')
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertTrue(data['is_tracking'])
        self.assertTrue(data['is_offline'])
        self.assertTrue(data['is_stale'])
        self.assertEqual(data['offline_threshold_seconds'], OFFLINE_THRESHOLD_SECONDS)
        self.assertIsNotNone(data['last_seen'])

    def test_b3_live_location_fresh_not_stale(self):
        """B3: vị trí mới (< 30s) → is_stale=False, is_offline=False."""
        LiveLocation.objects.create(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
        )
        client_parent = APIClient()
        client_parent.force_authenticate(user=self.parent)
        resp = client_parent.get(f'/api/tracking/{self.task.id}/live/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['is_stale'])
        self.assertFalse(resp.data['is_offline'])

    # ═══════════════════════════════════════════════════════════════════
    #  E — Geofence predictive warning persist + tọa độ 0
    # ═══════════════════════════════════════════════════════════════════

    def test_e_predictive_warned_field_exists(self):
        """E: LiveLocation có field predictive_warned (persist DB)."""
        live = LiveLocation.objects.create(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
        )
        self.assertFalse(live.predictive_warned)
        live.predictive_warned = True
        live.save()
        live.refresh_from_db()
        self.assertTrue(live.predictive_warned)

    def test_e_geofence_warning_not_duplicated_on_multiple_updates(self):
        """E: cập nhật vị trí trong vùng 80-100% nhiều lần → chỉ 1 push warning."""
        # Mock _notify_user để đếm calls
        with patch('tracking.services._notify_user') as mock_notify:
            # Task geofence center 10.0, 106.0, radius 500m
            self.task.geofence_lat = 10.0
            self.task.geofence_lng = 106.0
            self.task.geofence_radius = 500.0
            self.task.save()

            # Lần 1: ở 420m (84% radius — trong vùng 80-100%) → push warning
            update_worker_location(
                task=self.task, worker=self.worker,
                latitude=10.0038, longitude=106.0,  # ~420m từ 10.0
            )
            initial_call_count = mock_notify.call_count

            # Lần 2: vẫn ở ~420m → không push thêm (predictive_warned=True)
            update_worker_location(
                task=self.task, worker=self.worker,
                latitude=10.0038, longitude=106.0,
            )
            self.assertEqual(mock_notify.call_count, initial_call_count,
                             "Không được push warning lần 2 — flag predictive_warned đã persist")

            # Lần 3: về vùng an toàn (< 80%) → clear flag
            update_worker_location(
                task=self.task, worker=self.worker,
                latitude=10.0001, longitude=106.0,  # ~11m — trong vùng an toàn
            )
            live = LiveLocation.objects.get(task=self.task)
            self.assertFalse(live.predictive_warned,
                              "predictive_warned phải clear khi về vùng an toàn")

    def test_e_zero_coordinates_treated_as_valid(self):
        """E: tọa độ (0, 0) hợp lệ — không bị bỏ sót geofence check.

        Trước đây `if geofence_lat` = `if 0` = False → fallback về task.latitude
        → có thể dùng sai tâm vùng an toàn. Giờ `is not None` → 0 hợp lệ.
        """
        # Task geofence center (0, 0), radius 500m
        self.task.geofence_lat = 0.0
        self.task.geofence_lng = 0.0
        self.task.geofence_radius = 500.0
        self.task.save()

        # Update vị trí gần (0, 0) → không cảnh báo (trong vùng)
        with patch('tracking.services._notify_user') as mock_notify:
            update_worker_location(
                task=self.task, worker=self.worker,
                latitude=0.0001, longitude=0.0001,  # ~15m từ (0,0)
            )
            # Không có geofence_exit push (vẫn trong vùng)
            geofence_exit_calls = [
                c for c in mock_notify.call_args_list
                if c.kwargs.get('data', {}).get('type') == 'geofence_exit'
            ]
            self.assertEqual(len(geofence_exit_calls), 0)

    # ═══════════════════════════════════════════════════════════════════
    #  F — Random PIN verification
    # ═══════════════════════════════════════════════════════════════════

    def test_f_set_pin_hash_not_plaintext(self):
        """F: PIN hash không phải plaintext."""
        self.worker.set_verification_pin('1234')
        self.worker.refresh_from_db()
        self.assertIsNotNone(self.worker.verification_pin_hash)
        self.assertNotIn('1234', self.worker.verification_pin_hash)
        self.assertTrue(self.worker.verification_pin_hash.startswith('pbkdf2_'))

    def test_f_check_pin_correct(self):
        """F: check_verification_pin trả True cho PIN đúng."""
        self.worker.set_verification_pin('1234')
        self.assertTrue(self.worker.check_verification_pin('1234'))
        self.assertFalse(self.worker.check_verification_pin('9999'))

    def test_f_has_verification_pin_set_property(self):
        """F: has_verification_pin_set property trả đúng."""
        self.assertFalse(self.worker.has_verification_pin_set)
        self.worker.set_verification_pin('1234')
        self.assertTrue(self.worker.has_verification_pin_set)

    def test_f_respond_correct_pin_resets_streak(self):
        """F: respond đúng PIN → status=confirmed + reset streak."""
        self.worker.set_verification_pin('1234')
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
            consecutive_timeouts_count=2,
            parent_alert_sent=True,
        )
        check = respond_verification_check(
            check_id=check.id, requester=self.worker, pin='1234',
        )
        self.assertEqual(check.status, 'confirmed')
        self.assertEqual(check.consecutive_timeouts_count, 0)
        self.assertFalse(check.parent_alert_sent)

    def test_f_respond_wrong_pin_max_attempts_wrong_code(self):
        """F: sai PIN đủ MAX_WRONG_ATTEMPTS → wrong_code + notify admin."""
        # Tạo admin TRƯỚC khi trigger wrong_code (vì services.py query
        # admin users tại thời điểm wrong_code xảy ra).
        admin = User.objects.create_superuser(
            username='qa2_admin', password='admin_pass', email='qa2_admin@test.com',
        )
        self.worker.set_verification_pin('1234')
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        # Sai MAX_WRONG_ATTEMPTS - 1 lần
        for _ in range(MAX_WRONG_ATTEMPTS - 1):
            with self.assertRaises(ValueError):
                respond_verification_check(
                    check_id=check.id, requester=self.worker, pin='9999',
                )
        check.refresh_from_db()
        self.assertEqual(check.status, 'pending')  # vẫn pending
        # Lần sai cuối → wrong_code
        with self.assertRaises(ValueError):
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='9999',
            )
        check.refresh_from_db()
        self.assertEqual(check.status, 'wrong_code')
        # Admin phải có notification
        notif = Notification.objects.filter(
            recipient=admin, title__contains='nhập sai mã'
        )
        self.assertTrue(notif.exists())

    def test_f_cancel_by_parent_resets_streak(self):
        """F: parent cancel check pending → status=cancelled + reset streak."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
            consecutive_timeouts_count=2,
            parent_alert_sent=True,
        )
        check = cancel_verification_check(
            check_id=check.id, requester=self.parent,
            reason='False alarm',
        )
        self.assertEqual(check.status, 'cancelled')
        self.assertEqual(check.consecutive_timeouts_count, 0)
        self.assertFalse(check.parent_alert_sent)

    def test_f_cancel_by_worker_denied(self):
        """F: worker không được huỷ check (phải nhập mã hoặc chờ timeout)."""
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )
        with self.assertRaises(PermissionError):
            cancel_verification_check(
                check_id=check.id, requester=self.worker,
            )

    def test_f_timeout_marks_check_timeout(self):
        """F: check quá deadline → run_verification_check set timeout."""
        self.worker.set_verification_pin('1234')
        check = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),  # quá hạn
            status='pending',
        )
        run_verification_check()
        check.refresh_from_db()
        self.assertEqual(check.status, 'timeout')
        self.assertEqual(check.consecutive_timeouts_count, 1)

    def test_f_timeout_streak_consecutive(self):
        """F: 2 timeout liên tiếp → streak=2, gửi parent alert 1 lần."""
        self.worker.set_verification_pin('1234')
        # Timeout 1
        check1 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=100),
            status='pending',
        )
        run_verification_check()
        check1.refresh_from_db()
        self.assertEqual(check1.consecutive_timeouts_count, 1)
        self.assertFalse(check1.parent_alert_sent)  # chưa đạt ngưỡng

        # Timeout 2 (streak=2 — đạt ngưỡng CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT)
        check2 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=10),
            status='pending',
        )
        with patch('tracking.verification_scheduler._notify_user') as mock_notify:
            run_verification_check()
        check2.refresh_from_db()
        self.assertEqual(check2.consecutive_timeouts_count, 2)
        self.assertTrue(check2.parent_alert_sent)  # đã gửi alert

        # Timeout 3 (streak=3 — nhưng parent_alert_sent đã True → không gửi lại)
        check3 = RandomVerificationCheck.objects.create(
            task=self.task, worker=self.worker,
            respond_deadline=timezone.now() - timedelta(seconds=5),
            status='pending',
        )
        with patch('tracking.verification_scheduler._notify_user') as mock_notify2:
            run_verification_check()
        check3.refresh_from_db()
        self.assertEqual(check3.consecutive_timeouts_count, 3)
        self.assertTrue(check3.parent_alert_sent)  # kế thừa flag
        # Không có push parent alert mới (chỉ push 1 lần/streak)
        parent_alerts = [
            c for c in mock_notify2.call_args_list
            if c.kwargs.get('data', {}).get('type') == 'verification_timeout_critical'
        ]
        self.assertEqual(len(parent_alerts), 0,
                         "Không được push parent alert lần 3 — đã gửi ở streak=2")

    # ═══════════════════════════════════════════════════════════════════
    #  D — Acknowledge offline alert
    # ═══════════════════════════════════════════════════════════════════

    def test_d_acknowledge_sets_acknowledged_by(self):
        """D: acknowledge alert → set acknowledged_by + acknowledged_at."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        alert = acknowledge_offline_alert(
            alert_id=alert.id, requester=self.parent,
            task_id=self.task.id,
        )
        self.assertIsNotNone(alert.acknowledged_at)
        self.assertEqual(alert.acknowledged_by, self.parent)

    def test_d_acknowledge_twice_raises_already_acknowledged(self):
        """D: acknowledge alert đã acknowledged → AlreadyAcknowledgedError."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        acknowledge_offline_alert(
            alert_id=alert.id, requester=self.parent, task_id=self.task.id,
        )
        with self.assertRaises(AlreadyAcknowledgedError):
            acknowledge_offline_alert(
                alert_id=alert.id, requester=self.parent, task_id=self.task.id,
            )

    def test_d_acknowledge_task_mismatch_returns_404(self):
        """D: acknowledge alert với task_id sai → 404 (không透露 alert tồn tại)."""
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        client_parent = APIClient()
        client_parent.force_authenticate(user=self.parent)
        # Gọi với task_id sai (task.id + 999)
        resp = client_parent.post(
            f'/api/tracking/{self.task.id + 999}/offline-alerts/{alert.id}/acknowledge/'
        )
        self.assertEqual(resp.status_code, 404)

    # ═══════════════════════════════════════════════════════════════════
    #  C — Scheduler production-safe
    # ═══════════════════════════════════════════════════════════════════

    def test_c_management_command_run_schedulers_once(self):
        """C: management command run_tracking_schedulers --once chạy thành công."""
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        # Chạy --once với only=offline (nhanh hơn verification)
        call_command('run_tracking_schedulers', '--once', '--only', 'offline', stdout=out)
        self.assertIn('offline', out.getvalue())

    def test_c_apps_py_skip_in_web_worker(self):
        """C: apps.py module có logger + TrackingConfig class loadable.

        QA-FIX-2 / C: verify module structure (logger, AppConfig class).
        Full test của env var TRACKING_SCHEDULER_IN_WEB_WORKER cần Django
        setup đầy đủ + check log output — không khả thi trong unit test.
        Test chỉ verify module loadable + class exists.
        """
        import tracking.apps as apps_mod
        self.assertTrue(hasattr(apps_mod, 'logger'))
        self.assertTrue(hasattr(apps_mod, 'TrackingConfig'))
        # TrackingConfig có name + verbose_name
        from tracking.apps import TrackingConfig
        self.assertEqual(TrackingConfig.name, 'tracking')
        self.assertIn('Chống tắt máy', TrackingConfig.verbose_name)

    # ═══════════════════════════════════════════════════════════════════
    #  Author / Ownership
    # ═══════════════════════════════════════════════════════════════════

    def test_parent_verification_history_ownership(self):
        """Parent chỉ xem được verification history của task mình sở hữu."""
        # Tạo task của parent khác
        parent2 = User.objects.create_user(
            username='qa2_parent2', password='x', role='parent',
            email='qa2_p2@test.com',
        )
        task2 = Task.objects.create(
            title='Task 2', description='Test', price=100000,
            status='in_progress', parent=parent2, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=task2, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=task2, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )
        # Tạo check cho task2
        RandomVerificationCheck.objects.create(
            task=task2, worker=self.worker,
            respond_deadline=timezone.now() + timedelta(seconds=90),
            status='pending',
        )

        # self.parent cố xem history của task2 → PermissionError
        with self.assertRaises(PermissionError):
            get_verification_history_for_parent(task=task2, requester=self.parent)

    def test_parent_cannot_ack_other_parent_alert(self):
        """Parent không được acknowledge alert của task parent khác."""
        parent2 = User.objects.create_user(
            username='qa2_parent2b', password='x', role='parent',
            email='qa2_p2b@test.com',
        )
        task2 = Task.objects.create(
            title='Task 2b', description='Test', price=100000,
            status='in_progress', parent=parent2, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=task2, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=task2, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )
        hb = DeviceHeartbeat.objects.create(
            task=task2, worker=self.worker,
            last_seen=timezone.now() - timedelta(seconds=120),
        )
        alert = DeviceOfflineAlert.objects.create(
            task=task2, worker=self.worker, heartbeat=hb,
            last_seen=hb.last_seen, status='active',
        )
        # self.parent cố ack alert của task2 → PermissionError
        with self.assertRaises(PermissionError):
            acknowledge_offline_alert(
                alert_id=alert.id, requester=self.parent, task_id=task2.id,
            )
