# AGENTS.md — EduCareLink Backend (Single Source of Truth cho AI Agents)

> File này là **bản đồ não bộ chung** cho mọi AI agent (Claude, GPT, Gemini, Cursor, Copilot, Z.ai, v.v.) khi làm việc trên repo `educarelink-backend-4-12-2026`.
> Đọc file này **TRƯỚC** khi sửa bất kỳ dòng code nào. Nếu bạn là agent mới vào phiên, hãy nhảy xuống [§20. Agent Coordination Protocol](#20-agent-coordination-protocol) để biết cách làm việc chung.

---

## 0. Quick Reference Card

| Trường | Giá trị |
|---|---|
| **Repo** | `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026` |
| **Branch mặc định** | `main` |
| **Loại project** | Django 5.2 monolith + DRF + React Native (Expo) + Django Templates |
| **Backend ngôn ngữ** | Python 3.11 |
| **Database dev** | SQLite (`db.sqlite3`) |
| **Database prod** | PostgreSQL qua `DATABASE_URL` (Neon / Supabase / Render) |
| **Deployment** | Render.com (free tier) — `https://educarelink-backend.onrender.com` |
| **Auth** | JWT (SimpleJWT) — access 60m, refresh 30d, rotate + blacklist |
| **AI provider** | Google Gemini (`gemini-2.5-flash`) qua `google-genai` SDK |
| **Payment** | MoMo Pay App v2 (sandbox) — escrow + cash settlement |
| **Push notification** | Expo Push Notifications (`expo_push_token` field trên `User`) |
| **Timezone** | `Asia/Ho_Chi_Minh` (UTC+7) |
| **Language UI** | Tiếng Việt |
| **Ngôn ngữ commit** | **Tiếng Việt** (BẮT BUỘC) |
| **Demo password** | `Demo@2026` (áp dụng cho mọi tài khoản demo) |

---

## 1. Project Overview

**EduCareLink** là nền tảng kết nối **Phụ huynh** (Parent) với **Carepartner** (sinh viên/giảng viên/coi trẻ…) tại Việt Nam. Phụ huynh đăng công việc (gia sư, đón trẻ, dọn dẹp, nấu ăn, mua sắm, trông trẻ…), Carepartner ứng tuyển, phụ huynh chọn người phù hợp. Khi việc hoàn thành, cả hai đánh giá nhau.

**2 vai trò người dùng:**
- **Parent (Phụ huynh)** — đăng ký tự động được duyệt, đăng việc, duyệt ứng viên, đánh giá, thanh toán.
- **Worker / Carepartner** — đăng ký cần admin duyệt hồ sơ (CCCD + chân dung + bằng cấp), tìm việc, ứng tuyển, làm việc, nhận tiền, khiếu nại.

**Admin** là user có `is_staff=True` (thường là superuser), dùng Django Admin + `/admin-dashboard/` để duyệt tài khoản, duyệt bằng cấp, xử lý khiếu nại, xem thống kê.

**Các tính năng đặc biệt:**
- 🤖 **AI Chatbot** (Gemini) — phụ huynh chat để tự tạo task từ ngôn ngữ tự nhiên; carepartner có trợ lý riêng; admin có trợ lý phân tích ảnh.
- 🛡️ **AI Moderation** — tự kiểm duyệt task khi đăng (đạo đức, chính trị, luật pháp VN), AI phân tích khiếu nại.
- 🎯 **AI Recommendations** — gợi ý việc cho carepartner + xếp hạng ứng viên cho phụ huynh.
- 📍 **Live Tracking** — carepartner đồng ý chia sẻ vị trí; phụ huynh xem real-time; cảnh báo geofence; nút SOS khẩn cấp.
- 💳 **MoMo Payment** — escrow (giữ tiền, giải ngân 80/20) hoặc cash settlement (tổng hợp cuối tháng, sinh QR thu hoa hồng).
- 🚨 **AI Anomaly Detection** — quét bất thường mỗi 10 phút, báo admin (user spike, đánh giá 1 sao, task mở lâu…).
- ⏰ **Keep-Alive Scheduler** — tự ping chính mình mỗi 3 phút để Render free không sleep.

---

## 2. Tech Stack & Versions

### Backend (root folder)
```
Django==5.2.15
djangorestframework==3.17.1
djangorestframework-simplejwt==5.3.1
django-cors-headers==4.9.0
Pillow==11.2.1                  # xử lý ảnh CCCD/chân dung
psycopg2-binary==2.9.12         # PostgreSQL driver
dj-database-url==3.1.2          # parse DATABASE_URL
python-dotenv==1.0.1            # load .env local
whitenoise==6.12.0              # serve static files in production
gunicorn==26.0.0                # WSGI server trên Render
APScheduler==3.11.2             # background schedulers
requests==2.33.1                # gọi MoMo API
google-genai==2.2.0             # Gemini SDK mới (dùng `genai.Client`)
google-generativeai==0.8.6      # legacy (chỉ dùng nếu cần fallback)
```

### Mobile (`mobile/`)
```
expo ~54.0.35            (SDK 54 — EAS Build)
react 19.1.0
react-native 0.81.5
axios 1.16.1
@react-navigation/* 7.x
expo-notifications ~0.32.17
expo-image-picker ~17.0.11
expo-secure-store ~15.0.8     (lưu JWT)
expo-location                 (live tracking)
@react-native-async-storage/async-storage 2.2.0
```

### Frontend (Django templates trong `frontend/templates/frontend/`)
- HTML + CSS + vanilla JavaScript (fetch API)
- Tailwind CSS qua CDN (HTML inline)
- Không có build step — render trực tiếp từ Django template

---

## 3. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    EduCareLink Backend (Django)                    │
│                                                                    │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌────────┐ │
│  │    core     │   │  payments   │   │  tracking   │   │ moder. │ │
│  │ (User,Task, │   │ (MoMo escrow│   │ (live GPS + │   │ (AI    │ │
│  │  App,Rev,…) │   │  + cash +   │   │  geofence + │   │  duyệt │ │
│  │             │   │  refund)    │   │  SOS)       │   │  + complaint)│
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └───┬────┘ │
│         │                 │                 │              │      │
│         │   ┌─────────────┴─────────────────┘              │      │
│         │   │  Django signals (post_save trên core.Task)   │      │
│         │   │  → triggers payment flow + tracking clear    │      │
│         ▼   ▼                                              ▼      │
│  ┌─────────────────┐   ┌──────────────────────────────────────┐  │
│  │ ai_recommendations│   │   3 Background Schedulers (APScheduler)│  │
│  │ (Gemini gợi ý    │   │   • keepalive_scheduler  (3 min ping)  │  │
│  │  việc + ứng viên)│   │   • anomaly_scheduler    (10 min scan) │  │
│  └─────────────────┘   │   • payments.scheduler   (monthly 1st) │  │
│                        └──────────────────────────────────────┘  │
│                                                                    │
│  URL roots:                                                        │
│    /api/        → core.urls + payments.urls + tracking.urls        │
│                   + ai_recommendations.urls + moderation.urls      │
│    /admin/      → Django admin                                     │
│    /            → frontend.urls (Django templates)                 │
└────────────────────────────────────────────────────────────────────┘
                          ▲                    ▲
                          │JWT                 │JWT
              ┌───────────┴──────┐   ┌─────────┴──────────┐
              │  Web (Django Tmpl)│   │ Mobile (Expo RN)   │
              │  frontend/        │   │ mobile/            │
              └───────────────────┘   └────────────────────┘
                          ▲
                          │
              ┌───────────┴───────────────────────┐
              │  External integrations            │
              │  • MoMo Pay App v2 API            │
              │  • Google Gemini API              │
              │  • Google / Facebook OAuth        │
              │  • Expo Push Notifications API    │
              └───────────────────────────────────┘
```

### Nguyên lý kiến trúc cốt lõi

1. **Module isolation** — mỗi app Django (`core`, `payments`, `tracking`, `moderation`, `ai_recommendations`) là một **bounding box độc lập**. KHÔNG import chéo models/views giữa các module — chỉ được phép trỏ tới `core` (vì `core` là foundation).
2. **Signal-based integration** — các module phụ (`payments`, `tracking`, `moderation`) tích hợp vào `core.Task` lifecycle bằng `post_save` signal, KHÔNG sửa code core.
3. **Service layer pattern** — business logic nằm trong `<module>/services.py`, không nằm trong views. Views chỉ làm I/O.
4. **Auth mặc định khoá** — `REST_FRAMEWORK['DEFAULT_PERMISSION_CLASSES'] = ['IsAuthenticated']`. Mọi endpoint mặc định yêu cầu JWT. Endpoint public phải khai báo `permission_classes = [AllowAny]` + `authentication_classes = []` rõ ràng.
5. **Tiếng Việt everywhere** — error messages, log lines, AI prompts, commit messages, UI text. Chỉ code identifier là tiếng Anh.

---

## 4. Module Map

| App | Vai trò | Files chính | Signal hooks |
|---|---|---|---|
| **`core/`** | Foundation: User, Task, TaskApplication, Review, ServiceCategory, Notification, CredentialSubmission, ProfileChangeRequest | `models.py`, `views.py` (~100 KB, 25+ API views), `serializers.py`, `oauth_views.py`, `urls.py`, `keepalive_scheduler.py`, `anomaly_scheduler.py` | — (là đích của signal) |
| **`payments/`** | MoMo escrow + cash settlement + refund | `models.py` (Payment, CommissionSettlement, PaymentLog), `momo_client.py` (API wrapper), `services.py` (business logic), `views.py`, `signals.py`, `scheduler.py` (monthly cron) | `pre_save` + `post_save` trên `core.Task` → trigger release_escrow / refund / record_cash |
| **`tracking/`** | Live GPS + geofence + SOS | `models.py` (LocationConsent, LiveLocation, LocationHistory, SOSAlert), `services.py` (Haversine, geofence), `views.py`, `signals.py` | `pre_save` + `post_save` trên `core.Task` → clear LiveLocation khi completed/cancelled |
| **`moderation/`** | AI kiểm duyệt task + khiếu nại | `models.py` (TaskModeration, Complaint, ComplaintEvidence), `services.py` (Gemini moderation + complaint analysis), `views.py`, `signals.py` | `post_save` trên `core.Task` (created=True) → auto-moderate |
| **`ai_recommendations/`** | AI gợi ý việc cho worker + xếp hạng ứng viên | `services.py` (Gemini prompts + cache), `views.py` | Không có signal — chỉ gọi qua API |
| **`frontend/`** | Django templates web app | `views.py` (TemplateView đơn giản), `urls.py`, `templates/frontend/*.html`, `static/images/` | — |
| **`backend/`** | Django project config (không phải app) | `settings.py`, `urls.py` (root URL routing), `wsgi.py`, `asgi.py` | — |
| **`mobile/`** | React Native (Expo) app | `App.js`, `app.json`, `src/api/*.js`, `src/screens/**/*.js`, `src/navigation/AppNavigator.js`, `src/context/AuthContext.js` | — (gọi API qua axios) |

### Các file thư mục gốc quan trọng
- `manage.py` — standard Django entrypoint
- `requirements.txt` — Python deps
- `.env.example` — mẫu env vars (copy → `.env`)
- `render.yaml` — Render deployment config
- `Procfile` — `web: gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT`
- `build.sh` — Render build script (cài deps + migrate + seed demo data mỗi deploy)
- `seed_data.py` — script seed dữ liệu mẫu độc lập (chạy `python seed_data.py`)
- `keep_alive.py` — standalone script ping server (legacy, không dùng trên Render — đã thay bằng `core/keepalive_scheduler.py` in-process)
- `EDUCARELINK_HANDOFF.md` — tài liệu handoff cho redesign web (chỉ web frontend)
- `Nhat_Ky_Hoat_Dong.md` — nhật ký cập nhật tính năng (lịch sử thay đổi)
- `mobile/AGENTS.md` — note ngắn cho mobile agent (Expo SDK 54)
- `mobile/CLAUDE.md` — symlink tới AGENTS.md
- `docs/` — `.docx` báo cáo sản phẩm + hướng dẫn sử dụng (không affect code)
- `stitch_educarelink_app_design/` — HTML prototype thiết kế UI (reference)

---

## 5. Database Schema

### 5.1. `core.User` (kế thừa `AbstractUser`)

```
User
├─ role: 'parent' | 'worker'
├─ auth_provider: 'email' | 'google' | 'facebook'
├─ avatar_url: URL (từ Google/Facebook OAuth)
├─ phone_number, address
├─ is_verified: bool          # đã xác thực CCCD/sinh viên
├─ is_approved: bool          # admin duyệt cho worker (parent auto True)
├─ id_card_front: ImageField  # 'id_cards/'
├─ id_card_back: ImageField
├─ selfie_photo: ImageField   # 'selfies/'
├─ certificate_photo: ImageField  # 'certificates/'
├─ qualifications: JSONField (list string)  # admin nhập sau khi duyệt
├─ expo_push_token: string    # cho push notification
├─ ai_profile_summary: text   # AI tổng hợp điểm mạnh (chưa implement đầy đủ)
├─ first_login: bool          # chưa xem onboarding
├─ latitude, longitude: float # vị trí user (cho AI distance)
└─ (kế thừa từ AbstractUser: username, password, email, first_name, last_name,
    is_staff, is_superuser, is_active, date_joined, last_login)
```

### 5.2. `core.ServiceCategory`
```
ServiceCategory
├─ name: char (Gia sư, Đón trẻ, Dọn dẹp, Trông trẻ, Mua sắm, Nấu ăn, Hỗ trợ AI, Khác)
├─ icon_name: char (tên icon, VD: BookOpen, Baby — dùng ở frontend)
└─ description: text
```

### 5.3. `core.Task`
```
Task
├─ title, description, price: Decimal(VNĐ, không lẻ)
├─ status: 'open' | 'in_progress' | 'completed' | 'cancelled'
├─ parent: FK → User (related_name='posted_tasks')
├─ category: FK → ServiceCategory (SET_NULL)
├─ location, latitude, longitude
├─ scheduled_time: datetime (khi bắt đầu làm)
├─ geofence_lat, geofence_lng, geofence_radius: float  # vùng an toàn parent vẽ
├─ ai_generated_from_prompt: text  # lưu câu chat gốc nếu tạo qua AI
└─ created_at
```

### 5.4. `core.TaskApplication`
```
TaskApplication
├─ task: FK → Task
├─ worker: FK → User
├─ status: 'pending' | 'accepted' | 'rejected'
├─ applied_at
└─ unique_together = (task, worker)   # 1 worker chỉ apply 1 task 1 lần
```

### 5.5. `core.Review`
```
Review
├─ task: OneToOne → Task
├─ reviewer: FK → User
├─ reviewee: FK → User
├─ rating: 1-5
├─ comment: text
└─ created_at
```

### 5.6. `core.CredentialSubmission`
Carepartner gửi minh chứng bằng cấp cho admin duyệt.
```
CredentialSubmission
├─ worker: FK → User
├─ certificate_photo: ImageField  # 'credential_submissions/'
├─ description: text
├─ status: 'pending' | 'approved' | 'rejected'
├─ admin_review: text
├─ reviewed_at
└─ created_at
```

### 5.7. `core.ProfileChangeRequest`
Carepartner yêu cầu sửa thông tin hồ sơ, admin duyệt.
```
ProfileChangeRequest
├─ worker: FK → User
├─ proposed_changes: JSONField  # {'first_name': 'Minh', 'phone_number': '...'}
├─ status: 'pending' | 'approved' | 'rejected'
├─ admin_review: text
├─ reviewed_at
└─ created_at
```

### 5.8. `core.Notification`
```
Notification
├─ recipient: FK → User (null = broadcast cho tất cả carepartner)
├─ title, message: text
├─ is_read: bool   # chỉ dùng cho recipient cụ thể
├─ read_by: JSONField (list user_id)   # dùng cho broadcast (recipient=null)
└─ created_at
```

### 5.9. `payments.Payment` (OneToOne với Task)
```
Payment
├─ task: OneToOne → Task
├─ parent, worker: FK → User
├─ amount, commission_rate (default 0.20), commission_amount, worker_payout_amount
├─ method: 'momo_escrow' | 'cash'
├─ status: 'pending' | 'held' | 'completed' | 'cancelled' | 'refunded' | 'payout_failed'
├─ momo_order_id, momo_request_id, momo_trans_id
├─ momo_pay_url, momo_qr_code_url
├─ momo_result_code, momo_message
├─ payout_request_id, payout_trans_id, payout_response: JSON
├─ initiated_at, held_at, completed_at, refunded_at
└─ save() tự tính commission_amount + worker_payout_amount
```

### 5.10. `payments.CommissionSettlement` (1 record / worker / tháng)
```
CommissionSettlement
├─ worker: FK → User
├─ period_year, period_month: int
├─ total_tasks, total_amount
├─ task_ids: JSONField (list Payment.id)
├─ status: 'pending' | 'qr_generated' | 'paid' | 'overdue' | 'cancelled'
├─ momo_order_id, momo_request_id, momo_pay_url, momo_qr_code_url
├─ momo_trans_id, momo_result_code, momo_message
├─ due_at, generated_at, paid_at
└─ unique_together = (worker, period_year, period_month)
```

### 5.11. `payments.PaymentLog` (audit trail — 18 event types)
```
PaymentLog
├─ payment: FK → Payment (nullable)
├─ settlement: FK → CommissionSettlement (nullable)
├─ event_type: 1 trong 18 loại (payment_created, momo_ipn_held, escrow_released, ...)
├─ message: text
├─ payload: JSONField
├─ actor: FK → User (null nếu cron/IPN)
└─ created_at
```

### 5.12. `tracking.LocationConsent` (OneToOne với Task)
```
LocationConsent
├─ task: OneToOne → Task
├─ worker: FK → User
├─ consent: 'granted' | 'denied' | 'revoked'
├─ granted_at, revoked_at
└─ created_at, updated_at
```

### 5.13. `tracking.LiveLocation` (OneToOne với Task — update-in-place)
```
LiveLocation
├─ task: OneToOne → Task
├─ worker: FK → User
├─ latitude, longitude: Decimal(10,7)
├─ accuracy, speed, heading: float (nullable)
├─ last_seen: datetime (db_index)
├─ is_outside_geofence: bool
├─ geofence_warned_at: datetime
└─ created_at
```

### 5.14. `tracking.LocationHistory` (lưu vĩnh viễn)
```
LocationHistory
├─ task, worker: FK
├─ latitude, longitude, accuracy, speed, heading
└─ recorded_at
```

### 5.15. `tracking.SOSAlert`
```
SOSAlert
├─ task: FK → Task
├─ sender: 'worker' | 'parent'
├─ sender_user: FK → User
├─ latitude, longitude (nullable)
├─ message: text
├─ status: 'active' | 'resolved' | 'false'
├─ resolved_at, resolved_by
└─ created_at
```

### 5.16. `moderation.TaskModeration` (OneToOne với Task)
```
TaskModeration
├─ task: OneToOne → Task
├─ status: 'pending' | 'approved' | 'rejected' | 'needs_review'
│        | 'admin_approved' | 'admin_rejected'
├─ ai_verdict, ai_confidence (0-1), ai_flags: JSON (list string)
├─ ai_suggestion: text
├─ admin_note: text
├─ reviewed_by: FK → User, reviewed_at
└─ created_at, updated_at
```

### 5.17. `moderation.Complaint` + `ComplaintEvidence`
```
Complaint
├─ complainant: FK → User (carepartner)
├─ reported_user: FK → User (phụ huynh bị khiếu nại)
├─ task: FK → Task (nullable)
├─ complaint_type: 'exploitation' | 'abuse' | 'harassment' | 'non_payment'
│                | 'fraud' | 'unsafe' | 'other'
├─ title, description
├─ ai_analysis, ai_priority ('low'|'medium'|'high'|'urgent'), ai_suggestion
├─ ai_analyzed: bool
├─ status: 'pending' | 'investigating' | 'resolved' | 'dismissed'
├─ priority: 'low' | 'medium' | 'high' | 'urgent'
├─ admin_response: text
├─ resolved_by, resolved_at
└─ created_at, updated_at

ComplaintEvidence
├─ complaint: FK → Complaint
├─ evidence_type: 'image' | 'video' | 'document'
├─ file: FileField ('complaint_evidence/')
└─ description, uploaded_at
```

### Migrations hiện tại
- `core/migrations/0001_initial.py` → `0013_task_geofence_fields.py` (13 migrations)
- `payments/migrations/0001_initial.py`
- `tracking/migrations/0001_initial.py`
- `moderation/migrations/0001_initial.py`
- `ai_recommendations/` không có model riêng → không có migration

---

## 6. API Reference (Endpoint Map)

Tất cả API nằm dưới prefix `/api/`. Auth: header `Authorization: Bearer <access_token>`.

### 6.1. Auth & User (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/health/` | AllowAny | Health check cho keep-alive (test DB) |
| POST | `/api/auth/register/` | AllowAny | Đăng ký (parent auto-approved, worker chờ admin) |
| POST | `/api/auth/login/` | AllowAny | Đăng nhập → trả JWT + role + first_login |
| POST | `/api/auth/google/` | AllowAny | OAuth Google (ID token hoặc access token) |
| POST | `/api/auth/facebook/` | AllowAny | OAuth Facebook (access token) |
| GET | `/api/auth/oauth-config/` | AllowAny | Trả client_id Google/Facebook + enabled flag |
| POST | `/api/auth/upgrade-carepartner/` | IsAuthenticated | Parent nộp CCCD + chân dung → chờ admin duyệt thành worker |
| GET | `/api/auth/upgrade-status/` | IsAuthenticated | Trạng thái yêu cầu nâng cấp |
| GET/PATCH | `/api/profile/` | IsAuthenticated | Xem / sửa hồ sơ user hiện tại |
| POST | `/api/auth/token/refresh/` | AllowAny | Refresh JWT (SimpleJWT) |

### 6.2. Tasks (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET/POST | `/api/tasks/` | IsAuthenticated | List tasks (filter ?status=) / Tạo task mới (chỉ parent) |
| GET | `/api/tasks/<id>/` | IsAuthenticated | Chi tiết task |
| PATCH | `/api/tasks/<id>/status/` | IsAuthenticated | Đổi status (parent đổi open→cancelled, in_progress→completed; worker không đổi) |

### 6.3. Parent Flow (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/parent/my-tasks/` | IsAuthenticated | List task của parent hiện tại |
| GET | `/api/parent/tasks/<task_id>/candidates/` | IsAuthenticated | List ứng viên + AI recommendations |
| POST | `/api/parent/applications/<app_id>/approve/` | IsAuthenticated | Chọn 1 ứng viên → task in_progress, notify worker |
| POST | `/api/parent/review/` | IsAuthenticated | Tạo review sau khi task completed |

### 6.4. Worker Flow (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| POST | `/api/worker/tasks/<task_id>/apply/` | IsAuthenticated | Carepartner ứng tuyển task |
| GET | `/api/worker/my-jobs/` | IsAuthenticated | List việc đã ứng tuyển (filter ?status=) |
| GET | `/api/worker/<worker_id>/profile/` | IsAuthenticated | Hồ sơ carepartner public (cho parent xem) |
| POST | `/api/worker/submit-credential/` | IsAuthenticated | Gửi bằng cấp mới cho admin duyệt |
| POST | `/api/worker/profile-change-request/` | IsAuthenticated | Yêu cầu sửa hồ sơ → admin duyệt |

### 6.5. AI Chatbot (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| POST | `/api/chatbot/` | IsAuthenticated | Chatbot cho parent (Gemini — có thể tạo task từ prompt) |
| POST | `/api/worker/chatbot/` | IsAuthenticated | Chatbot cho carepartner |
| POST | `/api/admin/chatbot/` | IsAdminUser | Chatbot cho admin (thống kê + phân tích ảnh) |
| POST | `/api/help-center/` | IsAuthenticated | Trung tâm trợ giúp AI |
| POST | `/api/distance/` | IsAuthenticated | Tính khoảng cách (Haversine + Gemini) |

### 6.6. Notifications (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/notifications/` | IsAuthenticated | List notification (cá nhân + broadcast) |
| GET | `/api/notifications/unread-count/` | IsAuthenticated | Số thông báo chưa đọc |
| POST | `/api/notifications/mark-read/` | IsAuthenticated | Đánh dấu đã đọc |

### 6.7. Onboarding (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| POST | `/api/onboarding/complete/` | IsAuthenticated | Đánh dấu first_login=False sau khi xem onboarding |

### 6.8. Admin (`core/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/admin/pending-workers/` | IsAdminUser | List worker chờ duyệt |
| POST | `/api/admin/workers/<user_id>/action/` | IsAdminUser | Duyệt / từ chối / sửa bằng cấp worker |
| GET | `/api/admin/all-workers/` | IsAdminUser | Tất cả carepartner |
| GET | `/api/admin/all-users/` | IsAdminUser | Tất cả user |
| POST | `/api/admin/users/<user_id>/toggle-active/` | IsAdminUser | Khoá / mở khoá user |
| POST | `/api/admin/users/<user_id>/revoke-carepartner/` | IsAdminUser | Tước quyền carepartner (đổi role→parent) |
| POST | `/api/admin/seed-demo-data/` | IsAdminUser | Trigger reset demo data |
| GET | `/api/admin/credential-submissions/` | IsAdminUser | List bằng cấp chờ duyệt |
| POST | `/api/admin/credential-submissions/<id>/review/` | IsAdminUser | Duyệt / từ chối bằng cấp |
| POST | `/api/admin/send-notification/` | IsAdminUser | Gửi thông báo (cá nhân hoặc broadcast) |
| GET | `/api/admin/profile-change-requests/` | IsAdminUser | List yêu cầu sửa hồ sơ |
| POST | `/api/admin/profile-change-requests/<id>/review/` | IsAdminUser | Duyệt / từ chối |
| GET | `/api/admin/keepalive-stats/` | IsAdminUser | Stats của keepalive scheduler |

### 6.9. Payments (`payments/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/payments/health/` | AllowAny | MoMo config check (debug) |
| POST | `/api/payments/setup/` | IsAuthenticated | Parent chọn method (`momo_escrow` \| `cash`) cho task |
| GET | `/api/payments/<id>/` | IsAuthenticated | Chi tiết payment |
| GET | `/api/payments/my/` | IsAuthenticated | List payment của user (parent hoặc worker) |
| GET | `/api/payments/my-earnings/` | IsAuthenticated (worker) | Tổng quan thu nhập carepartner |
| GET | `/api/payments/settlements/` | IsAuthenticated | List kỳ thanh toán hoa hồng của worker |
| GET | `/api/payments/settlements/<id>/` | IsAuthenticated | Chi tiết kỳ + link QR |
| GET | `/api/payments/admin/overview/` | IsAdminUser | Dashboard tổng quan |
| GET | `/api/payments/admin/all/` | IsAdminUser | Tất cả payments (filter ?status=&method=) |
| POST | `/api/payments/admin/<id>/retry-payout/` | IsAdminUser | Thử lại giải ngân thất bại |
| POST | `/api/payments/admin/settlements/<id>/regenerate-qr/` | IsAdminUser | Tạo lại QR cho kỳ |
| POST | `/api/payments/admin/run-settlement/` | IsAdminUser | Chạy monthly settlement thủ công (body: `{year, month}`) |
| GET | `/api/payments/admin/logs/` | IsAdminUser | Audit logs (filter ?payment_id=&settlement_id=) |
| POST | `/api/payments/momo-ipn/` | AllowAny (no auth) | MoMo IPN webhook (verify HMAC signature) |
| GET | `/api/payments/momo-return/` | AllowAny (no auth) | Redirect browser sau khi parent pay |
| GET | `/api/payments/settlement-return/` | AllowAny (no auth) | Redirect sau khi worker pay QR hoa hồng |

### 6.10. Tracking (`tracking/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/tracking/health/` | AllowAny | Health check |
| POST | `/api/tracking/consent/` | IsAuthenticated (worker) | Đồng ý / từ chối chia sẻ vị trí cho task |
| POST | `/api/tracking/consent/<task_id>/revoke/` | IsAuthenticated (worker) | Rút lại đồng ý (dừng khẩn cấp) |
| POST | `/api/tracking/location/` | IsAuthenticated (worker) | Update vị trí (gọi mỗi 10s) |
| GET | `/api/tracking/<task_id>/live/` | IsAuthenticated (parent) | Vị trí hiện tại carepartner (poll 5s) |
| GET | `/api/tracking/<task_id>/history/` | IsAuthenticated (parent) | Lịch sử toàn bộ vị trí |
| GET | `/api/tracking/<task_id>/consent/` | IsAuthenticated | Trạng thái consent của task |
| POST | `/api/tracking/sos/` | IsAuthenticated | Bấm SOS (cả parent + worker) |
| GET | `/api/tracking/sos/<task_id>/` | IsAuthenticated | List SOS alerts của task |
| POST | `/api/tracking/sos/<sos_id>/resolve/` | IsAuthenticated | Đánh dấu SOS đã giải quyết |
| GET | `/api/tracking/admin/overview/` | IsAdminUser | Stats tổng quan tracking |

### 6.11. AI Recommendations (`ai_recommendations/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/ai/recommendations/worker/` | IsAuthenticated (worker + approved) | Gợi ý việc cho carepartner (Gemini + cache 5 phút) |
| GET | `/api/ai/recommendations/candidates/<task_id>/` | IsAuthenticated (parent sở hữu task) | Xếp hạng ứng viên + nhận xét AI (cache 3 phút) |
| POST | `/api/ai/recommendations/clear-cache/` | IsAdminUser | Xoá cache (chưa implement đầy đủ) |

### 6.12. Moderation (`moderation/urls.py`)

| Method | Endpoint | Permission | Mô tả |
|---|---|---|---|
| GET | `/api/moderation/health/` | AllowAny | Health check |
| GET | `/api/moderation/task/<task_id>/` | IsAuthenticated | Trạng thái kiểm duyệt task |
| POST | `/api/moderation/complaints/` | IsAuthenticated (worker) | Gửi khiếu nại (multipart — upload bằng chứng) |
| GET | `/api/moderation/complaints/mine/` | IsAuthenticated | List khiếu nại đã gửi |
| GET | `/api/moderation/admin/tasks/` | IsAdminUser | List task cần duyệt (filter ?status=, default `needs_review`) |
| POST | `/api/moderation/admin/tasks/<pk>/override/` | IsAdminUser | Override AI (admin_approved/admin_rejected) |
| POST | `/api/moderation/admin/tasks/<task_id>/re-moderate/` | IsAdminUser | Yêu cầu AI duyệt lại |
| GET | `/api/moderation/admin/complaints/` | IsAdminUser | List khiếu nại (filter ?status=) |
| POST | `/api/moderation/admin/complaints/<pk>/resolve/` | IsAdminUser | Xử lý khiếu nại |
| POST | `/api/moderation/admin/complaints/<pk>/ai-analyze/` | IsAdminUser | Yêu cầu AI phân tích lại khiếu nại |

### 6.13. Web Frontend Routes (`frontend/urls.py`)

| URL | View | Template |
|---|---|---|
| `/` | SplashView | `splash.html` |
| `/login/` | LoginView | `login.html` |
| `/register/` | RegisterView | `register.html` |
| `/onboarding/parent/` | ParentOnboardingView | `onboarding_parent.html` |
| `/onboarding/worker/` | WorkerOnboardingView | `onboarding_worker.html` |
| `/parent/` | ParentHomeView | `parent_home.html` |
| `/parent/create-1/` | TaskCreate1View | `task_create_1.html` |
| `/parent/create-2/` | TaskCreate2View | `task_create_2.html` |
| `/parent/tasks/` | ParentTasksView | `parent_tasks.html` |
| `/parent/browse-candidates/` | BrowseCandidatesView | `browse_candidates.html` |
| `/parent/chatbot/` | ChatbotView | `chatbot.html` |
| `/parent/review/` | ReviewView | `review.html` |
| `/parent/tracking/` | LiveTrackingView | `tracking.html` |
| `/worker/` | WorkerFeedView | `worker_feed.html` |
| `/worker/task-detail/` | TaskDetailView | `task_detail.html` |
| `/worker/my-jobs/` | WorkerJobsView | `worker_jobs.html` |
| `/worker/profile/` | WorkerProfileView | `worker_profile.html` |
| `/worker/chatbot/` | WorkerChatbotView | `worker_chatbot.html` |
| `/worker/help-center/` | HelpCenterView | `help_center.html` |
| `/admin-dashboard/` | AdminDashboardView | `admin_dashboard.html` |

> Templates là `TemplateView` thuần, không truyền context. Mọi data fetch qua API bằng JS trong template.

---

## 7. Auth & Security

### JWT Configuration (settings.py)
```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,        # mỗi refresh → tạo refresh mới
    'BLACKLIST_AFTER_ROTATION': True,     # refresh cũ bị blacklist
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}
```

### Permission matrix
- **Default**: `IsAuthenticated` (toàn bộ API khoá mặc định)
- **Public endpoints** (AllowAny + `authentication_classes = []`):
  - `/api/health/`, `/api/auth/login/`, `/api/auth/register/`, `/api/auth/google/`, `/api/auth/facebook/`, `/api/auth/oauth-config/`, `/api/auth/token/refresh/`
  - `/api/payments/momo-ipn/`, `/api/payments/momo-return/`, `/api/payments/settlement-return/`, `/api/payments/health/`
  - `/api/tracking/health/`, `/api/moderation/health/`
- **Admin only** (`IsAdminUser`): mọi `/api/admin/*`, `/api/payments/admin/*`, `/api/moderation/admin/*`, `/api/tracking/admin/*`
- **Role-based logic** trong view: worker-only / parent-only check `request.user.role` + trả 403 nếu sai

### OAuth Flow (Google + Facebook) — `core/oauth_views.py`
- **Chỉ cho parent** (worker phải nộp CCCD + chờ admin duyệt).
- Frontend gửi token → backend verify với Google/Facebook API.
- Nếu email đã tồn tại với cùng provider → login (trả JWT).
- Nếu email đã tồn tại với provider khác → 409 Conflict + `code` chỉ định provider đúng.
- Nếu chưa có → tạo tài khoản parent mới, `set_unusable_password()`.
- Parent có thể upgrade lên carepartner qua `/api/auth/upgrade-carepartner/` (nộp CCCD).

### MoMo Webhook Security
- `/api/payments/momo-ipn/` không yêu cầu JWT (MoMo gọi server-to-server).
- Verify **HMAC-SHA256 signature** để chống giả mạo (`momo_client._verify_signature`).
- Chuỗi ký theo spec MoMo v2: `accessKey=...&amount=...&extraData=...&message=...&orderId=...&orderInfo=...&orderType=...&partnerCode=...&payType=...&requestId=...&responseTime=...&resultCode=...&transId=...`

### Role Escalation Protection
- `UserSerializer.role` là `read_only=True` → không thể đổi role qua API.
- `auth_provider` cũng `read_only=True`.
- Worker phải có `is_approved=True` mới dùng được các endpoint worker (check trong view).

---

## 8. Cross-Cutting Flows

### 8.1. Task Lifecycle (Master Flow)

```
[Parent tạo task]
   ↓ (POST /api/tasks/ — status='open')
   ↓ Signal post_save(created=True)
   ├─→ moderation.signals._auto_moderate_task_on_create()
   │     → moderate_task() → Gemini API → TaskModeration.status='approved'/'rejected'/'needs_review'
   │     → Nếu rejected → notify parent
   │
[Worker ứng tuyển]  (POST /api/worker/tasks/<id>/apply/)
   ↓ → TaskApplication(status='pending')
   ↓ → notify parent
   │
[Parent approve ứng viên]  (POST /api/parent/applications/<id>/approve/)
   ↓ → TaskApplication.status='accepted'
   ↓ → Task.status='in_progress'
   ↓ → notify worker (push notification)
   ↓ → (Worker có thể grant consent cho tracking)
   │
[Parent setup payment]  (POST /api/payments/setup/)
   ↓ method='momo_escrow' → sinh payUrl MoMo → parent redirect
   ↓ method='cash' → tạo Payment record, không gọi MoMo
   │
[Parent pay MoMo]  (momo_escrow flow)
   ↓ MoMo gọi /api/payments/momo-ipn/ với resultCode=0
   ↓ → Payment.status='held', held_at=now
   ↓ → notify parent + worker
   │
[Worker làm việc + update vị trí]  (POST /api/tracking/location/ mỗi 10s)
   ↓ → update LiveLocation + append LocationHistory
   ↓ → check geofence → push cảnh báo nếu rời vùng
   │
[Worker xong việc → Parent mark completed]  (PATCH /api/tasks/<id>/status/ {status:'completed'})
   ↓ Signal post_save (status đổi)
   ├─→ payments.signals._trigger_payment_flow_on_task_save()
   │     → on_task_status_changed()
   │     ├─ momo_escrow → release_escrow(): MoMo Transfer API
   │     │   ├─ Thành công → Payment.status='completed', notify both
   │     │   └─ Thất bại → Payment.status='payout_failed', notify admin
   │     └─ cash → record_cash_completion(): Payment.status='completed',
   │              notify worker "hoa hồng sẽ tổng hợp cuối tháng"
   │
   └─→ tracking.signals._clear_tracking_on_task_save()
         → clear_task_tracking() → xóa LiveLocation (History vẫn giữ vĩnh viễn)
   │
[Parent tạo review]  (POST /api/parent/review/)
   ↓ → Review(task, reviewer=parent, reviewee=worker, rating, comment)
   ↓ → update worker.ai_profile_summary (chưa implement)
```

### 8.2. Cancel/Refund Flow
```
[Task status='cancelled' (khi đang held)]
   ↓ Signal post_save
   ├─→ payments.signals → refund_escrow()
   │     → MoMo Refund API → hoàn 100% cho parent
   │     → Payment.status='refunded'
   └─→ tracking.signals → clear_task_tracking()
```

### 8.3. Monthly Settlement Flow (Cash Settlement)
```
[Ngày 1 hàng tháng 9h00 Asia/Ho_Chi_Minh]  (chỉ trên Render)
   ↓ payments.scheduler._run_monthly_settlement()
   ↓ generate_monthly_settlements()
       → gom Payment có method='cash' + status='completed' của tháng trước
       → group theo worker → tạo CommissionSettlement (unique per worker/month)
       → gọi MoMo Pay App v2 sinh QR
       → notify worker (push + in-app)
       → Settlement.status='qr_generated', due_at=now+7 ngày

[Worker quét QR → pay]
   ↓ MoMo gọi /api/payments/momo-ipn/ với orderId của settlement
   ↓ handle_momo_ipn() detect settlement order
   ↓ → Settlement.status='paid', paid_at=now
   ↓ → notify worker

[Quá hạn]  (cron daily 9h05)
   ↓ send_settlement_reminders()
   ↓ → Settlement quá due_at → status='overdue', notify worker nhắc nhở
```

### 8.4. SOS Flow
```
[Parent hoặc Worker bấm SOS]  (POST /api/tracking/sos/)
   ↓ trigger_sos() → tạo SOSAlert(status='active')
   ↓ → push notification ngay cho bên kia (title: 🆘 SOS từ {sender_name})
   ↓ → include vị trí hiện tại nếu có

[Bên kia resolve]  (POST /api/tracking/sos/<sos_id>/resolve/)
   ↓ → SOSAlert.status='resolved', resolved_at, resolved_by
```

### 8.5. Geofence Warning Flow
```
[Worker update vị trí]  (POST /api/tracking/location/)
   ↓ haversine_distance(worker_latlng, task.geofence_latlng)
   ↓ if distance > task.geofence_radius (default 500m):
       ↓ if not live.is_outside_geofence:  # chưa cảnh báo trước đó
           ↓ push cho parent: "🚨🚨🚨 CẢNH BÁO: Carepartner rời vùng an toàn!"
           ↓ live.is_outside_geofence = True
   ↓ elif distance <= radius and live.is_outside_geofence:  # vừa quay lại
       ↓ push cho parent: "✅ Carepartner đã quay lại vùng an toàn"
       ↓ live.is_outside_geofence = False
```

---

## 9. AI Integration (Gemini)

### Sử dụng SDK nào
- Dùng **`google-genai`** (SDK mới, `from google import genai`), KHÔNG dùng `google-generativeai` legacy.
- Model: `gemini-2.5-flash` (cân bằng tốc độ + chất lượng + giá).
- Pattern chuẩn gọi:
```python
from google import genai
client = genai.Client(api_key=settings.GEMINI_API_KEY)
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=[{'role': 'user', 'parts': [{'text': user_prompt}]}],
    config=genai.types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.2-0.3,
        max_output_tokens=1024-3072,
    ),
)
text = response.text
```

### Fallback strategy (BẮT BUỘC)
Mỗi service AI phải có fallback an toàn khi:
- `GEMINI_API_KEY` không cấu hình
- Gemini timeout hoặc trả lỗi
- Parse JSON thất bại

→ **Fallback**: không chặn user, không raise exception. Trả kết quả mặc định (vd: tất cả task có `match_score=50` + reason "AI chưa kích hoạt", hoặc `TaskModeration.status='approved'`).

Helper chuẩn:
```python
def _get_gemini_client():
    gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key or gemini_key == 'your_gemini_api_key_here':
        return None
    try:
        from google import genai
        return genai.Client(api_key=gemini_key)
    except Exception:
        return None

def _parse_json_safe(text):
    """Parse JSON từ text có thể chứa ```json code blocks."""
    # 3 patterns: ```json ... ```, ``` ... ```, raw {...}
    ...
```

### Các prompt hiện tại
| Module | File | System prompt mục đích |
|---|---|---|
| `core/views.py` ChatbotAPIView | Tạo task từ ngôn ngữ tự nhiên | "Bạn là trợ lý AI của EduCareLink…" |
| `core/views.py` WorkerChatbotAPIView | Trợ lý carepartner | Tương tự + context carepartner |
| `core/views.py` AdminChatbotAPIView | Thống kê + phân tích ảnh cho admin | Có vision (Gemini multimodal) |
| `core/views.py` HelpCenterAPIView | Trung tâm trợ giúp | FAQ + hướng dẫn |
| `core/views.py` DistanceCalculationAPIView | Ước lượng khoảng cách + thời gian | Haversine + Gemini verify |
| `ai_recommendations/services.py` | Gợi ý việc + xếp hạng ứng viên | 2 prompt riêng (worker + parent) |
| `moderation/services.py` | Kiểm duyệt task + phân tích khiếu nại | 2 prompt riêng + JSON schema output |

### JSON output pattern
Tất cả prompt yêu cầu Gemini trả JSON. Pattern: prompt yêu cầu JSON trong code block, parse bằng `_parse_json_safe`, validate fields, fallback nếu thiếu.

### Caching
- `ai_recommendations/services.py` dùng `django.core.cache` (mặc định local memory; trên Render nên dùng Redis).
- TTL: worker recommendations 5 phút, parent candidate recommendations 3 phút.
- Cache key: `ai_rec_worker_{user_id}_{hash(tuple(sorted_task_ids))}`.

---

## 10. Background Schedulers

Ba scheduler chạy in-process (trong gunicorn worker) bằng APScheduler `BackgroundScheduler`. **Chỉ chạy trên Render** (check `os.environ['RENDER'] == 'true'`).

### 10.1. Keep-Alive Scheduler (`core/keepalive_scheduler.py`)
- **Mục đích**: Render free tier sleep sau 15 phút không traffic → scheduler tự ping chính mình để giữ thức.
- **Interval**: mỗi 3 phút (env `KEEPALIVE_INTERVAL`).
- **Endpoint ping**: `{RENDER_URL}/api/health/`.
- **Khởi động**: `core/apps.py CoreConfig.ready()` → `start_scheduler()`.
- **Stats**: GET `/api/admin/keepalive-stats/`.

### 10.2. AI Anomaly Detection Scheduler (`core/anomaly_scheduler.py`)
- **Mục đích**: Quét 10 bất thường mỗi 10 phút, báo admin qua `Notification`.
- **Interval**: 10 phút (env `ANOMALY_CHECK_INTERVAL`).
- **Cooldown**: 2 giờ cho cùng một alert (tránh spam).
- **10 checks**:
  1. Worker đã duyệt nhưng thiếu CCCD
  2. Worker đã duyệt nhưng thiếu ảnh chân dung
  3. Tài khoản bị cấm gần đây
  4. Lượng user mới > 10 trong 24h
  5. Worker đã duyệt nhưng chưa `is_verified`
  6. > 5 bằng cấp chờ duyệt
  7. Task mở > 7 ngày không ứng tuyển
  8. Đánh giá 1 sao gần đây
  9. > 5 đăng ký trong 1 giờ (bot detection)
  10. ≥ 3 task bị hủy trong 24h
- **Khởi động**: `core/apps.py CoreConfig.ready()` → `start_anomaly_scheduler()`.

### 10.3. Monthly Settlement Scheduler (`payments/scheduler.py`)
- **Mục đích**: Sinh QR MoMo cho kỳ thanh toán hoa hồng tiền mặt + nhắc overdue.
- **Cron 1**: Ngày 1 hàng tháng 9h00 → `generate_monthly_settlements()`.
- **Cron 2**: Mỗi ngày 9h05 → `send_settlement_reminders()`.
- **Khởi động**: `payments/apps.py PaymentsConfig.ready()` → `start_settlement_scheduler()`.
- **Trigger thủ công**: `python manage.py run_monthly_settlement` hoặc `POST /api/payments/admin/run-settlement/`.

### Pattern chung cho scheduler
```python
_scheduler = None
_lock = threading.Lock()

def start_xxx_scheduler():
    global _scheduler
    if not ENABLED: return
    if not IS_RENDER: return
    with _lock:
        if _scheduler is not None and _scheduler.running: return
        _scheduler = BackgroundScheduler(timezone='Asia/Ho_Chi_Minh', ...)
        _scheduler.add_job(...)
        _scheduler.start()
```
Thread-safe, idempotent, không chạy local.

---

## 11. Frontend

### 11.1. Web (Django Templates) — `frontend/`
- **Stack**: HTML + Tailwind CSS (CDN) + vanilla JS (fetch API).
- **Pattern**: mỗi template tự fetch API, render DOM. Template không nhận context từ view.
- **Auth**: JWT lưu trong `localStorage.access_token`. Mọi fetch gắn header `Authorization: Bearer <token>`. Nếu 401 → redirect `/login/`.
- **API base**: `'/api'` (relative path — dùng cùng origin với backend).
- **Design system** (theo `mobile/src/theme/colors.js` — tham chiếu):
  - Primary: `#F26522` (cam bTaskee)
  - Primary dark: `#D4541E`
  - Secondary: `#2DB84B` (xanh lá)
  - Background: `#F7F7F7`
  - Text primary: `#1A1A2E`
- **Vấn đề đã biết** (xem `EDUCARELINK_HANDOFF.md`): nhiều template đang mobile-only (max-w-md), màu chưa đồng bộ cam, bottom nav bar trên desktop. Đang trong quá trình redesign.

### 11.2. Mobile (React Native / Expo) — `mobile/`
- **Stack**: Expo SDK 54, React Native 0.81, React 19, axios, React Navigation 7.
- **API base**: `https://educarelink-backend.onrender.com/api` (hardcoded trong `mobile/src/api/client.js`).
- **Auth storage**: `expo-secure-store` (Keychain/Keystore) — không dùng AsyncStorage cho JWT.
- **Auto refresh token**: axios interceptor trong `client.js` — khi 401, tự gọi `/auth/token/refresh/`, nếu thất bại → logout.
- **Push notifications**: `expo-notifications` + `expo_push_token` field trên `User`. Token được register khi login.
- **Live tracking**: `expo-location` + foreground service. Gọi `POST /api/tracking/location/` mỗi 10s khi task in_progress + consent granted.
- **Navigation** (`AppNavigator.js`):
  - Stack: Splash → Login → Register → Onboarding
  - Parent Tabs (3): Home, MyTasks, Chatbot
  - Worker Tabs (3): WorkerFeed, MyJobs, WorkerProfile
  - Admin: AdminDashboard, AdminModeration
  - Stack con: CreateTask, Candidates, CandidateProfile, Review, PaymentSetup, MyEarnings, SettlementDetail, LiveTracking, Complaint, Notifications, HelpCenter
- **Build APK**: `cd mobile && ./build-apk-eas.sh` (EAS Build, project ID `3e841ddf-23c3-42ce-a2e1-8827c06311a2`).
- **Lưu ý mobile**: file `mobile/AGENTS.md` yêu cầu đọc docs Expo v54 trước khi viết code: `https://docs.expo.dev/versions/v54.0.0/`.

---

## 12. Environment Variables

File mẫu: `.env.example`. Trên Render: cấu hình qua Dashboard → Settings → Environment Variables.

### Django core
| Var | Mặc định | Mô tả |
|---|---|---|
| `SECRET_KEY` | (bắt buộc prod) | Django secret key — Render tự generate |
| `DEBUG` | `False` | Bật debug mode |
| `ALLOWED_HOSTS` | `educarelink-backend.onrender.com,localhost,127.0.0.1` | CSV |
| `RENDER` | `false` | Set `true` trên Render — bật scheduler + tắt load_dotenv |
| `CORS_ALLOW_ALL_ORIGINS` | `False` | CORS mở cho mọi origin |
| `DATABASE_URL` | (bắt buộc prod) | PostgreSQL connection string |

### AI
| Var | Mặc định | Mô tả |
|---|---|---|
| `GEMINI_API_KEY` | (empty) | Google Gemini API key — lấy tại https://aistudio.google.com/app/apikey |

### OAuth
| Var | Mặc định | Mô tả |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | (empty) | Google OAuth Client ID |
| `FACEBOOK_APP_ID` | (empty) | Facebook App ID |
| `FACEBOOK_APP_SECRET` | (empty) | Facebook App Secret |

### Keep-Alive
| Var | Mặc định | Mô tả |
|---|---|---|
| `KEEPALIVE_ENABLED` | `true` | Bật keepalive scheduler |
| `KEEPALIVE_INTERVAL` | `3` | Phút giữa các ping |
| `RENDER_URL` | `https://educarelink-backend.onrender.com` | URL ping đích |
| `ANOMALY_ENABLED` | `true` | Bật anomaly scheduler |
| `ANOMALY_CHECK_INTERVAL` | `10` | Phút giữa các scan |

### MoMo Payment
| Var | Mặc định | Mô tả |
|---|---|---|
| `MOMO_ENVIRONMENT` | `sandbox` | `sandbox` \| `production` |
| `MOMO_PARTNER_CODE` | (empty) | MoMo Partner Code |
| `MOMO_ACCESS_KEY` | (empty) | MoMo Access Key |
| `MOMO_SECRET_KEY` | (empty) | MoMo Secret Key — dùng cho HMAC-SHA256 |
| `MOMO_STORE_ID` | `EduCareLinkStore` | MoMo Store ID |
| `MOMO_RETURN_BASE_URL` | `https://educarelink-backend.onrender.com` | URL frontend cho redirect |
| `MOMO_IPN_URL` | `https://educarelink-backend.onrender.com/api/payments/momo-ipn/` | Webhook IPN |
| `PAYMENT_COMMISSION_RATE` | `0.20` | Tỷ lệ hoa hồng (20%) |
| `PAYMENT_SETTLEMENT_DUE_DAYS` | `7` | Số ngày worker có để pay QR hoa hồng |
| `PAYMENT_SCHEDULER_ENABLED` | `true` | Bật monthly settlement scheduler |

### Tracking
| Var | Mặc định | Mô tả |
|---|---|---|
| `TRACKING_GEOFENCE_RADIUS` | `500` | Bán kính geofence mặc định (mét) |
| `TRACKING_UPDATE_INTERVAL` | `10` | Giây — dùng cho frontend biết tần suất gửi |

> **Sandbox MoMo test credentials** (công khai, có thể đã bị MoMo vô hiệu): `MOMO/F8BBA842ECF85/K951B6PE1waDMi640xX08PD3vg6EkVlz`. Để go-live cần đăng ký business riêng tại https://business.momo.vn/.

---

## 13. Local Development

### Setup lần đầu
```bash
# 1. Clone repo (dùng PAT nếu private)
git clone https://github.com/huyhandsome6996/educarelink-backend-4-12-2026.git
cd educarelink-backend-4-12-2026

# 2. Tạo venv + cài deps
python -m venv venv
source venv/bin/activate    # Linux/Mac
# venv\Scripts\activate     # Windows
pip install -r requirements.txt

# 3. Cấu hình env
cp .env.example .env
# Sửa .env: DEBUG=True, GEMINI_API_KEY=<your_key>, MOMO_* nếu test payment

# 4. Migrate + seed
python manage.py migrate
python manage.py seed_demo_data    # tạo 3 tài khoản protected + dữ liệu mẫu

# 5. Chạy server
python manage.py runserver 0.0.0.0:8000
```

### Truy cập local
- Web app: `http://localhost:8000/`
- Admin Django: `http://localhost:8000/admin/` (login: `admin` / `Demo@2026`)
- Admin dashboard custom: `http://localhost:8000/admin-dashboard/`
- API health: `http://localhost:8000/api/health/`

### Mobile dev
```bash
cd mobile
npm install
npx expo start    # quét QR bằng Expo Go trên điện thoại
```
- Backend dùng `https://educarelink-backend.onrender.com/api` (hardcoded trong `mobile/src/api/client.js`).
- Để test local backend: sửa `BASE_URL` trong `client.js` thành `http://<LAN-IP>:8000/api` (IP máy tính, không `localhost`).

### Test MoMo IPN local
MoMo không gọi được `localhost`. Dùng tunnel:
```bash
ngrok http 8000
# Cập nhật .env:
# MOMO_RETURN_BASE_URL=https://<ngrok-subdomain>.ngrok-free.app
# MOMO_IPN_URL=https://<ngrok-subdomain>.ngrok-free.app/api/payments/momo-ipn/
```

### Management commands hữu ích
```bash
python manage.py test_momo_credentials           # verify MoMo credentials
python manage.py run_monthly_settlement          # trigger monthly settlement
python manage.py run_monthly_settlement --year 2026 --month 6
python manage.py send_settlement_reminders       # nhắc overdue
python manage.py seed_demo_data                  # reset demo data (giữ 3 protected)
```

---

## 14. Deployment (Render)

### Config (`render.yaml`)
- **Service type**: web service, plan free, Python 3.11
- **Build**: `./build.sh` (cài deps + collectstatic + migrate + seed_demo_data)
- **Start**: `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT`
- **Web concurrency**: 2 workers

### Build script (`build.sh`)
```bash
pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
python manage.py seed_demo_data || echo "⚠️ seed_demo_data failed, continuing deploy..."
```
> ⚠️ **Mỗi deploy sẽ RESET dữ liệu demo** (xóa mọi user/task không phải protected). Nếu muốn giữ data, comment dòng `seed_demo_data` trong `build.sh`.

### 3 tài khoản protected (không bị xóa khi seed)
- `admin` / `Demo@2026` — superuser
- `phuhuynh_test` / `Demo@2026` — parent demo
- `sinhvien_test` / `Demo@2026` — carepartner demo (đã approved)

### Production URL
- Backend: `https://educarelink-backend.onrender.com`
- API root: `https://educarelink-backend.onrender.com/api/`
- Web: `https://educarelink-backend.onrender.com/` (render Django templates)

### Static files
- `STATIC_ROOT = BASE_DIR / 'staticfiles'` — collectstatic chạy trong build.
- `STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'` — serve + gzip.
- Media files (ảnh CCCD): serve qua Django `serve()` (chỉ OK demo, production nên dùng S3).

---

## 15. Coding Conventions (BẮT BUỘC)

### 15.1. Module Isolation Principle
- **KHÔNG sửa code `core/`** khi thêm tính năng mới — tạo Django app mới + tích hợp bằng signal.
- **Module phụ** được phép import từ `core` (models, views, helpers), **KHÔNG ngược lại**.
- **KHÔNG import chéo giữa các module phụ** (vd: `payments` không import `tracking`).
- Trừ trường hợp bất khả kháng và có comment giải thích rõ.

### 15.2. Signal-based Integration
Khi muốn module phụ phản ứng với event của `core.Task` (hoặc model core khác):
```python
# <module>/signals.py
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from core.models import Task

@receiver(post_save, sender=Task)
def _on_task_changed(sender, instance, created, **kwargs):
    if kwargs.get('raw'): return  # bỏ qua fixtures
    # ... logic ...

# <module>/apps.py
class XxxConfig(AppConfig):
    def ready(self):
        from . import signals  # noqa
```

### 15.3. Service Layer Pattern
- Views chỉ làm I/O (parse request, validate, gọi service, format response).
- Business logic nằm trong `<module>/services.py`.
- Service function dùng keyword-only args: `def setup_payment(*, task, method, actor): ...`.
- Service raise `PermissionError` (→ 403), `ValueError` (→ 400), hoặc custom exception.

### 15.4. Naming Conventions
- **Model**: PascalCase, singular (`Task`, `TaskApplication`, `CommissionSettlement`).
- **Field**: snake_case (`is_approved`, `momo_pay_url`, `geofence_radius`).
- **View class**: `<Action><Resource>APIView` hoặc `<Action><Resource>View` (`SetupPaymentAPIView`, `AdminAllWorkersAPIView`).
- **URL name**: kebab-case (`admin-pending-workers`, `task-update-status`).
- **Function**: snake_case (`release_escrow`, `get_accepted_worker`).
- **Constant**: UPPER_SNAKE (`GEOFENCE_RADIUS_METERS`, `CACHE_TTL_WORKER`).

### 15.5. Language Rules
- **Code identifiers**: tiếng Anh (`get_accepted_worker`, `release_escrow`).
- **Comments + docstrings**: tiếng Việt (giải thích rõ hơn cho team VN).
- **Error messages API**: tiếng Việt (user-facing).
- **Log messages**: tiếng Anh + context (vd: `[MoMo] create_payment | orderId=...`).
- **AI prompts**: tiếng Việt (Gemini hiểu tốt tiếng Việt + output cho user VN).
- **Commit messages**: **tiếng Việt** (BẮT BUỘC — `feat:`, `fix:`, `refactor:` prefix).

### 15.6. Response Patterns
```python
# Thành công
return Response(serializer.data, status=status.HTTP_200_OK)
# hoặc status=201 (created), 204 (no content cho IPN)

# Lỗi validation
return Response({'error': 'Không tìm thấy công việc.'}, status=status.HTTP_404_NOT_FOUND)
return Response({'error': 'Bạn không sở hữu công việc này.'}, status=status.HTTP_403_FORBIDDEN)
return Response({'error': 'Thiếu trường X.'}, status=status.HTTP_400_BAD_REQUEST)

# Permission
permission_classes = [IsAuthenticated]
permission_classes = [IsAdminUser]
permission_classes = [AllowAny]
authentication_classes = []  # cho webhook public
```

### 15.7. Notification Pattern
Mỗi action quan trọng phải notify user qua 2 kênh:
1. **In-app**: `Notification.objects.create(recipient=..., title=..., message=...)`
2. **Push**: `send_expo_push_notification(token=user.expo_push_token, title=..., body=..., data={'type': '...', 'task_id': ...})`

Helper trong `tracking/services.py`:
```python
def _notify_user(user, title, message, data=None):
    try: Notification.objects.create(recipient=user, title=title, message=message)
    except: pass
    try:
        if user.expo_push_token:
            send_expo_push_notification(token=user.expo_push_token, title=title, body=message, data=data or {})
    except: pass
```

### 15.8. AI Service Pattern
```python
def some_ai_function(input):
    client = _get_gemini_client()
    if not client:
        return fallback_default()           # KHÔNG raise

    ai_text = _safe_call_gemini(client, system_prompt, user_prompt)
    if not ai_text:
        return fallback_default()

    parsed = _parse_json_safe(ai_text)
    if not parsed:
        return fallback_default()

    # validate fields + clean
    return parsed
```
**Nguyên tắc**: AI là enhancement, KHÔNG phải critical path. Nếu AI fail → fallback an toàn, không chặn user.

### 15.9. Money Handling
- Dùng `Decimal`, không `float`.
- `amount = Decimal(max_digits=12, decimal_places=0)` — VNĐ không có lẻ.
- Tính commission: `(Decimal(amount) * Decimal(rate)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)`.
- API trả string (JSON không có Decimal): `'amount': '500000'`.

### 15.10. Migrations
- Luôn tạo migration sau khi đổi model: `python manage.py makemigrations <app>`.
- Migration commit cùng code — KHÔNG commit code mà quên migration.
- Đặt tên migration có ý nghĩa: `0007_credentialsubmission_notification.py` (Django tự đặt).
- Không sửa migration đã push (tạo migration mới để fix).

---

## 16. Common Tasks (Recipes)

### 16.1. Thêm API endpoint mới trong module có sẵn
1. Thêm view trong `<module>/views.py` (kế thừa `APIView` hoặc `generics.*APIView`).
2. Thêm URL trong `<module>/urls.py`.
3. Thêm serializer trong `<module>/serializers.py` nếu cần input validation.
4. Business logic → `<module>/services.py`.
5. Test thủ công: `curl -H "Authorization: Bearer <token>" http://localhost:8000/api/...`

### 16.2. Thêm model mới
1. Thêm class trong `<module>/models.py` (kế thừa `models.Model`).
2. `python manage.py makemigrations <module>` → tạo file migration.
3. `python manage.py migrate` → apply.
4. Register trong `<module>/admin.py` nếu muốn xem ở Django admin.
5. Tạo serializer + view + url.

### 16.3. Thêm module Django mới
1. `python manage.py startapp <new_module>`.
2. Thêm `'<new_module>'` vào `INSTALLED_APPS` trong `backend/settings.py`.
3. Tạo `urls.py` trong app, include vào `backend/urls.py`: `path('api/', include('<new_module>.urls'))`.
4. Tạo `apps.py` với `ready()` nếu cần signal hooks.
5. KHÔNG import từ các module phụ khác — chỉ từ `core`.

### 16.4. Trigger logic khi Task đổi status
Dùng signal trong module của bạn (`<module>/signals.py`):
```python
_old_status_cache = {}

@receiver(pre_save, sender=Task)
def _cache_old_status(sender, instance, **kwargs):
    if instance.pk:
        old = Task.objects.get(pk=instance.pk)
        _old_status_cache[instance.pk] = old.status

@receiver(post_save, sender=Task)
def _on_task_status_changed(sender, instance, created, **kwargs):
    if kwargs.get('raw'): return
    old = _old_status_cache.pop(instance.pk, None)
    new = instance.status
    if old == new: return
    # ... your logic ...
```
> Pattern này dùng cache in-process vì `pre_save` + `post_save` chạy cùng request. Các module `payments` và `tracking` đã dùng pattern này — copy paste và sửa.

### 16.5. Gọi Gemini an toàn
Copy `_get_gemini_client()`, `_safe_call_gemini()`, `_parse_json_safe()` từ `moderation/services.py` hoặc `ai_recommendations/services.py`. Luôn có fallback.

### 16.6. Debug scheduler không chạy
1. Check env: `RENDER=true`? `KEEPALIVE_ENABLED=true` (hoặc `ANOMALY_ENABLED` / `PAYMENT_SCHEDULER_ENABLED`)?
2. Check log startup: `[KeepAlive] Scheduler STARTED` hoặc `[Anomaly] Scheduler STARTED`.
3. Gọi API stats: `/api/admin/keepalive-stats/` (cần admin JWT).
4. Trigger thủ công: `python manage.py <command>`.

### 16.7. Test MoMo flow
```bash
python manage.py test_momo_credentials
# Nếu ✅ → credentials OK
# Nếu ❌ "Chữ ký không hợp lệ" → credentials sai hoặc MoMo đã vô hiệu test creds
```

### 16.8. Reset demo data
```bash
python manage.py seed_demo_data
# Xóa toàn bộ data demo + tạo mới. GIỮ 3 tài khoản: admin, phuhuynh_test, sinhvien_test.
```

---

## 17. Known Issues & Gotchas

1. **Render free tier sleeps** → đã có keepalive scheduler ping mỗi 3 phút. Nếu server vẫn sleep, check `KEEPALIVE_ENABLED=true` và `RENDER=true`.
2. **MoMo test credentials có thể bị vô hiệu** bất cứ lúc nào → đăng ký business riêng tại https://business.momo.vn/.
3. **MoMo Transfer API** (giải ngân) yêu cầu đối tác đăng ký Payout Service riêng. Nếu chưa → Payment.status=`payout_failed`, admin retry thủ công.
4. **`build.sh` reset data mỗi deploy** — demo data bị reset, giữ 3 protected accounts. Muốn giữ data → comment dòng `seed_demo_data`.
5. **`task_create_1.html` và `task_create_2.html` bị trùng chức năng** (xem `EDUCARELINK_HANDOFF.md`).
6. **`worker_profile.html` có hardcoded data** — cần fetch API.
7. **AI recommendation cache** dùng `django.core.cache` local memory — mỗi gunicorn worker có cache riêng. Production nên dùng Redis.
8. **`first_login` flag** dùng cho onboarding — set `False` qua `POST /api/onboarding/complete/`.
9. **CORS** mặc định `CORS_ALLOW_ALL_ORIGINS=False` — trên production cần add origin vào `CORS_ALLOWED_ORIGINS`.
10. **CSRF** không ảnh hưởng API (JWT auth), chỉ ảnh hưởng Django form. `CSRF_TRUSTED_ORIGINS` đã set cho Render + localhost.
11. **Media files** serve qua Django `serve()` trên production (không có Nginx) — chỉ OK demo, production nên dùng S3/cloud storage.
12. **Timezone**: `Asia/Ho_Chi_Minh` (UTC+7). APScheduler cũng set timezone này. Khi gửi datetime cho frontend, dùng ISO 8601.
13. **`auto_field`** là `BigAutoField` — ID là `int`, không phải UUID.
14. **Social Auth** chỉ cho parent. Worker phải đăng ký bằng email + nộp CCCD.
15. **`expo_push_token`** chỉ gửi được qua Expo Push API. Khi dev local với Expo Go, token vẫn hoạt động.

---

## 18. Demo Accounts (sau khi `seed_demo_data`)

| Username | Password | Role | Ghi chú |
|---|---|---|---|
| `admin` | `Demo@2026` | superuser + is_staff | Dùng cho Django admin + admin dashboard |
| `phuhuynh_test` | `Demo@2026` | parent | Đã có task mẫu |
| `sinhvien_test` | `Demo@2026` | worker | Đã approved, có bằng cấp |
| (các tài khoản khác) | `Demo@2026` | parent/worker | Tạo bởi seed_demo_data, sẽ bị xóa khi reset |

> 3 tài khoản trên là **protected** — không bị xóa khi chạy `seed_demo_data`.

---

## 19. Git Workflow

### Branch naming
- `main` — production, luôn deployable
- `develop` — integration branch (nếu có)
- `feature/<tên-tính-năng>` — vd: `feature/momo-payment`, `feature/ai-chatbot-backend`
- `fix/<mô-tả>` — vd: `fix/qr-auto-login`
- `feat/<mô-tả>` — alias cho feature

### Commit conventions
- **Tiếng Việt**, prefix conventional commits:
  - `feat: thêm chức năng X`
  - `fix: sửa lỗi Y`
  - `refactor: tái cấu trúc module Z`
  - `docs: cập nhật AGENTS.md`
  - `chore: bump dependency`
  - `mobile: đồng bộ tính năng với web app`
- Một commit = một ý đồ. Không trộn nhiều thay đổi không liên quan.

### PR workflow
1. Tạo branch mới từ `main`: `git checkout -b feature/<tên>`.
2. Commit nhiều lần trên branch.
3. Push: `git push origin feature/<tên>`.
4. Tạo PR trên GitHub: `feature/<tên>` → `main`.
5. Squash merge hoặc rebase merge (tuỳ reviewer).

### Lệnh thường dùng
```bash
git status
git add .
git commit -m "feat: mô tả ngắn gọn"
git push origin main
git pull --rebase origin main    # cập nhật local
git log --oneline -10
```

---

## 20. Agent Coordination Protocol

> Phần này dành riêng cho AI agents làm việc chung trên repo. **Đọc kỹ trước khi bắt đầu task.**

### 20.1. Nguyên tắc cốt lõi
1. **Đọc AGENTS.md trước** — file này là nguồn sự thật duy nhất về kiến trúc.
2. **Tuân thủ §15 Coding Conventions** — không ngoại lệ.
3. **Module isolation** — không sửa `core/` nếu có thể tạo module mới.
4. **Signal-based integration** — thích phản ứng event thì dùng signal, không sửa code nguồn.
5. **Tiếng Việt cho mọi output user-facing** + commit messages.

### 20.2. Trước khi sửa code
1. **Đọc module liên quan** trong AGENTS.md (§4, §5, §6, §8).
2. **Check module isolation** — có thực sự cần sửa core không? Có thể tạo module mới + signal không?
3. **Check existing patterns** — xem module tương tự đã làm thế nào (vd: thêm module mới → copy structure từ `payments/`).
4. **Check environment** — feature cần env var mới? Thêm vào `.env.example` + `render.yaml`.

### 20.3. Khi làm task
1. **Bắt đầu từ todo list rõ ràng** — chia task thành subtask, đánh dấu in_progress → completed.
2. **Persist scripts** — script > 10 dòng thì lưu vào `/home/z/my-project/scripts/` (không inline `python -c`).
3. **Test trước khi commit** — chạy `python manage.py migrate` + `python manage.py test` (nếu có).
4. **Comment code bằng tiếng Việt** — giải thích "tại sao", không phải "cái gì".

### 20.4. Khi commit
1. **Commit message tiếng Việt** + conventional prefix.
2. **Một commit = một ý đồ** — không trộn feature + refactor.
3. **Push lên branch đúng** — feature branch cho thay đổi lớn, main cho hotfix nhỏ.
4. **Migration đi cùng code** — không tách rời.

### 20.5. Handoff cho agent tiếp theo
Khi hoàn thành task, tạo/cập nhật section trong `Nhat_Ky_Hoat_Dong.md` với format:
```markdown
## <Tiêu đề tính năng> (<date>)

### Công việc đã làm
- ...

### File đã sửa
- `path/to/file.py`: mô tả ngắn

### Lệnh đã chạy
- `python manage.py makemigrations`
- `python manage.py migrate`

### Lưu ý cho agent tiếp theo
- ...
```

### 20.6. Khi gặp tình huống chưa rõ
1. **Ưu tiên đọc code** — AGENTS.md không thay thế được đọc source. Nếu code mâu thuẫn với AGENTS.md, **code là nguồn sự thật** — update AGENTS.md sau.
2. **Check git log** — `git log --oneline -20` cho context gần đây.
3. **Check `EDUCARELINK_HANDOFF.md`** cho context web redesign.
4. **Check `Nhat_Ky_Hoat_Dong.md`** cho lịch sử thay đổi.
5. **Check `payments/README.md`** cho chi tiết module payment.

### 20.7. Đừng làm
- ❌ Sửa `core/views.py` hoặc `core/models.py` khi có thể tạo module mới.
- ❌ Import chéo giữa các module phụ.
- ❌ Bỏ qua fallback khi gọi AI.
- ❌ Commit `.env`, `db.sqlite3`, `media/`, `staticfiles/`, `node_modules/`.
- ❌ Dùng `float` cho tiền tệ.
- ❌ Hardcode env var trong code — luôn đọc từ `os.environ` hoặc `settings`.
- ❌ Tạo endpoint public (AllowAny) mà không có `authentication_classes = []`.
- ❌ Sửa migration đã push — tạo migration mới.
- ❌ Commit message tiếng Anh (trừ prefix conventional).
- ❌ Thêm dependency mới mà không cập nhật `requirements.txt` (Python) hoặc `package.json` (mobile).
- ❌ Bypass permission check (always check `request.user.role` + ownership).

### 20.8. Khi thêm module mới — checklist
- [ ] Tạo app: `python manage.py startapp <module>`
- [ ] Thêm vào `INSTALLED_APPS` (`backend/settings.py`)
- [ ] Include URL vào `backend/urls.py`: `path('api/', include('<module>.urls'))`
- [ ] Tạo `apps.py` với `ready()` nếu cần signal
- [ ] Thêm env var mới vào `.env.example` + `render.yaml` (nếu có)
- [ ] Tạo migration: `python manage.py makemigrations <module>`
- [ ] Apply: `python manage.py migrate`
- [ ] Test API: `curl` hoặc Postman
- [ ] Update AGENTS.md (thêm module vào §4 + §6 + schema vào §5 nếu có model)
- [ ] Update `Nhat_Ky_Hoat_Dong.md`
- [ ] Commit + push

### 20.9. Khi sửa module có sẵn — checklist
- [ ] Đọc module đó trong AGENTS.md
- [ ] Đọc source file liên quan trước khi sửa
- [ ] Không phá backward compatibility API (hoặc có migration plan)
- [ ] Test API affected
- [ ] Update AGENTS.md nếu thay đổi kiến trúc
- [ ] Update `Nhat_Ky_Hoat_Dong.md`
- [ ] Commit + push

### 20.10. Format khi agent bổ sung thông tin vào AGENTS.md
Khi agent cần thêm thông tin vào file này (vd: phát hiện gotcha mới, thêm pattern), thêm vào section tương ứng với format:
```markdown
> **[<date> — <agent name>]** <nội dung bổ sung>
```
KHÔNG xóa nội dung cũ — chỉ bổ sung. Nếu cần sửa nội dung cũ, comment rõ lý do trong commit.

---

## 21. File Index (Quick Lookup)

| File | Vai trò |
|---|---|
| `backend/settings.py` | Django settings — tất cả config (DB, JWT, MoMo, Tracking, AI, CORS, security) |
| `backend/urls.py` | Root URL routing |
| `core/models.py` | 8 models foundation (User, ServiceCategory, Task, TaskApplication, Review, CredentialSubmission, ProfileChangeRequest, Notification) |
| `core/views.py` | ~25 API views (auth, task, parent, worker, admin, chatbot, notifications) — file lớn nhất project |
| `core/oauth_views.py` | Google + Facebook OAuth + Upgrade to Carepartner |
| `core/serializers.py` | DRF serializers cho core models |
| `core/urls.py` | ~40 URL patterns cho core APIs |
| `core/keepalive_scheduler.py` | Scheduler ping mỗi 3 phút |
| `core/anomaly_scheduler.py` | Scheduler quét 10 anomaly mỗi 10 phút |
| `core/management/commands/seed_demo_data.py` | Reset demo data (giữ 3 protected) |
| `payments/models.py` | Payment, CommissionSettlement, PaymentLog |
| `payments/momo_client.py` | MoMo API wrapper (Pay App v2 + Refund + Transfer + signature) |
| `payments/services.py` | Business logic (setup_payment, handle_momo_ipn, release_escrow, refund_escrow, generate_monthly_settlements) |
| `payments/views.py` | 15 API endpoints (parent, worker, admin, webhook) |
| `payments/signals.py` | Trigger payment flow khi Task đổi status |
| `payments/scheduler.py` | Monthly settlement cron |
| `payments/README.md` | Tài liệu chi tiết module payment |
| `tracking/models.py` | LocationConsent, LiveLocation, LocationHistory, SOSAlert |
| `tracking/services.py` | Haversine, geofence, grant/revoke consent, trigger_sos |
| `tracking/views.py` | 11 API endpoints |
| `tracking/signals.py` | Clear LiveLocation khi Task completed/cancelled |
| `moderation/models.py` | TaskModeration, Complaint, ComplaintEvidence |
| `moderation/services.py` | Gemini moderation + complaint analysis |
| `moderation/views.py` | 10 API endpoints |
| `moderation/signals.py` | Auto-moderate task khi tạo |
| `ai_recommendations/services.py` | Gemini gợi ý việc + xếp hạng ứng viên + cache |
| `ai_recommendations/views.py` | 3 API endpoints |
| `frontend/urls.py` | 20 web routes |
| `frontend/views.py` | TemplateView đơn giản |
| `frontend/templates/frontend/*.html` | 20 HTML templates |
| `mobile/App.js` | Entry point Expo |
| `mobile/app.json` | Expo config (SDK 54, permissions, EAS project ID) |
| `mobile/src/api/client.js` | Axios client + JWT interceptor + auto-refresh |
| `mobile/src/navigation/AppNavigator.js` | Stack + Tab navigation |
| `mobile/src/context/AuthContext.js` | Auth state + push token register |
| `mobile/src/screens/**/*.js` | ~25 screens (Auth, Parent, Worker, Admin, Payment, Onboarding) |
| `mobile/src/api/*.js` | 9 API modules (auth, tasks, payments, tracking, moderation, ai_recommendations, admin, notifications, onboarding) |
| `mobile/src/services/LocationService.js` | Live tracking client-side |
| `mobile/src/theme/colors.js` | Design system (cam #F26522 primary) |
| `requirements.txt` | Python deps |
| `.env.example` | Mẫu env vars |
| `render.yaml` | Render deployment config |
| `Procfile` | `gunicorn backend.wsgi:application` |
| `build.sh` | Render build script |
| `seed_data.py` | Script seed data độc lập |
| `EDUCARELINK_HANDOFF.md` | Handoff doc cho web redesign |
| `Nhat_Ky_Hoat_Dong.md` | Nhật ký cập nhật tính năng |
| `manage.py` | Django entrypoint |

---

## 22. Documentation Maintenance

File này được cập nhật mỗi khi:
- Thêm/xóa/sửa Django app
- Thêm/xóa/sửa model
- Thêm/xóa/sửa API endpoint
- Đổi architectural pattern
- Phát hiện gotcha mới cần lưu ý
- Đổi environment variable
- Đổi deployment platform

**Quy tắc**: AGENTS.md phải luôn phản ánh trạng thái hiện tại của repo. Nếu agent phát hiện sai lệch, **update ngay** trong cùng PR với code change.

---

*Tài liệu này được tạo bởi Z.ai (Super Z) — phiên bản đầu tiên, phân tích toàn bộ repo ngày 2026-07-09. Mọi agent tiếp theo có quyền bổ sung/sửa đổi theo §20.10.*
