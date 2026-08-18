"""
Test cho LỖ HỔNG #1 — PIN enforcement khi nhận việc có tracking.
Chạy: python manage.py test tracking.tests_pin_enforcement --verbosity=2

Xác minh:
- Worker chưa đặt PIN bị chặn nhận task có geofence (403 + verification_pin_required)
- Worker chưa đặt PIN vẫn apply được task KHÔNG có geofence
- Parent bị chặn approve worker chưa có PIN cho task có geofence
- Worker đã đặt PIN apply/approve bình thường
"""

from decimal import Decimal
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication


@override_settings(DEBUG=True)
class PinEnforcementTestCase(TestCase):
    """LỖ HỔNG #1 — PIN enforcement khi nhận việc có tracking."""

    def setUp(self):
        self.client = APIClient()

        # Parent
        self.parent = User.objects.create_user(
            username='parent_pin_test', password='parent_pass_123',
            role='parent', email='parent_pin@test.com',
        )

        # Worker KHÔNG có PIN
        self.worker_no_pin = User.objects.create_user(
            username='worker_no_pin', password='worker_pass_123',
            role='worker', email='worker_nopin@test.com',
            is_approved=True,
        )

        # Worker CÓ PIN
        self.worker_with_pin = User.objects.create_user(
            username='worker_with_pin', password='worker_pass_123',
            role='worker', email='worker_withpin@test.com',
            is_approved=True,
        )
        # Đặt PIN cho worker_with_pin
        self.worker_with_pin.set_verification_pin('1234')

        # Category
        self.category = ServiceCategory.objects.create(name='Gia sư')

        # Task CÓ Geofence (tracking)
        self.task_with_geofence = Task.objects.create(
            title='Task có geofence',
            description='Task với tracking',
            price=Decimal('100000'),
            status='open',
            parent=self.parent,
            category=self.category,
            location='Hà Nội',
            latitude=21.0285,
            longitude=105.8542,
            scheduled_time=timezone.now() + timezone.timedelta(hours=2),
            geofence_lat=21.0285,
            geofence_lng=105.8542,
            geofence_radius=500,
        )

        # Task KHÔNG có geofence
        self.task_no_geofence = Task.objects.create(
            title='Task không geofence',
            description='Task không tracking',
            price=Decimal('80000'),
            status='open',
            parent=self.parent,
            category=self.category,
            location='Hà Nội',
            latitude=21.0285,
            longitude=105.8542,
            scheduled_time=timezone.now() + timezone.timedelta(hours=2),
        )

    def test_worker_no_pin_blocked_from_geofence_task(self):
        """Worker chưa đặt PIN → bị chặn nhận task CÓ geofence (403)."""
        self.client.force_authenticate(user=self.worker_no_pin)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task_with_geofence.id}/apply/',
            {'consent_tracking': True},
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['error'], 'verification_pin_required')
        self.assertIn('has_geofence', resp.data)
        self.assertTrue(resp.data['has_geofence'])

    def test_worker_no_pin_can_apply_no_geofence_task(self):
        """Worker chưa đặt PIN → vẫn apply được task KHÔNG có geofence."""
        self.client.force_authenticate(user=self.worker_no_pin)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task_no_geofence.id}/apply/',
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['message'], 'Đã ứng tuyển!')

    def test_worker_with_pin_can_apply_geofence_task(self):
        """Worker đã đặt PIN → nhận task có geofence bình thường."""
        self.client.force_authenticate(user=self.worker_with_pin)
        resp = self.client.post(
            f'/api/worker/tasks/{self.task_with_geofence.id}/apply/',
            {'consent_tracking': True},
        )
        self.assertEqual(resp.status_code, 201)

    def test_parent_blocked_approving_worker_no_pin_for_geofence_task(self):
        """Parent → bị chặn approve worker chưa có PIN cho task có geofence (403)."""
        application = TaskApplication.objects.create(
            task=self.task_with_geofence,
            worker=self.worker_no_pin,
            status='pending',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.post(f'/api/parent/applications/{application.id}/approve/')
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['error'], 'verification_pin_required')

    def test_parent_can_approve_worker_with_pin_for_geofence_task(self):
        """Parent → approve worker CÓ PIN cho task có geofence → thành công."""
        application = TaskApplication.objects.create(
            task=self.task_with_geofence,
            worker=self.worker_with_pin,
            status='pending',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.post(f'/api/parent/applications/{application.id}/approve/')
        self.assertEqual(resp.status_code, 200)

    def test_parent_can_approve_worker_no_pin_for_no_geofence_task(self):
        """Parent → approve worker chưa có PIN cho task KHÔNG có geofence → thành công."""
        application = TaskApplication.objects.create(
            task=self.task_no_geofence,
            worker=self.worker_no_pin,
            status='pending',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.post(f'/api/parent/applications/{application.id}/approve/')
        self.assertEqual(resp.status_code, 200)

    def test_no_retroactive_block(self):
        """Task đã in_progress → approve candidate không bị chặn (không hồi tố)."""
        self.task_no_geofence.status = 'in_progress'
        self.task_no_geofence.save()
        application = TaskApplication.objects.create(
            task=self.task_no_geofence,
            worker=self.worker_no_pin,
            status='pending',
        )
        self.client.force_authenticate(user=self.parent)
        resp = self.client.post(f'/api/parent/applications/{application.id}/approve/')
        self.assertEqual(resp.status_code, 400)
        self.assertNotEqual(resp.data.get('error'), 'verification_pin_required')
