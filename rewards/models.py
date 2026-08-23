"""B2 — Tích điểm đổi quà cho phụ huynh.

Ledger-based: không lưu balance trên User.
Điểm lifetime (tích lũy) dùng tính hạng; balance = sum(points) khả dụng.
"""

import secrets
import string

from django.conf import settings
from django.db import models
from django.utils import timezone


class PointTransaction(models.Model):
    """Sổ cái điểm — mỗi lần cộng/trừ là 1 dòng."""

    REASON_TASK_COMPLETED = 'task_completed'
    REASON_REVIEW_BONUS = 'review_bonus_5star'
    REASON_VOUCHER_REDEEM = 'voucher_redeem'
    REASON_ADJUSTMENT = 'adjustment'

    REASON_CHOICES = [
        (REASON_TASK_COMPLETED, 'Hoàn thành công việc'),
        (REASON_REVIEW_BONUS, 'Bonus đánh giá 5 sao'),
        (REASON_VOUCHER_REDEEM, 'Đổi voucher'),
        (REASON_ADJUSTMENT, 'Điều chỉnh thủ công'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='point_transactions',
        help_text='Phụ huynh nhận/trừ điểm',
    )
    task = models.ForeignKey(
        'core.Task',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='point_transactions',
    )
    review = models.ForeignKey(
        'core.Review',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='point_transactions',
    )
    voucher_redemption = models.ForeignKey(
        'rewards.VoucherRedemption',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='point_transactions',
    )
    points = models.IntegerField(help_text='Số điểm (+ cộng / - trừ)')
    reason = models.CharField(max_length=32, choices=REASON_CHOICES)
    note = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Giao dịch điểm'
        verbose_name_plural = 'Giao dịch điểm'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='idx_pt_user_created'),
            models.Index(fields=['user', 'reason'], name='idx_pt_user_reason'),
        ]
        constraints = [
            # Chống cộng trùng khi task completed save nhiều lần
            models.UniqueConstraint(
                fields=['task', 'reason'],
                condition=models.Q(
                    reason='task_completed',
                    task__isnull=False,
                ),
                name='uniq_points_task_completed',
            ),
            # Chống cộng trùng bonus review 5 sao
            models.UniqueConstraint(
                fields=['review', 'reason'],
                condition=models.Q(
                    reason='review_bonus_5star',
                    review__isnull=False,
                ),
                name='uniq_points_review_bonus',
            ),
        ]

    def __str__(self):
        sign = '+' if self.points >= 0 else ''
        return f'{self.user_id}: {sign}{self.points} ({self.reason})'


class Voucher(models.Model):
    """Quà đổi điểm — Admin tạo/sửa/tắt qua Django admin."""

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    points_required = models.PositiveIntegerField(help_text='Số điểm cần để đổi')
    discount_value = models.PositiveIntegerField(
        help_text='Giá trị voucher (VNĐ), VD: 30000',
    )
    expiry_date = models.DateField(
        null=True,
        blank=True,
        help_text='Hạn dùng của voucher template (null = không hết hạn)',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Voucher'
        verbose_name_plural = 'Voucher'
        ordering = ['points_required', 'id']

    def __str__(self):
        return f'{self.title} ({self.points_required} điểm)'

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.localdate()


class VoucherRedemption(models.Model):
    """Lần đổi voucher của phụ huynh."""

    STATUS_ACTIVE = 'active'
    STATUS_USED = 'used'
    STATUS_EXPIRED = 'expired'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Còn hiệu lực'),
        (STATUS_USED, 'Đã dùng'),
        (STATUS_EXPIRED, 'Hết hạn'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='voucher_redemptions',
    )
    voucher = models.ForeignKey(
        Voucher,
        on_delete=models.PROTECT,
        related_name='redemptions',
    )
    code = models.CharField(max_length=16, unique=True, db_index=True)
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    points_spent = models.PositiveIntegerField()
    redeemed_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Lượt đổi voucher'
        verbose_name_plural = 'Lượt đổi voucher'
        ordering = ['-redeemed_at']

    def __str__(self):
        return f'{self.code} — {self.user_id} — {self.voucher.title}'

    @staticmethod
    def generate_code(length=10):
        alphabet = string.ascii_uppercase + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))
