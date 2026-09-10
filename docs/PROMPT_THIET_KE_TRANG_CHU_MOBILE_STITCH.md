# PROMPT THIẾT KẾ GOOGLE STITCH: TRANG CHỦ PHỤ HUYNH DI ĐỘNG (PARENT HOME SCREEN REDESIGN)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS hoàn chỉnh từ Google Stitch (`labs.google.com/stitch`) để nâng cấp toàn diện màn hình **Trang chủ Phụ huynh** (`ParentHomeScreen.js`) trên ứng dụng di động EduCareLink.  
> **Tôn chỉ nhận diện:** **MÀU CAM THƯƠNG HIỆU `#F26522` LÀ MÀU CHỦ ĐẠO TỐI THƯỢNG (ABSOLUTE SIGNATURE PRIMARY BRAND COLOR)**. Toàn bộ trải nghiệm thị giác phải toát lên năng lượng ấm áp gia đình, uy tín công nghệ và phân cấp trực quan vượt bậc (chuẩn mực kết hợp giữa Grab, Airbnb và Apple Human Interface Guidelines).  
> **Ngôn ngữ UI:** Tiếng Việt 100% (chuẩn xác thuật ngữ EduCareLink).  
> **File mobile đích:** `mobile/src/screens/Parent/ParentHomeScreen.js`  
> **Viewport di động:** 390×844px (iPhone 14/15/16) và 412×915px (Android flagship).

---

## 1. NGUYÊN TẮC BẢNG MÀU CHỦ ĐẠO (THE SIGNATURE ORANGE PALETTE)

### 1.1. Bản sắc màu sắc EduCareLink:
Màu sắc đại diện cho EduCareLink là **Sắc Cam Năng Lượng & Ấm Áp (`#F26522`)** — tượng trưng cho sự chở che của gia đình, ngọn lửa tri thức của các bạn sinh viên gia sư tài năng, và sức sống tươi vui của trẻ nhỏ.

Khi thiết kế trên Stitch, **tuyệt đối không để ứng dụng bị biến thành màu xanh hay xám lạnh**. Sắc cam phải là gam màu thống trị mọi điểm chạm thị giác quan trọng:

| Vai trò | Mã Màu (HEX) | Tailwind Token | Ứng dụng thực tế trên màn hình |
|---|---|---|---|
| **Màu chủ đạo (Primary)** | **`#F26522`** | `bg-[#F26522]`, `text-[#F26522]` | Header chính, nút CTA Đăng việc, nút AI giữa tab bar, badge nổi bật, icon active |
| **Cam đậm nhấn (Primary Dark)** | **`#EA580C`** / **`#C2410C`** | `from-[#F26522] to-[#EA580C]` | Gradient dải Header trên cùng, trạng thái hover/active của nút bấm |
| **Cam nền êm dịu (Primary Light)** | **`#FFF4ED`** | `bg-[#FFF4ED]` | Nền các thẻ dịch vụ, chip danh mục, ô icon, thẻ tóm tắt học phí |
| **Cam viền nổi (Primary Border)** | **`#FED7AA`** | `border-[#FED7AA]` | Viền card dịch vụ, viền pill active, viền khung tìm kiếm |
| **Đổ bóng phát sáng cam (Glow)** | `rgba(242, 101, 34, 0.3)` | `shadow-[0_8px_20px_-4px_rgba(242,101,34,0.35)]` | Hiệu ứng đổ bóng có màu cho các nút bấm và thẻ hành động chính |
| **Màu phụ bổ trợ 1 (An toàn/Trông trẻ)** | `#10B981` / `#0D9488` | `bg-emerald-500`, `text-emerald-700` | Thẻ Trông trẻ, huy hiệu "Đã kiểm duyệt CCCD", trạng thái Live Online |
| **Màu phụ bổ trợ 2 (Live GPS/Đón trẻ)** | `#2563EB` | `bg-blue-600`, `text-blue-700` | Thẻ Đón trẻ tan học, huy hiệu Live GPS Tracking, định vị lộ trình |
| **Nền app (Background)** | `#F8FAFC` | `bg-slate-50` | Nền canvas sạch sẽ, tạo độ tương phản cao cho các thẻ card trắng bo cong |
| **Màu chữ chính (Typography)** | `#0F172A` | `text-slate-900` | Tiêu đề in đậm, giá tiền, tên CarePartner |
| **Màu chữ phụ (Secondary Text)** | `#475569` | `text-slate-600` | Chú thích, thời gian, địa chỉ, hướng dẫn |

---

## 2. PHÂN TÍCH HIỆN TRẠNG & CÁC VẤN ĐỀ CẦN GIẢI QUYẾT TRIỆT ĐỂ

