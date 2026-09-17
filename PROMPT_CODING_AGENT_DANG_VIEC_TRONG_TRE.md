# KỊCH BẢN & PROMPT CHI TIẾT DÀNH CHO CODING AGENT
## Nâng Cấp Giao Diện Trang Web "Đăng Việc Trông Trẻ Tại Nhà" Chuẩn Thiết Kế Google Stitch & Parity Mobile 100%

---

### 1. THÔNG TIN REPO & MÔI TRƯỜNG LÀM VIỆC
* **Repository:** `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
* **Nhánh làm việc (BẮT BUỘC):** `main` (TUYỆT ĐỐI không checkout sang nhánh khác, không merge lung tung gây xung đột hoặc hỏng repo).
* **Môi trường kỹ thuật:** Django 5.2 monolith, Python 3.11, PostgreSQL (production) / SQLite (local), Tailwind CSS, Leaflet JS, Flatpickr.
* **Mục tiêu deploy:** Sau khi áp dụng mã nguồn và kiểm thử đạt chuẩn 100%, commit và `git push origin main` để hệ thống Render.com tự động build & deploy lên production (`https://educarelink-backend.onrender.com/dang-viec/trong-tre/`).

---

### 2. BỐI CẢNH, HOÀN CẢNH & VẤN ĐỀ CẦN GIẢI QUYẾT
* **Bối cảnh dự án:** EduCareLink là nền tảng kết nối Phụ huynh (Parent) với CarePartner (sinh viên, cử nhân, giáo viên mầm non, gia sư) tại Việt Nam. Nền tảng gồm 2 giao diện: ứng dụng Mobile (React Native / Expo) và giao diện Web (Django Templates). Cả hai nền tảng cùng gọi chung hệ thống API backend matching (`/api/matching/jobs/`).
* **Vấn đề hiện tại:**
  - Giao diện web cũ của trang Đăng việc Trông trẻ (`frontend/templates/frontend/dang_viec_trong_tre.html`) rất đơn sơ, thô sơ dạng form dọc trắng đen, thiếu tương tác phản ứng (reactive pricing), thiếu bản đồ trực quan sinh động và không đồng bộ với trải nghiệm hiện đại trên Mobile (`mobile/src/screens/Parent/ChildcareForm.js`).
  - Phụ huynh sử dụng web cảm thấy thiếu tin cậy do không có cơ chế ký quỹ MoMo minh bạch, thiếu thẻ bảo chứng năng lực bảo mẫu và không có hiệu ứng radar quét tìm ứng viên trực quan.
* **Giải pháp:**
  - Nâng cấp toàn diện trang `frontend/templates/frontend/dang_viec_trong_tre.html` theo ngôn ngữ thiết kế cao cấp Google Stitch (Bento Grid 12 cột, bảng tính chi phí phản ứng theo giờ và số lượng trẻ, thẻ chọn độ tuổi và nhiệm vụ chăm sóc hiện đại).
  - Tích hợp liền mạch với backend API Matching (`/api/matching/jobs/` và `/publish/`), đảm bảo 100% đồng bộ công năng với app Mobile.

---

### 3. CÁC QUY TẮC BẮT BUỘC (CRITICAL CONSTRAINTS)

1. **LÀM VIỆC TRỰC TIẾP TRÊN NHÁNH `main`:**
   * Mọi thao tác git phải diễn ra trên nhánh `main`.
   * Kiểm tra bằng `git status` trước khi sửa code.
   * Commit bằng Tiếng Việt chuẩn mực, ví dụ: `git commit -m "feat(web): nâng cấp giao diện Đăng việc Trông trẻ chuẩn Stitch và parity mobile"`.

2. **BẢO TỒN SIDEBAR & KHUNG ĐIỀU HƯỚNG PHỤ HUYNH:**
   * Bắt buộc phải có: `{% include 'frontend/_parent_chrome.html' with active_tab='matching' %}`.
   * Để sidebar bên trái (`w-[260px]`) không che lấp nội dung:
     - Thẻ `<header>` phải có class: `lg:ml-[260px]`.
     - Thẻ `<main>` phải có class: `lg:ml-[260px]`.
     - Thanh sticky bar mobile (`<aside>`) phải có class `lg:hidden` (vì desktop đã có card tính giá cố định ở cột phải).

3. **BẢO TỒN NHẬN DIỆN THƯƠNG HIỆU & LOGO DỰ ÁN:**
   * Logo chính thức của EduCareLink nằm tại: `/static/images/logo.png`.
   * Favicon: `/static/images/favicon-32.png` và `/static/images/favicon.ico`.
   * Không được tự ý thay logo bằng các icon chữ cái tạm bợ.

4. **TUYỆT ĐỐI KHÔNG DÙNG EMOJI — DÙNG CHUẨN MATERIAL SYMBOLS OUTLINED:**
   * Thay thế toàn bộ emoji (🍼, 🧸, 🎨, 📚, 🧒, 🌟, 🥣, 🛁, 😴, 🧩, 📖...) bằng Google Material Symbols Outlined (`child_care`, `toys`, `palette`, `menu_book`, `school`, `verified_user`, `restaurant`, `bathtub`, `bedtime`, `extension`, `cleaning_services`, `medical_services`).
   * Giữ giao diện tinh tế, đẳng cấp và chuyên nghiệp như một sản phẩm EdTech cao cấp.

5. **ĐỒNG BỘ NGHIỆP VỤ PARITY 100% VỚI MOBILE (`ChildcareForm.js`) & BACKEND API:**
   * **Endpoint tạo việc:** `POST /api/matching/jobs/`
   * **Endpoint phát hành:** `POST /api/matching/jobs/<id>/publish/`
   * **Payload gửi lên backend:**
     - `job_type`: `"childcare"`
     - `child_age_group`: 1 trong 5 nhóm tuổi chuẩn (`"0_to_12_months"`, `"1_to_3_years"`, `"3_to_6_years"`, `"6_to_10_years"`, `"over_10_years"`).
     - `number_of_children`: Số nguyên từ 1 đến 5 (1 bé: tiêu chuẩn; từ bé thứ 2 trở đi: phụ phí +20% mỗi bé phụ).
     - `care_duties`: Danh sách các nhiệm vụ chăm sóc đã chọn (ít nhất 1 nhiệm vụ trong 7 mã chuẩn: `"general_care"`, `"feeding"`, `"bathing"`, `"sleep_monitoring"`, `"play_activities"`, `"homework_help"`, `"light_chores"`).
     - `medical_allergy_notes`: Ghi chú tiền sử dị ứng, sức khỏe (nếu có).
     - `specific_requirements`: Chuỗi mô tả yêu cầu cụ thể cho bảo mẫu.
     - `dates`: Danh sách mảng các ngày cần trông dạng `["YYYY-MM-DD", ...]`.
     - `time_from`: Giờ bắt đầu dạng `"HH:MM"` (VD: `"08:00"`).
     - `time_to`: Giờ kết thúc dạng `"HH:MM"` (VD: `"17:00"`, thời lượng tối thiểu 30 phút).
     - `hourly_rate_vnd`: Số nguyên mức chi trả/giờ (mặc định 80.000đ/giờ).
     - `latitude`, `longitude`: Tọa độ từ bản đồ Leaflet Map Picker.
     - `location_note`: Địa chỉ hoặc ghi chú vị trí (tòa nhà, số tầng, căn hộ...).
   * **Công thức tính giá phản ứng (Reactive Pricing Engine):**
     - `basePerSession = hourly_rate * session_duration`
     - `extraChildMultiplier = (number_of_children - 1) * 0.2`
     - `extraPerSession = basePerSession * extraChildMultiplier`
     - `finalPerSession = basePerSession + extraPerSession`
     - `totalCost = finalPerSession * dates.length`

