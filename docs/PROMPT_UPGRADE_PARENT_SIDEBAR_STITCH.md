# CHỈ THỊ CODING AGENT: NÂNG CẤP ĐỒNG BỘ SIDEBAR PHỤ HUYNH THEO THIẾT KẾ STITCH MỚI

> **Dành cho:** Coding Agent (Cursor / Claude Code / Windsurf / Copilot / Aider...)  
> **Dự án:** EduCareLink (Django 5.2 Monolith + Django Templates + Tailwind CSS)  
> **Trọng tâm nhiệm vụ:** **NÂNG CẤP SIDEBAR PHỤ HUYNH** theo đúng bản thiết kế HTML từ Stitch, có tích hợp mục **Ví credit**, phân nhóm danh mục rõ ràng, và đảm bảo **TẤT CẢ các trang phụ huynh đều hiển thị 1 sidebar giống hệt nhau 100% về giao diện lẫn chức năng**.  
> **File cốt lõi cần sửa:** `frontend/templates/frontend/_parent_sidebar.html` (Single Source of Truth cho Sidebar Phụ huynh).  
> **Các trang phụ huynh cần đối soát đồng bộ:**  
> - `parent_home.html` (Trang chủ — `active_tab='home'`)  
> - `parent_tasks.html` (Việc của tôi — `active_tab='tasks'`)  
> - `parent_care_diary_history.html` & `parent_care_diary_detail.html` (Nhật ký chăm sóc — `active_tab='diary'`)  
> - `dang_viec_select.html`, `task_create_1.html`, `task_create_2.html` (Đăng việc ghép cặp — `active_tab='create'`)  
> - `vi_credit.html` (Ví credit đền bù — `active_tab='credit'`)  
> - `chatbot.html` (AI Trợ lý — `active_tab='chatbot'`)  
> - `help_center.html` (Hướng dẫn sử dụng — `active_tab='help'`)  
> - `parent_profile.html` (Cài đặt / Hồ sơ — `active_tab='profile'` hoặc `'settings'`)  
> - `browse_candidates.html`, `review.html` (Duyệt ứng viên & Đánh giá)

---

## 1. PHÂN TÍCH THIẾT KẾ SIDEBAR MỚI (STITCH) SO VỚI HIỆN TẠI

Bản thiết kế mới của Stitch nâng cấp Sidebar Phụ huynh từ danh sách phẳng đơn giản lên một Sidebar quản trị hiện đại, chuẩn UI/UX cấp doanh nghiệp:

### 1. Khu vực Thương hiệu & Ngữ cảnh (Header):
* **Logo dự án:** Bắt buộc dùng đúng ảnh logo của dự án: `<img src="/static/images/logo.png" alt="EduCareLink" class="h-8 w-8 object-contain">` đặt trong khung bo tròn cao cấp: `w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center shadow-sm shrink-0`.
* **Tên thương hiệu:** `Edu<span class="text-brand-500 text-[#F26522]">Care</span>Link` sử dụng font chữ `Manrope` trọng số 800 cực đậm.
* **Badge vai trò:** Huy hiệu pill nhỏ nhắn `Phụ huynh` có chấm tròn cam nhấp nháy: `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-brand-600 border border-orange-200/70 font-semibold text-[10px] tracking-wide"><span class="w-1.5 h-1.5 rounded-full bg-[#F26522]"></span> Phụ huynh</span>`.

### 2. Danh mục điều hướng phân nhóm rõ ràng (2 Groups):
* **Nhóm 1: QUẢN LÝ & DỊCH VỤ (`text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none`)**:
  1. **Trang chủ** (`active_tab == 'home'`): Icon `home` -> `{% url 'frontend:parent_home' %}`
  2. **Việc của tôi** (`active_tab == 'tasks'`): Icon `assignment` -> `{% url 'frontend:parent_tasks' %}`
  3. **Nhật ký chăm sóc** (`active_tab == 'diary'`): Icon `auto_stories` -> `{% url 'frontend:parent_care_diary_history' %}`
  4. **Đăng việc ghép cặp** (`active_tab == 'matching' or active_tab == 'create'`): Icon `auto_awesome` -> `{% url 'frontend:dang_viec_select' %}` kèm Huy hiệu tương phản cao: `<span class="px-2 py-0.5 rounded-full bg-[#F26522] text-white font-bold text-[10px] tracking-wide shadow-sm shadow-orange-500/20 shrink-0">MỚI</span>`.
  5. **Ví credit** (`active_tab == 'credit'`): Icon `account_balance_wallet` -> `{% url 'frontend:vi_credit' %}`. Khi active có viền cam bên trái và chấm tròn cam biểu thị trạng thái đang chọn.