1. **Header hiện tại bị chìm và thiếu chiều sâu:** Phần chào hỏi "Xin chào [Tên]" quá đơn điệu, chưa có lời chào cá nhân hóa theo buổi (sáng/chiều/tối), thiếu vị trí hiện tại của phụ huynh (VD: `📍 Cầu Giấy, Hà Nội`).
2. **Khối Ví & Điểm thưởng bị cấn:** Thẻ ví đặt đè một nửa lên ranh giới màu cam tạo cảm giác chật chội, khó bấm trên màn hình điện thoại có tai thỏ / Dynamic Island.
3. **Thiếu ô tìm kiếm thông minh / Lối tắt giọng nói:** Phụ huynh khi vào app thường muốn tìm nhanh dịch vụ hoặc nhờ AI đặt hộ bằng giọng nói tiếng Việt.
4. **Các dịch vụ bị dàn trải thành nhiều khối rời rạc:** Có cả thẻ ghép cặp Flow 1, rồi lại đến grid 2×2 dịch vụ, rồi lại đến banner quảng cáo... gây nhiễu thị giác. Cần gom thành **Action Hub 3 Trụ cột cốt lõi (Gia sư, Trông trẻ, Đón trẻ) + Trợ lý AI**.
5. **Chưa có Widget Giám sát thời gian thực (Live Care Radar):** Khi phụ huynh đang có 1 ca đón bé hoặc trông trẻ đang diễn ra, trang chủ phải tự động hiển thị thẻ định vị Live GPS kèm ảnh CarePartner, thời gian dự kiến về nhà và nút gọi điện khẩn cấp.
6. **Đơn gần đây thiếu sức sống:** Thiếu avatar người chăm sóc, thiếu xếp hạng sao (4.9★), thiếu các nút thao tác nhanh theo ngữ cảnh (*Xem Live GPS*, *Đánh giá*, *Đặt lại*).

---

## 3. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ khối text bên dưới và dán vào Google Stitch (`labs.google.com/stitch`):

