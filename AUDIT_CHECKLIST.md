# 📋 AUDIT CHECKLIST — EduCareLink Backend

> **Mục đích file này**: Checklist chi tiết để 1 coding agent khác audit toàn bộ dự án EduCareLink, đảm bảo 100% tính năng user yêu cầu từ đầu đến giờ đã được implement hoàn hảo.
>
> **Cách dùng**:
> 1. Đọc file này từ trên xuống dưới
> 2. Mỗi mục có: **Yêu cầu gốc** + **File cần kiểm** + **Cách test** + **Expected result**
> 3. Đánh dấu ✅ nếu pass, ❌ nếu fail, ⚠️ nếu cần xem lại
> 4. Cuối file có section **TỔNG KẾT** để điền kết quả audit
>
> **Repo**: `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
> **Branch audit**: `main` (commit mới nhất `29d1801` tính đến lúc tạo file)
> **Production URL**: `https://educarelink-backend.onrender.com`
> **Demo accounts**: `admin`/`Demo@2026`, `phuhuynh_test`/`Demo@2026`, `sinhvien_test`/`Demo@2026`

---

## 🎯 TỔNG QUAN DỰ ÁN

**EduCareLink** — nền tảng kết nối Phụ huynh với Carepartner (sinh viên) cho các dịch vụ: gia sư, đón trẻ, dọn dẹp, trông trẻ, nấu ăn, mua sắm.

**Tech stack**:
- Backend: Django 5.2 + DRF + SimpleJWT + PostgreSQL (production) / SQLite (dev)
- Frontend web: Django Templates + Tailwind CSS + vanilla JS
- Mobile: React Native (Expo SDK 54)
- AI: Google Gemini (gemini-2.5-flash-lite + fallback chain)
- Payment: MoMo Pay App v2 (escrow + cash settlement)
- Deploy: Render.com (free tier)

**2 vai trò chính**:
- **Parent (Phụ huynh)**: đăng ký tự động approved, đăng việc, duyệt ứng viên, đánh giá, thanh toán
- **Worker (Carepartner)**: đăng ký cần admin duyệt (CCCD + selfie), tìm việc, ứng tuyển, nhận tiền, khiếu nại

---

## 📦 PHẦN 1: TÍNH NĂNG CỐT LÕI (CORE)

### 1.1 Auth & User Management

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 1.1.1 | Đăng ký phụ huynh (auto-approved) | `core/views.py:RegisterAPIView` | POST `/api/auth/register/` body `{"username":"test_p","password":"Demo@2026","role":"parent","email":"p@t.com","phone_number":"0900000001"}` → 201, `status:approved` | ⬜ |
| 1.1.2 | Đăng ký carepartner (chờ admin duyệt) | `core/views.py:RegisterAPIView` | POST `/api/auth/register/` với role=worker + upload CCCD → 201, `status:pending_approval` | ⬜ |
| 1.1.3 | Đăng nhập bằng username/password | `core/views.py:LoginAPIView` | POST `/api/auth/login/` → 200 + JWT tokens | ⬜ |
| 1.1.4 | Login bằng Google OAuth | `core/oauth_views.py:GoogleOAuthAPIView` | POST `/api/auth/google/` body `{"access_token":"..."}` → 200 + JWT | ⬜ |
| 1.1.5 | Login bằng Facebook OAuth | `core/oauth_views.py:FacebookOAuthAPIView` | POST `/api/auth/facebook/` body `{"access_token":"..."}` → 200 + JWT | ⬜ |
| 1.1.6 | OAuth config endpoint (trả client_id) | `core/oauth_views.py:OAuthConfigAPIView` | GET `/api/auth/oauth-config/` → 200 `{"google":{"enabled":...},"facebook":{...}}` | ⬜ |
| 1.1.7 | Parent upgrade lên carepartner | `core/oauth_views.py:UpgradeToCarepartnerAPIView` | POST `/api/auth/upgrade-carepartner/` với CCCD + selfie → 200 | ⬜ |
| 1.1.8 | Check upgrade status | `core/oauth_views.py:UpgradeStatusAPIView` | GET `/api/auth/upgrade-status/` → 200 | ⬜ |
| 1.1.9 | Profile get/patch | `core/views.py:UserProfileAPIView` | GET/PATCH `/api/profile/` → 200 | ⬜ |
| 1.1.10 | JWT refresh + rotate + blacklist | `backend/settings.py:SIMPLE_JWT` | POST `/api/auth/token/refresh/` → 200 new tokens, old refresh bị blacklist | ⬜ |
| 1.1.11 | Carepartner chưa approved không login được | `core/views.py:LoginAPIView` | Login với worker pending → 403 `pending_approval` | ⬜ |

### 1.2 Task Management (Công việc)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 1.2.1 | Parent đăng việc | `core/views.py:TaskListCreateAPIView` | POST `/api/tasks/` body đủ fields → 201 | ⬜ |
| 1.2.2 | List tất cả tasks (cho worker feed) | `core/views.py:TaskListCreateAPIView` | GET `/api/tasks/` → 200 array | ⬜ |
| 1.2.3 | Task detail | `core/views.py:TaskDetailAPIView` | GET `/api/tasks/<id>/` → 200 | ⬜ |
| 1.2.4 | Parent update task status (completed/cancelled) | `core/views.py:TaskUpdateStatusAPIView` | PATCH `/api/tasks/<id>/status/` body `{"status":"completed"}` → 200 | ⬜ |
| 1.2.5 | Parent list my-tasks | `core/views.py:ParentTasksAPIView` | GET `/api/parent/my-tasks/` → 200 | ⬜ |
| 1.2.6 | Parent list candidates của task | `core/views.py:TaskCandidatesAPIView` | GET `/api/parent/tasks/<task_id>/candidates/` → 200 | ⬜ |
| 1.2.7 | Parent approve 1 ứng viên | `core/views.py:ApproveCandidateAPIView` | POST `/api/parent/applications/<id>/approve/` → 200, task → in_progress | ⬜ |
| 1.2.8 | Parent review sau completed | `core/views.py:ReviewCreateAPIView` | POST `/api/parent/review/` → 201 | ⬜ |
| 1.2.9 | Worker apply task (có geofence → consent) | `core/views.py:ApplyTaskAPIView` | POST `/api/worker/tasks/<id>/apply/` body `{"consent_tracking":true}` → 201 | ⬜ |
| 1.2.10 | Worker list my-jobs | `core/views.py:WorkerJobsAPIView` | GET `/api/worker/my-jobs/` → 200 | ⬜ |
| 1.2.11 | Worker profile detail | `core/views.py:WorkerProfileDetailAPIView` | GET `/api/worker/<id>/profile/` → 200 với avg_rating, reviews | ⬜ |
| 1.2.12 | Geofence fields (lat/lng/radius) | `core/models.py:Task` | Check model có `geofence_lat`, `geofence_lng`, `geofence_radius` | ⬜ |

### 1.3 Notifications

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 1.3.1 | List notifications | `core/views.py:UserNotificationsAPIView` | GET `/api/notifications/` → 200 | ⬜ |
| 1.3.2 | Unread count | `core/views.py:UnreadNotificationCountAPIView` | GET `/api/notifications/unread-count/` → 200 | ⬜ |
| 1.3.3 | Mark as read | `core/views.py:MarkNotificationsReadAPIView` | POST `/api/notifications/mark-read/` → 200 | ⬜ |
| 1.3.4 | Admin send notification (broadcast/individual) | `core/views.py:AdminSendNotificationAPIView` | POST `/api/admin/send-notification/` body `{"send_to_all":true,"title":"...","message":"..."}` → 200 | ⬜ |
| 1.3.5 | Expo push notification khi approve ứng viên | `core/views.py:ApproveCandidateAPIView` | Approve → worker nhận push (check `send_expo_push_notification` được gọi) | ⬜ |

