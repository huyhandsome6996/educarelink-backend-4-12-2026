# EDUCARELINK — REPO ANALYSIS, TESTING & FIXING GUIDE
> File hướng dẫn chi tiết dành cho AI Agent đọc, phân tích, kiểm thử, sửa lỗi toàn bộ repo `educarelink-backend-4-12-2026` (web + mobile) MÀ KHÔNG làm sập hệ thống đang chạy.

---

## 0. THÔNG TIN TRUY CẬP REPO

| Thông tin | Giá trị |
|---|---|
| **GitHub Repo** | `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026` |
| **PAT (Classic)** | `<GITHUB_PAT_USER_CUNG_CAP>` |
| **Web production** | Đang deploy trên Render — **KHÔNG ĐƯỢC ĐỤNG VÀO** |
| **Mobile** | Cần kiểm thử end-to-end và đảm bảo đồng bộ 100% với web |
| **Database** | Vừa được đổi + thêm tài khoản mẫu (đã ổn định) |

### Clone lệnh:
```bash
git clone https://github.com/huyhandsome6996/educarelink-backend-4-12-2026.git
cd educarelink-backend-4-12-2026
```

---

## 1. NGUYÊN TẮC AN TOÀN TỐI ƯU TIÊN (CRITICAL SAFETY RULES)

> ⚠️ **ĐỌC KỸ TRƯỚC KHI LÀM BẤT CỨ ĐIỀU GÌ**

### 1.1. KHÔNG ĐƯỢC PHÁ HỆ THỐNG
- **WEB đang chạy ổn định trên Render → KHÔNG modify, redeploy, push lên production branch web**
- Không xóa, đổi tên, migrate database production nếu không có backup
- Không thay đổi biến môi trường production
- Không push code chưa test lên branch `main` / `production`
- Mọi thay đổi phải làm trên **branch riêng** (vd: `fix/mobile-sync`, `feat/safety-feature`)
- **BACKUP trước khi sửa**: `git checkout -b backup-before-changes && git push origin backup-before-changes`

### 1.2. PHƯƠNG CHÁM LÀM VIỆC AN TOÀN
1. **Đọc trước, hiểu sau, sửa cuối cùng** — Không bao giờ sửa file khi chưa đọc xong
2. **Backup branch trước mỗi commit lớn**
3. **Test local trước khi push** — không push code lỗi
4. **Một PR một mục đích** — không gộp nhiều fix lớn vào 1 PR
5. **Có rollback plan** — ghi lại commit hash trước khi merge để có thể revert
6. **Không動 vào web production** — chỉ sửa mobile + backend API nếu cần (API cũng phải test kỹ)
7. **Không xóa dữ liệu mẫu đã có** — chỉ thêm mới

---

## 2. CẤU TRÚC REPO THỰC TẾ (đã xác minh sau khi clone)

> **Lưu ý**: Repo là **Django 5.2 monolith + DRF + Django Templates (web) + React Native Expo (mobile)** — KHÔNG phải Node.js.

