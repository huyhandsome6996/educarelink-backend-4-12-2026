# 🎨 Prompt Google Stitch AI — Màn hình 3: Quản lý Công việc CarePartner (My Jobs Screen)

> **Trang mục tiêu**: Màn hình Quản lý Công việc CarePartner (`MyJobsScreen.js` trên Mobile & `/carepartner/cong-viec/` trên Web)  
> **Nền tảng**: EduCareLink — Nền tảng kết nối Phụ huynh với CarePartner / Sinh viên đại học uy tín  
> **Yêu cầu cốt lõi**: **BỎ HOÀN TOÀN tab "Chờ duyệt"**. Chỉ có đúng 2 tab: **"Sắp làm"** (các ca đã bấm xác nhận / đang thực hiện) và **"Lịch sử"** (các ca đã hoàn thành / kết thúc).  
> **Hướng dẫn**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are designing an essential, everyday management screen for an established Vietnamese EdTech & Childcare platform called "EduCareLink" (educarelink-backend-4-12-2026).
The design must be implemented as a responsive mobile interface (viewport 390px - 430px, iOS/Android mobile ergonomics) using clean semantic HTML, Tailwind CSS, Google Fonts ('Manrope' + 'Plus Jakarta Sans'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — PRODUCT BACKGROUND & USER PSYCHOLOGY
═══════════════════════════════════════════════════════════════════════════════

1. What is this screen?
This is the "CarePartner Job Management" screen (`MyJobsScreen`).
Accessed via the "Công việc" tab on the bottom navigation bar.
CarePartners use this screen to manage all their active work commitments and review past earnings.

2. Critical Architectural Change:
- OLD PATTERN (BANNED): A 3-tab layout containing "Chờ duyệt" (Pending) is COMPLETELY BANNED. Under EduCareLink's new model, students do not apply and wait for approval.
- NEW PATTERN (MANDATORY): Exactly TWO tabs:
  1. TAB 1: "SẮP LÀM" (Upcoming & Active Sessions)
     * Displays all jobs that the student has CONFIRMED ("Đã cam kết" / `committed`) and jobs currently in progress ("Đang thực hiện" / `in_progress`).
  2. TAB 2: "LỊCH SỬ" (Completed & Past Sessions)
     * Displays all finished sessions ("Hoàn thành" / `completed`), cancelled sessions, with payout receipts, parent reviews, and Care Diary logging.

3. Flow Logic:
- When a CarePartner clicks "Xác nhận cam kết" on the job detail screen, the booking automatically leaps into TAB 1 ("Sắp làm").
- When the CarePartner finishes the shift and ends the booking, it automatically moves into TAB 2 ("Lịch sử").

═══════════════════════════════════════════════════════════════════════════════
SECTION B — COLOR TOKENS & VISUAL IDENTITY
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Clean soft slate)
- Card Surfaces: #FFFFFF with subtle 1px border #E2E8F0 and soft elevation
- Brand Signature Orange: #F26522 (Active tab indicator, primary CTA buttons)
- Trust Emerald Green: #0E9F6E (Completed badge, positive payout, verified tag)
- Active Shift Cyan/Blue: #0284C7 (In-progress live session, GPS tracking active)
- Alert Crimson: #EF4444 (SOS emergency button, late arrival warning)
- Text Primary: #0F172A (Deep Slate Navy, high legibility)
- Text Secondary: #475569 (Metadata, dates, addresses)
- Text Muted: #94A3B8 (Captions, helper hints)

Typography:
- Display / Numbers / Currency: 'Manrope', sans-serif (Weights: 600, 700, 800) with tabular numbers
- Body text & Labels: 'Plus Jakarta Sans', sans-serif (Weights: 400, 500, 600)
- BANNED: Inter, generic serif fonts, neon gradient glows.

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SCREEN ARCHITECTURE (TOP TO BOTTOM)
═══════════════════════════════════════════════════════════════════════════════

1. TOP HEADER & MONTHLY SUMMARY PILL
- Title: "Công việc của tôi" (font-extrabold text-2xl text-slate-900).
- Subtitle: "Theo dõi các ca học đã cam kết và lịch sử thu nhập".
- Monthly Quick Earning Capsule (floating warm banner):
  * "Tháng 09/2026: 4 ca hoàn thành · Thu nhập thực nhận: 1.450.000đ · 100% đúng giờ".

2. THE 2-TAB SEGMENTED CONTROLLER (Strict 2-Tab Rule)
A pill-shaped toggle container (bg-slate-100 p-1.5 rounded-2xl flex items-center justify-between mb-4):
- Tab 1: "Sắp làm (2)"
  * Active state: bg-white text-orange-600 font-bold shadow-sm rounded-xl py-2.5 flex-1 text-center flex items-center justify-center gap-2
  * Icon: Calendar clock (event_upcoming)
