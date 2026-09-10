# PROMPT THIẾT KẾ GOOGLE STITCH: LỊCH RẢNH LÀM VIỆC CAREPARTNER (FLOW 1 MATCHING)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS hoàn chỉnh từ Google Stitch cho trang **"Lịch rảnh làm việc"** của CarePartner (Sinh viên/Cộng tác viên) tại đường dẫn `/lich-ranh/` trên nền tảng EduCareLink.  
> **Phong cách:** Modern EdTech / Caregiver Web App, tối ưu hiển thị trên Desktop và Mobile Web, giao diện thân thiện, trực quan, loại bỏ sự khô khan của bảng form cũ.  
> **Ngôn ngữ UI:** Tiếng Việt (100% chuẩn thuật ngữ EduCareLink).  
> **File đích trong dự án:** `frontend/templates/frontend/lich_ranh.html`

---

## 1. BỐI CẢNH & PHÂN TÍCH NHU CẦU NGƯỜI DÙNG

### 1.1. Hiện trạng bất cập tại `/lich-ranh/`:
- **Giao diện thô sơ, thiếu trực quan:** Người dùng chỉ có 1 dropdown chọn Thứ (Thứ 2 đến Chủ nhật) và 2 ô nhập giờ (bắt đầu, kết thúc), bên dưới là danh sách dạng text đơn giản.
- **Không có cái nhìn tổng thể tuần:** Sinh viên không thể hình dung tuần này mình đã đăng ký bao nhiêu buổi, khung giờ nào còn trống, khung giờ nào đã có lịch học ở trường.
- **Dễ thao tác sai & ức chế vì lỗi:** Khi người dùng chọn nhầm khung giờ gần kề hoặc bị trùng, hệ thống báo lỗi toast đỏ *"Khung giờ này chồng lấn khung đã có trong cùng ngày"* nhưng không gợi ý gộp khung giờ hoặc không chỉ rõ vị trí bị trùng trên lịch.
- **Chưa gắn kết với luồng Ghép cặp Flow 1:** Lịch rảnh là "trái tim" của thuật toán ghép việc tự động (Smart Matching ELO). Sinh viên cần biết trạng thái từng khung giờ: Khung giờ nào đang **Sẵn sàng nhận việc**, khung giờ nào **Đã được hệ thống ghép đơn**, và khung giờ nào **Đã bị khóa** do đơn đang chạy.

### 1.2. Kỳ vọng thiết kế mới:
1. **Lưới thời gian tuần trực quan (Interactive Weekly Timetable Grid):** 7 ngày trong tuần hiển thị dạng ma trận lịch học/lịch làm quen thuộc với sinh viên đại học.
2. **Thao tác 1 chạm (Quick Actions):** Bấm chọn nhanh các khung giờ mẫu (Ví dụ: "Buổi tối trong tuần 18:00 - 21:00", "Cả ngày thứ 7 & Chủ nhật").
3. **Thước đo năng lực nhận việc (Availability Metric Bar):** Tổng số giờ rảnh/tuần, tỷ lệ sẵn sàng, huy hiệu cộng điểm tín nhiệm ELO cho người duy trì lịch rảnh đều đặn.
4. **Cảnh báo và xử lý trùng lặp trực quan (Visual Conflict Resolution):** Tự động phát hiện khung giờ liền kề và hiển thị nút "Gộp ca làm việc" ngay trên giao diện.

---

## 2. HỆ THỐNG THIẾT KẾ & BẢNG MÀU (DESIGN SYSTEM)

- **Màu chủ đạo (Primary):** `#F26522` (Cam EduCareLink rực rỡ, năng động, nhiệt huyết).
- **Màu phụ trợ (Secondary):** `#0D9488` / `#10B981` (Xanh ngọc / Xanh lá - tượng trưng cho sự sẵn sàng, khung giờ rảnh khả dụng).
- **Màu trạng thái đã ghép đơn (Matched/Booked):** `#2563EB` (Xanh dương đậm công nghệ - uy tín, cam kết).
- **Màu cảnh báo / Chờ cam kết:** `#F59E0B` (Vàng hổ phách - cần chú ý).
- **Màu nền & Phân chia:**
  - Nền trang: `#F8FAFC` (Slate 50 mát dịu, chuyên nghiệp).
  - Thẻ card / Bề mặt: `#FFFFFF` (Bo góc `rounded-2xl`, bóng đổ `shadow-sm hover:shadow-md`).
  - Đường viền lưới: `#E2E8F0` (Slate 200 mảnh mai).
- **Typography:** `Plus Jakarta Sans` hoặc `Manrope`, chữ in hoa đậm nét cho các tiêu đề cột thứ (`font-bold text-xs uppercase tracking-wider`).
- **Icon:** Google Material Symbols Outlined (`calendar_month`, `schedule`, `add_circle`, `auto_awesome`, `check_circle`, `lock`, `delete`, `bolt`).

