# Screenshots Checklist — Chụp MÀN HÌNH THẬT từ APK v1.3.x

> KHÔNG dùng ảnh giả/mock. Chụp trực tiếp từ app chạy trên điện thoại Android
> (cài APK đã build) hoặc emulator.

## Thông số kỹ thuật (yêu cầu Play Console)
- Định dạng: PNG hoặc JPEG
- Kích thước: tối thiểu 320px, tối đa 3840px
- Tỉ lệ: 16:9 hoặc 9:16 (khuyên dùng 9:16 dọc cho phone)
- Tối thiểu 2 ảnh; khuyến nghị 4-8 ảnh
- Không chứa nội dung nhạy cảm, không có chữ quá nhỏ

## Danh sách màn hình cần chụp (theo thứ tự ưu tiên)

| # | Màn hình | Cách chuẩn bị | Điểm nhấn trong ảnh |
|---|---|---|---|
| 1 | **Đăng nhập** | Mở app → màn login | Giao diện sạch, logo EduCareLink |
| 2 | **Trang chủ phụ huynh** | Login bằng phuhuynh_test → home | Thống kê việc, banner đăng việc, AI assistant |
| 3 | **Tạo công việc** | Bấm "Đăng việc" → form tạo việc | Chọn danh mục, AI gợi ý giá (A1) |
| 4 | **Danh sách việc + ghép thông minh** | Tab Việc của tôi → việc đang mở | Badge "Ghép thông minh" (A2) |
| 5 | **Xác thực ảnh trong ca (B5)** | Login sinhvien_test → mở app đúng lúc có check photo, hoặc chụp màn modal PIN xác minh | Modal toàn màn "Xác minh bảo mật" + đếm ngược |
| 6 | **Chat với CarePartner (N)** | Vào việc in_progress → bấm "Nhắn tin" | Bong bóng chat, badge cửa sổ còn giờ |
| 7 | **Nhật ký chăm sóc (B1)** | Vào việc đã xong → Nhật ký | Mood, hoạt động, ảnh đính kèm |
| 8 | **Theo dõi vị trí** | Phụ huynh → việc in_progress → Theo dõi | Bản đồ + vị trí live + SOS |
| 9 | (Bonus) **Hạng CarePartner (B4)** | Xem hồ sơ carepartner | Badge hạng Đồng/Bạc/Vàng |

## Cách chụp nhanh
1. Cài APK v1.3.1 (link trong README) lên điện thoại Android
2. Dùng tài khoản demo: `phuhuynh_test` / `Demo@2026` (phụ huynh) và `sinhvien_test` / `Demo@2026` (carepartner)
3. Chụp màn hình bằng tổ hợp nút nguồn + âm lượng
4. Đặt tên: `01-login.png`, `02-home.png`... bỏ vào thư mục `store-listing/screenshots/`
5. Upload lên Play Console → Store listing → Phone screenshots

## Icon app
- Đã có sẵn: `mobile/assets/logo.png` (1024x1024) — Play Console yêu cầu icon 512x512,
  có thể cần resize về đúng 512x512.
- Feature graphic (1024x500): CHƯA có — cần thiết kế 1 banner ngang giới thiệu app.
