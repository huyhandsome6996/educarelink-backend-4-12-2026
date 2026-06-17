"""
Management command — chạy monthly settlement thủ công.

Usage:
    python manage.py run_monthly_settlement              # tổng hợp tháng trước
    python manage.py run_monthly_settlement --year 2025 --month 11
"""

from django.core.management.base import BaseCommand
from payments.services import generate_monthly_settlements


class Command(BaseCommand):
    help = "Tổng hợp hoa hồng tiền mặt tháng trước và sinh QR MoMo cho Carepartner."

    def add_arguments(self, parser):
        parser.add_argument('--year', type=int, default=None,
                            help='Năm kỳ thanh toán (mặc định: năm của tháng trước)')
        parser.add_argument('--month', type=int, default=None,
                            help='Tháng kỳ thanh toán (mặc định: tháng trước)')

    def handle(self, *args, **opts):
        year = opts['year']
        month = opts['month']
        if year and month:
            self.stdout.write(self.style.WARNING(
                f"Chạy settlement cho kỳ {month:02d}/{year}..."
            ))
        else:
            self.stdout.write(self.style.WARNING(
                "Chạy settlement cho kỳ tháng trước..."
            ))
        stats = generate_monthly_settlements(year=year, month=month)
        self.stdout.write(self.style.SUCCESS(
            f"Kết quả: {stats}"
        ))
