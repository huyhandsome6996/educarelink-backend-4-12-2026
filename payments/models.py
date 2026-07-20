"""
╔══════════════════════════════════════════════════════════════════╗
║   EduCareLink — Payment Module (MoMo Escrow + Cash Settlement)    ║
║                                                                   ║
║   3 dòng chảy thanh toán:                                         ║
║     1. ESCROW (MoMo giữ tiền):                                    ║
║        Phụ huynh trả qua MoMo → tiền nằm trong tài khoản MoMo     ║
║        đối tác → khi Task hoàn thành → tự động giải ngân 80% cho  ║
║        Carepartner, 20% giữ lại làm hoa hồng nền tảng.            ║
║                                                                   ║
║     2. CASH (Phụ huynh trả tiền mặt cho Carepartner):             ║
║        Khi Task hoàn thành → ghi nhận công nợ hoa hồng 20% của    ║
║        Carepartner → cuối tháng tổng hợp → sinh mã QR MoMo để     ║
║        Carepartner quét thanh toán cho nền tảng.                  ║
║                                                                   ║
║     3. REFUND (Hoàn tiền):                                        ║
║        Nếu Task bị huỷ khi đang ở trạng thái escrow → hoàn lại    ║
║        100% cho phụ huynh qua MoMo Refund API.                    ║
║                                                                   ║
║   Mọi thao tác đều được ghi vào PaymentLog để audit trail.        ║
╚══════════════════════════════════════════════════════════════════╝
"""

from django.db import models
from django.conf import settings


