# Content Rating — Ghi chú điền bảng phân loại

> Trả lời bảng IARC Content Rating trên Play Console dựa trên tính năng thật của app.

## Câu hỏi & câu trả lời đề xuất

| Câu hỏi | Trả lời | Lý do (dựa code) |
|---|---|---|
| App có chứa bạo lực? | **Không** | Không có nội dung bạo lực |
| App có phải là app đánh bạc/cược thật? | **Không** | Không có tính năng cá cược |
| App có hiển thị/quản lý dòng tiền thật? | **CÓ** | Có thanh toán công việc qua MoMo escrow/PayOS/tiền mặt (payments module) — chọn "Yes" cho câu quản lý tiền → Google sẽ đánh giá mức Trưởng thành phù hợp |
| Có mua bán trong app? | **Không** (không in-app purchase Google) | Thanh toán qua cổng MoMo/PayOS ngoài Google Play Billing |
| Người dùng có tương tác/giao tiếp với nhau? | **CÓ** | Chat parent↔carepartner (chat module), đánh giá, khiếu nại |
| Có chia sẻ vị trí người dùng? | **CÓ** | Theo dõi vị trí CarePartner trong ca làm (tracking module) — chọn "Yes" |
| Có nội dung người lớn khiêu dâm? | **Không** | Chat có kiểm duyệt từ khóa cấm tự động |
| Nội dung phân biệt/chửi bới do người dùng tạo? | **Ít/không** | Chat/review được kiểm duyệt từ khóa tự động (moderation module); chọn "No" hoặc mức thấp nhất |
| App có hướng tới trẻ em (target child audience)? | **KHÔNG** | Người dùng là phụ huynh & carepartner trưởng thành; trẻ em KHÔNG dùng app này |
| Có chia sẻ thông tin cá nhân của người dùng khác? | **CÓ (giới hạn)** | Phụ huynh xem tên/hạng/thu nhập-đánh giá của carepartner — chọn theo câu hỏi cụ thể |

## Kết quả mong đợi
- Rating: **PEGI 3+ / Everyone** hoặc **Teen** tùy câu trả lời dòng tiền thật
  (thường apps có thanh toán thật + chat → "Teen" 13+ là an toàn nhất).
- Apps for Families: **KHÔNG** đăng ký (app không dành cho trẻ em trực tiếp).

## Tag "Chủ đề chính" khi khai báo
- Danh mục đề xuất: **Parenting** (Làm cha mẹ) hoặc **Lifestyle**
- Từ khóa: chăm sóc trẻ, trông trẻ, gia sư, đưa đón, an toàn
