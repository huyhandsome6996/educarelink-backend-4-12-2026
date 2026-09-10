# PROMPT DÀNH CHO CODING AGENT: KIỂM THỬ CHỨC NĂNG TOÀN DIỆN DỰ ÁN, TỰ SỬA LỖI TRÊN MAIN, RESET DỮ LIỆU MẪU ĐA DẠNG VÀ DEPLOY APP CH PLAY MỚI

> **Mục tiêu tối thượng:**
> 1. Hoạt động và xử lý trực tiếp trên nhánh `main` (`educarelink-backend-4-12-2026`).
> 2. **Xoá sạch và tái thiết lập toàn bộ cơ sở dữ liệu mẫu (Seed Data)** phong phú, bao quát 100% các tình huống thực tế, kịch bản nghiệp vụ, mọi loại trạng thái đơn hàng, lịch rảnh, ngày bận, ví tiền và khiếu nại.
> 3. **Tự động kiểm thử toàn diện:** Tự kiểm thử, tìm lỗi và tự sửa dứt điểm mọi lỗi phát sinh ở cả **Backend Django**, **Web Frontend**, và **Mobile App React Native**.
> 4. **Kiểm tra kỹ lưỡng luồng ghép nối thông minh Flow 1:** Từ lúc phụ huynh đăng việc, AI ghép cặp, CarePartner nhận thông báo và xác nhận cam kết trong 15 phút, bắt đầu ca làm, chia sẻ vị trí GPS, hoàn thành giải ngân ví, đến hủy đơn đền bù và kháng cáo ELO.
> 5. **Build và Deploy bản phát hành mới của App Mobile lên Google Play Store (CH Play)** thông qua công cụ EAS Build / Google Play Console.
>
> **Lưu ý tiên quyết:** Mọi thông tin, quyền hạn và công cụ cần thiết cho việc deploy đã được chuẩn bị đầy đủ trong môi trường. Nhiệm vụ của bạn là tập trung thực thi chính xác, quyết liệt, tự kiểm thử tỉ mỉ và báo cáo kết quả hoàn thành. Toàn bộ commit phải viết bằng **Tiếng Việt**.

---

## 1. GIAI ĐOẠN 1: RESET DATABASE VÀ TẠI LẬP DỮ LIỆU MẪU TOÀN DIỆN (COMPREHENSIVE SEED DATA)

### 1.1. Reset Cơ sở Dữ liệu Sạch Sẽ
1. Xóa file database cục bộ SQLite: `db.sqlite3`.
2. Xóa các file cache nếu có: `__pycache__`.
3. Chạy lại toàn bộ hệ thống migrations:
   ```bash
   python manage.py migrate
   ```
4. Kiểm tra hệ thống đảm bảo 0 lỗi:
   ```bash
   python manage.py check
   ```

---

### 1.2. Nâng Cấp và Chạy Script Seed Data Đa Dạng
Cập nhật file `seed_data.py` (hoặc `core/management/commands/seed_demo_data.py`) để sinh bộ dữ liệu mẫu khổng lồ, bao gồm tất cả các tình huống sau:

#### A. Danh mục dịch vụ chuẩn (Service Categories):
- **Gia sư học tập (`tutoring`):** Dạy kèm Toán, Tiếng Anh, Tiếng Việt, Luyện thi.
- **Đưa đón bé (`pickup`):** Đón trẻ tan học từ trường về nhà hoặc sang lớp học thêm.
- **Trông trẻ tại nhà (`childcare`):** Giữ bé mầm non, chơi trò chơi phát triển trí tuệ.

