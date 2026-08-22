r"""
B1 — Nhật ký chăm sóc (Care Diary). Test suite hoàn chỉnh.

Chạy:
  DEBUG=True SECRET_KEY=test DATABASE_URL=sqlite:///test_db.sqlite3 \
  python manage.py test care_diary --verbosity=2

Phạm vi:
  1. Tạo nhật ký thành công (task in_progress, completed)
  2. Từ chối tạo: task open, worker sai, trùng entry
  3. Sửa nhật ký: thành công, 403 khi không phải chủ
  4. Xem nhật ký: parent 200, parent khác 403, worker 200, worker khác 403, anonymous 401
  5. 404 khi chưa có nhật ký (không 500)
  6. Upload ảnh: thành công, absolute URL
  7. Response contract khớp mobile (CareDiaryDetailScreen.js + CareDiaryFormScreen.js)
  8. Stats tính đúng (count theo status, 0 activity không crash)
  9. Task cancelled KHÔNG tính vào workload (tương tự A2 cancelled test)
"""

from django.test import TestCase, override_settings
from django.utils import timezone as django_tz
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from datetime import time, datetime, timedelta

from core.models import User, Task, ServiceCategory, TaskApplication


# === HELPERS ===

def _make_parent(username='parent_cd'):
    return User.objects.create_user(username=username, password='p', role='parent')


def _make_worker(username='worker_cd', is_approved=True):
    return User.objects.create_user(
        username=username, password='p', role='worker',
        is_approved=is_approved, first_name='Nguyễn', last_name='Thị Lan',
    )


def _make_category(name='Gia sư'):
    return ServiceCategory.objects.create(name=name, icon_name='BookOpen')


def _make_task(parent, category, status='in_progress', **kwargs):
    defaults = dict(
        title='Việc test CD', description='d', price=200000,
        parent=parent, category=category,
        location='Q1', latitude=10.7626, longitude=106.6600,
        scheduled_time=django_tz.now(),
    )
    defaults.update(kwargs)
    defaults['status'] = status
    return Task.objects.create(**defaults)


def _accept_worker(task, worker):
    return TaskApplication.objects.create(
        task=task, worker=worker, status='accepted',
    )


def _diary_payload(**overrides):
    """Payload chuẩn để tạo nhật ký."""
    defaults = {
        'mood_icon': 'happy',
        'mood_label': 'Vui vẻ',
        'mood_note': 'Bé ngoan hôm nay.',
        'completion_percent': 85,
        'note': 'Tổng kết tốt.',
        'activities': [
            {'time': '15:30', 'title': 'Đón bé', 'description': 'Đúng giờ', 'status': 'done', 'order': 0},
            {'time': '16:00', 'title': 'Học Toán', 'description': '2 trang xong', 'status': 'done', 'order': 1},
            {'time': '17:00', 'title': 'Vận động', 'description': '', 'status': 'partial', 'order': 2},
        ],
    }
    defaults.update(overrides)
    return defaults