- Tab 2: "Lịch sử (12)"
  * Inactive state: text-slate-500 font-medium py-2.5 flex-1 text-center flex items-center justify-center gap-2
  * Icon: History archive (history)
- REMINDER: TAB "CHỜ DUYỆT" DOES NOT EXIST.

─────────────────────────────────────────────────────────────────────────────
3. TAB 1 CONTENT — "SẮP LÀM" (Upcoming & In-Progress Cards)
─────────────────────────────────────────────────────────────────────────────
Each card represents a confirmed upcoming shift:
- Card Header:
  * Status Badge: "🟢 Đã cam kết nhận đơn" (or "🔵 Đang trong ca làm")
  * Countdown Pill: "Bắt đầu sau 3 giờ" (or "Đang làm: 45 phút còn lại")
  * Price: "300.000đ" (font-bold text-emerald-600)
- Job Title: "Gia sư Tiếng Anh giao tiếp lớp 3"
- Scheduled Time:
  * Date & Slot: "Hôm nay, 18:00 – 20:00 (2 tiếng)"
- Parent & Address:
  * Avatar + "Phụ huynh: Chị Mai Phương (SĐT: 0987.xxx.xxx)"
  * Address: "Tòa S2.01 Vinhomes Smart City, Tây Mỗ, Nam Từ Liêm, Hà Nội"
- Live Tracking Banner (Integrated into active cards):
  * "📍 Chia sẻ vị trí an toàn: Đang bật (Phụ huynh có thể thấy bạn di chuyển an toàn)"
- Action Buttons Bar:
  * Primary Button (Orange/Green): "Bắt đầu ca làm" (changes to "Kết thúc ca" when working)
  * Secondary Button: "Nhắn tin với Phụ huynh" (Chat 1-1)
  * Safety Button: "🆘 Báo sự cố / SOS" (instant emergency alert to parent & platform)

─────────────────────────────────────────────────────────────────────────────
4. TAB 2 CONTENT — "LỊCH SỬ" (Completed & Past Cards)
─────────────────────────────────────────────────────────────────────────────
Each card represents a completed past shift:
- Card Header:
  * Completed Badge: "✅ Đã hoàn thành ca làm" (bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-xs font-bold)
  * Completed Date: "Hoàn thành: 14/09/2026 · 19:30"
  * Payout: "+360.000đ" (Bold green, MoMo Escrow đã giải ngân vào ví)
- Job Title: "Đón bé & Kèm học buổi chiều tại nhà"
- Parent Review & Rating Box (Subtle card inside):
  * "⭐ 5.0 từ Chị Thu Trang: 'Em Huyền rất chu đáo, đón bé đúng giờ và hướng dẫn con làm bài tập rất kiên nhẫn!'"
- Post-Shift Actions (Essential for trust & compliance):
  * Button 1 (Care Diary): "📝 Ghi nhật ký chăm sóc bé" (Opens CareDiary form to record child meals, homework, behavior)
  * Button 2 (Chat 24h): "💬 Chat với phụ huynh (còn 18h)"
  * Button 3 (If penalty occurred): "⚖️ Kháng cáo điểm uy tín ELO"

5. EMPTY STATES:
- Tab "Sắp làm" empty state:
  * Icon: Relaxed calendar
  * Text: "Chưa có ca làm nào sắp tới"
  * Subtext: "Khi bạn bấm Xác nhận các đơn được giao ở Trang chủ, ca làm sẽ xuất hiện tại đây."
  * Button: "Về Trang chủ xem đơn mới →"
- Tab "Lịch sử" empty state:
  * Icon: Medal / Ribbon
  * Text: "Chưa có ca làm nào hoàn thành"
  * Subtext: "Hoàn thành ca đầu tiên để nhận thù lao và tích lũy đánh giá 5 sao!"

6. BOTTOM NAVIGATION BAR (Matching the App Structure)
- Tab 1: "Trang chủ"
- Tab 2: "Lịch rảnh"
- Tab 3 (FAB): "AI Trợ lý"
- Tab 4 (Active): "Công việc" (in signature orange #F26522)
- Tab 5: "Tài khoản"

═══════════════════════════════════════════════════════════════════════════════
SECTION D — STRICT ANTI-PATTERNS (DO NOT INCLUDE)
═══════════════════════════════════════════════════════════════════════════════
- NO "Chờ duyệt" (Pending) tab under any circumstances.
- NO "Ứng tuyển thêm" or public job search buttons.
- NO complicated multi-layer tabs (Strictly 2 tabs: Sắp làm & Lịch sử).
```
