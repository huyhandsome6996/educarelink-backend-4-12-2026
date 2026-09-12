# 🎨 Prompt Google Stitch AI — Màn hình 2: Chi tiết Đơn việc của Phụ huynh (Parent Booking & Task Detail)

> **Trang mục tiêu**: Màn hình Chi tiết Đơn việc & Theo dõi Ca làm của Phụ huynh (`BookingDetailScreen.js` trên Mobile & `/phu-huynh/don/<id>/` trên Web)  
> **Nền tảng**: EduCareLink — Nền tảng kết nối Phụ huynh với CarePartner / Sinh viên đại học uy tín  
> **Kiến trúc Trạng thái (State Machine)**:
> 1. **Giai đoạn 1 — Chờ sinh viên xác nhận (`awaiting_commitment`)**: Phụ huynh xem lại toàn bộ hồ sơ sinh viên đã chọn (Trường ĐH, điểm uy tín, CCCD gắn chip), đồng hồ đếm ngược 60 phút, bảo đảm ký quỹ MoMo Escrow, nút đổi người hoặc hủy đơn.
> 2. **Giai đoạn 2 — Đã xác nhận / Đang diễn ra (`committed` & `in_progress`)**: Sinh viên đã cam kết nhận ca. Hiển thị bản đồ Live Tracking GPS, vòng an toàn Geofence, kênh liên lạc gọi/chat 1-1, và nút "Xác nhận hoàn thành ca" để giải ngân.
> 3. **Giai đoạn 3 — Đã hoàn thành (`completed`)**: Ca làm kết thúc. Phụ huynh đánh giá 5 sao cho sinh viên, xem báo cáo nhật ký chăm sóc (Care Diary), xem biên lai giải ngân MoMo Escrow và nút tiện ích 1-chạm "Đặt lại sinh viên này cho tuần sau".  
> **Hướng dẫn**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are designing a high-trust, mission-critical detail and tracking screen for an established Vietnamese EdTech & Childcare platform called "EduCareLink" (educarelink-backend-4-12-2026).
The design must be implemented as a responsive mobile web interface (viewport 390px - 430px, iOS/Android mobile ergonomics) using clean semantic HTML, Tailwind CSS, Google Fonts ('Manrope' + 'Plus Jakarta Sans'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — PRODUCT PURPOSE & USER PSYCHOLOGY
═══════════════════════════════════════════════════════════════════════════════

1. Screen Purpose:
This is the "Parent Booking Detail & Live Supervision Screen" (`BookingDetailScreen`).
A parent opened a specific tutoring or childcare booking to check on its progress, supervise safety, communicate with the student, or review the finished session.

2. Three Distinct Lifecycle States (STRICT STATE MACHINE):
The interface dynamically adapts its hero cards, actions, and safety tools depending on which phase the order is in:

┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: AWAITING COMMITMENT (`awaiting_commitment`)                        │
│ • Parent has selected a top candidate; the student has up to 60 mins to    │
│   confirm commitment.                                                       │
│ • Key focus: Full transparency on who was selected (University, major,     │
│   verified CCCD, reputation score), countdown ticking timer, reassuring     │
│   escrow notice, and button to switch students if urgent.                   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 🟢 Student confirms commitment
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: COMMITTED & IN-PROGRESS (`committed` & `in_progress`)              │
│ • The student confirmed and is preparing or currently teaching the child.   │
│ • Key focus: Active Live GPS Tracking Bento, Geofence safe boundary alert,  │
│   direct 1-1 chat & phone call, emergency SOS trigger, and primary CTA to   │
│   confirm shift completion when done.                                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 🏁 Parent confirms shift completion
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: COMPLETED & ARCHIVED (`completed`)                                 │
│ • The session ended successfully and escrow payout was processed.           │
│ • Key focus: 5-Star rating & review module, student's Care Diary log,       │
│   MoMo Escrow transparent receipt breakdown, and 1-tap re-booking button.   │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
SECTION B — COLOR TOKENS & VISUAL IDENTITY
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Clean soft pearl slate)
- Card Surfaces: #FFFFFF with subtle 1px border #E2E8F0 and smooth shadow
- Brand Signature Orange: #F26522 (Primary highlights, action prompts)
- Trust Emerald Green: #0E9F6E (Verified badges, confirmed banner, complete CTA, escrow safe)
- Live Tracking Blue: #0284C7 (GPS tracking active, map boundary)
- Countdown Amber: #F59E0B (bg-amber-50, border-amber-200, text-amber-800 for timers)
- Warning / Cancel Red: #EF4444 (Cancel request, SOS button, dispute)
- Text Primary (Ink): #0F172A (Deep Slate Navy, high legibility)
- Text Secondary: #475569 (Metadata, timestamps, addresses)
- Text Muted: #94A3B8 (Captions, helper hints)

