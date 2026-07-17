#!/usr/bin/env python
"""
Check dung lượng + số dòng của PostgreSQL DB (Neon hoặc Supabase).
Không cần API key — kết nối trực tiếp qua DATABASE_URL.

Cách chạy:
    DATABASE_URL=<url> python check_db_quota.py
"""

import os
import sys

# Đọc DATABASE_URL từ biến môi trường hoặc file secrets
DB_URL = os.environ.get('DATABASE_URL', '')

if not DB_URL:
    # Thử đọc từ file secrets nếu có
    secrets_paths = [
        os.path.join(os.path.dirname(__file__), '.secrets', 'educarelink.env'),
        os.path.join(os.path.dirname(__file__), '..', '.secrets', 'educarelink.env'),
        os.path.join(os.environ.get('USERPROFILE', ''), 'ZCodeProject', '.secrets', 'educarelink.env'),
    ]
    for p in secrets_paths:
        if os.path.exists(p):
            print(f"📂 Đọc DATABASE_URL từ: {p}")
            with open(p, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('DATABASE_URL=') or line.startswith('NEON_DATABASE_URL='):
                        if not DB_URL:
                            DB_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
            break

if not DB_URL:
    print("❌ Không tìm thấy DATABASE_URL.")
    print("   Set biến env: set DATABASE_URL=postgresql://...")
    sys.exit(1)

# Cắt bớt phần password khi in ra
masked = DB_URL.split('@')[0].rsplit(':', 1)[0] + ':***@' + DB_URL.split('@', 1)[1] if '@' in DB_URL else DB_URL
print(f"\n🔌 Kết nối: {masked}")
print(f"   Provider: {'Supabase' if 'supabase' in DB_URL else 'Neon' if 'neon' in DB_URL else 'Unknown'}\n")

try:
    import psycopg2
except ImportError:
    print("⚠️  Cài psycopg2-binary: pip install psycopg2-binary")
    sys.exit(1)

try:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
except Exception as e:
    print(f"❌ Kết nối thất bại: {e}")
    sys.exit(1)

print("=" * 70)
print("  1. TOTAL DATABASE SIZE")
print("=" * 70)
cur.execute("SELECT pg_size_pretty(pg_database_size(current_database()));")
print(f"   → {cur.fetchone()[0]}")
# Neon free = 0.5 GB (512 MB); Supabase free = 500 MB
print(f"   → Giới hạn free tier: Neon 512MB / Supabase 500MB")

print()
print("=" * 70)
print("  2. TABLE SIZE (top 15 bảng lớn nhất)")
print("=" * 70)
cur.execute("""
    SELECT
        schemaname || '.' || relname AS table,
        n_live_tup AS row_count,
        pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
        pg_size_pretty(pg_relation_size(relid)) AS data_size
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 15;
""")
print(f"   {'Table':<45} {'Rows':>10} {'Total':>10} {'Data':>10}")
print(f"   {'-'*45} {'-'*10} {'-'*10} {'-'*10}")
for row in cur.fetchall():
    print(f"   {row[0]:<45} {row[1] or 0:>10} {row[2]:>10} {row[3]:>10}")

print()
print("=" * 70)
print("  3. INDEX SIZE")
print("=" * 70)
cur.execute("""
    SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) AS total_index_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public';
""")
print(f"   → Tổng index size: {cur.fetchone()[0]}")

print()
print("=" * 70)
print("  4. ACTIVE CONNECTIONS")
print("=" * 70)
cur.execute("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();")
print(f"   → {cur.fetchone()[0]} connection(s) đang active")

print()
print("=" * 70)
print("  5. ESTIMATE % USED (so với free tier)")
print("=" * 70)
cur.execute("SELECT pg_database_size(current_database());")
size_bytes = cur.fetchone()[0]
limit_mb = 500 if 'supabase' in DB_URL else 512
size_mb = size_bytes / (1024 * 1024)
pct = (size_mb / limit_mb) * 100
print(f"   → Đang dùng: {size_mb:.2f} MB / {limit_mb} MB ({pct:.1f}%)")
if pct < 50:
    print(f"   → ✅ Còn nhiều dung lượng")
elif pct < 80:
    print(f"   → ⚠️  Đang đến giới hạn, cần theo dõi")
else:
    print(f"   → 🔴 Sắp đầy! Cần migrate/cleanup gấp")

print()
cur.close()
conn.close()
print("✅ Done.")
