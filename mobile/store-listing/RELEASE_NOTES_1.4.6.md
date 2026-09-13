# RELEASE NOTES 1.4.6 (versionCode 29)

## matching & AI đạt chuẩn sản phẩm

- **Khoảng cách không còn "quyết định"**: bỏ loại ứng viên vì GPS lệch nơi
  đăng ký — sinh viên đăng ký Huế đang ở Hà Nội nhận được việc Hà Nội theo
  vị trí GPS hiện tại. Khoảng cách chỉ là một tiêu chí chấm điểm (15%); chỉ
  loại khi xa hơn 80km (không khả thi đi làm).
- **AI Gemini xếp lại thứ tự ứng viên** (top 20 → top 8) kèm 1 câu
  "vì sao phù hợp" — chỉ sắp lại, không loại ai; AI chết → thứ tự quy tắc
  giữ nguyên, matching không bao giờ dừng.
- **Điểm khoảng cách trung tính 50** khi chưa có tọa độ — không còn thắng
  oan người có GPS gần.

## Khóa đơn độc quyền khi phụ huynh chờ xác nhận

- Trong cửa sổ cam kết, đơn không còn được đề xuất cho CarePartner khác:
  API trả 409, không gửi thông báo cho người khác.
- Giữ chỗ mềm 5 phút khi phụ huynh đang xem danh sách — hai phụ huynh không
  cùng giữ một CarePartner.
- Hết hạn / từ chối → tự mở khóa và đề xuất NGƯỜI KHÁC (người đã từ chối
  hoặc không phản hồi không bị đề xuất lại cho đơn đó).

## Không bỏ rơi CarePartner mới

- Sau khi admin duyệt: hồ sơ tự sẵn sàng (ELO khởi điểm 1200) + thông báo
  nhắc khai lịch rảnh và kỹ năng.
- Mỗi danh sách ứng viên luôn chèn tối thiểu 1 người mới (0 đơn, 0 review)
  đã đủ skill + lịch vào slot cuối — không vượt mặt người rất phù hợp #1.
- Tài khoản chờ duyệt đăng nhập được để hoàn thiện hồ sơ (kỹ năng + lịch
  rảnh + CCCD); matching/feed bị chặn cho tới khi được duyệt.

## Lịch nghỉ đúng ngày, đúng giờ

- Khai nghỉ 19:00–21:00 ngày nào → chỉ khung đó bị loại; khung khác cùng
  ngày vẫn nhận việc. Nghỉ cả ngày → loại cả ngày. Máy ghép việc cũ
  (legacy) cũng tôn trọng ngày bận.

## GPS 100% cho khoảng cách (một tiêu chí)

- App gửi vị trí khi đăng nhập, khi mở app, và mỗi 5 phút khi app đang mở.
- Web CarePartner cũng gửi cùng API khi mở trang / mỗi 5 phút.
- Consent mới tách riêng: "Cho phép dùng vị trí để gợi ý việc gần bạn" —
  không liên quan theo dõi vị trí khi đang làm việc. Không bật → dùng địa
  chỉ hồ sơ (không bị khóa GPS vĩnh viễn).

## Chuông + popup nhận đơn (luôn)

- Popup toàn màn hình "Bạn có đơn mới" với [Xác nhận cam kết] [Chi tiết]
  [Từ chối] — nhận cả từ push lẫn polling 15s (phòng mất push).
- Chuông kêu to + rung cho mọi đơn mới khi app đang mở.
- Đăng ký DeviceToken đa thiết bị khi đăng nhập.
- Web: poll 15s + tiếng "ding" + modal khi tab đang mở.

## Khác

- Đồng bộ web–mobile chặt hơn: cùng tài khoản, cùng /api/matching/* —
  thay đổi ở một bên hiện ngay ở bên kia.
- Sửa lỗi điểm đánh giá/khung giờ hiển thị sai ở một số danh sách.
