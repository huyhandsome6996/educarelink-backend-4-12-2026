"""
╔══════════════════════════════════════════════════════════════════╗
║   Payment Service Layer — Business Logic                          ║
║                                                                   ║
║   Tách logic nghiệp vụ khỏi views & MoMo client:                  ║
║     - setup_payment()          : tạo Payment + (tuỳ chọn) sinh    ║
║                                    payUrl MoMo cho phụ huynh      ║
║     - handle_momo_ipn()        : xử lý webhook MoMo (capture)     ║
║     - release_escrow()         : giải ngân 80% cho Carepartner    ║
║     - refund_escrow()          : hoàn 100% cho phụ huynh          ║
║     - record_cash_completion() : ghi nhận nợ hoa hồng tiền mặt    ║
║     - generate_monthly_settlements() : cron monthly — sinh QR     ║
║     - mark_settlement_paid()   : IPN callback cho QR hoa hồng     ║
║                                                                   ║
║   Mọi step đều ghi PaymentLog để audit.                          ║
╚══════════════════════════════════════════════════════════════════╝
"""

import logging
from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.conf import settings

from core.models import User, Task, TaskApplication, Notification
from core.views import send_expo_push_notification

from .models import Payment, CommissionSettlement, PaymentLog
from .momo_client import (
    create_payment as momo_create_payment,
    refund_payment as momo_refund_payment,
    transfer_to_wallet as momo_transfer_to_wallet,
    generate_order_id,
    generate_settlement_order_id,
    MomoAPIError, MomoConfigError,
)

logger = logging.getLogger('educarelink.payments')

COMMISSION_RATE = getattr(settings, 'PAYMENT_COMMISSION_RATE', 0.20)   # 20%
SETTLEMENT_DUE_DAYS = int(getattr(settings, 'PAYMENT_SETTLEMENT_DUE_DAYS', 7))


# ────────────────────────────────────────────────────────────────────
#  Helper nội bộ
# ────────────────────────────────────────────────────────────────────

def _notify_user(user: User, title: str, message: str, data: dict = None):
    """Gửi cả in-app Notification + Expo push (nếu có token)."""
    try:
        Notification.objects.create(recipient=user, title=title, message=message)
    except Exception as e:
        logger.warning(f"[payments] Tạo Notification thất bại: {e}")
    try:
        if user.expo_push_token:
            send_expo_push_notification(
                token=user.expo_push_token,
                title=title,
                body=message,
                data=data or {},
            )
    except Exception as e:
        logger.warning(f"[payments] Expo push thất bại cho user#{user.id}: {e}")


def _log(payment=None, settlement=None, event_type: str = '',
         message: str = '', payload: dict = None, actor: User = None):
    """Tạo PaymentLog — bọc try/except để không crash flow chính."""
    try:
        PaymentLog.objects.create(
            payment=payment,
            settlement=settlement,
            event_type=event_type,
            message=message,
            payload=payload or {},
            actor=actor,
        )
    except Exception as e:
        logger.error(f"[payments] PaymentLog create thất bại: {e}")


def _get_accepted_worker(task: Task) -> User | None:
    """Lấy Carepartner được accept cho task này (status='accepted')."""
    app = TaskApplication.objects.filter(task=task, status='accepted').first()
    return app.worker if app else None


# ────────────────────────────────────────────────────────────────────
#  1. SETUP PAYMENT  (Parent chọn momo_escrow | cash trước khi task running)
# ────────────────────────────────────────────────────────────────────

