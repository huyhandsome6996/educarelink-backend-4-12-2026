# 🎨 Prompt Google Stitch AI — Màn hình 1: Chi tiết Đơn việc của Phụ huynh (Parent Booking & Task Detail)
# Chuyên sâu: Nâng cấp Toàn diện Trải nghiệm "Đã chọn CarePartner & Đang chờ xác nhận" + Liên thông Vòng đời Đơn

> **Trang mục tiêu**: Màn hình Chi tiết Đơn việc & Giám sát An toàn của Phụ huynh (`BookingDetailScreen.js` trên Mobile App & `/phu-huynh/don/<id>/` trên Web)  
> **Dự án**: EduCareLink (educarelink-backend-4-12-2026) — Nền tảng kết nối Phụ huynh với Sinh viên Đại học & CarePartner  
> **Ngôn ngữ thiết kế**: Google Stitch Design System — Anti-slop, Asymmetric Bento Grid, Dynamic Elevation, Zero Jargon  
> **Cách sử dụng**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are an elite Senior Product Designer and Mobile UI/UX Architect designing the signature detail screen for EduCareLink (educarelink-backend-4-12-2026), a high-trust Vietnamese EdTech & Childcare platform connecting parents with vetted university students for home tutoring and child accompaniment.

The screen must be rendered as an ultra-premium, mobile-first responsive web view (viewport 390px - 430px, optimized for iOS Safari & Android Chrome) using semantic HTML5, modern Tailwind CSS, Google Fonts ('Plus Jakarta Sans' + 'Manrope'), and Google Material Symbols Outlined.

═══════════════════════════════════════════════════════════════════════════════
MỤC TIÊU CỐT LÕI & TÂM LÝ PHỤ HUYNH KHI CHỜ XÁC NHẬN
═══════════════════════════════════════════════════════════════════════════════

1. Bối cảnh trải nghiệm:
Phụ huynh vừa duyệt hồ sơ và bấm "Chọn sinh viên này" cho ca dạy gia sư / chăm sóc bé. Đơn hàng lập tức chuyển sang trạng thái "Chờ sinh viên xác nhận" (`awaiting_commitment`).
Giao diện trước đây bị đánh giá là thô cứng, đơn điệu, thiếu thông tin và gây cảm giác sốt ruột, bất an cho phụ huynh.

2. Nhu cầu cảm xúc của Phụ huynh trong màn hình này:
- CẢM GIÁC AN TÂM (Trấn an tuyệt đối): Biết chắc chắn tiền của mình đang được ký quỹ an toàn qua MoMo Escrow, không bị mất mát hay chiếm dụng.
- RÕ RÀNG MINH BẠCH: Nhìn thấy toàn bộ chân dung người mình vừa chọn (Trường đại học danh tiếng, thẻ sinh viên, CCCD gắn chip, điểm đánh giá sao và số ca đã làm thành công).
- CHỦ ĐỘNG THỜI GIAN: Đồng hồ đếm ngược sinh động (từng phút giây), hiểu rõ quy tắc tự động (nếu sau 60 phút sinh viên không nhận, hệ thống tự mở lại để chọn người khác ngay).
- QUYỀN KIỂM SOÁT: Có thể đổi ý, hủy yêu cầu đổi người khác hoặc liên hệ hotline trợ giúp 24/7 chỉ với 1 chạm.

═══════════════════════════════════════════════════════════════════════════════
BẢNG MÀU THIẾT KẾ (COLOR TOKENS & ATELIER PALETTE)
═══════════════════════════════════════════════════════════════════════════════

