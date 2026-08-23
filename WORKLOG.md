# WORKLOG — EduCareLink Full Audit & Test

**Ngày**: 2026-07-21
**Agent**: QA Agent (Super Z)
**Branch**: main (backup: `backup-2026-07-21`)

---

## Milestone 1: Đọc + Phân tích repo (09:00 - 09:30)

- ✅ Clone repo + pull latest (commit `23ce3d5`)
- ✅ Đọc `EDUCARELINK_REPO_ANALYSIS_AND_TESTING_GUIDE.md` (597 dòng)
- ✅ Đọc `AGENTS.md` (73KB — Single source of truth)
- ✅ Đọc `SYNC_PRINCIPLE.md` (15KB)
- ✅ Đọc `SECURITY_AUDIT_CHECKLIST.md` (7.5KB)
- ✅ Tạo backup branch `backup-2026-07-21` + push lên GitHub

## Milestone 2: Test production API (09:30 - 10:00)

- ✅ Login 3 roles: admin, phuhuynh_test, sinhvien_test — ALL PASS
- ✅ Health check: 4 endpoints (health, payment, tracking, moderation) — ALL 200
- ✅ Parent flow: my-tasks, profile, notifications, create task, AI moderation, chatbot — ALL PASS
- ✅ Worker flow: feed, my-jobs, profile, earnings, chatbot, AI recommendations — ALL PASS
- ✅ Admin flow: all-tasks, pending-workers, all-workers, all-users, payments, tracking, moderation, keepalive, performance, send-notification — ALL PASS (11/11)
- ✅ Safety: geofence task tạo OK, SOS hoạt động OK
- ✅ Edge cases: task vi phạm blocked, no-auth blocked, SOS wrong task blocked
- ✅ Web pages: 13/13 load OK, AI banner present, admin tasks tab present, chatbot format OK
- ✅ Performance: GET /tasks/ = 1.18s (< 2s expected)

**Tổng: 41/43 PASS (95%)** — 2 "fail" là test script issues, không phải bugs thật

## Milestone 3: Security audit (10:00 - 10:15)

- ✅ SQL Injection: SAFE (ORM only, no raw SQL)
- ✅ XSS: SAFE (escapeHtml before parse markdown)
- ✅ CSRF: SAFE (CsrfViewMiddleware)
- ✅ IDOR: SAFE (get_queryset filters by request.user)
- ✅ Auth bypass: SAFE (IsAuthenticated default)
- ✅ Rate limiting: 8 scopes (login 5/min, register 3/hr, sos 5/min, task_create 10/hr, apply 20/hr, ai 20/min, anon 60/min, user 600/min)
- ✅ DEBUG=False in production
- ✅ CORS default False
- ✅ JWT 60min access + 30day refresh + rotation + blacklist
- ✅ HTTPS redirect + HSTS
- ✅ Queryset limits (Task[:200], Payment[:500], PaymentLog[:500])

## Milestone 4: Mobile parity check (10:15 - 10:30)

- ✅ Mobile app syntax check: 59 files, 0 errors
- ✅ Expo build test: Android bundle 3.69MB, no errors
- ✅ Mobile API client: setupPayOS(), confirmPayOSWebhook() added
- ✅ PaymentSetupScreen: PayOS option with badge "MIỄN PHÍ"
- ✅ Category icons: synced (Ionicons → Material Symbols mapping)
- ✅ AI chatbot: FormattedText component (parse bold, bullet, numbered, heading)
- ✅ Admin screens: AdminAllTasksScreen synced with web
- ✅ Colors/Typography/Shadows: 100% synced with web

## Milestone 5: Safety feature verification (10:30 - 10:45)

- ✅ Geofence task creation: working (task 47 with geofence_lat/lng/radius)
- ✅ Worker apply with consent_tracking: working
- ✅ Consent status check: working
- ✅ SOS from parent: working (SOSAlert id=5 created, status=active)
- ✅ Location update endpoint: exists at POST /api/tracking/location/
- ✅ Heartbeat endpoint: exists at POST /api/tracking/heartbeat/
- ✅ Offline detection: scheduler running (TRACKING_OFFLINE_THRESHOLD=60s)
- ✅ Notification channels: 5 channels configured (critical_alerts, geofence_alerts, sos_alerts, recovery_alerts, default)
- ✅ Background tracking: LocationService.js with foreground service + auto-resume

## Milestone 6: Demo data verification (10:45 - 11:00)

- ✅ 3 protected accounts: admin, phuhuynh_test, sinhvien_test
- ✅ 12 tasks in system (mix of open, in_progress, completed, cancelled)
- ✅ Multiple carepartners approved
- ✅ Categories: 8 service types seeded
- ✅ Notifications: broadcast test sent OK
- ✅ AI moderation: approving valid tasks, blocking invalid ones
- ✅ Payments: PayOS integration on `feature/payos-integration` branch (pending merge)

---

## Issues Found & Fixed

### Issue 1: SAFETY-001 test script (false positive)
- **Problem**: Test script checked `body.get("id")` but response format returned `id` inside the JSON body
- **Actual**: Task created successfully (id=47, geofence fields populated)
- **Status**: ✅ Not a bug — test script needs fix

### Issue 2: SAFETY-004 SOS 404 (false positive)
- **Problem**: Test used task_id=1 (from earlier test that was moderated/deleted)
- **Actual**: SOS works correctly with valid task_id (tested with task 47 → SOSAlert id=5 created)
- **Status**: ✅ Not a bug — test script needs fix

---

## Production Status

| Component | Status |
|---|---|
| Backend API | ✅ Running OK |
| Database | ✅ Connected (PostgreSQL Supabase) |
| Web (Django Templates) | ✅ 13/13 pages load |
| AI (Gemini) | ✅ Working (chatbot + moderation) |
| Auth (JWT) | ✅ Login + token refresh |
| Security | ✅ Rate limiting + queryset limits |
| Keepalive | ✅ Disabled (as requested) |
| MoMo | ✅ Disabled (as requested) |
| PayOS | ⏳ On branch `feature/payos-integration` (pending merge) |
| Mobile | ✅ Build OK, syntax OK, parity 100% |

---

# QA-FIX-1 — Bug fixes + spec gaps (2026-08-13)

Branch: `feature/module-an-toan-carepartner`
Commit: (sẽ tạo sau khi test suite pass)

## Mục lục fix

### 🔴 5 Critical Bugs

| # | Bug | File(s) | Mô tả |
|---|-----|---------|-------|
| 1.1 | OfflineLocationQueue drop cả chunk khi 1 điểm lỗi | `mobile/src/services/OfflineLocationQueue.js`, `mobile/src/services/LocationService.js` | Thêm cột `sync_attempts` + `incrementAttempts()`. Khi flush chunk fail 4xx: chỉ tăng counter từng điểm, skip riêng điểm ≥ 5 attempts (trước đây xoá cả chunk 200 điểm) |
| 1.2 | BatchLocationAPIView thiếu transaction.atomic | `tracking/views.py` | Wrap `LocationHistory.bulk_create` + `LiveLocation.update_or_create` trong `transaction.atomic()`. Nếu LiveLocation update fail → rollback LocationHistory inserts |
| 1.3 | Verification scheduler spam push parent mỗi timeout | `tracking/models.py`, `tracking/verification_scheduler.py`, `tracking/services.py` | Thêm `parent_alert_sent` + `consecutive_timeouts_count` fields. Scheduler chỉ gửi parent alert 1 lần/streak (lần đầu đạt CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT). Reset khi `confirmed`/`wrong_code`/`cancelled` |
| 1.4 | `send_expo_push_notification` fire-and-forget | `core/views.py`, `tracking/services.py`, `tracking/verification_scheduler.py` | Parse response JSON, check `errors` + `data.status`, return `True`/`False`/`None`. Thêm `Authorization: Bearer <EXPO_ACCESS_TOKEN>`. Move `channelId` to top-level payload (giữ `android_channel_id` backward compat). Caller chỉ set `push_sent=True` khi `_notify_user` trả True |
| 1.5 | `acknowledge_offline_alert` map exception sai | `tracking/services.py`, `tracking/views.py` | Thêm `AlreadyAcknowledgedError(ValueError)` exception riêng. View map: `AlreadyAcknowledgedError` → 400, `ValueError` (task_id mismatch) → 404, `PermissionError` → 403 |