* **Nhóm 2: HỖ TRỢ & HỆ THỐNG (`text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none`)**:
  6. **AI Trợ lý** (`active_tab == 'chatbot'`): Icon `smart_toy` -> `{% url 'frontend:chatbot' %}`
  7. **Hướng dẫn sử dụng** (`active_tab == 'help'`): Icon `help_outline` -> `/onboarding/parent/` (hoặc `{% url 'frontend:help_center' %}`)
  8. **Cài đặt** (`active_tab == 'profile' or active_tab == 'settings'`): Icon `settings` -> `{% url 'frontend:parent_profile' %}`

### 3. Quy chuẩn Trạng thái Active / Inactive của Menu Item:
* **Khi Active:**
  - Nền cam nhạt, chữ cam đậm: `bg-orange-50/80 text-[#ea580c] font-semibold text-sm transition-all border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs`.
  - Icon đổi sang dạng tô đậm (filled icon) màu cam: `fill-icon text-[#F26522]`.
  - Có chấm chỉ báo trạng thái ở bên phải: `<span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>`.
* **Khi Inactive:**
  - `text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 transition-all font-medium text-sm group`.
  - Icon màu xám nhẹ, khi hover chuyển sang đậm hơn: `text-slate-400 group-hover:text-slate-600 transition-colors text-xl`.

### 4. Khu vực Profile người dùng & Đăng xuất (Footer Capsule):
* **Capsule thông tin tương tác:** Khung viền bo tròn trắng nổi nhẹ trên nền xám: `p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 transition-all cursor-pointer shadow-xs group`.
  - Avatar người dùng: Vòng tròn gradient với chấm tròn xanh biểu thị trực tuyến: `<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>`. Giữ nguyên `id="sidebar-avatar"` để JS cập nhật ảnh thực tế.
  - Tên hiển thị: Giữ nguyên `id="sidebar-name"` để đồng bộ tên phụ huynh.
  - Phụ đề: `Phụ huynh` (hoặc `id="sidebar-subtitle"`).
  - Biểu tượng mũi tên `chevron_right` dẫn tới trang Hồ sơ.
* **Nút Đăng xuất an toàn:**
  - Nút bấm trực quan với hiệu ứng hover màu đỏ: `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-medium transition-colors`.
  - Gọi hàm `onclick="handleLogout()"`.

---

## 2. MÃ NGUỒN HOÀN CHỈNH CHO `frontend/templates/frontend/_parent_sidebar.html`

Coding Agent hãy thay thế **TOÀN BỘ** nội dung file `frontend/templates/frontend/_parent_sidebar.html` bằng mã nguồn chuẩn xác dưới đây:

