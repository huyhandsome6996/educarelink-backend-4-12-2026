"""
Tests cho chức năng Đánh giá (Review).

Phục vụ fix bug 2026-07-21:
- Lỗi: phụ huynh submit review cho task đã có review → DRF auto-sinh
  UniqueValidator trên ReviewSerializer.task chặn request, raise
  lỗi auto-dịch "review có task đã tồn tại." khó hiểu.
- Fix: chuyển ReviewCreateAPIView sang upsert (create hoặc update).

Các test case:
1. Tạo review mới — task chưa có review → 201 Created.
2. Update review (upsert) — task đã có review → 200 OK, rating + comment được cập nhật.
3. Không cho review task chưa hoàn thành → 400.
4. Không cho review task của người khác → 400.
5. Không cho review task chưa có worker được accept → 400.
6. Validate rating ngoài khoảng 1-5 → 400.
7. Phải đăng nhập mới gọi được endpoint → 401.
8. AI consumers vẫn đọc Review bình thường (smoke test cho ai_recommendations).
"""
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from datetime import datetime, timedelta, timezone as dt_tz

from core.models import User, ServiceCategory, Task, TaskApplication, Review

User = get_user_model()


def _make_user(username, role='parent', is_approved=True):
    """Helper — tạo user test."""
    return User.objects.create_user(
        username=username,
        password='Test@2026',
        role=role,
        is_approved=is_approved,
    )


def _make_task(parent, worker, status='completed', title='Test task'):
    """Helper — tạo task + TaskApplication accepted để chuẩn bị review."""
    cat = ServiceCategory.objects.create(name=f'Cat-{title}')
    task = Task.objects.create(
        title=title,
        description='Mô tả test',
        price=100000,
        status=status,
        parent=parent,
        category=cat,
        location='Hà Nội',
        scheduled_time=datetime.now(dt_tz.utc) + timedelta(days=1),
    )
    # Tạo application với status='accepted'
    TaskApplication.objects.create(
        task=task,
        worker=worker,
        status='accepted',
    )
    return task