```
educarelink-backend-4-12-2026/
├── backend/              # Django settings (settings.py, urls.py, wsgi.py)
├── core/                 # Main Django app (auth, profile, tasks, dashboard)
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   └── management/commands/seed_demo_data.py  # Seed script CHÍNH
├── frontend/templates/frontend/   # Web templates (Django Templates — 20 pages)
│   ├── admin_dashboard.html
│   ├── parent_home.html
│   ├── parent_tasks.html
│   ├── task_create_1.html, task_create_2.html
│   ├── task_detail.html
│   ├── worker_feed.html, worker_jobs.html, worker_profile.html
│   ├── chatbot.html, worker_chatbot.html
│   ├── tracking.html, review.html
│   ├── login.html, register.html
│   ├── onboarding_parent.html, onboarding_worker.html
│   ├── splash.html, help_center.html, browse_candidates.html
├── mobile/               # React Native (Expo SDK 54)
│   ├── App.js, app.json, eas.json
│   ├── src/
│   │   ├── api/         # API service layer
│   │   ├── components/
│   │   ├── context/
│   │   ├── navigation/
│   │   ├── screens/     # Mobile screens
│   │   ├── services/    # Background service, tracking
│   │   ├── theme/       # Design system (colors, typography)
│   │   └── utils/
│   └── DEPLOY_GUIDE.md  # Hướng dẫn build APK/AAB CH Play + App Store
├── tracking/             # Live tracking + Safety + Geofence + SOS
├── payments/             # MoMo (đã tắt) + PayOS (đang dùng)
├── moderation/           # AI Moderation (Gemini)
├── ai_recommendations/   # AI gợi ý việc + xếp hạng ứng viên
├── performance/          # Optimization module
├── docs/                 # Báo cáo + Hướng dẫn sử dụng (Word)
├── AGENTS.md             # Single source of truth cho AI agents — ĐỌC TRƯỚC KHI CODE
├── SYNC_PRINCIPLE.md     # Nguyên tắc đồng bộ web ↔ mobile
├── SECURITY_AUDIT_CHECKLIST.md  # Security audit prompt
├── EDUCARELINK_REPO_ANALYSIS_AND_TESTING_GUIDE.md  # FILE NÀY
├── manage.py
├── requirements.txt
├── Procfile, render.yaml, build.sh   # Render deployment
├── .env.example
├── seed_data.py          # CŨ — không dùng, dùng core/management/commands/seed_demo_data.py
├── keep_alive.py         # ĐÃ TẮT (KEEPALIVE_ENABLED=false)
├── prototype.html, mobile-prototype.html  # Static prototype CŨ — không dùng
├── mobile_preview/index.html  # Static preview CŨ — không dùng
├── db.sqlite3            # Dev database (SQLite)
└── skills-lock.json
```

### 2.1. Thông tin quan trọng đã xác minh

| Trường | Giá trị |
|---|---|
| **Backend** | Django 5.2.15 + DRF 3.17.1 + SimpleJWT |
| **Database dev** | SQLite (`db.sqlite3`) |
| **Database prod** | PostgreSQL qua `DATABASE_URL` (Supabase) |
| **Web frontend** | Django Templates (HTML + JS) — KHÔNG phải React |
| **Mobile** | React Native (Expo SDK 54) — `mobile/` |
| **Production URL** | `https://educarelink-backend.onrender.com` |
| **Auth** | JWT (SimpleJWT) — access 60m, refresh 30d |
| **AI provider** | Google Gemini (`gemini-2.5-flash`) |
| **Payment** | PayOS (VietQR) — MoMo đã tắt nhưng code còn |
| **Push notification** | Expo Push Notifications |
| **Demo password** | `Demo@2026` cho mọi tài khoản demo |
| **Timezone** | Asia/Ho_Chi_Minh (UTC+7) |
| **Ngôn ngữ commit** | Tiếng Việt (BẮT BUỘC) |

### 2.2. Tài khoản demo
- `admin` / `Demo@2026` — Admin
- `phuhuynh_test` / `Demo@2026` — Phụ huynh
- `sinhvien_test` / `Demo@2026` — Carepartner/Sinh viên
- Nhiều tài khoản khác — xem `core/management/commands/seed_demo_data.py`

---

## 3. QUI TRÌNH PHÂN TÍCH CHI TIẾT (bước 1)

### Bước 3.1. Đọc cấu trúc tổng thể
```bash
# Đọc các file gốc TRƯỚC TIÊN (theo thứ tự ưu tiên)
cat AGENTS.md                    # Single source of truth — ĐỌC TRƯỚC KHI CODE
cat SYNC_PRINCIPLE.md            # Nguyên tắc đồng bộ web-mobile
cat SECURITY_AUDIT_CHECKLIST.md  # Security audit prompt
cat requirements.txt
cat backend/settings.py
cat backend/urls.py
cat core/models.py
cat core/urls.py
cat core/views.py
cat mobile/package.json
cat mobile/app.json
cat mobile/src/api/*.js          # Xem API endpoint mapping với backend
cat mobile/src/services/*.js     # Xem background service hiện có
cat tracking/models.py
cat tracking/views.py
cat tracking/urls.py

# Đếm file theo loại
find . -name "*.py" -not -path "./.git/*" -not -path "*/node_modules/*" -not -path "*/__pycache__/*" | wc -l
find . -name "*.html" -not -path "./.git/*" | wc -l
find ./mobile -name "*.js" -not -path "*/node_modules/*" | wc -l
```

