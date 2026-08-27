# EduCareLink v1.2.0 — Partner Demo Handoff

**Ngày phát hành**: 2026-08-16
**Branch**: `feature/module-an-toan-carepartner`
**Commit**: `9e5f71e` (appVersionSource remote→local) trên `211e122` (bump versionCode 2→7)
**Build ID (EAS)**: `7b0c8f21-3e8c-4efe-98cb-37361524c655`

---

## 1. APK Download

| Thông tin | Giá trị |
|---|---|
| **Direct APK URL** | https://expo.dev/artifacts/eas/pemjI-S0r9XhcFlM584JOuCvY8bNHdy9UmzJ_sEJRHc.apk |
| **Expo dashboard** | https://expo.dev/accounts/huyhandsome/projects/educarelink/builds/7b0c8f21-3e8c-4efe-98cb-37361524c655 |
| **Local path** | `/home/z/my-project/download/educarelink-v1.2.0.apk` |
| **Package** | `com.educarelink.app` |
| **versionCode** | **7** (lớn hơn v1.1.4 versionCode=6 → Android sẽ chấp nhận install là upgrade) |
| **versionName** | `1.2.0` |
| **targetSdk / minSdk** | 35 / 24 (Android 7.0+) |
| **Kích thước** | 86.6 MB |

### Signing key (must match previous install)
- **SHA-256**: `b38ea394df9528a3d869b3c384b1d571035b6ab8ffb82da75f8dc6fdd1ddf7ac`
- **SHA-1**: `4afc02eb0834ab18b92fc8a313fa72a051d961cf`
- Trùng khớp 100% với v1.1.4 (build `4cd1d5e3` trên nhánh main) → Android sẽ coi đây là update, không phải install mới.

---

## 2. Hướng dẫn cài đặt

### Nếu trên máy đã có v1.1.4 (hoặc v1.1.3):
1. **KHÔNG cần gỡ v1.1.4** — Android sẽ tự nâng cấp.
2. Mở link APK trực tiếp ở trên trên điện thoại.
3. Browser tải file `.apk` xong → bấm **Open** → **Install** → **Update**.
4. Mở app → đăng nhập lại (token sẽ hết hạn sau lần update do app reset).

### Nếu gặp lỗi "Chưa cài đặt được ứng dụng do gói cài về không hợp lệ":
- Chụp màn hình báo lại. Nguyên nhân gần như chắc chắn là:
  - Máy còn versionCode ≥ 7 của bản build khác (không phải bản này).
  - Hoặc APK bị corrupt trong quá trình download (thử tải lại).
- **Fix tạm**: gỡ app cũ (Settings → Apps → EduCareLink → Uninstall) rồi install APK mới. Lưu ý: gỡ app sẽ mất PIN cá nhân đã đặt — cần đặt lại.

---

## 3. Tóm tắt thay đổi v1.1.4 → v1.2.0

### P0-P3 (feature/module-an-toan-carepartner)
| Priority | Task | Status |
|---|---|---|
| **P0** | `verify_render_env.sh` script + `README_RENDER_CRON_SETUP.md` | ✅ |
| **P1** | `OFFLINE_THRESHOLD_SECONDS` 90→60 + grep tất cả "90s" | ✅ |
| **P2** | `GPS_BYPASS_BACKLOG.md` (2 security issues documented) | ✅ |
| **P3a** | expo-doctor 18/18 pass | ✅ |
| **P3b** | eas.json preview profile (distribution=internal, buildType=apk, không Play Store) | ✅ |
| **P3c** | Build APK thành công | ✅ |
| **P3d** | `mobile/APK_TEST_CHECKLIST.md` manual test checklist | ✅ |

### Mobile UX
| Task | Status |
|---|---|
| **Map picker** cho phụ huynh khi tạo task (Leaflet + OpenStreetMap, search + reverse geocode + use current GPS) | ✅ |
| **Fix keyboard che input** ở 3 màn chatbot (ChatbotScreen, WorkerChatbotScreen, AdminChatbotScreen) — chuyển KeyboardAvoidingView behavior sang `height` cho Android | ✅ |

