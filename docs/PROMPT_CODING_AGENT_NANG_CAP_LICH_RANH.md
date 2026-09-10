# NHIỆM VỤ CODING AGENT: NÂNG CẤP GIAO DIỆN LỊCH RẢNH THEO THIẾT KẾ GOOGLE STITCH

> **Dành cho:** Coding Agent (Cursor / Claude Code / Windsurf / Copilot / Aider / Web Engineer...)  
> **Dự án:** EduCareLink (Django 5.2 + Django Templates + Tailwind CSS + DRF + Matching Flow 1)  
> **File duy nhất cần thay thế:** `frontend/templates/frontend/lich_ranh.html`  
> **Nguồn thiết kế:** Bản thiết kế HTML/CSS hoàn chỉnh từ Google Stitch cho Lịch rảnh làm việc CarePartner  
> **Mục tiêu:** Thay thế giao diện đơn sơ cũ bằng giao diện Lịch rảnh hiện đại, tích hợp Ma trận lưới tuần 7 ngày trực quan (Weekly Timetable Grid), Thước đo tổng giờ rảnh tự động tính, Bộ chọn nhanh mẫu lịch 1-chạm (Quick Presets), Trình phát hiện & gộp ca chồng lấn thông minh, và sửa triệt để lỗi không hiển thị dữ liệu lịch rảnh cũ.

---

## 1. PHÂN TÍCH HIỆN TRẠNG & CÁC ĐIỂM NÂNG CẤP CỐT LÕI

### 1.1. Những bất cập ở file cũ (`lich_ranh.html`):
1. **Lỗi nghiêm trọng không hiển thị lịch rảnh (Empty Schedule Bug):**  
   - Ở file cũ dòng 85: `const rows = Array.isArray(data) ? data : (data.results || []);`.  
   - Backend Flow 1 (`GET /api/matching/carepartners/me/availability/`) trả về `{ "windows": [...] }`.  
   - Do không có key `results`, frontend luôn gán `rows = []`, làm ô "Lịch hiện tại" luôn rỗng dù trong DB đã có dữ liệu. Khi thêm khung giờ mới, backend báo lỗi 400 *"Khung giờ này chồng lấn khung đã có trong cùng ngày"*, gây ức chế tột độ cho người dùng.
2. **Giao diện thô sơ, thiếu góc nhìn tuần:**  
   - Chỉ có 1 dropdown chọn Thứ và 2 ô nhập giờ thô ráp, bên dưới là danh sách text đơn điệu. Sinh viên không thể hình dung phân bổ thời gian giữa các buổi (Sáng, Chiều, Tối) và các ngày trong tuần.
3. **Không có thanh chỉ số & Preset:**  
   - Thiếu thước đo tổng giờ rảnh/tuần (chuẩn nhận việc > 12h/tuần) và thiếu các nút bấm 1 chạm để thêm nhanh lịch tối hoặc cuối tuần.

### 1.2. Những cải tiến vượt bậc trong thiết kế Google Stitch mới:
1. **Ma trận Lưới tuần tương tác (Interactive Weekly Timetable Grid):**
   - 7 cột đại diện cho Thứ 2 đến Chủ nhật (T7 và CN được highlight nhẹ nhàng).
   - 3 hàng phân ca trực quan theo thói quen sinh hoạt của sinh viên: **Buổi Sáng (07:00 – 12:00)**, **Buổi Chiều (12:00 – 18:00)**, **Buổi Tối (18:00 – 22:00)**.
   - Thẻ khung giờ động (Dynamic Slot Card): Hiển thị khung giờ, số tiếng (`3.0h`), nút xóa nhanh khi hover (`delete`).
   - Ô trống có nút `+ Thêm giờ` mờ ảo khi hover, bấm vào tự động điền thứ tương ứng vào form thêm mới.
2. **Thước đo tổng giờ rảnh (Live Metric Bar):**
   - Tự động cộng dồn số giờ từ các khung giờ đã tạo (VD: `21.0 giờ / tuần`), hiển thị thanh tiến độ đạt chuẩn nhận việc tối thiểu.
   - Thẻ điểm thưởng ELO duy trì lịch rảnh ổn định.
3. **Bộ chọn khung giờ mẫu 1-chạm (Quick Presets):**
   - ⚡ *Tối T2 - T6 (18:00 - 21:00)*
   - ☀️ *Trọn vẹn cuối tuần (T7 & CN)*
   - 🎓 *Sáng T2 - T4 - T6*
   - Tự động tạo hàng loạt khung giờ vào DB thông qua API hoặc điền nhanh vào form.
4. **Xử lý chồng lấn thông minh (Live Overlap Detection & Smart Merge):**
   - Khi chọn khung giờ bị trùng lấn hoặc backend trả về mã 400 `overlap_windows`, giao diện không chỉ báo lỗi mà hiển thị ngay Banner đề xuất gộp ca: *"Gộp thành 18:00 - 22:00 (4.0h)"* để người dùng bấm 1 chạm là xử lý xong.
5. **Đồng bộ Sidebar CarePartner chuẩn & Mobile Bottom Nav:**
   - Desktop: Thanh điều hướng bên trái chuẩn CarePartner Portal (`/worker/`, `/worker/my-jobs/`, `/lich-ranh/`, `/worker/profile/`).
   - Mobile: Thanh điều hướng dưới đáy (Bottom Navigation Bar) và nút nổi thêm giờ (FAB) tối ưu thao tác 1 tay.

---

## 2. NGUYÊN TẮC KỸ THUẬT & API CONTRACT CẦN BẢO TOÀN

Coding Agent khi áp dụng mã nguồn **BẮT BUỘC** tuân thủ các quy tắc sau:

1. **Bảo tồn Django Template Tags & Đường dẫn tĩnh:**
   - Phải có `{% load static %}` ở đầu file.
   - Nhúng `{% include 'frontend/_matching_common.html' %}` để thừa hưởng hàm `authFetch` (JWT tự động đính kèm và tự refresh khi hết hạn) cùng hàm `toast()`.
   - Favicon: `/static/images/favicon-32.png` và `/static/images/favicon.ico`.
   - Logo: `/static/images/logo.png`.
   - Các liên kết Django Reverse: `{% url 'frontend:worker_feed' %}`, `{% url 'frontend:worker_jobs' %}`, `{% url 'frontend:worker_profile' %}`, `{% url 'frontend:worker_chatbot' %}`, `{% url 'frontend:don_cua_toi' %}`, `{% url 'frontend:lich_ranh' %}`, `{% url 'frontend:ngay_ban' %}`.

