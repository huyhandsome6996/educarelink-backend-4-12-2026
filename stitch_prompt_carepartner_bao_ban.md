# PROMPT CHÍNH THỨC: NÂNG CẤP GIAO DIỆN "BÁO BẬN / NGHỈ ĐỘT XUẤT" CAREPARTNER (GOOGLE STITCH UI)

> **Mục tiêu**: Nâng cấp toàn diện giao diện màn hình **Báo bận / Thi / Nghỉ đột xuất** (`BlackoutScreen.js`) dành cho Sinh viên (CarePartner), chuyển hóa từ giao diện tĩnh mặc định sang phong cách **Google Stitch (Warm Professionalism, Bento Grid, Zero Jargon)** đồng bộ với màn hình Lịch rảnh.

---

## 🎨 1. TOÀN VĂN PROMPT ĐỂ ĐƯA VÀO GOOGLE STITCH

```text
Design a premium, warm, modern mobile app screen (React Native / Tailwind CSS style) for a Vietnamese CarePartner/University Student "Blackout & Off-day Registration" screen (Báo bận / Thi / Nghỉ đột xuất) in EduCareLink.

DESIGN PHILOSOPHY & VISUAL IDENTITY:
- Theme: Warm Professionalism, Bento Grid Layout, Clean Typography.
- Primary Accent: Brand Amber/Orange (#F26522 / #EA580C) with Soft Warm Sand (#FAF8FF) background.
- Warning/Alert Accents: Rose (#E11D48 / #FFF1F2) for blackout/off-days, Amber (#D97706 / #FEF3C7) for exam/health alerts.
- Typography: Plus Jakarta Sans / Manrope, highly legible with zero technical jargon.

CORE UI COMPONENTS & LAYOUT STRUCTURE:

1. STICKY TOP APP BAR:
   - Left: Rounded back arrow icon button.
   - Title Center: "Khai Báo Lịch Bận & Thi", subtitle "AI sẽ tạm dừng ghép việc trong các ngày này".
   - Right: Help/Shield icon button "Quy định báo bận".

2. HERO BENTO WARNING & SHIELD CARD (Top Banner):
   - Icon: Calendar with lock or shield icon (#E11D48).
   - Headline: "Bảo Vệ Điểm Tín Nhiệm & ELO Đối Tác".
   - Subtitle: "Báo bận trước ít nhất 24 giờ giúp bạn duy trì chỉ số uy tín 100% và không bị trừ điểm tín nhiệm khi thi học kỳ hoặc có việc gia đình."
   - Status Badge: "Tối đa 30 ngày bận / tương lai".

3. INTERACTIVE BLACKOUT REGISTRATION FORM (Bento Form Card):
   - Section Title: "Thêm Ngày Bận Mới".
   - Reason Chips Selector (Horizontal scrollable / Grid of 6 interactive pills):
     - 🎓 Thi / Kiểm tra (Code: 'exam') - Active state: Soft Amber background with border.
     - 🩺 Sức khỏe / Ốm (Code: 'health')
     - 🏡 Việc gia đình (Code: 'family')
     - ✈️ Đi xa / Về quê (Code: 'travel')
     - 👤 Việc cá nhân (Code: 'personal')
     - 📌 Lý do khác (Code: 'other')
   - All-Day vs Time Slot Toggle:
     - Switch row: "Bận cả ngày" (Toggle switch active by default).
     - If toggled off: Interactive Time Range Stepper (From: 07:00 -> To: 12:00) with +/- buttons.
   - Date Picker Trigger Button:
     - High-contrast Primary Button: "CHỌN NGÀY VÀ LƯU LỊCH BẬN" (Large button with calendar icon).

4. REGISTERED BLACKOUT DATES LIST (Danh sách ngày bận đã khai):
   - Header Row: "Lịch bận đã đăng ký" + Counter Badge (e.g. "3 ngày").
   - Card Items:
     - Left Color Strip: Rose Red (#E11D48) for All-day blackout, Amber for specific time slot.
     - Date & Time Badge: "Thứ 6, 20/09/2026" · "Cả ngày" (or "07:00 - 12:00").
     - Reason Tag: Soft pill tag showing reason icon & text (e.g., "🎓 Thi / Kiểm tra").
     - Right Trash Action: Trash icon button to delete/cancel blackout date with loading feedback.
   - Empty State (When 0 blackout dates):
     - Friendly calendar graphic/icon with checkmark.
     - Text: "Bạn chưa đăng ký ngày bận nào. AI đang sẵn sàng ghép việc cho bạn 7 ngày trong tuần."

5. RULES & GUIDELINES BOTTOM SHEET / MODAL:
   - Title: "Quy tắc báo bận EduCareLink".
   - Bullet points:
     - 1. Không báo trùng với đơn hàng đã cam kết nhận việc (cần hủy đơn trước).
     - 2. Báo trước 24h không bị ảnh hưởng điểm tín nhiệm.
     - 3. Hệ thống tự động mở lại lịch rảnh sau khi hết ngày bận.

6. BOTTOM NAV BAR SAFETY:
   - Ensure clear bottom space (padding bottom 110px) to preserve native mobile bottom tab bar.
```

---

## 🛠️ 2. PROMPT HƯỚNG DẪN CHỈNH SỬA TRỰC TIẾP (EDITING PROMPT)

```text
Chỉnh sửa giao diện màn hình BlackoutScreen (Báo bận / Thi) của CarePartner trong ứng dụng EduCareLink:
1. Thay thế giao diện đơn điệu hiện tại bằng phong cách thiết kế Google Stitch Bento Grid:
   - Header có nút quay lại, tiêu đề "Khai Báo Lịch Bận & Thi" và thẻ thông tin bảo vệ điểm tín nhiệm ELO.
   - Bộ chọn lý do nghỉ dạng Chip ngang/lưới 6 mục với biểu tượng trực quan (Thi / Kiểm tra, Sức khỏe, Việc gia đình, Đi xa, Cá nhân, Khác).
   - Nút bật/tắt "Bận cả ngày" và bộ chọn khoảng thời gian (nếu chỉ bận theo giờ).
   - Nút "CHỌN NGÀY VÀ LƯU LỊCH BẬN" màu cam thương hiệu nổi bật.
2. Danh sách ngày bận đã đăng ký được thiết kế dạng Card Bento hiện đại:
   - Phân biệt rõ ngày bận cả ngày (dải màu đỏ hồng) và bận theo khung giờ (dải màu cam hổ phách).
   - Nút xóa thùng rác với xác nhận rõ ràng.
   - Empty State thân thiện khi chưa đăng ký ngày bận nào.
3. Giữ nguyên toàn bộ logic API backend gốc:
   - GET /api/matching/carepartners/me/blackouts/ (lấy danh sách ngày bận)
   - POST /api/matching/carepartners/me/blackouts/ (thêm ngày bận)
   - DELETE /api/matching/carepartners/me/blackouts/<id>/ (xóa ngày bận)
   - Xử lý mượt mà lỗi trùng lịch đơn đã nhận (status 409 conflict).
4. Giữ nguyên 100% thanh điều hướng dưới (Bottom Tab Navigator) của ứng dụng.
```
