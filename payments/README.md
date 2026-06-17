# Module Payments — MoMo + Escrow + Commission 20%

> Module thanh toán mới được thêm vào EduCareLink để hỗ trợ 2 luồng:
> 1. **Thanh toán qua MoMo (escrow)**: Phụ huynh trả MoMo → hệ thống giữ tiền → khi task hoàn thành, tự động chia 80% cho Carepartner + 20% cho Admin.
> 2. **Thanh toán tiền mặt**: Phụ huynh trả tay cho Carepartner → hệ thống ghi nợ 20% hoa hồng → cuối tháng tổng hợp + gửi QR VietQR để Carepartner thanh toán cho Admin.

Module này **KHÔNG sửa code hiện tại** — chỉ thêm app mới `payments` + đăng ký signal trên `core.Task` để trigger logic.

---

## 1. CẤU TRÚC MODULE

```
payments/
├── apps.py                          # AppConfig + start commission scheduler
├── models.py                        # 5 model: Wallet, PaymentOrder, EscrowTransaction,
│                                    #          CommissionDebt, MonthlyCommissionStatement
├── signals.py                       # pre_save + post_save trên core.Task
│                                    #   - Tự tạo PaymentOrder khi task mới
│                                    #   - Trigger release escrow khi status=completed
│                                    #   - Trigger refund khi status=cancelled
├── commission_scheduler.py          # Cron ngày 1 hàng tháng (8h) + hằng ngày (9h)
│
├── services/
│   ├── momo_service.py              # MoMo Payment Gateway v2 (create + IPN verify + Disbursement)
│   ├── escrow_service.py            # Logic phân tiền 80/20 khi task completed
│   ├── commission_service.py        # Logic ghi nợ + tổng hợp + gửi QR cuối tháng
│   └── vietqr_service.py            # Sinh URL ảnh QR VietQR.io
│
├── serializers.py
├── views.py                         # 17 API endpoints
├── urls.py                          # Mount tại /api/payments/
├── admin.py                         # 5 model đăng ký trong Django Admin
├── migrations/0001_initial.py
└── tests.py
```

---

## 2. CÁC MODEL MỚI

### Wallet — Ví nội bộ của user
Mỗi user (parent/worker/admin) có 1 Wallet với:
- `balance` — số dư khả dụng (worker có thể rút về MoMo)
- `held_balance` — tiền bị phong tỏa (parent đã trả MoMo, chờ task hoàn thành)
- `momo_phone` — SĐT MoMo để nhận tiền giải ngân
- `bank_account_number` + `bank_code` + `bank_account_name` — fallback cho VietQR

### PaymentOrder — Đơn thanh toán (1-1 với Task)
- `payment_method`: `momo` hoặc `cash` (mặc định `cash` khi task mới tạo)
- `status`: `pending` / `paid` / `failed` / `expired` / `not_required`
- `momo_order_id`, `momo_pay_url`, `momo_trans_id`, `momo_response`

### EscrowTransaction — Sổ cái audit
Mỗi lần Wallet thay đổi balance/held_balance đều có 1 EscrowTransaction đi kèm. Types:
- `hold` — Phong tỏa tiền Parent (khi MoMo IPN thành công)
- `release_to_worker` — Giải ngân 80% cho Worker
- `commission_to_admin` — Chuyển 20% cho Admin
- `refund_held` — Trừ tiền đã phong tỏa khỏi ví Parent
- `refund_to_parent` — Hoàn tiền cho Parent khi task bị cancel
- `disburse` — Worker rút tiền về MoMo

### CommissionDebt — Khoản nợ hoa hồng (luồng CASH)
Tạo khi task (cash) completed. Tự động tính `commission_amount = gross_amount * 0.20`.
Status: `pending` → `sent` (đã gộp vào statement) → `paid` (admin xác nhận).

### MonthlyCommissionStatement — Bảng kê tháng
Sinh bởi cron ngày 1 hàng tháng. Mỗi statement có:
- `total_gross` — Tổng tiền mặt worker nhận trong tháng
- `total_commission` — Tổng 20% phải nộp
- `vietqr_url` — URL ảnh QR để worker quét thanh toán
- `qr_payload` — Chuỗi EMV raw (cho client render QR native)

---

## 3. LUỒNG 1: THANH TOÁN QUA MOMO (ESCROW)

