# PROMPT THIẾT KẾ GOOGLE STITCH: FORM ĐĂNG VIỆC GIA SƯ & KÈM HỌC (MOBILE APP UI)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS (hoặc React Native Mobile Layout) từ Google Stitch để nâng cấp toàn diện màn hình form **"Gia sư & Kèm học"** (`TutoringForm.js`) trên ứng dụng di động EduCareLink Phụ huynh.  
> **Phong cách:** Modern Mobile Form (chuẩn Apple / Airbnb / Grab), phân cấp trực quan, trường nhập liệu thông minh (Smart Inputs & Quick Chips), tích hợp bản đồ thu nhỏ và thanh thanh toán / đăng bài cố định ở đáy màn hình.  
> **Ngôn ngữ UI:** Tiếng Việt 100%.  
> **File mobile đích:** `mobile/src/screens/Parent/TutoringForm.js`

---

## 1. PHÂN TÍCH HIỆN TRẠNG & ĐẶC TẢ KỸ THUẬT

### 1.1. Hiện trạng giao diện cũ:
- Form chỉ là danh sách các ô text input thẳng đuột trên nền xám, không có thanh Top App Bar, không có nút Back chuẩn.
- Phần chọn ngày hiển thị đơn điệu với nút viền đứt nét (`+ Chọn ngày`).
- Ô nhập môn học không có chip gợi ý, phụ huynh phải gõ từ đầu.
- Ô học phí không có thước đo giá thị trường gợi ý, phụ huynh không biết đặt bao nhiêu là hợp lý.
- Nút "Đăng việc" nằm chìm ở cuối trang, phải cuộn hết màn hình mới thấy.

### 1.2. Ràng buộc dữ liệu từ Backend (`matching` API):
- `job_type`: `'tutoring'` (bắt buộc)
- `subject`: Text tự do (Toán, Văn, Anh, MC nhí, Đàn, Vẽ... không giới hạn môn phổ thông).
- `specific_requirements`: Yêu cầu chi tiết về gia sư và học sinh.
- `dates`: Mảng các ngày làm việc `['YYYY-MM-DD']`.
- `time_from`: Giờ bắt đầu (VD: `'19:00'`).
- `time_to`: Giờ kết thúc (VD: `'21:00'`).
- `hourly_rate_vnd`: Học phí / giờ (số nguyên dương, VNĐ).
- `latitude`, `longitude`: Tọa độ vị trí dạy học.
- `location_note`: Ghi chú địa chỉ (số nhà, phòng, tầng chung cư...).

---

## 2. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ khối text bên dưới và dán vào Google Stitch (`labs.google.com/stitch`):

