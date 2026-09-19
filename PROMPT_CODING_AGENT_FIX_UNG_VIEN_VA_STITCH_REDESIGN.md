# HƯỚNG DẪN & PROMPT TOÀN DIỆN CHO CODING AGENT: SỬA LỖI MÀN HÌNH TRẮNG /UNG-VIEN/ & NÂNG CẤP GIAO DIỆN STITCH AI

> **Dự án**: EduCareLink Backend & Web (`educarelink-backend-4-12-2026`)  
> **Nhánh làm việc**: `main` (Render auto-deploy: `https://educarelink-backend.onrender.com`)  
> **Cam kết cốt lõi**:
> 1. 🛡️ **TUYỆT ĐỐI KHÔNG CHẠM VÀO THƯ MỤC `mobile/`**: Ứng dụng mobile đang hoạt động rất tốt, không được sửa bất kỳ dòng code nào trong `mobile/`.
> 2. ⚡ **THỨ TỰ ƯU TIÊN**: Làm cho tính năng HOẠT ĐỘNG HOÀN CHỈNH & ỔN ĐỊNH TRƯỚC ("Trước tiên là cho nó hoạt động đi đã rồi hẵng nâng cấp giao diện").
> 3. 🎨 **GIỮ NGUYÊN SIDEBAR**: Sidebar phụ huynh 260px (`_parent_chrome.html` / `_parent_sidebar.html`) bắt buộc phải hiển thị chuẩn chỉnh trên Web desktop.
> 4. 📍 **ĐỊA BÀN TP. HUẾ**: Tất cả trường đại học hiển thị, gợi ý phải thuộc Huế (ĐH Sư Phạm, ĐH Y Dược, ĐH Ngoại Ngữ, ĐH Khoa Học - Đại học Huế), tuyệt đối không có Bách Khoa hay Ngoại Thương Hà Nội.
> 5. 💬 **NGÔN NGỮ COMMIT**: Tiếng Việt chuẩn mực.

---

## I. BỐI CẢNH & NGUYÊN NHÂN GỐC RỄ ĐÃ ĐƯỢC ĐIỀU TRA

### 1. Hiện tượng người dùng gặp phải
- Người dùng sau khi đăng việc trên Web tại URL `https://educarelink-backend.onrender.com/dang-viec/gia-su/`, hệ thống quét radar xong và điều hướng tới `https://educarelink-backend.onrender.com/ung-vien/2ad71cf6-5877-4095-bbb2-103c78651775/`.
- **Triệu chứng** (ảnh chụp thực tế `media_1789711777653.png`):
  - Sidebar bên trái hiển thị bình thường ("Công Vinh Trương - Phụ huynh").
  - Header trên cùng hiển thị logo, "Trang chủ", "Danh sách ứng viên phù hợp".
  - **Toàn bộ vùng nội dung chính bên dưới TRẮNG XÓA HOÀN TOÀN**, không có thanh loading, không có danh sách ứng viên, không có thông báo lỗi.

---

### 2. Nguyên nhân kỹ thuật chính xác 100% (Đã kiểm chứng qua curl/requests trực tiếp tới Render)

#### Nguyên nhân 1: Gunicorn Timeout 30s dẫn đến HTTP 500 trên Render
Khi Web gọi API:
```http
POST https://educarelink-backend.onrender.com/api/matching/candidates/
Content-Type: application/json
Authorization: Bearer <access_token>
{"job_id": "2ad71cf6-5877-4095-bbb2-103c78651775"}
```
Kết quả kiểm thử thực tế đo được:
- **Thời gian phản hồi**: `31.58s`
- **HTTP Status Code**: `500 Internal Server Error`
- **Response Body**:
  ```html
  <html>
    <head><title>Internal Server Error</title></head>
    <body><h1><p>Internal Server Error</p></h1></body>
  </html>
  ```
