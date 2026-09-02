# EduCareLink — Báo Cáo Test Toàn Diện

**Ngày**: 2026-07-24
**Branch**: main (đã sync với origin/main — commit `ca9f6d7`)
**Phương pháp**: Automated API testing (127 endpoints) + Static code analysis (mobile + web frontend)

---

## Tổng Quan

| Phạm vi | Tổng bugs | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|---|
| Backend API | 5 | 0 | 2 | 3 | 0 | 0 |
| Mobile App | 34 | 4 | 8 | 12 | 10 | 6 |
| Web Frontend | 30 | 4 | 6 | 10 | 10 | 0 |
| **TỔNG CỘNG** | **69** | **8** | **16** | **25** | **20** | **6** |

---

## CRITICAL — Phải Fix Ngay (8 bugs)

### C1. [MOBILE] Push token projectId sai — Push notification thất bại hoàn toàn
- **File**: `mobile/src/utils/notifications.js:46`
- **Vấn đề**: `getExpoPushTokenAsync({ projectId: 'educarelink' })` nhưng `app.json` có `eas.projectId: "3e841ddf-23c3-42ce-a2e1-8827c06311a2"`. Expo Push API yêu cầu **EAS project ID (UUID)**, không phải slug.
- **Hậu quả**: Push tokens được tạo nhưng invalid — tất cả push notification đến mobile đều silent fail.
- **Fix**: Đổi thành `projectId: '3e841ddf-23c3-42ce-a2e1-8827c06311a2'`.

### C2. [MOBILE] Navigation đến screen không tồn tại `SettlementList`
- **File**: `mobile/src/screens/Payment/MyEarningsScreen.js:112`
- **Vấn đề**: `navigation.navigate('SettlementList')` — screen `SettlementList` không được đăng ký trong `AppNavigator.js`. Tên đúng là `SettlementDetail`.
- **Hậu quả**: Bấm "Xem chi tiết" trong MyEarnings sẽ crash hoặc silent fail.
- **Fix**: Đổi thành `navigation.navigate('SettlementDetail', { settlementId: item.id })`.

### C3. [WEB] `tracking.html` dùng sai localStorage token key
- **File**: `frontend/templates/frontend/tracking.html`
- **Vấn đề**: Dùng `localStorage.getItem('access_token')` trong khi `login.html` lưu token với key `'token'`. Tất cả template khác đều dùng `'token'`.
- **Hậu quả**: Trang tracking **hoàn toàn bịbroken** — user luôn bị redirect về `/login/`.
- **Fix**: Đổi `'access_token'` thành `'token'`.

### C4. [WEB] XSS via innerHTML — `worker_jobs.html`
- **File**: `frontend/templates/frontend/worker_jobs.html:587-670`
- **Vấn đề**: `render()` dùng `innerHTML` với task data (`task_title`, `task_location`, `task_price`, `parent_username`) **không escape HTML**. `contactParent('${a.parent_username}')` đưa username vào JS string trong `onclick` — nếu username chứa single quote sẽ break JS string và enable injection.
- **Hậu quả**: Stored XSS — malicious task data có thể inject scripts vào browser của carepartner.
- **Fix**: Dùng `escapeHtml()` (đã có sẵn trong file) cho tất cả data inject qua innerHTML.

### C5. [WEB] XSS via innerHTML — `worker_feed.html`
- **File**: `frontend/templates/frontend/worker_feed.html:518-577, 819-829`
- **Vấn đề**: `renderTasks()` inject `t.title`, `t.location`, `t.parent_name`, `t.price` trực tiếp vào innerHTML. AI recommendations panel cũng inject `t.title`, `rec.reason`, `t.location` không escape.
- **Hậu quả**: Stored XSS — phụ huynh độc hại tạo task với HTML/script trong title sẽ execute trong browser của carepartner.
- **Fix**: Escape tất cả user-controllable data trước khi innerHTML insertion.

### C6. [WEB] XSS via innerHTML — `parent_home.html`
- **File**: `frontend/templates/frontend/parent_home.html:603-671`
- **Vấn đề**: `renderTaskCard()` dùng `task.title`, `task.location`, `task.price` trong template literals gán cho innerHTML mà không escape.
- **Hậu quả**: Stored XSS potential.
- **Fix**: Dùng `escapeHtml()` cho tất cả dynamic data trong innerHTML.