---

## 3. CẤU TRÚC GIAO DIỆN CHI TIẾT (LAYOUT BREAKDOWN)

### A. Sidebar điều hướng (Kế thừa chuẩn CarePartner Portal):
- Cột cố định bên trái (Desktop `w-[260px]`):
  - Logo EduCareLink (`/static/images/logo.png`).
  - Menu chính: Tìm việc (`/worker/`), Việc của tôi (`/worker/my-jobs/`), Hồ sơ (`/worker/profile/`), AI Trợ lý (`/worker/chatbot/`).
  - Nhóm Flow 1: **Lịch rảnh ghép cặp** (Active tab), Đơn ghép cặp (`/worker/match-bookings/`), Khai báo ngày bận đột xuất (`/ngay-ban/`).

### B. Khu vực nội dung chính (Main Content Area):

#### 1. Header & Thanh trạng thái tổng quan (Top Metric Strip):
- Lời chào cá nhân hóa: *"Lịch rảnh làm việc tuần này"* kèm avatar CarePartner và huy hiệu Hạng (Đồng/Bạc/Vàng/Kim Cương).
- **3 thẻ thống kê nhanh (Quick Stat Cards):**
  1. **Tổng thời gian rảnh:** Hiển thị số lớn (VD: `24.5 giờ/tuần`) kèm thanh tiến độ đạt chuẩn nhận việc tối thiểu (> 12h/tuần).
  2. **Trạng thái sẵn sàng ghép:** Huy hiệu `ĐANG BẬT NHẬN ĐƠN` với chấm xanh pulsating. Nút chuyển đổi (Toggle switch) cho phép tạm ngưng nhận việc khi bận thi cử.
  3. **Thưởng ELO Lịch rảnh:** Thẻ nhỏ nền gradient cam nhạt: `+15 điểm ELO duy trì lịch rảnh ổn định 4 tuần liên tiếp`.

#### 2. Bộ tạo lịch nhanh 1 chạm (Quick Presets Bar):
- Hàng nút bấm bo tròn viền xám mềm mại:
  - ⚡ *Tối các ngày trong tuần (T2-T6: 18h - 21h)*
  - ☀️ *Cuối tuần trọn vẹn (T7-CN: 8h - 17h)*
  - 🎓 *Lịch rảnh buổi sáng (T2-T4-T6: 7h30 - 11h30)*
  - 🔄 *Sao chép lịch từ tuần trước*
- Khi bấm vào các preset, hệ thống tự động điền và highlight các ô tương ứng trên bảng tuần trước khi người dùng bấm xác nhận lưu.

#### 3. Bảng lưới tuần trực quan (Interactive Weekly Timetable Grid) — TRỌNG TÂM:
- **Bố cục dạng ma trận (Desktop 7 cột + trục giờ bên trái):**
  - Cột tiêu đề: Thứ 2, Thứ 3, Thứ 4, Thứ 5, Thứ 6, Thứ 7, Chủ Nhật.
  - Các mốc thời gian chia rõ 3 buổi:
    - **Buổi Sáng (07:00 – 12:00)**
    - **Buổi Chiều (12:00 – 18:00)**
    - **Buổi Tối (18:00 – 22:00)**
- **Thẻ khối thời gian (Time Slot Pills) trong từng ngày:**
  - Mỗi khung giờ đã đăng ký được thể hiện thành một thẻ pill nổi bật với góc bo mềm mại:
    - **Trường hợp 1: Khung giờ rảnh (Màu xanh ngọc / Viền emerald):**
      + Hiển thị: `18:00 – 21:00 (3h)`.
      + Icon chấm tròn xanh lá biểu thị sẵn sàng nhận đơn.
      + Nút bấm xóa nhanh (icon thùng rác nhỏ) khi hover chuột.
    - **Trường hợp 2: Khung giờ đã ghép đơn (Màu xanh dương đậm / Viền blue):**
      + Hiển thị: `14:00 – 17:00 · Đơn #ECL-892`.
      + Icon chiếc khiên an toàn `verified_user` hoặc `lock`.
      + Tooltip: *"Đã có đơn ghép cặp của Phụ huynh Nguyễn Thu Hương. Khung giờ này được bảo vệ, chỉ có thể chỉnh sửa bằng cách hủy đơn qua thỏa thuận."*
    - **Trường hợp 3: Khung giờ chờ cam kết (Màu vàng hổ phách nhấp nháy):**
      + Hiển thị: `08:00 – 11:00 · Chờ cam kết (còn 8 phút)`.
- **Thao tác thêm mới trực tiếp trên lưới:**
  - Ở mỗi ô trống, khi hover hiện nút mờ `+ Thêm giờ`. Bấm vào sẽ mở popup chọn giờ nhanh ngay tại ô đó mà không cần cuộn trang.