#### B. Tài khoản Phụ huynh (Parent Accounts - Tối thiểu 5 tài khoản đa dạng):
- `parent_lan`: Chị Mai Lan (Quận 1, TP.HCM) — Đã nạp 2.000.000đ vào ví ký quỹ, đã đăng 3 công việc.
- `parent_huong`: Chị Thu Hương (Cầu Giấy, Hà Nội) — Số dư 1.500.000đ, có 2 con đang cần gia sư.
- `parent_long`: Anh Trần Long (Quận 7, TP.HCM) — Cần đón bé hàng ngày từ trường Quốc tế Nam Sài Gòn.
- `parent_linh`: Chị Khánh Linh (TP. Thủ Đức) — Cần trông trẻ cuối tuần.
- `parent_minh`: Anh Quang Minh (Hoàn Kiếm, Hà Nội) — Tài khoản mới, vừa tạo ca nháp.
- *Mật khẩu chung cho tài khoản demo:* `Demo@2026`.

#### C. Tài khoản CarePartner (Worker Accounts - Tối thiểu 10 tài khoản đa dạng thứ hạng & trạng thái):
- `worker_minhanh`: Nguyễn Minh Anh — Sinh viên ĐH Ngoại Thương, **Hạng Vàng · ELO 1.250**, CCCD & Bằng khen đã duyệt, tỷ lệ hoàn thành 99%, chuyên môn Gia sư Tiếng Anh (IELTS 8.0).
- `worker_hoangnam`: Lê Hoàng Nam — Sinh viên ĐH Sư Phạm TDTT, **Hạng Kim Cương · ELO 1.420**, có xe máy riêng kèm bằng lái A1 đã đối soát, chuyên môn Đón trẻ an toàn.
- `worker_thao`: Trần Phương Thảo — Giáo viên mầm non, **Hạng Bạc · ELO 1.100**, chuyên môn Trông trẻ mầm non.
- `worker_duc`: Phạm Minh Đức — Sinh viên Bách Khoa, **Hạng Đồng · ELO 980**, mới tham gia nền tảng.
- `worker_quynh`: Vũ Quỳnh Chi — Đang có 1 đơn bị phạt trừ ELO do hỏng xe, đang nộp đơn kháng cáo.
- `worker_pending`: Hồ sơ mới nộp, CCCD đang chờ Admin duyệt (`is_approved=False`).
- `worker_rejected`: Bằng cấp bị từ chối kèm ghi chú của Admin.
- Thêm 3 CarePartner khác phân bố đều tại các quận huyện của Hà Nội và TP.HCM để thuật toán khoảng cách địa lý hoạt động chính xác.

#### D. Lịch Rảnh Làm Việc (Availability Windows) & Khai Báo Ngày Bận (Blackout Dates):
- Tạo lịch rảnh cố định tuần cho các CarePartner:
  - `worker_minhanh`: Rảnh tối Thứ 2, Thứ 4, Thứ 6 (18:00 – 21:00) và Chiều Thứ 7 (14:00 – 18:00).
  - `worker_hoangnam`: Rảnh các khung giờ tan học chiều (16:00 – 18:30) từ Thứ 2 đến Thứ 6.
  - `worker_thao`: Rảnh cả ngày Thứ 7 và Chủ Nhật (08:00 – 17:00).
- Tạo 2 trường hợp **Ngày bận đột xuất** (`Blackout Dates`):
  - 1 CarePartner bận thi học kỳ vào thứ 5 tuần tới để kiểm tra xem hệ thống có loại trừ khỏi danh sách ghép cặp hay không.

#### E. Bài Đăng Tuyển (Job Posts) Bao Quát Mọi Trạng Thái:
1. **Trạng thái Nháp (`draft`):** Phụ huynh đang soạn dở đơn trông trẻ.
2. **Trạng thái Đang tìm CarePartner (`matching` / `published`):** Đơn Gia sư vừa đăng, đang chạy thuật toán ghép tự động.
3. **Trạng thái Đã chọn người (`carepartner_selected`):** Đã tìm thấy ứng viên hàng đầu, đang chờ CarePartner cam kết.
4. **Trạng thái Đang thực hiện (`in_progress`):** Đơn đón trẻ đang chạy Live GPS.
5. **Trạng thái Hoàn thành (`completed`):** Đơn gia sư đã kết thúc, đã thanh toán và có đánh giá 5 sao.
6. **Trạng thái Đã hủy (`cancelled`):** Đơn bị hủy do phụ huynh đổi lịch.

