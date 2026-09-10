# PROMPT DÀNH CHO CODING AGENT: NÂNG CẤP GIAO DIỆN TRUNG TÂM NHẬN ĐƠN GHÉP CẶP CAREPARTNER (`/don-cua-toi/`) THEO THIẾT KẾ GOOGLE STITCH

> **Mục tiêu:** Thay thế toàn bộ mã nguồn cũ tại `frontend/templates/frontend/don_cua_toi.html` bằng bản thiết kế mới của Google Stitch, chuyển đổi dữ liệu tĩnh thành động (Dynamic Data Binding), kết nối toàn diện với các API DRF của hệ thống EduCareLink (`/api/matching/bookings/`), đồng thời đảm bảo tương thích 100% với layout hệ thống và các quy chế vận hành Flow 1 Matching.
>
> **Quy tắc bất di bất dịch:**
> 1. Thực hiện trực tiếp trên nhánh `main`.
> 2. Mọi commit phải viết bằng **Tiếng Việt**.
> 3. Không xóa hoặc làm đứt gãy bất kỳ API endpoint hay luồng xử lý dữ liệu backend nào hiện có.
> 4. Giữ nguyên tính năng phân quyền: Chỉ người dùng có vai trò `worker` (CarePartner) đã đăng nhập mới được truy cập, người dùng chưa đăng nhập chuyển về `/dang-nhap/`, phụ huynh chuyển về `/parent/`.

---

## 1. PHÂN TÍCH FILE THIẾT KẾ STITCH ĐÃ ĐƯỢC PHÊ DUYỆT

Bản thiết kế HTML Stitch đã cung cấp đầy đủ cấu trúc UI/UX và JavaScript mô phỏng, bao gồm các thành phần cốt lõi:
1. **Top Header Mobile:** Tích hợp nút Back, avatar thương hiệu, Switch chuyển trạng thái `[🟢 Đang nhận đơn]` và chuông thông báo đơn mới.
2. **Sidebar Desktop cố định (`w-[260px]`):** Đồng bộ với hệ thống CarePartner, hiển thị Logo, hồ sơ CarePartner thu nhỏ (Tên, Hạng Vàng, ELO 1.250), các mục điều hướng với mục **Đơn ghép cặp** là Active tab, và công tắc bật/tắt nhận việc ở footer sidebar.
3. **Banner cảnh báo khẩn cấp (`#urgent-banner`):** Nổi bật trên đầu trang với dải gradient cam-hổ phách, chuông báo rung, đồng hồ đếm ngược từng giây (`08:45`) cho đơn đang ở trạng thái `awaiting_commitment`, kèm nút 1 chạm `[⚡ Cam kết nhận đơn ngay]`.
4. **Thanh 4 chỉ số Cockpit Mini:**
   - *Đơn chờ phản hồi* (màu cam nhấp nháy).
   - *Ca làm hôm nay* (màu xanh dương).
   - *Điểm tín nhiệm ELO* (màu xanh ngọc kèm biến động `+25`).
   - *Thu nhập dự kiến tuần* (màu xanh lá thù lao ký quỹ).
5. **Bộ lọc đơn thông minh (Filter Dock):**
   - Thanh Tab cuộn ngang với Badge đếm số: *Tất cả*, *Chờ cam kết*, *Đã cam kết*, *Đang làm*, *Đã hoàn thành*, *Đã hủy*.
   - Ô tìm kiếm theo tên bé, mã đơn, địa chỉ, tên phụ huynh.
   - Dropdown lọc theo Dịch vụ: Gia sư (`giasu`), Đón trẻ (`dontre`), Trông trẻ (`trongtre`).