### Bước 3.2. Phân tích Backend API (Django + DRF)
Đọc và list từ `backend/urls.py` + `core/urls.py` + `tracking/urls.py` + `payments/urls.py` + `moderation/urls.py` + `ai_recommendations/urls.py`:
- [ ] Tất cả endpoints (method + path + auth required + permission class)
- [ ] Tất cả models trong `core/models.py` + `tracking/models.py` + `payments/models.py`
- [ ] Tất cả roles (Parent, Carepartner, Admin) và permission matrix
- [ ] Tất cả service types (Tutor jobs, Picking up children, Babysitting, Playing with children) — xem `Task.category` field
- [ ] Authentication mechanism (SimpleJWT)
- [ ] File upload mechanism (Pillow for CCCD/avatar)
- [ ] WebSocket / real-time endpoints (nếu có)
- [ ] Notification system (Expo Push Notifications — `expo_push_token` field trên User)
- [ ] Cron jobs / scheduled tasks (APScheduler — keepalive, anomaly detection)
- [ ] Environment variables cần thiết (xem `.env.example`)
- [ ] Rate limiting (đã có từ commit `b116d26`)
- [ ] AI integration (Gemini SDK — `google-genai`)
- [ ] Payment integration (PayOS — VietQR; MoMo đã tắt)

### Bước 3.3. Phân tích Web frontend (Django Templates)
Đọc và list từ `frontend/templates/frontend/`:
- [ ] Tất cả 20 pages và URL routing (từ `core/urls.py`)
- [ ] Component pattern (HTML partials + JS trong từng page)
- [ ] State management (localStorage, sessionStorage, cookies)
- [ ] API call patterns (fetch / axios trong JS)
- [ ] Design system (CSS — tìm `frontend/static/` hoặc inline CSS)
- [ ] Auth flow (JWT token trong cookie/localStorage)
- [ ] Real-time subscription (nếu có — có thể là polling)

### Bước 3.4. Phân tích Mobile app (React Native Expo)
Đọc và list từ `mobile/src/`:
- [ ] Tất cả screens (xem `mobile/src/screens/`)
- [ ] Navigation structure (`mobile/src/navigation/`)
- [ ] Component library (`mobile/src/components/`)
- [ ] State management (Context API — `mobile/src/context/`)
- [ ] API service layer (`mobile/src/api/`) — so sánh với backend endpoints
- [ ] Background service / native modules (`mobile/src/services/`)
- [ ] Push notification setup (expo-notifications)
- [ ] Location services (expo-location)
- [ ] Permissions requested (xem `mobile/app.json`)
- [ ] Design system (`mobile/src/theme/`)

### Bước 3.5. So sánh Web vs Mobile
Tạo bảng mapping trong `SYNC_PARITY.md`:
| Feature | Web (Django Template) | Mobile (Screen) | Backend API | Cùng API? | Parity % |
|---------|----------------------|-----------------|-------------|-----------|----------|
| Login | `login.html` | `screens/LoginScreen.js` | POST /api/auth/login/ | ✅ | ? |
| List tasks | `parent_tasks.html` | `screens/ParentTasksScreen.js` | GET /api/tasks/ | ✅ | ? |
| Task detail | `task_detail.html` | `screens/TaskDetailScreen.js` | GET /api/tasks/:id/ | ✅ | ? |
| Tracking | `tracking.html` | `screens/TrackingScreen.js` | GET /api/tracking/:bookingId/ | ✅ | ? |
| ... | ... | ... | ... | ... | ... |

---

## 4. CHUẨN BỊ MÔI TRƯỜNG TEST (bước 2)

### Bước 4.1. Cài đặt backend local (Django)
```bash
cd educarelink-backend-4-12-2026
python -m venv venv && source venv/bin/activate   # Linux/Mac
# hoặc: python -m venv venv && venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env
# Sửa .env: Điền GEMINI_API_KEY nếu test AI, KHÔNG fill DATABASE_URL (dùng SQLite local)
# KHÔNG ĐỤNG DATABASE_URL PRODUCTION (Supabase/Render) — chỉ dùng SQLite local

python manage.py migrate
python manage.py seed_demo_data   # Tạo tài khoản demo (admin, phuhuynh_test, sinhvien_test...)
python manage.py runserver        # Backend chạy tại http://127.0.0.1:8000
```

