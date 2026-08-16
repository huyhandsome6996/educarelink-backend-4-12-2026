# Pull Request: Tích hợp module an toàn CarePartner vào main

**Branch:** `feature/tich-hop-module-an-toan-carepartner` → `main`
**Trạng thái:** DRAFT — Code-ready, chờ build APK để xác nhận cuối
**Tác nhân tạo:** Super Z (main agent)
**Ngày tạo:** 2026-08-16 (Asia/Bangkok)

---

## 1. Mục đích PR

Tích hợp toàn bộ feature/module-an-toan-carepartner (safety module) vào nhánh `main`, bao gồm:

1. **OfflineLocationQueue** — cache điểm vị trí vào SQLite khi mất mạng, flush theo task_id (không trộn điểm giữa các task).
2. **RandomVerificationModal** — modal full-screen pop-up ngẫu nhiên yêu cầu CarePartner xác nhận đang ở đúng vị trí.
3. **VerificationPinSetupModal** — CarePartner đặt/đổi mã PIN từ màn Profile, dùng cho xác thực random check.
4. **DeviceOfflineAlert** — backend tự tạo alert khi CarePartner offline quá lâu, parent nhận push notification.
5. **Scheduler backend** — cron job kiểm tra offline + retry push cho alert chưa acknowledged.

Đồng thời **giữ nguyên** 3 fix crash-on-launch đã có trên main + P0 fix mới:
- v1.1.2 (màn đen): ErrorBoundary + Font.loadAsync timeout + try/catch BACKGROUND_FETCH_TASK
- v1.1.3 (treo login): syncPushTokenToBackend fire-and-forget, không block login flow
- v1.1.4 (crash useAuth null): default context có `user: null, isLoading: true` + no-op functions
- v1.1.5 P0 (LocationService defineTask top-level crash): try/catch quanh cả LOCATION_TASK_NAME và HEARTBEAT_TASK_NAME

---

## 2. Phạm vi thay đổi

### 2.1. Mobile (React Native / Expo SDK 54)

**Files mới (5):**
- `mobile/src/services/OfflineLocationQueue.js` — SQLite-based queue
- `mobile/src/components/RandomVerificationModal.js` — full-screen modal
- `mobile/src/components/VerificationPinSetupModal.js` — PIN setup modal
- `mobile/src/api/tracking.js` (extend) — 4 new API calls (setVerificationPin, getPendingCheck, respondCheck, cancelCheck)
- `mobile/src/components/TrackingConsentModal.js` (extend) — consent UI

**Files sửa (10+):**
- `mobile/App.js` — thêm RandomVerificationModal render trong AppContent; move useTaskEndedListener vào AppContent (cần useAuth)
- `mobile/src/context/AuthContext.js` — thêm user_id storage + cleanupOnLogout; GIỮ main's defensive default context + fire-and-forget push token
- `mobile/src/services/LocationService.js` — full rewrite với offline queue + try/catch cả 2 defineTask (P0 fix)
- `mobile/src/screens/Worker/WorkerProfileScreen.js` — thêm VerificationPinSetupModal
- `mobile/src/screens/Worker/LiveTrackingScreen.js` — thêm EmergencyAlarmService + acknowledgeOfflineAlert + isLocationOffline/isLocationStale
- `mobile/app.json` — bump version 1.4.0, versionCode 10
- `mobile/package.json` — thêm expo-sqlite + @react-native-community/netinfo + expo-splash-screen sync

**Version bump:** 1.1.5 (main) + 1.3.0 (feature) → **1.4.0** (versionCode 10)

### 2.2. Backend (Django)

**Migrations mới (7 file, purely additive):**
- `0003_randomverificationcheck_and_more.py`
- `0004_locationhistory_client_recorded_at_and_more.py`
- `0005_deviceofflinealert_acknowledged_by_and_more.py`
- `0006_qa_fix_2_idempotent_batch_and_constraints.py`
- `0007_alter_deviceheartbeat_device_status_and_more.py`
- `0008_qa_fix_5_scheduler_health.py`
- `0009_qa_fix_6_livelocation_client_recorded_at.py`

→ `makemigrations --check --dry-run`: **No changes detected** (models aligned với migrations)