#### 4. Form thêm khung giờ linh hoạt (Manual Add Slot Drawer / Card):
- Thiết kế nằm cạnh lưới hoặc dưới dạng modal sạch sẽ:
  - Chọn ngày trong tuần (segmented control 7 nút từ T2 đến CN).
  - Chọn Giờ bắt đầu (`time_from`) và Giờ kết thúc (`time_to`) với bộ chọn thời gian đẹp mắt (bước nhảy 30 phút).
  - **Dự báo va chạm tức thì (Real-time Conflict Preview):**
    + Nếu giờ chọn bị trùng khung giờ đã có, form lập tức đổi sang viền vàng kèm thông báo: *"Khung 18h-20h bị trùng với ca 19h-21h sẵn có. Bạn có muốn Gộp thành ca 18h-21h không?"*
    + Nút hành động nổi bật: `Gộp thành 18:00 - 21:00` (Gọi API cập nhật thay vì báo lỗi).

#### 5. Thanh liên kết phụ (Secondary Footer Links):
- Banner hướng dẫn nhẹ nhàng: *"Cần nghỉ đột xuất vào một ngày cụ thể? Không cần xóa lịch tuần — hãy dùng tính năng [Khai báo Ngày bận đột xuất](/ngay-ban/) để không bị giảm điểm ELO"*.

---

## 4. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ đoạn văn bản bên dưới và dán vào Google Stitch:

```text
Design a modern, high-end, responsive Web Application page for "CarePartner Weekly Availability Schedule" (Lịch rảnh làm việc) for the EduCareLink caregiver platform (Tailwind CSS, clean semantic HTML, Vietnam timezone UTC+7).

CONTEXT & USER PERSONA:
The user is a university student or freelance caregiver in Vietnam setting up their weekly recurring availability so the platform's Flow 1 Smart Matching Engine can automatically pair them with parents needing childcare, tutoring, or eldercare.

COLOR PALETTE & BRAND IDENTITY:
- Primary Brand: Warm energetic orange #F26522
- Available / Open Slot: Soft emerald green (#10B981, bg-emerald-50, text-emerald-800, border-emerald-200)
- Matched / Locked Slot: Trust tech blue (#2563EB, bg-blue-50, text-blue-800, border-blue-200)
- Pending Commitment: Amber pulse (#F59E0B, bg-amber-50, text-amber-800, border-amber-200)
- Neutral Canvas: Ultra-clean slate (#F8FAFC body, #FFFFFF cards, #E2E8F0 borders, #1E293B textPrimary)
- Typography: Plus Jakarta Sans / Manrope, rounded corners rounded-2xl, subtle shadows shadow-sm

DESKTOP LAYOUT (1280px+):
1. Left Fixed Sidebar (w-[260px]):
   - EduCareLink logo (Orange brandmark)
   - Menu: Tim viec (Job Feed), Viec cua toi (My Tasks), Ho so (Profile), AI Tro ly (Chatbot)
   - Sub-group "Ghep cap Flow 1":
     * Don ghep cap (/worker/match-bookings/)
     * Lich ranh ghep cap (Active link, highlighted with orange pill background)
     * Ngay ban dot xuat (/ngay-ban/)
   - Bottom worker profile snippet with avatar, name "Nguyen Van Anh", tier badge "Hang Bac"

2. Main Content Container (ml-[260px] p-8 max-w-7xl):
   - TOP HEADER:
     * Title: "Lịch rảnh làm việc & Ghép cặp tự động"
     * Subtitle: "Khai báo thời gian bạn có thể nhận ca. Hệ thống tự động ghép phụ huynh phù hợp theo vị trí và điểm tín nhiệm ELO."
     * Action Buttons: "+ Thêm khung giờ mới" (Solid Orange CTA button), "Cài đặt ngày bận" (Outline button)

   - METRIC SUMMARY ROW (3 cards in 1 row):
     * Card 1: "Tổng giờ rảnh tuần này" -> Large bold "24.5 Giờ" with small green badge "+4h so với tuần trước" and a progress bar showing target met (>12h).
     * Card 2: "Trạng thái nhận đơn" -> Large toggle switch ON with pulsing green dot "Sẵn sàng nhận ca tự động".
     * Card 3: "Điểm thưởng ELO lịch rảnh" -> "+15 Điểm" with sparkles icon and explanatory caption "Thưởng duy trì lịch ổn định".

   - QUICK PRESET TOOLBAR:
     * Label: "Mẫu lịch rảnh nhanh:"
     * Pills: "⚡ Tối các ngày trong tuần (18:00 - 21:00)", "☀️ Cả ngày cuối tuần (T7 & CN)", "🎓 Sáng T2 - T4 - T6", "📋 Sao chép từ tuần trước"

   - WEEKLY TIMETABLE GRID (7-column interactive matrix for Monday through Sunday):
     * Column headers: "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật" with date pill if current week.
     * Divided into 3 intuitive day-parts: Sáng (07:00 - 12:00), Chiều (12:00 - 18:00), Tối (18:00 - 22:00).
     * Within each day column:
       - Green card for free slot: "18:00 - 21:00" with duration tag "(3.0h)", hover reveals trash bin icon to remove and edit icon.
       - Blue card for booked slot: "14:00 - 17:00 · Đơn ghép #892" with shield icon and tooltip "Đã khoá ca - có phụ huynh đã chọn".
       - Amber card for awaiting commitment: "08:00 - 11:00 · Cần cam kết (còn 12m)" with ticking clock.
       - Empty day-parts have a subtle dashed outline with a faded "+ Thêm giờ" button on hover.

   - BOTTOM DRAWER / CARD: "Chi tiết danh sách khung giờ & Xử lý chồng lấn"
     * Clean table / card view listing all slots grouped by day of week.
     * Each row has Day, Time span, Total duration, Status badge, and Action buttons (Sửa / Xóa).
     * Smart banner when overlap occurs: Amber notification box suggesting "Khung giờ 18:00 - 20:00 bị trùng với 19:00 - 21:00. Bấm vào đây để Gộp ca thành 18:00 - 21:00".

MOBILE RESPONSIVE (375px - 768px):
- Sidebar collapses into standard bottom navigation bar (4 icons: Việc làm, Lịch rảnh, Đơn ghép, Hồ sơ).
- Weekly grid turns into an intuitive horizontal swipeable Day Picker (Mon - Sun pills at the top), selecting a day displays that day's scheduled slots in large stacked touch-friendly cards with big Delete/Edit buttons.
- Sticky bottom "+ Thêm khung giờ" FAB (Floating Action Button) for effortless mobile entry.

MICRO-INTERACTIONS:
- Hovering over any slot elevates the card with smooth shadow (transition: all 0.2s ease).
- Deleting a slot triggers a smooth confirmation modal, not a native browser alert.
- Adding a slot plays a pleasant subtle green flash animation on the newly inserted card.
- Toast notifications appear in the top-right corner with custom icons and auto-dismiss after 3.5s.
```