### Bước 4.2. Cài đặt web local (chỉ để test, không deploy)
Web chạy cùng backend Django (Django Templates) — KHÔNG cần cài riêng.
Chỉ cần chạy `python manage.py runserver` rồi truy cập `http://127.0.0.1:8000/`.
- KHÔNG modify production Render
- KHÔNG push code lên main branch

### Bước 4.3. Cài đặt mobile (React Native Expo SDK 54)
```bash
cd mobile
npm install  # hoặc yarn install

# Tạo file .env (nếu có pattern) hoặc sửa API_URL trong src/api/
# Trỏ API_URL về: http://127.0.0.1:8000/api (local) hoặc https://educarelink-backend.onrender.com/api (prod)

# Chạy app — chọn 1 cách:
npx expo start                     # Expo Dev Server — quét QR bằng Expo Go
# HOẶC:
npx expo start --android           # Chạy trên Android emulator
npx expo start --ios               # Chạy trên iOS simulator (cần Mac)

# Build APK cho test trên device thật:
eas build --platform android --profile preview
# Xem thêm: mobile/DEPLOY_GUIDE.md
```

### Bước 4.4. Tài khoản test (đã seed qua `python manage.py seed_demo_data`)
| Username | Password | Role |
|---|---|---|
| `admin` | `Demo@2026` | Admin (is_staff=True) |
| `phuhuynh_test` | `Demo@2026` | Phụ huynh |
| `sinhvien_test` | `Demo@2026` | Carepartner |
| (nhiều tài khoản khác) | `Demo@2026` | Xem `core/management/commands/seed_demo_data.py` |

Verify đã có:
- Sample tasks cho mỗi loại service (tutor, pickup, babysitting, playing)
- Sample bookings / applications / messages / reviews
- Sample tracking sessions + safety alerts (nếu có)

---

## 5. KIỂM THỬ END-TO-END (bước 3)

### 5.1. Test Backend API (dùng Postman / curl / Newman)
Test từng endpoint:
- [ ] **Auth**: register, login, logout, refresh token, forgot password, reset password
- [ ] **Profile**: get, update, change password, upload avatar
- [ ] **Jobs**: create, list, get by id, update, delete, search, filter
- [ ] **Bookings**: create, accept, reject, complete, cancel, history
- [ ] **Messages**: send, list conversations, mark read, delete
- [ ] **Notifications**: list, mark read, mark all read, delete
- [ ] **Reviews**: create, list, update, delete
- [ ] **Payments**: create, confirm, refund, history
- [ ] **Admin**: list users, ban/unban, verify, stats, reports
- [ ] **Safety**: enable, disable, trigger, status, history

### 5.2. Test Web (chỉ test local, không đụng production Render)
Cho mỗi role, test:
- [ ] **Parent**: đăng tin, duyệt carepartner, thanh toán, đánh giá, bật safety feature
- [ ] **Carepartner**: nhận việc, làm việc, đánh giá, nhận tiền
- [ ] **Admin**: duyệt user, duyệt tin, xem stats, xử lý report, nhận safety alert

### 5.3. Test Mobile (CHÍNH — agent phải chạy app thật)
Cho mỗi role, test trên mobile:
- [ ] **Auth flow**: login, logout, register, forgot password
- [ ] **Navigation**: tất cả tabs, screens, back button, deep links
- [ ] **Parent flow**: đăng tin, xem list carepartner, chat, thanh toán, bật safety
- [ ] **Carepartner flow**: tìm việc, nhận việc, check-in, check-out, chat
- [ ] **Admin flow**: dashboard, duyệt user/tin, xử lý report, xem safety alerts
- [ ] **Push notifications**: nhận thông báo khi có tin nhắn / việc mới / safety alert
- [ ] **Offline mode**: app xử lý khi mất mạng
- [ ] **Background mode**: app vẫn chạy khi minimize

