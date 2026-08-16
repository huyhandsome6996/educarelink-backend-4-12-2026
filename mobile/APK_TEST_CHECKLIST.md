# APK Test Checklist — v1.1.5 (main branch)

**Date**: 2026-08-16
**Branch**: `main` (KHÔNG phải `feature/module-an-toan-carepartner`)
**Version**: 1.1.5 (versionCode 9)
**Build profile**: preview (APK, internal distribution)

---

## 📋 Pre-install

- [ ] APK file: `/home/z/my-project/download/educarelink-v1.1.5.apk`
- [ ] File size ~86 MB
- [ ] Signing cert SHA-256 matches v1.1.4 (same Expo-managed keystore)

## 🚀 Launch tests

- [ ] App opens without crash (no black screen, no RedBox error)
- [ ] Splash screen shows for ~2s → navigates to Login
- [ ] No "Cannot read property 'user' of null" error (v1.1.4 regression)
- [ ] No "TaskManager.defineTask failed" hard crash (v1.1.5 P0 fix)

## 🔐 Auth tests

- [ ] Login as `phuhuynh_test / Demo@2026` → home screen loads <5s
- [ ] Logout → login lại → không treo spinner (v1.1.3 regression test)
- [ ] Login as worker → WorkerFeed loads

## 🏠 Parent home (v1.1.5 fixes)

- [ ] Header có 4 phần: avatar (trái) + brand "EduCareLink" (giữa) + profile icon (phải) + bell (phải)
- [ ] **Tap avatar** → navigate to ParentProfile tab (v1.1.5 shortcut mới)
- [ ] **Tap profile icon (person-circle)** → navigate to ParentProfile tab (v1.1.5 shortcut mới)
- [ ] Long-press avatar → logout dialog (giữ chức năng cũ)
- [ ] Tap FAB → CreateTask screen
- [ ] Scroll mượt, không dật (v1.1.5 shadow fix)
- [ ] Bento grid 3 dịch vụ hiển thị đúng
- [ ] CarePartner gợi ý horizontal scroll mượt

## 💬 Chatbot (v1.1.5 jank fix)

- [ ] Mở Chatbot → không dật khi scroll
- [ ] Gửi 1 tin nhắn → typing indicator chạy mượt (3 dots bounce)
- [ ] Nhận phản hồi AI → bubble hiển thị đúng
- [ ] Gửi 3-5 tin nhắn liên tiếp → vẫn mượt, không lag
- [ ] Keyboard mở/đóng → input bar follow mượt

## ⚠️ Mock data screens (KHÔNG phải bug)

3 màn hình sau đang dùng **dữ liệu mẫu** (mock data), backend model chưa có.
Test thấy dữ liệu không đổi / không phản ánh trạng thái thật → **KHÔNG phải bug**:

| Screen | File | Mock source |
|---|---|---|
| **CareDiaryDetail** | `src/screens/Parent/CareDiaryDetailScreen.js` | `src/mocks/careDiaryMock.js` |
| **RewardPoints** | `src/screens/Parent/RewardPointsScreen.js` | `src/mocks/rewardPointsMock.js` (MOCK_REWARDS / MOCK_VOUCHERS / MOCK_HISTORY) |
| **WorkerScreeningStatus** | `src/screens/Worker/WorkerScreeningStatusScreen.js` | `src/mocks/workerScreeningMock.js` (MOCK_SCREENING_STATUS) |

→ Sẽ được thay bằng API thật trong phiên bản sau khi backend model sẵn sàng.

## 📍 Worker tracking (P0 verification — quan trọng)

- [ ] Worker login → MyJobsScreen loads without crash (LocationService.js import không throw)
- [ ] Bắt đầu 1 task có tracking consent → tracking start thành công
- [ ] Heartbeat gửi mỗi 30s (check log: `[HeartbeatService] Heartbeat sent`)
- [ ] Location update gửi mỗi 10s (check log: `[LocationService] Background location update sent`)
- [ ] Stop task → tracking stop, không leak interval
- [ ] Kill app → mở lại → auto-resume tracking (check log: `[LocationService] autoResume: ✅ tracking resumed`)

## 📱 Navigation

- [ ] Bottom tab 5 mục (parent): Trang chủ / Nhật ký / AI Trợ lý / Theo dõi / Tài khoản
- [ ] Bottom tab 4 mục (worker): Tìm việc / Việc của tôi / AI Trợ lý / Tài khoản
- [ ] Tab switch mượt, không dật (v1.1.5 shadow fix trên tab bar)
- [ ] Back gesture hoạt động trên cả iOS (swipe) và Android (back button)

## 🔄 Refresh

- [ ] Pull-to-refresh trên ParentHome → tasks reload
- [ ] Pull-to-refresh trên MyTasks → tasks reload
- [ ] Pull-to-refresh trên WorkerFeed → feed reload

## 🚨 Regression checklist (không được phá)

- [ ] v1.1.2 fix: ErrorBoundary hiển thị lỗi thay vì black screen
- [ ] v1.1.2 fix: Font load timeout 3s → render với system fonts nếu fail
- [ ] v1.1.2 fix: TaskManager.defineTask(BACKGROUND_FETCH_TASK) bọc try/catch
- [ ] v1.1.3 fix: Login không hang (push token fire-and-forget)
- [ ] v1.1.3 fix: Notifications timeout 8s cho getExpoPushTokenAsync
- [ ] v1.1.4 fix: AppContent nằm trong AuthProvider (useAuth() không trả null)
- [ ] v1.1.4 fix: AuthContext default value an toàn (không null)
- [ ] v1.1.5 P0: TaskManager.defineTask(LOCATION + HEARTBEAT) bọc try/catch
- [ ] v1.1.5 P0: SHADOWS thêm proper shadow props + elevation (fix jank)
- [ ] v1.1.5 P0: ChatbotScreen gỡ onContentSizeChange + move useMemo top-level
- [ ] v1.1.5 P1: package.json version sync với app.json (1.1.5)
- [ ] v1.1.5: Thêm nút profile shortcut trong ParentHome header

## 📊 Test results

| Test category | Pass | Fail | Notes |
|---|---|---|---|
| Launch | | | |
| Auth | | | |
| Parent home | | | |
| Chatbot | | | |
| Worker tracking | | | |
| Navigation | | | |
| Refresh | | | |
| Regression | | | |

**Tester**: _______________
**Date**: _______________
**Device**: _______________
**APK version**: 1.1.5 (versionCode 9)