### 1.4 Onboarding & Credential

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 1.4.1 | Complete onboarding (set first_login=false) | `core/views.py:CompleteOnboardingAPIView` | POST `/api/onboarding/complete/` → 200 | ⬜ |
| 1.4.2 | Worker submit credential (bằng cấp) | `core/views.py:WorkerSubmitCredentialAPIView` | POST `/api/worker/submit-credential/` FormData → 201 | ⬜ |
| 1.4.3 | Worker list credentials đã gửi | `core/views.py:WorkerSubmitCredentialAPIView` | GET `/api/worker/submit-credential/` → 200 | ⬜ |
| 1.4.4 | Worker profile change request | `core/views.py:WorkerProfileChangeRequestAPIView` | POST `/api/worker/profile-change-request/` → 201 | ⬜ |
| 1.4.5 | Worker list profile change requests | `core/views.py:WorkerProfileChangeRequestAPIView` | GET `/api/worker/profile-change-request/` → 200 | ⬜ |
| 1.4.6 | Admin list credential submissions | `core/views.py:AdminCredentialSubmissionsAPIView` | GET `/api/admin/credential-submissions/` → 200 | ⬜ |
| 1.4.7 | Admin review credential (approve/reject) | `core/views.py:AdminReviewCredentialAPIView` | POST `/api/admin/credential-submissions/<id>/review/` → 200 | ⬜ |
| 1.4.8 | Admin list profile change requests | `core/views.py:AdminProfileChangeRequestsAPIView` | GET `/api/admin/profile-change-requests/` → 200 | ⬜ |
| 1.4.9 | Admin review profile change | `core/views.py:AdminReviewProfileChangeRequestAPIView` | POST `/api/admin/profile-change-requests/<id>/review/` → 200 | ⬜ |

### 1.5 Admin Management

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 1.5.1 | List pending workers | `core/views.py:AdminPendingWorkersAPIView` | GET `/api/admin/pending-workers/` → 200 | ⬜ |
| 1.5.2 | Approve/reject worker | `core/views.py:AdminApproveWorkerAPIView` | POST `/api/admin/workers/<id>/action/` body `{"action":"approve"}` → 200 | ⬜ |
| 1.5.3 | List all workers | `core/views.py:AdminAllWorkersAPIView` | GET `/api/admin/all-workers/` → 200 | ⬜ |
| 1.5.4 | List all users | `core/views.py:AdminAllUsersAPIView` | GET `/api/admin/all-users/` → 200 | ⬜ |
| 1.5.5 | Toggle user active (lock/unlock) | `core/views.py:AdminToggleUserActiveAPIView` | POST `/api/admin/users/<id>/toggle-active/` → 200 | ⬜ |
| 1.5.6 | Revoke carepartner (worker → parent) | `core/views.py:AdminRevokeCarepartnerAPIView` | POST `/api/admin/users/<id>/revoke-carepartner/` → 200 | ⬜ |
| 1.5.7 | Seed demo data | `core/views.py:AdminSeedDemoDataAPIView` | POST `/api/admin/seed-demo-data/` → 200 | ⬜ |
| 1.5.8 | Keepalive stats | `core/views.py:KeepAliveStatsAPIView` | GET `/api/admin/keepalive-stats/` → 200 | ⬜ |

---

## 🤖 PHẦN 2: AI FEATURES (GEMINI)

### 2.1 Chatbot (Parent + Worker + Admin + Help Center)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 2.1.1 | Parent chatbot — chat tự nhiên, có thể tạo task | `core/views.py:ChatbotAPIView` | POST `/api/chatbot/` body `{"message":"Tôi cần gia sư Toán","history":[]}` → 200 type=message hoặc task_created | ⬜ |
| 2.1.2 | Worker chatbot | `core/views.py:WorkerChatbotAPIView` | POST `/api/worker/chatbot/` → 200 | ⬜ |
| 2.1.3 | Admin chatbot với vision (upload ảnh) | `core/views.py:AdminChatbotAPIView` | POST `/api/admin/chatbot/` FormData với `message` + `image` → 200 | ⬜ |
| 2.1.4 | Help center AI | `core/views.py:HelpCenterAPIView` | POST `/api/help-center/` → 200 | ⬜ |
| 2.1.5 | Distance calculation (Haversine + Gemini) | `core/views.py:DistanceCalculationAPIView` | POST `/api/distance/` → 200 | ⬜ |

### 2.2 AI Moderation (Kiểm duyệt + Khiếu nại)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 2.2.1 | Auto-moderate task khi đăng (async) | `moderation/signals.py`, `moderation/services.py:moderate_task` | Tạo task → check `TaskModeration` record được tạo (status pending → approved/rejected/needs_review) | ⬜ |
| 2.2.2 | Moderation không chặn luồng đăng task | `moderation/signals.py` | POST `/api/tasks/` phải trả 201 trong <2s (AI chạy nền) | ⬜ |
| 2.2.3 | Get task moderation status | `moderation/views.py:TaskModerationStatusAPIView` | GET `/api/moderation/task/<id>/` → 200 | ⬜ |
| 2.2.4 | Worker tạo khiếu nại (complaint) | `moderation/views.py:CreateComplaintAPIView` | POST `/api/moderation/complaints/` FormData → 201 | ⬜ |
| 2.2.5 | Worker list khiếu nại của mình | `moderation/views.py:MyComplaintsAPIView` | GET `/api/moderation/complaints/mine/` → 200 | ⬜ |
| 2.2.6 | AI phân tích khiếu nại | `moderation/services.py:analyze_complaint` | Tạo complaint → check `ai_analysis`, `ai_priority`, `ai_suggestion` được populate | ⬜ |
| 2.2.7 | Admin list moderation queue | `moderation/views.py:AdminModerationListAPIView` | GET `/api/moderation/admin/tasks/` → 200 | ⬜ |
| 2.2.8 | Admin override moderation | `moderation/views.py:AdminOverrideModerationAPIView` | POST `/api/moderation/admin/tasks/<id>/override/` → 200 | ⬜ |
| 2.2.9 | Admin re-moderate task | `moderation/views.py:AdminReModerateTaskAPIView` | POST `/api/moderation/admin/tasks/<id>/re-moderate/` → 200 | ⬜ |
| 2.2.10 | Admin list complaints | `moderation/views.py:AdminComplaintListAPIView` | GET `/api/moderation/admin/complaints/` → 200 | ⬜ |
| 2.2.11 | Admin resolve complaint | `moderation/views.py:AdminResolveComplaintAPIView` | POST `/api/moderation/admin/complaints/<id>/resolve/` → 200 | ⬜ |
| 2.2.12 | Admin AI analyze complaint | `moderation/views.py:AdminAIAnalyzeComplaintAPIView` | POST `/api/moderation/admin/complaints/<id>/ai-analyze/` → 200 | ⬜ |

