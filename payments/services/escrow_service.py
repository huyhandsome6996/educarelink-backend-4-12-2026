"""
Escrow Service — Logic phân tiền khi Task completed (luồng MoMo).

MỤC TIÊU:
  Khi phụ huynh đánh dấu Task hoàn thành & PaymentOrder đã 'paid' (MoMo):
    → 80% task.price  → Worker.Wallet.balance
    → 20% task.price  → Admin.Wallet.balance
    → Parent.Wallet.held_balance -= task.price (trừ tiền đã phong tỏa)
    → Tạo 3 EscrowTransaction để audit

TỶ LỆ HOA HỒNG:
  Mặc định 20%, có thể override qua env PAYMENT_COMMISSION_RATE (vd: 0.20)

ID ADMIN NHẬN HOA HỒNG:
  PAYMENT_ADMIN_USER_ID — ID của user admin (is_staff=True) sẽ nhận hoa hồng.
  Nếu không set, tự pick user is_superuser=True đầu tiên.
"""
import os
import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from core.models import Task, User
from payments.models import (
    Wallet, PaymentOrder, EscrowTransaction, CommissionDebt,
)

logger = logging.getLogger('educarelink.escrow')

COMMISSION_RATE = Decimal(os.environ.get('PAYMENT_COMMISSION_RATE', '0.20'))


def _get_admin_user() -> User:
    """
    Lấy user Admin nhận hoa hồng:
      1. PAYMENT_ADMIN_USER_ID nếu set
      2. Hoặc user is_superuser=True đầu tiên
    """
    admin_id = os.environ.get('PAYMENT_ADMIN_USER_ID')
    if admin_id:
        try:
            return User.objects.get(id=int(admin_id), is_staff=True)
        except (User.DoesNotExist, ValueError):
            pass
    admin = User.objects.filter(is_superuser=True).first()
    if not admin:
        # Fallback: is_staff=True đầu tiên
        admin = User.objects.filter(is_staff=True).first()
    return admin


def get_or_create_wallet(user: User) -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet


# ───────────────────────────────────────────────────────────────────
# LUỒNG MOMO: HOLD TIỀN KHI PARENT THANH TOÁN
# ───────────────────────────────────────────────────────────────────
@transaction.atomic
def hold_escrow_on_momo_paid(payment_order: PaymentOrder) -> bool:
    """
    Được gọi từ IPN handler khi MoMo báo đã thanh toán thành công.

    Logic:
      1. Cập nhật PaymentOrder.status = 'paid'
      2. Parent.Wallet.held_balance += amount
      3. Tạo EscrowTransaction(TYPE_HOLD)
      4. (Idempotent) Nếu đã hold rồi → bỏ qua
    """
    if payment_order.payment_method != PaymentOrder.METHOD_MOMO:
        return False

    # Idempotent: đã có txn HOLD cho payment_order này → skip
    already_held = EscrowTransaction.objects.filter(
        task=payment_order.task,
        txn_type=EscrowTransaction.TYPE_HOLD,
    ).exists()
    if already_held:
        logger.info(f"[Escrow] HOLD skipped — already held for Task#{payment_order.task_id}")
        return True

    parent_wallet = get_or_create_wallet(payment_order.parent)
    parent_wallet.held_balance += payment_order.amount
    parent_wallet.save(update_fields=['held_balance', 'updated_at'])

    EscrowTransaction.objects.create(
        task=payment_order.task,
        wallet=parent_wallet,
        amount=payment_order.amount,
        txn_type=EscrowTransaction.TYPE_HOLD,
        description=f"Phong tỏa {payment_order.amount} VNĐ từ MoMo (orderId={payment_order.momo_order_id})",
    )

    logger.info(
        f"[Escrow] HOLD OK — Task#{payment_order.task_id} | "
        f"Parent={payment_order.parent.username} | Amount={payment_order.amount}"
    )
    return True


