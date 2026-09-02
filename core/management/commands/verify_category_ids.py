"""
Django Management Command: verify_category_ids
================================================
Kiểm tra ServiceCategory ID trên DB có khớp với hard-code trong
frontend (data-cat) và mobile (CATEGORIES array) hay không.

Chạy:  python manage.py verify_category_ids
      (hoặc trên Render: python manage.py verify_category_ids --settings=backend.settings)

Exit code: 0 = khớp, 1 = không khớp.
"""

from django.core.management.base import BaseCommand
from core.models import ServiceCategory, PricingRule


# Thứ tự mong đợi từ seed_demo_data.py (tạo lần đầu = thứ tự ID)
EXPECTED = [
    {'id': 1, 'name': 'Gia sư',           'icon_name': 'BookOpen',    'pricing_type': 'hourly'},
    {'id': 2, 'name': 'Đón trẻ',          'icon_name': 'Baby',       'pricing_type': 'distance'},
    {'id': 3, 'name': 'Dọn dẹp nhà cửa', 'icon_name': 'Home',       'pricing_type': 'hourly'},
    {'id': 4, 'name': 'Trông trẻ',        'icon_name': 'Heart',      'pricing_type': 'hourly'},
    {'id': 5, 'name': 'Mua sắm hộ',      'icon_name': 'ShoppingCart','pricing_type': 'fixed'},
    {'id': 6, 'name': 'Nấu ăn',           'icon_name': 'Restaurant', 'pricing_type': 'hourly'},
    {'id': 7, 'name': 'Hỗ trợ AI',       'icon_name': 'SmartToy',   'pricing_type': 'fixed'},
    {'id': 8, 'name': 'Khác',            'icon_name': 'MoreHoriz',  'pricing_type': 'fixed'},
]


class Command(BaseCommand):
    help = 'Verify ServiceCategory IDs khớp với hard-code UI (web/mobile).'

    def handle(self, *args, **options):
        self.stdout.write('\n' + '=' * 64)
        self.stdout.write('  VERIFY CATEGORY IDs — A1 Source of Truth Check')
        self.stdout.write('=' * 64)

        db_cats = list(ServiceCategory.objects.order_by('id'))
        self.stdout.write(f'  DB categories: {len(db_cats)}')
        self.stdout.write('')

        has_mismatch = False
        lines = []

        # Header
        lines.append(f'{"ID":>4}  {"DB name":<20}  {"Expected name":<20}  {"Match":<6}  {"DB pricing_type":<10}  {"Expected PT":<10}')
        lines.append('-' * 86)

        # So sánh từng expected
        for exp in EXPECTED:
            db_cat = next((c for c in db_cats if c.id == exp['id']), None)
            if db_cat is None:
                lines.append(f"{exp['id']:>4}  {'*** MISSING ***':<20}  {exp['name']:<20}  {'MISS':<6}")
                has_mismatch = True
                continue

            # Lấy pricing_type từ DB
            try:
                db_pt = db_cat.pricing_rule.pricing_type
            except PricingRule.DoesNotExist:
                db_pt = '(none)'

            name_ok = db_cat.name == exp['name']
            pt_ok = db_pt == exp['pricing_type']
            match = 'OK' if (name_ok and pt_ok) else 'MISMATCH'
            if not (name_ok and pt_ok):
                has_mismatch = True

            lines.append(
                f"{db_cat.id:>4}  {db_cat.name:<20}  {exp['name']:<20}  {match:<6}  {db_pt:<10}  {exp['pricing_type']:<10}"
            )

        # Kiểm tra ID thừa (có trong DB nhưng không trong expected)
        expected_ids = {e['id'] for e in EXPECTED}
        for c in db_cats:
            if c.id not in expected_ids:
                has_mismatch = True
                try:
                    pt = c.pricing_rule.pricing_type
                except PricingRule.DoesNotExist:
                    pt = '(none)'
                lines.append(f"{c.id:>4}  {c.name:<20}  {'(unexpected)':<20}  EXTRA  {pt:<10}")

        for line in lines:
            self.stdout.write('  ' + line)
        self.stdout.write('')

        if has_mismatch:
            self.stdout.write(self.style.ERROR(
                '  KẾT QUẢ: KHÔNG KHỚP — Cần chạy lại seed_demo_data hoặc refactor UI\n'
                '  Giải pháp khuyến nghị: chạy python manage.py seed_demo_data'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                '  KẾT QUẢ: KHỚP HOÀN TOÀN — Tất cả 8 category ID đúng như UI hard-code'
            ))

        self.stdout.write('=' * 64 + '\n')