### 🟡 6 Spec Gaps

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| 2.2 | `DeviceOfflineAlert.acknowledged_by` FK | `tracking/models.py`, `tracking/migrations/0005_*.py`, `tracking/services.py` | Thêm FK `acknowledged_by` → User (SET_NULL). Service set field khi `acknowledge_offline_alert()` thành công |
| 2.3 | User model PIN helper methods | `core/models.py`, `tracking/services.py` | Thêm `set_verification_pin(raw_pin)`, `check_verification_pin(raw_pin)`, property `has_verification_pin_set`. Services refactor để gọi helper methods (trước đây gọi `make_password`/`check_password` trực tiếp) |
| 2.4 | Parent verification history + Cancel check | `tracking/views.py`, `tracking/services.py`, `tracking/urls.py`, `tracking/models.py`, `tracking/migrations/0005_*.py` | Thêm endpoint `GET /tracking/<task_id>/verification-checks/history/` (parent xem timeline). Thêm endpoint `POST /tracking/verification-checks/<id>/cancel/` (admin/parent huỷ check pending, worker denied). Thêm status `'cancelled'` vào `STATUS_CHOICES` |
| 2.5 | Batch location validation + status codes | `tracking/views.py` | Trả 201 Created (không phải 200). Trả 413 nếu > 500 points (trước đây 400). Validate `recorded_at`: không vượt quá ±5 phút future, không cũ quá 7 ngày. Điểm invalid bị skip riêng (không drop cả batch) |
| 2.6 | Mobile audio alarm loop | `mobile/src/services/EmergencyAlarmService.js` (NEW), `mobile/src/screens/Parent/LiveTrackingScreen.js`, `mobile/package.json` | Thêm `expo-av ~14.0.7`. Tạo `EmergencyAlarmService` với `playEmergencyAlarm()` (loop), `stopEmergencyAlarm()`, `unloadEmergencyAlarm()`. Tích hợp vào LiveTrackingScreen: play khi foreground push `device_offline_critical`, stop khi parent acknowledge, unload khi unmount. Fallback `Vibration` nếu audio không khả dụng |
| Bổ sung | `logger.warning` per-alert at max retry | `tracking/services.py` | `retry_offline_alert_pushes()` log warning cho từng alert đạt `OFFLINE_PUSH_MAX_RETRIES` (trước đây chỉ đếm số lượng) |

## Migration

`tracking/migrations/0005_deviceofflinealert_acknowledged_by_and_more.py`:
- AddField `DeviceOfflineAlert.acknowledged_by` (FK → User, SET_NULL, default=None)
- AddField `RandomVerificationCheck.parent_alert_sent` (BooleanField, default=False)
- AddField `RandomVerificationCheck.consecutive_timeouts_count` (IntegerField, default=0)
- AlterField `RandomVerificationCheck.status` (choices + 'cancelled')

Backward compatible (tất cả fields có default), chạy trên DB hiện có không cần downtime.

## Test Suite

- `tracking/tests_safety_module.py` (14 tests cũ): update 2 tests
  - `test_trigger_verification_check_now_creates_check`: set `expo_push_token` + mock `requests.post` (Bug 1.4 fix làm `push_sent` chỉ True khi _notify_user trả True)
  - `test_batch_location_view_creates_history_with_past_recorded_at`: expected status 200 → 201 (Spec 2.5)

- `tracking/tests_qa_fixes.py` (NEW, 38 tests): cover từng bug + spec gap
  - 🔴 1.1: 1 test (per-point skip)
  - 🔴 1.2: 1 test (atomic rollback)
  - 🔴 1.3: 6 tests (streak counter, parent alert once, reset on confirmed/cancelled)
  - 🔴 1.4: 5 tests (True/False/None returns, push_sent logic)
  - 🔴 1.5: 4 tests (AlreadyAcknowledgedError, task_id mismatch, view 400/404)
  - 🟡 2.2: 2 tests (acknowledged_by set, field exists)
  - 🟡 2.3: 5 tests (set/check/has_pin_set)
  - 🟡 2.4: 8 tests (parent history, cancel by parent/admin/worker, edge cases)
  - 🟡 2.5: 5 tests (201, 413, future/old skip, field name preserved)
  - Bổ sung: 1 test (max retry warning per alert)

Total: 14 (existing) + 38 (new) = 52 tests. All must PASS.

## Mobile Lint Check

```
node --check mobile/src/services/OfflineLocationQueue.js     # OK
node --check mobile/src/services/LocationService.js          # OK
node --check mobile/src/services/EmergencyAlarmService.js    # OK
node --check mobile/src/screens/Parent/LiveTrackingScreen.js # OK
```

## Commit Strategy

- Branch: `feature/module-an-toan-carepartner` (KHÔNG merge main)
- Commit message: `QA-FIX-1: 5 critical bugs + 6 spec gaps (offline cache, push, verification PIN)`
- Push: `git push origin feature/module-an-toan-carepartner`

---

# QA-FIX-2 — Bổ sung an toàn CarePartner toàn diện (2026-08-14)

Branch: `feature/module-an-toan-carepartner`

## Mục lục fix

### A. Mobile Blockers

| # | Bug | File(s) | Mô tả |
|---|-----|---------|-------|
| A1 | App crash do AuthProvider | `mobile/App.js` | Tách `AppContent` ra khỏi `<AuthProvider>`. Các hook dùng `useAuth()` (auto resume, background fetch, RandomVerificationModal) chỉ gọi BÊN TRONG AuthProvider. Trước đây hook gọi ở ngoài → `useAuth()` trả null → destructuring crash. |
| A2 | expo-sqlite 15.0.13 không tồn tại | `mobile/package.json`, `mobile/package-lock.json` | Đổi sang `expo-sqlite@~16.0.10` (tương thích SDK 54). Chạy `npx expo install --fix` để fix thêm 4 package khác (expo-av, expo-battery, netinfo, react-native-webview). Fix `app.json` bỏ `useNextNotificationsApi` (deprecated). Convert `assets/logo.png` + `assets/icon.png` từ JPEG sang PNG thật. |

### B. Offline tracking + last-known location

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| B1 | Batch location idempotent | `tracking/models.py`, `tracking/views.py`, `tracking/serializers.py`, `tracking/migrations/0006_*.py` | Thêm field `LocationHistory.client_point_id` (UUID). Partial unique constraint `(task, worker, client_point_id) WHERE client_point_id IS NOT NULL`. View trả `inserted_ids` / `already_exists_ids` / `rejected` per-point. Mobile retry cùng point → backend skip, không tạo duplicate route. |
| B2 | SQLite queue isolation | `mobile/src/services/OfflineLocationQueue.js`, `mobile/src/services/LocationService.js`, `mobile/src/context/AuthContext.js` | Schema queue thêm `user_id` + `client_point_id`. `enqueueLocation(userId, taskId, point)` yêu cầu userId. `getChunk(userId)` chỉ lấy row của user hiện tại. `clearByUser(userId)` khi logout. AuthContext lưu `user_id` vào storage. Queue của user A không bao giờ flush bằng token user B. |
| B3 | Last-known location + UI Parent | `tracking/views.py` (LiveLocationAPIView, DeviceStatusAPIView), `mobile/src/screens/Parent/LiveTrackingScreen.js` | API live location trả thêm `last_seen`, `seconds_since_last_seen`, `is_stale`, `is_offline`, `offline_threshold_seconds`. UI Parent hiển thị 3 trạng thái rõ: LIVE / STALE (vị trí cuối) / OFFLINE (mất tín hiệu). Không hardcode 60/90s — dùng `offline_threshold_seconds` từ API. |

### C. Scheduler production-safe

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| C1 | Scheduler không chạy trong web worker | `tracking/apps.py`, `render.yaml`, `tracking/management/commands/run_tracking_schedulers.py` (NEW) | `apps.py` skip scheduler mặc định khi `TRACKING_SCHEDULER_IN_WEB_WORKER=false`. Management command `run_tracking_schedulers` chạy standalone (`--once` cho cron job, daemon cho worker dyno). render.yaml document pattern mới. |
| C2 | DB constraint chống duplicate | `tracking/models.py`, `tracking/migrations/0006_*.py` | `UniqueConstraint(task) WHERE status='active'` trên DeviceOfflineAlert. `UniqueConstraint(task, worker) WHERE status='pending'` trên RandomVerificationCheck. Defense-in-depth dưới scheduler logic. |

### D. Emergency notifications

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| D1 | Backend push parse + retry | `core/views.py` (đã có QA-FIX-1), `tracking/services.py` | Verify `send_expo_push_notification` trả True/False/None. `channelId` top-level + `android_channel_id` backward compat. Retry max 5 lần cách 30s. |
| D2 | Mobile Android channel + alarm | `mobile/App.js`, `mobile/src/services/EmergencyAlarmService.js` | Channel `emergency-alerts` importance MAX, bypassDnd, sound `emergency_alarm.wav` (TODO: file chưa có — ghi rõ trong README/comment). EmergencyAlarmService loop audio + Vibration khi foreground. Stop khi parent acknowledge. Document: Expo Go không đủ, cần EAS dev build. iOS critical alert UNTESTABLE (cần entitlement Apple). |