### 5.4. Test đồng bộ Web ↔ Mobile (CRITICAL)
Scenario test:
1. **Web tạo job → Mobile thấy job mới** (polling hoặc websocket)
2. **Mobile accept job → Web cập nhật trạng thái ngay**
3. **Web chat → Mobile nhận message ngay** ( và ngược lại)
4. **Web đánh giá → Mobile thấy review**
5. **Mobile đổi avatar → Web hiển thị avatar mới**
6. **Web admin ban user → Mobile user bị logout**
7. **Mobile bật safety → Web hiển thị safety status**
8. **Mobile trigger safety alert → Web admin nhận alert ngay**

### 5.5. So sánh design parity (100%)
- [ ] Màu sắc button giống nhau
- [ ] Typography giống nhau (font, size, weight)
- [ ] Spacing / padding giống nhau
- [ ] Icon giống nhau
- [ ] Counting badge số giống nhau (vd: số tin nhắn chưa đọc)
- [ ] Animation / transition giống nhau
- [ ] Loading state giống nhau
- [ ] Error state giống nhau
- [ ] Empty state giống nhau

---

## 6. TÍNH NĂNG SAFETY (QUAN TRỌNG NHẤT) (bước 4)

### 6.1. Yêu cầu chức năng
Khi **Parent** bật safety feature cho 1 job (tutor / pickup / babysitting / playing), thì trong suốt thời gian Carepartner đang làm việc:

**Mobile Carepartner:**
- App **phải chạy ngầm** kể cả khi: tắt màn hình, thoát app, tắt app
- **Tracking location realtime** và gửi về server mỗi 30 giây
- **Heartbeat** gửi về server mỗi 1 phút để chứng minh app còn sống

**Phát hiện các trường hợp sau → trigger alert ngay:**
1. **Carepartner xóa app** → heartbeat ngừng → server phát hiện sau 2 phút
2. **Carepartner đập / hỏng thiết bị** → heartbeat ngừng
3. **Carepartner tắt nguồn thiết bị** → heartbeat ngừng
4. **Carepartner đi ra khỏi vùng quy định** (geofence) → location outside polygon
5. **App bị force kill** → heartbeat ngừng

**Khi alert trigger:**
- **Thiết bị Parent phải ring chuông thật to ngay lập tức** (kể cả khi parent app đang tắt)
- **Notification push về admin interface**
- **Notification push về parent app**
- **Lưu log safety alert vào DB để audit**

### 6.2. Implement Backend (cần agent xác nhận đã có chưa — xem `tracking/` app)
Đọc `tracking/models.py`, `tracking/views.py`, `tracking/urls.py` để xem các endpoint hiện có. Nếu thiếu, bổ sung:

```
POST /api/tracking/safety/enable/        # Parent bật safety cho 1 booking
POST /api/tracking/safety/disable/       # Parent tắt safety
POST /api/tracking/heartbeat/            # Carepartner app gửi heartbeat
POST /api/tracking/location/             # Carepartner app gửi location
GET  /api/tracking/safety/status/:id/    # Xem trạng thái safety
GET  /api/tracking/safety/alerts/        # Admin xem tất cả alerts
POST /api/tracking/safety/acknowledge/:alertId/  # Admin acknowledge alert
POST /api/tracking/sos/                  # Carepartner SOS khẩn cấp (đã có)
```

### 6.3. Cron job backend (APScheduler — đã có sẵn trong `core/` hoặc `tracking/`)
- Scan tất cả booking đang có safety enabled
- Nếu heartbeat quá 2 phút không update → tạo safety alert
- Push notification Expo cho parent (HIGH PRIORITY: `priority: "high"`, `sound: "alarm.wav"`, `channelId: "safety-alert"`)
- Push notification cho admin
- Emit WebSocket event cho web admin dashboard (nếu có)
- Hiện tại đã có `ANOMALY_ENABLED` (mỗi 10 phút) — có thể thêm scheduler riêng cho safety mỗi 1 phút

