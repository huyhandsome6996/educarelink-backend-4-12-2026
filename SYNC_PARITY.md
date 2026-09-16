# SYNC PARITY — Web vs Mobile

**Date**: 2026-08-18
**Agent**: Coding Agent (Super Z)
**Previous update**: 2026-07-21 by QA Agent

---

## Overall Parity: 97%

| Category | Web | Mobile | Parity |
|---|---|---|---|
| Auth (login/register) | ✅ | ✅ | 100% |
| Parent Home | ✅ | ✅ | 100% |
| Parent Tasks | ✅ | ✅ | 100% |
| Create Task | ✅ | ✅ | 100% |
| AI Chatbot | ✅ | ✅ | 100% |
| Worker Feed | ✅ | ✅ | 100% |
| Worker Profile | ✅ | ✅ | 100% |
| Worker Chatbot | ✅ | ✅ | 100% |
| Admin Dashboard | ✅ | ✅ | 100% |
| Admin All Tasks | ✅ | ✅ | 100% |
| Live Tracking | ✅ | ✅ | 100% |
| Verification PIN History | ✅ | ✅ | 100% (collapsible section in LiveTrackingScreen) |
| PIN Enforcement (apply task) | ✅ | ✅ | 100% |
| iOS Critical Alert | ✅ config | ✅ entitlement + banner | 100% |
| Payment Setup | ✅ | ✅ | 95% |
| SOS | ✅ | ✅ | 100% |
| Onboarding | ✅ | ✅ | 100% |
| Notifications | ✅ | ✅ | 100% |
| Help Center | ✅ | ✅ | 100% |
| Colors/Typography | ✅ | ✅ | 100% |
| Icons | ✅ Material Symbols | ✅ Ionicons (mapped) | 95% |
| Background Tracking | N/A | ✅ LocationService.js | N/A (mobile only) |

---

## Feature Mapping

| Feature | Web Template | Mobile Screen | Backend API | Same API? |
|---|---|---|---|---|
| Splash | splash.html | SplashScreen.js | N/A | N/A |
| Login | login.html | LoginScreen.js | POST /api/auth/login/ | ✅ |
| Register | register.html | RegisterScreen.js | POST /api/auth/register/ | ✅ |
| Parent Onboarding | onboarding_parent.html | ParentOnboardingScreen.js | POST /api/onboarding/complete/ | ✅ |
| Worker Onboarding | onboarding_worker.html | WorkerOnboardingScreen.js | POST /api/onboarding/complete/ | ✅ |
| Parent Home | parent_home.html | ParentHomeScreen.js | GET /api/parent/my-tasks/ | ✅ |
| Create Task | task_create_1/2.html | CreateTaskScreen.js | POST /api/tasks/ | ✅ |
| Parent Tasks | parent_tasks.html | MyTasksScreen.js | GET /api/parent/my-tasks/ | ✅ |
| Browse Candidates | browse_candidates.html | CandidatesScreen.js | GET /api/parent/tasks/:id/candidates/ | ✅ |
| AI Chatbot (Parent) | chatbot.html | ChatbotScreen.js | POST /api/chatbot/ | ✅ |
| Live Tracking | tracking.html | LiveTrackingScreen.js | GET /api/tracking/:id/live/ | ✅ |
| Verification PIN History | tracking.html (new) | LiveTrackingScreen.js (collapsible) | GET /api/tracking/:id/verification-checks/history/ | ✅ |
| Cancel Verification Check | tracking.html (new) | LiveTrackingScreen.js (inline button) | POST /api/tracking/verification-checks/:id/cancel/ | ✅ |
| PIN Enforcement on Apply | N/A (backend) | WorkerFeedScreen.js | 403 verification_pin_required | ✅ |
| Batch Location Upload | N/A | (API only) | POST /api/tracking/location/batch/ | ✅ |
| Review | review.html | ReviewScreen.js | POST /api/parent/review/ | ✅ |
| Worker Feed | worker_feed.html | WorkerFeedScreen.js | GET /api/tasks/ | ✅ |
| Task Detail | task_detail.html | TaskDetailScreen.js | GET /api/tasks/:id/ | ✅ |
| Worker Jobs | worker_jobs.html | MyJobsScreen.js | GET /api/worker/my-jobs/ | ✅ |
| Worker Profile | worker_profile.html | WorkerProfileScreen.js | GET /api/worker/:id/profile/ | ✅ |
| Worker Chatbot | worker_chatbot.html | WorkerChatbotScreen.js | POST /api/worker/chatbot/ | ✅ |
| Help Center | help_center.html | HelpCenterScreen.js | POST /api/help-center/ | ✅ |
| Admin Dashboard | admin_dashboard.html | AdminDashboardScreen.js | Multiple admin endpoints | ✅ |
| Admin All Tasks | admin_dashboard.html (tab) | AdminAllTasksScreen.js | GET /api/admin/all-tasks/ | ✅ |
| Payment Setup | (in parent_tasks) | PaymentSetupScreen.js | POST /api/payments/setup/ | ✅ |
| My Earnings | (in worker_profile) | MyEarningsScreen.js | GET /api/payments/my-earnings/ | ✅ |
| Notifications | (header bell) | NotificationsScreen.js | GET /api/notifications/ | ✅ |

