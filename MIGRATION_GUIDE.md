# 🚚 Hướng dẫn migrate EduCareLink từ Neon → Supabase

> **Tại sao?** Neon free tier có giới hạn compute hours (DB bị pause khi idle). Supabase free tier ổn định hơn, cộng thêm 1GB Storage để lưu ảnh CCCD/bằng cấp (fix bug ảnh bị xóa mỗi lần Render redeploy).

> **An toàn như thế nào?** Supabase cũng là PostgreSQL → schema/migration/code KHÔNG đổi. Chỉ đổi `DATABASE_URL`. Có rollback bất cứ lúc nào.

---

## 📋 Checklist tổng quan

- [ ] **Phase 1** — Tạo Supabase project + lấy connection string
- [ ] **Phase 2** — Check dung lượng Neon hiện tại
- [ ] **Phase 3** — Dump data từ Neon
- [ ] **Phase 4** — Load data vào Supabase + verify
- [ ] **Phase 5** — Cập nhật DATABASE_URL trên Render
- [ ] **Phase 6** — Verify production + smoke test API
- [ ] **Phase 7** — (Optional) Tích hợp Supabase Storage cho ảnh

---

## Phase 1 — Tạo Supabase project (2 phút)

1. Vào https://supabase.com → Sign in bằng GitHub
2. **New Project** → Đặt tên `educarelink` → Chọn region gần user VN (Singapore `ap-southeast-1`)
3. Tạo strong database password (lưu lại vào password manager!)
4. Chờ ~2 phút cho project provision xong
5. Vào **Project Settings → Database → Connection string**
6. Copy **Session pooler** URI (dạng `postgresql://postgres.xxxx:pass@aws-0-region.pooler.supabase.com:5432/postgres`)

> ⚠️ Dùng **Session pooler** (port 5432 hoặc 6543), KHÔNG dùng Direct connection — pooler chịu tải tốt hơn và Django settings đã auto-tắt prepared statements khi gặp URL supabase/pooler.

---

## Phase 2 — Check dung lượng Neon hiện tại

```bash
# Set biến env Neon (lấy từ Render Dashboard → Environment Variables → DATABASE_URL)
export DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"

# Chạy script check
python check_db_quota.py
```

Script sẽ in ra: tổng size, top bảng lớn, số row, % dùng so với 512MB.

---

## Phase 3 — Dump data từ Neon

```bash
# Vẫn để DATABASE_URL = Neon
export DATABASE_URL="<neon_url>"

# Dump
python migrate_neon_to_supabase.py dump
```

→ Tạo file `backup_neon_dump.json` chứa toàn bộ data.

---

## Phase 4 — Load vào Supabase + verify

```bash
# Đổi DATABASE_URL sang Supabase
export DATABASE_URL="<supabase_pooler_url>"

# 4a. Tạo schema (chạy migrations)
python manage.py migrate

# 4b. Load data
python migrate_neon_to_supabase.py load

# 4c. Verify số dòng khớp Neon
python migrate_neon_to_supabase.py verify
```

Kiểm tra output: số row mỗi bảng phải khớp với Phase 2.

---

## Phase 5 — Flip DATABASE_URL trên Render

1. Render Dashboard → Service `educarelink-backend` → **Environment**
2. Sửa `DATABASE_URL` → dán Supabase Session pooler URL
3. **Save Changes** → Render tự redeploy (~2-3 phút)
4. Trong log deploy, đảm bảo thấy `migrate` chạy thành công

---

## Phase 6 — Verify production

```bash
# API health check
curl https://educarelink-backend.onrender.com/api/health/
# Mong đợi: {"status":"ok","database":"connected"}

# Test 1 endpoint có data
curl -X POST https://educarelink-backend.onrender.com/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<admin_password>"}'
```

Vào web/mobile, đăng nhập = các tài khoản demo cũ → phải thấy dữ liệu như trước.

---

## Phase 7 — (Tùy chọn) Supabase Storage cho ảnh

Bug hiện tại: ảnh CCCD/bằng cấp lưu ở `media/` trên Render disk ephemeral → **bị xóa mỗi lần redeploy**.

Giải pháp: dùng Supabase Storage (private bucket) để lưu ảnh vĩnh viễn.

(Bước này làm sau khi migrate DB thành công — không gộp để rủi ro thấp.)

---

## 🔄 Rollback (nếu lỗi)

Nếu Supabase có vấn đề gì, rollback trong 30 giây:

1. Render Dashboard → Environment → `DATABASE_URL` → dán lại Neon URL cũ
2. Save → redeploy
3. Neon data không bị ảnh hưởng trong suốt quá trình (chỉ read)

---

## ❓ FAQ

**Q: Mất data không?**
A: Không. Quá trình trên chỉ READ từ Neon + WRITE vào Supabase. Neon nguyên vẹn cho đến khi bạn chủ động xoá.

**Q: Mất thời gian downtime không?**
A: Có, khoảng 2-3 phút trong lúc Render redeploy ở Phase 5. Chọn giờ ít user (đêm).

**Q: Code đổi gì không?**
A: Không. Đã sửa `settings.py` ở branch này để auto-hỗ trợ Supabase pooler (tắt prepared statements). Còn lại model/migration/view y hệt.
