"""
Models cho module Payments (MoMo + Escrow + Commission 20%).

5 model:
  1. Wallet                     — Ví nội bộ của mọi user (Parent/Worker/Admin)
  2. PaymentOrder               — Đơn thanh toán MoMo cho 1 Task (1-1 với Task)
  3. EscrowTransaction          — Sổ cái ghi chép mọi luồng tiền (hold/release/commission/disburse)
  4. CommissionDebt             — Khoản nợ hoa hồng 20% của Carepartner (khi nhận tiền mặt)
  5. MonthlyCommissionStatement — Bảng kê hoa hồng theo tháng + QR VietQR để Carepartner thanh toán

LUỒNG 1 — THANH TOÁN QUA MOMO (escrow):
  Parent tạo Task → PaymentOrder(method=momo, pending)
  Parent thanh toán MoMo → IPN → Wallet.held_balance += amount, PaymentOrder(paid)
  Parent approve candidate → Task(in_progress)
  Parent đánh dấu Task(completed) → signal post_save Task
      → EscrowService.handle_momo_completed(task)
      → Worker.Wallet.balance += price*0.8
      → Admin.Wallet.balance += price*0.2
      → Parent.Wallet.held_balance -= price
      → Tạo 3 EscrowTransaction: release_to_worker, commission_to_admin, refund_held

LUỒNG 2 — THANH TOÁN TIỀN MẶT:
  Parent tạo Task → PaymentOrder(method=cash, pending)
  Parent approve candidate → Task(in_progress)
  Parent đánh dấu Task(completed) → signal post_save Task
      → CommissionService.record_cash_completion(task)
      → Tạo CommissionDebt(worker, task, gross=price, commission=price*0.2, pending)
  Cron ngày 1 hàng tháng:
      → Aggregate CommissionDebt pending của worker tháng trước
      → Tạo MonthlyCommissionStatement(total_commission, vietqr_url)
      → Gửi Notification + Expo Push cho worker kèm QR
  Worker quét QR chuyển khoản → Admin xác nhận → Statement(paid), CommissionDebt(paid)
"""
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils import timezone


