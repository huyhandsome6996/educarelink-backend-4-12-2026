"""
QA-FIX-5 — Test suite cho 3 bug QA phát hiện sau commit 9747188 (QA-FIX-4).

Chạy: python manage.py test tracking.tests_qa_fix_5 --verbosity=2

Các test case cover:
  H1 — High bug: backend side của "trộn vị trí giữa 2 task cùng user".
       Mobile side (flushOfflineQueue) đã fix bằng flush theo từng task.
       Backend test: mỗi request batch chỉ chứa điểm của 1 task — điểm
       thuộc task B gửi kèm task_id=A sẽ bị backend reject vì client_point_id
       không khớp với task_id trong unique constraint.
       Tuy nhiên backend hiện tại không có thông tin task gốc của từng point
       → cần fix backend để thêm field `task_id` per-point (optional) cho
       batch API. Hoặc verify rằng 2 task cùng user có thể được insert với
       client_point_id khác nhau mà không xung đột.

  M2 — Medium bug: SchedulerHealth DB-based persistence.
       - record_run() tạo/singleton update đúng.
       - endpoint /api/tracking/scheduler-health/ đọc từ DB trước, fallback
         /tmp file.
       - status='ok' khi last_run_at gần đây, 'stale' khi cũ, 'no_data' khi
         chưa có row.

  M3 — Medium bug: check_scheduler_env fail-fast khi thiếu SECRET_KEY/DATABASE_URL.
       - command exit 1 khi thiếu env var.
       - command exit 0 khi đủ env var.

  H1_backend — Backend regression: 2 task cùng worker, mỗi task có
       LocationHistory riêng — không bị trộn. Đây là safety net cho bug H1
       mobile side: ngay cả khi mobile gửi nhầm, backend unique constraint
       trên (task, worker, client_point_id) đảm bảo không insert trùng.
"""

import os
import json
import uuid as _uuid
import tempfile
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.management import call_command
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication
from tracking.models import (
    LocationConsent, LiveLocation, LocationHistory,
    DeviceHeartbeat, DeviceOfflineAlert, RandomVerificationCheck,
    SchedulerHealth,
)