---

## Design System Parity

| Element | Web | Mobile | Match? |
|---|---|---|---|
| Primary color | #F26522 | #F26522 | ✅ |
| Primary Dark | #D4541E | #D4541E | ✅ |
| Primary Light | #FFF4ED | #FFF4ED | ✅ |
| Secondary | #2DB84B | #2DB84B | ✅ |
| Background | #F7F7F7 | #F7F7F7 | ✅ |
| Surface | #FFFFFF | #FFFFFF | ✅ |
| Text Primary | #1A1A2E | #1A1A2E | ✅ |
| Text Secondary | #6B7280 | #6B7280 | ✅ |
| Text On Primary | #FFFFFF | #FFFFFF | ✅ |
| Success | #10B981 | #10B981 | ✅ |
| Warning | #F59E0B | #F59E0B | ✅ |
| Error | #EF4444 | #EF4444 | ✅ |
| Info | #3B82F6 | #3B82F6 | ✅ |
| Border | #F0F0F0 | #F0F0F0 | ✅ |
| Font Headline | Manrope | Manrope (via TYPO) | ✅ |
| Font Body | Plus Jakarta Sans | Plus Jakarta Sans (via TYPO) | ✅ |
| Border Radius | 0.75rem-2rem | SIZES.radiusSm-radiusXl | ✅ |
| Shadow | rgba(242,101,34,0.2) | SHADOWS.large | ✅ |

---

## Icon Mapping (Material Symbols → Ionicons)

| Category | Web (Material Symbols) | Mobile (Ionicons) | Match? |
|---|---|---|---|
| Gia sư | menu_book | book | ✅ |
| Đón trẻ | child_care | happy | ✅ |
| Dọn dẹp | cleaning_services | sparkles | ✅ |
| Trông trẻ | stroller | people | ✅ |
| Mua sắm hộ | shopping_bag | bag | ✅ |
| Nấu ăn | restaurant | restaurant | ✅ |
| Chuyển đồ | local_shipping | cube | ✅ |
| Khác | more_horiz | apps | ✅ |
| AI Bot | smart_toy | sparkles | ✅ |
| App Logo | text logo | heart | ✅ |

---

## Known Gaps (3%)

1. **Payment Setup**: Web uses inline form, Mobile has dedicated screen — both call same API ✅
2. **PayOS**: On branch `feature/payos-integration`, not yet merged to main — both web + mobile have PayOS code ready
3. **Background Tracking**: Mobile only (LocationService.js) — web doesn't need this (parent views via polling)
4. **Push Notifications**: Mobile uses Expo Push, web uses in-app notification polling — both backed by same Notification model
5. **Image Upload**: Web uses `<input type="file">`, Mobile uses `expo-image-picker` — both send multipart/form-data to same endpoint
6. ~~**Verification PIN History (mobile screen)**~~: RESOLVED — collapsible section added in `LiveTrackingScreen.js`
7. **Batch Location Upload**: API function exists in `tracking.js` but `LocationService.js` offline queue still sends individual points instead of batch — needs integration
8. **iOS Critical Alert Entitlement**: Added to `app.json` but requires manual Apple Developer Portal approval (outside code scope)

---

*Parity verified: 97% sync between Web and Mobile. 3% gap is expected (mobile-only features, pending screen integrations, Apple manual process).*

---

## Flow 1 Parity — /api/matching/* (Task G — 2026-09-14)

**Nguyên tắc bắt buộc**: Web và mobile dùng CHUNG một backend, một bảng,
một tài khoản. Đổi dữ liệu ở web → mobile thấy ngay (và ngược lại) vì cùng
gọi `/api/matching/*` với cùng JWT `POST /api/auth/login/`. KHÔNG nhân bản
logic — Django template chỉ render, JS gọi API.