### 2.3 AI Recommendations

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 2.3.1 | Gợi ý việc cho worker | `ai_recommendations/views.py:WorkerRecommendationsAPIView` | GET `/api/ai/recommendations/worker/` → 200 với `recommendations[]` có `match_score`, `reason` | ⬜ |
| 2.3.2 | Gợi ý ứng viên cho parent | `ai_recommendations/views.py:CandidateRecommendationsAPIView` | GET `/api/ai/recommendations/candidates/<task_id>/` → 200 | ⬜ |
| 2.3.3 | Cache 5 phút cho worker recs | `ai_recommendations/services.py:CACHE_TTL_WORKER` | Check code có `cache.set(cache_key, result, CACHE_TTL_WORKER)` | ⬜ |
| 2.3.4 | Fallback khi AI fail | `ai_recommendations/services.py:get_worker_recommendations` | Check code return fallback với `match_score: 50` khi Gemini fail | ⬜ |

### 2.4 ⚡ Gemini Model Fallback Chain (FIX DEPLOYED)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 2.4.1 | Fallback chain 7 model | `performance/gemini_model.py:GEMINI_MODELS_FALLBACK` | Check list có: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-flash-latest`, `gemini-1.5-flash`, `gemini-1.5-flash-latest` | ⬜ |
| 2.4.2 | Helper generate_content_with_fallback | `performance/gemini_model.py` | Check function thử lần lượt, cache working model | ⬜ |
| 2.4.3 | Tất cả 6 chỗ trong core/views.py dùng helper | `core/views.py` | Grep `generate_content_with_fallback` — phải có 6 chỗ | ⬜ |
| 2.4.4 | moderation/services.py dùng helper | `moderation/services.py:_safe_call_gemini` | Check import + call `generate_content_with_fallback` | ⬜ |
| 2.4.5 | ai_recommendations/services.py dùng helper | `ai_recommendations/services.py:_safe_call_gemini` | Check import + call | ⬜ |
| 2.4.6 | keep_alive.py fallback chain | `keep_alive.py` | Check code thử `models_to_try` list | ⬜ |
| 2.4.7 | Chatbot production hoạt động | `https://educarelink-backend.onrender.com/api/chatbot/` | POST → 200 type=message (không phải "Model AI không khả dụng") | ⬜ |
| 2.4.8 | Error message thân thiện khi all models fail | `core/views.py:ChatbotAPIView` except block | Check message "⚙️ Hệ thống AI đang bảo trì" thay vì "Model AI không khả dụng" | ⬜ |

---

## 📍 PHẦN 3: TRACKING & SAFETY (AN TOÀN TRẺ EM)

### 3.1 Live Tracking + Geofence

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 3.1.1 | Carepartner grant consent | `tracking/views.py:GrantConsentAPIView` | POST `/api/tracking/consent/` body `{"task_id":1,"granted":true}` → 200 | ⬜ |
| 3.1.2 | Carepartner revoke consent | `tracking/views.py:RevokeConsentAPIView` | POST `/api/tracking/consent/<task_id>/revoke/` → 200 | ⬜ |
| 3.1.3 | Carepartner update location (mỗi 10s) | `tracking/views.py:UpdateLocationAPIView` | POST `/api/tracking/location/` → 200 | ⬜ |
| 3.1.4 | Parent get live location | `tracking/views.py:LiveLocationAPIView` | GET `/api/tracking/<task_id>/live/` → 200 | ⬜ |
| 3.1.5 | Parent get location history | `tracking/views.py:LocationHistoryAPIView` | GET `/api/tracking/<task_id>/history/` → 200 | ⬜ |
| 3.1.6 | Check consent status | `tracking/views.py:CheckConsentAPIView` | GET `/api/tracking/<task_id>/consent/` → 200 | ⬜ |
| 3.1.7 | Geofence warning khi carepartner rời vùng | `tracking/services.py:update_worker_location` | Check code gọi `_notify_user` với title "🚨🚨🚨 CẢNH BÁO: Carepartner rời vùng an toàn!" | ⬜ |
| 3.1.8 | Geofence radius mặc định 500m | `backend/settings.py:TRACKING_GEOFENCE_RADIUS` | Check `=int(os.environ.get('TRACKING_GEOFENCE_RADIUS', '500'))` | ⬜ |
| 3.1.9 | Clear LiveLocation khi task completed/cancelled | `tracking/signals.py:_clear_tracking_on_task_save` | Check `clear_task_tracking(instance)` được gọi | ⬜ |

### 3.2 SOS (Cả parent + worker)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 3.2.1 | Trigger SOS | `tracking/views.py:SOSCreateAPIView` | POST `/api/tracking/sos/` body `{"task_id":1,"message":"help"}` → 201 | ⬜ |
| 3.2.2 | List SOS alerts | `tracking/views.py:SOSListAPIView` | GET `/api/tracking/sos/<task_id>/` → 200 | ⬜ |
| 3.2.3 | Resolve SOS | `tracking/views.py:SOSResolveAPIView` | POST `/api/tracking/sos/<sos_id>/resolve/` → 200 | ⬜ |
| 3.2.4 | Push notification ngay khi SOS | `tracking/services.py:trigger_sos` | Check `_notify_user` với title "🆘 SOS từ {sender}" | ⬜ |
| 3.2.5 | Worker có nút SOS trong MyJobsScreen | `mobile/src/screens/Worker/MyJobsScreen.js` | Check có `sosBtn` + `sosModal` trong render | ⬜ |
| 3.2.6 | Parent có nút SOS trong LiveTrackingScreen | `mobile/src/screens/Parent/LiveTrackingScreen.js` | Check có `actionSos` button + `handleSOS` function | ⬜ |