```text
Design an ultra-premium, modern Mobile Form screen for "Post Tutoring Job" (Đăng việc Gia sư & Kèm học) for the EduCareLink family caregiver app (React Native / Mobile Web context, 390x844px viewport, iOS/Android ergonomics).

CONTEXT & USER PERSONA:
Vietnamese parents are looking for university students (CarePartners) from top universities to tutor their children in academic subjects or extracurricular skills (Math, English, Piano, Drawing, MC). The form must feel effortless, supportive, transparent in pricing, and fast to fill.

COLOR PALETTE:
- Primary Brand Orange: #F26522 (Warm, energetic)
- Soft Accent: #FFF4ED (surface) & #FED7AA (border)
- Dark Slate Text: #0F172A (heading), #475569 (body), #94A3B8 (subtle)
- Surface Background: #F8FAFC (clean soft slate)
- Card Background: #FFFFFF with soft border #E2E8F0 and subtle shadow
- Success Green: #10B981 (fair price / verified badges)

MOBILE SCREEN STRUCTURE (Top to Bottom):

1. TOP APP BAR (Sticky Header):
   - Left: Circular back button (w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200).
   - Center: 
     * Title: "Gia sư & Kèm học" (font-bold text-base text-slate-900).
     * Subtitle: "Bước 1/2 · Thiết lập ca học".
   - Right: Info / Guide circular button with tooltip.

2. SERVICE INTRO BANNER (Hero Card):
   - Warm card with soft orange gradient (#FFF4ED) and thin border (#FED7AA).
   - Icon: Graduation cap & open book dual-tone badge.
   - Headline: "Tìm gia sư sinh viên giỏi & tận tâm"
   - Key benefits: "100% đối soát thẻ Sinh viên ĐH Top · Đặt cọc an toàn qua MoMo".

3. FORM SECTIONS (Scrollable Content):

   * SECTION 1: MÔN HỌC & KỸ NĂNG (Subject / Skill)
     - Section Label: "Môn học hoặc Kỹ năng bé cần học *"
     - Text Input: Modern rounded-xl input with search icon, placeholder "VD: Toán lớp 5, Tiếng Anh giao tiếp, Đàn Piano..."
     - Popular Quick-Select Chips (Horizontal Scroll):
       * 📐 Toán lớp 5
       * 🇬🇧 Tiếng Anh giao tiếp
       * ✍️ Luyện chữ đẹp
       * 🎹 Đàn Piano / Organ
       * 🎨 Vẽ & Sáng tạo
       * 🎤 MC nhí & Tự tin

   * SECTION 2: ĐẶC ĐIỂM BÉ & YÊU CẦU CỤ THỂ
     - Label: "Yêu cầu gia sư & Tính cách của bé *"
     - Textarea: Rounded-xl input (3 lines) with placeholder "VD: Bé hơi nhút nhát, cần gia sư kiên nhẫn, ưu tiên nữ sinh viên ĐH Ngoại thương/Sư phạm..."
     - Quick Tag Suggestions: "Kiên nhẫn", "Gia sư nữ", "ĐH Sư Phạm", "Dạy ôn thi học kỳ".

   * SECTION 3: LỊCH HỌC & THỜI GIAN
     - Label: "Ngày học *"
     - Date Chips Container:
       * Active date chips: "[Thứ 3, 15/09] ✕", "[Thứ 5, 17/09] ✕" in soft orange pill with remove cross.
       * "+ Thêm ngày học" dashed button with calendar icon.
     - Time Slot Row (Two columns):
       * Left: "Bắt đầu từ" (19:00) with clock icon.
       * Right: "Kết thúc lúc" (21:00) with clock icon.
     - Quick Duration Chips: "1.5 giờ" · "2 giờ (Phổ biến)" · "2.5 giờ".

   * SECTION 4: HỌC PHÍ ĐỀ XUẤT (Smart Pricing Benchmark)
     - Label: "Học phí đề xuất / giờ (VNĐ) *"
     - Currency Input: Prominent bold input with "đ / giờ" suffix (e.g. "120.000").
     - Smart Benchmark Helper Box:
       * Green badge: "✓ Mức giá gợi ý: 80.000đ – 150.000đ/giờ"
       * Micro-copy: "Mức giá này giúp tìm được gia sư giỏi trong vòng 15 phút."

   * SECTION 5: ĐỊA ĐIỂM DẠY HỌC (Location & Map)
     - Label: "Địa điểm dạy học *"
     - Map Preview Card:
       * Mini interactive map card showing pin location with gradient pin icon.
       * Address line: "Số 28, Ngõ 12 Đặng Thai Mai, Tây Hồ, Hà Nội".
       * Action button: "Thay đổi trên bản đồ 📍".
     - Location Note Input: "Ghi chú thêm: Phòng 602, Chung cư Sunrise, bấm chuông 602".

4. STICKY BOTTOM ACTION DOCK (Fixed Bottom Bar):
   - Elevation shadow with white background.
   - Left: Price Summary:
     * "Dự kiến: ~240.000đ / buổi"
     * "Áp dụng bảo vệ hoàn tiền 100%"
   - Right: Primary CTA Button:
     * Full vibrant orange button (#F26522): "Đăng việc & Tìm ứng viên →"
     * Subtext inside button: "AI tự động ghép cặp 8 bạn tốt nhất".
```

---

## 3. CHECKLIST KIỂM TRA KHI NHẬN CODE TỪ STITCH

- [ ] Header có nút Back và hiển thị tiến trình "Bước 1/2".
- [ ] Môn học có đủ ô gõ tự do và danh sách các chip bấm chọn nhanh.
- [ ] Chọn ngày học hiển thị dạng chip ngày sinh động, có nút thêm ngày.
- [ ] Ô nhập học phí có kèm thước đo giá thị trường để hỗ trợ phụ huynh.
- [ ] Phần vị trí hiển thị bản đồ thu nhỏ trực quan và ô ghi chú số nhà/phòng.
- [ ] Thanh đáy (Sticky bottom) cố định, hiển thị tạm tính học phí và nút bấm nổi bật.
