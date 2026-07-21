"""
Test suite cho core app — bao phủ 2 luồng chính:

a. Auth JWT (đăng ký + đăng nhập + refresh token) cho cả Parent và Carepartner.
b. Vòng đời Task (tạo → ứng tuyển → duyệt → hoàn thành) + edge case AI moderation từ chối.

Chạy: DEBUG=True python manage.py test core
"""

import os
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import User, Task, TaskApplication, ServiceCategory, Review


# Disable throttle trong test (login 5/min, register 3/hour sẽ fail test do share IP 127.0.0.1)
# Đặt rate rất cao thay vì disable — vì view class có throttle_classes gắn cứng,
# chỉ tăng rate mới thực sự có tác dụng.
_NO_THROTTLE = override_settings(
    REST_FRAMEWORK={
        'DEFAULT_AUTHENTICATION_CLASSES': [
            'rest_framework_simplejwt.authentication.JWTAuthentication',
        ],
        'DEFAULT_PERMISSION_CLASSES': [
            'rest_framework.permissions.IsAuthenticated',
        ],
        'DEFAULT_THROTTLE_CLASSES': [
            'rest_framework.throttling.AnonRateThrottle',
            'rest_framework.throttling.UserRateThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': {
            'anon': '999999/min',
            'user': '999999/min',
            'ai': '999999/min',
            'login': '999999/min',
            'register': '999999/hour',
            'sos': '999999/min',
            'task_create': '999999/hour',
            'apply': '999999/hour',
        },
    }
)


@_NO_THROTTLE
class _NoThrottleTestCase(TestCase):
    """Base TestCase — tăng rate throttle + clear cache để test không bị 429."""
    def setUp(self):
        # Clear throttle cache (LocMem) để các test không ảnh hưởng lẫn nhau
        from django.core.cache import cache
        cache.clear()
        super().setUp()


# ────────────────────────────────────────────────────────────────────
# Helper tạo user nhanh
# ────────────────────────────────────────────────────────────────────
def _make_parent(username='parent_test', email='parent@test.com',
                 phone='0900000001', password='Demo@2026'):
    return User.objects.create_user(
        username=username, password=password,
        role='parent', is_approved=True,
        email=email, phone_number=phone,
        first_name='Phu', last_name='Huynh',
    )


def _make_worker(username='worker_test', email='worker@test.com',
                 phone='0900000002', password='Demo@2026', approved=True):
    return User.objects.create_user(
        username=username, password=password,
        role='worker', is_approved=approved,
        email=email, phone_number=phone,
        first_name='Sinh', last_name='Vien',
    )


def _make_category(name='Gia sư'):
    return ServiceCategory.objects.create(name=name, icon_name='BookOpen')


def _make_task(parent, category, title='Gia sư Toán lớp 5',
               price=Decimal('200000'), status='open'):
    return Task.objects.create(
        title=title,
        description='Dạy kèm Toán lớp 5, 2 buổi/tuần, mỗi buổi 2h',
        price=price,
        parent=parent,
        category=category,
        location='Hà Nội',
        scheduled_time=timezone.now() + timedelta(days=1),
        status=status,
    )


# ────────────────────────────────────────────────────────────────────
# 1. AUTH — REGISTER
# ────────────────────────────────────────────────────────────────────
@_NO_THROTTLE
class RegisterAPITest(_NoThrottleTestCase):
    """Test endpoint POST /api/auth/register/."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse('register')
        _make_category()  # ensure a category exists

    def test_register_parent_success(self):
        """Parent đăng ký thành công → 201 + status='approved' (auto-approve)."""
        resp = self.client.post(self.url, {
            'username': 'parent_new',
            'password': 'Demo@2026',
            'email': 'parent_new@test.com',
            'phone_number': '0901234567',
            'role': 'parent',
            'first_name': 'A',
            'last_name': 'B',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['status'], 'approved')
        user = User.objects.get(username='parent_new')
        self.assertEqual(user.role, 'parent')
        self.assertTrue(user.is_approved, 'Parent phải được auto-approve')

    def test_register_parent_missing_email(self):
        """Parent thiếu email → 400."""
        resp = self.client.post(self.url, {
            'username': 'parent_no_email',
            'password': 'Demo@2026',
            'phone_number': '0901234567',
            'role': 'parent',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', resp.data)

    def test_register_parent_missing_phone(self):
        """Parent thiếu phone → 400."""
        resp = self.client.post(self.url, {
            'username': 'parent_no_phone',
            'password': 'Demo@2026',
            'email': 'parent_no_phone@test.com',
            'role': 'parent',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('phone_number', resp.data)

    def test_register_worker_pending_approval(self):
        """Worker đăng ký thành công nhưng phải chờ admin duyệt → status='pending_approval'."""
        # Worker cần id_card_front, id_card_back, selfie_photo (file) — dùng PNG 10x10 thật
        from django.core.files.uploadedfile import SimpleUploadedFile
        # PNG 10x10 red, generated by Pillow (75 bytes)
        png_real = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\n\x00\x00\x00\n\x08\x02'
            b'\x00\x00\x00\x02PX\xea\x00\x00\x00\x12IDATx\x9cc\xfc\xcf\x80\x0f0\xe1'
            b'\x95\x1d\xb1\xd2\x00A,\x01\x13\xb1\ns\x13\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        resp = self.client.post(self.url, {
            'username': 'worker_new',
            'password': 'Demo@2026',
            'email': 'worker_new@test.com',
            'phone_number': '0901234568',
            'role': 'worker',
            'first_name': 'X',
            'last_name': 'Y',
            'id_card_front': SimpleUploadedFile('front.png', png_real, content_type='image/png'),
            'id_card_back': SimpleUploadedFile('back.png', png_real, content_type='image/png'),
            'selfie_photo': SimpleUploadedFile('selfie.png', png_real, content_type='image/png'),
        }, format='multipart')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['status'], 'pending_approval')
        user = User.objects.get(username='worker_new')
        self.assertEqual(user.role, 'worker')
        self.assertFalse(user.is_approved, 'Worker phải chờ admin duyệt')


# ────────────────────────────────────────────────────────────────────
# 2. AUTH — LOGIN + REFRESH
# ────────────────────────────────────────────────────────────────────
@_NO_THROTTLE
class LoginRefreshAPITest(_NoThrottleTestCase):
    """Test endpoint POST /api/auth/login/ và POST /api/auth/token/refresh/."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.login_url = reverse('login')
        self.refresh_url = reverse('token_refresh')
        self.parent = _make_parent()
        self.worker = _make_worker(approved=True)

    def test_login_parent_success(self):
        """Parent đăng nhập đúng mật khẩu → 200 + access + refresh token."""
        resp = self.client.post(self.login_url, {
            'username': 'parent_test',
            'password': 'Demo@2026',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertIn('tokens', resp.data)
        self.assertIn('access', resp.data['tokens'])
        self.assertIn('refresh', resp.data['tokens'])
        self.assertEqual(resp.data['role'], 'parent')
        self.assertEqual(resp.data['user_id'], self.parent.id)

    def test_login_wrong_password(self):
        """Sai mật khẩu → 401."""
        resp = self.client.post(self.login_url, {
            'username': 'parent_test',
            'password': 'wrong_password',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_worker_not_approved(self):
        """Worker chưa được admin duyệt → 403 status='pending_approval'."""
        not_approved = _make_worker(
            username='worker_pending',
            email='worker_pending@test.com',
            phone='0900000003',
            approved=False,
        )
        resp = self.client.post(self.login_url, {
            'username': 'worker_pending',
            'password': 'Demo@2026',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['status'], 'pending_approval')

    def test_login_locked_account(self):
        """User bị khoá (is_active=False) → 403 status='account_locked'."""
        self.parent.is_active = False
        self.parent.save()
        resp = self.client.post(self.login_url, {
            'username': 'parent_test',
            'password': 'Demo@2026',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['status'], 'account_locked')

    def test_refresh_token_flow(self):
        """Refresh token cũ → access token mới."""
        # Login lấy refresh token
        login_resp = self.client.post(self.login_url, {
            'username': 'parent_test',
            'password': 'Demo@2026',
        }, format='json')
        refresh = login_resp.data['tokens']['refresh']

        # Gọi refresh endpoint
        resp = self.client.post(self.refresh_url, {'refresh': refresh}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        self.assertIn('access', resp.data)


# ────────────────────────────────────────────────────────────────────
# 3. TASK LIFECYCLE — happy path
# ────────────────────────────────────────────────────────────────────
@_NO_THROTTLE
class TaskLifecycleTest(_NoThrottleTestCase):
    """
    Test full flow:
    parent tạo task → worker apply → parent approve → task in_progress →
    parent complete → review.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.parent = _make_parent()
        self.worker = _make_worker(approved=True)
        self.category = _make_category()
        # Login as parent
        login_resp = self.client.post(reverse('login'), {
            'username': 'parent_test',
            'password': 'Demo@2026',
        }, format='json')
        self.parent_token = login_resp.data['tokens']['access']
        # Login as worker
        login_resp = self.client.post(reverse('login'), {
            'username': 'worker_test',
            'password': 'Demo@2026',
        }, format='json')
        self.worker_token = login_resp.data['tokens']['access']

    def test_parent_create_task_happy_path(self):
        """Parent tạo task hợp lệ → 201 + task='open'."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.post(reverse('task-list-create'), {
            'title': 'Gia sư Tiếng Anh lớp 6',
            'description': '2 buổi/tuần, mỗi buổi 1.5h',
            'price': '250000',
            'category': self.category.id,
            'location': 'Hà Nội',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(resp.data['status'], 'open')
        self.assertEqual(resp.data['parent_name'], 'parent_test')
        # TaskModeration 'pending' được tạo bởi signal (async)
        # → không chặn response

    def test_worker_cannot_create_task(self):
        """Worker cố tạo task → 400 (DRF ValidationError từ perform_create)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.worker_token}')
        resp = self.client.post(reverse('task-list-create'), {
            'title': 'Gia sư Toán',
            'description': 'something',
            'price': '200000',
            'category': self.category.id,
            'location': 'Hà Nội',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }, format='json')
        # perform_create raise ValidationError → 400, không phải 403
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', resp.data)

    def test_unauthenticated_cannot_create_task(self):
        """Anonymous → 401."""
        resp = self.client.post(reverse('task-list-create'), {
            'title': 'Gia sư Toán',
            'description': 'something',
            'price': '200000',
            'category': self.category.id,
            'location': 'Hà Nội',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_full_lifecycle_apply_approve_complete_review(self):
        """Happy path end-to-end: tạo → apply → approve → complete → review."""
        # 1. Parent tạo task
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        create_resp = self.client.post(reverse('task-list-create'), {
            'title': 'Gia sư Toán lớp 5',
            'description': '2 buổi/tuần',
            'price': '300000',
            'category': self.category.id,
            'location': 'Hà Nội',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }, format='json')
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED, create_resp.content)
        task_id = create_resp.data['id']

        # 2. Worker apply (không có geofence → không cần consent)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.worker_token}')
        apply_resp = self.client.post(
            reverse('apply-task', args=[task_id]),
            {'consent_tracking': False},
            format='json',
        )
        self.assertEqual(apply_resp.status_code, status.HTTP_201_CREATED, apply_resp.content)
        app_id = TaskApplication.objects.get(task_id=task_id, worker=self.worker).id

        # 3. Parent approve candidate → task 'in_progress'
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        approve_resp = self.client.post(
            reverse('approve-candidate', args=[app_id]),
            format='json',
        )
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK, approve_resp.content)
        task = Task.objects.get(id=task_id)
        self.assertEqual(task.status, 'in_progress')
        # Các application khác (nếu có) auto rejected
        app = TaskApplication.objects.get(id=app_id)
        self.assertEqual(app.status, 'accepted')

        # 4. Parent complete task
        complete_resp = self.client.patch(
            reverse('task-update-status', args=[task_id]),
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(complete_resp.status_code, status.HTTP_200_OK, complete_resp.content)
        task.refresh_from_db()
        self.assertEqual(task.status, 'completed')

        # 5. Parent review worker
        review_resp = self.client.post(reverse('create-review'), {
            'task': task_id,
            'rating': 5,
            'comment': 'Sinh viên dạy tốt, đúng giờ.',
        }, format='json')
        self.assertEqual(review_resp.status_code, status.HTTP_201_CREATED, review_resp.content)
        self.assertEqual(Review.objects.count(), 1)
        review = Review.objects.first()
        self.assertEqual(review.reviewer, self.parent)
        self.assertEqual(review.reviewee, self.worker)
        self.assertEqual(review.rating, 5)

    def test_cannot_complete_open_task(self):
        """Task đang 'open' không thể chuyển thẳng 'completed' (chỉ 'cancelled')."""
        task = _make_task(self.parent, self.category, status='open')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.patch(
            reverse('task-update-status', args=[task.id]),
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_worker_cannot_approve_own_application(self):
        """Worker không thể tự approve application của mình (chỉ parent sở hữu task)."""
        task = _make_task(self.parent, self.category, status='open')
        app = TaskApplication.objects.create(task=task, worker=self.worker, status='pending')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.worker_token}')
        resp = self.client.post(
            reverse('approve-candidate', args=[app.id]),
            format='json',
        )
        # ApproveCandidateAPIView filter `task__parent=request.user` → DoesNotExist → 404
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ────────────────────────────────────────────────────────────────────
# 4. TASK MODERATION — edge case AI reject
# ────────────────────────────────────────────────────────────────────
@_NO_THROTTLE
class TaskModerationRejectTest(_NoThrottleTestCase):
    """
    Edge case: parent đăng task với từ khóa bị cấm → bị chặn ĐỒNG BỘ
    (không cần gọi Gemini).
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.parent = _make_parent()
        self.category = _make_category()
        login_resp = self.client.post(reverse('login'), {
            'username': 'parent_test',
            'password': 'Demo@2026',
        }, format='json')
        self.token = login_resp.data['tokens']['access']

    def test_task_with_banned_keyword_is_rejected(self):
        """Task có từ khóa 'ma túy' → 400 (chặn đồng bộ)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        resp = self.client.post(reverse('task-list-create'), {
            'title': 'Cần người bán ma túy cho quán bar',
            'description': 'Lương cao, làm ban đêm',
            'price': '500000',
            'category': self.category.id,
            'location': 'Hà Nội',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST, resp.content)
        self.assertIn('detail', resp.data)
        # Không có task nào được tạo
        self.assertEqual(Task.objects.count(), 0)

    def test_task_with_exploitation_price_is_rejected(self):
        """Task có giá < 20.000 VNĐ → 400 (bóc lột lao động)."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        resp = self.client.post(reverse('task-list-create'), {
            'title': 'Gia sư Toán lớp 5',
            'description': '2 buổi/tuần',
            'price': '10000',  # < 20000
            'category': self.category.id,
            'location': 'Hà Nội',
            'scheduled_time': (timezone.now() + timedelta(days=2)).isoformat(),
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Task.objects.count(), 0)