### C7. [MOBILE] Test credentials sai trong LoginScreen
- **File**: `mobile/src/screens/Auth/LoginScreen.js:187-188`
- **Vấn đề**: Test account hiển thị password `password123` nhưng thực tế password là `Demo@2026`.
- **Hậu quả**: Mọi tester dùng DEV hint sẽ fail login.
- **Fix**: Cập nhật thành `Demo@2026`.

### C8. [MOBILE] Duplicate `Notifications.setNotificationHandler` gây override conflict
- **File**: `mobile/src/utils/notifications.js:5-11` VÀ `mobile/src/screens/Parent/LiveTrackingScreen.js:24-45`
- **Vấn đề**: Cả 2 file gọi `Notifications.setNotificationHandler()`. Vì `LiveTrackingScreen` load sau, nó override handler global từ `utils/notifications.js`.
- **Hậu quả**: Notification behavior thay đổi không predict được tùy screen đang mount.
- **Fix**: Giữ chỉ MỘT `setNotificationHandler` call, xử lý notification priority trong listener callback.

---

## HIGH — Fix trong tuần này (16 bugs)

### H1. [API] Worker truy cập `/api/parent/my-tasks/` không có role check
- **Endpoint**: `GET /api/parent/my-tasks/`
- **Expected**: HTTP 403
- **Actual**: HTTP 200 (trả về array rỗng `[]`)
- **Fix**: Thêm `if request.user.role != 'parent': return 403`

### H2. [API] Parent truy cập `/api/worker/my-jobs/` không có role check
- **Endpoint**: `GET /api/worker/my-jobs/`
- **Expected**: HTTP 403
- **Actual**: HTTP 200 (trả về array rỗng `[]`)
- **Fix**: Thêm `if request.user.role != 'worker': return 403`

### H3. [API] Worker xem được candidates của parent's task
- **Endpoint**: `GET /api/parent/tasks/{task_id}/candidates/`
- **Expected**: HTTP 403
- **Actual**: HTTP 200 (trả về candidate data)
- **Fix**: Thêm ownership check — chỉ parent sở hữu task mới xem được.

### H4. [WEB] XSS via innerHTML — `worker_profile.html`
- **File**: `frontend/templates/frontend/worker_profile.html:1551-1568, 1741-1759`
- **Vấn đề**: `renderNotifications()` inject `${n.title}` và `${n.message}` vào innerHTML không escape. `renderCredentials()` inject `${c.description}` và `${c.admin_review}` không escape.
- **Fix**: Áp dụng `escapeHtml()` cho tất cả notification và credential data.

### H5. [WEB] XSS trong Toast Messages — Nhiều templates
- **Files**: `chatbot.html:477`, `task_create_1.html:662-663`, `worker_chatbot.html:465`, `help_center.html:499`
- **Vấn đề**: Tất cả `showToast()` dùng `${message}` trong innerHTML không escape.
- **Fix**: Dùng `textContent` hoặc `escapeHtml()`.

### H6. [WEB] XSS trong onclick handlers — `admin_dashboard.html`
- **File**: `frontend/templates/frontend/admin_dashboard.html:1705, 1710, 1724`
- **Vấn đề**: Photo URLs (`s.certificate_photo`) được interpolate vào `onclick` handlers không escape.
- **Fix**: Dùng data attributes và event delegation thay vì inline onclick.

### H7. [WEB] Broken function call — `admin_dashboard.html`
- **File**: `frontend/templates/frontend/admin_dashboard.html:1672, 1679`
- **Vấn đề**: Code gọi `toast()` nhưng function này **không tồn tại**. Tên đúng là `showToast()`.
- **Hậu quả**: ReferenceError khi review credential submission — không có user feedback.
- **Fix**: Đổi `toast()` thành `showToast()`.

### H8. [WEB] XSS via innerHTML — `browse_candidates.html`
- **File**: `frontend/templates/frontend/browse_candidates.html:690-773`
- **Vấn đề**: `renderCandidates()` inject `c.worker_name` vào innerHTML, bao gồm trong `onclick` handler — chỉ escape single quote nhưng không escape ký tự problematic khác.
- **Fix**: Dùng `escapeHtml()` và data attributes.

### H9. [MOBILE] AsyncStorage stored JWT tokens không encrypted
- **File**: `mobile/src/utils/storage.js:33,57,78`
- **Vấn đề**: Khi `SecureStore` unavailable (emulators, some devices), fallback về `AsyncStorage` lưu plain text. JWT tokens bị store unencrypted.
- **Fix**: Dùng `expo-crypto` để encrypt values, hoặc log security warning.