class Payment(models.Model):
    """
    Bản ghi thanh toán cho 1 Task.
    Mỗi Task chỉ có 1 Payment (OneToOne).
    """

    METHOD_CHOICES = (
        ('momo_escrow', 'MoMo Escrow — Phụ huynh trả qua MoMo, tiền được giữ'),
        ('payos', 'PayOS — Phụ huynh quét QR VietQR qua app ngân hàng, tiền được giữ'),
        ('cash', 'Tiền mặt — Phụ huynh trả trực tiếp cho Carepartner'),
    )

    STATUS_CHOICES = (
        # Trạng thái chung
        ('pending', 'Chờ thanh toán — Phụ huynh chưa hoàn tất bước pay (momo/payos) hoặc chưa chốt phương thức (cash)'),
        ('held', 'Đang giữ tiền — MoMo/PayOS đã nhận tiền, chờ Task hoàn thành để giải ngân'),
        ('completed', 'Đã hoàn tất — Đã giải ngân cho Carepartner và giữ hoa hồng'),
        ('cancelled', 'Đã huỷ — Task bị huỷ trước khi thanh toán'),
        ('refunded', 'Đã hoàn tiền — Hoàn 100% cho phụ huynh do Task bị huỷ'),
        ('payout_failed', 'Giải ngân thất bại — Tiền vẫn nằm trong MoMo/PayOS, cần Admin xử lý'),
    )

    # ── Liên kết ────────────────────────────────────────────────
    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='payment'
    )
    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payments_as_parent'
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='payments_as_worker',
        help_text="Carepartner được chọn — có thể null nếu Task chưa chốt người làm"
    )

    # ── Số tiền & hoa hồng ──────────────────────────────────────
    amount = models.DecimalField(
        max_digits=12, decimal_places=0,
        help_text="Tổng số tiền phụ huynh trả (VNĐ)"
    )
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=4, default=0.2000,
        help_text="Tỷ lệ hoa hồng — mặc định 20%"
    )
    commission_amount = models.DecimalField(
        max_digits=12, decimal_places=0, default=0,
        help_text="Tiền hoa hồng nền tảng = amount * commission_rate"
    )
    worker_payout_amount = models.DecimalField(
        max_digits=12, decimal_places=0, default=0,
        help_text="Tiền Carepartner nhận được = amount - commission_amount"
    )

    # ── Phương thức & trạng thái ────────────────────────────────
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # ── MoMo Escrow fields ──────────────────────────────────────
    momo_order_id = models.CharField(
        max_length=100, blank=True, null=True, unique=False,
        help_text="orderId MoMo — EduCareLink_<task_id>_<timestamp>"
    )
    momo_request_id = models.CharField(max_length=100, blank=True, null=True)
    momo_trans_id = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="transId MoMo trả về sau khi phụ huynh pay thành công"
    )
    momo_pay_url = models.URLField(max_length=2000, blank=True, null=True,
                                   help_text="payUrl sâu tới app/web MoMo để phụ huynh thanh toán")
    momo_qr_code_url = models.URLField(max_length=2000, blank=True, null=True,
                                        help_text="qrCodeUrl từ MoMo — phụ huynh có thể quét")
    momo_result_code = models.IntegerField(blank=True, null=True)
    momo_message = models.CharField(max_length=255, blank=True, null=True)

    # ── PayOS fields (VietQR bank transfer) ─────────────────────
    payos_order_code = models.BigIntegerField(
        blank=True, null=True,
        help_text="orderCode PayOS — thường là task.id hoặc timestamp"
    )
    payos_checkout_url = models.URLField(
        max_length=2000, blank=True, null=True,
        help_text="checkoutUrl PayOS — phụ huynh mở link này để quét QR"
    )
    payos_payment_link_id = models.CharField(
        max_length=255, blank=True, null=True,
        help_text="ID của payment link PayOS"
    )
    payos_status = models.CharField(
        max_length=50, blank=True, null=True,
        help_text="Trạng thái từ PayOS: PENDING, PAID, CANCELLED, EXPIRED"
    )
    payos_account_reference = models.CharField(
        max_length=255, blank=True, null=True,
        help_text="Mã tham chiếu tài khoản — thường là STK phụ huynh dùng để chuyển"
    )

    # ── Giải ngân (chỉ dùng cho momo_escrow) ───────────────────
    payout_request_id = models.CharField(max_length=100, blank=True, null=True)
    payout_trans_id = models.CharField(max_length=100, blank=True, null=True)
    payout_response = models.JSONField(default=dict, blank=True)

    # ── Thời điểm ───────────────────────────────────────────────
    initiated_at = models.DateTimeField(auto_now_add=True)
    held_at = models.DateTimeField(blank=True, null=True, help_text="Khi MoMo xác nhận đã giữ tiền")
    completed_at = models.DateTimeField(blank=True, null=True, help_text="Khi đã giải ngân cho worker")
    refunded_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-initiated_at']
        indexes = [
            models.Index(fields=['parent', 'status']),
            models.Index(fields=['worker', 'status']),
            models.Index(fields=['method', 'status']),
            models.Index(fields=['momo_order_id']),
        ]

    def __str__(self):
        return f"#{self.id} | Task#{self.task_id} | {self.get_method_display()} | {self.get_status_display()} | {self.amount:,.0f}đ"

    def save(self, *args, **kwargs):
        """Tự động tính commission_amount & worker_payout_amount khi save."""
        if self.amount and not self.commission_amount:
            from decimal import ROUND_HALF_UP, Decimal
            self.commission_amount = (Decimal(self.amount) * Decimal(self.commission_rate)).quantize(
                Decimal('1'), rounding=ROUND_HALF_UP
            )
            self.worker_payout_amount = Decimal(self.amount) - self.commission_amount
        super().save(*args, **kwargs)


