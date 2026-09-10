# BÁO CÁO ĐÁNH GIÁ (AUDIT) & BỘ CÂU HỎI KHẢO SÁT CHUẨN TRANG LANDING PAGE EDUCARELINK (`/landing/`)

> **Mục đích tài liệu:**  
> Đánh giá toàn diện tính hợp lý của nội dung khảo sát, đăng ký tư vấn và dùng thử tại trang Landing Page (`https://educarelink-backend.onrender.com/landing/`), đối chiếu với bối cảnh và **mục tiêu cốt lõi của dự án EduCareLink**.  
> Cung cấp cho **Coding Agent** bản đặc tả hoàn chỉnh về bộ câu hỏi, lựa chọn trả lời, cấu trúc JSON dữ liệu và hướng dẫn kỹ thuật để cập nhật lại trang `/landing/` chính xác 100% theo định vị thương hiệu.
>
> **Tài liệu tham chiếu:** `frontend/templates/frontend/landing.html`, `core/models.py`, `core/serializers.py`, `core/admin_stats.py`.

---

## 1. TỔNG QUAN BỐI CẢNH & MỤC TIÊU CỐT LÕI CỦA DỰ ÁN EDUCARELINK

### 1.1. Sứ mệnh và Định vị Cốt lõi
**EduCareLink** là nền tảng công nghệ kết nối thông minh giữa:
- **Phụ huynh (Parent):** Các gia đình trẻ tại đô thị (Hà Nội, TP.HCM...) bận rộn công việc, gặp "khủng hoảng giờ tan tầm" (16h30 – 18h30) khi không thể kịp đón con, cần người kèm cặp bài vở buổi tối hoặc cần người trông nom trẻ an toàn khi có việc đột xuất.
- **Người đồng hành (CarePartner):** Nòng cốt là **sinh viên các trường đại học uy tín** (Sư phạm, Ngoại ngữ, Ngoại thương, Bách Khoa, Y Dược...), giáo viên mầm non, gia sư trẻ có phẩm chất tốt, cần công việc làm thêm linh hoạt, an toàn, có thù lao xứng đáng và tích lũy kỹ năng xã hội.

### 1.2. Ba Dịch Vụ Cốt Lõi (Khóa Chặt — Bất Di Bất Dịch)
Theo định hướng chiến lược và các commit gần nhất của dự án (ví dụ commit `0f4491a`: *khóa chặt 3 danh mục Gia sư/Đón trẻ/Trông trẻ*), EduCareLink tập trung tuyệt đối vào 3 trụ cột:
1. 📚 **Gia sư học tập tại nhà (Tutoring):** Dạy kèm Toán, Tiếng Anh, Tiếng Việt, rèn chữ, luyện thi tiểu học & THCS với phương pháp sư phạm hiện đại.
2. 🚗 **Đưa đón trẻ tan học (School Pickup):** Đón bé từ trường về nhà hoặc đưa sang các lớp học thêm năng khiếu, trang bị mũ bảo hiểm trẻ em, tuân thủ an toàn giao thông, báo cáo lộ trình.
3. 🧸 **Trông trẻ tại nhà (Childcare):** Chăm sóc bé mầm non và tiểu học tại nhà phụ huynh, tổ chức trò chơi tương tác phát triển tư duy, hỗ trợ ăn uống nhẹ, đảm bảo an toàn tuyệt đối.

> ⚠️ **NGUYÊN TẮC QUAN TRỌNG:**  
> **EduCareLink là nền tảng Giáo dục & Chăm sóc Trẻ em**, KHÔNG PHẢI là ứng dụng giúp việc nhà phổ thông (như bTaskee, JupViec). Mọi nội dung liên quan đến *"Dọn dẹp nhà cửa"*, *"Mua sắm hộ tạp hóa"* đều là tàn dư cũ cần phải được **LOẠI BỎ TRIỆT ĐỂ** khỏi trang Landing Page và bộ khảo sát. Việc để tàn dư này làm loãng thương hiệu, hạ thấp định vị tri thức của sinh viên CarePartner và gây hiểu sai nghiêm trọng cho phụ huynh!