### E. Geofence + tọa độ 0

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| E1 | Predictive warning persist | `tracking/models.py`, `tracking/services.py`, `tracking/migrations/0006_*.py` | Thêm field `LiveLocation.predictive_warned` (BooleanField, default=False). Thay thế thuộc tính tạm `_predictive_warned` → persist DB → chỉ push 1 lần khi vào vùng 80-100%, clear khi về vùng < 80% hoặc rời vùng > 100%. |
| E2 | Tọa độ 0 hợp lệ | `tracking/services.py`, `mobile/src/services/LocationService.js`, `mobile/src/services/OfflineLocationQueue.js`, `mobile/src/components/RandomVerificationModal.js` | Python: `if geofence_lat is not None` thay `if geofence_lat`. JS: `?? null` thay `|| null` cho accuracy/speed/heading/latitude/longitude (tọa độ 0 là hợp lệ). |

### F. Random PIN verification

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| F1 | Backend scheduler + constants | `tracking/verification_scheduler.py` (đã có QA-FIX-1) | Constants: TARGET_CHECKS_PER_SHIFT, ESTIMATED_SHIFT_MINUTES, MIN_MINUTES_BETWEEN_CHECKS, RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS, CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT. Scheduler skip worker chưa set PIN. Timeout lần đầu → notify admin. Streak ≥ 2 → notify parent 1 lần. |
| F2 | Mobile modal chỉ poll khi worker | `mobile/src/components/RandomVerificationModal.js` | `useAuth()` check `user?.role === 'worker'` + `authLoading=false` trước khi poll. Logout → cleanup interval + Vibration.cancel(). Trước đây poll ngay khi mở app ở login screen → 401 spam. |

### G. Logout cleanup

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| G1 | Logout dừng background + xóa queue | `mobile/src/context/AuthContext.js`, `mobile/src/services/LocationService.js` (NEW `cleanupOnLogout`), `mobile/App.js` (useBackgroundFetch cleanup) | `logout()` gọi `cleanupOnLogout(userId)` → stopTracking + clearByUser + clear storage. `useBackgroundFetch` unregister BackgroundFetch khi user=null. `useTaskEndedListener` chỉ đăng ký khi có user. Không để worker cũ tiếp tục heartbeat sau logout. |

## Migration

`tracking/migrations/0006_qa_fix_2_idempotent_batch_and_constraints.py`:
- AddField `LocationHistory.client_point_id` (CharField max_length=36, null=True)
- AddConstraint `unique_task_worker_client_point_id` (partial WHERE client_point_id IS NOT NULL)
- AddField `LiveLocation.predictive_warned` (BooleanField default=False)
- AddConstraint `unique_active_alert_per_task` (partial WHERE status='active')
- AddConstraint `unique_pending_check_per_task_worker` (partial WHERE status='pending')

`tracking/migrations/0007_alter_deviceheartbeat_device_status_and_more.py`:
- AlterField `DeviceHeartbeat.device_status` (choices help text — không đổi DB schema)
- AlterField `RandomVerificationCheck.respond_deadline` (help text — không đổi DB schema)

Backward compatible (tất cả fields có default, constraints dùng partial index).

## Test Suite

- `tracking/tests_qa_fix_2.py` (NEW, 33 tests):
  - B1: 5 tests (idempotent, mixed, no client_point_id, rejected, no leak)
  - C: 5 tests (unique alert, alert after recovered, unique check, check after timeout, scheduler no duplicate, DB constraint)
  - B3: 3 tests (device-status fields, live stale/offline, live fresh)
  - E: 3 tests (predictive_warned field, no duplicate warning, tọa độ 0)
  - F: 7 tests (PIN hash, check, has_pin, correct PIN reset, wrong PIN max, cancel by parent, cancel by worker denied, timeout, streak)
  - D: 3 tests (acknowledge sets by, twice raises, task mismatch 404)
  - C: 2 tests (management command, apps.py module)
  - Ownership: 2 tests (parent history, parent ack other parent)

Total: 33 (QA-FIX-2) + 52 (QA-FIX-1) + 0 (safety_module, đã merge vào qa_fixes) = 85 tests. All PASS.

## Mobile Lint + Build

```
node --check App.js                                              # OK
node --check src/context/AuthContext.js                          # OK
node --check src/services/LocationService.js                     # OK
node --check src/services/OfflineLocationQueue.js                # OK
node --check src/services/EmergencyAlarmService.js               # OK
node --check src/components/RandomVerificationModal.js           # OK
node --check src/screens/Parent/LiveTrackingScreen.js            # OK
npm ci                                                           # OK (734 packages)
npx expo-doctor                                                  # 18/18 checks passed
```

## Kết quả test nguyên văn

```
$ python manage.py migrate
[TrackingConfig] Local dev — schedulers SKIPPED.
Operations to perform:
  Apply all migrations: admin, auth, contenttypes, core, moderation, payments, sessions, token_blacklist, tracking
Running migrations:
  Applying tracking.0006_qa_fix_2_idempotent_batch_and_constraints... OK
  Applying tracking.0007_alter_deviceheartbeat_device_status_and_more... OK

$ python manage.py check
[Payments Scheduler] DISABLED (PAYMENT_SCHEDULER_ENABLED != true)
[TrackingConfig] Local dev — schedulers SKIPPED.
System check identified no issues (0 silenced).

$ python manage.py test
[TrackingConfig] Local dev — schedulers SKIPPED.
System check identified no issues (0 silenced).
... (test output) ...
----------------------------------------------------------------------
Ran 85 tests in 30.309s
OK

$ npm ci
added 734 packages in 13s

$ npx expo-doctor
Running 18 checks on your project...
18/18 checks passed. No issues detected!
```

## Commit Strategy

- Branch: `feature/module-an-toan-carepartner`
- Commit message: `QA-FIX-2: bổ sung an toàn CarePartner toàn diện (offline idempotent, scheduler production-safe, geofence persist, tọa độ 0, logout cleanup)`
- Push: `git push origin feature/module-an-toan-carepartner`

---

# QA-FIX-3 — Hoàn thiện an toàn CarePartner (2026-08-14)

Branch: `feature/module-an-toan-carepartner`

## Mục lục fix

### A. Sửa bug mobile nghiêm trọng

| # | Bug | File(s) | Mô tả |
|---|-----|---------|-------|
| A1 | `alreadyExistsIds === 0` so sánh array với số 0 | `mobile/src/services/LocationService.js` | **SỬA BUG NGHIÊM TRỌNG**: `alreadyExistsIds` là array, `=== 0` luôn false → break không bao giờ xảy ra → vòng while lặp 50 lần gọi API vô ích. Sửa thành `.length === 0`. Thêm logic break khi chunk toàn rejected-only — chỉ tăng sync_attempts 1 lần rồi dừng lần flush đó. |

### B. Scheduler production deployment thật sự chạy

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| B1 | Render Cron Job cho scheduler | `render.yaml` | Bổ sung Cron Job service `educarelink-tracking-scheduler` chạy mỗi 1 phút: `python manage.py run_tracking_schedulers --once --only both`. Có đủ env vars cần thiết. Trước đây `TRACKING_SCHEDULER_IN_WEB_WORKER=false` nhưng không có process nào chạy scheduler → alert không bao giờ được tạo. |
| B2 | Health logging + monitoring endpoint | `tracking/management/commands/run_tracking_schedulers.py`, `tracking/views.py`, `tracking/urls.py` | Mỗi lần chạy, ghi file `/tmp/tracking_scheduler_health.json` với timestamp + stats. Thêm endpoint `/api/tracking/scheduler-health/` (public, no auth) để monitoring outside phát hiện scheduler die (file cũ quá 3 phút → stale). |
| B3 | Expose TRACKING_SCHEDULER_IN_WEB_WORKER qua settings | `backend/settings.py` | Monitoring endpoint đọc Django settings thay vì os.environ trực tiếp. |

### C. Firebase config + native build

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| C1 | Bỏ google-services.json reference | `mobile/app.json`, `mobile/GOOGLE_SERVICES_SETUP.md` (NEW) | `app.json` trước đây reference `./google-services.json` nhưng file không commit (secret) → `expo prebuild` fail ENOENT. Bỏ reference — Expo Push Notifications dùng Expo Push Service (không cần Firebase trực tiếp). Document cách cung cấp file khi cần (EAS credentials). |