```
Phụ huynh tạo Task
   ↓ (signal post_save Task created=True)
PaymentOrder(method=cash, status=not_required) tự sinh

Phụ huynh chọn "Thanh toán MoMo" → gọi POST /api/payments/momo/create/
   ↓
   - PaymentOrder đổi sang method=momo, status=pending
   - Gọi MoMo API → nhận payUrl
   - Frontend mở payUrl → user thanh toán MoMo
   ↓
MoMo gọi IPN về POST /api/payments/momo/ipn/
   ↓
   - Verify HMAC-SHA256 signature
   - PaymentOrder.mark_paid + Wallet.held_balance += amount
   - Tạo EscrowTransaction(TYPE_HOLD)
   ↓
Phụ huynh approve candidate → Task status=in_progress
   ↓
Phụ huynh đánh dấu Task completed → signal post_save Task
   ↓
   - escrow_service.release_escrow_on_task_completed(task)
   - Worker.Wallet.balance += price * 0.80
   - Admin.Wallet.balance  += price * 0.20
   - Parent.Wallet.held_balance -= price
   - Tạo 3 EscrowTransaction: REFUND_HELD, RELEASE_TO_WORKER, COMMISSION_TO_ADMIN
   ↓
(Carepartner có thể rút tiền) → POST /api/payments/wallet/withdraw/
   ↓
   - MoMo Disbursement API chuyển tiền về ví MoMo cá nhân
   - Wallet.balance -= amount
   - Tạo EscrowTransaction(TYPE_DISBURSE)
```

---

## 4. LUỒNG 2: THANH TOÁN TIỀN MẶT

```
Phụ huynh tạo Task (method=cash mặc định)
   ↓
Phụ huynh approve candidate → Task status=in_progress
   ↓
Phụ huynh trả TIỀN MẶT cho Carepartner khi làm xong
   ↓
Phụ huynh đánh dấu Task completed → signal post_save Task
   ↓
   - commission_service.record_cash_completion(task)
   - Tạo CommissionDebt(gross=task.price, commission=price*0.20, status=pending)
   ↓
[Cron ngày 1 hàng tháng 8h sáng]
   ↓
   - commission_service.generate_monthly_statements()
   - Aggregate tất cả CommissionDebt pending của worker trong tháng trước
   - Tạo MonthlyCommissionStatement
   - Sinh QR VietQR (URL ảnh PNG có amount + memo)
   - Gửi Notification + Expo Push cho worker
   - Update CommissionDebt.status = 'sent'
   ↓
Worker quét QR chuyển khoản cho Admin
   ↓
Admin xem trong Django Admin hoặc API
   → POST /api/payments/admin/statements/<id>/mark-paid/
   ↓
   - Statement.status = 'paid'
   - CommissionDebt.status = 'paid'
   - Gửi Notification + Push cho worker xác nhận

[Cron hằng ngày 9h sáng]
   - mark_overdue_statements() — statement SENT >7 ngày chưa paid → OVERDUE
```

---

## 5. CẤU HÌNH ENV (RENDER / .env)

```bash
# ─── MoMo Payment Gateway ───
# Đăng ký tại https://business.momo.vn/ → lấy Partner Code, Access Key, Secret Key
MOMO_PARTNER_CODE=MOMOxxx
MOMO_ACCESS_KEY=...
MOMO_SECRET_KEY=...
# Test endpoint (default):
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create
# Production:
# MOMO_ENDPOINT=https://payment.momo.vn/v2/gateway/api/create
# URL frontend quay về sau khi user thanh toán:
MOMO_RETURN_URL=https://educarelink-frontend.example.com/payment/result
# IPN URL — PUBLIC, MoMo gọi server-to-server (mặc định OK trên Render):
MOMO_NOTIFY_URL=https://educarelink-backend.onrender.com/api/payments/momo/ipn/

# ─── MoMo Disbursement API (rút tiền cho Worker) ───
# Yêu cầu đăng ký riêng với MoMo — nếu chưa có, Worker chỉ thấy số dư trong app
MOMO_DISBURSEMENT_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/disbursement

# ─── Hoa hồng & Admin nhận tiền ───
PAYMENT_COMMISSION_RATE=0.20              # 20%
PAYMENT_ADMIN_USER_ID=1                   # ID user admin (is_staff=True) nhận 20%

# ─── VietQR — Admin bank account nhận hoa hồng cuối tháng (luồng CASH) ───
# Mã BIN: 970436=VCB, 970418=BIDV, 970407=Techcombank, 970422=MBBank, 970448=OceanBank, ...
PAYMENT_ADMIN_BANK_BIN=970436
PAYMENT_ADMIN_BANK_ACCOUNT=0071001234567
PAYMENT_ADMIN_BANK_ACCOUNT_NAME=NGUYEN VAN A   # IN HOA KHÔNG DẤU

# ─── Scheduler ───
COMMISSION_SCHEDULER_ENABLED=true
```

---

## 6. API ENDPOINTS

Tất cả endpoints mount tại `/api/payments/`. Yêu cầu JWT (Bearer token) trừ IPN.

