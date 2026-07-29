# PayOS Complete — Branch `feature/payos-complete`

**Ngày**: 2026-07-30  
**Mục tiêu**: Hoàn thiện tích hợp thanh toán PayOS (VietQR) cho EduCareLink.

---

## Đã có sẵn trên main (trước branch này)

| Thành phần | Trạng thái |
|---|---|
| `payments/payos_client.py` | ✅ SDK wrapper đầy đủ |
| Model fields PayOS | ✅ Migration `0002_add_payos_fields` |
| API `POST /api/payments/payos-setup/` | ✅ |
| API `POST /api/payments/payos-webhook/` | ✅ verify HMAC |
| Return / Cancel redirect | ✅ |
| Confirm webhook (admin) | ✅ |
| Mobile `setupPayOS()` + UI | ✅ |
| Escrow complete / refund PayOS | ✅ (admin manual transfer) |
| `requirements.txt` → `payos==1.1.0` | ✅ |
| Settings env vars | ✅ |

---

## Thay đổi trên branch này

### 1. `payments/services.py`
- `setup_payment(method='payos')` **tạo payment link PayOS** ngay trong luồng setup thống nhất
- Ghi log `payos_link_created` / `payos_link_failed`
- Không phá flow MoMo / cash

### 2. Unified setup (đã support trong serializer)
```json
POST /api/payments/setup/
{ "task_id": 42, "method": "payos" }
```
→ Response có `payos_checkout_url` khi credentials OK.

Hoặc dùng endpoint riêng (mobile đang dùng):
```json
POST /api/payments/payos-setup/
{ "task_id": 42 }
```

### 3. Còn cần **bạn** làm để go-live

1. Đăng ký PayOS cá nhân: https://my.payos.vn/register  
2. Lấy 3 keys → set trên **Render** env:
   ```
   PAYOS_CLIENT_ID=...
   PAYOS_API_KEY=...
   PAYOS_CHECKSUM_KEY=...
   ```
3. Admin gọi 1 lần:
   ```
   POST /api/payments/payos-confirm-webhook/
   { "webhook_url": "https://educarelink-backend.onrender.com/api/payments/payos-webhook/" }
   ```
4. Kiểm tra:
   ```
   GET /api/payments/health/
   → { "payos_enabled": true }
   ```
5. Merge PR `feature/payos-complete` → `main` (sau khi review)

---

## Luồng thanh toán PayOS

```
1. Parent approve Carepartner → task = in_progress
2. Parent chọn PayOS → tạo checkout_url / QR VietQR
3. Parent quét QR app ngân hàng → chuyển khoản
4. PayOS webhook PAID → Payment.status = held (escrow)
5. Task completed → Payment.status = completed
   → Admin manual transfer 80% cho Carepartner (STK ngân hàng)
6. Task cancelled khi held → status = refunded
   → Admin manual hoàn tiền parent
```

**Lưu ý**: Auto payout/refund cần PayOS Payout + KYC doanh nghiệp — hiện admin xử lý thủ công.

---

## Test checklist (sau khi có credentials)

- [ ] `GET /api/payments/health/` → `payos_enabled: true`
- [ ] `POST /api/payments/payos-setup/` với task in_progress → nhận `checkout_url`
- [ ] Quét QR thật (sandbox/prod) → webhook → status `held`
- [ ] Complete task → notify admin + worker
- [ ] Cancel task khi held → notify admin refund
- [ ] Mobile PaymentSetupScreen chọn PayOS → mở browser/checkout

---

*Branch: `feature/payos-complete`*