### 3.3 ⚡ Device Offline Alert (CHỐNG TẮT MÁY/ĐẬP MÁY) — TÍNH NĂNG AN TOÀN CỐT LÕI

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 3.3.1 | DeviceHeartbeat model | `tracking/models.py:DeviceHeartbeat` | Check fields: `task`, `worker`, `last_seen`, `last_location_lat/lng`, `device_status`, `battery_level`, `app_state`, `network_type`, `offline_detected_at` | ⬜ |
| 3.3.2 | DeviceOfflineAlert model | `tracking/models.py:DeviceOfflineAlert` | Check fields: `task`, `worker`, `heartbeat`, `last_seen`, `last_location_lat/lng`, `status`, `push_sent`, `recovered_at`, `recovery_duration_seconds` | ⬜ |
| 3.3.3 | Migration cho 2 model mới | `tracking/migrations/0002_deviceheartbeat_deviceofflinealert_and_more.py` | Run `python manage.py migrate tracking` → OK | ⬜ |
| 3.3.4 | Carepartner gửi heartbeat mỗi 30s | `tracking/views.py:HeartbeatAPIView` | POST `/api/tracking/heartbeat/` body `{"task_id":1,"latitude":..,"longitude":..,"battery_level":85}` → 200 | ⬜ |
| 3.3.5 | Heartbeat interval setting | `backend/settings.py:TRACKING_HEARTBEAT_INTERVAL` | Check `=30` | ⬜ |
| 3.3.6 | Offline threshold 90s (3 lần miss) | `backend/settings.py:TRACKING_OFFLINE_THRESHOLD` | Check `=90` | ⬜ |
| 3.3.7 | Scheduler check offline mỗi 1 phút | `tracking/offline_scheduler.py:start_offline_scheduler` | Check `IntervalTrigger(minutes=CHECK_INTERVAL_MINUTES)` với `CHECK_INTERVAL_MINUTES=1` | ⬜ |
| 3.3.8 | Scheduler chỉ chạy trên Render | `tracking/offline_scheduler.py` | Check `IS_RENDER = os.environ.get('RENDER', '') == 'true'` | ⬜ |
| 3.3.9 | Khi offline → push priority=high cho parent | `tracking/services.py:check_offline_devices` | Check `_notify_user` với `data.type='device_offline'`, `data.priority='high'`, `data.sound='critical'` | ⬜ |
| 3.3.10 | Khi offline → notify admin | `tracking/services.py:check_offline_devices` | Check `Notification.objects.create(recipient=admin, ...)` | ⬜ |
| 3.3.11 | Khi heartbeat trở lại → auto resolve alert | `tracking/services.py:update_heartbeat` | Check code resolve `active_alerts` + notify "✅ Thiết bị đã online trở lại" | ⬜ |
| 3.3.12 | Parent check device status | `tracking/views.py:DeviceStatusAPIView` | GET `/api/tracking/<task_id>/device-status/` → 200 với `is_offline`, `seconds_since_last_seen`, `active_alerts[]` | ⬜ |
| 3.3.13 | Parent list offline alerts | `tracking/views.py:OfflineAlertsListAPIView` | GET `/api/tracking/<task_id>/offline-alerts/` → 200 | ⬜ |
| 3.3.14 | Admin trigger offline check manual | `tracking/views.py:AdminRunOfflineCheckAPIView` | POST `/api/tracking/admin/run-offline-check/` → 200 | ⬜ |
| 3.3.15 | Clear heartbeat khi task completed/cancelled | `tracking/signals.py` | Check `clear_task_heartbeat(instance)` được gọi cùng `clear_task_tracking` | ⬜ |
| 3.3.16 | Admin overview có heartbeat + alert stats | `tracking/views.py:AdminTrackingOverviewAPIView` | GET `/api/tracking/admin/overview/` → 200 có `device_heartbeats` + `offline_alerts` | ⬜ |
| 3.3.17 | Mobile LocationService gửi heartbeat | `mobile/src/services/LocationService.js` | Check `sendHeartbeatNow()` + `HEARTBEAT_TASK_NAME` + `HEARTBEAT_INTERVAL_MS=30000` | ⬜ |
| 3.3.18 | Mobile background heartbeat task | `mobile/src/services/LocationService.js` | Check `TaskManager.defineTask(HEARTBEAT_TASK_NAME, ...)` | ⬜ |
| 3.3.19 | Mobile AppState listener (heartbeat khi vào nền) | `mobile/src/services/LocationService.js` | Check `AppState.addEventListener('change', ...)` | ⬜ |
| 3.3.20 | Mobile LiveTrackingScreen offline alert banner | `mobile/src/screens/Parent/LiveTrackingScreen.js` | Check `offlineAlertBanner` UI + `triggerAlarmSound()` (Vibration + local notification) | ⬜ |
| 3.3.21 | Mobile device status bar (online/offline + battery) | `mobile/src/screens/Parent/LiveTrackingScreen.js` | Check `deviceStatusBar` UI với `deviceStatusDot`, `batteryBadge` | ⬜ |
| 3.3.22 | Mobile poll device-status mỗi 10s | `mobile/src/screens/Parent/LiveTrackingScreen.js` | Check `DEVICE_STATUS_POLL_MS=10000` + `deviceStatusPollRef` | ⬜ |
| 3.3.23 | Web tracking.html device status bar | `frontend/templates/frontend/tracking.html` | Check `device-status-bar` div + `fetchDeviceStatus()` JS | ⬜ |
| 3.3.24 | Web tracking.html offline alert modal | `frontend/templates/frontend/tracking.html` | Check `showOfflineAlertModal()` + `offline-alert-modal` | ⬜ |
| 3.3.25 | Web tracking.html triggerAlarm khi offline | `frontend/templates/frontend/tracking.html` | Check `triggerAlarm()` được gọi khi `activeAlert.id !== lastOfflineAlertId` | ⬜ |
| 3.3.26 | Render.yaml có env vars offline alert | `render.yaml` | Check `TRACKING_HEARTBEAT_INTERVAL`, `TRACKING_OFFLINE_THRESHOLD`, `TRACKING_OFFLINE_CHECK_ENABLED`, `TRACKING_OFFLINE_CHECK_INTERVAL` | ⬜ |
| 3.3.27 | .env.example có env vars offline alert | `.env.example` | Check same 4 vars | ⬜ |
| 3.3.28 | End-to-end test: simulate offline → alert → recover | `scripts/test_offline_alert.sh` | Run script → 10 steps pass: heartbeat → check → detect → alert → recover | ⬜ |

---

## 💳 PHẦN 4: PAYMENTS (MOMO ESCROW + CASH)

### 4.1 Setup & Flow

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 4.1.1 | Setup payment (momo_escrow / cash) | `payments/views.py:SetupPaymentAPIView` | POST `/api/payments/setup/` body `{"task_id":1,"method":"cash"}` → 200 | ⬜ |
| 4.1.2 | Payment detail | `payments/views.py:PaymentDetailAPIView` | GET `/api/payments/<id>/` → 200 | ⬜ |
| 4.1.3 | List my payments | `payments/views.py:MyPaymentsAPIView` | GET `/api/payments/my/` → 200 | ⬜ |
| 4.1.4 | Worker earnings | `payments/views.py:MyEarningsAPIView` | GET `/api/payments/my-earnings/` → 200 với `total_earned`, `pending_payout`, `cash_commission_owed` | ⬜ |
| 4.1.5 | List settlements | `payments/views.py:SettlementListAPIView` | GET `/api/payments/settlements/` → 200 | ⬜ |
| 4.1.6 | Settlement detail (QR) | `payments/views.py:SettlementDetailAPIView` | GET `/api/payments/settlements/<id>/` → 200 | ⬜ |

### 4.2 MoMo Integration

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 4.2.1 | MoMo client (Pay App v2 + Refund + Transfer) | `payments/momo_client.py` | Check `create_payment`, `query_payment`, `refund_payment`, `transfer_to_wallet` | ⬜ |
| 4.2.2 | HMAC-SHA256 signature | `payments/momo_client.py:_sign_rsa` | Check signature đúng format MoMo v2 | ⬜ |
| 4.2.3 | IPN webhook (verify signature) | `payments/views.py:MomoIPNAPIView` + `payments/momo_client.py:_verify_signature` | POST `/api/payments/momo-ipn/` → 204 | ⬜ |
| 4.2.4 | IPN endpoint không yêu cầu JWT | `payments/views.py:MomoIPNAPIView` | Check `permission_classes=[AllowAny]`, `authentication_classes=[]` | ⬜ |
| 4.2.5 | Return URL redirect | `payments/views.py:MomoReturnAPIView` | GET `/api/payments/momo-return/?orderId=...` → redirect | ⬜ |
| 4.2.6 | Escrow release khi task completed (signal) | `payments/signals.py` + `payments/services.py:release_escrow` | Update task → completed → check `release_escrow` được gọi | ⬜ |
| 4.2.7 | Refund khi task cancelled | `payments/services.py:refund_escrow` | Update task → cancelled (đang held) → check `refund_escrow` | ⬜ |
| 4.2.8 | Commission rate 20% | `backend/settings.py:PAYMENT_COMMISSION_RATE` | Check `=0.20` | ⬜ |
| 4.2.9 | Monthly settlement scheduler | `payments/scheduler.py` | Check CronTrigger day=1, hour=9 (chỉ trên Render) | ⬜ |

