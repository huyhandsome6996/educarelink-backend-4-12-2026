# PROMPT THIẾT KẾ GOOGLE STITCH: TRUNG TÂM ĐƠN GHÉP CẶP & NHẬN ĐƠN MỚI CAREPARTNER (/don-cua-toi/)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS/JS hoàn chỉnh từ Google Stitch (hoặc Antigravity/Cursor) cho trang **"Đơn ghép cặp của tôi / Nhận đơn mới"** tại đường dẫn `/don-cua-toi/` trên nền tảng EduCareLink.  
> **Phong cách:** Modern Caregiver / Gig-Economy Web App (kết hợp nét chuyên nghiệp, tin cậy, sắc nét của Grab/Uber Driver với nét ấm áp, nhân văn của EduCareLink).  
> **Khả năng đáp ứng:** Tối ưu hóa 100% cho cả **Mobile Web** (trải nghiệm dạng ứng dụng di động mượt mà) và **Desktop Web** (đồng bộ với Sidebar CarePartner 260px).  
> **Ngôn ngữ UI:** Tiếng Việt (100% chuẩn thuật ngữ hệ thống EduCareLink).  
> **Đường dẫn áp dụng trong mã nguồn:** `frontend/templates/frontend/don_cua_toi.html`

---

## 1. BỐI CẢNH NGHIỆP VỤ & PHÂN TÍCH HIỆN TRẠNG

### 1.1. Luồng nghiệp vụ ghép cặp tự động (Flow 1 Matching)
1. **Phụ huynh đăng việc:** Chọn dịch vụ (Gia sư, Đón trẻ, Trông trẻ), chọn khung giờ, địa điểm và mức thù lao.
2. **Hệ thống AI Matching:** Dựa vào lịch rảnh, khoảng cách địa lý (Haversine/Nominatim), và điểm xếp hạng tín nhiệm ELO để tự động ghép cặp với CarePartner phù hợp nhất.
3. **Tạo đơn ghép cặp (Booking):** Đơn được gán cho CarePartner với trạng thái ban đầu là `awaiting_commitment` (Chờ cam kết).
4. **Cửa sổ cam kết (Commitment Window):** CarePartner nhận được thông báo tức thì và có **15 phút** để bấm xác nhận cam kết nhận đơn. Nếu quá hạn (timeout), CarePartner bị trừ điểm ELO tín nhiệm và hệ thống chuyển đơn sang người tiếp theo.
5. **Thực hiện công việc:**
   - `committed`: Đã cam kết, chờ đến giờ làm việc.
   - `in_progress`: CarePartner bắt đầu làm việc, chia sẻ vị trí trực tiếp (Live Tracking) để phụ huynh an tâm.
   - `completed`: Hoàn thành ca làm, giải ngân tiền thù lao qua ký quỹ MoMo/VietQR (80% cho CarePartner, 20% phí nền tảng), hai bên đánh giá sao.
   - `cancelled_by_carepartner` / `no_show`: Đơn bị hủy hoặc không đến. Nếu CarePartner bị phạt sai quy chế, có thể nộp **Kháng cáo ELO trong vòng 7 ngày**.

### 1.2. Phân tích các điểm yếu nghiêm trọng ở giao diện hiện tại (`/don-cua-toi/`)
- **Giao diện thô sơ, mang tính chất thử nghiệm:** Chỉ có một container `max-w-2xl` lọt thỏm giữa màn hình desktop lớn, không có Sidebar CarePartner đồng bộ, thanh header đơn điệu chỉ có nút quay lại.
- **Không có khu vực tổng quan (Cockpit Dashboard):** CarePartner không biết hôm nay mình có mấy ca làm việc, ca tiếp theo lúc mấy giờ, thu nhập tạm tính tuần này là bao nhiêu, trạng thái nhận đơn đang bật hay tắt.
- **Thẻ đơn hàng thiếu thông tin sống còn:**
  - Không có thông tin cụ thể về bé (tên bé, độ tuổi, lớp, ghi chú đặc biệt).
  - Không có khoảng cách tính bằng km (VD: *Cách vị trí của bạn 1.8 km*).
  - Đơn `awaiting_commitment` không có đồng hồ đếm ngược trực tiếp trên thẻ, khiến CarePartner không cảm nhận được tính cấp bách và dễ bị trễ hạn mất đơn.
  - Không có avatar và tên phụ huynh, không có số sao uy tín của phụ huynh.
