"""
Management command — gửi reminder cho settlements overdue.

Usage:
    python manage.py send_settlement_reminders
"""

from django.core.management.base import BaseCommand
from payments.services import send_settlement_reminders


class Command(BaseCommand):
    help = "Gửi nhắc nhở cho kỳ thanh toán hoa hồng đã quá hạn."

    def handle(self, *args, **opts):
        stats = send_settlement_reminders()
        self.stdout.write(self.style.SUCCESS(
            f"Đã gửi {stats.get('reminders_sent', 0)} nhắc nhở."
        ))
