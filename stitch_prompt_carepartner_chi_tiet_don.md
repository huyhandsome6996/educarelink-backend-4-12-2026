# 🎨 Prompt Google Stitch AI — Màn hình 2: Chi tiết Đơn & Quyết định Nhận việc (Booking Detail & Commitment)

> **Trang mục tiêu**: Màn hình Chi tiết đơn ghép cặp & Xác nhận cam kết (`BookingDetailScreen.js` trên Mobile & `/don-ghep-cap/<id>/` trên Web)  
> **Nền tảng**: EduCareLink — Nền tảng kết nối Phụ huynh với CarePartner / Sinh viên đại học uy tín  
> **Hướng dẫn**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are designing a high-stakes, decision-oriented mobile screen for an established Vietnamese EdTech & In-Home Childcare platform called "EduCareLink" (educarelink-backend-4-12-2026).
The design must be implemented as a modern mobile web app (viewport 390px - 430px, iOS/Android mobile ergonomics) using clean HTML, Tailwind CSS, Google Fonts ('Manrope' + 'Plus Jakarta Sans'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — PRODUCT PURPOSE & USER PSYCHOLOGY
═══════════════════════════════════════════════════════════════════════════════

1. What is this screen?
This is the "Booking Detail & Commitment Screen" (`BookingDetailScreen`).
A university student (CarePartner) opened a new request that a parent specifically assigned to them.
The CarePartner is here to make ONE critical decision:
👉 "Do I CONFIRM COMMITMENT (Xác nhận cam kết) to take this job, or do I DECLINE / CANCEL (Huỷ đơn)?"

2. Core Functional Requirements (STRICT):
- The bottom action bar contains ONLY TWO BUTTONS:
  1. PRIMARY CTA: "XÁC NHẬN CAM KẾT" (Confirm Commitment) — Prominent, energetic, reassuring. When clicked, the job immediately moves to the "Sắp làm" (Upcoming) tab!
  2. SECONDARY CTA: "TỪ CHỐI / HUỶ ĐƠN" (Decline / Cancel) — Subtle, outline or light red tinted, opens a clean bottom sheet asking for a quick reason (e.g. school conflict, distance).
- ABSOLUTELY NO other extraneous action buttons.
- Display a real-time countdown timer card: "Thời gian suy nghĩ còn lại: 13 phút 45 giây". If expired, the slot is automatically released without penalizing the student.

3. Psychological Goals:
- Give the student 100% confidence: full transparent details on family location, child age, task description, exact slot hours, safety tracking, and guaranteed Escrow payout.
- Eliminate hesitation: clearly explain "Tiền công đã được giữ an toàn trên hệ thống MoMo Escrow, tự động giải ngân sau khi bạn hoàn thành ca làm".

═══════════════════════════════════════════════════════════════════════════════
SECTION B — COLOR TOKENS & VISUAL IDENTITY
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Ultra-light slate pearl)
- Surface Cards: #FFFFFF with subtle 1px border #E2E8F0
- Brand Signature Orange: #F26522 (Primary accents, energetic status dots)
- Trust Emerald Green: #0E9F6E (Primary Confirm button, payout amount, verified status)
- Countdown Amber Card: #FEF3C7 (Border #FDE68A, Text #92400E)
- Warning / Cancel Red: #EF4444 (Decline button outline, cancel modal)
- Text Primary (Ink): #0F172A (Deep Slate Navy)
- Text Secondary: #475569 (Slate Gray for metadata, descriptions)
- Text Muted: #94A3B8 (Captions, helper hints)

Typography:
- Display / Numbers / Prices: 'Manrope', sans-serif (Weights: 600, 700, 800)
- Body text & Labels: 'Plus Jakarta Sans', sans-serif (Weights: 400, 500, 600)
- BANNED: Inter, Serif fonts, loud neon glows.

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SCREEN ARCHITECTURE (TOP TO BOTTOM)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP APP BAR
- Left: Circular back button (< arrow).
- Center: Screen title "Chi tiết công việc được giao" (font-bold text-slate-800).
- Right: Share or Hotline SOS support icon.

2. URGENT COUNTDOWN BANNER (Sticky below app bar)
- A warm amber pill/card with animated ticking clock icon:
  * "⏳ Thời gian xác nhận còn: 14:15"
  * Subtext: "Đơn sẽ tự động nhường cho bạn khác nếu bạn không xác nhận trước khi hết giờ."

