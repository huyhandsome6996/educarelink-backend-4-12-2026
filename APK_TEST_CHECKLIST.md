# APK Test Checklist — `feature/module-an-toan-carepartner`

> **Branch**: `feature/module-an-toan-carepartner`
> **Build**: v1.1.0 (versionCode 2) — internal test APK
> **Target**: Android device thật (không emulator)
> **Mục tiêu**: Verify module an toàn CarePartner hoạt động đúng trước khi merge PR.

## Cài đặt

1. Tải file APK từ link Expo dashboard hoặc GitHub Release.
2. Trên điện thoại Android: Settings → Security → bật "Install unknown apps"
   cho browser/file manager đang dùng.
3. Mở file `.apk` → Cài đặt → Mở app.
4. Đăng nhập với tài khoản test:
   - Phụ huynh: `phuhuynh_test` / `Demo@2026`
   - Sinh viên (CarePartner): `sinhvien_test` / `Demo@2026`

## Test Cases

### 1. Cài đặt & mở app bình thường

- [ ] App cài đặt thành công (không lỗi "App not installed").
- [ ] App mở ra màn Login (không crash, không đen màn).
- [ ] Icon app hiển thị đúng (logo EduCareLink màu cam).
- [ ] Splash screen hiện trong ~1s rồi chuyển sang Login.

### 2. Âm thanh báo động tuỳ chỉnh (emergency_alarm.wav)

**Setup**: Phụ huynh có 1 task in_progress với CarePartner (sinhvien_test).
CarePartner app chạy nền (background hoặc killed).

- [ ] CarePartner tắt máy / tắt mạng → sau 60s, phụ huynh nhận push
  notification "CarePartner đã mất kết nối".
- [ ] Âm thanh `emergency_alarm.wav` phát đúng khi app phụ huynh đang ở
  background (kể cả khi điện thoại để chế độ Rung / Im lặng — vì channel
  `emergency-alerts` bypass DnD).
- [ ] Push notification hiển thị đúng trên lock screen (không bị thu gọn
  thành "EduCareLink: 1 thông báo mới").

**Verify critical flag**:
- [ ] Payload push phải có `data.critical === true` (kiểm tra bằng ADB
  logcat nếu có dev access, hoặc chỉ verify hành vi — còi to + không tắt
  được bằng nút volume).

### 3. Push notification khi app killed hoàn toàn

- [ ] Phụ huynh app swipe-up kill hoàn toàn (không còn trong Recent Apps).
- [ ] CarePartner tắt máy → 60s sau, phụ huynh nhận push notification trên
  system tray (Android hiện notification từ hệ thống, không cần app chạy).
- [ ] Tap notification → mở app → vào màn hình LiveTracking của task
  tương ứng.

### 4. Modal xác minh ngẫu nhiên (RandomVerificationModal)

**Setup**: Task in_progress > 5 phút (để trigger random check, interval
config: 5-10 phút).

- [ ] CarePartner nhận push "Xác minh an toàn" + modal hiện trong app.
- [ ] Modal KHÔNG đóng được bằng nút Back (hardware back button) — chỉ
  đóng khi nhập PIN đúng hoặc timeout.
- [ ] Nhập PIN đúng (4-digit) → modal đóng, show success message.
- [ ] Nhập PIN sai 3 lần → modal chuyển sang alert "Sai PIN quá nhiều
  lần" → notify parent.
- [ ] Không nhập PIN trong 90s (RESPOND_TIMEOUT) → modal tự đóng, status
  = `timeout` → notify parent + admin.

### 5. Setup PIN lần đầu

**Test cho cả 2 loại tài khoản**:

#### 5a. Email/password account (sinhvien_test)

- [ ] Vào Profile → Setup Verification PIN.
- [ ] Modal yêu cầu `current_password` (password đăng nhập).
- [ ] Nhập password đúng + PIN mới (4 digit) + confirm PIN → save OK.
- [ ] Nhập password sai → lỗi "Mật khẩu hiện tại không đúng" + KHÔNG save.

