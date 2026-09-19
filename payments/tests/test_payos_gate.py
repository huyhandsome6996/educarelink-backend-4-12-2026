"""
VIETQR GATE — Test suite (feature/vietqr-payment-gate-booking)

Bao phủ 7 nhóm test bắt buộc trước khi merge:
  1. Chọn CarePartner → payment_pending/pending_payment, KHÔNG notification
     "được nhận việc" ở bước này
  2. Webhook PAID → application accepted, task in_progress, others rejected,
     đúng 1 notification "Chúc mừng" (push)
  3. Webhook CANCELLED → rollback về pending/open
  4. Race: chọn CarePartner thứ 2 cho cùng task → chỉ 1 thành công, lỗi rõ ràng
  5. Expiry command: payment quá hạn → tự động rollback + đúng PaymentLog
  6. Webhook amount KHÁCH payment.amount → KHÔNG set held (bảo mật)
  7. Parity contract: response fields cho mobile + web (next_step, checkout_url,
     qr_expires_at, payment_id, status endpoint, cancel-selection)

Chạy:  DEBUG=True python manage.py test payments.tests.test_payos_gate -v 2
"""

import json
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.management import call_command

from core.models import User, Task, TaskApplication, ServiceCategory
from payments.models import Payment, PaymentLog


def make_user(username, role, **kw):
    defaults = dict(
        password='test1234', role=role, is_approved=True,
        email=f'{username}@test.com', phone_number='0900000000',
        expo_push_token='',
    )
    defaults.update(kw)
    return User.objects.create_user(username=username, **defaults)


class VietQRGateTestBase(TestCase):
    """Dữ liệu chung: parent + 2 worker + task 'open' + 2 application."""

    @classmethod
    def setUpTestData(cls):
        cls.cat = ServiceCategory.objects.create(name='Gia sư')
        cls.parent = make_user('parent1', 'parent')
        cls.worker1 = make_user('worker1', 'worker')
        cls.worker2 = make_user('worker2', 'worker')
        cls.task = Task.objects.create(
            title='Dạy kèm Toán lớp 5',
            description='2 buổi/tuần',
            price=Decimal('200000'),
            parent=cls.parent, category=cls.cat,
            location='Hà Nội',
            scheduled_time=timezone.now() + timedelta(days=2),
        )
        cls.app1 = TaskApplication.objects.create(task=cls.task, worker=cls.worker1)
        cls.app2 = TaskApplication.objects.create(task=cls.task, worker=cls.worker2)

    def setUp(self):
        # Client JWT-lite: gán user trực tiếp bằng force_authenticate
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=self.parent)


class SelectCandidateTests(VietQRGateTestBase):
    """Test #1 — Chọn CarePartner chỉ chốt lựa chọn, chưa nhận việc."""

    def test_select_sets_payment_pending_states(self):
        resp = self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data.get('next_step'), 'create_payos_payment')
        self.assertEqual(data.get('task_id'), self.task.id)

        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.app1.status, 'payment_pending')
        self.assertEqual(self.task.status, 'pending_payment')
        # KHÔNG reject application khác ở bước này (giữ rollback)
        self.app2.refresh_from_db()
        self.assertEqual(self.app2.status, 'pending')

    def test_select_does_not_send_welcome_notification(self):
        from core.models import Notification
        before = Notification.objects.filter(recipient=self.worker1).count()
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        self.assertEqual(
            Notification.objects.filter(recipient=self.worker1).count(), before,
            'Bước chọn KHÔNG được gửi notification "được nhận việc"')

    def test_select_is_idempotent_for_double_tap(self):
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        resp = self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json().get('next_step'), 'create_payos_payment')

    def test_select_second_candidate_after_first_locked_fails(self):
        """Test #4 (race, tuần tự hoá): chọn app1 → task hết 'open' → chọn
        app2 phải thất bại với lỗi rõ ràng — không thể 2 CarePartner cùng đặt."""
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        resp = self.client.post(f'/api/parent/applications/{self.app2.id}/approve/')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.json())

    def test_select_by_non_owner_forbidden(self):
        from rest_framework.test import APIClient
        stranger = make_user('stranger1', 'parent')
        c = APIClient()
        c.force_authenticate(user=stranger)
        resp = c.post(f'/api/parent/applications/{self.app1.id}/approve/')
        self.assertEqual(resp.status_code, 404)


