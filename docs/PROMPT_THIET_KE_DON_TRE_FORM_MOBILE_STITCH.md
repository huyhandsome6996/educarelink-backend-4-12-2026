# PROMPT THIẾT KẾ GOOGLE STITCH: FORM ĐĂNG VIỆC ĐÓN TRẺ TAN HỌC (MOBILE APP UI)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS (hoặc React Native Mobile Layout) từ Google Stitch để nâng cấp toàn diện màn hình form **"Đón trẻ tan học"** (`PickupForm.js`) trên ứng dụng di động EduCareLink Phụ huynh.  
> **Phong cách:** Modern Mobility & Route Form (chuẩn Uber / Grab / DiDi / Google Maps), tông màu Xanh dương công nghệ `#2563EB`, hiển thị sơ đồ lộ trình 2 điểm Điểm đón (A) → Điểm đến (B) trực quan, lựa chọn phương tiện di chuyển và cam kết an toàn giao thông.  
> **Ngôn ngữ UI:** Tiếng Việt 100%.  
> **File mobile đích:** `mobile/src/screens/Parent/PickupForm.js`

---

## 1. PHÂN TÍCH HIỆN TRẠNG & ĐẶC TẢ KỸ THUẬT

### 1.1. Hiện trạng giao diện cũ:
- Điểm đón và Điểm đến bị chia tách thành các ô text rời rạc, không có đồ họa sơ đồ lộ trình di chuyển nối từ A đến B.
- Phần phương tiện đưa đón chỉ là vài chip xám nhạt đơn điệu, không có icon minh họa phương tiện (xe máy, đi bộ, ô tô).
- Chưa thể hiện được tính năng độc quyền cốt lõi của EduCareLink: **Giám sát Live GPS 24/7** và **Check-in ảnh chụp bé khi nhận/giao trẻ**.
- Form cuộn dài, thiếu phân đoạn thị giác rõ ràng.

### 1.2. Ràng buộc dữ liệu từ Backend (`matching` API):
- `job_type`: `'pickup'` (bắt buộc).
- `school_or_pickup_place_name`: Tên trường học hoặc địa điểm đón (VD: "Tiểu học Lê Quý Đôn").
- `child_age_group`: Độ tuổi của trẻ (1 trong 5 nhóm tuổi chuẩn).
- `number_of_children`: Số lượng trẻ (số nguyên >= 1).
- `pickup_dates`: Danh sách các ngày đón `['YYYY-MM-DD']`.
- `pickup_time_from`: Giờ bắt đầu đón (mặc định `'16:30'`).
- `pickup_time_to`: Giờ kết thúc / hạn chót (mặc định `'17:30'`).
- `pickup_location`: Tọa độ điểm đón `{ latitude, longitude }`.
- `pickup_location_note`: Ghi chú điểm đón (cổng chính, góc cây bàng, cổng số 2...).
- `destination_type`: `'parent_home'` (Về nhà) hoặc `'other_address'` (Địa chỉ khác như lớp học thêm, nhà người thân).
- `destination_location`: Tọa độ điểm đến (nếu chọn `other_address`).
- `destination_note`: Ghi chú điểm đến.
- `transport_method`: Chọn 1 trong 3 phương thức:
  * `walking`: Đi bộ (gần nhà)
  * `carepartner_vehicle`: CarePartner tự có xe máy (yêu cầu bằng lái & mũ bảo hiểm trẻ em)
  * `parent_arranged`: Phụ huynh sắp xếp phương tiện (xe hơi gia đình / book Grab)
- `transport_note`: Ghi chú thêm về phương tiện.
- `specific_requirements`: Yêu cầu an toàn cụ thể.
- `hourly_rate_vnd`: Giá đề xuất / chuyến hoặc giờ (VNĐ).

---

## 2. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ khối text bên dưới và dán vào Google Stitch (`labs.google.com/stitch`):