- **Thiếu nút thao tác nhanh (Quick Actions):** Người dùng bắt buộc phải click vào thẻ để sang trang chi tiết mới thấy nút bấm. Thiếu các nút tương tác 1 chạm: `[Cam kết nhận đơn ngay]`, `[Chỉ đường bản đồ]`, `[Gọi cho phụ huynh]`, `[Bắt đầu làm]`.
- **Phần lọc đơn sơ sài:** Các tab trạng thái không có huy hiệu đếm số lượng (Badge Counter). Thiếu bộ lọc theo loại dịch vụ (Gia sư, Đón trẻ, Trông trẻ) và bộ lọc theo mốc thời gian (Hôm nay, Ngày mai, Tuần này).
- **Trạng thái rỗng (Empty State) nghèo nàn:** Khi không có đơn nào, chỉ hiển thị icon clipboard xám xịt, không gợi ý hành động mở rộng lịch rảnh để nhận thêm đơn.

---

## 2. HỆ THỐNG THIẾT KẾ & BẢNG MÀU (STITCH DESIGN SYSTEM)

| Tên vai trò màu | Mã màu Hex | Ý nghĩa & Vị trí sử dụng |
|---|---|---|
| **Brand Primary (Cam)** | `#F26522` | Màu nhận diện thương hiệu EduCareLink. Dùng cho nút chính (Cam kết ngay, Nhận đơn), thanh đếm ngược, tab đang chọn. |
| **Brand Primary Hover** | `#EA580C` | Hiệu ứng khi rê chuột vào nút chính. |
| **Brand Primary Soft** | `#FFF4ED` | Nền nhạt cho các thẻ thông tin nổi bật, badge highlight, đường viền mềm `#FED7AA`. |
| **Success / Committed (Xanh ngọc)** | `#10B981` / `#0E9F6E` | Biểu thị trạng thái đã cam kết, đã hoàn thành ca làm, tỉ lệ uy tín cao. Nền mềm `#ECFDF5`. |
| **In-Progress (Xanh công nghệ)** | `#2563EB` | Biểu thị trạng thái ca làm đang thực hiện, Live Tracking GPS đang bật. Nền mềm `#EFF6FF`. |
| **Urgent Warning (Vàng hổ phách)** | `#F59E0B` / `#D97706` | Biểu thị trạng thái Chờ cam kết, đồng hồ đếm ngược sắp hết giờ, có thể kháng cáo ELO. Nền mềm `#FEF3C7`. |
| **Danger / Violation (Đỏ san hô)** | `#EF4444` / `#DC2626` | Biểu thị đơn bị hủy, vi phạm không đến (No-show), cảnh báo phạt tiền/ELO. Nền mềm `#FEF2F2`. |
| **Neutral Slate Background** | `#F8FAFC` | Nền tổng thể mát mắt, chuyên nghiệp, tạo độ tương phản cao với các khối nội dung. |
| **Surface Card** | `#FFFFFF` | Thẻ trắng tinh khiết, bo góc lớn `rounded-2xl`, viền mảnh `border border-slate-200/80`, bóng đổ `shadow-sm hover:shadow-md`. |
| **Text Primary / Secondary** | `#0F172A` / `#64748B` | Chữ chính đen than đậm rõ ràng, chữ phụ xám slate dịu mắt, độ tương phản chuẩn WCAG AAA. |