- **Lý do backend bị treo quá 30s**:
  1. **N+1 Query bão hòa trên Neon PostgreSQL**: Trong `matching/services/matching_service.py` -> `covers_all_slots()` và `available_slots()`, hệ thống lặp qua từng `CarePartnerProfile` trong DB, rồi lại lặp qua từng `slot`, chạy liên tục hàng loạt câu query đơn lẻ tới `CarePartnerAvailability`, `CarePartnerBlackout`, `Booking`, và `SlotLock`. Với PostgreSQL qua mạng, 60-80 round-trips mạng tốn 10-15 giây!
  2. **Gemini Re-rank Timeout**: Trong `matching_service.py` dòng 556, hàm `rerank_candidates()` gọi Google Gemini API với chuỗi fallback `GEMINI_TOTAL_BUDGET_S = 14s`.
  3. **Soft-lock Generation**: `_soft_lock_candidates()` trong `matching/api/jobs.py` lại lặp qua từng candidate và từng slot để ghi DB thêm hàng chục câu query nữa.
  => Tổng thời gian vượt quá ngưỡng **30 giây của Gunicorn Worker (`WORKER TIMEOUT`)**, khiến Gunicorn tự động giết tiến trình và trả về trang lỗi HTML 500!

#### Nguyên nhân 2: Lỗi bắt ngoại lệ câm (Silent Exception) trong frontend `ung_vien.html`
Trong file `frontend/templates/frontend/ung_vien.html` (dòng 91-108):
```javascript
async function load() {
  try {
    const resp = await authFetch(`${API_BASE}/matching/candidates/`, {
      method: 'POST', body: JSON.stringify({ job_id: jobId }) });
    const data = await resp.json(); // <-- BỊ CRASH TẠI ĐÂY DO SERVER TRẢ VỀ HTML!
    document.getElementById('loading').classList.add('hidden');
    if (!resp.ok) {
      const box = document.getElementById('errorBox');
      document.getElementById('errorMsg').textContent = data.detail || 'Không tải được danh sách ứng viên.';
      box.classList.remove('hidden');
      return;
    }
    render(data);
  } catch (e) {
    console.warn(e);
    document.getElementById('loading').classList.add('hidden'); // <-- ẨN LOADING NHƯNG KHÔNG HIỂN THỊ GÌ CẢ!
  }
}
```
- Khi server trả về HTML 500, hàm `resp.json()` ném ra lỗi cú pháp `SyntaxError: Unexpected token '<'`.
- Khối `catch (e)` bắt lỗi nhưng **CHỈ ẨN SPINNER LOADING** mà **KHÔNG HỀ HIỂN THỊ ERROR BOX HOẶC THÔNG BÁO CHO NGƯỜI DÙNG**.
- Kết quả: Toàn bộ màn hình bên dưới trở thành **TRẮNG TINH (BLANK WHITE SCREEN)**.

---

## II. NHIỆM VỤ CỤ THỂ CHO CODING AGENT

Coding agent cần tiến hành theo 3 bước tuần tự sau:

---

### BƯỚC 1: TỐI ƯU HÓA BACKEND ĐỂ API `matching/candidates/` PHẢN HỒI DƯỚI 2 GIÂY (DSA Performance)
File mục tiêu: `matching/services/matching_service.py`, `matching/services/lock_service.py`, `matching/api/jobs.py`, `matching/services/gemini_service.py`.

1. **Tuân thủ quy tắc DSA (§2 SKILL.md)**:
   - Loại bỏ N+1 query trong vòng lặp matching:
     - Query gom nhóm 1 lần cho `CarePartnerAvailability` theo `carepartner_id__in=[...]`.
     - Tương tự cho `CarePartnerBlackout`, `Booking` active, và `SlotLock`.
     - Ghép nối dữ liệu trong Python bằng `dict` / `set` (tra cứu O(1)) thay vì query DB trong từng lần lặp.
   - Thêm comment `# DSA: ...` tại các điểm tối ưu theo quy định repo.

2. **Bảo vệ Gemini Re-rank không bao giờ được làm nghẽn API**:
   - Trong `gemini_service.py` -> `rerank_candidates`:
     - Giới hạn cứng `timeout=1.5s` cho ThreadPool. Nếu quá 1.5s hoặc Gemini chậm/lỗi, lập tức bỏ qua và trả về kết quả xếp hạng rule-based nguyên bản (không được retry tốn thêm thời gian trong luồng đồng bộ này).
     - Đảm bảo exception từ Gemini luôn được nuốt êm đẹp và log cảnh báo, không bao giờ làm văng lỗi 500 ra ngoài API.

