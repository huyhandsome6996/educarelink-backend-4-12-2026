# PROMPT THIẾT KẾ GOOGLE STITCH — TRANG ĐĂNG VIỆC TRÔNG TRẺ TẠI NHÀ
## ĐỒNG BỘ 100% CÔNG NĂNG & LOGIC NGHIỆP VỤ VỚI MOBILE (CHILDCARE FORM)

---

### MỤC TIÊU THIẾT KẾ:
Thiết kế trang web **EduCareLink — Đăng việc Trông trẻ tại nhà (Childcare)** theo phong cách **Google Stitch Consumer App / Modern Family-Tech Bento Grid** cao cấp, trực quan và ấm áp.

> **NGUYÊN TẮC CỐT LÕI:**
> *"Mobile và Web cùng gọi chung 1 API backend (`POST /api/matching/jobs/` và `POST /api/matching/jobs/<id>/publish/`), cùng phục vụ một mục đích kết nối Phụ huynh với Bảo mẫu/CarePartner — chúng là 1 người ở 2 mặt trận. Vì vậy, mọi trường dữ liệu, validation, trạng thái và trải nghiệm phải đạt chuẩn Parity 100% với Mobile `ChildcareForm.js`."*

---

### PROMPT CHI TIẾT (COPY NGUYÊN VĂN DƯỚI ĐÂY DÁN VÀO GOOGLE STITCH):

