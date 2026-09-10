# PROMPT THIẾT KẾ GOOGLE STITCH: FORM ĐĂNG VIỆC TRÔNG TRẺ TẠI NHÀ (MOBILE APP UI)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS (hoặc React Native Mobile Layout) từ Google Stitch để nâng cấp toàn diện màn hình form **"Trông trẻ tại nhà"** (`ChildcareForm.js`) trên ứng dụng di động EduCareLink Phụ huynh.  
> **Phong cách:** Warm & Safe Caregiver Form (chuẩn Apple / Babysitter Apps quốc tế), tông màu Xanh ngọc / Xanh lá an tâm, phân nhóm trực quan, stepper đếm số lượng trẻ, chip chọn nhiệm vụ chăm sóc sinh động.  
> **Ngôn ngữ UI:** Tiếng Việt 100%.  
> **File mobile đích:** `mobile/src/screens/Parent/ChildcareForm.js`

---

## 1. PHÂN TÍCH HIỆN TRẠNG & ĐẶC TẢ KỸ THUẬT

### 1.1. Hiện trạng giao diện cũ:
- Danh sách ô chip nhóm tuổi và công việc bị xếp đơn điệu, các nút bấm trông giống nhau.
- Ô nhập số lượng trẻ chỉ là 1 ô text input thô sơ gõ bàn phím thay vì bộ đếm Stepper tăng giảm `[-] 1 [+]`.
- Phần ghi chú y tế / dị ứng là thông tin rất quan trọng nhưng lại nằm như 1 ô text bình thường, không làm nổi bật tính cảnh báo an toàn.
- Chưa có bản đồ thu nhỏ xem vị trí trực quan.

### 1.2. Ràng buộc dữ liệu từ Backend (`matching` API):
- `job_type`: `'childcare'` (bắt buộc).
- `child_age_group`: Chọn 1 trong 5 nhóm:
  * `0_to_12_months`: 0 - 12 tháng tuổi
  * `1_to_3_years`: 1 - 3 tuổi
  * `3_to_6_years`: 3 - 6 tuổi
  * `6_to_10_years`: 6 - 10 tuổi
  * `over_10_years`: Trên 10 tuổi
- `number_of_children`: Số lượng trẻ (số nguyên >= 1, mặc định 1).
- `care_duties`: Chọn nhiều trong 7 nhiệm vụ:
  * `general_care`: Chăm sóc chung
  * `feeding`: Cho ăn / ăn dặm
  * `bathing`: Tắm rửa & vệ sinh
  * `sleep_monitoring`: Trông giấc ngủ
  * `play_activities`: Vui chơi & hoạt động
  * `homework_help`: Hỗ trợ bài tập về nhà
  * `light_chores`: Việc nhẹ liên quan bé
- `medical_allergy_notes`: Ghi chú dị ứng / thuốc men / tiền sử y tế.
- `specific_requirements`: Yêu cầu chi tiết về CarePartner.
- `dates`: Danh sách ngày làm việc `['YYYY-MM-DD']`.
- `time_from`: Giờ bắt đầu (mặc định `'08:00'`).
- `time_to`: Giờ kết thúc (mặc định `'17:00'`).
- `hourly_rate_vnd`: Học phí / giờ (VNĐ).
- `latitude`, `longitude`: Vị trí nhà.
- `location_note`: Ghi chú địa chỉ.

---

## 2. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ khối text bên dưới và dán vào Google Stitch (`labs.google.com/stitch`):

