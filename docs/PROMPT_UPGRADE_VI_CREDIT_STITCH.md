# NHIỆM VỤ CODING AGENT: NÂNG CẤP GIAO DIỆN VÍ CREDIT ĐỀN BÙ THEO THIẾT KẾ STITCH

> **Dành cho:** Coding Agent (Cursor / Claude Code / Windsurf / Copilot / Aider...)  
> **Dự án:** EduCareLink (Django 5.2 + Django Templates + Tailwind CSS)  
> **File cần sửa đổi duy nhất:** `frontend/templates/frontend/vi_credit.html`  
> **Nguồn cảm hứng thiết kế:** Thiết kế UI HTML từ Google Stitch (Ví credit đền bù | EduCareLink Phụ Huynh)  
> **Nguyên tắc cốt lõi:**  
> 1. Sử dụng đúng logo dự án: `/static/images/logo.png` và favicon `/static/images/favicon-32.png` (BẮT BUỘC).  
> 2. Giữ nguyên cơ chế gọi API và xác thực: Tận dụng `{% include 'frontend/_matching_common.html' %}` để có sẵn `authFetch` (JWT tự refresh), `fmtVND`, `toast`.  
> 3. Tích hợp dữ liệu thật từ API `GET /api/matching/credits/balance/` (không để dữ liệu hardcode tĩnh).  
> 4. Giữ đầy đủ tính năng tương tác của thiết kế Stitch: Bộ lọc 3 tab (Tất cả / Đã nhận / Đã sử dụng), nút làm mới số dư, modal quy chế đền bù T0–T6, trạng thái rỗng (empty state).  
> 5. Đồng bộ sidebar chuẩn với toàn bộ hệ thống qua `{% include 'frontend/_parent_sidebar.html' with active_tab='credit' %}` hoặc cấu trúc sidebar desktop chuẩn có liên kết động Django (`{% url 'frontend:parent_home' %}`, `{% url 'frontend:vi_credit' %}`).

---

## 1. PHÂN TÍCH HIỆN TRẠNG VÀ THIẾT KẾ MỚI

### Hiện trạng (`frontend/templates/frontend/vi_credit.html` cũ):
- Giao diện đơn cột hẹp (`max-w-2xl mx-auto`), nền cam gradient đơn giản, chưa có sidebar phụ huynh.
- Danh sách lịch sử hiển thị đơn điệu, chưa có bộ lọc phân loại Đã nhận / Đã trừ.
- Chưa có các khối thông tin hỗ trợ như: Cam kết bảo đảm chất lượng CarePartner, modal tra cứu quy chế hoàn tiền, badge trạng thái hoạt động.

### Thiết kế mới từ Stitch:
- **Bố cục Dashboard chuẩn Phụ huynh:** Sidebar cố định bên trái (Desktop) + Header điều hướng có nút quay lại Trang chủ, tiêu đề trang và badge `Flow 1` có chấm xanh nhấp nháy.
- **Card Số dư (Wallet Balance Card):** Thẻ trắng thanh lịch với đường viền gradient cam-hổ phách ở đỉnh (`bg-gradient-to-r from-orange-500 via-amber-400 to-orange-400`), badge "Đang hoạt động", số dư lớn hiển thị rõ ràng, thời gian cập nhật + nút "Làm mới", 2 nút CTA "Dùng khi đăng việc mới" và "Xem quy chế hoàn tiền & đền bù", thanh micro-status giải thích tỷ lệ quy đổi 1 Credit = 1 VNĐ.
- **Banner giải thích Credit (Explanatory Banner):** Nhẹ nhàng, tông màu hổ phách dịu mát với nút đóng.
- **Bảng biến động Credit (Transaction History):**
  + Segmented Controller 3 tab: **Tất cả (N)**, **Đã nhận (+)**, **Đã sử dụng (-)**.
  + Mỗi hàng giao dịch hiển thị icon màu (Xanh ngọc cho cộng, Đỏ hồng cho trừ), loại giao dịch, mã đơn/mã giao dịch, thời gian chi tiết, số tiền (+/-), và số dư sau giao dịch.
  + Trạng thái rỗng (Empty State) hiển thị sinh động khi không có giao dịch phù hợp với bộ lọc.
  + Thanh phân trang và thống kê số lượng hiển thị ở chân bảng.