### 1.3. Lợi Thế Công Nghệ & Khác Biệt Độc Quyền Của EduCareLink
1. **Thuật toán tự động ghép cặp Flow 1 (Matching Engine):** Không cần đăng tin chờ đợi — hệ thống tự động ghép phụ huynh với CarePartner phù hợp nhất dựa trên **Điểm tín nhiệm ELO**, **Khoảng cách GPS (Haversine)** và **Lịch rảnh tuần**.
2. **Hệ thống An toàn Đa lớp (Safety & Verification):**
   - 100% CarePartner được đối soát CCCD 2 mặt, ảnh chân dung và thẻ sinh viên/bằng cấp trước khi nhận việc.
   - **Live Tracking GPS:** Phụ huynh theo dõi vị trí trực tuyến của con trên bản đồ suốt ca đưa đón.
   - **Xác thực an toàn:** Kiểm tra ngẫu nhiên bằng mã PIN hoặc chụp ảnh nhận diện.
   - **Nút SOS khẩn cấp:** Kết nối tức thì với tổng đài cứu hộ và phụ huynh.
3. **Thanh toán Ký quỹ MoMo / VietQR Escrow:** 100% tiền công được giữ an toàn trên sàn trước khi ca làm bắt đầu; tự động giải ngân (80% cho CarePartner, 20% phí nền tảng) ngay khi phụ huynh xác nhận hoàn thành ca làm.

---

## 2. BÁO CÁO KIỂM THỬ & ĐÁNH GIÁ HIỆN TRẠNG TRANG LANDING PAGE (`/landing/`)

### 2.1. Đánh giá Phần Giới thiệu & Hero Section
- **Ưu điểm:** Thiết kế thoáng đãng, màu cam thương hiệu kết hợp xanh lá tạo cảm giác an tâm; các khối cam kết 4 trụ cột (xác minh danh tính, theo dõi thời gian thực, nhật ký chăm sóc, thanh toán minh bạch) bố trí rõ ràng.
- **Tồn tại nghiêm trọng:**
  - Đoạn văn bản chính (dòng 365) vẫn ghi: *"...cho việc gia sư, chăm sóc trẻ, **dọn dẹp và mua sắm hộ**..."*.
  - Bỏ sót dịch vụ chủ lực: **Đưa đón bé tan học** — một trong những "nỗi đau" lớn nhất của phụ huynh công sở hiện nay.

---

### 2.2. Đánh giá Phần Khảo Sát / Góp Ý (`#khao-sat`)
Hiện tại, form khảo sát chia làm 2 tab: *Người đồng hành (CarePartner)* và *Phụ huynh*. Dưới đây là phân tích chi tiết các điểm bất cập:

#### A. Đối với Tab Phụ Huynh:
1. **Câu hỏi về dịch vụ quan tâm:**
   - *Hiện tại:* `Gia sư tại nhà`, `Chăm sóc trẻ em`, `Dọn dẹp nhà cửa`, `Mua sắm hộ`, `Định vị & an toàn`, `Nhật ký chăm sóc`.
   - *Bất cập:* Có `Dọn dẹp` và `Mua sắm hộ` (sai định vị), nhưng lại **KHÔNG CÓ dịch vụ Đưa đón bé tan trường**!
2. **Thiếu thông tin về độ tuổi của con:** Không khảo sát con học mầm non, tiểu học hay cấp 2, dẫn đến việc không nắm bắt được phân khúc nhu cầu.
3. **Thiếu khảo sát về khung giờ cần hỗ trợ nhất:** Phụ huynh cần người lúc nào? (Tan tầm 16h30-18h30? Buổi tối? Cuối tuần?).
4. **Thiếu khảo sát về mức giá sẵn sàng chi trả:** Không hỏi phụ huynh sẵn sàng trả bao nhiêu cho 1 buổi học gia sư hay 1 lượt đưa đón con an toàn.
5. **Yếu tố lựa chọn CarePartner:** Đang có `Giá rẻ`, `Đáng tin cậy`, `Kinh nghiệm`, `Gần nhà`, `Có đánh giá tốt`, `Có xác minh danh tính`. Cần bổ sung thêm: *Định vị Live GPS trên đường đón bé* và *Trình độ học vấn/Trường ĐH của gia sư*.

#### B. Đối với Tab Người Đồng Hành (CarePartner / Sinh viên):
1. **Câu hỏi về dịch vụ muốn nhận:**
   - *Hiện tại:* `Gia sư`, `Chăm sóc trẻ`, `Dọn dẹp`, `Mua sắm`.
   - *Bất cập:* Không có dịch vụ `Đón trẻ tan học` (vốn là công việc rất phù hợp cho sinh viên có xe máy vào khung giờ chiều).