### D. Emergency alarm audio thật

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| D1 | Asset emergency_alarm.wav thật | `mobile/assets/sounds/emergency_alarm.wav` (NEW), `mobile/assets/sounds/README.md` | Generate file WAV 3s, 44100Hz, 16-bit mono PCM, sine siren 800Hz/1000Hz xen kẽ. Generated procedurally bằng Python — không vấn đề bản quyền. Trước đây chỉ có README placeholder. |
| D2 | Bật static require + audio mode | `mobile/src/services/EmergencyAlarmService.js` | Uncomment `require('../../assets/sounds/emergency_alarm.wav')`. Thêm `setAudioModeAsync` với `playsInSilentModeIOS: true`. `stopEmergencyAlarm()` unload audio object. `unloadEmergencyAlarm()` cũng stop + cancel vibration. |

### E. Regression tests

| # | Spec | File(s) | Mô tả |
|---|------|---------|-------|
| E1 | 26 regression tests mới | `tracking/tests_qa_fix_3.py` (NEW) | Cover: A (rejected-only), B (scheduler deployment + health endpoint + render.yaml), C (authorization worker khác), D (last-known location trong alert), E (duplicate client_point_id), F (PIN hash + sai PIN + timeout + reset streak), G (scheduler concurrent no duplicate), H (render.yaml structure). |

## Test Suite

- 111 tests PASS (85 cũ QA-FIX-1+2 + 26 mới QA-FIX-3).
- `npm ci` + `npx expo-doctor` 18/18 PASS.
- `npx expo prebuild --platform android` PASS (không còn ENOENT).
- `npx expo export --platform android` PASS (3.88 MB JS bundle).
- 7 file mobile `node --check` PASS.

## UNTESTABLE

- Native EAS Android build (cần `eas build` cloud).
- Custom sound + full-screen intent trên device thật (cần EAS Build).
- iOS critical alert (cần entitlement Apple).
- Scheduler production trên Render (chưa deploy).
- Push/background location khi app killed (cần device thật).

## Commit Strategy

- Branch: `feature/module-an-toan-carepartner`
- Commit message: `QA-FIX-3: scheduler Render Cron Job + emergency_alarm.wav asset + bug alreadyExistsIds + 26 regression tests`
- Push: `git push origin feature/module-an-toan-carepartner`

---

## QA-FIX-5 (14-08-2026) — fix 3 bug QA phát hiện sau commit 9747188

### Bug High — trộn vị trí giữa 2 task

- **Vấn đề**: `flushOfflineQueue(userId)` dùng `getChunk(userId)` lấy 200 điểm của *mọi task* theo thời gian, rồi dùng `chunk[0].task_id` làm `task_id` của cả request. Điểm của task B (cùng user) có thể bị gửi nhầm vào task A.
- **Fix**: thêm `getDistinctTaskIds(userId)` + `getChunkByTask(userId, taskId, size)` trong `OfflineLocationQueue.js`. Rewrite `flushOfflineQueue` để duyệt qua từng task_id riêng, mỗi task = 1 hoặc nhiều request batch riêng (không trộn).
- **Behavior**: 5xx dừng cả flush; 4xx chỉ break task đó, thử task tiếp.
- **Files**: `mobile/src/services/OfflineLocationQueue.js`, `mobile/src/services/LocationService.js`.
- **Tests**: `mobile/scripts/test_qa5_mobile_flush_isolation.test.js` (6 JS tests PASS), `tracking/tests_qa_fix_5.py::QAFix5H1TestCase` (3 backend tests PASS).

### Bug Medium — health endpoint sai kiến trúc

- **Vấn đề**: `/api/tracking/scheduler-health/` đọc `/tmp/tracking_scheduler_health.json` — nhưng Render Cron container và web container không chia sẻ `/tmp` → endpoint luôn trả `no_data` dù cron đã chạy.
- **Fix**: thêm `SchedulerHealth` model (DB-based, singleton row). Cron ghi DB qua `record_run()`, endpoint đọc DB trước (`_read_health_db()`), fallback `/tmp` file cho dev local.
- **Migration**: `0008_qa_fix_5_scheduler_health.py` — tạo bảng `SchedulerHealth`.
- **Files**: `tracking/models.py`, `tracking/management/commands/run_tracking_schedulers.py`, `tracking/views.py`, `tracking/migrations/0008_qa_fix_5_scheduler_health.py`.
- **Tests**: `tracking/tests_qa_fix_5.py::QAFix5M2SchedulerHealthDBTestCase` (8 tests PASS).

### Bug Medium — cron thiếu SECRET_KEY/DATABASE_URL

- **Vấn đề**: `render.yaml` cron không khai báo tường minh `SECRET_KEY` + `DATABASE_URL`. Nếu deploy-er import Blueprint mà quên copy thủ công → cron fail silently với lỗi cryptic.
- **Fix**: thêm management command `check_scheduler_env` fail-fast với checklist deploy rõ ràng. Cron `startCommand` chạy `check_scheduler_env && run_tracking_schedulers`. Khai báo `SECRET_KEY` + `DATABASE_URL` + `GEMINI_API_KEY` với `sync: false` trong render.yaml.
- **Files**: `tracking/management/commands/check_scheduler_env.py` (NEW), `render.yaml`.
- **Tests**: `tracking/tests_qa_fix_5.py::QAFix5M3CheckSchedulerEnvTestCase` (5 tests PASS).

### Test Results

- 127 backend tests PASS (111 cũ + 16 mới QA-FIX-5).
- 6 mobile JS tests PASS (mock SQLite + apiClient).
- `npx expo-doctor` 18/18 PASS.
- `npx expo prebuild --platform android` PASS + sound file copy OK.
- `npx expo export --platform android` PASS (3.88 MB JS bundle).

### UNTESTABLE (giữ nguyên từ QA-FIX-3/4)

- Native EAS Android build (cần eas build cloud).
- Custom sound + full-screen intent trên device thật (cần EAS Build).
- iOS critical alert (cần entitlement Apple).
- Scheduler production trên Render (chưa deploy).
- Push/background location khi app killed (cần device thật).
- DB health trên Render production (cần deploy + check endpoint thật).
- Cron fail-fast behavior trên Render (cần deploy với env var thiếu để verify log).

---

## QA-FIX-6 (14-08-2026) — Fix 4 vấn đề QA vòng 2 báo cáo

**Agent**: Super Z (main agent)
**Branch**: `feature/module-an-toan-carepartner`
**Commit**: `<TBD>` — QA-FIX-6

### Bối cảnh

QA vòng 2 (sau commit `4a4f97f` QA-FIX-5) xác nhận: migration an toàn, 169 test
pass, kiến trúc offline-cache/idempotent-batch/DB-constraint đều đã đúng. Nhưng
vẫn còn 4 vấn đề cần xử lý trước khi merge:

- **BẮT BUỘC 1**: Worker chưa đặt PIN vẫn nhận việc → miễn trừ vĩnh viễn khỏi
  xác minh ngẫu nhiên (lỗ hổng lớn).
- **BẮT BUỘC 2**: User đăng ký qua Google/Facebook không đặt được PIN do
  `set_unusable_password()` → `authenticate()` luôn fail.
- **NÊN LÀM 1**: Push type đổi từ `device_offline` sang `device_offline_critical`
  không giữ tương thích ngược → app cũ mất cảnh báo offline.
- **NÊN LÀM 2**: Batch offline flush ghi đè LiveLocation bằng điểm cũ → "nhảy lùi"
  vị trí tạm thời.
- **BONUS**: `pyyaml` thiếu trong `requirements.txt` → 5 test fail.

### Work Log

- Đọc lại state 4 vùng cần fix: `core/views.py:ApplyTaskAPIView` (line 662-728),
  `tracking/services.py:set_verification_pin` (line 765-795), push call sites
  (line 535-571, 681-698), `tracking/views.py:BatchLocationAPIView` (line 1139),
  `tracking/models.py:LiveLocation` (line 76-124).
- Thêm `PyYAML==6.0.2` vào `requirements.txt` (BONUS).
- BẮT BUỘC 1: Thêm PIN check ở `ApplyTaskAPIView.post()` TRƯỚC consent check,
  trả 403 `PIN_REQUIRED` với message tiếng Việt rõ ràng.
- BẮT BUỘC 2: Rewrite `set_verification_pin()` để phân loại user theo
  `has_usable_password()`. User email/password vẫn cần current_password đúng
  (giữ hành vi cũ). User OAuth (Google/Facebook) bỏ qua current_password, dựa
  vào JWT IsAuthenticated của endpoint. Cập nhật `SetVerificationPinSerializer`
  (current_password optional) và `SetVerificationPinAPIView.post()` (dùng `.get()`).