```html
{% load static %}
<!-- ============================================================ -->
<!-- _parent_sidebar.html — Sidebar Phụ huynh chuẩn hóa (Stitch UI) -->
<!-- Single Source of Truth cho toàn bộ các trang phụ huynh         -->
<!-- Hỗ trợ active_tab: home | tasks | diary | matching/create      -->
<!--                    | credit | chatbot | help | settings/profile -->
<!-- ============================================================ -->

<style>
  .psb-scroll::-webkit-scrollbar { width: 4px; }
  .psb-scroll::-webkit-scrollbar-track { background: transparent; }
  .psb-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
  .psb-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  .psb-scroll { scrollbar-width: thin; }

  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 450, 'GRAD' 0, 'opsz' 22;
    vertical-align: middle;
  }
  .material-symbols-outlined.fill-icon {
    font-variation-settings: 'FILL' 1, 'wght' 450, 'GRAD' 0, 'opsz' 22;
  }
</style>

<!-- Brand Logo & Context Area -->
<div class="p-5 border-b border-slate-100/90 shrink-0">
  <div class="flex items-center gap-3">
    <!-- Logo Icon Box using project logo -->
    <div class="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center shadow-sm shrink-0">
      <img src="/static/images/logo.png" alt="EduCareLink" class="h-7 w-7 object-contain">
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-1.5">
        <div class="font-heading font-extrabold text-xl tracking-tight text-slate-900 leading-tight truncate" style="font-family: 'Manrope', sans-serif;">
          Edu<span class="text-[#F26522]">Care</span>Link
        </div>
      </div>
      <div class="mt-1 flex items-center">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-[#c2410c] border border-orange-200/70 font-semibold text-[10px] tracking-wide">
          <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] animate-pulse"></span>
          Phụ huynh
        </span>
      </div>
    </div>
  </div>
</div>

<!-- Main Navigation List with Categorized Grouping -->
<nav class="flex-1 px-3 py-4 space-y-6 overflow-y-auto psb-scroll" data-purpose="main-navigation">
  
  <!-- Group 1: QUẢN LÝ & DỊCH VỤ -->
  <div class="space-y-1">
    <div class="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
      Quản lý &amp; Dịch vụ
    </div>

    <!-- 1. Trang chủ -->
    <a href="{% url 'frontend:parent_home' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'home' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'home' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">home</span>
        <span class="truncate">Trang chủ</span>
      </div>
      {% if active_tab == 'home' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>

    <!-- 2. Việc của tôi -->
    <a href="{% url 'frontend:parent_tasks' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'tasks' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'tasks' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">assignment</span>
        <span class="truncate">Việc của tôi</span>
      </div>
      {% if active_tab == 'tasks' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>

    <!-- 3. Nhật ký chăm sóc -->
    <a href="{% url 'frontend:parent_care_diary_history' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'diary' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'diary' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">auto_stories</span>
        <span class="truncate">Nhật ký chăm sóc</span>
      </div>
      {% if active_tab == 'diary' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>

    <!-- 4. Đăng việc ghép cặp (Special with High Contrast Badge) -->
    <a href="{% url 'frontend:dang_viec_select' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'matching' or active_tab == 'create' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-700 hover:bg-orange-50/70 hover:text-[#c2410c] group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl fill-icon text-[#F26522]">auto_awesome</span>
        <span class="truncate {% if active_tab == 'matching' or active_tab == 'create' %}font-bold text-[#c2410c]{% else %}group-hover:font-semibold transition-colors{% endif %}">Đăng việc ghép cặp</span>
      </div>
      <span class="px-2 py-0.5 rounded-full bg-[#F26522] text-white font-bold text-[10px] tracking-wide shadow-sm shadow-orange-500/20 shrink-0">MỚI</span>
    </a>

    <!-- 5. Ví credit -->
    <a href="{% url 'frontend:vi_credit' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'credit' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'credit' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">account_balance_wallet</span>
        <span class="truncate {% if active_tab == 'credit' %}font-bold text-[#c2410c]{% endif %}">Ví credit</span>
      </div>
      {% if active_tab == 'credit' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>
  </div>

  <!-- Group 2: HỖ TRỢ & HỆ THỐNG -->
  <div class="space-y-1">
    <div class="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 select-none">
      Hỗ trợ &amp; Hệ thống
    </div>

    <!-- 6. AI Trợ lý -->
    <a href="{% url 'frontend:chatbot' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'chatbot' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'chatbot' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">smart_toy</span>
        <span class="truncate">AI Trợ lý</span>
      </div>
      {% if active_tab == 'chatbot' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>

    <!-- 7. Hướng dẫn sử dụng -->
    <a href="/onboarding/parent/"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'help' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'help' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">help_outline</span>
        <span class="truncate">Hướng dẫn sử dụng</span>
      </div>
      {% if active_tab == 'help' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>

    <!-- 8. Cài đặt / Hồ sơ -->
    <a href="{% url 'frontend:parent_profile' %}"
       class="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all font-medium {% if active_tab == 'profile' or active_tab == 'settings' %}bg-orange-50/80 text-[#c2410c] font-semibold border-l-4 border-[#F26522] rounded-l-none pl-2.5 shadow-xs{% else %}text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 group{% endif %}">
      <div class="flex items-center gap-3 min-w-0">
        <span class="material-symbols-outlined text-xl {% if active_tab == 'profile' or active_tab == 'settings' %}fill-icon text-[#F26522]{% else %}text-slate-400 group-hover:text-slate-600 transition-colors{% endif %}">settings</span>
        <span class="truncate">Cài đặt</span>
      </div>
      {% if active_tab == 'profile' or active_tab == 'settings' %}
        <span class="w-1.5 h-1.5 rounded-full bg-[#F26522] shrink-0"></span>
      {% endif %}
    </a>
  </div>
</nav>

<!-- Bottom: User Profile Card & Safe Log out -->
<div class="p-3 border-t border-slate-200/90 space-y-2 bg-slate-50/50 shrink-0" data-purpose="sidebar-user-footer">
  <!-- Profile Interactive Capsule -->
  <a href="{% url 'frontend:parent_profile' %}"
     class="flex items-center justify-between p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/80 transition-all cursor-pointer shadow-xs group">
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="relative shrink-0">
        <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-sm ring-1 ring-white overflow-hidden">
          <img id="sidebar-avatar" alt="Avatar" class="w-full h-full object-cover"
               src="https://ui-avatars.com/api/?name=User&background=F26522&color=fff"/>
        </div>
        <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white"></span>
      </div>
      <div class="truncate min-w-0">
        <h4 id="sidebar-name" class="text-sm font-semibold text-slate-800 truncate group-hover:text-[#F26522] transition-colors">Đang tải...</h4>
        <p id="sidebar-subtitle" class="text-[11px] text-slate-500 truncate">Phụ huynh</p>
      </div>
    </div>
    <span class="material-symbols-outlined text-slate-400 group-hover:text-slate-600 text-lg shrink-0 transition-colors">chevron_right</span>
  </a>

  <!-- Safe Logout Button -->
  <button onclick="handleLogout()"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 text-xs font-medium transition-colors"
          type="button">
    <span class="material-symbols-outlined text-slate-400 group-hover:text-rose-500 text-base">logout</span>
    <span>Đăng xuất tài khoản</span>
  </button>
</div>

<!-- Self-healing script: Đảm bảo sidebar luôn có tên, avatar và logout trên mọi trang -->
<script>
  (function initParentSidebar() {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        const nameEl = document.getElementById('sidebar-name');
        const avtEl = document.getElementById('sidebar-avatar');
        const displayName = u.first_name || u.username || 'Phụ huynh';
        if (nameEl && (nameEl.textContent === 'Đang tải...' || !nameEl.textContent.trim())) {
          nameEl.textContent = displayName;
        }
        if (avtEl && u.avatar_url) {
          avtEl.src = u.avatar_url;
        } else if (avtEl && !avtEl.src.includes('ui-avatars')) {
          avtEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=F26522&color=fff`;
        }
      }
    } catch (e) {
      console.warn('Sidebar user auto-populate error:', e);
    }

    if (typeof window.handleLogout !== 'function') {
      window.handleLogout = function() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login/';
      };
    }
  })();