#### F. Đơn Ghép Cặp (Bookings - Bao quát 100% kịch bản kiểm thử):
1. **Đơn Chờ Cam Kết Mới Tinh (`awaiting_commitment`):** Còn 14 phút đếm ngược, hiển thị banner khẩn cấp trên `/don-cua-toi/`.
2. **Đơn Chờ Cam Kết Sắp Hết Hạn (`awaiting_commitment`):** Còn đúng 2 phút đếm ngược để kiểm tra phản ứng của đồng hồ và xử lý timeout.
3. **Đơn Đã Cam Kết (`committed`):** Đã khóa lịch cho ngày mai, hiển thị số điện thoại phụ huynh và nút mở Google Maps.
4. **Đơn Đang Làm Việc (`in_progress`):** Đang phát Live GPS, có tọa độ di chuyển mẫu, hiển thị nút [Xác nhận trả bé] và nút [SOS].
5. **Đơn Hoàn Thành Xuất Sắc (`completed`):** Đã giải ngân 80% tiền vào ví CarePartner, 20% hoa hồng sàn, có đánh giá 5 sao kèm phản hồi.
6. **Đơn Bị Hủy Phạt ELO Đang Trong Hạn Kháng Cáo (`cancelled_by_carepartner`):** Bị trừ 30 ELO, hiển thị nhãn *⚖️ Kháng cáo còn 5 ngày* kèm nút dẫn sang `/khang-cao/{id}/`.
7. **Đơn Vi Phạm Không Đến (`no_show`):** Bị phạt đền bù ví tín dụng 50.000đ cho phụ huynh.

#### G. Ví Tiền, Ký Quỹ & Giao Dịch:
- Tạo các bản ghi biến động số dư: Nạp tiền ví MoMo, Ký quỹ ca làm, Giải ngân tiền công 80%, Thu phí nền tảng 20%, Đền bù hủy ca.

---

## 2. GIAI ĐOẠN 2: KIỂM THỬ BACKEND & THUẬT TOÁN GHÉP CẶP (BACKEND QA)

1. **Chạy toàn bộ Backend Test Suites:**
   ```bash
   python manage.py test
   ```
   *Yêu cầu:* 100% tests phải PASS (bao gồm `matching`, `core`, `payments`, `tracking`, `moderation`).

2. **Kiểm tra nghiệp vụ Thuật toán Matching (Matching Engine QA):**
   - **Khoảng cách địa lý:** Kiểm tra công thức Haversine tính toán khoảng cách km giữa vị trí CarePartner và điểm đón/nhà phụ huynh.
   - **Xung đột ca làm (Slot Conflict):** Kiểm tra xem hệ thống có ngăn chặn việc ghép đơn trùng giờ hoặc vi phạm khoảng nghỉ tối thiểu 90 phút giữa 2 ca làm khác nhau hay không.
   - **Cơ chế Soft Lock & Hard Lock:** Khi CarePartner được đề xuất, khung giờ rảnh phải được Soft Lock (300s); khi cam kết nhận đơn chuyển thành Hard Lock; khi hủy đơn phải Release Lock ngay lập tức.
   - **Timeout Cam kết:** Kiểm tra Scheduler quét đơn `awaiting_commitment` quá 15 phút -> tự động hủy, trừ điểm ELO và kích hoạt tìm CarePartner thay thế (`needs_replacement`).

3. **Kiểm tra phân quyền & bảo mật API:**
   - Mọi endpoint `/api/...` phải yêu cầu JWT Token hợp lệ (ngoại trừ các endpoint public như login/register).
   - CarePartner không thể xem thông tin đơn ghép cặp của CarePartner khác.
   - Phụ huynh không thể tự ý xác nhận hoàn thành đơn của phụ huynh khác.

---

## 3. GIAI ĐOẠN 3: KIỂM THỬ TRẢI NGHIỆM WEB FRONTEND (WEB QA)

