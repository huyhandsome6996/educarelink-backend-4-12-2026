# Release Notes — v1.4.5 (versionCode 28)

> Ngày: 2026-09-12 · Nhánh: `main` · Loại build: AAB (`app-bundle`) cho CH Play

## Thay đổi chính

### Nhận diện thương hiệu (Logo)
- **Native splash screen giờ hiển thị logo EduCareLink** trên nền cam (thay vì nền cam trống — file splash cũ 100% trong suốt).
- Màn hình **Đăng nhập**: thêm logo EduCareLink 92px phía trên tiêu đề "Chào mừng trở lại" (đúng yêu cầu screenshots-checklist của store listing).
- Màn hình **Đăng ký**: thay icon `school` bằng logo thật cạnh tên app.
- **Trang chủ Phụ huynh**: thêm logo ở góc trên trái header cam.
- **Trang chủ CarePartner (Nhận việc)**: thêm logo ở góc trên trái, cạnh badge đối soát.
- **Guest Home**: thay avatar người dùng bằng logo (góc trên trái).
- **Admin Dashboard (mobile)**: thêm logo vào header.

### Hotline hỗ trợ thống nhất: 0862427404
- Tạo `src/config/appConfig.js` — single source of truth `SUPPORT_HOTLINE`.
- **Modal Tổng đài Hỗ trợ CarePartner** (BookingDetail): đổi từ `19006828 (Nhánh 2)` → `0862427404`, bấm là gọi được.
- **Nút SOS khẩn cấp** (Trang chủ Phụ huynh): hotline `1900 6868` → `0862427404`; **sửa nút "Gọi" chết** (trước đây `onPress: () => {}` không làm gì) — giờ mở trình quay số thật.
- **Nút "Liên hệ hỗ trợ"** (Trạng thái hồ sơ CarePartner): từ "coming soon" → gọi trực tiếp hotline.
- Giữ nguyên `tel:113` (cấp cứu công an) — không phải hotline công ty.

## Kiểm thử trước khi phát hành
- Backend Django: `manage.py check` 0 lỗi · **683/683 tests OK**.
- Mobile: **74/74 jest tests OK** (cập nhật test pin version lên 1.4.5/vc28) · 9 file sửa đổi parse chuẩn bằng @babel/parser.
- Web: 35/35 trang render 200 kèm logo + favicon (smoke test Django test client).

## Việc còn lại để lên store (chạy trên máy có `eas login`)
```bash
cd mobile
npx eas build --platform android --profile production --non-interactive   # build AAB
npx eas submit --platform android --latest --non-interactive              # submit Play Console (đã có google-service-account.json)
```
Hoặc tải `.aab` từ dashboard Expo và tải lên Play Console thủ công.