### 4.3 Admin Payment Management

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 4.3.1 | Admin payment overview | `payments/views.py:AdminPaymentOverviewAPIView` | GET `/api/payments/admin/overview/` → 200 | ⬜ |
| 4.3.2 | Admin list all payments | `payments/views.py:AdminAllPaymentsAPIView` | GET `/api/payments/admin/all/` → 200 (filter ?status=&method=) | ⬜ |
| 4.3.3 | Admin retry payout | `payments/views.py:AdminRetryPayoutAPIView` | POST `/api/payments/admin/<id>/retry-payout/` → 200 | ⬜ |
| 4.3.4 | Admin regenerate settlement QR | `payments/views.py:AdminRegenerateSettlementQRAPIView` | POST `/api/payments/admin/settlements/<id>/regenerate-qr/` → 200 | ⬜ |
| 4.3.5 | Admin run monthly settlement | `payments/views.py:AdminRunMonthlySettlementAPIView` | POST `/api/payments/admin/run-settlement/` → 200 | ⬜ |
| 4.3.6 | Admin payment logs (audit trail) | `payments/views.py:AdminPaymentLogsAPIView` | GET `/api/payments/admin/logs/` → 200 | ⬜ |
| 4.3.7 | PaymentLog model 18 event types | `payments/models.py:PaymentLog.EVENT_CHOICES` | Check có 18 event types | ⬜ |

---

## 📱 PHẦN 5: MOBILE APP (REACT NATIVE / EXPO)

### 5.1 Auth & Navigation

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 5.1.1 | Login screen | `mobile/src/screens/Auth/LoginScreen.js` | Check render form + handleLogin | ⬜ |
| 5.1.2 | Register screen (có upload CCCD) | `mobile/src/screens/Auth/RegisterScreen.js` | Check `idCardFront/Back`, `selfiePhoto` upload | ⬜ |
| 5.1.3 | AuthContext (login/register/logout/refreshUser) | `mobile/src/context/AuthContext.js` | Check all functions exported | ⬜ |
| 5.1.4 | AppNavigator role-based routing | `mobile/src/navigation/AppNavigator.js` | Check: !user → Splash/Login/Register; first_login → Onboarding; is_staff → Admin; parent → ParentTabs; worker → WorkerTabs | ⬜ |
| 5.1.5 | JWT auto-refresh interceptor | `mobile/src/api/client.js` | Check axios interceptor 401 → refresh → retry | ⬜ |
| 5.1.6 | Token storage (SecureStore) | `mobile/src/utils/storage.js` + `mobile/src/api/client.js` | Check `expo-secure-store` used | ⬜ |

### 5.2 Parent Screens

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 5.2.1 | ParentHomeScreen | `mobile/src/screens/Parent/ParentHomeScreen.js` | Check render + fetch tasks | ⬜ |
| 5.2.2 | CreateTaskScreen (geofence) | `mobile/src/screens/Parent/CreateTaskScreen.js` | Check có geofence lat/lng/radius input | ⬜ |
| 5.2.3 | MyTasksScreen | `mobile/src/screens/Parent/MyTasksScreen.js` | Check tabs (open/in_progress/completed) | ⬜ |
| 5.2.4 | CandidatesScreen (AI recommendations) | `mobile/src/screens/Parent/CandidatesScreen.js` | Check `getCandidateRecommendations` called | ⬜ |
| 5.2.5 | CandidateProfileScreen | `mobile/src/screens/Parent/CandidateProfileScreen.js` | Check render worker profile | ⬜ |
| 5.2.6 | ReviewScreen | `mobile/src/screens/Parent/ReviewScreen.js` | Check star rating + comment | ⬜ |
| 5.2.7 | LiveTrackingScreen (offline alert + SOS) | `mobile/src/screens/Parent/LiveTrackingScreen.js` | Check `offlineAlertBanner`, `deviceStatusBar`, `handleSOS` | ⬜ |
| 5.2.8 | UpgradeToCarepartnerScreen | `mobile/src/screens/Parent/UpgradeToCarepartnerScreen.js` | Check form CCCD upload | ⬜ |
| 5.2.9 | ChatbotScreen (parent) | `mobile/src/screens/ChatbotScreen.js` | Check chat UI + sendChatMessage | ⬜ |
| 5.2.10 | PaymentSetupScreen | `mobile/src/screens/Payment/PaymentSetupScreen.js` | Check chọn momo_escrow / cash | ⬜ |

### 5.3 Worker Screens

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 5.3.1 | WorkerFeedScreen (AI recommendations) | `mobile/src/screens/Worker/WorkerFeedScreen.js` | Check `getWorkerRecommendations` called | ⬜ |
| 5.3.2 | TaskDetailScreen | `mobile/src/screens/Worker/TaskDetailScreen.js` | Check apply button + consent modal | ⬜ |
| 5.3.3 | MyJobsScreen (consent + tracking + SOS) | `mobile/src/screens/Worker/MyJobsScreen.js` | Check `consentModalVisible`, `sosModal`, tracking start/stop | ⬜ |
| 5.3.4 | WorkerProfileScreen (credential + profile change) | `mobile/src/screens/Worker/WorkerProfileScreen.js` | Check `credModalVisible`, `changeModalVisible` | ⬜ |
| 5.3.5 | WorkerChatbotScreen | `mobile/src/screens/Worker/WorkerChatbotScreen.js` | Check chat UI | ⬜ |
| 5.3.6 | ComplaintScreen (tạo khiếu nại) | `mobile/src/screens/Worker/ComplaintScreen.js` | Check form + evidence upload | ⬜ |
| 5.3.7 | MyComplaintsScreen (list khiếu nại đã gửi) | `mobile/src/screens/Worker/MyComplaintsScreen.js` | Check `getMyComplaints` called + render list | ⬜ |
| 5.3.8 | Payment screens (MyEarnings + SettlementDetail) | `mobile/src/screens/Payment/` | Check 2 files exist | ⬜ |

### 5.4 Admin Screens (Mobile)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 5.4.1 | AdminDashboardScreen (quick actions bar) | `mobile/src/screens/Admin/AdminDashboardScreen.js` | Check `QUICK_ACTIONS` array 6 buttons | ⬜ |
| 5.4.2 | AdminChatbotScreen (vision upload) | `mobile/src/screens/Admin/AdminChatbotScreen.js` | Check `pickImage` + FormData send | ⬜ |
| 5.4.3 | AdminPaymentsScreen (overview + retry + settlement) | `mobile/src/screens/Admin/AdminPaymentsScreen.js` | Check tabs overview/payments/logs | ⬜ |
| 5.4.4 | AdminReviewScreen (credentials + profile changes) | `mobile/src/screens/Admin/AdminReviewScreen.js` | Check 2 tabs: credentials / profile_changes | ⬜ |
| 5.4.5 | AdminSendNotificationScreen | `mobile/src/screens/Admin/AdminSendNotificationScreen.js` | Check broadcast / individual mode + worker picker | ⬜ |
| 5.4.6 | AdminTrackingOverviewScreen | `mobile/src/screens/Admin/AdminTrackingOverviewScreen.js` | Check heartbeat stats + keepalive stats | ⬜ |
| 5.4.7 | AdminModerationScreen | `mobile/src/screens/Admin/AdminModerationScreen.js` | Check moderation queue + complaints | ⬜ |
| 5.4.8 | ImagePreviewScreen (full-screen viewer) | `mobile/src/screens/ImagePreviewScreen.js` | Check render image full screen | ⬜ |