# ───────────────────────────────────────────────────────────────────
# LUỒNG MOMO: RELEASE KHI TASK COMPLETED
# ───────────────────────────────────────────────────────────────────
@transaction.atomic
def release_escrow_on_task_completed(task: Task) -> dict:
    """
    Được gọi từ signal post_save Task (khi status chuyển 'completed').

    Phân chia tiền cho 2 trường hợp:
      A. PaymentOrder.method=momo + status=paid  → phân tiền như escrow
      B. PaymentOrder.method=cash                 → chỉ ghi nợ hoa hồng (xem commission_service)

    Returns:
      {
        'flow': 'momo' | 'cash' | 'skipped',
        'released_to_worker': Decimal,
        'commission_to_admin': Decimal,
        'error': str | None,
      }
    """
    try:
        payment_order = task.payment_order
    except PaymentOrder.DoesNotExist:
        return {
            'flow': 'skipped', 'released_to_worker': Decimal('0'),
            'commission_to_admin': Decimal('0'),
            'error': 'Task chưa có PaymentOrder (có thể được tạo trước khi module payments active)'
        }

    if payment_order.payment_method == PaymentOrder.METHOD_CASH:
        # Cash: không có tiền trong ví → chỉ ghi nợ hoa hồng
        from .commission_service import record_cash_completion
        result = record_cash_completion(task)
        return {'flow': 'cash', 'released_to_worker': Decimal('0'),
                'commission_to_admin': result.get('commission_amount', Decimal('0')),
                'error': None}

    # MoMo flow: chỉ release nếu đã paid
    if payment_order.status != PaymentOrder.STATUS_PAID:
        return {'flow': 'momo', 'released_to_worker': Decimal('0'),
                'commission_to_admin': Decimal('0'),
                'error': f'PaymentOrder.status={payment_order.status} (chưa paid)'}

    # Idempotent: nếu đã có txn release cho task → skip
    already_released = EscrowTransaction.objects.filter(
        task=task, txn_type=EscrowTransaction.TYPE_RELEASE_TO_WORKER
    ).exists()
    if already_released:
        logger.info(f"[Escrow] RELEASE skipped — already released for Task#{task.id}")
        return {'flow': 'momo', 'released_to_worker': Decimal('0'),
                'commission_to_admin': Decimal('0'), 'error': None}

    # Lấy worker được accepted cho task này
    application = task.applications.filter(status='accepted').first()
    if not application:
        return {'flow': 'momo', 'released_to_worker': Decimal('0'),
                'commission_to_admin': Decimal('0'),
                'error': 'Không có Carepartner nào được accepted cho task'}
    worker = application.worker

    admin = _get_admin_user()
    if not admin:
        return {'flow': 'momo', 'released_to_worker': Decimal('0'),
                'commission_to_admin': Decimal('0'),
                'error': 'Không tìm thấy Admin để nhận hoa hồng'}

    parent_wallet = get_or_create_wallet(task.parent)
    worker_wallet = get_or_create_wallet(worker)
    admin_wallet  = get_or_create_wallet(admin)

    price = task.price
    commission = (price * COMMISSION_RATE).quantize(Decimal('1'))
    worker_share = price - commission

    # Trừ tiền đã phong tỏa của Parent
    parent_wallet.held_balance -= price
    parent_wallet.save(update_fields=['held_balance', 'updated_at'])

    # Cộng 80% cho Worker
    worker_wallet.balance += worker_share
    worker_wallet.save(update_fields=['balance', 'updated_at'])

    # Cộng 20% cho Admin
    admin_wallet.balance += commission
    admin_wallet.save(update_fields=['balance', 'updated_at'])

    # Tạo audit transactions
    EscrowTransaction.objects.create(
        task=task, wallet=parent_wallet, amount=price,
        txn_type=EscrowTransaction.TYPE_REFUND_HELD,
        description=f"Trừ tiền đã phong tỏa khi Task#{task.id} hoàn thành",
    )
    EscrowTransaction.objects.create(
        task=task, wallet=worker_wallet, amount=worker_share,
        txn_type=EscrowTransaction.TYPE_RELEASE_TO_WORKER,
        description=f"Giải ngân 80% (tỷ lệ hoa hồng {COMMISSION_RATE*100:.0f}%) cho Carepartner {worker.username}",
    )
    EscrowTransaction.objects.create(
        task=task, wallet=admin_wallet, amount=commission,
        txn_type=EscrowTransaction.TYPE_COMMISSION_TO_ADMIN,
        description=f"Hoa hồng {COMMISSION_RATE*100:.0f}% từ Task#{task.id} (Parent={task.parent.username}, Worker={worker.username})",
    )

    logger.info(
        f"[Escrow] RELEASE OK — Task#{task.id} | "
        f"Worker={worker.username} (+{worker_share}) | "
        f"Admin={admin.username} (+{commission}) | "
        f"Parent={task.parent.username} (giải tỏ {price})"
    )
    return {
        'flow': 'momo',
        'released_to_worker': worker_share,
        'commission_to_admin': commission,
        'error': None,
    }


