"""
matching/services/credits_service.py — Ví credit ảo phụ huynh (Step 7.3, LOCKED #1).

Đền bù = credit ảo KHÔNG tiền thật, không rút được, dùng trừ phí dịch vụ.
Idempotent: 1 booking chỉ đền 1 lần (partial unique constraint).
"""

import logging

from decimal import Decimal, ROUND_DOWN
from django.db import transaction

from ..models import Booking, CancelPolicy, CreditBalance, CreditTransaction

logger = logging.getLogger('educarelink.matching.credits')


def get_or_create_balance(parent):
    balance, _ = CreditBalance.objects.get_or_create(parent=parent)
    return balance


def compute_compensation(booking, policy):
    """Đền bù theo Step 7.2: pct × giá trị đơn còn lại, làm tròn XUỐNG 1.000đ,
    áp sàn min_compensation_vnd (T5 = 50.000)."""
    value = booking.total_value_vnd or 0
    amount = int(Decimal(value) * Decimal(policy.compensation_pct) / Decimal(100))
    # Làm tròn xuống 1.000
    amount = int((Decimal(amount) / Decimal(1000)).quantize(Decimal('1'), rounding=ROUND_DOWN) * 1000)
    if policy.min_compensation_vnd and amount < policy.min_compensation_vnd and policy.compensation_pct > 0:
        amount = policy.min_compensation_vnd
    return amount


@transaction.atomic
def issue_compensation(booking, amount_vnd, note=''):
    """Phát hành credit cho parent — idempotent per booking (platform_credit).

    Trả về (transaction, created_bool). Gọi 2 lần → False lần 2, không cộng dồn.
    """
    existing = CreditTransaction.objects.filter(
        booking=booking, kind=CreditTransaction.KIND_CHOICES[0][0]).first()
    if existing:
        logger.info('[Credit] Idempotent skip: booking %s đã được đền', booking.pk)
        return existing, False

    with transaction.atomic():
        balance = get_or_create_balance(booking.parent)
        # select_for_update chống race cộng dồn
        balance = CreditBalance.objects.select_for_update().get(pk=balance.pk)
        txn = CreditTransaction.objects.create(
            booking=booking, parent=booking.parent,
            amount_vnd=amount_vnd, kind='platform_credit', status='issued',
            note=note)
        balance.credit_vnd = balance.credit_vnd + amount_vnd
        balance.save(update_fields=['credit_vnd', 'updated_at'])
        logger.info('[Credit] Đền %dđ cho %s (booking %s)',
                    amount_vnd, booking.parent, booking.pk)
    return txn, True


def wallet_summary(parent):
    """Số dư + lịch sử cho API GET /api/matching/credits/balance/."""
    balance = get_or_create_balance(parent)
    history = CreditTransaction.objects.filter(parent=parent)[:50]
    return balance, history