class ReviewCreateAPIViewTests(TestCase):
    """Test suite cho /parent/review/ endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_user('parent_test', role='parent')
        self.other_parent = _make_user('other_parent_test', role='parent')
        self.worker = _make_user('worker_test', role='worker', is_approved=True)
        self.url = '/api/parent/review/'

    # ------------------------------------------------------------------
    # 1. Happy path: tạo review mới
    # ------------------------------------------------------------------
    def test_create_new_review_returns_201(self):
        """Task chưa có review → tạo mới thành công, HTTP 201."""
        task = _make_task(self.parent, self.worker, status='completed')
        self.client.force_authenticate(user=self.parent)

        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 5,
            'comment': 'Rất tốt',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertTrue(Review.objects.filter(task=task).exists())
        review = Review.objects.get(task=task)
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.comment, 'Rất tốt')
        self.assertEqual(review.reviewer, self.parent)
        self.assertEqual(review.reviewee, self.worker)

    # ------------------------------------------------------------------
    # 2. Upsert: task đã có review → update thay vì reject
    # ------------------------------------------------------------------
    def test_upsert_existing_review_returns_200_and_updates(self):
        """Task đã có review → UPDATE rating + comment, HTTP 200 (không phải 400)."""
        task = _make_task(self.parent, self.worker, status='completed')
        # Tạo review ban đầu
        Review.objects.create(
            task=task,
            reviewer=self.parent,
            reviewee=self.worker,
            rating=3,
            comment='Bình thường',
        )
        self.client.force_authenticate(user=self.parent)

        # Parent gửi lại review mới (sửa đánh giá)
        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 1,
            'comment': 'làm ăn rất lồm còm',
        }, format='json')

        # Không còn lỗi "review có task đã tồn tại." nữa
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        # Vẫn chỉ có 1 review (update, không tạo mới)
        self.assertEqual(Review.objects.filter(task=task).count(), 1)
        review = Review.objects.get(task=task)
        self.assertEqual(review.rating, 1)
        self.assertEqual(review.comment, 'làm ăn rất lồm còm')

    # ------------------------------------------------------------------
    # 3. Không cho review task chưa hoàn thành
    # ------------------------------------------------------------------
    def test_cannot_review_incomplete_task(self):
        """Task chưa completed → 400 với message tiếng Việt."""
        task = _make_task(self.parent, self.worker, status='in_progress')
        self.client.force_authenticate(user=self.parent)

        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 5,
            'comment': 'OK',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('task', resp.data)
        self.assertIn('hoàn thành', str(resp.data['task']).lower())

    # ------------------------------------------------------------------
    # 4. Không cho review task của người khác
    # ------------------------------------------------------------------
    def test_cannot_review_other_parents_task(self):
        """Parent A không được review task của Parent B."""
        task = _make_task(self.parent, self.worker, status='completed')
        self.client.force_authenticate(user=self.other_parent)

        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 5,
            'comment': 'OK',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('task', resp.data)

    # ------------------------------------------------------------------
    # 5. Không cho review task chưa có worker accepted
    # ------------------------------------------------------------------
    def test_cannot_review_task_without_accepted_worker(self):
        """Task không có application 'accepted' → 400."""
        cat = ServiceCategory.objects.create(name='Cat-no-accept')
        task = Task.objects.create(
            title='No accept',
            description='Mô tả',
            price=100000,
            status='completed',
            parent=self.parent,
            category=cat,
            location='Hà Nội',
            scheduled_time=datetime.now(dt_tz.utc) + timedelta(days=1),
        )
        # Tạo application nhưng status='pending' (chưa accept)
        TaskApplication.objects.create(
            task=task,
            worker=self.worker,
            status='pending',
        )
        self.client.force_authenticate(user=self.parent)

        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 5,
            'comment': 'OK',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('task', resp.data)

    # ------------------------------------------------------------------
    # 6. Validate rating ngoài khoảng 1-5
    # ------------------------------------------------------------------
    def test_rating_must_be_between_1_and_5(self):
        """Rating = 0 hoặc 6 → 400."""
        task = _make_task(self.parent, self.worker, status='completed')
        self.client.force_authenticate(user=self.parent)

        # Rating = 0 (dưới min)
        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 0,
            'comment': 'OK',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('rating', resp.data)

        # Rating = 6 (trên max)
        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 6,
            'comment': 'OK',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('rating', resp.data)

    # ------------------------------------------------------------------
    # 7. Phải đăng nhập
    # ------------------------------------------------------------------
    def test_unauthenticated_request_returns_401(self):
        """Không có JWT → 401 Unauthorized."""
        task = _make_task(self.parent, self.worker, status='completed')
        # Không force_authenticate

        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 5,
            'comment': 'OK',
        }, format='json')

        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    # ------------------------------------------------------------------
    # 8. AI consumers vẫn đọc Review bình thường
    # ------------------------------------------------------------------
    def test_ai_recommendations_can_read_reviews(self):
        """Smoke test: ai_recommendations.services có thể query Review bình thường
        sau khi fix (đảm bảo không phá structure mà AI phụ thuộc)."""
        task = _make_task(self.parent, self.worker, status='completed')
        Review.objects.create(
            task=task,
            reviewer=self.parent,
            reviewee=self.worker,
            rating=4,
            comment='Chăm chỉ, đúng giờ',
        )

        # Gọi helper build worker context (đây là hàm AI dùng để build prompt)
        from ai_recommendations.services import _build_worker_profile
        ctx = _build_worker_profile(self.worker)
        self.assertIn('4.0/5', ctx)
        self.assertIn('Chăm chỉ', ctx)

    # ------------------------------------------------------------------
    # 9. Update review không thay đổi reviewer/reviewee
    # ------------------------------------------------------------------
    def test_upsert_preserves_reviewer_and_reviewee(self):
        """Khi update, reviewer + reviewee phải giữ nguyên (không bị override)."""
        task = _make_task(self.parent, self.worker, status='completed')
        original = Review.objects.create(
            task=task,
            reviewer=self.parent,
            reviewee=self.worker,
            rating=3,
            comment='Bình thường',
        )
        self.client.force_authenticate(user=self.parent)

        resp = self.client.post(self.url, {
            'task': task.id,
            'rating': 5,
            'comment': 'Update',
        }, format='json')

        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        review = Review.objects.get(task=task)
        # ID, reviewer, reviewee giữ nguyên
        self.assertEqual(review.id, original.id)
        self.assertEqual(review.reviewer_id, original.reviewer_id)
        self.assertEqual(review.reviewee_id, original.reviewee_id)
        # Rating + comment được cập nhật
        self.assertEqual(review.rating, 5)
        self.assertEqual(review.comment, 'Update')