- **Khối cam kết (Trust & Guarantee Card):** Cam kết đền bù tự động qua Ví credit trong 15 phút nếu CarePartner vi phạm.

---

## 2. ĐẶC TẢ DỮ LIỆU BACKEND (API CONTRACT)

### Endpoint: `GET /api/matching/credits/balance/`
* Yêu cầu Header: `Authorization: Bearer <access_token>` (hàm `authFetch` trong `_matching_common.html` tự động đính kèm).
* Response mẫu:
```json
{
  "credit_vnd": 900000,
  "updated_at": "2026-09-10T02:44:47+07:00",
  "history": [
    {
      "id": "e4b11f32-8821-4f10-b992-1c238fa091ab",
      "booking_id": "7295f468-08dd-41a6-800c-1c481de46a9e",
      "amount_vnd": 900000,
      "kind": "platform_credit",
      "status": "issued",
      "issued_at": "2026-09-10T02:44:47+07:00",
      "note": "Nạp credit dùng thử dịch vụ ghép cặp"
    },
    {
      "id": "a1c22d44-9912-4077-8468-2d334eb048fd",
      "booking_id": "84c0127b-cd92-4077-8468-e38eb048fd36",
      "amount_vnd": -150000,
      "kind": "service_fee_offset",
      "status": "used",
      "issued_at": "2026-09-05T14:20:10+07:00",
      "note": "Trừ credit thanh toán đơn việc #8840"
    }
  ]
}
```

### Quy tắc ánh xạ phân loại (Kind Mapping):
* `kind === 'service_fee_offset'` hoặc `amount_vnd < 0`: Là giao dịch **Đã sử dụng (`expense`)**.
  - Icon: `shopping_cart_checkout` hoặc `remove_circle_outline`.
  - Màu sắc: Màu hồng đỏ (`text-rose-600`, `bg-rose-50`, `border-rose-100`).
  - Badge: `Đã trừ`.
* `kind === 'platform_credit'` hoặc `amount_vnd >= 0`: Là giao dịch **Đã nhận (`income`)**.
  - Icon: `add_card` hoặc `verified_user`.
  - Màu sắc: Màu xanh ngọc (`text-emerald-600`, `bg-emerald-50`, `border-emerald-100`).
  - Badge: `Đã cộng` hoặc `Bảo hiểm lịch`.
* Tên hiển thị loại giao dịch:
  ```javascript
  const KIND_TITLES = {
    platform_credit: 'Hoàn tiền đền bù dịch vụ',
    service_fee_offset: 'Trừ credit thanh toán đăng việc',
    admin_adjust: 'Điều chỉnh bởi Quản trị viên',
    t0: 'Đền bù hủy rất sớm (T0)',
    t1: 'Đền bù hủy sớm (T1)',
    t2: 'Đền bù hủy trước 24h (T2)',
    t3: 'Đền bù hủy trước giờ làm (T3)',
    t4: 'Đền bù hủy sát giờ (T4)',
    t5: 'Đền bù đối tác không đến làm (T5)',
    t6: 'Đền bù vi phạm nghiêm trọng (T6)',
    replacement: 'Đền bù bảo hiểm tìm người thay thế',
  };
  ```

---

## 3. MÃ NGUỒN HOÀN CHỈNH THAY THẾ CHO `frontend/templates/frontend/vi_credit.html`

Coding Agent hãy thay thế **TOÀN BỘ** nội dung của file `frontend/templates/frontend/vi_credit.html` bằng đoạn mã dưới đây:

```html
{% load static %}
<!DOCTYPE html>
<html class="h-full bg-slate-50" lang="vi">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <link rel="icon" type="image/png" sizes="32x32" href="/static/images/favicon-32.png">
  <link rel="icon" type="image/x-icon" href="/static/images/favicon.ico">
  <title>Ví credit đền bù | EduCareLink Phụ Huynh</title>

  <!-- Google Fonts: Manrope (Headings) & Plus Jakarta Sans (Body) -->
  <link href="https://fonts.googleapis.com" rel="preconnect"/>
  <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <!-- Material Symbols Outlined -->
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet"/>
  
  <!-- Tailwind CSS v3 with Plugins -->
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            heading: ['Manrope', 'sans-serif'],
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
          },
          colors: {
            brand: {
              50: '#fff7ed',
              100: '#ffedd5',
              200: '#fed7aa',
              500: '#F26522', /* EduCareLink Core Orange */
              600: '#ea580c',
              700: '#c2410c',
            }
          }
        }
      }
    }
  </script>

  <style data-purpose="base-typography">
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      color: #1E293B;
      background-color: #F8FAFC;
    }
    h1, h2, h3, h4, .font-heading {
      font-family: 'Manrope', sans-serif;
    }
    .material-symbols-outlined {
      font-variation-settings: 'FILL' 0, 'wght' 450, 'GRAD' 0, 'opsz' 22;
      vertical-align: middle;
    }
    .material-symbols-outlined.fill-icon {
      font-variation-settings: 'FILL' 1, 'wght' 450, 'GRAD' 0, 'opsz' 22;
    }
    /* Subtle scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  </style>

  {% include 'frontend/_matching_common.html' %}
</head>
<body class="h-full antialiased text-slate-800 flex overflow-hidden">

<!-- BEGIN: Desktop Sidebar -->
<aside class="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col justify-between shrink-0 h-full select-none z-20" data-purpose="desktop-sidebar">
  {% include 'frontend/_parent_sidebar.html' with active_tab='credit' %}
</aside>
<!-- END: Desktop Sidebar -->

<!-- BEGIN: Main Page Area -->
<div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#F8FAFC]">
  
  <!-- BEGIN: Top Navigation Bar -->
  <header class="h-16 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between shrink-0 z-10" data-purpose="top-header">
    <div class="flex items-center gap-4 sm:gap-5">
      <a class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-600 transition-colors group" href="{% url 'frontend:parent_home' %}">
        <span class="material-symbols-outlined text-slate-400 group-hover:-translate-x-0.5 group-hover:text-brand-500 transition-transform">arrow_back</span>
        <span class="hidden sm:inline">Trang chủ</span>
      </a>
      <div class="h-4 w-px bg-slate-200 hidden sm:block"></div>
      <h1 class="text-base sm:text-lg font-heading font-bold text-slate-900">Ví credit đền bù</h1>
    </div>

    <!-- Right Actions -->
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-brand-600 border border-orange-200/70">
        <span class="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
        Flow 1
      </span>
      <button onclick="openPolicyModal()" class="p-2 text-slate-400 hover:text-brand-600 hover:bg-orange-50 rounded-lg transition-colors" title="Trợ giúp về Quy chế Credit" type="button">
        <span class="material-symbols-outlined">help</span>
      </button>
    </div>
  </header>
  <!-- END: Top Navigation Bar -->

  <!-- BEGIN: Scrollable Content Viewport -->
  <main class="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-7 mcm-fade-in">
    <div class="max-w-4xl mx-auto space-y-6">

      <!-- BEGIN: Wallet Summary & Quick Action Card -->
      <section class="relative overflow-hidden rounded-2xl bg-white border border-slate-200/90 shadow-sm" data-purpose="wallet-balance-card">
        <div class="h-1.5 w-full bg-gradient-to-r from-orange-500 via-amber-400 to-orange-400"></div>
        <div class="p-6 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-6">
          
          <!-- Balance Info -->
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Số dư credit khả dụng</span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200/60">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Đang hoạt động
              </span>
            </div>

            <!-- Amount display -->
            <div class="flex items-baseline gap-2">
              <span id="balance" class="text-4xl sm:text-5xl font-heading font-extrabold text-slate-900 tracking-tight">
                0<span class="text-2xl sm:text-3xl font-bold text-slate-600 ml-0.5">đ</span>
              </span>
            </div>

            <!-- Timestamp & refresh button -->
            <div class="flex items-center gap-2 text-xs text-slate-400 pt-1">
              <span class="material-symbols-outlined text-[15px] text-slate-400">schedule</span>
              <span id="updatedAt">Đang đồng bộ dữ liệu…</span>
              <button onclick="load(true)" class="ml-1 text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-0.5 font-medium cursor-pointer" title="Làm mới số dư" type="button">
                <span id="refreshIcon" class="material-symbols-outlined text-xs">refresh</span> Làm mới
              </button>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="flex flex-col sm:flex-row md:flex-col items-stretch gap-2.5 sm:w-auto shrink-0 md:min-w-[210px]">
            <a class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm shadow-sm transition-all shadow-orange-500/20 active:scale-[0.99]" href="{% url 'frontend:dang_viec_select' %}">
              <span class="material-symbols-outlined text-lg">add_task</span>
              <span>Dùng khi đăng việc mới</span>
            </a>
            <button onclick="openPolicyModal()" class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-slate-600 hover:text-brand-600 hover:bg-slate-50 border border-slate-200 text-xs font-medium transition-colors" type="button">
              <span class="material-symbols-outlined text-base">policy</span>
              <span>Xem quy chế hoàn tiền &amp; đền bù</span>
            </button>
          </div>
        </div>

        <!-- Micro-status bottom band -->
        <div class="px-6 py-2.5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-brand-500 text-base">lock_clock</span>
            <span>Credit không có hạn sử dụng và tự động áp dụng khi thanh toán việc mới</span>
          </div>
          <span class="text-slate-400">Tỷ lệ quy đổi: 1 Credit = 1 VNĐ</span>
        </div>
      </section>
      <!-- END: Wallet Summary -->

      <!-- BEGIN: Explanatory Banner -->
      <section id="explanation-banner" class="rounded-xl bg-amber-50/70 border border-amber-200/70 p-4 transition-all" data-purpose="credit-explanation-banner">
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
            <span class="material-symbols-outlined text-lg">info</span>
          </div>
          <div class="flex-1 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <p>
              <strong class="font-semibold text-slate-900">Credit là gì?</strong> Credit là khoản tiền hoàn đền bù bảo vệ quyền lợi phụ huynh trong hệ sinh thái <strong>EduCareLink</strong> khi CarePartner hủy hẹn hoặc vi phạm ca làm. Số dư này là <em>credit ảo</em> (không rút tiền mặt) và được <strong class="text-slate-900 font-semibold">tự động khấu trừ trực tiếp</strong> vào chi phí dịch vụ khi bạn đăng việc mới.
            </p>
          </div>
          <button onclick="dismissBanner()" class="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors" title="Ẩn ghi chú này" type="button">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </section>
      <!-- END: Explanatory Banner -->

      <!-- BEGIN: Transaction History Section -->
      <section class="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden" data-purpose="transaction-history-container">
        
        <!-- Card Header & Filter Tabs -->
        <div class="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-base sm:text-lg font-heading font-bold text-slate-900 flex items-center gap-2">
              <span class="material-symbols-outlined text-slate-600">history</span>
              <span>Lịch sử biến động credit</span>
            </h2>
            <p class="text-xs text-slate-400 mt-0.5">Xem tất cả các lần bồi hoàn và sử dụng credit của bạn</p>
          </div>

          <!-- Segmented Filter Controller -->
          <div class="flex items-center p-1 bg-slate-100/90 rounded-xl self-start sm:self-auto text-xs font-medium">
            <button class="tab-btn px-3 py-1.5 rounded-lg bg-white text-slate-900 font-semibold shadow-xs transition-all" id="tab-all" onclick="filterTransactions('all')" type="button">
              Tất cả (<span id="count-all">0</span>)
            </button>
            <button class="tab-btn px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all" id="tab-in" onclick="filterTransactions('income')" type="button">
              Đã nhận (<span id="count-in">0</span>)
            </button>
            <button class="tab-btn px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-all" id="tab-out" onclick="filterTransactions('expense')" type="button">
              Đã dùng (<span id="count-out">0</span>)
            </button>
          </div>
        </div>

        <!-- Transaction List Items Container -->
        <div class="divide-y divide-slate-100" id="transaction-list">
          <div class="p-10 text-center text-slate-400 text-sm">
            <span class="material-symbols-outlined text-3xl animate-spin text-brand-500 mb-2">progress_activity</span>
            <p>Đang tải lịch sử giao dịch...</p>
          </div>
        </div>

        <!-- Interactive Empty State -->
        <div class="hidden p-12 text-center" id="empty-state">
          <div class="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <span class="material-symbols-outlined text-3xl">receipt_long</span>
          </div>
          <h4 class="font-heading font-bold text-slate-800 text-base">Chưa có biến động credit nào</h4>
          <p class="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Khi có phát sinh đền bù ca làm, hoàn tiền hoặc thanh toán bằng ví credit, chi tiết giao dịch sẽ tự động hiển thị tại đây.
          </p>
        </div>

        <!-- Bottom Footer Summary -->
        <div class="p-4 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span id="footer-count">Đang tính toán...</span>
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Hệ thống hạch toán tự động tức thời</span>
          </div>
        </div>
      </section>
      <!-- END: Transaction History Section -->

      <!-- BEGIN: Trust & Guarantee Card -->
      <section class="p-5 rounded-2xl bg-white border border-slate-200 flex items-start gap-4 shadow-xs" data-purpose="safety-guarantee-note">
        <div class="w-10 h-10 rounded-xl bg-orange-100/70 text-brand-600 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-xl">verified</span>
        </div>
        <div class="flex-1 space-y-1">
          <h3 class="font-heading font-bold text-sm text-slate-900">Cam kết bảo đảm quyền lợi phụ huynh</h3>
          <p class="text-xs text-slate-500 leading-relaxed">
            Mọi phiên làm việc bị CarePartner hủy đột ngột, đến trễ quá 15 phút hoặc không đến làm đều được EduCareLink tự động bồi hoàn qua Ví credit theo chính sách bảo vệ T0–T6 trong vòng tối đa 15 phút sau khi ghi nhận.
          </p>
        </div>
        <button onclick="openPolicyModal()" class="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline hidden sm:inline-flex items-center gap-0.5" type="button">
          Chi tiết cam kết <span class="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </section>
      <!-- END: Trust & Guarantee Card -->

    </div>
  </main>
  <!-- END: Scrollable Content Viewport -->
</div>
<!-- END: Main Page Area -->

<!-- BEGIN: Policy Modal (Quy chế đền bù T0–T6) -->
<div id="policyModal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs hidden flex items-center justify-center p-4">
  <div class="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-4">
    <div class="flex items-center justify-between border-b border-slate-100 pb-3">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-brand-500 text-xl">policy</span>
        <h3 class="font-heading font-bold text-base text-slate-900">Quy chế đền bù &amp; Hoàn tiền (T0–T6)</h3>
      </div>
      <button onclick="closePolicyModal()" class="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div class="text-xs text-slate-600 space-y-3 leading-relaxed">
      <p>Hệ thống tự động áp dụng các bậc đền bù khi CarePartner hủy đơn đã chốt:</p>
      <div class="space-y-2">
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
          <strong class="text-slate-900 font-semibold">T0 &amp; T1 (Hủy sớm khi còn &gt; 48 giờ):</strong>
          <p class="text-slate-500 mt-0.5">Không phạt tiền, hệ thống tự động đưa đơn vào luồng ghép cặp tìm người thay thế mới.</p>
        </div>
        <div class="p-2.5 rounded-xl bg-orange-50/50 border border-orange-100">
          <strong class="text-slate-900 font-semibold">T2 &amp; T3 (Hủy trước ca làm 3h – 24h):</strong>
          <p class="text-slate-500 mt-0.5">CarePartner bị trừ điểm tín nhiệm ELO; phụ huynh được đền bù 20% giá trị đơn hàng vào ví credit.</p>
        </div>
        <div class="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100">
          <strong class="text-slate-900 font-semibold">T4 &amp; T5 (Hủy sát giờ &lt; 3h hoặc Không đến làm - No Show):</strong>
          <p class="text-slate-500 mt-0.5">Phụ huynh được đền bù từ 30% đến 50% giá trị đơn (sàn tối thiểu 50.000đ cho T5). Toàn bộ credit được cộng ngay lập tức vào ví.</p>
        </div>
      </div>
      <div class="p-3 bg-amber-50 rounded-xl text-amber-800 text-[11px]">
        <strong>Lưu ý quan trọng:</strong> Credit là số dư bảo lưu trên nền tảng, không có thời hạn sử dụng và tự động trừ vào bất kỳ đơn đăng việc mới nào trong tương lai.
      </div>
    </div>
    <div class="pt-2 flex justify-end">
      <button onclick="closePolicyModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors" type="button">
        Đã hiểu
      </button>
    </div>
  </div>
</div>
<!-- END: Policy Modal -->

<!-- BEGIN: Interactivity Script -->
<script>
  let rawTransactions = [];
  let currentFilter = 'all';

  const KIND_TITLES = {
    platform_credit: 'Đền bù bảo vệ phụ huynh',
    service_fee_offset: 'Trừ credit thanh toán việc',
    admin_adjust: 'Điều chỉnh bởi Quản trị viên',
    t0: 'Hủy rất sớm (T0)',
    t1: 'Hủy sớm (T1)',
    t2: 'Đền bù hủy ca trước 24h (T2)',
    t3: 'Đền bù hủy ca trước giờ làm (T3)',
    t4: 'Đền bù hủy sát ca làm (T4)',
    t5: 'Đền bù đối tác không đến làm (T5)',
    t6: 'Đền bù vi phạm nghiêm trọng (T6)',
    replacement: 'Đền bù bảo hiểm tìm người thay thế',
  };

  async function load(isRefresh = false) {
    const refreshIcon = document.getElementById('refreshIcon');
    if (isRefresh && refreshIcon) {
      refreshIcon.classList.add('animate-spin');
    }

    try {
      const resp = await authFetch(API_BASE + '/matching/credits/balance/');
      if (!resp.ok) {
        if (resp.status === 403) {
          toast('Ví credit chỉ khả dụng cho tài khoản Phụ huynh.', false);
        } else {
          toast('Không tải được ví credit. Vui lòng thử lại sau.', false);
        }
        return;
      }

      const data = await resp.json();
      
      // Update Balance display
      const balanceEl = document.getElementById('balance');
      const formatted = (Number(data.credit_vnd) || 0).toLocaleString('vi-VN');
      balanceEl.innerHTML = `${formatted}<span class="text-2xl sm:text-3xl font-bold text-slate-600 ml-0.5">đ</span>`;

      // Update Timestamp
      const dateObj = data.updated_at ? new Date(data.updated_at) : new Date();
      document.getElementById('updatedAt').textContent = 
        'Cập nhật lúc: ' + dateObj.toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'}) +
        ' • ' + dateObj.toLocaleDateString('vi-VN');

      // Update Transactions List
      rawTransactions = data.history || [];
      renderTransactions();

      if (isRefresh) {
        toast('Đã làm mới số dư thành công!', true);
      }
    } catch (err) {
      console.error(err);
      toast('Lỗi kết nối mạng khi tải ví credit.', false);
    } finally {
      if (refreshIcon) {
        setTimeout(() => refreshIcon.classList.remove('animate-spin'), 400);
      }
    }
  }

  function renderTransactions() {
    const listEl = document.getElementById('transaction-list');
    const emptyEl = document.getElementById('empty-state');
    
    // Count calculations
    let inCount = 0;
    let outCount = 0;

    rawTransactions.forEach(t => {
      const isExpense = t.kind === 'service_fee_offset' || Number(t.amount_vnd) < 0;
      if (isExpense) outCount++;
      else inCount++;
    });

    document.getElementById('count-all').textContent = rawTransactions.length;
    document.getElementById('count-in').textContent = inCount;
    document.getElementById('count-out').textContent = outCount;

    // Filter items
    const filtered = rawTransactions.filter(t => {
      const isExpense = t.kind === 'service_fee_offset' || Number(t.amount_vnd) < 0;
      if (currentFilter === 'income') return !isExpense;
      if (currentFilter === 'expense') return isExpense;
      return true;
    });

    // Update footer count
    document.getElementById('footer-count').textContent = 
      `Hiển thị ${filtered.length} trên ${rawTransactions.length} giao dịch`;

    listEl.innerHTML = '';

    if (filtered.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');

    filtered.forEach(t => {
      const isExpense = t.kind === 'service_fee_offset' || Number(t.amount_vnd) < 0;
      const absAmount = Math.abs(Number(t.amount_vnd) || 0).toLocaleString('vi-VN');
      const timeStr = t.issued_at ? new Date(t.issued_at).toLocaleString('vi-VN') : '—';
      const title = KIND_TITLES[t.kind] || t.kind || 'Biến động credit';
      const shortId = t.booking_id ? `#BK-${t.booking_id.substring(0, 6)}` : (t.id ? `#TX-${t.id.substring(0, 6)}` : '#ECL');
      const noteText = t.note ? ` • ${t.note}` : '';

      const article = document.createElement('article');
      article.className = 'transaction-row p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 sm:gap-4';
      article.setAttribute('data-type', isExpense ? 'expense' : 'income');

      if (isExpense) {
        article.innerHTML = `
          <div class="flex items-center gap-3 sm:gap-4 min-w-0">
            <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-lg sm:text-xl">shopping_cart_checkout</span>
            </div>
            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-heading font-bold text-xs sm:text-sm text-slate-900 truncate">${title}</h3>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600">Đã trừ</span>
              </div>
              <p class="text-xs text-slate-500 truncate">Mã đơn: <span class="font-mono text-slate-600">${shortId}</span>${noteText}</p>
              <p class="text-[11px] text-slate-400">${timeStr}</p>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-heading font-extrabold text-sm sm:text-lg text-rose-600 tracking-tight">
              -${absAmount}đ
            </div>
            <span class="text-[10px] sm:text-[11px] text-slate-400">Đã thanh toán</span>
          </div>
        `;
      } else {
        article.innerHTML = `
          <div class="flex items-center gap-3 sm:gap-4 min-w-0">
            <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-lg sm:text-xl">add_card</span>
            </div>
            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-heading font-bold text-xs sm:text-sm text-slate-900 truncate">${title}</h3>
                <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-medium bg-emerald-50 text-emerald-700">Đã cộng</span>
              </div>
              <p class="text-xs text-slate-500 truncate">Mã giao dịch: <span class="font-mono text-slate-600">${shortId}</span>${noteText}</p>
              <p class="text-[11px] text-slate-400">${timeStr}</p>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="font-heading font-extrabold text-sm sm:text-lg text-emerald-600 tracking-tight">
              +${absAmount}đ
            </div>
            <span class="text-[10px] sm:text-[11px] text-slate-400">Khả dụng ngay</span>
          </div>
        `;
      }

      listEl.appendChild(article);
    });
  }

  function filterTransactions(type) {
    currentFilter = type;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.classList.remove('bg-white', 'text-slate-900', 'font-semibold', 'shadow-xs');
      tab.classList.add('text-slate-600');
    });

    if (type === 'all') {
      document.getElementById('tab-all').classList.add('bg-white', 'text-slate-900', 'font-semibold', 'shadow-xs');
      document.getElementById('tab-all').classList.remove('text-slate-600');
    } else if (type === 'income') {
      document.getElementById('tab-in').classList.add('bg-white', 'text-slate-900', 'font-semibold', 'shadow-xs');
      document.getElementById('tab-in').classList.remove('text-slate-600');
    } else if (type === 'expense') {
      document.getElementById('tab-out').classList.add('bg-white', 'text-slate-900', 'font-semibold', 'shadow-xs');
      document.getElementById('tab-out').classList.remove('text-slate-600');
    }

    renderTransactions();
  }

  function dismissBanner() {
    const banner = document.getElementById('explanation-banner');
    if (banner) {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-6px)';
      setTimeout(() => banner.remove(), 250);
    }
  }

  function openPolicyModal() {
    document.getElementById('policyModal').classList.remove('hidden');
  }

  function closePolicyModal() {
    document.getElementById('policyModal').classList.add('hidden');
  }

  // Khởi chạy khi load trang
  load();
