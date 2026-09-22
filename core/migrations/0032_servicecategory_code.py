# M1 — ServiceCategory.code: khóa ổn định cho logic nghiệp vụ
# (care_diary map assessment_type theo code, không theo name hiển thị).
#
# ⚠️ V2 (2026-09-20) — FIX Render deploy fail: 5 deploy liên tiếp chết ở
#    migration cũ với lỗi PostgreSQL:
#      DuplicateTable: relation "core_servicecategory_code_b400e81b_like"
#      already exists
#    Nguyên nhân: AddField(SlugField) tạo index btree + index pattern-ops
#    `_like` (đặc thù PostgreSQL), rồi AlterField(unique=True) trong CÙNG
#    migration sinh thêm CREATE INDEX `_like` thứ hai mà không DROP cái cũ
#    → trùng tên tất yếu trên PG. SQLite (dev/test) không có pattern-ops
#    index nên không bao giờ tái hiện — chính là lý do bug lọt qua kiểm
#    thử local. Transaction rollback sạch nên lần chạy lại vẫn chết y hệt.
#
#    V2 viết lại theo hướng IDEMPOTENT + vendor-branched:
#      1. Tạo cột bằng SQL có guard (PG: ADD COLUMN IF NOT EXISTS;
#         SQLite: kiểm tra PRAGMA table_info trước khi ALTER)
#      2. Backfill giữ nguyên logic slug tiếng Việt + dedup -2/-3
#         (chỉ điền row chưa có code → chạy lại an toàn)
#      3. Tạo unique index có guard (PG: DO block kiểm tra pg_indexes đã
#         có unique index trên (code) chưa; SQLite: IF NOT EXISTS) và
#         pattern-ops index đúng TÊN Django tự sinh
#         (core_servicecategory_code_b400e81b_like) để state ↔ DB khớp.
#    State của Django (AddField/AlterField) được khai báo qua
#    SeparateDatabaseAndState nên `makemigrations --check` và các migration
#    sau này vẫn nhìn thấy field đúng như model.
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


def _code_column_exists(cursor, vendor):
    if vendor == 'postgresql':
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name = 'core_servicecategory' AND column_name = 'code';"
        )
        return (cursor.fetchone() or [0])[0] > 0
    # sqlite
    cursor.execute("PRAGMA table_info(core_servicecategory)")
    return 'code' in {row[1] for row in cursor.fetchall()}


def ensure_code_column(apps, schema_editor):
    """Bước 1 (DB) — tạo cột code nếu chưa có. Idempotent: deploy bị fail
    giữa chừng (cột đã tạo, migration chưa ghi) chạy lại không lỗi."""
    conn = schema_editor.connection
    vendor = conn.vendor
    with conn.cursor() as cursor:
        if _code_column_exists(cursor, vendor):
            return
        if vendor == 'postgresql':
            cursor.execute(
                "ALTER TABLE core_servicecategory "
                "ADD COLUMN code varchar(50) NOT NULL DEFAULT '';"
            )
        else:  # sqlite (dev/test)
            cursor.execute(
                "ALTER TABLE core_servicecategory "
                "ADD COLUMN code varchar(50) NOT NULL DEFAULT '';"
            )


def backfill_category_codes(apps, schema_editor):
    """Bước 2 — backfill code cho mọi category hiện có: 'Gia sư' → 'gia-su',
    'Trông trẻ' → 'trong-tre'. Trùng slug (trường hợp name trùng/similar)
    được gán hậu tố -2, -3... theo thứ tự id. Row đã có code thì giữ nguyên
    (chạy lại sau deploy fail nửa chừng vẫn an toàn)."""
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


def ensure_unique_code_index(apps, schema_editor):
    """Bước 3 (DB) — bảo đảm ràng buộc unique trên code + pattern-ops index
    khớp tên Django sinh ra. Idempotent: nếu unique index/constraint đã tồn
    tại (deploy trước tạo rồi) thì bỏ qua, không bao giờ DuplicateTable."""
    conn = schema_editor.connection
    vendor = conn.vendor
    with conn.cursor() as cursor:
        if vendor == 'postgresql':
            # Đã có unique index/constraint nào trên (code) chưa?
            cursor.execute(
                "SELECT COUNT(*) FROM pg_indexes "
                "WHERE schemaname = ANY (current_schemas(true)) "
                "  AND tablename = 'core_servicecategory' "
                "  AND indexdef ILIKE '%UNIQUE%' "
                "  AND indexdef ILIKE '% (code)%';"
            )
            has_unique = (cursor.fetchone() or [0])[0] > 0
            if not has_unique:
                cursor.execute(
                    "CREATE UNIQUE INDEX core_servicecategory_code_key "
                    "ON core_servicecategory (code);"
                )
            # Pattern-ops index với ĐÚNG tên Django tự sinh cho field này
            # (hash b400e81b lấy từ lỗi DuplicateTable thực tế trên Render).
            # IF NOT EXISTS → chạy lại bao nhiêu lần cũng an toàn.
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS core_servicecategory_code_b400e81b_like "
                "ON core_servicecategory (code varchar_pattern_ops);"
            )
        else:  # sqlite (dev/test) — Django SQLite không dùng pattern-ops
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS core_servicecategory_code_key "
                "ON core_servicecategory (code);"
            )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0031_alter_task_status_alter_taskapplication_status'),
    ]

    operations = [
        # Bước 1 — DB: tạo cột (idempotent); STATE: đăng ký field chưa unique
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_code_column, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='servicecategory',
                    name='code',
                    field=models.SlugField(blank=True, help_text='Mã ổn định cho logic (vd: gia-su, trong-tre) — không đổi theo tên hiển thị.', max_length=50),
                ),
            ],
        ),
        # Bước 2 — backfill (chỉ row chưa có code)
        migrations.RunPython(backfill_category_codes, reverse_backfill),
        # Bước 3 — DB: unique + pattern index (idempotent); STATE: unique=True
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(ensure_unique_code_index, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name='servicecategory',
                    name='code',
                    field=models.SlugField(blank=True, help_text='Mã ổn định cho logic (vd: gia-su, trong-tre) — không đổi theo tên hiển thị.', max_length=50, unique=True),
                ),
            ],
        ),
    ]