1. **Kiểm thử Luồng Phụ huynh (Parent Portal):**
   - Truy cập `/parent/`: Kiểm tra Action Hub, các thẻ thống kê trạng thái bấm được để lọc, Trust banner.
   - Truy cập `/dang-viec/`: Chọn 3 loại việc (Gia sư, Đón trẻ, Trông trẻ), form nhập liệu mượt mà, gợi ý giá tự động.
   - Truy cập `/parent/tasks/`: Xem danh sách đơn đã đăng, trạng thái ứng viên, chi tiết đơn.
   - Truy cập `/vi-tien/`: Nạp tiền thử nghiệm, xem lịch sử biến động số dư.

2. **Kiểm thử Luồng CarePartner (Worker Portal):**
   - Truy cập `/worker/`: Bảng tin việc làm, trạng thái sẵn sàng nhận đơn.
   - Truy cập `/lich-ranh/`: Bảng ma trận lịch tuần, thêm khung giờ mới, kiểm tra cảnh báo trùng giờ và gợi ý gộp khung giờ.
   - Truy cập `/don-cua-toi/`:
     - Kiểm tra Banner Khẩn Cấp có hiển thị đồng hồ đếm ngược chính xác hay không.
     - Bấm thử nút `[⚡ Cam kết nhận đơn]` -> Kiểm tra Modal cam kết -> Xác nhận -> Đơn chuyển sang tab `Đã cam kết`.
     - Bấm thử nút `[Từ chối]` -> Kiểm tra Modal hỏi lý do.
     - Bấm nút `[Kháng cáo ngay →]` trên đơn bị phạt -> Dẫn đúng sang `/khang-cao/{id}/`.
     - Kiểm tra bộ lọc Tab trạng thái (có badge đếm số) và ô tìm kiếm.
   - Truy cập `/ngay-ban/`: Khai báo ngày nghỉ đột xuất thành công.

3. **Kiểm tra hiển thị giao diện (Layout & UI Polish):**
   - Kiểm tra trên Desktop (Sidebar 260px cố định, không giật layout shift khi chuyển trang).
   - Kiểm tra trên Mobile Responsive (Header nhỏ gọn, thanh điều hướng đáy 5 tab dễ thao tác).
   - Kiểm tra Console trình duyệt (`F12`), loại bỏ toàn bộ lỗi 404 ảnh/font hoặc lỗi JavaScript unhandled rejection.

---

## 4. GIAI ĐOẠN 4: KIỂM THỬ TRẢI NGHIỆM MOBILE APP REACT NATIVE (MOBILE QA)

1. **Chạy Bộ Kiểm Thử Tự Động Mobile:**
   Chạy lệnh kiểm thử trong thư mục `mobile/`:
   ```bash
   cd mobile
   npm test -- --watchAll=false
   ```
   *Yêu cầu:* Toàn bộ 6 test suites và 74+ tests phải đạt **100% PASS**.

2. **Kiểm thử 3 Form Đăng Việc với Bản Đồ Mới (Leaflet WebView):**
   - Kiểm tra `TutoringForm.js`, `ChildcareForm.js`, `PickupForm.js`:
     - Bản đồ nhúng Leaflet OpenStreetMap (Carto Voyager tiles) hiển thị sắc nét, có ghim định vị màu cam.
     - Chạm vào bản đồ để đổi vị trí tức thì.
     - Bấm nút `[⛶ Phóng to]` mở `MapPickerModal` toàn màn hình kéo thả mượt mà.
     - Tìm kiếm địa điểm bằng thanh tìm kiếm geocoding proxy.
     - Nút định vị GPS hiện tại lấy đúng tọa độ.
     - **Hoàn toàn triệt tiêu các ô TextInput nhập Latitude/Longitude thô gây tràn viền, mờ nhòe.**

3. **Kiểm thử Điều Hướng & Trải Nghiệm Màn Hình:**
   - `ParentHomeScreen`: Hero chào mừng, thống kê đơn, danh sách việc gần đây, thanh điều hướng đáy 5 tab với nút AI nổi bật ở giữa.
   - `JobTypeSelectScreen`: 3 thẻ dịch vụ lớn bấm mượt mà sang 3 form tương ứng.
   - `MyTasksScreen`: Danh sách việc, tab lọc trạng thái, tìm kiếm.
   - `BookingDetailScreen`: Chi tiết ca làm, thông tin CarePartner, nút liên hệ và đánh giá.
   - `ParentProfileScreen` & `WalletScreen`: Hoạt động trơn tru.