@override_settings(DEBUG=True)
class CreateDiaryTests(TestCase):
    """Kiểm tra tạo nhật ký — POST /api/worker/tasks/<id>/care-diary/."""

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    def test_create_diary_task_in_progress_success(self):
        """Worker tạo nhật ký khi task in_progress → 201."""
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.data
        self.assertIn('carepartner', data)
        self.assertEqual(data['carepartner']['name'], 'Nguyễn Thị Lan')
        self.assertEqual(data['mood']['icon'], 'happy')
        self.assertEqual(data['completion']['percent'], 85)
        self.assertEqual(len(data['activities']), 3)
        self.assertEqual(data['activities'][0]['time'], '15:30')

    def test_create_diary_task_completed_success(self):
        """Worker tạo nhật ký khi task đã completed → 201 (cho phép bổ sung sau ca)."""
        self.task.status = 'completed'
        self.task.save()
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 201)

    def test_create_diary_task_open_rejected(self):
        """Task đang open → 400."""
        self.task.status = 'open'
        self.task.save()
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('đã bắt đầu', resp.data['error'].lower())

    def test_create_diary_wrong_worker_rejected(self):
        """Worker không phải người được accepted → 403."""
        other_worker = _make_worker('other_worker')
        self.client.force_authenticate(user=other_worker)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_create_diary_duplicate_rejected(self):
        """Đã tồn tại entry → 400 (dùng PATCH để sửa)."""
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(mood_label='Nội dung khác'), format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('đã tồn tại', resp.data['error'].lower())

    def test_create_diary_parent_forbidden(self):
        """Parent không được tạo nhật ký → 403."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_create_diary_anonymous_401(self):
        """Chưa đăng nhập → 401."""
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 401)


@override_settings(DEBUG=True)
class UpdateDiaryTests(TestCase):
    """Kiểm tra sửa nhật ký — PATCH /api/worker/tasks/<id>/care-diary/."""

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.other_worker = _make_worker('other_w_cd')
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)
        # Tạo entry trước
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )

    def test_patch_diary_success(self):
        """Chủ nhật ký sửa thành công → 200."""
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'mood_label': 'Bình thường', 'completion_percent': 60},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['mood']['label'], 'Bình thường')
        self.assertEqual(resp.data['completion']['percent'], 60)

    def test_patch_diary_replace_activities(self):
        """Gửi activities mới → xoá cũ, tạo mới."""
        new_acts = [
            {'time': '08:00', 'title': 'Mới 1', 'description': '', 'status': 'done', 'order': 0},
        ]
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'activities': new_acts},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['activities']), 1)
        self.assertEqual(resp.data['activities'][0]['title'], 'Mới 1')

    def test_patch_diary_wrong_worker_403(self):
        """Worker khác không được sửa → 403."""
        self.client.force_authenticate(user=self.other_worker)
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'mood_label': 'Hack'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_patch_diary_after_task_completed(self):
        """Cho phép sửa nhật ký kể cả khi task đã completed."""
        self.task.status = 'completed'
        self.task.save()
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'note': 'Bổ sung sau ca.'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['note'], 'Bổ sung sau ca.')


@override_settings(DEBUG=True)
class ReadDiaryTests(TestCase):
    """Kiểm tra xem nhật ký — GET /api/tasks/<id>/care-diary/."""

    def setUp(self):
        self.parent = _make_parent()
        self.other_parent = _make_parent('other_parent_cd')
        self.worker = _make_worker()
        self.other_worker = _make_worker('other_w_cd2')
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        # Tạo entry
        self.client.force_authenticate(user=self.worker)
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )

    def test_parent_can_read(self):
        """Parent chủ task xem được → 200."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['carepartner']['name'], 'Nguyễn Thị Lan')

    def test_worker_can_read_own(self):
        """Worker chủ nhật ký xem được → 200."""
        self.client.force_authenticate(user=self.worker)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)

    def test_other_parent_403(self):
        """Parent khác task → 403."""
        self.client.force_authenticate(user=self.other_parent)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 403)

    def test_other_worker_403(self):
        """Worker khác (không phải chủ nhật ký) → 403."""
        self.client.force_authenticate(user=self.other_worker)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_401(self):
        """Chưa đăng nhập → 401."""
        self.client.force_authenticate(user=None)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 401)

    def test_no_diary_yet_404_with_message(self):
        """Task chưa có nhật ký → 404 với message rõ ràng, không 500."""
        new_task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(new_task, self.worker)
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/tasks/{new_task.id}/care-diary/')
        self.assertEqual(resp.status_code, 404)
        self.assertIn('chưa có nhật ký', resp.data['error'].lower())


@override_settings(DEBUG=True)
class UploadAttachmentTests(TestCase):
    """Kiểm tra upload ảnh — POST /api/worker/tasks/<id>/care-diary/attachments/."""

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.other_worker = _make_worker('other_w_cd3')
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )

    def _make_image(self):
        return SimpleUploadedFile(
            'test.jpg', b'\xff\xd8\xff\xe0\x00\x10JFIF', content_type='image/jpeg',
        )

    def test_upload_success(self):
        """Upload ảnh thành công → 201, response có absolute URL."""
        img = self._make_image()
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/attachments/',
            {'images': [img]},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        attachments = resp.data['attachments']
        self.assertEqual(len(attachments), 1)
        # URL phải là absolute (có http:// hoặc https://)
        url = attachments[0]['url']
        self.assertTrue(url.startswith('http://') or url.startswith('https://'),
                        f'URL không absolute: {url}')

    def test_upload_no_images_400(self):
        """Không gửi ảnh → 400."""
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/attachments/',
            {},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_wrong_worker_403(self):
        """Worker khác không upload được → 403."""
        self.client.force_authenticate(user=self.other_worker)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/attachments/',
            {'images': [self._make_image()]},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 403)

    def test_upload_multiple_images(self):
        """Upload nhiều ảnh cùng lúc → tất cả thành công."""
        imgs = [self._make_image() for _ in range(3)]
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/attachments/',
            {'images': imgs},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.data['attachments']), 3)


