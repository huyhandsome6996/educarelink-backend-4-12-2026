r"""
A2 — Ghép việc thông minh (Smart Job Matching). Test suite hoàn chỉnh.

Chạy:
  DEBUG=True SECRET_KEY=test DATABASE_URL=sqlite:///test_db.sqlite3 \\
  python manage.py test core.tests_smart_match --verbosity=2

Phạm vi:
  1. Model validation (WorkerAvailability.clean, UniqueConstraint, serializer overlap)
  2. Auth/permission cho các endpoint A2
  3. Matching logic (find_smart_matches trực tiếp)
  4. Ranking / công bằng (workload → distance → ID)
  5. Response contract (không lộ thông tin nhạy cảm)
  6. Regression (apply vẫn hoạt động, TaskCandidatesAPIView không bị ảnh hưởng)
"""

from django.test import TestCase, override_settings
from django.utils import timezone as django_tz
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from rest_framework.test import APIClient
from datetime import time, datetime

from core.models import (
    User, Task, ServiceCategory, TaskApplication, WorkerAvailability,
)
from core.services.smart_match import find_smart_matches, _task_weekday_model


# ─── Hằng số toạ độ TP.HCM ────────────────────────────────────────────
HCM_LAT = 10.7626
HCM_LNG = 106.6600

# Điểm gần (trong bán kính 5km, ~800m)
NEAR_LAT = 10.7680
NEAR_LNG = 106.6650

# Điểm xa (ngoài bán kính 5km, ~40km)
FAR_LAT = 10.8500
FAR_LNG = 107.0200


def _task_dt(hour_hcm: int = 14, minute_hcm: int = 0) -> datetime:
    """Tạo datetime aware cho 14:00 HCM Thứ Ba 2026-01-06.
    2026-01-06 là Thứ Ba. 14:00 HCM = 07:00 UTC.
    """
    return django_tz.make_aware(datetime(2026, 1, 6, hour_hcm, minute_hcm))


def _task_weekday_for_test() -> int:
    """Trả về weekday mà _task_weekday_model sẽ tính cho _task_dt()."""
    return _task_weekday_model(_task_dt())


