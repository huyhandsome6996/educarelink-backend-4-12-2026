# EduCareLink - Handoff Document cho phiên redesign giao diện web

> File này chứa TOÀN BỘ thông tin cần thiết để tiếp tục công việc redesign giao diện web (HTML templates) cho dự án EduCareLink.  
> Phiên trước đã revert commit redesign và push lên GitHub. Repo hiện tại đã về trạng thái gốc.

---

## 1. THÔNG TIN REPO & TRUY CẬP

- **GitHub URL:** `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
- **GitHub PAT:** `<CUNG CẤP KHI MỞ PHIÊN CHAT MỚI>`
- **Clone command:** `git clone https://<PAT>@github.com/huyhandsome6996/educarelink-backend-4-12-2026.git`
- **Yêu cầu:** Dùng **tiếng Việt** cho commit messages

---

## 2. YÊU CẦU CHÍNH TỪ USER

1. **KHÔNG ĐỘNG** vào mobile app (React Native/Expo) và backend (Django API views/models/urls)
2. **Cải thiện** giao diện web app (HTML templates trong `frontend/templates/frontend/`) - hiện tại RẤT XẤU
3. Giao diện web phải **hoạt động như 1 website bình thường** (responsive, desktop-friendly)
4. **Đồng bộ phong cách thiết kế** với giao diện mobile app nhưng phù hợp với màn hình máy tính
5. Web và mobile vẫn **dùng chung 1 backend Django** (không thay đổi API)
6. Git commit bằng **tiếng Việt**

---

## 3. TỔNG QUAN DỰ ÁN

**EduCareLink** - Nền tảng kết nối Phụ huynh với Sinh viên/Carepartner

### Tech Stack
- **Backend:** Django 6.0.4 + DRF 3.17.1 + SimpleJWT 5.5.1
- **Database:** SQLite (dev)
- **Mobile:** React Native (Expo SDK 54) - KHÔNG CHẠM
- **Web:** Django Templates (HTML/CSS/JS) - CẦN REDesign
- **AI:** Google Gemini (chatbot tự tạo task từ tin nhắn)
- **Notifications:** Expo Push Notifications

### 2 Vai trò người dùng
- **Parent (Phụ huynh):** Đăng ký tự động approve, đăng việc, duyệt ứng viên, đánh giá
- **Worker (Carepartner):** Đăng ký cần admin duyệt, tìm việc, ứng tuyển, xem hồ sơ

---

## 4. DESIGN SYSTEM CỦA MOBILE APP (THAM CHIẾU)

### Bảng màu (từ `mobile/src/theme/colors.js`)

```javascript
// Màu chính — Cam ấm bTaskee-style
primary:       '#F26522',   // cam chủ đạo
primaryDark:   '#D4541E',   // cam đậm (pressed state)
primaryLight:  '#FFF4ED',   // cam nhạt (background highlight)
primarySoft:   '#FFCFB3',   // cam pastel nhẹ

// Màu phụ — Xanh lá tươi cho sinh viên
secondary:     '#2DB84B',   // xanh lá tươi
secondaryDark: '#1E9439',
secondaryLight:'#EAFBEF',

// Nền & Bề mặt
background:    '#F7F7F7',   // nền xám rất nhạt
surface:       '#FFFFFF',   // card trắng
surfaceAlt:    '#FFF9F5',   // card nền cam nhạt

// Text
textPrimary:   '#1A1A2E',   // tiêu đề, chữ chính
textSecondary: '#6B7280',   // chữ phụ
textMuted:     '#9CA3AF',   // chữ rất nhạt
textOnPrimary: '#FFFFFF',   // chữ trên nền cam

// Trạng thái
success:       '#10B981',   successBg:     '#ECFDF5',
warning:       '#F59E0B',   warningBg:     '#FFFBEB',
error:         '#EF4444',   errorBg:       '#FEF2F2',
info:          '#3B82F6',   infoBg:        '#EFF6FF',

// Border & Divider
border:        '#F0F0F0',
divider:       '#E5E7EB',

// Border radius
radiusSm: 8,  radiusMd: 14,  radiusLg: 20,  radiusXl: 28,  radiusFull: 999
```