4. **Quét và Sửa Dứt Điểm Các Cảnh Báo Icon:**
   - Rà soát toàn bộ các file `.js` trong `mobile/src/`, thay thế các tên icon không hợp lệ trong thư viện Ionicons (ví dụ: `radar-outline` -> `radio-outline`, `shield-lock` -> `shield-checkmark`, `person-search-outline` -> `search-outline`).

---

## 5. GIAI ĐOẠN 5: BUILD VÀ DEPLOY BẢN PHÁT HÀNH MỚI LÊN CH PLAY (GOOGLE PLAY STORE)

Sau khi toàn bộ hệ thống đã được kiểm thử hoàn hảo và dữ liệu mẫu đã sẵn sàng, tiến hành quy trình đóng gói và phát hành ứng dụng lên Google Play Store:

### 5.1. Cập Nhật Phiên Bản Ứng Dụng Trong `mobile/app.json`
- Mở `mobile/app.json`, nâng số phiên bản:
  - `version`: Nâng từ `1.4.2` lên `1.4.3` (hoặc `1.5.0`).
  - `android.versionCode`: Tăng thêm 1 đơn vị (ví dụ: từ `25` lên `26`).
- Đảm bảo các quyền (permissions) cần thiết đã được khai báo:
  - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (cho bản đồ và định vị GPS).
  - `CAMERA`, `READ_EXTERNAL_STORAGE` (cho xác thực CCCD và ảnh minh chứng).
  - `NOTIFICATIONS` (cho push notification).

### 5.2. Kiểm Tra Cấu Hình EAS Build (`mobile/eas.json`)
- Đảm bảo `mobile/eas.json` có profile `production`:
  ```json
  {
    "cli": { "version": ">= 12.0.0" },
    "build": {
      "production": {
        "android": {
          "buildType": "app-bundle"
        }
      }
    },
    "submit": {
      "production": {
        "android": {
          "serviceAccountKeyPath": "./google-services-key.json",
          "track": "internal"
        }
      }
    }
  }
  ```

### 5.3. Thực Hiện Lệnh Build Android App Bundle (.aab)
Di chuyển vào thư mục `mobile/` và thực thi lệnh build production:
```bash
npx eas build --platform android --profile production --non-interactive
```
*(Nếu build trên máy tính cục bộ, có thể dùng `npx eas build --platform android --profile production --local`)*.

### 5.4. Thực Hiện Lệnh Deploy Lên Google Play Console
Sau khi file `.aab` được build thành công:
```bash
npx eas submit --platform android --latest --non-interactive
```
Hoặc tải file `.aab` được sinh ra và tải lên trực tiếp bản phát hành trong Google Play Console (Internal Testing / Production track).

---

## 6. QUY TRÌNH COMMIT & BÁO CÁO KẾT QUẢ

1. **Commit mã nguồn trên nhánh `main`:**
   Mọi thay đổi trong quá trình sửa lỗi, tối ưu dữ liệu mẫu và chuẩn bị deploy phải được commit với thông điệp rõ ràng bằng **Tiếng Việt**, ví dụ:
   ```bash
   git add .
   git commit -m "fix(qa): hoan tat kiem thu toan dien backend web mobile, tai lap du lieu mau va chuan bi deploy chplay"
   git push origin main
   ```
2. **Báo cáo tổng kết (Deliverables):**
   - Kết quả chạy backend tests (số lượng tests, thời gian chạy, trạng thái OK).
   - Kết quả chạy mobile unit tests (74/74 tests PASS).
   - Danh sách các tài khoản và dữ liệu mẫu đã được seed vào database.
   - Trạng thái build và deploy App Bundle lên Google Play Store (mã build, link artifact hoặc xác nhận submit thành công).