2. **Khảo sát mức thu nhập mong muốn mỗi giờ:**
   - *Hiện tại:* `Dưới 30.000đ`, `30.000 – 50.000đ`, `50.000 – 80.000đ`, `Trên 80.000đ`.
   - *Bất cập cực kỳ nặng nề:* Mức giá này đã quá lạc hậu. Năm 2026, tiền công gia sư tại các thành phố lớn dao động từ **100.000đ – 200.000đ/giờ**, đón trẻ từ **60.000đ – 100.000đ/lượt**, trông trẻ từ **70.000đ – 120.000đ/giờ**. Tùy chọn "Dưới 30.000đ" gây cảm giác thiếu tôn trọng chất xám của sinh viên đại học.
3. **Thiếu khảo sát về phương tiện di chuyển:** Có xe máy riêng và bằng lái xe A1 hay không (điều kiện tiên quyết để nhận các cuốc đón trẻ).
4. **Thiếu khảo sát về lịch rảnh:** Sinh viên rảnh vào khung giờ nào trong tuần (tối trong tuần, cuối tuần hay ca chiều).

---

### 2.3. Đánh giá Phần Đăng Ký Tư Vấn / Dùng Thử (`#dang-ky`)
- **Ưu điểm:** Có 2 tab rõ ràng (*Tư vấn miễn phí* và *Dùng thử miễn phí*), có khung giờ gọi lại (Sáng/Chiều/Tối), có ô nhập ghi chú.
- **Bất cập:**
  - Thiếu lựa chọn **Dịch vụ quan tâm đăng ký trải nghiệm** (Gia sư, Đón trẻ, Trông trẻ).
  - Thiếu thông tin **Khu vực địa lý (Tỉnh/Thành phố & Quận/Huyện)** khiến đội ngũ tư vấn không xác định được phụ huynh/sinh viên có nằm trong địa bàn phủ sóng của EduCareLink hay không.

---

## 3. BỘ CÂU HỎI KHẢO SÁT & ĐĂNG KÝ MỚI CHUẨN ĐỊNH VỊ EDUCARELINK

Dưới đây là bộ câu hỏi đã được thiết kế lại tối ưu, bám sát 100% mục tiêu cốt lõi của dự án để Coding Agent thay thế vào giao diện:

---

### 3.1. BẢNG CÂU HỎI KHẢO SÁT DÀNH CHO PHỤ HUYNH (PARENT SURVEY)

```html
<!-- TAB PANEL: PHỤ HUYNH -->
```

#### Câu 1: Dịch vụ bạn đang có nhu cầu tìm người hỗ trợ cho con? *(Chọn nhiều)*
- `[ ]` 📚 **Gia sư học tập tại nhà** *(Kèm Toán, Tiếng Anh, Tiếng Việt, luyện thi, rèn nề nếp học)*
- `[ ]` 🚗 **Đưa đón bé tan học** *(Đón bé từ trường về nhà hoặc đưa sang lớp học thêm chiều tối)*
- `[ ]` 🧸 **Trông trẻ & Chơi cùng con tại nhà** *(Chăm bé mầm non, chơi trò chơi phát triển tư duy)*

#### Câu 2: Bé nhà bạn hiện đang ở độ tuổi nào? *(Bắt buộc - Chọn 1)*
- `( )` Dưới 3 tuổi *(Nhà trẻ / Mầm non bé)*
- `( )` 3 – 6 tuổi *(Mẫu giáo lớn, chuẩn bị vào Lớp 1)*
- `( )` 6 – 11 tuổi *(Cấp 1 / Tiểu học)*
- `( )` Trên 11 tuổi *(Cấp 2 / THCS)*

#### Câu 3: Khung thời gian gia đình bạn cần người hỗ trợ nhất? *(Chọn nhiều)*
- `[ ]` Giờ cao điểm tan tầm: **16:30 – 18:30** *(Cần đón bé tránh kẹt xe)*
- `[ ]` Buổi tối các ngày trong tuần: **18:30 – 21:00** *(Kèm bài tập về nhà / Trông bé)*
- `[ ]` Cuối tuần: **Thứ 7 & Chủ Nhật** *(Trông bé trọn gói hoặc học ngoại khóa)*
- `[ ]` Linh hoạt đột xuất khi bố mẹ có lịch công tác / họp đột xuất