6. **Danh sách thẻ đơn hàng đa trạng thái (Booking Cards):**
   - *Chờ cam kết (`awaiting_commitment`):* Viền vàng nổi bật, ruy băng đếm ngược thời gian, nút `[⚡ Cam kết nhận đơn]` và nút `[Từ chối]`.
   - *Đang làm (`in_progress`):* Viền xanh dương, chấm radar Live GPS, nút `[🚨 SOS]`, nút `[📍 Live GPS]`, nút `[✅ Xác nhận trả bé / Hoàn thành ca]`.
   - *Đã cam kết (`committed`):* Viền xanh ngọc, nút `[🗺️ Chỉ đường Map]`, nút `[📞 Gọi phụ huynh]`, nút `[▶️ Bắt đầu làm]`.
   - *Đã hoàn thành (`completed`):* Hiển thị số tiền đã giải ngân vào ví và điểm cộng ELO, xem sao kê đánh giá.
   - *Đã hủy / Phạt ELO (`cancelled_by_carepartner`, `no_show`):* Thẻ cảnh báo đỏ, hiển thị số ngày còn lại được quyền nộp kháng cáo và nút `[⚖️ Kháng cáo ngay →]`.
7. **Trạng thái rỗng (`#empty-state`):** Khi không có đơn, hiển thị minh họa và nút `[📅 Cập nhật lịch rảnh]` + `[🔍 Xem việc làm]`.
8. **Các Modal tương tác:**
   - Modal Cam kết nhận đơn (`#commit-modal`): Bảng tóm tắt thù lao + checklist 2 điều khoản cam kết + nút xác nhận.
   - Modal Từ chối đơn (`#reject-modal`): Thu thập lý do từ chối để AI cải thiện thuật toán gợi ý.
   - Modal Kháng cáo ELO (`#appeal-modal`): Chuyển hướng hoặc gửi đơn kháng cáo.
   - Toast thông báo trạng thái nổi góc trên bên phải.

---

## 2. NHIỆM VỤ CỤ THỂ CHO CODING AGENT

### 2.1. File đích cần cập nhật
- **Đường dẫn:** `frontend/templates/frontend/don_cua_toi.html`
- **Yêu cầu kế thừa Django:**
  - Giữ lại `{% load static %}` ở đầu file.
  - Nhúng `{% include 'frontend/_matching_common.html' %}` trong thẻ `<head>` để tái sử dụng:
    - Biến toàn cục `API_BASE = '/api'`.
    - Hàm gọi API có xác thực JWT: `authFetch(url, options)`.
    - Hàm định dạng tiền tệ VNĐ: `fmtVND(amount)`.
    - Hàm thông báo hệ thống: `toast(message, isSuccess)`.
  - Giữ thẻ `<link rel="icon" type="image/png" sizes="32x32" href="/static/images/favicon-32.png">`.
  - Tích hợp chuẩn `{% include 'frontend/_worker_chrome.html' with active_tab='matching' %}` hoặc sử dụng trực tiếp cấu trúc Sidebar CarePartner chuẩn của hệ thống để đồng bộ toàn bộ portal CarePartner (`_worker_sidebar.html`).

---

### 2.2. Ghép nối API Backend DRF Thật

Coding Agent phải thay thế toàn bộ dữ liệu mock cứng bằng các lệnh gọi API bất đồng bộ (Fetch API):

#### A. Lấy danh sách đơn ghép cặp của CarePartner:
- **Endpoint:** `GET /api/matching/bookings/`
- **Query params hỗ trợ:**
  - `?status=awaiting_commitment` (Chờ cam kết)
  - `?status=committed` (Đã cam kết)
  - `?status=in_progress` (Đang làm)
  - `?status=completed` (Hoàn thành)
  - `?status=cancelled_by_carepartner` (Đã hủy)
