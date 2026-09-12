# 🎨 Prompt Google Stitch AI — Màn hình 1: Quản lý Công việc Phụ huynh ("Việc của tôi")

> **Trang mục tiêu**: Màn hình Quản lý Công việc của Phụ huynh (`MyTasksScreen.js` trên Mobile & `/phu-huynh/viec-cua-toi/` trên Web)  
> **Nền tảng**: EduCareLink — Nền tảng kết nối Phụ huynh với CarePartner / Sinh viên đại học uy tín  
> **Kiến trúc Trạng thái (State Machine)**:
> 1. **Tab 1 — "Chờ xác nhận" (Danh sách chờ)**: Đơn mới tạo tìm người + Đơn **Phụ huynh đã chọn sinh viên** (đang chờ sinh viên xác nhận cam kết nhận việc, có đếm ngược 60 phút, xem lại thông tin sinh viên đã chọn).
> 2. **Tab 2 — "Sắp làm" (Ca sắp tới & Đang thực hiện)**: Khi **Sinh viên bấm "Xác nhận nhận việc"**, ca làm TỰ ĐỘNG NHẢY VÀO ĐÂY! Phụ huynh theo dõi chuẩn bị ca, Live GPS định vị trực tiếp, vòng an toàn Geofence, chat/gọi, và nút hoàn thành ca.
> 3. **Tab 3 — "Lịch sử" (Ca đã hoàn thành & Kết thúc)**: Khi **Ca làm kết thúc**, công việc TỰ ĐỘNG NHẢY VÀO LƯU Ở ĐÂY! Phụ huynh đánh giá 5 sao cho sinh viên, xem biên lai MoMo Escrow giải ngân 80/20, xem nhật ký chăm sóc trẻ (Care Diary) và nút "Đặt lại sinh viên này".  
> **Hướng dẫn**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are designing a signature, high-trust management screen for an established Vietnamese EdTech & Childcare platform called "EduCareLink" (educarelink-backend-4-12-2026).
The design must be implemented as a responsive mobile web interface (viewport 390px - 430px, iOS/Android mobile ergonomics) using clean semantic HTML, Tailwind CSS, Google Fonts ('Manrope' + 'Plus Jakarta Sans'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — PRODUCT PURPOSE & LIFECYCLE STATE MACHINE
═══════════════════════════════════════════════════════════════════════════════

1. Screen Purpose:
This is the "Parent My Tasks Screen" (Màn hình "Việc của tôi" của Phụ huynh).
Accessed via the "Việc của tôi" tab on the bottom navigation bar.
Parents use this screen to manage the complete lifecycle of all child tutoring, childcare, and pickup sessions they have booked.

2. Critical 3-Stage State Machine (STRICT BUSINESS LOGIC):
The screen MUST organize jobs into exactly THREE tabs representing the real-world parent journey:

┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 1: "CHỜ XÁC NHẬN" (Pending Confirmation & Candidate Selection Queue)    │
│ • State A: New job posted, actively searching for candidates (open).       │
│ • State B: PARENT HAS SELECTED A STUDENT (awaiting_commitment).             │
│   👉 The selected student's card is displayed right here in the pending     │
│      queue for the parent to review! Includes student profile snippet,      │
│      countdown timer (e.g. 48 mins remaining for student to confirm),       │
│      and quick actions (view profile, change student, cancel request).      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 🟢 Student clicks "Xác nhận nhận việc"
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 2: "SẮP LÀM" (Upcoming & In-Progress Sessions)                          │
│ • The moment the student confirms commitment, the job AUTOMATICALLY LEAPS   │
│   INTO THIS TAB!                                                            │
│ • Displays all confirmed upcoming shifts and live active sessions:          │
│   - Scheduled start time countdown (e.g. "Bắt đầu lúc 18:00 hôm nay").      │
│   - Real-time GPS Live Tracking & Geofence safe zone banner.                │
│   - Direct communication: Call phone, 1-1 secure chat, SOS / 24/7 Hotline.  │
│   - MoMo Escrow 100% safety guarantee badge.                                │
│   - Primary CTA: "Xác nhận hoàn thành ca" (to release payout).              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 🏁 Shift completes & parent confirms
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 3: "LỊCH SỬ" (Completed & Archived Sessions)                            │
│ • When the shift finishes, the job AUTOMATICALLY MOVES & SAVES HERE!        │
│ • Displays all finished and archived sessions for record-keeping:           │
│   - 5-Star Rating & Review submission for the student.                      │
│   - Transparent MoMo Escrow payout receipt (80% student, 20% platform).     │
│   - Care Diary link (view report of what the child ate, studied, did).      │
│   - 1-Tap "Đặt lại sinh viên này" (Re-book the same tutor for next week).   │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
SECTION B — COLOR TOKENS & VISUAL IDENTITY
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Ultra-clean soft pearl slate)
- Card Surfaces: #FFFFFF with subtle 1px border #E2E8F0 and soft elevation (shadow-sm)
- Brand Signature Orange: #F26522 (Active tab, primary actions, attention accents)
- Trust Emerald Green: #0E9F6E (Verified badges, Escrow safe, confirmed status, completed)
- Active Shift Sky Blue: #0284C7 (Live GPS tracking badge, in-progress shift)
- Pending Amber / Warm Gold: #F59E0B (Awaiting confirmation pill, countdown timer)
- Alert Crimson: #EF4444 (Cancel action, SOS button, dispute notice)
- Text Primary (Ink): #0F172A (Deep Slate Navy, maximum legibility)
- Text Secondary: #475569 (Metadata, timestamps, addresses)
- Text Muted: #94A3B8 (Captions, helper hints)