- NÊN LÀM 1: Thêm `legacy_type='device_offline'` vào payload push ở 2 chỗ
  (`check_offline_devices` + `retry_offline_alert_pushes`). Comment rõ ràng:
  field tạm thời, target xoá sau 2-3 tháng (~2026-11) khi 100% user đã update.
- NÊN LÀM 2: Thêm `LiveLocation.client_recorded_at` field + migration `0009`
  (nullable, an toàn cho Postgres). Cập nhật `update_worker_location` set
  `client_recorded_at = now()` cho real-time. Cập nhật `BatchLocationAPIView`
  so sánh `existing.client_recorded_at >= batch_last_recorded_at` trước khi
  update_or_create → skip nếu existing mới hơn (chống "nhảy lùi"). Backward
  compat: nếu `existing.client_recorded_at IS NULL` → luôn update (giữ behaviour
  cũ cho row cũ chưa populate field mới).
- Viết `tracking/tests_qa_fix_6.py` với 20 tests cover cả 4 fix:
  - `QAFix6B1PinRequiredToApplyTestCase` (5 tests).
  - `QAFix6B2OAuthSetPinTestCase` (8 tests).
  - `QAFix6N1LegacyPushTypeTestCase` (2 tests).
  - `QAFix6N2LiveLocationNoStaleOverwriteTestCase` (5 tests).
- Fix 1 bug phát hiện khi chạy test: `SetVerificationPinAPIView.post()` dùng
  `serializer.validated_data['current_password']` (KeyError khi field optional)
  → đổi sang `.get('current_password')`.
- Chạy test: 20/20 QA-FIX-6 PASS, 147/147 full tracking suite PASS.
- Verify `manage.py check` 0 lỗi, `makemigrations --check` "No changes detected".
- Viết `QA_FIX_6_HANDOFF.md` (handoff document).

### Stage Summary

- **4 vấn đề + 1 bonus**: TẤT CẢ đã fix + test PASS.
- **Test results**: 147 tests PASS (127 cũ + 20 mới QA-FIX-6), 0 fail.
- **Migration safety**: `0009` chỉ AddField nullable → an toàn cho Postgres/Render.
- **Files changed**:
  - `requirements.txt` (+PyYAML).
  - `core/views.py` (ApplyTaskAPIView PIN check).
  - `tracking/services.py` (set_verification_pin rewrite + legacy_type x2).
  - `tracking/serializers.py` (current_password optional).
  - `tracking/views.py` (SetVerificationPinAPIView .get() + BatchLocationAPIView skip logic).
  - `tracking/models.py` (LiveLocation.client_recorded_at).
  - `tracking/migrations/0009_qa_fix_6_livelocation_client_recorded_at.py` (NEW).
  - `tracking/tests_qa_fix_6.py` (NEW, 20 tests).
  - `QA_FIX_6_HANDOFF.md` (NEW).
- **Lựa chọn thiết kế**:
  - B2: chọn JWT IsAuthenticated (không token freshness) cho user OAuth — đơn
    giản, không tăng security mà chỉ block tính năng.
  - N1: `legacy_type` giữ 2-3 tháng (~2026-11) theo dõi analytics trước khi xoá.
- **UNTESTABLE (giữ nguyên)**: EAS Android build, custom sound device thật,
  iOS critical alert entitlement, scheduler production Render, push khi app killed.
- **Rủi ro deploy cao nhất (không phải bug code)**: kiến trúc scheduler đổi sang
  Render Cron Job — cần cấu hình tay copy `SECRET_KEY` + `DATABASE_URL` từ web
  service sang Cron Job, nếu không scheduler sẽ không chạy → tính năng offline
  detection đang chạy tốt sẽ bị gãy. Xem `QA_FIX_6_HANDOFF.md` phần "Quy trình
  deploy an toàn 5 bước".

---

## QA-FIX-7 (14-08-2026) — Đảo lại field tương thích ngược push (fix QA-FIX-6 / N1)

**Agent**: Super Z (main agent)
**Branch**: `feature/module-an-toan-carepartner`
**Commit**: `<TBD>` — QA-FIX-7

### Bối cảnh

QA vòng 3 phát hiện QA-FIX-6 / N1 (tương thích ngược push type) KHÔNG hoạt động
thật. Field `legacy_type='device_offline'` vô dụng vì app mobile CŨ (nhánh main)
chỉ check `if (data.type === 'device_offline')` — nó không biết field
`legacy_type` tồn tại. Vì `data.type` giờ là `'device_offline_critical'`, app
cũ KHÔNG match → mất hoàn toàn cảnh báo (y hệt như trước khi "sửa"). Test
QA-FIX-6 chỉ assert 2 field có mặt trong dict, KHÔNG mô phỏng logic if-check
thật của app cũ → test PASS nhưng chức năng không hoạt động.

### Work Log

- Đọc state: tracking/services.py (push call sites), core/views.py (ALERT_CONFIG
  + send_expo_push_notification), mobile/src/screens/Parent/LiveTrackingScreen.js
  (notification listener + triggerAlarmSound), mobile/App.js (channel setup).
- Xác nhận app cũ (main) dùng `if (data.type === 'device_offline')` — chỉ check
  data.type, không check field nào khác.
- Backend tracking/services.py: đảo payload ở 2 chỗ (check_offline_devices +
  retry_offline_alert_pushes). Trước: type='device_offline_critical' +
  legacy_type='device_offline'. Sau: type='device_offline' + critical=True.
- Backend core/views.py: thêm helper _resolve_alert_type() — khi
  type='device_offline' VÀ critical=True → trả 'device_offline_critical' để tra
  ALERT_CONFIG (channel emergency-alerts, còi to). Không có critical → trả
  nguyên type='device_offline' (channel critical_alerts, basic — backward compat
  với backend cũ hơn nữa).
- Mobile LiveTrackingScreen.js: cập nhật notification listener — đổi điều kiện
  if từ `(data.type === 'device_offline' || data.type === 'device_offline_critical')`
  về ĐƠN GIẢN `if (data.type === 'device_offline')` (y hệt app cũ). Bên trong,
  check `data.critical === true` để quyết định: critical=True → playEmergencyAlarm
  (còi to); critical falsy → chỉ Vibration (fallback basic).
- Mobile LiveTrackingScreen.js: cập nhật triggerAlarmSound() nhận tham số
  isCritical, chỉ playEmergencyAlarm nếu critical=True. Local notification data
  cũng đổi theo: type='device_offline' + critical: isCritical.
- Mobile App.js: cập nhật comment mô tả channel emergency-alerts (logic channel
  setup không đổi).
- Tests tracking/tests_qa_fix_6.py::QAFix6N1LegacyPushTypeTestCase: cập nhật 2
  test cũ + thêm 4 test mới (tổng 6 tests cho N1):
  + test_n1_initial_alert_payload_qa_fix_7 — assert type='device_offline' +
    critical=True, KHÔNG còn legacy_type.
  + test_n1_retry_push_payload_qa_fix_7 — tương tự cho retry push.
  + test_n1_old_app_logic_matches_new_payload_initial_alert — MÔ PHỎNG logic
    app cũ `if (data.type === 'device_offline')` cho initial alert → phải match.
  + test_n1_old_app_logic_matches_new_payload_retry_push — tương tự cho retry.
  + test_n1_send_expo_push_notification_resolves_critical_to_emergency_channel —
    end-to-end: type+critical → channel 'emergency-alerts'.
  + test_n1_send_expo_push_notification_without_critical_uses_basic_channel —
    backward compat: không có critical → channel 'critical_alerts' (basic).
- Chạy test: 24/24 QA-FIX-6 PASS, 151/151 full suite (core+payments+moderation+
  tracking) PASS.
- Verify `manage.py check` 0 lỗi, `makemigrations --check` "No changes detected"
  (không đổi model → không có migration mới).
- Viết QA_FIX_7_HANDOFF.md.

### Stage Summary

- **Vấn đề duy nhất còn lại**: ĐÃ FIX.
- **Test results**: 151 tests PASS (147 cũ + 4 mới thêm cho QA-FIX-7), 0 fail.
- **No migration**: QA-FIX-7 không đổi model → không có migration mới.
- **Files changed**:
  - `tracking/services.py` (đảo payload 2 chỗ).
  - `core/views.py` (thêm _resolve_alert_type + comment).
  - `mobile/src/screens/Parent/LiveTrackingScreen.js` (notification listener +
    triggerAlarmSound).
  - `mobile/App.js` (comment update).
  - `tracking/tests_qa_fix_6.py` (cập nhật 2 test N1 cũ + thêm 4 test mới).
  - `QA_FIX_7_HANDOFF.md` (NEW).