### 5.5 Mobile Performance (Cached API)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 5.5.1 | Cache utility (SWR + dedup + backoff) | `mobile/src/utils/cache.js` | Check `cachedFetch`, `LRU eviction`, `exponential backoff` | ⬜ |
| 5.5.2 | Cached API client | `mobile/src/api/cachedClient.js` | Check `cachedApi` object với TTL tiers (SHORT/MEDIUM/LONG/XLONG) | ⬜ |
| 5.5.3 | Cache invalidation helpers | `mobile/src/api/cachedClient.js` | Check `invalidateTasks`, `invalidateNotifications`, etc. | ⬜ |

### 5.6 Mobile API Wrappers

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 5.6.1 | auth.js (login/register/oauth/upgrade) | `mobile/src/api/auth.js` | Check all functions: `login`, `register`, `getProfile`, `updateCertificate`, `getOAuthConfig`, `loginWithGoogle`, `loginWithFacebook`, `upgradeToCarepartner`, `getUpgradeStatus` | ⬜ |
| 5.6.2 | admin.js (full admin API) | `mobile/src/api/admin.js` | Check: `getPendingWorkers`, `workerAction`, `getAllWorkers`, `getAllUsers`, `toggleUserActive`, `revokeCarepartner`, `getPendingCredentials`, `reviewCredential`, `sendNotification`, `getPendingProfileChanges`, `reviewProfileChange`, `seedDemoData`, `sendAdminChatMessage`, `getKeepaliveStats` | ⬜ |
| 5.6.3 | tasks.js | `mobile/src/api/tasks.js` | Check: `getAllTasks`, `getTaskDetail`, `createTask`, `updateTaskStatus`, `getMyTasksAsParent`, `getCandidates`, `approveCandidate`, `createReview`, `applyTask`, `getMyJobsAsWorker`, `getWorkerProfile`, `sendChatMessage`, `sendWorkerChatMessage`, `sendHelpCenterMessage`, `submitCredential`, `getMyCredentials`, `requestProfileChange`, `getMyProfileChangeRequests`, `updateProfile`, `calculateDistance` | ⬜ |
| 5.6.4 | payments.js | `mobile/src/api/payments.js` | Check: `setupPayment`, `getPaymentDetail`, `getMyPayments`, `getMyEarnings`, `getSettlements`, `getSettlementDetail`, `getPaymentOverview`, `getAllPayments`, `retryPayout`, `regenerateSettlementQR`, `runMonthlySettlement`, `getPaymentLogs`, `checkPaymentHealth` | ⬜ |
| 5.6.5 | tracking.js | `mobile/src/api/tracking.js` | Check: `grantConsent`, `revokeConsent`, `updateLocation`, `getLiveLocation`, `getLocationHistory`, `checkConsent`, `triggerSOS`, `getSOSAlerts`, `resolveSOS`, `getAdminTrackingOverview`, `runOfflineCheck`, `sendHeartbeat`, `getDeviceStatus`, `getOfflineAlerts`, `checkTrackingHealth` | ⬜ |
| 5.6.6 | moderation.js | `mobile/src/api/moderation.js` | Check: `getTaskModeration`, `createComplaint`, `getMyComplaints`, `getModerationQueue`, `overrideModeration`, `reModerateTask`, `getComplaints`, `resolveComplaint`, `aiAnalyzeComplaint`, `checkModerationHealth` | ⬜ |
| 5.6.7 | ai_recommendations.js | `mobile/src/api/ai_recommendations.js` | Check: `getWorkerRecommendations`, `getCandidateRecommendations`, `clearRecommendationsCache` | ⬜ |
| 5.6.8 | notifications.js | `mobile/src/api/notifications.js` | Check: `getNotifications`, `getUnreadCount`, `markNotificationsRead` | ⬜ |
| 5.6.9 | onboarding.js | `mobile/src/api/onboarding.js` | Check: `completeOnboarding` | ⬜ |

---

## 🌐 PHẦN 6: WEB (DJANGO TEMPLATES)

### 6.1 Pages

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 6.1.1 | Splash → Login → Register flow | `frontend/templates/frontend/splash.html`, `login.html`, `register.html` | GET `/` → splash → redirect login | ⬜ |
| 6.1.2 | Onboarding (parent + worker) | `onboarding_parent.html`, `onboarding_worker.html` | Check JS completeOnboarding | ⬜ |
| 6.1.3 | Parent home + tasks + create task | `parent_home.html`, `parent_tasks.html`, `task_create_1.html`, `task_create_2.html` | Check pages render + JS fetch | ⬜ |
| 6.1.4 | Browse candidates + review | `browse_candidates.html`, `review.html` | Check pages render | ⬜ |
| 6.1.5 | Worker feed + task detail + my jobs + profile | `worker_feed.html`, `task_detail.html`, `worker_jobs.html`, `worker_profile.html` | Check pages render | ⬜ |
| 6.1.6 | Chatbot (parent + worker) | `chatbot.html`, `worker_chatbot.html` | Check chat UI | ⬜ |
| 6.1.7 | Help center | `help_center.html` | Check page render | ⬜ |
| 6.1.8 | Tracking (live + offline alert) | `tracking.html` | Check `device-status-bar`, `offline-alert-modal`, `fetchDeviceStatus`, `triggerAlarm` | ⬜ |
| 6.1.9 | Admin dashboard | `admin_dashboard.html` | Check tabs + modals | ⬜ |

### 6.2 Web Performance

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 6.2.1 | Performance.js global utilities | `frontend/static/js/performance.js` | Check `window.EduPerf` với `cachedFetch`, `debounce`, `throttle` | ⬜ |
| 6.2.2 | worker_feed.html dùng cachedFetch | `frontend/templates/frontend/worker_feed.html` | Check `EduPerf.cachedFetch('tasks:all', ...)` | ⬜ |
| 6.2.3 | Static file served qua Whitenoise | `backend/settings.py:STATICFILES_STORAGE` | Check `whitenoise.storage.CompressedStaticFilesStorage` | ⬜ |

---

## ⚡ PHẦN 7: PERFORMANCE OPTIMIZATION (DSA)

### 7.1 Backend Performance Module

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 7.1.1 | LRU Cache implementation | `performance/lru_cache.py:LRUCache` | Check `OrderedDict`, `get/put O(1)`, TTL support | ⬜ |
| 7.1.2 | Memoization decorator | `performance/lru_cache.py:cached` | Check decorator pattern | ⬜ |
| 7.1.3 | Gemini client pool (singleton) | `performance/gemini_pool.py:get_pooled_gemini_client` | Check double-checked locking | ⬜ |
| 7.1.4 | Spatial: Haversine optimized | `performance/spatial.py:haversine_distance_optimized` | Check function exists | ⬜ |
| 7.1.5 | Spatial: Bounding box filter | `performance/spatial.py:bounding_box_filter` | Check pre-filter + haversine verify | ⬜ |
| 7.1.6 | Spatial: GeoHash encode + neighbors | `performance/spatial.py:geohash_encode`, `geohash_neighbors` | Check functions exist | ⬜ |
| 7.1.7 | Request deduplication | `performance/request_dedup.py:RequestDeduplicator` | Check Future pattern | ⬜ |
| 7.1.8 | Performance stats endpoint | `performance/views.py:PerformanceStatsAPIView` | GET `/api/performance/stats/` → 200 với cache hit rate | ⬜ |
| 7.1.9 | Clear cache endpoint | `performance/views.py:ClearCacheAPIView` | POST `/api/performance/clear-cache/` body `{"cache":"all"}` → 200 | ⬜ |
| 7.1.10 | Module registered in INSTALLED_APPS | `backend/settings.py` | Check `'performance'` in INSTALLED_APPS | ⬜ |
| 7.1.11 | URLs registered | `backend/urls.py` | Check `include('performance.urls')` | ⬜ |

