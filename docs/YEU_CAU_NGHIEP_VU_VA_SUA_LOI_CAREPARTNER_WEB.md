# ĐẶC TẢ NGHIỆP VỤ & HƯỚNG DẪN SỬA LỖI CAREPARTNER WEB (FLOW 1 & BUG FIXES)

> **Dành cho:** Coding Agent (Cursor / Claude Code / Windsurf / Copilot / Aider / Web Engineer...)  
> **Dự án:** EduCareLink Backend & Web Frontend (`educarelink-backend-4-12-2026`)  
> **Mục tiêu:** Hướng dẫn chi tiết nguyên nhân gốc rễ và giải pháp sửa chữa triệt để 5 vấn đề nghiệp vụ và lỗi kỹ thuật trên cổng CarePartner Web (`https://educarelink-backend.onrender.com`).  
> **Quy tắc an toàn:** Không sửa đổi phá vỡ API hiện tại, tuân thủ nghiêm ngặt mô hình ghép cặp **Flow 1 (Smart Matching Engine)**, bảo đảm tính toàn vẹn của mã nguồn.

---

## MỤC LỤC TỔNG QUAN

1. [Vấn đề 1: Sửa lỗi không hiển thị Lịch rảnh & Báo chồng lấn tại `/lich-ranh/`](#1-sửa-lỗi-không-hiển-thị-lịch-rảnh--báo-chồng-lấn-tại-lich-ranh)
2. [Vấn đề 2: Sửa lỗi Hồ sơ CarePartner báo "Không thể tải thông tin hồ sơ" tại `/worker/profile/`](#2-sửa-lỗi-hồ-sơ-carepartner-tại-workerprofile)
3. [Vấn đề 3: Sửa lỗi Trung tâm hỗ trợ hiển thị sai Sidebar Phụ huynh tại `/worker/help-center/`](#3-sửa-lỗi-trung-tâm-hỗ-trợ--sai-lệch-sidebar-tại-workerhelp-center)
4. [Vấn đề 4: Chuẩn hóa trang Tìm việc / Nhận đơn mới (`/worker/`) theo Flow 1](#4-chuẩn-hóa-trang-tìm-việc--nhận-đơn-mới-worker-theo-flow-1)
5. [Vấn đề 5: Chuẩn hóa trang Việc của tôi (`/worker/my-jobs/`) & Bổ sung Lịch làm việc](#5-chuẩn-hóa-trang-việc-của-tôi-workermy-jobs--bổ-sung-lịch-làm-việc)

---

## 1. SỬA LỖI KHÔNG HIỂN THỊ LỊCH RẢNH & BÁO CHỒNG LẤN TẠI `/lich-ranh/`

### 1.1. Hiện tượng lỗi:
- Người dùng truy cập [EduCareLink — Lịch rảnh làm việc](https://educarelink-backend.onrender.com/lich-ranh/).
- Phần "Lịch hiện tại" luôn hiển thị: *"Chưa có khung giờ nào. Thêm khung đầu tiên nhé!"* dù trong cơ sở dữ liệu đã có dữ liệu.
- Khi người dùng cố gắng thêm khung giờ mới, màn hình xuất hiện thông báo lỗi toast màu đỏ:
  > *"Khung giờ này chồng lấn khung đã có trong cùng ngày."*
- Người dùng bối rối vì không thấy khung giờ nào trên màn hình nhưng hệ thống lại báo bị trùng.

### 1.2. Nguyên nhân gốc rễ (Root Cause):
- **Tại file:** `frontend/templates/frontend/lich_ranh.html` (dòng 80 - 85):
  ```javascript
  const resp = await authFetch(API_BASE + '/matching/carepartners/me/availability/');
  const data = await resp.json();
  const rows = Array.isArray(data) ? data : (data.results || []);
  ```
- **Phía Backend:** Endpoint `GET /api/matching/carepartners/me/availability/` (trong file `matching/api/availability.py`, dòng 66) trả về cấu trúc chuẩn của Flow 1 Step 4:
  ```json
  {
    "windows": [
      {
        "id": "c8b1a234-...",
        "weekday": 0,
        "time_from": "18:00:00",
        "time_to": "21:00:00"
      }
    ]
  }
  ```
- **Xung đột:** Frontend chỉ kiểm tra `Array.isArray(data)` hoặc `data.results`. Vì backend trả về khóa `windows`, nên `rows` luôn bị đánh giá thành mảng rỗng `[]`.
- Hệ quả là:
  1. Hàm render coi như không có khung giờ nào -> Hiển thị thông báo rỗng.
  2. Người dùng chọn khung giờ muốn thêm (vốn dĩ đã tồn tại trong DB), backend kiểm tra `check_overlap_same_day` và trả về HTTP 400 Bad Request `overlap_windows`.

### 1.3. Hướng dẫn sửa chữa cho Coding Agent:
Trong file `frontend/templates/frontend/lich_ranh.html`, chỉnh sửa hàm `load()` như sau:

```javascript
// Sửa dòng 85 từ:
// const rows = Array.isArray(data) ? data : (data.results || []);
// Thành:
const rows = Array.isArray(data) ? data : (data.windows || data.results || []);
```

Đồng thời, nâng cấp bộ xử lý khi backend trả về lỗi trùng lấn ở sự kiện `addBtn.onclick` (dòng 122 - 125):
```javascript
if (resp.status === 201) {
    toast('Đã thêm khung giờ thành công!');
    load();
} else if (resp.status === 400) {
    const j = await resp.json().catch(() => ({}));
    if (j.code === 'overlap_windows' && j.merge_suggestion) {
        // Gợi ý gộp ca thông minh thay vì chỉ báo lỗi
        const s = j.merge_suggestion;
        const msg = `Khung giờ bị trùng. Bạn có muốn gộp thành ${s.time_from.slice(0, 5)} – ${s.time_to.slice(0, 5)} không?`;
        if (confirm(msg)) {
            // Gọi API cập nhật hoặc thêm khung đã gộp
            await authFetch(API_BASE + '/matching/carepartners/me/availability/', {
                method: 'POST',
                body: JSON.stringify({ weekday: s.weekday, time_from: s.time_from, time_to: s.time_to })
            });
            load();
        }
    } else {
        toast(j.detail || 'Không thêm được khung giờ.', false);
    }
}
```

---

## 2. SỬA LỖI HỒ SƠ CAREPARTNER TẠI `/worker/profile/`

### 2.1. Hiện tượng lỗi:
- Khi CarePartner đăng nhập và mở trang [Hồ sơ - EduCareLink](https://educarelink-backend.onrender.com/worker/profile/).
- Màn hình xuất hiện toast đỏ: *"Không thể tải thông tin hồ sơ. Vui lòng thử lại."*
- Trong một số trường hợp, toàn bộ nội dung biến mất và bị thay thế bằng màn hình *"Lỗi kết nối"*.

### 2.2. Nguyên nhân gốc rễ (Root Cause):
- **Tại file:** `frontend/templates/frontend/worker_profile.html` (dòng 1074 - 1165):
  Hàm `fetchProfileData()` bọc toàn bộ quá trình tải dữ liệu và gọi hàm `renderProfile(...)` trong một khối `try ... catch` khổng lồ:
  ```javascript
  try {
      profileResp = await apiFetch(API_BASE + "/profile/");
      ...
      let jobsData = [];
      const jobsResp = await apiFetch(API_BASE + "/worker/my-jobs/");
      if (jobsResp.ok) jobsData = await jobsResp.json();
      ...
      renderProfile(profileData, jobsData, ratingData);
  } catch (e) {
      console.error('Lỗi tải hồ sơ:', e);
      showToast('Không thể tải thông tin hồ sơ. Vui lòng thử lại.', 'error');
      document.getElementById('loading-state').innerHTML = `...`;
  }
  ```
- **Điểm gãy 1: Parse danh sách công việc (`jobsData`):**
  Trong `renderProfile()` (dòng 1266):
  ```javascript
  const completedJobs = jobs.filter(j => j.task_status === 'completed');
  ```
  Nếu endpoint `/api/worker/my-jobs/` trả về đối tượng phân trang `{ count: ..., results: [...] }` hoặc tài khoản CarePartner mới chưa có đơn (trả về đối tượng không phải Array thuần), lệnh `jobs.filter(...)` sẽ lập tức ném ngoại lệ `TypeError: jobs.filter is not a function`.
- **Điểm gãy 2: Thao tác DOM không an toàn (Null Element References):**
  Trong `renderProfile()`, các câu lệnh như `document.getElementById('stat-completed').textContent = ...`, `document.getElementById('info-phone').textContent = ...` không kiểm tra `null`. Nếu một phần tử HTML bị ẩn hoặc thay đổi ID giữa phiên bản web/mobile, JS sẽ ném lỗi `Cannot set properties of null`.
- Toàn bộ lỗi trên bị `catch (e)` bắt lại và bắn ra toast lỗi kết nối sai sự thật.

### 2.3. Hướng dẫn sửa chữa cho Coding Agent:
Trong `frontend/templates/frontend/worker_profile.html`:

1. **Chuẩn hóa dữ liệu đầu vào trước khi truyền vào `renderProfile`:**
   ```javascript
   // Đảm bảo jobsData luôn là một mảng an toàn
   let safeJobs = [];
   if (Array.isArray(jobsData)) {
       safeJobs = jobsData;
   } else if (jobsData && Array.isArray(jobsData.results)) {
       safeJobs = jobsData.results;
   }
   renderProfile(profileData, safeJobs, ratingData);
   ```

2. **Áp dụng Safe DOM Setter trong `renderProfile`:**
   Tạo hàm helper nhỏ để gán text an toàn:
   ```javascript
   function setElText(id, text) {
       const el = document.getElementById(id);
       if (el) el.textContent = text;
   }
   function setElSrc(id, src) {
       const el = document.getElementById(id);
       if (el) el.src = src;
   }
   ```
   Thay thế các dòng gán trực tiếp:
   ```javascript
   setElText('profile-name', fullName);
   setElSrc('profile-avatar', avatarUrl);
   setElSrc('sidebar-avatar', avatarUrl);
   setElSrc('mobile-avatar', avatarUrl);
   setElText('sidebar-name', fullName);
   setElText('sidebar-role', 'Carepartner');
   
   // Xử lý thống kê an toàn
   const safeJobsList = Array.isArray(jobs) ? jobs : [];
   const completedJobs = safeJobsList.filter(j => j && j.task_status === 'completed');
   setElText('stat-completed', completedJobs.length);

   const totalEarnings = completedJobs.reduce((sum, j) => sum + (parseFloat(j.task_price) || 0), 0);
   setElText('stat-earnings', formatCurrency(totalEarnings));

   setElText('info-phone', profile.phone_number || 'Chưa cập nhật');
   setElText('info-address', profile.address || 'Chưa cập nhật');
   setElText('info-email', profile.email || 'Chưa cập nhật');
   ```

---

## 3. SỬA LỖI TRUNG TÂM HỖ TRỢ & SAI LỆCH SIDEBAR TẠI `/worker/help-center/`

### 3.1. Hiện tượng lỗi:
- Khi CarePartner đang ở trang cá nhân `/worker/profile/` bấm vào liên kết **"Trung tâm hỗ trợ"** (trỏ đến `/worker/help-center/`).
- Màn hình tải xong thì thanh Sidebar bên trái biến thành **Sidebar của Phụ huynh**: hiển thị *"EduCareLink — Phụ huynh"*, các menu *"Đăng việc mới"*, *"Ví credit"*, làm lệch hoàn toàn luồng trải nghiệm của người dùng.

### 3.2. Nguyên nhân gốc rễ (Root Cause):
- **Tại file:** `frontend/templates/frontend/help_center.html` (dòng 195 - 197):
  ```html
  <!-- ===== DESKTOP SIDEBAR (hidden on mobile) ===== -->
  <aside id="sidebar" class="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] lg:bg-surface lg:border-r lg:border-border lg:z-40">
  {% include 'frontend/_parent_sidebar.html' with active_tab='help' %}
  </aside>
  ```
- File `help_center.html` đang bị **hardcode** nhúng `_parent_sidebar.html` cho mọi người dùng, kể cả khi route được gọi là `/worker/help-center/`.
- Trong hệ thống hiện tại chưa có file component dùng chung `frontend/templates/frontend/_worker_sidebar.html` như bên phụ huynh.

### 3.3. Hướng dẫn sửa chữa cho Coding Agent:

#### Bước 1: Tạo file component `frontend/templates/frontend/_worker_sidebar.html`
Trích xuất phần sidebar CarePartner chuẩn (đang nằm rải rác trong `worker_feed.html`, `worker_profile.html`) thành một partial template độc lập:

```html
{% load static %}
<!-- Sidebar CarePartner dùng chung -->
<aside class="sidebar fixed left-0 top-0 bottom-0 w-[260px] bg-white border-r border-gray-100 flex flex-col z-40 shadow-sm">
    <!-- Logo -->
    <div class="px-6 py-6 border-b border-gray-50">
        <a href="{% url 'frontend:worker_feed' %}" class="flex items-center gap-2">
            <img src="/static/images/logo.png" alt="EduCareLink" class="h-8 w-8 rounded-lg object-contain">
            <div>
                <span class="font-manrope font-extrabold text-xl text-textPrimary">Edu</span><span class="font-manrope font-extrabold text-xl text-secondary">Care</span><span class="font-manrope font-extrabold text-xl text-textPrimary">Link</span>
            </div>
        </a>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 px-4 py-6 sidebar-scroll overflow-y-auto">
        <p class="px-3 text-[11px] font-bold uppercase tracking-wider text-textSecondary/50 mb-3">Menu</p>
        <ul class="space-y-1">
            <li>
                <a href="{% url 'frontend:worker_feed' %}" class="nav-item flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold {% if active_tab == 'feed' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">search</span>
                    Tìm việc
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:worker_jobs' %}" class="nav-item flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold {% if active_tab == 'jobs' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">assignment</span>
                    Việc của tôi
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:worker_profile' %}" class="nav-item flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold {% if active_tab == 'profile' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">person</span>
                    Hồ sơ
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:worker_chatbot' %}" class="nav-item flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold {% if active_tab == 'chatbot' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">smart_toy</span>
                    AI Trợ lý
                </a>
            </li>
        </ul>

        <p class="px-3 text-[11px] font-bold uppercase tracking-wider text-textSecondary/50 mt-4 mb-2">Ghép cặp Flow 1</p>
        <ul class="space-y-1">
            <li>
                <a href="{% url 'frontend:don_cua_toi' %}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold {% if active_tab == 'match_bookings' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">auto_awesome</span>
                    Đơn ghép cặp
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:lich_ranh' %}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold {% if active_tab == 'availability' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">calendar_month</span>
                    Lịch rảnh ghép cặp
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:ngay_ban' %}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold {% if active_tab == 'blackouts' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">event_busy</span>
                    Ngày bận đột xuất
                </a>
            </li>
        </ul>

        <p class="px-3 text-[11px] font-bold uppercase tracking-wider text-textSecondary/50 mt-4 mb-2">Hỗ trợ & Thu nhập</p>
        <ul class="space-y-1">
            <li>
                <a href="{% url 'frontend:worker_earnings' %}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold {% if active_tab == 'earnings' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">payments</span>
                    Thu nhập
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:help_center' %}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold {% if active_tab == 'help' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">help_center</span>
                    Trung tâm hỗ trợ
                </a>
            </li>
            <li>
                <a href="{% url 'frontend:worker_complaints' %}" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold {% if active_tab == 'complaints' %}active{% else %}text-textSecondary hover:text-textPrimary{% endif %}">
                    <span class="material-symbols-outlined text-xl">report_problem</span>
                    Khiếu nại
                </a>
            </li>
        </ul>
    </nav>

    <!-- User snippet at bottom -->
    <div class="px-4 py-4 border-t border-gray-100">
        <div class="flex items-center gap-3 px-2">
            <div class="w-10 h-10 rounded-full overflow-hidden bg-primaryLight flex-shrink-0">
                <img id="sidebar-avatar" class="w-full h-full object-cover" src="https://ui-avatars.com/api/?name=W&background=F26522&color=fff"/>
            </div>
            <div class="flex-1 min-w-0">
                <p id="sidebar-name" class="font-semibold text-sm text-textPrimary truncate">Carepartner</p>
                <p class="text-xs text-textSecondary">Carepartner</p>
            </div>
            <button onclick="handleLogout()" class="w-9 h-9 rounded-lg hover:bg-red-50 flex items-center justify-center text-textSecondary hover:text-error transition-all duration-200" title="Đăng xuất">
                <span class="material-symbols-outlined text-xl">logout</span>
            </button>
        </div>
    </div>
</aside>
```

#### Bước 2: Cập nhật `help_center.html` để chọn đúng Sidebar:
Trong `frontend/templates/frontend/help_center.html`, kiểm tra context đường dẫn hoặc vai trò người dùng để render phù hợp:
```html
<aside id="sidebar" class="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-[260px] lg:z-40">
    {% if request.path|slice:":8" == "/worker/" %}
        {% include 'frontend/_worker_sidebar.html' with active_tab='help' %}
    {% else %}
        {% include 'frontend/_parent_sidebar.html' with active_tab='help' %}
    {% endif %}
</aside>
```
*(Nếu truy cập qua đường dẫn `/worker/help-center/`, hệ thống tự động render `_worker_sidebar.html`, bảo đảm tính nhất quán hoàn hảo).*

---

## 4. CHUẨN HÓA TRANG TÌM VIỆC / NHẬN ĐƠN MỚI (`/worker/`) THEO FLOW 1

### 4.1. Yêu cầu của người dùng:
> *"ở [Tìm việc - EduCareLink](https://educarelink-backend.onrender.com/worker/) là khi nào có người chọn thì mới hiển thị ra ở dashboard chứ không được hiển thị là chờ phụ huynh chọn và bấm xác nhận thôi"*

### 4.2. Phân tích nghiệp vụ Flow 1 (LOCKED MODEL: Auto-Commit & Direct Assignment):
1. **Mô hình Chợ tự do cũ (Legacy - Cần loại bỏ):**
   - Phụ huynh đăng task lên chợ.
   - CarePartner lướt qua hàng trăm task, bấm "Ứng tuyển" -> Rơi vào trạng thái "Chờ duyệt" mơ hồ.
2. **Mô hình Ghép cặp ELO Thông minh Flow 1 (Quy chuẩn hệ thống):**
   - CarePartner chỉ cần **Khai báo lịch rảnh** (`/lich-ranh/`).
   - Phụ huynh đăng bài toán chăm sóc -> Hệ thống chạy thuật toán ELO + GPS đề xuất Top 8 ứng viên.
   - Phụ huynh bấm **"Chọn"** một CarePartner cụ thể -> Đơn được tạo ngay lập tức với trạng thái `awaiting_commitment` (Chờ cam kết).
   - **Quy tắc cốt lõi:** *"Đã khai rảnh + Phụ huynh đã chọn = Giao việc trực tiếp"*.
   - CarePartner nhận được thông báo khẩn cấp và đơn xuất hiện ngay trên Dashboard `/worker/` với **Đồng hồ đếm ngược** (Commitment Countdown: từ 15 đến 60 phút tùy khoảng cách đến giờ làm).
   - Nếu CarePartner không hủy đơn trước khi hết giờ cam kết, hệ thống tự động chuyển đơn sang trạng thái `committed` (Sắp làm).

### 4.3. Cải tổ giao diện và logic trang `/worker/` (`worker_feed.html`):
1. **Loại bỏ danh sách việc "Chờ phụ huynh chọn":** Không hiển thị các task mở trên chợ tự do đòi hỏi nộp đơn chờ duyệt nữa.
2. **Khu vực trung tâm: "Đơn việc mới được giao (Cần cam kết)":**
   - Nếu có đơn ở trạng thái `awaiting_commitment` (`status === 'awaiting_commitment'`):
     + Hiển thị Banner/Card màu vàng hổ phách nổi bật trên cùng.
     + Tiêu đề: *"Phụ huynh [Tên phụ huynh] đã chọn bạn cho ca làm việc này!"*
     + Thời gian làm, địa điểm, thù lao chi tiết.
     + **Đồng hồ đếm ngược thời gian cam kết:** *"Thời gian suy nghĩ còn lại: MM:SS"*.
     + 2 Nút hành động:
       * Nút chính (Cam rực rỡ): **"Xác nhận cam kết nhận việc"** (`POST /api/matching/bookings/<id>/commit/` hoặc chuyển thẳng sang `committed`).
       * Nút phụ (Viền xám): **"Từ chối ca vì lý do bất khả kháng"** (Mở popup chọn lý do: Trùng lịch thi ở trường, ốm đột xuất...).
3. **Trạng thái sẵn sàng khi không có đơn chờ:**
   - Hiển thị Bảng điều khiển năng động:
     + Trạng thái: *"Đang sẵn sàng nhận việc theo lịch rảnh"* (Chấm xanh nhấp nháy).
     + Ca làm việc tiếp theo: Tóm tắt ca gần nhất sắp diễn ra.
     + Nút dẫn nhanh: *"Cập nhật thêm lịch rảnh để nhận thêm nhiều đơn"* trỏ đến `/lich-ranh/`.

---

## 5. CHUẨN HÓA TRANG VIỆC CỦA TÔI (`/worker/my-jobs/`) & BỔ SUNG LỊCH LÀM VIỆC

### 5.1. Yêu cầu của người dùng:
> *"ở [Việc của tôi - EduCareLink](https://educarelink-backend.onrender.com/worker/my-jobs/) thì bỏ cái chờ phụ huynh duyệt đi mà chỉ có sắp làm và lịch sử thôi kèm theo đó là lịch làm việc cho sinh viên"*

### 5.2. Hướng dẫn sửa chữa tại `worker_jobs.html`:

#### 1. Loại bỏ Tab "Chờ duyệt":
Xóa bỏ nút tab `#tab-pending` (dòng 252 - 256) và chỉ giữ lại 2 tab chính:
- **Tab 1: "Sắp làm" (`tab-upcoming` / `tab-accepted`):**
  - Trạng thái bao gồm: `committed` (Đã xác nhận ca) và `in_progress` (Đang thực hiện ca).
  - Thẻ công việc hiển thị:
    + Thông tin phụ huynh, bé/người được chăm sóc.
    + Giờ bắt đầu, địa chỉ chính xác kèm bản đồ chỉ đường.
    + Thù lao ca làm việc.
    + Các nút điều khiển trong ca:
      * **"Bắt đầu ca (Check-in GPS)"** (khi đến giờ làm).
      * **"Nhật ký chăm sóc / Báo cáo ca"**.
      * **"Báo động khẩn cấp SOS"**.
- **Tab 2: "Lịch sử" (`tab-completed`):**
  - Trạng thái bao gồm: `completed` (Đã hoàn tất) và `cancelled` (Đã hủy).
  - Hiển thị: Đánh giá số sao từ phụ huynh, nhận xét, số tiền thực nhận đã giải ngân, nút xem chi tiết đánh giá.

#### 2. Tích hợp Lịch làm việc trực quan cho sinh viên (Student Work Calendar View):
Thêm nút chuyển đổi chế độ xem: **[Dạng danh sách]** và **[Dạng Lịch biểu]**:
- Khi chọn **[Dạng Lịch biểu]**:
  - Hiển thị Lịch tuần với các ngày từ Thứ 2 đến Chủ nhật.
  - Các ca làm việc đã cam kết (`committed`) được thể hiện dưới dạng thẻ màu cam/xanh biển nằm đúng khung giờ trong ngày.
  - Giúp sinh viên dễ dàng đối chiếu với lịch học tập trên giảng đường, không lo bị quên ca hoặc trùng giờ thi cử.

---

## 6. DANH SÁCH FILE LIÊN QUAN & CHECKLIST KIỂM THỬ

| Tên File | Vai trò | Trạng thái cần thực hiện |
|---|---|---|
| `frontend/templates/frontend/lich_ranh.html` | Trang Lịch rảnh làm việc | Sửa `data.windows`, xử lý gợi ý gộp khung giờ `overlap_windows` |
| `frontend/templates/frontend/worker_profile.html` | Hồ sơ CarePartner | Thêm kiểm tra mảng `safeJobs`, bọc an toàn thao tác DOM |
| `frontend/templates/frontend/_worker_sidebar.html` | Component Sidebar CarePartner | Tạo mới để dùng chung |
| `frontend/templates/frontend/help_center.html` | Trung tâm hỗ trợ | Thay thế include `_parent_sidebar.html` bằng điều kiện linh hoạt |
| `frontend/templates/frontend/worker_feed.html` | Dashboard Tìm việc CarePartner | Chuyển sang hiển thị đơn mời Flow 1 (`awaiting_commitment`) |
| `frontend/templates/frontend/worker_jobs.html` | Việc của tôi | Bỏ tab Chờ duyệt, giữ Sắp làm + Lịch sử, thêm Lịch tuần |

### Checklist kiểm thử trước khi bàn giao:
- [ ] Vào `/lich-ranh/`, kiểm tra khung giờ đã thêm có hiển thị trên danh sách không. Thêm một khung giờ mới và kiểm tra không còn lỗi chồng lấn ảo.
- [ ] Vào `/worker/profile/`, kiểm tra không còn xuất hiện toast lỗi đỏ *"Không thể tải thông tin hồ sơ"*. Dữ liệu cá nhân và thống kê hiển thị đầy đủ.
- [ ] Từ `/worker/profile/`, bấm vào liên kết *"Trung tâm hỗ trợ"* (`/worker/help-center/`), xác nhận thanh Sidebar bên trái vẫn giữ nguyên giao diện của CarePartner, không bị biến thành Phụ huynh.
- [ ] Đăng nhập tài khoản sinh viên có đơn mới được phụ huynh chọn, kiểm tra Dashboard `/worker/` hiển thị đồng hồ đếm ngược và nút cam kết.
- [ ] Vào `/worker/my-jobs/`, xác nhận chỉ còn 2 tab *"Sắp làm"* và *"Lịch sử"*, không còn tab *"Chờ duyệt"*.