def setup_payment(*, task: Task, method: str, actor: User) -> Payment:
    """
    Tạo / cập nhật Payment cho task.

    - method='momo_escrow': gọi MoMo Pay App v2 sinh payUrl cho phụ huynh.
      Trả về Payment với payUrl lưu sẵn — frontend redirect phụ huynh tới.
    - method='cash': chỉ tạo bản ghi, không gọi MoMo.
      Hoa hồng sẽ được tính khi task completed.
    """
    if task.parent_id != actor.id:
        raise PermissionError("Chỉ phụ huynh sở hữu task mới được thiết lập thanh toán.")

    if task.status not in ('open', 'in_progress'):
        raise ValueError(f"Task ở trạng thái '{task.status}' không thể thiết lập thanh toán.")

    if method not in ('momo_escrow', 'payos', 'cash'):
        raise ValueError("method phải là 'momo_escrow', 'payos' hoặc 'cash'.")

    worker = _get_accepted_worker(task)

    # Idempotent: nếu đã có Payment rồi, update method/status; không tạo mới
    payment, created = Payment.objects.get_or_create(
        task=task,
        defaults={
            'parent': task.parent,
            'worker': worker,
            'amount': task.price,
            'commission_rate': Decimal(str(COMMISSION_RATE)),
            'method': method,
            'status': 'pending',
        },
    )
    if not created:
        # Đã có Payment rồi — chỉ cho phép đổi method nếu chưa thanh toán
        if payment.status not in ('pending', 'cancelled'):
            raise ValueError(
                f"Không thể đổi phương thức — Payment đã ở trạng thái '{payment.status}'."
            )
        payment.method = method
        payment.worker = worker or payment.worker
        payment.amount = task.price
        payment.commission_rate = Decimal(str(COMMISSION_RATE))
        # commission_amount & worker_payout_amount được tính lại trong save()
        payment.commission_amount = 0
        payment.worker_payout_amount = 0
        payment.status = 'pending'
        payment.save()

    _log(payment=payment, event_type='payment_created',
         message=f"Tạo Payment method={method} amount={payment.amount}",
         actor=actor)

    # ── MoMo ESCROW: sinh payUrl ───────────────────────────────────
    if method == 'momo_escrow':
        try:
            base_url = getattr(settings, 'MOMO_RETURN_BASE_URL',
                                'https://educarelink-backend.onrender.com')
            return_url = f"{base_url.rstrip('/')}/api/payments/momo-return/?order_id={payment.task_id}"
            ipn_url = getattr(settings, 'MOMO_IPN_URL',
                              f"{base_url.rstrip('/')}/api/payments/momo-ipn/")

            order_id = generate_order_id(task.id)
            request_id = f"{order_id}_{actor.id}"

            data = momo_create_payment(
                order_id=order_id,
                amount=int(payment.amount),
                order_info=f"EduCareLink — Thanh toán công việc: {task.title[:50]}",
                return_url=return_url,
                ipn_url=ipn_url,
                request_id=request_id,
                extra_data=str(task.id),
            )

            payment.momo_order_id = data.get('orderId')
            payment.momo_request_id = data.get('requestId')
            payment.momo_pay_url = data.get('payUrl')
            payment.momo_qr_code_url = data.get('qrCodeUrl', data.get('payUrl'))
            payment.save()

            _log(payment=payment, event_type='momo_pay_url_generated',
                 message=f"Sinh payUrl thành công | orderId={order_id}",
                 payload=data, actor=actor)

        except (MomoAPIError, MomoConfigError) as e:
            _log(payment=payment, event_type='momo_pay_url_failed',
                 message=str(e), payload=getattr(e, 'raw', {}), actor=actor)
            # Không raise — frontend vẫn nhận được payment record;
            # sẽ hiển thị "MoMo chưa sẵn sàng, vui lòng thử lại sau".

    return payment


# ────────────────────────────────────────────────────────────────────
#  2. HANDLE MOMO IPN  (webhook MoMo gọi về khi phụ huynh pay xong)
# ────────────────────────────────────────────────────────────────────