### Bug fixes (v1.1.2 → v1.1.4 giữ nguyên)
- v1.1.2: black screen → ErrorBoundary + font fallback + 3s timeout
- v1.1.3: login hang 5+ phút → push token timeout + fire-and-forget
- v1.1.4: crash "Cannot read property 'user' of null" → AppContent component + safe default context value

---

## 4. Test Results

### Backend
```
$ python manage.py check
System check identified no issues (0 silenced).

$ python manage.py makemigrations --check --dry-run
No changes detected

$ python manage.py test core payments moderation tracking
Ran 151 tests in 61.499s
OK
```

### Mobile
```
$ node scripts/test_qa5_mobile_flush_isolation.test.js
Results: 6 passed, 0 failed (total 6)
```

### Expo
```
$ npx expo-doctor
Running 18 checks on your project...
18/18 checks passed. No issues detected!
```

### Integration smoke test (full demo flow)
Script: `/home/z/my-project/scripts/smoke_test_v120.py`

```
[P1] POST /api/auth/login/ (parent)            HTTP 200, has_token=True, role=parent
[P2] GET  /api/profile/ (parent)               HTTP 200, user=demo_parent, has_expo_push_token_field=True
[P3] POST /api/tasks/ (with map coords+geo)    HTTP 201, id=1
     lat=10.7769, lng=106.7009, geofence_lat=10.7769, geofence_radius=500.0m
[W1] POST /api/auth/login/ (worker)            HTTP 200, has_token=True
[W2] POST /api/worker/tasks/1/apply/           HTTP 201  (consent_tracking=True)
[P3.5] POST /api/parent/applications/1/approve/ HTTP 200  (worker accepted)
[W3] POST /api/tracking/location/batch/        HTTP 201  (heartbeat accepted)
[W4] POST /api/tracking/verification-pin/set/  HTTP 200  (PIN changed)
[P4] GET  /api/tracking/verification-checks/pending/ HTTP 200, count=0
[P5] GET  /api/parent/tasks/1/candidates/      HTTP 200
[P6] POST /api/chatbot/ (parent AI)            HTTP 200

ALL SMOKE TESTS COMPLETED
```

### APK verification
```
$ aapt dump badging educarelink-v1.2.0.apk | head -1
package: name='com.educarelink.app' versionCode='7' versionName='1.2.0' ...

$ apksigner verify --print-certs educarelink-v1.2.0.apk | head -3
Signer #1 certificate SHA-256 digest: b38ea394df9528a3d869b3c384b1d571035b6ab8ffb82da75f8dc6fdd1ddf7ac
→ matches v1.1.4 cert
```

---

## 5. Demo Script cho đối tác

### Setup (5 phút)
1. Cài APK v1.2.0 lên điện thoại Android (theo link ở Section 1).
2. Đăng ký 2 tài khoản trên app (hoặc dùng tài khoản demo nếu đối tác có sẵn):
   - 1 tài khoản **Phụ huynh** (Parent)
   - 1 tài khoản **Carepartner** (Worker)
3. Admin duyệt cả 2 tài khoản (truy cập `/admin/` nếu cần).

### Demo flow (15-20 phút)
**Phần 1 — Tạo việc với bản đồ (mobile UX mới)**
1. Phụ huynh đăng nhập → bấm **"+"** tạo việc mới.
2. Điền tiêu đề, mô tả (gợi ý: "Gia sư Tiếng Anh lớp 6 - 3 buổi/tuần").
3. Bấm nút **"Bản đồ"** cạnh ô địa điểm → mở Map Picker.
4. Tap vào bản đồ chọn vị trí hoặc gõ địa chỉ → bấm **Xác nhận**.
5. Bật **"Yêu cầu theo dõi vị trí Carepartner"** → nhập bán kính 500m.
6. Chọn ngày giờ → bấm **Đăng lên cộng đồng**.