</script>
```

---

## 3. DANH SÁCH CÁC TRANG CẦN KIỂM TRA ĐỒNG BỘ (CROSS-PAGE AUDIT)

Để đảm bảo quy tắc **"Đã nâng cấp thì tất cả các trang đều phải hiển thị 1 sidebar giống hệt nhau về giao diện và chức năng"**, Coding Agent cần duyệt qua các template sau:

1. **`frontend/templates/frontend/parent_home.html`**:
   - Thẻ `<aside id="sidebar">`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='home' %}`.
   - Chiều rộng `<aside>` nên là `w-64` hoặc `w-[260px]` cố định.
2. **`frontend/templates/frontend/parent_tasks.html`**:
   - Thẻ `<aside id="sidebar">`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='tasks' %}`.
3. **`frontend/templates/frontend/parent_care_diary_history.html` & `parent_care_diary_detail.html`**:
   - Thẻ `<aside>`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='diary' %}`.
4. **`frontend/templates/frontend/vi_credit.html`**:
   - Thẻ `<aside>`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='credit' %}`.
5. **`frontend/templates/frontend/dang_viec_select.html` / `task_create_1.html` / `task_create_2.html`**:
   - Thẻ `<aside>`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='create' %}`.
6. **`frontend/templates/frontend/chatbot.html`**:
   - Thẻ `<aside>`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='chatbot' %}`.
7. **`frontend/templates/frontend/help_center.html`**:
   - Thẻ `<aside>`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='help' %}`.
8. **`frontend/templates/frontend/parent_profile.html`**:
   - Thẻ `<aside>`: đảm bảo gọi `{% include 'frontend/_parent_sidebar.html' with active_tab='profile' %}`.

---

## 4. TIÊU CHUẨN NGHIỆM THU (ACCEPTANCE CRITERIA)

Sau khi chỉnh sửa, hãy kiểm tra trên trình duyệt:
1. **Kiểm tra logo dự án:** Mọi trang đều hiển thị đúng ảnh `/static/images/logo.png` trong ô icon bo tròn cam.
2. **Kiểm tra phân nhóm menu:** Đủ 2 nhóm "Quản lý & Dịch vụ" và "Hỗ trợ & Hệ thống".
3. **Kiểm tra mục Ví credit:** Mục "Ví credit" luôn xuất hiện ở vị trí thứ 5 trong nhóm Quản lý & Dịch vụ trên tất cả các trang phụ huynh.
4. **Kiểm tra trạng thái Active:** Khi ở trang nào thì menu trang đó tự động có vạch viền cam bên trái, nền cam nhạt, chữ in đậm và có chấm cam bên phải.
5. **Kiểm tra Profile & Đăng xuất:**
   - Tên người dùng và avatar tự động hiển thị mượt mà.
   - Bấm vào Profile chuyển đến trang Cài đặt / Hồ sơ phụ huynh.
   - Bấm nút "Đăng xuất tài khoản" thực hiện xóa token và chuyển về trang đăng nhập an toàn.