def handle_momo_ipn(payload: dict) -> bool:
    """
    Xử lý IPN callback từ MoMo.

    Trả về True nếu xử lý thành công (MoMo expects HTTP 204),
    False nếu có lỗi (sẽ trả 400 cho MoMo retry).
    """
    order_id = payload.get('orderId', '')
    result_code = payload.get('resultCode')
    trans_id = payload.get('transId')
    amount = payload.get('amount')
    message = payload.get('message', '')
    extra_data = payload.get('extraData', '')

    # Tìm Payment theo momo_order_id
    payment = Payment.objects.filter(momo_order_id=order_id).first()
    if not payment:
        # Có thể là CommissionSettlement QR (worker thanh toán hoa hồng)
        settlement = CommissionSettlement.objects.filter(momo_order_id=order_id).first()
        if settlement:
            return _handle_settlement_ipn(settlement, payload)
        logger.warning(f"[payments] IPN — không tìm thấy Payment/Settlement cho orderId={order_id}")
        return False

    # Thanh toán phụ huynh thất bại
    if result_code != 0:
        payment.momo_result_code = result_code
        payment.momo_message = message
        payment.status = 'cancelled'
        payment.save()
        _log(payment=payment, event_type='momo_ipn_failed',
             message=f"Phụ huynh pay thất bại: {message}",
             payload=payload)
        _notify_user(
            payment.parent,
            title="Thanh toán MoMo thất bại",
            message=f"Công việc '{payment.task.title}' — thanh toán không thành công. "
                    f"Lý do: {message}. Vui lòng thử lại.",
            data={'type': 'payment_failed', 'task_id': payment.task_id}
        )
        return True

    # Thanh toán thành công → chuyển sang 'held'
    payment.momo_trans_id = str(trans_id) if trans_id else None
    payment.momo_result_code = result_code
    payment.momo_message = message
    payment.status = 'held'
    payment.held_at = timezone.now()
    payment.save()

    _log(payment=payment, event_type='momo_ipn_held',
         message=f"MoMo đã giữ {amount}đ | transId={trans_id}",
         payload=payload)

    _notify_user(
        payment.parent,
        title="Đã thanh toán MoMo thành công",
        message=f"EduCareLink đã nhận {amount:,.0f}đ cho công việc "
                f"'{payment.task.title}'. Tiền sẽ được giữ đến khi Carepartner "
                f"hoàn thành công việc.",
        data={'type': 'payment_held', 'task_id': payment.task_id, 'amount': amount}
    )
    if payment.worker:
        _notify_user(
            payment.worker,
            title="Phụ huynh đã thanh toán",
            message=f"Phụ huynh đã thanh toán {amount:,.0f}đ qua MoMo cho công việc "
                    f"'{payment.task.title}'. Hãy bắt đầu làm việc nhé!",
            data={'type': 'payment_held', 'task_id': payment.task_id}
        )
    return True


def _handle_settlement_ipn(settlement: CommissionSettlement, payload: dict) -> bool:
    """Xử lý IPN cho QR thanh toán hoa hồng của Carepartner."""
    result_code = payload.get('resultCode')
    if result_code != 0:
        _log(settlement=settlement, event_type='settlement_qr_failed',
             message=f"Thanh toán hoa hồng thất bại: {payload.get('message')}",
             payload=payload)
        return True

    settlement.momo_trans_id = str(payload.get('transId'))
    settlement.momo_result_code = result_code
    settlement.momo_message = payload.get('message', '')
    settlement.status = 'paid'
    settlement.paid_at = timezone.now()
    settlement.save()

    _log(settlement=settlement, event_type='settlement_paid',
         message=f"Carepartner đã thanh toán {payload.get('amount')}đ hoa hồng",
         payload=payload)

    _notify_user(
        settlement.worker,
        title="Đã thanh toán hoa hồng thành công",
        message=f"EduCareLink đã nhận {settlement.total_amount:,.0f}đ hoa hồng "
                f"tháng {settlement.period_month:02d}/{settlement.period_year}. "
                f"Cảm ơn bạn!",
        data={'type': 'settlement_paid', 'settlement_id': settlement.id}
    )
    return True


# ────────────────────────────────────────────────────────────────────
#  3. RELEASE ESCROW  (gọi khi Task.status chuyển sang 'completed')
# ────────────────────────────────────────────────────────────────────

