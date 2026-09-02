# 🔍 PAYOS REVIEW — Checklist cho AI Agents

> Tài liệu này dành cho các AI Agent khác review code PayOS integration trước khi merge vào `main`.

---

## 📋 Tổng quan

| Thông tin | Giá trị |
|---|---|
| **Branch** | `feature/payos-integration` |
| **Target** | `main` |
| **Mục đích** | Thêm PayOS (VietQR bank transfer) như method thanh toán thứ 2, song song MoMo |
| **Trạng thái** | ⏳ Đã implement, chờ user cung cấp credentials để test go-live |
| **Reviewer** | Bất kỳ AI Agent nào có quyền truy cập repo |

---

## 🎯 Scope thay đổi

### Files mới (2 files)
- `payments/payos_client.py` — PayOS SDK wrapper (Python)
- `PAYOS_SETUP.md` — Checklist cho user

### Files sửa (8 files)
- `payments/models.py` — Thêm PayOS fields vào Payment model + method='payos'
- `payments/migrations/0002_add_payos_fields.py` — Migration mới
- `payments/serializers.py` — Thêm PayOS fields vào PaymentSerializer + SetupPaymentSerializer
- `payments/services.py` — Thêm `_record_payos_completion()`, update `setup_payment()`, `release_escrow()`, `refund_escrow()`, `on_task_status_changed()`
- `payments/views.py` — Thêm 5 PayOS endpoints
- `payments/urls.py` — Thêm 5 PayOS URL routes
- `backend/settings.py` — Thêm PayOS config vars
- `requirements.txt` — Thêm `payos==1.1.0`

### Files mobile (2 files)
- `mobile/src/api/payments.js` — Thêm `setupPayOS()`, `confirmPayOSWebhook()`
- `mobile/src/screens/Payment/PaymentSetupScreen.js` — Thêm PayOS option + flow

---

## 🔍 Review Checklist

### ✅ 1. Backend — Payment Model (`payments/models.py`)

- [ ] Thêm `method='payos'` vào `METHOD_CHOICES`
- [ ] Thêm 5 PayOS fields: `payos_order_code`, `payos_checkout_url`, `payos_payment_link_id`, `payos_status`, `payos_account_reference`
- [ ] Update `STATUS_CHOICES` description để mention PayOS
- [ ] Migration `0002_add_payos_fields.py` OK

### ✅ 2. Backend — PayOS Client (`payments/payos_client.py`)

- [ ] `_get_payos_client()` — singleton, lazy init
- [ ] `is_payos_enabled()` — check credentials configured
- [ ] `create_payment_link()` — tạo QR/checkout URL
- [ ] `verify_webhook()` — verify HMAC signature từ PayOS
- [ ] `get_payment_link_info()` — check payment status
- [ ] `cancel_payment_link()` — hủy payment link khi task hủy
- [ ] `confirm_webhook()` — register webhook URL với PayOS
- [ ] `create_payout()` — placeholder (chưa support auto payout)
- [ ] Error handling: return None nếu lỗi, không raise exception
- [ ] Logging đầy đủ

### ✅ 3. Backend — Views (`payments/views.py`)

- [ ] `PayOSSetupAPIView` — POST `/api/payments/payos-setup/`
  - Check `is_payos_enabled()` → 503 nếu chưa config
  - Check task ownership + status
  - Tạo payment link qua `create_payment_link()`
  - Update Payment record + PayOS fields
  - Log event `payos_link_created`
- [ ] `PayOSWebhookAPIView` — POST `/api/payments/payos-webhook/`
  - AllowAny permission (PayOS gọi server-to-server)
  - Verify webhook qua `verify_webhook()`
  - Update payment status: PAID → 'held', CANCELLED → 'cancelled'
  - Notify parent + worker via Notification + Expo push
  - Log events
- [ ] `PayOSReturnAPIView` — GET `/api/payments/payos-return/`
  - Redirect parent về frontend sau khi pay
- [ ] `PayOSCancelAPIView` — GET `/api/payments/payos-cancel/`
  - Redirect parent khi hủy
- [ ] `PayOSConfirmWebhookAPIView` — POST `/api/payments/payos-confirm-webhook/`
  - Admin only — register webhook URL

### ✅ 4. Backend — Services (`payments/services.py`)

- [ ] `setup_payment()` — accept method='payos'
- [ ] `release_escrow()` — handle payos: gọi `_record_payos_completion()`
- [ ] `_record_payos_completion()` — mark completed, notify worker + parent + admin
- [ ] `refund_escrow()` — handle payos: mark refunded, notify admin manual transfer
- [ ] `on_task_status_changed()` — handle payos cho cả completed + cancelled

### ✅ 5. Backend — URLs + Settings

