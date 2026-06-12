# Nhật Ký Hoạt Động Cập Nhật Dự Án Educarelink

Dưới đây là tài liệu ghi chú lại toàn bộ các công việc, các file đã chỉnh sửa, lệnh đã chạy và ý nghĩa của chúng trong đợt cập nhật tính năng **"Quản lý Bằng cấp & Chứng chỉ cho Carepartner"**.

---

## Chủ đề 1: Mở rộng Cơ sở dữ liệu (Database) lưu trữ Bằng cấp
- **Công việc đã làm:** Thêm các trường lưu trữ ảnh chứng chỉ và danh sách bằng cấp vào mô hình người dùng gốc của Backend.
- **Ý nghĩa:** Cho phép hệ thống lưu trữ lâu dài thông tin xác minh học vấn của sinh viên vào cơ sở dữ liệu, giúp phụ huynh an tâm hơn khi chọn người, và Admin có chỗ để lưu trữ.
- **File / Folder thao tác:**
  - Chỉnh sửa `core/models.py`: Thêm cột `certificate_photo` (dạng ảnh - ImageField) và `qualifications` (dạng mảng - JSONField) vào class `User`.
  - Chỉnh sửa `core/serializers.py`: Đưa các trường này vào `UserSerializer` để API có thể đọc/ghi dữ liệu này.
- **Lệnh Terminal đã sử dụng:**
  1. `python manage.py makemigrations`
     - *Tác dụng:* Quét các file `models.py` xem có gì thay đổi không, và tự động tạo ra một file kịch bản (nằm ở `core/migrations/0003_...`) để hướng dẫn database cách cập nhật các cột mới.
  2. `python manage.py migrate`
     - *Tác dụng:* Thực thi kịch bản ở trên để thực sự can thiệp vào cấu trúc Database (thêm cột mới vào bảng SQL).

---

## Chủ đề 2: Cập nhật luồng đăng ký trên Mobile App
- **Công việc đã làm:** Bổ sung ô tải ảnh "Bằng cấp/Chứng chỉ" ở màn hình Đăng ký của Sinh viên.
- **Ý nghĩa:** Thu thập ngay thông tin thẻ sinh viên/bằng cấp lúc họ vừa tạo tài khoản để quy trình xét duyệt của Admin ở bước sau được nhanh chóng.
- **File / Folder thao tác:**
  - Chỉnh sửa `mobile/src/screens/Auth/RegisterScreen.js`: Code thêm nút bấm (gọi thư viện Camera/Gallery) để tải ảnh chứng chỉ. Cập nhật hàm `register` để truyền file đi.
  - Chỉnh sửa `mobile/src/api/auth.js`: Chỉnh sửa cục `FormData` (gói hàng chứa dữ liệu gửi đi) trong hàm `register` để nhét thêm file ảnh chứng chỉ vào gửi lên Backend.

---

## Chủ đề 3: Tối ưu trang Hồ sơ Sinh viên (Mobile App)
- **Công việc đã làm:** Cho phép sinh viên xem được toàn bộ bằng cấp đã duyệt, xem đánh giá của phụ huynh và chủ động cập nhật lại ảnh bằng cấp bất cứ lúc nào.
- **Ý nghĩa:** Giúp sinh viên có quyền chủ động quản lý hồ sơ năng lực của mình, tăng trải nghiệm người dùng (UX) trên App.
- **File / Folder thao tác:**
  - Chỉnh sửa `mobile/src/screens/Worker/WorkerProfileScreen.js`: 
    - Render danh sách bằng cấp thật (được lấy từ database). 
    - Code cho nút "Cập nhật chứng chỉ" gọi API đẩy ảnh mới lên.
    - Sửa lỗi thư viện ảnh (fix warning `MediaTypeOptions`).
  - Chỉnh sửa `mobile/src/navigation/AppNavigator.js`: Đưa giao diện `CandidateProfileScreen` (Giao diện hồ sơ công khai) vào ngăn xếp (Stack) của Worker, để sinh viên có thể tự xem hồ sơ của chính mình.
  - Chỉnh sửa `core/views.py` (Backend): Chỉnh API `WorkerProfileDetailAPIView` để trả về danh sách `qualifications` thật thay vì chữ cứng (mock data).

---

## Chủ đề 4: Xây dựng Modal Quản lý Bằng cấp trên Admin Dashboard
- **Công việc đã làm:** Thiết kế một Modal (bảng nổi) tuỳ chỉnh trên web PC. Khi Admin bấm vào tên sinh viên, Modal sẽ hiện lên chứa TOÀN BỘ ảnh xác minh (có thể click phóng to) kèm theo ô nhập liệu để Admin gõ chữ.
- **Ý nghĩa:** Thay thế bảng hỏi (`prompt`) mặc định của trình duyệt web vì nó che mất màn hình. Modal mới giúp Admin vừa có thể trực tiếp nhìn ảnh thực tế của sinh viên, vừa gõ chữ dễ dàng và chính xác, tăng tốc độ kiểm duyệt.
- **File / Folder thao tác:**
  - Chỉnh sửa `frontend/templates/frontend/admin_dashboard.html`: Code CSS vẽ `.edit-modal`, viết Javascript hàm `openEditModal()` hiện bảng, truyền API để cập nhật bằng cấp.
  - Chỉnh sửa `core/views.py` (Backend): Thêm điều kiện `action == 'update_qualifications'` trong logic API để Backend hiểu và lưu danh sách chứng chỉ mà Admin vừa gõ.
- **Lệnh Git (Terminal) đã sử dụng sau mỗi bước làm việc:**
  1. `git add .` (hoặc tên file cụ thể)
     - *Tác dụng:* Đưa các file vừa code vào danh sách "chuẩn bị lưu".
  2. `git commit -m "nội dung cập nhật"`
     - *Tác dụng:* Đóng gói các file đó thành một điểm khôi phục (phiên bản) và dán nhãn ghi chú rõ ràng (ví dụ: "fix image picker").
  3. `git push origin main`
     - *Tác dụng:* Tải toàn bộ mã nguồn vừa cập nhật lên kho lưu trữ đám mây (GitHub) để lưu trữ an toàn và đồng bộ với các thành viên khác.

---

## Chủ đề 5: Tích hợp hệ thống Push Notification (Thông báo thời gian thực)
- **Công việc đã làm:** Thêm tính năng thông báo rung chuông như Messenger/Zalo khi một Phụ huynh "Chấp nhận" một sinh viên vào làm việc.
- **Ý nghĩa:** Giúp sinh viên (Carepartner) nhận được tin nhắn báo hỷ ngay lập tức trên điện thoại mà không cần phải mở app ra check liên tục, tăng tính chuyên nghiệp của hệ thống.
- **File / Folder thao tác:**
  - `core/models.py` & `core/serializers.py`: Thêm cột `expo_push_token` để lưu mã định danh điện thoại của người dùng.
  - `core/views.py`: Viết code trong hàm `ApproveCandidateAPIView` để gọi API đẩy thông báo của máy chủ Expo thẳng xuống thiết bị.
  - `mobile/App.js` & `mobile/src/utils/notifications.js`: Cài đặt thư viện `expo-notifications`, xin quyền cấp thông báo từ người dùng.
  - `mobile/src/context/AuthContext.js`: Cập nhật tự động lấy mã Token khi sinh viên đăng nhập và gửi lên Backend.
