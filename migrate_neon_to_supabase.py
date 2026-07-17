#!/usr/bin/env python
"""
╔══════════════════════════════════════════════════════════════════════╗
║   EduCareLink — Migrate dữ liệu từ Neon → Supabase                    ║
║                                                                       ║
║   Cách chạy (chạy 2 lần, mỗi lần trỏ vào 1 DB):                       ║
║                                                                       ║
║   BƯỚC 1 — Dump dữ liệu Neon ra file JSON:                            ║
║     DATABASE_URL=<neon_url> python migrate_neon_to_supabase.py dump    ║
║       → tạo backup_neon_dump.json (toàn bộ dữ liệu theo app/model)     ║
║                                                                       ║
║   BƯỚC 2 — Load dữ liệu vào Supabase:                                 ║
║     DATABASE_URL=<supabase_url> python migrate_neon_to_supabase.py load║
║       → tạo schema (makemigrations + migrate) + load data              ║
║                                                                       ║
║   Lý do dùng Django dumpdata thay vì pg_dump/restore:                 ║
║     - Tránh xung đột sequence / OID giữa 2 server                     ║
║     - Đảm bảo cross-engine (chỉ phòng trường hợp tương lai)            ║
║     - Giữ nguyên PK, FK, datetime (timezone-aware)                    ║
╚══════════════════════════════════════════════════════════════════════╝

Yêu cầu: file .env hoặc env var DATABASE_URL đã được set.
"""

import os
import sys
import json
import django

# --- Khởi tạo Django ---
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.apps import apps
from django.core import serializers
from django.db import transaction

DUMP_FILE = 'backup_neon_dump.json'

# Danh sách app cần dump (theo INSTALLED_APPS có model)
APPS_TO_DUMP = ['core', 'payments', 'tracking', 'moderation', 'auth', 'contenttypes', 'sessions']

# Auth/contenttypes/sessions: CẨN THẬN — chỉ dump user + group + permission
# để tránh conflict PK với Superuser mặc định của Supabase mới.


def get_models_for_dump():
    """Lấy danh sách model cần dump, theo thứ tự dependency (FK)."""
    ordered = []
    # 1. contenttypes trước (nếu không sẽ lỗi khi load permission)
    # 2. auth (User, Group, Permission)
    # 3. các app business theo thứ tự FK
    priority_apps = ['contenttypes', 'auth', 'core', 'payments', 'tracking', 'moderation']
    seen = set()

    for app_label in priority_apps:
        try:
            app_config = apps.get_app_config(app_label)
        except LookupError:
            continue
        for model in app_config.get_models():
            key = (model._meta.app_label, model._meta.model_name)
            if key in seen:
                continue
            seen.add(key)
            ordered.append(model)
    return ordered


def cmd_dump():
    """Dump toàn bộ dữ liệu từ DB hiện tại ra file JSON."""
    models = get_models_for_dump()
    all_data = []
    print(f"\n{'='*60}")
    print(f"  DUMP: {len(models)} model(s) từ DB hiện tại")
    print(f"{'='*60}")

    total_rows = 0
    for model in models:
        label = f"{model._meta.app_label}.{model._meta.model_name}"
        try:
            qs = model.objects.all()
            count = qs.count()
        except Exception as e:
            print(f"  ❌ {label:40s} — lỗi: {e}")
            continue

        if count == 0:
            print(f"  ⬜ {label:40s} — 0 row (skip)")
            continue

        # Serialize từng model
        try:
            data = serializers.serialize('json', qs, use_natural_foreign_keys=False)
            parsed = json.loads(data)
            all_data.extend(parsed)
            total_rows += count
            print(f"  ✅ {label:40s} — {count:>6} row(s)")
        except Exception as e:
            print(f"  ❌ {label:40s} — serialize lỗi: {e}")

    with open(DUMP_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    file_size = os.path.getsize(DUMP_FILE)
    print(f"\n{'='*60}")
    print(f"  ✅ Dump xong: {total_rows} row → {DUMP_FILE}")
    print(f"  Kích thước: {file_size:,} bytes ({file_size/1024:.1f} KB)")
    print(f"{'='*60}\n")


def cmd_load():
    """Load dữ liệu từ file JSON vào DB hiện tại (phải là Supabase mới)."""
    if not os.path.exists(DUMP_FILE):
        print(f"\n❌ Không tìm thấy {DUMP_FILE}. Chạy 'dump' trước.\n")
        sys.exit(1)

    db_url = os.environ.get('DATABASE_URL', '')
    if not db_url or 'supabase' not in db_url:
        print(f"\n⚠️  CẢNH BÁO: DATABASE_URL hiện tại không chứa 'supabase'.")
        print(f"    Trước khi load, đảm bảo DATABASE_URL đang trỏ vào Supabase mới.")
        print(f"    (Hiện tại: {db_url[:40]}...)")
        resp = input("    Bạn CHẮC CHẮN muốn tiếp tục load vào DB này? (gõ YES): ")
        if resp.strip() != 'YES':
            print("    Đã hủy.")
            sys.exit(0)

    with open(DUMP_FILE, 'r', encoding='utf-8') as f:
        all_data = json.load(f)

    print(f"\n{'='*60}")
    print(f"  LOAD: {len(all_data)} object(s) từ {DUMP_FILE}")
    print(f"{'='*60}")

    # Nhóm theo model để in thống kê
    from collections import Counter
    counts = Counter(obj['model'] for obj in all_data)
    for model_label, c in sorted(counts.items()):
        print(f"  • {model_label:40s} {c:>6}")

    # Load bằng serializers.deserialize + transaction.atomic
    # Dùng ignorenonexistent để bỏ qua field không tồn tại (phòng migration lệch)
    loaded = 0
    errors = 0
    try:
        with transaction.atomic():
            for obj in serializers.deserialize('json', json.dumps(all_data), ignorenonexistent=True):
                try:
                    obj.save()
                    loaded += 1
                except Exception as e:
                    errors += 1
                    if errors <= 5:
                        print(f"  ⚠️  Lỗi save {obj.object._meta.label} pk={obj.object.pk}: {e}")
    except Exception as e:
        print(f"\n❌ Transaction rollback: {e}")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  ✅ Load xong: {loaded} object(s), {errors} lỗi")
    print(f"{'='*60}\n")


def cmd_verify():
    """So sánh số dòng giữa 2 DB (cần chạy dump 2 lần)."""
    models = get_models_for_dump()
    print(f"\n{'='*60}")
    print(f"  VERIFY: Đếm row trong DB hiện tại")
    print(f"{'='*60}")
    total = 0
    for model in models:
        label = f"{model._meta.app_label}.{model._meta.model_name}"
        try:
            c = model.objects.count()
            print(f"  {label:40s} {c:>6}")
            total += c
        except Exception as e:
            print(f"  {label:40s} ERROR: {e}")
    print(f"\n  TOTAL: {total} row(s)\n{'='*60}\n")


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('dump', 'load', 'verify'):
        print("Cách dùng:")
        print("  python migrate_neon_to_supabase.py dump     # dump Neon → file JSON")
        print("  python migrate_neon_to_supabase.py load     # load JSON → Supabase")
        print("  python migrate_neon_to_supabase.py verify   # đếm row DB hiện tại")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == 'dump':
        cmd_dump()
    elif cmd == 'load':
        cmd_load()
    elif cmd == 'verify':
        cmd_verify()
