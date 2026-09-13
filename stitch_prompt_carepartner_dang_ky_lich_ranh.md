# 🎨 Prompt Google Stitch AI — Màn hình: Đăng ký Lịch rảnh & Ghép việc AI của Sinh viên (CarePartner AI Availability Schedule)
# Chuyên sâu: Sinh viên khai báo lịch rảnh để Hệ thống & AI tự động quét tìm và ghép việc cho Phụ huynh

> **Trang mục tiêu**: Màn hình Đăng ký Lịch rảnh của CarePartner (`AvailabilityScreen.js` trên Mobile App & `/carepartner/lich-ranh/` trên Web)  
> **Dự án**: EduCareLink (educarelink-backend-4-12-2026)  
> **Ngôn ngữ thiết kế**: Google Stitch Design System — Bento Grid, Warm Professionalism, Zero Jargon, Tối ưu Mobile (390px - 430px)  

---

## 1. Lời nhắc chỉnh sửa trực tiếp trên bản thiết kế hiện tại (Quick Refinement Prompt)
*Dùng để dán trực tiếp vào ô chat của Google Stitch ngay bên dưới giao diện vừa tạo:*

```markdown
Refine and correct the current design with the following critical adjustments:

1. HEADER & IDENTITY CORRECTION:
- CHANGE the header title from "Chi Tiết Ca Dạy & Chăm Sóc" and badge "#EDC-9284" (which looks like a parent's single task) to:
  * Title: "Lịch Rảnh & Ghép Việc AI" (CarePartner AI Availability Schedule)
  * Badge: "CAREPARTNER RADAR ACTIVE" (with a glowing emerald pulse dot)
  * Subtitle: "Hệ thống AI tự động phân tích lịch và kết nối bạn với phụ huynh phù hợp"

2. AI MATCHING MECHANISM HIGHLIGHT (Cơ chế Ghép việc AI):
- Add an AI Engine Status Card right under the header:
  * Headline: "Radar AI Đang Tìm Kiếm Việc Làm Cho Bạn"
  * Description: "Khi bạn mở lịch rảnh, thuật toán AI EduCareLink sẽ tự động đối soát kỹ năng sư phạm, vị trí GPS và khung giờ của bạn để ưu tiên đưa hồ sơ của bạn lên đầu bảng khi phụ huynh quanh khu vực tìm người."
  * Status Pill: "🟢 AI Sẵn Sàng Ghép Đơn (Bán kính 10km)"

3. SLOT STATUS CLARITY:
- For Open Slots (Khung giờ rảnh đang mở):
  * Badge: "🟢 AI Đang Tìm Phụ Huynh Phù Hợp"
  * Metric: "Ước tính thu nhập: 240k - 360k"
- For Matched/Locked Slots (Khung giờ đã có phụ huynh đặt):
  * Badge: "🔒 AI Đã Ghép Đơn #EDC-8824 (Bé Nam - Lớp 4)"
  * Note: "Đã chốt lịch hẹn. Giữ uy tín 100/100 điểm tín nhiệm."

4. CLEANUP:
- Ensure all labels emphasize the CarePartner's agency: this is the student's control center to feed their free time into the AI matching algorithm, NOT a parent's booking detail.
- Keep the bottom padding clear (pb-28) for the app's native Bottom Tab Navigator.
```

---

## 2. Toàn văn Prompt gốc đã chuẩn hóa toàn diện (Full Regenerate Prompt)
*Dùng nếu muốn Google Stitch tạo mới lại toàn bộ trang từ đầu:*