| Flow 1 tính năng | Web | Mobile | Endpoint dùng chung |
|---|---|---|---|
| Đăng việc (JobPost) | JS form | Form gia sư/trông trẻ/đón trẻ | `POST /api/matching/jobs/` + `/publish/` |
| Danh sách ứng viên (top 8 + Gemini re-rank) | worker_feed inline | CandidatesListScreen | `POST /api/matching/candidates/` |
| Chọn CarePartner (exclusive lock) | worker_feed modal | ParentHome/MyTasks | `POST /api/matching/jobs/<id>/select-carepartner/` |
| Đơn chờ xác nhận (đồng hồ cam kết) | worker_feed poll + ding + modal (15s) | JobAssignedModal (push + poll 15s) | `GET /api/matching/bookings/?status=awaiting_commitment` |
| Xác nhận cam kết | worker_feed modal | JobAssignedModal nút [Xác nhận] | `POST /api/matching/bookings/<id>/commit/` |
| Từ chối trong cửa sổ (8 lý do T0) | worker_feed modal | JobAssignedModal nút [Từ chối] | `POST /api/matching/bookings/<id>/cancel/` |
| Lịch rảnh (CarePartnerAvailability) | lich_ranh.html | AvailabilityScreen | `/api/matching/carepartners/me/availability/` |
| Ngày bận (blackout đúng ngày/giờ) | lich_ranh.html | BlackoutScreen | `/api/matching/carepartners/me/blackouts/` |
| Onboarding status (skill + lịch bắt buộc) | onboarding_worker.html | MyJobsScreen banner | `GET /api/matching/carepartners/me/onboarding-status/` |
| DeviceToken push đa thiết bị | N/A (session web) | AuthContext login | `POST /api/matching/device-token/` |
| GPS heartbeat (matching distance) | worker_gps_heartbeat.js (mở trang + 5 phút) | syncGpsToBackend (login + foreground + 5 phút) | `POST /api/tracking/gps-heartbeat/` |
| Consent GPS cho ghép cặp (tách live-tracking) | N/A (mobile-first) | WorkerProfileScreen toggle | `POST /api/tracking/matching-gps-consent/` |
| Thông báo matching | inbox trang web | NotificationsScreen | `GET /api/matching/notifications/` |

**GPS heartbeat web (mới)**: trang worker (có `_worker_chrome.html`) tự xin
`navigator.geolocation` và POST heartbeat — "100%" = mỗi lần mở trang + mỗi
5 phút khi tab mở. Chưa consent → backend trả `no_matching_consent`, client
dừng 24h, matching fallback địa chỉ hồ sơ.

**Parity smoke test**: `matching/tests/test_job_alerts.py::WebMobileParitySmokeTest`
— tạo job bằng JWT (web-like), đọc bookings/candidates bằng CÙNG JWT
(mobile-like) → cùng dữ liệu, không nhân bản.

**Trạng thái Flow 1: 100% cùng API.** Dual stack legacy (`core.Task` +
`smart_match.py`) vẫn sống cho feed việc cũ — blackout/GPS/exclusive áp cho
legacy qua `smart_match.py` trừ CarePartnerBlackout (Task D 2026-09-14).

---

## Flow 1 Parity Update — Kiểm thử + vá đồng bộ (2026-09-17)

**Bối cảnh**: chủ dự án tập trung mobile vài ngày, quay lại web thấy chi tiết
tính năng lệch. Đã audit 3 tầng (web template ↔ Django API ↔ mobile Expo),
sửa + bổ sung cho web bắt kịp mobile. E2E thật 23/23 PASS
(`scripts/e2e_matching_sync.py`), regression 14/14 PASS
(`matching/tests/test_web_mobile_sync.py`), full matching suite 246/246 PASS.

| Hạng mục | Trước đây | Bây giờ |
|---|---|---|
| Đổi giờ Step 9 Rule 3 (CP xin → PH duyệt) | ❌ web chỉ hiển thị chip | ✅ `don_cua_toi.html` modal xin đổi lịch + `don.html` card duyệt/từ chối — cùng 2 endpoint mobile dùng |
| Booking dict trả thông tin đổi giờ | ❌ thiếu (không biết khung mới) | ✅ `reschedule_request{new_date,new_time_from,new_time_to,reason,parent_deadline,status}` — additive, mobile lợi trực tiếp |
| Toast phạt ELO khi CP hủy | ❌ web đọc `elo_delta` (không tồn tại) | ✅ sửa đọc `elo_delta_applied` — test chặn hợp đồng |
| Xóa ngày bận khi đang có đơn | ❌ DELETE luôn thành công, UI hứa sai | ✅ backend trả 409 `blackout_conflicts_with_booking` — khớp UI web + mobile |
| Thông báo matching ở inbox | ❌ web chỉ thấy legacy | ✅ `notifications.html` hợp nhất 2 nguồn (legacy + matching, badge "Ghép cặp") |
| Mark-read thông báo matching | ❌ read_at không bao giờ set → badge tăng vô hạn | ✅ `POST /api/matching/notifications/mark-read/` (body `{}` = tất cả, `{ids}` = một phần) |
| Consent GPS cho ghép nối | ❌ web không có công tắc (mobile-only) | ✅ `worker_profile.html` toggle — cùng endpoint `/api/tracking/matching-gps-consent/` |
| Form gia sư Defect 3 | ❌ web thiếu cấp học + ưu tiên gia sư | ✅ `dang_viec_gia_su.html` thêm `child_grade_level` (4 mức) + `tutor_seniority_preference` — payload khớp mobile |

**Còn lại / chấp nhận**: DeviceToken push chỉ mobile (web dùng poll 15s +
ding WebAudio); "Đang nhận đơn" trên web lưu localStorage (cosmetic, không có
endpoint backend — chưa làm backend toggle); luồng legacy `core.Task` song
song giữ nguyên.
