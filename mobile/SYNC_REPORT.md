# 📱 EduCareLink Mobile — Sync Report

Báo cáo đồng bộ mobile app với web app. Tất cả thay đổi **chỉ nằm trong `mobile/`** — không đụng tới backend, web, payments module.

## 📊 Tóm tắt thay đổi

### Files SỬA (12 files):
| File | Thay đổi |
|------|---------|
| `mobile/package.json` | Thêm `expo-auth-session`, `expo-facebook`, `expo-web-browser` |
| `mobile/src/api/auth.js` | Thêm OAuth (Google, Facebook) + Upgrade to Carepartner |
| `mobile/src/api/tasks.js` | Thêm `updateTaskStatus`, `sendWorkerChatMessage`, `sendHelpCenterMessage`, `submitCredential`, `requestProfileChange`, `calculateDistance` |
| `mobile/src/context/AuthContext.js` | Thêm `loginWithOAuth`, `refreshUser`, `completeOnboardingInContext`, handle `first_login` |
| `mobile/src/navigation/AppNavigator.js` | Wire 12 screens mới + Onboarding flow + Admin flow + 4th worker tab |
| `mobile/src/screens/Auth/LoginScreen.js` | Thêm OAuth buttons (Google + Facebook) + expo-auth-session |
| `mobile/src/screens/Auth/RegisterScreen.js` | Thêm OAuth buttons |
| `mobile/src/screens/Parent/MyTasksScreen.js` | Thêm nút Hoàn thành/Huỷ việc + Payment Setup trigger + NotificationBell |
| `mobile/src/screens/Parent/ParentHomeScreen.js` | Thêm NotificationBell + Upgrade to Carepartner banner |
| `mobile/src/screens/Worker/MyJobsScreen.js` | Thêm NotificationBell |
| `mobile/src/screens/Worker/WorkerFeedScreen.js` | Thêm NotificationBell wired |
| `mobile/src/screens/Worker/WorkerProfileScreen.js` | Thêm menu: Thu nhập, Gửi bằng cấp, Yêu cầu sửa hồ sơ, Help Center + 2 modal + NotificationBell |

### Files MỚI (15 files):
| File | Mô tả |
|------|------|
| `mobile/src/api/notifications.js` | API thông báo (3 endpoints) |
| `mobile/src/api/onboarding.js` | API onboarding (1 endpoint) |
| `mobile/src/api/payments.js` | API thanh toán (12 endpoints) |
| `mobile/src/api/admin.js` | API admin (11 endpoints) |
| `mobile/src/components/NotificationBell.js` | Component chuông thông báo có badge + slide-down panel + polling 30s |
| `mobile/src/screens/NotificationsScreen.js` | Full-screen notifications list + mark-all-read |
| `mobile/src/screens/Onboarding/ParentOnboardingScreen.js` | 4 slides onboarding cho parent |
| `mobile/src/screens/Onboarding/WorkerOnboardingScreen.js` | 4 slides onboarding cho worker |
| `mobile/src/screens/Payment/PaymentSetupScreen.js` | Parent chọn MoMo Escrow hoặc Tiền mặt + redirect MoMo |
| `mobile/src/screens/Payment/MyEarningsScreen.js` | Worker: tổng quan thu nhập + recent payments |
| `mobile/src/screens/Payment/SettlementDetailScreen.js` | Worker: chi tiết kỳ thanh toán + QR MoMo |
| `mobile/src/screens/Worker/WorkerChatbotScreen.js` | AI chatbot riêng cho worker (4th tab) |
| `mobile/src/screens/HelpCenter/HelpCenterScreen.js` | AI Help Center + quick questions |
| `mobile/src/screens/Admin/AdminDashboardScreen.js` | Admin basic: pending workers + approve/reject + seed demo |
| `mobile/src/screens/Parent/UpgradeToCarepartnerScreen.js` | Parent → Worker upgrade với upload CCCD |

## ✅ Tính năng đã đồng bộ với Web

| # | Tính năng Web | Mobile | Status |
|---|---------------|--------|--------|
| 1 | Đăng nhập + Đăng ký | ✅ đã có | Vẫn giữ |
| 2 | Chatbot AI (Parent) | ✅ đã có | Vẫn giữ |
| 3 | Notifications (chuông + panel + mark-read) | ✅ mới thêm | Đã sync |
| 4 | Onboarding lần đầu (parent + worker) | ✅ mới thêm | Đã sync |
| 5 | Hoàn thành / Huỷ việc (parent) | ✅ mới thêm | Đã sync |
| 6 | Setup thanh toán MoMo/Tiền mặt | ✅ mới thêm | Đã sync |
| 7 | Worker: My Earnings + Settlements + QR | ✅ mới thêm | Đã sync |
| 8 | Worker Chatbot (4th tab) | ✅ mới thêm | Đã sync |
| 9 | Help Center (AI hỗ trợ) | ✅ mới thêm | Đài sync |
| 10 | Submit Credential (gửi bằng cấp) | ✅ mới thêm | Đã sync |
| 11 | Profile Change Request | ✅ mới thêm | Đã sync |
| 12 | Upgrade to Carepartner | ✅ mới thêm | Đã sync |
| 13 | OAuth Google + Facebook | ✅ mới thêm | Đã sync |
| 14 | Admin Dashboard (basic) | ✅ mới thêm | Đã sync |
| 15 | Tất cả API endpoints (core + payments) | ✅ đầy đủ | Đã sync |

## ⚙️ Setup sau khi pull

```bash
cd mobile
npm install
# Để test OAuth:
# 1. Tạo Google OAuth Client ID tại https://console.cloud.google.com/apis/credentials
# 2. Tạo Facebook App tại https://developers.facebook.com/apps/
# 3. Set backend env vars: GOOGLE_OAUTH_CLIENT_ID, FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
# 4. Restart backend trên Render
npx expo start
```

## 📝 Cách build APK

```bash
cd mobile
# Install EAS CLI
npm install -g eas-cli

# Login vào Expo account
eas login

# Build APK (chạy trên device thật)
eas build -p android --profile preview

# Hoặc build AAB (production, upload Google Play)
eas build -p android --profile production
```

File `eas.json` đã có sẵn trong project với 2 profiles:
- `preview` → build APK unsigned (test)
- `production` → build AAB (release)

## ⚠️ Lưu ý

1. **KHÔNG đụng backend, web, payments** — tất cả thay đổi chỉ trong `mobile/`
2. Mobile app gọi **cùng API endpoints** như web (Django backend trên Render)
3. Push notifications cần build APK/AAB thật (không hoạt động trên Expo Go SDK 53+)
4. OAuth cần config Google Client ID + Facebook App ID trên backend trước khi test
5. MoMo Payment cần config `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY` trên backend (đã có trong module `payments/`)

## 🚀 Status

- ✅ Mobile app đồng bộ 100% với web (về API endpoints + tính năng)
- ✅ Web app + backend hoàn toàn nguyên vẹn
- ✅ Render deployment không bị ảnh hưởng
- ✅ Sẵn sàng build APK test

---

*Generated by sync-mobile-with-web task — 2026-06-17*
