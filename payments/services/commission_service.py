"""
Commission Service — Logic tính & tích lũy hoa hồng 20% (luồng CASH).

MỤC TIÊU:
  Khi Task completed + PaymentOrder.method=cash:
    → Tạo 1 CommissionDebt (gross=task.price, commission=price*0.20, status=pending)

  Cuối tháng (commission_scheduler.py gọi `generate_monthly_statements()`):
    → Aggregate CommissionDebt pending của từng Worker trong tháng trước
    → Tạo MonthlyCommissionStatement + sinh VietQR
    → Gửi Notification + Expo Push cho Worker

  Worker quét QR chuyển khoản → Admin duyệt (API mark_paid) → Statement(paid), CommissionDebt(paid)
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from core.models import Task, User, Notification
from payments.models import CommissionDebt, MonthlyCommissionStatement
from . import escrow_service
from .vietqr_service import build_vietqr_url, build_commission_memo

logger = logging.getLogger('educarelink.commission')

# Tỷ lệ hoa hồng (cùng env với escrow_service)
import os
COMMISSION_RATE = Decimal(os.environ.get('PAYMENT_COMMISSION_RATE', '0.20'))


# ───────────────────────────────────────────────────────────────────
# GHI NỢ KHI TASK CASH COMPLETED
# ───────────────────────────────────────────────────────────────────
@transaction.atomic
def record_cash_completion(task: Task) -> dict:
    """
    Tạo CommissionDebt cho task (cash) vừa completed.
    Idempotent: nếu đã có CommissionDebt cho task → skip.
    """
    existing = CommissionDebt.objects.filter(task=task).first()
    if existing:
        logger.info(f"[Commission] SKIP — Task#{task.id} đã có CommissionDebt#{existing.id}")
        return {'commission_amount': existing.commission_amount, 'debt_id': existing.id, 'created': False}

    application = task.applications.filter(status='accepted').first()
    if not application:
        return {'commission_amount': Decimal('0'), 'debt_id': None, 'created': False,
                'error': 'Không có Carepartner được accepted'}

    worker = application.worker
    debt = CommissionDebt.objects.create(
        worker=worker,
        task=task,
        gross_amount=task.price,
        commission_rate=COMMISSION_RATE,
        commission_amount=(task.price * COMMISSION_RATE).quantize(Decimal('1')),
        status=CommissionDebt.STATUS_PENDING,
    )
    logger.info(
        f"[Commission] DEBT CREATED — Task#{task.id} | Worker={worker.username} | "
        f"Gross={debt.gross_amount} | Commission={debt.commission_amount}"
    )
    return {'commission_amount': debt.commission_amount, 'debt_id': debt.id, 'created': True}


# ───────────────────────────────────────────────────────────────────
# TỔNG HỢP CUỐI THÁNG
# ───────────────────────────────────────────────────────────────────
def _get_previous_month_range(today: date = None) -> tuple[date, date]:
    """Trả về (first_day_of_prev_month, last_day_of_prev_month)."""
    today = today or timezone.now().date()
    first_of_this_month = today.replace(day=1)
    last_day_prev = first_of_this_month - timedelta(days=1)
    first_day_prev = last_day_prev.replace(day=1)
    return first_day_prev, last_day_prev


@transaction.atomic
def generate_monthly_statements(*, target_month: date = None, dry_run: bool = False) -> dict:
    """
    Sinh MonthlyCommissionStatement cho TẤT CẢ Worker có CommissionDebt pending.

    Args:
        target_month: Ngày đầu tháng cần tổng hợp. Nếu None → tháng trước.
        dry_run: True → chỉ log, không tạo statement (test mode).

    Returns:
        {
            'statements_created': int,
            'total_commission': Decimal,
            'workers_processed': list[dict],
        }
    """
    if target_month is None:
        period_start, period_end = _get_previous_month_range()
        target_month = period_start
    else:
        # target_month là ngày đầu tháng → tính period_start/end
        period_start = target_month.replace(day=1)
        # Cuối tháng = ngày 1 của tháng sau - 1 ngày
        if period_start.month == 12:
            next_month_first = period_start.replace(year=period_start.year + 1, month=1, day=1)
        else:
            next_month_first = period_start.replace(month=period_start.month + 1, day=1)
        period_end = next_month_first - timedelta(days=1)

    # Lọc debts pending trong period (dựa vào created_at)
    pending_debts = CommissionDebt.objects.filter(
        status=CommissionDebt.STATUS_PENDING,
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )

    # Group theo worker
    workers_processed = []
    total_all = Decimal('0')
    statements_created = 0

    for worker_id in pending_debts.values_list('worker_id', flat=True).distinct():
        worker = User.objects.get(id=worker_id)
        debts = list(pending_debts.filter(worker_id=worker_id))
        if not debts:
            continue

        total_gross = sum((d.gross_amount for d in debts), Decimal('0'))
        total_commission = sum((d.commission_amount for d in debts), Decimal('0'))
        total_all += total_commission

        if dry_run:
            workers_processed.append({
                'worker_id': worker.id, 'worker_username': worker.username,
                'debt_count': len(debts), 'total_gross': str(total_gross),
                'total_commission': str(total_commission),
            })
            continue

        # Kiểm tra đã có statement cho (worker, month) chưa
        stmt, created = MonthlyCommissionStatement.objects.get_or_create(
            worker=worker, month=target_month,
            defaults={
                'period_start': period_start,
                'period_end': period_end,
                'total_gross': total_gross,
                'total_commission': total_commission,
                'debt_count': len(debts),
                'status': MonthlyCommissionStatement.STATUS_DRAFT,
            },
        )

        if not created:
            # Đã có statement → cập nhật lại số liệu (nếu chưa sent)
            if stmt.status == MonthlyCommissionStatement.STATUS_DRAFT:
                stmt.period_start = period_start
                stmt.period_end = period_end
                stmt.total_gross = total_gross
                stmt.total_commission = total_commission
                stmt.debt_count = len(debts)
                stmt.save()
        else:
            statements_created += 1

        # Sinh QR
        month_str = target_month.strftime('%m%Y')  # vd: 032026
        memo = build_commission_memo(worker.username, month_str)
        try:
            qr_url, qr_payload = build_vietqr_url(
                amount=total_commission,
                memo=memo,
            )
            stmt.vietqr_url = qr_url
            stmt.qr_payload = qr_payload
            stmt.save(update_fields=['vietqr_url', 'qr_payload', 'updated_at'])
        except Exception as e:
            logger.warning(f"[Commission] VietQR build fail for {worker.username}: {e}")

        # Gán debts vào statement & đánh dấu SENT
        debts_qs = CommissionDebt.objects.filter(id__in=[d.id for d in debts])
        debts_qs.update(statement=stmt, status=CommissionDebt.STATUS_SENT)
        stmt.status = MonthlyCommissionStatement.STATUS_SENT
        stmt.sent_at = timezone.now()
        stmt.save(update_fields=['status', 'sent_at', 'updated_at'])

        # Gửi notification + push
        _notify_worker_statement(worker, stmt)

        workers_processed.append({
            'worker_id': worker.id, 'worker_username': worker.username,
            'statement_id': stmt.id, 'debt_count': len(debts),
            'total_gross': str(total_gross), 'total_commission': str(total_commission),
            'vietqr_url': stmt.vietqr_url,
        })

    logger.info(
        f"[Commission] generate_monthly_statements — period={period_start} → {period_end} | "
        f"statements_created={statements_created} | total_commission={total_all}"
    )
    return {
        'statements_created': statements_created,
        'total_commission': total_all,
        'workers_processed': workers_processed,
    }


def _notify_worker_statement(worker: User, stmt: MonthlyCommissionStatement):
    """Gửi in-app notification + push notification cho Worker."""
    # In-app Notification
    Notification.objects.create(
        recipient=worker,
        title=f"Bảng kê hoa hồng tháng {stmt.month.strftime('%m/%Y')}",
        message=(
            f"Tổng tiền mặt bạn nhận: {stmt.total_gross} VNĐ.\n"
            f"Hoa hồng 20% cần nộp: {stmt.total_commission} VNĐ.\n"
            f"Vui lòng quét mã QR để thanh toán cho Admin trong vòng 7 ngày."
        ),
    )

    # Expo push notification
    from core.views import send_expo_push_notification
    if worker.expo_push_token:
        send_expo_push_notification(
            token=worker.expo_push_token,
            title=f"Hoa hồng tháng {stmt.month.strftime('%m/%Y')}",
            body=f"Bạn cần nộp {stmt.total_commission} VNĐ hoa hồng. Quét QR trong app để thanh toán.",
            data={
                'type': 'commission_statement',
                'statement_id': stmt.id,
                'amount': str(stmt.total_commission),
                'vietqr_url': stmt.vietqr_url or '',
            },
        )


# ───────────────────────────────────────────────────────────────────
# ADMIN DUYỆT ĐÃ NHẬN TIỀN HOA HỒNG
# ───────────────────────────────────────────────────────────────────
@transaction.atomic
def mark_statement_paid(statement: MonthlyCommissionStatement, admin_note: str = '') -> dict:
    """Admin xác nhận đã nhận tiền hoa hồng → set paid cho statement & tất cả debts."""
    if statement.status == MonthlyCommissionStatement.STATUS_PAID:
        return {'already_paid': True}

    statement.status = MonthlyCommissionStatement.STATUS_PAID
    statement.paid_at = timezone.now()
    if admin_note:
        statement.admin_note = admin_note
    statement.save(update_fields=['status', 'paid_at', 'admin_note', 'updated_at'])

    CommissionDebt.objects.filter(statement=statement).update(
        status=CommissionDebt.STATUS_PAID,
        paid_at=timezone.now(),
    )

    logger.info(
        f"[Commission] STATEMENT PAID — Statement#{statement.id} | "
        f"Worker={statement.worker.username} | Amount={statement.total_commission}"
    )

    # Gửi notification cho worker
    Notification.objects.create(
        recipient=statement.worker,
        title="Đã xác nhận thanh toán hoa hồng",
        message=f"Admin đã xác nhận nhận đủ {statement.total_commission} VNĐ hoa hồng tháng {statement.month.strftime('%m/%Y')}. Cảm ơn bạn!",
    )
    from core.views import send_expo_push_notification
    if statement.worker.expo_push_token:
        send_expo_push_notification(
            token=statement.worker.expo_push_token,
            title="Hoa hồng đã được xác nhận",
            body=f"Cảm ơn bạn đã thanh toán {statement.total_commission} VNĐ hoa hồng tháng {statement.month.strftime('%m/%Y')}.",
            data={'type': 'commission_paid', 'statement_id': statement.id},
        )
    return {'paid': True}


# ───────────────────────────────────────────────────────────────────
# ĐÁNH DẤU QUÁ HẠN (>7 ngày sau khi gửi QR mà chưa paid)
# ───────────────────────────────────────────────────────────────────
def mark_overdue_statements() -> int:
    """Chạy hằng ngày để đánh dấu statement quá hạn (>7 ngày sau sent_at)."""
    threshold = timezone.now() - timedelta(days=7)
    qs = MonthlyCommissionStatement.objects.filter(
        status=MonthlyCommissionStatement.STATUS_SENT,
        sent_at__lt=threshold,
    )
    count = qs.count()
    qs.update(status=MonthlyCommissionStatement.STATUS_OVERDUE)
    if count:
        logger.info(f"[Commission] OVERDUE — {count} statements marked")
    return count
