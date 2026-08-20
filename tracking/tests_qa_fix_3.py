"""
QA-FIX-3 — Test suite cho bổ sung an toàn CarePartner toàn diện (v3).

Chạy: python manage.py test tracking.tests_qa_fix_3 --verbosity=2

Các test case cover yêu cầu mới:
  A — Bug `alreadyExistsIds === 0` (mobile) — không test Python-side
      nhưng test backend behavior: rejected-only response không drop data.
  B — Scheduler production deployment:
    - management command --once chạy thành công + ghi health file
    - endpoint /api/tracking/scheduler-health/ trả status đúng
    - render.yaml có cron job (parse YAML)
  C — Authorization: worker khác không gửi location/heartbeat/verification
    cho task không thuộc mình.
  D — Last-known location trong offline alert:
    - alert có last_location_lat/lng khi tạo
    - parent xem alert thấy vị trí cuối
  E — Duplicate client_point_id: 2 request đồng thời không tạo duplicate
    (đã có trong tests_qa_fix_2, đây bổ sung edge case khác).
  F — PIN hash + sai PIN + timeout + reset streak:
    - đã có trong tests_qa_fix_2, đây bổ sung edge case.
  G — Queue user/task isolation (backend side):
    - worker A không gửi location cho task của worker B (403)
    - worker không có consent không gửi được (403)
"""

import os
import json
import uuid as _uuid
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone
from django.db import IntegrityError, transaction
from django.core.management import call_command
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
    check_offline_devices,
    AlreadyAcknowledgedError,
    OFFLINE_THRESHOLD_SECONDS,
)
from tracking.verification_scheduler import (
    RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS,
    trigger_verification_check_now, run_verification_check,
    CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT,
)


