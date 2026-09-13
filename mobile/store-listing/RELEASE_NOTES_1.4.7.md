# RELEASE NOTES 1.4.7 (versionCode 30)

## Sửa lỗi chặn đăng việc "Gia sư & Kèm học"

- **Trước đây**: phụ huynh bấm "Đăng việc" ở biểu mẫu Gia sư gặp lỗi
  *"Ưu tiên gia sư không hợp lệ: 'any'. Chọn 1 trong: student_year_1_2,
  student_year_3_4, graduate, no_preference"* — không đăng được việc nào
  khi để lựa chọn mặc định "Không yêu cầu".
- **Nguyên nhân**: biểu mẫu mobile gửi mã lựa chọn `'any'` trong khi backend
  chỉ chấp nhận 4 giá trị chuẩn (`no_preference` là giá trị đúng cho
  "Không yêu cầu").
- **Cách sửa (2 phía)**:
  - Backend: tự động chuẩn hóa `'any'` → `'no_preference'` — các bản ứng
    dụng đã cài (1.4.6) cũng hết lỗi ngay khi máy chủ cập nhật, không cần
    chờ cập nhật cửa hàng.
  - Ứng dụng: biểu mẫu gia sư giờ gửi đúng mã `no_preference` cho lựa chọn
    "Không yêu cầu"; bổ sung kiểm thử chặn tái phát (AC-M6).

## Khác

- Không thay đổi gì khác — đây là bản hotfix tập trung cho lỗi đăng việc.