### 6.4. Implement Mobile Carepartner (Expo SDK 54)
- **Packages cần dùng** (kiểm tra `mobile/package.json` xem đã cài chưa):
  - `expo-background-fetch` + `expo-task-manager` — background tasks
  - `expo-location` — tracking location background
  - `expo-notifications` — nhận push notification (đã có)
  - `react-native-background-actions` — foreground service Android (nếu cần native)
- **Service khởi động** khi Carepartner accept job có safety enabled
- **Foreground notification** (Android) để system không kill app
- **Location update mỗi 30s** gửi server (gọi `POST /api/tracking/location/`)
- **Heartbeat mỗi 1 phút** gửi server (gọi `POST /api/tracking/heartbeat/`)
- **Geofence check local** (nếu outside → alert ngay không cần đợi server)
- Xem branch `fix/background-tracking-resume` và `fix/geofence-foreground-alert` để biết work đã làm

### 6.5. Implement Mobile Parent
- **WebSocket / polling subscription** tới safety alert endpoint
- **Expo Push Notifications** với `priority: "high"` + custom sound `alarm.wav`
- **Channel ID riêng** `safety-alert` (vibrate + sound loud, bypass DND)
- **Khi nhận alert**:
  - Phát chuông thật to (dù app đang tắt → Expo Push high priority + custom sound)
  - Hiển thị full-screen alert (`expo-notifications` category `alarm`)
  - Vibrate thiết bị
  - Hiển thị thông tin: tên carepartner, location cuối, thời gian, lý do alert

### 6.6. Implement Web (KHÔNG SỬA production — chỉ note lại)
- Web admin dashboard (`admin_dashboard.html`) có panel "Safety Alerts"
- Realtime update qua polling (mỗi 30s) hoặc WebSocket (nếu có)
- Click vào alert → xem chi tiết + acknowledge
- Web parent có trang tracking (`tracking.html`) xem realtime location của carepartner

### 6.7. Test safety feature
**Test cases:**
1. Parent bật safety → Carepartner app start background service → heartbeat OK
2. Carepartner tắt app → sau 2 phút Parent ring chuông → Admin nhận notification
3. Carepartner đi ra khỏi vùng → Parent ring chuông ngay (< 30s)
4. Carepartner tắt mạng → sau 2 phút Parent ring
5. Carepartner kill app → sau 2 phút Parent ring
6. Parent acknowledge alert trên app → Admin dashboard cập nhật
7. Admin acknowledge alert trên web → Parent app cập nhật

---

## 7. THÊM DỮ LIỆU MẪU (bước 5)

### 7.1. Sử dụng seed script CHÍNH
File seed đã có: `core/management/commands/seed_demo_data.py` — KHÔNG overwrite.
Nếu cần mở rộng, tạo file mới `core/management/commands/seed_extra_data.py` rồi chạy:
```bash
python manage.py seed_extra_data
```

Hoặc chỉnh sửa `seed_demo_data.py` cẩn thận (giữ nguyên data cũ, chỉ THÊM mới).

### 7.2. Data mẫu cần có (verify hoặc thêm):
- [ ] 3+ Parent accounts (1 active, 1 with active booking, 1 with completed booking)
- [ ] 5+ Carepartner accounts (verified, different specialties)
- [ ] 1 Admin account
- [ ] 10+ Tasks (mix 4 service types: gia sư, đón trẻ, trông trẻ, chơi với trẻ)
- [ ] 5+ Applications/Bookings (different statuses: pending, accepted, in-progress, completed, cancelled)
- [ ] 20+ Messages (across 3+ conversations)
- [ ] 5+ Reviews
- [ ] 3+ Transactions (PayOS)
- [ ] 2+ Safety alerts (historical) — để test admin dashboard
- [ ] Tracking sessions (active + completed)
- [ ] Notifications (Expo push tokens for test accounts)

### 7.3. Chạy seed
```bash
cd educarelink-backend-4-12-2026
source venv/bin/activate
python manage.py seed_demo_data
# Hoặc nếu tạo script mới:
python manage.py seed_extra_data
```

### 7.4. Verify
- Login từng account → thấy data tương ứng
- Web admin dashboard → stats update
- Mobile → list data hiển thị đúng
- Truy cập `https://educarelink-backend.onrender.com` (PRODUCTION) → KHÔNG ĐỤNG. Chỉ verify local.

