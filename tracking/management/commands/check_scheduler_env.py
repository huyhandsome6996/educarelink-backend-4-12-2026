"""
Management command kiểm tra các env vars bắt buộc trước khi chạy scheduler.

QA-FIX-5 / M3: Render Cron Job cần SECRET_KEY + DATABASE_URL để Django khởi
động. Nếu user import Blueprint mà không copy các secret này từ web service
qua Dashboard, cron sẽ fail ngay lúc import settings với lỗi cryptic.

Lệnh này fail-fast với thông báo rõ ràng để deploy-er biết cần làm gì:
  python manage.py check_scheduler_env

Exit code:
  0 — tất cả env vars OK
  1 — thiếu env var(s) — in checklist deploy
"""

import os
import sys

from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = (
        'Kiểm tra các env vars bắt buộc trước khi chạy tracking scheduler. '
        'Fail-fast nếu thiếu — tránh cron fail silently.'
    )

    # Các env vars bắt buộc cho scheduler process.
    REQUIRED_ENV_VARS = [
        # Django core — settings.py bắt buộc khi RENDER=true
        ('SECRET_KEY', 'Django SECRET_KEY — sync từ web service qua Dashboard'),
        ('DATABASE_URL', 'Postgres connection string — sync từ web service qua Dashboard'),
    ]
    # Các env vars tuỳ chọn nhưng nên có.
    OPTIONAL_ENV_VARS = [
        ('RENDER', '"true" — đánh dấu production mode'),
        ('TRACKING_OFFLINE_CHECK_ENABLED', '"true" — bật offline scheduler'),
        ('VERIFICATION_CHECK_ENABLED', '"true" — bật verification scheduler'),
        ('TRACKING_SCHEDULER_PROCESS', '"true" — đánh dấu đây là process scheduler riêng'),
    ]

    def handle(self, *args, **options):
        is_render = os.environ.get('RENDER', '').lower() == 'true'
        self.stdout.write(self.style.SUCCESS(
            '[check_scheduler_env] Kiểm tra env vars cho scheduler process...'
        ))
        self.stdout.write(f'  RENDER = {os.environ.get("RENDER", "(unset)")}')
        self.stdout.write(f'  DEBUG  = {getattr(settings, "DEBUG", "(unset)")}')

        missing = []
        for var_name, hint in self.REQUIRED_ENV_VARS:
            value = os.environ.get(var_name, '')
            if not value:
                missing.append((var_name, hint))
                self.stderr.write(self.style.ERROR(f'  ✗ {var_name} — MISSING'))
            else:
                # Mask giá trị để không leak secret vào log.
                masked = value[:4] + '...' + value[-2:] if len(value) > 8 else '***'
                self.stdout.write(self.style.SUCCESS(f'  ✓ {var_name} = {masked}'))

        self.stdout.write('\nOptional env vars (không bắt buộc):')
        for var_name, hint in self.OPTIONAL_ENV_VARS:
            value = os.environ.get(var_name, '')
            if value:
                self.stdout.write(f'  ✓ {var_name} = {value}')
            else:
                self.stdout.write(self.style.WARNING(f'  ? {var_name} (default will be used) — {hint}'))

        if missing:
            self.stderr.write(self.style.ERROR(
                '\n❌ MISSING REQUIRED ENV VARS — scheduler sẽ KHÔNG chạy:\n'
            ))
            for var_name, hint in missing:
                self.stderr.write(self.style.ERROR(f'  - {var_name}: {hint}\n'))
            self.stderr.write(self.style.WARNING(
                '\n📋 DEPLOY CHECKLIST (Render Dashboard):\n'
                '  1. Vào Cron Job "educarelink-tracking-scheduler" → Settings → Environment\n'
                '  2. Click "Copy from existing service" → chọn "educarelink-backend" (web service)\n'
                '  3. Chọn các biến: SECRET_KEY, DATABASE_URL, GEMINI_API_KEY, EXPO_ACCESS_TOKEN\n'
                '  4. Save changes → đợi cron run tiếp theo (≤ 1 phút)\n'
                '  5. Verify qua endpoint: curl https://educarelink-backend.onrender.com/api/tracking/scheduler-health/\n'
                '     - status=ok → đã chạy\n'
                '     - status=no_data → chưa chạy (kiểm tra lại env vars)\n'
                '     - status=stale → đã chạy nhưng die gần đây (kiểm tra Render logs)\n'
            ))
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS(
            '\n✅ All required env vars present — scheduler ready to run.'
        ))