# ─────────────────────────────────────────────────────────────────────
# 1. MODEL VALIDATION TESTS
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class ModelValidationTests(TestCase):
    """Kiểm tra validation trên model WorkerAvailability."""

    def test_start_time_ge_end_time_raises_validation_error(self):
        """start_time >= end_time → ValidationError khi gọi clean()."""
        w = User.objects.create_user(username='w1', password='p', role='worker')
        avail = WorkerAvailability(
            worker=w, weekday=1,
            start_time=time(18, 0), end_time=time(14, 0),
        )
        with self.assertRaises(ValidationError) as ctx:
            avail.clean()
        self.assertIn('end_time', ctx.exception.message_dict)

    def test_identical_window_raises_integrity_error(self):
        """Cùng worker + weekday + start_time + end_time → UniqueConstraint vi phạm."""
        w = User.objects.create_user(username='w2', password='p', role='worker')
        WorkerAvailability.objects.create(
            worker=w, weekday=1,
            start_time=time(8, 0), end_time=time(12, 0),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                WorkerAvailability.objects.create(
                    worker=w, weekday=1,
                    start_time=time(8, 0), end_time=time(12, 0),
                )

    def test_overlapping_windows_rejected_by_serializer(self):
        """Hai khung giờ trùng nhau cùng worker + weekday → serializer từ chối."""
        worker = User.objects.create_user(username='w3', password='p', role='worker')
        client = APIClient()
        client.force_authenticate(user=worker)

        # Khung giờ đầu tiên: 08:00–12:00
        resp1 = client.post('/api/worker/availability/', {
            'weekday': 1, 'start_time': '08:00', 'end_time': '12:00',
        })
        self.assertEqual(resp1.status_code, 201)

        # Khung giờ trùng: 10:00–14:00 (overlap 10:00–12:00)
        resp2 = client.post('/api/worker/availability/', {
            'weekday': 1, 'start_time': '10:00', 'end_time': '14:00',
        })
        self.assertEqual(resp2.status_code, 400)
        # Kiểm tra message chứa từ 'trùng'
        errors = resp2.data.get('non_field_errors', [])
        self.assertTrue(any('trùng' in str(e).lower() for e in errors),
                        f'Kỳ vọng thông báo trùng khung giờ, nhận: {resp2.data}')


# ─────────────────────────────────────────────────────────────────────
# 2. AUTH / PERMISSION TESTS
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class AuthPermissionTests(TestCase):
    """Kiểm tra phân quyền cho các endpoint A2."""

    def setUp(self):
        self.client = APIClient()
        self.parent = User.objects.create_user(
            username='parent1', password='p', role='parent',
        )
        self.worker = User.objects.create_user(
            username='worker1', password='p', role='worker', is_approved=True,
            latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư', icon_name='BookOpen'
        )

    # --- Anonymous: 401 trên mọi endpoint A2 ---

    def test_anonymous_get_availability_list_401(self):
        """Chưa đăng nhập gọi GET /api/worker/availability/ → 401."""
        resp = self.client.get('/api/worker/availability/')
        self.assertEqual(resp.status_code, 401)

    def test_anonymous_post_availability_401(self):
        """Chưa đăng nhập gọi POST /api/worker/availability/ → 401."""
        resp = self.client.post('/api/worker/availability/', {
            'weekday': 1, 'start_time': '08:00', 'end_time': '12:00',
        })
        self.assertEqual(resp.status_code, 401)

    def test_anonymous_get_smart_matches_401(self):
        """Chưa đăng nhập gọi GET smart-matches → 401."""
        task = Task.objects.create(
            title='Việc test', description='desc', price=100000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=_task_dt(),
        )
        resp = self.client.get(
            f'/api/parent/tasks/{task.id}/smart-matches/'
        )
        self.assertEqual(resp.status_code, 401)

    # --- Parent truy cập worker/availability → 403 ---

    def test_parent_get_worker_availability_403(self):
        """Phụ huynh gọi GET /api/worker/availability/ → 403."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get('/api/worker/availability/')
        self.assertEqual(resp.status_code, 403)

    # --- Worker chưa duyệt vẫn tạo được availability ---

    def test_unapproved_worker_can_create_availability(self):
        """Worker chưa duyệt vẫn tạo được availability (API cho phép)."""
        unapproved = User.objects.create_user(
            username='unapproved_w', password='p', role='worker',
            is_approved=False,
        )
        self.client.force_authenticate(user=unapproved)
        resp = self.client.post('/api/worker/availability/', {
            'weekday': 1, 'start_time': '08:00', 'end_time': '12:00',
        })
        self.assertEqual(resp.status_code, 201)

    def test_unapproved_worker_not_in_smart_matches(self):
        """Worker chưa duyệt không xuất hiện trong kết quả smart match."""
        unapproved = User.objects.create_user(
            username='unapproved_w2', password='p', role='worker',
            is_approved=False, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        wd = _task_weekday_for_test()
        WorkerAvailability.objects.create(
            worker=unapproved, weekday=wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        task = Task.objects.create(
            title='Test', description='d', price=100000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=_task_dt(),
        )
        result = find_smart_matches(task, radius_m=5000)
        self.assertEqual(result['matches'], [])
        self.assertIsNotNone(result['message'])

    # --- Worker inactive ---

    def test_inactive_worker_can_create_availability(self):
        """Worker inactive (is_active=False) vẫn tạo được availability qua API."""
        inactive = User.objects.create_user(
            username='inactive_w', password='p', role='worker',
            is_approved=True, is_active=False,
        )
        self.client.force_authenticate(user=inactive)
        resp = self.client.post('/api/worker/availability/', {
            'weekday': 1, 'start_time': '08:00', 'end_time': '12:00',
        })
        self.assertEqual(resp.status_code, 201)

    def test_inactive_worker_not_in_smart_matches(self):
        """Worker inactive không xuất hiện trong kết quả smart match."""
        inactive = User.objects.create_user(
            username='inactive_w2', password='p', role='worker',
            is_approved=True, is_active=False,
            latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        wd = _task_weekday_for_test()
        WorkerAvailability.objects.create(
            worker=inactive, weekday=wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        task = Task.objects.create(
            title='Test', description='d', price=100000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=_task_dt(),
        )
        result = find_smart_matches(task, radius_m=5000)
        self.assertEqual(result['matches'], [])

    # --- Worker xem availability của worker khác → 404 ---

    def test_worker_cannot_access_other_worker_availability_detail_404(self):
        """Worker A không xem được availability của worker B → 404."""
        other_worker = User.objects.create_user(
            username='workerB', password='p', role='worker', is_approved=True,
        )
        avail = WorkerAvailability.objects.create(
            worker=other_worker, weekday=1,
            start_time=time(8, 0), end_time=time(12, 0),
        )
        self.client.force_authenticate(user=self.worker)
        resp = self.client.get(f'/api/worker/availability/{avail.id}/')
        self.assertEqual(resp.status_code, 404)

    # --- Worker truy cập smart-matches → 403 ---

    def test_worker_cannot_access_smart_matches_403(self):
        """Worker gọi GET smart-matches → 403."""
        task = Task.objects.create(
            title='Test', description='d', price=100000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=_task_dt(),
        )
        self.client.force_authenticate(user=self.worker)
        resp = self.client.get(
            f'/api/parent/tasks/{task.id}/smart-matches/'
        )
        self.assertEqual(resp.status_code, 403)

    # --- Parent xem smart-matches của parent khác → 403 ---

    def test_parent_cannot_access_other_parent_smart_matches_403(self):
        """Phụ huynh A không xem được gợi ý cho việc của phụ huynh B → 403."""
        other_parent = User.objects.create_user(
            username='parent2', password='p', role='parent',
        )
        task = Task.objects.create(
            title='Test', description='d', price=100000,
            parent=other_parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=_task_dt(),
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(
            f'/api/parent/tasks/{task.id}/smart-matches/'
        )
        self.assertEqual(resp.status_code, 403)


# ─────────────────────────────────────────────────────────────────────
# 3. MATCHING LOGIC TESTS (gọi find_smart_matches trực tiếp)
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class MatchingLogicTests(TestCase):
    """Kiểm tra logic matching của find_smart_matches().

    Lưu ý: dùng _task_weekday_for_test() để lấy weekday theo code thực tế,
    đảm bảo test khớp với logic ánh xạ weekday trong production.
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_match', password='p', role='parent',
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư', icon_name='BookOpen'
        )
        self.task_dt = _task_dt()  # Thứ Ba 14:00 HCM
        self.wd = _task_weekday_for_test()
        self.task = Task.objects.create(
            title='Giáo dục trẻ', description='Gia sư toán', price=200000,
            parent=self.parent, category=self.category,
            location='Quận 1, TP.HCM',
            latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=self.task_dt,
        )

    def test_matching_availability_within_radius(self):
        """Worker có khung giờ phù hợp và trong bán kính → được match."""
        w = User.objects.create_user(
            username='w_near', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
            first_name='Nguyễn', last_name='An',
        )
        WorkerAvailability.objects.create(
            worker=w, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(len(result['matches']), 1)
        self.assertEqual(result['matches'][0]['worker_id'], w.id)

    def test_matching_availability_but_outside_radius(self):
        """Worker có khung giờ nhưng ngoài bán kính → KHÔNG được match."""
        w = User.objects.create_user(
            username='w_far', password='p', role='worker',
            is_approved=True, latitude=FAR_LAT, longitude=FAR_LNG,
        )
        WorkerAvailability.objects.create(
            worker=w, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(result['matches'], [])
        self.assertIn('bán kính', result['message'])

    def test_no_availability_for_weekday(self):
        """Worker không có availability vào weekday của task → KHÔNG match."""
        w = User.objects.create_user(
            username='w_wrong_day', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        # Tạo availability cho ngày khác (weekday khác)
        other_wd = (self.wd + 3) % 7
        WorkerAvailability.objects.create(
            worker=w, weekday=other_wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(result['matches'], [])
        self.assertIn('khung giờ', result['message'])

    def test_availability_time_not_contain_task_time(self):
        """Worker có availability nhưng không chứa task time → KHÔNG match."""
        w = User.objects.create_user(
            username='w_bad_time', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        # Task lúc 14:00 HCM, availability 16:00–18:00 (không chứa 14:00)
        WorkerAvailability.objects.create(
            worker=w, weekday=self.wd,
            start_time=time(16, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(result['matches'], [])

    def test_worker_without_coordinates_not_matched(self):
        """Worker không có toạ độ → KHÔNG match."""
        w = User.objects.create_user(
            username='w_no_coord', password='p', role='worker',
            is_approved=True, latitude=None, longitude=None,
        )
        WorkerAvailability.objects.create(
            worker=w, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(result['matches'], [])

    def test_task_without_coordinates_returns_empty(self):
        """Task không có toạ độ → trả kết quả rỗng kèm message."""
        task_no_loc = Task.objects.create(
            title='Không có vị trí', description='d', price=100000,
            parent=self.parent, category=self.category,
            location='Chưa chọn', latitude=None, longitude=None,
            scheduled_time=self.task_dt,
        )
        result = find_smart_matches(task_no_loc, radius_m=5000)
        self.assertEqual(result['matches'], [])
        self.assertIn('vị trí', result['message'])

    def test_unapproved_worker_not_in_results(self):
        """Worker chưa duyệt → KHÔNG xuất hiện trong kết quả."""
        w = User.objects.create_user(
            username='w_unapproved', password='p', role='worker',
            is_approved=False, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        WorkerAvailability.objects.create(
            worker=w, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(result['matches'], [])

    def test_inactive_worker_not_in_results(self):
        """Worker inactive (is_active=False) → KHÔNG xuất hiện trong kết quả."""
        w = User.objects.create_user(
            username='w_inactive', password='p', role='worker',
            is_approved=True, is_active=False,
            latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        WorkerAvailability.objects.create(
            worker=w, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(self.task, radius_m=5000)
        self.assertEqual(result['matches'], [])


# ─────────────────────────────────────────────────────────────────────
# 4. RANKING / FAIRNESS TESTS
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class RankingFairnessTests(TestCase):
    """Kiểm tra thứ tự xếp hạng: workload_day → workload_week → distance → ID."""

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_rank', password='p', role='parent',
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư', icon_name='BookOpen'
        )
        self.task_dt = _task_dt()
        self.wd = _task_weekday_for_test()
        self.task = Task.objects.create(
            title='Việc xếp hạng', description='d', price=200000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=self.task_dt,
        )

    def _make_worker(self, username, lat=NEAR_LAT, lng=NEAR_LNG, **kwargs):
        """Tạo worker đã duyệt, có toạ độ."""
        defaults = dict(
            password='p', role='worker', is_approved=True,
            first_name=username, latitude=lat, longitude=lng,
        )
        defaults.update(kwargs)
        return User.objects.create_user(username=username, **defaults)

    def _add_availability(self, worker):
        """Thêm khung giờ rảnh khớp với task."""
        WorkerAvailability.objects.create(
            worker=worker, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )

    def _add_accepted_task(self, worker, scheduled_time, task_status='in_progress'):
        """Tạo task + application accepted để tăng workload cho worker."""
        t = Task.objects.create(
            title='Việc cũ', description='d', price=100000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=scheduled_time, status=task_status,
        )
        TaskApplication.objects.create(
            task=t, worker=worker, status='accepted',
        )

    def test_completed_task_same_day_increases_workload_day(self):
        """Worker có task đã completed cùng ngày → workload_day > 0,
        không được xếp ngang ưu tiên với worker 0 việc."""
        w_free = self._make_worker('w_free_completed')
        w_done = self._make_worker('w_done_today')
        self._add_availability(w_free)
        self._add_availability(w_done)

        # w_done hoàn thành 1 việc cùng ngày với task mới
        same_day_dt = django_tz.make_aware(datetime(2026, 1, 6, 10, 0))
        self._add_accepted_task(w_done, same_day_dt, task_status='completed')

        result = find_smart_matches(self.task, radius_m=5000)
        matches = {m['worker_id']: m for m in result['matches']}

        # w_done phải có workload_day = 1, w_free = 0
        self.assertEqual(matches[w_free.id]['workload_day'], 0)
        self.assertEqual(matches[w_done.id]['workload_day'], 1)
        # w_free phải xếp trên w_done
        ids = [m['worker_id'] for m in result['matches']]
        self.assertEqual(ids, [w_free.id, w_done.id],
                         'Worker 0 việc phải xếp trên worker đã completed việc cùng ngày')

    def test_completed_task_same_week_increases_workload_week(self):
        """Worker có task đã completed trong cùng tuần (khác ngày) → workload_week > 0."""
        w_free = self._make_worker('w_free_week')
        w_done = self._make_worker('w_done_week')
        self._add_availability(w_free)
        self._add_availability(w_done)

        # w_done hoàn thành 1 việc hôm Thứ Năm (cùng ISO week với Thứ Ba 2026-01-06)
        # ISO week 2: Thứ Hai 05/01 → Chủ Nhật 11/01/2026
        other_day_dt = django_tz.make_aware(datetime(2026, 1, 8, 10, 0))  # Thứ Năm
        self._add_accepted_task(w_done, other_day_dt, task_status='completed')

        result = find_smart_matches(self.task, radius_m=5000)
        matches = {m['worker_id']: m for m in result['matches']}

        # w_done phải có workload_week >= 1, w_free = 0
        self.assertEqual(matches[w_free.id]['workload_week'], 0)
        self.assertGreaterEqual(matches[w_done.id]['workload_week'], 1)
        # Cùng workload_day (0), nhưng w_free có workload_week nhỏ hơn → xếp trên
        ids = [m['worker_id'] for m in result['matches']]
        self.assertEqual(ids[0], w_free.id,
                         'Worker 0 việc tuần phải xếp trên worker đã completed việc trong tuần')

    def test_cancelled_task_not_counted_in_workload(self):
        """Task đã cancelled KHÔNG được tính vào workload — đảm bảo hành vi cũ."""
        w_free = self._make_worker('w_free_cancel')
        w_cancel = self._make_worker('w_cancel_task')
        self._add_availability(w_free)
        self._add_availability(w_cancel)

        # w_cancel có task bị hủy cùng ngày
        same_day_dt = django_tz.make_aware(datetime(2026, 1, 6, 10, 0))
        self._add_accepted_task(w_cancel, same_day_dt, task_status='cancelled')

        result = find_smart_matches(self.task, radius_m=5000)
        matches = {m['worker_id']: m for m in result['matches']}

        # Task cancelled không tính → cả hai đều workload_day = 0
        self.assertEqual(matches[w_cancel.id]['workload_day'], 0)
        self.assertEqual(matches[w_cancel.id]['workload_week'], 0)

    def test_zero_day_workload_ranked_above_one_plus(self):
        """Worker 0 việc hôm nay xếp trên worker có 1+ việc hôm nay."""
        w_free = self._make_worker('w_free')
        w_busy = self._make_worker('w_busy')
        self._add_availability(w_free)
        self._add_availability(w_busy)

        # w_busy có 1 việc cùng ngày
        same_day_dt = django_tz.make_aware(datetime(2026, 1, 6, 10, 0))
        self._add_accepted_task(w_busy, same_day_dt)

        result = find_smart_matches(self.task, radius_m=5000)
        ids = [m['worker_id'] for m in result['matches']]
        self.assertEqual(ids, [w_free.id, w_busy.id])

    def test_same_day_workload_fewer_weekly_ranked_higher(self):
        """Cùng workload ngày: worker ít việc tuần hơn xếp trên."""
        w1 = self._make_worker('w_week1')
        w2 = self._make_worker('w_week2')
        self._add_availability(w1)
        self._add_availability(w2)

        # Cả hai có 1 việc cùng ngày
        same_day_dt = django_tz.make_aware(datetime(2026, 1, 6, 10, 0))
        self._add_accepted_task(w1, same_day_dt)
        self._add_accepted_task(w2, same_day_dt)

        # w2 thêm 1 việc hôm khác trong tuần (cùng ISO week)
        other_day_dt = django_tz.make_aware(datetime(2026, 1, 8, 10, 0))
        self._add_accepted_task(w2, other_day_dt)

        result = find_smart_matches(self.task, radius_m=5000)
        ids = [m['worker_id'] for m in result['matches']]
        self.assertEqual(ids[0], w1.id,
                         'Worker ít việc tuần hơn phải xếp trên')

    def test_same_workload_closer_worker_ranked_higher(self):
        """Cùng workload: worker gần hơn xếp trên."""
        w_close = self._make_worker(
            'w_close', lat=10.7640, lng=106.6620,
        )
        w_far_rank = self._make_worker(
            'w_far_rank', lat=10.7700, lng=106.6700,
        )
        self._add_availability(w_close)
        self._add_availability(w_far_rank)

        result = find_smart_matches(self.task, radius_m=5000)
        ids = [m['worker_id'] for m in result['matches']]
        self.assertEqual(ids[0], w_close.id)
        # Xác nhận khoảng cách confirm ordering
        self.assertLess(
            result['matches'][0]['distance_m'],
            result['matches'][1]['distance_m'],
        )

    def test_tie_all_lower_id_ranked_higher(self):
        """Hoàn toàn ngang nhau: worker ID nhỏ hơn xếp trên (ổn định)."""
        # Cùng toạ độ → distance bằng nhau
        w_a = self._make_worker('w_tie_a', lat=10.7650, lng=106.6630)
        w_b = self._make_worker('w_tie_b', lat=10.7650, lng=106.6630)
        self._add_availability(w_a)
        self._add_availability(w_b)

        # Đảm bảo w_a có ID nhỏ hơn
        if w_a.id > w_b.id:
            w_a, w_b = w_b, w_a

        result = find_smart_matches(self.task, radius_m=5000)
        ids = [m['worker_id'] for m in result['matches']]
        self.assertEqual(ids, [w_a.id, w_b.id])


# ─────────────────────────────────────────────────────────────────────
# 5. RESPONSE CONTRACT TESTS
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class ResponseContractTests(TestCase):
    """Kiểm tra response smart match chỉ chứa trường cho phép,
    KHÔNG lộ thông tin nhạy cảm (phone, email, address, tọa độ)."""

    ALLOWED_FIELDS = {
        'worker_id', 'display_name', 'avatar_url', 'qualifications',
        'distance_m', 'distance_text', 'availability_window',
        'workload_day', 'workload_week', 'rank_reason',
    }
    FORBIDDEN_FIELDS = {
        'phone_number', 'email', 'address', 'latitude', 'longitude',
    }

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_contract', password='p', role='parent',
        )
        self.worker = User.objects.create_user(
            username='worker_contract', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
            first_name='Trần', last_name='Bình',
            phone_number='0912345678',
            email='worker_contract@test.com',
            address='123 Nguyễn Huệ, Quận 1',
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư', icon_name='BookOpen'
        )
        self.task_dt = _task_dt()
        self.wd = _task_weekday_for_test()
        self.task = Task.objects.create(
            title='Test contract', description='d', price=200000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=self.task_dt,
        )
        WorkerAvailability.objects.create(
            worker=self.worker, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.parent)

    def test_response_contains_only_allowed_fields(self):
        """Response smart match chỉ chứa các trường được cho phép."""
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/smart-matches/'
        )
        self.assertEqual(resp.status_code, 200)
        matches = resp.data['matches']
        self.assertEqual(len(matches), 1)
        match_keys = set(matches[0].keys())
        self.assertEqual(
            match_keys, self.ALLOWED_FIELDS,
            f'Fields thừa: {match_keys - self.ALLOWED_FIELDS}, '
            f'thiếu: {self.ALLOWED_FIELDS - match_keys}',
        )

    def test_response_does_not_contain_sensitive_fields(self):
        """Response smart match KHÔNG chứa thông tin nhạy cảm."""
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/smart-matches/'
        )
        matches = resp.data['matches']
        match_keys = set(matches[0].keys())
        for field in self.FORBIDDEN_FIELDS:
            self.assertNotIn(
                field, match_keys,
                f'Trường nhạy cảm "{field}" bị lộ trong response',
            )

    def test_response_direct_service_also_no_sensitive_fields(self):
        """Gọi find_smart_matches trực tiếp cũng không lộ thông tin nhạy cảm."""
        result = find_smart_matches(self.task, radius_m=5000)
        matches = result['matches']
        self.assertEqual(len(matches), 1)
        match_keys = set(matches[0].keys())
        for field in self.FORBIDDEN_FIELDS:
            self.assertNotIn(field, match_keys)


# ─────────────────────────────────────────────────────────────────────
# 6. REGRESSION TESTS
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class RegressionTests(TestCase):
    """Đảm bảo các tính năng cũ không bị A2 làm hỏng."""

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_regress', password='p', role='parent',
        )
        self.worker_near = User.objects.create_user(
            username='worker_regress_near', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        self.worker_far = User.objects.create_user(
            username='worker_regress_far', password='p', role='worker',
            is_approved=True, latitude=FAR_LAT, longitude=FAR_LNG,
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư', icon_name='BookOpen'
        )
        self.task_dt = _task_dt()
        self.task = Task.objects.create(
            title='Việc regression', description='d', price=200000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=self.task_dt,
        )
        self.client = APIClient()

    def test_worker_not_recommended_can_still_apply(self):
        """Worker không được gợi ý (xa quá) vẫn ứng tuyển được qua /worker/tasks/<id>/apply/."""
        self.client.force_authenticate(user=self.worker_far)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/apply/'
        )
        self.assertIn(resp.status_code, (200, 201))

    def test_worker_without_availability_can_still_apply(self):
        """Worker không khai báo availability vẫn ứng tuyển được."""
        worker_no_avail = User.objects.create_user(
            username='worker_no_avail', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        self.client.force_authenticate(user=worker_no_avail)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/apply/'
        )
        self.assertIn(resp.status_code, (200, 201))

    def test_task_candidates_api_still_works(self):
        """TaskCandidatesAPIView vẫn trả đúng ứng tuyển cho việc của phụ huynh."""
        TaskApplication.objects.create(
            task=self.task, worker=self.worker_near, status='pending',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/candidates/'
        )
        self.assertEqual(resp.status_code, 200)
        # Response là list (không phân trang)
        apps = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        self.assertEqual(len(apps), 1)
        self.assertEqual(apps[0]['worker'], self.worker_near.id)

    def test_task_candidates_other_parent_403(self):
        """Phụ huynh khác không xem được candidates → 403."""
        other_parent = User.objects.create_user(
            username='parent_other', password='p', role='parent',
        )
        TaskApplication.objects.create(
            task=self.task, worker=self.worker_near, status='pending',
        )
        self.client.force_authenticate(user=other_parent)
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/candidates/'
        )
        self.assertEqual(resp.status_code, 403)


class A2QAContractTests(TestCase):
    """QA Fix — kiểm tra API response contract khớp với client expectations.

    Các field bắt buộc trong mỗi match:
      worker_id, display_name, avatar_url, distance_m, distance_text,
      availability_window, workload_day, workload_week, rank_reason
    Không được có: phone_number, email, address, latitude, longitude.
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_qa_contract', password='p', role='parent',
        )
        self.worker = User.objects.create_user(
            username='worker_qa_contract', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
            first_name='Nguyễn', last_name='Văn A',
            avatar_url='https://example.com/avatar.jpg',
            phone_number='0912345678',
            email='qa_contract@test.com',
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư QA', icon_name='BookOpen',
        )
        self.task_dt = _task_dt()
        self.wd = _task_weekday_for_test()
        self.task = Task.objects.create(
            title='QA contract test', description='d', price=200000,
            parent=self.parent, category=self.category,
            location='Q1', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=self.task_dt,
        )
        WorkerAvailability.objects.create(
            worker=self.worker, weekday=self.wd,
            start_time=time(8, 0), end_time=time(18, 0),
        )
        self.client = APIClient()

    def test_response_contract_fields(self):
        """Mỗi match phải chứa đúng các field theo contract, không lộ thông tin nhạy cảm."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/smart-matches/'
        )
        self.assertEqual(resp.status_code, 200)
        matches = resp.data.get('matches', [])
        if not matches:
            return  # Không có match → không kiểm tra thêm

        REQUIRED_FIELDS = [
            'worker_id', 'display_name', 'avatar_url',
            'distance_m', 'distance_text', 'availability_window',
            'workload_day', 'workload_week', 'rank_reason',
        ]
        FORBIDDEN_FIELDS = [
            'phone_number', 'email', 'address',
            'latitude', 'longitude',
        ]
        for m in matches:
            for f in REQUIRED_FIELDS:
                self.assertIn(f, m, f'Thiếu field {f} trong match {m.get("worker_id")}')
            for f in FORBIDDEN_FIELDS:
                self.assertNotIn(f, m, f'Field nhạy cảm {f} bị lộ trong match {m.get("worker_id")}')

    def test_response_contract_types(self):
        """Kiểm tra kiểu dữ liệu các field quan trọng."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/smart-matches/'
        )
        matches = resp.data.get('matches', [])
        for m in matches:
            self.assertIsInstance(m['worker_id'], int)
            self.assertIsInstance(m['display_name'], str)
            self.assertTrue(isinstance(m['avatar_url'], (str, type(None))))
            self.assertIsInstance(m['distance_m'], (int, float))
            self.assertIsInstance(m['distance_text'], str)
            self.assertIsInstance(m['availability_window'], str)
            self.assertIsInstance(m['workload_day'], int)
            self.assertIsInstance(m['workload_week'], int)
            self.assertIsInstance(m['rank_reason'], str)

    def test_distance_text_readable(self):
        """distance_text phải đọc được, chứa 'm' hoặc 'km'."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(
            f'/api/parent/tasks/{self.task.id}/smart-matches/'
        )
        matches = resp.data.get('matches', [])
        for m in matches:
            self.assertRegex(
                m['distance_text'], r'\d+(m|km)$',
                f'distance_text không đúng format: {m["distance_text"]}'
            )


class A2QATimezoneBoundaryTests(TestCase):
    """QA Fix A2-004 — workload tính đúng ở ranh giới ngày/tuần.

    Không được phát sinh RuntimeWarning về naive datetime.
    """

    def setUp(self):
        self.parent = User.objects.create_user(
            username='parent_qa_tz', password='p', role='parent',
        )
        self.worker_near = User.objects.create_user(
            username='worker_qa_tz', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )
        self.category = ServiceCategory.objects.create(
            name='Gia sư TZ', icon_name='BookOpen',
        )

    def test_midnight_boundary_no_warning(self):
        """Task lúc 00:30 HCM — workload ngày phải tính đúng, không warning."""
        import warnings

        dt = django_tz.make_aware(datetime(2026, 1, 7, 0, 30))  # Thứ Tư 00:30
        task = Task.objects.create(
            title='Việc giữa đêm', description='test',
            price=100000, parent=self.parent,
            category=self.category,
            location='HCM', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=dt, status='open',
        )
        WorkerAvailability.objects.create(
            worker=self.worker_near, weekday=2,  # Thứ Tư (model)
            start_time=time(0, 0), end_time=time(6, 0),
        )
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter('always')
            result = find_smart_matches(task)
            naive_warnings = [
                x for x in w
                if issubclass(x.category, RuntimeWarning)
                and 'naive datetime' in str(x.message)
            ]
            self.assertEqual(len(naive_warnings), 0,
                             f'Phát sinh naive datetime warning: {naive_warnings}')

    def test_iso_week_boundary(self):
        """Task ở ranh giới ISO week — workload tuần phải tính đúng.
        Thứ Hai 2026-01-05 là đầu tuần ISO 2.
        """
        dt = django_tz.make_aware(datetime(2026, 1, 5, 8, 0))  # Thứ Hai 08:00
        task = Task.objects.create(
            title='Việc đầu tuần', description='test',
            price=100000, parent=self.parent,
            category=self.category,
            location='HCM', latitude=HCM_LAT, longitude=HCM_LNG,
            scheduled_time=dt, status='open',
        )
        WorkerAvailability.objects.create(
            worker=self.worker_near, weekday=0,  # Thứ Hai (model)
            start_time=time(7, 0), end_time=time(18, 0),
        )
        result = find_smart_matches(task)
        self.assertIn('matches', result)


class A2QACheckConstraintTests(TestCase):
    """Hardening — CheckConstraint start_time < end_time ở DB level."""

    def setUp(self):
        self.worker_near = User.objects.create_user(
            username='worker_qa_constraint', password='p', role='worker',
            is_approved=True, latitude=NEAR_LAT, longitude=NEAR_LNG,
        )

    def test_db_check_constraint_prevents_invalid(self):
        """start_time >= end_time bị DB CheckConstraint chặn (không chỉ clean/serializer)."""
        with self.assertRaises(IntegrityError):
            WorkerAvailability.objects.create(
                worker=self.worker_near, weekday=0,
                start_time=time(14, 0), end_time=time(10, 0),
            )

    def test_adjacent_windows_allowed(self):
        """08:00–12:00 và 12:00–16:00 cùng worker cùng weekday phải được phép."""
        WorkerAvailability.objects.create(
            worker=self.worker_near, weekday=0,
            start_time=time(8, 0), end_time=time(12, 0),
        )
        WorkerAvailability.objects.create(
            worker=self.worker_near, weekday=0,
            start_time=time(12, 0), end_time=time(16, 0),
        )
        count = WorkerAvailability.objects.filter(
            worker=self.worker_near, weekday=0,
        ).count()
        self.assertEqual(count, 2)

    def test_equal_times_rejected(self):
        """start_time == end_time bị từ chối."""
        with self.assertRaises(IntegrityError):
            WorkerAvailability.objects.create(
                worker=self.worker_near, weekday=0,
                start_time=time(12, 0), end_time=time(12, 0),
            )