</script>
</body>
</html>
```

---

## 4. CÁC ĐIỂM KIỂM TRA & NGHIỆM THU (VERIFICATION CHECKLIST)

Sau khi Coding Agent cập nhật mã nguồn vào `frontend/templates/frontend/vi_credit.html`, hãy thực hiện kiểm tra các tiêu chí sau:

1. **Kiểm tra cú pháp Django template:**
   - Đảm bảo các thẻ `{% load static %}`, `{% include 'frontend/_matching_common.html' %}`, `{% url 'frontend:parent_home' %}`, `{% url 'frontend:dang_viec_select' %}` đều hợp lệ và không gây lỗi TemplateSyntaxError.
2. **Kiểm tra logo dự án:**
   - Ảnh logo hiển thị chuẩn từ `/static/images/logo.png` và favicon từ `/static/images/favicon-32.png`.
3. **Kiểm tra tương tác giao diện:**
   - Mở trình duyệt truy cập đường dẫn `/vi-credit/` (với tài khoản Phụ huynh):
     + Số dư hiển thị đúng số tiền credit khả dụng (VNĐ).
     + Nút **Làm mới** xoay icon và hiển thị thông báo toast thành công.
     + Chuyển đổi qua lại giữa 3 tab **Tất cả**, **Đã nhận**, **Đã dùng** hoạt động mượt mà và cập nhật số lượng badge chính xác.
     + Bấm **Xem quy chế hoàn tiền & đền bù** mở modal thông tin T0–T6 chuẩn xác.
     + Bấm nút ẩn banner giải thích đóng banner với hiệu ứng mượt mà.
