# EduCareLink — Hướng dẫn Migrate Database (Neon → Supabase)

> **Mục tiêu**: Chuyển database từ Neon PostgreSQL sang Supabase PostgreSQL mà **không downtime**, **không mất dữ liệu**, **không ảnh hưởng nhánh main**.
>
> **Nguyên tắc vàng**: Chỉ cần đổi `DATABASE_URL` trên Render Dashboard — toàn bộ code đã dùng env var, không cần sửa code hay merge branch.

---

## 0. Kiểm tra trước khi bắt đầu

### 0.1. Verify health check hiện tại

```bash
curl https://educarelink-backend.onrender.com/api/health/
```

Kết quả mong đợi:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "..."
}
```

Nếu `"status": "degraded"` hoặc `"database": "error"` → **DỪNG LẠI** — Neon DB đang có vấn đề, cần fix trước khi migrate.

### 0.2. Kiểm tra dung lượng DB hiện tại

```bash
# Kết nối Neon DB trực tiếp (lấy connection string từ Render Dashboard → DATABASE_URL)
psql "postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require" -c "
  SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
"
```

### 0.3. Đếm số bản ghi quan trọng

```bash
psql "$NEON_URL" -c "
  SELECT 'users' AS table, COUNT(*) FROM core_user
  UNION ALL SELECT 'tasks', COUNT(*) FROM core_task
  UNION ALL SELECT 'reviews', COUNT(*) FROM core_review
  UNION ALL SELECT 'notifications', COUNT(*) FROM core_notification
  UNION ALL SELECT 'payments', COUNT(*) FROM payments_payment
  UNION ALL SELECT 'moderations', COUNT(*) FROM moderation_taskmoderation
  UNION ALL SELECT 'tracking', COUNT(*) FROM tracking_livelocation;
"
```

> Ghi lại các con số này để verify sau khi restore.

---

## 1. Tạo Supabase project

### 1.1. Đăng ký & tạo project

1. Truy cập https://supabase.com/ → Đăng ký / Đăng nhập
2. Click **New Project**
3. Điền thông tin:
   - **Name**: `educarelink-production`
   - **Database Password**: Tạo mật khẩu mạnh, **LƯU LẠI** (chỉ hiển thị 1 lần)
   - **Region**: Chọn gần người dùng nhất (Southeast Asia → Singapore)
4. Chờ project khởi tạo (~2 phút)

### 1.2. Lấy connection string

Vào **Settings → Database → Connection string → URI**:

```
postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

> ⚠️ **Quan trọng**: Dùng **Pooler URL** (port 6543) thay vì Direct URL (port 5432) vì Render free tier dùng gunicorn workers → nhiều connection → cần pooler.

### 1.3. Thêm `sslmode=require` vào URL

```
postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

---

## 2. Dump dữ liệu từ Neon (cũ)

### 2.1. Cài pg_dump (nếu chưa có)

```bash
# macOS
brew install libpq

# Ubuntu/Debian
sudo apt install postgresql-client

# Windows — tải từ https://www.postgresql.org/download/windows/
```

### 2.2. Dump toàn bộ database

```bash
# Lấy NEON_URL từ Render Dashboard → Environment Variables → DATABASE_URL
NEON_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"

# Dump schema + data (không dump role/quyền — Supabase tự quản lý)
pg_dump "$NEON_URL" \
  --no-owner \
  --no-acl \
  --no-comments \
  --clean \
  --if-exists \
  --format=custom \
  --file=educarelink_neon_backup.dump
```

### 2.3. Hoặc dump dạng SQL (dễ đọc, dễ kiểm tra)

```bash
pg_dump "$NEON_URL" \
  --no-owner \
  --no-acl \
  --no-comments \
  --clean \
  --if-exists \
  --format=plain \
  --file=educarelink_neon_backup.sql
```

### 2.4. Kiểm tra dump file

```bash
# Nếu dùng .sql
head -50 educarelink_neon_backup.sql
tail -20 educarelink_neon_backup.sql

# Kích thước
ls -lh educarelink_neon_backup.*
```

> ⚠️ **Backup an toàn**: Copy dump file vào ít nhất 2 nơi (Google Drive, USB, v.v.) trước khi tiếp tục.

---

## 3. Restore dữ liệu vào Supabase (mới)

### 3.1. Kết nối Supabase & tạo schema trước

```bash
SUPABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"

# Chỉ chạy migrate để tạo schema (bảng rỗng)
# Việc này đảm bảo Django migrations khớp với code hiện tại
```

### 3.2. Phương án A: Restore từ dump (khuyến nghị nếu data lớn)

```bash
# Restore từ .dump file
pg_restore "$SUPABASE_URL" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --verbose \
  educarelink_neon_backup.dump 2>&1 | tee restore_log.txt