@override_settings(DEBUG=True)
class ResponseContractTests(TestCase):
    """Kiểm tra response contract khớp với mobile.

    CareDiaryDetailScreen.js đọc các field:
      carepartner (name, role, avatarInitial, verified)
      date, mood (icon, label, note),
      completion (percent, stats: [{value, label, color}])
      activities (list: {time, title, desc, status})
      note, attachments (list: {id, type, url})
    """

    REQUIRED_TOP = {'id', 'carepartner', 'date', 'mood', 'completion', 'activities', 'note', 'attachments'}
    REQUIRED_CAREPARTNER = {'name', 'role', 'avatarInitial', 'verified'}
    REQUIRED_MOOD = {'icon', 'label', 'note'}
    REQUIRED_COMPLETION = {'percent', 'stats'}
    REQUIRED_ACTIVITY = {'time', 'title', 'desc', 'status'}

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )

    def test_create_response_has_required_fields(self):
        """POST response chứa đúng tất cả field mobile cần."""
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        # Top-level
        for f in self.REQUIRED_TOP:
            self.assertIn(f, data, f'Thiếu field {f}')
        # carepartner
        for f in self.REQUIRED_CAREPARTNER:
            self.assertIn(f, data['carepartner'], f'Thiếu carepartner.{f}')
        # mood
        for f in self.REQUIRED_MOOD:
            self.assertIn(f, data['mood'], f'Thiếu mood.{f}')
        # completion
        for f in self.REQUIRED_COMPLETION:
            self.assertIn(f, data['completion'], f'Thiếu completion.{f}')
        # activities
        for act in data['activities']:
            for f in self.REQUIRED_ACTIVITY:
                self.assertIn(f, act, f'Thiếu activity.{f}')

    def test_activity_field_name_is_desc_not_description(self):
        """Mobile đọc 'desc' (không phải 'description') — kiểm tra đúng tên field.

        Đây là lỗi #1 từng gặp ở A2: field name mobile gửi/nhận
        không khớp với backend.
        """
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        act = resp.data['activities'][0]
        self.assertIn('desc', act, "Field phải là 'desc' cho mobile")

    def test_stats_counts_correct(self):
        """Stats (đếm activities theo status) tính đúng.

        Payload có 2 done + 1 partial → stats phải là:
          total=3, done=2, partial=1, skipped=0.
        """
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        stats = resp.data['completion']['stats']
        self.assertEqual(stats[0]['value'], 3)   # total hoạt động
        self.assertEqual(stats[1]['value'], 2)   # hoàn thành tốt (done)
        self.assertEqual(stats[2]['value'], 1)   # cần cố gắng (partial)

    def test_stats_zero_activities_no_crash(self):
        """0 activity → stats = 0/0/0, không chia cho 0, không crash."""
        # Tạo entry không có activities
        new_task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(new_task, self.worker)
        self.client.post(
            f'/api/worker/tasks/{new_task.id}/care-diary/',
            _diary_payload(activities=[]),
            format='json',
        )
        resp = self.client.get(f'/api/tasks/{new_task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)
        stats = resp.data['completion']['stats']
        self.assertEqual(stats[0]['value'], 0)
        self.assertEqual(stats[1]['value'], 0)
        self.assertEqual(stats[2]['value'], 0)


@override_settings(DEBUG=True)
class CancelledTaskTests(TestCase):
    """Đảm bảo task cancelled không tạo được nhật ký (hành vi đúng)."""

    def test_create_diary_task_cancelled_rejected(self):
        """Task bị huỷ → 403 (application accepted nhưng task cancelled).

        Worker đã accepted trước đó, nhưng task bị hủy.
        Không cho ghi nhật ký cho task đã huỷ.
        """
        parent = _make_parent()
        worker = _make_worker()
        category = _make_category()
        task = _make_task(parent, category, status='cancelled')
        _accept_worker(task, worker)
        client = APIClient()
        client.force_authenticate(user=worker)
        resp = client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        # Task cancelled → task không còn in_progress/completed → 400
        self.assertIn(resp.status_code, (400, 403))


@override_settings(DEBUG=True)
class EdgeCaseValidationTests(TestCase):
    """Test các edge case validation — BUG-02 đến BUG-07."""

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    # === BUG-02: completion_percent không phải số → 400 ===
    def test_post_completion_percent_not_number_400(self):
        """completion_percent = 'abc' → 400, không 500."""
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(completion_percent='abc'),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('số nguyên', resp.data['error'])

    # === BUG-03: completion_percent âm → 400 ===
    def test_post_completion_percent_negative_400(self):
        """completion_percent = -5 → 400, không 500 IntegrityError."""
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(completion_percent=-5),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('0-100', resp.data['error'])

    # === BUG-04: completion_percent > 100 → 400 ===
    def test_post_completion_percent_over_100_400(self):
        """completion_percent = 150 → 400."""
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(completion_percent=150),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('0-100', resp.data['error'])

    # === BUG-02/03/04: PATCH cũng validate completion_percent ===
    def test_patch_completion_percent_negative_400(self):
        """PATCH completion_percent = -1 → 400."""
        # Tạo entry trước
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'completion_percent': -1},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('0-100', resp.data['error'])

    def test_patch_completion_percent_not_number_400(self):
        """PATCH completion_percent = 'xyz' → 400."""
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'completion_percent': 'xyz'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('số nguyên', resp.data['error'])

    def test_patch_completion_percent_over_100_400(self):
        """PATCH completion_percent = 999 → 400."""
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'completion_percent': 999},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('0-100', resp.data['error'])

    # === BUG-05: PATCH truncate mood_label dài ===
    def test_patch_mood_label_truncated_to_100(self):
        """PATCH mood_label 500 ký tự → response trả về đúng 100 ký tự (cắt ngắn)."""
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        long_label = 'A' * 500
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'mood_label': long_label},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['mood']['label']), 100)

    def test_patch_mood_icon_truncated_to_30(self):
        """PATCH mood_icon 100 ký tự → response trả về đúng 30 ký tự (cắt ngắn)."""
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        long_icon = 'B' * 100
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'mood_icon': long_icon},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['mood']['icon']), 30)

    # === BUG-06: activities[].status không hợp lệ → 400 ===
    def test_post_activity_invalid_status_400(self):
        """POST activity status='invalid' → 400, không âm thầm lưu."""
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(activities=[
                {'time': '15:30', 'title': 'Test', 'description': '', 'status': 'invalid_status', 'order': 0},
            ]),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('không hợp lệ', resp.data['error'])

    def test_patch_activity_invalid_status_400(self):
        """PATCH activity status='bị_lỗi' → 400."""
        self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'activities': [
                {'time': '08:00', 'title': 'Mới', 'description': '', 'status': 'bị_lỗi', 'order': 0},
            ]},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('không hợp lệ', resp.data['error'])

    # === BUG-07: Worker accepted, chưa tạo entry, GET → 404 (không phải 403) ===
    def test_worker_accepted_no_entry_get_404_not_403(self):
        """Worker đã accepted nhưng chưa tạo entry → GET trả 404, không phải 403."""
        # Không tạo entry — chỉ accept worker
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 404)
        self.assertIn('chưa có nhật ký', resp.data['error'].lower())


