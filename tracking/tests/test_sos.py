"""
Test endpoint SOS trong tracking — kiểm tra:
1. Permission: chỉ parent/worker của task mới được bấm SOS.
2. Throttle rate: 5/phút (scope='sos').
3. Happy path: parent bấm SOS → tạo SOSAlert.
4. Edge case: user không liên quan task → 403.

Chạy: DEBUG=True python manage.py test tracking.tests.test_sos
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication
from tracking.models import SOSAlert


# Disable throttle cho các test permission/happy path (tránh 429 khi login nhiều)
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
        from django.core.cache import cache
        cache.clear()
        super().setUp()


def _make_users():
    parent = User.objects.create_user(
        username='parent_sos', password='Demo@2026',
        role='parent', is_approved=True,
        email='parent_sos@test.com', phone_number='0900000001',
    )
    worker = User.objects.create_user(
        username='worker_sos', password='Demo@2026',
        role='worker', is_approved=True,
        email='worker_sos@test.com', phone_number='0900000002',
    )
    stranger = User.objects.create_user(
        username='stranger_sos', password='Demo@2026',
        role='parent', is_approved=True,
        email='stranger_sos@test.com', phone_number='0900000003',
    )
    return parent, worker, stranger


def _make_in_progress_task(parent, worker):
    cat = ServiceCategory.objects.create(name='Gia sư', icon_name='BookOpen')
    task = Task.objects.create(
        title='Gia sư Toán — SOS test',
        description='2 buổi/tuần',
        price=Decimal('200000'),
        parent=parent, category=cat,
        location='Hà Nội',
        scheduled_time=timezone.now() + timedelta(days=1),
        status='in_progress',
    )
    TaskApplication.objects.create(task=task, worker=worker, status='accepted')
    return task


def _login(client, username, password='Demo@2026'):
    resp = client.post(reverse('login'),
                       {'username': username, 'password': password},
                       format='json')
    return resp.data['tokens']['access']


# ────────────────────────────────────────────────────────────────────
# 1. PERMISSION TESTS
# ────────────────────────────────────────────────────────────────────
@_NO_THROTTLE
class SOSPermissionTest(_NoThrottleTestCase):
    """Test permission: chỉ parent/worker của task mới được SOS."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.parent, self.worker, self.stranger = _make_users()
        self.task = _make_in_progress_task(self.parent, self.worker)
        self.parent_token = _login(self.client, 'parent_sos')
        self.worker_token = _login(self.client, 'worker_sos')
        self.stranger_token = _login(self.client, 'stranger_sos')
        self.url = reverse('tracking-sos-create')

    @patch('tracking.services._notify_user')
    def test_parent_can_sos(self, mock_notify):
        """Parent của task bấm SOS → 201."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.post(self.url, {
            'task_id': self.task.id,
            'latitude': 10.762622,
            'longitude': 106.660172,
            'message': 'Cần hỗ trợ khẩn cấp',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(SOSAlert.objects.count(), 1)
        alert = SOSAlert.objects.first()
        self.assertEqual(alert.sender, 'parent')
        self.assertEqual(alert.sender_user, self.parent)
        self.assertEqual(alert.status, 'active')

    @patch('tracking.services._notify_user')
    def test_worker_can_sos(self, mock_notify):
        """Worker được accepted bấm SOS → 201."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.worker_token}')
        resp = self.client.post(self.url, {
            'task_id': self.task.id,
            'latitude': 10.762622,
            'longitude': 106.660172,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        alert = SOSAlert.objects.first()
        self.assertEqual(alert.sender, 'worker')

    @patch('tracking.services._notify_user')
    def test_stranger_cannot_sos(self, mock_notify):
        """User lạ (không liên quan task) bấm SOS → 403."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.stranger_token}')
        resp = self.client.post(self.url, {
            'task_id': self.task.id,
            'latitude': 10.762622,
            'longitude': 106.660172,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(SOSAlert.objects.count(), 0)

    def test_unauthenticated_cannot_sos(self):
        """Anonymous → 401."""
        resp = self.client.post(self.url, {
            'task_id': self.task.id,
            'latitude': 10.762622,
            'longitude': 106.660172,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_sos_nonexistent_task(self):
        """Task không tồn tại → 404."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.post(self.url, {
            'task_id': 999999,
            'latitude': 10.762622,
            'longitude': 106.660172,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_sos_missing_task_id(self):
        """Thiếu task_id → 400."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.post(self.url, {
            'latitude': 10.762622,
            'longitude': 106.660172,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ────────────────────────────────────────────────────────────────────
# 2. THROTTLE TEST
# ────────────────────────────────────────────────────────────────────
# SOS throttle scope = 'sos' = 5/min (theo backend/settings.py)
# Test: gửi 6 SOS trong 1 phút → request thứ 6 bị 429.

@override_settings(
    REST_FRAMEWORK={
        'DEFAULT_THROTTLE_CLASSES': [
            'rest_framework.throttling.AnonRateThrottle',
            'rest_framework.throttling.UserRateThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': {
            'anon': '60/min',
            'user': '600/min',
            'ai': '20/min',
            'login': '5/min',
            'register': '3/hour',
            'sos': '5/min',  # test throttle 5/min
            'task_create': '10/hour',
            'apply': '20/hour',
        },
    }
)
class SOSThrottleTest(TestCase):
    """Test throttle rate limit cho SOS endpoint — 5/phút."""

    def setUp(self):
        super().setUp()
        # Clear cache để throttle history từ test trước không ảnh hưởng
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.parent, self.worker, _ = _make_users()
        self.task = _make_in_progress_task(self.parent, self.worker)
        self.parent_token = _login(self.client, 'parent_sos')
        self.url = reverse('tracking-sos-create')
        # Mock notify để không gọi Expo thật
        patcher = patch('tracking.services._notify_user')
        self.mock_notify = patcher.start()
        self.addCleanup(patcher.stop)

    def test_sos_throttle_5_per_minute(self):
        """Gửi 5 SOS OK, request thứ 6 bị 429."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')

        # 5 request đầu OK
        for i in range(5):
            resp = self.client.post(self.url, {
                'task_id': self.task.id,
                'latitude': 10.762622,
                'longitude': 106.660172,
                'message': f'SOS {i+1}',
            }, format='json')
            self.assertEqual(resp.status_code, status.HTTP_201_CREATED,
                             f'Request {i+1} phải OK, got {resp.status_code}: {resp.content}')

        # Request thứ 6 bị throttle
        resp = self.client.post(self.url, {
            'task_id': self.task.id,
            'latitude': 10.762622,
            'longitude': 106.660172,
            'message': 'SOS 6 — should be throttled',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS,
                         f'Request thứ 6 phải bị 429, got {resp.status_code}: {resp.content}')
        # Chỉ có 5 SOS được tạo
        self.assertEqual(SOSAlert.objects.count(), 5)


# ────────────────────────────────────────────────────────────────────
# 3. SOS LIST + RESOLVE TESTS
# ────────────────────────────────────────────────────────────────────
@_NO_THROTTLE
class SOSListResolveTest(_NoThrottleTestCase):
    """Test GET SOS list và POST resolve."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.parent, self.worker, _ = _make_users()
        self.task = _make_in_progress_task(self.parent, self.worker)
        self.parent_token = _login(self.client, 'parent_sos')
        self.worker_token = _login(self.client, 'worker_sos')
        # Mock notify
        patcher = patch('tracking.services._notify_user')
        self.mock_notify = patcher.start()
        self.addCleanup(patcher.stop)
        # Tạo 1 SOS từ worker
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.worker_token}')
        resp = self.client.post(reverse('tracking-sos-create'), {
            'task_id': self.task.id,
            'latitude': 10.762622,
            'longitude': 106.660172,
            'message': 'Cần giúp',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.sos_id = resp.data['id']

    def test_parent_can_list_sos(self):
        """Parent xem danh sách SOS của task → 200."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.get(reverse('tracking-sos-list', args=[self.task.id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['id'], self.sos_id)

    def test_stranger_cannot_list_sos(self):
        """User lạ không xem được SOS list của task người khác."""
        stranger = User.objects.create_user(
            username='stranger_list', password='Demo@2026',
            role='parent', is_approved=True,
            email='stranger_list@test.com', phone_number='0900000099',
        )
        # Login stranger
        resp = self.client.post(reverse('login'),
                                {'username': 'stranger_list', 'password': 'Demo@2026'},
                                format='json')
        stranger_token = resp.data['tokens']['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {stranger_token}')
        resp = self.client.get(reverse('tracking-sos-list', args=[self.task.id]))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_parent_can_resolve_sos(self):
        """Parent resolve SOS → status='resolved'."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.parent_token}')
        resp = self.client.post(reverse('tracking-sos-resolve', args=[self.sos_id]))
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        alert = SOSAlert.objects.get(id=self.sos_id)
        self.assertEqual(alert.status, 'resolved')
        self.assertEqual(alert.resolved_by, self.parent)
        self.assertIsNotNone(alert.resolved_at)
