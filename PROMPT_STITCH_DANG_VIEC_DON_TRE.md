# PROMPT THIẾT KẾ GOOGLE STITCH — TRANG ĐĂNG VIỆC ĐÓN TRẺ TAN TRƯỜNG
## ĐỒNG BỘ 100% CÔNG NĂNG & LOGIC NGHIỆP VỤ VỚI MOBILE (PICKUP FORM)

---

### MỤC TIÊU THIẾT KẾ:
Thiết kế trang web **EduCareLink — Đăng việc Đón trẻ tan trường (Pickup & School Escort)** theo phong cách **Google Stitch Consumer App / Modern Family-Tech Bento Grid** cao cấp, an tâm và trực quan.

> **NGUYÊN TẮC CỐT LÕI:**
> *"Mobile (`mobile/src/screens/Parent/PickupForm.js`) và Web (`frontend/templates/frontend/dang_viec_don_tre.html`) cùng gọi chung 1 API backend (`POST /api/matching/jobs/` và `POST /api/matching/jobs/<id>/publish/`). Cả hai phục vụ chung một công việc bảo vệ an toàn cho bé trên đường tan học — chúng là 1 người ở 2 mặt trận. Mọi trường dữ liệu, validation, trạng thái và trải nghiệm phải đạt chuẩn Parity 100% với Mobile."*

---

### PROMPT CHI TIẾT (COPY NGUYÊN VĂN DƯỚI ĐÂY DÁN VÀO GOOGLE STITCH):

```markdown
Design a modern, high-end, responsive Vietnamese web application interface for "EduCareLink — Đăng việc Đón trẻ tan trường" (Safe School Pickup & Transit Posting).
The interface must deliver 100% functional parity with the EduCareLink Mobile App (PickupForm.js) and integrate with the Django + Tailwind + Leaflet ecosystem.

### 1. BRAND IDENTITY & DESIGN LANGUAGE:
- Platform: EduCareLink (Nền tảng kết nối Phụ huynh với CarePartner đưa đón trẻ an toàn hàng đầu Việt Nam)
- Project Logo: Must display official project logo image at `/static/images/logo.png` (never generic SVG text or random icons)
- Favicon: `/static/images/favicon-32.png` and `/static/images/favicon.ico`
- Typography:
  * Headline / Display / Numbers: 'Manrope', sans-serif (wght 600, 700, 800, tracking-tight)
  * Body text & Form inputs: 'Plus Jakarta Sans', sans-serif (wght 400, 500, 600, 700)
  * Icon font: 'Material Symbols Outlined'
- Color Palette:
  * Brand Orange: #F26522 (Tailwind primary brand), Hover: #E05315, Tint: rgba(242, 101, 34, 0.08), Subtle: rgba(242, 101, 34, 0.12)
  * Obsidian Navy/Dark: #1A1A2E (Primary text & dark accents), Slate-800: #232338, Slate-500: #64748B
  * Trust Emerald: #10B981, Emerald-50: #ECFDF5, Emerald-800: #065F46 (Escrow & Safety badges)
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
  * Title: "EduCareLink" + Pill badge "Đón Trẻ Tan Trường" (bg-orange-100 text-brand-600)
  * Subtitle: "CarePartner đối soát bằng lái A1, xe máy an toàn, có mũ bảo hiểm trẻ em"
- Right side:
  * Safety Trust Pill: "100% CarePartner xác thực & Ký quỹ MoMo" (Green emerald badge with shield icon, clicking opens Trust Modal #trustModal)
  * AI Assistant Shortcut: Robot icon linking to `{% url 'frontend:chatbot' %}`

#### B. HERO TRUST BANNER:
- Dark gradient banner (Obsidian #1A1A2E with warm orange ambient blur)
- Eyebrow pill: "An toàn giao thông & Đúng giờ tuyệt đối"
- Headline: "Đón con tan trường an tâm, đón hộ tại cổng & đưa về tận cửa"
- Description: "Giải pháp tin cậy cho phụ huynh bận rộn. CarePartner sinh viên ưu tú nhận đón bé tại trường, chụp ảnh check-in báo cáo lộ trình real-time và bàn giao tận tay người thân."
- 3 mini trust metric cards:
  1. "100%": Đã đối soát GPLX & Mũ bảo hiểm chuẩn
  2. "GPS": Giám sát vị trí đón trả trực tiếp
  3. "< 15p": Có CarePartner quanh trường nhận đón

#### C. LEFT COLUMN (8 COLS) — MAIN FORM SECTIONS:

##### CARD 1: ĐIỂM ĐÓN & THÔNG TIN BÉ
1. Tên trường học / Điểm đón (`school_or_pickup_place_name` - Bắt buộc):
   - Input text lớn: Placeholder "VD: Trường Tiểu học Vĩnh Ninh, TP. Huế..."
   - Quick chips chọn loại trường:
     * "🏫 Tiểu học"
     * "🧸 Mầm non"
     * "🇬🇧 TT Tiếng Anh"
     * "🥋 Lớp năng khiếu"
2. Độ tuổi của bé (`child_age_group` - Bắt buộc):
   - 3 lựa chọn thẻ nút (Cards):
     * `3_to_6_years`: "3 - 6 tuổi" (Mầm non / Mẫu giáo)
     * `6_to_10_years`: "6 - 10 tuổi" (Tiểu học) [Mặc định chọn]
     * `over_10_years`: "Trên 10 tuổi" (THCS / Cấp 2)
3. Số lượng trẻ đón (`number_of_children` - Bắt buộc):
   - Stepper (- / +) từ 1 đến 2 bé (Giới hạn tối đa 2 bé trên 1 xe máy để bảo đảm an toàn).
4. Bản đồ Leaflet vị trí cổng trường đón (`pickup_location` - Bắt buộc):
   - Ô tìm kiếm trường / địa chỉ `#mapSearchInput`
   - Nút GPS `#btnGpsCurrent`: "Dùng vị trí hiện tại"
   - Thẻ hiển thị địa chỉ trường `#mapAddr`
   - Container bản đồ Leaflet `#map` (h-64 rounded-2xl)
   - Input ẩn `#lat` và `#lng`
