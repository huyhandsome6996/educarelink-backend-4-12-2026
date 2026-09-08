"""python manage.py run_g13_checks — chạy 17 assertion nghiệp vụ G13.

Wrapper giúp gate G13 KHÔNG bao giờ phụ thuộc cwd hay venv activation:
    python manage.py run_g13_checks

Toàn bộ assertion nằm ở matching/g13_checks.py (cùng nguồn với
scripts/g13_business_rules.py). Exit code: 0 = pass, 1 = có FAIL,
2 = thiếu dữ liệu cấu hình (cần migrate + seed_matching_config).
"""
import sys

from django.core.management.base import BaseCommand

from matching.g13_checks import main


class Command(BaseCommand):
    help = ('Chạy 17 assertion nghiệp vụ G13 (gate QA Flow 1 ghép cặp). '
            'Cần chạy "python manage.py migrate" + '
            '"python manage.py seed_matching_config" trước.')

    def handle(self, *args, **options):
        code = main()
        if code != 0:
            sys.exit(code)