- **Cấu trúc dữ liệu trả về từ backend:**
  ```javascript
  {
    "count": 4,
    "results": [
      {
        "id": "uuid-cua-booking",
        "job_id": "uuid-cua-job",
        "job_title": "Gia sư Tiếng Anh giao tiếp cho bé 8 tuổi",
        "category_code": "tutoring", // 'tutoring' | 'pickup' | 'childcare'
        "category_name_vi": "Gia sư",
        "status": "awaiting_commitment", // 'awaiting_commitment' | 'committed' | 'in_progress' | 'completed' | 'cancelled_by_carepartner' | 'cancelled_by_parent' | 'no_show'
        "status_label_vi": "Chờ cam kết",
        "commit_deadline": "2026-09-11T18:45:00+07:00",
        "commit_seconds_left": 525,
        "total_value_vnd": 400000,
        "carepartner_payout_vnd": 320000, // 80% thực nhận
        "compensation_vnd": 0,
        "first_slot": {
          "date": "11/09/2026",
          "day_of_week_vi": "Hôm nay",
          "time_from": "18:30:00",
          "time_to": "20:30:00"
        },
        "parent_info": {
          "full_name": "Hoàng Ngân",
          "phone": "0987654321",
          "rating": 4.9,
          "reviews_count": 24,
          "avatar_url": ""
        },
        "child_info": {
          "name": "Bé Bảo Nam",
          "age": 8,
          "grade": "Lớp 3",
          "notes": "Nhà có sẵn flashcard & phòng học riêng"
        },
        "location_info": {
          "address": "Chung cư Vinhomes Central Park, P. 22, Bình Thạnh",
          "distance_km": 1.8
        },
        "created_at": "2026-09-11T15:30:00Z"
      }
    ]
  }
  ```

#### B. API Thao tác Đơn hàng (Actions):
1. **Cam kết nhận đơn:**
   - **Method:** `POST`
   - **URL:** `/api/matching/bookings/{booking_id}/commit/`
   - **Mô tả:** CarePartner bấm xác nhận trong thời hạn 15 phút.
   - **Phản hồi thành công:** `HTTP 200 OK`, chuyển trạng thái sang `committed`.

2. **Bắt đầu ca làm việc:**
   - **Method:** `POST`
   - **URL:** `/api/matching/bookings/{booking_id}/start/`
   - **Phản hồi thành công:** Chuyển trạng thái sang `in_progress`, kích hoạt module tracking vị trí.

3. **Hoàn thành ca làm việc:**
   - **Method:** `POST`
   - **URL:** `/api/matching/bookings/{booking_id}/complete/`
   - **Phản hồi thành công:** Chuyển sang `completed`, giải ngân tiền ký quỹ vào ví tín dụng.

4. **Từ chối hoặc Hủy đơn:**
   - **Method:** `POST`
   - **URL:** `/api/matching/bookings/{booking_id}/cancel/`
   - **Body:** `{ "reason_code": "busy_schedule", "note": "Ghi chú lý do..." }`
   - **Quy tắc:** Nếu đơn đang là `awaiting_commitment`, việc từ chối sớm giúp hệ thống chuyển tiếp đơn cho ứng viên khác. Nếu đã `committed` mà hủy, sẽ áp dụng trừ ELO theo quy chế.

5. **Kháng cáo ELO:**
   - Khi trạng thái là `cancelled_by_carepartner`, `no_show`, `suspected_no_show`:
   - Nút `[Kháng cáo ngay →]` phải dẫn trực tiếp tới: `/khang-cao/{booking_id}/`.

---

### 2.3. Logic Render Động Cần Hiện Thực Bằng Javascript

Trong thẻ `<script>` của `don_cua_toi.html`, xây dựng các hàm logic sau:

1. **`async function fetchBookings()`:**
   - Hiển thị spinner loading.
   - Gọi `authFetch(API_BASE + '/matching/bookings/')`.
   - Lưu kết quả vào biến mảng toàn cục `allBookings`.
   - Tính toán dữ liệu thống kê Cockpit:
     - Số lượng đơn `awaiting_commitment`.
     - Số lượng ca làm hôm nay (`is_today`).
     - Lấy điểm ELO của CarePartner từ `/api/profile/` hoặc `data.worker_elo`.
     - Tổng thu nhập dự kiến tuần (tổng `carepartner_payout_vnd` của các ca trong tuần).
   - Kiểm tra xem có đơn nào đang ở `awaiting_commitment`:
     - Nếu có: Bật hiển thị `#urgent-banner`, gán dữ liệu đơn khẩn cấp này vào banner, khởi động đồng hồ đếm ngược `startCountdown(secondsLeft)`.
     - Nếu không có: Ẩn `#urgent-banner`.
   - Cập nhật số lượng đếm trên các Tab trạng thái (`badge-count`).
   - Gọi `renderBookingsList()`.