### Navigation Structure (Mobile)

**Phụ huynh (3 tabs):**
1. Trang chủ (ParentHomeScreen)
2. Hoạt động (MyTasksScreen)
3. AI Trợ lý (ChatbotScreen)

**Carepartner (3 tabs):**
1. Tìm việc (WorkerFeedScreen)
2. Việc của tôi (MyJobsScreen)
3. Tài khoản (WorkerProfileScreen)

### Screens Mobile (thứ tự luồng)
- Splash → Login / Register
- **Parent:** Home → CreateTask → MyTasks → Candidates → CandidateProfile → Review
- **Worker:** Feed → TaskDetail → MyJobs → Profile

---

## 5. CẤU TRÚC WEB TEMPLATE HIỆN TẠI

### URL Routes (`frontend/urls.py`)

| URL | View | Template | Mô tả |
|-----|------|----------|-------|
| `/` | SplashView | `splash.html` | Màn hình chào |
| `/login/` | LoginView | `login.html` | Đăng nhập + Đăng ký |
| `/register/` | RegisterView | `register.html` | Đăng ký riêng |
| `/parent/` | ParentHomeView | `parent_home.html` | Trang chủ Phụ huynh |
| `/parent/create-1/` | TaskCreate1View | `task_create_1.html` | Đăng việc bước 1 |
| `/parent/create-2/` | TaskCreate2View | `task_create_2.html` | Đăng việc bước 2 |
| `/parent/tasks/` | ParentTasksView | `parent_tasks.html` | Việc của tôi (Parent) |
| `/parent/browse-candidates/` | BrowseCandidatesView | `browse_candidates.html` | Xem ứng viên |
| `/parent/review/` | ReviewView | `review.html` | Đánh giá Carepartner |
| `/worker/` | WorkerFeedView | `worker_feed.html` | Bảng tin việc làm |
| `/worker/task-detail/` | TaskDetailView | `task_detail.html` | Chi tiết công việc |
| `/worker/my-jobs/` | WorkerJobsView | `worker_jobs.html` | Việc của tôi (Worker) |
| `/worker/profile/` | WorkerProfileView | `worker_profile.html` | Hồ sơ Carepartner |
| `/admin-dashboard/` | AdminDashboardView | `admin_dashboard.html` | Admin duyệt tài khoản |

### Views (`frontend/views.py`)
Chỉ là `TemplateView` đơn giản render template, không truyền context data. Tất cả data được fetch từ API bằng JavaScript.

---

