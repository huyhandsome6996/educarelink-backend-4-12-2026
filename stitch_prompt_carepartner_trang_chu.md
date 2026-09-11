# 🎨 Prompt Google Stitch AI — Màn hình 1: Trang chủ CarePartner (Nhận đơn Phụ huynh giao)

> **Trang mục tiêu**: Trang chủ CarePartner / Sinh viên (`WorkerFeedScreen.js` trên Mobile & `/carepartner/` trên Web)  
> **Nền tảng**: EduCareLink — Nền tảng kết nối Phụ huynh với CarePartner / Sinh viên đại học uy tín  
> **Hướng dẫn**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are designing an ultra-modern, high-trust, frictionless mobile screen for an established Vietnamese EdTech & Care platform called "EduCareLink" (educarelink-backend-4-12-2026).
The design must be implemented as a responsive mobile interface (viewport 390px - 430px, iOS/Android mobile ergonomics) using clean semantic HTML, Tailwind CSS, Google Fonts ('Manrope' + 'Plus Jakarta Sans'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — PRODUCT BACKGROUND & USER PSYCHOLOGY
═══════════════════════════════════════════════════════════════════════════════

1. What is this screen?
This is the "CarePartner Home Dashboard" (Trang chủ CarePartner).
In EduCareLink's new Grab-style matching model, CarePartners DO NOT browse a public job board to compete or spam self-applications. 
Instead, Vietnamese parents run an AI-powered radar search, pick a top-matched student, and the booking request lands DIRECTLY on this CarePartner's home feed in status "awaiting_commitment" (Chờ xác nhận của bạn).

2. Core Purpose:
- Deliver an instant, thrilling dopamine hit: "A parent chose YOU for a prestigious tutoring/care session!"
- Provide total clarity on the proposed job: Who is the parent, what is the subject/task, when is the exact time slot, what is the home address, and what is the payout in VNĐ.
- Clear urgency: Display an active countdown timer badge (e.g. "Còn 14:32 để xác nhận").
- Single tap into detail: Tapping any booking card navigates straight to the Decision screen (Chi tiết đơn: Xác nhận cam kết / Huỷ đơn).

3. Who is the user?
Vietnamese university students / CarePartners (aged 19–24, studying at top schools like Sư Phạm, Ngoại Thương, Bách Khoa, Y Hà Nội). They are tech-savvy, busy with university classes, and appreciate fast, transparent mobile apps like Grab, Shopee, and Be.

═══════════════════════════════════════════════════════════════════════════════
SECTION B — COLOR SYSTEM & DESIGN TOKENS
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Clean cool slate pearl)
- Card Surfaces: #FFFFFF with subtle border #E2E8F0 and soft elevation
- Brand Signature Orange: #F26522 (Primary accents, energetic status dots, brand badge)
- Brand Orange Gradient: linear-gradient(135deg, #F26522 0%, #EA580C 100%)
- Trust Emerald Green: #0E9F6E (Verified tags, high rate of on-time arrival, active status)
- Countdown Amber: #D97706 (Timer badges, urgent commitment window)
- Text Primary (Ink): #0F172A (Deep Slate Navy, high contrast)
- Text Secondary: #475569 (Slate Gray for metadata, slot times, addresses)
- Text Muted: #94A3B8 (Captions, helper hints)

Typography:
- Display / Numbers / Prices: 'Manrope', sans-serif (Weights: 600, 700, 800) with tabular numbers
- Body text & Labels: 'Plus Jakarta Sans', sans-serif (Weights: 400, 500, 600)
- BANNED: Inter, Comic Sans, generic Serifs, fluorescent neon glow

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SCREEN ARCHITECTURE (TOP TO BOTTOM)
═══════════════════════════════════════════════════════════════════════════════

1. TOP STATUS & BRAND HEADER (Warm Orange Accent Zone)
- Top bar with rounded bottom corners (rounded-b-3xl), background brand gradient (#F26522 to #EA580C) with subtle geometric watermark rings.
- Left: Sub-label "CAREPARTNER ĐÃ ĐỐI SOÁT" (uppercase, tracking-wider, text-white/70, text-xs) + Student greeting "Chào, [Tên CarePartner]! 👋" (text-xl font-extrabold text-white).
- Right: Circular notification bell with active unread dot + Quick status pill "🟢 Sẵn sàng nhận việc".
- Subtitle pill: "Phụ huynh chọn bạn trực tiếp — Vui lòng xem và xác nhận trước khi hết hạn."

2. QUICK STATS MINI-BAR (Floating Pill Overlap)
A subtle horizontal glass-card floating slightly over the header bottom:
- Ca đã cam kết: "2 ca sắp tới"
- Điểm uy tín ELO: "⭐ 98/100"
- Tỷ lệ đúng giờ: "100%"

3. SECTION TITLE: "ĐƠN MỚI CẦN XÁC NHẬN"
- Section header with badge count: "Đơn mới chờ bạn duyệt (2)"
- Subtle subtext: "Bấm vào để xem chi tiết ca làm và xác nhận cam kết"

4. NEW JOB CARDS LIST (The Core Feed)
Each card is an elevated white container with a 4px left border in signature orange (#F26522), featuring:
- Header Row:
  * Left: Pulsing amber badge with clock icon: "⏱️ Còn 14:20 để xác nhận"
  * Right: Prominent fee in bold green/orange: "360.000đ" (for a 2-hour session)
- Main Title: Bold, clear job name (e.g. "Gia sư Toán lớp 5 & Luyện thi Chuyên" or "Đón bé 6 tuổi trường Tiểu học Dịch Vọng")
- Family Info Strip:
  * Avatar of the parent + "Phụ huynh Chị Thu Trang (Đã xác thực CCCD & SĐT)"
  * Star rating of parent: "⭐ 5.0 (12 ca đã thanh toán qua Escrow)"
- Ca làm & Địa điểm (Compact icon grid):
  * Calendar icon: "Thứ 4, 15/09 · 17:30 – 19:30 (2 giờ)"
  * Location pin icon: "Ngõ 165 Cầu Giấy, P. Dịch Vọng, Q. Cầu Giấy, Hà Nội"
  * Distance tag: "📍 Cách bạn 1.4 km (~6 phút đi xe)"
- Card Action Bar:
  * Left: Note "Phụ huynh đã chọn riêng bạn từ gợi ý AI"
  * Right: Prominent button "Xem chi tiết & Xác nhận →" (bg-orange-50 text-orange-600 font-bold px-4 py-2 rounded-xl hover:bg-orange-500 hover:text-white transition-all)

5. EMPTY STATE (When no pending requests exist)
- Playful, calm illustration or icon of a clean briefcase / relaxed student reading.
- Headline: "Hiện chưa có ca mới chờ xác nhận"
- Description: "Lịch rảnh của bạn đang được thuật toán AI tự động kết nối với các phụ huynh gần nhất. Bạn sẽ nhận được thông báo ngay khi có phụ huynh chọn bạn!"
- Action buttons:
  * Button 1 (Primary Outline): "Cập nhật lại lịch rảnh trong tuần"
  * Button 2 (Secondary Text): "Xem các ca đã cam kết ở tab Công việc →"

6. BOTTOM NAVIGATION BAR (Standard 5 Tabs)
- Tab 1 (Active): "Trang chủ" (Home icon in brand orange #F26522)
- Tab 2: "Lịch rảnh" (Calendar icon)
- Tab 3 (Center Raised FAB): "AI Trợ lý" (Glowing chip/sparkles icon)
- Tab 4: "Công việc" (Briefcase icon - displays active/upcoming and history jobs)
- Tab 5: "Tài khoản" (Person icon)

═══════════════════════════════════════════════════════════════════════════════
SECTION D — STRICT ANTI-PATTERNS (DO NOT INCLUDE)
═══════════════════════════════════════════════════════════════════════════════
- NO search bar for jobs (CarePartners do not search for jobs; parents select them).
- NO self-apply buttons ("Ứng tuyển", "Nộp đơn" are strictly BANNED on this screen).
- NO public job browsing list where dozens of unrelated jobs are listed.
- NO confusing tab "Chờ duyệt" on this home screen.
```
