"""
tracking/tests_perf_throttle.py — Test Task perf 4: throttle ghi LocationHistory.

Contract mới (services.update_worker_location):
  - LiveLocation: update MỌI lần (real-time cho app phụ huynh — không đổi).
  - LocationHistory: chỉ INSERT khi di chuyển > 30m HOẶC đủ 60s so với điểm
    lịch sử gần nhất của task (điểm đầu tiên luôn ghi).

Ngưỡng 1° vĩ độ ≈ 111,195m (R=6371) → 5m ≈ 0.000045°, 50m ≈ 0.00045°.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from core.models import ServiceCategory, Task, TaskApplication
from tracking.models import LocationConsent, LiveLocation, LocationHistory
from tracking.services import update_worker_location

User = get_user_model()

DEG_PER_M_LAT = 1.0 / 111195.0  # độ vĩ độ trên 1 mét (mô hình cầu R=6371)


class LocationHistoryThrottleTests(TestCase):
    def setUp(self):
        self.parent = User.objects.create_user(
            username='perf_parent', password='x', role='parent')
        self.worker = User.objects.create_user(
            username='perf_worker', password='x', role='worker')
        self.cat = ServiceCategory.objects.create(name='Perf Test Cat')
        self.task = Task.objects.create(
            title='Perf Task', description='Test', price=100000,
            status='in_progress', parent=self.parent, category=self.cat,
            location='HCM', latitude=10.0, longitude=106.0,
            scheduled_time=timezone.now(),
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker, status='accepted')
        LocationConsent.objects.create(
            task=self.task, worker=self.worker, consent='granted',
            granted_at=timezone.now())

    def _send(self, lat, lng):
        return update_worker_location(
            task=self.task, worker=self.worker, latitude=lat, longitude=lng)

    def test_two_close_points_20s_apart_single_history_row(self):
        """5m trong ~20s → CHỈ 1 bản ghi LocationHistory (bản đầu),
        LiveLocation vẫn update CẢ 2 lần."""
        live1 = self._send(10.0, 106.0)
        self.assertEqual(LocationHistory.objects.filter(task=self.task).count(), 1)
        self.assertTrue(live1.latitude == Decimal('10.0000000'))

        # ~5m về phía bắc (0.000045°), ngay lập tức (elapsed < 60s)
        live2 = self._send(10.0 + 5 * DEG_PER_M_LAT, 106.0)
        self.assertEqual(
            LocationHistory.objects.filter(task=self.task).count(), 1,
            'Điểm 5m/<60s KHÔNG được ghi thêm vào LocationHistory')
        # LiveLocation (real-time) PHẢI cập nhật theo điểm mới
        live2.refresh_from_db()
        self.assertAlmostEqual(float(live2.latitude),
                               10.0 + 5 * DEG_PER_M_LAT, delta=1e-6,
                               msg='LiveLocation phải update cả 2 lần '
                                   '(real-time không bị throttle)')
        self.assertEqual(live2.task_id, self.task.id)

    def test_far_point_50m_creates_second_history_row(self):
        """50m (> 30m) → cả 2 đều tạo LocationHistory."""
        self._send(10.0, 106.0)
        self._send(10.0 + 50 * DEG_PER_M_LAT, 106.0)
        self.assertEqual(
            LocationHistory.objects.filter(task=self.task).count(), 2,
            'Điểm cách 50m phải được ghi (vượt ngưỡng khoảng cách)')

    def test_close_point_after_65s_creates_second_history_row(self):
        """5m nhưng cách 65 giây → cả 2 đều tạo LocationHistory (vượt ngưỡng
        thời gian). Backdate recorded_at của điểm đầu để mô phỏng thời gian."""
        self._send(10.0, 106.0)
        # Backdate điểm đầu về 65 giây trước
        LocationHistory.objects.filter(task=self.task).update(
            recorded_at=timezone.now() - timedelta(seconds=65))
        self._send(10.0 + 5 * DEG_PER_M_LAT, 106.0)
        self.assertEqual(
            LocationHistory.objects.filter(task=self.task).count(), 2,
            'Điểm sau 65s phải được ghi dù chỉ di chuyển 5m (>= 60s)')

    def test_first_point_always_recorded_and_route_replay_still_works(self):
        """Điểm đầu tiên của task luôn ghi; get_location_history trả đủ điểm
        đã ghi (route replay không bị hỏng bởi throttle)."""
        self._send(10.0, 106.0)
        self._send(10.0 + 50 * DEG_PER_M_LAT, 106.0)  # ghi
        self._send(10.0 + 51 * DEG_PER_M_LAT, 106.0)  # ~1m — skip
        from tracking.services import get_location_history
        rows = list(get_location_history(task=self.task, requester=self.parent))
        self.assertEqual(len(rows), 2)

    def test_thresholds_configurable_via_settings(self):
        """Ngưỡng đọc từ settings (override được, default 30m/60s)."""
        from tracking import services as svc
        self.assertEqual(svc.HISTORY_MIN_DISTANCE_METERS, 30)
        self.assertEqual(svc.HISTORY_MIN_INTERVAL_SECONDS, 60)