```markdown
You are an elite Senior Product Designer and Mobile UI/UX Architect designing the flagship "Weekly Availability & AI Job Matching Schedule" screen for CarePartners (university student tutors and childcare companions) on EduCareLink (educarelink-backend-4-12-2026).

This is strictly a CAREPARTNER / STUDENT CONTROL CENTER where students register their available time slots so that the EduCareLink AI Matching Engine can automatically scan, match, and recommend them to parents who need tutors or child companions.

Design a mobile-first responsive web view (viewport 390px - 430px, iOS Safari & Android Chrome feel) using semantic HTML5, modern Tailwind CSS, Google Fonts ('Plus Jakarta Sans' + 'Manrope'), and Google Material Symbols Outlined.

═══════════════════════════════════════════════════════════════════════════════
BỐI CẢNH & CƠ CHẾ AI GHÉP CẶP
═══════════════════════════════════════════════════════════════════════════════

1. Bản chất của màn hình:
Sinh viên đại học khai báo các khung thời gian rảnh giữa các ca học ở trường.
Ngay khi sinh viên mở một khung giờ rảnh (VD: Tối Thứ 6 từ 18:00 đến 21:00), Hệ thống AI Matching của EduCareLink lập tức:
- Kích hoạt Radar quét trong bán kính 5km - 10km quanh trường hoặc nơi ở của sinh viên.
- Đối soát tự động với các Phụ huynh đang tìm gia sư/trông trẻ trong khung giờ đó.
- Đưa hồ sơ sinh viên lên Top đề xuất cho phụ huynh chọn.
- Khi phụ huynh chọn, sinh viên nhận thông báo và có 60 phút để xác nhận.

2. Trải nghiệm mong muốn:
- Rõ ràng là giao diện của SINH VIÊN QUẢN LÝ LỊCH NHẬN VIỆC, KHÔNG PHẢI chi tiết 1 đơn của phụ huynh.
- Tiêu đề: "Lịch Rảnh & Ghép Việc AI".
- Thẻ trạng thái AI Radar đang chạy ("AI Matching Engine Active").
- Dự báo thu nhập tiềm năng dựa trên số giờ đã mở.
- Chọn nhanh các khung giờ vàng (18:00 - 21:00, 14:00 - 17:30...).
- Hiển thị rõ ràng trạng thái từng ca: "AI Đang tìm việc" vs "AI Đã ghép thành công (Đã khóa ca)".

═══════════════════════════════════════════════════════════════════════════════
BẢNG MÀU THIẾT KẾ (COLOR TOKENS)
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Slate siêu nhạt, sạch sẽ)
- Surface Card: #FFFFFF viền mảnh 1px #E2E8F0 và đổ bóng đa tầng shadow-sm
- Signature Orange: #F26522 (Cam ấm nhận diện thương hiệu)
- AI Emerald: #10B981 & nền #ECFDF5 (Xanh lá biểu trưng cho AI Matching & Thu nhập)
- Golden Hour: #F59E0B & nền #FFFBEB (Giờ vàng phụ huynh đặt nhiều)
- Matched Booking: #0284C7 & nền #EFF6FF (Ca đã được ghép đơn thành công)
- Ink Text: #0F172A (Chữ chính đậm nét)
- Muted Text: #64748B (Chữ phụ)

═══════════════════════════════════════════════════════════════════════════════
KIẾN TRÚC GIAO DIỆN (TỪ TRÊN XUỐNG DƯỚI)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP APP BAR:
- Nút Tròn Quay Lại: Nút tròn 40x40 nền trắng viền mảnh xám nhạt, icon mũi tên quay lại.
- Khu vực Trung tâm:
  * Badge: "CAREPARTNER RADAR 🟢" (Chấm xanh nhấp nháy).
  * Tiêu đề: "Lịch Rảnh & Ghép Việc AI" (Font-bold text-title-md).
- Phải: Nút "Báo bận / Thi cử" (Lối tắt báo nghỉ đột xuất).

2. AI RADAR MATCHING HERO BENTO:
- Khối Bento cam & xanh lá hiện đại:
  * Trạng thái AI: "Thuật toán AI đang tự động tìm việc quanh bạn".
  * Tiềm năng thu nhập tuần: "1.440.000đ – 2.160.000đ" (Dựa trên 18h rảnh đã mở · Đơn giá 80k-120k/h).
  * Độ sẵn sàng nhận việc: "95% Sẵn sàng" kèm thanh tiến trình mini.
  * AI Tip: "Gợi ý AI: Mở thêm 2h tối Chủ Nhật để tăng +20% cơ hội ghép việc gần trường ĐH".

3. THANH CHỌN 7 NGÀY TRONG TUẦN (Weekday Selector):
- Dãy 7 ngày Thứ 2 → Chủ Nhật dạng thẻ đứng:
  * Tên thứ, ngày trong tháng, chấm trạng thái (xanh lá nếu có ca, xám nếu trống).
  * Ngày đang chọn nổi bật nền cam thương hiệu #F26522.

4. 1-CHẠM CHỌN KHUNG GIỜ VÀNG (Quick Presets):
- 4 thẻ chọn nhanh:
  * 🌙 "Giờ vàng: 18:00 – 21:00" (80% Phụ huynh tìm gia sư)
  * ☀️ "Đón trẻ: 14:00 – 17:30" (Đón tan trường & kèm học)
  * 🌅 "Buổi sáng: 08:00 – 11:30" (Cuối tuần)
  * ⚡ "Tối muộn: 19:30 – 22:00"

5. DANH SÁCH KHUNG GIỜ TRONG NGÀY ĐANG CHỌN (Registered Slots):
- Thẻ Khung giờ mở: "18:00 – 21:00 (3.0 tiếng)" kèm badge "🟢 AI Sẵn sàng ghép việc · Ước tính 240k-360k" + Nút xóa.
- Thẻ Khung giờ đã ghép: "14:00 – 16:30 (2.5 tiếng)" kèm badge "🔒 AI Đã ghép đơn #EDC-8824 (Bé Nam - Lớp 4)" + Icon bảo chứng điểm uy tín 100/100.

6. BỘ CÔNG CỤ THÊM GIỜ TÙY CHỌN (Custom Time Stepper):
- Bộ tăng giảm giờ trực quan (+ / - 30 phút).
- Tự động tính thời lượng và khoảng thu nhập ước tính.
- Nút cam to bản: "LƯU KHUNG GIỜ NÀY".

7. LƯU Ý BẢO VỆ SINH VIÊN:
- Thẻ cam kết: "Lịch rảnh có thể đổi bất kỳ lúc nào trước khi có phụ huynh đặt. Khi có ca ghép, bạn có 60 phút để xác nhận trước khi hệ thống khóa ca."
```