#### Câu 4: Khi tin tưởng giao con cho CarePartner, điều gì quan trọng nhất với bạn? *(Chọn tối đa 3)*
- `[ ]` 🛡️ **Lý lịch xác thực:** Có CCCD và Thẻ Sinh viên trường đại học uy tín được Admin duyệt
- `[ ]` 📍 **An toàn tuyệt đối:** Có định vị Live GPS theo dõi lộ trình và xác minh qua ảnh/mã PIN
- `[ ]` 🎓 **Năng lực chuyên môn:** Có bảng điểm tốt, chứng chỉ ngoại ngữ (IELTS/TOEIC) hoặc kinh nghiệm sư phạm
- `[ ]` ⏰ **Tính kỷ luật & Đúng giờ:** Cam kết có mặt đúng giờ, không tự ý hủy ca làm việc
- `[ ]` ⭐ **Đánh giá cộng đồng:** Có nhiều đánh giá 5 sao thực tế từ các phụ huynh khác
- `[ ]` 💳 **Minh bạch tài chính:** Thanh toán ký quỹ an toàn, chỉ giải ngân khi ca làm hoàn tất

#### Câu 5: Mức chi phí bạn sẵn sàng chi trả cho dịch vụ đồng hành cùng con? *(Bắt buộc - Chọn 1)*
- `( )` 70.000đ – 100.000đ / giờ *(Phù hợp trông trẻ cơ bản / phụ kèm bài)*
- `( )` 100.000đ – 150.000đ / giờ *(Gia sư kiến thức vững / Đón trẻ kèm giữ bé)*
- `( )` 150.000đ – 220.000đ / giờ *(Gia sư chuyên sâu, luyện thi, Tiếng Anh giao tiếp)*
- `( )` Theo lượt đưa đón: 50.000đ – 80.000đ / lượt đón

#### Câu 6: Mức độ cần thiết của giải pháp EduCareLink với gia đình bạn lúc này? *(Bắt buộc - Chọn 1)*
- `( )` **Rất cấp bách** — Đang cần tìm người hỗ trợ ngay trong tuần này
- `( )` **Cần thiết** — Đang cân nhắc giải pháp để thay đổi trong tháng tới
- `( )` **Quan tâm tìm hiểu** — Muốn xem thử trước tính năng định vị và hồ sơ sinh viên
- `( )` **Chưa có nhu cầu** lúc này

---

### 3.2. BẢNG CÂU HỎI KHẢO SÁT DÀNH CHO CAREPARTNER (SINH VIÊN / NGƯỜI ĐỒNG HÀNH)

```html
<!-- TAB PANEL: NGƯỜI ĐỒNG HÀNH (CAREPARTNER) -->
```

#### Câu 1: Bạn mong muốn nhận những công việc nào trên nền tảng? *(Bắt buộc - Chọn nhiều)*
- `[ ]` 📚 **Gia sư dạy kèm tại nhà** *(Toán, Tiếng Anh, Tiếng Việt, Ngoại ngữ, Luyện thi)*
- `[ ]` 🚗 **Đón trẻ tan học** *(Có xe máy riêng, đón bé từ trường về nhà an toàn)*
- `[ ]` 🧸 **Trông trẻ & Chơi cùng bé** *(Chăm sóc, trò chuyện, đọc sách, tương tác tại nhà phụ huynh)*

#### Câu 2: Bạn hiện đang là đối tượng nào? *(Bắt buộc - Chọn 1)*
- `( )` Sinh viên Đại học / Cao đẳng năm 1 – 2
- `( )` Sinh viên Đại học / Cao đẳng năm 3 – 4 hoặc mới tốt nghiệp
- `( )` Sinh viên / Giáo viên chuyên ngành Sư phạm, Mầm non, Giáo dục tiểu học
- `( )` Người đã đi làm có mong muốn làm thêm chăm sóc trẻ ngoài giờ

#### Câu 3: Phương tiện di chuyển chính của bạn khi nhận việc là gì? *(Bắt buộc - Chọn 1)*
- `( )` 🛵 **Xe máy riêng:** Đã có bằng lái A1 và sẵn sàng trang bị mũ bảo hiểm trẻ em chuẩn
- `( )` 🚌 **Phương tiện công cộng:** Đi xe buýt / tàu điện đô thị (Metro)
- `( )` 🚶 **Đi bộ / Xe đạp:** Ưu tiên các ca làm trong bán kính 1 – 2 km gần trường hoặc nơi ở