@override_settings(DEBUG=True)
class QAFix5H1TestCase(TestCase):
    """
    H1 (High): 2 task cùng worker — queue offline phải tách theo task_id,
    không trộn điểm của 2 task vào cùng 1 batch request.

    Test backend side:
      - 2 task cùng worker, đều in_progress + consent granted.
      - Worker gửi batch cho task A với 2 điểm (client_point_id khác nhau).
      - Worker gửi batch cho task B với 2 điểm.
      - Verify: 4 LocationHistory row, 2 thuộc task A, 2 thuộc task B.
      - Verify: client_point_id unique per (task, worker) — 2 task có thể
        dùng cùng client_point_id mà không xung đột (constraint chỉ áp dụng
        trong cùng task).
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='qa5_parent', password='parent_pass_123',
            role='parent', email='qa5_parent@test.com',
        )
        self.worker = User.objects.create_user(
            username='qa5_worker', password='worker_pass_123',
            role='worker', email='qa5_worker@test.com',
        )
        self.worker.expo_push_token = 'ExponentPushToken[qa5_worker]'
        self.worker.save()

        self.cat = ServiceCategory.objects.create(name='QA5 Test Cat')

        # Task A
        self.task_a = Task.objects.create(
            title='QA5 Task A', description='Test A', price=100000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task_a, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=self.task_a, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )

        # Task B (cùng worker, cùng parent)
        self.task_b = Task.objects.create(
            title='QA5 Task B', description='Test B', price=200000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.5, longitude=106.5,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task_b, worker=self.worker, status='accepted'
        )
        LocationConsent.objects.create(
            task=self.task_b, worker=self.worker, consent='granted',
            granted_at=timezone.now(),
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    def test_h1_two_tasks_separate_history(self):
        """
        H1: 2 task cùng worker → 2 LocationHistory riêng, không trộn.
        """
        now = timezone.now()
        # 2 điểm cho task A
        resp_a = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task_a.id,
            'points': [
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 10.0, 'longitude': 106.0,
                    'recorded_at': now.isoformat(),
                },
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 10.01, 'longitude': 106.01,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp_a.status_code, 201)
        self.assertEqual(resp_a.data['saved'], 2)

        # 2 điểm cho task B
        resp_b = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task_b.id,
            'points': [
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 10.5, 'longitude': 106.5,
                    'recorded_at': now.isoformat(),
                },
                {
                    'client_point_id': str(_uuid.uuid4()),
                    'latitude': 10.51, 'longitude': 106.51,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp_b.status_code, 201)
        self.assertEqual(resp_b.data['saved'], 2)

        # Verify: 4 row LocationHistory, 2 thuộc task A, 2 thuộc task B
        self.assertEqual(
            LocationHistory.objects.filter(task=self.task_a).count(), 2
        )
        self.assertEqual(
            LocationHistory.objects.filter(task=self.task_b).count(), 2
        )
        self.assertEqual(
            LocationHistory.objects.filter(worker=self.worker).count(), 4
        )

    def test_h1_same_client_point_id_different_tasks_no_conflict(self):
        """
        H1: 2 task khác nhau có thể dùng cùng client_point_id — unique
        constraint là (task, worker, client_point_id), không phải chỉ
        client_point_id. Mobile có thể (theo lý thuyết) tái sinh UUID,
        nhưng nếu thuộc 2 task khác nhau thì không xung đột.
        """
        now = timezone.now()
        shared_uuid = str(_uuid.uuid4())

        # Điểm cho task A với shared_uuid
        resp_a = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task_a.id,
            'points': [
                {
                    'client_point_id': shared_uuid,
                    'latitude': 10.0, 'longitude': 106.0,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp_a.status_code, 201)

        # Điểm cho task B với cùng shared_uuid → vẫn insert thành công
        # vì task_id khác.
        resp_b = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task_b.id,
            'points': [
                {
                    'client_point_id': shared_uuid,
                    'latitude': 10.5, 'longitude': 106.5,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp_b.status_code, 201)

        # Verify: 2 row, 1 thuộc task A, 1 thuộc task B, cùng client_point_id
        self.assertTrue(
            LocationHistory.objects.filter(
                task=self.task_a, client_point_id=shared_uuid
            ).exists()
        )
        self.assertTrue(
            LocationHistory.objects.filter(
                task=self.task_b, client_point_id=shared_uuid
            ).exists()
        )

    def test_h1_duplicate_client_point_id_same_task_rejected(self):
        """
        H1: cùng task + cùng client_point_id → insert lần 2 sẽ vào
        already_exists_ids (idempotent). Đây là safety net cho mobile
        retry — không tạo duplicate row trong cùng task.
        """
        now = timezone.now()
        point_uuid = str(_uuid.uuid4())

        # Lần 1 — insert thành công
        resp1 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task_a.id,
            'points': [
                {
                    'client_point_id': point_uuid,
                    'latitude': 10.0, 'longitude': 106.0,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp1.status_code, 201)
        self.assertIn(point_uuid, resp1.data['inserted_ids'])

        # Lần 2 — cùng client_point_id, cùng task → already_exists
        resp2 = self.client.post('/api/tracking/location/batch/', {
            'task_id': self.task_a.id,
            'points': [
                {
                    'client_point_id': point_uuid,
                    'latitude': 10.1, 'longitude': 106.1,
                    'recorded_at': now.isoformat(),
                },
            ],
        }, format='json')
        self.assertEqual(resp2.status_code, 201)
        self.assertIn(point_uuid, resp2.data['already_exists_ids'])
        self.assertEqual(resp2.data['saved'], 0)

        # Verify: chỉ 1 row trong DB (latitude 10.0 — lần insert đầu)
        rows = LocationHistory.objects.filter(
            task=self.task_a, client_point_id=point_uuid
        )
        self.assertEqual(rows.count(), 1)
        self.assertEqual(float(rows[0].latitude), 10.0)


@override_settings(DEBUG=True)
class QAFix5M2SchedulerHealthDBTestCase(TestCase):
    """
    M2 (Medium): SchedulerHealth DB-based persistence — ghi/đọc qua DB
    thay vì /tmp file (Render Cron và web service không chia sẻ /tmp).
    """

    def setUp(self):
        self.client = APIClient()

    def test_m2_singleton_get_or_create(self):
        """
        M2: get_singleton() trả về cùng row (id=1) qua nhiều lần gọi.
        """
        obj1 = SchedulerHealth.get_singleton()
        obj2 = SchedulerHealth.get_singleton()
        self.assertEqual(obj1.pk, 1)
        self.assertEqual(obj1.pk, obj2.pk)
        # Ban đầu last_run_at = None (chưa chạy scheduler)
        self.assertIsNone(obj1.last_run_at)

    def test_m2_record_run_creates_row(self):
        """
        M2: record_run() tạo singleton row với last_run_at + stats.
        """
        now = timezone.now()
        stats = {
            'offline': {'check': {'new_alerts': 1}},
            'verification': {'checks_created': 0},
            'errors': [],
        }
        obj = SchedulerHealth.record_run(
            last_run_at=now,
            source='cron',
            scheduler_kind='both',
            success=True,
            stats=stats,
            started_at=now,
            finished_at=now,
        )
        self.assertEqual(obj.pk, 1)
        self.assertEqual(obj.last_run_at, now)
        self.assertEqual(obj.source, 'cron')
        self.assertTrue(obj.success)
        self.assertEqual(obj.stats, stats)

    def test_m2_record_run_updates_existing_row(self):
        """
        M2: record_run() lần 2 update cùng row, không tạo row mới.
        """
        # Lần 1
        now1 = timezone.now()
        SchedulerHealth.record_run(
            last_run_at=now1, source='cron', scheduler_kind='both',
            success=True, stats={'errors': []},
        )
        self.assertEqual(SchedulerHealth.objects.count(), 1)

        # Lần 2 — update
        now2 = now1 + timedelta(minutes=1)
        SchedulerHealth.record_run(
            last_run_at=now2, source='daemon', scheduler_kind='both',
            success=False, error_message='test error',
            stats={'errors': ['test error']},
        )
        self.assertEqual(SchedulerHealth.objects.count(), 1)  # vẫn 1 row
        obj = SchedulerHealth.get_singleton()
        self.assertEqual(obj.last_run_at, now2)
        self.assertEqual(obj.source, 'daemon')
        self.assertFalse(obj.success)
        self.assertEqual(obj.error_message, 'test error')

    def test_m2_endpoint_reads_from_db_first(self):
        """
        M2: endpoint /api/tracking/scheduler-health/ đọc DB trước — trả
        status='ok' khi SchedulerHealth row có last_run_at gần đây.
        """
        # Xóa /tmp file để chắc chắn endpoint đọc DB
        from tracking.management.commands.run_tracking_schedulers import HEALTH_FILE
        try:
            os.remove(HEALTH_FILE)
        except Exception:
            pass

        now = timezone.now()
        SchedulerHealth.record_run(
            last_run_at=now,
            source='cron',
            scheduler_kind='both',
            success=True,
            stats={'offline': {'check': {'new_alerts': 0}}},
        )

        resp = self.client.get('/api/tracking/scheduler-health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'ok')
        self.assertEqual(resp.data['health_source'], 'db')
        self.assertIsNotNone(resp.data['last_run_at'])
        self.assertLess(resp.data['seconds_since_last_run'], 60)
        self.assertFalse(resp.data['is_stale'])

    def test_m2_endpoint_stale_when_db_old(self):
        """
        M2: endpoint trả status='stale' khi DB row có last_run_at cũ.
        """
        from tracking.management.commands.run_tracking_schedulers import HEALTH_FILE
        try:
            os.remove(HEALTH_FILE)
        except Exception:
            pass

        old_time = timezone.now() - timedelta(minutes=10)
        SchedulerHealth.record_run(
            last_run_at=old_time,
            source='cron',
            scheduler_kind='both',
            success=True,
            stats={},
        )

        resp = self.client.get('/api/tracking/scheduler-health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'stale')
        self.assertEqual(resp.data['health_source'], 'db')
        self.assertTrue(resp.data['is_stale'])
        self.assertGreater(resp.data['seconds_since_last_run'], 180)

    def test_m2_endpoint_no_data_when_db_empty_and_file_missing(self):
        """
        M2: endpoint trả status='no_data' khi chưa có DB row + /tmp file.
        """
        from tracking.management.commands.run_tracking_schedulers import HEALTH_FILE
        try:
            os.remove(HEALTH_FILE)
        except Exception:
            pass

        # Đảm bảo DB không có SchedulerHealth row
        SchedulerHealth.objects.all().delete()

        resp = self.client.get('/api/tracking/scheduler-health/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'no_data')
        self.assertEqual(resp.data['health_source'], 'none')

    def test_m2_endpoint_fallback_to_file_when_db_empty(self):
        """
        M2: endpoint fallback về /tmp file khi DB chưa có row
        (cho dev local + test chưa migrate SchedulerHealth).
        """
        from tracking.management.commands.run_tracking_schedulers import _write_health_file, HEALTH_FILE

        # Đảm bảo DB không có SchedulerHealth row
        SchedulerHealth.objects.all().delete()

        # Ghi /tmp file
        with patch(
            'tracking.management.commands.run_tracking_schedulers.HEALTH_FILE',
            '/tmp/test_qa5_health.json'
        ):
            _write_health_file({
                'last_run_at': timezone.now().isoformat(),
                'offline': {'check': {'new_alerts': 0}},
                'verification': {'checks_created': 0},
                'errors': [],
            })

            # Patch _read_health_file để trả file test
            from tracking.management.commands import run_tracking_schedulers as rts
            with patch.object(rts, '_read_health_file') as mock_read:
                with open('/tmp/test_qa5_health.json', 'r') as f:
                    mock_read.return_value = json.load(f)

                resp = self.client.get('/api/tracking/scheduler-health/')
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.data['health_source'], 'file')

            # Cleanup
            try:
                os.remove('/tmp/test_qa5_health.json')
            except Exception:
                pass

    def test_m2_management_command_writes_db_health(self):
        """
        M2: `python manage.py run_tracking_schedulers --once` ghi health
        vào DB (SchedulerHealth row) ngoài /tmp file.
        """
        # Đảm bảo DB sạch trước test
        SchedulerHealth.objects.all().delete()

        with patch(
            'tracking.management.commands.run_tracking_schedulers.HEALTH_FILE',
            '/tmp/test_qa5_cmd_health.json'
        ):
            try:
                call_command(
                    'run_tracking_schedulers', '--once', '--only', 'both',
                    stdout=tempfile.TemporaryFile(mode='w+t'),
                    stderr=tempfile.TemporaryFile(mode='w+t'),
                )
            except SystemExit:
                pass

            # Verify DB row được tạo
            self.assertTrue(SchedulerHealth.objects.filter(pk=1).exists())
            obj = SchedulerHealth.get_singleton()
            self.assertIsNotNone(obj.last_run_at)
            self.assertEqual(obj.source, 'cron')
            self.assertEqual(obj.scheduler_kind, 'both')
            # stats phải có keys offline + verification + errors
            self.assertIn('offline', obj.stats)
            self.assertIn('verification', obj.stats)
            self.assertIn('errors', obj.stats)

            # Cleanup /tmp file
            try:
                os.remove('/tmp/test_qa5_cmd_health.json')
            except Exception:
                pass


@override_settings(DEBUG=True)
class QAFix5M3CheckSchedulerEnvTestCase(TestCase):
    """
    M3 (Medium): `check_scheduler_env` command fail-fast khi thiếu
    SECRET_KEY/DATABASE_URL — tránh cron fail silently với lỗi cryptic.
    """

    def test_m3_check_passes_when_all_env_vars_present(self):
        """
        M3: command exit 0 khi SECRET_KEY + DATABASE_URL đều có.
        """
        with patch.dict(os.environ, {
            'SECRET_KEY': 'test-secret-key-12345',
            'DATABASE_URL': 'sqlite:///:memory:',
        }):
            try:
                call_command(
                    'check_scheduler_env',
                    stdout=tempfile.TemporaryFile(mode='w+t'),
                    stderr=tempfile.TemporaryFile(mode='w+t'),
                )
            except SystemExit as e:
                self.fail(
                    f'check_scheduler_env should not exit when env vars present, '
                    f'but exited with code: {e.code}'
                )

    def test_m3_check_fails_when_secret_key_missing(self):
        """
        M3: command exit 1 khi thiếu SECRET_KEY.
        """
        env = dict(os.environ)
        env.pop('SECRET_KEY', None)
        env['DATABASE_URL'] = 'sqlite:///:memory:'
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(SystemExit) as ctx:
                call_command(
                    'check_scheduler_env',
                    stdout=tempfile.TemporaryFile(mode='w+t'),
                    stderr=tempfile.TemporaryFile(mode='w+t'),
                )
            self.assertEqual(ctx.exception.code, 1)

    def test_m3_check_fails_when_database_url_missing(self):
        """
        M3: command exit 1 khi thiếu DATABASE_URL.
        """
        env = dict(os.environ)
        env['SECRET_KEY'] = 'test-secret-key-12345'
        env.pop('DATABASE_URL', None)
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(SystemExit) as ctx:
                call_command(
                    'check_scheduler_env',
                    stdout=tempfile.TemporaryFile(mode='w+t'),
                    stderr=tempfile.TemporaryFile(mode='w+t'),
                )
            self.assertEqual(ctx.exception.code, 1)

    def test_m3_render_yaml_cron_has_secret_key_and_database_url(self):
        """
        M3: render.yaml cron job phải khai báo tường minh SECRET_KEY +
        DATABASE_URL với sync: false (để Blueprint surface chúng).
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
        self.assertGreaterEqual(len(cron_jobs), 1)

        # Tìm cron job tracking scheduler
        scheduler_cron = None
        for c in cron_jobs:
            if 'tracking' in c.get('name', '').lower() and 'scheduler' in c.get('name', '').lower():
                scheduler_cron = c
                break
        self.assertIsNotNone(scheduler_cron)

        env_keys = {ev['key']: ev for ev in scheduler_cron.get('envVars', [])}
        self.assertIn('SECRET_KEY', env_keys)
        self.assertEqual(env_keys['SECRET_KEY'].get('sync'), False)
        self.assertIn('DATABASE_URL', env_keys)
        self.assertEqual(env_keys['DATABASE_URL'].get('sync'), False)

    def test_m3_render_yaml_cron_startcommand_calls_check_env(self):
        """
        M3: render.yaml cron job startCommand phải gọi check_scheduler_env
        TRƯỚC khi run_tracking_schedulers — fail-fast nếu thiếu env var.
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
        scheduler_cron = None
        for c in cron_jobs:
            if 'tracking' in c.get('name', '').lower() and 'scheduler' in c.get('name', '').lower():
                scheduler_cron = c
                break
        self.assertIsNotNone(scheduler_cron)

        start_cmd = scheduler_cron.get('startCommand', '')
        self.assertIn('check_scheduler_env', start_cmd)
        self.assertIn('run_tracking_schedulers', start_cmd)
        # check_scheduler_env phải chạy TRƯỚC run_tracking_schedulers (dùng &&)
        check_pos = start_cmd.index('check_scheduler_env')
        run_pos = start_cmd.index('run_tracking_schedulers')
        self.assertLess(check_pos, run_pos)
        self.assertIn('&&', start_cmd)
