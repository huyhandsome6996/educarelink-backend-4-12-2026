# 🎨 Prompt Google Stitch AI — Màn hình: Chi tiết Công việc & Ứng tuyển Ca làm (CarePartner Task Detail & Apply)
# Chuyên sâu: Nâng cấp Toàn diện Trải nghiệm Sinh viên / CarePartner xem ca làm và ứng tuyển

> **Trang mục tiêu**: Màn hình Chi tiết Công việc dành cho Sinh viên / CarePartner (`TaskDetailScreen.js` trên Mobile App & `/viec-lam/<id>/` trên Web)  
> **Dự án**: EduCareLink — Nền tảng kết nối Phụ huynh với Sinh viên Đại học & CarePartner  
> **Ngôn ngữ thiết kế**: Google Stitch Design System — Bento Grid, Warm Professionalism, Zero Jargon, Tối ưu Mobile (390px - 430px)  
> **Cách sử dụng**: Copy toàn bộ nội dung dưới đây và dán vào Google Stitch AI để nhận bản thiết kế HTML / Tailwind CSS.

---

```markdown
You are an elite Senior Product Designer and Mobile UI/UX Architect designing the flagship Job Detail & Application Screen for CarePartners (vetted university students) on EduCareLink (educarelink-backend-4-12-2026).

Design a mobile-first responsive web view (viewport 390px - 430px, iOS Safari & Android Chrome feel) using semantic HTML5, modern Tailwind CSS, Google Fonts ('Plus Jakarta Sans' + 'Manrope'), and Google Material Symbols Outlined.

═══════════════════════════════════════════════════════════════════════════════
TÂM LÝ & MỤC TIÊU CỦA SINH VIÊN / CAREPARTNER KHI XEM CA LÀM
═══════════════════════════════════════════════════════════════════════════════

1. Bối cảnh:
Sinh viên đại học lướt thấy một ca dạy gia sư / đón bé / trông trẻ phù hợp với lịch học, bấm vào xem chi tiết để quyết định có ứng tuyển / nhận việc hay không.
Giao diện cũ quá thô sơ, thiếu trực quan về thu nhập thực nhận, không rõ khoảng cách di chuyển, thông tin phụ huynh mơ hồ, nút ứng tuyển đơn điệu.

2. Nhu cầu cốt lõi của Sinh viên:
- MINH BẠCH THU NHẬP (Cực kỳ quan trọng): Biết rõ thù lao tổng, tiền thực nhận về ví sinh viên sau khi trừ phí nền tảng (80% giải ngân tự động qua MoMo / Ngân hàng).
- KHOẢNG CÁCH & LỘ TRÌNH: Biết chính xác ca làm cách trường/ký túc xá bao nhiêu km, mất bao nhiêu phút đi xe máy.
- ĐỘ TIN CẬY CỦA PHỤ HUYNH: Huy hiệu Phụ huynh đã xác thực SĐT/Địa chỉ, số sao đánh giá từ các sinh viên làm trước.
- CHI TIẾT YÊU CẦU DỄ HIỂU: Khối lớp, môn học, độ tuổi của bé, thời gian ca làm rõ ràng từng phút, ghi chú đặc biệt của phụ huynh.
- HÀNH ĐỘNG 1 CHẠM: Nút "Ứng tuyển ca này" to bản, nổi bật, có xác nhận cam kết văn minh.

═══════════════════════════════════════════════════════════════════════════════
BẢNG MÀU THIẾT KẾ (COLOR TOKENS)
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Slate siêu nhạt, sạch, dịu mắt)
- Surface Card: #FFFFFF với viền mảnh 1px #E2E8F0 và đổ bóng đa tầng shadow-sm
- Signature Orange: #F26522 (Cam ấm nhận diện thương hiệu)
- Earnings Emerald: #10B981 (Xanh lá tài chính, số tiền thực nhận nổi bật)
- Trust Blue: #0284C7 (Xanh công nghệ, định vị bản đồ, xác thực)
- Ink Text: #0F172A (Tiêu đề, chữ chính tương phản cao)
- Sub Text: #64748B (Mô tả, nhãn phụ)
- CẤM: Không dùng phông Inter, không dùng màu đen tuyền (#000000), không dùng bóng neon tím.

═══════════════════════════════════════════════════════════════════════════════
CẤU TRÚC GIAO DIỆN (TỪ TRÊN XUỐNG DƯỚI)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP APP BAR:
- Nút Tròn Quay Lại: Nút tròn 40x40 nền trắng viền mảnh xám nhạt, icon mũi tên quay lại.
- Giữa: Mã việc #JOB-8824 + Danh mục (VD: Gia sư Tiếng Anh lớp 5).
- Phải: Nút chia sẻ cho bạn bè cùng trường & nút lưu ca yêu thích (Bookmark).

2. HERO EARNINGS & TITLE BENTO CARD:
- Badge loại công việc: Gia sư 1:1 / Đón trẻ / Trông trẻ (màu sắc riêng biệt kèm icon).
- Tiêu đề ca việc: Đậm nét 20px (VD: "Kèm Tiếng Anh & Luyện chữ đẹp bé gái lớp 3").
- Bento 2 cột thu nhập:
  * Cột trái (Nổi bật): "Thu nhập thực nhận: 160.000đ / buổi" (Chữ to 24px màu xanh ngọc #10B981 kèm badge "Giải ngân tự động trong 24h").
  * Cột phải: "Thời lượng: 2.0 giờ (80.000đ/giờ)".

3. BENTO THÔNG TIN LỊCH & ĐỊA ĐIỂM (Location & Schedule):
- Lịch làm việc: Lịch cố định Thứ 2 - Thứ 4 - Thứ 6 (18:30 - 20:30) kèm badge "Bắt đầu từ 15/09".
- Khoảng cách & Vị trí:
  * Huy hiệu khoảng cách: "Cách bạn 2.4 km (~7 phút xe máy)".
  * Địa chỉ hiển thị an toàn: "Đường Tố Hữu, P. Xuân Phú, TP. Huế (Gần Vincom)".
  * Bản đồ thu nhỏ (Mini Map Preview) hiển thị bán kính an toàn kèm nút "Mở chỉ đường Google Maps".

4. BENTO CHÂN DUNG PHỤ HUYNH & HỌC SINH (Family Profile):
- Phụ huynh: Chị Hồng Nhung Lê (Phụ huynh uy tín 5.0★ · 12 ca hoàn thành · Đã xác minh CCCD & SĐT).
- Học sinh: Bé An Nhi (8 tuổi, học lớp 3 trường Tiểu học Vĩnh Ninh).
- Tính cách & Ghi chú của mẹ: "Bé ngoan, hơi rụt rè lúc đầu, thích vẽ tranh. Cần gia sư kiên nhẫn, phát âm chuẩn".

5. BENTO KỸ NĂNG & YÊU CẦU ĐỐI VỚI SINH VIÊN:
- Các chip kỹ năng: "SV Sư phạm", "Phát âm chuẩn", "Kiên nhẫn", "Nữ gia sư".
- Yêu cầu trang phục & tác phong chuẩn mực của EduCareLink.

6. BẢO CHỨNG AN TOÀN TỪ EDUCARELINK (Trust & Security):
- Thẻ bảo đảm: "Tiền đã được ký quỹ qua MoMo Escrow 100% — Bảo vệ quyền lợi CarePartner không sợ bị quỵt tiền".
- Nút hỗ trợ SOS & Điều phối viên học thuật khi có vấn đề.

7. FIXED BOTTOM ACTION DOCK (Thanh hành động đáy ghim cố định):
- 2 Nút hành động:
  * Nút phụ (Trái, 1/3): Icon Chat / Nhắn tin trao đổi trước với phụ huynh.
  * Nút chính (Phải, 2/3): Nút cam to bản #F26522 "ỨNG TUYỂN CA NÀY NGAY" (Kèm hiệu ứng hover/active sinh động và icon gửi hồ sơ).
```