### Typography & Biểu tượng
- **Font chữ tiêu đề & Số liệu:** Google Font `Manrope` (chữ in hoa đậm nét, số liệu tiền tệ to bản `font-extrabold tracking-tight`).
- **Font chữ nội dung:** Google Font `Plus Jakarta Sans` (thân thiện, dễ đọc trên màn hình điện thoại).
- **Icon:** Google Material Symbols Outlined (`timer`, `schedule`, `location_on`, `directions_car`, `child_care`, `school`, `payments`, `verified`, `call`, `navigation`, `play_circle`, `check_circle`, `gavel`, `tune`, `notifications_active`).

---

## 3. CẤU TRÚC GIAO DIỆN CHI TIẾT (LAYOUT SPECIFICATION)

Giao diện mới được tổ chức theo chuẩn Dual-Layout:
- **Trên Desktop (>= 1024px):** Có Sidebar cố định bên trái (rộng 260px) chuẩn hệ thống CarePartner, khu vực làm việc chính nằm bên phải rộng rãi (`max-w-5xl mx-auto py-8 px-6`).
- **Trên Mobile (< 1024px):** Thanh Header trên cùng tích hợp nút Quay lại + Switch "Sẵn sàng nhận đơn" + Chuông thông báo; bên dưới là nội dung cuộn mượt mà; đáy màn hình là Bottom Navigation 5 tab chuẩn Mobile App.

---

### PHẦN 1: THANH ĐIỀU HƯỚNG & KHUNG KHÔNG GIAN (APP SHELL)

#### 1.1. Sidebar Desktop (`w-[260px]` cố định bên trái):
- **Logo & Thương hiệu:** Logo EduCareLink (`/static/images/logo.png`) kèm huy hiệu `CAREPARTNER HUB`.
- **Hồ sơ thu nhỏ của CarePartner:**
  - Avatar tròn có viền cam, tên: `Nguyễn Minh Anh`.
  - Huy hiệu xếp hạng: `Hạng Vàng · ELO 1.250 ★ 4.95`.
- **Menu điều hướng chính:**
  - 🏠 Trang chủ / Tìm việc (`/worker/`)
  - 📅 **Lịch rảnh làm việc** (`/lich-ranh/`)
  - 📥 **Đơn ghép cặp của tôi** (`/don-cua-toi/` — **ACTIVE TAB**, highlight nền cam nhạt với thanh chỉ báo bên trái)
  - 💰 Ví tiền & Thu nhập (`/vi-tien/`)
  - 💬 Trợ lý AI CarePartner (`/worker/chatbot/`)
  - ⚙️ Hồ sơ & Bằng cấp (`/worker/profile/`)

#### 1.2. Header Mobile:
- Nút mũi tên quay lại (`arrow_back`) về `/worker/`.
- Tiêu đề: **Nhận đơn & Đơn của tôi**.
- Nút chuyển trạng thái nhanh (Status Toggle Pill): `🟢 Đang nhận đơn` (chạm để tạm tắt khi bận).
- Chuông thông báo có chấm đỏ đếm số đơn mới.

---

### PHẦN 2: BANNER KHẨN CẤP (URGENT COMMITMENT ALERT STRIP)
*(Khối này tự động xuất hiện ở vị trí cao nhất khi có ít nhất 1 đơn đang ở trạng thái `awaiting_commitment`)*
- **Thiết kế:** Dạng thẻ banner nổi với dải viền gradient hổ phách – cam, hiệu ứng nhịp đập nhẹ nhàng (subtle amber pulse).
- **Nội dung:**
  - Icon chuông báo rung `notifications_active` màu cam đậm trong vòng tròn nhấp nháy.
  - Tiêu đề: **BẠN CÓ 1 ĐƠN GHÉP CẶP MỚI CẦN XÁC NHẬN!**
  - Đồng hồ đếm ngược trực tiếp thời gian thực dạng số lớn: `08:45` (giây nhảy liên tục).
  - Tóm tắt nhanh: *Gia sư Tiếng Anh Lớp 4 · 18:00 Tối nay · 320.000đ · Cách 1.5 km*.
  - 2 nút hành động nhanh:
    + Nút nổi bật: `[⚡ Cam kết nhận việc ngay]` (Nền cam `#F26522`, icon sấm sét).
    + Nút phụ: `[Xem chi tiết đơn]` (Nền trắng viền cam).