- Nền tổng thể (Canvas Background): #F8FAFC (Slate siêu sáng, mềm mắt, sạch sẽ)
- Bề mặt Card & Bento (Pure Surface): #FFFFFF với đường viền 1px siêu mảnh #E2E8F0 và đổ bóng đa tầng shadow-sm
- Màu thương hiệu chính (Signature Orange): #F26522 (Cam ấm áp, kích hoạt hành động, biểu trưng cho sự tận tâm)
- Màu tín nhiệm & Bảo chứng (Trust Emerald): #0E9F6E (Xanh ngọc lục bảo: CCCD xác thực, Ký quỹ Escrow bảo đảm 100%, Đã cam kết)
- Màu đếm ngược & Chờ phản hồi (Pending Amber): #F59E0B và nền #FFFBEB, viền #FDE68A (Tạo sự chú ý nhã nhặn, không gây hoảng loạn)
- Màu định vị trực tiếp (Live GPS Sky): #0284C7 (Xanh bầu trời công nghệ)
- Màu cảnh báo / Hủy (Alert Crimson): #EF4444 (Nút hủy, khiếu nại, SOS)
- Màu chữ chính (Ink Navy): #0F172A (Đậm nét, dễ đọc trên màn hình điện thoại)
- Màu chữ phụ (Muted Slate): #475569 và #94A3B8
- QUY TẮC CẤM: Không dùng phông Inter, không dùng màu đen tuyền (#000000), không dùng bóng neon tím/xanh, không dùng thuật ngữ máy móc "ELO" (phải dùng "Điểm tín nhiệm" hoặc "Điểm uy tín").

═══════════════════════════════════════════════════════════════════════════════
KIẾN TRÚC GIAO DIỆN CHI TIẾT ĐƠN (TỪ TRÊN XUỐNG DƯỚI)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP APP BAR (Thanh điều hướng đỉnh cao cấp)
- Nút Tròn Quay Lại: Nút tròn 40x40 nền trắng viền mảnh xám nhạt, icon mũi tên quay lại.
- Khu vực Trung tâm:
  * Huy hiệu mã đơn: "ĐƠN GHÉP CẶP #EDC-9284" (font-mono text-[11px] uppercase tracking-wider text-slate-400 font-bold).
  * Tiêu đề: "Chi tiết ca dạy & chăm sóc" (font-bold text-sm text-slate-800).
- Nút Phải: Icon tai nghe hỗ trợ tổng đài 24/7 (Hotline 0862427404) với chấm xanh báo hiệu trực ban.

─────────────────────────────────────────────────────────────────────────────
2. HERO BANNER: "ĐANG CHỜ SINH VIÊN XÁC NHẬN" (Bento Trấn an & Đếm ngược)
─────────────────────────────────────────────────────────────────────────────
Một khối Bento bo góc tròn mềm 24px, nền vàng kem ấm áp (bg-amber-50/80 viền 1.5px amber-200), bên trong bao gồm:
- Hàng trạng thái:
  * Biểu tượng đồng hồ cát cát vàng động + Nhãn: "Đang chờ sinh viên xác nhận cam kết" (font-bold text-amber-900 text-sm).
  * Trạng thái nhịp thở (Pulse Dot): Chấm cam phát xung thể hiện hệ thống đang gửi thông báo tức thời tới điện thoại sinh viên.
- Cụm đồng hồ đếm ngược kích thước lớn:
  * Số to ấn tượng (Font Manrope font-extrabold text-2xl text-amber-800 tracking-tight):
    "⏳ 48:25" — kèm nhãn phụ "còn 48 phút 25 giây".
  * Thanh tiến trình thời gian (Progress bar mảnh bo tròn) thể hiện tỷ lệ thời gian còn lại trong khung 60 phút cam kết.
- Hộp thông điệp cam kết quyền lợi phụ huynh (Reassurance Card):
  * Icon chiếc khiên xanh lá nhỏ (#0E9F6E).
  * Nội dung: "Sinh viên có tối đa 60 phút để xác nhận ca. Tiền tạm giữ của bạn được bảo đảm an toàn 100% trong quỹ MoMo Escrow. Nếu sinh viên quá hạn không nhận, bạn không mất bất kỳ chi phí nào và hệ thống sẽ mở lại đơn ngay lập tức."

─────────────────────────────────────────────────────────────────────────────
3. SPOTLIGHT BENTO: HỒ SƠ SINH VIÊN ĐƯỢC CHỌN (Chosen CarePartner Profile)
─────────────────────────────────────────────────────────────────────────────
Khối card trung tâm được thiết kế trang trọng, chứng minh năng lực và sự an tâm tuyệt đối:
- Hàng tiêu đề thẻ: "HỒ SƠ SINH VIÊN BẠN ĐÃ CHỌN" kèm nút nhỏ "Xem hồ sơ đầy đủ ↗"
- Khối thông tin định danh:
  * Ảnh chân dung thẻ sinh viên sắc nét (Avatar 68x68 viền trắng đôi, góc dưới gắn huy hiệu khiên xanh CCCD gắn chip).
  * Họ và tên: "Nguyễn Thị Thu Huyền" (font-bold text-lg text-slate-900).
  * Học vấn: "Đại học Sư phạm Hà Nội · Khoa Giáo dục Tiểu học (Năm 3)".
  * Nhãn xác minh sinh viên: Badge xanh nhạt "Thẻ sinh viên chính quy xác thực 2026".
- Lưới 4 chỉ số tín nhiệm (2x2 Micro-Bento):
  * Ô 1: Đánh giá: "⭐ 4.9 / 5.0" (38 phụ huynh hài lòng)
  * Ô 2: Kinh nghiệm: "42 ca thành công" (Gia sư & Coi trẻ)
  * Ô 3: Điểm uy tín: "100 / 100" (Hạng Xuất Sắc · Chưa từng hủy ca)
  * Ô 4: Xác thực: "CCCD gắn chip" (Đối soát căn cước Bộ Công An)
- Trích đoạn tự bạch & cam kết của sinh viên:
  * "Em từng có 2 năm kinh nghiệm kèm bé lớp 1-3 môn Toán và Tiếng Việt. Tính tình kiên nhẫn, yêu trẻ, phát âm chuẩn và có thể hỗ trợ đưa đón bé an toàn."

─────────────────────────────────────────────────────────────────────────────
4. BENTO LỊCH TRÌNH & CHI TIẾT CÔNG VIỆC (Schedule & Work Details)
─────────────────────────────────────────────────────────────────────────────
Card trắng viền xám mềm, bố trí theo lối tạp chí tinh giản:
- Tên công việc: "Gia sư Tiếng Việt & Toán tư duy lớp 2 tại nhà"
- Thẻ thông tin bé:
  * "Bé Gia Hưng · 7 tuổi (Lớp 2 trường Vinschool Smart City)"
  * "Mục tiêu buổi học: Kèm bé làm bài tập tuần 12, luyện chữ và kèm đọc hiểu."
- Thông tin thời gian & địa điểm:
  * Hàng 1 (Lịch hẹn): "📅 Thứ Sáu, 19/09/2026 · 18:00 – 20:00 (Thời lượng: 2 tiếng)"
  * Hàng 2 (Địa chỉ): "📍 Căn 1406 Tòa S2.03, KĐT Vinhomes Smart City, Tây Mỗ, Nam Từ Liêm, Hà Nội"
- Ghi chú dặn dò của phụ huynh:
  * "Nhà có chuông cửa bên tay phải, ba mẹ có nhà kèm cặp. Nhờ cô giáo mang theo vở bài tập rèn chữ."

─────────────────────────────────────────────────────────────────────────────
5. BENTO MINH BẠCH TÀI CHÍNH & KÝ QUỸ MOMO ESCROW (Escrow Trust Breakdown)
─────────────────────────────────────────────────────────────────────────────
Card tài chính thể hiện sự công bằng và an toàn tuyệt đối của nền tảng:
- Tiêu đề: "THANH TOÁN & BẢO ĐẢM KÝ QUỸ"
- Dòng tính toán chi tiết:
  * Đơn giá: "150.000đ / giờ × 2.0 giờ"
  * Tổng tiền ca dạy: "300.000đ" (font-extrabold text-xl text-slate-900)
- Trạng thái dòng tiền:
  * Trạng thái: "🔒 Đang giữ tại ví MoMo Escrow" (Chưa thanh toán cho sinh viên)
  * Ghi chú quy tắc: "Khoản tiền này CHỈ được giải ngân cho bạn sinh viên sau khi ca làm hoàn thành và được bạn bấm 'Nghiệm thu hài lòng'. Bạn có thể yêu cầu hoàn tiền nếu có sự cố."

─────────────────────────────────────────────────────────────────────────────
6. CÁC TRẠNG THÁI LIÊN THÔNG KHI SINH VIÊN BẤM XÁC NHẬN (LIFECYCLE PREVIEW)
─────────────────────────────────────────────────────────────────────────────
(Màn hình được thiết kế sẵn sàng chuyển đổi khi sinh viên thao tác):
- Khi Sinh viên BẤM NHẬN: Khối đếm ngược biến mất, chuyển thành "Sinh viên đã cam kết ca làm" (Màu xanh ngọc). Mở khoá số điện thoại gọi trực tiếp, nút nhắn tin 1-1 và kích hoạt bản đồ Live Tracking GPS.
- Khi Ca làm ĐANG DIỄN RA: Xuất hiện bản đồ vệ tinh mini hiển thị GPS thời gian thực của sinh viên, vòng an toàn Geofence 200m quanh nhà, nút gọi SOS khẩn cấp.
- Khi Ca làm KẾ THÚC: Chuyển sang giao diện Đánh giá 5 sao, xem Nhật ký chăm sóc (Care Diary), xem biên lai giải ngân và nút "Đặt lại sinh viên này".

─────────────────────────────────────────────────────────────────────────────
7. BOTTOM FLOATING ACTION BAR (Thanh công cụ đáy cố định)
─────────────────────────────────────────────────────────────────────────────
Thanh dock cố định sát đáy (pb-safe bg-white/95 backdrop-blur-md border-t border-slate-200 p-4):
- Hàng trên: Thông báo trạng thái nhỏ "Đang chờ sinh viên xác nhận cam kết (còn 48 phút)"
- Hàng nút hành động:
  * Nút phụ (Trái - 40%): "Đổi sinh viên / Hủy" (Nền trắng viền đỏ nhạt, text đỏ font-semibold text-xs py-3 rounded-xl flex items-center justify-center gap-1). Khi bấm hiển thị Modal xác nhận hủy đơn không mất phí.
  * Nút chính (Phải - 60%): "Xem hồ sơ đầy đủ sinh viên" (Nền cam #F26522, text trắng font-bold text-sm py-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5).
```