---

## 8. KIỂM THỬ TÍCH CỰC (sau khi fix)

Sau khi fix bất kỳ bug nào:
1. **Re-test feature liên quan** (happy path + edge cases)
2. **Regression test**: chạy lại toàn bộ test suite
3. **Cross-platform test**: test cả web và mobile cho feature đó
4. **Sync test**: verify web ↔ mobile vẫn đồng bộ
5. **Performance check**: API response time < 500ms
6. **Document fix** trong `WORKLOG.md`

---

## 9. BÁO CÁO LỖI & FIX

Mỗi bug tìm được, ghi vào `BUG_REPORT.md` theo format:

```markdown
## BUG-001: [tên bug ngắn]
- **Severity**: Critical / High / Medium / Low
- **Platform**: Web / Mobile / Backend
- **Component**: [file / module]
- **Steps to reproduce**:
  1. ...
  2. ...
- **Expected**: ...
- **Actual**: ...
- **Root cause**: ...
- **Fix**: [commit hash] - [mô tả ngắn]
- **Tested on**: [device / browser]
- **Status**: Fixed / Pending / Wontfix
```

---

## 10. CHECKLIST CUỐI CÙNG TRƯỚC KHI BÀN GIAO

- [ ] Tất cả endpoints API test pass
- [ ] Web local chạy OK (không đụng production Render)
- [ ] Mobile build OK trên Android
- [ ] Mobile build OK trên iOS (nếu có Mac)
- [ ] Web ↔ Mobile đồng bộ 100% (tất cả scenario test pass)
- [ ] Design parity 100% (screenshot so sánh side-by-side)
- [ ] Safety feature test pass (tất cả 7 test cases)
- [ ] Sample data seeded thành công
- [ ] Tất cả bugs documented trong `BUG_REPORT.md`
- [ ] Tất cả fixes commit + push lên branch riêng (không phải main)
- [ ] PR tạo sẵn để user review
- [ ] `WORKLOG.md` cập nhật đầy đủ
- [ ] Backup branch created and pushed
- [ ] Web production Render KHÔNG bị động vào

---

## 11. CẤU TRÚC OUTPUT AGENT PHẢI TRẢ VỀ

Agent phải tạo các file sau trong repo (KHÔNG overwrite AGENTS.md, SYNC_PRINCIPLE.md, SECURITY_AUDIT_CHECKLIST.md):
```
/ANALYSIS.md           # Phân tích chi tiết repo (cấu trúc, endpoints, models) — cập nhật mới
/TEST_REPORT.md        # Báo cáo test từng feature (pass/fail) — thay thế TEST_RESULTS.md cũ
/BUG_REPORT.md         # Danh sách bugs tìm được
/FIX_LOG.md            # Log các fix đã thực hiện (commit hash + mô tả)
/SYNC_PARITY.md        # Bảng so sánh web vs mobile (parity %) — cập nhật mới
/SAFETY_FEATURE.md     # Document implement safety feature
/WORKLOG.md            # Worklog ngày tháng
```

### Các file tham khảo PHẢI ĐỌC TRƯỚC KHI CODE:
1. `AGENTS.md` — Single source of truth (73 KB) — ĐỌC TRƯỚC KHI SỬA BẤT KỲ DÒNG CODE NÀO
2. `SYNC_PRINCIPLE.md` — Nguyên tắc đồng bộ web-mobile (15 KB)
3. `SECURITY_AUDIT_CHECKLIST.md` — Security audit prompt (7.5 KB)
4. `mobile/DEPLOY_GUIDE.md` — Hướng dẫn deploy mobile (9.6 KB)
5. `payments/README.md` — Tài liệu module payment (14.5 KB)
6. `performance/README.md` — Tài liệu module performance (8.6 KB)

---

## 12. PROMPT ĐỂ AGENT KHỞI ĐỘNG