---

### PHẦN 3: BẢNG CHỈ SỐ NHẬN VIỆC (COCKPIT STATS BAR)
Gồm 4 thẻ thống kê mini xếp thành lưới 4 cột (desktop) hoặc cuộn ngang/2 cột (mobile):
1. **Đơn chờ xác nhận:** Số lớn màu cam (VD: `1`), chú thích: *Cần phản hồi < 15p*.
2. **Ca làm việc hôm nay:** Số lớn màu xanh dương (VD: `2 ca`), chú thích: *Ca gần nhất lúc 17:00*.
3. **Điểm tín nhiệm ELO:** Số lớn màu xanh ngọc (VD: `1.250`), kèm tag `+25 ELO tuần này`.
4. **Thu nhập dự kiến:** Số tiền lớn (VD: `1.850.000đ`), chú thích: *Ký quỹ MoMo an toàn*.

---

### PHẦN 4: THANH LỌC ĐƠN & TÌM KIẾM THÔNG MINH (FILTER & CONTROL DOCK)

#### 4.1. Thanh Tab Trạng Thái (Status Tabs with Badges):
Hàng nút dạng pill trượt ngang mượt mà, mỗi tab có số lượng đơn đi kèm:
- **Tất cả** (Badge: 6)
- **Chờ cam kết** (Badge: 1 — màu cam nhấp nháy)
- **Đã cam kết / Sắp tới** (Badge: 2 — màu xanh ngọc)
- **Đang làm việc** (Badge: 1 — màu xanh dương)
- **Đã hoàn thành** (Badge: 2)
- **Đã hủy / Kháng cáo** (Badge: 1 — màu đỏ nhạt)

#### 4.2. Thanh Công Cụ Lọc Nâng Cao (Search & Sub-filter Row):
- **Ô tìm kiếm:** Nhập tên phụ huynh, tên bé, địa chỉ hoặc mã đơn `#ECL-...`.
- **Dropdown chọn dịch vụ:** Tất cả dịch vụ, Gia sư, Đón trẻ, Trông trẻ.
- **Dropdown chọn thời gian:** Hôm nay, Ngày mai, Tuần này, Tất cả các ngày.

---

### PHẦN 5: DANH SÁCH THẺ ĐƠN HÀNG CAO CẤP (PREMIUM BOOKING CARDS) — TRỌNG TÂM

Mỗi thẻ đơn hàng là một khối thông tin tinh tế, bo góc `rounded-2xl`, viền mềm, hiệu ứng hover nhẹ, chia thành 3 phần rõ ràng:

#### 1. Phần Đầu Thẻ (Card Header):
- **Hàng trên cùng:**
  - **Badge Loại dịch vụ:**
    - 📚 Gia sư: Nền tím nhạt `#F3E8FF`, chữ tím đậm `#7E22CE`, icon `school`.
    - 🚗 Đón trẻ: Nền cam nhạt `#FFF4ED`, chữ cam đậm `#F26522`, icon `directions_car`.
    - 🧸 Trông trẻ: Nền xanh ngọc nhạt `#ECFDF5`, chữ xanh ngọc đậm `#0D9488`, icon `child_care`.
  - **Mã đơn hàng:** `#ECL-2026-8921` (Font Mono, xám nhạt).
  - **Huy hiệu trạng thái (Status Pill):**
    - `Chờ cam kết (còn 08:45)` → Nền vàng hổ phách, chữ đậm, viền nhấp nháy.
    - `Đã cam kết · Sắp bắt đầu` → Nền xanh ngọc, icon tích xanh.
    - `Đang thực hiện ca làm` → Nền xanh dương, chấm pulsating live.
    - `Đã hoàn thành` → Nền xám xanh nhẹ, icon `verified`.
    - `Đã hủy · Bị phạt ELO` → Nền đỏ nhạt.
