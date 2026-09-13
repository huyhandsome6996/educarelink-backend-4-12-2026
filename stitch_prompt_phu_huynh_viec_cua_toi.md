# 🎨 Prompt Google Stitch AI — Màn hình 2: Quản lý Công việc Phụ huynh ("Việc của tôi")
# Tái cấu trúc Toàn diện: Xoá sạch Luồng cũ — Chuẩn hóa 4 Tab Vòng đời Công việc

> **Trang mục tiêu**: Màn hình Quản lý Công việc của Phụ huynh (`MyTasksScreen.js` trên Mobile App & `/phu-huynh/viec-cua-toi/` trên Web)  
> **Dự án**: EduCareLink (educarelink-backend-4-12-2026) — Nền tảng kết nối Phụ huynh với Sinh viên Đại học & CarePartner  
> **Quy chuẩn Vòng đời (State Machine)**:
> 1. **Tab 1 — "Chờ xác nhận"**: Đơn mới đăng tìm ứng viên + Đơn **Đã chọn sinh viên và đang chờ sinh viên bấm nhận việc** (Đếm ngược 60 phút, xem lại hồ sơ sinh viên đã chọn, đổi người nếu cần).
> 2. **Tab 2 — "Sắp làm"**: Khi sinh viên **ĐÃ BẤM XÁC NHẬN NHẬN VIỆC** nhưng **CHƯA ĐẾN GIỜ LÀM**. Hiển thị thời gian đếm ngược tới giờ bắt đầu ca, kênh liên lạc gọi/chat dặn dò trước khi sinh viên đến.
> 3. **Tab 3 — "Đang làm"**: Khi ca làm **ĐANG TRONG KHUNG GIỜ THỰC HIỆN**. Kích hoạt radar Live GPS Tracking vị trí sinh viên, vòng bảo vệ an toàn Geofence, nút SOS khẩn cấp và nút "Xác nhận hoàn thành ca".
> 4. **Tab 4 — "Lịch sử"**: Khi ca làm **HOÀN TẤT HOẶC KẾT THÚC**. Tự động đẩy vào kho lưu trữ: Đánh giá 5 sao, xem Nhật ký chăm sóc (Care Diary), xem biên lai giải ngân MoMo Escrow 80/20 và nút tiện ích "Đặt lại sinh viên này".  
> **Cách sử dụng**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện.

---