Typography:
- Numbers, Prices, Display: 'Manrope', sans-serif (Weights: 600, 700, 800) with tabular figures
- Body text & Labels: 'Plus Jakarta Sans', sans-serif (Weights: 400, 500, 600)
- BANNED: Inter, generic serif fonts, neon gradient glows, pure black (#000000).

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SCREEN ARCHITECTURE (TOP TO BOTTOM)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP APP HEADER
- Top row:
  * Title: "Việc của tôi" (font-extrabold text-2xl text-slate-900).
  * Subtitle: "Theo dõi tiến độ gia sư và dịch vụ chăm sóc bé".
  * Right Action:
    - Quick "+ Đăng việc mới" compact button (bg-orange-50 text-orange-600 font-bold px-3 py-1.5 rounded-full text-xs flex items-center gap-1 border border-orange-200).
    - Notification bell with unread dot.

2. THE 3-TAB SEGMENTED CONTROLLER (Pill Container)
Horizontal segmented container (bg-slate-100 p-1.5 rounded-2xl flex items-center justify-between mb-4):
- Tab 1: "Chờ xác nhận (2)"
  * Active indicator: bg-white text-orange-600 font-bold shadow-sm rounded-xl py-2.5 flex-1 text-center flex items-center justify-center gap-1.5
  * Icon: hourglass_top
- Tab 2: "Sắp làm (1)"
  * Inactive indicator: text-slate-500 font-medium py-2.5 flex-1 text-center flex items-center justify-center gap-1.5
  * Icon: event_available
- Tab 3: "Lịch sử (8)"
  * Inactive indicator: text-slate-500 font-medium py-2.5 flex-1 text-center flex items-center justify-center gap-1.5
  * Icon: history

─────────────────────────────────────────────────────────────────────────────
3. TAB 1 CONTENT — "CHỜ XÁC NHẬN" (PENDING CONFIRMATION QUEUE)
─────────────────────────────────────────────────────────────────────────────

Shows jobs currently waiting for confirmation or worker matching:

■ CARD VARIANT 1A: PARENT HAS CHOSEN A STUDENT (HIGHLIGHTED PENDING STATE)
This is the KEY card the parent wants to review after choosing a CarePartner!
- Card Container: White card with amber top accent border (border-t-4 border-amber-400).
- Header Row:
  * Status Pill: "⏳ Chờ sinh viên xác nhận" (bg-amber-50 text-amber-700 font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1)
  * Price: "300.000đ" (font-extrabold text-lg text-slate-900)
- Urgent Countdown Ribbon:
  * Warm amber box with ticking clock: "Đang chờ sinh viên xác nhận cam kết: còn 48 phút 15 giây"
  * Micro-text: "Nếu quá thời hạn sinh viên chưa nhận việc, đơn sẽ tự mở lại để bạn chọn người khác."
- Chosen Student Spotlight Bento:
  * Student Avatar (clean circular portrait with green verified check badge)
  * Name: "Nguyễn Thị Thu Huyền"
  * University & Major: "ĐH Sư Phạm Hà Nội · Khoa Giáo dục Tiểu học"
  * Trust Metrics: "⭐ 4.9 (38 ca thành công) · 🛡️ Điểm uy tín: 100/100 · Đã xác thực CCCD gắn chip"
- Job Metadata:
  * Title: "Gia sư Toán & Tiếng Việt lớp 2 tại nhà"
  * Schedule: "📅 Thứ Sáu, 19/09/2026 · 18:00 – 20:00 (2 tiếng)"
  * Address: "Tòa S2.05 Vinhomes Smart City, Tây Mỗ, Nam Từ Liêm, Hà Nội"
- Action Buttons Row:
  * Primary Outline: "Xem chi tiết hồ sơ" (navigate to profile)
  * Secondary Subtle: "Đổi người khác / Hủy yêu cầu" (text-red-500 font-medium text-xs hover:underline)

■ CARD VARIANT 1B: NEW JOB POSTED — LOOKING FOR APPLICANTS
- Status Pill: "🔍 Đang tìm CarePartner" (bg-blue-50 text-blue-700 font-bold px-3 py-1 rounded-full text-xs)
- Title: "Đón bé 5 tuổi từ trường mầm non về nhà"
- Schedule: "Thứ Hai, 22/09/2026 · 16:30 – 18:00"
- AI Matching Banner:
  * "✨ AI đã tìm thấy 3 sinh viên phù hợp quanh khu vực 2km"
- Actions:
  * Button 1: "Xem 3 ứng viên phù hợp →" (bg-orange-500 text-white font-bold px-4 py-2 rounded-xl text-sm)
  * Button 2: "Hủy việc" (text-slate-400 text-xs)

─────────────────────────────────────────────────────────────────────────────
4. TAB 2 CONTENT — "SẮP LÀM" (UPCOMING & ACTIVE SESSIONS)
─────────────────────────────────────────────────────────────────────────────

Where jobs LEAP immediately after the student clicks "Xác nhận nhận việc":

■ ACTIVE / UPCOMING CARD:
- Card Container: White card with emerald/blue top accent border (border-t-4 border-emerald-500).
- Header Row:
  * Status Pill: "🟢 Sinh viên đã cam kết nhận đơn" (or "🔵 Đang trong ca làm")
  * Timing Badge: "Bắt đầu sau 2 giờ" (or "Đang diễn ra: 35 phút còn lại")
  * Price: "300.000đ" (Escrow đã bảo đảm)
- Job Title: "Gia sư Tiếng Anh giao tiếp lớp 4"
- Assigned CarePartner Mini-Bar:
  * Avatar + "Sinh viên phụ trách: Trần Minh Anh (ĐH Ngoại Thương - 4.95⭐)"
  * Phone & Direct Contact: "SĐT: 0912.xxx.xxx · Đã mở kênh kết nối"
- Live Tracking & Safety Card (In-card preview):
  * Mini map preview with live pin: "📍 Vị trí trực tiếp: Đang bật định vị an toàn"
  * Safe Zone: "Trong vòng an toàn Geofence (Chung cư Vinhomes Smart City)"
  * Button: "Xem bản đồ định vị trực tiếp →"
- Communication & Action Dock:
  * Primary Button: "Xác nhận hoàn thành ca" (bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20)
  * Secondary Button: "💬 Nhắn tin trực tiếp" (bg-slate-100 text-slate-700 font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1)
  * Call Button: Circular phone icon button (border border-slate-200 p-2.5 rounded-xl)
  * Safety Trigger: "🆘 Báo sự cố khẩn cấp / No-show" (text-xs text-red-500 font-semibold)

─────────────────────────────────────────────────────────────────────────────
5. TAB 3 CONTENT — "LỊCH SỬ" (COMPLETED & ARCHIVED SESSIONS)
─────────────────────────────────────────────────────────────────────────────

Where jobs MOVE & SAVE permanently after shift completion:

■ COMPLETED CARD:
- Card Container: White card with soft slate border (border border-slate-200).
- Header Row:
  * Completed Badge: "✅ Đã hoàn thành ca làm" (bg-emerald-50 text-emerald-700 font-bold px-3 py-1 rounded-full text-xs)
  * Completed Timestamp: "15/09/2026 · 20:00"
  * Amount: "300.000đ" (Đã giải ngân qua MoMo)
- Job Title: "Kèm bé làm bài tập & Dạy cờ vua cơ bản"
- CarePartner Info:
  * Avatar + "Sinh viên: Hoàng Đức Nam (ĐH Bách Khoa Hà Nội)"
- Rating & Review Section:
  * If NOT reviewed yet:
    - Glowing Prompt Box: "⭐ Bạn thấy sinh viên Nam hỗ trợ bé như thế nào? Hãy đánh giá 5 sao để tích điểm uy tín cho em ấy!"
    - Button: "Viết đánh giá ngay ⭐" (bg-amber-500 text-white font-bold py-2 px-4 rounded-xl text-xs)
  * If ALREADY reviewed:
    - Display Rating: "⭐⭐⭐⭐⭐ 'Anh Nam dạy con rất nhiệt tình và chu đáo, bé rất thích học cùng anh!'"
- Post-Shift Essentials (Trust & Re-booking):
  * Care Diary Button: "📝 Xem nhật ký chăm sóc bé" (View meals, study notes, child behavior logged by student)
  * MoMo Escrow Receipt: "🧾 Biên lai thanh toán MoMo (Đã giải ngân 80% cho sinh viên, 20% phí nền tảng)"
  * 1-Tap Re-book Button: "🔁 Đặt lại bạn sinh viên này cho tuần sau" (bg-orange-50 text-orange-600 font-bold py-2 px-4 rounded-xl text-xs border border-orange-200 flex items-center justify-center gap-1 hover:bg-orange-100 transition-all)

─────────────────────────────────────────────────────────────────────────────
6. EMPTY STATES FOR EACH TAB
─────────────────────────────────────────────────────────────────────────────
- Tab "Chờ xác nhận" Empty:
  * Icon: check_circle_outline
  * Title: "Không có đơn nào đang chờ"
  * Subtext: "Khi bạn đăng việc mới hoặc chỉ định sinh viên, đơn sẽ xuất hiện tại đây để bạn xem lại."
  * Button: "+ Đăng việc mới ngay"
- Tab "Sắp làm" Empty:
  * Icon: event_note
  * Title: "Chưa có ca làm nào sắp tới"
  * Subtext: "Khi sinh viên xác nhận cam kết nhận đơn, ca làm sẽ nhảy vào đây để bạn theo dõi."
- Tab "Lịch sử" Empty:
  * Icon: history_edu
  * Title: "Chưa có lịch sử hoàn thành"
  * Subtext: "Các ca làm sau khi kết thúc sẽ được lưu trữ tại đây kèm đánh giá và hóa đơn MoMo."

─────────────────────────────────────────────────────────────────────────────
7. BOTTOM NAVIGATION BAR (Parent Role Matching System)
─────────────────────────────────────────────────────────────────────────────
Fixed floating bottom bar with 5 items:
1. Trang chủ (home)
2. Việc của tôi (assignment — Active in #F26522)
3. AI Trợ lý (smart_toy — Floating central FAB button)
4. Theo dõi (map / tracking)
5. Tài khoản (person)

═══════════════════════════════════════════════════════════════════════════════
SECTION D — STRICT ANTI-PATTERNS (DO NOT INCLUDE)
═══════════════════════════════════════════════════════════════════════════════
- NO using the jargon "ELO" — strictly use "Điểm uy tín" or "Điểm tín nhiệm".
- NO combining pending and active jobs in a confusing single list without clear stage indicators.
- NO hiding the chosen student's profile when the order is pending confirmation.
- NO unverified worker profiles without university and CCCD verified badges.
- NO generic English text — everything must be natural Vietnamese suitable for Vietnamese parents.
```