### MoMo
| Method | Path | Mô tả | Permission |
|---|---|---|---|
| POST | `/momo/create/` | Parent tạo đơn MoMo cho task | IsAuthenticated |
| GET  | `/momo/return/` | MoMo redirect user về đây | AllowAny |
| POST | `/momo/ipn/` | MoMo server-to-server callback | AllowAny |

### Wallet
| Method | Path | Mô tả | Permission |
|---|---|---|---|
| GET   | `/wallet/` | Xem ví của user hiện tại | IsAuthenticated |
| PATCH | `/wallet/` | Cập nhật momo_phone / bank info | IsAuthenticated |
| GET   | `/wallet/transactions/` | Lịch sử giao dịch ví | IsAuthenticated |
| POST  | `/wallet/withdraw/` | Worker rút tiền về MoMo (Disbursement) | IsAuthenticated |

### Task Payment Status
| Method | Path | Mô tả | Permission |
|---|---|---|---|
| GET | `/task/<task_id>/` | Xem trạng thái thanh toán của 1 task | IsAuthenticated |

### Commission (Worker)
| Method | Path | Mô tả | Permission |
|---|---|---|---|
| GET | `/commission/my-debts/` | Worker xem nợ hoa hồng | IsAuthenticated |
| GET | `/commission/my-statements/` | Worker xem bảng kê tháng | IsAuthenticated |
| GET | `/commission/statements/<id>/` | Chi tiết statement + QR URL | IsAuthenticated |

### Admin
| Method | Path | Mô tả | Permission |
|---|---|---|---|
| GET  | `/admin/transactions/` | Tất cả giao dịch (filter ?type=&username=) | IsAdminUser |
| GET  | `/admin/statements/` | Tất cả statement (filter ?status=) | IsAdminUser |
| POST | `/admin/statements/<id>/mark-paid/` | Admin xác nhận đã nhận tiền | IsAdminUser |
| POST | `/admin/statements/generate/` | Trigger gen statements (manual) | IsAdminUser |
| GET  | `/admin/revenue/` | Tổng quan doanh thu | IsAdminUser |
| GET  | `/admin/scheduler-stats/` | Trạng thái scheduler | IsAdminUser |

---

## 7. EXAMPLE API CALLS

### Parent tạo thanh toán MoMo cho task
```bash
curl -X POST https://educarelink-backend.onrender.com/api/payments/momo/create/ \
  -H "Authorization: Bearer <parent_token>" \
  -H "Content-Type: application/json" \
  -d '{"task_id": 123}'

# Response:
# {
#   "message": "Đã tạo đơn thanh toán MoMo. Vui lòng mở payUrl để thanh toán.",
#   "pay_url": "https://test-payment.momo.vn/v2/gateway/api/t?t=TU9NT...&q=...",
#   "momo_order_id": "ECL-1-1718626800",
#   "payment_order_id": 1,
#   "amount": "200000"
# }
```

### Worker xem bảng kê tháng + QR
```bash
curl https://educarelink-backend.onrender.com/api/payments/commission/my-statements/ \
  -H "Authorization: Bearer <worker_token>"

# Response:
# [
#   {
#     "id": 5,
#     "worker_username": "hueworker",
#     "month": "2026-03-01",
#     "month_str": "03/2026",
#     "total_gross": "1000000",
#     "total_commission": "200000",
#     "debt_count": 3,
#     "status": "sent",
#     "status_display": "Đã gửi QR",
#     "vietqr_url": "https://img.vietqr.io/image/970436-0071001234567-compact.png?amount=200000&addInfo=ECL+HUEWORKER+032026&accountName=NGUYEN+VAN+A",
#     "debts": [...]
#   }
# ]
```

### Admin xác nhận đã nhận tiền hoa hồng
```bash
curl -X POST https://educarelink-backend.onrender.com/api/payments/admin/statements/5/mark-paid/ \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"admin_note": "Đã nhận CK 200000 VND lúc 14:30 05/04/2026"}'
```

### Admin xem tổng quan doanh thu
```bash
curl https://educarelink-backend.onrender.com/api/payments/admin/revenue/ \
  -H "Authorization: Bearer <admin_token>"

# Response:
# {
#   "paid_revenue_cash": "1200000",                  # Đã thu từ cash flow
#   "pending_revenue_statements": "500000",          # Đã gửi QR chờ worker CK
#   "pending_revenue_unbilled": "300000",            # Debts chưa tổng hợp tháng
#   "momo_commission_released_to_admin_wallet": "800000",  # Hoa hồng MoMo đã vào ví Admin
#   "commission_rate": "0.20",
#   "monthly_breakdown": [
#     {"month": "2026-04-01", "cash_commission": "0", "momo_commission": "100000", "total": "100000"},
#     {"month": "2026-03-01", "cash_commission": "1200000", "momo_commission": "700000", "total": "1900000"},
#     ...
#   ]
# }
```

---

## 8. DEPLOYMENT

