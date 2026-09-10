# PROMPT THIẾT KẾ GOOGLE STITCH: CHỌN LOẠI CÔNG VIỆC ĐĂNG MỚI (MOBILE APP UI)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS (hoặc React Native Mobile Layout) từ Google Stitch để nâng cấp toàn diện màn hình **"Đăng việc mới — Bạn cần gì?"** (`JobTypeSelectScreen.js` / `dang_viec_select.html`) trên ứng dụng di động EduCareLink Phụ huynh.  
> **Phong cách:** Premium Mobile Consumer App (chuẩn Grab / Airbnb / Gojek / Apple Human Interface Guidelines), tràn đầy năng lượng, trực quan, giải quyết triệt để sự trống trải và đơn điệu của giao diện cũ.  
> **Ngôn ngữ UI:** Tiếng Việt (100% chuẩn thuật ngữ EduCareLink).  
> **File mobile đích:** `mobile/src/screens/Parent/JobTypeSelectScreen.js`  
> **File web mobile đích:** `frontend/templates/frontend/dang_viec_select.html`

---

## 1. PHÂN TÍCH HIỆN TRẠNG TỪ ẢNH CHỤP MÀN HÌNH

### 1.1. Những bất cập ở giao diện hiện tại:
1. **Quá nhiều khoảng trống chết (Dead Whitespace):** 3 thẻ công việc (Gia sư, Trông trẻ, Đón trẻ) chỉ chiếm khoảng 35% chiều cao màn hình, 65% diện tích còn lại ở giữa và đáy màn hình hoàn toàn trống rỗng, tạo cảm giác app chưa hoàn thiện.
2. **Thẻ dịch vụ đơn điệu, thiếu phân cấp:** 3 thẻ có cấu trúc viền xám mờ giống hệt nhau, icon nhỏ lọt thỏm trong ô màu cam nhạt, thiếu màu sắc nhận diện riêng cho từng loại dịch vụ.
3. **Thiếu thông tin quyết định cho phụ huynh:** Không có mức giá tham khảo (VD: *"Từ 60.000đ/h"*), không có nhãn chứng thực (VD: *"Có bằng cấp"*, *"Định vị GPS"*), không có badge nổi bật (*"Phổ biến nhất"*).
4. **Thiếu lối tắt thông minh (AI & Re-post):** Phụ huynh bận rộn không có tùy chọn *"Nhờ AI đăng việc hộ bằng giọng nói/chat"* hay *"Đăng lại ca tuần trước"*, buộc phải bấm thủ công từng bước.
5. **Thiếu cam kết an toàn (Trust Badges):** Chưa có khối cam kết an toàn cho trẻ (CCCD đã duyệt, bảo hiểm di chuyển, hoàn tiền nếu vi phạm) để phụ huynh yên tâm ra quyết định.

### 1.2. Mục tiêu nâng cấp trong thiết kế Stitch mới:
- **Tỷ lệ vàng thị giác cho màn hình di động (390×844px hoặc 412×915px):** Bố cục chặt chẽ, sinh động từ trên xuống dưới, không còn khoảng trống thừa.
- **3 Thẻ dịch vụ cao cấp (Hero Service Cards):**
  - **Gia sư:** Tông màu Cam ấm `#F26522`, badge `🔥 Phổ biến nhất`, giá tham khảo `Từ 70.000đ/h`.
  - **Trông trẻ:** Tông màu Xanh ngọc `#0D9488`, badge `❤️ Chăm sóc tận tâm`, giá tham khảo `Từ 60.000đ/h`.
  - **Đón trẻ:** Tông màu Xanh biển `#2563EB`, badge `📍 Live GPS Tracking`, giá tham khảo `Từ 50.000đ/chuyến`.
- **Card lối tắt AI Trợ lý thông minh:** *"🤖 Bận rộn? Hãy để AI soạn việc cho bạn trong 5 giây"* (Nhập văn bản tự nhiên hoặc giọng nói).
- **Khối Cam kết An toàn 3 điểm (Trust & Safety Strip):** 100% CarePartner xác thực CCCD & Sinh viên, Bảo hiểm ca làm việc, Hoàn tiền 100% qua Ví credit.
- **Đồng bộ Bottom Navigation Bar 5 tabs:** Trang chủ, Công việc, AI Trợ lý (nút tròn nổi ở giữa), Theo dõi, Tài khoản.

---

