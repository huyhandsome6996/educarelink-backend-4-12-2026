# 📋 PAYOS SETUP — Checklist cho User

> Tài liệu này hướng dẫn bạn thu thập thông tin PayOS để agent hoàn thành tích hợp thanh toán.

---

## 🎯 Tổng quan

| Thông tin | Giá trị |
|---|---|
| **Branch hiện tại** | `feature/payos-integration` |
| **Branch merge target** | `main` |
| **Trạng thái code** | ✅ Đã implement đầy đủ (backend + web + mobile) |
| **Đang chờ** | ⏳ PayOS credentials từ bạn |
| **Sau khi có credentials** | Agent set env vars trên Render → merge vào main → go-live |

---

## ✅ Bước 1: Đăng ký PayOS (5-10 phút)

### 1.1. Truy cập trang đăng ký

🔗 **URL**: https://my.payos.vn/register

### 1.2. Điền form đăng ký (cá nhân)

| Trường | Giá trị cần điền |
|---|---|
| **Loại tài khoản** | Chọn **"Cá nhân"** (không chọn Doanh nghiệp) |
| **Họ và tên** | Họ tên thật của bạn (trùng CCCD) |
| **CCCD/CMND** | Số CCCD 12 số |
| **Ngày cấp** | Ngày cấp CCCD |
| **Nơi cấp** | Nơi cấp CCCD |
| **Số điện thoại** | SĐT đang dùng |
| **Email** | Email bạn thường check |
| **Địa chỉ** | Địa chỉ hiện tại |

### 1.3. Upload ảnh CCCD

- 📷 **Mặt trước CCCD** (chụp rõ, đủ sáng)
- 📷 **Mặt sau CCCD** (chụp rõ, đủ sáng)

### 1.4. Verify SĐT + Email

- Nhập OTP gửi về SĐT
- Click link verify email

### 1.5. Hoàn tất đăng ký

- PayOS duyệt **tự động trong 1-5 phút**
- Bạn nhận email chúc mừng → có thể vào dashboard

---

## ✅ Bước 2: Lấy 3 credentials keys (1 phút)

Sau khi đăng nhập vào dashboard PayOS (https://my.payos.vn):

### 2.1. Vào trang API Keys

1. Đăng nhập: https://my.payos.vn
2. Click menu **"Tích hợp"** hoặc **"API Keys"** hoặc **"Cài đặt"**
3. Tìm section **"Thông tin tích hợp"** hoặc **"Credentials"**

### 2.2. Copy 3 keys

Bạn sẽ thấy **3 thông tin quan trọng**:

| Key | Mô tả | Ví dụ |
|---|---|---|
| 🔑 **Client ID** | ID ứng dụng | `5d2c...` |
| 🔑 **API Key** | Key xác thực API | `a1b2c3d4-e5f6-...` |
| 🔑 **Checksum Key** | Key tạo chữ ký HMAC | `xyz789abc...` |

---

## ✅ Bước 3: Cung cấp thông tin cho Agent

### 3.1. Reply với template sau

```
PayOS credentials:
- Client ID: <paste Client ID của bạn>
- API Key: <paste API Key của bạn>
- Checksum Key: <paste Checksum Key của bạn>

Thông tin thêm (optional):
- Tên hiển thị trên PayOS: <vd: Nguyễn Văn A>
- SĐT đăng ký: <vd: 0901234567>
- Email đăng ký: <vd: email@gmail.com>
```

---

## ✅ Bước 4: Setup Webhook URL (Agent làm sau khi có credentials)

Sau khi agent nhận credentials, agent sẽ:

1. **Set env vars trên Render**:
   ```
   PAYOS_CLIENT_ID=xxx
   PAYOS_API_KEY=xxx
   PAYOS_CHECKSUM_KEY=xxx
   ```

2. **Trigger auto-deploy** trên Render

3. **Confirm webhook URL** — agent gọi API:
   ```
   POST /api/payments/payos-confirm-webhook/
   {
     "webhook_url": "https://educarelink-backend.onrender.com/api/payments/payos-webhook/"
   }
   ```

4. **Verify PayOS hoạt động** — agent test:
   ```
   GET /api/payments/health/
   → { "payos_enabled": true }
   ```

5. **Merge branch `feature/payos-integration` → `main`**

6. **Go-live!** 🎉

---

## 📋 Thông tin thêm cần chuẩn bị (optional)

### 4.1. STK ngân hàng của bạn (để nhận tiền từ PayOS)

Khi parent thanh toán qua PayOS, tiền sẽ vào tài khoản ngân hàng bạn đã liên kết với PayOS. Cần:

| Thông tin | Mô tả |
|---|---|
| **STK ngân hàng** | Tài khoản nhận tiền (BIDV, VCB, MB, Techcombank...) |
| **Tên chủ TK** | Tên trùng với CCCD |
| **Ngân hàng** | VD: BIDV, Vietcombank, MB Bank... |

### 4.2. STK ngân hàng của Carepartner (để payout)

Khi task hoàn thành, admin cần chuyển tiền cho carepartner. Cần carepartner cung cấp:

| Thông tin | Mô tả |
|---|---|
| **STK ngân hàng** | Tài khoản nhận tiền |
| **Tên chủ TK** | Tên trùng với CCCD |
| **Ngân hàng** | VD: BIDV, Vietcombank, MB Bank... |

⚠️ Hiện tại auto payout chưa hỗ trợ (cần PayOS Payout API + KYC doanh nghiệp). Admin sẽ manual transfer cho carepartner.

---

## ❓ FAQ

### Q: PayOS có uy tín không?
**A**: Có. PayOS thuộc công ty công nghệ fintech Việt Nam, đối tác chính thức của BIDV, Napas. Đã được nhiều doanh nghiệp VN sử dụng.

### Q: Tôi là sinh viên, đăng ký được không?
**A**: ĐƯỢC. PayOS cho phép **cá nhân** đăng ký, chỉ cần CCCD. Không cần doanh nghiệp.

### Q: Phí thực sự 0đ?
**A**: Đúng, PayOS miễn phí 100%:
- 0đ phí giao dịch
- 0đ phí setup
- 0đ phí duy trì hàng tháng

### Q: Test được ngay không?
**A**: ĐƯỢC. Đăng ký xong → có credentials → agent set env vars → test trên production Render ngay.

### Q: Có cần app ngân hàng không?
**A**: KHÔNG cần cho dev. Nhưng để test flow thật, bạn cần app ngân hàng để quét QR.

### Q: Tôi có cần STK ngân hàng không?
**A**: CÓ. Bạn cần **1 STK ngân hàng** (BIDV, VCB, MB, Techcombank...) để:
- Nhận tiền từ PayOS (khi parent thanh toán)
- Chuyển tiền cho carepartner (khi task completed)

---

## 📝 Tóm tắt — Bạn cần làm NGAY

```
1. Vào https://my.payos.vn/register
2. Đăng ký cá nhân + CCCD (5-10 phút)
3. Lấy 3 keys: Client ID, API Key, Checksum Key
4. Reply cho agent:
   "PayOS credentials:
    - Client ID: xxx
    - API Key: xxx
    - Checksum Key: xxx"
5. Agent set env vars + merge vào main → go-live!
```

**Bạn sẵn sàng bắt đầu chưa?** 🚀

---

*File này được tạo bởi QA Agent (Super Z) — branch `feature/payos-integration`*