- **Lựa chọn thiết kế**:
  - Tên field: `critical` (ngắn gọn, semantic rõ, JS convention cho flag trong
    JSON object).
  - Backward compat 2 lớp: app cũ match `data.type='device_offline'`; backend
    cũ không set critical → channel basic (không crash).
  - Target xoá flag critical: 2-3 tháng sau release (~2026-11), cùng thời điểm
    kế hoạch dọn dẹp mobile cũ.
- **UNTESTABLE (giữ nguyên)**: EAS Android build, custom sound device thật,
  iOS critical alert, scheduler production Render, push khi app killed.
- **Rủi ro deploy cao nhất (KHÔNG phải bug code, giữ nguyên QA-FIX-6)**:
  kiến trúc scheduler đổi sang Render Cron Job — cần cấu hình tay copy
  SECRET_KEY + DATABASE_URL từ web service sang Cron Job. Xem QA_FIX_7_HANDOFF.md
  phần "Quy trình deploy an toàn 5 bước".

---

## A2 — Ghép việc thông minh theo lịch rảnh CarePartner (2026-08-22)

- Merged feature/a2-smart-availability vào main (merge commit de4f4d1)
- QA passed: 225/225 tests, web+mobile+backend đồng bộ
- Remote branch feature/a2-smart-availability đã xoá
- **Fix lỗi công bằng phân việc**: workload_day/week giờ tính đúng cả task đã completed, không còn xếp ngang hàng ưu tiên với worker chưa có việc. Merged vào main (2a476cc), QA passed 228/228 tests.
- Remote branch fix/a2-workload-completed-tasks đã xoá sau merge.
- A2 hoàn thiện và ổn định trên toàn hệ thống (backend + web + mobile). Chuyển sang B1.

## B1 — Nhật ký chăm sóc thật (Care Diary) (2026-08-22)

### Công việc đã làm
- Tạo module Django mới `care_diary/` theo đúng §16.3 AGENTS.md (module isolation, chỉ phụ thuộc core).
- 3 models: CareDiaryEntry (OneToOne Task), CareDiaryActivity (timeline), CareDiaryAttachment (ảnh).
- 4 API endpoints: POST/PATCH worker tạo/sửa nhật ký, GET xem nhật ký, POST upload ảnh đính kèm.
- Service layer (`care_diary/services.py`) theo §15.3: business logic tách biệt khỏi views.
- Stats (đếm activities theo status) tính động, không lưu field riêng.
- Mobile Parent: sửa CareDiaryDetailScreen nối API thật, xoá mock data + comingSoonBanner, thêm loading/empty/error states.
- Mobile Worker: tạo CareDiaryFormScreen hoàn chỉnh (mood, activities động, upload ảnh), thêm entry point nút "Ghi nhật ký chăm sóc" trong MyJobsScreen.
- Đăng ký route CareDiaryForm trong AppNavigator (worker section).
- 26 test cases bao phủ: happy path, permission, response contract, stats, upload ảnh.

### File đã sửa/thêm
- `backend/settings.py`: thêm 'care_diary' vào INSTALLED_APPS
- `backend/urls.py`: include care_diary.urls
- `care_diary/models.py`: 3 models (CareDiaryEntry, CareDiaryActivity, CareDiaryAttachment)
- `care_diary/admin.py`: đăng ký 3 models trong Django admin
- `care_diary/services.py`: check_worker_can_write, check_can_read, build_entry_response
- `care_diary/views.py`: 3 APIView (WorkerCareDiaryAPIView, CareDiaryDetailAPIView, WorkerCareDiaryAttachmentAPIView)
- `care_diary/urls.py`: 3 URL patterns
- `care_diary/tests.py`: 26 test cases trong 6 class
- `care_diary/migrations/0001_initial.py`: migration cho 3 models
- `mobile/src/api/careDiary.js`: 4 hàm API client
- `mobile/src/screens/Parent/CareDiaryDetailScreen.js`: nối API thật, xoá mock
- `mobile/src/screens/Worker/CareDiaryFormScreen.js`: MỚI — form ghi/sửa nhật ký
- `mobile/src/screens/Worker/MyJobsScreen.js`: thêm nút "Ghi nhật ký chăm sóc"
- `mobile/src/navigation/AppNavigator.js`: thêm route CareDiaryForm
- `mobile/src/mocks/careDiaryMock.js`: XOÁ — không còn dùng

### Lệnh đã chạy
- `python manage.py startapp care_diary`
- `python manage.py makemigrations care_diary`
- `python manage.py migrate`
- `python manage.py test --verbosity=2` → 254/254 OK

### Bug fix lượt QA (commit trên branch feature/b1-nhat-ky-cham-soc)
Sửa 9 bug do QA Agent phát hiện:
- **BUG-01 (CRITICAL)**: `CareDiaryFormScreen.js` crash khi mount do dùng `Animated.Value`/`Animated.timing` mà không import `Animated`. Xoá toàn bộ đoạn `fadeAnim`/`useRef`/`Animated.timing` dead code (màn hình form không cần animation này), xoá luôn import `ANIM` và `useRef` thừa.
- **BUG-02/03/04 (HIGH)**: `completion_percent` không validate → crash 500 khi giá trị âm (IntegrityError) hoặc không phải số (ValueError). Thêm `parse_completion_percent()` trong `services.py`, gọi ở cả `post()` và `patch()` trong `views.py`, bắt `ValueError` trả 400 với message tiếng Việt.
- **BUG-05 (MEDIUM)**: `PATCH` không truncate `mood_icon`/`mood_label` (khác với `post()` đã có `[:30]`/`[:100]`), có thể crash 500 trên PostgreSQL. Thêm `FIELD_MAX_LENGTH` dict trong `patch()` để truncate đồng nhất.
- **BUG-06 (MEDIUM)**: `activities[].status` không validate theo `STATUS_CHOICES`. Thêm validate trước khi tạo `CareDiaryActivity` ở cả `post()` và `patch()`, trả 400 liệt kê giá trị hợp lệ.
- **BUG-07 (MEDIUM)**: Worker accepted nhưng chưa tạo entry nhận 403 thay vì 404 khi tự GET. Sửa `check_can_read()` kiểm tra `TaskApplication` accepted thay vì kiểm tra entry đã tồn tại → worker accepted chưa có entry nhận đúng 404.
- **BUG-08 (MEDIUM)**: Xem ảnh đính kèm luôn báo "Không có ảnh" do `ImagePreview` nhận `{ uri, title }` nhưng code gửi `{ imageUrl }`. Đổi thành `{ uri: att.url, title: 'Ảnh đính kèm nhật ký' }`.
- **BUG-09 (LOW)**: Nút "Ghi nhật ký" hiện trùng lặp cho task completed do `showTrackingUI` không loại trừ `task_status === 'completed'`. Thêm điều kiện `app.task_status !== 'completed'` vào khối `showTrackingUI`.
- **Tests mới**: 11 test cases trong class `EdgeCaseValidationTests` bao phủ BUG-02 đến BUG-07. Full suite: 265/265 pass (254 cũ + 11 mới).

### Lịch sử nhật ký (commit 74ea516)
Bổ sung theo spec gốc: "Parents can review this history to monitor their child's progress from session to session."
- **Backend**: `GET /api/parent/care-diary-history/` — trả danh sách rút gọn (task_id, task_title, date, mood, completion_percent, worker_name). Sắp xếp theo `task.scheduled_time DESC` (thời gian buổi chăm sóc thực tế, không phải lúc ghi). Không phân trang (codebase chưa có pattern, số lượng task/phụ huynh có giới hạn tự nhiên).
- **Service**: `get_parent_diary_history()` trong `care_diary/services.py`.
- **Mobile**: `CareDiaryHistoryScreen.js` — FlatList card tóm tắt với mood chip, % hoàn thành, tên CarePartner. Loading/error/empty states đầy đủ.
- **Entry point**: nút icon clock trong header MyTasksScreen (tab "Nhật ký"), rõ ràng, không mồ côi.
- **Route**: `CareDiaryHistory` đăng ký trong `AppNavigator.js` (Parent section).
- **API client**: `getCareDiaryHistory()` trong `mobile/src/api/careDiary.js`.
- **Tests**: 6 test mới (`DiaryHistoryTests`) — empty, parent isolation, sort order, response contract, worker 403, anonymous 401. Full suite: 271/271 pass.
### Lưu ý cho agent tiếp theo
- **Web frontend KHÔNG làm trong lượt này.** Lý do: mock data gốc và toàn bộ entry point hiện có đều chỉ ở mobile, không có tín hiệu nào cho thấy web cần tính năng này ngay. Nếu Huy muốn có bản web → đó là 1 task riêng.
- **Cho phép sửa nhật ký sau khi task completed.** Quyết định chủ động: CarePartner có thể bổ sung ghi chú sau ca làm (docstring trong WorkerCareDiaryAPIView.patch).
- **Kiến trúc module riêng `care_diary/`** thay vì đặt trong `core`. Theo đúng §15.1 Module Isolation và §16.3 (thêm module Django mới). Chỉ phụ thuộc core (1 chiều), không sửa core/models.py hay core/views.py.
- **expo-image-picker đã có sẵn** trong package.json (~17.0.11), không cần thêm dependency mới.
- **Response contract** đã đối chiếu trực tiếp code mobile: field `desc` (không phải `description`) trong activities, `avatarInitial` trong carepartner — đây là lỗi #1 từng gặp ở A2, đã kiểm tra kỹ.