```text
Design an ultra-premium, modern Mobile Form screen for "Post Childcare / Babysitting Job" (Đăng việc Trông trẻ tại nhà) for the EduCareLink family caregiver app (React Native / Mobile Web context, 390x844px viewport, iOS/Android ergonomics).

CONTEXT & USER PERSONA:
Vietnamese parents (often working mothers) need trustworthy, caring university students or experienced nannies to care for their toddlers and kids at home. The form must radiate warmth, absolute safety, and clarity regarding care duties and medical notes.

COLOR PALETTE:
- Primary Care Emerald: #0D9488 & #10B981 (Heart, safety, care)
- Soft Accent: #ECFDF5 (surface) & #A7F3D0 (border)
- Brand Orange Highlight: #F26522 (call to action button)
- Medical/Alert Tone: #FEF3C7 (amber bg) & #D97706 (amber border)
- Surface Background: #F8FAFC (clean soft slate)
- Typography: Plus Jakarta Sans / Inter

MOBILE SCREEN STRUCTURE (Top to Bottom):

1. TOP APP BAR (Sticky Header):
   - Left: Circular back button (w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200).
   - Center: 
     * Title: "Trông trẻ tại nhà" (font-bold text-base text-slate-900).
     * Subtitle: "Bước 1/2 · Chi tiết ca chăm sóc".
   - Right: Info / Trust circular button.

2. SERVICE INTRO BANNER (Hero Card):
   - Soft emerald card (bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4).
   - Icon: Dual-tone emerald badge with heart and baby cradle.
   - Headline: "Bảo mẫu & Sinh viên chăm sóc bé tận tâm"
   - Trust highlights: "100% đối soát CCCD · Có kinh nghiệm giữ trẻ & sơ cứu ban đầu".

3. FORM SECTIONS (Scrollable Content):

   * SECTION 1: ĐỘ TUỔI CỦA BÉ (Child Age Group - Single Choice)
     - Label: "Độ tuổi của trẻ *"
     - 5 Visual Selectable Cards/Chips (2-column or grid flow):
       * 🍼 "0 - 12 tháng tuổi" (Sơ sinh)
       * 🧸 "1 - 3 tuổi" (Tập đi / Nhà trẻ) [Active State: Emerald border, bg-emerald-50, text-emerald-800, checkmark icon]
       * 🎨 "3 - 6 tuổi" (Mẫu giáo)
       * 📚 "6 - 10 tuổi" (Tiểu học)
       * 🧒 "Trên 10 tuổi"

   * SECTION 2: SỐ LƯỢNG BÉ (Number of Children - Stepper Counter)
     - Label: "Số lượng trẻ cần chăm sóc *"
     - Elegant Stepper Card:
       * Left: Text "Bé cần trông" + subtext "Hệ thống tự gợi ý hỗ trợ thêm nếu từ 2 bé trở lên".
       * Right: Counter Widget:
         - Minus button '−' (rounded-full bg-slate-100 w-9 h-9 flex center).
         - Value display: "1 bé" (font-bold text-base text-slate-900 px-3).
         - Plus button '+' (rounded-full bg-emerald-600 text-white w-9 h-9 flex center).

   * SECTION 3: CÔNG VIỆC CẦN CHĂM SÓC (Care Duties - Multi Choice)
     - Label: "Việc cần hỗ trợ *" (chọn 1 hoặc nhiều)
     - 7 Interactive Duty Badges with icons:
       * 🌟 "Chăm sóc chung" [Selected]
       * 🥣 "Cho ăn / Ăn dặm" [Selected]
       * 🛁 "Tắm rửa & Vệ sinh"
       * 😴 "Trông giấc ngủ" [Selected]
       * 🧩 "Vui chơi & Vận động" [Selected]
       * 📖 "Hỗ trợ bài tập về nhà"
       * 🧹 "Việc nhẹ liên quan bé" (rửa bình sữa, dọn đồ chơi)

   * SECTION 4: LƯU Ý Y TẾ & DỊ ỨNG (Medical & Allergy Notice - Highlighted Card)
     - Header: Amber shield icon + "Lưu ý y tế / Dị ứng của bé (Quan trọng)"
     - Card container: Light amber background (#FFFBEB) with amber border (#FDE68A).
     - Textarea: "VD: Bé bị dị ứng sữa bò/hải sản, cần uống thuốc siro ho lúc 14:00..."

   * SECTION 5: YÊU CẦU CỤ THỂ VỚI BẢO MẪU
     - Label: "Yêu cầu chi tiết đối với người trông trẻ *"
     - Textarea: "VD: Cần người dịu dàng, kiên nhẫn, tuyệt đối không cho bé xem điện thoại/iPad nhiều..."
     - Quick chips: "Không dùng điện thoại khi trông", "Biết sơ cứu bé", "Có chứng chỉ bảo mẫu", "Hát ru/kể chuyện".

   * SECTION 6: LỊCH TRÔNG & THỜI GIAN
     - Label: "Ngày làm việc *"
     - Active date pills: "[Thứ 7, 19/09] ✕", "[Chủ nhật, 20/09] ✕" + "+ Thêm ngày trông" button.
     - Time from / to: "08:00" đến "17:00" (Ca ban ngày 9 tiếng).

   * SECTION 7: MỨC PHÍ ĐỀ XUẤT (Hourly Rate)
     - Label: "Mức phí đề xuất / giờ (VNĐ) *"
     - Currency input: "80.000 đ / giờ"
     - Helper badge: "✓ Mức phí hợp lý: 60.000đ – 100.000đ/giờ (tuỳ độ tuổi và số lượng bé)".

   * SECTION 8: ĐỊA ĐIỂM TRÔNG BÉ (Location)
     - Interactive Mini Map preview + Pin address + Note input: "Chung cư Florita, Tháp A, Tầng 12, Quận 7".

4. STICKY BOTTOM ACTION DOCK (Fixed Bottom Bar):
   - Left: Estimated Total:
     * "Dự kiến: ~720.000đ / ngày (9h)"
     * "🛡️ Giữ tiền ký quỹ an toàn"
   - Right: Primary CTA Button:
     * Full vibrant emerald/orange button: "Đăng việc & Tìm CarePartner →"
```

---

## 3. CHECKLIST KIỂM TRA KHI NHẬN CODE TỪ STITCH

- [ ] Hiển thị 5 nhóm tuổi trẻ dạng thẻ lựa chọn sinh động.
- [ ] Số lượng trẻ dùng bộ đếm Stepper `[-] 1 [+]` trực quan.
- [ ] 7 nhiệm vụ chăm sóc hiển thị dạng pill đa chọn kèm icon trực quan.
- [ ] Ô lưu ý y tế / dị ứng được đóng khung cảnh báo màu vàng amber an toàn.
- [ ] Có bản đồ thu nhỏ hiển thị vị trí trông trẻ.
- [ ] Thanh đáy cố định hiển thị tóm tắt chi phí ca làm và nút xác nhận.