```markdown
You are an elite Senior Product Designer and Mobile UI/UX Architect designing the central job management screen for EduCareLink (educarelink-backend-4-12-2026), a high-trust Vietnamese EdTech & Childcare platform.

This screen is the "Parent My Tasks Hub" (Màn hình "Việc của tôi" của Phụ huynh - `MyTasksScreen`).
It completely eradicates legacy unstructured task lists and introduces a strictly defined 4-Tab Lifecycle State Machine that mirrors the exact emotional and operational journey of a parent.

The output must be implemented as a modern mobile-first responsive web interface (viewport 390px - 430px) using semantic HTML5, Tailwind CSS, Google Fonts ('Plus Jakarta Sans' + 'Manrope'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — KIẾN TRÚC 4 TAB VÒNG ĐỜI CHUẨN (XOÁ HOÀN TOÀN LUỒNG CŨ)
═══════════════════════════════════════════════════════════════════════════════

Màn hình loại bỏ triệt để các trạng thái hỗn độn trước đây, phân chia thành 4 Tab phân định dứt khoát:

┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 1: "CHỜ XÁC NHẬN" (Đang tìm người hoặc Đang chờ SV xác nhận cam kết)     │
│ • Nhánh 1A: Đơn mới đăng đang tìm ứng viên (AI đang quét sinh viên 2km).    │
│ • Nhánh 1B (TRỌNG TÂM): Phụ huynh ĐÃ CHỌN sinh viên, đang chờ sinh viên     │
│   bấm "Xác nhận cam kết" trong vòng 60 phút.                                │
│   👉 Hiển thị Avatar sinh viên đã chọn, trường ĐH, điểm sao, đồng hồ đếm     │
│      ngược 60 phút, nút xem hồ sơ hoặc đổi người khác.                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 🟢 Sinh viên bấm "Xác nhận nhận ca"
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 2: "SẮP LÀM" (Đã có sinh viên cam kết nhưng chưa đến giờ làm)           │
│ • Khi sinh viên bấm xác nhận, ca làm TỰ ĐỘNG CHUYỂN VÀO TAB NÀY!             │
│ • Trạng thái: Sinh viên đã nhận ca, hẹn đúng giờ đến nhà làm việc.           │
│ • Tính năng: Đếm ngược đến giờ bắt đầu ca (VD: "Còn 3 tiếng nữa bắt đầu"),  │
│   xem thông tin số điện thoại, mở khung chat 1-1 để phụ huynh dặn dò trước. │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ ⏰ Đến giờ làm việc / Sinh viên check-in
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 3: "ĐANG LÀM" (Ca đang trong khung giờ thực hiện trực tiếp)             │
│ • Khi đến giờ làm hoặc sinh viên bắt đầu ca, ca làm TỰ ĐỘNG CHUYỂN VÀO ĐÂY! │
│ • Tính năng: Giám sát an toàn tối cao:                                      │
│   - Live GPS Tracking: Vị trí trực tiếp của sinh viên cập nhật từng phút.   │
│   - Vòng an toàn Geofence: Báo động nếu rời khỏi bán kính 200m quanh nhà.   │
│   - Nút khẩn cấp SOS kết nối Hotline 24/7.                                  │
│   - Nút chính: "Xác nhận hoàn thành ca" (chỉ bấm khi ca kết thúc).           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 🏁 Hoàn thành ca & nghiệm thu
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TAB 4: "LỊCH SỬ" (Ca đã hoàn tất thành công hoặc đã kết thúc)               │
│ • Ca làm kết thúc sẽ TỰ ĐỘNG ĐẨY VÀO KHO LƯU TRỮ TẠI ĐÂY!                   │
│ • Tính năng:                                                                │
│   - Đánh giá & Viết nhận xét 5 sao cho sinh viên.                           │
│   - Xem Nhật ký chăm sóc & Báo cáo bài học (Care Diary).                    │
│   - Minh bạch biên lai giải ngân MoMo Escrow (80% sinh viên / 20% sàn).     │
│   - Nút tiện ích 1-chạm: "Đặt lại sinh viên này cho tuần sau".              │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
SECTION B — HỆ THỐNG MÀU SẮC & PHONG CÁCH THIẾT KẾ
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Nền Slate siêu nhẹ, sạch sẽ, chuẩn Atelier)
- Card Surfaces: #FFFFFF bo góc mềm 20px, viền mảnh 1px #E2E8F0, bóng đổ tự nhiên
- Màu nhấn Signature: #F26522 (Cam EduCareLink ấm áp, năng động)
- Màu Phân định 4 Tab (Tab Identity Colors):
  * Tab 1 Chờ xác nhận: Amber (#F59E0B / bg-amber-50 / border-amber-200)
  * Tab 2 Sắp làm: Emerald (#0E9F6E / bg-emerald-50 / border-emerald-200)
  * Tab 3 Đang làm: Active Sky Blue (#0284C7 / bg-sky-50 / border-sky-200) kèm hiệu ứng Ping Pulse
  * Tab 4 Lịch sử: Muted Slate (#64748B / bg-slate-100)
- Font Typography:
  * Số tiền & đếm ngược: 'Manrope', font-extrabold, số liệu dạng tabular
  * Tiêu đề & nội dung: 'Plus Jakarta Sans', font-semibold & medium
- QUY TẮC BẮT BUỘC:
  * Không dùng từ ngữ "ELO" (phải dùng "Điểm uy tín" hoặc "Điểm tín nhiệm").
  * Không dùng icon emoji ngẫu nhiên, chỉ dùng Google Material Symbols Outlined.
  * Không để sót rác luồng cũ (không có nút thừa, không có trạng thái không tên).

═══════════════════════════════════════════════════════════════════════════════
SECTION C — BỐ CỤC CHI TIẾT MÀN HÌNH TỪ TRÊN XUỐNG
═══════════════════════════════════════════════════════════════════════════════

1. STICKY APP HEADER & TẠO VIỆC NHANH
- Hàng tiêu đề:
  * Tiêu đề: "Việc của tôi" (font-extrabold text-2xl text-slate-900 tracking-tight).
  * Phụ đề: "Quản lý và giám sát toàn bộ ca học & coi trẻ của gia đình".
- Nút tác vụ phải:
  * Nút nhỏ "+ Đăng việc mới" (bg-orange-500 text-white font-bold text-xs px-3.5 py-2 rounded-full shadow-sm flex items-center gap-1.5).

─────────────────────────────────────────────────────────────────────────────
2. SEGMENTED CONTROLLER: 4 TAB CHUẨN VÒNG ĐỜI
─────────────────────────────────────────────────────────────────────────────
Thanh trượt 4 Tab nằm ngang (bg-slate-200/60 p-1 rounded-2xl flex items-center gap-1 mb-4):
- Tab 1: [hourglass_top] "Chờ duyệt (2)" -> (Đang Active: nền trắng, chữ cam #F26522, đổ bóng nhẹ, font-bold text-xs py-2.5 px-2 flex-1 text-center)
- Tab 2: [event_upcoming] "Sắp làm (1)" -> (Chữ slate-600 font-semibold text-xs py-2.5 px-2 flex-1 text-center)
- Tab 3: [farsight_digital] "Đang làm (1)" -> (Có chấm tròn xanh dương nhấp nháy, chữ sky-700 font-semibold text-xs py-2.5 px-2 flex-1 text-center)
- Tab 4: [history] "Lịch sử (8)" -> (Chữ slate-500 font-medium text-xs py-2.5 px-2 flex-1 text-center)

─────────────────────────────────────────────────────────────────────────────
3. NỘI DUNG CHI TIẾT CÁC THẺ THEO TỪNG TAB
─────────────────────────────────────────────────────────────────────────────

■ TAB 1: NỘI DUNG "CHỜ XÁC NHẬN" (PENDING CONFIRMATION)
Hiển thị 2 mẫu Card chuẩn mực:

● THẺ 1A (TRỌNG TÂM): ĐÃ CHỌN ĐƯỢC SINH VIÊN — ĐANG CHỜ XÁC NHẬN CAM KẾT
- Viền trên nhấn màu Amber: border-t-4 border-amber-400 bg-white rounded-2xl p-4 shadow-sm border-x border-b border-slate-100.
- Thanh trạng thái đầu thẻ:
  * Huy hiệu: "⏳ Chờ sinh viên xác nhận" (bg-amber-50 text-amber-800 font-bold text-xs px-2.5 py-1 rounded-full border border-amber-200 flex items-center gap-1)
  * Số tiền: "300.000đ" (font-extrabold text-base text-slate-900)
- Dải băng đếm ngược khẩn cấp (Urgent Countdown Ribbon):
  * Nền vàng hổ phách nhạt (bg-amber-50/90 rounded-xl p-2.5 my-2.5 border border-amber-200/60 flex items-center justify-between):
    + Bên trái: Icon đồng hồ cát + "Thời hạn xác nhận còn: 48 phút 15 giây" (font-bold text-amber-900 text-xs)
    + Bên phải: Huy hiệu "Ký quỹ MoMo an toàn 100%" (text-[11px] text-emerald-700 font-semibold)
- Spotlight Sinh viên được chọn:
  * Avatar tròn 48x48 có tích xanh CCCD chính chủ.
  * Tên: "Nguyễn Thị Thu Huyền" · "ĐH Sư phạm Hà Nội"
  * Nhãn: "⭐ 4.9 (38 ca) · Điểm tín nhiệm: 100 · Xác thực CCCD"
- Thông tin ca:
  * "Gia sư Tiếng Việt & Toán lớp 2" · 18:00 – 20:00 Thứ 6 (19/09)
  * Địa chỉ: Tòa S2.03 Vinhomes Smart City
- Hàng nút hành động:
  * Nút "Xem chi tiết đơn & hồ sơ" (bg-slate-900 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex-1 text-center)
  * Nút "Đổi người khác" (text-red-500 font-semibold text-xs py-2.5 px-3 rounded-xl border border-red-200 hover:bg-red-50)

● THẺ 1B: ĐƠN MỚI ĐĂNG — ĐANG QUÉT ỨNG VIÊN PHÙ HỢP
- Trạng thái: "🔍 Đang tìm sinh viên phù hợp"
- AI Matching gợi ý: "✨ Đã có 3 sinh viên gần nhà (bán kính < 2km) nộp hồ sơ"
- Nút bấm: "Xem danh sách 3 ứng viên để chọn ngay →" (bg-orange-500 text-white font-bold text-xs py-2.5 rounded-xl)

─────────────────────────────────────────────────────────────────────────────
■ TAB 2: NỘI DUNG "SẮP LÀM" (UPCOMING SESSIONS — ĐÃ CAM KẾT)
Ca làm đã được sinh viên bấm nhận, đang chuẩn bị tới giờ:
- Viền trên nhấn màu Xanh Ngọc: border-t-4 border-emerald-500 bg-white rounded-2xl p-4 shadow-sm.
- Trạng thái: "✅ Sinh viên đã cam kết nhận việc" (bg-emerald-50 text-emerald-800 font-bold text-xs px-2.5 py-1 rounded-full)
- Đếm ngược bắt đầu: "⏰ Bắt đầu lúc 18:00 hôm nay (Còn 3 tiếng 15 phút)" (font-bold text-sm text-slate-800)
- Sinh viên phụ trách:
  * Avatar + Tên: "Trần Minh Quân" · ĐH Ngoại Thương Hà Nội
  * Nút gọi điện: "📞 Gọi trực tiếp (0982.xxx.xxx)"
  * Nút nhắn tin: "💬 Chat 1-1 dặn dò bài tập"
- Nút hành động: "Xem lộ trình & chi tiết ca" (border border-slate-300 font-bold text-xs py-2.5 rounded-xl)

─────────────────────────────────────────────────────────────────────────────
■ TAB 3: NỘI DUNG "ĐANG LÀM" (ACTIVE SHIFT & LIVE SUPERVISION)
Ca làm đang diễn ra trong thời gian thực:
- Viền trên nhấn màu Xanh Bầu Trời Công Nghệ: border-t-4 border-sky-500 bg-white rounded-2xl p-4 shadow-sm.
- Trạng thái trực tiếp:
  * "🟢 ĐANG LÀM VIỆC (18:00 – 20:00)" kèm chấm xanh phát xung Radar Pulse.
- Khối giám sát Live GPS & An toàn Geofence:
  * Bản đồ thu nhỏ: Hiển thị chấm vị trí sinh viên đang ở căn hộ gia đình.
  * Tình trạng Geofence: "🛡️ Trong vùng an toàn (Bán kính 200m quanh nhà)".
  * Cập nhật GPS: "Cập nhật 45 giây trước · Tín hiệu vệ tinh tốt".
- Nút khẩn cấp SOS: Icon báo động đỏ "🆘 Hotline khẩn cấp 24/7 (0862427404)"
- Nút hành động chính:
  * Nút xanh nổi bật: "Nghiệm thu & Hoàn thành ca" (bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow flex items-center justify-center gap-1.5)

─────────────────────────────────────────────────────────────────────────────
■ TAB 4: NỘI DUNG "LỊCH SỬ" (COMPLETED & ARCHIVED)
Ca làm đã kết thúc, lưu trữ minh bạch:
- Trạng thái: "Hoàn tất ca làm · Đã giải ngân 300.000đ MoMo"
- Thông tin sinh viên & đánh giá:
  * "Nguyễn Thị Thu Huyền · Kèm bé Nam lớp 3"
  * Nút "⭐ Đánh giá 5 sao cho sinh viên" (nếu chưa đánh giá)
  * Nút "Xem Nhật ký buổi học (Care Diary) ↗" (xem báo cáo ảnh bé học bài)
- Tiện ích tái sử dụng:
  * Nút "🔁 Đặt lại sinh viên này cho tuần sau" (bg-orange-50 text-orange-600 border border-orange-200 font-bold text-xs py-2.5 rounded-xl)
```