def release_escrow(payment: Payment) -> Payment:
    """
    Giải ngân escrow khi task hoàn thành:
      - method='momo_escrow': Gọi MoMo Transfer API gửi 80% cho worker
      - method='payos': Đánh dấu completed — admin manual transfer cho worker
        (PayOS Payout API cần KYC doanh nghiệp, chưa support auto)
      - method='cash': Ghi nhận công nợ hoa hồng để tổng hợp cuối tháng
    """
    if payment.method == 'cash':
        return _record_cash_completion(payment)

    # PayOS: không auto payout (cần KYC DN) — mark completed, notify admin
    if payment.method == 'payos':
        return _record_payos_completion(payment)

    if payment.status != 'held':
        logger.warning(f"[payments] release_escrow — payment#{payment.id} status={payment.status}, skip.")
        return payment

    if not payment.worker:
        logger.error(f"[payments] release_escrow — payment#{payment.id} không có worker!")
        _log(payment=payment, event_type='escrow_release_failed',
             message="Không có Carepartner được gán cho task.")
        return payment

    worker = payment.worker
    phone = (worker.phone_number or '').strip()
    if not phone:
        _log(payment=payment, event_type='escrow_release_failed',
             message=f"Worker#{worker.id} chưa có phone_number — không thể giải ngân MoMo.")
        payment.status = 'payout_failed'
        payment.save()
        _notify_admin_payout_failed(payment, reason="Worker thiếu phone_number")
        return payment

    payout_amount = int(payment.worker_payout_amount)
    request_id = f"payout_{payment.id}_{timezone.now().strftime('%Y%m%d%H%M%S')}"

    try:
        with transaction.atomic():
            resp = momo_transfer_to_wallet(
                request_id=request_id,
                amount=payout_amount,
                phone=phone,
                description=f"EduCareLink — Thanh toán công việc: {payment.task.title[:50]}",
            )

            if resp.get('resultCode') == 0:
                payment.payout_request_id = request_id
                payment.payout_trans_id = str(resp.get('transId', ''))
                payment.payout_response = resp
                payment.status = 'completed'
                payment.completed_at = timezone.now()
                payment.save()

                _log(payment=payment, event_type='escrow_released',
                     message=f"Đã giải ngân {payout_amount}đ cho worker#{worker.id} "
                             f"(phone={phone}) | commission={payment.commission_amount}đ",
                     payload=resp)

                _notify_user(
                    worker,
                    title="💰 Đã nhận thanh toán",
                    message=f"Bạn đã nhận {payout_amount:,.0f}đ cho công việc "
                            f"'{payment.task.title}'. Hoa hồng nền tảng "
                            f"{payment.commission_amount:,.0f}đ đã được trừ.",
                    data={'type': 'payout_received', 'task_id': payment.task_id,
                          'amount': payout_amount}
                )
                _notify_user(
                    payment.parent,
                    title="✅ Đã thanh toán cho Carepartner",
                    message=f"EduCareLink đã chuyển {payout_amount:,.0f}đ "
                            f"cho Carepartner của công việc '{payment.task.title}'.",
                    data={'type': 'payout_released', 'task_id': payment.task_id}
                )
            else:
                # Transfer API trả về lỗi (thường do chưa đăng ký Payout service)
                payment.payout_request_id = request_id
                payment.payout_response = resp
                payment.status = 'payout_failed'
                payment.save()
                _log(payment=payment, event_type='escrow_release_failed',
                     message=f"MoMo Transfer resultCode={resp.get('resultCode')} "
                             f"msg={resp.get('message')}",
                     payload=resp)
                _notify_admin_payout_failed(
                    payment,
                    reason=f"MoMo: {resp.get('message')} (code={resp.get('resultCode')})"
                )

    except (MomoAPIError, MomoConfigError) as e:
        payment.status = 'payout_failed'
        payment.payout_response = getattr(e, 'raw', {})
        payment.save()
        _log(payment=payment, event_type='escrow_release_failed',
             message=str(e), payload=getattr(e, 'raw', {}))
        _notify_admin_payout_failed(payment, reason=str(e))

    return payment