```markdown
Design a modern, high-end, responsive Vietnamese web application interface for "EduCareLink — Đăng việc Trông trẻ tại nhà" (In-Home Childcare / Babysitting Posting).
The interface must deliver 100% functional parity with the EduCareLink Mobile App (ChildcareForm) and integrate with the Django + Tailwind + Leaflet ecosystem.

### 1. BRAND IDENTITY & DESIGN LANGUAGE:
- Platform: EduCareLink (Phụ huynh kết nối CarePartner / Bảo mẫu uy tín)
- Project Logo: Must display official logo image at `/static/images/logo.png` (never generic SVG text or random icons)
- Favicon: `/static/images/favicon-32.png` and `/static/images/favicon.ico`
- Typography:
  * Headline / Display / Numbers: 'Manrope', sans-serif (wght 600, 700, 800, tracking-tight)
  * Body text & Form inputs: 'Plus Jakarta Sans', sans-serif (wght 400, 500, 600, 700)
  * Icon font: 'Material Symbols Outlined'
- Color Palette:
  * Brand Orange: #F26522 (Tailwind primary brand), Hover: #E05315, Tint: rgba(242, 101, 34, 0.08), Subtle: rgba(242, 101, 34, 0.12)
  * Obsidian Navy/Dark: #1A1A2E (Primary text & dark accents), Slate-800: #232338, Slate-500: #64748B
  * Trust Emerald: #10B981, Emerald-50: #ECFDF5, Emerald-800: #065F46 (Escrow & Verification badges)
  * Surface Background: #F8F9FB (Warm ultra-clean canvas)
  * Card Background: #FFFFFF with subtle border #E2E8F0 and multi-tier shadows `box-shadow: 0 4px 20px rgba(0,0,0,0.03)`

### 2. PAGE LAYOUT & SIDEBAR ARCHITECTURE (CRITICAL):
- Must preserve Django template tags: `{% load static %}`, `{% include 'frontend/_matching_common.html' %}`, and `{% include 'frontend/_parent_chrome.html' with active_tab='matching' %}`.
- Desktop layout constraint: The Parent Sidebar is 260px wide (`w-[260px]`) fixed on the left.
  * Therefore, the `<header>` MUST have class `lg:ml-[260px]`
  * The `<main>` container MUST have class `lg:ml-[260px]`
  * The mobile bottom floating bar `<aside>` MUST have class `lg:hidden` (Desktop has a sticky right-column pricing calculator card).

### 3. COMPONENT BREAKDOWN (BENTO GRID 12 COLS):

#### A. STICKY TOP NAVIGATION BAR (lg:ml-[260px]):
- Left side:
  * Back button: Links to `{% url 'frontend:dang_viec_select' %}` with arrow_back icon and label "Chọn lại loại việc"
  * Divider vertical bar
  * Official Project Logo: `<img src="/static/images/logo.png" class="w-9 h-9 rounded-xl object-contain">`
  * Title: "EduCareLink" + Pill badge "Trông Trẻ Tại Nhà" (bg-orange-100 text-brand-600)
  * Subtitle: "Bảo mẫu & CarePartner xác thực CCCD, kỹ năng sơ cứu và chăm sóc bé"
- Right side:
  * Safety Trust Pill: "100% CarePartner xác thực & Ký quỹ MoMo" (Green emerald badge with shield icon, clicking opens Trust Modal #trustModal)
  * AI Assistant Shortcut: Robot icon linking to `{% url 'frontend:chatbot' %}`

#### B. HERO TRUST BANNER:
- Dark gradient banner (Obsidian #1A1A2E with warm orange ambient blur)
- Eyebrow pill: "Chăm sóc bé tận tâm & An toàn tuyệt đối tại nhà"
- Headline: "Tìm người trông trẻ, chơi cùng bé và chăm sóc an tâm mỗi ngày"
- Description: "Kết nối nhanh bảo mẫu mầm non, sinh viên điều dưỡng/sư phạm yêu trẻ trong bán kính gần nhất. Đảm bảo lý lịch trong sạch và tác phong chuẩn mực."
- 3 mini trust metric cards:
  1. "100%": Đã xác minh danh tính, CCCD và lý lịch
  2. "0đ": Không thu bất kỳ phí môi giới phụ huynh
  3. "< 15p": Có CarePartner quanh khu vực nhận trông bé

#### C. LEFT COLUMN (8 COLS) — MAIN FORM SECTIONS:

##### CARD 1: THÔNG TIN BÉ & NHIỆM VỤ CHĂM SÓC
1. Độ tuổi của bé (`child_age_group` - 5 nhóm tuổi chuẩn backend `CHILD_AGE_GROUPS`):
   Render thành 5 interactive selectable cards/pills (Single selection):
   - `0_to_12_months`: "0 - 12 tháng" (Subtitle: Sơ sinh & ăn dặm, Icon: 🍼)
   - `1_to_3_years`: "1 - 3 tuổi" (Subtitle: Tập đi / Nhà trẻ, Icon: 🧸) [Mặc định chọn]
   - `3_to_6_years`: "3 - 6 tuổi" (Subtitle: Lớp Mầm / Mẫu giáo, Icon: 🎨)
   - `6_to_10_years`: "6 - 10 tuổi" (Subtitle: Tiểu học & bài tập, Icon: 📚)
   - `over_10_years`: "Trên 10 tuổi" (Subtitle: Kèm học & kỹ năng, Icon: 🧒)
2. Số lượng trẻ (`number_of_children`):
   - Bộ điều khiển Stepper tăng/giảm với nút Minus (-) và Plus (+) từ 1 đến 5 bé.
   - Nhãn hiển thị số lượng lớn kèm badge (VD: "1 bé", "2 bé - Phụ phí +20%").
3. Việc cần chăm sóc (`care_duties` - 7 việc chuẩn backend `CARE_DUTIES` - Multi-select):
   Render thành lưới 2 cột hoặc chip cards có checkbox tùy chỉnh, nhấp để bật/tắt:
   - `general_care`: "Chăm sóc chung" (🌟) [Mặc định chọn]
   - `feeding`: "Cho ăn / Ăn dặm" (🥣) [Mặc định chọn]
   - `bathing`: "Tắm rửa & Vệ sinh" (🛁)
   - `sleep_monitoring`: "Trông giấc ngủ" (😴) [Mặc định chọn]
   - `play_activities`: "Vui chơi & Vận động" (🧩) [Mặc định chọn]
   - `homework_help`: "Hỗ trợ bài tập" (📖)
   - `light_chores`: "Rửa bình & dọn dẹp đồ chơi" (🍼)
4. Lưu ý dị ứng / bệnh lý (`medical_allergy_notes` - Optional):
   - Input text: Placeholder "VD: Bé dị ứng tôm cua, cần rửa tay sát khuẩn trước khi bế, không cho bé ăn ngọt sau 7h tối..."

##### CARD 2: LỊCH TRÔNG TRẺ & THỜI LƯỢNG
1. Ma trận chọn ngày (14 ngày liên tiếp dạng rolling calendar chips):
   - Hiển thị thứ (T2, T3... CN) và ngày (18, 19, 20...).
   - Bấm để chọn nhiều ngày (multi-date selection).
   - Nút chọn nhanh "+ Chọn cả tuần T2 đến T6" và "+ Chọn T2-T4-T6".
2. Danh sách ngày đã chọn:
   - Hiển thị các badge ngày định dạng "T3, 19/09" kèm nút "✕" để xóa nhanh.
3. Khung giờ trông trẻ:
   - Giờ bắt đầu (`time_from`): Input time (mặc định "08:00")
   - Giờ kết thúc (`time_to`): Input time (mặc định "17:00")
   - Bộ chọn nhanh thời lượng (Duration Presets):
     * "4.0h (Nửa ngày sáng)"
     * "4.0h (Nửa ngày chiều)"
     * "8.0h (Cả ngày)" [Mặc định]
     * "9.0h (Giờ hành chính)"

##### CARD 3: ĐỊA CHỈ NHÀ & BẢN ĐỒ ĐỊNH VỊ
- Tích hợp Leaflet Map Picker thực tế thông qua hàm `initMapPicker` từ `_matching_common.html`:
  * Ô tìm kiếm địa chỉ `#mapSearchInput` (gọi proxy geocoding backend)
  * Nút GPS `#btnGpsCurrent`: "Dùng vị trí hiện tại"
  * Thẻ hiển thị địa chỉ đã chọn `#mapAddr`
  * Bản đồ Leaflet container `#map` (chiều cao h-72 rounded-2xl)
  * Input ẩn `#lat` và `#lng`
  * Ô nhập ghi chú vị trí `#inputLocationNote`: Placeholder "VD: Nhà số 12 ngõ 45, bấm chuông cổng màu xám hoặc gọi số mẹ đón..."