```

### 3.3. Phương án B: Restore từ .sql file

```bash
psql "$SUPABASE_URL" < educarelink_neon_backup.sql 2>&1 | tee restore_log.txt
```

### 3.4. Phương án C: Để Django migrate + seed (nếu chỉ cần dữ liệu demo)

```bash
# Chỉ cần set DATABASE_URL mới rồi chạy build.sh
# Django sẽ tự migrate + seed_demo_data
# ⚠️ Chỉ dùng phương án này nếu KHÔNG cần giữ dữ liệu thật
```

### 3.5. Verify dữ liệu sau restore

```bash
psql "$SUPABASE_URL" -c "
  SELECT 'users' AS table, COUNT(*) FROM core_user
  UNION ALL SELECT 'tasks', COUNT(*) FROM core_task
  UNION ALL SELECT 'reviews', COUNT(*) FROM core_review
  UNION ALL SELECT 'notifications', COUNT(*) FROM core_notification
  UNION ALL SELECT 'payments', COUNT(*) FROM payments_payment
  UNION ALL SELECT 'moderations', COUNT(*) FROM moderation_taskmoderation
  UNION ALL SELECT 'tracking', COUNT(*) FROM tracking_livelocation;
"
```

> So sánh với số liệu từ bước 0.3 — phải khớp hoàn toàn.

---

## 4. Chuyển Render sang DB mới (Zero-Downtime Switch)

### 4.1. Kế hoạch

Vì Render free tier chỉ có 1 web service, chiến lược là:

1. **Trước khi switch**: Đảm bảo Supabase đã có đầy đủ dữ liệu
2. **Switch**: Đổi `DATABASE_URL` trên Render Dashboard → Render tự động redeploy
3. **Sau khi switch**: Verify qua health check

Downtime dự kiến: **~2-3 phút** (thời gian Render redeploy).

### 4.2. Các bước thực hiện

#### Bước 1: Mở Render Dashboard

Truy cập https://dashboard.render.com/ → Chọn service `educarelink-backend`

#### Bước 2: Đổi DATABASE_URL

1. Vào **Environment** (sidebar trái)
2. Tìm `DATABASE_URL`
3. Click **Edit**
4. Đổi giá trị từ Neon URL sang Supabase URL:
   ```
   # CŨ (Neon)
   postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require

   # MỚI (Supabase)
   postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```
5. Click **Save Changes** → Render sẽ tự động redeploy

#### Bước 3: Chờ redeploy (~2-3 phút)

Theo dõi log tại **Logs** tab. Chờ thấy:
```
==> Deploying...
==> Build successful
==> Starting service...
```

#### Bước 4: Verify ngay

```bash
# Health check — phải trả về "ok"
curl https://educarelink-backend.onrender.com/api/health/

# Test login API
curl -X POST https://educarelink-backend.onrender.com/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"phuhuynh_congvinh","password":"Demo@2026"}'

# Nếu trả về JWT token → DB mới hoạt động!
```

#### Bước 5: Rollback (nếu có vấn đề)

Nếu health check trả về `"degraded"` hoặc login thất bại:

1. Quay lại Render Dashboard → **Environment**
2. Đổi `DATABASE_URL` về Neon URL cũ
3. Click **Save** → Render redeploy về DB cũ
4. Downtime tổng: ~5 phút (3 phút forward + 2 phút rollback)

> ✅ **Đảm bảo**: Neon DB cũ **KHÔNG XÓA** cho đến khi xác nhận Supabase chạy ổn định ít nhất 48 giờ.

---

## 5. Kiểm tra sau migrate

### 5.1. Health check tự động

```bash
# Chạy 5 lần liên tiếp để đảm bảo connection ổn định
for i in {1..5}; do
  echo "=== Test $i ==="
  curl -s https://educarelink-backend.onrender.com/api/health/ | python3 -m json.tool
  sleep 5
done
```

### 5.2. Kiểm tra từng chức năng

| Chức năng | Cách test | Kết quả mong đợi |
|---|---|---|
| Login | POST `/api/auth/login/` | JWT token |
| Parent home | Mở `/parent/` | Trang chủ phụ huynh |
| Worker feed | Mở `/worker/` | Danh sách việc |
| Admin dashboard | Mở `/admin-dashboard/` | Trang quản trị |
| AI chatbot | POST `/api/chatbot/` | Phản hồi AI |
| QR auto-login | Mở link QR | Đăng nhập tự động |
| Tracking | POST `/api/tracking/location/` | Cập nhật vị trí |
| Payments | GET `/api/payments/health/` | MoMo status |

### 5.3. Kiểm tra scheduler

```bash
# Keep-alive stats
curl -s https://educarelink-backend.onrender.com/api/admin/keepalive-stats/ \
  -H "Authorization: Bearer <ADMIN_JWT>" | python3 -m json.tool