class CommissionSettlement(models.Model):
    """
    Bảng tổng hợp hoa hồng Carepartner nợ nền tảng —
    sinh hàng tháng cho các Task thanh toán tiền mặt.

    Quy trình:
      - Cron job chạy ngày 1 hàng tháng → gom tất cả Payment có method='cash'
        và status='completed' trong tháng trước → tạo 1 CommissionSettlement
        cho mỗi worker.
      - Gọi MoMo Pay App API để sinh payUrl + qrCodeUrl.
      - Gửi push notification + in-app notification cho worker kèm link QR.
      - Worker quét QR → chuyển khoản cho nền tảng.
      - IPN callback từ MoMo → cập nhật status='paid'.
    """

    STATUS_CHOICES = (
        ('pending', 'Chờ sinh QR'),
        ('qr_generated', 'Đã sinh QR — chờ Carepartner thanh toán'),
        ('paid', 'Carepartner đã thanh toán hoa hồng'),
        ('overdue', 'Quá hạn — chưa thanh toán sau N ngày'),
        ('cancelled', 'Đã huỷ — không thu tiếp'),
    )

    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='commission_settlements'
    )

    period_year = models.IntegerField(help_text="Năm của kỳ thanh toán")
    period_month = models.IntegerField(help_text="Tháng của kỳ thanh toán (1-12)")

    # ── Số liệu tổng hợp ────────────────────────────────────────
    total_tasks = models.IntegerField(default=0, help_text="Số Task hoàn thành trong kỳ")
    total_amount = models.DecimalField(
        max_digits=14, decimal_places=0, default=0,
        help_text="Tổng hoa hồng Carepartner nợ nền tảng (VNĐ)"
    )
    task_ids = models.JSONField(
        default=list, blank=True,
        help_text="Danh sách Payment.id được tính trong kỳ này"
    )

    # ── Trạng thái ──────────────────────────────────────────────
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # ── MoMo Pay App fields (sinh QR cho worker quét) ──────────
    momo_order_id = models.CharField(max_length=100, blank=True, null=True)
    momo_request_id = models.CharField(max_length=100, blank=True, null=True)
    momo_pay_url = models.URLField(max_length=2000, blank=True, null=True)
    momo_qr_code_url = models.URLField(max_length=2000, blank=True, null=True)
    momo_trans_id = models.CharField(max_length=100, blank=True, null=True)
    momo_result_code = models.IntegerField(blank=True, null=True)
    momo_message = models.CharField(max_length=255, blank=True, null=True)

    # ── Thời điểm ───────────────────────────────────────────────
    due_at = models.DateTimeField(blank=True, null=True, help_text="Hạn thanh toán (mặc định +7 ngày sau khi sinh QR)")
    generated_at = models.DateTimeField(blank=True, null=True, help_text="Khi QR được sinh")
    paid_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-period_year', '-period_month']
        unique_together = ('worker', 'period_year', 'period_month')
        indexes = [
            models.Index(fields=['worker', 'status']),
            models.Index(fields=['period_year', 'period_month']),
            models.Index(fields=['status', 'due_at']),
        ]

    def __str__(self):
        return f"#{self.id} | Worker#{self.worker_id} | {self.period_month:02d}/{self.period_year} | {self.total_amount:,.0f}đ | {self.get_status_display()}"


class PaymentLog(models.Model):
    """Audit trail — mọi sự kiện liên quan đến Payment / Settlement."""

    EVENT_CHOICES = (
        ('payment_created',           'Tạo bản ghi thanh toán'),
        ('momo_pay_url_generated',    'Sinh payUrl MoMo thành công'),
        ('momo_pay_url_failed',       'Sinh payUrl MoMo thất bại'),
        ('momo_ipn_held',             'MoMo IPN: tiền đã được giữ'),
        ('momo_ipn_failed',           'MoMo IPN: phụ huynh thanh toán thất bại'),
        ('escrow_released',           'Giải ngân escrow cho Carepartner thành công'),
        ('escrow_release_failed',     'Giải ngân escrow thất bại'),
        ('refund_initiated',          'Bắt đầu hoàn tiền'),
        ('refund_completed',          'Hoàn tiền thành công'),
        ('refund_failed',             'Hoàn tiền thất bại'),
        ('cash_recorded',             'Ghi nhận hoa hồng tiền mặt'),
        ('settlement_created',        'Tạo kỳ thanh toán tháng'),
        ('settlement_qr_generated',   'Sinh QR cho kỳ thanh toán'),
        ('settlement_qr_failed',      'Sinh QR thất bại'),
        ('settlement_paid',           'Carepartner đã thanh toán kỳ hoa hồng'),
        ('settlement_overdue',        'Kỳ thanh toán quá hạn'),
        ('settlement_reminder_sent',  'Gửi nhắc nhở kỳ thanh toán'),
        ('manual_override',           'Admin chỉnh sửa thủ công'),
    )

    payment = models.ForeignKey(
        Payment, on_delete=models.CASCADE, null=True, blank=True,
        related_name='logs'
    )
    settlement = models.ForeignKey(
        CommissionSettlement, on_delete=models.CASCADE, null=True, blank=True,
        related_name='logs'
    )
    event_type = models.CharField(max_length=40, choices=EVENT_CHOICES)
    message = models.TextField(blank=True, default='')
    payload = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='payment_logs',
        help_text="User thực hiện action — null nếu là hệ thống (cron, IPN)"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['payment', 'event_type']),
            models.Index(fields=['settlement', 'event_type']),
            models.Index(fields=['event_type', '-created_at']),
        ]

    def __str__(self):
        target = self.payment or self.settlement
        return f"[{self.get_event_type_display()}] {target} — {self.created_at:%Y-%m-%d %H:%M}"