### BUG-10 fix + Web frontend parity (commit 509069c)
**PHẦN 1 — BUG-10 (MEDIUM):**
- `get_parent_diary_history()`: field `date` build từ `entry.created_at` → SỬA thành `entry.task.scheduled_time`. Đúng theo comment docstring ("sắp xếp theo task.scheduled_time") nhưng code lại dùng sai.
- `build_entry_response()`: cùng bug, cùng fix.
- 2 test mới `Bug10DateFieldTests`: tạo task với `scheduled_time` 3-5 ngày trước, ghi nhật ký hôm nay, assert `date` phản ánh đúng ngày của `scheduled_time` (không chỉ check tồn tại field).

**PHẦN 2 — Web frontend parity (yêu cầu chuẩn từ nay):**
- `frontend/templates/frontend/worker_care_diary_form.html`: Form CarePartner ghi/sửa nhật ký (mood picker, completion slider, activities add/remove, note, upload ảnh multipart). Gọi POST/PATCH/attachment API thật qua apiFetch.
- `frontend/templates/frontend/parent_care_diary_detail.html`: Xem chi tiết nhật ký (carepartner info, mood, completion stats+bar, activities timeline, note, attachments gallery). Field contract khớp mobile (`desc`, `avatarInitial`...). 404 empty state thân thiện.
- `frontend/templates/frontend/parent_care_diary_history.html`: Danh sách card tóm tắt mới nhất trước. Mood chip, % badge, worker name. Loading/error/empty states.
- `frontend/views.py`: 3 TemplateView mới.
- `frontend/urls.py`: 3 URL mới.
- Entry points: sidebar "Nhật ký chăm sóc" trong `parent_home.html` + `parent_tasks.html` (sidebar + header button); nút "Ghi nhật ký" trong `worker_jobs.html` cho accepted + completed tasks.
- 6 test mới `WebPageTests`: verify 200 + HTML content cho 3 trang mới + link presence trong 2 trang có entry point. Full suite: 279/279 pass.

---

## B1 (Care Diary) merged vào main (2026-08-23)

- **Merge commit**: `f9751ec` (--no-ff, theo AGENTS.md §19)
- **QA PASS**: 279/279 tests trên main sau merge, không regression.
- **Đầy đủ parity mobile + web**: 3 màn mobile (form, detail, history) + 3 trang web tương ứng + entry points.
- **BUG-01 đến BUG-10**: toàn bộ đã sửa và verify bằng test.
- **Remote branch đã xoá**: `feature/b1-nhat-ky-cham-soc`
- **Chuyển sang B5.**

---

## B4 — Rebase B4-Rank-CarePartner lên main mới nhất (2026-08-23)

**Coding Agent**: thực hiện theo yêu cầu QA Agent — nhánh `B4-Rank-CarePartner` cũ được code trên
snapshot `e7ab6c0` (trước khi A1/A2/B1 merge vào main), nếu merge thẳng sẽ **xoá sạch A2 + B1**
(979 dòng tests_smart_match, 351 dòng tests_price_suggestion, 811 dòng care_diary/tests,
toàn bộ UI A2/B1 mobile + web, parent_profile.html...). Rebase bằng cách tái áp dụng
delta B4 thật lên main `9c14b8c`.

### Phương pháp (thay vì git rebase thuần)
- Delta thật của B4 so với base `e7ab6c0` = 24 file; chỉ 7 file trùng vùng main đã đổi
  (settings, core/models, core/serializers, core/urls, services/__init__,
  browse_candidates.html, worker_profile.html). Lịch sử 30 commit của B4 chứa nhiều
  vòng "rewrite → restore" trên cùng file → rebase thuần sẽ conflict lặp và kết quả
  cuối vẫn mang bản rewrite cũ che mất fix của main.
- **Cách làm**: nhánh mới `B4-Rank-CarePartner-rebased` từ `origin/main` (9c14b8c):
  - Copy nguyên vẹn 14 file B4-only: `core/services/tier_service.py`, `core/tier_views.py`,
    `core/signals.py`, `core/admin.py`, `core/apps.py`, `backend/tier_config.py`,
    3 file JS badge web + `_b4_tier_scripts.html`, `CarePartnerTierBadge.js`,
    `carePartnerTier.js`, `CandidatesScreen.js` + `CandidateProfileScreen.js` +
    `CandidatesScreen.styles.js` (2 screen này main không đổi từ base → phần redesign
    + badge là scope B4 hợp lệ).
  - Ghép tay 7 file chia sẻ: chỉ thêm hunks tier (giữ 100% comment/docstring + code
    A2/B1/A1 của main). B4 cũ xoá docstring PIN verification + comment geofence →
    **bỏ qua**, không mang theo.
  - Migration `0016_user_tier_and_credential_fields` → **đánh số lại 0019**, dependency
    nối sau `0018_add_availability_check_constraint` (A2) của main. Bỏ migration
    `0017_alter_profilechangerequest...` (chỉ chứa help_text changes — phụ tác của
    việc xoá comment, không thuộc scope B4).
  - `browse_candidates.html`: giữ nguyên bản main (sidebar 6-tab, smart-match rank
    badge, spinner) + `{% include 'frontend/_b4_tier_scripts.html' %}` trước `</body>`
    — runtime patch `window.renderCandidates` inject badge hạng, không đụng logic
    trang gốc. Bản rewrite 277 dòng của B4 cũ bị loại (mất fix main + escapeHtml lỗi).
  - `core/urls.py`: 5 view gốc (WorkerProfileDetail, AdminApproveWorker, AdminAllWorkers,
    WorkerSubmitCredential, AdminReviewCredential) trỏ sang `tier_views` (bản override
    có tier — main không sửa 5 class này nên override an toàn), thêm 2 URL
    `admin/workers/<id>/set-tier/` + `recompute-tier/`. Giữ nguyên comment section
    + toàn bộ URL A1/A2 của main.

### Test mới — `core/tests_tier.py` (55 tests, 8 class)
1. **ComputeTierLevelTests** (7): đúng hạng từng mức bronze/silver/gold/diamond,
   precedence diamond > gold, worker chưa duyệt luôn bronze, parent không xếp hạng.
2. **ComputeTierBoundaryTests** (11): đủ jobs thiếu rating; đủ jobs+rating thiếu reviews;
   4/5 jobs; rating đúng 4.0 (boundary inclusive); credential pending/rejected không
   lên gold; credential chuyên ngành thiếu 1 job (9/10) chỉ gold; đủ jobs nhưng
   rating 4.33 < 4.5 chỉ gold; credential thường không bao giờ diamond; application
   pending không tính completed_job; task cancelled không tính.
3. **DowngradeTests** (4): thu hồi credential gold→bronze, gold→silver; rating tụt
   silver→bronze; tier_meta snapshot đúng (completed_jobs, avg_rating, review_count,
   has_cert, has_specialized).
4. **TierOverrideTests** (6): override chặn refresh thường; force=True bỏ override;
   manual_set_by/manual_set_at vào tier_meta; hạng không hợp lệ ValueError;
   refresh trên non-worker no-op; tier_label đủ 4 mã + fallback.
5. **TierAPIPermissionTests** (12): worker/parent/anonymous KHÔNG set-tier hay
   recompute (403/401); admin set hợp lệ 200 + tier_override=True; hạng sai 400
   (message tiếng Việt); thiếu field 400; non-worker 404; user không tồn tại 404;
   recompute bỏ override về hạng đúng rule.
6. **ProfileTierReadOnlyTests** (3): GET profile trả tier/tier_label/tier_updated_at;
   PATCH tier bị bỏ qua (read-only) — worker không tự nâng hạng.
7. **TierSignalTests** (4): task completed → tự lên silver khi đủ điều kiện; review
   mới → tự lên silver; tín hiệu tôn trọng tier_override; task open không refresh.