---

## 5. ĐẶC TẢ DỮ LIỆU BACKEND & QUY TẮC GHÉP NỐI (API CONTRACT)

Khi Coding Agent hiện thực hóa thiết kế từ Stitch vào `frontend/templates/frontend/lich_ranh.html`, **BẮT BUỘC** phải tuân theo API Contract sau:

### 5.1. Lấy danh sách lịch rảnh hiện tại:
- **Method & URL:** `GET /api/matching/carepartners/me/availability/`
- **Response Format:**
  ```json
  {
    "windows": [
      {
        "id": "c8b1a234-1234-4567-89ab-cdef01234567",
        "weekday": 0,
        "time_from": "18:00:00",
        "time_to": "21:00:00"
      },
      {
        "id": "e9f0b123-5678-4321-ba98-fedcba987654",
        "weekday": 5,
        "time_from": "08:00:00",
        "time_to": "17:00:00"
      }
    ]
  }
  ```
  *(Lưu ý: `weekday` từ `0` = Thứ 2 đến `6` = Chủ nhật).*

### 5.2. Thêm mới 1 khung giờ:
- **Method & URL:** `POST /api/matching/carepartners/me/availability/`
- **Body:** `{"weekday": 0, "time_from": "18:00", "time_to": "21:00"}`
- **Xử lý mã lỗi 400 chồng lấn (Overlap):**
  - Khi backend trả về:
    ```json
    {
      "code": "overlap_windows",
      "detail": "Khung giờ này chồng lấn khung đã có trong cùng ngày.",
      "merge_suggestion": {
        "id": "...",
        "weekday": 0,
        "time_from": "18:00:00",
        "time_to": "22:00:00"
      }
    }
    ```
  - Giao diện phải bắt được `merge_suggestion` và hiển thị nút: **"Gộp thành [time_from] - [time_to]"** thay vì chỉ báo lỗi thô cho người dùng.

### 5.3. Xóa khung giờ:
- **Method & URL:** `DELETE /api/matching/carepartners/me/availability/{id}/`
- **Trường hợp 409 Conflict:**
  - Nếu khung giờ này đang bị giữ bởi đơn ghép cặp Flow 1 (`code: availability_locked_by_booking`), hiển thị modal giải thích: *"Khung giờ này đang có ca làm việc đã được phụ huynh đặt. Vui lòng hủy đơn hoặc hoàn thành ca trước khi xóa lịch rảnh"*.
