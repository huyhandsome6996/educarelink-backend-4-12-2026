# 🤝 NGUYÊN TẮC ĐỒNG BỘ WEB & MOBILE — EduCareLink

> **QUY TẮC SỐ 1 — BẮT BUỘC**: Bất kỳ tính năng nào được thêm/sửa trên **Web** cũng phải được thêm/sửa trên **Mobile**, và ngược lại. Hai mặt trận này PHẢI đồng bộ 100% vì chúng call chung 1 API backend Django.

---

## 📋 Mục lục

1. [Tại sao phải đồng bộ?](#1-tại-sao-phải-đồng-bộ)
2. [Kiến trúc chung](#2-kiến-trúc-chung)
3. [Quy tắc bắt buộc khi code](#3-quy-tắc-bắt-buộc-khi-code)
4. [Checklist trước khi commit](#4-checklist-trước-khi-commit)
5. [Mapping Web ↔ Mobile](#5-mapping-web--mobile)
6. [API là Single Source of Truth](#6-api-là-single-source-of-truth)
7. [Quy trình test song song](#7-quy-trình-test-song-song)

---

## 1. Tại sao phải đồng bộ?

EduCareLink có **2 mặt trận frontend** gọi chung **1 backend API**:

```
┌─────────────────┐         ┌─────────────────────────┐         ┌─────────────────┐
│   WEB (Django   │         │   BACKEND API (Django)  │         │  MOBILE (Expo)  │
│   Templates)    │ ◄─────► │   https://educarelink-  │ ◄─────► │   React Native  │
│                 │  HTTP   │   backend.onrender.com  │  HTTP   │                 │
│  HTML + JS      │  JSON   │                         │  JSON   │  JS (React)     │
└─────────────────┘         └─────────────────────────┘         └─────────────────┘
```

**Vì sao PHẢI đồng bộ?**

- Phụ huynh có thể dùng Web (desktop) hoặc Mobile (điện thoại) — tuỳ sở thích
- Carepartner (sinh viên) chủ yếu dùng Mobile khi đang làm việc (theo dõi vị trí, SOS)
- Admin có thể duyệt task trên Web ở văn phòng, hoặc duyệt trên Mobile khi đi ngoài
- Nếu 1 tính năng chỉ có ở Web → user Mobile bị thiếu → trải nghiệm đứt đoạn
- Nếu 1 tính năng chỉ có ở Mobile → user Web bị thiếu → mất khách hàng

**Ví dụ thực tế đã xảy ra:**
- Chatbot AI đã fix format gạch đầu dòng ở Web nhưng Mobile chưa → user Mobile thấy 1 cục text
- AI moderation chỉ chặn task ở API nhưng Web vẫn hiển thị task rejected → UI inconsistent
- Admin có tab "Tất cả công việc" ở Web nhưng Mobile chưa có screen → admin ngoài phố không duyệt được

---

## 2. Kiến trúc chung

### Backend (Single Source of Truth)

```
backend/
├── core/          # User, Task, TaskApplication, Review, Notification, Chatbot views
├── payments/      # MoMo escrow + cash settlement + refund
├── tracking/      # Live GPS + geofence + SOS + device offline detection
├── moderation/    # AI kiểm duyệt task + khiếu nại
├── ai_recommendations/  # AI gợi ý việc cho worker + xếp hạng ứng viên
├── performance/   # Gemini pool + 7-model fallback + LRU cache
└── frontend/      # Django templates (Web)
```

### Web (Django Templates)

```
frontend/templates/frontend/
├── splash.html              # Landing page
├── login.html               # Đăng nhập
├── register.html            # Đăng ký (parent + worker)
├── onboarding_parent.html   # Onboarding phụ huynh (6 steps)
├── onboarding_worker.html   # Onboarding carepartner (6 steps)
├── parent_home.html         # Trang chủ phụ huynh
├── task_create_1.html       # Đăng việc bước 1
├── task_create_2.html       # Đăng việc bước 2
├── parent_tasks.html        # Việc của tôi (3 tabs)
├── browse_candidates.html   # Xem ứng viên + AI recommendations
├── chatbot.html             # AI Trợ lý phụ huynh
├── review.html              # Đánh giá carepartner
├── tracking.html            # Live tracking carepartner
├── worker_feed.html         # Bảng tin việc làm
├── task_detail.html         # Chi tiết task
├── worker_jobs.html         # Việc của tôi (worker)
├── worker_profile.html      # Hồ sơ carepartner
├── worker_chatbot.html      # AI Trợ lý carepartner
├── help_center.html         # Trung tâm trợ giúp
└── admin_dashboard.html     # Dashboard admin (8 tabs)
```

### Mobile (React Native / Expo)

```
mobile/src/
├── api/                     # API clients (gọi backend)
│   ├── client.js            # Axios instance + JWT refresh
│   ├── cachedClient.js      # Cache layer (15s/30s/60s/5min)
│   ├── tasks.js             # Task + chatbot API
│   ├── admin.js             # Admin API
│   ├── tracking.js          # Tracking API
│   ├── moderation.js        # Moderation API
│   ├── payments.js          # Payments API
│   └── ai_recommendations.js
├── components/              # Shared components
│   ├── FormattedText.js     # Parse markdown AI response
│   ├── ActiveTrackingBanner.js
│   ├── TrackingConsentModal.js
│   └── NotificationBell.js
├── screens/
│   ├── Auth/                # Splash, Login, Register
│   ├── Onboarding/          # Parent + Worker onboarding
│   ├── Parent/              # 8 screens
│   ├── Worker/              # 7 screens
│   ├── Admin/               # 8 screens
│   ├── Payment/             # 3 screens
│   ├── HelpCenter/          # 1 screen
│   ├── ChatbotScreen.js     # Parent AI chat
│   ├── NotificationsScreen.js
│   └── ImagePreviewScreen.js
├── services/
│   └── LocationService.js   # Foreground service + background tracking
├── navigation/
│   └── AppNavigator.js      # Stack + Tab navigation
├── context/
│   └── AuthContext.js       # Auth state
└── theme/
    └── colors.js            # Design system (COLORS, TYPO, SHADOWS)
```

---

## 3. Quy tắc bắt buộc khi code

### 🔴 QUY TẮC 1: API thay đổi → cập nhật CẢ 2 frontend

Khi thêm/sửa endpoint backend:
1. Cập nhật `core/urls.py` (hoặc module tương ứng)
2. Cập nhật view trong `core/views.py`
3. **BẮT BUỘC**: Cập nhật `mobile/src/api/<module>.js` với function tương ứng
4. **BẮT BUỘC**: Thêm/sửa screen Web (`frontend/templates/frontend/<page>.html`)
5. **BẮT BUỘC**: Thêm/sửa screen Mobile (`mobile/src/screens/<Role>/<Screen>.js`)

### 🔴 QUY TẮC 2: Thêm screen mới → register navigation

**Web**: Thêm URL trong `frontend/urls.py` + template HTML
**Mobile**: 
- Import screen trong `AppNavigator.js`
- Thêm `<Stack.Screen name="X" component={XScreen} />`
- Nếu là tab bottom navigation → thêm vào `ParentTabs()` hoặc `WorkerTabs()`

### 🔴 QUY TẮC 3: Đổi format AI response → cập nhật CẢ 2 renderer

**Web**: Dùng `formatAiResponse()` (đã có ở 4 templates: chatbot, worker_chatbot, help_center, admin_dashboard)
**Mobile**: Dùng `<FormattedText>` component (đã có ở `mobile/src/components/FormattedText.js`)

Đừng bao giờ render AI response bằng `escapeHtml(text)` trực tiếp — sẽ hiển thị 1 cục.

### 🔴 QUY TẮC 4: Đổi validation/throttling → áp dụng ở API layer

Validation phải nằm ở **backend** (serializer/view), không nằm ở frontend. Frontend chỉ làm UI validation cơ bản (empty, format). Lý do: 1 source truth, không lặp logic.

### 🔴 QUY TẮC 5: Push notification / in-app notification

Khi thêm event mới cần notify:
1. Backend: `Notification.objects.create()` + `send_expo_push_notification()`
2. Web: Poll `/api/notifications/unread-count/` mỗi 30s (đã có ở admin_dashboard.html)
3. Mobile: `<NotificationBell>` component (đã có) + Expo Notifications listener

### 🔴 QUY TẮC 6: Feature flag / env var

Nếu dùng env var để bật/tắt tính năng:
- Backend: `os.environ.get('FLAG', 'false') == 'true'`
- Web: Fetch `/api/health/` hoặc config endpoint
- Mobile: Cùng fetch config endpoint

KHÔNG hardcode `true`/`false` ở 1 bên — sẽ inconsistent.

---

## 4. Checklist trước khi commit

Trước khi commit code mới, kiểm tra:

- [ ] **Backend**: Endpoint mới đã có URL + view + serializer?
- [ ] **Web**: Đã thêm UI gọi endpoint mới?
- [ ] **Mobile**: Đã thêm API function + screen gọi endpoint mới?
- [ ] **Web**: Đã dùng `formatAiResponse()` cho AI response?
- [ ] **Mobile**: Đã dùng `<FormattedText>` cho AI response?
- [ ] **Web**: Notification mới đã poll/unread-count?
- [ ] **Mobile**: Notification mới đã có listener?
- [ ] **Both**: Error handling đã có (network error, 401, 403, 500)?
- [ ] **Both**: Loading state đã có (spinner/skeleton)?
- [ ] **Both**: Empty state đã có (icon + text + CTA)?
- [ ] **Mobile**: Đã register screen trong AppNavigator?
- [ ] **Mobile**: Đã import vào AdminDashboard/ParentHome/WorkerFeed nếu là quick action?

---

## 5. Mapping Web ↔ Mobile

### Auth & Onboarding

| Tính năng | Web Template | Mobile Screen |
|---|---|---|
| Splash/Landing | `splash.html` | `SplashScreen.js` |
| Login | `login.html` | `LoginScreen.js` |
| Register | `register.html` | `RegisterScreen.js` |
| Parent onboarding | `onboarding_parent.html` | `ParentOnboardingScreen.js` |
| Worker onboarding | `onboarding_worker.html` | `WorkerOnboardingScreen.js` |

### Parent Flow

| Tính năng | Web Template | Mobile Screen |
|---|---|---|
| Parent home | `parent_home.html` | `ParentHomeScreen.js` |
| Create task (step 1) | `task_create_1.html` | `CreateTaskScreen.js` |
| Create task (step 2) | `task_create_2.html` | (merged into CreateTaskScreen) |
| My tasks | `parent_tasks.html` | `MyTasksScreen.js` |
| Browse candidates | `browse_candidates.html` | `CandidatesScreen.js` + `CandidateProfileScreen.js` |
| AI Chatbot | `chatbot.html` | `ChatbotScreen.js` |
| Review | `review.html` | `ReviewScreen.js` |
| Live tracking | `tracking.html` | `LiveTrackingScreen.js` |
| Upgrade to carepartner | (in parent_home) | `UpgradeToCarepartnerScreen.js` |

### Worker Flow

| Tính năng | Web Template | Mobile Screen |
|---|---|---|
| Worker feed | `worker_feed.html` | `WorkerFeedScreen.js` |
| Task detail | `task_detail.html` | `TaskDetailScreen.js` |
| My jobs | `worker_jobs.html` | `MyJobsScreen.js` |
| Worker profile | `worker_profile.html` | `WorkerProfileScreen.js` |
| Worker AI chatbot | `worker_chatbot.html` | `WorkerChatbotScreen.js` |
| Complaint | (in worker_profile) | `ComplaintScreen.js` + `MyComplaintsScreen.js` |

### Admin Flow

| Tính năng | Web (tab trong admin_dashboard.html) | Mobile Screen |
|---|---|---|
| Pending workers | Tab "Chờ duyệt" | `AdminDashboardScreen.js` (tab 'pending') |
| All workers | Tab "Tất cả Carepartner" | `AdminDashboardScreen.js` (tab 'workers') |
| **All tasks** (mới) | Tab "Tất cả công việc" | `AdminAllTasksScreen.js` |
| All users | Tab "Quản lý tài khoản" | `AdminDashboardScreen.js` (tab 'users') |
| Credentials | Tab "Bằng cấp CP" | `AdminReviewScreen.js` |
| Send notification | Tab "Gửi thông báo" | `AdminSendNotificationScreen.js` |
| Profile changes | Tab "Yêu cầu sửa hồ sơ" | `AdminReviewScreen.js` |
| AI Chat | Tab "AI Trợ lý" | `AdminChatbotScreen.js` |
| Moderation queue | (Quick Action "Kiểm duyệt") | `AdminModerationScreen.js` |
| Payments | (Quick Action "Thanh toán") | `AdminPaymentsScreen.js` |
| Tracking overview | (Quick Action "Tracking") | `AdminTrackingOverviewScreen.js` |

### Payment & Help

| Tính năng | Web | Mobile |
|---|---|---|
| Payment setup | (in parent_tasks) | `PaymentSetupScreen.js` |
| My earnings | (in worker_profile) | `MyEarningsScreen.js` |
| Settlement detail | (in worker_profile) | `SettlementDetailScreen.js` |
| Help center | `help_center.html` | `HelpCenterScreen.js` |

---

## 6. API là Single Source of Truth

### Tất cả endpoints phải có ở CẢ 2 frontend

Nếu endpoint `/api/X/` tồn tại, Web và Mobile đều phải gọi được. Không có endpoint "chỉ dành cho Web" hoặc "chỉ dành cho Mobile".

### Format response thống nhất

- List response: `[item1, item2, ...]` (array)
- Detail response: `{field1, field2, ...}` (object)
- Error response: `{"error": "message", "detail": "..."}` (object)
- Pagination: chưa dùng (list trả all), nếu sau này cần thì dùng DRF pagination chuẩn

### Auth token

- Web: lưu trong `localStorage` (key: `access_token`, `refresh_token`)
- Mobile: lưu trong `AsyncStorage` (cùng key)
- Cả 2 dùng `Authorization: Bearer <token>` header

### File upload

- Web: `<input type="file">` + FormData
- Mobile: `expo-image-picker` + FormData
- Cả 2 gửi `multipart/form-data` đến cùng endpoint

---

## 7. Quy trình test song song

### Khi test tính năng mới, test ở CẢ 2 frontend:

```
1. Test backend API bằng curl/Postman → OK
2. Test Web UI → phải thấy data đúng
3. Test Mobile UI → phải thấy data đúng
4. Test realtime sync:
   - Web tạo task → Mobile reload → phải thấy task mới
   - Mobile accept task → Web reload → phải thấy task in_progress
   - Web admin duyệt → Mobile parent reload → phải thấy notification
5. Test edge cases:
   - Network error cả 2 frontend
   - 401 token hết hạn cả 2 frontend
   - Empty state cả 2 frontend
```

### Production URL test

- Backend API: `https://educarelink-backend.onrender.com/api/`
- Web: `https://educarelink-backend.onrender.com/` (Django serve templates)
- Mobile: Expo Go app (dev) hoặc APK (production)

### Demo accounts

| Vai trò | Username | Password |
|---|---|---|
| Admin | `admin` | `Demo@2026` |
| Phụ huynh | `phuhuynh_test` | `Demo@2026` |
| Carepartner | `sinhvien_test` | `Demo@2026` |

---

## 📌 Ghi nhớ cho AI Agent

> **KHI THÊM TÍNH NĂNG MỚI, LUÔN HỎI:**
> 
> 1. Tính năng này có cần hiển thị ở Web không? → Có → Thêm template HTML
> 2. Tính năng này có cần hiển thị ở Mobile không? → Có → Thêm screen JS
> 3. API endpoint đã có chưa? → Chưa → Thêm backend
> 4. Đã register navigation Mobile chưa?
> 5. Đã thêm API function ở `mobile/src/api/` chưa?
> 6. Đã test ở CẢ 2 frontend chưa?
> 
> **KHÔNG BAO GIỜ** commit code chỉ update 1 frontend mà quên bên kia.

---

## 🔄 Cập nhật

- **Tạo bởi**: QA Agent (Super Z)
- **Ngày tạo**: 2026-07-11
- **Cập nhật lần cuối**: 2026-07-11
- **Commit reference**: `683d06a` (admin all-tasks + chatbot safety + mobile sync)

---

*File này là **BIBLE** cho mọi AI Agent làm việc với EduCareLink. Đọc trước khi code, đọc khi review, đọc khi commit.*