3. **Tối ưu Soft Lock**:
   - Trong `matching/api/jobs.py` -> `_soft_lock_candidates`:
     - Dùng `bulk_create` thay vì lặp qua từng slot gọi `objects.create()`.
     - Bọc `try ... except` an toàn tuyệt đối để không bao giờ chặn kết quả trả về của danh sách ứng viên.

---

### BƯỚC 2: SỬA LỖI & PHÒNG THỦ MÀN HÌNH TRẮNG TRONG `frontend/templates/frontend/ung_vien.html`
File mục tiêu: `frontend/templates/frontend/ung_vien.html`.

1. **Phòng vệ JSON Parse & Xử lý lỗi chuyên nghiệp**:
   - Không bao giờ gọi trực tiếp `resp.json()` mà không kiểm tra content-type hoặc bọc try/catch parse riêng.
   - Nếu `!resp.ok` hoặc status 500 / 502 / 504 / timeout:
     - Hiển thị hộp thông báo lỗi thân thiện: *"Hệ thống đang mở rộng tìm kiếm thêm CarePartner phù hợp tại khu vực Huế. Vui lòng thử lại sau giây lát."*
     - Có nút **"Thử lại ngay"** (gọi lại hàm `load()`) và nút **"Quay lại chỉnh sửa yêu cầu"** (về `/dang-viec/`).
   - Nếu lỗi 401 hoặc hết hạn phiên: thông báo và chuyển hướng mượt mà về `/login/?next=...`.

2. **Dữ liệu dự phòng thông minh (Parity với Mobile)**:
   - Trên mobile (`mobile/src/screens/parent/CandidatesListScreen.js`), khi chưa có ứng viên khớp slot hoặc mạng chậm, màn hình hiển thị danh sách ứng viên mẫu tại Huế hoặc giao diện rỗng chân thực (*Truthful Empty State*).
   - Trên Web, nếu `data.candidates` rỗng (`[]`):
     - Hiển thị Empty State chuẩn mực như mobile:
       - Icon kính lúp với viền cam nhạt.
       - Tiêu đề: *"Chưa tìm thấy CarePartner phù hợp trong khung giờ đã chọn"*.
       - Gợi ý: Nới rộng khung giờ, đổi ngày hoặc mở rộng bán kính tìm kiếm quanh địa chỉ ở TP. Huế.
       - Nút hành động: *"Điều chỉnh yêu cầu / Đổi khung giờ"* dẫn về trang đăng việc.

---

### BƯỚC 3: NÂNG CẤP GIAO DIỆN `ung_vien.html` THEO THIẾT KẾ GOOGLE STITCH AI (Tương đồng đẳng cấp với Mobile)
Nâng cấp toàn bộ file `frontend/templates/frontend/ung_vien.html` để đồng bộ phong cách thiết kế Stitch AI từ mobile `CandidatesListScreen.js`, tối ưu cho Desktop Web (Tailwind CSS, responsive).

**Cấu trúc giao diện bắt buộc bao gồm:**

1. **Khung bao quát & Điều hướng (Preserve Sidebar)**:
   - Kế thừa `{% include 'frontend/_parent_chrome.html' with active_tab='matching' %}`.
   - Giữ lề `lg:ml-[260px]` cho toàn bộ header và main để sidebar không che nội dung.
   - Header sticky: Nút "Quay lại" + Logo EduCareLink + Pill "EduCareLink Guarantee".

2. **Job Context Capsule (Hộp thông tin đơn việc)**:
   - Badge loại dịch vụ (GIA SƯ & KÈM HỌC 1:1 / CHĂM SÓC & TRÔNG TRẺ / ĐƯA ĐÓN TRẺ).
   - Mức học phí/tiền công (VD: 120.000đ/giờ).
   - Tiêu đề công việc và lịch học/thời gian.
   - Ghi chú địa điểm tại TP. Huế (khoảng cách cự ly).

3. **Algorithm Live Status Banner (Radar xanh ngọc pulsing)**:
   - Điểm tròn xanh ngọc tỏa sóng radar (CSS animation pulse).
   - Text động: *"Tuyển chọn X CarePartner xuất sắc nhất"* hoặc *"Đang quét mạng lưới CarePartner quanh khu vực Huế..."*.
   - Tiêu chí: *"Khớp chuyên môn · Ưu tiên gần nhà · Đã đối soát CCCD & Thẻ SV"*.

