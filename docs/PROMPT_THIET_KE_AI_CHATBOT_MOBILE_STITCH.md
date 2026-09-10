# PROMPT THIẾT KẾ GOOGLE STITCH: TRỢ LÝ AI TẠO VIỆC & TƯ VẤN (MOBILE CHATBOT UI)

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS (hoặc React Native Mobile Layout) từ Google Stitch để nâng cấp toàn diện màn hình **"AI Trợ lý Educarelink"** (`ChatbotScreen.js`) trên ứng dụng di động EduCareLink.  
> **Phong cách:** AI Conversational Assistant cao cấp (tương tự ChatGPT Mobile, Claude, Perplexity kết hợp Grab Assistant), giao diện sinh động, phản hồi mượt mà, hỗ trợ thẻ xem trước công việc tương tác (Interactive Task Preview Card).  
> **Ngôn ngữ UI:** Tiếng Việt 100%.  
> **File mobile đích:** `mobile/src/screens/ChatbotScreen.js`

---

## 1. PHÂN TÍCH HIỆN TRẠNG TỪ ẢNH CHỤP MÀN HÌNH (IMAGE 1)

### 1.1. Những điểm yếu ở giao diện hiện tại:
1. **Header đơn điệu:** Chỉ có 1 icon hoa tuyết nhỏ, tên "AI Trợ lý" và chấm xanh "Đang hoạt động" sơ sài, thiếu nút xóa lịch sử chat, thiếu huy hiệu "Gemini 2.5 Pro Powered".
2. **Tin nhắn chào mừng (Welcome Bubble) dạng tường chữ:** Toàn bộ hướng dẫn bị nhét vào một bong bóng chữ nhật xám dài dòng, không có nút bấm chọn nhanh (Quick Action Chips / Prompt Suggestions). Phụ huynh phải tự gõ từng chữ thay vì bấm gợi ý.
3. **Thanh soạn thảo (Composer) thô sơ:** Ô nhập màu xám tròn đơn điệu, thiếu nút ghi âm giọng nói (Voice Mic), thiếu nút đính kèm vị trí hoặc ảnh, nút gửi màu cam nhạt thiếu hiệu ứng nổi bật.
4. **Kết quả tạo việc chỉ là văn bản thô:** Khi AI tạo xong việc (`res.data.task`), hệ thống chỉ in text thô với emoji (`📋 Công việc đã tạo:...`), không có thẻ tóm tắt công việc dạng Card trực quan với nút "Xác nhận & Tìm CarePartner ngay".

---

## 2. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ khối text bên dưới và dán vào Google Stitch (`labs.google.com/stitch`):

