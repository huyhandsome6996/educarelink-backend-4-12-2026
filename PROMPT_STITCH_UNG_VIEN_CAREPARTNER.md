# PROMPT THIẾT KẾ GOOGLE STITCH AI: MÀN HÌNH "DANH SÁCH ỨNG VIÊN CAREPARTNER TUYỂN CHỌN" (EDUCARELINK)

> **Hướng dẫn sử dụng**: Sao chép toàn bộ nội dung trong khung prompt bên dưới và dán trực tiếp vào công cụ **Google Stitch** (tại [labs.google.com/stitch](https://labs.google.com/stitch) hoặc công cụ AI UI Design) để sinh mã HTML/CSS/Tailwind giao diện Web hoàn chỉnh, đẳng cấp agency.

---

```markdown
Role & Task:
You are an elite Lead Product Designer and Design Systems Architect at Google Stitch. Design a world-class, anti-generic, production-ready responsive Web interface for the "CarePartner Matching Candidates List" (Danh sách ứng viên CarePartner tuyển chọn) for EduCareLink (a premier Vietnamese trust-based child care & tutoring platform operating in Thừa Thiên Huế).

Context & Design System:
- Project: EduCareLink (Phụ huynh tìm CarePartner: Gia sư, Trông trẻ, Đón trẻ tại TP. Huế).
- Primary Accent: #F26522 (EduCareLink Signature Orange), hover #D4541E.
- Background: #F8F9FB (Ultra-clean soft gray-blue), Surfaces #FFFFFF with subtle slate borders (border-slate-150 / rgba(226, 232, 240, 0.8)).
- Typography: Headline & Big Numbers in 'Manrope' (weights 700, 800), Body & UI in 'Plus Jakarta Sans' (weights 400, 500, 600, 700).
- Icons: Google Material Symbols Outlined (clean, crisp, no emojis).
- Geography: Strictly Thừa Thiên Huế (Trường ĐH Sư Phạm - ĐH Huế, ĐH Y Dược - ĐH Huế, ĐH Ngoại Ngữ - ĐH Huế, ĐH Khoa Học - ĐH Huế; P. Vĩnh Ninh, P. Phú Nhuận, P. Phú Hội, TP. Huế).
- Device Layout: Desktop first (with 260px fixed left sidebar), fully responsive for tablet & mobile.

Layout Architecture & Required Components:

1. FIXED DESKTOP SIDEBAR (Left column, 260px width, full height):
- Brand Header: Rounded orange logo container with EduCareLink icon, typography "EduCareLink" (with "Care" highlighted in #F26522), and pill badge "Phụ huynh" with subtle orange pulse dot.
- Main Navigation Groups:
  * Group "QUẢN LÝ & DỊCH VỤ": Trang chủ (home), Việc của tôi (assignment), Nhật ký chăm sóc (auto_stories), Đăng việc ghép cặp (add_circle, highlighted with badge "Mới" in #F26522 - ACTIVE state with orange left indicator border), Ví credit (account_balance_wallet).
  * Group "HỖ TRỢ & HỆ THỐNG": AI Trợ lý (smart_toy), Hướng dẫn sử dụng (help_outline).
- User Footer Card: Rounded card displaying logged-in parent "Công Vinh Trương", role "Phụ huynh", initials avatar "CV" in #F26522, and button "Đăng xuất tài khoản".

2. STICKY TOP APP BAR (lg:ml-[260px]):
- Left: Back button (arrow_back icon + "Quay lại" in slate-600 hover:text-orange-600).
- Center: Screen title "Danh sách ứng viên CarePartner tuyển chọn" (Manrope font, bold, 17px).
- Right: Trust badge capsule "EduCareLink Guarantee" with royal blue shield icon (verified escrow protection 100%).

3. JOB CONTEXT CAPSULE (Top of Main Content):
- A premium rounded-2xl white card summarizing the posted job requirement:
  * Left: Category pill tag (e.g., "GIA SƯ & KÈM HỌC 1:1" with school icon, or "CHĂM SÓC & TRÔNG TRẺ" with child icon) in soft orange tint, and bold rate "120.000đ/giờ".
  * Title: "Gia sư kèm Toán & Tiếng Anh cho bé lớp 4" (Manrope bold 18px).
  * Meta rows: Schedule badge "18:00 - 20:00 · Thứ 2, 4, 6 (12 buổi)" with calendar icon; Location badge "Đường Lê Lợi, P. Vĩnh Ninh, TP. Huế (Cách bạn 1.2 km)" with pin icon.
  * Right: Button "Chỉnh sửa yêu cầu" (ghost button).

4. ALGORITHM LIVE RADAR STATUS (Emerald Pulsing Banner):
- A soothing mint/emerald banner (bg-emerald-50/80 border border-emerald-200/60 rounded-2xl p-4):
  * Left: Glowing emerald radar dot with 2 animated expanding pulse rings.
  * Content: Title "Thuật toán ELO đã tuyển chọn 8 CarePartner phù hợp nhất", Subtitle "Khớp chuyên môn sư phạm · Bán kính gần nhà tại TP. Huế · 100% đối soát CCCD & Thẻ SV".
  * Right: Sparkles AI icon with subtle rotation badge.

5. INTERACTIVE FILTER & SORT PILLS (Horizontal Scroll / Flex Row):
- Modern rounded-full pills for instant sorting & filtering:
  * [🌟 Phù hợp nhất] (Active state: orange background #F26522 with white text and drop shadow)
  * [📍 Gần nhà nhất] (Inactive: white surface, slate-600, border-slate-200, hover:bg-slate-50)
  * [⭐ Đánh giá cao nhất]
  * [👩 Chỉ xem Nữ]
  * [🎓 ĐH Sư Phạm Huế]

6. #1 SPOTLIGHT HERO CANDIDATE CARD (Top recommendation - Signature UI):
- A masterfully crafted spotlight card for the #1 ranked CarePartner:
  * Top Ribbon: Crown/trophy icon with gradient label "GỢI Ý HÀNG ĐẦU · 96/100 ĐIỂM", flanked by green checkmark badge "✓ CCCD & Thẻ SV chuẩn".
  * Main Profile Row:
    - Large 64px avatar with bold initial "H", ringed with orange accent, checkmark badge.
    - Name "Nguyễn Thu Hà" (Manrope bold 20px) + badge "#CP-8824".
    - University & Major: "ĐH Sư Phạm - Đại học Huế · Sư phạm Giáo dục Tiểu học".
    - 3 Key Metrics:
      • ⭐ 4.95 (48 ca hoàn thành)
      • 📍 1.2 km (P. Phú Nhuận, TP. Huế)
      • ✅ 100% rảnh lịch ca này
  * Skill Chips: "Luyện chữ đẹp", "Tiểu học", "Kiên nhẫn", "Sư phạm chuẩn" in light gray-100 rounded-lg tags.
  * Verified Parent Review Quote: Quote box with orange quotation icon:
    "Cô giáo dạy luyện chữ cực kỳ kiên nhẫn và ân cần. Sau 10 buổi nét chữ bé tiến bộ vượt bậc, tròn và đều tăm tắp!" — Phụ huynh tại P. Vĩnh Ninh, TP. Huế.
  * Action CTA Row:
    - Button "Xem hồ sơ chi tiết" (border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl px-5 py-3).
    - Hero Primary CTA: "Chọn CarePartner này →" (Solid orange gradient #F26522 to #D4541E, bold white text, subtle pulse shadow, rounded-xl px-7 py-3).

7. STANDARD CANDIDATE CARDS (#2 to #8):
- Clean, balanced cards for subsequent candidates:
  * Card #2: "Đỗ Hoàng Ngân" · ĐH Sư Phạm Huế (Giáo dục Mầm non) · 95 điểm phù hợp · ⭐ 5.0 (38 ca) · 1.4 km · Tags: "Trông trẻ", "Montessori", "Sơ cấp cứu".
  * Card #3: "Lê Thảo Vy" · ĐH Sư Phạm Huế (Sư phạm Ngữ Văn) · 93 điểm phù hợp · ⭐ 4.9 (35 ca) · 1.8 km · Tags: "Rèn chữ", "Ngữ văn", "Tiểu học".
  * Card #4: "Nguyễn Hữu Phước" · ĐH Y Dược Huế (Bác sĩ Đa khoa) · 91 điểm phù hợp · ⭐ 4.9 (34 ca) · 1.5 km · Tags: "Đón trẻ", "Sơ cấp cứu", "An toàn".
  * Card #5: "Vũ Khánh An" · ĐH Y Dược Huế (Điều dưỡng Nhi) · 90 điểm phù hợp · ⭐ 4.95 (31 ca) · 2.2 km · Tags: "Chăm bé", "Dỗ ăn", "Sơ cứu".
  * Card #6: "Trần Thị Minh Thư" · ĐH Ngoại Ngữ Huế (Tiếng Anh) · 89 điểm phù hợp · ⭐ 5.0 (32 ca) · 1.6 km · Tags: "Tiếng Anh", "Phát âm chuẩn".
- Each card has: Rank badge (#2, #3...), Score display (e.g. "95 đ"), Quick info, Review snippet, and action buttons "Xem hồ sơ" & "Chọn bạn này".

8. FOOTER SAFETY GUARANTEE BOX:
- Trust box with 2 columns:
  * Shield 1: "Ký quỹ an toàn MoMo Escrow": Tiền tạm giữ an toàn, chỉ giải ngân cho CarePartner sau khi ca kết thúc và phụ huynh xác nhận hài lòng.
  * Shield 2: "Bảo hiểm đổi ứng viên 100%": Miễn phí đổi bạn khác ngay lập tức nếu phát sinh trường hợp bất khả kháng.

9. BOOKING CONFIRMATION MODAL (Interactive Dialog):
- Modal overlay with backdrop blur:
  * Icon handshake in soft orange circle.
  * Title: "Xác nhận chọn CarePartner".
  * Confirmation text: "Bạn muốn chọn Nguyễn Thu Hà (96/100 điểm) cho việc 'Gia sư kèm Toán & Tiếng Anh'?".
  * Info note: "Đơn được xác nhận tự động qua MoMo Escrow. Bạn được bảo vệ 100% theo chính sách credit."
  * Buttons: "Xem thêm" (Cancel) & "Xác nhận chọn" (Primary Orange).

10. TRUTHFUL EMPTY STATE (Alternative View):
- An elegant empty state when 0 candidates match:
  * Icon: Magnifying glass in warm amber circle.
  * Title: "Chưa tìm thấy CarePartner phù hợp trong khung giờ đã chọn".
  * Subtitle: "Thử nới rộng khung giờ hoặc đổi ngày học để có thêm ứng viên rảnh lịch tại TP. Huế.".
  * Advice box with lightbulb icon.
  * Action button: "Điều chỉnh yêu cầu / Đổi khung giờ" (Redirect to job form).

Visual Quality Standard:
- Tailwind CSS with semantic colors and custom utility classes.
- Zero generic AI purple glows or rainbow gradients.
- Micro-interactions: hover elevation, smooth transitions (0.2s cubic-bezier).
- High visual hierarchy, spacious padding (py-8 px-6), pixel-perfect alignment with the 260px sidebar.
```
