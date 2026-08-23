# Data Safety — Bản trả lời bảng câu hỏi Play Console
# (Đối chiếu 100% với code thực tế — core/models.py, tracking/, chat/, payments/, moderation/)

> ⚠️ Đây là bản NHÁP để điền vào bảng Data safety trên Play Console.
> Mỗi dòng dưới đây khớp với code thực tế (ghi chú nguồn). KHÔNG bịa thêm/kém.

## Tổng quan thu thập & chuyển đổi dữ liệu

Dựa trên code hiện tại, app THU THẬP các loại dữ liệu sau:

### 1. Vị trí (Location) — CÓ
- **Nguồn code**: `Task.latitude/longitude` (địa điểm việc — user chọn trên bản đồ),
  `LiveLocation`, `LocationHistory` (theo dõi vị trí CarePartner khi làm, có consent),
  `DeviceHeartbeat.last_location_lat/lng`, `RandomVerificationCheck.response_lat/lng`,
  `SOSAlert.latitude/longitude`.
- **Trả lời Console**: "Approximate location / Precise location — Collected, Shared?"
  - Precise location: **Collected** (GPS theo dõi trong ca làm — chỉ khi CarePartner đồng ý chia sẻ)
  - Mục đích: App functionality (giám sát an toàn trong ca làm)
  - Vị trí địa điểm công việc: do phụ huynh tự nhập — App functionality
- **Chuyển đổi dữ liệu (transmit)**: Có — gửi lên backend qua HTTPS để phụ huynh xem real-time.
- **Xoá dữ liệu**: Người dùng có thể yêu cầu xoá (quy trình hỗ trợ qua email).

### 2. Ảnh và video (Photos and videos) — CÓ
- **Nguồn code**: `User.id_card_front/id_card_back` (CCCD), `selfie_photo`, 
  `certificate_photo` (bằng cấp), `CredentialSubmission.certificate_photo`,
  `CareDiaryAttachment.image` (ảnh nhật ký chăm sóc),
  `RandomVerificationCheck.photo` (ảnh xác thực trong ca — lưu ngoài MEDIA_ROOT, 
  chỉ parent/admin xem được),
  `ComplaintEvidence.file` (bằng chứng khiếu nại).
- **Trả lời Console**: "Photos and videos — Collected"
  - Mục đích: App functionality (xác minh danh tính, nhật ký chăm sóc, xác thực an toàn), Account management
- **Chuyển đổi**: Có — upload lên server.
- ⚠️ LƯU Ý ĐẶC BIỆT: app thu thập **ảnh chân dung/CCCD** — thuộc nhóm nhạy cảm.

### 3. Thông tin cá nhân (Personal info) — CÓ
- **Nguồn code**: `User`: username, email, first/last name, phone_number, address,
  `ProfileChangeRequest.proposed_changes`.
- **Trả lời Console**: "Name, Email address, Address, Phone number — Collected"
  - Mục đích: Account management, App functionality

### 4. ID người dùng / Device identifier — CÓ
- **Nguồn code**: `User.expo_push_token` (Expo push token thiết bị).
- **Trả lời Console**: "Device or other IDs — Collected"
  - Mục đích: Notifications (gửi thông báo đẩy)

### 5. Tin nhắn người dùng (User content / messages) — CÓ
- **Nguồn code**: `chat.Message.content`, `Notification` (in-app),
  `Review.comment`, `Complaint` nội dung.
- **Trả lời Console**: "Messages / Other user-generated content — Collected"
  - Mục đích: App functionality (chat trong ca, đánh giá, khiếu nại)
  - Chat kiểm duyệt từ khóa tự động trước khi lưu.

### 6. Dữ liệu tài chính (Financial info) — CÓ (gián tiếp qua MoMo/PayOS)
- **Nguồn code**: `payments.Payment` (amount, momo_order_id...), 
  `CommissionSettlement` — app ghi nhận giao dịch nhưng KHÔNG tự xử lý thẻ;
  thanh toán qua cổng MoMo/PayOS (mở web thanh toán của MoMo/PayOS).
- **Trả lời Console**: "Purchase history — Collected" 
  - Mục đích: App functionality (quản lý thanh toán công việc)
  - KHÔNG thu thập số thẻ/số tài khoản trong app.

### 7. KHÔNG thu thập
- Dữ liệu duyệt web web, dữ liệu sức khỏe/thể chất, dữ liệu sinh trắc học,
  thông tin giới tính/định hướng, sắc tộc/tôn giáo, ý định chính trị,
- Không bán dữ liệu cho bên thứ 3, không dùng cho quảng cáo, không track cross-app.

## Trả lời "Bảo mật dữ liệu" (Data security)
- Dữ liệu truyền qua HTTPS/TLS ✅
- Có cơ chế xoá yêu cầu (data deletion request) — qua email hỗ trợ ✅ (khai báo)
- Yêu cầu xóa: có quy trình (email hỗ trợ)

## Mẫu bắt buộc declarations khác liên quan
- **Family/Kids policy**: App NHẮM tới phụ huynh dùng cho việc chăm sóc trẻ em,
  nhưng NGƯỜI DÙNG app là người trưởng thành (phụ huynh/carepartner 18+).
  Không thu thập dữ liệu trực tiếp từ trẻ em. → Khai báo theo hướng
  "app dành cho người lớn, phục vụ giám sát chăm sóc trẻ".
- **Camera permission**: dùng để chụp ảnh xác thực/CCCD/nhật ký — đã có mô tả
  purpose trong app.json.
- **Location permission**: dùng cho theo dõi trong ca làm — có mô tả purpose.