- **Tiêu đề công việc:** Font Manrope lớn, đậm: *“Đón bé Bảo Nam từ trường Tiểu học Lê Ngọc Hân về nhà riêng”*.

#### 2. Thân Thẻ (Card Body — Thông tin chi tiết):
Bố cục dạng lưới 2 cột gọn gàng trên mobile và 3 cột trên desktop:
- **Thời gian:** 
  - Icon lịch `schedule`.
  - Hiển thị: `Thứ 6, 11/09/2026 · 17:00 – 18:30 (1.5 giờ)`.
  - Nhãn phụ: *Bắt đầu sau 2 giờ nữa*.
- **Địa điểm & Lộ trình:**
  - Icon vị trí `location_on`.
  - Điểm đón (A): *Cổng chính Trường TH Lê Ngọc Hân, Q.1*.
  - Điểm trả (B): *Căn hộ 1204, Tháp B Chung cư Florita, Q.7*.
  - Khoảng cách: `Cách bạn 1.8 km (khoảng 8 phút đi xe)`.
- **Thông tin Bé & Ghi chú phụ huynh:**
  - Icon em bé `face`.
  - Tên bé: **Bé Bảo Nam (7 tuổi - Lớp 2)**.
  - Ghi chú: *“Bé mặc đồng phục trường có thêu tên. Đón bé tại cổng bảo vệ số 2, đưa về nhà bàn giao cho bà ngoại”*.
- **Thông tin Phụ huynh:**
  - Avatar tròn phụ huynh, Tên: **Chị Mai Lan**.
  - Đánh giá: `★ 4.9 (15 lượt thuê trên hệ thống)`.

#### 3. Chân Thẻ (Card Footer — Tài chính & Nút hành động trực tiếp):
- **Khu vực Thù lao (Bên trái):**
  - Số tiền thực nhận lớn, màu xanh lá hoặc cam nổi bật: **280.000 VNĐ**.
  - Chú thích minh bạch: *Đã trừ 20% phí nền tảng · Nhận ngay vào ví khi hoàn tất*.
  - Nếu có đền bù: Huy hiệu nhỏ `+50.000đ đền bù hủy sát giờ`.
- **Hàng nút hành động nhanh (Bên phải):**
  - **Với đơn "Chờ cam kết":**
    + Nút chính: `[⚡ Cam kết nhận đơn]` (Cam đậm, to bản, bấm vào mở modal xác nhận nhanh).
    + Nút phụ: `[Từ chối]` (Nút xám viền mảnh, mở popup chọn lý do).
  - **Với đơn "Đã cam kết":**
    + Nút: `[🗺️ Chỉ đường Map]` (Mở Google Maps chỉ lộ trình).
    + Nút: `[📞 Gọi phụ huynh]` (Gọi trực tiếp số đã đối soát).
    + Nút: `[▶️ Bắt đầu làm]` (Hiện sáng khi đến sát giờ ca làm).
  - **Với đơn "Đang làm việc":**
    + Nút: `[📍 Chia sẻ Live GPS]` (Đang phát định vị an toàn cho phụ huynh).
    + Nút: `[✅ Hoàn thành ca làm]` (Xác nhận xong việc để nhận tiền).
    + Nút: `[🚨 SOS khẩn cấp]` (Báo động trung tâm hỗ trợ 24/7).
  - **Với đơn "Đã hủy / Phạt ELO":**
    + Banner nhỏ: `⚖️ Bạn có thể nộp đơn kháng cáo ELO trong vòng 7 ngày`.
    + Nút: `[Gửi kháng cáo ngay →]` (Dẫn trực tiếp tới `/khang-cao/{booking_id}/`).

---