## 6. API ENDPOINTS (`core/urls.py`)

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/auth/register/` | POST | Đăng ký tài khoản |
| `/api/auth/login/` | POST | Đăng nhập (trả về JWT + role) |
| `/api/profile/` | GET/PATCH | Hồ sơ người dùng |
| `/api/tasks/` | GET/POST | Danh sách / Tạo công việc |
| `/api/parent/my-tasks/` | GET | Việc phụ huynh đã đăng |
| `/api/parent/tasks/<id>/candidates/` | GET | Ứng viên của 1 task |
| `/api/parent/applications/<id>/approve/` | POST | Chấp nhận ứng viên |
| `/api/parent/review/` | POST | Tạo đánh giá |
| `/api/worker/tasks/<id>/apply/` | POST | Ứng tuyển việc |
| `/api/worker/my-jobs/` | GET | Việc đã ứng tuyển |
| `/api/worker/<id>/profile/` | GET | Hồ sơ Carepartner chi tiết |
| `/api/chatbot/` | POST | Chat với AI (Gemini) |
| `/api/admin/pending-workers/` | GET | DS chờ duyệt |
| `/api/admin/workers/<id>/action/` | POST | Duyệt/Từ chối/Sửa bằng cấp |
| `/api/admin/all-workers/` | GET | Tất cả Carepartner |

### Auth Pattern
- Frontend lưu JWT token vào `localStorage`
- Mọi API call gửi header: `Authorization: Bearer <token>`
- Nếu không có token → redirect về trang login

---

## 7. DATABASE MODELS (`core/models.py`)

### User (kế thừa AbstractUser)
- `role`: 'parent' | 'worker'
- `phone_number`, `address`
- `is_verified`, `is_approved` (admin duyệt cho worker)
- `id_card_front`, `id_card_back`, `selfie_photo` (ảnh xác minh)
- `certificate_photo`, `qualifications` (JSON array, admin nhập)
- `expo_push_token`
- `ai_profile_summary` (AI tóm tắt hồ sơ)

### ServiceCategory
- `name`, `icon_name`, `description`

### Task
- `title`, `description`, `price` (VNĐ)
- `status`: 'open' | 'in_progress' | 'completed' | 'cancelled'
- `parent` (FK → User), `category` (FK → ServiceCategory)
- `location`, `scheduled_time`
- `ai_generated_from_prompt` (lưu câu chat gốc nếu tạo qua AI)
- `created_at`

### TaskApplication
- `task` (FK), `worker` (FK)
- `status`: 'pending' | 'accepted' | 'rejected'
- `applied_at`
- unique_together = ('task', 'worker')

### Review
- `task` (OneToOne → Task), `reviewer` (FK), `reviewee` (FK)
- `rating` (1-5), `comment`, `created_at`

---

## 8. VẤN ĐỀ CỦA GIAO DIỆN WEB HIỆN TẠI

### Vấn đề chính
1. **Thiết kế mobile-only:** Tất cả template hiện thiết kế như mobile app (max-w-md, bottom nav bar) → Rất xấu trên desktop
2. **Màu sắc không đồng nhất:** Template dùng tông xanh dương (#0051d5) + teal, trong khi mobile app dùng cam (#F26522) → Không đồng bộ với mobile
3. **Bottom nav bar trên desktop:** Dùng fixed bottom nav bar không phù hợp cho website desktop → Cần sidebar hoặc top nav
4. **Không có layout desktop:** Thiếu sidebar, không có grid layout cho màn hình lớn
5. **Hardcoded data:** Một số template (register, worker_profile) có dữ liệu tĩnh thay vì dynamic
6. **UX không professional:** Dùng alert() cho thông báo, không có toast/modal đẹp
7. **Splash.html không cần thiết:** Website không cần splash screen, nên redirect thẳng hoặc có landing page

### Vấn đề chi tiết từng template

| Template | Vấn đề |
|----------|--------|
| `splash.html` | Splash screen 2s rồi redirect → không cần cho web, nên có landing page hoặc redirect thẳng |
| `login.html` | Gộp cả login + register, thiết kế mobile-only (max-w-480px), màu xanh dương không khớp mobile |
| `register.html` | Không hoạt động (thiếu JS submit), design mobile-only, chưa có upload ảnh CCCD cho worker |
| `parent_home.html` | Bottom nav bar, max-w không giới hạn, thiếu sidebar, màu không đồng nhất |
| `parent_tasks.html` | Bottom nav bar, mobile-only, hardcoded cards thay vì dynamic data |
| `task_create_1.html` | Thiết kế mobile-only, thiếu category đầy đủ (chỉ 3) |
| `task_create_2.html` | Tương tự task_create_1, bị trùng lặp chức năng |
| `task_detail.html` | max-w-md wrapper, mobile-only |
| `browse_candidates.html` | Mobile-only, thiếu thông tin chi tiết ứng viên |
| `review.html` | Mobile-only, thiếu thông tin worker |
| `worker_feed.html` | Header teal không khớp mobile, bottom nav bar, mobile-only |
| `worker_jobs.html` | Bottom nav bar, mobile-only |
| `worker_profile.html` | Dữ liệu tĩnh (hardcoded "Nguyễn Văn A"), mobile-only |
| `admin_dashboard.html` | Tương đối OK (đã có sidebar), nhưng có thể cải thiện |

---

## 9. HƯỚNG REDesign ĐỀ XUẤT

### Nguyên tắc thiết kế
1. **Desktop-first, responsive:** Thiết kế cho desktop trước, vẫn responsive cho mobile
2. **Đồng bộ màu mobile:** Dùng cam #F26522 làm primary thay vì xanh dương #0051d5
3. **Sidebar navigation** cho desktop thay vì bottom nav bar
4. **Grid layout** cho danh sách (cards, tasks) trên desktop
5. **Toast notifications** thay vì alert()
6. **Professional dashboard** cho Parent và Worker

### Cấu trúc layout đề xuất

**Desktop Layout (≥1024px):**
```
┌──────────────────────────────────────────────┐
│ Header: Logo + User Info + Logout            │
├────────┬─────────────────────────────────────┤
│        │                                     │
│ Side   │         Main Content                │
│ Nav    │         (Dynamic area)              │
│        │                                     │
│        │                                     │
├────────┴─────────────────────────────────────┤
│ Footer (sticky bottom)                       │
└──────────────────────────────────────────────┘
```

**Mobile Layout (<1024px):**
- Giữ bottom nav bar như hiện tại nhưng cải thiện màu sắc
- Cards vẫn hiển thị tốt

### Màu sắc cần đổi
- `primary: #0051d5` → `primary: #F26522` (cam bTaskee)
- `on-primary: #ffffff` → giữ nguyên
- Tông nền: giữ `#F7F7F7` (giống mobile)
- Surface/card: `#FFFFFF`
- Header/sidebar: cam hoặc trắng với accent cam
- Teal → chỉ dùng cho admin dashboard (giữ nguyên dark theme)