@override_settings(DEBUG=True)
class DiaryHistoryTests(TestCase):
    """Kiểm tra API lịch sử nhật ký — GET /api/parent/care-diary-history/."""

    def setUp(self):
        self.parent_a = _make_parent('parent_a')
        self.parent_b = _make_parent('parent_b')
        self.worker_a = _make_worker('worker_a')
        self.worker_b = _make_worker('worker_b')
        self.category = _make_category()
        self.client = APIClient()

    def _create_diary(self, parent, worker, task_title, scheduled_offset_days=0, **payload_kw):
        """Helper: tạo task + accept + tạo diary. Trả về task."""
        from django.utils import timezone as django_tz
        scheduled = django_tz.now() - django_tz.timedelta(days=scheduled_offset_days)
        task = _make_task(parent, self.category, status='in_progress',
                          title=task_title, scheduled_time=scheduled)
        _accept_worker(task, worker)
        self.client.force_authenticate(user=worker)
        self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(**payload_kw), format='json',
        )
        return task

    def test_parent_empty_history_returns_empty_list(self):
        """Phụ huynh chưa có nhật ký nào → trả mảng rỗng, không 500."""
        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_parent_only_sees_own_diaries(self):
        """Parent A không thấy nhật ký của parent B trong danh sách."""
        self._create_diary(self.parent_a, self.worker_a, 'Task A1', scheduled_offset_days=2)
        self._create_diary(self.parent_b, self.worker_b, 'Task B1', scheduled_offset_days=1)

        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['task_title'], 'Task A1')

    def test_history_sorted_newest_first(self):
        """Sắp xếp mới nhất trước (theo task.scheduled_time DESC)."""
        self._create_diary(self.parent_a, self.worker_a, 'Buổi cũ', scheduled_offset_days=5,
                           mood_label='Bình thường', completion_percent=60)
        self._create_diary(self.parent_a, self.worker_a, 'Buổi mới', scheduled_offset_days=1,
                           mood_label='Vui vẻ', completion_percent=90)
        self._create_diary(self.parent_a, self.worker_a, 'Buổi giữa', scheduled_offset_days=3,
                           mood_label='Cần chú ý', completion_percent=70)

        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 3)
        titles = [item['task_title'] for item in resp.data]
        self.assertEqual(titles, ['Buổi mới', 'Buổi giữa', 'Buổi cũ'])

    def test_history_response_contract(self):
        """Mỗi item có đúng field mobile cần: task_id, task_title, date, mood, completion_percent, worker_name."""
        self._create_diary(self.parent_a, self.worker_a, 'Contract test')

        self.client.force_authenticate(user=self.parent_a)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        item = resp.data[0]
        # Required fields cho CareDiaryHistoryScreen.js
        for field in ('task_id', 'task_title', 'date', 'mood', 'completion_percent', 'worker_name'):
            self.assertIn(field, item, f'Thiếu field {field}')
        # mood có icon + label
        self.assertIn('icon', item['mood'])
        self.assertIn('label', item['mood'])
        self.assertEqual(item['worker_name'], 'Nguyễn Thị Lan')

    def test_worker_cannot_access_history(self):
        """Worker gọi API lịch sử → 403."""
        self.client.force_authenticate(user=self.worker_a)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_cannot_access_history(self):
        """Chưa đăng nhập → 401."""
        self.client.force_authenticate(user=None)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 401)