### H10. [MOBILE] `isRefreshing` flag race condition
- **File**: `mobile/src/api/client.js:63-155`
- **Vấn đề**: `processQueue` reject queued promises khi refresh fail. Nếu `isRefreshing` flag được set trong `finally` block, second 401 có thể start parallel refresh attempt.
- **Fix**: Reset `isRefreshing = false` TRƯỚC khi gọi `processQueue`.

### H11. [MOBILE] `useEffect` missing dependency — stale callbacks
- **File**: `mobile/src/screens/Parent/LiveTrackingScreen.js:103-112`
- **Vấn đề**: `useEffect` depends on `[fetchLive, fetchDeviceStatus]` nhưng taskId có thể undefined khi component mount.
- **Fix**: Thêm `taskId` vào useEffect dependency array trực tiếp.

### H12. [MOBILE] Missing cleanup cho `Animated.loop` — memory leak
- **File**: `mobile/src/screens/Worker/WorkerFeedScreen.js:80-89`, `mobile/src/screens/Parent/ParentHomeScreen.js:45-54`
- **Vấn đề**: `Animated.loop(...)` start trong `useEffect` nhưng không có cleanup function.
- **Fix**: Store animation reference và call `.stop()` trong cleanup.

### H13. [MOBILE] `WorkerProfileScreen` `changeForm` init với stale data
- **File**: `mobile/src/screens/Worker/WorkerProfileScreen.js:26-32`
- **Vấn đề**: `useState` initializer chạy 1 lần. Nếu `user` null khi mount, `changeForm` sẽ init với empty strings.
- **Fix**: Dùng `useEffect` để sync `changeForm` khi `user` thay đổi.

### H14. [MOBILE] `Linking.openURL('tel:')` không có phone number
- **File**: `mobile/src/screens/Parent/LiveTrackingScreen.js:157,169,181,194`
- **Vấn đề**: Nhiều chỗ gọi `Linking.openURL('tel:')` không có phone number. Trên Android có thể crash.
- **Hậu quả**: Nút "Gọi Carepartner" không gọi được ai.
- **Fix**: Pass `workerPhone` qua navigation param.

### H15. [MOBILE] Array index as key trong removable lists
- **File**: `mobile/src/screens/Worker/ComplaintScreen.js:152`
- **Vấn đề**: `evidence.map((ev, idx) => <View key={idx} ...>)` — dùng array index làm key khi items có thể bị remove.
- **Fix**: Gán unique ID cho mỗi evidence item.

### H16. [MOBILE] No `useCallback` cho `handleApply`
- **File**: `mobile/src/screens/Worker/WorkerFeedScreen.js:96-126`
- **Vấn đề**: `handleApply` được recreate mỗi render, mỗi `renderItem` nhận function reference mới.
- **Fix**: Wrap `handleApply` trong `useCallback`.

---

## MEDIUM — Fix trong tháng (25 bugs)

### Backend API
1. **[API] Profile PATCH silently ignore read-only fields** — `PATCH /api/profile/` với `role`, `auth_provider`, `is_approved` trả 200 thay vì 400. File: `core/serializers.py`
2. **[API] Worker create task trả 400 thay vì 403** — Permission check xảy ra sau validation. File: `core/views.py`
3. **[API] Worker xem được candidates** — (đã mention ở H3)

### Mobile App
4. **[MOBILE] `app.json` thiếu `expo-secure-store` plugin** — `mobile/app.json:60-83`
5. **[MOBILE] `google-services.json` referenced nhưng có thể không tồn tại** — `mobile/app.json:55`
6. **[MOBILE] Version mismatch** — `package.json` 1.0.0 vs `app.json` 1.1.0
7. **[MOBILE] Duplicate `relativeTime` function** — `NotificationBell.js:21-36` và `NotificationsScreen.js:19-34`
8. **[MOBILE] Unused `Image` import** — `LoginScreen.js:6`
9. **[MOBILE] Geofence error flow double-return** — `CreateTaskScreen.js:140-142`
10. **[MOBILE] MoMo pay_url fallback missing** — `PaymentSetupScreen.js:52-69`
11. **[MOBILE] Missing null check `task.location`** — `WorkerFeedScreen.js:131` — crash khi search
12. **[MOBILE] Duplicate `backgroundColor` in styles** — `ActiveTrackingBanner.js:108,116`
13. **[MOBILE] Operator precedence issue in `getCategoryIconByName`** — `categoryIcons.js:39`
14. **[MOBILE] Cross-navigator navigation edge case** — `NotificationBell.js:228`