3. HERO SUMMARY CARD (The Job Identity)
A crisp white card with soft shadows:
- Top Row:
  * Category Tag: "📚 Gia sư Tiểu học" (or "🚸 Đón trẻ an toàn", "🧸 Trông trẻ tại nhà")
  * Status Pill: "Chờ bạn xác nhận" (bg-orange-50 text-orange-600 font-bold px-3 py-1 rounded-full text-xs)
- Title: "Gia sư Toán lớp 4 & Luyện chữ đẹp tại nhà"
- Guaranteed Payout Callout:
  * Large green text: "300.000đ" (font-extrabold text-2xl text-emerald-600)
  * Subtitle: "Thù lao 150.000đ/giờ · Đã ký quỹ Escrow bảo đảm 100%"

4. FAMILY & CHILD INFORMATION BENTO
- Parent Avatar + Name: "Phụ huynh: Bác sĩ Nguyễn Hải Yến (Bệnh viện Nhi TW)"
- Trust Badges: "🛡️ Đã xác thực CCCD gắn chip" · "⭐ 5.0 (24 ca thành công)"
- Child Info: "Bé Nam, 9 tuổi (Học sinh lớp 4 trường Tiểu học Nam Từ Liêm)"
- Phone & Chat Note: "Số điện thoại và kênh chat trực tiếp sẽ mở ngay sau khi bạn bấm Xác nhận."

5. SCHEDULE & LOCATION BENTO (Crystal-Clear Details)
- Exact Date & Time:
  * Icon Calendar: "Thứ Sáu, 17/09/2026"
  * Icon Clock: "17:30 – 19:30 (Thời lượng: 2 tiếng)"
- Map & Address:
  * Mini interactive or static preview map snippet showing distance route.
  * Icon Location: "Tòa A2, Chung cư Vinhomes Gardenia, Hàm Nghi, Cầu Diễn, Nam Từ Liêm, Hà Nội"
  * Route Info: "Cách trường của bạn 2.1 km (~8 phút xe máy)"

6. SPECIAL INSTRUCTIONS & REQUIREMENTS
- Detailed tasks:
  * "Kèm bé làm bài tập Toán SGK và phiếu bài tập tuần."
  * "Rèn tư thế ngồi và nét chữ đúng chuẩn."
  * "Sau buổi học, ghi nhật ký ngắn 3 dòng trên app để phụ huynh nắm tiến độ."
- Safety & Verification:
  * "Công việc có bật theo dõi vị trí GPS an toàn trong suốt 2 tiếng ca làm."

7. FIXED BOTTOM ACTION DOCK (THE 2-BUTTON RULE)
Sticky floating bottom dock above home indicator with white blur background:
- Dual-button layout:
  * Button 1 (Left, 35% width, Secondary): 
    "Từ chối" (border border-slate-300 text-slate-700 font-bold py-3.5 rounded-2xl hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all flex items-center justify-center gap-2)
  * Button 2 (Right, 65% width, Primary): 
    "Xác nhận cam kết →" (bg-gradient-to-r from-orange-500 to-orange-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2)
- Micro-copy below buttons:
  * "Bấm 'Xác nhận' đơn sẽ chuyển sang mục Sắp làm để bạn theo dõi ca."

8. QUICK CANCEL MODAL (When CarePartner taps "Từ chối")
- Bottom sheet slide-up:
  * Header: "Chọn lý do từ chối đơn này"
  * Options list:
    1. Trùng lịch học đột xuất tại trường
    2. Khoảng cách di chuyển quá xa
    3. Lý do sức khỏe cá nhân
    4. Khác (nhập ghi chú)
  * Two buttons: "Quay lại" vs "Xác nhận từ chối" (không bị phạt điểm uy tín vì từ chối trong thời hạn quy định).

═══════════════════════════════════════════════════════════════════════════════
SECTION D — STRICT ANTI-PATTERNS (DO NOT INCLUDE)
═══════════════════════════════════════════════════════════════════════════════
- NO complex multi-tier menus or nested accordions.
- NO self-apply forms ("Nộp hồ sơ", "CV đính kèm" are strictly BANNED).
- NO extra buttons like "Lưu việc", "Báo cáo việc này" crowding the bottom dock.
- Keep the bottom action dock restricted to exactly TWO choices: Xác nhận cam kết OR Huỷ đơn.
```