##### CARD 4: YÊU CẦU CỤ THỂ & GHI CHÚ
- Thẻ gợi ý nhanh (Quick Tags):
  * "+ Không dùng ĐT khi trông"
  * "+ Biết sơ cứu bé"
  * "+ Có bằng Mầm non"
  * "+ Kể chuyện đọc sách"
  * "+ Biết nấu ăn dặm"
- Textarea yêu cầu chi tiết (`specific_requirements`): Placeholder "VD: Cần cô bảo mẫu dịu dàng, kiên nhẫn chơi lego cùng bé, đúng giờ và trung thực..."

#### D. RIGHT COLUMN (4 COLS STICKY) — REACTIVE PRICING CALCULATOR:
- Card cố định khi cuộn trang (`lg:sticky lg:top-24`):
  * Header: "Dự tính học phí & Ký quỹ" + Badge "Minh bạch 100%"
  * Input mức giá/giờ (`inputHourlyRate`, mặc định 80,000 đ/h, cho phép chỉnh sửa trực tiếp)
  * 4 nút điều chỉnh nhanh: "-10k", "+10k", "+20k", "+50k"
  * Chi tiết tính toán phản ứng (Reactive Breakdown):
    - Thời lượng 1 buổi: VD "8.0 giờ (480 phút)"
    - Chi phí 1 buổi: VD "640,000 đ"
    - Số buổi trông: VD "5 buổi"
    - Phụ phí số lượng trẻ (nếu > 1 bé): Tự động tính thêm 20% cho mỗi bé phụ
    - Tổng chi phí dự tính: Render số to đậm màu cam (VD: "3,200,000 đ")
  * Box bảo chứng: "Ký quỹ MoMo an toàn: Phụ huynh giữ tiền qua ký quỹ, chỉ giải ngân sau khi buổi trông hoàn tất an toàn."
  * Nút Submit chính `#btnSubmitMain`:
    "Đăng việc & Tìm Bảo Mẫu" (Gradient cam, icon radar quét sóng, hiệu ứng pulse nhẹ)
  * Quy trình 3 bước tuyển chọn bảo mẫu.