#### Câu 4: Khung thời gian bạn có thể nhận ca làm việc trong tuần? *(Chọn nhiều)*
- `[ ]` Ca chiều tan trường: **16:30 – 18:30** *(Phù hợp nhận các ca đón bé)*
- `[ ]` Buổi tối các ngày trong tuần: **18:30 – 21:00** *(Phù hợp dạy gia sư / kèm học)*
- `[ ]` Cả ngày cuối tuần: **Thứ 7 & Chủ Nhật** *(Rảnh nhiều giờ, nhận ca dài)*
- `[ ]` Linh hoạt theo lịch học của từng học kỳ *(Đăng ký trên Lịch rảnh tuần)*

#### Câu 5: Mức thù lao bạn kỳ vọng nhận được mỗi giờ làm việc? *(Bắt buộc - Chọn 1)*
- `( )` 60.000đ – 85.000đ / giờ *(Trông bé / đón bé ca ngắn)*
- `( )` 85.000đ – 120.000đ / giờ *(Gia sư phổ thông / Trông trẻ nâng cao)*
- `( )` 120.000đ – 180.000đ / giờ *(Gia sư chuyên sâu, IELTS, Toán tư duy)*
- `( )` Trên 180.000đ / giờ

#### Câu 6: Điều gì bạn kỳ vọng nhất khi làm việc qua EduCareLink? *(Chọn tối đa 2)*
- `[ ]` 🤖 **Hệ thống tự ghép đơn thông minh (Flow 1):** Không phải mất công đăng bài tìm việc hay cạnh tranh hạ giá
- `[ ]` 💳 **Đảm bảo thù lao 100%:** Tiền được phụ huynh ký quỹ trước, tự động về ví sau khi xong việc
- `[ ]` 📈 **Thăng hạng ELO:** Làm tốt được tích lũy điểm uy tín để nhận các ca VIP thù lao cao
- `[ ]` 🛡️ **An toàn cá nhân:** Thông tin phụ huynh được xác minh minh bạch, có trung tâm hỗ trợ khi gặp sự cố

---

### 3.3. PHẦN GÓP Ý CHUNG & EMAIL (ÁP DỤNG CHO CẢ 2 VAI TRÒ)
- **Góp ý tự do (Textarea):**
  - *Placeholder:* `"Chia sẻ thêm suy nghĩ của bạn (Ví dụ: Bạn có e ngại điều gì về an toàn khi đón bé? Bạn muốn nền tảng bổ sung thêm tính năng nào để yên tâm hơn?...)"`
- **Email liên hệ (Input Email):**
  - *Gợi ý:* Để lại email nếu bạn muốn nhận bộ quà tặng hoặc ưu đãi trải nghiệm dịch vụ đầu tiên khi EduCareLink ra mắt tính năng mới.

---

## 4. BẢNG THIẾT KẾ LẠI FORM ĐĂNG KÝ TƯ VẤN & DÙNG THỬ (`#dang-ky`)

Form đăng ký cần được bổ sung các trường dữ liệu mang tính phân khúc thị trường để đội ngũ chăm sóc khách hàng tư vấn trúng đích:

### 4.1. Cấu trúc trường dữ liệu bổ sung:
1. **Họ và tên:** `full_name` *(Bắt buộc)*
2. **Số điện thoại:** `phone` *(Bắt buộc - Kiểm tra 10 số)*
3. **Email:** `email` *(Bắt buộc)*
4. **Bạn là:** `role` *(Phụ huynh / Sinh viên CarePartner)*
5. **Dịch vụ bạn quan tâm nhất:** `interested_service` *(Bổ sung mới)*
   - `tutoring`: Gia sư học tập
   - `pickup`: Đưa đón bé tan học
   - `childcare`: Trông trẻ tại nhà
6. **Khu vực của bạn (Tỉnh / Thành phố & Quận / Huyện):** `location_area` *(Bổ sung mới)*
   - Thành phố: Hà Nội / TP. Hồ Chí Minh / Đà Nẵng / Tỉnh thành khác
   - Quận / Huyện: Ô nhập tự do (VD: Cầu Giấy, Quận 7, TP. Thủ Đức...)
7. **Khung giờ thuận tiện để EduCareLink liên hệ tư vấn:** `preferred_time_slot`
   - Sáng: 08:30 – 11:30
   - Chiều: 13:30 – 17:00
   - Tối: 18:30 – 20:30
8. **Ghi chú thêm:** `note` *(Không bắt buộc)*

---