2. **`function renderBookingsList()`:**
   - Lọc mảng theo `activeFilter` (all, pending, committed, ongoing, completed, cancelled).
   - Lọc theo từ khóa `search-input` và dịch vụ `service-filter`.
   - Nếu danh sách sau lọc rỗng -> Ẩn danh sách thẻ, hiển thị `#empty-state`.
   - Nếu có đơn -> Render từng thẻ card theo đúng HTML mẫu Stitch đã thiết kế:
     - Thêm icon chuẩn cho từng dịch vụ:
       - `tutoring` -> 📚 Gia sư (màu tím indigo).
       - `pickup` -> 🚗 Đón trẻ (màu cam hổ phách).
       - `childcare` -> 🧸 Trông trẻ (màu hồng/xanh ngọc).
     - Gắn ID của booking vào các thuộc tính data: `data-id="${booking.id}"`.
     - Gắn sự kiện click cho các nút hành động tương ứng:
       - Nút Cam kết: `openCommitModal('${booking.id}', '${booking.job_title}', '${fmtVND(booking.carepartner_payout_vnd)}')`.
       - Nút Từ chối: `openRejectModal('${booking.id}')`.
       - Nút Bắt đầu làm: `handleStartJob('${booking.id}')`.
       - Nút Hoàn thành: `handleCompleteJob('${booking.id}')`.
       - Nút Chỉ đường: Mở link Google Maps theo địa chỉ `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`.
       - Nút Gọi điện: `window.location.href = 'tel:' + phone`.
       - Nút Kháng cáo: `window.location.href = '/khang-cao/' + booking.id + '/'`.

3. **`function startCountdown(seconds)`:**
   - Quản lý `setInterval` đếm ngược mỗi giây.
   - Khi `seconds <= 0`: Hiển thị "00:00 (Đã hết hạn)", tự động gọi lại `fetchBookings()` để cập nhật trạng thái mới nhất từ server.

4. **Xử lý Thực thi Modal Commit & Cancel:**
   - Khi người dùng bấm `Xác nhận cam kết` trong modal:
     - Kiểm tra 2 checkbox cam kết đã được tích.
     - Gọi `POST /api/matching/bookings/${currentSelectedId}/commit/`.
     - Đóng modal, hiển thị Toast xanh thành công, tự động làm mới lại danh sách.
   - Khi người dùng bấm `Gửi từ chối` trong modal:
     - Lấy lý do được chọn.
     - Gọi `POST /api/matching/bookings/${currentSelectedId}/cancel/`.
     - Đóng modal, hiển thị Toast cảnh báo, tự động làm mới danh sách.

---

## 3. CHECKLIST KIỂM THỬ TRƯỚC KHI HOÀN TẤT (ACCEPTANCE CRITERIA)

Sau khi hoàn thành code, Coding Agent phải tự kiểm tra các điểm sau:
- [ ] Truy cập `/don-cua-toi/` khi đã đăng nhập tài khoản CarePartner hiển thị đầy đủ giao diện mới, không có lỗi JavaScript trên Console (`F12`).
- [ ] Hiển thị chính xác các đơn hàng từ database (không còn dữ liệu cứng Hoàng Ngân, Vinhomes,Masteri Thảo Điền nếu trong DB không có).
- [ ] Đồng hồ đếm ngược của đơn `Chờ cam kết` nhảy từng giây chính xác theo `commit_seconds_left` từ backend.
- [ ] Bấm nút Cam kết gọi đúng API và chuyển trạng thái đơn sang `Đã cam kết`.
- [ ] Nút Kháng cáo trên các đơn bị phạt dẫn đúng sang trang `/khang-cao/{booking_id}/`.
- [ ] Bộ lọc Tab trạng thái, ô tìm kiếm và dropdown dịch vụ hoạt động trơn tru, tức thì.
- [ ] Hiển thị hoàn hảo trên cả màn hình Desktop (có Sidebar) và màn hình Mobile (gọn gàng, ngón tay chạm dễ dàng, có Bottom Nav).
- [ ] Chạy lệnh `python manage.py check` và `python manage.py test matching` đảm bảo không có lỗi hồi quy.
- [ ] Commit toàn bộ thay đổi với thông điệp rõ ràng bằng Tiếng Việt.