### Bước 1: Set env trên Render (hoặc .env local)
- Tất cả biến ở Section 5.
- Cần set ít nhất: `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `PAYMENT_ADMIN_USER_ID`, `PAYMENT_ADMIN_BANK_BIN`, `PAYMENT_ADMIN_BANK_ACCOUNT`, `PAYMENT_ADMIN_BANK_ACCOUNT_NAME`.

### Bước 2: Chạy migration
```bash
python manage.py migrate payments
```

### Bước 3: Tạo superuser (nếu chưa có) để làm Admin nhận hoa hồng
```bash
python manage.py createsuperuser
# Sau đó set PAYMENT_ADMIN_USER_ID=<id của superuser>
```

### Bước 4: Test MoMo IPN
MoMo test cung cấp SĐT test & OTP test. Sau khi deploy, vào MoMo Business Dashboard → Test → gửi 1 giao dịch test → kiểm tra log server xem IPN có về không.

---

## 9. LƯU Ý QUAN TRỌNG

1. **MoMo Disbursement API (rút tiền cho Worker)**: Yêu cầu đăng ký riêng với MoMo và ký hợp đồng Payout. Nếu chưa có, Worker chỉ thấy số dư trong app, Admin sẽ phải chuyển tay (bank transfer) dựa trên thông tin Wallet.

2. **MoMo Escrow thật sự**: Module này dùng ví nội bộ EduCareLink làm escrow (chứ không phải MoMo escrow của MoMo Business). Tiền Parent trả vào tk doanh nghiệp MoMo của EduCareLink, sau đó hệ thống tự phân chia 80/20 vào ví nội bộ. Để rút tiền từ tk MoMo doanh nghiệp về ngân hàng, Admin dùng dashboard MoMo Business.

3. **Idempotency**: Tất cả service đều idempotent — nếu MoMo retry IPN, hoặc signal trigger 2 lần, hệ thống sẽ skip (dựa vào `EscrowTransaction.objects.filter(...).exists()`).

4. **Scheduler trên multi-worker**: APScheduler chạy in-process, nếu có nhiều gunicorn worker thì mỗi worker đều start scheduler → có thể chạy trùng. Solution:
   - Tạm thời: chỉ chạy scheduler trên 1 worker (dùng env var `COMMISSION_SCHEDULER_ENABLED=false` cho các worker khác).
   - Lâu dài: chuyển sang external scheduler (Celery beat / Render Cron Job).

5. **VietQR.io rate limit**: API miễn phí có rate limit ~10 req/s. Khi tổng hợp cuối tháng có nhiều worker, có thể generate lần lượt (đã làm tuần tự trong code).

6. **Bảo mật SECRET_KEY**: `MOMO_SECRET_KEY` chỉ nằm ở server, không bao giờ gửi cho frontend. Tất cả signature verify đều ở server.

---

## 10. TESTING

Để test thủ công (sau khi deploy hoặc chạy local với ngrok):

```bash
# 1. Tạo task (parent login)
curl -X POST http://localhost:8000/api/tasks/ \
  -H "Authorization: Bearer <parent_token>" \
  -d '{"title":"Gia su Toan","description":"...","price":300000,"location":"HCM","scheduled_time":"2026-04-20T10:00:00Z"}'

# 2. Tạo MoMo payment cho task
curl -X POST http://localhost:8000/api/payments/momo/create/ \
  -H "Authorization: Bearer <parent_token>" \
  -d '{"task_id": <id từ bước 1>}'
# → nhận payUrl → mở trong browser → thanh toán MoMo test

# 3. Sau khi thanh toán, kiểm tra wallet parent (held_balance tăng)
curl http://localhost:8000/api/payments/wallet/ \
  -H "Authorization: Bearer <parent_token>"

# 4. Approve 1 worker cho task
curl -X POST http://localhost:8000/api/parent/applications/<app_id>/approve/ \
  -H "Authorization: Bearer <parent_token>"

# 5. Đánh dấu task completed → tự động chia tiền
curl -X PATCH http://localhost:8000/api/tasks/<task_id>/status/ \
  -H "Authorization: Bearer <parent_token>" \
  -d '{"status":"completed"}'

# 6. Kiểm tra wallet worker (balance += 80%) và wallet admin (balance += 20%)
curl http://localhost:8000/api/payments/wallet/ -H "Authorization: Bearer <worker_token>"
curl http://localhost:8000/api/payments/wallet/ -H "Authorization: Bearer <admin_token>"

# 7. Test cash flow: tạo task khác (cash), completed → CommissionDebt sinh ra
# 8. Trigger manual generate statements:
curl -X POST http://localhost:8000/api/payments/admin/statements/generate/ \
  -H "Authorization: Bearer <admin_token>" \
  -d '{"dry_run": false}'
```