```text
Design an ultra-premium, world-class Mobile Home Dashboard screen ("Trang chủ Phụ huynh EduCareLink") for the EduCareLink family caregiver platform (React Native / Mobile Web context, 390x844px iPhone 15 / Android flagship viewport, Apple HIG / Grab / Airbnb ergonomics).

CRITICAL BRAND IDENTITY RULE:
THE SIGNATURE WARM ORANGE (#F26522) IS THE ABSOLUTE PRIMARY BRAND COLOR OF THIS APPLICATION.
Do NOT make this app blue, green, or monochrome gray. The signature vibrant orange (#F26522), accompanied by deep warm amber (#EA580C), soft orange container (#FFF4ED), and warm border (#FED7AA) must proudly dominate the visual hierarchy — including the top header gradient, the main booking CTA, the AI central tab bar button, and key highlighted badges. Secondary emerald (#10B981) and mobility blue (#2563EB) are strictly auxiliary colors for Childcare and School Pickup tags.

MOBILE SCREEN ARCHITECTURE (Top to Bottom):

1. STATUS BAR & DYNAMIC ISLAND INTEGRATION:
   - Sleek 9:41 time indicator, cellular, wifi, and battery status matching modern iOS/Android frame.

2. HERO TOP BRAND APP BAR (Rich Signature Orange Gradient):
   - Background: Stunning vibrant gradient from #F26522 (Warm Brand Orange) through #EA580C to #D94E0F with subtle flowing warm curves and soft inner glow.
   - Left User Profile Area:
     * High-res circular parent avatar (42x42) with white border and glowing status dot.
     * Greeting line: "Chào buổi chiều, Chị Mai Anh 👋" (font-extrabold text-white text-[15px]).
     * Sub-line: "📍 Cầu Giấy, Hà Nội · Thứ Sáu, 18/09" (text-orange-100 text-xs flex items-center gap-1).
   - Right Action Buttons:
     * Location selector pill (glassmorphic translucent bg-white/20 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-md).
     * Notification Bell button (w-10 h-10 rounded-full bg-white/20 flex center backdrop-blur-md relative):
       - Glowing red dot with number badge "3".

3. INTEGRATED SMART SEARCH & VOICE AI COMPOSER BAR (Floating inside/below Header):
   - A captivating pill search bar (bg-white rounded-2xl p-2.5 pl-3.5 shadow-xl shadow-orange-950/10 border border-orange-100 flex items-center justify-between):
     * Left: Sparkle / AI Bot icon with gradient orange-to-violet badge.
     * Center text: "Bạn cần tìm gia sư, bảo mẫu hay đón bé hôm nay?" (text-slate-400 text-xs font-medium).
     * Right Action Cluster:
       - Microphone button with pulsating orange aura ring (bg-orange-100 text-brand-orange w-8 h-8 rounded-full flex center): "Giữ để nói tiếng Việt".
       - Search / Arrow circle button (bg-brand-orange text-white w-8 h-8 rounded-full flex center shadow-sm).

4. ELEVATED WALLET & CAREREWARDS MINI-DOCK (Dual Glassmorphic Card):
   - Pure white card with soft rounded-2xl p-3.5 shadow-md shadow-slate-200/80 border border-slate-100 flex items-center justify-between gap-3 mt-3.5:
     * Left Side (Ví EduCare):
       - Wallet icon in warm orange circle (bg-[#FFF4ED] text-[#F26522] p-2 rounded-xl).
       - Label: "Số dư Ví EduCare" (text-[10px] text-slate-500 font-semibold uppercase).
       - Value: "1.250.000đ" (font-black text-sm text-slate-900).
       - Quick action: "+ Nạp ví" (text-[11px] font-bold text-brand-orange bg-orange-50 px-2 py-0.5 rounded-md).
     * Divider: Vertical slate line (h-9 w-px bg-slate-200).
     * Right Side (CarePoints / Rewards):
       - Golden star icon in soft amber badge (bg-amber-50 text-amber-500 p-2 rounded-xl).
       - Label: "Điểm thưởng" (text-[10px] text-slate-500 font-semibold uppercase).
       - Value: "340 CarePoints" (font-black text-sm text-slate-900).
       - Quick action: "Đổi quà >" (text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md).

5. HERO CORE SERVICES GRID (The 3 Flow-1 Pillars + AI Super-Shortcut):
   A high-converting, beautifully weighted 2x2 or prominent card layout showcasing EduCareLink's 3 flagship caregiver services:

   * PILLAR 1: GIA SƯ & KÈM HỌC (Tutoring - Dominant Orange Theme)
     - Border: 1.5px border #FED7AA with left warm orange accent bar.
     - Badge: "🔥 Đặt nhiều nhất" (bg-[#FFF4ED] text-[#C2410C] font-extrabold text-[10px] px-2 py-0.5 rounded-full).
     - Icon: 3D Graduation cap & open book in dual-tone orange container.
     - Title: "Gia sư & Kèm học" (font-extrabold text-sm text-slate-900).
     - Subtitle: "Toán, Văn, Anh, Đàn, Vẽ & MC"
     - Price tag: "Từ 70.000đ/h" (font-black text-xs text-brand-orange).
     - Verification: "✓ 100% Sinh viên giỏi ĐH Top".

   * PILLAR 2: TRÔNG TRẺ TẠI NHÀ (Childcare - Gentle Emerald Theme)
     - Border: 1.5px border #A7F3D0 with left emerald accent bar.
     - Badge: "❤️ Tận tâm" (bg-emerald-50 text-emerald-700 font-extrabold text-[10px] px-2 py-0.5 rounded-full).
     - Icon: Happy smiling baby & safety heart in dual-tone emerald container.
     - Title: "Trông trẻ tại nhà" (font-extrabold text-sm text-slate-900).
     - Subtitle: "Ăn uống, vui chơi & rèn nếp tự lập"
     - Price tag: "Từ 60.000đ/h" (font-black text-xs text-emerald-600).
     - Verification: "✓ CCCD gắn chip & Sơ cấp cứu".

   * PILLAR 3: ĐÓN TRẺ TAN HỌC (School Pickup - Mobility Blue Theme)
     - Border: 1.5px border #BFDBFE with left tech blue accent bar.
     - Badge: "📍 Live GPS 24/7" (bg-blue-50 text-blue-700 font-extrabold text-[10px] px-2 py-0.5 rounded-full).
     - Icon: Commute electric vehicle with location pin.
     - Title: "Đón trẻ tan học" (font-extrabold text-sm text-slate-900).
     - Subtitle: "Đón từ cổng trường về nhà an toàn"
     - Price tag: "Từ 50.000đ/chuyến" (font-black text-xs text-blue-600).
     - Verification: "✓ Check-in ảnh & Bảo hiểm".

   * PILLAR 4: ĐĂNG VIỆC SIÊU TỐC VỚI AI (Express AI Creator Banner)
     - A wide horizontal banner card with vibrant orange-to-amber gradient (#F26522 via #F59E0B to #EA580C) with floating micro-particles:
     - Title: "⚡ Đăng việc siêu tốc trong 5s"
     - Subtitle: "Chỉ cần nói hoặc gõ tự nhiên, AI tự động chọn 8 CarePartner tốt nhất"
     - Button: "Thử ngay →" (bg-white text-brand-orange font-extrabold text-xs px-3 py-1.5 rounded-xl shadow-md).

6. ACTIVE LIVE TRACKING RADAR WIDGET (Contextual Real-time Alert):
   A high-tech floating card displayed when a job is in-progress:
   - Top Bar: Pulsing green dot "● CA ĐÓN BÉ ĐANG DIỄN RA (16:30 - 17:30)" + ETA: "~8 phút nữa tới nhà".
   - CarePartner Card:
     * Photo of verified CarePartner (Nguyễn Thùy Linh - ĐH Sư Phạm Hà Nội, 4.9★, 48 ca thành công).
     * Route snippet: "Đã đón bé tại TH Chu Văn An ➔ Đang về Chung cư Golden Land".
   - Actions:
     * Primary Button: "Xem Live GPS trên bản đồ 📍" (Full-width bg-blue-600 text-white font-bold text-xs py-2 rounded-xl).
     * Two small buttons: "📞 Gọi điện" & "🚨 Nút SOS khẩn cấp".

7. RECENT ACTIVITY & CARE HISTORY (Hoạt động gần đây):
   - Header: "Hoạt động gần đây" with "Xem tất cả (8) >" link in brand orange.
   - 2 Recent Booking Cards:
     * Card 1: "Gia sư kèm Toán lớp 5" · Hôm nay 19:00 - 21:00 · Status: "Đã cam kết nhận ca" (Amber pill #FFF4ED text-[#C2410C]) · CarePartner: Trần Minh Đức (ĐH Bách Khoa) · Action: "Xem chi tiết ca".
     * Card 2: "Đón bé tan học" · Hôm qua 16:30 · Status: "Đã hoàn thành" (Green pill #ECFDF5 text-[#047857]) · Action: "⭐️ Đánh giá 5 sao".

8. PROMOTIONAL CAROUSEL & CAREREWARDS DEALS:
   - Horizontal sliding banner cards with vibrant illustrations:
     * "Ưu đãi 50k ca Gia sư đầu tiên - Mã: EDUCARE2026"
     * "Cam kết 3 lớp EduCare Guarantee: Hoàn tiền 100% nếu không hài lòng".

9. 3-LAYER TRUST & SAFETY ASSURANCE FOOTER:
   - Compact reassurance card:
     * 🛡️ 100% CarePartner đối soát CCCD gắn chip & thẻ SV ĐH Top
     * 💳 Ký quỹ an tâm qua MoMo/VietQR (chỉ trả khi phụ huynh hài lòng)
     * 📞 Hỗ trợ phụ huynh 24/7 & Nút SOS định vị khẩn cấp

10. PERSISTENT 5-TAB BOTTOM NAVIGATION BAR:
    - Ergonomic bar with white background, border-t border-slate-200, safe area insets:
      * Tab 1: Trang chủ (Active: Brand Orange icon #F26522 with glowing indicator dot).
      * Tab 2: Công việc (My Tasks with count badge).
      * Tab 3 (RAISED CENTER FLOATING BUTTON): AI Trợ lý (Distinct elevated circle button w-13 h-13 bg-gradient-to-tr from-[#F26522] to-[#EA580C] text-white shadow-lg shadow-orange-500/40 ring-4 ring-orange-100 flex items-center justify-center -top-3).
      * Tab 4: Theo dõi (Live GPS Tracking).
      * Tab 5: Tài khoản (Parent Profile).
```