# ───────────────────────────────────────────────────────────────────
# HOÀN TIỀN KHI TASK BỊ CANCEL
# ───────────────────────────────────────────────────────────────────
@transaction.atomic
def refund_on_task_cancelled(task: Task) -> dict:
    """
    Khi task bị cancel & đã có HOLD tiền MoMo → hoàn lại cho Parent.

    Logic:
      - Parent.Wallet.balance += amount (đưa từ held sang available để rút)
      - Parent.Wallet.held_balance -= amount
      - EscrowTransaction(TYPE_REFUND_TO_PARENT)
    """
    try:
        payment_order = task.payment_order
    except PaymentOrder.DoesNotExist:
        return {'refunded': Decimal('0'), 'error': 'No PaymentOrder'}

    if payment_order.payment_method != PaymentOrder.METHOD_MOMO:
        return {'refunded': Decimal('0'), 'error': 'Cash flow — không có tiền hold'}
    if payment_order.status != PaymentOrder.STATUS_PAID:
        return {'refunded': Decimal('0'), 'error': 'PaymentOrder chưa paid'}

    already_refunded = EscrowTransaction.objects.filter(
        task=task, txn_type=EscrowTransaction.TYPE_REFUND_TO_PARENT
    ).exists()
    if already_refunded:
        return {'refunded': Decimal('0'), 'error': 'Already refunded'}

    parent_wallet = get_or_create_wallet(task.parent)
    parent_wallet.held_balance -= payment_order.amount
    parent_wallet.balance += payment_order.amount
    parent_wallet.save(update_fields=['held_balance', 'balance', 'updated_at'])

    EscrowTransaction.objects.create(
        task=task, wallet=parent_wallet, amount=payment_order.amount,
        txn_type=EscrowTransaction.TYPE_REFUND_TO_PARENT,
        description=f"Hoàn tiền cho Parent khi Task#{task.id} bị hủy",
    )
    logger.info(f"[Escrow] REFUND OK — Task#{task.id} | Refund {payment_order.amount} to {task.parent.username}")
    return {'refunded': payment_order.amount, 'error': None}


# ───────────────────────────────────────────────────────────────────
# DISBURSEMENT (Rút tiền Worker về MoMo)
# ───────────────────────────────────────────────────────────────────
@transaction.atomic
def disburse_to_momo(worker_wallet: Wallet, amount: Decimal, order_info: str) -> dict:
    """
    Worker rút tiền từ ví nội bộ về MoMo.

    Returns:
      {
        'success': bool,
        'momo_trans_id': str | None,
        'error': str | None,
      }
    """
    if not worker_wallet.momo_phone:
        return {'success': False, 'momo_trans_id': None,
                'error': 'Chưa liên kết SĐT MoMo trong ví'}
    if worker_wallet.balance < amount:
        return {'success': False, 'momo_trans_id': None,
                'error': 'Số dư khả dụng không đủ'}
    if amount <= 0:
        return {'success': False, 'momo_trans_id': None,
                'error': 'Số tiền rút phải > 0'}

    from .momo_service import request_disbursement

    # Trừ trước để tránh race condition
    worker_wallet.balance -= amount
    worker_wallet.save(update_fields=['balance', 'updated_at'])

    result = request_disbursement(
        amount=amount,
        receiver_phone=worker_wallet.momo_phone,
        order_info=order_info,
    )

    if result['success']:
        EscrowTransaction.objects.create(
            task=None,
            wallet=worker_wallet,
            amount=amount,
            txn_type=EscrowTransaction.TYPE_DISBURSE,
            description=f"Rút {amount} VNĐ về MoMo ({worker_wallet.momo_phone}) — {order_info}",
            momo_trans_id=result.get('momo_trans_id'),
        )
        logger.info(f"[Escrow] DISBURSE OK — Worker={worker_wallet.user.username} | Amount={amount} | transId={result.get('momo_trans_id')}")
        return {'success': True, 'momo_trans_id': result.get('momo_trans_id'), 'error': None}
    else:
        # Rollback: hoàn tiền vào ví
        worker_wallet.balance += amount
        worker_wallet.save(update_fields=['balance', 'updated_at'])
        logger.warning(f"[Escrow] DISBURSE FAIL — Rollback | Worker={worker_wallet.user.username} | Error={result.get('error')}")
        return {'success': False, 'momo_trans_id': None, 'error': result.get('error')}