## 5. HƯỚNG DẪN KỸ THUẬT CHO CODING AGENT THỰC HIỆN

### 5.1. File template `frontend/templates/frontend/landing.html`
1. **Cập nhật nội dung Hero & Giới thiệu:**
   - Sửa dòng văn bản giới thiệu loại bỏ hoàn toàn các từ `"dọn dẹp"`, `"mua sắm"`. Thay bằng: `"kết nối Phụ huynh với sinh viên CarePartner đã xác minh cho các công việc Gia sư học tập, Đưa đón bé tan trường và Trông trẻ tại nhà an toàn."`
2. **Cập nhật Form Khảo Sát `#surveyForm`:**
   - Thay thế toàn bộ HTML của `#panel-phu-huynh` và `#panel-carepartner` theo đúng Bộ câu hỏi mục 3 ở trên.
   - Giữ nguyên các class css hiện tại (`field`, `choice-grid`, `choice`, `choice-text`, `btn-primary`, `err-msg`).
3. **Cập nhật JavaScript xử lý Submit (`/api/landing/survey/`):**
   - Đảm bảo object `role_answers` gửi lên backend có cấu trúc JSON tương thích:
     ```javascript
     // Dành cho CarePartner:
     const roleAnswersCP = {
       services: getCheckedValues('cp-services'), // ['tutoring', 'pickup', 'childcare']
       carepartner_type: getRadioValue('cp-type'),
       transport_method: getRadioValue('cp-transport'),
       available_slots: getCheckedValues('cp-slots'),
       expected_rate: getRadioValue('cp-rate'),
       motivations: getCheckedValues('cp-motivations')
     };

     // Dành cho Phụ Huynh:
     const roleAnswersPH = {
       services: getCheckedValues('ph-services'),
       child_age: getRadioValue('ph-child-age'),
       busy_slots: getCheckedValues('ph-busy-slots'),
       trust_factors: getCheckedValues('ph-trust-factors'),
       budget_range: getRadioValue('ph-budget'),
       necessity: getRadioValue('ph-necessity')
     };
     ```

### 5.2. File Backend Serializer `core/serializers.py`
Kiểm tra và cập nhật `LandingSurveySerializer.validate()` để chấp nhận các key mới trong `role_answers`:
```python
if role == 'carepartner':
    if not ra.get('services') or not isinstance(ra['services'], list) or len(ra['services']) == 0:
        errors['role_answers'] = 'Vui lòng chọn ít nhất 1 dịch vụ mong muốn nhận.'
    if not ra.get('expected_rate'):
        errors['role_answers'] = 'Vui lòng chọn mức thù lao kỳ vọng.'
elif role == 'phu-huynh':
    if not ra.get('necessity'):
        errors['role_answers'] = 'Vui lòng chọn mức độ cần thiết.'
```

### 5.3. Cập nhật AI Prompt Phân Tích trong `core/admin_stats.py`
Trong hàm `ai_analyze_landing_stats_view`, điều chỉnh câu prompt gửi sang Gemini:
- Hướng AI phân tích sâu vào 3 dịch vụ cốt lõi: *Tỷ lệ phụ huynh cần Đón trẻ so với Gia sư? Nhu cầu khung giờ tan tầm (16h30-18h30) có đang áp đảo không? Mức giá kỳ vọng giữa phụ huynh và CarePartner có độ chênh lệch (gap) ra sao? Đề xuất giải pháp định giá và tuyển dụng CarePartner sinh viên theo quận huyện.*

---

## 6. KẾT LUẬN & KIỂM ĐỊNH NGHIỆM THU

Khi Coding Agent hoàn tất việc áp dụng tài liệu này:
- [ ] Trang `/landing/` không còn xuất hiện bất kỳ từ ngữ nào về "dọn dẹp nhà cửa" hay "mua sắm hộ".
- [ ] Dịch vụ "Đưa đón trẻ tan học" xuất hiện nổi bật tại cả Hero, Features, Survey và Signup.
- [ ] Mức thù lao khảo sát phù hợp với thực tế thị trường năm 2026 (không còn mức dưới 30k/h).
- [ ] Phụ huynh và CarePartner khi tham gia khảo sát đều cảm nhận được tính thiết thực và chạm đúng "nỗi đau" thực tế của họ.
- [ ] Dữ liệu gửi về API `/api/landing/survey/` và `/api/landing/signup/` lưu trữ đầy đủ, trơn tru, không gặp lỗi 400 validation.
