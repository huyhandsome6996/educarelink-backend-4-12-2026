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
from unittest import mock

from core.models import User, Task, ServiceCategory, TaskApplication

# CARE DIARY NÂNG CẤP — dùng trong AssessmentFormTests
from care_diary.models import CareDiaryEntry


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


@override_settings(DEBUG=True)
class MoodIconNormalizationTests(TestCase):
    """2026-09-15 — Chuẩn hoá mood_icon thống nhất 3 nền tảng.

    Bối cảnh: mobile form gửi 'happy/sad/alert-circle/thumbs-up', web form gửi
    'happy/neutral/sad/excited', seed/demo cũ lưu emoji (🎨 😊). Không chuẩn hoá
    thì icon trống/không khớp khi client khác đọc lại (Ionicons không có
    'neutral'/'excited'/emoji). API trả về mood.icon canonical ở CẢ detail và
    history; dữ liệu ghi mới cũng được normalize ngay khi lưu.
    """

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.category = _make_category()
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()

    def test_normalize_unit_aliases(self):
        from care_diary.services import normalize_mood_icon
        self.assertEqual(normalize_mood_icon('🎨'), 'excited')
        self.assertEqual(normalize_mood_icon('😊'), 'happy')
        self.assertEqual(normalize_mood_icon('👍'), 'thumbs-up')
        self.assertEqual(normalize_mood_icon('⚠️'), 'alert-circle')
        self.assertEqual(normalize_mood_icon('warning'), 'alert-circle')
        self.assertEqual(normalize_mood_icon('thumb_up'), 'thumbs-up')
        # giá trị canonical đi qua nguyên vẹn
        self.assertEqual(normalize_mood_icon('happy'), 'happy')
        self.assertEqual(normalize_mood_icon('neutral'), 'neutral')
        self.assertEqual(normalize_mood_icon('excited'), 'excited')
        self.assertEqual(normalize_mood_icon(''), '')

    def test_post_normalizes_emoji_mood(self):
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(mood_icon='🎨', mood_label='Hào hứng'),
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['mood']['icon'], 'excited')

    def test_patch_normalizes_emoji_mood(self):
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            _diary_payload(), format='json',
        )
        self.assertEqual(resp.status_code, 201)
        resp2 = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'mood_icon': '😊'}, format='json',
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data['mood']['icon'], 'happy')

    def test_detail_response_normalizes_legacy_emoji(self):
        """Dữ liệu cũ đã lưu emoji trong DB → khi ĐỌC vẫn trả canonical."""
        from care_diary.models import CareDiaryEntry
        entry = CareDiaryEntry.objects.create(
            task=self.task, worker=self.worker,
            mood_icon='😊', mood_label='Vui vẻ',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['mood']['icon'], 'happy')

    def test_history_response_normalizes_legacy_emoji(self):
        from care_diary.models import CareDiaryEntry
        CareDiaryEntry.objects.create(
            task=self.task, worker=self.worker,
            mood_icon='🎨', mood_label='Hào hứng',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get('/api/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data[0]['mood']['icon'], 'excited')


# ═══════════════════════════════════════════════════════════════════
# CARE DIARY NÂNG CẤP — Form đánh giá chuyên sâu theo danh mục
# (tutoring / childcare / general — validate field-level theo API contract)
# ═══════════════════════════════════════════════════════════════════

def _tutoring_assessment(**overrides):
    """assessment_data chuẩn cho form Gia sư (theo spec mục 2.1)."""
    defaults = {
        'schema_version': 1,
        'lesson_content': {
            'subject': 'Toán',
            'topic': 'Phép nhân phân số & bài toán tìm X',
            'is_new_knowledge': True,
            'is_review': False,
        },
        'comprehension': {
            'score': 4,
            'score_label': 'Hiểu bài nhanh',
            'attitude': 'Rất tập trung, hăng hái',
        },
        'classwork_homework': {
            'classwork_status': 'Đã giải quyết 10 bài tập trong SGK và đề cương',
            'homework': 'Trang 45-46, bài 1-5, SBT Toán',
        },
        'remarks': {
            'knowledge_gap': 'Con còn nhầm lẫn quy tắc đổi dấu khi chuyển vế',
            'next_session_plan': 'Ôn lại giải phương trình bậc nhất',
        },
    }
    defaults.update(overrides)
    return defaults


def _childcare_assessment(**overrides):
    """assessment_data chuẩn cho form Trông trẻ (theo spec mục 2.2)."""
    defaults = {
        'schema_version': 1,
        'meals': [
            {'time': '11:30', 'meal': 'Cơm trưa + canh rau', 'amount': 'Ăn hết suất'},
            {'time': '15:00', 'meal': 'Sữa', 'amount': 'Uống 200ml'},
        ],
        'nap': {
            'start_time': '12:30',
            'end_time': '14:15',
            'quality': 'Ngủ ngon, sâu giấc',
        },
        'hygiene_health': {
            'diaper_toilet': 'Thay tã 2 lần, đi vệ sinh bình thường',
            'physical_condition': 'Nhiệt độ cơ thể bình thường, tỉnh táo',
        },
        'activities': {
            'list': ['Đọc truyện', 'Xếp hình Lego'],
            'mood_during': 'Vui vẻ, quấn quýt',
        },
        'notes_for_parents': 'Bé hơi ho nhẹ cuối buổi, phụ huynh theo dõi thêm nhé',
    }
    defaults.update(overrides)
    return defaults


@override_settings(DEBUG=True)
class AssessmentFormTests(TestCase):
    """Form đánh giá chuyên sâu: tutoring (Gia sư), childcare (Trông trẻ),
    general (mặc định/tương thích ngược). Endpoint POST/PATCH
    /api/worker/tasks/<id>/care-diary/ + GET /api/tasks/<id>/care-diary/."""

    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.category = _make_category('Gia sư')
        self.task = _make_task(self.parent, self.category, status='in_progress')
        _accept_worker(self.task, self.worker)
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    def _post(self, payload):
        return self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/', payload, format='json',
        )

    # --- 1. Tạo nhật ký Gia sư hợp lệ → 201, lưu đúng assessment_data ---
    def test_create_tutoring_assessment_success(self):
        resp = self._post(_diary_payload(
            assessment_type='tutoring',
            assessment_data=_tutoring_assessment(),
        ))
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['assessment_type'], 'tutoring')
        self.assertEqual(
            resp.data['assessment_data']['lesson_content']['subject'], 'Toán')
        self.assertEqual(resp.data['assessment_data']['comprehension']['score'], 4)
        # Entry lưu DB đúng (kể cả schema_version được giữ lại)
        entry = CareDiaryEntry.objects.get(task_id=self.task.id)
        self.assertEqual(entry.assessment_type, 'tutoring')
        self.assertEqual(entry.assessment_data['schema_version'], 1)

    # --- 2. Thiếu comprehension.score → 400, đúng message field-level ---
    def test_create_tutoring_missing_score_400(self):
        data = _tutoring_assessment()
        del data['comprehension']['score']
        resp = self._post(_diary_payload(
            assessment_type='tutoring', assessment_data=data,
        ))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('comprehension', resp.data.get('assessment_data', {}))
        self.assertIn(
            "Trường 'score' là bắt buộc và phải từ 1 đến 5.",
            resp.data['assessment_data']['comprehension'],
        )

    # --- 2b. Score ngoài khoảng 1-5 (0 và 6) đều bị chặn ---
    def test_create_tutoring_score_out_of_range_400(self):
        for bad_score in (0, 6):
            data = _tutoring_assessment()
            data['comprehension']['score'] = bad_score
            resp = self._post(_diary_payload(
                assessment_type='tutoring', assessment_data=data,
            ))
            self.assertEqual(resp.status_code, 400, f'score={bad_score} phải bị chặn')
            self.assertIn('comprehension', resp.data['assessment_data'])

    # --- 3. Tạo nhật ký Trông trẻ hợp lệ → 201 ---
    def test_create_childcare_assessment_success(self):
        cat = ServiceCategory.objects.create(name='Trông trẻ', icon_name='Heart')
        task = _make_task(self.parent, cat, status='in_progress')
        _accept_worker(task, self.worker)
        resp = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(
                assessment_type='childcare',
                assessment_data=_childcare_assessment(),
            ),
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['assessment_type'], 'childcare')
        self.assertEqual(len(resp.data['assessment_data']['meals']), 2)

    # --- 4. Thiếu nap.quality → 400 ---
    def test_create_childcare_missing_nap_quality_400(self):
        cat = ServiceCategory.objects.create(name='Trông trẻ', icon_name='Heart')
        task = _make_task(self.parent, cat, status='in_progress')
        _accept_worker(task, self.worker)
        data = _childcare_assessment()
        del data['nap']['quality']
        resp = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='childcare', assessment_data=data),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn(
            "Trường 'quality' là bắt buộc.", resp.data['assessment_data']['nap'])

    # --- 4b. meals rỗng/hết phần tử → 400; activities.list rỗng vẫn OK ---
    def test_create_childcare_empty_meals_400_but_empty_activities_ok(self):
        cat = ServiceCategory.objects.create(name='Trông trẻ', icon_name='Heart')
        task = _make_task(self.parent, cat, status='in_progress')
        _accept_worker(task, self.worker)
        # meals = [] → 400
        resp = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='childcare',
                           assessment_data=_childcare_assessment(meals=[])),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('meals', resp.data['assessment_data'])
        # activities.list = [] + notes_for_parents = '' → vẫn 201
        data = _childcare_assessment(activities={'list': [], 'mood_during': ''},
                                     notes_for_parents='')
        resp2 = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='childcare', assessment_data=data),
            format='json',
        )
        self.assertEqual(resp2.status_code, 201)

    # --- 5. Danh mục khác ("Đón trẻ") gửi general → 201, không bị chặn ---
    def test_other_category_general_allowed(self):
        cat = ServiceCategory.objects.create(name='Đón trẻ', icon_name='Baby')
        task = _make_task(self.parent, cat, status='in_progress')
        _accept_worker(task, self.worker)
        resp = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='general', assessment_data={}),
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['assessment_type'], 'general')
        self.assertEqual(resp.data['assessment_data'], {})

    # --- 5b. Không gửi assessment_type → mặc định general (tương thích cũ) ---
    def test_missing_assessment_type_defaults_general(self):
        resp = self._post(_diary_payload())
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['assessment_type'], 'general')
        self.assertEqual(resp.data['assessment_data'], {})

    # --- 6. Task Gia sư gửi nhầm childcare → 400 đúng thông điệp ---
    def test_wrong_type_for_category_400(self):
        resp = self._post(_diary_payload(
            assessment_type='childcare',
            assessment_data=_childcare_assessment(),
        ))
        self.assertEqual(resp.status_code, 400)
        self.assertIn(
            "Danh mục công việc này không hỗ trợ loại đánh giá 'childcare'.",
            resp.data['assessment_type'],
        )

    # --- 6b. assessment_type lạ hoàn toàn → 400 ---
    def test_invalid_assessment_type_400(self):
        resp = self._post(_diary_payload(assessment_type='cleaning', assessment_data={}))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('assessment_type', resp.data)

    # --- 7. Parent GET → response đủ assessment_type/assessment_data ---
    def test_parent_get_contains_assessment_fields(self):
        self._post(_diary_payload(
            assessment_type='tutoring',
            assessment_data=_tutoring_assessment(),
        ))
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['assessment_type'], 'tutoring')
        self.assertEqual(resp.data['assessment_data']['lesson_content']['subject'], 'Toán')
        # Data isolation — parent khác vẫn không xem được (regression B1)
        other_parent = _make_parent('other_parent_cd')
        self.client.force_authenticate(user=other_parent)
        resp2 = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp2.status_code, 403)

    # --- 8. Entry cũ trước migration (không set 2 trường mới) vẫn GET/PATCH OK ---
    def test_legacy_entry_get_and_patch_still_work(self):
        # Tạo bằng ORM không set assessment_type/assessment_data → mặc định
        # (giả lập entry cũ load lại từ DB sau migration).
        entry = CareDiaryEntry.objects.create(
            task=self.task, worker=self.worker,
            mood_icon='happy', mood_label='Vui vẻ',
        )
        entry.refresh_from_db()
        self.assertEqual(entry.assessment_type, 'general')
        self.assertEqual(entry.assessment_data, {})
        # GET bình thường
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/tasks/{self.task.id}/care-diary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['assessment_type'], 'general')
        self.assertEqual(resp.data['assessment_data'], {})
        # PATCH mood (không đụng assessment) vẫn OK
        self.client.force_authenticate(user=self.worker)
        resp2 = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'note': 'Bổ sung sau ca.'}, format='json',
        )
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data['assessment_type'], 'general')

    # --- 8b. PATCH cập nhật assessment (nâng cấp general → tutoring) ---
    def test_patch_assessment_upgrade_success(self):
        self._post(_diary_payload())  # tạo general trước
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'assessment_type': 'tutoring',
             'assessment_data': _tutoring_assessment()},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['assessment_type'], 'tutoring')
        self.assertEqual(
            resp.data['assessment_data']['classwork_homework']['classwork_status'],
            'Đã giải quyết 10 bài tập trong SGK và đề cương',
        )
        entry = CareDiaryEntry.objects.get(task_id=self.task.id)
        self.assertEqual(entry.assessment_type, 'tutoring')

    # --- 8c. PATCH gửi assessment thiếu field → 400 field-level ---
    def test_patch_assessment_missing_subject_400(self):
        self._post(_diary_payload(assessment_type='tutoring',
                                  assessment_data=_tutoring_assessment()))
        data = _tutoring_assessment()
        del data['lesson_content']['subject']
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'assessment_type': 'tutoring', 'assessment_data': data},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn(
            "Trường 'subject' là bắt buộc.",
            resp.data['assessment_data']['lesson_content'],
        )

    # --- 8d. Multipart form: assessment_data gửi dạng chuỗi JSON vẫn hợp lệ ---
    def test_multipart_assessment_data_as_json_string(self):
        import json as _json
        resp = self.client.post(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {
                'mood_icon': 'happy',
                'mood_label': 'Vui vẻ',
                'completion_percent': 90,
                'assessment_type': 'tutoring',
                'assessment_data': _json.dumps(_tutoring_assessment()),
            },
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['assessment_type'], 'tutoring')

    # --- 8e. Task không có category (SET_NULL) chỉ nhận general ---
    def test_task_without_category_only_general(self):
        task = _make_task(self.parent, None, status='in_progress')
        _accept_worker(task, self.worker)
        resp = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='tutoring',
                           assessment_data=_tutoring_assessment()),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        resp2 = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='general'),
            format='json',
        )
        self.assertEqual(resp2.status_code, 201)

    # --- 9. C1 — race condition double-POST → 400 thân thiện, không 500 ---
    def test_concurrent_duplicate_post_returns_400_not_500(self):
        """C1 — 2 request POST đồng thời: request sau vượt qua bước exists()
        (check tầng application) nhưng chạm ràng buộc unique OneToOne ngay ở
        tầng DB. Phải trả 400 với thông điệp thân thiện, không để lộ 500
        IntegrityError — kịch bản double-tap / retry khi mạng chập chờn."""
        # Request 1 insert thành công
        self._post(_diary_payload())
        # Giả lập race: exists() của bước chống trùng trả False (đã kiểm tra
        # trước khi request 1 kịp commit), nhưng create() vẫn chạm unique DB.
        with mock.patch('django.db.models.query.QuerySet.exists',
                        return_value=False):
            resp = self._post(_diary_payload(mood_label='Gửi trùng do mạng chập chờn'))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('đã tồn tại', resp.data.get('error', ''))
        # DB vẫn đúng 1 entry — không tạo trùng
        self.assertEqual(
            CareDiaryEntry.objects.filter(task_id=self.task.id).count(), 1)

    # --- 10. H1 — hạ cấp về general KHÔNG kèm confirm → 400, giữ nguyên data ---
    def test_patch_downgrade_to_general_without_confirm_400(self):
        """H1 — PATCH assessment_type=general khi entry tutoring đang có
        assessment_data phải bị chặn (400) để không mất dữ liệu âm thầm."""
        self._post(_diary_payload(assessment_type='tutoring',
                                  assessment_data=_tutoring_assessment()))
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'assessment_type': 'general', 'assessment_data': {}},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('assessment_type', resp.data)
        self.assertIn(
            'confirm_clear_assessment',
            str(resp.data['assessment_type']),
        )
        # Dữ liệu cũ KHÔNG bị xóa — vẫn nguyên tutoring + data đầy đủ
        entry = CareDiaryEntry.objects.get(task_id=self.task.id)
        self.assertEqual(entry.assessment_type, 'tutoring')
        self.assertEqual(
            entry.assessment_data['lesson_content']['subject'], 'Toán')

    # --- 10b. H1 — hạ cấp kèm confirm_clear_assessment=true → 200, data xóa rõ ràng ---
    def test_patch_downgrade_to_general_with_confirm_200(self):
        """H1 — kèm confirm_clear_assessment=true → cho phép hạ cấp, dữ liệu
        được xóa một cách chủ đích (không còn là mất dữ liệu âm thầm)."""
        self._post(_diary_payload(assessment_type='tutoring',
                                  assessment_data=_tutoring_assessment()))
        resp = self.client.patch(
            f'/api/worker/tasks/{self.task.id}/care-diary/',
            {'assessment_type': 'general', 'assessment_data': {},
             'confirm_clear_assessment': True},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['assessment_type'], 'general')
        self.assertEqual(resp.data['assessment_data'], {})
        entry = CareDiaryEntry.objects.get(task_id=self.task.id)
        self.assertEqual(entry.assessment_type, 'general')
        self.assertEqual(entry.assessment_data, {})

    # --- 11. M2 — trường text vượt trần 2000 ký tự → 400 đúng message ---
    def test_tutoring_text_field_over_limit_400(self):
        """M2 — chặn phình DB/DoS: subject quá dài phải bị chặn ở server."""
        data = _tutoring_assessment()
        data['lesson_content']['subject'] = 'A' * 2001
        resp = self._post(_diary_payload(
            assessment_type='tutoring', assessment_data=data,
        ))
        self.assertEqual(resp.status_code, 400)
        self.assertIn(
            "Trường 'subject' không được vượt quá 2000 ký tự.",
            resp.data['assessment_data']['lesson_content'],
        )
        # Đúng trần (2000 ký tự) → vẫn 201
        data['lesson_content']['subject'] = 'A' * 2000
        resp2 = self._post(_diary_payload(
            assessment_type='tutoring', assessment_data=data,
        ))
        self.assertEqual(resp2.status_code, 201)

    # --- 11b. M2 — meals vượt trần 20 phần tử → 400 ---
    def test_childcare_meals_over_limit_400(self):
        """M2 — mảng meals không được vượt quá MAX_MEALS=20 phần tử."""
        cat = ServiceCategory.objects.create(name='Trông trẻ', icon_name='Heart')
        task = _make_task(self.parent, cat, status='in_progress')
        _accept_worker(task, self.worker)
        meals = [{'time': f'{8 + i // 60:02d}:{i % 60:02d}',
                  'meal': f'Bữa {i}', 'amount': 'Hết suất'}
                 for i in range(21)]
        data = _childcare_assessment(meals=meals)
        resp = self.client.post(
            f'/api/worker/tasks/{task.id}/care-diary/',
            _diary_payload(assessment_type='childcare', assessment_data=data),
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn(
            'Không được vượt quá 20 bữa ăn.',
            resp.data['assessment_data']['meals'],
        )

    # --- 12. M1 — đổi name hiển thị (giữ nguyên code) không làm vỡ mapping ---
    def test_category_rename_display_name_does_not_break_assessment_type(self):
        """M1 — mapping theo category.code (ổn định), không theo name:
        admin đổi tên hiển thị thì form đánh giá vẫn hoạt động đúng."""
        # _make_category('Gia sư') → save() tự sinh code 'gia-su'
        self.assertEqual(self.category.code, 'gia-su')
        # Admin đổi tên hiển thị — code giữ nguyên
        self.category.name = 'Gia sư 1 kèm 1 (cao cấp)'
        self.category.save()
        self.category.refresh_from_db()
        self.assertEqual(self.category.code, 'gia-su')
        self.assertEqual(self.category.name, 'Gia sư 1 kèm 1 (cao cấp)')
        # Mapping assessment vẫn hoạt động đúng → 201
        resp = self._post(_diary_payload(
            assessment_type='tutoring',
            assessment_data=_tutoring_assessment(),
        ))
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['assessment_type'], 'tutoring')
