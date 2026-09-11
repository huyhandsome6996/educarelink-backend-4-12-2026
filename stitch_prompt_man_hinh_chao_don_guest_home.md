# 🎨 Prompt Google Stitch AI — Màn hình Mới vào App: Khám phá & Chào đón (Guest Home & Interactive Hero Poster)

> **Màn hình mục tiêu**: Màn hình Khởi đầu / Giới thiệu khi mới mở App (`GuestHomeScreen.js` trên Mobile & Trang chủ khách trên Web)  
> **Nền tảng**: EduCareLink — Nền tảng kết nối Phụ huynh với CarePartner / Sinh viên đại học hàng đầu Việt Nam  
> **Hướng dẫn**: Copy toàn bộ nội dung trong khung code dưới đây và dán vào [Google Stitch AI](https://labs.google.com/stitch) để tạo giao diện HTML/Tailwind hoàn chỉnh.

---

```markdown
You are an elite mobile product designer and design technologist creating an ultra-premium, high-converting "First-Time App Open & Guest Experience" screen for "EduCareLink" (educarelink-backend-4-12-2026).
The design must be implemented as a responsive mobile interface (viewport 390px - 430px, iOS/Android mobile ergonomics) using clean semantic HTML, Tailwind CSS, Google Fonts ('Manrope' + 'Plus Jakarta Sans'), and Google Material Symbols Outlined icons.

═══════════════════════════════════════════════════════════════════════════════
SECTION A — PRODUCT PURPOSE & USER PSYCHOLOGY
═══════════════════════════════════════════════════════════════════════════════

1. What is this screen?
This is the "Welcome & Discovery Hub" (`GuestHomeScreen`), seen immediately after the Splash Screen when a user opens EduCareLink without being logged in.
It is the critical first impression for two audiences:
- Vietnamese Parents looking for verified, top-tier university students (Sư Phạm, Bách Khoa, Ngoại Thương, Y Hà Nội) to tutor, pick up, or care for their children.
- University Students exploring flexible, well-paid part-time care jobs protected by MoMo Escrow.

2. Core Purpose & Emotional Goals:
- "Instant Trust & Warmth": Combine wholesome, heartwarming imagery of Vietnamese families and children with state-of-the-art technological reassurance (CCCD identity verification, 100% MoMo Escrow guarantee, 2-way real-time GPS tracking).
- "Eye-Catching Motion Poster & Promo Carousel": A dynamic, continuously engaging promotional slider that highlights signature campaigns (e.g. "Tặng 100k ca học đầu tiên", "Biệt đội sinh viên Sư phạm đón trẻ an toàn", "Bảo hiểm an toàn ca làm 100%").
- "Frictionless Onboarding Pathway": Quick tap into service categories, instant preview of hourly rates, and a prominent bottom sticky dock allowing users to "Khám phá ngay" or "Đăng nhập / Đăng ký" in 1 tap.

═══════════════════════════════════════════════════════════════════════════════
SECTION B — COLOR SYSTEM & DESIGN TOKENS
═══════════════════════════════════════════════════════════════════════════════

- Canvas Background: #F8FAFC (Ultra-clean slate pearl)
- Primary Brand Orange: #F26522 (Warm energetic signature orange)
- Primary Brand Gradient: linear-gradient(135deg, #F26522 0%, #EA580C 50%, #C2410C 100%)
- Trust Emerald Green: #0E9F6E (Verified tags, Escrow badge, safety signals)
- Warm Amber Accent: #F59E0B (Promotion badges, star ratings, flash tags)
- Deep Navy Ink: #0F172A (Headings, primary typography, high-contrast text)
- Slate Gray: #475569 (Body text, slot information, secondary descriptions)
- Soft Border: #E2E8F0 (Subtle dividers, card outlines)
- Elevated Shadows:
  * card-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.03)
  * orange-glow: 0 10px 25px -4px rgba(242, 101, 34, 0.35)

Typography:
- Display / Numbers / Prices: 'Manrope', sans-serif (Weights: 600, 700, 800)
- Body text & Labels: 'Plus Jakarta Sans', sans-serif (Weights: 400, 500, 600, 700)
- BANNED: Inter, Comic Sans, generic low-contrast gray text.

═══════════════════════════════════════════════════════════════════════════════
SECTION C — SCREEN ARCHITECTURE & LAYOUT (TOP TO BOTTOM)
═══════════════════════════════════════════════════════════════════════════════

1. STICKY TOP BRAND BAR (Warm, Welcoming, Compact)
- Left: EduCareLink Logo icon (Orange heart-book emblem) + Typography "EduCareLink" (font-extrabold text-slate-900 tracking-tight text-lg) + Sub-tag "Care with Love" (text-[10px] text-orange-600 font-bold uppercase tracking-wider).
- Right: Hotline SOS button ("1900 6828") with headphone icon + Language pill ("🇻🇳 VN").

2. INTERACTIVE MOTION POSTER / HERO PROMO CAROUSEL (The Showstopper)
A horizontal swipeable poster carousel (width: 92vw, height: 195px, rounded-3xl) with smooth autoplay rotation (every 4s) and animated dot indicators:
- Slide 1 (Gia sư thông minh): 
  * Background: Cinematic photo of an enthusiastic young university tutor patiently teaching a cute Vietnamese primary school kid with colorful textbooks.
  * Gradient overlay: Dark gradient from bottom-left (rgba(15,23,42,0.85) to transparent) ensuring high text contrast.
  * Floating Badges: "⭐ Top 5% Sinh viên Sư Phạm / Ngoại Thương" (Glassmorphism amber pill) + "GIẢM 50K CA ĐẦU".
  * Headline: "Gia sư kèm cặp tận tâm tại nhà"
  * Subtext: "Ghép cặp AI chuẩn môn & tính cách chỉ trong 30 giây."
- Slide 2 (Đón trẻ an toàn):
  * Background: Friendly student CarePartner in clean uniform holding hands with a happy student with school backpack.
  * Floating Badges: "📍 GPS định vị 2 chiều trực tiếp" (Emerald pill with pulsing green dot).
  * Headline: "Đón con đúng giờ, trọn vẹn an tâm"
  * Subtext: "Báo cáo lộ trình từng phút, chụp ảnh điểm danh phụ huynh."
- Slide 3 (Bảo vệ tài chính Escrow):
  * Background: Modern illustration or smiling family at home using tablet.
  * Floating Badges: "🛡️ Ký quỹ MoMo Escrow 100%".
  * Headline: "Minh bạch tuyệt đối, an toàn tài chính"
  * Subtext: "Chỉ giải ngân khi phụ huynh hoàn toàn hài lòng với ca làm."
- Carousel Navigation: 3 active indicator bars (pill width expands on active slide) with auto-countdown sweep effect.

3. QUICK STATS BANNER (Social Proof Strip)
A sleek horizontal stat bar below the poster:
- "50.000+" Phụ huynh tin chọn
- "⭐ 4.9/5" Đánh giá hài lòng
- "100%" Đã xác thực danh tính CCCD

4. SERVICE ECOSYSTEM GRID (4 Trụ Cột Dịch Vụ Chủ Lực)
Section Title: "Dịch vụ đồng hành cùng con bạn" (Subtitle: "Lựa chọn dịch vụ theo nhu cầu gia đình")
2x2 Bento Cards with high-end micro-interactions:
- Card 1: 📚 Gia sư tại nhà
  * Tag: "Toán, Văn, Anh & Luyện chữ"
  * Price range: "Từ 120.000đ/giờ"
  * Background: Soft orange tint (#FFF7ED) with warm orange border.
- Card 2: 🚸 Đón trẻ an toàn
  * Tag: "Đón từ cổng trường về nhà"
  * Price range: "Từ 90.000đ/chuyến"
  * Background: Soft blue tint (#EFF6FF) with GPS route icon.
- Card 3: 🧸 Trông trẻ & Vui chơi
  * Tag: "Kèm ăn, trông ngủ, phát triển kỹ năng"
  * Price range: "Từ 100.000đ/giờ"
  * Background: Soft pink tint (#FDF2F8) with heart icon.
- Card 4: 🤖 AI Trợ lý Ghép Cặp 24/7
  * Tag: "Tìm người tức thì trong 30s"
  * Badge: "Miễn phí"
  * Background: Soft purple tint (#FAF5FF) with glowing chip icon.

5. THREE-TIER SAFETY & TRUST COMMITMENT (Tại sao chọn EduCareLink?)
Horizontal card carousel or 3 stacked feature rows with emerald trust badges:
- 1. Xác minh 3 lớp nghiêm ngặt: CCCD gắn chip, thẻ sinh viên đại học chính quy, xác minh hạnh kiểm.
- 2. Giám sát an toàn GPS 2 chiều: Phụ huynh xem trực tiếp vị trí CarePartner từ khi di chuyển đến lúc hoàn thành.
- 3. Bảo lãnh thanh toán MoMo Escrow: Tiền được giữ an toàn trên hệ sinh thái MoMo, không sợ mất cọc, giải ngân chuẩn chỉ sau ca làm.

6. PARENT TESTIMONIAL TICKER (Người thật - Việc thật)
A compact testimonial card with parent avatar, star rating, and authentic feedback:
- Avatar: Chị Thu Trang (Phụ huynh bé Hải Nam - Q. Cầu Giấy)
- Quote: "Bạn gia sư Bách Khoa kèm con tôi môn Toán rất kiên nhẫn. Thích nhất là tính năng theo dõi GPS và giải ngân MoMo an toàn 100%!"
- Verified badge: "Đã hoàn thành 18 ca học"

7. FIXED BOTTOM ACTION DOCK (Frictionless Onboarding)
Floating dock at bottom of viewport with white blur background and top border:
- Primary Full CTA Button:
  "Bắt đầu kết nối ngay →" (bg-gradient-to-r from-orange-500 to-orange-600 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2)
- Secondary Row:
  "Đã có tài khoản? " + Link text: "Đăng nhập tại đây" (font-bold text-orange-600 underline)
- Sub-text: "Cam kết bảo mật thông tin gia đình theo tiêu chuẩn an toàn số."

═══════════════════════════════════════════════════════════════════════════════
SECTION D — MOTION & INTERACTIVITY SPECIFICATIONS (JAVASCRIPT EMBEDDED)
═══════════════════════════════════════════════════════════════════════════════

1. Poster Auto-slider:
   - Switches slide every 4000ms with smooth fade + translateX transition.
   - Touching/dragging stops auto-play temporarily.
   - Progress bar at the bottom sweeps from 0% to 100% during each slide duration.
2. Pulsing Badges:
   - Subtle pulse animation on GPS Live Dot and Escrow Shield.
3. Category Card Tap Effect:
   - Subtle scale down (scale-98) and ripple on touch.
4. Login / Register Modal:
   - Clicking "Bắt đầu ngay" or "Đăng nhập" opens a clean modal sheet with options:
     * "Tôi là Phụ huynh tìm người"
     * "Tôi là Sinh viên / CarePartner tìm việc"

═══════════════════════════════════════════════════════════════════════════════
SECTION E — STRICT ANTI-PATTERNS (DO NOT INCLUDE)
═══════════════════════════════════════════════════════════════════════════════
- NO boring text-heavy landing pages without vivid real-life photography.
- NO complicated multi-step registration forms on the home screen.
- NO cold corporate gray palettes; must feel warm, safe, educational, and joyful.
- NO placeholder "Lorem ipsum" — use natural, persuasive Vietnamese copy.
```
