# Prompt 15 — Tích hợp Mobile (React Native/Expo): Form, Lịch, Booking, Ví, Thông báo

## Context
Backend Flow 1 đã đủ API (Prompt 05-12). Prompt này nối toàn bộ vào app Expo SDK 54 hiện có (`mobile/`), giữ phong cách code + theme hiện tại (`mobile/src/theme/colors.js`, screens trong `mobile/src/screens/{Parent,Worker}/`). Nguyên tắc: UI 100% tiếng Việt theo `flow1-step1-additional-details.md` + Step 3/4/8; chỉ nối hệ MỚI (jobs/bookings), KHÔNG xóa màn hình hệ Task cũ (vẫn dùng song song).

## Requirements (nguồn spec)
- Step 1 + additional-details: 3 form đăng việc với ĐỦ label/helper/placeholder/options tiếng Việt; date/time picker (không gõ tay), map picker (search + vị trí hiện tại + ghim tay); validate end > start, cấm ngày quá khứ; rate VND/h > 0.
- Step 3: CandidateListScreen (Prompt 08 đã dựng khung — prompt này nối API thật + hoàn thiện Book flow).
- Step 4 + 9: màn "Khai báo lịch rảnh" (7 ngày, multi-window, cảnh báo trúng đơn), "Ngày không thể nhận việc" (calendar blackout + reason), khóa window có đơn (icon + "Đang có đơn - không thể sửa. Hãy hủy đơn nếu cần.").
- Step 5: màn chi tiết booking với ĐẾM NGƯỢC commitment window (seconds_left), nút Hủy có chọn lý do (8 mã 5.3 + note ≥20 ký tự + upload evidence ≤3 file 5MB), nút Bắt đầu/Kết thúc, trạng thái label VI.
- Step 6: màn "Tín nhiệm" (band label + 10 sự kiện không số + hint).
- Step 7: màn Ví credit (số dư + lịch sử), màn Kháng cáo (tạo + xem trạng thái).
- Step 8: đăng ký Android channel `educarelink_critical` (MAX, sound critical_alert.wav, vibration [0,500,300,500,300,500]) khi app start; foreground Android tự play sound bằng expo-av + haptics khi nhận critical; inbox mới `/api/v2/notifications/` + badge; đăng ký DeviceToken khi login.
- AC Step 8.1: push critical kêu trên Android THẬT khi app background/killed — bắt buộc test thiết bị thật.

## Acceptance Criteria
1. `mobile/src/api/matching.js` (mới) bao đủ endpoint mới: form-schema, jobs CRUD, matching/candidates, bookings (select/start/complete/cancel/reschedule/appeal/review/dispute), availability+blackouts, trust, wallet/credit, v2 notifications, devices/tokens — dùng cùng axios instance hiện có (`mobile/src/api/`), tự gắn header `Idempotency-Key` (uuid) cho POST select/cancel.
2. `JobPostingWizardScreen` (mới, thay vai trò luồng mới của CreateTask): bước 1 chọn 1 trong 3 loại (3 card icon), bước 2 form động render theo `GET /api/jobs/form-schema` (không hardcode label), bước 3 review + submit. Validate client khớp backend; lỗi 400 map field→hiện dưới input.
3. Map picker: dùng `react-native-maps` (đã có trong dự án? kiểm tra `package.json` — nếu chưa thì thêm dependency + `app.json` plugin config, API key từ app config hiện có); có nút "Dùng vị trí hiện tại" + search box (geocode qua endpoint `/api/geocode/` sẵn có).
4. `WorkerAvailabilityScreen` nâng cấp: đa window/ngày + nút "+ Thêm khung giờ" + validate overlap cảnh báo merge + khóa xóa khi 409 (hiện lock + message) + màn blackout mới `BlackoutDatesScreen` (calendar, chọn cả ngày/khoảng giờ, 6 lý do).
5. `BookingDetailScreen` (mới): countdown timer commitment (khi awaiting_commitment), các action theo trạng thái (Hủy trong window = "Từ chối đơn"; sau committed = "Hủy đơn" với sheet 8 lý do + note + evidence picker), nút Bắt đầu (chỉ CP, khi committed & tới giờ ± sớm), Kết thúc, Đánh giá (rating sao + comment), Kháng cáo link khi có penalty.
6. Cancel sheet: 8 lý do ĐÚNG nhãn tiếng Việt Step 5.3; chọn force_majeure → note bắt buộc min 20 ký tự (đếm ký tự hiển thị); evidence: ImagePicker/PDF max 3 file 5MB (nếu vượt → toast lỗi).
7. Notifications: `src/services/notifications.js` — register channel lúc app start (ĐÚNG spec §8.4), handler foreground play `critical_alert.wav` qua expo-av + `expo-haptics.notificationAsync`, deep-link theo `data.type` → màn tương ứng (booking detail/job detail); `NotificationsScreen` nâng cấp gọi v2 API + badge unread; register token sau login (sửa `AuthContext`/login flow hiện có).
8. Sound asset: `mobile/assets/sounds/critical_alert.wav` tồn tại (nếu thiếu → tạo asset âm báo 2-3s bản quyền tự do HOẶC đánh dấu TODO và dùng channel mặc định — KHÔNG để payload trỏ file không tồn tại gây crash Expo).
9. Màn "Tín nhiệm" + "Ví của tôi" + "Kháng cáo" theo AC của từng prompt backend (labels không số ELO).
10. Điều hướng: Parent stack thêm JobPostingWizard/CandidateList/BookingConfirm/BookingDetail; Worker stack thêm Availability nâng cấp/Blackout/BookingDetail/Tín nhiệm; deep-link config cho push.
11. Không crash với API 409/400 — mọi lỗi có message tiếng Việt hiển thị (toast/banner) lấy từ `error.response.data.code` → mapping message file `src/utils/errorMessages.js` (mới).
12. QA checklist thiết bị thật: Android vật lý — killed app nhận critical push có sound; foreground có sound + vibration; iOS — nhận push (sound theo policy silent switch, ghi nhận known limit).