#### E. MOBILE BOTTOM FLOATING BAR (<1024px):
- Thẻ `<aside class="fixed bottom-[56px] inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 lg:hidden px-4 py-3">`
- Hiển thị tóm tắt: Số buổi, số bé, tổng tiền VNĐ, và nút bấm "Đăng việc ngay" `#btnBottomSubmit`.

#### F. MODALS:
1. Modal Radar Quét Sóng (`#radarModal`):
   - Vòng tròn đồng tâm xoay radar beam (`radar-beam`) với hiệu ứng radar quét bán kính 5km.
   - Logo EduCareLink trung tâm.
   - Các avatar nổi đại diện ứng viên xung quanh (SP: Sư phạm mầm non, YD: Y Dược, CD: Cao đẳng...).
   - Trạng thái 1 (Searching): "Đang kết nối CarePartner phù hợp..."
   - Trạng thái 2 (Success): Checkmark xanh, "Đăng việc thành công! Đang chuyển hướng sang danh sách ứng viên..."
2. Modal Ký Quỹ & Cam Kết (`#trustModal`):
   - Giải thích cơ chế đối soát CCCD, ký quỹ MoMo và quyền đổi bảo mẫu miễn phí nếu không hợp.

#### G. JAVASCRIPT BUSINESS LOGIC (PARITY VỚI MOBILE):
```javascript
// State Model
const state = {
  child_age_group: '1_to_3_years',
  number_of_children: 1,
  care_duties: ['general_care', 'feeding', 'sleep_monitoring', 'play_activities'],
  medical_allergy_notes: '',
  specific_requirements: '',
  dates: [], // YYYY-MM-DD
  time_from: '08:00',
  time_to: '17:00',
  session_duration: 8.0,
  hourly_rate: 80000,
  latitude: 16.4637,
  longitude: 107.5909,
  location_note: ''
};

// Pricing Calculation:
// perSession = hourly_rate * session_duration * (1 + (number_of_children - 1) * 0.2);
// total = perSession * dates.length;

// Submit Handler:
// 1. Validate: dates.length >= 1, care_duties.length >= 1, duration >= 30m, lat/lng selected.
// 2. Open #radarModal (searching state).
// 3. Call POST /api/matching/jobs/ with job_type: 'childcare'.
// 4. Call POST /api/matching/jobs/{id}/publish/.
// 5. Transition #radarModal to success state.
// 6. Redirect to window.location.href = '/ung-vien/' + id + '/'.
```

Produce the clean, semantic, production-ready HTML template file with inline Tailwind styles, responsive classes, and error-free JavaScript.
```
```

---

### HƯỚNG DẪN CÁC BƯỚC THỰC HIỆN TIẾP THEO:
1. Bạn sao chép toàn bộ đoạn mã trong khối `markdown` ở trên và dán vào Google Stitch để sinh file giao diện HTML hoàn chỉnh.
2. Sau khi Stitch trả về code, lưu vào file `frontend/templates/frontend/dang_viec_trong_tre.html`.
3. Kiểm tra bằng `python manage.py check` và chạy unit test matching.
4. Commit và push trực tiếp lên nhánh `main` để Render tự động build và deploy!