def _record_cash_completion(payment: Payment) -> Payment:
    """
    Với cash payment: chỉ cần đánh dấu completed & ghi log.
    Hoa hồng sẽ được tổng hợp thành CommissionSettlement vào cuối tháng.
    """
    payment.status = 'completed'
    payment.completed_at = timezone.now()
    payment.save()

    _log(payment=payment, event_type='cash_recorded',
         message=f"Ghi nhận công nợ hoa hồng {payment.commission_amount}đ "
                 f"cho worker#{payment.worker_id if payment.worker else 'N/A'} — "
                 f"sẽ tổng hợp cuối tháng.")

    if payment.worker:
        _notify_user(
            payment.worker,
            title="💰 Ghi nhận hoa hồng tiền mặt",
            message=f"Công việc '{payment.task.title}' đã hoàn thành. "
                    f"Hoa hồng {payment.commission_amount:,.0f}đ sẽ được tổng hợp "
                    f"vào cuối tháng và gửi QR thanh toán cho bạn.",
            data={'type': 'cash_commission_recorded', 'task_id': payment.task_id,
                  'amount': str(payment.commission_amount)}
        )
    return payment


def _record_payos_completion(payment: Payment) -> Payment:
    """
    Với PayOS payment: đánh dấu completed, ghi log.
    Admin sẽ manual transfer cho carepartner (PayOS Payout API cần KYC DN).
    """
    if payment.status not in ('held', 'pending'):
        logger.warning(f"[payments] _record_payos_completion — payment#{payment.id} status={payment.status}, skip.")
        return payment

    payment.status = 'completed'
    payment.completed_at = timezone.now()
    payment.save()

    payout_amount = int(payment.worker_payout_amount) if payment.worker_payout_amount else 0
    _log(payment=payment, event_type='payos_completed',
         message=f"PayOS task completed — admin cần transfer {payout_amount}đ "
                 f"cho worker#{payment.worker_id if payment.worker else 'N/A'} "
                 f"(commission={payment.commission_amount}đ)")

    # Notify worker
    if payment.worker:
        _notify_user(
            payment.worker,
            title="💰 Công việc hoàn thành",
            message=f"Công việc '{payment.task.title}' đã hoàn thành. "
                    f"Bạn sẽ nhận {payout_amount:,.0f}đ "
                    f"(sau trừ hoa hồng {payment.commission_amount:,.0f}đ) "
                    f"trong vòng 24h qua STK ngân hàng của bạn.",
            data={'type': 'payos_payout_pending', 'task_id': payment.task_id,
                  'amount': str(payout_amount)}
        )

    # Notify parent
    _notify_user(
        payment.parent,
        title="✅ Đã thanh toán cho Carepartner",
        message=f"Công việc '{payment.task.title}' đã hoàn thành. "
                f"{payout_amount:,.0f}đ sẽ được chuyển cho Carepartner.",
        data={'type': 'payos_completed', 'task_id': payment.task_id}
    )

    # Notify admin to manual transfer
    admins = User.objects.filter(is_superuser=True, is_active=True)
    for admin in admins:
        _notify_user(
            admin,
            title="💰 Cần chuyển tiền cho Carepartner",
            message=f"Payment#{payment.id} (Task#{payment.task_id}) completed via PayOS. "
                    f"Transfer {payout_amount:,.0f}đ cho worker#{payment.worker_id}.",
            data={'type': 'payos_manual_payout', 'payment_id': payment.id}
        )

    return payment


def _notify_admin_payout_failed(payment: Payment, reason: str):
    """Thông báo Admin khi giải ngân thất bại — gửi cho tất cả superuser."""
    admins = User.objects.filter(is_superuser=True, is_active=True)
    for admin in admins:
        _notify_user(
            admin,
            title="⚠️ Giải ngân thất bại",
            message=f"Payment#{payment.id} (Task#{payment.task_id}) — {reason}. "
                    f"Vào admin dashboard để xử lý thủ công.",
            data={'type': 'payout_failed', 'payment_id': payment.id}
        )


# ────────────────────────────────────────────────────────────────────
#  4. REFUND ESCROW  (Task bị huỷ khi đang 'held')
# ────────────────────────────────────────────────────────────────────