### Tính năng cần thêm
1. **Sidebar navigation** cho desktop (Parent: Trang chủ, Việc của tôi, AI Trợ lý, Đăng xuất | Worker: Tìm việc, Việc của tôi, Hồ sơ, Đăng xuất)
2. **Toast notification system** (dùng cho thay thế alert())
3. **Landing page** thay vì splash (hiển thị 2 nút: Đăng nhập / Đăng ký)
4. **Chatbot page** cho parent (mobile có, web chưa có)
5. **Dynamic data** cho worker_profile (fetch API thay vì hardcoded)
6. **Upload ảnh CCCD** trong register cho worker role

---

## 10. CHI TIẾT CODE HIỆN TẠI CỦA TỪNG TEMPLATE

### splash.html
- Hiển thị logo Educarelink + tagline + loading animation
- Auto redirect sang login sau 2 giây
- Dùng gradient xanh dương

### login.html
- Gộp cả login + register (tab switcher)
- Role selector cho register (Parent/Worker)
- Gọi API `/api/auth/login/` và `/api/auth/register/`
- Lưu token vào localStorage, redirect theo role
- Social login buttons (Google, Facebook) - CHƯA HOẠT ĐỘNG

### register.html
- Tương tự login nhưng chỉ đăng ký
- CHƯA CÓ JS submit - không hoạt động
- CHƯA CÓ upload ảnh CCCD cho worker

### parent_home.html
- Fetch profile + tasks từ API
- Hiển thị nút "Đăng việc ngay" + danh sách task
- Bottom nav: Trang chủ, Việc của tôi, Đăng xuất

### parent_tasks.html
- Tab: Đang tìm / Đang thực hiện / Lịch sử (NHƯNG tabs chưa filter, chỉ hiển thị tất cả)
- Dynamic task list từ API
- Bottom nav bar

### task_create_1.html
- Category selector (3 danh mục: Gia sư, Đón trẻ, Dọn dẹp)
- Form: title, description, location, date, time, price
- Map preview placeholder
- Gọi API POST `/api/tasks/`

### task_create_2.html
- Tương tự task_create_1 nhưng thiết kế khác
- BỊ TRÙNG LẮP CHỨC NĂNG với task_create_1

### browse_candidates.html
- Lấy task_id từ localStorage
- Fetch candidates từ API `/api/parent/tasks/<id>/candidates/`
- Nút "Chấp nhận" gọi API approve

### review.html
- Star rating (1-5)
- Comment textarea
- Gọi API POST `/api/parent/review/`

### worker_feed.html
- Fetch tất cả tasks từ API `/api/tasks/`
- Search bar (CHƯA HOẠT ĐỘNG)
- Task cards với nút "Ứng tuyển"

### task_detail.html
- Lấy task_id từ URL params
- Fetch task detail từ API
- Nút "Ứng tuyển ngay"