class WebhookPaidTests(VietQRGateTestBase):
    """Test #2 — Webhook PAID xác nhận đặt lịch."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Worker cần push token thật để test notification "🎉 Chúc mừng bạn!"
        User.objects.filter(pk=cls.worker1.pk).update(
            expo_push_token='ExponentPushToken[test-gate]')
        cls.worker1.refresh_from_db()

    def _prepare_gate(self):
        """Chạy gate tới trạng thái 'chờ thanh toán' + payment có order_code."""
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        payment = Payment.objects.create(
            task=self.task, parent=self.parent, worker=self.worker1,
            amount=self.task.price, method='payos', status='pending',
            payos_order_code=1700000000001,
            payos_checkout_url='https://pay.payos.vn/test-checkout',
            payos_status='PENDING',
            payos_expires_at=timezone.now() + timedelta(minutes=15),
        )
        return payment

    def _webhook(self, payment, status='PAID', amount=None):
        amount = int(payment.amount) if amount is None else amount
        body = {
            'code': '00', 'id': 'wh-test', 'success': True,
            'data': {'orderCode': payment.payos_order_code, 'amount': amount,
                     'status': status, 'accountNumber': '12345678',
                     'reference': 'TF2409', 'description': 'ECL'},
            'signature': 'stubbed',
        }
        with mock.patch('payments.views.verify_webhook') as vw:
            vw.return_value = {
                'order_code': payment.payos_order_code,
                'amount': amount, 'status': status,
                'account_reference': '12345678',
            }
            return self.client.post('/api/payments/payos-webhook/',
                                    data=json.dumps(body),
                                    content_type='application/json')

    def test_webhook_paid_confirms_booking(self):
        payment = self._prepare_gate()
        resp = self._webhook(payment, 'PAID')
        self.assertEqual(resp.status_code, 200)

        payment.refresh_from_db()
        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'held')
        self.assertEqual(self.app1.status, 'accepted')
        self.assertEqual(self.task.status, 'in_progress')
        # Các application khác bị reject — chỉ sau khi PAID
        self.app2.refresh_from_db()
        self.assertEqual(self.app2.status, 'rejected')
        # Audit trail
        self.assertTrue(PaymentLog.objects.filter(
            payment=payment, event_type='booking_confirmed_after_payment').exists())

    @mock.patch('payments.services.send_expo_push_notification')
    def test_webhook_paid_sends_exactly_one_welcome_push(self, mock_push):
        # Patch đúng namespace payments.services (confirm_booking_after_payment
        # giữ reference import ở module-level, patch core.views không ăn)
        payment = self._prepare_gate()
        self._webhook(payment, 'PAID')
        # Webhook lặp lại (PayOS retry) KHÔNG được gửi thêm notification
        self._webhook(payment, 'PAID')
        welcome_calls = [c for c in mock_push.call_args_list
                         if c.kwargs.get('title') == '🎉 Chúc mừng bạn!']
        self.assertEqual(len(welcome_calls), 1)
        self.assertEqual(welcome_calls[0].kwargs.get('token'),
                         self.worker1.expo_push_token)

    def test_webhook_cancelled_rolls_back(self):
        """Test #3 — Webhook CANCELLED rollback về pending/open."""
        payment = self._prepare_gate()
        resp = self._webhook(payment, 'CANCELLED')
        self.assertEqual(resp.status_code, 200)

        payment.refresh_from_db()
        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'cancelled')
        self.assertEqual(self.app1.status, 'pending')
        self.assertEqual(self.task.status, 'open')
        self.app2.refresh_from_db()
        self.assertEqual(self.app2.status, 'pending')  # không ai bị reject oan

    def test_webhook_expired_rolls_back_too(self):
        payment = self._prepare_gate()
        self._webhook(payment, 'EXPIRED')
        payment.refresh_from_db()
        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'cancelled')
        self.assertEqual(self.app1.status, 'pending')
        self.assertEqual(self.task.status, 'open')

    def test_webhook_amount_mismatch_blocked(self):
        """Test #6 (bảo mật) — amount không khớp → KHÔNG held, KHÔNG confirm."""
        payment = self._prepare_gate()
        resp = self._webhook(payment, 'PAID', amount=1000)  # sai số tiền
        self.assertEqual(resp.status_code, 400)

        payment.refresh_from_db()
        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'pending', 'Amount mismatch KHÔNG được set held')
        self.assertEqual(self.app1.status, 'payment_pending')
        self.assertEqual(self.task.status, 'pending_payment')
        self.assertTrue(PaymentLog.objects.filter(
            payment=payment, event_type='payos_amount_mismatch').exists())