def refund_escrow(payment: Payment) -> Payment:
    """Hoàn 100% tiền về ví MoMo phụ huynh khi task bị huỷ."""
    if payment.method == 'payos':
        # PayOS: admin manual refund (chuyển khoản ngược lại parent)
        payment.status = 'refunded'
        payment.refunded_at = timezone.now()
        payment.save()
        _log(payment=payment, event_type='payos_refund_pending',
             message=f"PayOS refund pending — admin cần transfer {payment.amount}đ "
                     f"cho parent#{payment.parent_id}")
        # Notify admin
        admins = User.objects.filter(is_superuser=True, is_active=True)
        for admin in admins:
            _notify_user(
                admin,
                title="💸 Cần hoàn tiền PayOS",
                message=f"Payment#{payment.id} (Task#{payment.task_id}) bị hủy. "
                        f"Hoàn {payment.amount:,.0f}đ cho parent#{payment.parent_id}.",
                data={'type': 'payos_manual_refund', 'payment_id': payment.id}
            )
        _notify_user(
            payment.parent,
            title="💸 Hoàn tiền đang xử lý",
            message=f"Công việc '{payment.task.title}' bị huỷ. "
                    f"{payment.amount:,.0f}đ sẽ được hoàn trong vòng 24h.",
            data={'type': 'payos_refund_pending', 'task_id': payment.task_id}
        )
        return payment

    if payment.method != 'momo_escrow':
        # Cash: không có gì để hoàn
        payment.status = 'cancelled'
        payment.save()
        return payment

    if payment.status not in ('held', 'payout_failed'):
        logger.warning(f"[payments] refund_escrow — payment#{payment.id} status={payment.status}, skip.")
        return payment

    if not payment.momo_trans_id:
        logger.error(f"[payments] refund_escrow — payment#{payment.id} thiếu momo_trans_id!")
        return payment

    _log(payment=payment, event_type='refund_initiated',
         message=f"Bắt đầu hoàn {payment.amount}đ cho phụ huynh#{payment.parent_id}")

    try:
        resp = momo_refund_payment(
            order_id=payment.momo_order_id,
            trans_id=payment.momo_trans_id,
            amount=int(payment.amount),
            description=f"Hoan tien task#{payment.task_id} bi huy",
        )
        if resp.get('resultCode') == 0:
            payment.status = 'refunded'
            payment.refunded_at = timezone.now()
            payment.save()
            _log(payment=payment, event_type='refund_completed',
                 message=f"Đã hoàn {payment.amount}đ", payload=resp)
            _notify_user(
                payment.parent,
                title="💸 Đã hoàn tiền",
                message=f"EduCareLink đã hoàn {payment.amount:,.0f}đ "
                        f"cho công việc '{payment.task.title}' bị huỷ. "
                        f"Tiền sẽ về ví MoMo của bạn trong vài phút.",
                data={'type': 'refund_completed', 'task_id': payment.task_id,
                      'amount': str(payment.amount)}
            )
        else:
            _log(payment=payment, event_type='refund_failed',
                 message=f"MoMo refund resultCode={resp.get('resultCode')} msg={resp.get('message')}",
                 payload=resp)
            _notify_user(
                payment.parent,
                title="Hoàn tiền thất bại",
                message=f"Không thể hoàn tiền cho task '{payment.task.title}'. "
                        f"EduCareLink sẽ liên hệ MoMo và xử lý sớm.",
                data={'type': 'refund_failed', 'task_id': payment.task_id}
            )
    except (MomoAPIError, MomoConfigError) as e:
        _log(payment=payment, event_type='refund_failed',
             message=str(e), payload=getattr(e, 'raw', {}))
    return payment


# ────────────────────────────────────────────────────────────────────
#  5. SIGNAL HANDLER  (Task post_save — tự động trigger release/refund)
# ────────────────────────────────────────────────────────────────────

