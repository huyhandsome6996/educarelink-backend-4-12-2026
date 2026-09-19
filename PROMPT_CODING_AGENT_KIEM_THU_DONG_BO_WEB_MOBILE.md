# PROMPT DÀNH CHO CODING AGENT: KIỂM THỬ ĐỒNG BỘ TOÀN DIỆN WEB ↔ MOBILE & DỌN DẸP TRIỆT ĐỂ LUỒNG DỮ LIỆU CŨ (EDUCARELINK)

> **MỤC TIÊU BẮT BUỘC**: Đọc kỹ toàn bộ mã nguồn dự án, phân tích bối cảnh kiến trúc, kiểm thử và đồng bộ hóa toàn diện luồng nghiệp vụ giữa **Web Frontend** và **Mobile App (Expo React Native)**. Đảm bảo 2 bên thông suốt dữ liệu 2 chiều (Web ↔ Mobile) trên cùng một cơ sở dữ liệu và cùng tập API `/api/matching/*`. Xóa bỏ hoàn toàn sự phụ thuộc vào dữ liệu/luồng cũ trên Web, sửa dứt điểm lỗi "User not found", không để lộ đường dẫn API trên giao diện, và chuẩn hóa 100% địa bàn Thành phố Huế.

---

## PHẦN 1: BỐI CẢNH DỰ ÁN & KIẾN TRÚC HỆ THỐNG

