"""
Test luồng thanh toán cơ bản — setup_payment + complete → release_escrow.

Mock client MoMo (không gọi API thật) — test logic business:
- Cash payment: setup → complete → status='completed' + commission đúng 20%
- MoMo escrow: setup (mock momo_create_payment) → IPN success (held) → complete (mock momo_transfer_to_wallet) → completed
- Permission check: chỉ parent sở hữu task mới được setup
- Edge case: setup payment với task đã completed → raise ValueError

Chạy: DEBUG=True python manage.py test payments.tests.test_payment_flow
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from django.utils import timezone

from core.models import User, Task, ServiceCategory, TaskApplication
from payments.models import Payment, PaymentLog
from payments.services import setup_payment, handle_momo_ipn, release_escrow, COMMISSION_RATE


def _make_users():
    parent = User.objects.create_user(
        username='parent_pay', password='Demo@2026',
        role='parent', is_approved=True,
        email='parent_pay@test.com', phone_number='0900000001',
    )
    worker = User.objects.create_user(
        username='worker_pay', password='Demo@2026',
        role='worker', is_approved=True,
        email='worker_pay@test.com', phone_number='0900000002',
    )
    return parent, worker


def _make_task(parent, worker, status='in_progress', price=Decimal('500000')):
    cat = ServiceCategory.objects.create(name='Gia sư', icon_name='BookOpen')
    task = Task.objects.create(
        title='Gia sư Toán',
        description='2 buổi/tuần',
        price=price,
        parent=parent, category=cat,
        location='Hà Nội',
        scheduled_time=timezone.now() + timedelta(days=1),
        status=status,
    )
    if worker:
        TaskApplication.objects.create(task=task, worker=worker, status='accepted')
    return task


class CashPaymentFlowTest(TestCase):
    """Luồng tiền mặt: setup → task completed → payment completed."""

    def setUp(self):
        self.parent, self.worker = _make_users()
        self.task = _make_task(self.parent, self.worker, status='in_progress')

    def test_setup_cash_payment(self):
        """setup_payment method='cash' → Payment status='pending', commission 20%."""
        payment = setup_payment(task=self.task, method='cash', actor=self.parent)
        self.assertEqual(payment.method, 'cash')
        self.assertEqual(payment.status, 'pending')
        self.assertEqual(payment.amount, Decimal('500000'))
        # Commission = 500000 * 0.20 = 100000
        self.assertEqual(payment.commission_amount, Decimal('100000'))
        self.assertEqual(payment.worker_payout_amount, Decimal('400000'))
        self.assertEqual(payment.parent, self.parent)
        self.assertEqual(payment.worker, self.worker)

    def test_cash_payment_completes_on_task_completion(self):
        """Khi task chuyển sang 'completed' → payment.status='completed' (qua signal)."""
        # 1. Setup cash payment trước
        payment = setup_payment(task=self.task, method='cash', actor=self.parent)
        self.assertEqual(payment.status, 'pending')

        # 2. Complete task → trigger post_save signal → release_escrow → _record_cash_completion
        self.task.status = 'completed'
        self.task.save()

        payment.refresh_from_db()
        self.assertEqual(payment.status, 'completed',
                         f"Expected completed, got {payment.status}")
        # Worker payout đã được tính đúng
        self.assertEqual(payment.worker_payout_amount, Decimal('400000'))

    def test_setup_payment_permission(self):
        """Worker không phải owner cố setup → PermissionError."""
        with self.assertRaises(PermissionError):
            setup_payment(task=self.task, method='cash', actor=self.worker)

    def test_setup_payment_invalid_method(self):
        """Method không hợp lệ → ValueError."""
        with self.assertRaises(ValueError):
            setup_payment(task=self.task, method='bitcoin', actor=self.parent)

    def test_setup_payment_task_already_completed(self):
        """Task đã completed → không cho setup (ValueError)."""
        self.task.status = 'completed'
        self.task.save()
        with self.assertRaises(ValueError):
            setup_payment(task=self.task, method='cash', actor=self.parent)

    def test_payment_log_is_created(self):
        """Setup payment phải tạo PaymentLog 'payment_created'."""
        payment = setup_payment(task=self.task, method='cash', actor=self.parent)
        logs = PaymentLog.objects.filter(payment=payment)
        self.assertTrue(logs.exists(), "Phải có ít nhất 1 PaymentLog sau setup")
        self.assertEqual(logs.first().event_type, 'payment_created')


class MomoEscrowFlowTest(TestCase):
    """Luồng MoMo escrow: setup (mock) → IPN success (held) → complete (mock) → completed."""

    def setUp(self):
        self.parent, self.worker = _make_users()
        self.task = _make_task(self.parent, self.worker, status='in_progress')

    @patch('payments.services.momo_create_payment')
    def test_setup_momo_escrow_generates_payurl(self, mock_create):
        """setup_payment method='momo_escrow' → gọi momo_create_payment, lưu payUrl."""
        mock_create.return_value = {
            'orderId': 'EduCareLink_1_1234567890',
            'requestId': 'EduCareLink_1_1234567890_1',
            'payUrl': 'https://payment.momo.vn/v2/gateway/pay?t=TU9NT1...',
            'qrCodeUrl': 'https://payment.momo.vn/v2/gateway/pay?qr=...',
            'resultCode': 0,
        }
        payment = setup_payment(task=self.task, method='momo_escrow', actor=self.parent)
        self.assertEqual(payment.method, 'momo_escrow')
        self.assertEqual(payment.momo_order_id, 'EduCareLink_1_1234567890')
        self.assertEqual(payment.momo_pay_url, 'https://payment.momo.vn/v2/gateway/pay?t=TU9NT1...')
        mock_create.assert_called_once()

    @patch('payments.services.momo_create_payment')
    def test_setup_momo_escrow_failure_does_not_raise(self, mock_create):
        """Nếu MoMo API fail → setup_payment không raise (fallback gracefully)."""
        from payments.momo_client import MomoAPIError
        mock_create.side_effect = MomoAPIError("MoMo sandbox down")
        # Không raise → payment vẫn được tạo, nhưng payUrl=None
        payment = setup_payment(task=self.task, method='momo_escrow', actor=self.parent)
        self.assertEqual(payment.method, 'momo_escrow')
        # payUrl không được set vì API fail
        self.assertFalse(payment.momo_pay_url)
        # Log phải ghi lại sự cố
        logs = PaymentLog.objects.filter(payment=payment, event_type='momo_pay_url_failed')
        self.assertTrue(logs.exists())

    @patch('payments.services.momo_create_payment')
    def test_momo_ipn_success_moves_to_held(self, mock_create):
        """IPN resultCode=0 → payment.status='held'."""
        mock_create.return_value = {
            'orderId': 'EduCareLink_1_1234567890',
            'requestId': 'r1',
            'payUrl': 'https://momo.vn/pay',
            'resultCode': 0,
        }
        payment = setup_payment(task=self.task, method='momo_escrow', actor=self.parent)

        # MoMo gọi IPN
        result = handle_momo_ipn({
            'orderId': payment.momo_order_id,
            'requestId': payment.momo_request_id,
            'resultCode': 0,
            'transId': '1234567890',
            'amount': int(payment.amount),
            'message': 'Successful',
            'extraData': str(self.task.id),
        })
        self.assertTrue(result, "handle_momo_ipn phải trả True khi xử lý OK")
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'held',
                         f"Expected held sau IPN success, got {payment.status}")
        self.assertEqual(payment.momo_trans_id, '1234567890')

    @patch('payments.services.momo_transfer_to_wallet')
    @patch('payments.services.momo_create_payment')
    def test_momo_escrow_release_on_completion(self, mock_create, mock_transfer):
        """Full flow: setup → IPN → complete → release_escrow → completed."""
        mock_create.return_value = {
            'orderId': 'EduCareLink_1_1234567890',
            'requestId': 'r1',
            'payUrl': 'https://momo.vn/pay',
            'resultCode': 0,
        }
        mock_transfer.return_value = {
            'resultCode': 0,
            'message': 'Successful',
            'transId': '9876543210',
        }
        payment = setup_payment(task=self.task, method='momo_escrow', actor=self.parent)

        # IPN success
        handle_momo_ipn({
            'orderId': payment.momo_order_id,
            'requestId': payment.momo_request_id,
            'resultCode': 0,
            'transId': '1234567890',
            'amount': int(payment.amount),
            'message': 'Successful',
        })
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'held')

        # Task complete → signal → release_escrow → momo_transfer_to_wallet (mock) → completed
        self.task.status = 'completed'
        self.task.save()
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'completed',
                         f"Expected completed sau release_escrow, got {payment.status}")
        mock_transfer.assert_called_once()


class PaymentCommissionTest(TestCase):
    """Test tính hoa hồng với các mức giá khác nhau."""

    def setUp(self):
        self.parent, self.worker = _make_users()

    def test_commission_20_percent(self):
        """Commission rate = 20% mặc định."""
        self.assertEqual(COMMISSION_RATE, 0.20)

    def test_commission_amount_for_various_prices(self):
        """Test commission với 500k, 1M, 2M."""
        for price, expected_commission in [
            (Decimal('500000'), Decimal('100000')),
            (Decimal('1000000'), Decimal('200000')),
            (Decimal('2000000'), Decimal('400000')),
        ]:
            task = _make_task(self.parent, self.worker, price=price)
            payment = setup_payment(task=task, method='cash', actor=self.parent)
            self.assertEqual(
                payment.commission_amount, expected_commission,
                f"Commission sai cho price={price}: {payment.commission_amount} ≠ {expected_commission}"
            )
            self.assertEqual(
                payment.worker_payout_amount, price - expected_commission,
                f"Worker payout sai cho price={price}"
            )
