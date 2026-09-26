"""My Earnings API — regression test (2026-09-27, trước kỳ thi demo).

Bối cảnh lỗi prod: PaymentSerializer.Meta.fields khai báo 'updated_at'
nhưng field này thuộc CommissionSettlement, KHÔNG tồn tại trên Payment
→ DRF ImproperlyConfigured khi khởi tạo serializer → HTTP 500 cho MỌI
endpoint dùng PaymentSerializer, tiêu biểu:
  GET /api/payments/my-earnings/   (trang Thu nhập của CarePartner)
  GET /api/payments/payments/      (danh sách payment)

Lỗi lọt qua 896 test vì không có test nào chạm endpoint này.
Bộ test dưới đây khoá hành vi: worker phải lấy được thu nhập 200 kể cả
khi có payment, parent bị chặn 403, anonymous 401.

Chạy: python manage.py test payments.tests.test_my_earnings -v 2
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import ServiceCategory, Task, User
from payments.models import Payment


def make_user(username, role, **kw):
    defaults = dict(
        password='test1234', role=role, is_approved=True,
        email=f'{username}@test.com', phone_number='0900000000',
        expo_push_token='',
    )
    defaults.update(kw)
    return User.objects.create_user(username=username, **defaults)


class MyEarningsAPITests(TestCase):
    """GET /api/payments/my-earnings/ phải trả 200 + đúng số liệu."""

    @classmethod
    def setUpTestData(cls):
        cls.cat = ServiceCategory.objects.create(name='Gia sư')
        cls.parent = make_user('parent1', 'parent')
        cls.worker = make_user('worker1', 'worker')
        cls.task = Task.objects.create(
            title='Dạy kèm Toán lớp 5',
            description='2 buổi/tuần',
            price=Decimal('200000'),
            parent=cls.parent, category=cls.cat,
            location='Hà Nội',
            scheduled_time=timezone.now() + timedelta(days=2),
        )
        cls.payment = Payment.objects.create(
            task=cls.task, parent=cls.parent, worker=cls.worker,
            amount=Decimal('200000'), commission_rate=Decimal('0.2000'),
            method='cash', status='completed',
            completed_at=timezone.now() - timedelta(hours=1),
        )

    def setUp(self):
        self.client = APIClient()

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_worker_gets_200_with_payment(self):
        """Worker có payment → 200 + đủ khóa số liệu (regression 500)."""
        self._auth(self.worker)
        resp = self.client.get('/api/payments/my-earnings/')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        for key in ('total_earned', 'pending_payout', 'cash_commission_owed',
                    'recent_payments'):
            self.assertIn(key, data)
        self.assertEqual(Decimal(data['total_earned']), Decimal('160000'))
        self.assertEqual(len(data['recent_payments']), 1)
        # Serializer render được cả payment thật (không nổ ImproperlyConfigured)
        self.assertEqual(data['recent_payments'][0]['id'], self.payment.id)

    def test_worker_empty_earnings_200(self):
        """Worker chưa có payment → 200, số 0 (không được 500)."""
        w2 = make_user('worker2_empty', 'worker')
        self._auth(w2)
        resp = self.client.get('/api/payments/my-earnings/')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(Decimal(data['total_earned']), Decimal('0'))
        self.assertEqual(data['recent_payments'], [])

    def test_parent_forbidden_403(self):
        self._auth(self.parent)
        resp = self.client.get('/api/payments/my-earnings/')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_401(self):
        resp = self.client.get('/api/payments/my-earnings/')
        self.assertIn(resp.status_code, (401, 403))

    def test_payment_my_endpoint_200(self):
        """GET /api/payments/my/ (cũng dùng PaymentSerializer) → 200."""
        self._auth(self.worker)
        resp = self.client.get('/api/payments/my/')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.json()), 1)