## Technical Approach
- Thư viện: giữ stack hiện có (check `package.json`): @react-navigation, axios, expo-notifications, expo-av, expo-haptics, expo-image-picker, react-native-maps (thêm nếu thiếu), date-fns hoặc dayjs cho countdown (dùng TZ Asia/Ho_Chi_Minh).
- State: theo pattern hiện có (`mobile/src/context/`); KHÔNG thêm redux.
- Style: COLORS/SHADOWS/SIZES/TYPO từ theme; hardcode hex bị cấm (code review).
- API base URL: dùng config hiện có (`mobile/src/api/client.js` hoặc tương tự — kiểm tra).
- Điều phối: mỗi screen 1 commit riêng, commit message tiếng Việt.

## Code References
- Spec: step1-additional-details (toàn bộ nhãn), step3, step4, step5 §5.3, step6 §6.7, step7 §7.9, step8 §8.4.
- Sửa/tạo trong `mobile/src/`: `api/matching.js`, `screens/Parent/{JobPostingWizardScreen,CandidateListScreen (nối API),BookingConfirmScreen,BookingDetailScreen}`, `screens/Worker/{BookingDetailScreen,TrustScreen,BlackoutDatesScreen}`, `screens/shared/{WalletScreen,AppealScreen}`, `services/notifications.js`, `utils/{matchingLabels,errorMessages}.js`, navigation stacks, `NotificationsScreen`.
- Tham chiếu pattern: `screens/Parent/SmartMatchesScreen.js`, `screens/Worker/WorkerAvailabilityScreen.js`, `screens/Parent/CreateTaskScreen.js`, `screens/NotificationsScreen.js`.

## Testing Checklist
- Đăng job 3 loại E2E trên thiết bị: form đúng nhãn VI, picker hoạt động, map chọn được, submit → job xuất hiện "Việc của tôi".
- Candidate list 6 trạng thái (mock 0/1/8/12/47).
- Chọn CP → countdown chạy đúng seconds_left từ API; hết giờ → status chuyển committed (poll/refresh).
- Hủy trong window với lý do FM thiếu note → chặn; đủ → thành công + status label đúng.
- CP nhận push critical khi app killed (thiết bị Android thật) → sound phát, deep-link mở đúng màn booking.
- Lịch rảnh: thêm/sửa/xóa window; gặp 409 → khóa + thông báo; blackout tạo + hiện calendar.
- Ví: hủy T2 phía CP → parent thấy +10% credit trong ví + lịch sử.
- Badge unread đúng sau đọc.
- Không dùng màn hệ cũ Task cho luồng mới (kiểm tra navigation không trỏ nhầm).

## Edge Cases
- Countdown khi máy đổi giờ/t reconnect → resync từ API mỗi khi foreground.
- Push đến khi đang ở đúng màn booking → KHÔNG navigate lại (dedupe theo booking_id + timestamp).
- File evidence >5MB chặn trước khi upload (kiểm tra size client).
- Map bị từ chối quyền vị trí → fallback chọn tay + message hướng dẫn.
- Màn hình android back giữa wizard → confirm mất dữ liệu (Dialog "Bạn muốn lưu bản nháp?").

## Dependencies
- Backend Prompt 05-12 merged trên branch; Prompt 08 (candidate screen khung); sound asset; thiết bị Android thật cho QA sound.
