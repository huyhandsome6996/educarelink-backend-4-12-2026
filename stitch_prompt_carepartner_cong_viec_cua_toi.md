# 🎨 Prompt Google Stitch AI — Màn hình: Quản lý Công việc của tôi cho CarePartner (CarePartner My Jobs & Shifts)
# Chuyên sâu: Nâng cấp Toàn diện Trải nghiệm Sinh viên quản lý Ca sắp làm, Ca đang làm (Bật GPS & SOS) & Lịch sử

> **Trang mục tiêu**: Màn hình Quản lý Công việc của CarePartner (`MyJobsScreen.js` trên Mobile App & `/carepartner/cong-viec/` trên Web)  
> **Dự án**: EduCareLink — Nền tảng kết nối Phụ huynh với Sinh viên Đại học & CarePartner  
> **Ngôn ngữ thiết kế**: Google Stitch Design System — Bento Grid, Warm Professionalism, Zero Jargon, Tối ưu Mobile (390px - 430px)  
> **Cách sử dụng**: Copy toàn bộ nội dung dưới đây và dán vào Google Stitch AI để nhận bản thiết kế HTML / Tailwind CSS.

---

```markdown
You are an elite Senior Product Designer and Mobile UI/UX Architect designing the signature "My Jobs & Shifts Management" screen for CarePartners (vetted university students) on EduCareLink (educarelink-backend-4-12-2026).

Design a mobile-first responsive web view (viewport 390px - 430px, iOS Safari & Android Chrome feel) using semantic HTML5, modern Tailwind CSS, Google Fonts ('Plus Jakarta Sans' + 'Manrope'), and Google Material Symbols Outlined.

═══════════════════════════════════════════════════════════════════════════════
TÂM LÝ & MỤC TIÊU CỦA CAREPARTNER KHI QUẢN LÝ CÔNG VIỆC
═══════════════════════════════════════════════════════════════════════════════

1. Bối cảnh:
Sinh viên cần theo dõi các ca làm sắp tới trong tuần, điểm danh khi đến nơi, bật chia sẻ vị trí an toàn cho phụ huynh theo dõi, và khi hoàn thành thì xem tiền đã cộng vào ví hay chưa.
Giao diện trước đây chỉ có tab thô cứng, thiếu cảm giác công nghệ an toàn, không có hiển thị trạng thái Live GPS và nút SOS khẩn cấp.

2. Nhu cầu cốt lõi của Sinh viên:
- PHÂN ĐỊNH 3 TAB VÒNG ĐỜI RÕ RÀNG:
  * Tab 1: "Sắp làm" — Ca đã cam kết, có đếm ngược đến giờ bắt đầu, nút chỉ đường và nút "Tôi đã đến nơi".
  * Tab 2: "Đang làm" — Ca đang diễn ra, hiển thị rõ trạng thái BẬT CHIA SẺ VỊ TRÍ (Live GPS Active) kèm nút khẩn cấp SOS và nút "Hoàn thành ca".
  * Tab 3: "Lịch sử" — Các ca đã xong, số tiền thực nhận đã cộng vào ví (+160.000đ), đánh giá 5 sao từ phụ huynh.
- BẢO VỆ AN TOÀN TUYỆT ĐỐI: Nút SOS khẩn cấp với hotline bảo vệ sinh viên 24/7.
- CẢM GIÁC THÀNH TỰU: Thẻ tổng kết thu nhập tuần & số giờ đã tích lũy điểm rèn luyện.

═══════════════════════════════════════════════════════════════════════════════
BẢNG MÀU THIẾT KẾ (COLOR TOKENS)
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Slate siêu nhạt, sạch, thoáng)
- Surface Card: #FFFFFF viền mảnh 1px #E2E8F0 và đổ bóng đa tầng shadow-sm
- Signature Orange: #F26522 (Cam ấm nhận diện thương hiệu)
- Live GPS Cyan: #0284C7 (Xanh bầu trời định vị real-time kèm hiệu ứng pulse)
- Earnings Emerald: #10B981 (Xanh lá thu nhập thực nhận)
- Alert SOS Red: #EF4444 (Đỏ an toàn, nút SOS cứu hộ)
- Ink Text: #0F172A (Chữ chính đậm nét, dễ đọc)
- Sub Text: #64748B (Chữ phụ, nhãn thời gian)

═══════════════════════════════════════════════════════════════════════════════
CẤU TRÚC GIAO DIỆN (TỪ TRÊN XUỐNG DƯỚI)
═══════════════════════════════════════════════════════════════════════════════

1. TOP APP BAR:
- Tiêu đề: "Công việc của tôi" (Font chữ đậm 20px).
- Nút SOS Tròn nổi màu đỏ #EF4444 góc phải trên cùng (nhấn vào kích hoạt trợ giúp khẩn cấp).

2. BENTO TỔNG KẾT TUẦN (Weekly Performance Bento):
- 3 chỉ số nhanh:
  * Thu nhập tuần này: "1.280.000đ" (Màu xanh emerald #10B981).
  * Ca đã hoàn thành: "8 ca" (100% đúng giờ).
  * Đánh giá trung bình: "4.95 ★".

3. THANH TAB CHUYỂN TRẠNG THÁI (Pill Segmented Control):
- 3 Tab bo tròn mềm mại:
  * "Sắp làm (2)"
  * "Đang làm (1)" (Kèm chấm xanh nhấp nháy Live)
  * "Lịch sử (15)"

4. DANH SÁCH THẺ CA LÀM (Bento Job Cards):
- Nếu ở Tab "Đang làm":
  * Card viền xanh công nghệ phát sáng nhẹ (border-sky-300).
  * Huy hiệu Live GPS: "Đang chia sẻ vị trí với Phụ huynh · Độ chính xác 5m".
  * Tiêu đề ca: "Gia sư Toán & Khoa học bé Nam (Lớp 4)".
  * Thời gian ca: 18:00 - 20:00 (Đã làm được 1h15m / 2h00m).
  * Phụ huynh: Chị Mai Lan · ĐT: 0908.010.101 (Nút gọi nhanh).
  * 2 Nút hành động: "Báo cáo ca làm" & "Kết thúc ca & Nhận tiền".
- Nếu ở Tab "Sắp làm":
  * Huy hiệu đếm ngược: "Bắt đầu sau 2 giờ 15 phút".
  * Thông tin địa chỉ kèm nút "Mở Google Maps chỉ đường".
  * Nút "Tôi đã có mặt tại nhà phụ huynh".
- Nếu ở Tab "Lịch sử":
  * Thẻ ca hoàn thành, badge "+160.000đ Đã vào ví", lời khen từ phụ huynh ("Gia sư rất đúng giờ và nhiệt tình!").

5. CẤM: Không dùng thanh điều hướng đáy thay thế cho app (phần đáy để trống 80px cho Bottom Tab Bar gốc).
```