**Phần 2 — Carepartner nhận việc + chia sẻ vị trí**
1. Carepartner đăng nhập (trên máy khác hoặc sau khi logout).
2. Vào **"Tìm việc"** → thấy task vừa đăng.
3. Bấm **"Ứng tuyển ngay"** → app hỏi **"Đồng ý chia sẻ vị trí?"** → bấm Đồng ý.
4. Vào **Hồ sơ → Đặt mã cá nhân** → nhập PIN 4-6 số (lưu ý: phải có PIN mới nhận việc được).

**Phần 3 — Phụ huynh duyệt + Carepartner bắt đầu**
1. Phụ huynh vào **"Việc của tôi"** → thấy 1 ứng viên.
2. Bấm vào task → bấm **"Duyệt"** cạnh tên carepartner.
3. Carepartner vào **"Việc của tôi"** → task đã được duyệt → bấm **"Bắt đầu"**.
4. Carepartner di chuyển (hoặc giả lập) → phụ huynh mở task thấy vị trí real-time trên bản đồ.

**Phần 4 — Tính năng an toàn**
- **SOS**: Carepartner bấm nút SOS (trong task đang làm) → phụ huynh nhận notification + chuông báo động.
- **Xác minh ngẫu nhiên**: Hệ thống tự tạo check ngẫu nhiên → carepartner nhận push → phải nhập PIN đúng trong 60 giây. Nếu sai/hết hạn → phụ huynh nhận cảnh báo.
- **Geofence**: Nếu carepartner rời vùng an toàn 500m → parent nhận cảnh báo.

**Phần 5 — AI Chatbot**
- Phụ huynh vào **"Trợ lý AI"** → gõ câu hỏi → AI trả lời.
- Test: bàn phím không che ô nhập liệu nữa (đã fix).

---

## 6. Known Issues / Chưa fix

### GPS_BYPASS_BACKLOG.md (2 issues documented nhưng chưa fix)
1. **Location permission bypass**: Carepartner tắt location permission trong Android Settings → heartbeat vẫn gửi (GPS=null) → backend nghĩ vẫn online. Cần detect `null` GPS và mark offline sau threshold.
2. **Mock GPS detection**: Chưa detect khi carepartner dùng app fake GPS. Cần check `Location.isFromMockProvider()` trên Android.

Cả 2 đã có proposed fix + migration plan + test cases trong `GPS_BYPASS_BACKLOG.md`. Sẽ fix ở v1.3.0 — không ảnh hưởng demo.

### Không liên quan đến Play Store
- Build này là **internal distribution only** — không có Play Store signing config.
- Không có `google-services.json` (đã remove ở commit `e56ce64`).
- `appVersionSource: local` để app.json versionCode được tôn trọng.

---

## 7. Rollback Plan

Nếu v1.2.0 có vấn đề nghiêm trọng:
1. Yêu cầu user gỡ app v1.2.0.
2. Install lại v1.1.4 từ: https://github.com/huyhandsome6996/educarelink-backend-4-12-2026/releases/download/v1.1.4-android/educarelink-v1.1.4.apk
3. Backend không có migration mới (tất cả migrations đã chạy từ v1.1.0) → không cần rollback DB.

---

## 8. Files tạo/sửa trong session này

| File | Action | Purpose |
|---|---|---|
| `mobile/app.json` | Sửa | version 1.1.0→1.2.0, versionCode 2→7 |
| `mobile/package.json` | Sửa | version 1.1.0→1.2.0 |
| `mobile/eas.json` | Sửa | appVersionSource remote→local (root cause fix) |
| `/home/z/my-project/scripts/smoke_test_v120.py` | Tạo | Integration smoke test 10 endpoints |
| `/home/z/my-project/scripts/poll_build_v120.sh` | Tạo | EAS build polling script |
| `/home/z/my-project/download/educarelink-v1.2.0.apk` | Tải về | Final APK |

**Không chạm vào code logic QA-FIX-1 đến QA-FIX-7.**