class ExpiryCommandTests(VietQRGateTestBase):
    """Test #5 — expire_stale_payment_selections rollback payment quá hạn."""

    def test_expired_selection_rolled_back_with_log(self):
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        payment = Payment.objects.create(
            task=self.task, parent=self.parent, worker=self.worker1,
            amount=self.task.price, method='payos', status='pending',
            payos_order_code=1700000000002,
            payos_expires_at=timezone.now() - timedelta(minutes=1),  # đã quá hạn
        )
        call_command('expire_stale_payment_selections', verbosity=0)

        payment.refresh_from_db()
        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'cancelled')
        self.assertEqual(self.app1.status, 'pending')
        self.assertEqual(self.task.status, 'open')
        self.assertTrue(PaymentLog.objects.filter(
            payment=payment, event_type='vietqr_selection_expired').exists())

    def test_fresh_selection_not_touched(self):
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        payment = Payment.objects.create(
            task=self.task, parent=self.parent, worker=self.worker1,
            amount=self.task.price, method='payos', status='pending',
            payos_order_code=1700000000003,
            payos_expires_at=timezone.now() + timedelta(minutes=10),  # còn hạn
        )
        call_command('expire_stale_payment_selections', verbosity=0)

        payment.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(self.task.status, 'pending_payment')

    def test_legacy_payos_payment_of_in_progress_task_not_touched(self):
        """Payment PayOS cũ (trước-gate, task in_progress) KHÔNG bị cron đụng."""
        self.app1.status = 'accepted'
        self.app1.save()
        self.task.status = 'in_progress'
        self.task.save()
        legacy = Payment.objects.create(
            task=self.task, parent=self.parent, worker=self.worker1,
            amount=self.task.price, method='payos', status='pending',
            payos_order_code=1700000000004,
            initiated_at=timezone.now() - timedelta(hours=2),
        )
        call_command('expire_stale_payment_selections', verbosity=0)
        legacy.refresh_from_db()
        self.assertEqual(legacy.status, 'pending')