5. Ghi chú điểm đón (`pickup_location_note` - Tuỳ chọn):
   - Input text: Placeholder "VD: Đón ở Cổng chính đường Nguyễn Huệ, bé đeo balo xanh lá, cô giáo chủ nhiệm là cô Lan..."

##### CARD 2: ĐIỂM ĐẾN & PHƯƠNG THỨC DI CHUYỂN
1. Loại điểm đến (`destination_type` - Bắt buộc):
   Render 2 thẻ radio tùy chỉnh lớn:
   - `parent_home`: "Về nhà phụ huynh" (Mặc định — địa chỉ nhà đã lưu của gia đình)
   - `other_address`: "Địa chỉ khác (Nhà ông bà, lớp học thêm, trung tâm...)"
2. Khu vực điểm đến khác (Chỉ hiện ra khi chọn `other_address`):
   - Ô tìm kiếm điểm đến `#destSearchInput`
   - Nút GPS điểm đến `#btnDestGps`
   - Bản đồ Leaflet điểm đến `#destMap` (h-56 rounded-2xl)
   - Input ẩn `#destLat` và `#destLng`
   - Thẻ hiển thị địa chỉ điểm đến `#destAddr`
3. Ghi chú điểm đến (`destination_note` - Tuỳ chọn):
   - Input text: Placeholder "VD: Bàn giao bé cho bà nội ở nhà số 18 Lê Lợi, TP. Huế, gọi điện trước 5 phút..."
4. Phương thức di chuyển (`transport_method` - 3 chuẩn `TRANSPORT_METHODS`):
   Render thành 3 card chi tiết có icon:
   - `carepartner_vehicle`: "CarePartner có xe máy riêng" (Icon: bicycle, Yêu cầu: Có bằng lái A1 + Mũ bảo hiểm trẻ em chuẩn) [Mặc định chọn]
   - `walking`: "Đi bộ (Khoảng cách dưới 800m)" (Icon: directions_walk, Dắt tay bé qua đường, trường sát khu dân cư)
   - `parent_arranged`: "Phụ huynh đặt xe / Xe gia đình" (Icon: directions_car, CarePartner đi kèm cùng bé trên xe GrabCar hoặc xe riêng)
5. Ghi chú phương tiện (`transport_note` - Tuỳ chọn):
   - Input text: Placeholder "VD: Bé có mũ bảo hiểm riêng trong balo, xe máy cần có gương chiếu hậu..."

##### CARD 3: LỊCH ĐÓN & KHUNG GIỜ
1. Ma trận ngày đón (14 ngày rolling calendar chips):
   - Hiển thị thứ (T2, T3... CN) và ngày trong tháng.
   - Bấm chọn nhiều ngày đón.
   - Nút chọn nhanh "+ Chọn cả tuần T2 đến T6" và "+ Chọn T2-T4-T6".
2. Danh sách ngày đã chọn:
   - Huy hiệu ngày dạng "T5, 18/09" kèm nút "✕" để xóa.
3. Khung giờ đón:
   - Giờ đón (`pickup_time_from`): Input time (mặc định "16:30")
   - Giờ hoàn thành bàn giao (`pickup_time_to`): Input time (mặc định "17:30")
   - Gợi ý: "Thời gian thông thường cho 1 chuyến đưa đón là 45 - 60 phút".

##### CARD 4: YÊU CẦU AN TOÀN & GHI CHÚ
- Thẻ an toàn chọn nhanh (Quick Safety Tags):
  * "+ Chụp ảnh check-in cổng trường"
  * "+ Gọi điện khi về tới nhà"
  * "+ Dắt tay qua đường"
  * "+ Đội mũ bảo hiểm riêng của bé"
  * "+ Không rẽ vào nơi khác"
- Textarea yêu cầu chi tiết (`specific_requirements`):
  Placeholder "VD: Bé tan học lúc 16h30, cần đón đúng giờ tránh bé đứng một mình. Yêu cầu CarePartner đi chậm, đội mũ bảo hiểm cho bé và gọi mẹ khi đã về nhà..."