Typography:
- Display, Numbers, Prices: 'Manrope', sans-serif (Weights: 600, 700, 800)
- Body text & Labels: 'Plus Jakarta Sans', sans-serif (Weights: 400, 500, 600)
- BANNED: Inter, generic serif fonts, neon glow gradients, pure black (#000000).

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SCREEN ARCHITECTURE (TOP TO BOTTOM)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP APP BAR
- Left: Circular back button (< arrow).
- Center:
  * Order Code: "MÃ ĐƠN #EDC-8492" (font-mono text-xs text-slate-400 font-semibold tracking-wider).
  * Screen Title: "Chi tiết ca chăm sóc & gia sư" (font-bold text-sm text-slate-800).
- Right:
  * 24/7 Hotline support icon ("0862427404") or share button.

─────────────────────────────────────────────────────────────────────────────
2. HERO BANNER — STATE-SPECIFIC STATUS RIBBON
─────────────────────────────────────────────────────────────────────────────

■ STATE 1 (Awaiting Commitment):
- Warm amber container (bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4):
  * Top Row: Animated hourglass icon + "Đang chờ sinh viên xác nhận cam kết" (font-bold text-amber-900).
  * Countdown Clock: "⏳ Còn lại: 48 phút 20 giây" (font-extrabold text-xl text-amber-700).
  * Reassurance Hint: "Hệ thống đã thông báo đến bạn sinh viên. Nếu sau 60 phút bạn sinh viên không nhận, tiền ký quỹ sẽ được giữ nguyên và bạn có thể chọn bạn khác."

■ STATE 2 (Committed & In-Progress):
- Vibrant emerald/blue container (bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4):
  * Top Row: Checkmark shield icon + "Sinh viên đã cam kết nhận việc" (font-bold text-emerald-900).
  * Shift Timing: "Ca học diễn ra hôm nay: 18:00 – 20:00 (2 tiếng)" (font-bold text-emerald-700).
  * Safe Status: "Đã bật định vị GPS an toàn · Giữ liên lạc trực tiếp qua chat & gọi".

■ STATE 3 (Completed):
- Pure trust container (bg-slate-100 border border-slate-200 rounded-2xl p-4 mb-4):
  * Top Row: Medal icon + "Ca làm đã hoàn tất thành công!" (font-bold text-slate-900).
  * Finished Time: "Hoàn tất lúc 20:05 · 15/09/2026".
  * Payout Note: "Đã giải ngân 300.000đ từ MoMo Escrow cho sinh viên."

─────────────────────────────────────────────────────────────────────────────
3. CHOSEN CAREPARTNER SPOTLIGHT BENTO (High Trust Card)
─────────────────────────────────────────────────────────────────────────────
A dedicated card highlighting the selected university student:
- Top Profile Row:
  * Verified Avatar (clean portrait photo with green checkmark shield).
  * Full Name: "Nguyễn Thị Thu Huyền" (font-bold text-lg text-slate-900).
  * School & Department: "Đại học Sư phạm Hà Nội · Khoa Giáo dục Tiểu học (Năm 3)".
- Trust Badges Flow (flex wrap gap-1.5 mt-2):
  * Badge 1: "🛡️ Đã xác thực CCCD gắn chip" (bg-emerald-50 text-emerald-700 text-xs font-semibold px-2 py-0.5 rounded-md)
  * Badge 2: "🎓 Thẻ sinh viên chính quy" (bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-md)
  * Badge 3: "⭐ 4.9 (38 ca thành công)" (bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-md)
  * Badge 4: "🏅 Điểm uy tín: 100/100" (bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded-md)
- Direct Communication Strip (Active in Phase 2 & 3):
  * Phone Number: "0912.845.xxx" (Tap to call directly).
  * Fast Action: "💬 Nhắn tin 1-1 với sinh viên" (Opens real-time chat).

─────────────────────────────────────────────────────────────────────────────
4. LIVE GPS TRACKING & GEOFENCE BENTO (Phase 2 Focus)
─────────────────────────────────────────────────────────────────────────────
Shown prominently when the student has confirmed and the shift is active:
- Map View Container (rounded-2xl overflow-hidden border border-slate-200 relative):
  * Interactive / preview map snippet showing student icon & family home icon.
  * Live status pill floating over map: "🟢 Vị trí trực tiếp: Đang di chuyển cách nhà 650m".
  * Safe Geofence Ring: Visual circle showing 200m safety radius around family residence.
  * Safety Pill: "🛡️ Trong vùng an toàn Geofence (Chung cư Vinhomes Smart City)".
- Emergency Assistance Row:
  * Button 1: "Mở bản đồ toàn màn hình 📍"
  * Button 2 (SOS): "🆘 Báo sự cố khẩn cấp (Hotline 24/7: 0862427404)"

─────────────────────────────────────────────────────────────────────────────
5. JOB DETAILS & FAMILY SCHEDULE BENTO
─────────────────────────────────────────────────────────────────────────────
- Job Title: "Gia sư Tiếng Anh giao tiếp & Kèm làm bài tập lớp 3"
- Child Information:
  * "Bé Bảo Nam, 8 tuổi (Học sinh lớp 3 trường Tiểu học Vinschool)"
  * "Đặc điểm của bé: Thích vẽ tranh, cần người kèm phát âm chuẩn và kiên nhẫn."
- Schedule & Address:
  * Icon Calendar: "Thứ Sáu, 19/09/2026 · 18:00 – 20:00 (2 tiếng)"
  * Icon Location: "Căn hộ 1208, Tòa S2.05 Vinhomes Smart City, Tây Mỗ, Nam Từ Liêm, Hà Nội"
- Specific Requirements:
  * "1. Kèm bé ôn từ vựng Unit 4 sách Family and Friends."
  * "2. Luyện phát âm và giao tiếp phản xạ 30 phút."
  * "3. Ghi lại nhật ký ca học sau khi kết thúc buổi."

─────────────────────────────────────────────────────────────────────────────
6. MOMO ESCROW FINANCIAL TRANSPARENCY CARD
─────────────────────────────────────────────────────────────────────────────
Building 100% financial peace of mind for the parent:
- Escrow Header:
  * MoMo Logo / Icon + "Ký quỹ MoMo Escrow được bảo vệ 100%"
- Price Breakdown:
  * Thù lao ca làm: 300.000đ (150.000đ/giờ x 2 tiếng)
  * Trạng thái ký quỹ: "Đã tạm giữ an toàn trong ví Escrow"
  * Cam kết giải ngân: "Hệ thống chỉ chuyển tiền cho sinh viên sau khi bạn bấm 'Xác nhận hoàn thành ca'. Nếu có sự cố, 100% tiền sẽ được hoàn về ví MoMo của bạn."

─────────────────────────────────────────────────────────────────────────────
7. CARE DIARY & REVIEW SECTION (Phase 3 Focus)
─────────────────────────────────────────────────────────────────────────────
When order status is `completed`:
- Care Diary Summary Box:
  * Title: "📝 Nhật ký buổi học từ sinh viên Huyền"
  * Child study report: "Bé Nam hôm nay phát âm rất tiến bộ, hoàn thành xong 10 câu trắc nghiệm Unit 4 và tự giác dọn sách vở gọn gàng."
- 5-Star Rating & Review Form:
  * Rating Stars: ⭐ ⭐ ⭐ ⭐ ⭐
  * Quick praise tags: "Đúng giờ", "Rất kiên nhẫn", "Dạy dễ hiểu", "Bé rất thích"
  * Review Input / Review Display: "Cảm ơn em Huyền nhiều, bé nhà chị hào hứng học hẳn ra!"

─────────────────────────────────────────────────────────────────────────────
8. FIXED BOTTOM ACTION DOCK (Ergonomic Sticky Bar)
─────────────────────────────────────────────────────────────────────────────
Dynamically changes based on state:

■ BOTTOM DOCK FOR PHASE 1 (Awaiting Commitment):
- Dual Buttons:
  * Secondary (35%): "Đổi sinh viên" (border border-slate-300 text-slate-700 font-bold py-3.5 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all)
  * Primary (65%): "Xem hồ sơ đầy đủ →" (bg-orange-500 text-white font-bold py-3.5 rounded-2xl shadow-md)
- Micro-text: "Nếu sinh viên không nhận sau 60 phút, đơn sẽ tự mở lại miễn phí."

■ BOTTOM DOCK FOR PHASE 2 (Committed & In-Progress):
- Dual Buttons:
  * Secondary (30%): Circular Phone / Chat buttons.
  * Primary (70%): "✅ Xác nhận hoàn thành ca" (bg-emerald-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2)
- Micro-text: "Bấm khi ca làm đã kết thúc và bạn hài lòng với dịch vụ."

■ BOTTOM DOCK FOR PHASE 3 (Completed):
- Single Hero CTA:
  * "🔁 Đặt lại bạn sinh viên này cho tuần sau" (bg-gradient-to-r from-orange-500 to-orange-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2)
- Secondary Link: "Xem hóa đơn thanh toán MoMo (VAT)"

═══════════════════════════════════════════════════════════════════════════════
SECTION D — STRICT ANTI-PATTERNS (DO NOT INCLUDE)
═══════════════════════════════════════════════════════════════════════════════
- NO using "ELO" terminology — strictly use "Điểm uy tín" or "Điểm tín nhiệm".
- NO confusing or missing state transitions — each of the 3 phases must have clearly delineated banners and actions.
- NO unverified worker details — student identity, school, and CCCD must be prominently certified.
- NO complex nested accordions hiding critical safety or pricing information.
```
