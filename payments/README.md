# 💳 EduCareLink — Module Thanh toán MoMo

Module thanh toán mới được thêm vào dự án EduCareLink, hỗ trợ 2 luồng:

1. **MoMo Escrow** — Phụ huynh trả qua MoMo, tiền được giữ; khi Carepartner hoàn thành công việc → tự động giải ngân 80% cho Carepartner, 20% giữ lại làm hoa hồng nền tảng.
2. **Cash Settlement** — Phụ huynh trả tiền mặt cho Carepartner; sau mỗi task hoàn thành, 20% hoa hồng được tích lũy; cuối tháng hệ thống tự sinh QR MoMo gửi cho Carepartner để thanh toán cho nền tảng.

> **Quy tắc thiết kế:** KHÔNG sửa code hiện có. Module `payments` là Django app mới, tách biệt hoàn toàn. Tích hợp vào luồng Task hiện có bằng Django signals (post_save trên `core.Task`).

---

## 📁 Cấu trúc thư mục

```
payments/
├── __init__.py
├── apps.py                          # AppConfig + khởi động monthly scheduler
├── admin.py                         # Django admin registration
├── signals.py                       # Signal handler — trigger khi Task đổi status
├── models.py                        # Payment, CommissionSettlement, PaymentLog
├── momo_client.py                   # MoMo API wrapper (Pay App v2 + Refund + Transfer)
├── services.py                      # Business logic (setup_payment, release_escrow, ...)
├── serializers.py                   # DRF serializers
├── views.py                         # API views (15 endpoints)
├── urls.py                          # URL routing
├── scheduler.py                     # APScheduler — monthly settlement cron
├── migrations/
│   └── 0001_initial.py              # DB schema cho 3 bảng mới
└── management/
    └── commands/
        ├── run_monthly_settlement.py      # Trigger settlement thủ công
        ├── send_settlement_reminders.py   # Gửi reminder cho overdue
        └── test_momo_credentials.py       # Verify MoMo credentials
```

**Các file đã sửa (chỉ thêm, không đổi code cũ):**
- `backend/settings.py` — thêm `'payments'` vào INSTALLED_APPS + cấu hình `MOMO_*`
- `backend/urls.py` — thêm `include('payments.urls')`
- `requirements.txt` — comment mô tả (không thêm dependency mới)
- `render.yaml` — thêm env vars MoMo

---

## 🗄️ Database Schema

### `payments_payment`
Mỗi Task có 1 Payment (OneToOne). Lưu: amount, commission_rate, commission_amount, worker_payout_amount, method (momo_escrow | cash), status, momo_order_id, momo_trans_id, momo_pay_url, payout_request_id, ...

### `payments_commissionsettlement`
Tổng hợp hoa hồng Carepartner nợ nền tảng — 1 record / worker / tháng. Lưu: total_amount, total_tasks, task_ids (JSON), status, momo_qr_code_url, due_at, paid_at, ...

### `payments_paymentlog`
Audit trail — mọi event (payment_created, momo_ipn_held, escrow_released, settlement_qr_generated, ...). Có 18 loại event.

---

## 🔌 API Endpoints

Tất cả endpoints nằm dưới prefix `/api/payments/`.

### Parent (Phụ huynh)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/payments/setup/` | Thiết lập thanh toán cho task |
| GET | `/api/payments/<id>/` | Chi tiết 1 payment |
| GET | `/api/payments/my/` | List payments của user hiện tại |

**POST `/api/payments/setup/`** — Body:
```json
{ "task_id": 42, "method": "momo_escrow" }   // hoặc "cash"
```

Response:
```json
{
  "id": 1, "task": 42, "amount": "500000",
  "commission_amount": "100000", "worker_payout_amount": "400000",
  "method": "momo_escrow", "status": "pending",
  "momo_pay_url": "https://test-payment.momo.vn/...",
  "momo_qr_code_url": "https://...",
  "next_action": "redirect_to_momo",
  "momo_configured": true,
  "momo_sandbox": true
}
```

