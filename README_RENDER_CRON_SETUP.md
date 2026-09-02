# Render Cron Job Setup — `educarelink-tracking-scheduler`

> Tài liệu hướng dẫn config Render Cron Job cho tracking scheduler.
> Bắt buộc đọc + làm theo **TRƯỚC KHI** bấm nút deploy backend lên Render.

## Bối cảnh

Tính năng an toàn CarePartner (offline detection + random PIN verification) tách
scheduler khỏi web service thành 1 Render Cron Job riêng, chạy mỗi 1 phút:

```bash
python manage.py run_tracking_schedulers --once --only both
```

Render Cron Job là 1 service type độc lập → **KHÔNG tự inherit env vars từ
web service**. Nếu thiếu env vars → scheduler silent fail → tính năng an toàn
bị gãy mà không có alert.

## Các bước setup (5 bước)

### Bước 1: Mở Render Dashboard

- Vào https://dashboard.render.com → chọn project `educarelink-backend`.
- Nếu Cron Job `educarelink-tracking-scheduler` chưa có (do Render Blueprint
  chưa sync), Render sẽ tự tạo từ `render.yaml` khi first deploy từ main branch.
  Đợi 1-2 phút sau first deploy để Cron Job xuất hiện.

### Bước 2: Lấy env vars từ web service

- Click vào web service `educarelink-backend` (không phải Cron Job).
- Vào tab **Environment**.
- Tìm 2 vars sau, copy giá trị (không share cho ai ngoài team dev):
  - `SECRET_KEY` — Django secret key, dùng cho JWT signing + crypto.
  - `DATABASE_URL` — PostgreSQL connection string, format
    `postgresql://user:pass@host:5432/dbname`.

### Bước 3: Set env vars cho Cron Job

- Quay lại project overview → click vào Cron Job `educarelink-tracking-scheduler`.
- Vào tab **Environment**.
- Thêm/sửa 2 vars sau với **đúng giá trị copy từ web service**:
  - `SECRET_KEY` = `<paste từ web service>`
  - `DATABASE_URL` = `<paste từ web service>`
- Verify thêm các vars sau đã có (Render Blueprint tự set từ `render.yaml`):
  - `RENDER` = `true`
  - `TRACKING_SCHEDULER_PROCESS` = `cron`
  - `TRACKING_OFFLINE_CHECK_ENABLED` = `true`
  - `TRACKING_OFFLINE_THRESHOLD` = `60`
  - `TRACKING_HEARTBEAT_INTERVAL` = `30`
  - `VERIFICATION_INTERVAL_MIN` = `300`
  - `VERIFICATION_INTERVAL_MAX` = `600`
  - `VERIFICATION_RESPOND_TIMEOUT` = `90`
  - `TRACKING_SCHEDULER_HEALTH_LOG_EVERY` = `5`
- Click **Save Changes**.

### Bước 4: Đợi Cron chạy lần tiếp theo (≤ 1 phút)

- Render Cron Job expression là `* * * * *` (mỗi 1 phút).
- Sau khi Save env vars, đợi tối đa 60s để cron trigger.
- Vào tab **Events** hoặc **Logs** của Cron Job để xác nhận có log line mới
  kiểu `Running scheduled job...`.

### Bước 5: Verify scheduler-health endpoint

```bash
bash verify_render_env.sh
```

Hoặc gọi API trực tiếp:

```bash
curl -s https://educarelink-backend.onrender.com/api/tracking/scheduler-health/ | python3 -m json.tool
```

**Response mong đợi:**

```json
{
  "status": "ok",
  "scheduler": "tracking",
  "last_run_at": "2026-08-16T07:30:00Z",
  "next_run_in_seconds": 45,
  "offline_check_enabled": true,
  "offline_threshold_seconds": 60,
  "verification_enabled": true
}
```

→ Nếu `status` = `"ok"` → ✅ Setup thành công, sẵn sàng deploy.

## Troubleshooting

Nếu `status` khác `"ok"`, tham khảo bảng nguyên nhân trong
`verify_render_env.sh` (output khi chạy script sẽ list đầy đủ).

### Tóm tắt nguyên nhân phổ biến

| # | Nguyên nhân | Cách fix |
|---|---|---|
| 1 | Thiếu `SECRET_KEY` hoặc `DATABASE_URL` trong Cron Job | Copy từ web service → set vào Cron Job env |
| 2 | `DATABASE_URL` sai / DB không kết nối | Copy đúng URL từ web service (cùng Supabase PostgreSQL) |
| 3 | `SECRET_KEY` không khớp với web service | Copy đúng key từ web service |
| 4 | `TRACKING_OFFLINE_CHECK_ENABLED=false` | Set `=true` trong Cron Job env |
| 5 | Cron schedule expression sai | Phải là `* * * * *` (mỗi 1 phút) |
| 6 | Cron Job crash trước khi set health | Xem Cron Job Logs → tìm Python traceback → re-deploy |

## Kiểm tra nhanh Cron Job Logs

- Render Dashboard → Cron Job → tab **Logs**.
- Tìm các log line quan trọng:
  - `Running scheduled job...` — cron đã trigger.
  - `Checked N devices, M offline alerts sent` — offline detection chạy.
  - `Created N verification checks` — random PIN check chạy.
  - `OperationalError` / `Traceback` — có lỗi, cần fix.
- Nếu không thấy log mới sau 2 phút → Cron Job chưa chạy hoặc env vars sai.

## Safety net

Nếu Cron Job fail silent (không có log, không có alert), tính năng an toàn sẽ
không hoạt động nhưng **không ảnh hưởng** tới:

- Web service (vẫn chạy bình thường).
- Đăng nhập / chatbot / payment / moderation.
- Mobile app cơ bản.

Chỉ mất:
- Cảnh báo khi Carepartner tắt máy / mất kết nối > 60s.
- Random PIN verification (anti-mock-GPS bypass).

→ Phụ huynh có thể không nhận alert khẩn cấp khi có sự cố thật. **Bắt buộc
verify scheduler-health trước khi coi như deploy an toàn.**
