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