def on_task_status_changed(task: Task, old_status: str, new_status: str):
    """
    Được gọi từ signal post_save của core.Task.
    - new_status='completed' → release_escrow (momo/payos) hoặc record_cash_completion (cash)
    - new_status='cancelled' → refund_escrow (nếu đang held)
    """
    payment = getattr(task, 'payment', None)
    if not payment:
        return  # Task chưa có Payment setup — không phải việc cần thanh toán qua hệ thống

    if new_status == 'completed' and old_status != 'completed':
        if payment.method == 'cash':
            _record_cash_completion(payment)
        elif payment.method == 'payos':
            _record_payos_completion(payment)
        elif payment.method == 'momo_escrow' and payment.status == 'held':
            release_escrow(payment)

    elif new_status == 'cancelled' and old_status != 'cancelled':
        if payment.method == 'momo_escrow' and payment.status == 'held':
            refund_escrow(payment)
        elif payment.method == 'payos' and payment.status == 'held':
            refund_escrow(payment)
        elif payment.method == 'cash' and payment.status == 'pending':
            payment.status = 'cancelled'
            payment.save()


# ────────────────────────────────────────────────────────────────────
#  6. MONTHLY SETTLEMENT  (Cron — sinh QR cho hoa hồng tiền mặt)
# ────────────────────────────────────────────────────────────────────

def generate_monthly_settlements(*, year: int = None, month: int = None) -> dict:
    """
    Tổng hợp & sinh QR cho hoa hồng tiền mặt của tháng trước.

    Args:
        year, month: kỳ cần tổng hợp (mặc định = tháng trước thời điểm chạy)

    Returns:
        {"settlements_created": N, "settlements_failed": M, "total_amount": X}
    """
    now = timezone.now()
    if year is None or month is None:
        # Mặc định: tổng hợp tháng trước
        if now.month == 1:
            year, month = now.year - 1, 12
        else:
            year, month = now.year, now.month - 1

    # Tìm tất cả Payment cash đã completed trong kỳ
    start = timezone.make_aware(
        timezone.datetime(year, month, 1)
    )
    if month == 12:
        end = timezone.make_aware(timezone.datetime(year + 1, 1, 1))
    else:
        end = timezone.make_aware(timezone.datetime(year, month + 1, 1))

    payments_qs = Payment.objects.filter(
        method='cash',
        status='completed',
        completed_at__gte=start,
        completed_at__lt=end,
        worker__isnull=False,
    )

    # Group theo worker
    stats = {'settlements_created': 0, 'settlements_failed': 0,
             'total_amount': Decimal('0'), 'skipped_existing': 0}

    worker_ids = payments_qs.values_list('worker_id', flat=True).distinct()
    for worker_id in worker_ids:
        worker = User.objects.get(id=worker_id)
        worker_payments = payments_qs.filter(worker=worker)
        total_amount = worker_payments.aggregate(
            t=Sum('commission_amount')
        )['t'] or Decimal('0')
        total_tasks = worker_payments.count()

        if total_amount <= 0:
            continue

        # Idempotent: nếu đã có settlement cho (worker, year, month) → skip
        _, created_flag = CommissionSettlement.objects.get_or_create(
            worker=worker, period_year=year, period_month=month,
            defaults={
                'total_tasks': total_tasks,
                'total_amount': total_amount,
                'task_ids': list(worker_payments.values_list('id', flat=True)),
                'status': 'pending',
            }
        )
        if not created_flag:
            stats['skipped_existing'] += 1
            continue

        settlement = CommissionSettlement.objects.get(
            worker=worker, period_year=year, period_month=month
        )
        _log(settlement=settlement, event_type='settlement_created',
             message=f"Tạo kỳ thanh toán {month:02d}/{year} — "
                     f"{total_tasks} task, {total_amount}đ",
             payload={'task_ids': settlement.task_ids})

        # Sinh MoMo QR cho worker quét
        ok = _generate_settlement_qr(settlement)
        if ok:
            stats['settlements_created'] += 1
            stats['total_amount'] += total_amount
        else:
            stats['settlements_failed'] += 1

    return stats