```text
Design an ultra-premium, modern Mobile AI Chatbot Assistant screen ("AI Trợ lý EduCareLink - Tạo việc thông minh & Tư vấn 24/7") for the EduCareLink family caregiver app (React Native / Mobile Web context, 390x844px viewport, iOS/Android ergonomics).

CONTEXT & USER PERSONA:
Vietnamese parents are busy and want to create caregiving tasks (tutoring, childcare, school pickup) simply by chatting or speaking in natural Vietnamese. The AI Assistant parses requirements, estimates prices, suggests schedules, and creates structured task cards right inside the chat stream.

COLOR PALETTE:
- Primary Brand Orange: #F26522
- Primary Soft Glow: #FFF4ED (surface) & #FED7AA (border)
- AI Accent Violet/Purple: #8B5CF6 (representing smart AI intelligence)
- Assistant Bubble Background: #FFFFFF (crisp white card with subtle border #E2E8F0 and soft shadow)
- User Bubble Background: Linear gradient from #F26522 to #EA580C (text white)
- Screen Background: #F8FAFC (clean modern slate)
- Success Green: #10B981 (status indicator)

MOBILE SCREEN STRUCTURE (Top to Bottom):

1. TOP APP BAR (Sticky Header):
   - Left: Circular back button (w-10 h-10 rounded-full bg-white shadow-xs border border-slate-200).
   - Center: 
     * Avatar: 42x42 gradient avatar (orange to violet) with 3D sparkles icon and live green pulse badge.
     * Title: "AI Trợ lý EduCareLink" (font-bold text-base text-slate-900).
     * Subtitle: Green status dot + "Sẵn sàng hỗ trợ 24/7 · Gemini AI".
   - Right: Two action icon buttons:
     * Refresh / Clear Chat icon (dọn dẹp đoạn chat).
     * Sparkle / Guide icon (hướng dẫn mẹo ra lệnh cho AI).

2. CHAT STREAM (Scrollable Message List):

   * WELCOME BANNER (Hero AI Greeting Card):
     - Gradient banner with cute friendly EduCareLink AI bot illustration.
     - Headline: "Chào bạn! Tôi có thể hỗ trợ gì cho bé hôm nay?"
     - Short description: "Bạn chỉ cần gõ hoặc nói nhu cầu, tôi sẽ gợi ý mức giá chuẩn và tự động lập lịch tìm CarePartner phù hợp nhất."

   * QUICK PROMPT CHIPS (Horizontal Scrollable Pill Bar):
     Tappable suggestion chips that auto-send or fill prompt:
     - 🎓 "Tìm gia sư Toán lớp 5 (Quận 1)"
     - 🚗 "Đón bé 11h trưa nay tại trường"
     - 👶 "Cần người trông bé cuối tuần"
     - 💰 "Tra cứu bảng giá gia sư & bảo mẫu"

   * MESSAGE BUBBLE - USER:
     - Aligned right.
     - Deep vibrant orange bubble (#F26522), rounded-2xl rounded-br-xs px-4 py-3 text-white text-sm.
     - Timestamp: "10:24 AM" with double checkmarks.

   * MESSAGE BUBBLE - AI ASSISTANT:
     - Aligned left with mini bot avatar on the side.
     - Clean white card bubble with subtle border (#E2E8F0) and soft shadow.
     - Rich formatted markdown text: clear bold headings, bullet points, polite conversational tone.

   * INTERACTIVE TASK PREVIEW CARD (Embedded inside AI Message):
     When the AI successfully drafts or creates a job from conversation, it displays an interactive widget card inside the chat:
     - Card Header: Emerald badge "✓ ĐÃ TẠO BẢN NHÁP CÔNG VIỆC" + Service Category icon (Gia sư kèm học).
     - Title: "Gia sư kèm Toán lớp 5 & Ôn thi học kỳ"
     - Grid of key specs:
       * 💰 Học phí: "120.000đ / giờ" (Đúng khung giá đề xuất)
       * 📅 Lịch học: "Tối thứ 3 & thứ 5 (19:00 - 21:00)"
       * 📍 Địa điểm: "Chung cư Mipec Riverside, Long Biên, Hà Nội"
       * 🎯 Yêu cầu: "Sinh viên Sư phạm/Bách Khoa, kiên nhẫn"
     - Interactive Buttons:
       * Primary Button: "Xem ngay 6 ứng viên phù hợp →" (Full width orange button #F26522)
       * Secondary Button: "Chỉnh sửa thêm" (Outlined button)

   * AI TYPING INDICATOR:
     - Animated 3 jumping glowing dots (orange/violet) inside a compact rounded pill bubble.
     - Micro-text: "AI đang phân tích lịch và đối soát CarePartner..."

3. SMART COMPOSER (Bottom Input Bar):
   - Floating ergonomic bottom bar above navigation tabs.
   - Left: Quick Action '+' button (choose preset service: Gia sư / Trông trẻ / Đón trẻ).
   - Center: Expandable text input field with placeholder "Nhắn tin hoặc nói yêu cầu của bạn...".
   - Right: 
     * Voice Dictation Mic button (pulsing mic icon with tooltip "Giữ để nói").
     * Circular Send button (Vibrant orange with paper plane / send icon, disabled state when input is empty).

4. BOTTOM NAVIGATION BAR:
   - Full 5-tab bar matching the rest of the EduCareLink app:
     * Trang chủ, Công việc, AI Trợ lý (nổi bật active ở giữa với viền cam glow), Theo dõi, Tài khoản.
```

---

## 3. CHECKLIST KIỂM TRA ĐẶC TẢ KỸ THUẬT KHI NHẬN CODE TỪ STITCH

Khi Google Stitch xuất code HTML/CSS, hãy kiểm tra các điểm sau trước khi chuyển sang React Native:
- [ ] Header hiển thị đầy đủ avatar AI bot, tên và trạng thái "Đang hoạt động".
- [ ] Các chip gợi ý câu lệnh nhanh (Quick prompt chips) hiển thị đẹp mắt, cuộn ngang mượt mà.
- [ ] Thẻ xem trước công việc (Interactive Task Preview Card) có đầy đủ các thông tin quan trọng: Tiêu đề, Học phí, Lịch làm việc, Địa điểm và nút "Xem ứng viên".
- [ ] Thanh input (Composer) có đủ nút Micro nói, nút Gửi và ô nhập text linh hoạt.
- [ ] Tích hợp liền mạch với Bottom Navigation Bar 5 tabs chuẩn.