## 2. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ đoạn văn bản bên dưới và dán vào Google Stitch (`labs.google.com/stitch`):

```text
Design a world-class, premium Mobile App screen for "Select Job Type to Post" (Đăng việc mới — Bạn cần gì?) for the EduCareLink family caregiver platform (React Native / Mobile Web context, 390x844px viewport, iOS / Android modern ergonomics).

CONTEXT & USER PERSONA:
The user is a busy Vietnamese parent (mom/dad) who needs quick, reliable, and trustworthy care for their children. They are deciding between 3 core services (Tutoring, Childcare, School Pickup) or using an AI assistant to auto-fill the job. The screen must radiate safety, high trust, warmth, and effortless speed.

BRAND COLOR PALETTE:
- Primary Brand Orange: #F26522 (Warm, energetic, vibrant)
- Tutoring Theme: #F26522 (Orange glow, #FFF4ED background, #FED7AA border)
- Childcare Theme: #0D9488 / #10B981 (Emerald/Teal trust, #ECFDF5 background, #A7F3D0 border)
- School Pickup Theme: #2563EB (Navy/Tech Blue, #EFF6FF background, #BFDBFE border)
- Background: #F8FAFC (Clean soft slate)
- Typography: Plus Jakarta Sans / Manrope (Clean, friendly, modern)

MOBILE SCREEN STRUCTURE (Top to Bottom):

1. TOP APP BAR:
   - Left: Circular soft back button with back arrow icon (w-10 h-10 rounded-full bg-white shadow-xs).
   - Center: Screen title "Đăng việc mới" (font-bold text-base text-slate-900).
   - Right: Help / Support circle icon button with tooltip "Quy trình ghép cặp Flow 1".

2. HEADER & CONTEXTUAL GREETING:
   - Greeting headline: "Hôm nay gia đình cần hỗ trợ gì?" (font-extrabold text-2xl text-slate-900 leading-tight).
   - Subtitle: "Chọn loại dịch vụ để hệ thống tự động đề xuất CarePartner phù hợp nhất gần bạn."
   - Context Pill: Small inline pill with pulsing amber dot "⚡ Khung giờ cao điểm: 120+ CarePartner đang sẵn sàng nhận việc".

3. AI EXPRESS SHORTCUT (Smart Action Card):
   - A captivating gradient card (bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400 text-white rounded-2xl p-4 shadow-sm relative overflow-hidden):
   - Floating sparkle/bot icon on the left.
   - Text: "🤖 Đăng việc siêu tốc với AI" -> "Nói hoặc gõ yêu cầu tự nhiên, AI tự động điền form trong 5 giây."
   - Action: "Thử ngay" pill button with arrow icon.

4. 3 CORE SERVICE SELECTION CARDS (The Visual Centerpiece):
   
   * CARD 1: GIA SƯ (Tutoring)
     - Border & Background: White card with subtle orange accent bar on the left, soft hover/touch elevation, rounded-2xl p-4 mb-3 border border-orange-100 shadow-xs.
     - Top Badge: "🔥 Được đặt nhiều nhất" (bg-orange-50 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full).
     - Left Icon: Dual-tone orange rounded square (w-13 h-13) with open book / graduation cap 3D icon.
     - Content:
       * Title: "Gia sư & Kèm học" (font-bold text-base text-slate-900).
       * Desc: "Dạy kèm các môn Toán, Văn, Anh hoặc năng khiếu (Vẽ, Đàn, Kỹ năng sống, MC nhí)..."
       * Price tag: "Từ 70.000đ / giờ" (font-extrabold text-xs text-primary).
     - Tags: Inline mini pills: "✓ Sinh viên giỏi" · "✓ Có kiểm tra bằng cấp".
     - Right: Chevron forward icon.

   * CARD 2: TRÔNG TRẺ (Childcare)
     - Border & Background: White card with subtle emerald accent, rounded-2xl p-4 mb-3 border border-emerald-100 shadow-xs.
     - Top Badge: "❤️ Chăm sóc tận tâm" (bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full).
     - Left Icon: Dual-tone emerald rounded square with smiling happy child / heart icon.
     - Content:
       * Title: "Trông trẻ tại nhà" (font-bold text-base text-slate-900).
       * Desc: "Chăm sóc bé: cho ăn uống, chơi cùng, rèn luyện thói quen tự lập và hướng dẫn bài tập."
       * Price tag: "Từ 60.000đ / giờ" (font-extrabold text-xs text-emerald-600).
     - Tags: Inline mini pills: "✓ Xác thực CCCD" · "✓ Có kinh nghiệm mầm non".
     - Right: Chevron forward icon.

   * CARD 3: ĐÓN TRẺ (School Pickup & Drop-off)
     - Border & Background: White card with subtle tech blue accent, rounded-2xl p-4 mb-3 border border-blue-100 shadow-xs.
     - Top Badge: "📍 Live GPS Tracking" (bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full).
     - Left Icon: Dual-tone blue rounded square with electric car / navigation pin icon.
     - Content:
       * Title: "Đón trẻ tan học" (font-bold text-base text-slate-900).
       * Desc: "Đón bé an toàn từ trường về nhà hoặc tới lớp học thêm với hành trình giám sát thời gian thực."
       * Price tag: "Từ 50.000đ / chuyến" (font-extrabold text-xs text-blue-600).
     - Tags: Inline mini pills: "✓ Báo cáo check-in" · "✓ Bảo hiểm di chuyển".
     - Right: Chevron forward icon.

5. TRUST & SAFETY BANNER (Footer Assurance Strip):
   - Clean slate-50 container with 3 micro-trust items:
     1. 🛡️ "100% Hồ sơ được đối soát CCCD & Thẻ SV"
     2. 💳 "Ký quỹ MoMo / VietQR an toàn, hoàn tiền 100%"
     3. 📍 "Giám sát định vị GPS & Nút SOS khẩn cấp"

6. BOTTOM NAVIGATION BAR (5 Standard Tabs):
   - Tab 1: "Trang chủ" (Home icon)
   - Tab 2: "Công việc" (List icon)
   - Tab 3 (CENTER FLOATING): Orange circular elevated button with white AI chip/brain icon, subtle pulse ring ("AI Trợ lý")
   - Tab 4: "Theo dõi" (Location pin icon)
   - Tab 5: "Tài khoản" (Person profile icon)
   - Active tab indicator: none or soft highlight on current flow.

ERGONOMICS & MICRO-INTERACTIONS:
- Tapping any card produces a responsive scale feedback (active:scale-[0.98]).
- Smooth border transitions on active state.
- Card padding and typography are optimized for single-thumb ergonomics on a 6.5-inch smartphone.
- Bottom padding accommodates standard Android 3-button navigation and iOS Home indicator bar.
```

