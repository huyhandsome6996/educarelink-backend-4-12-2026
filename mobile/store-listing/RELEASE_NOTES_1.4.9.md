# Release Notes — EduCareLink v1.4.9 (versionCode 32)

**Ngày phát hành:** 27/09/2026
**Kênh:** Google Play — Internal Testing (track `internal`)

## ✨ Tính năng mới

### 🤖 AI Đăng việc hộ — nâng cấp theo luồng ghép cặp mới (Flow 1)
- Trợ lý AI (tab "AI Trợ lý" ở chính giữa) giờ **tạo tin đăng đúng hệ thống ghép cặp thông minh**: phụ huynh chỉ cần mô tả nhu cầu bằng ngôn ngữ tự nhiên, AI hỏi nhanh phần còn thiếu rồi **tự đăng tin + mở radar quét 8 Carepartner phù hợp nhất**.
- Tin đăng qua AI có đầy đủ thông tin chuẩn: loại việc (Gia sư / Trông trẻ / Đón trẻ), khung giờ, giá/giờ, địa chỉ, độ tuổi bé, công việc chăm sóc, lặp weekly...
- Thẻ xác nhận tin đăng ngay trong chat (badge dịch vụ + giá + radar pulse) với nút **"Xem ứng viên đề xuất"** → chuyển thẳng danh sách ứng viên.
- Sửa lỗi: trước đây AI còn gợi ý các dịch vụ đã ngừng (dọn dẹp, nấu ăn, mua sắm hộ...) và tạo tin vào luồng cũ không có người nhận — đã loại bỏ hoàn toàn.

### 🔔 Cảnh báo mất kết nối trong ca (phụ huynh nghe chuông báo động)
- Hoàn thiện cảnh báo khẩn trên web: trang theo dõi giờ phát **còi hú cảnh sát thật lặp liên tục** (không còn beep 30 giây tự tắt), kèm rung máy, và phụ huynh bấm "Đã biết" sẽ **xác nhận đã tiếp nhận** cảnh báo về hệ thống.
- Thông báo ngoài (kiểu Messenger/Zalo) giờ hoạt động cả khi trình duyệt đang ở tab nền — phụ huynh không bỏ lỡ cảnh báo khi đang mở tab khác.

## 🛠️ Cải tiến
- Carepartner làm ca trên web giờ tự gửi tín hiệu an toàn (heartbeat 30s) — phụ huynh không bị báo động nhầm khi carepartner chuyển tab, nhưng tắt máy/thoát thật thì cảnh báo vẫn về đúng như mobile.
- Sửa third chip gợi ý trên web chatbot còn nhắc dịch vụ "Dọn dẹp" đã ngừng.

## 📦 Kỹ thuật
- versionCode 32 (vc32), versionName 1.4.9.
- Backend không đổi contract API cũ — chỉ bổ sung.