class Wallet(models.Model):
    """
    Ví nội bộ của user — được dùng làm sổ cái cho dòng tiền MoMo escrow.

    `balance`        : Số dư khả dụng (Worker có thể rút)
    `held_balance`   : Tiền đang bị phong tỏa (Parent đã thanh toán MoMo nhưng task chưa hoàn thành)
    `total_balance`  = balance + held_balance (property)
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wallet',
    )
    balance = models.DecimalField(
        max_digits=14, decimal_places=0, default=Decimal('0'),
        help_text="Số dư khả dụng (VNĐ) — Worker có thể rút về MoMo"
    )
    held_balance = models.DecimalField(
        max_digits=14, decimal_places=0, default=Decimal('0'),
        help_text="Tiền đang phong tỏa (VNĐ) — Parent đã trả MoMo, chờ task hoàn thành"
    )
    # Thông tin nhận tiền khi rút
    momo_phone = models.CharField(
        max_length=15, blank=True, null=True,
        help_text="SĐT MoMo liên kết để nhận tiền giải ngân"
    )
    bank_account_number = models.CharField(
        max_length=30, blank=True, null=True,
        help_text="Số tài khoản ngân hàng (dự phòng, dùng cho VietQR nhận hoa hồng từ hệ thống)"
    )
    bank_code = models.CharField(
        max_length=20, blank=True, null=True,
        help_text="Mã ngân hàng (BIN), VD: 970436 = Vietcombank, 970418 = BIDV"
    )
    bank_account_name = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="Tên chủ tài khoản ngân hàng (VIETQR yêu cầu IN HOA KHÔNG DẤU)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Ví"
        verbose_name_plural = "Ví"

    @property
    def total_balance(self):
        return self.balance + self.held_balance

    def __str__(self):
        return f"Ví {self.user.username} — khả dụng: {self.balance} | phong tỏa: {self.held_balance}"


class PaymentOrder(models.Model):
    """
    Đơn thanh toán cho 1 Task — 1-1 với Task.
    Mỗi Task tự động có 1 PaymentOrder khi được tạo (signal post_save Task, created=True).

    method=momo : Parent phải thanh toán qua MoMo trước khi task bắt đầu
    method=cash : Parent trả tiền mặt trực tiếp cho Carepartner
    """

    METHOD_MOMO = 'momo'
    METHOD_CASH = 'cash'
    PAYMENT_METHOD_CHOICES = (
        (METHOD_MOMO, 'MoMo (giữ tiền giùm)'),
        (METHOD_CASH, 'Tiền mặt'),
    )

    STATUS_PENDING = 'pending'      # Chờ parent thanh toán MoMo / hoặc mặc định cho cash
    STATUS_PAID = 'paid'            # Đã thanh toán MoMo (cho method=momo)
    STATUS_FAILED = 'failed'        # Thanh toán MoMo thất bại
    STATUS_EXPIRED = 'expired'      # Hết hạn không thanh toán
    STATUS_NOT_REQUIRED = 'not_required'  # Cash: không cần thanh toán trước
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Chờ thanh toán'),
        (STATUS_PAID, 'Đã thanh toán'),
        (STATUS_FAILED, 'Thất bại'),
        (STATUS_EXPIRED, 'Hết hạn'),
        (STATUS_NOT_REQUIRED, 'Không yêu cầu (cash)'),
    )

    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='payment_order',
    )
    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payment_orders',
    )
    amount = models.DecimalField(
        max_digits=14, decimal_places=0,
        help_text="Số tiền (VNĐ) — bằng đúng Task.price lúc tạo"
    )
    payment_method = models.CharField(
        max_length=10, choices=PAYMENT_METHOD_CHOICES, default=METHOD_CASH,
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING,
    )

    # MoMo metadata
    momo_order_id = models.CharField(
        max_length=100, blank=True, null=True, unique=True,
        help_text="orderId gửi lên MoMo (unique per request)"
    )
    momo_request_id = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="requestId nội bộ khi gọi MoMo API"
    )
    momo_pay_url = models.URLField(max_length=2000, blank=True, null=True)
    momo_trans_id = models.CharField(
        max_length=100, blank=True, null=True,
        help_text="transId MoMo trả về sau khi thanh toán thành công"
    )
    momo_response = models.JSONField(
        default=dict, blank=True,
        help_text="Toàn bộ response từ MoMo (cho debug)"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    expired_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        verbose_name = "Đơn thanh toán"
        verbose_name_plural = "Đơn thanh toán"
        ordering = ['-created_at']

    def __str__(self):
        return f"#{self.id} {self.get_payment_method_display()} — Task#{self.task_id} — {self.amount} VNĐ — {self.get_status_display()}"

    def mark_paid(self, momo_trans_id=None, momo_response=None):
        """Đánh dấu đơn đã thanh toán (gọi từ IPN handler)."""
        self.status = self.STATUS_PAID
        self.momo_trans_id = momo_trans_id or self.momo_trans_id
        if momo_response:
            self.momo_response = momo_response
        self.paid_at = timezone.now()
        self.save(update_fields=['status', 'momo_trans_id', 'momo_response', 'paid_at'])


class EscrowTransaction(models.Model):
    """
    Sổ cái ghi chép MỌI luồng tiền trong hệ thống — dùng cho audit & tra cứu.
    Mỗi lần Wallet thay đổi balance/held_balance, phải tạo 1 EscrowTransaction đi kèm.
    """

    TYPE_HOLD = 'hold'                  # Phong tỏa tiền Parent đã trả MoMo
    TYPE_RELEASE_TO_WORKER = 'release_to_worker'    # Giải ngân 80% cho Worker khi task completed
    TYPE_COMMISSION_TO_ADMIN = 'commission_to_admin'  # Chuyển 20% cho Admin khi task completed
    TYPE_REFUND_HELD = 'refund_held'    # Trừ tiền đã phong tỏa khỏi ví Parent (đối ứng vs HOLD)
    TYPE_REFUND_TO_PARENT = 'refund_to_parent'  # Hoàn tiền cho Parent khi task bị cancel
    TYPE_DISBURSE = 'disburse'          # Worker rút tiền về MoMo
    TYPE_CHOICES = (
        (TYPE_HOLD, 'Phong tỏa (Parent trả MoMo)'),
        (TYPE_RELEASE_TO_WORKER, 'Giải ngân cho Carepartner'),
        (TYPE_COMMISSION_TO_ADMIN, 'Hoa hồng chuyển cho Admin'),
        (TYPE_REFUND_HELD, 'Trừ tiền phong tỏa'),
        (TYPE_REFUND_TO_PARENT, 'Hoàn tiền cho Phụ huynh'),
        (TYPE_DISBURSE, 'Rút tiền về MoMo'),
    )

    task = models.ForeignKey(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='escrow_transactions',
        null=True, blank=True,
    )
    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    amount = models.DecimalField(max_digits=14, decimal_places=0)
    txn_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    description = models.TextField(blank=True, default='')
    # MoMo metadata (khi TYPE_DISBURSE)
    momo_trans_id = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Giao dịch ví"
        verbose_name_plural = "Giao dịch ví"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_txn_type_display()} — {self.amount} VNĐ — {self.wallet.user.username}"


class CommissionDebt(models.Model):
    """
    Khoản nợ hoa hồng 20% của Carepartner khi PHỤ HUYNH TRẢ TIỀN MẶT.

    Khi Task(completed) + PaymentOrder.method=cash:
      → tạo 1 CommissionDebt(gross=price, commission=price*0.20, status=pending)
    Cuối tháng:
      → CommissionDebt được gán vào MonthlyCommissionStatement
      → Worker thanh toán QR → Admin duyệt → CommissionDebt(paid)
    """

    STATUS_PENDING = 'pending'      # Chưa thanh toán
    STATUS_SENT = 'sent'            # Đã gửi QR trong statement tháng
    STATUS_PAID = 'paid'            # Đã thanh toán
    STATUS_OVERDUE = 'overdue'      # Quá hạn ( > 7 ngày sau khi gửi QR)
    STATUS_CHOICES = (
        (STATUS_PENDING, 'Chưa thanh toán'),
        (STATUS_SENT, 'Đã gửi QR chờ thanh toán'),
        (STATUS_PAID, 'Đã thanh toán'),
        (STATUS_OVERDUE, 'Quá hạn'),
    )

    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='commission_debts',
    )
    task = models.ForeignKey(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='commission_debts',
    )
    gross_amount = models.DecimalField(
        max_digits=14, decimal_places=0,
        help_text="Tổng tiền Carepartner nhận trực tiếp (bằng Task.price)"
    )
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=4, default=Decimal('0.2000'),
        help_text="Tỷ lệ hoa hồng (mặc định 0.20 = 20%)"
    )
    commission_amount = models.DecimalField(
        max_digits=14, decimal_places=0,
        help_text="Tiền hoa hồng = gross_amount * commission_rate"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    statement = models.ForeignKey(
        'MonthlyCommissionStatement',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='debts',
        help_text="Bảng kê tháng chứa khoản nợ này (null nếu chưa được tổng hợp)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        verbose_name = "Khoản nợ hoa hồng"
        verbose_name_plural = "Khoản nợ hoa hồng"
        ordering = ['-created_at']
        # 1 task chỉ tạo 1 CommissionDebt
        unique_together = ('task',)

    def save(self, *args, **kwargs):
        # Tự động tính commission_amount nếu chưa set
        if self.gross_amount and self.commission_rate:
            self.commission_amount = (self.gross_amount * self.commission_rate).quantize(Decimal('1'))
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Task#{self.task_id} — Worker:{self.worker.username} — Nợ {self.commission_amount} VNĐ — {self.get_status_display()}"


class MonthlyCommissionStatement(models.Model):
    """
    Bảng kê hoa hồng tháng — tổng hợp tất cả CommissionDebt pending của 1 worker trong tháng.

    Sinh định kỳ ngày 1 hàng tháng lúc 8h sáng (commission_scheduler.py).
    Mỗi statement có 1 QR VietQR cho Worker quét & chuyển khoản 20% hoa hồng cho Admin.
    """

    STATUS_DRAFT = 'draft'      # Vừa tạo, chưa gửi
    STATUS_SENT = 'sent'        # Đã gửi QR cho Worker
    STATUS_PAID = 'paid'        # Worker đã thanh toán, Admin đã duyệt
    STATUS_OVERDUE = 'overdue'  # Quá hạn (>7 ngày sau khi gửi mà chưa thanh toán)
    STATUS_CHOICES = (
        (STATUS_DRAFT, 'Bản nháp'),
        (STATUS_SENT, 'Đã gửi QR'),
        (STATUS_PAID, 'Đã thanh toán'),
        (STATUS_OVERDUE, 'Quá hạn'),
    )

    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='commission_statements',
    )
    month = models.DateField(
        help_text="Ngày ĐẦU THÁNG của kỳ thanh toán, VD: 2026-03-01 cho kỳ tháng 3/2026"
    )
    period_start = models.DateField()
    period_end = models.DateField()
    total_gross = models.DecimalField(
        max_digits=14, decimal_places=0, default=Decimal('0'),
        help_text="Tổng tiền mặt Carepartner nhận trong kỳ"
    )
    total_commission = models.DecimalField(
        max_digits=14, decimal_places=0, default=Decimal('0'),
        help_text="Tổng hoa hồng 20% phải nộp"
    )
    debt_count = models.PositiveIntegerField(default=0, help_text="Số đơn hàng có trong kỳ")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    vietqr_url = models.URLField(max_length=2000, blank=True, null=True)
    qr_payload = models.TextField(blank=True, default='', help_text="Chuỗi nội dung mã QR (VietQR / emv)")

    sent_at = models.DateTimeField(blank=True, null=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    admin_note = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Bảng kê hoa hồng tháng"
        verbose_name_plural = "Bảng kê hoa hồng tháng"
        ordering = ['-month']
        unique_together = ('worker', 'month')

    def __str__(self):
        return f"Bảng kê {self.worker.username} — {self.month.strftime('%m/%Y')} — {self.total_commission} VNĐ — {self.get_status_display()}"