```
Bạn là 1 Senior Full-Stack Engineer (Django + React Native) được giao task phân tích, test, fix bugs cho repo `educarelink-backend-4-12-2026`.

REPO INFO:
- URL: https://github.com/huyhandsome6996/educarelink-backend-4-12-2026
- PAT: <GITHUB_PAT_USER_CUNG_CAP>
- Tech stack: Django 5.2 + DRF + Django Templates (web) + React Native Expo SDK 54 (mobile)
- Database: SQLite (dev) / PostgreSQL Supabase (prod)
- Web đang chạy production trên Render → KHÔNG ĐỤNG VÀO
- Mobile cần test và fix
- Backend API có thể sửa nếu cần (nhưng phải test kỹ, không break web production)
- Production URL: https://educarelink-backend.onrender.com
- Demo accounts: admin/Demo@2026, phuhuynh_test/Demo@2026, sinhvien_test/Demo@2026

BƯỚC ĐẦU TIÊN — ĐỌC FILE NÀY TRƯỚC:
1. `EDUCARELINK_REPO_ANALYSIS_AND_TESTING_GUIDE.md` (file hướng dẫn chính)
2. `AGENTS.md` — Single source of truth cho AI agents
3. `SYNC_PRINCIPLE.md` — Nguyên tắc đồng bộ web ↔ mobile
4. `SECURITY_AUDIT_CHECKLIST.md` — Security audit prompt

NGUYÊN TẮC TỐI THƯỢNG:
1. KHÔNG làm sập web production Render (KHÔNG push lên main, KHÔNG modify production env)
2. KHÔNG push code lỗi lên main
3. Mọi sửa chữa trên branch riêng + PR để review (vd: fix/mobile-sync, feat/safety-feature)
4. Backup branch trước khi sửa: `git checkout -b backup-<date> && git push origin backup-<date>`
5. Test local trước khi push (Django runserver + Expo start)
6. Không xóa data đã có, chỉ thêm mới
7. Ngôn ngữ commit: TIẾNG VIỆT (bắt buộc theo AGENTS.md)

OUTPUT BẮT BUỘC (tạo file .md trong root repo):
- Phân tích chi tiết repo → `ANALYSIS.md`
- Test tất cả flows (web + mobile) → `TEST_REPORT.md`
- List bugs → `BUG_REPORT.md`
- Fix bugs → commit + push branch riêng + `FIX_LOG.md`
- So sánh web vs mobile parity → `SYNC_PARITY.md`
- Implement/verify safety feature → `SAFETY_FEATURE.md`
- Worklog → `WORKLOG.md`

ĐẶC BIỆT — SAFETY FEATURE (ưu tiên cao nhất):
- Parent bật safety → Carepartner app chạy ngầm (kể cả tắt màn hình, thoát app, tắt app)
- Tracking location mỗi 30s + heartbeat mỗi 1 phút về backend
- Carepartner: xóa app / tắt máy / hỏng thiết bị / ra khỏi vùng geofence → Parent ring chuông to + Admin nhận notification
- Phải có trên cả web và mobile (mobile là chính)
- Test 7 scenarios trong section 6.7 của file hướng dẫn
- Xem branch `fix/background-tracking-resume` và `fix/geofence-foreground-alert` để biết work đã làm

BẮT ĐẦU NGAY:
1. Clone repo (dùng PAT ở trên)
2. Đọc `EDUCARELINK_REPO_ANALYSIS_AND_TESTING_GUIDE.md` + `AGENTS.md`
3. Tạo backup branch
4. Làm theo đúng các bước trong guide
5. Báo cáo tiến độ sau mỗi milestone lớn (phân tích xong, test xong, fix xong, safety feature xong)
```

---

## 13. LƯU Ý QUAN TRỌNG CHO USER

1. **File này là bản hướng dẫn**, agent kia sẽ làm theo
2. **PAT trong file có thể expire** — nếu agent báo lỗi auth, user cần generate PAT mới
3. **KHÔNG commit PAT vào repo public** — chỉ dùng trong IM chat với agent
4. **Web production Render KHÔNG bị động vào** — agent chỉ test local + mobile
5. **Backup branch** sẽ được agent tạo trước khi sửa gì
6. **Mọi fix trên branch riêng** — user review + merge khi OK
7. **Safety feature** là ưu tiên số 1 — yêu cầu agent implement đầy đủ + test

---

**END OF GUIDE**