class Bug10DateFieldTests(TestCase):
    """BUG-10: field 'date' phải phản ánh task.scheduled_time, không phải entry.created_at.

    Tạo task với scheduled_time cách đây N ngày, ghi nhật ký "hôm nay"
    (entry.created_at khác scheduled_time), rồi assert field 'date'
    chứa đúng nội dung ngày của scheduled_time.
    """

    def setUp(self):
        self.parent = _make_parent('parent_b10')
        self.worker = _make_worker('worker_b10')
        self.category = _make_category()
        self.client = APIClient()

    def test_history_date_uses_scheduled_time_not_created_at(self):
        """Lịch sử: field 'date' = scheduled_time (3 ngày trước), KHÔNG phải created_at."""
        scheduled = django_tz.now() - django_tz.timedelta(days=3)
        task = _make_task(
            self.parent, self.category, status='in_progress',
            title='Buổi 3 ngày trước', scheduled_time=scheduled,
        )
        _accept_worker(task, self.worker)
        self.client.force_authenticate(user=self.worker)
        self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(), format='json',
        )

        self.client.force_authenticate(user=self.parent)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

        # scheduled_time = 3 ngày trước → date phải chứa ngày của 3 ngày trước
        local_scheduled = django_tz.localtime(scheduled)
        expected_day = local_scheduled.day
        expected_month = local_scheduled.month
        expected_year = local_scheduled.year

        date_str = resp.data[0]['date']
        # Kiểm tra nội dung ngày, không chỉ tồn tại field
        self.assertIn(str(expected_day), date_str,
                        f"date '{date_str}' phải chứa ngày {expected_day} (scheduled_time)")
        self.assertIn(f'Tháng {expected_month}', date_str,
                        f"date '{date_str}' phải chứa Tháng {expected_month}")
        self.assertIn(str(expected_year), date_str,
                        f"date '{date_str}' phải chứa năm {expected_year}")

    def test_detail_date_uses_scheduled_time_not_created_at(self):
        """Chi tiết: field 'date' = scheduled_time (5 ngày trước), KHÔNG phải created_at."""
        scheduled = django_tz.now() - django_tz.timedelta(days=5)
        task = _make_task(
            self.parent, self.category, status='in_progress',
            title='Buổi 5 ngày trước', scheduled_time=scheduled,
        )
        _accept_worker(task, self.worker)
        self.client.force_authenticate(user=self.worker)
        self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(), format='json',
        )

        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/tasks/{task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)

        local_scheduled = django_tz.localtime(scheduled)
        expected_day = local_scheduled.day
        expected_month = local_scheduled.month

        date_str = resp.data['date']
        self.assertIn(str(expected_day), date_str,
                        f"date '{date_str}' phải chứa ngày {expected_day} (scheduled_time)")
        self.assertIn(f'Tháng {expected_month}', date_str,
                        f"date '{date_str}' phải chứa Tháng {expected_month}")