class ParityAndCancelTests(VietQRGateTestBase):
    """Test #7 — Hợp đồng API dùng chung mobile + web + endpoint huỷ."""

    def _prepare_gate(self, order_code=1700000000005):
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        return Payment.objects.create(
            task=self.task, parent=self.parent, worker=self.worker1,
            amount=self.task.price, method='payos', status='pending',
            payos_order_code=order_code,
            payos_checkout_url='https://pay.payos.vn/test-checkout',
            payos_expires_at=timezone.now() + timedelta(minutes=15),
        )

    @mock.patch('payments.views.is_payos_enabled', return_value=True)
    def test_payos_setup_rejects_wrong_task_state_with_clear_error(self, _mock_enabled):
        # task 'open' (chưa chọn ai) → payos-setup phải từ chối rõ ràng
        # (mock PayOS enabled để tới được check trạng thái, không bị 503 config)
        resp = self.client.post('/api/payments/payos-setup/',
                                data=json.dumps({'task_id': self.task.id}),
                                content_type='application/json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json().get('error'), 'Công việc chưa ở trạng thái chờ thanh toán.')

    @mock.patch('payments.views.create_payment_link')
    @mock.patch('payments.views.is_payos_enabled', return_value=True)
    def test_payos_setup_response_contract_mobile_web(self, mock_enabled, mock_link):
        """Cả mobile PaymentQRScreen & web modal phụ thuộc các field này."""
        mock_link.return_value = {
            'checkout_url': 'https://pay.payos.vn/abc',
            'payment_link_id': 'pl_123',
            'order_code': 1700000000006,
            'amount': 200000,
            'description': 'ECL task',
            'expired_at': '2026-09-17T10:45:00Z',
            'qr_code': 'data:image/png;base64,AAAA',
        }
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        resp = self.client.post('/api/payments/payos-setup/',
                                data=json.dumps({'task_id': self.task.id}),
                                content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        for field in ('checkout_url', 'payment_id', 'order_code', 'amount',
                      'qr_expires_at', 'qr_code', 'status'):
            self.assertIn(field, data, f'Thiếu field "{field}" — lệch contract mobile/web')

        # Đã ghi vào Payment: worker = CarePartner payment_pending (KHÔNG phải accepted)
        payment = Payment.objects.get(pk=data['payment_id'])
        self.assertEqual(payment.worker_id, self.worker1.id)
        self.assertEqual(payment.status, 'pending')
        self.assertIsNotNone(payment.payos_expires_at)

    def test_payment_status_endpoint_for_polling(self):
        payment = self._prepare_gate()
        resp = self.client.get(f'/api/payments/{payment.id}/status/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        for field in ('payment_id', 'task_id', 'status', 'payos_status',
                      'task_status', 'checkout_url', 'qr_expires_at'):
            self.assertIn(field, data)
        self.assertEqual(data['task_status'], 'pending_payment')

    def test_status_endpoint_denies_stranger(self):
        payment = self._prepare_gate()
        from rest_framework.test import APIClient
        stranger = make_user('stranger2', 'parent')
        c = APIClient()
        c.force_authenticate(user=stranger)
        resp = c.get(f'/api/payments/{payment.id}/status/')
        self.assertEqual(resp.status_code, 403)

    @mock.patch('payments.views.cancel_payment_link')
    def test_cancel_selection_rolls_back_and_clears_task(self, mock_cancel):
        """Endpoint 2.5 — phụ huynh bấm Huỷ trên màn QR."""
        payment = self._prepare_gate()
        resp = self.client.post(f'/api/payments/{payment.id}/cancel-selection/')
        self.assertEqual(resp.status_code, 200)

        payment.refresh_from_db()
        self.app1.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(payment.status, 'cancelled')
        self.assertEqual(self.app1.status, 'pending')
        self.assertEqual(self.task.status, 'open')
        # Đã gọi PayOS huỷ link + audit log đúng event
        self.assertTrue(mock_cancel.called)
        self.assertTrue(PaymentLog.objects.filter(
            payment=payment, event_type='selection_cancelled').exists())

        # Sau rollback, phụ huynh chọn được ứng viên khác ngay
        resp2 = self.client.post(f'/api/parent/applications/{self.app2.id}/approve/')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.json().get('next_step'), 'create_payos_payment')

    def test_cancel_selection_denies_non_owner(self):
        payment = self._prepare_gate()
        from rest_framework.test import APIClient
        stranger = make_user('stranger3', 'parent')
        c = APIClient()
        c.force_authenticate(user=stranger)
        resp = c.post(f'/api/payments/{payment.id}/cancel-selection/')
        self.assertEqual(resp.status_code, 403)

    def test_cancel_selection_rejects_when_already_held(self):
        """Đã thanh toán (held) → không cho huỷ lựa chọn nữa."""
        payment = self._prepare_gate()
        payment.status = 'held'
        payment.save()
        resp = self.client.post(f'/api/payments/{payment.id}/cancel-selection/')
        self.assertEqual(resp.status_code, 400)


class CancelTaskWhilePendingTests(VietQRGateTestBase):
    """Phụ huynh huỷ hẳn việc khi đang chờ QR — payment phải được huỷ."""

    def test_task_cancel_from_pending_payment_cancels_payment(self):
        self.client.post(f'/api/parent/applications/{self.app1.id}/approve/')
        payment = Payment.objects.create(
            task=self.task, parent=self.parent, worker=self.worker1,
            amount=self.task.price, method='payos', status='pending',
            payos_order_code=1700000000007,
        )
        resp = self.client.patch(f'/api/tasks/{self.task.id}/status/',
                                 data=json.dumps({'status': 'cancelled'}),
                                 content_type='application/json')
        self.assertEqual(resp.status_code, 200)

        payment.refresh_from_db()
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, 'cancelled')
        self.assertEqual(payment.status, 'cancelled')


class LegacyFlowsUnaffectedTests(TestCase):
    """Đảm bảo không phá momo_escrow/cash: setup_payment vẫn cho open/in_progress."""

    @classmethod
    def setUpTestData(cls):
        cls.cat = ServiceCategory.objects.create(name='Gia sư')
        cls.parent = make_user('parent2', 'parent')
        cls.worker = make_user('worker9', 'worker')
        cls.task = Task.objects.create(
            title='Đón trẻ', description='đón chiều',
            price=Decimal('200000'),
            parent=cls.parent, category=cls.cat, location='Hà Nội',
            scheduled_time=timezone.now() + timedelta(days=1),
        )
        TaskApplication.objects.create(task=cls.task, worker=cls.worker, status='accepted')
        cls.task.status = 'in_progress'
        cls.task.save()

    def test_setup_payment_cash_still_works_on_in_progress(self):
        from payments.services import setup_payment
        payment = setup_payment(task=self.task, method='cash', actor=self.parent)
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(payment.method, 'cash')

    def test_setup_payment_rejects_pending_payment_state(self):
        """Task đang 'pending_payment' (gate) — setup momo/cash bị chặn rõ ràng."""
        from payments.services import setup_payment
        from django.core.exceptions import ObjectDoesNotExist
        self.task.status = 'pending_payment'
        self.task.save()
        with self.assertRaises(ValueError):
            setup_payment(task=self.task, method='cash', actor=self.parent)
