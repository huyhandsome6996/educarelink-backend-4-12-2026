from django.db import migrations

# QA 2026-09-10 Vấn đề #1: EduCareLink chỉ còn 3 danh mục dịch vụ.
# Các danh mục cũ bị khóa mềm (is_active=False) — không xóa để giữ
# nguyên dữ liệu lịch sử (Task.category SET_NULL nếu xóa cứng).
ALLOWED_CATEGORY_NAMES = ['Gia sư', 'Đón trẻ', 'Trông trẻ']


def lock_legacy_categories(apps, schema_editor):
    ServiceCategory = apps.get_model('core', 'ServiceCategory')
    ServiceCategory.objects.exclude(name__in=ALLOWED_CATEGORY_NAMES).update(is_active=False)


def unlock_all(apps, schema_editor):
    ServiceCategory = apps.get_model('core', 'ServiceCategory')
    ServiceCategory.objects.update(is_active=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_servicecategory_is_active'),
    ]

    operations = [
        migrations.RunPython(lock_legacy_categories, unlock_all),
    ]