### 1.1. Thông tin chung
- **Repository**: `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
- **Nhánh làm việc chính thức**: `main` (Render.com tự động deploy mỗi khi push vào `main`).
- **Tech Stack**:
  - **Backend**: Python 3.11, Django 5.2, Django REST Framework, SimpleJWT (JWT Auth).
  - **Mobile App (`mobile/`)**: React Native (Expo SDK 54), Axios API client, `@react-navigation/native` v7, Context API (`AuthContext.js`).
  - **Web Frontend (`frontend/`)**: Django Templates (`frontend/templates/frontend/`), HTML5, Tailwind CSS, Vanilla JS (Fetch API).
- **Ngôn ngữ cam kết trong Git**: **Tiếng Việt** (BẮT BUỘC theo quy định trong `AGENTS.md`).

### 1.2. Địa bàn triển khai độc quyền: 100% THÀNH PHỐ HUẾ
- Dự án EduCareLink hiện tại **CHỈ TRIỂN KHAI TRÊN ĐỊA BÀN THÀNH PHỐ HUẾ**.
- Tọa độ trung tâm mặc định: **Vĩ độ `16.4637`, Kinh độ `107.5909`**.
- Đối tượng CarePartner (Gia sư, Bảo mẫu, Người đưa đón): Là sinh viên, giảng viên đến từ các trường Đại học thuộc Đại học Huế:
  - **SPH**: Đại học Sư Phạm - Đại học Huế
  - **YDH**: Đại học Y Dược - Đại học Huế
  - **NNH**: Đại học Ngoại Ngữ - Đại học Huế
  - **DHKH**: Đại học Khoa Học - Đại học Huế
  - **KTE**: Đại học Kinh Tế - Đại học Huế
  - **MN**: Khoa Giáo dục Mầm non (ĐH Sư Phạm Huế)
- **CẤM TUYỆT ĐỐI**: Không được xuất hiện bất kỳ địa danh, trường học, hay tọa độ nào ngoài Huế như: Hà Nội, TP.HCM, ĐH Bách Khoa, Chu Văn An, Thụy Khuê, Landmark 81, Cầu Giấy, v.v.

### 1.3. Nguyên tắc kiến trúc Web vs Mobile: CÙNG LOGIC, KHÁC GIAO DIỆN
- **CÙNG BACKEND & DỮ LIỆU**: Web và Mobile gọi **CHUNG một tập API backend** (`/api/auth/*`, `/api/matching/*`, `/api/tracking/*`), lưu vào **CHUNG một database**, xác thực bằng **CHUNG một JWT token**.
- **ĐỒNG BỘ 2 CHIỀU (TWO-WAY SYNC)**:
  - Người dùng đăng nhập tài khoản Phụ huynh trên Web rồi tạo việc -> Mở app Mobile lên phải thấy ngay việc/đơn đó trong danh sách.
  - CarePartner nhận đơn/cam kết trên Mobile -> Web của Phụ huynh F5/tải lại phải thấy trạng thái đơn chuyển thành "Đã khóa lịch" (`committed`).
- **GIAO DIỆN KHÁC NHAU — TUYỆT ĐỐI KHÔNG ÉP WEB PHẢI GIỐNG MOBILE**:
  - **Giao diện Web**: Thiết kế theo Stitch UI dành cho Web Desktop/Tablet/Mobile: Phải luôn có **Sidebar cố định 260px** bên trái (`_parent_sidebar.html`), bố cục dạng lưới Bento Grid, form nhiều cột, bản đồ Leaflet kéo thả rộng rãi, giữ nguyên nhận diện logo EduCareLink.
  - **Giao diện Mobile**: Thiết kế Mobile Native: Bottom Tabs, Stack Screens, Ionicons, Modal trượt từ dưới lên.
  - **LƯU Ý QUAN TRỌNG**: Coding agent **TUYỆT ĐỐI KHÔNG ĐƯỢC ÉP giao diện Web phải co cụm lại để bắt chước pixel-by-pixel của Mobile**. Hai bên có phong cách thiết kế UI khác nhau phù hợp với từng nền tảng, nhưng **CÔNG NĂNG, TÍNH NĂNG, VÀ LOGIC NGHIỆP VỤ PHẢI HOẠT ĐỘNG HOÀN TOÀN GIỐNG HỆT NHAU**.

---

## PHẦN 2: PHÂN TÍCH VẤN ĐỀ VÀ NGUYÊN NHÂN LỖI TRÊN WEB

### 2.1. Vấn đề 1: Phân mảnh dữ liệu giữa luồng cũ (Legacy) và luồng mới (Flow 1 Matching)
- **Hiện trạng trên Web**:
  - Trong quá khứ, dự án dùng luồng cũ: Model `core.Task`, endpoint `/api/parent/my-tasks/`, `/api/tasks/`, các template `parent_tasks.html`, `parent_home.html`, `task_create_1.html`.
  - Sau đó, luồng ghép nối mới (Flow 1 Matching) được xây dựng trong app `matching`: Models `JobPost`, `Booking`, `MatchingSlot`, endpoint `/api/matching/jobs/`, `/api/matching/candidates/`, `/api/matching/bookings/`, các template `dang_viec_gia_su.html`, `dang_viec_trong_tre.html`, `dang_viec_don_tre.html`, `ung_vien.html`, `don.html`, `don_cua_toi.html`.
  - **Sự cố lệch pha**:
    - Mobile đã chuyển 100% sang dùng luồng mới (`/api/matching/*`).
    - Trong khi đó trên Web, menu Sidebar (`_parent_sidebar.html`) mục "Trang chủ" (`parent_home.html`) và mục "Việc của tôi" (`parent_tasks.html`) vẫn gọi API cũ `/api/parent/my-tasks/` của model `core.Task`!
    - Hậu quả: Khi Phụ huynh đăng việc bằng 3 form mới trên Web (`/dang-viec/gia-su/`, `/dang-viec/trong-tre/`, `/dang-viec/don-tre/`), job và booking được tạo ở bảng `matching_jobpost` và `matching_booking`. Nhưng khi bấm vào "Việc của tôi" hay "Trang chủ" trên Web thì lại load bảng `core_task`, dẫn đến việc **không thấy đơn nào**, hoặc thấy **dữ liệu rác cũ**, người dùng tưởng rằng hệ thống bị lỗi không lưu!
- **Yêu cầu giải quyết**:
  - **Xóa bỏ/thay thế triệt để dữ liệu và các lệnh gọi API của luồng cũ trên Web phụ huynh**.
  - Trang "Việc của tôi" (`parent_tasks.html`) và "Trang chủ" (`parent_home.html`) trên Web phụ huynh **BẮT BUỘC phải lấy dữ liệu từ luồng mới**: gọi `GET /api/matching/bookings/?role=parent` và `GET /api/matching/jobs/` để hiển thị danh sách công việc và đơn ghép cặp thực tế, đồng bộ 100% với Mobile (`MyTasksScreen.js` và `ParentHomeScreen.js`).

### 2.2. Vấn đề 2: Lỗi "User not found" khi đăng việc hoặc tìm người
- **Nguyên nhân gốc rễ**:
  - Khi cơ sở dữ liệu trên môi trường Render hoặc SQLite dev được migrate lại hoặc re-seed tài khoản demo, các JWT token cũ lưu trong `localStorage` của trình duyệt người dùng trỏ tới `user_id` không còn tồn tại trong DB.
  - Khi người dùng bấm đăng việc hoặc tìm người, SimpleJWT trả về HTTP 401: `{"detail": "User not found", "code": "user_not_found"}`.
  - Frontend Web nếu không intercept lỗi 401 này sẽ lấy thẳng chuỗi `data.detail` ("User not found") bắn vào toast thông báo, khiến người dùng hoang mang và không biết tài khoản của mình đã hết hạn.
- **Yêu cầu giải quyết**:
  - Nâng cấp bộ bắt lỗi tập trung trong `_matching_common.html` và trên từng trang đăng việc: Khi gặp HTTP 401 hoặc mã `user_not_found`, hệ thống phải:
    1. Tự động xóa sạch toàn bộ các key hết hạn trong `localStorage`: `token`, `refresh_token`, `role`, `user`, `is_staff`, v.v.
    2. Hiển thị thông báo tiếng Việt lịch sự, rõ ràng: *"Phiên đăng nhập đã hết hạn hoặc tài khoản không tồn tại. Đang chuyển đến trang đăng nhập..."*.
    3. Tự động chuyển hướng về trang `/login/?next=<đường_dẫn_hiện_tại>` sau 1.2 giây.
  - Tại giao diện Sidebar (`_parent_sidebar.html`), nếu chưa có token hợp lệ, thẻ phụ huynh ở góc dưới phải hiển thị nút **"Đăng nhập"** màu cam rõ ràng, không được treo vô tận ở trạng thái "Đang tải...".
  - Kiểm tra điều kiện `localStorage.getItem('token')` trước khi người dùng gửi form hoặc kích hoạt modal radar. Nếu chưa đăng nhập, hiển thị thông báo yêu cầu đăng nhập và chuyển hướng ngay.

### 2.3. Vấn đề 3: Lộ đường dẫn API (`API /api/matching/jobs/`) và chuỗi debug kỹ thuật
- **Nguyên nhân**:
  - Một số file giao diện web thừa hưởng từ bản thiết kế mẫu có chứa thẻ preview payload thô (`#radarPayloadPreview`) hoặc hiển thị dòng chữ `API /api/matching/jobs/` bên dưới modal radar quét ứng viên.
  - Một số text thông báo ghi nguyên văn kỹ thuật: *"Đang kết nối cổng matching EduCareLink API..."*.
- **Yêu cầu giải quyết**:
  - Gỡ bỏ vĩnh viễn mọi thẻ HTML, container hiển thị URL API, JSON payload xem trước.
  - Chuẩn hóa toàn bộ câu chữ giao diện thành ngôn ngữ tự nhiên, thân thiện: *"Đang kết nối CarePartner phù hợp tại Huế..."*.

### 2.4. Vấn đề 4: Lọt địa danh ngoài Huế (Bách Khoa, Chu Văn An, Thụy Khuê, Landmark 81...)
- **Nguyên nhân**:
  - Các prototype giao diện trước đây copy từ mẫu thiết kế ở Hà Nội và TP.HCM, dẫn đến placeholder nhập liệu, tọa độ mặc định, và huy hiệu radar vẫn còn sót lại địa danh ngoài Huế.
- **Yêu cầu giải quyết**:
  - Rà soát sạch sẽ bằng lệnh tìm kiếm toàn bộ project: Đảm bảo 100% địa danh, placeholder, tọa độ ẩn mặc định, huy hiệu trường đại học trên radar đều thuộc về **Thành phố Huế**.

---

## PHẦN 3: BẢNG ĐỐI CHIẾU FLOW NGHIỆP VỤ PARITY WEB ↔ MOBILE

Tất cả các tính năng dưới đây phải dùng **CHUNG ENDPOINT BACKEND** và dữ liệu phải đồng bộ tức thì giữa Web và Mobile:

| Nghiệp vụ | Màn hình Mobile | Trang Web tương ứng | Endpoint Backend dùng chung | Hành vi nghiệp vụ chuẩn |
|---|---|---|---|---|
| **1. Chọn loại công việc** | `JobTypeSelectScreen.js` | `/dang-viec/` (`dang_viec_select.html`) | N/A (UI chuyển hướng) | Chọn 1 trong 3 dịch vụ: Gia sư 1:1, Trông trẻ tại nhà, Đón trẻ tan học. |
| **2. Đăng việc Gia sư** | `TutoringForm.js` | `/dang-viec/gia-su/` (`dang_viec_gia_su.html`) | `POST /api/matching/jobs/` + `POST /api/matching/jobs/<id>/publish/` | Đăng tin kèm môn học, độ tuổi, lớp học, lịch học, học phí. Phải có kiểm tra auth, không lộ API, toạ độ Huế. |
| **3. Đăng việc Trông trẻ** | `ChildcareForm.js` | `/dang-viec/trong-tre/` (`dang_viec_trong_tre.html`) | `POST /api/matching/jobs/` + `POST /api/matching/jobs/<id>/publish/` | Đăng tin kèm nhóm tuổi bé, số lượng bé, nhiệm vụ chăm sóc, lịch, phí trông trẻ. Toạ độ Huế `16.4637, 107.5909`. |
| **4. Đăng việc Đón trẻ** | `PickupForm.js` | `/dang-viec/don-tre/` (`dang_viec_don_tre.html`) | `POST /api/matching/jobs/` + `POST /api/matching/jobs/<id>/publish/` | Đăng tin kèm điểm đón (trường học), điểm đến, phương tiện di chuyển, lịch đón, phí. Toạ độ Huế. |
| **5. Xem danh sách ứng viên** | `CandidatesListScreen.js` | `/ung-vien/<job_id>/` (`ung_vien.html`) | `POST /api/matching/candidates/` | Trả về danh sách ứng viên phù hợp tại Huế (xếp hạng theo điểm match, khoảng cách GPS, kỹ năng). |
| **6. Phụ huynh chọn CarePartner** | Tapping "Chọn CarePartner" trên `CandidatesListScreen.js` | Bấm "Chọn ứng viên" trên `ung_vien.html` | `POST /api/matching/jobs/<id>/select-carepartner/` | Khoá độc quyền ứng viên trong 300 giây, tạo `Booking` với trạng thái `awaiting_commitment`. |
| **7. CarePartner nhận đơn & cam kết** | `JobAssignedModal.js` / `MyJobsScreen.js` | `don_cua_toi.html` / `worker_feed.html` | `GET /api/matching/bookings/?status=awaiting_commitment`<br>`POST /api/matching/bookings/<id>/commit/` | CarePartner thấy đơn chờ xác nhận với đồng hồ đếm ngược 15 giây, bấm "Xác nhận cam kết" -> Booking chuyển sang `committed`. |
| **8. CarePartner từ chối đơn** | Nút "Từ chối" trên Modal mobile | Nút "Từ chối" trên Web | `POST /api/matching/bookings/<id>/cancel/` | Chọn 1 trong 8 lý do từ chối T0, hệ thống tự động tìm người thay thế. |
| **9. Quản lý việc của Phụ huynh** | `MyTasksScreen.js` | `/parent/tasks/` (`parent_tasks.html`) | `GET /api/matching/bookings/?role=parent`<br>`GET /api/matching/jobs/` | **QUAN TRỌNG**: Web phải hiển thị các đơn ghép cặp Flow 1 (Chờ cam kết, Đã khóa lịch, Đang thực hiện, Hoàn thành, Đã hủy). |
| **10. Trang chủ Phụ huynh** | `ParentHomeScreen.js` | `/parent/` (`parent_home.html`) | `GET /api/matching/bookings/?role=parent` | Hiển thị tóm tắt các ca làm việc gần đây, trạng thái live radar của ca đang chạy. |
| **11. Chi tiết đơn & Thao tác ca** | `BookingDetailScreen.js` | `/don/<booking_id>/` (`don.html`) | `GET /api/matching/bookings/<id>/`<br>`POST .../start/`<br>`POST .../complete/`<br>`POST .../cancel-parent/` | Bắt đầu ca làm, hoàn thành ca, phụ huynh huỷ đơn có hoàn tiền/ký quỹ, gửi yêu cầu đổi lịch (`/reschedule/`). |
| **12. Đổi lịch hẹn (Reschedule)** | Inline đổi lịch trên mobile | Modal đổi lịch trên `don.html` & `don_cua_toi.html` | `POST .../bookings/<id>/reschedule/`<br>`POST .../bookings/<id>/reschedule/respond/` | CarePartner đề xuất giờ mới -> Phụ huynh duyệt hoặc từ chối. |

---

## PHẦN 4: NHIỆM VỤ CHI TIẾT DÀNH CHO CODING AGENT

Coding Agent khi nhận prompt này cần thực hiện lần lượt và đầy đủ các bước kỹ thuật sau:

### Nhiệm vụ 1: Dọn dẹp luồng cũ & Kết nối luồng mới cho Web Phụ huynh
1. **Kiểm tra và sửa file `frontend/templates/frontend/parent_tasks.html`**:
   - Hiện tại file này đang gọi `API_BASE + '/parent/my-tasks/'` (bảng `core.Task` cũ).
   - **Cần cập nhật**: Chuyển đổi logic lấy dữ liệu chính từ `GET /api/matching/bookings/?role=parent`.
   - Hiển thị danh sách các đơn ghép cặp với đầy đủ thông tin:
     - Tên công việc (Gia sư, Trông trẻ, Đón trẻ), thời gian làm việc, địa chỉ tại Huế.
     - Trạng thái đơn với badge màu chuẩn:
       - `awaiting_commitment`: *Chờ CarePartner cam kết* (Vàng/Cam)
       - `committed`: *Đã khóa lịch hẹn* (Xanh dương/Cam đậm)
       - `in_progress`: *Đang thực hiện ca làm* (Xanh dương)
       - `completed`: *Hoàn thành* (Xanh lá)
       - `cancelled`: *Đã huỷ* (Xám/Đỏ)
     - Nút xem chi tiết trỏ tới `/don/<booking_id>/`.
     - Nếu đơn là Job đang tìm ứng viên (chưa chọn CarePartner), hiển thị nút chuyển sang `/ung-vien/<job_id>/`.
2. **Kiểm tra và sửa file `frontend/templates/frontend/parent_home.html`**:
   - Đổi lệnh gọi API danh sách ca làm việc gần đây từ `/parent/my-tasks/` sang `GET /api/matching/bookings/?role=parent`.
   - Đảm bảo thẻ hiển thị "Ca làm gần đây" phản ánh chính xác các đơn Flow 1 giống hệt màn hình `ParentHomeScreen.js` của mobile.
3. **Kiểm tra Sidebar `frontend/templates/frontend/_parent_sidebar.html`**:
   - Đảm bảo link "Trang chủ" trỏ tới `/parent/`, link "Việc của tôi" trỏ tới `/parent/tasks/`, link "Đăng việc ghép cặp" trỏ tới `/dang-viec/`.
   - Giữ nguyên thiết kế và kích thước chuẩn 260px của Sidebar.

### Nhiệm vụ 2: Kiểm thử và hoàn thiện 3 trang Đăng việc
Rà soát 3 file:
- `frontend/templates/frontend/dang_viec_gia_su.html`
- `frontend/templates/frontend/dang_viec_trong_tre.html`
- `frontend/templates/frontend/dang_viec_don_tre.html`

Yêu cầu cụ thể:
1. **Khắc phục triệt để lỗi "User not found"**:
   - Kiểm tra `localStorage.getItem('token')` trước khi mở modal radar hoặc submit. Nếu không có token, báo lỗi và redirect tới `/login/?next=...`.
   - Khi fetch API gặp 401: Xóa sạch token hết hạn, báo lỗi bằng toast tiếng Việt và redirect về `/login/`.
2. **Loại bỏ 100% vết tích lộ API**:
   - Xóa bỏ mọi div `#radarPayloadPreview`, `API /api/matching/jobs/`.
   - Không để chữ "API" xuất hiện trong bất kỳ thông báo nào gửi đến người dùng.
3. **Chuẩn hóa 100% Thành phố Huế**:
   - Toạ độ ẩn: `latitude: 16.4637, longitude: 107.5909`.
   - Địa chỉ mẫu và placeholder: Phải là các trường học, con đường tại Huế (Vĩnh Ninh, Nguyễn Huệ, Lê Lợi...).
   - Huy hiệu radar: `SPH`, `YDH`, `NNH`, `MN`.

### Nhiệm vụ 3: Kiểm thử luồng ứng viên (`ung_vien.html`) và chi tiết đơn (`don.html`)
1. **Trang `ung_vien.html` (`/ung-vien/<job_id>/`)**:
   - Kiểm tra API call `POST /api/matching/candidates/` với `job_id`.
   - Kiểm tra hiển thị danh sách gia sư/bảo mẫu tại Huế.
   - Nút "Chọn CarePartner": Khi bấm, gọi `POST /api/matching/jobs/<id>/select-carepartner/` -> tạo booking thành công và chuyển hướng về `/don/<booking_id>/`.
2. **Trang `don.html` (`/don/<booking_id>/`)**:
   - Kiểm tra API call `GET /api/matching/bookings/<booking_id>/`.
   - Hiển thị đầy đủ thông tin: Phụ huynh, CarePartner, lịch làm việc, học phí, bản đồ địa điểm.
   - Các nút thao tác (Hủy đơn, Yêu cầu đổi lịch, Đánh giá khi hoàn thành) phải call đúng API tương ứng và cập nhật giao diện mượt mà.

### Nhiệm vụ 4: Kiểm thử kịch bản E2E Đồng bộ 2 chiều (Web ↔ Mobile)
Viết hoặc chạy kịch bản kiểm thử tự động (hoặc chạy qua lệnh python) để chứng minh tính đồng bộ 2 chiều:
1. **Test Case 1 (Web -> Mobile)**:
   - Dùng tài khoản Phụ huynh đăng nhập trên Web.
   - Đăng một việc Gia sư Toán tại TP. Huế qua `/dang-viec/gia-su/`.
   - Vào `/ung-vien/<job_id>/` chọn 1 CarePartner.
   - Mở app Mobile (hoặc gọi API như Mobile gọi): Xác nhận `getBookings({ role: 'parent' })` trả về đúng đơn vừa tạo với trạng thái `awaiting_commitment`.
2. **Test Case 2 (Mobile -> Web)**:
   - CarePartner mở Mobile app xác nhận cam kết nhận việc (`POST /api/matching/bookings/<id>/commit/`).
   - Mở Web Phụ huynh vào trang "Việc của tôi" (`/parent/tasks/`) hoặc chi tiết đơn (`/don/<id>/`): Xác nhận trạng thái hiển thị đúng `committed` ("Đã khóa lịch hẹn").
3. **Test Case 3 (Huỷ / Đổi lịch 2 chiều)**:
   - Thử nghiệm thao tác huỷ hoặc đổi lịch từ một phía, kiểm tra phía còn lại nhận đúng trạng thái và thông báo.

---

## PHẦN 5: BỘ TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA)

Trước khi coi là hoàn thành nhiệm vụ, coding agent phải tự kiểm tra và đạt 100% các tiêu chí sau:

- [ ] **AC 1: Loại bỏ dữ liệu cũ trên Web**: Trang "Việc của tôi" (`parent_tasks.html`) và "Trang chủ" (`parent_home.html`) không còn load dữ liệu cũ hay mock từ `core.Task`. Toàn bộ dữ liệu hiển thị lấy từ `GET /api/matching/bookings/?role=parent` và `GET /api/matching/jobs/`.
- [ ] **AC 2: Đồng bộ 2 chiều Web ↔ Mobile**: Việc tạo từ Web hiển thị ngay trên Mobile; thao tác cập nhật trạng thái từ Mobile lập tức phản ánh trên Web khi tải lại trang.
- [ ] **AC 3: Không lộ đường dẫn API**: Tuyệt đối không còn chuỗi `API /api/...`, `#radarPayloadPreview`, hay text kỹ thuật nào hiển thị trên giao diện người dùng.
- [ ] **AC 4: Xử lý triệt để lỗi "User not found"**: Không bao giờ để văng popup raw `"User not found"`. Khi token 401, tự động xóa sạch `localStorage`, thông báo tiếng Việt lịch sự và redirect về trang `/login/?next=...`.
- [ ] **AC 5: 100% địa bàn Thành phố Huế**: Không còn bất kỳ từ khóa nào về Hà Nội, TP.HCM, Bách Khoa, Ngoại Thương, Chu Văn An, Thụy Khuê, Landmark 81. Tọa độ mặc định chuẩn `16.4637, 107.5909`.
- [ ] **AC 6: Bảo toàn thiết kế Web**: Sidebar 260px cố định (`_parent_sidebar.html`) được giữ nguyên vẹn trên tất cả các trang phụ huynh. Không bóp méo giao diện Web để bắt chước giao diện mobile.
- [ ] **AC 7: Kiểm thử hệ thống không lỗi**:
  - `python manage.py check` trả về `System check identified no issues (0 silenced)`.
  - Các script test regression và E2E parity chạy thành công.
- [ ] **AC 8: Commit và Push lên `main`**:
  - Thực hiện trên nhánh `main`.
  - Commit message bằng **Tiếng Việt**.
  - Push lên `origin/main` để kích hoạt Render auto-deploy.