- [ ] 5 URL routes thêm vào `payments/urls.py`
- [ ] Settings: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_BASE_URL`, `PAYOS_WEBHOOK_URL`, `PAYOS_ENABLED`
- [ ] `requirements.txt`: `payos==1.1.0`

### ✅ 6. Mobile — API + Screen

- [ ] `mobile/src/api/payments.js` — thêm `setupPayOS()`, `confirmPayOSWebhook()`
- [ ] `PaymentSetupScreen.js` — thêm PayOS option với badge "MIỄN PHÍ"
- [ ] PayOS flow: gọi `setupPayOS()` → mở `checkout_url` → alert
- [ ] Sync với web (theo SYNC_PRINCIPLE.md)

### ✅ 7. Security

- [ ] Webhook verify HMAC signature (không trust raw body)
- [ ] `PayOSSetupAPIView` — IsAuthenticated + check task ownership
- [ ] `PayOSConfirmWebhookAPIView` — IsAdminUser
- [ ] `PayOSWebhookAPIView` — AllowAny nhưng verify signature
- [ ] Credentials không hardcode — dùng env vars

### ✅ 8. Error Handling

- [ ] PayOS chưa config → 503 + fallback message
- [ ] PayOS API fail → 500 + log
- [ ] Webhook verify fail → 400
- [ ] Payment not found → 404
- [ ] Task không in_progress → 400

### ✅ 9. Sync với SYNC_PRINCIPLE.md

- [ ] Web có PayOS → Mobile cũng có PayOS ✅
- [ ] Cùng API endpoint ✅
- [ ] Cùng payment flow (approve → QR → escrow → payout) ✅

### ✅ 10. Không phá vỡ MoMo hiện tại

- [ ] MoMo escrow flow vẫn hoạt động bình thường
- [ ] Cash flow vẫn hoạt động
- [ ] PayOS là method THỨ 3 (thêm vào, không thay thế)
- [ ] Migration không drop field nào

---

## 🧪 Test Cases (chạy sau khi có credentials)

### Test 1: PayOS disabled (chưa config)
```
GET /api/payments/health/
→ { "payos_enabled": false }
```

### Test 2: PayOS enabled (sau khi config)
```
GET /api/payments/health/
→ { "payos_enabled": true }
```

### Test 3: Tạo payment link
```
POST /api/payments/payos-setup/
{ "task_id": 123 }
→ 200 { "checkout_url": "https://payos.vn/...", "order_code": 123... }
```

### Test 4: Webhook PAID
```
POST /api/payments/payos-webhook/
{ "data": { "orderCode": 123..., "amount": 200000, "status": "PAID" } }
→ 200 { "status": "ok" }
→ Payment.status = 'held'
```

### Test 5: Webhook CANCELLED
```
POST /api/payments/payos-webhook/
{ "data": { "orderCode": 123..., "status": "CANCELLED" } }
→ 200 { "status": "ok" }
→ Payment.status = 'cancelled'
```

### Test 6: Task completed → payout
```
PATCH /api/tasks/123/status/
{ "status": "completed" }
→ Payment.status = 'completed' (admin manual transfer)
→ Worker nhận notification
→ Admin nhận notification "Cần chuyển tiền"
```

### Test 7: Task cancelled → refund
```
PATCH /api/tasks/123/status/
{ "status": "cancelled" }
→ Payment.status = 'refunded' (admin manual refund)
→ Parent nhận notification "Hoàn tiền đang xử lý"
→ Admin nhận notification "Cần hoàn tiền"
```

### Test 8: Mobile flow
```
1. Parent approve carepartner
2. Open PaymentSetupScreen
3. Select "PayOS VietQR" → submit
4. App mở checkout_url trong browser
5. Parent quét QR VietQR bằng app ngân hàng
6. PayOS webhook → Payment.status = 'held'
7. Carepartner làm việc xong → parent mark completed
8. Payment.status = 'completed' → admin transfer cho carepartner
```

---

## 🚨 Known Limitations

### 1. Auto Payout chưa support
- **Vấn đề**: PayOS Payout API cần KYC doanh nghiệp
- **Workaround**: Admin manual transfer cho carepartner
- **Future**: Khi có KYC DN → implement `create_payout()` trong `payos_client.py`

### 2. Auto Refund chưa support
- **Vấn đề**: PayOS không có refund API native
- **Workaround**: Admin manual transfer ngược lại parent
- **Future**: Implement qua Payout API (cần KYC DN)

### 3. Webhook URL phải public
- **Vấn đề**: PayOS gọi webhook server-to-server → cần URL public
- **Solution**: Render production URL `https://educarelink-backend.onrender.com/api/payments/payos-webhook/`
- **Local dev**: Cần ngrok hoặc cloudflared tunnel

---

## 📊 So sánh PayOS vs MoMo (sau khi merge)

| Tiêu chí | MoMo | PayOS |
|---|---|---|
| **Phí** | 1.5% + 2K/GD | **0đ** ✅ |
| **KYC** | DN phức tạp | **CCCD cá nhân** ✅ |
| **Setup time** | 1-2 tuần | **5 phút** ✅ |
| **Escrow** | ✅ Native | ✅ Backend tự giữ |
| **Auto payout** | ✅ Native | ❌ Manual (cần KYC DN) |
| **Auto refund** | ✅ Native | ❌ Manual |
| **Brand VN** | Cực mạnh | Trung bình |

---

## ✅ Sign-off

Reviewer: _________________
Date: _________________
Verdict: [ ] APPROVE → merge vào main
         [ ] REQUEST CHANGES → list issues below

Issues (nếu có):
1. _________________________________
2. _________________________________
3. _________________________________

---

*File này được tạo bởi QA Agent (Super Z) — branch `feature/payos-integration`*
*Review xong → comment trên GitHub PR hoặc edit file này với verdict*