```text
Design an ultra-premium, modern Mobile Mobility Form screen for "Post School Pickup & Commute Job" (Đăng việc Đón trẻ tan học) for the EduCareLink family caregiver app (React Native / Mobile Web context, 390x844px viewport, iOS/Android ergonomics).

CONTEXT & USER PERSONA:
Vietnamese working parents cannot leave the office at 4:30 PM to pick up their children from school. They need a verified university student or caregiver with a safe vehicle/manner to pick up the kid at school gate, guide them safely home or to an evening tutoring center, with live GPS and photo check-in.

COLOR PALETTE:
- Primary Mobility Blue: #2563EB (Tech, reliable, GPS tracking)
- Soft Accent: #EFF6FF (surface) & #BFDBFE (border)
- Brand Orange Highlight: #F26522 (call to action button)
- Route Pickup Dot: #2563EB (Blue circle A)
- Route Destination Dot: #10B981 (Emerald pin B)
- Surface Background: #F8FAFC (clean soft slate)
- Card Background: #FFFFFF with soft border #E2E8F0

MOBILE SCREEN STRUCTURE (Top to Bottom):

1. TOP APP BAR (Sticky Header):
   - Left: Circular back button (w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200).
   - Center: 
     * Title: "Đón trẻ tan học" (font-bold text-base text-slate-900).
     * Subtitle: "Bước 1/2 · Lộ trình đưa đón an toàn".
   - Right: GPS Shield icon with "Live Track" badge.

2. SERVICE INTRO BANNER (Hero Mobility Card):
   - Tech blue card (bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4).
   - Icon: Dual-tone electric car with navigation pin badge.
   - Headline: "Đón bé an tâm với Giám sát Live GPS 24/7"
   - Trust highlights: "Báo cáo ảnh check-in tại cổng trường · Bảo hiểm tai nạn chuyến đi".

3. FORM SECTIONS (Scrollable Content):

   * SECTION 1: ĐIỂM ĐÓN & TÊN TRƯỜNG (School / Pickup Place)
     - Label: "Tên trường / Địa điểm đón bé *"
     - Input field with School icon: "VD: Tiểu học Thực Nghiệm, Chu Văn An..."
     - Quick chips: "Trường Tiểu học", "Trường Mầm non", "Trung tâm Tiếng Anh", "Lớp học bơi / võ".

   * SECTION 2: BÉ & ĐỘ TUỔI
     - Inline Row:
       * Left: Child Age Group pill selector: "3 - 6 tuổi (Mầm non)", "6 - 10 tuổi (Tiểu học)" [Selected], "Trên 10 tuổi".
       * Right: Counter "1 bé" with '-' and '+' buttons.

   * SECTION 3: LỘ TRÌNH ĐƯA ĐÓN A → B (Two-Point Route Card Widget)
     A visual ride-hailing style route card with connecting vertical dotted line:
     - Point A (Pickup - Blue Dot):
       * Header: "ĐIỂM ĐÓN (A)"
       * Map snippet / address line: "Cổng chính Trường Tiểu học Chu Văn An, Thụy Khuê, Tây Hồ".
       * Note input: "Ghi chú đón: Đón bé tại phòng bảo vệ, lớp 3A".
     - Dotted Connecting Line with Car icon in the middle.
     - Point B (Destination - Emerald Dot):
       * Header: "ĐIỂM ĐẾN (B)"
       * Type Selector:
         - [• Về nhà] (Default selected)
         - [• Địa chỉ khác] (Lớp học thêm, nhà người thân)
       * Address line: "Chung cư Golden Land, 275 Nguyễn Trãi, Thanh Xuân, Hà Nội".
       * Note input: "Bàn giao cho bà ngoại hoặc mở cửa vân tay vào nhà".

   * SECTION 4: THỜI GIAN ĐÓN
     - Date Selector: Active date pills "[Thứ 2, 14/09] ✕", "[Thứ 4, 16/09] ✕" + "+ Thêm ngày".
     - Pickup Time Window (Two Columns):
       * "Giờ tan học / đón từ": [16:30]
       * "Đến nơi trước": [17:30]

   * SECTION 5: PHƯƠNG TIỆN ĐƯA ĐÓN (Transport Method - Visual Selection)
     - Label: "Phương tiện di chuyển *"
     - 3 Selectable Transport Cards:
       * 🚶 "Đi bộ" (Dưới 800m, dắt tay qua đường)
       * 🛵 "CarePartner tự có xe máy" [Active Selected: Blue border, bg-blue-50]
         - Micro-badge: "Yêu cầu: Có bằng lái + Mũ bảo hiểm trẻ em chuẩn"
       * 🚗 "Phụ huynh sắp xếp xe" (Gia đình có xe hoặc book taxi)
     - Vehicle Note Input: "Ghi chú: Xe máy cốp rộng, có chở ghế an toàn cho bé".

   * SECTION 6: YÊU CẦU AN TOÀN ĐẶC BIỆT
     - Label: "Yêu cầu an toàn cụ thể *"
     - Textarea: "VD: Cần chụp ảnh gửi phụ huynh lúc nhận bé từ cô giáo, đội mũ bảo hiểm quai cài chắc chắn..."
     - Quick Safety Pills: "Chụp ảnh check-in cổng trường", "Dắt tay qua đường", "Đội mũ bảo hiểm riêng của bé", "Gọi báo khi về tới nhà".

   * SECTION 7: MỨC PHÍ ĐỀ XUẤT (Trip / Hourly Rate)
     - Label: "Mức phí đề xuất (VNĐ / chuyến hoặc giờ) *"
     - Input: "60.000 đ / chuyến"
     - Benchmark hint: "✓ Khung giá phổ biến: 50.000đ – 90.000đ/chuyến (tùy khoảng cách)".

4. STICKY BOTTOM ACTION DOCK (Fixed Bottom Bar):
   - Left: Trip Summary:
     * "Tạm tính: ~60.000đ / chuyến"
     * "📍 Tự động bật Live GPS khi bắt đầu"
   - Right: Primary CTA Button:
     * Full vibrant blue button (#2563EB): "Đăng việc & Tìm người đón bé →"
```

---

## 3. CHECKLIST KIỂM TRA KHI NHẬN CODE TỪ STITCH

- [ ] Hiển thị widget lộ trình 2 điểm (Điểm đón A → Điểm đến B) kết nối bằng đường nét đứt trực quan chuẩn app di chuyển.
- [ ] Lựa chọn phương tiện (Đi bộ, Xe máy CarePartner, Xe phụ huynh) dạng thẻ với icon và ghi chú mũ bảo hiểm/bằng lái.
- [ ] Phần chọn ngày và khung giờ đón (Từ giờ - Đến giờ) rõ ràng.
- [ ] Có các chip chọn nhanh yêu cầu an toàn (Chụp ảnh check-in cổng trường, dắt tay qua đường, gọi điện thoại).
- [ ] Thanh đáy cố định hiển thị huy hiệu Live GPS và nút Đăng việc nổi bật.
