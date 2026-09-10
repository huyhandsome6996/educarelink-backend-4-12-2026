"""
moderation/tests_three_categories.py — Kiểm thử khóa chặt 3 danh mục
(Gia sư, Đón trẻ, Trông trẻ) — QA 2026-09-10 Vấn đề #1.

Phủ 4 lớp bảo vệ:
  1. Rule-based keyword chặn ngay lúc đăng (_check_banned_keywords)
  2. API gate 400 trong TaskListCreateAPIView (không đợi AI)
  3. Background Scanner 60s tự hủy task vi phạm lọt lưới
  4. Migration khóa mềm danh mục cũ (is_active=False)
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from core.models import ServiceCategory, Task, User
from moderation.services import ALLOWED_CATEGORY_NAMES, _check_banned_keywords


class CategoryKeywordRuleTests(TestCase):
    """Lớp 1 — bộ lọc từ khóa chỉ chấp nhận 3 danh mục."""

    def _check(self, title, description='', price=100000):
        return _check_banned_keywords(title, description, price)

    def test_three_categories_accepted(self):
        samples = [
            ('Gia sư Toán lớp 9', 'Dạy kèm hằng đẳng thức 2 buổi'),
            ('Gia sư Tiếng Anh giao tiếp', 'Luyện phát âm cho bé 8 tuổi'),
            ('Đón bé tan trường Vĩnh Ninh', 'Đón lúc 16h30, có xe máy + bảo hiểm'),
            ('Đón con đi học về', 'Trường tiểu học về nhà an toàn'),
            ('Trông bé 3 tuổi buổi sáng', 'Chơi cùng bé, cho uống sữa, xếp hình'),
            ('Giữ trẻ cuối tuần', 'Babysitter chăm sóc trẻ tại nhà'),
        ]
        for title, desc in samples:
            with self.subTest(title=title):
                self.assertFalse(self._check(title, desc)['banned'], title)

    def test_legacy_categories_rejected(self):
        samples = [
            ('Dọn dẹp tổng vệ sinh căn hộ', 'Lau sàn lau kính 2 phòng ngủ'),
            ('Nấu bữa cơm tối gia đình', 'Nấu canh chua cá lóc, thịt kho'),
            ('Mua sắm hộ thực phẩm', 'Đi siêu thị mua đồ theo danh sách'),
            ('Massage thư giãn tại nhà', 'Massage cổ vai gáy giờ cố định'),
            ('Rửa xe máy tại nhà', 'Rửa xe giờ cố định'),
            ('Chuyển nhà giúp', 'Chuyên chở đồ đi chuyển trọ'),
        ]
        for title, desc in samples:
            with self.subTest(title=title):
                result = self._check(title, desc)
                self.assertTrue(result['banned'], title)

    def test_outside_category_reason_mentions_three_categories(self):
        """Task ngoài 3 danh mục (không trúng banned-word) phải bị chặn với
        lý do nhắc đúng '3 danh mục'."""
        result = _check_banned_keywords(
            'Rửa xe máy tại nhà', 'Rửa xe giờ cố định, giá rẻ.', 100000)
        self.assertTrue(result['banned'])
        self.assertIn('3 danh mục', result['reason'])


class TaskCreateCategoryGateTests(TestCase):
    """Lớp 2 — API tạo Task chặn 400 ngay khi category sai / bị khóa."""

    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.parent = User.objects.create_user('gate_parent', password='x', role='parent')
        self.client.force_authenticate(self.parent)
        self.cat_gia_su = ServiceCategory.objects.create(name='Gia sư', is_active=True)
        self.cat_don_dep = ServiceCategory.objects.create(name='Dọn dẹp nhà cửa', is_active=False)

    def _payload(self, cat_id):
        return {
            'title': 'Gia sư Toán lớp 8',
            'description': 'Dạy kèm 2 buổi ôn thi giữa kỳ',
            'price': 200000,
            'category': cat_id,
            'location': '32 Lê Lợi, TP. Huế',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }

    def test_valid_three_category_passes_gate(self):
        resp = self.client.post('/api/tasks/', self._payload(self.cat_gia_su.id), format='json')
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_locked_category_returns_400(self):
        resp = self.client.post('/api/tasks/', self._payload(self.cat_don_dep.id), format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('3 danh mục', resp.json()['error'])

    def test_unknown_category_returns_400(self):
        resp = self.client.post('/api/tasks/', self._payload(99999), format='json')
        self.assertEqual(resp.status_code, 400)

    def test_missing_category_returns_400(self):
        payload = self._payload(self.cat_gia_su.id)
        payload.pop('category')
        resp = self.client.post('/api/tasks/', payload, format='json')
        self.assertEqual(resp.status_code, 400)


class CategoryScannerTests(TestCase):
    """Lớp 3 — scanner 60s tự hủy task vi phạm lọt lưới."""

    def setUp(self):
        self.parent = User.objects.create_user('scan_parent', password='x', role='parent')

    def _make_open_task(self, title, desc):
        cat = ServiceCategory.objects.create(name='Gia sư', is_active=True)
        return Task.objects.create(
            title=title, description=desc, price=100000, category=cat,
            parent=self.parent, location='Huế',
            scheduled_time=timezone.now() + timedelta(days=1), status='open')

    def test_scanner_cancels_violating_open_task(self):
        task = self._make_open_task(
            'Dọn dẹp nhà cửa cấp tốc',
            'Cần người lau dọn toàn bộ nhà 1 trệt 1 lầu trong 3 giờ.')
        from moderation.scheduler import scan_violating_tasks
        scan_violating_tasks()
        task.refresh_from_db()
        self.assertEqual(task.status, 'cancelled')
        from moderation.models import TaskModeration
        mod = TaskModeration.objects.get(task=task)
        self.assertEqual(mod.status, 'rejected')

    def test_scanner_executes_pending_ai_rejection(self):
        """AI đã reject nhưng task còn open → scanner thực thi lệnh trong 60s.
        Lưu ý: signal post_save đã tự tạo TaskModeration pending khi Task
        được tạo → dùng update_or_create."""
        task = self._make_open_task(
            'Trông trẻ + nấu ăn gia đình',
            'Trông bé và nấu bữa tối cho cả nhà.')
        from moderation.models import TaskModeration
        TaskModeration.objects.update_or_create(
            task=task,
            defaults={'status': 'rejected',
                      'ai_verdict': 'Công việc chứa nấu ăn — ngoài 3 danh mục cho phép.',
                      'ai_confidence': 1.0})
        from moderation.scheduler import scan_violating_tasks
        scan_violating_tasks()
        task.refresh_from_db()
        self.assertEqual(task.status, 'cancelled')

    def test_scanner_respects_admin_override(self):
        """Admin đã duyệt thủ công (admin_approved) → scanner KHÔNG hủy."""
        task = self._make_open_task(
            'Gia sư Toán lớp 12 luyện thi đại học',
            'Ôn thi đại học khối A1 — toán lý anh.')
        from moderation.models import TaskModeration
        TaskModeration.objects.update_or_create(task=task, defaults={'status': 'admin_approved'})
        from moderation.scheduler import scan_violating_tasks
        scan_violating_tasks()
        task.refresh_from_db()
        self.assertEqual(task.status, 'open')

    def test_scanner_leaves_valid_tasks_untouched(self):
        task = self._make_open_task(
            'Đón bé trường mầm non về nhà',
            'Đón bé 5 tuổi lúc 16h15 đưa về tận nhà.')
        from moderation.scheduler import scan_violating_tasks
        scan_violating_tasks()
        task.refresh_from_db()
        self.assertEqual(task.status, 'open')


class LegacyCategoryLockTests(TestCase):
    """Lớp 4 — migration khóa mềm danh mục cũ + seed chỉ mở 3 danh mục."""

    def test_migration_locked_legacy_categories(self):
        """0024 khóa mềm mọi danh mục ngoài 3 danh mục chuẩn."""
        legacy = ServiceCategory.objects.create(name='Nấu ăn', is_active=True)
        legacy2 = ServiceCategory.objects.create(name='Khác', is_active=True)
        valid = ServiceCategory.objects.create(name='Đón trẻ', is_active=True)
        from django.apps import apps
        from importlib import import_module
        migration = import_module('core.migrations.0024_lock_legacy_categories')
        # Hàm chỉ dùng apps (không đụng schema_editor) — truyền None an toàn
        migration.lock_legacy_categories(apps, None)
        legacy.refresh_from_db()
        legacy2.refresh_from_db()
        valid.refresh_from_db()
        self.assertFalse(legacy.is_active)
        self.assertFalse(legacy2.is_active)
        self.assertTrue(valid.is_active)

    def test_allow_list_constant(self):
        self.assertEqual(set(ALLOWED_CATEGORY_NAMES), {'Gia sư', 'Đón trẻ', 'Trông trẻ'})
