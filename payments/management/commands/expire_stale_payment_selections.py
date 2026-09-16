"""
Management command — expire các lựa chọn CarePartner chưa thanh toán.

VIETQR GATE (feature/vietqr-payment-gate-booking):
  Phụ huynh chọn CarePartner → task 'pending_payment' + payment 'pending'
  (QR VietQR). Nếu không thanh toán trong hạn, task sẽ KẸT vĩnh viễn ở
  'pending_payment' — CarePartner không được đặt, phụ huynh không chọn được
  người khác. Command này quét + rollback:

    Payment method='payos', status='pending', quá hạn:
      - hạn thật: payos_expires_at (PayOS trả về khi tạo link) < now
      - fallback: initiated_at < now - PAYOS_SELECTION_TIMEOUT_MINUTES (15')
    → payment 'cancelled', application 'payment_pending' → 'pending',
      task 'pending_payment' → 'open', PaymentLog 'vietqr_selection_expired'.

Usage (cron mỗi 5 phút — render.yaml service educarelink-payos-expiry):
    python manage.py expire_stale_payment_selections
    python manage.py expire_stale_payment_selections --dry-run
"""

import logging

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.conf import settings

from payments.models import Payment, PaymentLog
from payments.services import rollback_pending_selection

logger = logging.getLogger('educarelink.payments.expire')


class Command(BaseCommand):
    help = ("Rollback các lựa chọn CarePartner chưa thanh toán quá hạn "
            "(VietQR gate — task 'pending_payment' không được kẹt vĩnh viễn).")

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Chỉ liệt kê payment sẽ bị rollback, không đổi dữ liệu.')

    def handle(self, *args, **opts):
        now = timezone.now()
        timeout_minutes = int(getattr(settings, 'PAYOS_SELECTION_TIMEOUT_MINUTES', 15))
        fallback_cutoff = now - timedelta(minutes=timeout_minutes)

        # Quét payment 'pending' của PayOS thuộc LUỒNG GATE (task đang
        # 'pending_payment') — không đụng payment cũ trước-gate (task
        # in_progress). Quá hạn ưu tiên hạn QR thật (payos_expires_at, luôn
        # được set khi tạo link — fallback N phút); nếu null thì dùng
        # initiated_at làm ước lượng.
        stale = list(
            Payment.objects.filter(
                method='payos', status='pending',
                task__status='pending_payment',
            ).filter(
                Q(payos_expires_at__lt=now)
                | Q(payos_expires_at=None, initiated_at__lt=fallback_cutoff)
            ).select_related('task')
        )

        if not stale:
            self.stdout.write(self.style.SUCCESS(
                f"[{now:%Y-%m-%d %H:%M:%S}] Không có lựa chọn nào quá hạn."))
            return

        if opts['dry_run']:
            for p in stale:
                self.stdout.write(self.style.WARNING(
                    f"[DRY-RUN] Payment#{p.id} task#{p.task_id} "
                    f"order_code={p.payos_order_code} initiated_at={p.initiated_at} "
                    f"expires_at={p.payos_expires_at} sẽ bị rollback."))
            self.stdout.write(self.style.WARNING(f"Tổng: {len(stale)} payment."))
            return

        rolled_back = 0
        for payment in stale:
            try:
                with transaction.atomic():
                    changed = rollback_pending_selection(
                        payment,
                        event_type='vietqr_selection_expired',
                        message=(f'QR VietQR quá hạn '
                                 f'(expires_at={payment.payos_expires_at or f"initiated_at+{timeout_minutes}p"}) '
                                 f'— task#{payment.task_id} về open, application về pending'),
                    )
            except Exception:
                logger.exception(f"[expire] Rollback payment#{payment.id} thất bại")
                continue
            if changed:
                rolled_back += 1
                self.stdout.write(self.style.SUCCESS(
                    f"[OK] Payment#{payment.id} task#{payment.task_id} — "
                    f"rollback về open/pending."))

        # Ghi 1 dòng tổng kết để audit cron chạy đều
        PaymentLog.objects.create(
            event_type='vietqr_selection_expired',
            message=f'Cron expire_stale_payment_selections: {rolled_back}/{len(stale)} payment rollback',
        )
        self.stdout.write(self.style.SUCCESS(
            f"Hoàn tất: {rolled_back}/{len(stale)} payment quá hạn đã rollback."))
