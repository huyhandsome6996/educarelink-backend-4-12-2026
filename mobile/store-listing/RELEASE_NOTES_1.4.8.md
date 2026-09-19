# RELEASE NOTES 1.4.8 (versionCode 31)

## Mới: Form đánh giá chuyên sâu khi ghi Nhật ký chăm sóc

- **Trước đây**: CarePartner ghi nhật ký dạng văn bản chung chung — phụ huynh
  khó biết ca học/giữ trẻ diễn ra chất lượng thế nào.
- **Bây giờ**: khi hoàn tất ca thuộc nhóm **Gia sư** hoặc **Trông trẻ**,
  app tự mở form đánh giá đúng nhóm dịch vụ:
  - **Gia sư**: môn học đã dạy, điểm đánh giá (thang 5 sao), ghi chú tiến bộ.
  - **Trông trẻ**: chất lượng giấc ngủ, số bữa ăn & mô tả bữa ăn, hoạt động.
  - Ca khác nhóm: giữ nguyên nhật ký tự do như cũ (không bị ép form).
- Phụ huynh xem nhật ký thấy **card đánh giá riêng theo loại** (học tập /
  sinh hoạt) — hiển thị đồng bộ giữa mobile và web.
- Chọn form theo **mã nhóm dịch vụ ổn định** (`gia-su` / `trong-tre`) —
  admin đổi tên hiển thị nhóm dịch vụ không làm app chọn nhầm form.
- Chống lỗi nhập: thiếu điểm/môn học (Gia sư) hoặc thiếu giấc ngủ/bữa ăn
  (Trông trẻ) sẽ được báo ngay trên máy trước khi gửi; giới hạn độ dài
  từng trường để tránh lỗi máy chủ.

## Mới: Cổng VietQR — xác nhận đặt lịch CHỈ SAU khi PayOS báo PAID

- Phụ huynh chọn CarePartner xong, app mở màn hình **QR VietQR (PayOS)**:
  đơn của CarePartner chỉ được xác nhận khi máy chủ nhận báo cáo PAID
  (kiểm tra chữ ký + khớp số tiền) — tiền vào trạng thái tạm giữ.
- Huỷ hoặc hết hạn thanh toán → đơn tự rollback về trạng thái chờ để
  phụ huynh chọn lại CarePartner, không kẹt đơn.

## Mới: Đường vào Nhật ký chăm sóc cho Flow ghép cặp

- CarePartner: hoàn tất ca từ "Việc của tôi" → được hỏi **"Viết nhật ký
  ngay"** ngay sau khi chấm ca (kèm lựa chọn "Để sau").
- Phụ huynh: trang chi tiết đơn/lịch sử có lối vào xem nhật ký của từng ca
  — ca chưa có nhật ký sẽ hiển thị thông báo "chưa có nhật ký" thay vì
  trang trống.

## Khác

- Chuẩn hoá dữ liệu mẫu địa bàn TP. Huế; sửa chuỗi hiển thị màn Blackout.
- Không thay đổi quyền riêng tư hay quyền thiết bị nào so với 1.4.7.