**API endpoints mới (14 endpoints, all backward compatible):**
- `POST /api/tracking/verification-pin/set/`
- `GET /api/tracking/verification-checks/pending/`
- `POST /api/tracking/verification-checks/<id>/respond/`
- `POST /api/tracking/verification-checks/<id>/cancel/`
- `GET /api/tracking/<task_id>/verification-checks/history/`
- `GET /api/tracking/admin/verification-checks/`
- `POST /api/tracking/admin/trigger-verification-check/`
- `POST /api/tracking/admin/run-verification-check/`
- `GET /api/tracking/admin/verification-scheduler/stats/`
- `GET /api/tracking/admin/overview/`
- `POST /api/tracking/admin/run-offline-check/`
- `POST /api/tracking/admin/run-retry-push/`
- `GET /api/tracking/<task_id>/offline-alerts/`
- `POST /api/tracking/<task_id>/offline-alerts/<id>/acknowledge/`

→ Tổng cộng sau merge: **28 endpoints api/tracking/*** (từ 14 cũ lên 28, tất cả load qua URL resolver)

**Settings:**
- `backend/settings.py`: thêm `SiteAccessGateMiddleware`, `TRACKING_SCHEDULER_IN_WEB_WORKER`
- `requirements.txt`: thêm `PyYAML`

**render.yaml:** thêm cron job cho tracking scheduler (deploy cần re-import Blueprint + set SECRET_KEY/DATABASE_URL cho cron, sync: false)

---

## 3. Tiêu chí merge (Ready to Merge Checklist)

### 3.1. Code-level verification — ĐÃ PASS ✓

| # | Bước | Kết quả | Lần chạy cuối |
|---|------|---------|---------------|
| 1 | `npm install` sync package-lock.json | ✓ up to date, 464 packages | 2026-08-16 13:13 ICT |
| 2 | Babel parse toàn mobile (76 file .js/.jsx) | ✓ 76/76 PASS, 0 syntax/import error | 2026-08-16 13:14 |
| 3 | `npx expo-doctor` | ✓ 18/18 checks pass, no issues | 2026-08-16 13:14 |
| 4 | Mobile flush isolation test (6 scenarios) | ✓ 6/6 PASS | 2026-08-16 13:14 |
| 5 | Metro bundle `expo export --platform android` | ✓ 4.03 MB HBC, compile success | 2026-08-16 13:17 |
| 6 | Backend 5 QA suites (tests_qa_fixes + fix_2/3/5/6) | ✓ 137 tests pass, 55s | 2026-08-16 13:14 |
| 7 | Backend full tracking suite | ✓ 151 tests pass, 61s | 2026-08-16 13:14 |
| 8 | `manage.py check` | ✓ 0 issues | 2026-08-16 13:14 |
| 9 | `makemigrations --check --dry-run` | ✓ No changes detected | 2026-08-16 13:14 |
| 10 | API backward compat — URL resolver | ✓ 28 endpoints api/tracking/* load | 2026-08-16 13:14 |

### 3.2. Regression check — 3 fix crash-on-launch INTACT ✓

- **v1.1.2 (màn đen):** ErrorBoundary wraps App (App.js:361-363), Font.loadAsync + 3s timeout (App.js:268), try/catch BACKGROUND_FETCH_TASK (App.js:45-58). ✓
- **v1.1.3 (treo login):** syncPushTokenToBackend fire-and-forget (AuthContext.js:120, 158 — KHÔNG await trong login flow). ✓
- **v1.1.4 (crash useAuth null):** default context `{ user: null, isLoading: true, ...no-op }` (AuthContext.js:19-21). ✓

### 3.3. P0 fix — TaskManager.defineTask try/catch INTACT ✓

- LOCATION_TASK_NAME (LocationService.js:74-137): try { defineTask } catch (e) { console.warn non-fatal }. ✓
- HEARTBEAT_TASK_NAME (LocationService.js:145-178): try { defineTask } catch (e) { console.warn non-fatal }. ✓

### 3.4. Feature integration — 3 safety features WIRED ✓

- **OfflineLocationQueue**: import + flushOfflineQueue(userId) trong LocationService.js (dòng 36-38, 297, 317, 364). ✓
- **RandomVerificationModal**: render trong AppContent (App.js:328) — full-screen modal dùng chung cho mọi screen. ✓
- **VerificationPinSetupModal**: render trong WorkerProfileScreen.js (dòng 354) + API setVerificationPin (src/api/tracking.js:80-81). ✓

### 3.5. APK build + device test — TẠM HOÃN ⏸

- **Lý do:** User yêu cầu đổi tài khoản build Expo trước khi build APK (account `huyhandsome` hết quota Free plan tháng 8/2026, reset 01/09/2026).
- **Bước bị hoãn:** Giai đoạn 5, bước 21 — `eas build -p android --profile preview` + checklist test tay trên thiết bị thật.
- **Trạng thái:** "Sẵn sàng về code, chờ build APK để xác nhận cuối".
- **Lúc nào unblock:** Khi user đổi tài khoản build, sẽ request build APK + chạy `APK_TEST_CHECKLIST.md` trên thiết bị thật.

---

## 4. Migration safety

- 7 migrations mới (0003-0009) **purely additive** trên main's 0001-0002.
- Không field/model conflicts. Không rename, không drop column.
- `makemigrations --check` xác nhận không drift giữa models và migrations.
- **Existing APK v1.1.5 (versionCode 6-9) tiếp tục work** sau khi backend deploy — API backward compat 100%.

---

## 5. Render deployment notes

render.yaml có cron job mới cho tracking scheduler. Deploy yêu cầu:

1. Re-import Blueprint trên Render dashboard (để nhận cron job mới).
2. Set env vars cho cron job: `SECRET_KEY`, `DATABASE_URL` (sync: false — cron cần riêng vì worker khác web service).
3. Auto-deploy của web service sẽ chạy `python manage.py migrate` tự động → áp dụng 7 migrations mới.
4. Test health check sau deploy: `GET /api/tracking/health/` → 200 OK.

---

## 6. Reviewer checklist (cho tester / review agent)

### 6.1. Code review (không cần chạy code)

- [ ] Đọc `mobile/src/services/LocationService.js` — verify cả 2 defineTask có try/catch non-fatal.
- [ ] Đọc `mobile/App.js` — verify ErrorBoundary + Font.loadAsync timeout + RandomVerificationModal render trong AppContent.
- [ ] Đọc `mobile/src/context/AuthContext.js` — verify default context không phải null + syncPushTokenToBackend fire-and-forget.
- [ ] Đọc `mobile/src/services/OfflineLocationQueue.js` — verify queue tách theo task_id, không trộn.
- [ ] Đọc `tracking/views.py` — verify 4 endpoint verification-pin/check có permission class đúng (CarePartner-only).
- [ ] Đọc `tracking/services.py` — verify scheduler check offline + retry push có idempotent.

### 6.2. Test chạy (nếu có local env)

```bash
# Backend
cd /path/to/repo
python manage.py test tracking --verbosity=1
# Expected: 151 tests pass

# Mobile
cd mobile
npx expo-doctor
# Expected: 18/18 checks pass

node scripts/test_qa5_mobile_flush_isolation.test.js
# Expected: 6/6 pass

npx expo export --platform android
# Expected: 4.03 MB HBC, no error
```

### 6.3. Manual test (sau khi có APK)

Xem `mobile/APK_TEST_CHECKLIST.md` (114 dòng) — bao gồm:
- Launch tests (cold start, hot start, kill+relaunch)
- Auth tests (login, logout, token refresh)
- Parent home + chatbot
- Worker tracking (start, pause, resume, stop)
- Navigation 5 tabs
- Refresh pull-to-refresh
- Regression checklist cho v1.1.2 / v1.1.3 / v1.1.4 / v1.1.5
- Safety feature tests (offline queue, random check, PIN setup)

---

## 7. Known limitations

1. **CreateTaskScreen's MapPickerModal** từ feature branch **CHƯA wired in** (component tồn tại nhưng chưa integrate). Follow-up task riêng.
2. **APK build blocked** chờ user đổi tài khoản build. Code verified ready, chỉ thiếu test tay trên device thật.
3. **3 màn dùng mock data**: CareDiaryDetail / RewardPoints / WorkerScreeningStatus — backend model chưa có, dùng `src/mocks/*.js`. KHÔNG phải bug.

---

## 8. Sau khi merge

- Push origin main.
- Deploy Render (re-import Blueprint + set cron env vars).
- Test health check sau deploy.
- Build APK với tài khoản build mới (bước 21 hoãn).
- Test tay trên device thật theo `APK_TEST_CHECKLIST.md`.
- Tag release `v1.4.0` trên GitHub sau khi test tay PASS.

---

## 9. Worklog tham khảo

Xem `/home/z/my-project/worklog.md` (545 dòng) — đầy đủ work log từ v1.1.2 tới hiện tại, bao gồm:
- v1.1.2-build, v1.1.3-build, v1.1.4-build (3 fix crash-on-launch)
- feature-branch-safety-module (initial safety module)
- redesign-createtask, redesign-mytasks, redesign-register (UI redesign)
- v1.3.0-build (Warm Professionalism design system)
- v1.1.5-main-qa (P0 fix + jank fix)
- merge-safety-module-20260816 (merge work)
- merge-safety-module-20260816-reverify-noapk (re-verify sau scope change)