```

### 5.4. Kiểm tra Supabase Dashboard

1. Vào https://supabase.com/ → Chọn project
2. **Table Editor**: Kiểm tra các bảng có dữ liệu
3. **Logs → Postgres**: Kiểm tra query log
4. **Reports**: Xem connection count, query performance

---

## 6. Dọn dẹp (SAU khi xác nhận ổn định 48h)

### 6.1. Xóa Neon project

1. Vào Neon Dashboard → Settings → Delete Project
2. Chọn **Delete all data**

### 6.2. Xóa dump files local

```bash
rm -f educarelink_neon_backup.dump educarelink_neon_backup.sql restore_log.txt
```

### 6.3. Merge nhánh safeguard/db-migration-prep vào main (nếu cần)

```bash
git checkout main
git merge safeguard/db-migration-prep
git push origin main
```

---

## 7. Xử lý sự cố

### Sự cố: `FATAL: password authentication failed`

**Nguyên nhân**: Sai mật khẩu hoặc sai connection string.

**Cách fix**:
1. Kiểm tra lại password trong Supabase Dashboard → Settings → Database
2. Đảm bảo dùng **Pooler URL** (port 6543) không phải Direct URL
3. Đảm bảo có `?sslmode=require` cuối URL

### Sự cố: `relation "core_user" does not exist`

**Nguyên nhân**: Migrate chưa chạy hoặc restore bị lỗi.

**Cách fix**:
```bash
# Chạy lại Django migrate trên Supabase
DATABASE_URL="$SUPABASE_URL" python manage.py migrate
DATABASE_URL="$SUPABASE_URL" python manage.py seed_demo_data
```

### Sự cố: `connection timeout` hoặc `could not connect to server`

**Nguyên nhân**: Supabase project đang ngủ (free tier).

**Cách fix**:
1. Vào Supabase Dashboard → ấn **Wake up**
2. Hoặc gọi API bất kỳ để trigger wake-up
3. Supabase free tier tự ngủ sau 1 tuần không activity — hãy cấu hình keep-alive ping

### Sự cố: `too many connections`

**Nguyên nhân**: Render free tier dùng 2 gunicorn workers, mỗi worker tạo nhiều connection.

**Cách fix**:
1. Đảm bảo dùng **Pooler URL** (port 6543) — Supabase pooler quản lý connection
2. Code đã cấu hình `conn_max_age=60` — connection được tái sử dụng
3. Nếu vẫn quá tải, giảm `WEB_CONCURRENCY` xuống 1 trong Render Dashboard

### Sự cố: Dữ liệu mất sau migrate

**Nguyên nhân**: `seed_demo_data` chạy trong build.sh và reset data.

**Cách fix**:
1. Trong Render Dashboard → thêm env var `SKIP_SEED=true`
2. Cập nhật `build.sh`:
   ```bash
   if [ "$SKIP_SEED" != "true" ]; then
     python manage.py seed_demo_data || echo "⚠️ seed_demo_data failed, continuing..."
   fi
   ```
3. Hoặc: sau khi switch, chạy restore lại dump file vào Supabase

---

## 8. Thông tin kỹ thuật

### Database config trong code

```python
# backend/settings.py — dòng 96-120
DATABASE_URL = os.environ.get('DATABASE_URL', '')

if DATABASE_URL and DATABASE_URL.startswith('postgres'):
    DATABASES = {
        'default': dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=60,       # Tái sử dụng connection 60 giây
            conn_health_checks=True # Tự kiểm tra connection trước khi dùng
        )
    }
```

### Health check endpoint

```python
# core/views.py — HealthCheckView
GET /api/health/
→ Kiểm tra DB connection bằng "SELECT 1"
→ Trả về {"status": "ok"/"degraded", "database": "connected"/"error"}
```

### Schedulers đã thêm close_old_connections

Tất cả 3 scheduler dùng DB đã được thêm `close_old_connections()` ở đầu mỗi job:
- `core/anomaly_scheduler.py` — chạy mỗi 10 phút
- `tracking/offline_scheduler.py` — chạy mỗi 1 phút
- `payments/scheduler.py` — chạy hàng ngày

### Connection string format

| Provider | Format |
|---|---|
| **Neon** | `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require` |
| **Supabase (Pooler)** | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require` |
| **Supabase (Direct)** | `postgresql://postgres.[ref]:[pass]@db.[ref].supabase.co:5432/postgres` |

> ⚠️ Luôn dùng **Pooler URL** cho ứng dụng production (connection pooling).

---

## 9. Checklist tóm tắt

- [ ] Verify health check Neon DB hiện tại: `curl /api/health/`
- [ ] Tạo Supabase project + lấy Pooler connection string
- [ ] Dump data từ Neon: `pg_dump ...`
- [ ] Backup dump file vào 2+ nơi
- [ ] Restore data vào Supabase: `pg_restore ...`
- [ ] Verify số bản ghi khớp giữa Neon và Supabase
- [ ] Đổi `DATABASE_URL` trên Render Dashboard
- [ ] Chờ Render redeploy (~2-3 phút)
- [ ] Verify health check trả về `"ok"` + `"connected"`
- [ ] Test login + QR auto-login
- [ ] Chờ 48 giờ xác nhận ổn định
- [ ] Xóa Neon project cũ
- [ ] Merge branch `safeguard/db-migration-prep` vào main