---

## 4. BẢNG CHECKLIST NGHIỆM THU CHO CODE TỪ GOOGLE STITCH

Khi nhận mã HTML/CSS từ Google Stitch, hãy kiểm tra danh sách 8 tiêu chí cốt lõi:
- [ ] **Màu sắc chủ đạo**: Sắc cam `#F26522` chiếm ưu thế rõ ràng ở Header, nút hành động chính, tab bar và các badge điểm nhấn.
- [ ] **Top Header Gradient**: Gradient cam chuyển sắc mượt mà từ `#F26522` sang `#EA580C` có tích hợp lời chào và chuông thông báo.
- [ ] **Smart Voice/Search Bar**: Có thanh tìm kiếm AI với nút micro thu âm màu cam.
- [ ] **Ví EduCare & Điểm thưởng**: Thẻ card trắng nổi hiển thị số dư 1.250.000đ và CarePoints.
- [ ] **3 Dịch vụ Flow 1**: Gia sư, Trông trẻ, Đón trẻ có huy hiệu giá (70k/h, 60k/h, 50k/chuyến) và thẻ cam kết sinh viên.
- [ ] **Live Radar Tracking**: Có khối cảnh báo ca làm đang chạy theo thời gian thực (ảnh CarePartner, ETA, nút GPS).
- [ ] **Hoạt động gần đây**: Thẻ đơn sạch đẹp, phân biệt rõ các trạng thái đơn (Chờ cam kết, Đã hoàn thành).
- [ ] **Bottom Navigation Bar**: 5 tabs chuẩn với nút AI Trợ lý nổi tròn màu cam ở giữa.