### 7.2 Database Query Optimization

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 7.2.1 | TaskListCreateAPIView select_related | `core/views.py:TaskListCreateAPIView` | Check `select_related('parent', 'category')` | ⬜ |
| 7.2.2 | TaskDetailAPIView prefetch_related | `core/views.py:TaskDetailAPIView` | Check `prefetch_related('applications')` | ⬜ |
| 7.2.3 | TaskCandidatesAPIView select_related | `core/views.py:TaskCandidatesAPIView` | Check `select_related('worker', 'task', 'task__parent', 'task__category')` | ⬜ |
| 7.2.4 | WorkerJobsAPIView select_related | `core/views.py:WorkerJobsAPIView` | Check `select_related('worker', 'task', 'task__parent', 'task__category')` | ⬜ |
| 7.2.5 | WorkerProfileDetailAPIView aggregate | `core/views.py:WorkerProfileDetailAPIView` | Check `aggregate(Avg('rating'), Count('id'))` thay vì loop | ⬜ |
| 7.2.6 | WorkerProfileDetailAPIView select_related reviewer | `core/views.py:WorkerProfileDetailAPIView` | Check `select_related('reviewer')` | ⬜ |

### 7.3 Settings-level Optimization

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 7.3.1 | GZip middleware | `backend/settings.py:MIDDLEWARE` | Check `django.middleware.gzip.GZipMiddleware` | ⬜ |
| 7.3.2 | DRF throttling | `backend/settings.py:REST_FRAMEWORK` | Check `AnonRateThrottle`, `UserRateThrottle` với rates | ⬜ |
| 7.3.3 | Cache backend (LocMem) | `backend/settings.py:CACHES` | Check `LocMemCache` với `MAX_ENTRIES=1000` | ⬜ |
| 7.3.4 | Async moderation (background thread) | `moderation/signals.py:_auto_moderate_task_on_create` | Check `threading.Thread(target=...).start()` | ⬜ |

### 7.4 Benchmark Results

| # | Yêu cầu | Benchmark | Status |
|---|---|---|---|
| 7.4.1 | POST /tasks/ < 500ms (async moderation) | Run `scripts/benchmark_perf.sh` → check POST /tasks/ < 500ms | ⬜ |
| 7.4.2 | GET /tasks/ < 100ms (select_related) | Run benchmark → check GET /tasks/ < 100ms | ⬜ |
| 7.4.3 | All 13 endpoints < 100ms avg | Run benchmark → check avg < 100ms | ⬜ |

---

## 🚀 PHẦN 8: DEPLOYMENT & INFRASTRUCTURE

### 8.1 Render Configuration

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 8.1.1 | render.yaml cấu hình đúng | `render.yaml` | Check service type web, plan free, Python 3.11, buildCommand, startCommand | ⬜ |
| 8.1.2 | All env vars in render.yaml | `render.yaml` | Check: SECRET_KEY, DEBUG, RENDER, GEMINI_API_KEY, KEEPALIVE_*, ANOMALY_*, GOOGLE_OAUTH_*, FACEBOOK_*, DATABASE_URL (manual), MOMO_*, PAYMENT_*, TRACKING_* (4 vars offline alert) | ⬜ |
| 8.1.3 | build.sh đúng | `build.sh` | Check `pip install`, `collectstatic`, `migrate`, `seed_demo_data` | ⬜ |
| 8.1.4 | Procfile đúng | `Procfile` | Check `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT` | ⬜ |

### 8.2 Background Schedulers (3 schedulers)

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 8.2.1 | Keepalive scheduler (3 min ping) | `core/keepalive_scheduler.py` | Check `IntervalTrigger(minutes=3)`, only on Render | ⬜ |
| 8.2.2 | Anomaly detection scheduler (10 min) | `core/anomaly_scheduler.py` | Check `IntervalTrigger(minutes=10)`, 10 checks | ⬜ |
| 8.2.3 | Monthly settlement scheduler (1st of month 9h) | `payments/scheduler.py` | Check `CronTrigger(day=1, hour=9)` | ⬜ |
| 8.2.4 | Offline check scheduler (1 min) | `tracking/offline_scheduler.py` | Check `IntervalTrigger(minutes=1)`, only on Render | ⬜ |
| 8.2.5 | All schedulers thread-safe + idempotent | All scheduler files | Check `_lock = threading.Lock()`, `if _scheduler is not None and _scheduler.running: return` | ⬜ |

### 8.3 Health Checks

| # | Yêu cầu | Endpoint | Cách test | Status |
|---|---|---|---|---|
| 8.3.1 | Main health check | GET `/api/health/` | curl → 200 `{"status":"ok","database":"connected"}` | ⬜ |
| 8.3.2 | Tracking health | GET `/api/tracking/health/` | curl → 200 | ⬜ |
| 8.3.3 | Moderation health | GET `/api/moderation/health/` | curl → 200 | ⬜ |
| 8.3.4 | Payment health | GET `/api/payments/health/` | curl → 200 | ⬜ |

### 8.4 Production Live Test

| # | Yêu cầu | Cách test | Status |
|---|---|---|---|
| 8.4.1 | Production health OK | curl `https://educarelink-backend.onrender.com/api/health/` → 200 | ⬜ |
| 8.4.2 | Login admin OK | POST production `/api/auth/login/` với admin/Demo@2026 → 200 + JWT | ⬜ |
| 8.4.3 | Login parent OK | POST với phuhuynh_test/Demo@2026 → 200 | ⬜ |
| 8.4.4 | Login worker OK | POST với sinhvien_test/Demo@2026 → 200 | ⬜ |
| 8.4.5 | Chatbot production OK | POST `/api/chatbot/` → 200 type=message (không phải error) | ⬜ |
| 8.4.6 | Performance stats OK | GET `/api/performance/stats/` → 200 | ⬜ |
| 8.4.7 | Device offline check OK | POST `/api/tracking/admin/run-offline-check/` → 200 | ⬜ |
| 8.4.8 | 10 admin endpoints OK | Run `scripts/test_mobile_api_full.sh` → Admin: 10/10 pass | ⬜ |
| 8.4.9 | 9 worker endpoints OK | Run script → Worker: 9/9 pass | ⬜ |

---

## 📱 PHẦN 9: MOBILE DEPLOY PREP (CH PLAY + APP STORE)