def _generate_settlement_qr(settlement: CommissionSettlement) -> bool:
    """Gọi MoMo Pay App sinh payUrl + qrCodeUrl cho settlement."""
    try:
        base_url = getattr(settings, 'MOMO_RETURN_BASE_URL',
                           'https://educarelink-backend.onrender.com')
        return_url = f"{base_url.rstrip('/')}/api/payments/settlement-return/?settlement_id={settlement.id}"
        ipn_url = getattr(settings, 'MOMO_IPN_URL',
                          f"{base_url.rstrip('/')}/api/payments/momo-ipn/")

        order_id = generate_settlement_order_id(settlement.id)
        request_id = f"{order_id}_{settlement.worker_id}"

        data = momo_create_payment(
            order_id=order_id,
            amount=int(settlement.total_amount),
            order_info=f"EduCareLink — Hoa hồng tháng {settlement.period_month:02d}/{settlement.period_year}",
            return_url=return_url,
            ipn_url=ipn_url,
            request_id=request_id,
            extra_data=f"settlement:{settlement.id}",
        )

        settlement.momo_order_id = data.get('orderId')
        settlement.momo_request_id = data.get('requestId')
        settlement.momo_pay_url = data.get('payUrl')
        settlement.momo_qr_code_url = data.get('qrCodeUrl', data.get('payUrl'))
        settlement.status = 'qr_generated'
        settlement.generated_at = timezone.now()
        settlement.due_at = timezone.now() + timedelta(days=SETTLEMENT_DUE_DAYS)
        settlement.save()

        _log(settlement=settlement, event_type='settlement_qr_generated',
             message=f"Sinh QR thành công | orderId={order_id}",
             payload=data)

        # Gửi push + in-app notification cho worker
        _notify_user(
            settlement.worker,
            title="📊 Kỳ thanh toán hoa hồng đã sẵn sàng",
            message=f"Tổng hoa hồng tháng {settlement.period_month:02d}/{settlement.period_year}: "
                    f"{settlement.total_amount:,.0f}đ. Hạn thanh toán: "
                    f"{settlement.due_at.strftime('%d/%m/%Y')}. "
                    f"Vào app > Thanh toán > Quét QR MoMo để thanh toán.",
            data={
                'type': 'settlement_qr_ready',
                'settlement_id': settlement.id,
                'amount': str(settlement.total_amount),
                'qr_url': settlement.momo_qr_code_url,
                'due_at': settlement.due_at.isoformat() if settlement.due_at else None,
            }
        )
        return True

    except (MomoAPIError, MomoConfigError) as e:
        _log(settlement=settlement, event_type='settlement_qr_failed',
             message=str(e), payload=getattr(e, 'raw', {}))
        # Vẫn notify worker — biết là có kỳ cần thanh toán, sẽ liên hệ Admin
        _notify_user(
            settlement.worker,
            title="⚠️ Chưa sinh được QR hoa hồng",
            message=f"EduCareLink chưa tạo được QR MoMo cho kỳ "
                    f"{settlement.period_month:02d}/{settlement.period_year} "
                    f"({settlement.total_amount:,.0f}đ). Vui lòng liên hệ Admin.",
            data={'type': 'settlement_qr_failed', 'settlement_id': settlement.id}
        )
        return False


def send_settlement_reminders() -> dict:
    """
    Gửi nhắc nhở cho các settlement quá hạn (chưa paid sau due_at).
    Cron chạy mỗi ngày lúc 9h sáng.
    """
    now = timezone.now()
    overdue_qs = CommissionSettlement.objects.filter(
        status='qr_generated',
        due_at__lt=now,
    )
    count = 0
    for s in overdue_qs:
        s.status = 'overdue'
        s.save()
        _log(settlement=s, event_type='settlement_overdue',
             message=f"Quá hạn — due_at={s.due_at}")
        _notify_user(
            s.worker,
            title="⏰ Kỳ thanh toán hoa hồng quá hạn",
            message=f"Kỳ {s.period_month:02d}/{s.period_year} ({s.total_amount:,.0f}đ) "
                    f"đã quá hạn. Vui lòng thanh toán sớm để tránh khóa tài khoản.",
            data={'type': 'settlement_overdue', 'settlement_id': s.id}
        )
        count += 1
    return {'reminders_sent': count}