2. **Bảo tồn & Chuẩn hóa API Endpoints:**
   - **Lấy danh sách:** `GET /api/matching/carepartners/me/availability/`  
     *Xử lý chuẩn:* `const rows = Array.isArray(data) ? data : (data.windows || data.results || []);`
   - **Thêm khung giờ:** `POST /api/matching/carepartners/me/availability/`  
     *Body:* `JSON.stringify({ weekday, time_from, time_to })`  
     *Bắt lỗi 400 `overlap_windows`:* Đọc `j.merge_suggestion` để hiển thị nút Gộp ca.
   - **Xóa khung giờ:** `DELETE /api/matching/carepartners/me/availability/${id}/`  
     *Bắt lỗi 409:* Nếu `code === 'availability_locked_by_booking'`, thông báo khung giờ đang có đơn ghép cặp bảo vệ.
   - **Lấy hồ sơ cá nhân:** `GET /api/profile/` để hiển thị tên và avatar ở góc dưới sidebar.

3. **Thuật toán phân loại khung giờ vào Ma trận tuần (Day-part Binning):**
   - `weekday`: `0` = Thứ 2, `1` = Thứ 3, ..., `5` = Thứ 7, `6` = Chủ nhật.
   - Buổi sáng: `time_from < '12:00:00'`
   - Buổi chiều: `'12:00:00' <= time_from < '18:00:00'`
   - Buổi tối: `time_from >= '18:00:00'`

---

## 3. MÃ NGUỒN HOÀN CHỈNH 100% THAY THẾ CHO `frontend/templates/frontend/lich_ranh.html`

Coding Agent hãy thay thế **TOÀN BỘ** nội dung của file `frontend/templates/frontend/lich_ranh.html` bằng đoạn mã hoàn chỉnh dưới đây:

```html
{% load static %}
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <link rel="icon" type="image/png" sizes="32x32" href="/static/images/favicon-32.png">
    <link rel="icon" type="image/x-icon" href="/static/images/favicon.ico">
    <title>EduCareLink — Lịch rảnh làm việc & Ghép cặp tự động</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#F26522',
                        primaryHover: '#EA580C',
                        primaryLight: '#FFF4ED',
                        primarySoft: '#FED7AA',
                        emeraldSlot: '#10B981',
                        emeraldBg: '#ECFDF5',
                        emeraldBorder: '#A7F3D0',
                        blueSlot: '#2563EB',
                        blueBg: '#EFF6FF',
                        blueBorder: '#BFDBFE',
                        amberSlot: '#F59E0B',
                        amberBg: '#FFFBEB',
                        amberBorder: '#FDE68A',
                    },
                    fontFamily: {
                        headline: ['Manrope', 'sans-serif'],
                        body: ['Plus Jakarta Sans', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <!-- Fonts & Icons -->
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
    {% include 'frontend/_matching_common.html' %}
    <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
        h1, h2, h3, h4, .font-headline { font-family: 'Manrope', sans-serif; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .material-symbols-outlined.filled { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
        .psb-scroll::-webkit-scrollbar { width: 4px; }
        .psb-scroll::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 4px; }
        .slot-card { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
        .slot-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px -4px rgba(0,0,0,0.08); }
        @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.2); } }
        .animate-pulse-dot { animation: pulseDot 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    </style>
</head>
<body class="bg-[#F8FAFC] text-slate-800 min-h-screen flex flex-col antialiased selection:bg-orange-100 selection:text-orange-900">

    <!-- ==================================================== -->
    <!-- DESKTOP FIXED SIDEBAR                                -->
    <!-- ==================================================== -->
    <aside id="sidebar" class="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] lg:bg-white lg:border-r lg:border-slate-200 lg:z-40">
        <!-- Logo Header -->
        <div class="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
            <a href="{% url 'frontend:worker_feed' %}" class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary font-headline font-extrabold text-xl shadow-xs">
                    <img src="/static/images/logo.png" alt="EduCareLink" class="w-7 h-7 object-contain" onerror="this.outerHTML='<span class=\'material-symbols-outlined filled text-primary text-2xl\'>school</span>'"/>
                </div>
                <div>
                    <span class="font-headline font-extrabold text-lg text-slate-900 leading-tight tracking-tight">Edu<span class="text-primary">Care</span>Link</span>
                    <div class="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200/60 text-[10px] font-bold text-primary tracking-wide uppercase">
                        <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                        CarePartner
                    </div>
                </div>
            </a>
        </div>

        <!-- Navigation Links -->
        <nav class="flex-1 px-3.5 py-4 psb-scroll overflow-y-auto space-y-6">
            <!-- Nhóm 1: Nhận việc & Tác vụ -->
            <div>
                <p class="px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2">Nhận việc & Ca làm</p>
                <div class="space-y-1">
                    <a href="{% url 'frontend:worker_feed' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all font-medium text-sm group">
                        <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">travel_explore</span>
                        <span>Nhận đơn mới</span>
                    </a>
                    <a href="{% url 'frontend:worker_jobs' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all font-medium text-sm group">
                        <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">assignment</span>
                        <span>Việc của tôi</span>
                    </a>
                </div>
            </div>

            <!-- Nhóm 2: Ghép cặp Flow 1 (Active Area) -->
            <div>
                <div class="flex items-center justify-between px-3 mb-2">
                    <p class="text-[11px] font-bold tracking-wider text-primary uppercase">Ghép cặp tự động ELO</p>
                    <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-orange-100 text-primary uppercase">Flow 1</span>
                </div>
                <div class="space-y-1">
                    <a href="{% url 'frontend:lich_ranh' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-orange-50/90 text-primary font-bold text-sm border-l-4 border-primary shadow-xs transition-all">
                        <span class="material-symbols-outlined text-primary text-xl filled">calendar_month</span>
                        <span>Lịch rảnh làm việc</span>
                        <span class="ml-auto w-2 h-2 rounded-full bg-primary"></span>
                    </a>
                    <a href="{% url 'frontend:don_cua_toi' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all font-medium text-sm group">
                        <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">handshake</span>
                        <span>Đơn ghép cặp</span>
                    </a>
                    <a href="{% url 'frontend:ngay_ban' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all font-medium text-sm group">
                        <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">event_busy</span>
                        <span>Khai báo ngày bận</span>
                    </a>
                </div>
            </div>

            <!-- Nhóm 3: Tài khoản & Hỗ trợ -->
            <div>
                <p class="px-3 text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2">Tài khoản & Hệ thống</p>
                <div class="space-y-1">
                    <a href="{% url 'frontend:worker_profile' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all font-medium text-sm group">
                        <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">badge</span>
                        <span>Hồ sơ năng lực</span>
                    </a>
                    <a href="{% url 'frontend:worker_chatbot' %}" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all font-medium text-sm group">
                        <span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-xl">smart_toy</span>
                        <span>AI Trợ lý</span>
                    </a>
                </div>
            </div>
        </nav>

        <!-- User Profile Card -->
        <div class="p-3.5 border-t border-slate-100 bg-slate-50/50">
            <div class="p-2.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-3">
                <div class="relative">
                    <img id="sidebar-avatar" class="w-10 h-10 rounded-xl object-cover bg-orange-500 text-white font-headline font-bold flex items-center justify-center text-sm shadow-xs" src="https://ui-avatars.com/api/?name=W&background=F26522&color=fff" alt="Avatar"/>
                    <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white"></span>
                </div>
                <div class="flex-1 min-w-0">
                    <p id="sidebar-name" class="font-bold text-slate-900 text-xs truncate">CarePartner</p>
                    <div class="flex items-center gap-1 mt-0.5">
                        <span class="material-symbols-outlined text-amber-500 text-[13px] filled">military_tech</span>
                        <span id="sidebar-tier" class="text-[11px] font-semibold text-amber-600">CarePartner</span>
                    </div>
                </div>
            </div>
        </div>
    </aside>

    <!-- ==================================================== -->
    <!-- MAIN CONTENT AREA                                    -->
    <!-- ==================================================== -->
    <main class="lg:ml-[260px] min-h-screen pb-24 lg:pb-12">
        <!-- Sticky Top Navigation Header -->
        <header class="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 lg:px-8 py-3.5 transition-all">
            <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
                <!-- Breadcrumb & Title -->
                <div class="flex items-center gap-3">
                    <a href="{% url 'frontend:worker_feed' %}" class="hidden sm:inline-flex items-center gap-1 text-slate-500 hover:text-primary transition-colors text-xs font-semibold">
                        <span class="material-symbols-outlined text-sm">arrow_back</span>
                        Tìm việc
                    </a>
                    <span class="hidden sm:block text-slate-300">/</span>
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-2xl">event_available</span>
                        <h1 class="font-headline font-extrabold text-slate-900 text-lg sm:text-xl tracking-tight">Lịch rảnh làm việc</h1>
                    </div>
                    <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700">
                        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Đang kích hoạt Flow 1
                    </span>
                </div>

                <!-- Action Controls -->
                <div class="flex items-center gap-2 sm:gap-3">
                    <a href="{% url 'frontend:ngay_ban' %}" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs">
                        <span class="material-symbols-outlined text-base text-slate-500">event_busy</span>
                        <span class="hidden md:inline">Khai báo ngày bận</span>
                        <span class="md:hidden">Ngày bận</span>
                    </a>
                    <button onclick="scrollToAddForm()" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primaryHover text-white font-bold text-xs sm:text-sm shadow-sm hover:shadow-md transition-all active:scale-[0.98]">
                        <span class="material-symbols-outlined text-base">add_circle</span>
                        <span>Thêm khung giờ</span>
                    </button>
                </div>
            </div>
        </header>

        <div class="max-w-7xl mx-auto px-4 lg:px-8 pt-6 space-y-6">

            <!-- 1. SMART BANNER & AVAILABILITY METRIC STRIP -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                <!-- Metric 1: Tổng giờ rảnh / Tuần -->
                <div class="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-3">
                            <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Tổng thời gian sẵn sàng</span>
                            <span id="metric-slots-count" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                                <span class="material-symbols-outlined text-sm">schedule</span> 0 khung giờ
                            </span>
                        </div>
                        <div class="flex items-baseline gap-2">
                            <span id="metric-total-hours" class="font-headline font-extrabold text-3xl sm:text-4xl text-slate-900 tracking-tight">0.0</span>
                            <span class="text-sm font-bold text-slate-500">giờ / tuần</span>
                        </div>
                    </div>
                    <div class="mt-4 pt-3 border-t border-slate-100">
                        <div class="flex justify-between items-center text-xs font-semibold text-slate-600 mb-1.5">
                            <span>Mục tiêu chuẩn nhận việc (12h)</span>
                            <span id="metric-target-status" class="text-emerald-600 font-bold">Chưa đạt chuẩn</span>
                        </div>
                        <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div id="metric-progress-bar" class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500" style="width: 0%;"></div>
                        </div>
                    </div>
                </div>

                <!-- Metric 2: Trạng thái ghép đơn tự động Toggle -->
                <div class="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Trạng thái nhận việc</span>
                            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse-dot"></span>
                        </div>
                        <div class="flex items-center justify-between gap-3 mt-1">
                            <div>
                                <h3 class="font-headline font-bold text-base text-slate-900">Sẵn sàng nhận ca tức thì</h3>
                                <p class="text-xs text-slate-500 mt-0.5">Thuật toán đang tự động ghép bạn với phụ huynh gần nhất</p>
                            </div>
                            <!-- Toggle switch -->
                            <label class="relative inline-flex items-center cursor-pointer shrink-0">
                                <input type="checkbox" id="auto-matching-toggle" checked onchange="handleToggleReady(this.checked)" class="sr-only peer">
                                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </div>
                    <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span class="flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm text-slate-400">gps_fixed</span> Bán kính ưu tiên: &lt; 5km
                        </span>
                        <span class="text-emerald-600 font-bold">Auto Flow 1</span>
                    </div>
                </div>

                <!-- Metric 3: Thưởng điểm ELO Lịch rảnh -->
                <div class="lg:col-span-4 bg-gradient-to-br from-[#FFF4ED] to-[#FFEDD5] rounded-2xl p-5 border border-orange-200/90 shadow-xs flex flex-col justify-between relative overflow-hidden">
                    <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-200/40 rounded-full blur-xl pointer-events-none"></div>
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs font-extrabold uppercase tracking-wider text-orange-900">Điểm thưởng ELO</span>
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 text-primary text-xs font-bold shadow-2xs">
                                <span class="material-symbols-outlined text-sm filled text-amber-500">star</span> +15 ELO
                            </span>
                        </div>
                        <h3 class="font-headline font-bold text-slate-900 text-base mt-1">Duy trì lịch rảnh đều đặn 4 tuần</h3>
                        <p class="text-xs text-orange-800/90 mt-1 leading-relaxed">Giữ lịch ổn định giúp hồ sơ của bạn luôn xếp Top 8 khi phụ huynh tìm CarePartner phù hợp.</p>
                    </div>
                    <div class="mt-3 text-[11px] font-semibold text-primary flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">verified</span> Khai báo chuẩn xác giúp tăng tỷ lệ nhận việc
                    </div>
                </div>

            </div>

            <!-- 2. QUICK PRESET ACTION BAR -->
            <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex items-center gap-2 text-slate-700 font-bold text-xs sm:text-sm">
                        <span class="material-symbols-outlined text-primary text-lg">bolt</span>
                        <span>Chọn nhanh khung giờ mẫu:</span>
                    </div>
                    <div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs font-semibold scrollbar-none">
                        <button onclick="applyPreset('evening_weekdays')" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50/80 hover:bg-orange-100 text-orange-800 border border-orange-200 transition-all shrink-0 active:scale-95">
                            <span>⚡ Tối T2 - T6 (18:00 - 21:00)</span>
                        </button>
                        <button onclick="applyPreset('weekend_full')" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all shrink-0 active:scale-95">
                            <span>☀️ Trọn vẹn cuối tuần (T7 & CN)</span>
                        </button>
                        <button onclick="applyPreset('morning_mwf')" type="button" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50/80 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-all shrink-0 active:scale-95">
                            <span>🎓 Sáng T2 - T4 - T6</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 3. INTERACTIVE WEEKLY TIMETABLE GRID (THE CORE COMPONENT) -->
            <div class="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <!-- Grid Header: Title, Legend & Navigation -->
                <div class="p-4 sm:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/40">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                            <span class="material-symbols-outlined text-xl text-primary">calendar_month</span>
                        </div>
                        <div>
                            <h2 class="font-headline font-bold text-slate-900 text-base sm:text-lg">Ma trận lịch rảnh định kỳ hàng tuần</h2>
                            <p class="text-xs text-slate-500">Khung giờ áp dụng tự động cho các tuần tiếp theo. Bấm vào nút xóa hoặc thêm giờ trực tiếp trên ô.</p>
                        </div>
                    </div>

                    <!-- Legend -->
                    <div class="flex items-center flex-wrap gap-3 sm:gap-4 text-xs font-semibold">
                        <div class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-md bg-emerald-100 border border-emerald-400"></span>
                            <span class="text-slate-600">Đang rảnh (Sẵn sàng nhận)</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span class="w-3 h-3 rounded-md bg-blue-100 border border-blue-400"></span>
                            <span class="text-slate-600">Đã khóa (Có đơn ghép)</span>
                        </div>
                    </div>
                </div>

                <!-- Timetable Grid Table (Responsive Horizontal Scroll on small screens) -->
                <div class="overflow-x-auto">
                    <div class="min-w-[880px] grid grid-cols-8 divide-x divide-slate-100 border-b border-slate-200">
                        <!-- Column 0: Time labels header -->
                        <div class="p-3 bg-slate-50/80 text-center font-bold text-[11px] text-slate-400 uppercase tracking-wider flex items-center justify-center">
                            Khung buổi
                        </div>
                        <div class="p-3 text-center bg-white"><span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Thứ 2</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-slate-700">T2</span></div>
                        <div class="p-3 text-center bg-white"><span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Thứ 3</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-slate-700">T3</span></div>
                        <div class="p-3 text-center bg-white"><span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Thứ 4</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-slate-700">T4</span></div>
                        <div class="p-3 text-center bg-white"><span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Thứ 5</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-slate-700">T5</span></div>
                        <div class="p-3 text-center bg-white"><span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Thứ 6</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-slate-700">T6</span></div>
                        <div class="p-3 text-center bg-orange-50/30"><span class="text-[11px] font-bold text-primary uppercase tracking-wider block">Thứ 7</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-primary bg-orange-100/60">T7</span></div>
                        <div class="p-3 text-center bg-orange-50/30"><span class="text-[11px] font-bold text-primary uppercase tracking-wider block">Chủ Nhật</span><span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-bold text-primary bg-orange-100/60">CN</span></div>
                    </div>

                    <!-- Row 1: BUỔI SÁNG (07:00 - 12:00) -->
                    <div class="min-w-[880px] grid grid-cols-8 divide-x divide-slate-100 border-b border-slate-100 min-h-[110px]">
                        <div class="p-3 bg-slate-50/60 flex flex-col justify-center items-center text-center">
                            <span class="material-symbols-outlined text-amber-500 text-xl mb-1">wb_sunny</span>
                            <span class="font-headline font-bold text-xs text-slate-800">Buổi Sáng</span>
                            <span class="text-[10px] text-slate-400 font-medium">07:00 - 12:00</span>
                        </div>
                        <div id="grid-cell-0-morning" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-1-morning" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-2-morning" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-3-morning" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-4-morning" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-5-morning" class="p-2 bg-orange-50/15 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-6-morning" class="p-2 bg-orange-50/15 flex flex-col gap-1.5 justify-center"></div>
                    </div>

                    <!-- Row 2: BUỔI CHIỀU (12:00 - 18:00) -->
                    <div class="min-w-[880px] grid grid-cols-8 divide-x divide-slate-100 border-b border-slate-100 min-h-[110px]">
                        <div class="p-3 bg-slate-50/60 flex flex-col justify-center items-center text-center">
                            <span class="material-symbols-outlined text-orange-400 text-xl mb-1">light_mode</span>
                            <span class="font-headline font-bold text-xs text-slate-800">Buổi Chiều</span>
                            <span class="text-[10px] text-slate-400 font-medium">12:00 - 18:00</span>
                        </div>
                        <div id="grid-cell-0-afternoon" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-1-afternoon" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-2-afternoon" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-3-afternoon" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-4-afternoon" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-5-afternoon" class="p-2 bg-orange-50/15 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-6-afternoon" class="p-2 bg-orange-50/15 flex flex-col gap-1.5 justify-center"></div>
                    </div>

                    <!-- Row 3: BUỔI TỐI (18:00 - 22:00) -->
                    <div class="min-w-[880px] grid grid-cols-8 divide-x divide-slate-100 min-h-[110px]">
                        <div class="p-3 bg-slate-50/60 flex flex-col justify-center items-center text-center">
                            <span class="material-symbols-outlined text-indigo-500 text-xl mb-1">dark_mode</span>
                            <span class="font-headline font-bold text-xs text-slate-800">Buổi Tối</span>
                            <span class="text-[10px] text-slate-400 font-medium">18:00 - 22:00</span>
                        </div>
                        <div id="grid-cell-0-evening" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-1-evening" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-2-evening" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-3-evening" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-4-evening" class="p-2 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-5-evening" class="p-2 bg-orange-50/15 flex flex-col gap-1.5 justify-center"></div>
                        <div id="grid-cell-6-evening" class="p-2 bg-orange-50/15 flex flex-col gap-1.5 justify-center"></div>
                    </div>

                </div>
            </div>

            <!-- 4. BOTTOM SECTION: QUICK ADD FORM & CONFLICT RESOLUTION PREVIEW -->
            <div id="add-slot-section" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                <!-- Left: Form thêm khung giờ thủ công với Live Overlap Detection -->
                <div class="lg:col-span-6 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                    <div class="flex items-center gap-2 mb-4">
                        <span class="w-7 h-7 rounded-lg bg-orange-100 text-primary flex items-center justify-center font-bold text-sm">
                            <span class="material-symbols-outlined text-base">add_alarm</span>
                        </span>
                        <div>
                            <h3 class="font-headline font-bold text-slate-900 text-base">Thêm khung giờ rảnh mới</h3>
                            <p class="text-xs text-slate-500">Hệ thống tự phát hiện trùng lặp và đề xuất gộp ca thông minh</p>
                        </div>
                    </div>

                    <!-- Day Selector Pills (T2 - CN) -->
                    <div class="mb-4">
                        <label class="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Chọn Thứ trong tuần</label>
                        <div class="grid grid-cols-7 gap-1.5" id="weekday-selector">
                            <button type="button" onclick="selectWeekday(0)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-primary text-white border-primary shadow-xs" data-wd="0">Thứ 2</button>
                            <button type="button" onclick="selectWeekday(1)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" data-wd="1">Thứ 3</button>
                            <button type="button" onclick="selectWeekday(2)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" data-wd="2">Thứ 4</button>
                            <button type="button" onclick="selectWeekday(3)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" data-wd="3">Thứ 5</button>
                            <button type="button" onclick="selectWeekday(4)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" data-wd="4">Thứ 6</button>
                            <button type="button" onclick="selectWeekday(5)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-orange-50 text-primary border-orange-200 hover:bg-orange-100" data-wd="5">Thứ 7</button>
                            <button type="button" onclick="selectWeekday(6)" class="weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-orange-50 text-primary border-orange-200 hover:bg-orange-100" data-wd="6">CN</button>
                        </div>
                    </div>

                    <!-- Time Select Inputs -->
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-600 mb-1.5">Từ giờ (Bắt đầu)</label>
                            <div class="relative">
                                <input type="time" id="timeFrom" value="18:00" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                            </div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-600 mb-1.5">Đến giờ (Kết thúc)</label>
                            <div class="relative">
                                <input type="time" id="timeTo" value="21:00" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                            </div>
                        </div>
                    </div>

                    <!-- Smart Conflict Banner (Ẩn mặc định, hiện khi trùng ca) -->
                    <div id="smart-merge-banner" class="hidden p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 mb-4 flex items-start gap-3">
                        <span class="material-symbols-outlined text-amber-600 text-xl shrink-0 mt-0.5">warning</span>
                        <div class="flex-1 min-w-0">
                            <p class="font-bold text-xs text-amber-900">Phát hiện chồng lấn ca có sẵn!</p>
                            <p id="merge-description" class="text-xs text-amber-800 mt-0.5">Khung giờ chọn bị trùng với một ca đã đăng ký.</p>
                            <div class="mt-2.5 flex items-center gap-2">
                                <button type="button" id="btn-apply-merge" class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1">
                                    <span class="material-symbols-outlined text-sm">call_merge</span>
                                    <span id="merge-btn-text">Gộp ca làm việc</span>
                                </button>
                                <button type="button" onclick="document.getElementById('smart-merge-banner').classList.add('hidden')" class="px-2.5 py-1.5 text-xs text-amber-800 hover:underline">Đóng</button>
                            </div>
                        </div>
                    </div>

                    <!-- Submit Button -->
                    <button type="button" id="addBtn" class="w-full py-3 rounded-xl bg-primary hover:bg-primaryHover text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.99]">
                        <span class="material-symbols-outlined text-lg">calendar_add_on</span>
                        <span>Lưu vào lịch rảnh hàng tuần</span>
                    </button>
                </div>

                <!-- Right: Danh sách quản lý tất cả khung giờ & Ghi chú quan trọng -->
                <div class="lg:col-span-6 space-y-4">
                    <!-- Card danh sách nhanh -->
                    <div class="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <span class="material-symbols-outlined text-primary text-xl">view_list</span>
                                <h3 id="list-title" class="font-headline font-bold text-slate-900 text-base">Danh sách khung giờ đã tạo</h3>
                            </div>
                            <span id="list-total-hours" class="text-xs font-bold text-slate-500">Tổng 0.0 giờ</span>
                        </div>

                        <div id="list-container" class="space-y-2.5 max-h-[310px] overflow-y-auto pr-1">
                            <div class="py-8 text-center text-slate-400 text-sm">Đang tải lịch rảnh...</div>
                        </div>
                    </div>

                    <!-- Notice banner về tính năng ngày bận đột xuất -->
                    <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-3">
                        <span class="material-symbols-outlined text-amber-600 text-xl shrink-0 mt-0.5">tips_and_updates</span>
                        <div class="text-xs text-amber-900 leading-relaxed">
                            <span class="font-bold">Cần nghỉ đột xuất trong tuần này?</span>
                            Đừng xóa khung giờ định kỳ của bạn. Hãy sử dụng tính năng 
                            <a href="{% url 'frontend:ngay_ban' %}" class="font-bold text-amber-950 underline hover:text-primary">Khai báo ngày bận đột xuất</a> 
                            để bảo toàn điểm tín nhiệm ELO và không bị trừ điểm tỷ lệ phản hồi.
                        </div>
                    </div>
                </div>

            </div>

        </div>
    </main>

    <!-- ==================================================== -->
    <!-- MOBILE BOTTOM NAVIGATION (<1024px)                   -->
    <!-- ==================================================== -->
    <nav class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-3 py-2 flex justify-around items-center">
        <a href="{% url 'frontend:worker_feed' %}" class="flex flex-col items-center justify-center py-1 text-slate-500 text-[10px] font-semibold">
            <span class="material-symbols-outlined text-xl">travel_explore</span>
            <span>Tìm việc</span>
        </a>
        <a href="{% url 'frontend:lich_ranh' %}" class="flex flex-col items-center justify-center py-1 text-primary text-[10px] font-bold">
            <span class="material-symbols-outlined text-xl filled">calendar_month</span>
            <span>Lịch rảnh</span>
        </a>
        <a href="{% url 'frontend:worker_jobs' %}" class="flex flex-col items-center justify-center py-1 text-slate-500 text-[10px] font-semibold relative">
            <span class="material-symbols-outlined text-xl">assignment</span>
            <span>Việc làm</span>
        </a>
        <a href="{% url 'frontend:worker_profile' %}" class="flex flex-col items-center justify-center py-1 text-slate-500 text-[10px] font-semibold">
            <span class="material-symbols-outlined text-xl">account_circle</span>
            <span>Hồ sơ</span>
        </a>
    </nav>

    <!-- Mobile Floating Action Button (FAB) -->
    <button onclick="scrollToAddForm()" class="lg:hidden fixed right-4 bottom-20 z-40 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform" aria-label="Thêm lịch rảnh">
        <span class="material-symbols-outlined text-2xl">add</span>
    </button>

    <!-- ==================================================== -->
    <!-- JAVASCRIPT LOGIC & API CONTRACT IMPLEMENTATION       -->
    <!-- ==================================================== -->
    <script>
        const WD_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
        const WD_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        let selectedWeekday = 0;
        let currentWindows = [];
        let pendingMergeData = null;

        // Chọn ngày trong tuần ở Form
        function selectWeekday(wd) {
            selectedWeekday = wd;
            document.querySelectorAll('#weekday-selector .weekday-btn').forEach(btn => {
                const bwd = parseInt(btn.getAttribute('data-wd'));
                if (bwd === wd) {
                    btn.className = 'weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-primary text-white border-primary shadow-xs';
                } else if (bwd >= 5) {
                    btn.className = 'weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-orange-50 text-primary border-orange-200 hover:bg-orange-100';
                } else {
                    btn.className = 'weekday-btn py-2 rounded-xl text-xs font-bold border transition-all bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100';
                }
            });
            document.getElementById('smart-merge-banner').classList.add('hidden');
        }

        function scrollToAddForm(wd = null) {
            if (wd !== null) selectWeekday(wd);
            const el = document.getElementById('add-slot-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }

        // Tính thời lượng giờ
        function calcDuration(tf, tt) {
            const [fh, fm] = tf.split(':').map(Number);
            const [th, tm] = tt.split(':').map(Number);
            return Math.max(0, ((th * 60 + tm) - (fh * 60 + fm)) / 60);
        }

        // Xác định ca buổi (morning, afternoon, evening)
        function getDayPart(tf) {
            const h = parseInt(tf.split(':')[0], 10);
            if (h < 12) return 'morning';
            if (h < 18) return 'afternoon';
            return 'evening';
        }

        // Tải lịch rảnh từ API
        async function loadAvailability() {
            const listContainer = document.getElementById('list-container');
            try {
                const resp = await authFetch(API_BASE + '/matching/carepartners/me/availability/');
                if (!resp.ok) {
                    toast('Không tải được lịch rảnh. Vui lòng thử lại.', false);
                    return;
                }
                const data = await resp.json();
                // FIX TRIỆT ĐỂ: API trả về { "windows": [...] }
                currentWindows = Array.isArray(data) ? data : (data.windows || data.results || []);
                renderAll();
            } catch (err) {
                console.error('Lỗi load availability:', err);
                toast('Không kết nối được máy chủ.', false);
            }
        }

        // Render toàn bộ UI (Metrics, Grid, Danh sách)
        function renderAll() {
            // 1. Sắp xếp danh sách
            currentWindows.sort((a, b) => a.weekday - b.weekday || a.time_from.localeCompare(b.time_from));

            // 2. Tính tổng số giờ
            let totalHours = 0;
            currentWindows.forEach(w => {
                totalHours += calcDuration(w.time_from, w.time_to);
            });

            // Cập nhật thẻ Metric
            document.getElementById('metric-total-hours').textContent = totalHours.toFixed(1);
            document.getElementById('metric-slots-count').innerHTML = `<span class="material-symbols-outlined text-sm">schedule</span> ${currentWindows.length} khung giờ`;
            document.getElementById('list-title').textContent = `Danh sách ${currentWindows.length} khung giờ đã tạo`;
            document.getElementById('list-total-hours').textContent = `Tổng ${totalHours.toFixed(1)} giờ`;

            const targetPct = Math.min(100, Math.round((totalHours / 12) * 100));
            const progressBar = document.getElementById('metric-progress-bar');
            const targetStatus = document.getElementById('metric-target-status');
            progressBar.style.width = targetPct + '%';
            if (totalHours >= 12) {
                targetStatus.textContent = `Đạt ${targetPct}% chuẩn (>12h)`;
                targetStatus.className = 'text-emerald-600 font-bold';
            } else {
                targetStatus.textContent = `Còn thiếu ${(12 - totalHours).toFixed(1)}h để đạt chuẩn`;
                targetStatus.className = 'text-amber-600 font-bold';
            }

            // 3. Xóa các ô trong Grid
            for (let wd = 0; wd < 7; wd++) {
                ['morning', 'afternoon', 'evening'].forEach(dp => {
                    const cell = document.getElementById(`grid-cell-${wd}-${dp}`);
                    if (cell) {
                        cell.innerHTML = `
                            <div class="relative group flex flex-col justify-center items-center h-full min-h-[60px] hover:bg-slate-50/80 transition-colors rounded-lg">
                                <button onclick="scrollToAddForm(${wd})" class="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] font-bold text-primary bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-1 rounded-lg shadow-2xs">
                                    <span class="material-symbols-outlined text-sm">add</span> Giờ
                                </button>
                            </div>
                        `;
                    }
                });
            }

            // 4. Đổ dữ liệu vào Grid
            currentWindows.forEach(w => {
                const dp = getDayPart(w.time_from);
                const cell = document.getElementById(`grid-cell-${w.weekday}-${dp}`);
                if (!cell) return;

                // Nếu ô chỉ có nút add mờ thì xóa đi để add card thật
                if (cell.querySelector('.group button')) {
                    cell.innerHTML = '';
                }

                const dur = calcDuration(w.time_from, w.time_to).toFixed(1);
                const tfShort = w.time_from.slice(0, 5);
                const ttShort = w.time_to.slice(0, 5);

                const card = document.createElement('div');
                card.className = 'slot-card bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-900 shadow-2xs relative group mb-1.5';
                card.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-1 font-bold text-xs">
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>${tfShort} - ${ttShort}</span>
                        </div>
                        <button onclick="deleteWindow('${w.id}')" class="opacity-0 group-hover:opacity-100 text-emerald-600 hover:text-red-600 transition-all p-0.5 rounded" title="Xóa khung giờ">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </div>
                    <div class="mt-1 flex items-center justify-between text-[11px] text-emerald-700">
                        <span>Sẵn sàng nhận</span>
                        <span class="font-bold bg-emerald-100/80 px-1.5 py-0.2 rounded text-[10px]">${dur}h</span>
                    </div>
                `;
                cell.appendChild(card);
            });

            // 5. Render danh sách bên phải
            const listContainer = document.getElementById('list-container');
            listContainer.innerHTML = '';

            if (currentWindows.length === 0) {
                listContainer.innerHTML = `
                    <div class="py-8 text-center text-slate-400 text-xs">
                        Chưa có khung giờ nào. Hãy chọn nhanh mẫu bên trên hoặc thêm khung đầu tiên!
                    </div>
                `;
                return;
            }

            currentWindows.forEach(w => {
                const dur = calcDuration(w.time_from, w.time_to).toFixed(1);
                const tfShort = w.time_from.slice(0, 5);
                const ttShort = w.time_to.slice(0, 5);
                const isWeekend = w.weekday >= 5;

                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/60 hover:bg-slate-100/60 transition-all';
                item.innerHTML = `
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-lg ${isWeekend ? 'bg-orange-100 text-primary border-orange-200' : 'bg-white text-slate-700 border-slate-200'} border flex items-center justify-center font-bold text-xs">
                            ${WD_SHORT[w.weekday]}
                        </span>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-xs text-slate-900">${WD_NAMES[w.weekday]}: ${tfShort} - ${ttShort}</span>
                                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Sẵn sàng</span>
                            </div>
                            <span class="text-[11px] text-slate-500">Thời lượng · ${dur} giờ</span>
                        </div>
                    </div>
                    <button onclick="deleteWindow('${w.id}')" class="text-slate-400 hover:text-red-600 transition-colors p-1" title="Xóa">
                        <span class="material-symbols-outlined text-lg">delete</span>
                    </button>
                `;
                listContainer.appendChild(item);
            });
        }

        // Xóa khung giờ
        async function deleteWindow(id) {
            if (!confirm('Bạn có chắc chắn muốn xóa khung giờ này khỏi lịch tuần?')) return;
            try {
                const resp = await authFetch(`${API_BASE}/matching/carepartners/me/availability/${id}/`, {
                    method: 'DELETE'
                });
                if (resp.status === 409) {
                    const j = await resp.json().catch(() => ({}));
                    toast(j.code === 'availability_locked_by_booking'
                        ? 'Khung giờ này đang có đơn ghép cặp — phải hủy đơn trước khi xóa lịch.'
                        : 'Không xóa được khung giờ vì xung đột dữ liệu.', false);
                } else if (resp.ok || resp.status === 204) {
                    toast('Đã xóa khung giờ thành công!');
                    loadAvailability();
                } else {
                    toast('Lỗi khi xóa khung giờ.', false);
                }
            } catch (err) {
                console.error(err);
                toast('Lỗi kết nối máy chủ.', false);
            }
        }

        // Thêm khung giờ
        async function addAvailability(weekday, timeFrom, timeTo) {
            if (!timeFrom || !timeTo) {
                toast('Vui lòng chọn đầy đủ giờ bắt đầu và kết thúc.', false);
                return;
            }
            if (timeTo <= timeFrom) {
                toast('Giờ kết thúc phải sau giờ bắt đầu.', false);
                return;
            }

            try {
                const resp = await authFetch(API_BASE + '/matching/carepartners/me/availability/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        weekday: parseInt(weekday, 10),
                        time_from: timeFrom,
                        time_to: timeTo
                    })
                });

                if (resp.status === 201) {
                    toast('Đã lưu khung giờ vào lịch rảnh!');
                    document.getElementById('smart-merge-banner').classList.add('hidden');
                    loadAvailability();
                } else if (resp.status === 400) {
                    const j = await resp.json().catch(() => ({}));
                    if (j.code === 'overlap_windows' && j.merge_suggestion) {
                        // Hiển thị Banner gợi ý gộp ca
                        const s = j.merge_suggestion;
                        const banner = document.getElementById('smart-merge-banner');
                        const desc = document.getElementById('merge-description');
                        const btn = document.getElementById('btn-apply-merge');
                        const btnText = document.getElementById('merge-btn-text');

                        desc.textContent = `Khung giờ ${timeFrom} - ${timeTo} bị chồng lấn với ca có sẵn vào ${WD_NAMES[weekday]}.`;
                        btnText.textContent = `Gộp thành ${s.time_from.slice(0, 5)} - ${s.time_to.slice(0, 5)}`;
                        
                        btn.onclick = async () => {
                            btn.disabled = true;
                            await addAvailability(s.weekday, s.time_from.slice(0, 5), s.time_to.slice(0, 5));
                            banner.classList.add('hidden');
                            btn.disabled = false;
                        };

                        banner.classList.remove('hidden');
                        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        toast(j.detail || 'Khung giờ bị trùng hoặc không hợp lệ.', false);
                    }
                } else {
                    toast('Không thể thêm khung giờ.', false);
                }
            } catch (err) {
                console.error(err);
                toast('Lỗi kết nối máy chủ.', false);
            }
        }

        // Gắn sự kiện nút Lưu
        document.getElementById('addBtn').onclick = () => {
            const tf = document.getElementById('timeFrom').value;
            const tt = document.getElementById('timeTo').value;
            addAvailability(selectedWeekday, tf, tt);
        };

        // Áp dụng Preset nhanh
        async function applyPreset(type) {
            let slotsToAdd = [];
            if (type === 'evening_weekdays') {
                // T2 - T6 từ 18:00 đến 21:00
                slotsToAdd = [0, 1, 2, 3, 4].map(wd => ({ wd, tf: '18:00', tt: '21:00' }));
            } else if (type === 'weekend_full') {
                // T7 & CN từ 08:00 đến 17:00
                slotsToAdd = [{ wd: 5, tf: '08:00', tt: '17:00' }, { wd: 6, tf: '08:00', tt: '17:00' }];
            } else if (type === 'morning_mwf') {
                // T2, T4, T6 từ 07:30 đến 11:30
                slotsToAdd = [0, 2, 4].map(wd => ({ wd, tf: '07:30', tt: '11:30' }));
            }

            if (!slotsToAdd.length) return;
            toast('Đang áp dụng mẫu lịch rảnh...');
            for (const s of slotsToAdd) {
                await authFetch(API_BASE + '/matching/carepartners/me/availability/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weekday: s.wd, time_from: s.tf, time_to: s.tt })
                });
            }
            toast('Đã áp dụng mẫu lịch rảnh hoàn tất!');
            loadAvailability();
        }

        // Tải thông tin hồ sơ cho Sidebar
        async function loadProfileForSidebar() {
            try {
                const resp = await authFetch(API_BASE + '/profile/');
                if (resp.ok) {
                    const u = await resp.json();
                    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'CarePartner';
                    const nameEl = document.getElementById('sidebar-name');
                    const tierEl = document.getElementById('sidebar-tier');
                    const avatarEl = document.getElementById('sidebar-avatar');
                    if (nameEl) nameEl.textContent = fullName;
                    if (tierEl && u.tier_label) tierEl.textContent = u.tier_label;
                    if (avatarEl) {
                        avatarEl.src = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=F26522&color=fff`;
                    }
                }
            } catch (e) {
                console.warn('Không tải được profile cho sidebar', e);
            }
        }

        function handleToggleReady(checked) {
            toast(checked ? 'Đã bật chế độ sẵn sàng nhận ca tự động Flow 1' : 'Đã tạm ngưng nhận ca ghép tự động');
        }

        // Khởi chạy khi load trang
        document.addEventListener('DOMContentLoaded', () => {
            selectWeekday(0);
            loadAvailability();
            loadProfileForSidebar();
        });
    </script>
</body>
</html>
```

---

## 4. HƯỚNG DẪN KIỂM THỬ VÀ NGHIỆM THU

Sau khi Coding Agent ghi đè toàn bộ mã nguồn trên vào `frontend/templates/frontend/lich_ranh.html`, hãy chạy các bước kiểm thử sau:

1. **Kiểm tra hiển thị dữ liệu ban đầu:**
   - Mở trình duyệt truy cập `http://127.0.0.1:8000/lich-ranh/` (hoặc test trên server).
   - Kiểm tra các khung giờ rảnh có sẵn trong DB được vẽ chính xác lên Ma trận tuần (ví dụ: Thứ 2 từ 18:00 - 21:00 nằm đúng ở hàng Buổi Tối cột Thứ 2).
   - Kiểm tra "Tổng thời gian sẵn sàng" cộng đúng số giờ (ví dụ: `21.0 giờ / tuần`).

2. **Kiểm tra tính năng Thêm khung giờ & Xử lý trùng:**
   - Chọn Thứ 2, nhập từ `18:00` đến `21:00` (khung giờ đã có). Bấm "Lưu vào lịch rảnh".
   - Xác nhận: Hệ thống hiển thị ngay `Smart Conflict Banner` màu vàng hổ phách với nút `Gộp ca làm việc` thay vì chỉ báo lỗi thô như trước.
   - Chọn Thứ 4, nhập từ `08:00` đến `11:30`. Bấm "Lưu". Xác nhận khung giờ xuất hiện ngay trên ma trận tuần và thẻ thống kê tự động tăng thêm `3.5 giờ`.

3. **Kiểm tra tính năng Xóa khung giờ:**
   - Rê chuột vào thẻ khung giờ trên ma trận tuần hoặc danh sách bên phải, bấm vào icon thùng rác.
   - Xác nhận có hộp thoại xác nhận và khung giờ bị xóa tức thì, điểm tổng giờ giảm tương ứng.

4. **Kiểm tra Responsive:**
   - Thu nhỏ màn hình về kích thước điện thoại (375px - 768px).
   - Xác nhận thanh Sidebar ẩn đi, thay bằng thanh Navigation dưới đáy cùng nút tròn nổi `+` (FAB) hoạt động trơn tru.