### Worker (Carepartner)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/payments/my-earnings/` | Tổng quan thu nhập |
| GET | `/api/payments/settlements/` | List kỳ thanh toán hoa hồng |
| GET | `/api/payments/settlements/<id>/` | Chi tiết kỳ + link QR |

**GET `/api/payments/my-earnings/`** — Response:
```json
{
  "total_earned": "1200000",          // Tổng đã nhận (escrow completed)
  "pending_payout": "300000",         // Đang giữ, chờ giải ngân
  "cash_commission_owed": "150000",   // Cần nộp cho nền tảng cuối tháng
  "recent_payments": [...]
}
```

### Admin

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/payments/admin/overview/` | Dashboard tổng quan |
| GET | `/api/payments/admin/all/` | Tất cả payments (filter ?status=&method=) |
| POST | `/api/payments/admin/<id>/retry-payout/` | Thử lại giải ngân thất bại |
| POST | `/api/payments/admin/settlements/<id>/regenerate-qr/` | Tạo lại QR |
| POST | `/api/payments/admin/run-settlement/` | Chạy monthly settlement thủ công |
| GET | `/api/payments/admin/logs/?payment_id=&settlement_id=` | Audit logs |

### MoMo Webhook (không auth — MoMo gọi)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/payments/momo-ipn/` | IPN callback từ MoMo |
| GET | `/api/payments/momo-return/` | Redirect browser sau khi pay |
| GET | `/api/payments/settlement-return/` | Redirect sau khi worker pay QR hoa hồng |
| GET | `/api/payments/health/` | Health check MoMo config (debug) |

---

## 🔄 Luồng hoạt động chi tiết

### Luồng 1: MoMo Escrow

```
1. Parent tạo Task
2. Worker ứng tuyển → Parent chấp nhận → Task status = 'in_progress'
3. Parent gọi POST /api/payments/setup/ { method: 'momo_escrow' }
   → Hệ thống gọi MoMo Pay App v2 → nhận payUrl
   → Frontend redirect parent tới payUrl
4. Parent pay trong MoMo app
5. MoMo gọi POST /api/payments/momo-ipn/ với resultCode=0
   → Payment.status = 'held', held_at = now()
   → Notify parent + worker
6. Worker làm việc xong → Parent gọi PATCH /api/tasks/<id>/status/ { status: 'completed' }
   → Signal post_save của Task trigger
   → Service release_escrow() gọi MoMo Transfer API
     → 80% (worker_payout_amount) gửi cho worker qua MoMo
     → 20% (commission_amount) giữ lại trong tài khoản đối tác
   → Payment.status = 'completed'
   → Notify parent + worker

— Nếu Task bị huỷ khi đang 'held' —
7. Parent gọi PATCH /api/tasks/<id>/status/ { status: 'cancelled' }
   → Signal trigger refund_escrow()
   → MoMo Refund API hoàn 100% cho parent
   → Payment.status = 'refunded'
```

### Luồng 2: Cash Settlement

```
1. Parent tạo Task + Worker ứng tuyển + Parent chấp nhận → in_progress
2. Parent gọi POST /api/payments/setup/ { method: 'cash' }
   → Tạo Payment record, không gọi MoMo
3. Parent trả tiền mặt trực tiếp cho Worker
4. Worker làm việc xong → Parent gọi PATCH /api/tasks/<id>/status/ { status: 'completed' }
   → Signal trigger _record_cash_completion()
   → Payment.status = 'completed'
   → Notify worker: "Hoa hồng X VNĐ sẽ tổng hợp cuối tháng"

— Cuối tháng (cron ngày 1 hàng tháng 9h00) —
5. generate_monthly_settlements() chạy
   → Gom tất cả Payment method='cash' status='completed' của tháng trước
   → Group theo worker → tính tổng commission_amount
   → Tạo CommissionSettlement record
   → Gọi MoMo Pay App v2 sinh QR cho worker quét
   → Notify worker: "Tổng hoa hồng tháng X: Y VNĐ. Hạn thanh toán: +7 ngày. Quét QR..."

6. Worker mở app → xem settlement → quét QR → pay
7. MoMo gọi /api/payments/momo-ipn/ với orderId của settlement
   → _handle_settlement_ipn()
   → Settlement.status = 'paid', paid_at = now()
   → Notify worker

— Nếu quá hạn due_at mà chưa pay —
8. Cron nhắc nhở hàng ngày 9h05
   → Settlement.status = 'overdue'
   → Notify worker nhắc nhở
```