#### D. RIGHT COLUMN (4 COLS STICKY) — REACTIVE PRICING CALCULATOR:
- Card cố định khi cuộn trang (`lg:sticky lg:top-24`):
  * Header: "Dự tính chi phí đưa đón" + Badge "Minh bạch 100%"
  * Input mức phí đề xuất mỗi lượt/giờ (`inputHourlyRate`, mặc định 60,000 đ/lượt, cho phép nhập tự do)
  * Nút tăng giảm nhanh: "-10k", "+10k", "+20k"
  * Chi tiết tính toán phản ứng (Reactive Breakdown):
    - Đơn giá 1 chuyến: VD "60,000 đ"
    - Số ngày đón đã chọn: VD "5 ngày"
    - Phụ phí số lượng bé (nếu 2 bé): Tự động tính thêm +20,000đ/chuyến
    - Tổng chi phí đưa đón dự kiến: Render số to đậm màu cam (VD: "300,000 đ")
  * Box bảo chứng an toàn: "Ký quỹ MoMo an toàn: Tiền được giữ tạm thời, chỉ giải ngân cho CarePartner sau khi bé đã về đến nhà an toàn."
  * Nút Submit chính `#btnSubmitMain`:
    "Đăng việc & Tìm CarePartner Đón Bé" (Gradient cam, icon radar quét sóng, hiệu ứng pulse nhẹ)
  * Quy trình 3 bước đưa đón an toàn (Đón tại trường $\rightarrow$ Check-in ảnh $\rightarrow$ Bàn giao tận nhà).

#### E. MOBILE BOTTOM FLOATING BAR (<1024px):
- Thẻ `<aside class="fixed bottom-[56px] inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 lg:hidden px-4 py-3">`
- Hiển thị: Số buổi đón, tổng tiền VNĐ, và nút bấm "Đăng việc đón bé" `#btnBottomSubmit`.

#### F. MODALS:
1. Modal Radar Quét Sóng (`#radarModal`):
   - Animation radar quét bán kính 3 - 5km tại TP. Huế.
   - Logo EduCareLink trung tâm.
   - Floating CarePartner badges (ĐH Sư Phạm Huế, ĐH Y Dược Huế, ĐH Ngoại Ngữ Huế...).
   - Trạng thái 1 (Searching): "Đang kết nối CarePartner có phương tiện gần trường..."
   - Trạng thái 2 (Success): Checkmark xanh, "Đăng việc thành công! Đang mở danh sách ứng viên..."
2. Modal Ký Quỹ & Bảo Hiểm Chuyến Đi (`#trustModal`):
   - Thông tin về 100% đối soát bằng lái A1, CCCD, và cơ chế bảo chứng ký quỹ MoMo.

#### G. JAVASCRIPT BUSINESS LOGIC (PARITY VỚI MOBILE PICKUPFORM.JS):
```javascript
// State Model
const state = {
  school_or_pickup_place_name: '',
  child_age_group: '6_to_10_years',
  number_of_children: 1,
  pickup_dates: [], // YYYY-MM-DD
  pickup_time_from: '16:30',
  pickup_time_to: '17:30',
  pickup_location_note: '',
  destination_type: 'parent_home', // 'parent_home' | 'other_address'
  destination_note: '',
  transport_method: 'carepartner_vehicle', // 'carepartner_vehicle' | 'walking' | 'parent_arranged'
  transport_note: '',
  specific_requirements: '',
  hourly_rate: 60000,
  latitude: 16.4637,
  longitude: 107.5909,
  dest_latitude: null,
  dest_longitude: null,
  dest_address: ''
};

// Pricing Calculation:
// perTrip = state.hourly_rate + (state.number_of_children > 1 ? 20000 : 0);
// total = perTrip * state.pickup_dates.length;

// Submit Handler:
// 1. Validate: school_or_pickup_place_name not empty, pickup_dates.length >= 1, lat/lng picked.
//    If destination_type === 'other_address', dest_latitude/dest_longitude must be picked.
// 2. Open #radarModal (searching state).
// 3. Call POST /api/matching/jobs/ with job_type: 'pickup', pickup_dates, pickup_time_from, pickup_time_to...
// 4. Call POST /api/matching/jobs/{id}/publish/.
// 5. Transition #radarModal to success state.
// 6. Redirect to window.location.href = '/ung-vien/' + id + '/'.
```

Produce the clean, semantic, production-ready HTML template file with inline Tailwind styles, responsive classes, and error-free JavaScript.
```
```

---

### HƯỚNG DẪN CÁC BƯỚC THỰC HIỆN TIẾP THEO:
1. Bạn sao chép toàn bộ khối `markdown` ở trên và dán vào Google Stitch để sinh mã HTML hoàn chỉnh.
2. Sau khi có mã nguồn từ Stitch, áp dụng vào file `frontend/templates/frontend/dang_viec_don_tre.html`.
3. Kiểm tra cú pháp bằng `python manage.py check`.
4. Commit và push trực tiếp lên nhánh `main` để Render tự động deploy!