### worker_jobs.html
- Tabs: Chờ duyệt / Sắp làm / Lịch sử (CÓ filter hoạt động)
- Dynamic data từ API `/api/worker/my-jobs/`

### worker_profile.html
- HARDCODED "Nguyễn Văn A" - không fetch API
- AI summary box
- Stats: việc hoàn thành, thu nhập
- Menu options

### admin_dashboard.html
- Dark theme sidebar + table layout
- Tab: Chờ duyệt / Tất cả Carepartner
- Auto-refresh mỗi 30 giây
- Photo modal + Edit qualifications modal
- Gọi admin API endpoints
- **Template này tương đối OK, có thể giữ hoặc cải thiện nhẹ**

---

## 11. SERIALIZER FIELDS QUAN TRỌNG

### UserSerializer
Fields: `id, username, first_name, last_name, email, password, role, phone_number, address, is_verified, is_approved, ai_profile_summary, id_card_front, id_card_back, selfie_photo, certificate_photo, qualifications, expo_push_token`

### TaskSerializer
Fields: tất cả + `parent_name` (read_only), `category_name` (read_only)

### TaskApplicationSerializer
Fields: tất cả + `worker_name, worker_username, task_title, task_status, task_price, task_location, task_scheduled_time, task_description, parent_username, parent_name`

### ReviewSerializer
Fields: tất cả + `reviewer_name, reviewee_name`

---

## 12. LƯU Ý QUAN TRỌNG

1. **Không thay đổi `frontend/views.py`** - chỉ cần TemplateView, data lấy qua API
2. **Không thay đổi `core/views.py`** - API giữ nguyên
3. **Không thay đổi `core/urls.py`** hoặc `core/models.py`**
4. **Có thể thêm template mới** (ví dụ: chatbot.html cho parent) nhưng cần thêm URL trong `frontend/urls.py` và View trong `frontend/views.py`
5. **JWT token** được lưu trong `localStorage` - phải đảm bảo giữ nguyên cơ chế này
6. **API_BASE** hiện dùng `"/api"` (relative path) - đúng rồi, không đổi
7. **Admin dashboard** dùng dark theme riêng, không cần đồng bộ với mobile app style
8. **Redirect sau login:** Parent → `/parent/`, Worker → `/worker/`
9. **register.html cần hoàn thiện:** thêm JS submit, thêm upload ảnh CCCD cho worker
10. **task_create_1.html và task_create_2.html** bị trùng - có thể gộp thành 1 hoặc xóa 1

---

## 13. CÁCH CHẠY DỰ ÁN

```bash
cd /home/z/educarelink-backend-4-12-2026
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
python manage.py migrate
python seed_data.py       # Tạo dữ liệu mẫu
python manage.py runserver 0.0.0.0:8000
```

Truy cập:
- Web: `http://localhost:8000/`
- Admin dashboard: `http://localhost:8000/admin-dashboard/`
- Django admin: `http://localhost:8000/admin/`
- API: `http://localhost:8000/api/`

---

## 14. GIT WORKFLOW

```bash
# Clone
git clone https://<PAT>@github.com/huyhandsome6996/educarelink-backend-4-12-2026.git

# Commit (dùng tiếng Việt)
git add .
git commit -m "redesign: cải thiện giao diện trang đăng nhập đồng bộ phong cách mobile"
git push origin main
```

---

## 15. PRIORITIES (Thứ tự ưu tiên)

1. **Login + Register** - Giao diện đầu tiên người dùng thấy
2. **Parent Home + Sidebar** - Trang chính sau khi đăng nhập
3. **Parent Tasks** - Quản lý công việc
4. **Task Create** - Đăng việc mới
5. **Worker Feed** - Tìm việc
6. **Worker Jobs + Profile** - Quản lý công việc & hồ sơ
7. **Browse Candidates + Review** - Duyệt ứng viên & đánh giá
8. **Task Detail** - Chi tiết công việc
9. **Splash → Landing** - Trang chủ
10. **Admin Dashboard** - Cải thiện nhẹ (đã OK)

---

*Tạo bởi Z.ai Code - Phiên trước đã revert commit redesign `215051e` và push lên GitHub. Repo hiện tại sạch, sẵn sàng cho redesign mới.*