### PHẦN 6: TRẠNG THÁI TRỐNG & HƯỚNG DẪN TĂNG ĐƠN (EMPTY STATE & TIPS)
*(Hiển thị khi danh mục đang lọc không có đơn nào)*
- **Minh họa:** Minh họa SVG hiện đại hoặc vector một CarePartner đang mỉm cười cùng chiếc ba lô hoặc cuốn sổ lịch.
- **Tiêu đề:** **Chưa có đơn ghép cặp nào ở mục này**
- **Nội dung:** *“Hệ thống tự động ghép đơn dựa trên Lịch rảnh và Điểm tín nhiệm ELO của bạn. Hãy đảm bảo bạn đã mở đầy đủ các khung giờ rảnh trong tuần để nhận tối đa thông báo việc mới!”*
- **2 nút hành động chuyển đổi:**
  - Nút chính: `[📅 Cập nhật lịch rảnh tuần này]` (Dẫn tới `/lich-ranh/`).
  - Nút phụ: `[🔍 Khám phá danh sách việc trên Bảng tin]` (Dẫn tới `/worker/`).

---

### PHẦN 7: FOOTER CAM KẾT & QUY CHẾ VÀNG CHO CAREPARTNER
Hộp thông tin nhỏ gọn ở cuối trang:
- 🛡️ **Quy chế cam kết:** Chấp nhận đơn đồng nghĩa với việc cam kết có mặt đúng giờ. Hủy đơn không có lý do chính đáng sẽ bị trừ 30 điểm ELO.
- ⚡ **Kháng cáo minh bạch:** Bị hủy do sự cố bất khả kháng (tai nạn, bão lũ, phụ huynh hủy sai)? Gửi minh chứng để ban quản trị duyệt hoàn lại 100% điểm ELO.
- 💳 **Ký quỹ MoMo:** 100% tiền thù lao đã được phụ huynh nạp ký quỹ trước khi ca làm bắt đầu. Tiền tự động về ví CarePartner ngay sau khi kết thúc.

---

## 4. BẢNG MẪU JSON DỮ LIỆU TƯƠNG THÍCH BACKEND (API SCHEMA)

Bản thiết kế HTML/JS phải tương thích hoàn toàn với API hiện hữu của EduCareLink (`/api/matching/bookings/`):

```json
{
  "count": 4,
  "results": [
    {
      "id": "b8f72a1e-89c4-42b1-91a5-862d3a95e01b",
      "job_title": "Gia sư Tiếng Anh giao tiếp lớp 5 & Kèm bài tập về nhà",
      "category_code": "tutoring",
      "category_name_vi": "Gia sư",
      "status": "awaiting_commitment",
      "status_label_vi": "Chờ cam kết",
      "commit_deadline": "2026-09-11T17:45:00+07:00",
      "commit_seconds_left": 525,
      "total_value_vnd": 350000,
      "carepartner_payout_vnd": 280000,
      "compensation_vnd": 0,
      "first_slot": {
        "date": "11/09/2026",
        "day_of_week_vi": "Thứ Sáu",
        "time_from": "18:00:00",
        "time_to": "20:00:00"
      },
      "parent_info": {
        "full_name": "Nguyễn Thu Hương",
        "phone": "0987654321",
        "rating": 4.95,
        "avatar_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120"
      },
      "child_info": {
        "name": "Bé Quỳnh Chi",
        "age": 10,
        "grade": "Lớp 5",
        "notes": "Bé ngoan, cần luyện phát âm chuẩn ngữ điệu Cambridge Flyers"
      },
      "location_info": {
        "address": "Phòng 804, Chung cư Sky Garden 3, Phú Mỹ Hưng, Q.7, TP.HCM",
        "distance_km": 2.1
      }
    }
  ]
}
```

---

## 5. TOÀN VĂN PROMPT GỬI CHO GOOGLE STITCH

Dưới đây là đoạn prompt đóng khung để bạn sao chép trực tiếp và dán vào Google Stitch:

```markdown
Hãy thiết kế một trang web hoàn chỉnh (HTML + Tailwind CSS CDN + vanilla JavaScript) dành riêng cho CarePartner (Sinh viên / Giảng viên / Người chăm sóc) trên nền tảng EduCareLink: "TRUNG TÂM NHẬN ĐƠN GHÉP CẶP CỦA TÔI" (My Matched Bookings & Dispatch Cockpit) tại đường dẫn /don-cua-toi/.

Yêu cầu kỹ thuật & Thiết kế:
1. Framework: HTML5 chuẩn SEO semantic + Tailwind CSS script CDN (tailwindcss.com) + Google Fonts ('Plus Jakarta Sans' cho body, 'Manrope' cho tiêu đề và số liệu) + Google Material Symbols Outlined icons.
2. Bảng màu chuẩn EduCareLink:
   - Màu chủ đạo: Cam rực rỡ #F26522, hover #EA580C, nền mềm #FFF4ED, viền #FED7AA.
   - Màu thành công / Cam kết: Xanh ngọc #10B981 / #0E9F6E, nền mềm #ECFDF5.
   - Màu ca làm đang diễn ra: Xanh dương #2563EB, nền mềm #EFF6FF.
   - Màu khẩn cấp / Đếm ngược: Vàng hổ phách #F59E0B / #D97706, nền mềm #FEF3C7.
   - Màu nguy hiểm / Hủy / Phạt: Đỏ san hô #EF4444 / #DC2626, nền mềm #FEF2F2.
   - Màu nền toàn trang: #F8FAFC (Slate mát dịu), màu thẻ card: #FFFFFF bo góc tròn mềm mại rounded-2xl border border-slate-200/80 shadow-sm.
3. Bố cục thích ứng (Responsive Dual-Layout):
   - Desktop (>= 1024px): Cột Sidebar trái cố định 260px (Logo EduCareLink, hồ sơ CarePartner hạng Vàng ELO 1.250, menu 6 mục với 'Đơn ghép cặp' là Active tab). Bên phải là không gian làm việc rộng rãi max-w-5xl.
   - Mobile (< 1024px): Header gọn gàng có nút quay lại, nút gạt '🟢 Đang nhận đơn', chuông thông báo; Đáy màn hình có thanh Bottom Navigation 5 tab (Tìm việc, Lịch rảnh, Đơn của tôi [Active], Ví tiền, Hồ sơ).
4. Các khối chức năng bắt buộc trong không gian làm việc:
   a. BANNER CẢNH BÁO KHẨN CẤP (Urgent Banner): Nổi bật trên cùng với viền cam nhấp nháy, chuông báo rung, đồng hồ đếm ngược từng giây (VD: 08:45) cho đơn mới 'Chờ cam kết', kèm nút bấm 1 chạm [⚡ Cam kết nhận đơn ngay].
   b. THANH CHỈ SỐ HOẠT ĐỘNG (4 Thẻ Stat Mini): Đơn chờ phản hồi, Ca làm hôm nay, Điểm tín nhiệm ELO (1.250), Thu nhập dự kiến tuần (1.850.000đ).
   c. BỘ LỌC ĐƠN THÔNG MINH (Filter Dock): Thanh tab cuộn ngang có badge số lượng: [Tất cả (6)], [Chờ cam kết (1)], [Đã cam kết (2)], [Đang làm (1)], [Đã hoàn thành (2)], [Đã hủy (1)]; kèm ô tìm kiếm và dropdown lọc theo Dịch vụ (Gia sư, Đón trẻ, Trông trẻ).
   d. DANH SÁCH THẺ ĐƠN HÀNG CAO CẤP (Booking Cards):
      - Thiết kế thẻ card sang trọng, bo góc rounded-2xl, viền phân tách tinh tế.
      - Thể hiện rõ: Badge loại dịch vụ (Gia sư / Đón trẻ / Trông trẻ với màu sắc riêng), Mã đơn #ECL-..., Badge trạng thái chuẩn màu sắc.
      - Lịch làm việc: Ngày, giờ bắt đầu - kết thúc, nhãn phụ 'Bắt đầu sau 2 tiếng'.
      - Điểm đón & Điểm đến (có tính toán khoảng cách: 'Cách bạn 1.8 km').
      - Thông tin Bé (Tên bé, độ tuổi, lớp, ghi chú của mẹ).
      - Thông tin Phụ huynh (Avatar, Tên, Đánh giá ★ 4.9).
      - Thù lao thực nhận số lớn màu xanh/cam (VD: 280.000đ) kèm chú thích 'Đã trừ 20% phí sàn · Ký quỹ an toàn'.
      - Nút hành động trực tiếp tùy trạng thái:
        * Đơn chờ cam kết: Nút to [⚡ Cam kết nhận đơn] + Nút [Từ chối].
        * Đơn đã cam kết: Nút [🗺️ Chỉ đường Map] + Nút [📞 Gọi phụ huynh] + Nút [▶️ Bắt đầu làm].
        * Đơn đang làm: Nút [📍 Live Tracking GPS] + Nút [✅ Hoàn thành] + Nút [🚨 SOS].
        * Đơn bị hủy / phạt ELO: Badge '⚖️ Có thể kháng cáo ELO trong 7 ngày' + Nút [Kháng cáo ngay →].
   e. TRẠNG THÁI TRỐNG (Empty State): Khi chuyển sang tab không có đơn, hiển thị hình minh họa vector đáng yêu, thông điệp truyền cảm hứng và 2 nút: [📅 Cập nhật lịch rảnh] và [🔍 Tìm việc mới].
   f. FOOTER QUY CHẾ VÀNG: Nhắc nhở quy tắc cam kết đúng giờ, không bỏ ca, chính sách kháng cáo minh bạch trong 7 ngày.
5. JavaScript tương tác giả lập (Mock Interactivity):
   - Chuyển tab trạng thái mượt mà làm thay đổi danh sách hiển thị và bộ lọc.
   - Đồng hồ đếm ngược thời gian cam kết chạy từng giây thực tế.
   - Bấm nút [⚡ Cam kết nhận đơn] hiển thị Modal xác nhận nhanh với cam kết đến đúng giờ; bấm xác nhận hiển thị thông báo Toast xanh thành công và chuyển trạng thái thẻ thành 'Đã cam kết'.
   - Bấm nút [Từ chối] mở popup hỏi lý do từ chối.
   - Nút gạt Toggle bật/tắt nhận đơn trên header hoạt động mượt mà.

Yêu cầu xuất: Trả về một khối code HTML duy nhất, không dùng placeholder, không cắt xén, viết đầy đủ 100% mã nguồn để có thể copy chạy ngay lập tức.
```