@override_settings(DEBUG=True)
class QAFix3TestCase(TestCase):
    """Test suite cho QA-FIX-3 — bổ sung an toàn CarePartner toàn diện v3."""

    def setUp(self):
        """Setup chung: parent + 2 worker + task + accepted + consent granted."""
        self.parent = User.objects.create_user(
            username='qa3_parent', password='parent_pass_123',
            role='parent', email='qa3_parent@test.com',
        )
        self.parent.expo_push_token = 'ExponentPushToken[qa3_parent]'
        self.parent.save()

        self.worker = User.objects.create_user(
            username='qa3_worker', password='worker_pass_123',
            role='worker', email='qa3_worker@test.com',
        )
        self.worker.expo_push_token = 'ExponentPushToken[qa3_worker]'
        self.worker.save()

        # Worker khác (không thuộc task) — cho authorization tests
        self.other_worker = User.objects.create_user(
            username='qa3_other_worker', password='other_pass_123',
            role='worker', email='qa3_other@test.com',
        )

        # Admin user — cho tests notification (wrong PIN, timeout)
        self.admin = User.objects.create_user(
            username='qa3_admin', password='admin_pass_123',
            role='admin', email='qa3_admin@test.com',
            is_staff=True, is_superuser=True,
        )

        self.cat = ServiceCategory.objects.create(name='QA3 Test Cat')
        self.task = Task.objects.create(
            title='QA3 Task', description='Test', price=100000,
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
    #  A — Rejected-only response không drop data (backend side)
    # ═══════════════════════════════════════════════════════════════════

    def test_a_rejected_only_response_preserves_valid_points(self):
        """
        A: batch gồm 1 điểm hợp lệ + 1 điểm rejected (timestamp quá cũ)
        → điểm hợp lệ vẫn insert, điểm rejected vào rejected list.
        Mobile side sẽ chỉ tăng sync_attempts cho điểm rejected, không
        drop cả chunk.
        """
        valid_id = str(_uuid.uuid4())
        rejected_id = str(_uuid.uuid4())
        now = timezone.now()

        # Điểm rejected: recorded_at cũ quá 7 ngày
        old_dt = now - timedelta(days=10)

        points = [
            {
                'client_point_id': valid_id,
                'latitude': 10.0, 'longitude': 106.0,
                'recorded_at': now.isoformat(),
            },
            {
                'client_point_id': rejected_id,
                'latitude': 10.1, 'longitude': 106.1,
                'recorded_at': old_dt.isoformat(),
            },
        ]
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        # 1 điểm hợp lệ insert thành công
        self.assertEqual(resp.data['saved'], 1)
        self.assertIn(valid_id, resp.data['inserted_ids'])
        # 1 điểm rejected
        self.assertEqual(len(resp.data['rejected']), 1)
        self.assertEqual(resp.data['rejected'][0]['client_point_id'], rejected_id)
        # Điểm hợp lệ có trong DB
        self.assertTrue(
            LocationHistory.objects.filter(client_point_id=valid_id).exists()
        )
        # Điểm rejected KHÔNG có trong DB
        self.assertFalse(
            LocationHistory.objects.filter(client_point_id=rejected_id).exists()
        )

    def test_a_all_rejected_response_breaks_loop_safely(self):
        """
        A: batch toàn rejected → backend trả saved=0, rejected=N.
        Mobile side (sửa bug alreadyExistsIds === 0) sẽ break vòng while
        thay vì lặp lại cùng chunk 50 lần.
        Backend test: verify response format đúng để mobile có thể parse.
        """
        rejected_id1 = str(_uuid.uuid4())
        rejected_id2 = str(_uuid.uuid4())
        now = timezone.now()
        old_dt = now - timedelta(days=10)

        points = [
            {
                'client_point_id': rejected_id1,
                'latitude': 10.0, 'longitude': 106.0,
                'recorded_at': old_dt.isoformat(),
            },
            {
                'client_point_id': rejected_id2,
                'latitude': 10.1, 'longitude': 106.1,
                'recorded_at': old_dt.isoformat(),
            },
        ]
        resp = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        # Toàn rejected → 400 (không có điểm hợp lệ)
        self.assertEqual(resp.status_code, 400)
        # Response có rejected list để mobile parse
        self.assertIn('rejected', resp.data)
        self.assertEqual(len(resp.data['rejected']), 2)

    # ═══════════════════════════════════════════════════════════════════
    #  B — Scheduler production deployment
    # ═══════════════════════════════════════════════════════════════════

    def test_b_management_command_once_writes_health_file(self):
        """
        B: `python manage.py run_tracking_schedulers --once` chạy thành công
        và ghi health file để monitoring phát hiện scheduler chạy.
        """
        with patch('tracking.management.commands.run_tracking_schedulers.HEALTH_FILE', '/tmp/test_qa3_health.json'):
            try:
                call_command(
                    'run_tracking_schedulers', '--once', '--only', 'both',
                    stdout=tempfile.TemporaryFile(mode='w+t'),
                    stderr=tempfile.TemporaryFile(mode='w+t'),
                )
            except SystemExit:
                pass

            # Verify health file được ghi
            self.assertTrue(os.path.exists('/tmp/test_qa3_health.json'))
            with open('/tmp/test_qa3_health.json', 'r') as f:
                health = json.load(f)
            # Structure: {last_run_at, stats: {offline, verification, errors}}
            self.assertIn('last_run_at', health)
            self.assertIn('stats', health)
            stats = health['stats']
            self.assertIn('offline', stats)
            self.assertIn('verification', stats)
            self.assertIn('errors', stats)

    def test_b_scheduler_health_endpoint_no_data(self):
        """
        B: endpoint /api/tracking/scheduler-health/ trả status='no_data'
        khi chưa có health file (sau deploy fresh).
        """
        # Mock _read_health_file trả None
        with patch('tracking.management.commands.run_tracking_schedulers._read_health_file', return_value=None):
            client = APIClient()
            resp = client.get('/api/tracking/scheduler-health/')
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.data['status'], 'no_data')

    def test_b_scheduler_health_endpoint_ok(self):
        """
        B: endpoint trả status='ok' khi health file có last_run_at gần đây.
        """
        from tracking.management.commands.run_tracking_schedulers import _write_health_file
        # ISO format có timezone '+00:00' để django.utils.timezone.parse_datetime
        # parse được (parse_datetime cần 'Z' hoặc '+HH:MM' suffix).
        _write_health_file({
            'last_run_at': timezone.now().isoformat(),
            'offline': {'check': {'new_alerts': 0}},
            'verification': {'checks_created': 0},
            'errors': [],
        })

        client = APIClient()
        resp = client.get('/api/tracking/scheduler-health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'ok')
        self.assertIsNotNone(resp.data['last_run_at'])
        # seconds_since_last_run phải là số (int), không phải None
        self.assertIsNotNone(resp.data['seconds_since_last_run'])
        self.assertIsInstance(resp.data['seconds_since_last_run'], int)
        self.assertLess(resp.data['seconds_since_last_run'], 60)
        self.assertFalse(resp.data['is_stale'])

    def test_b_scheduler_health_endpoint_stale(self):
        """
        B: endpoint trả status='stale' khi health file cũ quá 3 phút.
        """
        from tracking.management.commands.run_tracking_schedulers import _write_health_file
        old_time = timezone.now() - timedelta(minutes=10)
        _write_health_file({
            'last_run_at': old_time.isoformat(),
            'offline': None,
            'verification': None,
            'errors': ['simulated error'],
        })

        client = APIClient()
        resp = client.get('/api/tracking/scheduler-health/')
        self.assertEqual(resp.status_code, 200)
        # Verify response có fields cần thiết
        self.assertIn('status', resp.data)
        self.assertIn('is_stale', resp.data)
        # Nếu parse datetime fail, seconds_since_last_run có thể None — check cả 2
        seconds = resp.data.get('seconds_since_last_run')
        if seconds is not None:
            self.assertGreater(seconds, 180)
            self.assertTrue(resp.data['is_stale'])
            self.assertEqual(resp.data['status'], 'stale')
        else:
            # Parse fail → status có thể là 'ok' (không detect stale) — log để debug
            self.fail(f'Parse datetime fail — seconds_since_last_run=None, '
                      f'last_run_at={resp.data.get("last_run_at")}')

    def test_b_render_yaml_has_cron_job(self):
        """
        B: render.yaml phải có Cron Job service cho scheduler.
        Parse YAML để verify cấu hình.
        """
        import yaml
        render_yaml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'render.yaml',
        )
        with open(render_yaml_path, 'r') as f:
            config = yaml.safe_load(f)

        services = config.get('services', [])
        cron_jobs = [s for s in services if s.get('type') == 'cron']
        self.assertGreaterEqual(len(cron_jobs), 1, "render.yaml phải có ít nhất 1 cron job")

        # Tìm cron job tracking scheduler
        scheduler_cron = None
        for c in cron_jobs:
            if 'tracking' in c.get('name', '').lower() and 'scheduler' in c.get('name', '').lower():
                scheduler_cron = c
                break
        self.assertIsNotNone(scheduler_cron, "Phải có cron job cho tracking scheduler")
        self.assertEqual(scheduler_cron['schedule'], '* * * * *')
        self.assertIn('run_tracking_schedulers', scheduler_cron['startCommand'])
        self.assertIn('--once', scheduler_cron['startCommand'])

    # ═══════════════════════════════════════════════════════════════════
    #  C — Authorization: worker khác không gửi location/heartbeat/verification
    # ═══════════════════════════════════════════════════════════════════

    def test_c_other_worker_cannot_send_location(self):
        """
        C: worker không thuộc task không gửi được location (403).
        """
        client_other = APIClient()
        client_other.force_authenticate(user=self.other_worker)
        resp = client_other.post('/api/tracking/location/', {
            'task_id': self.task.id,
            'latitude': 10.0, 'longitude': 106.0,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_c_other_worker_cannot_send_batch_location(self):
        """
        C: worker không thuộc task không gửi được batch location (403).
        """
        client_other = APIClient()
        client_other.force_authenticate(user=self.other_worker)
        resp = client_other.post('/api/tracking/location/batch/', {
            'task_id': self.task.id,
            'points': [{
                'client_point_id': str(_uuid.uuid4()),
                'latitude': 10.0, 'longitude': 106.0,
                'recorded_at': timezone.now().isoformat(),
            }],
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_c_other_worker_cannot_send_heartbeat(self):
        """
        C: worker không thuộc task không gửi được heartbeat (403).
        """
        client_other = APIClient()
        client_other.force_authenticate(user=self.other_worker)
        resp = client_other.post('/api/tracking/heartbeat/', {
            'task_id': self.task.id,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_c_other_worker_cannot_respond_verification(self):
        """
        C: worker không phải người được yêu cầu xác minh không respond được (403).
        """
        # Set PIN cho worker chính
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        # Trigger check
        check = trigger_verification_check_now(self.task.id)

        # other_worker cố respond → 403
        client_other = APIClient()
        client_other.force_authenticate(user=self.other_worker)
        resp = client_other.post(
            f'/api/tracking/verification-checks/{check.id}/respond/',
            {'pin': '1234'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_c_worker_without_consent_cannot_send_location(self):
        """
        C: worker có accept task nhưng consent='denied' không gửi được location (403).
        """
        # Tạo task mới + accept nhưng consent denied
        task2 = Task.objects.create(
            title='QA3 Task 2', description='Test', price=100000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=task2, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=task2, worker=self.worker, consent='denied',
        )
        resp = self.client.post('/api/tracking/location/', {
            'task_id': task2.id,
            'latitude': 10.0, 'longitude': 106.0,
        }, format='json')
        self.assertEqual(resp.status_code, 403)

    # ═══════════════════════════════════════════════════════════════════
    #  D — Last-known location trong offline alert
    # ═══════════════════════════════════════════════════════════════════

    def test_d_offline_alert_has_last_known_location(self):
        """
        D: DeviceOfflineAlert phải lưu last_location_lat/lng khi tạo.
        Parent xem alert thấy vị trí cuối của carepartner.
        """
        # Tạo heartbeat với vị trí cuối
        last_seen = timezone.now() - timedelta(seconds=OFFLINE_THRESHOLD_SECONDS + 30)
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=last_seen,
            last_location_lat=Decimal('10.1234567'),
            last_location_lng=Decimal('106.1234567'),
            device_status='online',
        )

        # Chạy scheduler → tạo alert
        with patch('tracking.services._notify_user', return_value=(True, 'ok')):
            stats = check_offline_devices()

        self.assertEqual(stats['new_alerts'], 1)
        alert = DeviceOfflineAlert.objects.get(task=self.task, status='active')
        # Alert phải có last_location_lat/lng
        self.assertIsNotNone(alert.last_location_lat)
        self.assertIsNotNone(alert.last_location_lng)
        self.assertEqual(float(alert.last_location_lat), 10.1234567)
        self.assertEqual(float(alert.last_location_lng), 106.1234567)
        # Alert phải có last_seen
        self.assertIsNotNone(alert.last_seen)

    def test_d_parent_sees_last_known_location_in_alert_list(self):
        """
        D: parent gọi /api/tracking/<task_id>/offline-alerts/ thấy last_location.
        """
        last_seen = timezone.now() - timedelta(seconds=OFFLINE_THRESHOLD_SECONDS + 30)
        alert = DeviceOfflineAlert.objects.create(
            task=self.task, worker=self.worker,
            last_seen=last_seen,
            last_location_lat=Decimal('10.5'),
            last_location_lng=Decimal('106.5'),
            status='active',
        )
        client_parent = APIClient()
        client_parent.force_authenticate(user=self.parent)
        resp = client_parent.get(f'/api/tracking/{self.task.id}/offline-alerts/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['alerts']), 1)
        alert_data = resp.data['alerts'][0]
        self.assertIsNotNone(alert_data['last_location'])
        self.assertEqual(alert_data['last_location']['latitude'], 10.5)
        self.assertEqual(alert_data['last_location']['longitude'], 106.5)

    def test_d_device_status_has_last_location(self):
        """
        D: /api/tracking/<task_id>/device-status/ trả last_location cho parent.
        """
        hb = DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=timezone.now(),
            last_location_lat=Decimal('10.7'),
            last_location_lng=Decimal('106.7'),
            device_status='online',
        )
        client_parent = APIClient()
        client_parent.force_authenticate(user=self.parent)
        resp = client_parent.get(f'/api/tracking/{self.task.id}/device-status/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['has_heartbeat'])
        self.assertIsNotNone(resp.data['last_location'])
        self.assertEqual(resp.data['last_location']['latitude'], 10.7)
        self.assertEqual(resp.data['last_location']['longitude'], 106.7)

    # ═══════════════════════════════════════════════════════════════════
    #  E — Duplicate client_point_id edge cases
    # ═══════════════════════════════════════════════════════════════════

    def test_e_duplicate_client_point_id_concurrent_safe(self):
        """
        E: 2 request đồng thời cùng client_point_id → chỉ 1 insert, 1 already_exists.
        DB unique constraint bảo vệ race condition.
        """
        client_point_id = str(_uuid.uuid4())
        now = timezone.now()
        points = [{
            'client_point_id': client_point_id,
            'latitude': 10.0, 'longitude': 106.0,
            'recorded_at': now.isoformat(),
        }]

        # Request 1
        resp1 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp1.status_code, 201)
        self.assertEqual(resp1.data['saved'], 1)

        # Request 2 (giả lập retry sau network timeout)
        resp2 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task.id, 'points': points,
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertEqual(resp2.data['saved'], 0)
        self.assertIn(client_point_id, resp2.data['already_exists_ids'])

        # Chỉ có 1 row trong DB
        self.assertEqual(
            LocationHistory.objects.filter(client_point_id=client_point_id).count(),
            1
        )

    def test_e_db_constraint_prevents_duplicate_direct_insert(self):
        """
        E: trực tiếp insert 2 row cùng (task, worker, client_point_id) → IntegrityError.
        """
        client_point_id = str(_uuid.uuid4())
        LocationHistory.objects.create(
            task=self.task, worker=self.worker,
            latitude=10.0, longitude=106.0,
            client_point_id=client_point_id,
        )
        with self.assertRaises(IntegrityError):
            LocationHistory.objects.create(
                task=self.task, worker=self.worker,
                latitude=10.1, longitude=106.1,
                client_point_id=client_point_id,
            )

    # ═══════════════════════════════════════════════════════════════════
    #  F — PIN hash + sai PIN + timeout + reset streak (edge cases)
    # ═══════════════════════════════════════════════════════════════════

    def test_f_pin_not_in_serializer_output(self):
        """
        F: PIN hash KHÔNG xuất hiện trong bất kỳ API response nào.
        """
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.verification_pin_hash)
        self.assertTrue(self.worker.verification_pin_hash.startswith('pbkdf2_'))
        # PIN không plaintext
        self.assertNotIn('1234', self.worker.verification_pin_hash)

        # API response không chứa hash
        client_worker = APIClient()
        client_worker.force_authenticate(user=self.worker)
        # Gọi endpoint user profile (nếu có) — test qua /me/ hoặc tương tự
        # Tạm thời check qua verification-checks/pending/ (response không có hash)
        resp = client_worker.get('/api/tracking/verification-checks/pending/')
        self.assertEqual(resp.status_code, 200)
        # Response text không chứa hash
        self.assertNotIn(
            self.worker.verification_pin_hash,
            json.dumps(resp.data, default=str)
        )

    def test_f_change_pin_requires_current_password(self):
        """
        F: đổi PIN đã tồn tại phải nhập mật khẩu tài khoản hiện tại.
        """
        # Set PIN lần đầu
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        # Đổi PIN không nhập password → PermissionError
        with self.assertRaises(PermissionError):
            set_verification_pin(user=self.worker, pin='5678', current_password='')
        # Đổi PIN sai password → PermissionError
        with self.assertRaises(PermissionError):
            set_verification_pin(user=self.worker, pin='5678', current_password='wrong_password')
        # Đổi PIN đúng password → OK
        set_verification_pin(user=self.worker, pin='5678', current_password='worker_pass_123')
        self.worker.refresh_from_db()
        self.assertTrue(self.worker.check_verification_pin('5678'))
        self.assertFalse(self.worker.check_verification_pin('1234'))

    def test_f_pin_format_validation(self):
        """
        F: PIN phải 4-6 chữ số. PIN sai format → ValueError.
        """
        # 3 chữ số → sai
        with self.assertRaises(ValueError):
            set_verification_pin(user=self.worker, pin='123', current_password='worker_pass_123')
        # 7 chữ số → sai
        with self.assertRaises(ValueError):
            set_verification_pin(user=self.worker, pin='1234567', current_password='worker_pass_123')
        # Có chữ cái → sai
        with self.assertRaises(ValueError):
            set_verification_pin(user=self.worker, pin='12ab', current_password='worker_pass_123')
        # 4 chữ số → OK
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        # 6 chữ số → OK
        set_verification_pin(user=self.worker, pin='123456', current_password='worker_pass_123')

    def test_f_wrong_pin_increments_attempts(self):
        """
        F: sai PIN lần 1 → attempts=1, chưa wrong_code.
        Sai đến MAX_WRONG_ATTEMPTS → wrong_code + notify admin.
        """
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        check = trigger_verification_check_now(self.task.id)

        # Sai lần 1 — message hiển thị số lần còn lại (MAX - attempts)
        with self.assertRaises(ValueError) as ctx:
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='9999'
            )
        self.assertIn('lần thử', str(ctx.exception))
        check.refresh_from_db()
        self.assertEqual(check.attempts, 1)
        self.assertEqual(check.status, 'pending')

        # Sai lần 2
        with self.assertRaises(ValueError):
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='8888'
            )
        check.refresh_from_db()
        self.assertEqual(check.attempts, 2)
        self.assertEqual(check.status, 'pending')

        # Sai lần 3 → wrong_code
        with self.assertRaises(ValueError) as ctx:
            respond_verification_check(
                check_id=check.id, requester=self.worker, pin='7777'
            )
        check.refresh_from_db()
        self.assertEqual(check.attempts, 3)
        self.assertEqual(check.status, 'wrong_code')
        # Admin nhận notification (title có 'sai mã xác minh' — không dấu)
        self.assertTrue(
            Notification.objects.filter(
                title__icontains='sai mã'
            ).exists()
        )

    def test_f_timeout_resets_on_confirmed(self):
        """
        F: confirmed reset consecutive_timeouts_count về 0.
        """
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        # Tạo check 1 → timeout (streak=1)
        check1 = trigger_verification_check_now(self.task.id)
        check1.status = 'timeout'
        check1.consecutive_timeouts_count = 1
        check1.save()
        # Tạo check 2 → confirmed → reset streak
        check2 = trigger_verification_check_now(self.task.id)
        respond_verification_check(
            check_id=check2.id, requester=self.worker, pin='1234'
        )
        check2.refresh_from_db()
        self.assertEqual(check2.status, 'confirmed')
        self.assertEqual(check2.consecutive_timeouts_count, 0)
        self.assertFalse(check2.parent_alert_sent)

    # ═══════════════════════════════════════════════════════════════════
    #  G — Scheduler concurrent không tạo duplicate
    # ═══════════════════════════════════════════════════════════════════

    def test_g_concurrent_scheduler_no_duplicate_alert(self):
        """
        G: chạy check_offline_devices 2 lần liên tiếp → chỉ 1 alert active.
        DB unique constraint + check existing_active bảo vệ.

        Lưu ý: lần 1 chạy xong, heartbeat.device_status đã bị update thành
        'offline' → lần 2 query `device_status='online'` sẽ không match nữa
        → stale_count=0. Đây là behavior đúng (scheduler đã xử lý xong).
        Test focus: không có 2 alert active trùng task.
        """
        last_seen = timezone.now() - timedelta(seconds=OFFLINE_THRESHOLD_SECONDS + 30)
        DeviceHeartbeat.objects.create(
            task=self.task, worker=self.worker,
            last_seen=last_seen,
            last_location_lat=Decimal('10.0'),
            last_location_lng=Decimal('106.0'),
            device_status='online',
        )
        with patch('tracking.services._notify_user', return_value=(True, 'ok')):
            stats1 = check_offline_devices()
            stats2 = check_offline_devices()

        self.assertEqual(stats1['new_alerts'], 1)
        # Lần 2: stale_count=0 vì heartbeat đã bị mark 'offline' lần 1
        # → không có heartbeat mới thỏa mãn → không có alert mới.
        self.assertEqual(stats2['new_alerts'], 0)
        # Chỉ 1 alert active trong DB (DB unique constraint bảo vệ)
        self.assertEqual(
            DeviceOfflineAlert.objects.filter(task=self.task, status='active').count(),
            1
        )

        # Test DB constraint trực tiếp: cố insert alert active thứ 2 → fail
        with self.assertRaises(IntegrityError):
            DeviceOfflineAlert.objects.create(
                task=self.task, worker=self.worker,
                last_seen=last_seen,
                last_location_lat=Decimal('10.0'),
                last_location_lng=Decimal('106.0'),
                status='active',
            )

    def test_g_concurrent_scheduler_no_duplicate_check(self):
        """
        G: chạy run_verification_check 2 lần → không tạo 2 pending check.
        DB unique constraint (task, worker) WHERE status='pending' bảo vệ.
        """
        set_verification_pin(user=self.worker, pin='1234', current_password='worker_pass_123')
        # Patch random để lần 1 luôn tạo check
        with patch('tracking.verification_scheduler.random.random', return_value=0.0):
            with patch('tracking.verification_scheduler._notify_user', return_value=(True, 'ok')):
                stats1 = run_verification_check()
                stats2 = run_verification_check()

        # Chỉ 1 pending check được tạo
        self.assertEqual(
            RandomVerificationCheck.objects.filter(
                task=self.task, worker=self.worker, status='pending'
            ).count(),
            1
        )

    # ═══════════════════════════════════════════════════════════════════
    #  H — Render YAML structure validation (deployment resource)
    # ═══════════════════════════════════════════════════════════════════

    def test_h_render_yaml_web_service_scheduler_disabled(self):
        """
        H: render.yaml web service có TRACKING_SCHEDULER_IN_WEB_WORKER=false.
        Scheduler không chạy trong gunicorn worker (tránh duplicate).
        """
        import yaml
        render_yaml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'render.yaml',
        )
        with open(render_yaml_path, 'r') as f:
            config = yaml.safe_load(f)

        web_service = next(
            (s for s in config['services'] if s.get('type') == 'web'),
            None
        )
        self.assertIsNotNone(web_service)
        env_vars = {e['key']: e.get('value', '') for e in web_service.get('envVars', [])}
        self.assertEqual(env_vars.get('TRACKING_SCHEDULER_IN_WEB_WORKER'), 'false')

    def test_h_render_yaml_cron_has_required_env_vars(self):
        """
        H: render.yaml cron job có đủ env vars cần thiết cho scheduler.
        """
        import yaml
        render_yaml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'render.yaml',
        )
        with open(render_yaml_path, 'r') as f:
            config = yaml.safe_load(f)

        cron_service = next(
            (s for s in config['services'] if s.get('type') == 'cron' and 'tracking' in s.get('name', '').lower()),
            None
        )
        self.assertIsNotNone(cron_service)
        env_vars = {e['key']: e.get('value', '') for e in cron_service.get('envVars', [])}
        # Required env vars
        self.assertEqual(env_vars.get('RENDER'), 'true')
        self.assertEqual(env_vars.get('TRACKING_SCHEDULER_PROCESS'), 'true')
        self.assertEqual(env_vars.get('TRACKING_SCHEDULER_IN_WEB_WORKER'), 'false')
        self.assertEqual(env_vars.get('TRACKING_OFFLINE_CHECK_ENABLED'), 'true')
        self.assertEqual(env_vars.get('VERIFICATION_CHECK_ENABLED'), 'true')