#### 5b. Google/Facebook OAuth account

- [ ] Đăng nhập bằng Google (nếu có tài khoản test).
- [ ] Vào Profile → Setup Verification PIN.
- [ ] Modal KHÔNG yêu cầu `current_password` (chỉ yêu cầu PIN mới + confirm).
- [ ] Nhập PIN mới + confirm → save OK.

### 6. Offline location queue

**Setup**: CarePartner đang tracking 1 task in_progress.

- [ ] Tắt mạng (airplane mode hoặc tắt WiFi + 4G) khi đang tracking.
- [ ] App tiếp tục thu thập GPS → lưu vào SQLite local queue.
- [ ] Bật lại mạng → app tự sync queue lên backend theo đúng thứ tự thời
  gian (oldest first).
- [ ] Verify trên admin dashboard: thấy N điểm GPS mới với `recorded_at`
  tăng dần theo thời gian thực, không phải theo thời gian sync.

**Test isolation** (chạy song song 2 task):

- [ ] CarePartner accept 2 task in_progress cùng lúc (nếu test data cho phép).
- [ ] Tắt mạng → bật mạng → verify điểm GPS của 2 task KHÔNG trộn lẫn
  (mỗi điểm có `task_id` đúng, không có điểm của task A xuất hiện trong
  LiveTracking của task B).

### 7. Tương thích ngược (3 kịch bản từ QA-FIX-7)

#### 7a. App cũ (build từ main) + backend mới (branch này)

- [ ] Cài APK cũ (v1.1.0 hoặc cũ hơn) trên 1 device.
- [ ] Backend đã deploy branch này.
- [ ] CarePartner app cũ tắt máy → 60s sau, phụ huynh (cũng app cũ) nhận
  cảnh báo offline (vì `data.type='device_offline'` match logic app cũ).
- [ ] Âm thanh cảnh báo mặc định (không có `emergency_alarm.wav` vì app
  cũ chưa có plugin) — Vibration + sound default.

#### 7b. App mới (build từ branch) + backend cũ (main)

- [ ] Cài APK mới (branch này) trên 1 device.
- [ ] Backend chưa deploy branch (vẫn main).
- [ ] CarePartner app mới tắt máy → phụ huynh (app mới) nhận cảnh báo
  offline (vì backend cũ set `data.type='device_offline'`).
- [ ] App mới check `data.critical === true` → backend cũ không set →
  fallback chỉ Vibration (không playEmergencyAlarm). KHÔNG crash.

#### 7c. App mới + backend mới

- [ ] Cài APK mới trên 1 device.
- [ ] Backend đã deploy branch này.
- [ ] CarePartner tắt máy → 60s sau, phụ huynh nhận cảnh báo offline.
- [ ] `data.type='device_offline'` + `data.critical=true` →
  playEmergencyAlarm (còi to) + channel `emergency-alerts` (bypass DnD).

## Báo cáo lỗi

Nếu test case nào FAIL:

1. Chụp screenshot màn hình lỗi.
2. Ghi lại thời gian + device model + Android version.
3. Nếu có dev access: chạy `adb logcat -v time | grep -E "EduCareLink|ReactNativeJS"`
   để capture JS console logs.
4. Tạo issue trên GitHub tracker với label `safety`, `mobile`, `branch:
   feature/module-an-toan-carepartner`.

## Lưu ý

- **KHÔNG test submit lên Google Play Store** — branch này chỉ build APK
  nội bộ, không liên quan Play Console.
- **Backend phải đã deploy branch này** trước khi test case 7c (app mới +
  backend mới). Nếu chưa deploy, test case 7c sẽ fail vì backend chưa có
  field `critical=True` trong payload.
- **Cron Job Render phải config env vars** (xem `README_RENDER_CRON_SETUP.md`)
  trước khi test case 2, 3, 4 — nếu không scheduler không chạy, không có
  alert offline gửi đi.
