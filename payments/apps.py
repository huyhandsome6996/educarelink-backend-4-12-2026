"""
App config cho module Payments (MoMo + Escrow + Commission 20%).

Module này KHÔNG sửa bất kỳ file nào của core — chỉ thêm:
  - 5 model mới (Wallet, PaymentOrder, EscrowTransaction, CommissionDebt, MonthlyCommissionStatement)
  - Signal `post_save` trên core.Task để tự động:
      + phân tiền MoMo escrow khi task completed
      + ghi nợ hoa hồng 20% khi task completed (cash flow)
  - Scheduler chạy ngày 1 hàng tháng để tổng hợp hoa hồng + gửi QR VietQR cho Carepartner
  - Endpoints MoMo: create-payment, return-url, ipn (notifyUrl)
  - Endpoints Admin: duyệt statement, xem doanh thu
"""
from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    name = 'payments'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        # Import signal để Django đăng ký post_save trên core.Task
        from . import signals  # noqa: F401

        # Khởi động Commission Scheduler (chạy cuối tháng)
        from .commission_scheduler import start_commission_scheduler
        start_commission_scheduler()