---

## 6. DANH SÁCH CÁC CHỈ DẪN KỸ THUẬT KHI LẮP RÁP VÀO DJANGO

Khi nhận file HTML thiết kế từ Stitch, Coding Agent sẽ tích hợp vào `frontend/templates/frontend/don_cua_toi.html` theo các bước chuẩn:

1. **Kế thừa file tĩnh và layout chung:**
   - Dùng `{% load static %}`.
   - Nhúng `{% include 'frontend/_matching_common.html' %}` để có sẵn các hàm tiện ích (`authFetch`, `fmtVND`, `toast`, `API_BASE`).
2. **Ghép nối API DRF thật:**
   - Endpoint danh sách đơn: `GET /matching/bookings/` (có hỗ trợ tham số `?status=...`).
   - Endpoint cam kết nhận đơn: `POST /matching/bookings/{id}/commit/`.
   - Endpoint bắt đầu ca làm: `POST /matching/bookings/{id}/start/`.
   - Endpoint hoàn thành ca làm: `POST /matching/bookings/{id}/complete/`.
   - Endpoint từ chối/hủy đơn: `POST /matching/bookings/{id}/cancel/` (kèm `reason_code` và `note`).
3. **Liên kết trang kháng cáo:**
   - Các đơn có trạng thái trong mảng `['cancelled_by_carepartner', 'no_show', 'no_show_unconfirmed', 'suspected_no_show']` sẽ có nút liên kết trực tiếp tới `/khang-cao/{booking.id}/`.
