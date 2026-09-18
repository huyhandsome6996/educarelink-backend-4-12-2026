# M1 — ServiceCategory.code: khóa ổn định cho logic nghiệp vụ
# (care_diary map assessment_type theo code, không theo name hiển thị).
#
# Migration 3 bước an toàn cho dữ liệu production:
#   1. AddField (chưa unique) — tránh vi phạm unique khi còn row cũ
#   2. RunPython backfill code từ name (slug tiếng Việt, tự chứa — không
#      import core.models để migration không phụ thuộc module đổi sau này)
#   3. AlterField bật unique sau khi mọi row đã có code riêng
from django.db import migrations, models

# Bản slugify tự chứa cho migration (bản chạy runtime nằm ở core/models.py)
_VN_TRANSLIT = str.maketrans({
    'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
    'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
    'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
    'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
    'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
    'đ': 'd',
})


def _vn_slug(text):
    lowered = str(text).lower().translate(_VN_TRANSLIT)
    chars = []
    dash_pending = False
    for ch in lowered:
        if ch.isalnum() and ch.isascii():
            chars.append(ch)
            dash_pending = False
        elif chars and not dash_pending:
            chars.append('-')
            dash_pending = True
    return ''.join(chars).strip('-')[:50]


def backfill_category_codes(apps, schema_editor):
    """Backfill code cho mọi category hiện có: 'Gia sư' → 'gia-su',
    'Trông trẻ' → 'trong-tre'. Trùng slug (trường hợp name trùng/similar)
    được gán hậu tố -2, -3... theo thứ tự id. Row đã có code thì giữ nguyên."""
    ServiceCategory = apps.get_model('core', 'ServiceCategory')
    seen = set()
    for cat in ServiceCategory.objects.all().order_by('id'):
        if cat.code:
            seen.add(cat.code)
            continue
        base = _vn_slug(cat.name) or f'category-{cat.pk}'
        code = base
        idx = 2
        while code in seen:
            code = f'{base}-{idx}'
            idx += 1
        cat.code = code
        cat.save(update_fields=['code'])
        seen.add(code)


def reverse_backfill(apps, schema_editor):
    # Reverse: chỉ xóa code về rỗng — không cố khôi phục dữ liệu đã mất
    # (field mới thêm, không có gì để khôi phục).
    ServiceCategory = apps.get_model('core', 'ServiceCategory')
    ServiceCategory.objects.all().update(code='')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_alter_task_status_alter_taskapplication_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicecategory',
            name='code',
            field=models.SlugField(blank=True, help_text='Mã ổn định cho logic (vd: gia-su, trong-tre) — không đổi theo tên hiển thị.', max_length=50),
        ),
        migrations.RunPython(backfill_category_codes, reverse_backfill),
        migrations.AlterField(
            model_name='servicecategory',
            name='code',
            field=models.SlugField(blank=True, help_text='Mã ổn định cho logic (vd: gia-su, trong-tre) — không đổi theo tên hiển thị.', max_length=50, unique=True),
        ),
    ]