---

## 3. CÁC ĐẶC TẢ THÀNH PHẦN CHO ĐỘI NGŨ PHÁT TRIỂN (MOBILE / WEB)

Khi có bản thiết kế HTML/CSS từ Stitch, Coding Agent sẽ chuyển đổi vào React Native (`mobile/src/screens/Parent/JobTypeSelectScreen.js`) hoặc Web (`frontend/templates/frontend/dang_viec_select.html`) theo các nguyên tắc sau:

### 3.1. Đối với Mobile React Native (`JobTypeSelectScreen.js`):
- Sử dụng `TouchableOpacity` với `activeOpacity={0.8}` và `hitSlop` để cảm ứng mượt mà.
- Định tuyến navigation:
  - Bấm **Gia sư** ➔ `navigation.navigate('TutoringForm')`
  - Bấm **Trông trẻ** ➔ `navigation.navigate('ChildcareForm')`
  - Bấm **Đón trẻ** ➔ `navigation.navigate('PickupForm')`
  - Bấm **AI Express** ➔ `navigation.navigate('ParentChatbot')`
- Sử dụng bộ icon `@expo/vector-icons` (`Ionicons` hoặc `MaterialCommunityIcons`): `book-outline`, `happy-outline`, `car-outline`, `sparkles`.

### 3.2. Đối với Web Django Templates (`dang_viec_select.html`):
- Sử dụng đúng liên kết Django URL namespace:
  - Gia sư ➔ `{% url 'frontend:dang_viec_step1' %}?type=tutoring`
  - Trông trẻ ➔ `{% url 'frontend:dang_viec_step1' %}?type=childcare`
  - Đón trẻ ➔ `{% url 'frontend:dang_viec_step1' %}?type=pickup`
  - AI Chatbot ➔ `{% url 'frontend:chatbot' %}`
- Kế thừa các class Tailwind CSS và biến màu `brand`, `tutoring`, `childcare`, `pickup` có sẵn.