### Web Frontend
15. **[WEB] Inconsistent CSS files** — 4 CSS builds khác nhau across templates
16. **[WEB] Massive code duplication — apiFetch()** — copy-pasted trong 12+ templates
17. **[WEB] Massive code duplication — Toast system** — 6+ implementations khác nhau
18. **[WEB] Massive code duplication — Sidebar & Navigation** — subtle differences
19. **[WEB] Inconsistent bottom nav items (Worker pages)** — 3, 4, or 5 items tùy page
20. **[WEB] Hardcoded URLs** — `tracking.html`, `worker_chatbot.html`, `help_center.html`, `admin_dashboard.html`
21. **[WEB] Missing admin role check client-side** — `admin_dashboard.html`
22. **[WEB] Leaflet map init trên hidden elements** — `task_create_1.html:980`
23. **[WEB] `task_create_2.html` là dead/unused page**
24. **[WEB] Year mismatch copyright** — `register.html` hiển thị `© 2025`

---

## LOW — Nice to have (20 bugs)

### Mobile App (10)
1. **[MOBILE] 74+ console.log statements trong production code**
2. **[MOBILE] Dynamic import không cần thiết** — `AuthContext.js:78-80`
3. **[MOBILE] Inline HTML string ~50 lines** — `LiveTrackingScreen.js:275-309`
4. **[MOBILE] `refreshUser` silently swallows errors** — `AuthContext.js:113-121`
5. **[MOBILE] `expo-updates` installed nhưng disabled** — `package.json:29` vs `app.json:14`
6. **[MOBILE] `react-dom` và `react-native-web` unnecessary** — `package.json:32,36`
7. **[MOBILE] `expo-web-browser` unused** — `package.json:30`
8. **[MOBILE] `expo-battery` peer dep check** — `package.json:17`
9. **[MOBILE] DateTimePicker conditional import** — `CreateTaskScreen.js:11-14`
10. **[MOBILE] useEffect dependency trên stable callback** — `NotificationsScreen.js:59`

### Web Frontend (10)
11. **[WEB] No CSRF token trong login form** — low risk (JWT auth)
12. **[WEB] `performance.js` chỉ dùng 1 template**
13. **[WEB] Inconsistent greeting logic** — time-based vs no prefix
14. **[WEB] Missing `escapeHtml` trong static templates**
15. **[WEB] QR auto-login credentials trong URL**
16. **[WEB] Inline styles cho layout**
17. **[WEB] Duplicate register functionality**
18. **[WEB] Missing loading state** — `tracking.html`, `help_center.html`
19. **[WEB] Mobile page transition blocks links** — 300ms delay
20. **[WEB] Inconsistent date formatting**

---

## INFO (6)

1. **[MOBILE] Tất cả navigation routes match screen files** (trừ SettlementList)
2. **[MOBILE] API endpoints consistent với backend**
3. **[MOBILE] Theme system consistent** — bTaskee orange theme
4. **[MOBILE] Auth flow well-structured** — JWT + SecureStore + refresh
5. **[MOBILE] LocationService robust** — background tasks + heartbeat
6. **[MOBILE] `expo-image` used consistently**

---

## Khuyến Nghị Ưu Tiên

### Fix ngay (Tuần này)
1. **C1** — Push token projectId sai (mobile push hoàn toàn broken)
2. **C2** — SettlementList navigation crash
3. **C3** — tracking.html token key sai (trang broken)
4. **C4-C6** — XSS vulnerabilities trong 4 templates
5. **C7** — Test credentials sai
6. **H7** — admin_dashboard.html broken `toast()` call

### Fix sớm (Tuần sau)
7. **H1-H3** — API role checks
8. **H4-H8** — XSS trong remaining templates
9. **H14** — LiveTrackingScreen phone call buttons
10. **M11** — WorkerFeedScreen null crash

### Fix dần (Tháng)
11. **M15-M24** — CSS consistency, code duplication, dead code
12. **L1-L20** — Nice-to-have improvements

---

*Báo cáo được tạo bởi automated testing + static code analysis — 2026-07-24*
*Tổng: 127 API endpoint tests + 35+ mobile files + 20 web templates*
