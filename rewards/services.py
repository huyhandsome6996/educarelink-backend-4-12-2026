"""B2 — Business logic tích điểm / đổi voucher.

Công thức: points = floor(task.price / 5000)
Bonus: +5 điểm khi review 5 sao.
Hạng dựa trên lifetime (tổng điểm đã cộng, không trừ khi đổi voucher).
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Q
from django.db.utils import IntegrityError

from .models import PointTransaction, Voucher, VoucherRedemption

logger = logging.getLogger('educarelink.rewards')

# --- Hằng số theo đặc tả B2 ---
POINTS_PER_PRICE_UNIT = 5000  # floor(price / 5000)
REVIEW_BONUS_POINTS = 5

TIER_THRESHOLDS = [
    # (min_lifetime, code, label)
    (3000, 'platinum', 'Bạch Kim'),
    (1500, 'gold', 'Vàng'),
    (500, 'silver', 'Bạc'),
    (0, 'bronze', 'Đồng'),
]

TIER_NEXT = {
    'bronze': (500, 'Bạc'),
    'silver': (1500, 'Vàng'),
    'gold': (3000, 'Bạch Kim'),
    'platinum': (None, None),
}


def calculate_task_points(price) -> int:
    """points = floor(task.price / 5000)."""
    try:
        p = int(Decimal(str(price)))
    except Exception:
        p = 0
    if p <= 0:
        return 0
    return p // POINTS_PER_PRICE_UNIT


def get_balance(user) -> int:
    """Điểm khả dụng = tổng mọi PointTransaction của user."""
    total = (
        PointTransaction.objects.filter(user=user)
        .aggregate(s=Sum('points'))['s']
    )
    return int(total or 0)


def get_lifetime_points(user) -> int:
    """Tổng điểm đã tích lũy (chỉ các giao dịch cộng điểm).

    Không bị giảm khi đổi voucher — dùng tính hạng.
    """
    total = (
        PointTransaction.objects.filter(user=user, points__gt=0)
        .aggregate(s=Sum('points'))['s']
    )
    return int(total or 0)


def get_tier(user) -> dict:
    """Trả về thông tin hạng phụ huynh theo lifetime points."""
    lifetime = get_lifetime_points(user)
    code, label = 'bronze', 'Đồng'
    for min_pts, t_code, t_label in TIER_THRESHOLDS:
        if lifetime >= min_pts:
            code, label = t_code, t_label
            break

    next_threshold, next_label = TIER_NEXT.get(code, (None, None))
    points_to_next = None
    if next_threshold is not None:
        points_to_next = max(0, next_threshold - lifetime)

    return {
        'code': code,
        'label': label,
        'lifetime_points': lifetime,
        'next_tier_label': next_label,
        'next_tier_threshold': next_threshold,
        'points_to_next': points_to_next,
    }


@transaction.atomic
def award_points_for_task(task) -> PointTransaction | None:
    """Cộng điểm khi Task.status == 'completed'. Idempotent.

    Returns PointTransaction nếu vừa tạo, None nếu đã có / không đủ điều kiện.
    """
    if task is None or task.status != 'completed':
        return None

    parent = getattr(task, 'parent', None)
    if parent is None:
        return None
    if getattr(parent, 'role', None) and parent.role != 'parent':
        # Vẫn cho phép nếu role không set đúng — ưu tiên parent FK
        pass

    points = calculate_task_points(task.price)
    if points <= 0:
        logger.info(
            '[rewards] Task#%s price=%s → 0 điểm, bỏ qua',
            task.pk, task.price,
        )
        return None

    # Đã cộng rồi?
    if PointTransaction.objects.filter(
        task=task,
        reason=PointTransaction.REASON_TASK_COMPLETED,
    ).exists():
        return None

    try:
        with transaction.atomic():
            tx = PointTransaction.objects.create(
                user=parent,
                task=task,
                points=points,
                reason=PointTransaction.REASON_TASK_COMPLETED,
                note=f'Hoàn thành: {task.title[:80]}',
            )
    except IntegrityError:
        # Race: unique constraint bắt trùng
        logger.info('[rewards] Task#%s đã cộng điểm (race)', task.pk)
        return None

    logger.info(
        '[rewards] +%s điểm cho parent#%s (Task#%s)',
        points, parent.pk, task.pk,
    )
    return tx


@transaction.atomic
def award_review_bonus(review) -> PointTransaction | None:
    """+5 điểm khi phụ huynh đánh giá CarePartner 5 sao. Idempotent."""
    if review is None:
        return None
    if int(getattr(review, 'rating', 0) or 0) != 5:
        return None

    reviewer = getattr(review, 'reviewer', None)
    if reviewer is None:
        return None

    if PointTransaction.objects.filter(
        review=review,
        reason=PointTransaction.REASON_REVIEW_BONUS,
    ).exists():
        return None

    try:
        with transaction.atomic():
            tx = PointTransaction.objects.create(
                user=reviewer,
                task=getattr(review, 'task', None),
                review=review,
                points=REVIEW_BONUS_POINTS,
                reason=PointTransaction.REASON_REVIEW_BONUS,
                note='Bonus đánh giá 5 sao',
            )
    except IntegrityError:
        logger.info('[rewards] Review#%s đã nhận bonus (race)', review.pk)
        return None

    logger.info(
        '[rewards] +%s điểm bonus 5★ cho user#%s (Review#%s)',
        REVIEW_BONUS_POINTS, reviewer.pk, review.pk,
    )
    return tx


class InsufficientPointsError(Exception):
    def __init__(self, balance, required):
        self.balance = balance
        self.required = required
        super().__init__(
            f'Không đủ điểm. Hiện có {balance}, cần {required}.'
        )


class VoucherNotAvailableError(Exception):
    pass


@transaction.atomic
def redeem_voucher(user, voucher: Voucher) -> VoucherRedemption:
    """Đổi voucher: khóa user row → kiểm tra điểm → trừ → sinh mã.

    Dùng select_for_update để chống race 2 request cùng lúc.
    """
    if not voucher.is_active or voucher.is_expired:
        raise VoucherNotAvailableError('Voucher không còn khả dụng.')

    # Lock các giao dịch của user (proxy lock) bằng cách aggregate
    # sau select_for_update trên PointTransaction rows — hoặc lock User.
    from core.models import User
    locked_user = User.objects.select_for_update().get(pk=user.pk)

    balance = get_balance(locked_user)
    required = int(voucher.points_required)
    if balance < required:
        raise InsufficientPointsError(balance, required)

    # Sinh mã unique (retry nếu trùng hiếm)
    code = None
    for _ in range(8):
        candidate = VoucherRedemption.generate_code()
        if not VoucherRedemption.objects.filter(code=candidate).exists():
            code = candidate
            break
    if not code:
        raise RuntimeError('Không thể sinh mã voucher. Thử lại.')

    redemption = VoucherRedemption.objects.create(
        user=locked_user,
        voucher=voucher,
        code=code,
        status=VoucherRedemption.STATUS_ACTIVE,
        points_spent=required,
    )

    PointTransaction.objects.create(
        user=locked_user,
        points=-required,
        reason=PointTransaction.REASON_VOUCHER_REDEEM,
        voucher_redemption=redemption,
        note=f'Đổi voucher: {voucher.title[:80]}',
    )

    logger.info(
        '[rewards] user#%s đổi voucher#%s code=%s (-%s điểm)',
        locked_user.pk, voucher.pk, code, required,
    )
    return redemption


def list_active_vouchers():
    """Voucher đang active và chưa hết hạn template."""
    from django.utils import timezone
    today = timezone.localdate()
    return (
        Voucher.objects.filter(is_active=True)
        .filter(Q(expiry_date__isnull=True) | Q(expiry_date__gte=today))
        .order_by('points_required', 'id')
    )


def get_transaction_history(user, limit=50):
    return list(
        PointTransaction.objects.filter(user=user)
        .select_related('task', 'voucher_redemption')
        .order_by('-created_at')[:limit]
    )