---

## ⚙️ Setup

### 1. Cài đặt dependencies

Không cần thêm package — module chỉ dùng `requests` (đã có sẵn trong `requirements.txt`).

### 2. Cấu hình biến môi trường

Copy `.env.example` → `.env` và điền MoMo credentials:

```bash
cp .env.example .env
```

```env
MOMO_ENVIRONMENT=sandbox              # sandbox | production
MOMO_PARTNER_CODE=<your_partner_code>
MOMO_ACCESS_KEY=<your_access_key>
MOMO_SECRET_KEY=<your_secret_key>
MOMO_STORE_ID=EduCareLinkStore
MOMO_RETURN_BASE_URL=http://localhost:8000    # URL frontend
MOMO_IPN_URL=http://localhost:8000/api/payments/momo-ipn/
PAYMENT_COMMISSION_RATE=0.20          # 20% hoa hồng
PAYMENT_SETTLEMENT_DUE_DAYS=7         # Hạn thanh toán QR
PAYMENT_SCHEDULER_ENABLED=false       # Bật true trên production
```

**Lấy MoMo credentials:**
- Đăng ký tại https://business.momo.vn/
- Sau khi được duyệt, vào Dashboard → "Thông tin tài khoản" → lấy Partner Code, Access Key, Secret Key
- Test credentials công khai (MOMO/F8BBA842ECF85/K951B6PE1waDMi640xX08PD1lg5kvbbc) có thể đã bị MoMo vô hiệu hoá — **nên đăng ký business riêng**

### 3. Chạy migration

```bash
python manage.py migrate payments
```

### 4. Test credentials

```bash
python manage.py test_momo_credentials
```

Nếu thấy `✅ MoMo credentials are working!` → OK.
Nếu thấy `❌ Chữ ký không hợp lệ` → kiểm tra lại credentials hoặc environment.

### 5. Test IPN local (optional)