### 9.1 EAS Configuration

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 9.1.1 | eas.json 3 profiles | `mobile/eas.json` | Check development, preview, production profiles | ⬜ |
| 9.1.2 | Production android app-bundle | `mobile/eas.json:production.android.buildType` | Check `app-bundle` | ⬜ |
| 9.1.3 | Submit config (android + ios) | `mobile/eas.json:submit` | Check `serviceAccountKeyPath`, `appleId`, `ascAppId`, `appleTeamId` | ⬜ |
| 9.1.4 | app.json version 1.1.0 | `mobile/app.json:version` | Check `1.1.0` | ⬜ |
| 9.1.5 | app.json permissions đầy đủ | `mobile/app.json:android.permissions` | Check: VIBRATE, RECEIVE_BOOT_COMPLETED, SCHEDULE_EXACT_ALARM, USE_FULL_SCREEN_INTENT, WAKE_LOCK, FOREGROUND_SERVICE, ACCESS_BACKGROUND_LOCATION | ⬜ |
| 9.1.6 | iOS background modes | `mobile/app.json:ios.infoPlist.UIBackgroundModes` | Check `location`, `fetch`, `remote-notification` | ⬜ |
| 9.1.7 | EAS project ID | `mobile/app.json:extra.eas.projectId` | Check `3e841ddf-23c3-42ce-a2e1-8827c06311a2` | ⬜ |

### 9.2 Deploy Guide

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 9.2.1 | DEPLOY_GUIDE.md chi tiết | `mobile/DEPLOY_GUIDE.md` | Check có: chi phí, tài khoản cần tạo, checklist legal, lệnh build/submit | ⬜ |
| 9.2.2 | Hướng dẫn Apple Critical Alert Entitlement | `mobile/DEPLOY_GUIDE.md:§8` | Check section Critical Alert Entitlement | ⬜ |

### 9.3 Mobile Build Test

| # | Yêu cầu | Cách test | Status |
|---|---|---|---|
| 9.3.1 | Expo bundle Android thành công | `cd mobile && npx expo export --platform android` → không lỗi | ⬜ |
| 9.3.2 | Bundle size < 5MB | Check output → bundle < 5MB | ⬜ |
| 9.3.3 | All JS files syntax OK | `node --check` tất cả file .js trong mobile/src/ | ⬜ |

---

## 📚 PHẦN 10: DOCUMENTATION

### 10.1 Project Docs

| # | Yêu cầu | File cần kiểm | Cách test | Status |
|---|---|---|---|---|
| 10.1.1 | AGENTS.md (single source of truth) | `AGENTS.md` | Check 22 sections, >= 1000 dòng, có §20 Agent Coordination Protocol | ⬜ |
| 10.1.2 | EDUCARELINK_HANDOFF.md | `EDUCARELINK_HANDOFF.md` | Check web redesign handoff | ⬜ |
| 10.1.3 | Nhat_Ky_Hoat_Dong.md | `Nhat_Ky_Hoat_Dong.md` | Check nhật ký cập nhật | ⬜ |
| 10.1.4 | payments/README.md | `payments/README.md` | Check chi tiết module payment | ⬜ |
| 10.1.5 | performance/README.md | `performance/README.md` | Check DSA docs + benchmark results | ⬜ |
| 10.1.6 | mobile/DEPLOY_GUIDE.md | `mobile/DEPLOY_GUIDE.md` | Check deploy guide | ⬜ |
| 10.1.7 | .env.example | `.env.example` | Check all env vars có comment | ⬜ |

### 10.2 Code Quality

| # | Yêu cầu | Cách test | Status |
|---|---|---|---|
| 10.2.1 | Django system check pass | `python manage.py check` → 0 issues | ⬜ |
| 10.2.2 | All migrations applied | `python manage.py migrate --check` → no pending | ⬜ |
| 10.2.3 | No hardcoded secrets | Grep `ghp_\|sk-\|AIzaSy` trong code (trừ .env.example) → không có | ⬜ |
| 10.2.4 | .gitignore đúng | Check ignore: .env, db.sqlite3, media/, staticfiles/, node_modules/ | ⬜ |
| 10.2.5 | Commit messages tiếng Việt | `git log --oneline` → check messages | ⬜ |

---

## 🔄 PHẦN 11: ROLLBACK PLAN

| # | Yêu cầu | Cách test | Status |
|---|---|---|---|
| 11.1 | Có thể revert commit mới nhất | `git revert HEAD` works | ⬜ |
| 11.2 | Có thể reset về commit cũ | `git reset --hard <commit>` works | ⬜ |
| 11.3 | Backup commit trước mỗi merge | Check git log có merge commits rõ ràng | ⬜ |
| 11.4 | Render auto-deploy khi push main | Push main → Render deploy tự động | ⬜ |

---

## 📊 TỔNG KẾT AUDIT

### Kết quả theo phần

| Phần | Tổng items | Pass | Fail | Pending |
|---|---|---|---|---|
| 1. Core (Auth, Task, Notification, Onboarding, Admin) | 38 | | | |
| 2. AI (Chatbot, Moderation, Recommendations, Gemini Fallback) | 21 | | | |
| 3. Tracking & Safety (Live, SOS, Device Offline Alert) | 41 | | | |
| 4. Payments (MoMo, Admin) | 22 | | | |
| 5. Mobile (Auth, Screens, Admin, Performance, API) | 50 | | | |
| 6. Web (Pages, Performance) | 12 | | | |
| 7. Performance (DSA, DB, Settings, Benchmark) | 24 | | | |
| 8. Deployment (Render, Schedulers, Health, Production) | 21 | | | |
| 9. Mobile Deploy Prep | 12 | | | |
| 10. Documentation | 12 | | | |
| 11. Rollback Plan | 4 | | | |
| **TỔNG** | **257** | | | |

### Critical issues tìm thấy

> Điền các issue ❌ quan trọng nhất cần fix ngay:

1. ...
2. ...
3. ...

### Recommendations

> Điền đề xuất cải thiện:

1. ...
2. ...
3. ...

### Sign-off

- **Auditor**: <tên agent>
- **Ngày audit**: <YYYY-MM-DD>
- **Kết luận**: <PASS / FAIL / NEEDS FIX>
- **Commit audit**: <commit hash>

---

## 📝 HƯỚNG DẪN CHO AUDITOR

### Bước 1: Setup môi trường
```bash
git clone https://github.com/huyhandsome6996/educarelink-backend-4-12-2026.git
cd educarelink-backend-4-12-2026
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # điền GEMINI_API_KEY nếu test AI
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver
```

### Bước 2: Test local
```bash
# Chạy benchmark
bash /home/z/my-project/scripts/benchmark_perf.sh

# Test API integration
bash /home/z/my-project/scripts/test_mobile_api_full.sh

# Test offline alert
bash /home/z/my-project/scripts/test_offline_alert.sh
```

### Bước 3: Test production
```bash
BASE=https://educarelink-backend.onrender.com/api
# Login
curl -X POST "$BASE/auth/login/" -H "Content-Type: application/json" -d '{"username":"admin","password":"Demo@2026"}'
# Test chatbot
curl -X POST "$BASE/chatbot/" -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"message":"test","history":[]}'
```

### Bước 4: Điền kết quả
- Mỗi mục: đánh dấu ✅ (pass) / ❌ (fail) / ⚠️ (cần xem lại)
- Cuối file: điền TỔNG KẾT + Critical issues + Recommendations + Sign-off

### Bước 5: Commit kết quả
```bash
git add AUDIT_CHECKLIST.md
git commit -m "audit: kết quả kiểm tra toàn bộ tính năng EduCareLink"
git push origin main
```

---

*File này được tạo bởi Z.ai (Super Z) — checklist 257 items covering toàn bộ tính năng từ 5 nhánh feature + 1 fix đã merge vào main.*