8. **TierResponseContractTests** (8): worker profile trả tier/tier_label/tier_meta;
   candidates trả worker_tier/worker_tier_label (badge web+mobile đọc);
   admin all-workers trả tier+tier_override; approve worker → bronze;
   duyệt credential → gold; duyệt credential is_specialized + đủ điều kiện → diamond;
   submit-credential nhận field mới (credential_type/title/field).

### Kết quả
- Full suite: **334/334 PASS** (279 của main + 55 mới), không mất test cũ nào.
- `manage.py check` 0 lỗi; `makemigrations --check`: No changes detected.
- `git diff origin/main --stat`: chỉ còn scope B4 — 0 file bị xoá, không dòng nào
  đụng tests_smart_match / tests_price_suggestion / care_diary / screen-template A2/B1.
- Không force-push nhánh cũ, không tự merge vào main (nhánh mới: 
  `B4-Rank-CarePartner-rebased`).

### Lưu ý cho QA / agent tiếp theo
- `backend/tier_config.py` là module config dead (B4 định nghĩa rules trực tiếp trong
  `settings.CAREPARTNER_TIER_RULES`, tier_service đọc từ settings). Giữ nguyên để
  đúng trạng thái B4; có thể dọn ở lượt QA.
- `CandidatesScreen.js`/`CandidateProfileScreen.js` là bản redesign của B4 (comment
  "temporary minimal fix" từ tác giả B4) — main không đổi 2 file này từ base nên
  lấy nguyên bản B4. QA cần kiểm tra UI thật trên mobile.
- Endpoint mới cho QA smoke-test:
  `POST /api/admin/workers/<id>/set-tier/` (body `{"tier":"silver"}`),
  `POST /api/admin/workers/<id>/recompute-tier/`.

---

## B4 — Hoàn thiện mobile + hardening trước khi merge (2026-08-23, lượt 2)

**Coding Agent**: theo yêu cầu QA sau khi review commit `7cbde23` (rebase B4). Backend giữ
nguyên (334/334, phân quyền/migration/signal/API contract QA đã pass). Việc duy nhất: khôi
phục chức năng mobile bị mất khi gắn badge tier + hardening upload + dọn code chết.

### 1. Khôi phục chức năng bị mất trên mobile (giữ nguyên tier badge)
Phát hiện: nhánh B4 cũ thay `CandidatesScreen.js`/`CandidateProfileScreen.js` bằng bản
rewrite tối giản (comment `// SEE ARTIFACTS - temporary minimal fix`) — mất AI insights,
search/filter, và **bước xác nhận trước khi chấp nhận ứng viên** (hành động không thể hoàn
tác — tự động từ chối ứng viên khác).

Cách làm: lấy bản `origin/main` làm base cho cả 2 screen, graft ĐÚNG phần tier của B4
vào (2 việc độc lập, không xung đột):
- `CandidatesScreen.js`: khôi phục toàn bộ AI insights panel (`aiInsights`, `aiLoading`,
  `getCandidateRecommendations`, `reloadAIInsights`), search bar + filter chips
  (`FILTER_CHIPS`, `activeFilter`, `searchQuery`, `filteredCandidates`), confirm dialog.
  Thêm duy nhất 1 dòng badge `<CarePartnerTierBadge user={c} size="sm" />` trong card
  (đọc `worker_tier`/`worker_tier_label` có sẵn trong response candidates API — B4
  serializer đã trả, không cần fetch thêm).
- `CandidateProfileScreen.js`: khôi phục confirm + mọi section gốc (Kinh nghiệm & Kỹ
  năng, Bằng cấp, AI summary, Lịch rảnh mock, Đánh giá). Thay tier badge MOCK (theo
  review_count ≥ 20/50) bằng tier THẬT từ API qua component — luôn hiển thị, mặc định
  Hạng Đồng.
- Confirm luồng approve (xác nhận bằng tay — đọc code, không chỉ chạy test): cả 2 screen
  đều wrap `approveCandidate` trong `startApprove()`, chỉ được gọi khi:
  web: `window.confirm('Xác nhận: Chấp nhận ... Các ứng viên khác sẽ tự động bị từ chối.')`
  trả true; native: `Alert.alert('Xác nhận', ..., [{text:'Huỷ', style:'cancel'},
  {text:'Chấp nhận', onPress: startApprove}])`. Không có đường gọi API nào bypass confirm.

### 2. Dọn code chết — phương án (b): dùng CarePartnerTierBadge component
- Trước lượt này `CarePartnerTierBadge.js` không được import nơi nào (2 screen tự viết
  badge inline trùng lặp logic). Giờ cả 2 screen đều import + dùng component; badge
  inline bị xoá. Component thêm prop `size` (`sm` cho card danh sách, `md` cho profile
  header) để dùng được ở cả 2 bối cảnh mà không cần style override.
- Xoá `mobile/src/screens/Parent/CandidatesScreen.styles.js` — placeholder rỗng
  (`export {}`) do B4 cũ để lại, không file nào import (styles sống trong chính
  CandidatesScreen.js theo pattern main).

### 3. Hardening upload — validate MIME + dung lượng certificate_photo
`core/tier_views.py` → `WorkerSubmitCredentialAPIView.post`: thêm
`validate_credential_image()` + hằng `ALLOWED_CREDENTIAL_IMAGE_TYPES`
(jpeg/png/webp), `MAX_CREDENTIAL_IMAGE_SIZE_MB = 5`. Chặn TRƯỚC khi lưu storage, lỗi
trả 400 message tiếng Việt theo §15.6. Ghi chú: dự án chưa có helper validate upload
dùng chung (RegisterAPIView với id_card_front/back cũng chỉ check tồn tại) → định nghĩa
tại chỗ theo convention §15.4, comment giải thích rõ.

### 4. Ghi chú design choice — badge tier trên web qua runtime patch
Web hiển thị badge hạng ở `browse_candidates.html` bằng cách **patch runtime
`window.renderCandidates`** (`frontend/static/js/browse_candidates_tier_patch_b4.js`,
include qua `_b4_tier_scripts.html`): đây là lựa chọn CÓ CHỦ ĐÍCH để tránh đụng code
gốc của trang (bản rewrite 277 dòng của B4 cũ đã từng làm mất sidebar 6-tab + rank
badge A2 + spinner đã QA — không lặp lại). Script wrap `renderCandidates`, sau khi hàm
gốc render xong thì inject badge vào từng `article.candidate-card` (guard
`data-b4-tier` chống double-inject, poll 100ms × 40 chờ hàm được định nghĩa).
**Rủi ro đã biết**: nếu sau này `renderCandidates` bị đổi tên/refactor (hoặc đổi cấu
trúc card `.flex-1.min-w-0` / thứ tự card khớp index mảng candidates), patch sẽ im
lặng không hiện badge — KHÔNG crash trang (an toàn về functional, chỉ mất hiển thị
hạng). Khi refactor trang này, nên chuyển badge vào chính `renderCandidates` trong
template và xoá patch script.

### 5. Kết quả
- Full suite: **341/341 PASS** (334 cũ + 7 test mới cho validate upload:
  jpeg/png/webp pass, PDF → 400, >5MB → 400, đúng 5MB boundary → 201, chỉ mô tả
  không ảnh → 201). `manage.py check` 0 lỗi.
- Test JS mobile (`__tests__/CreateTaskScreen.pricingType.test.js`, pure logic): 6/6
  PASS. (Test QA5 flush-isolation ở `mobile/scripts/` cần @babel/register + mock
  expo — không liên quan các file lượt này, không chạy lại.)
- Syntax check JSX 4 file sửa (babel parser): OK.
- `git diff origin/main` mobile: chỉ còn tier — AI insights / search / filter /
  confirm / mọi section profile nguyên trạng.

### Lưu ý cho QA
- Endpoint `POST /api/worker/submit-credential/` giờ trả 400 kèm
  `'Ảnh bằng cấp không hợp lệ. Chỉ nhận định dạng JPEG, PNG hoặc WebP.'` hoặc
  `'Ảnh bằng cấp quá lớn (tối đa 5MB).'` — mobile/web form submit nên đọc field
  `error` như cũ.
- CandidateProfileScreen badge giờ LUÔN hiển thị (mặc định Hạng Đồng) thay vì chỉ
  hiện khi ≥ 20 review như mock cũ — đúng ý nghĩa B4 (mọi CarePartner đều có hạng).
- Worker tự xem hạng của mình trên mobile (WorkerProfileScreen) KHÔNG thuộc phạm vi
  lượt này — B4 mobile scope chỉ 2 screen parent-side theo yêu cầu QA.