6. **TÍCH HỢP BẢN ĐỒ LEAFLET THỰC TẾ:**
   * Kế thừa `{% include 'frontend/_matching_common.html' %}`.
   * Khởi tạo hàm `initMapPicker` với đầy đủ container `#map`, ô tìm kiếm địa chỉ `#mapSearchInput`, nút GPS `#btnGpsCurrent`, thẻ hiển thị `#mapAddr`, input ẩn `#lat` và `#lng`.

7. **HIỆU ỨNG RADAR & MODAL TRẠNG THÁI:**
   * Khi phụ huynh bấm "Đăng việc & Tìm Bảo Mẫu":
     - Mở Modal Radar Quét Sóng (`#radarModal`) ở trạng thái đang quét (searching).
     - Gọi API tạo job và publish job ngầm qua `authFetch`.
     - Khi thành công, đổi sang trạng thái checkmark xanh (success) và tự động chuyển hướng tới `/ung-vien/<job_id>/`.
     - Nếu có lỗi, đóng modal và báo lỗi qua `toast(detail, false)`.

---

### 4. MÃ NGUỒN HOÀN CHỈNH CHO `frontend/templates/frontend/dang_viec_trong_tre.html`

Agent hãy ghi đè toàn bộ nội dung file `frontend/templates/frontend/dang_viec_trong_tre.html` bằng đoạn mã sau:

```html
{% load static %}
<!DOCTYPE html>
<html lang="vi" class="h-full bg-[#F8F9FB]">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EduCareLink — Đăng việc Trông trẻ tại nhà | Parity Mobile</title>
  <link rel="icon" type="image/png" sizes="32x32" href="/static/images/favicon-32.png">
  <link rel="shortcut icon" href="/static/images/favicon.ico">

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />

  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              DEFAULT: '#F26522',
              50: '#FFF7ED',
              100: '#FFEDD5',
              500: '#F26522',
              600: '#E05315',
              700: '#C2410C',
              tint: 'rgba(242, 101, 34, 0.08)',
              subtle: 'rgba(242, 101, 34, 0.12)'
            },
            obsidian: {
              DEFAULT: '#1A1A2E',
              900: '#1A1A2E',
              800: '#232338',
              700: '#334155'
            },
            surface: '#F8F9FB',
          },
          fontFamily: {
            headline: ['Manrope', 'sans-serif'],
            body: ['Plus Jakarta Sans', 'sans-serif'],
          },
          boxShadow: {
            'subtle': '0 2px 10px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
            'card': '0 8px 30px rgba(0,0,0,0.04)',
            'elevated': '0 16px 40px -12px rgba(242, 101, 34, 0.2)'
          }
        }
      }
    }
  </script>

  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    h1, h2, h3, .font-headline { font-family: 'Manrope', sans-serif; }
    .material-symbols-outlined {
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
      display: inline-block;
      vertical-align: middle;
    }
    .material-symbols-outlined.fill-1 {
      font-variation-settings: 'FILL' 1;
    }
    @keyframes radarSweep {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .radar-beam {
      animation: radarSweep 2.4s linear infinite;
      background: conic-gradient(from 0deg at 50% 50%, rgba(242, 101, 34, 0.45) 0deg, rgba(242, 101, 34, 0) 75deg, transparent 75deg);
    }
    @keyframes ripplePing {
      0% { transform: scale(0.6); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0.8; }
    }
    .radar-pulse {
      animation: ripplePing 2s cubic-bezier(0, 0.2, 0.8, 1) infinite;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  </style>

  {% include 'frontend/_matching_common.html' %}
</head>
<body class="min-h-screen flex flex-col bg-[#F8F9FB] text-slate-800 antialiased selection:bg-brand-100 selection:text-brand-700">

  <!-- PARENT CHROME SIDEBAR -->
  {% include 'frontend/_parent_chrome.html' with active_tab='matching' %}

  <!-- HEADER BAR (lg:ml-[260px]) -->
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 lg:ml-[260px] transition-all">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      
      <div class="flex items-center gap-3 sm:gap-4 min-w-0">
        <a href="{% url 'frontend:dang_viec_select' %}" class="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-brand px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors">
          <span class="material-symbols-outlined text-lg">arrow_back</span>
          <span class="hidden sm:inline">Chọn lại loại việc</span>
        </a>

        <div class="h-5 w-px bg-slate-200 hidden sm:block"></div>

        <div class="flex items-center gap-2.5 min-w-0">
          <img src="/static/images/logo.png" alt="Logo EduCareLink" class="w-9 h-9 rounded-xl object-contain shrink-0 shadow-sm border border-orange-100" loading="eager">
          <div class="truncate">
            <div class="flex items-center gap-2">
              <span class="font-headline font-extrabold text-slate-900 tracking-tight text-sm sm:text-base">EduCareLink</span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-50 text-brand border border-brand-200/60">
                Trông Trẻ Tại Nhà
              </span>
            </div>
            <p class="text-[11px] sm:text-xs text-slate-500 truncate hidden md:block">Bảo mẫu & CarePartner xác thực CCCD, kỹ năng sơ cứu và chăm sóc trẻ chuẩn mầm non</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <button type="button" onclick="openTrustModal()" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-all">
          <span class="material-symbols-outlined text-sm fill-1 text-emerald-600">verified</span>
          <span class="hidden md:inline">100% CarePartner xác thực & Ký quỹ MoMo</span>
          <span class="md:hidden">Ký quỹ an toàn</span>
          <span class="material-symbols-outlined text-xs text-emerald-500">info</span>
        </button>

        <a href="{% url 'frontend:chatbot' %}" title="Trợ lý AI hỗ trợ phụ huynh" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand text-slate-600 flex items-center justify-center transition-colors">
          <span class="material-symbols-outlined text-xl">smart_toy</span>
        </a>
      </div>

    </div>
  </header>

  <!-- MAIN CONTAINER (lg:ml-[260px]) -->
  <main class="flex-1 lg:ml-[260px] pb-24 lg:pb-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

      <!-- HERO TRUST BANNER -->
      <section class="relative overflow-hidden rounded-3xl bg-obsidian text-white p-6 sm:p-8 lg:p-10 shadow-xl mb-8 border border-slate-800">
        <div class="absolute -top-24 -right-24 w-80 h-80 bg-brand/25 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-20 -left-20 w-72 h-72 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>

        <div class="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div class="lg:col-span-8 space-y-3">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand-100 text-xs font-semibold backdrop-blur-md border border-white/15">
              <span class="material-symbols-outlined text-sm text-brand fill-1">child_care</span>
              Chăm sóc bé tận tâm & An toàn tuyệt đối tại nhà
            </div>
            <h1 class="font-headline font-extrabold text-2xl sm:text-3xl lg:text-4xl tracking-tight text-white leading-tight">
              Tìm người trông trẻ, chơi cùng bé và chăm sóc an tâm mỗi ngày
            </h1>
            <p class="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl font-normal">
              Kết nối nhanh bảo mẫu mầm non, sinh viên điều dưỡng / sư phạm yêu trẻ trong bán kính gần nhất. Đảm bảo lý lịch trong sạch, thẻ CCCD gắn chip và tác phong chuẩn mực.
            </p>
          </div>

          <div class="lg:col-span-4 grid grid-cols-3 lg:grid-cols-1 gap-2.5">
            <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-xl fill-1">check_circle</span>
              </div>
              <div>
                <div class="font-headline font-extrabold text-base sm:text-lg text-white">100%</div>
                <div class="text-[11px] text-slate-300 font-medium">Đã xác minh CCCD & lý lịch</div>
              </div>
            </div>

            <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-brand/20 text-brand flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-xl">payments</span>
              </div>
              <div>
                <div class="font-headline font-extrabold text-base sm:text-lg text-white">0 đ</div>
                <div class="text-[11px] text-slate-300 font-medium">Không thu phí môi giới phụ huynh</div>
              </div>
            </div>

            <div class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-xl">bolt</span>
              </div>
              <div>
                <div class="font-headline font-extrabold text-base sm:text-lg text-white">&lt; 15p</div>
                <div class="text-[11px] text-slate-300 font-medium">Có CarePartner nhận đơn</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- BENTO GRID 12 COLS -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        <!-- LEFT COLUMN (8 COLS) -->
        <div class="lg:col-span-8 space-y-6">

          <!-- CARD 1: THÔNG TIN BÉ & NHIỆM VỤ -->
          <div class="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
            <div class="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div class="w-8 h-8 rounded-xl bg-brand-50 text-brand font-headline font-bold flex items-center justify-center text-sm">
                1
              </div>
              <div>
                <h2 class="font-headline font-bold text-lg text-obsidian">Thông tin bé & Nhiệm vụ chăm sóc</h2>
                <p class="text-xs text-slate-500">Giúp CarePartner nắm rõ đặc điểm độ tuổi và chuẩn bị kỹ năng phù hợp</p>
              </div>
            </div>

            <!-- 1. CHILD AGE GROUP -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-bold text-slate-800">
                  Nhóm tuổi của bé <span class="text-rose-500">*</span>
                </label>
                <span id="selectedAgeBadge" class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-50 text-brand border border-brand-100">
                  1 - 3 tuổi (Tập đi / Nhà trẻ)
                </span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5" id="ageGroupContainer">
                <button type="button" onclick="selectAgeGroup('0_to_12_months')" data-age="0_to_12_months" class="age-card p-3 rounded-2xl border text-left transition-all border-slate-200 hover:border-brand/40 bg-white">
                  <div class="mb-1"><span class="material-symbols-outlined text-2xl text-slate-600">child_care</span></div>
                  <div class="font-bold text-xs sm:text-sm text-slate-800">0 - 12 tháng</div>
                  <div class="text-[11px] text-slate-400 truncate">Sơ sinh & ăn dặm</div>
                </button>
                <button type="button" onclick="selectAgeGroup('1_to_3_years')" data-age="1_to_3_years" class="age-card p-3 rounded-2xl border text-left transition-all border-brand bg-brand-50/60 shadow-xs ring-2 ring-brand/20">
                  <div class="mb-1"><span class="material-symbols-outlined text-2xl text-brand">toys</span></div>
                  <div class="font-bold text-xs sm:text-sm text-brand-700">1 - 3 tuổi</div>
                  <div class="text-[11px] text-brand-600/80 truncate">Tập đi / Nhà trẻ</div>
                </button>
                <button type="button" onclick="selectAgeGroup('3_to_6_years')" data-age="3_to_6_years" class="age-card p-3 rounded-2xl border text-left transition-all border-slate-200 hover:border-brand/40 bg-white">
                  <div class="mb-1"><span class="material-symbols-outlined text-2xl text-slate-600">palette</span></div>
                  <div class="font-bold text-xs sm:text-sm text-slate-800">3 - 6 tuổi</div>
                  <div class="text-[11px] text-slate-400 truncate">Lớp Mầm / Mẫu giáo</div>
                </button>
                <button type="button" onclick="selectAgeGroup('6_to_10_years')" data-age="6_to_10_years" class="age-card p-3 rounded-2xl border text-left transition-all border-slate-200 hover:border-brand/40 bg-white">
                  <div class="mb-1"><span class="material-symbols-outlined text-2xl text-slate-600">menu_book</span></div>
                  <div class="font-bold text-xs sm:text-sm text-slate-800">6 - 10 tuổi</div>
                  <div class="text-[11px] text-slate-400 truncate">Tiểu học & bài tập</div>
                </button>
                <button type="button" onclick="selectAgeGroup('over_10_years')" data-age="over_10_years" class="age-card p-3 rounded-2xl border text-left transition-all border-slate-200 hover:border-brand/40 bg-white col-span-2 sm:col-span-1">
                  <div class="mb-1"><span class="material-symbols-outlined text-2xl text-slate-600">school</span></div>
                  <div class="font-bold text-xs sm:text-sm text-slate-800">Trên 10 tuổi</div>
                  <div class="text-[11px] text-slate-400 truncate">Kèm học & kỹ năng</div>
                </button>
              </div>
            </div>

            <!-- 2. NUMBER OF CHILDREN -->
            <div class="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label class="block text-sm font-bold text-slate-800">
                  Số lượng trẻ cần trông <span class="text-rose-500">*</span>
                </label>
                <p class="text-xs text-slate-500 mt-0.5">Trông từ 2 bé trở lên tính phụ phí +20% / bé thêm để đảm bảo chu đáo</p>
              </div>

              <div class="flex items-center gap-3">
                <span id="childCountTag" class="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  1 bé (Tiêu chuẩn)
                </span>
                <div class="inline-flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
                  <button type="button" onclick="changeChildCount(-1)" id="btnMinusChild" class="w-9 h-9 rounded-xl bg-white text-slate-600 hover:bg-slate-50 shadow-xs flex items-center justify-center font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    −
                  </button>
                  <span id="childCountDisplay" class="w-12 text-center font-headline font-extrabold text-base text-obsidian">
                    1
                  </span>
                  <button type="button" onclick="changeChildCount(1)" id="btnPlusChild" class="w-9 h-9 rounded-xl bg-brand text-white hover:bg-brand-600 shadow-xs flex items-center justify-center font-bold text-lg transition-all">
                    +
                  </button>
                </div>
              </div>
            </div>

            <!-- 3. CARE DUTIES -->
            <div class="pt-4 border-t border-slate-100 space-y-3">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-bold text-slate-800">
                  Nhiệm vụ cần CarePartner thực hiện <span class="text-rose-500">*</span>
                </label>
                <span class="text-xs text-slate-500">Đã chọn: <b id="dutyCountText" class="text-brand">4</b>/7</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5" id="careDutiesGrid">
                <label class="duty-item flex items-center gap-3 p-3 rounded-2xl border border-brand bg-brand-50/40 cursor-pointer transition-all hover:bg-brand-50/60 select-none">
                  <input type="checkbox" value="general_care" checked onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-brand text-xl">verified_user</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Chăm sóc chung & theo dõi an toàn</div>
                </label>
                <label class="duty-item flex items-center gap-3 p-3 rounded-2xl border border-brand bg-brand-50/40 cursor-pointer transition-all hover:bg-brand-50/60 select-none">
                  <input type="checkbox" value="feeding" checked onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-brand text-xl">restaurant</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Cho ăn / Hâm sữa & ăn dặm</div>
                </label>
                <label class="duty-item flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white cursor-pointer transition-all hover:bg-slate-50 select-none">
                  <input type="checkbox" value="bathing" onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-slate-500 text-xl">bathtub</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Tắm rửa & Vệ sinh cá nhân</div>
                </label>
                <label class="duty-item flex items-center gap-3 p-3 rounded-2xl border border-brand bg-brand-50/40 cursor-pointer transition-all hover:bg-brand-50/60 select-none">
                  <input type="checkbox" value="sleep_monitoring" checked onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-brand text-xl">bedtime</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Trông coi & vỗ về giấc ngủ</div>
                </label>
                <label class="duty-item flex items-center gap-3 p-3 rounded-2xl border border-brand bg-brand-50/40 cursor-pointer transition-all hover:bg-brand-50/60 select-none">
                  <input type="checkbox" value="play_activities" checked onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-brand text-xl">extension</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Vui chơi, đọc sách & vận động</div>
                </label>
                <label class="duty-item flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white cursor-pointer transition-all hover:bg-slate-50 select-none">
                  <input type="checkbox" value="homework_help" onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-slate-500 text-xl">menu_book</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Hỗ trợ làm bài tập về nhà</div>
                </label>
                <label class="duty-item sm:col-span-2 flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white cursor-pointer transition-all hover:bg-slate-50 select-none">
                  <input type="checkbox" value="light_chores" onchange="toggleDuty(this)" class="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand accent-brand">
                  <span class="material-symbols-outlined text-slate-500 text-xl">cleaning_services</span>
                  <div class="text-xs sm:text-sm font-semibold text-slate-800">Rửa bình sữa & dọn dẹp đồ chơi của bé sau giờ chơi</div>
                </label>
              </div>
            </div>

            <!-- 4. MEDICAL & ALLERGY NOTES -->
            <div class="pt-4 border-t border-slate-100 space-y-2">
              <label for="medicalNotes" class="block text-sm font-bold text-slate-800 flex items-center gap-2">
                <span class="material-symbols-outlined text-base text-rose-500">medical_services</span>
                Lưu ý dị ứng & Sức khỏe của bé (nếu có)
              </label>
              <input type="text" id="medicalNotes" oninput="state.medical_allergy_notes = this.value" placeholder="VD: Bé dị ứng tôm cua, cần rửa tay sát khuẩn trước khi bế, không cho bé ăn bánh kẹo ngọt sau 7h tối..." class="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 text-xs sm:text-sm placeholder:text-slate-400 transition-all outline-none">
            </div>

          </div>

          <!-- CARD 2: LỊCH TRÔNG & THỜI LƯỢNG -->
          <div class="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
            <div class="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div class="w-8 h-8 rounded-xl bg-brand-50 text-brand font-headline font-bold flex items-center justify-center text-sm">
                2
              </div>
              <div class="flex-1">
                <h2 class="font-headline font-bold text-lg text-obsidian">Lịch trông trẻ & Thời lượng</h2>
                <p class="text-xs text-slate-500">Chọn các ngày cần bảo mẫu đến nhà (hỗ trợ chọn nhiều ngày hoặc cả tuần)</p>
              </div>
              <div class="hidden sm:flex items-center gap-2">
                <button type="button" onclick="quickSelectWeek()" class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors">
                  + Chọn cả tuần T2–T6
                </button>
                <button type="button" onclick="quickSelectMWF()" class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 transition-colors">
                  + Chọn T2-T4-T6
                </button>
              </div>
            </div>

            <!-- Mobile quick select -->
            <div class="flex sm:hidden items-center gap-2 overflow-x-auto pb-1">
              <button type="button" onclick="quickSelectWeek()" class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 whitespace-nowrap">
                + Chọn tuần T2–T6
              </button>
              <button type="button" onclick="quickSelectMWF()" class="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 whitespace-nowrap">
                + Chọn T2-T4-T6
              </button>
            </div>

            <!-- Rolling 14-Day Calendar Chips -->
            <div class="space-y-3">
              <label class="block text-sm font-bold text-slate-800">
                Chọn các ngày cần trông (Nhấp để chọn / bỏ chọn) <span class="text-rose-500">*</span>
              </label>
              <div id="calendarGrid" class="grid grid-cols-4 sm:grid-cols-7 gap-2"></div>
            </div>

            <!-- Selected Dates Badges -->
            <div class="space-y-2">
              <div class="flex items-center justify-between text-xs">
                <span class="font-semibold text-slate-600">Danh sách ngày đã chọn:</span>
                <button type="button" onclick="clearAllDates()" class="text-rose-500 hover:underline">Xóa tất cả</button>
              </div>
              <div id="selectedDatesContainer" class="flex flex-wrap gap-2 min-h-[36px] p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80"></div>
            </div>

            <!-- Time Range & Presets -->
            <div class="pt-4 border-t border-slate-100 space-y-4">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-bold text-slate-800">
                  Khung giờ trông trẻ mỗi buổi <span class="text-rose-500">*</span>
                </label>
                <span id="durationBadge" class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-50 text-brand border border-brand-100">
                  8.0 giờ / buổi
                </span>
              </div>

              <!-- Duration Presets -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button type="button" onclick="applyTimePreset('08:00', '12:00', 4.0)" class="preset-btn px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand/50 hover:bg-slate-50 transition-all text-center">
                  4.0h (Sáng 8h-12h)
                </button>
                <button type="button" onclick="applyTimePreset('13:30', '17:30', 4.0)" class="preset-btn px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand/50 hover:bg-slate-50 transition-all text-center">
                  4.0h (Chiều 13h30-17h30)
                </button>
                <button type="button" onclick="applyTimePreset('08:00', '17:00', 8.0)" class="preset-btn px-3 py-2 rounded-xl border-2 border-brand bg-brand-50/70 text-xs font-bold text-brand shadow-xs transition-all text-center">
                  8.0h (Cả ngày)
                </button>
                <button type="button" onclick="applyTimePreset('08:00', '17:30', 9.0)" class="preset-btn px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand/50 hover:bg-slate-50 transition-all text-center">
                  9.0h (Giờ hành chính)
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Giờ bắt đầu (time_from)</label>
                  <div class="relative">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">schedule</span>
                    <input type="time" id="timeFromInput" value="08:00" onchange="handleTimeChange()" class="w-full pl-10 pr-3 py-2.5 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm font-semibold outline-none transition-all">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1">Giờ kết thúc (time_to)</label>
                  <div class="relative">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">alarm_on</span>
                    <input type="time" id="timeToInput" value="17:00" onchange="handleTimeChange()" class="w-full pl-10 pr-3 py-2.5 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm font-semibold outline-none transition-all">
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- CARD 3: ĐỊA CHỈ & BẢN ĐỒ LEAFLET -->
          <div class="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
            <div class="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div class="w-8 h-8 rounded-xl bg-brand-50 text-brand font-headline font-bold flex items-center justify-center text-sm">
                3
              </div>
              <div>
                <h2 class="font-headline font-bold text-lg text-obsidian">Địa chỉ trông trẻ & Bản đồ định vị</h2>
                <p class="text-xs text-slate-500">Hệ thống quét bảo mẫu và CarePartner uy tín trong bán kính gần nhất</p>
              </div>
            </div>

            <!-- Search Address & GPS -->
            <div class="space-y-3">
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1">
                  <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                  <input type="text" id="mapSearchInput" placeholder="Nhập địa chỉ nhà, số nhà, ngõ, tên chung cư..." class="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 text-sm placeholder:text-slate-400 outline-none transition-all">
                </div>
                <button type="button" id="btnGpsCurrent" class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand-50 hover:bg-brand-100/80 text-brand font-semibold text-xs sm:text-sm border border-brand-200/70 transition-all whitespace-nowrap">
                  <span class="material-symbols-outlined text-base">my_location</span>
                  Dùng vị trí hiện tại
                </button>
              </div>

              <!-- Selected Address Badge -->
              <div class="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
                <span class="material-symbols-outlined text-brand text-base mt-0.5">location_on</span>
                <div>
                  <span class="text-slate-500 font-medium">Vị trí điểm trông trẻ:</span>
                  <span id="mapAddr" class="font-bold text-slate-800 ml-1">Chưa chọn vị trí (bấm tìm kiếm hoặc dùng GPS)</span>
                </div>
              </div>

              <!-- Embedded Leaflet Map Picker Container (#map) -->
              <div id="map" class="relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 z-10"></div>

              <!-- Hidden Lat/Lng for Django POST Form Integration -->
              <input type="hidden" id="lat" name="latitude" value="10.7932">
              <input type="hidden" id="lng" name="longitude" value="106.7218">

              <!-- Location Notes -->
              <div>
                <label for="inputLocationNote" class="block text-xs font-semibold text-slate-600 mb-1">Ghi chú vị trí chi tiết (không bắt buộc)</label>
                <input type="text" id="inputLocationNote" oninput="state.location_note = this.value" placeholder="VD: Tòa Landmark 4, tầng 12, căn 12A.05; bấm chuông cổng màu xám hoặc gọi mẹ đón..." class="w-full px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 text-xs sm:text-sm placeholder:text-slate-400 outline-none transition-all">
              </div>
            </div>

          </div>

          <!-- CARD 4: YÊU CẦU CỤ THỂ & GHI CHÚ -->
          <div class="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
            <div class="flex items-center gap-3 pb-4 border-b border-slate-100">
              <div class="w-8 h-8 rounded-xl bg-brand-50 text-brand font-headline font-bold flex items-center justify-center text-sm">
                4
              </div>
              <div>
                <h2 class="font-headline font-bold text-lg text-obsidian">Yêu cầu cụ thể & Ghi chú cho Bảo mẫu</h2>
                <p class="text-xs text-slate-500">Thêm tiêu chí mong muốn giúp thuật toán tìm đúng người có thế mạnh phù hợp</p>
              </div>
            </div>

            <!-- Quick tags -->
            <div class="space-y-2">
              <span class="text-xs font-semibold text-slate-600">Thẻ gợi ý nhanh (nhấp để chèn):</span>
              <div class="flex flex-wrap gap-2">
                <button type="button" onclick="insertQuickTag('Không dùng điện thoại khi trông bé')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand text-slate-700 text-xs font-medium border border-slate-200/70 transition-all">
                  + Không dùng ĐT khi trông
                </button>
                <button type="button" onclick="insertQuickTag('Biết kỹ năng sơ cứu trẻ em')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand text-slate-700 text-xs font-medium border border-slate-200/70 transition-all">
                  + Biết sơ cứu bé
                </button>
                <button type="button" onclick="insertQuickTag('Ưu tiên có bằng hoặc sinh viên Mầm non')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand text-slate-700 text-xs font-medium border border-slate-200/70 transition-all">
                  + Có bằng Mầm non
                </button>
                <button type="button" onclick="insertQuickTag('Biết kể chuyện và đọc sách tương tác')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand text-slate-700 text-xs font-medium border border-slate-200/70 transition-all">
                  + Kể chuyện đọc sách
                </button>
                <button type="button" onclick="insertQuickTag('Biết nấu đồ ăn dặm theo cữ')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-50 hover:text-brand text-slate-700 text-xs font-medium border border-slate-200/70 transition-all">
                  + Biết nấu ăn dặm
                </button>
              </div>
            </div>

            <!-- Textarea -->
            <div>
              <textarea id="specificRequirements" rows="3" oninput="state.specific_requirements = this.value" placeholder="VD: Cần cô bảo mẫu dịu dàng, kiên nhẫn chơi lego cùng bé, đúng giờ và trung thực. Nhà có sẵn đồ chơi và giáo cụ Montessori..." class="w-full p-4 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 text-xs sm:text-sm placeholder:text-slate-400 outline-none transition-all resize-none"></textarea>
            </div>
          </div>

        </div>

        <!-- RIGHT COLUMN (4 COLS STICKY) -->
        <div class="lg:col-span-4 space-y-6 lg:sticky lg:top-24">

          <div class="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-[0_6px_25px_rgba(0,0,0,0.04)] space-y-5">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 class="font-headline font-bold text-base text-obsidian flex items-center gap-1.5">
                <span class="material-symbols-outlined text-brand text-lg">calculate</span>
                Dự tính phí & Ký quỹ
              </h3>
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Minh bạch 100%
              </span>
            </div>

            <!-- Hourly Rate Input & Quick buttons -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-slate-600">Mức chi trả cho bảo mẫu:</label>
                <span class="text-[11px] font-medium text-brand">Khuyên dùng: 70k - 100k/h</span>
              </div>

              <div class="relative">
                <input type="number" id="inputHourlyRate" value="80000" step="5000" oninput="handleHourlyRateInput(this.value)" class="w-full pl-4 pr-16 py-3 rounded-2xl border border-slate-200 focus:border-brand focus:ring-2 focus:ring-brand/20 font-headline font-extrabold text-xl text-obsidian outline-none transition-all">
                <span class="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">đ / giờ</span>
              </div>

              <div class="grid grid-cols-4 gap-1.5 pt-1">
                <button type="button" onclick="adjustHourlyRate(-10000)" class="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">-10k</button>
                <button type="button" onclick="adjustHourlyRate(10000)" class="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">+10k</button>
                <button type="button" onclick="adjustHourlyRate(20000)" class="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">+20k</button>
                <button type="button" onclick="adjustHourlyRate(50000)" class="py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">+50k</button>
              </div>
            </div>

            <!-- Reactive Breakdown Table -->
            <div class="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/70 space-y-2.5 text-xs">
              <div class="flex items-center justify-between text-slate-600">
                <span>Thời lượng 1 buổi:</span>
                <span id="summaryDuration" class="font-bold text-slate-800">8.0 giờ (480 phút)</span>
              </div>
              <div class="flex items-center justify-between text-slate-600">
                <span>Chi phí 1 buổi (cơ bản):</span>
                <span id="summaryPerSessionBase" class="font-bold text-slate-800">640,000 đ</span>
              </div>
              <div id="extraChildRow" class="hidden flex items-center justify-between text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200/60 font-medium">
                <span id="extraChildLabel">Phụ phí trẻ thứ 2 (+20%):</span>
                <span id="extraChildAmount">+128,000 đ</span>
              </div>
              <div class="flex items-center justify-between text-slate-600">
                <span>Chi phí 1 buổi (đã tính bé):</span>
                <span id="summaryPerSessionFinal" class="font-bold text-slate-900">640,000 đ</span>
              </div>
              <div class="flex items-center justify-between text-slate-600">
                <span>Số buổi trông đã chọn:</span>
                <span id="summaryDateCount" class="font-bold text-brand">5 buổi</span>
              </div>

              <div class="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                <div>
                  <span class="block text-xs font-extrabold text-obsidian">Tổng chi phí dự tính:</span>
                  <span class="text-[10px] text-slate-400">Đã bao gồm ký quỹ bảo đảm</span>
                </div>
                <div class="text-right">
                  <span id="summaryTotalCost" class="font-headline font-extrabold text-2xl text-brand">
                    3,200,000
                  </span>
                  <span class="font-bold text-xs text-brand ml-0.5">VNĐ</span>
                </div>
              </div>
            </div>

            <!-- Escrow Safety Box -->
            <div class="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-start gap-2.5 text-xs text-emerald-900">
              <span class="material-symbols-outlined text-emerald-600 text-lg flex-shrink-0 mt-0.5 fill-1">lock</span>
              <p class="leading-relaxed">
                <strong class="font-bold text-emerald-950">Ký quỹ MoMo an toàn:</strong> Phụ huynh giữ tiền trong ví trung gian bảo đảm, chỉ giải ngân cho bảo mẫu sau khi từng buổi hoàn tất an tâm.
              </p>
            </div>

            <!-- Main Submit CTA Button -->
            <button type="button" id="btnSubmitMain" onclick="submitChildcareJob()" class="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-brand to-orange-500 hover:from-brand-600 hover:to-orange-600 text-white font-headline font-extrabold text-base shadow-lg shadow-brand/30 flex items-center justify-center gap-2.5 transform active:scale-[0.98] transition-all">
              <span class="material-symbols-outlined text-xl">radar</span>
              <span>Đăng việc & Tìm Bảo Mẫu</span>
            </button>

            <!-- 3 Step Process Review -->
            <div class="pt-2 text-xs space-y-2 border-t border-slate-100">
              <div class="font-bold text-slate-700 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-sm text-slate-400">task_alt</span>
                Quy trình tuyển chọn 3 bước:
              </div>
              <div class="text-[11px] text-slate-500 space-y-1 pl-4">
                <div>1. Đối soát CCCD gắn chip & kiểm tra năng lực</div>
                <div>2. Đăng việc & quét các ứng viên gần nhà nhất</div>
                <div>3. Phỏng vấn trực tiếp, ưng ý mới xác nhận làm</div>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  </main>

  <!-- MOBILE BOTTOM FLOATING BAR (<1024px) -->
  <aside class="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-4 py-3 lg:hidden shadow-lg flex items-center justify-between">
    <div>
      <div class="text-[11px] text-slate-500 flex items-center gap-1">
        <span id="mobileSummaryInfo">5 buổi · 1 bé · 8h/buổi</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-xs font-bold text-slate-600">Tạm tính:</span>
        <span id="mobileTotalCost" class="font-headline font-extrabold text-lg text-brand">3,200,000 đ</span>
      </div>
    </div>

    <button type="button" id="btnBottomSubmit" onclick="submitChildcareJob()" class="px-5 py-2.5 rounded-xl bg-brand text-white font-headline font-bold text-sm shadow-md shadow-brand/25 flex items-center gap-1.5 active:scale-95 transition-all">
      <span class="material-symbols-outlined text-base">radar</span>
      <span>Đăng việc ngay</span>
    </button>
  </aside>

  <!-- MODAL 1: RADAR QUÉT SÓNG MATCHING -->
  <div id="radarModal" class="fixed inset-0 z-50 bg-obsidian/80 backdrop-blur-md hidden items-center justify-center p-4">
    <div class="bg-white w-full max-w-md rounded-3xl p-6 sm:p-8 text-center relative overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
      
      <button type="button" onclick="closeRadarModal()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
        ✕
      </button>

      <!-- RADAR ANIMATION CONTAINER -->
      <div class="relative w-56 h-56 mx-auto my-4 flex items-center justify-center">
        <div class="absolute inset-0 rounded-full border border-slate-200"></div>
        <div class="absolute inset-8 rounded-full border border-slate-200"></div>
        <div class="absolute inset-16 rounded-full border border-slate-200"></div>
        <div class="absolute inset-0 rounded-full radar-beam pointer-events-none"></div>
        <div class="absolute w-20 h-20 rounded-full bg-brand/30 radar-pulse"></div>

        <div class="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand to-orange-400 text-white flex items-center justify-center shadow-xl shadow-brand/30">
          <span class="material-symbols-outlined text-3xl">child_care</span>
        </div>

        <div class="absolute -top-1 left-12 w-9 h-9 rounded-full bg-blue-50 border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-blue-700 animate-pulse">
          SP
        </div>
        <div class="absolute bottom-3 right-6 w-9 h-9 rounded-full bg-emerald-50 border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-emerald-700 animate-pulse" style="animation-delay: 0.5s;">
          MN
        </div>
        <div class="absolute top-20 right-0 w-9 h-9 rounded-full bg-amber-50 border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-amber-700 animate-pulse" style="animation-delay: 1s;">
          Y-D
        </div>
      </div>

      <div id="radarSearchingState">
        <h3 class="font-headline font-extrabold text-xl text-obsidian">Đang quét tìm Bảo mẫu gần bạn</h3>
        <p class="text-xs sm:text-sm text-slate-500 mt-1 max-w-xs mx-auto">
          Hệ thống đang đối soát dữ liệu và gửi thông báo tới các CarePartner phù hợp trong bán kính 5km...
        </p>

        <div class="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-brand">
          <span class="w-2 h-2 rounded-full bg-brand animate-ping"></span>
          <span>Đang kết nối cổng matching EduCareLink API...</span>
        </div>
      </div>

      <div id="radarSuccessState" class="hidden">
        <div class="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
          <span class="material-symbols-outlined text-2xl fill-1">check_circle</span>
        </div>
        <h3 class="font-headline font-extrabold text-xl text-emerald-700">Đăng việc thành công!</h3>
        <p class="text-xs sm:text-sm text-slate-600 mt-1 max-w-xs mx-auto">
          Đã phát tín hiệu trông trẻ. Đang chuyển hướng sang danh sách ứng viên phù hợp...
        </p>
      </div>

    </div>
  </div>

  <!-- MODAL 2: TRUST & ESCROW MODAL -->
  <div id="trustModal" class="fixed inset-0 z-50 bg-obsidian/75 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl relative">
      <button type="button" onclick="closeTrustModal()" class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
        ✕
      </button>

      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <span class="material-symbols-outlined text-2xl fill-1">shield</span>
        </div>
        <div>
          <h3 class="font-headline font-bold text-lg text-obsidian">Quy chế Ký quỹ & Bảo đảm An toàn</h3>
          <p class="text-xs text-slate-500">EduCareLink bảo vệ quyền lợi tối đa cho Phụ huynh</p>
        </div>
      </div>

      <div class="space-y-3.5 text-xs text-slate-600 leading-relaxed">
        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
          <strong class="font-bold text-slate-900 block mb-1">1. Xác thực CCCD & Hồ sơ chuyên môn:</strong>
          100% CarePartner được đối soát thẻ CCCD gắn chip với cơ sở dữ liệu, có chứng chỉ kỹ năng sơ cứu, mầm non hoặc sinh viên các trường đại học uy tín.
        </div>
        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
          <strong class="font-bold text-slate-900 block mb-1">2. Tiền trông trẻ được Ký quỹ tạm giữ:</strong>
          Phụ huynh nạp tiền vào tài khoản ký quỹ MoMo / Ngân hàng bảo lãnh. Tiền chỉ giải ngân cho bảo mẫu sau khi buổi chăm sóc hoàn thành và được phụ huynh xác nhận hài lòng.
        </div>
        <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
          <strong class="font-bold text-slate-900 block mb-1">3. Quyền đổi bảo mẫu miễn phí:</strong>
          Nếu sau buổi đầu tiên bảo mẫu không hợp tác phong hoặc phong cách của bé, phụ huynh có quyền yêu cầu đổi CarePartner khác hoàn toàn miễn phí hoặc rút lại 100% số tiền còn lại.
        </div>
      </div>

      <button type="button" onclick="closeTrustModal()" class="w-full mt-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-all">
        Đã hiểu, tôi an tâm tiếp tục
      </button>
    </div>
  </div>

  <!-- JAVASCRIPT BUSINESS LOGIC & PARITY WITH MOBILE -->
  <script>
    const state = {
      child_age_group: '1_to_3_years',
      number_of_children: 1,
      care_duties: ['general_care', 'feeding', 'sleep_monitoring', 'play_activities'],
      medical_allergy_notes: '',
      specific_requirements: '',
      dates: [], // YYYY-MM-DD
      time_from: '08:00',
      time_to: '17:00',
      session_duration: 8.0,
      hourly_rate: 80000,
      latitude: 10.7932,
      longitude: 106.7218,
      location_note: ''
    };

    const AGE_GROUP_LABELS = {
      '0_to_12_months': '0 - 12 tháng (Sơ sinh & ăn dặm)',
      '1_to_3_years': '1 - 3 tuổi (Tập đi / Nhà trẻ)',
      '3_to_6_years': '3 - 6 tuổi (Lớp Mầm / Mẫu giáo)',
      '6_to_10_years': '6 - 10 tuổi (Tiểu học & bài tập)',
      'over_10_years': 'Trên 10 tuổi (Kèm học & kỹ năng)'
    };

    document.addEventListener('DOMContentLoaded', () => {
      initRollingDates();
      quickSelectWeek();
      calculatePricing();

      // Initialize Leaflet Map Picker from _matching_common.html
      initMapPicker({
        mapId: 'map',
        searchId: 'mapSearchInput',
        btnGpsId: 'btnGpsCurrent',
        addrId: 'mapAddr',
        latInput: 'lat',
        lngInput: 'lng',
        noteInput: 'inputLocationNote'
      });
    });

    let rollingDatesList = [];
    function initRollingDates() {
      const calendarGrid = document.getElementById('calendarGrid');
      calendarGrid.innerHTML = '';
      rollingDatesList = [];

      const today = new Date();
      for (let i = 1; i <= 14; i++) {
        const d = new Date();
        d.setDate(today.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const dayOfWeekNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const dayOfWeek = dayOfWeekNames[d.getDay()];

        rollingDatesList.push({ dateStr, dayOfWeek, dayNumber: dd, monthNumber: mm, isWeekend: (d.getDay() === 0 || d.getDay() === 6) });
      }

      renderCalendarCards();
    }

    function renderCalendarCards() {
      const calendarGrid = document.getElementById('calendarGrid');
      calendarGrid.innerHTML = '';

      rollingDatesList.forEach(item => {
        const isSelected = state.dates.includes(item.dateStr);
        const card = document.createElement('button');
        card.type = 'button';
        card.onclick = () => toggleDate(item.dateStr);
        card.className = `p-2.5 rounded-2xl border text-center transition-all ${
          isSelected 
            ? 'border-brand bg-brand text-white shadow-md shadow-brand/25 scale-[1.02]' 
            : 'border-slate-200 bg-white hover:border-brand/40 text-slate-700'
        }`;

        card.innerHTML = `
          <div class="text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-white/80' : 'text-slate-400'}">${item.dayOfWeek}</div>
          <div class="font-headline font-extrabold text-base my-0.5">${item.dayNumber}</div>
          <div class="text-[10px] ${isSelected ? 'text-white/90' : 'text-slate-400'}">Thg ${item.monthNumber}</div>
        `;
        calendarGrid.appendChild(card);
      });

      renderSelectedChips();
    }

    function toggleDate(dateStr) {
      if (state.dates.includes(dateStr)) {
        state.dates = state.dates.filter(d => d !== dateStr);
      } else {
        state.dates.push(dateStr);
        state.dates.sort();
      }
      renderCalendarCards();
      calculatePricing();
    }

    function renderSelectedChips() {
      const container = document.getElementById('selectedDatesContainer');
      container.innerHTML = '';

      if (state.dates.length === 0) {
        container.innerHTML = `<span class="text-xs text-slate-400 italic">Chưa chọn ngày nào. Vui lòng bấm chọn ngày ở trên.</span>`;
        return;
      }

      state.dates.forEach(d => {
        const parts = d.split('-');
        const dateFormatted = `${parts[2]}/${parts[1]}`;
        const chip = document.createElement('span');
        chip.className = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-brand/30 text-brand text-xs font-bold shadow-xs';
        chip.innerHTML = `
          <span>${dateFormatted}</span>
          <button type="button" onclick="event.stopPropagation(); toggleDate('${d}')" class="hover:text-rose-600 ml-0.5">✕</button>
        `;
        container.appendChild(chip);
      });
    }

    function quickSelectWeek() {
      state.dates = rollingDatesList
        .filter(item => item.dayOfWeek !== 'CN' && item.dayOfWeek !== 'T7')
        .slice(0, 5)
        .map(item => item.dateStr);
      renderCalendarCards();
      calculatePricing();
    }

    function quickSelectMWF() {
      state.dates = rollingDatesList
        .filter(item => item.dayOfWeek === 'T2' || item.dayOfWeek === 'T4' || item.dayOfWeek === 'T6')
        .slice(0, 3)
        .map(item => item.dateStr);
      renderCalendarCards();
      calculatePricing();
    }

    function clearAllDates() {
      state.dates = [];
      renderCalendarCards();
      calculatePricing();
    }

    function selectAgeGroup(ageKey) {
      state.child_age_group = ageKey;
      document.querySelectorAll('.age-card').forEach(card => {
        const iconSpan = card.querySelector('.material-symbols-outlined');
        const title = card.querySelector('.font-bold');
        if (card.dataset.age === ageKey) {
          card.className = 'age-card p-3 rounded-2xl border text-left transition-all border-brand bg-brand-50/60 shadow-xs ring-2 ring-brand/20';
          if (title) title.className = 'font-bold text-xs sm:text-sm text-brand-700';
          if (iconSpan) iconSpan.className = 'material-symbols-outlined text-2xl text-brand';
        } else {
          card.className = 'age-card p-3 rounded-2xl border text-left transition-all border-slate-200 hover:border-brand/40 bg-white';
          if (title) title.className = 'font-bold text-xs sm:text-sm text-slate-800';
          if (iconSpan) iconSpan.className = 'material-symbols-outlined text-2xl text-slate-600';
        }
      });

      document.getElementById('selectedAgeBadge').innerText = AGE_GROUP_LABELS[ageKey] || ageKey;
    }

    function changeChildCount(delta) {
      const nextVal = state.number_of_children + delta;
      if (nextVal >= 1 && nextVal <= 5) {
        state.number_of_children = nextVal;
        document.getElementById('childCountDisplay').innerText = nextVal;
        document.getElementById('btnMinusChild').disabled = (nextVal === 1);

        const badge = document.getElementById('childCountTag');
        if (nextVal === 1) {
          badge.innerText = '1 bé (Tiêu chuẩn)';
          badge.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700';
        } else {
          badge.innerText = `${nextVal} bé (+${(nextVal - 1) * 20}% phụ phí)`;
          badge.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200';
        }
        calculatePricing();
      }
    }

    function toggleDuty(checkbox) {
      const duty = checkbox.value;
      const labelEl = checkbox.closest('label');
      const iconSpan = labelEl.querySelector('.material-symbols-outlined');

      if (checkbox.checked) {
        if (!state.care_duties.includes(duty)) state.care_duties.push(duty);
        labelEl.className = 'duty-item flex items-center gap-3 p-3 rounded-2xl border border-brand bg-brand-50/40 cursor-pointer transition-all hover:bg-brand-50/60 select-none' + (duty === 'light_chores' ? ' sm:col-span-2' : '');
        if (iconSpan) iconSpan.className = 'material-symbols-outlined text-brand text-xl';
      } else {
        state.care_duties = state.care_duties.filter(d => d !== duty);
        labelEl.className = 'duty-item flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white cursor-pointer transition-all hover:bg-slate-50 select-none' + (duty === 'light_chores' ? ' sm:col-span-2' : '');
        if (iconSpan) iconSpan.className = 'material-symbols-outlined text-slate-500 text-xl';
      }
      document.getElementById('dutyCountText').innerText = state.care_duties.length;
    }

    function applyTimePreset(from, to, duration) {
      document.getElementById('timeFromInput').value = from;
      document.getElementById('timeToInput').value = to;
      state.time_from = from;
      state.time_to = to;
      state.session_duration = duration;

      document.querySelectorAll('.preset-btn').forEach(btn => {
        if (btn.innerText.includes(`${duration.toFixed(1)}h`)) {
          btn.className = 'preset-btn px-3 py-2 rounded-xl border-2 border-brand bg-brand-50/70 text-xs font-bold text-brand shadow-xs transition-all text-center';
        } else {
          btn.className = 'preset-btn px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:border-brand/50 hover:bg-slate-50 transition-all text-center';
        }
      });

      calculatePricing();
    }

    function handleTimeChange() {
      const from = document.getElementById('timeFromInput').value;
      const to = document.getElementById('timeToInput').value;
      state.time_from = from;
      state.time_to = to;

      const [h1, m1] = from.split(':').map(Number);
      const [h2, m2] = to.split(':').map(Number);
      let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diffMinutes < 0) diffMinutes += 24 * 60;

      const hours = Math.max(0.5, diffMinutes / 60);
      state.session_duration = parseFloat(hours.toFixed(1));

      calculatePricing();
    }

    function handleHourlyRateInput(val) {
      const num = parseInt(val) || 0;
      state.hourly_rate = num;
      calculatePricing();
    }

    function adjustHourlyRate(delta) {
      state.hourly_rate = Math.max(40000, state.hourly_rate + delta);
      document.getElementById('inputHourlyRate').value = state.hourly_rate;
      calculatePricing();
    }

    function insertQuickTag(tagText) {
      const textarea = document.getElementById('specificRequirements');
      if (textarea.value.trim().length > 0) {
        textarea.value += ` • ${tagText}`;
      } else {
        textarea.value = `• ${tagText}`;
      }
      state.specific_requirements = textarea.value;
      textarea.focus();
    }

    function calculatePricing() {
      const dur = state.session_duration;
      const rate = state.hourly_rate;
      const children = state.number_of_children;
      const dateCount = state.dates.length;

      const basePerSession = rate * dur;
      const extraMultiplier = (children - 1) * 0.2;
      const extraPerSession = basePerSession * extraMultiplier;
      const finalPerSession = basePerSession + extraPerSession;
      const total = finalPerSession * dateCount;

      document.getElementById('durationBadge').innerText = `${dur} giờ / buổi`;
      document.getElementById('summaryDuration').innerText = `${dur} giờ (${Math.round(dur * 60)} phút)`;
      document.getElementById('summaryPerSessionBase').innerText = formatVND(basePerSession);

      const extraRow = document.getElementById('extraChildRow');
      if (children > 1) {
        extraRow.classList.remove('hidden');
        document.getElementById('extraChildLabel').innerText = `Phụ phí ${children - 1} bé thêm (+${Math.round(extraMultiplier * 100)}%):`;
        document.getElementById('extraChildAmount').innerText = `+${formatVND(extraPerSession)}`;
      } else {
        extraRow.classList.add('hidden');
      }

      document.getElementById('summaryPerSessionFinal').innerText = formatVND(finalPerSession);
      document.getElementById('summaryDateCount').innerText = `${dateCount} buổi`;
      document.getElementById('summaryTotalCost').innerText = formatVND(total).replace(' đ', '');

      document.getElementById('mobileSummaryInfo').innerText = `${dateCount} buổi · ${children} bé · ${dur}h/buổi`;
      document.getElementById('mobileTotalCost').innerText = formatVND(total);
    }

    function formatVND(amount) {
      return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
    }

    async function submitChildcareJob() {
      if (state.dates.length === 0) {
        toast("Vui lòng chọn ít nhất 1 ngày cần trông trẻ trong lịch.", false);
        document.getElementById('calendarGrid').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (state.care_duties.length === 0) {
        toast("Vui lòng chọn ít nhất 1 nhiệm vụ chăm sóc bé.", false);
        return;
      }
      if (state.session_duration < 0.5) {
        toast("Thời lượng trông bé tối thiểu là 30 phút.", false);
        return;
      }

      const latVal = document.getElementById('lat').value;
      const lngVal = document.getElementById('lng').value;
      const lat = latVal ? parseFloat(latVal) : state.latitude;
      const lng = lngVal ? parseFloat(lngVal) : state.longitude;
      if (!lat || !lng) {
        toast("Vui lòng chọn địa điểm trông trẻ trên bản đồ.", false);
        return;
      }

      const addrEl = document.getElementById('mapAddr');
      const locationText = addrEl ? addrEl.textContent.replace('📍 ', '').trim() : '';
      const noteInput = document.getElementById('inputLocationNote');
      const noteVal = noteInput ? noteInput.value.trim() : '';
      const finalLocationNote = noteVal || locationText || 'Vị trí đã chọn trên bản đồ';

      const finalRequirements = (state.specific_requirements || '').trim() ||
        'Chăm sóc, vui chơi tương tác và đảm bảo an toàn tuyệt đối cho bé.';

      const payload = {
        job_type: 'childcare',
        child_age_group: state.child_age_group,
        number_of_children: state.number_of_children,
        care_duties: state.care_duties,
        medical_allergy_notes: (state.medical_allergy_notes || '').trim(),
        specific_requirements: finalRequirements,
        dates: [...state.dates].sort(),
        time_from: state.time_from,
        time_to: state.time_to,
        hourly_rate_vnd: state.hourly_rate,
        latitude: lat,
        longitude: lng,
        location_note: finalLocationNote
      };

      const modal = document.getElementById('radarModal');
      const searchingState = document.getElementById('radarSearchingState');
      const successState = document.getElementById('radarSuccessState');
      const btnSubmit = document.getElementById('btnSubmitMain');
      const btnBottom = document.getElementById('btnBottomSubmit');

      modal.classList.remove('hidden');
      modal.classList.add('flex');
      searchingState.classList.remove('hidden');
      successState.classList.add('hidden');

      btnSubmit.disabled = true;
      btnBottom.disabled = true;

      try {
        const resp = await authFetch(API_BASE + '/matching/jobs/', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const data = await resp.json();

        if (resp.status === 201 && data.id) {
          await authFetch(`${API_BASE}/matching/jobs/${data.id}/publish/`, {
            method: 'POST'
          });

          setTimeout(() => {
            searchingState.classList.add('hidden');
            successState.classList.remove('hidden');

            setTimeout(() => {
              window.location.href = `/ung-vien/${data.id}/`;
            }, 1200);
          }, 1500);

        } else {
          modal.classList.remove('flex');
          modal.classList.add('hidden');
          btnSubmit.disabled = false;
          btnBottom.disabled = false;
          const detail = data.detail || (typeof data === 'object' ? Object.values(data).flat().join(', ') : 'Vui lòng kiểm tra lại thông tin.');
          toast(detail, false);
        }
      } catch (err) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
        btnSubmit.disabled = false;
        btnBottom.disabled = false;
        if (err.message !== 'no_token') {
          toast('Không thể kết nối đến máy chủ. Vui lòng thử lại.', false);
        }
      }
    }

    function closeRadarModal() {
      const modal = document.getElementById('radarModal');
      modal.classList.remove('flex');
      modal.classList.add('hidden');
      document.getElementById('btnSubmitMain').disabled = false;
      document.getElementById('btnBottomSubmit').disabled = false;
    }

    function openTrustModal() {
      const modal = document.getElementById('trustModal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeTrustModal() {
      const modal = document.getElementById('trustModal');
      modal.classList.remove('flex');
      modal.classList.add('hidden');
    }
  </script>
</body>
</html>
```

---

### 5. QUY TRÌNH KIỂM THỬ VÀ ĐẨY CODE LÊN GITHUB
Sau khi cập nhật xong `frontend/templates/frontend/dang_viec_trong_tre.html`:

1. **Kiểm tra cú pháp Django:**
   ```bash
   python manage.py check
   ```
   Đảm bảo: `System check identified no issues (0 silenced)`.

2. **Kiểm tra trực quan & bảo toàn các thành phần:**
   - Header và main có class `lg:ml-[260px]` để căn đúng lề theo sidebar phụ huynh.
   - Logo hiển thị chính thức từ `/static/images/logo.png`.
   - Không còn bất kỳ ký tự emoji xấu nào (đã thay thế 100% bằng Google Material Symbols Outlined).
   - Bản đồ Leaflet load mượt mà, GPS lấy đúng tọa độ.

3. **Commit & Push lên main:**
   ```bash
   git status
   git add frontend/templates/frontend/dang_viec_trong_tre.html
   git commit -m "feat(web): nâng cấp giao diện Đăng việc Trông trẻ chuẩn Stitch và parity mobile"
   git push origin main
   ```