4. **Interactive Filter & Sort Pills (Bộ lọc nhanh)**:
   - Pills chọn sắp xếp tương tác bằng JS:
     - 🌟 Điểm phù hợp nhất (mặc định)
     - 📍 Gần nhà nhất
     - ⭐ Đánh giá cao nhất
     - 👩 Chỉ xem Nữ

5. **#1 Spotlight Hero Card (Thẻ ứng viên vương miện số 1)**:
   - Thiết kế nổi bật đặc biệt cho ứng viên Top 1:
     - Ribbon vương miện: `GỢI Ý HÀNG ĐẦU · 96/100 ĐIỂM`.
     - Badge xác minh: `✓ CCCD & Thẻ SV chuẩn`.
     - Avatar tròn lớn với chữ cái đầu, viền nổi bật.
     - Tên ứng viên, mã số `#CP-xxxx`.
     - Trường & Chuyên ngành: ĐH Sư Phạm Huế, ĐH Y Dược Huế, ĐH Ngoại Ngữ Huế...
     - Metrics: ⭐ 4.95 (48 ca) · 📍 1.2 km · ✅ 100% rảnh lịch.
     - Skill chips (Toán tiểu học, Kiên nhẫn, Sư phạm...).
     - Quote nhận xét chân thực từ phụ huynh: *"Cô giáo dạy cực kỳ kiên nhẫn và ân cần..."*.
     - 2 Nút hành động: "Xem hồ sơ chi tiết" & **"Chọn CarePartner này →"** (Nổi bật cam gradient).

6. **Standard Candidate Cards (#2 đến #8)**:
   - Thẻ chuẩn cho các ứng viên tiếp theo:
     - Huy hiệu thứ hạng `#2`, `#3`, `#4`...
     - Điểm phù hợp màu cam đậm (`95đ`, `93đ`...).
     - Thông tin trường ĐH tại Huế, số đơn đã hoàn thành, khoảng cách.
     - Nút "Chọn bạn này" mở Modal xác nhận.

7. **Safety Guarantee Box (Chân trang cam kết an toàn)**:
   - Hộp cam kết bảo vệ phụ huynh:
     - 🔒 **Ký quỹ an toàn MoMo Escrow**: Chỉ giải ngân sau khi hoàn thành ca và phụ huynh xác nhận hài lòng.
     - 🛡️ **Bảo hiểm đổi ứng viên 100%**: Miễn phí đổi người khác nếu có sự cố bất khả kháng.

8. **Booking Confirmation Modal (Modal xác nhận đặt lịch)**:
   - Popup xác nhận khi phụ huynh bấm chọn ứng viên:
     - Tóm tắt CarePartner được chọn & điểm phù hợp.
     - Thông báo cơ chế tự động giữ đơn qua MoMo Escrow.
     - Nút "Xem thêm" (đóng modal) và "Xác nhận chọn" (gọi API `POST /api/matching/jobs/{jobId}/select-carepartner/` với header `Idempotency-Key` chống bấm lặp).
     - Khi thành công -> chuyển hướng ngay tới `/don/{booking_id}/`.

---

## III. HƯỚNG DẪN KIỂM THỬ & BÀN GIAO

1. **Kiểm tra cú pháp & tính toàn vẹn hệ thống**:
   `python manage.py check`
2. **Kiểm thử API Candidates không bị lỗi hoặc timeout**:
   Chạy script Python kiểm tra trực tiếp endpoint `/api/matching/candidates/` với tài khoản test phụ huynh đảm bảo response trả về mã 200 trong vòng dưới 2 giây.
3. **Kiểm tra giao diện Web**:
   Mở trình duyệt kiểm tra trang `/ung-vien/<job_id>/`:
   - Giao diện có sidebar 260px đầy đủ, không bị đè lệch.
   - Hiển thị trọn vẹn Hero card, filter pills, thông tin đại học tại Huế.
   - Xử lý mượt mà cả 2 trường hợp: có ứng viên và 0 ứng viên (empty state).
4. **Git Commit & Push**:
   - Đảm bảo commit trên nhánh `main`.
   - Message bằng tiếng Việt rõ ràng, ví dụ:
     `git commit -m "fix(web): sua loi man hinh trang ung vien, toi uu hieu nang candidates api va nang cap giao dien stitch"`
   - Push lên `origin main` để Render tự động deploy.