Khi chạy local, MoMo không thể gọi đến `localhost`. Dùng [ngrok](https://ngrok.com) hoặc [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
# Terminal 1: chạy Django
python manage.py runserver 0.0.0.0:8000

# Terminal 2: tunnel public
ngrok http 8000
# → nhận URL như https://abc123.ngrok-free.app

# Cập nhật .env:
# MOMO_RETURN_BASE_URL=https://abc123.ngrok-free.app
# MOMO_IPN_URL=https://abc123.ngrok-free.app/api/payments/momo-ipn/
```

### 6. Chạy monthly settlement thủ công

```bash
# Tổng hợp tháng trước
python manage.py run_monthly_settlement

# Tổng hợp kỳ cụ thể
python manage.py run_monthly_settlement --year 2025 --month 11
```

---

## 🎯 Tích hợp frontend

### Mobile app (React Native/Expo)

```javascript
// Sau khi parent approve candidate:
const setupPayment = async (taskId, method) => {
  const token = await AsyncStorage.getItem('token');
  const resp = await fetch(`${API_BASE}/api/payments/setup/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ task_id: taskId, method }),
  });
  const data = await resp.json();
  
  if (method === 'momo_escrow' && data.momo_pay_url) {
    // Mở MoMo app hoặc web MoMo
    Linking.openURL(data.momo_pay_url);
  } else if (method === 'cash') {
    Alert.alert('Đã ghi nhận', 'Công việc sẽ thanh toán tiền mặt');
  }
};
```

```javascript
// Carepartner xem earnings + settlements:
const fetchEarnings = async () => {
  const resp = await fetch(`${API_BASE}/api/payments/my-earnings/`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return resp.json();
};

const fetchSettlements = async () => {
  const resp = await fetch(`${API_BASE}/api/payments/settlements/`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return resp.json();
  // Mỗi settlement có momo_qr_code_url — hiển thị QR cho worker quét
};
```

### Web (Django template)

Module này chỉ là backend API. Frontend template cần tự thêm trang:
- `/parent/payment-setup/?task_id=X` — chọn momo_escrow | cash
- `/worker/earnings/` — xem earnings + settlements
- `/worker/settlements/<id>/` — xem chi tiết kỳ + QR

---

## 🔒 Bảo mật

- **MoMo IPN webhook** (`/api/payments/momo-ipn/`) không yêu cầu JWT auth (MoMo gọi server-to-server), nhưng **verify signature** HMAC-SHA256 để chống giả mạo.
- **Admin endpoints** yêu cầu `IsAdminUser` (superuser).
- **Parent/Worker endpoints** yêu cầu `IsAuthenticated`, filter theo `request.user` để không leak data chéo.
- **Commission rate** được lưu trong DB theo từng Payment (chống thay đổi retroactive — nếu sau này đổi rate, payment cũ vẫn giữ rate cũ).
- **Audit log**: mọi thao tác đều có PaymentLog để truy vết.

---

## 🐛 Troubleshooting

| Vấn đề | Nguyên nhân | Cách xử lý |
|--------|-------------|------------|
| `Momo credentials chưa cấu hình` | Thiếu env vars | Kiểmtra `.env` hoặc Render env vars |
| `Chữ ký không hợp lệ` | Sai secret_key hoặc test credentials bị MoMo vô hiệu | Đăng ký business riêng tại https://business.momo.vn/ |
| `payout_failed` status | MoMo Transfer API yêu cầu đối tác đăng ký Payout Service riêng | Đăng ký thêm Payout Service với MoMo, hoặc Admin retry sau khi fix |
| IPN không đến server | Local dev không public | Dùng ngrok/cloudflared tunnel |
| Monthly settlement không chạy | `PAYMENT_SCHEDULER_ENABLED=false` hoặc không phải Render | Chạy `python manage.py run_monthly_settlement` thủ công |
| QR không hiển thị | MoMo chưa trả qrCodeUrl | Dùng `momo_pay_url` thay thế (deep link mở MoMo app) |

---

## 📊 Test

Chạy integration test end-to-end:

```bash
DEBUG=True python test_payment_flow.py
```

Test sẽ tạo DB test, tạo user/task mẫu, đi qua cả 2 luồng (cash + escrow), và verify:
- Commission tính đúng (20%)
- Task completed → payment completed (cash) / payout_failed (escrow khi MoMo chưa config)
- Monthly settlement tạo được CommissionSettlement record
- IPN handler chuyển status đúng
- Admin overview API hoạt động

Lưu ý: Test KHÔNG gọi được MoMo sandbox thật vì test credentials công khai đã bị MoMo vô hiệu. Để test end-to-end với MoMo thật, cần đăng ký business riêng.

---

## 📚 Tham khảo

- [MoMo Pay App v2 docs](https://developers.momo.vn/v3/vi/docs/payment/app/app-in-app/payment-link)
- [MoMo Refund API](https://developers.momo.vn/v3/vi/docs/payment/app/app-in-app/refund)
- [MoMo Payout Service](https://developers.momo.vn/v3/vi/docs/payment/payout)
- [MoMo Business Dashboard](https://business.momo.vn/)

---

*Bổ sung bởi module `payments` — không sửa code cũ, chỉ thêm Django app mới + signals.*
