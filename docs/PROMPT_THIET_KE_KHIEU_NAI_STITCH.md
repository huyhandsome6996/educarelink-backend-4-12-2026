# PROMPT THIẾT KẾ GOOGLE STITCH: TRUNG TÂM KHIẾU NẠI & BẢO VỆ QUYỀN LỢI CAREPARTNER

> **Mục tiêu:** Tạo bản thiết kế HTML/CSS hoàn chỉnh từ Google Stitch cho trang **"Trung tâm Khiếu nại & Bảo vệ Quyền lợi CarePartner"** tại đường dẫn `/worker/complaints/` trên nền tảng EduCareLink.  
> **Phong cách:** High-trust, Pháp lý nhân văn, Minh bạch, Bảo mật cao, An tâm cho sinh viên và người lao động.  
> **Ngôn ngữ UI:** Tiếng Việt (100% chuẩn quy chế bảo vệ lao động EduCareLink).  
> **File đích trong dự án:** `frontend/templates/frontend/worker_complaints.html`

---

## 1. BỐI CẢNH & TÂM LÝ NGƯỜI DÙNG

### 1.1. Thực trạng trang hiện tại (`worker_complaints.html`):
- Giao diện đơn điệu, chỉ có 1 form thô ráp và 1 danh sách text nghèo nàn, không có sidebar đồng bộ với portal CarePartner.
- Tạo cảm giác "gửi khiếu nại vào hư không" (Black hole effect): Người dùng không biết sau khi gửi thì ai sẽ xử lý, trong bao lâu sẽ có phản hồi, và có bị phụ huynh trả thù hay trừ điểm ELO oan hay không.
- Form nhập liệu chưa có hướng dẫn thu thập bằng chứng hợp lệ (như chụp tin nhắn phụ huynh ép làm việc nhà ngoài thỏa thuận, ảnh định vị GPS check-in đúng giờ nhưng không được mở cửa, v.v.).

### 1.2. Mục tiêu tái thiết kế của Stitch:
1. **Thiết lập niềm tin tuyệt đối (Build Instant Trust):** Ngay khi vào trang, CarePartner (chủ yếu là sinh viên) phải cảm nhận được nền tảng luôn đứng về phía lẽ phải và bảo vệ sự an toàn, danh dự, thù lao chính đáng của mình.
2. **Quy trình xử lý minh bạch qua Stepper:** Mỗi khiếu nại phải có thanh tiến trình 4 giai đoạn rõ ràng:
   `[1. Đã tiếp nhận] -> [2. AI Sơ duyệt & Phân loại] -> [3. Admin Xác minh & Đối soát] -> [4. Kết luận & Đền bù]`.
3. **Smart Filing Wizard (Bộ công cụ tạo khiếu nại thông minh):**
   - Chọn ca làm việc liên quan từ danh sách thực tế.
   - Trợ lý AI hỗ trợ diễn đạt: Sinh viên chỉ cần gõ vắn tắt sự việc hoặc ghi âm, AI tự động gợi ý cách trình bày mạch lạc, khách quan, trích dẫn đúng quy chế dịch vụ.
   - Khu vực tải bằng chứng trực quan với preview ảnh chụp màn hình, hóa đơn, file âm thanh.
4. **Hộp thông tin kết luận & Bảo vệ ELO:** Khi khiếu nại được giải quyết, hiển thị minh bạch quyết định của Admin: số tiền đền bù vào ví/tài khoản và xác nhận *"Điểm ELO và uy tín của bạn được giữ nguyên 100%"*.

---

## 2. HỆ THỐNG THIẾT KẾ & BẢNG MÀU (DESIGN SYSTEM)

- **Màu chủ đạo (Primary):** `#F26522` (Cam EduCareLink).
- **Màu bảo vệ & An toàn (Trust & Security):** `#0284C7` / `#0EA5E9` (Xanh Ocean — tượng trưng cho sự che chở, công bằng, pháp lý).
- **Màu xử lý khẩn cấp (Urgent/Safety):** `#DC2626` / `#EF4444` (Đỏ Ruby — áp dụng cho các vi phạm nghiêm trọng như bạo hành, quấy rối, an toàn thân thể).
- **Màu thành công / Đã hoàn tất:** `#059669` / `#10B981` (Xanh ngọc lục bảo).
- **Nền & Bề mặt:**
  - Nền tổng thể: `#F8FAFC` (Slate 50 sạch sẽ, thoáng đãng).
  - Khối nội dung: `#FFFFFF` viền `#E2E8F0` bo góc mềm mại `rounded-2xl` với hiệu ứng đổ bóng tinh tế.
- **Typography:** `Plus Jakarta Sans` / `Manrope`.

---

## 3. CẤU TRÚC GIAO DIỆN CHI TIẾT (LAYOUT BREAKDOWN)

### A. Sidebar điều hướng (Kế thừa chuẩn CarePartner Portal):
- Cột cố định bên trái (Desktop `w-[260px]`):
  - Logo EduCareLink (`/static/images/logo.png`).
  - Menu chính: Tìm việc (`/worker/`), Việc của tôi (`/worker/my-jobs/`), Hồ sơ (`/worker/profile/`), AI Trợ lý (`/worker/chatbot/`).
  - Menu phụ: Ví thu nhập (`/worker/earnings/`), **Khiếu nại & Trợ giúp** (Active tab).

### B. Khu vực nội dung chính (Main Content Area):

#### 1. Hero Banner: "Trung tâm Bảo vệ Quyền lợi CarePartner"
- **Thông điệp cốt lõi:** *"EduCareLink cam kết môi trường làm việc an toàn, công bằng và tôn trọng cho mọi CarePartner. Mọi khiếu nại được tiếp nhận bảo mật và giải quyết dứt điểm trong vòng 24 giờ."*
- **Cam kết 3 điểm (Trust Badges):**
  - 🛡️ **Bảo mật danh tính:** Không tiết lộ thông tin cá nhân của bạn với phụ huynh khi chưa có sự đồng ý.
  - ⚖️ **Bảo toàn điểm ELO:** Khiếu nại chính đáng không bao giờ ảnh hưởng xấu đến xếp hạng và tỷ lệ nhận đơn của bạn.
  - 💰 **Đền bù thù lao:** Thu hồi tiền ký quỹ (Escrow) và đền bù thích đáng nếu phụ huynh vi phạm cam kết hoặc ép việc.
- **Nút hành động chính:** Nút cam nổi bật `+ Gửi khiếu nại mới` và nút khẩn cấp viền đỏ `Hotline Khẩn cấp SOS 1900-xxxx`.

#### 2. Bộ lọc trạng thái & Thống kê khiếu nại (Status Filter Tabs):
- 4 Tab lọc:
  - **Tất cả (N)**
  - **Đang xử lý (N)** (Hiển thị badge nhấp nháy xanh dương)
  - **Cần bổ sung bằng chứng (N)** (Hiển thị badge cảnh báo màu cam)
  - **Đã giải quyết (N)** (Hiển thị badge xanh lá)

#### 3. Modal / Drawer tạo khiếu nại thông minh (Smart Complaint Wizard):
- **Bước 1: Chọn đơn việc xảy ra sự cố:**
  - Dropdown hoặc danh sách thẻ thu nhỏ các đơn làm gần đây (tên phụ huynh, thời gian ca, địa chỉ). Có tùy chọn *"Sự cố ngoài đơn / Khiếu nại tài khoản"*.
- **Bước 2: Phân loại hành vi vi phạm (6 nhóm rõ ràng):**
  1. 💵 *Không thanh toán / Bớt xén tiền công:* Phụ huynh từ chối giải ngân tiền mặt hoặc trì hoãn không lý do.
  2. 🧹 *Bóc lột sức lao động / Ép việc ngoài mô tả:* Bắt dọn dẹp cả nhà, nấu cỗ, chăm thú cưng khi thỏa thuận ban đầu chỉ là gia sư kèm học.
  3. ⚠️ *Môi trường làm việc không an toàn:* Nhà có vật nuôi hung dữ thả rông, người say xỉn, nguy cơ thương tích.
  4. 🛑 *Thái độ xúc phạm / Quấy rối:* Ngôn từ miệt thị, hành vi khiếm nhã, xâm phạm ranh giới cá nhân.
  5. ⏰ *Hủy ca sát giờ / Bắt chờ quá 30 phút:* Phụ huynh không có mặt tại địa điểm, hủy ca dưới 2 tiếng không đền bù.
  6. 📝 *Vấn đề khác.*
- **Bước 3: Trợ lý AI hỗ trợ soạn thảo nội dung (AI Smart Drafting):**
  - Ô nhập liệu có nút bấm `✨ Nhờ AI tóm tắt rõ ràng`. Khi người dùng gõ vài dòng lộn xộn, AI chỉnh lại thành văn phong chuẩn mực, nêu rõ thời gian, diễn biến, thiệt hại thực tế.
- **Bước 4: Đính kèm bằng chứng (Visual Evidence Vault):**
  - Khung kéo thả file hiện đại (hỗ trợ nhiều ảnh, video ngắn, file PDF/DOCX, ảnh chụp màn hình Zalo/SMS).
  - Preview thumbnail ảnh có nút xóa nhanh (x).
- **Bước 5: Nút gửi:** Nút bấm lớn *"Gửi yêu cầu khiếu nại ngay"* kèm dòng cam kết bảo mật.

#### 4. Danh sách khiếu nại chi tiết & Thẻ theo dõi tiến trình (Interactive Complaint Cards):
- Mỗi khiếu nại là một thẻ Card cao cấp:
  - **Header thẻ:**
    + Mã khiếu nại: `#KN-2026-089`
    + Badge phân loại vi phạm: `[Ép việc ngoài thỏa thuận]` màu cam nhạt.
    + Badge mức độ ưu tiên từ AI: `[Ưu tiên cao - Phản hồi trong 4h]` màu đỏ nhạt.
    + Thời gian gửi: `10:30 Hôm nay (11/09/2026)`.
  - **Thanh tiến trình 4 bước (Horizontal Timeline Stepper):**
    + Chấm 1: *Đã tiếp nhận (Xong lúc 10:30)*
    + Chấm 2: *AI Phân tích dữ liệu ca làm (Xong lúc 10:32)*
    + Chấm 3: *Admin đối soát với phụ huynh (Đang tiến hành)*
    + Chấm 4: *Đưa ra phán quyết & Đền bù (Dự kiến trước 16:00)*
  - **Nội dung tóm tắt & Bằng chứng đã nộp:**
    + Tiêu đề và mô tả sự việc.
    + Dải ảnh thumbnail bằng chứng (bấm vào để phóng to dạng lightbox).
  - **Hộp thông tin "Nhận định sơ bộ từ AI" (AI Insights Box):**
    + Nền xanh nhạt gradient nhẹ với icon Gemini Sparkles: *"Hệ thống đã đối chiếu lịch sử chat và mô tả công việc gốc. Nhận thấy yêu cầu phụ huynh giao việc dọn dẹp vệ sinh nhà bếp vượt quá phạm vi 'Gia sư Tiếng Anh'. Khuyến nghị bảo vệ quyền lợi CarePartner và hoàn trả 100% thù lao ca làm."*
  - **Hộp Kết luận & Giải quyết từ Admin (Khi đã hoàn tất):**
    + Hiển thị rõ: Lời nhắn từ Admin, số tiền bồi hoàn đã cộng vào ví (VD: `+150.000đ`), trạng thái ELO được bảo lưu.

---

## 4. PROMPT TIẾNG ANH HOÀN CHỈNH GỬI GOOGLE STITCH

Copy toàn bộ đoạn văn bản bên dưới và dán vào Google Stitch:

```text
Design a high-trust, modern, and reassuring Web Application dashboard for the "CarePartner Complaints & Rights Protection Center" (Trung tâm Khiếu nại & Bảo vệ Quyền lợi) on the EduCareLink caregiver platform (Tailwind CSS, clean semantic HTML, Vietnam context).

USER PERSONA & EMOTIONAL GOAL:
The user is a university student or freelance worker in Vietnam who experienced unfair treatment from a parent (e.g., unpaid wages, being forced to do excessive heavy housework outside tutoring duties, verbal disrespect, or last-minute cancellation). The interface must feel safe, dignified, legal, transparent, and completely supportive, assuring them that their voice is heard and their ELO score is safe.

BRAND & COLOR PALETTE:
- Primary Brand Accent: #F26522 (EduCareLink vibrant orange)
- Trust & Advocacy Blue: #0284C7 (sky/ocean blue for justice, safety, and official mediation)
- Urgent / Red Flag Alert: #DC2626 (ruby red for severe labor exploitation or harassment reports)
- Resolution / Success Green: #059669 (emerald green for resolved cases and compensated payouts)
- Surface & Background: Ultra-clean slate (#F8FAFC canvas, #FFFFFF cards, #E2E8F0 borders, #0F172A text)
- Typography: Plus Jakarta Sans / Manrope, rounded-2xl cards, polished soft shadows

DESKTOP LAYOUT (1280px+):
1. Left Fixed Sidebar (w-[260px]):
   - EduCareLink logo
   - Menu items: Tim viec, Viec cua toi, Ho so, AI Tro ly
   - Bottom Section: Vi thu nhap (/worker/earnings/), Khieu nai & Tro giup (Active tab with blue highlight)
   - CarePartner profile pill at bottom with avatar and Tier badge

2. Main Content Container (ml-[260px] p-8 max-w-6xl):
   - HERO ASSURANCE BANNER:
     * Title: "Trung tâm Bảo vệ Quyền lợi CarePartner"
     * Subtitle: "Cam kết môi trường làm việc công bằng, an toàn và minh bạch. Mọi yêu cầu được bảo mật danh tính và giải quyết trong 24 giờ."
     * 3 Trust Badges inline:
       1) 🛡️ "Bảo mật danh tính 100%"
       2) ⚖️ "Không ảnh hưởng điểm tín nhiệm ELO"
       3) 💰 "Đảm bảo quyền lợi & Đền bù thỏa đáng"
     * Right Action Buttons: "+ Gửi khiếu nại mới" (Prominent Orange button with sparkle) and "SOS Khẩn cấp: 1900-6996" (Subtle red pill)

   - STATUS TABS & METRICS ROW:
     * Tab bar: "Tất cả (3)", "Đang xử lý (1)" with pulsing blue dot, "Cần bổ sung tin (0)", "Đã giải quyết (2)" with green checkmark.
     * Search & Filter bar by Job ID, Parent name, or incident category.

   - COMPLAINT DETAIL CARD (Representative high-detail card):
     * Card Header:
       - Incident Code: "#KN-2026-089"
       - Incident Tag: "Ép việc ngoài mô tả ban đầu" (Amber pill)
       - AI Priority Tag: "Ưu tiên cao · Phản hồi trong 4h" (Red-orange badge)
       - Date submitted: "10:30 Hôm nay, 11/09/2026"
     * Visual Horizontal Stepper (4 steps):
       - Step 1: "Tiếp nhận" (Green checked)
       - Step 2: "AI Phân tích & Trích xuất quy chế" (Green checked)
       - Step 3: "Admin đối soát 2 bên" (Active animated Blue pulsing ring)
       - Step 4: "Phán quyết & Bồi hoàn" (Upcoming grey circle)
     * Body Content:
       - Job info: "Ca Gia sư Toán lớp 5 · Phụ huynh: Lê Thị Mai · 150.000đ"
       - Complaint Title: "Phụ huynh yêu cầu lau dọn 3 tầng nhà và rửa bát ngoài giờ dạy"
       - Evidence Gallery: 3 thumbnail previews of screenshot chat logs and task description with click-to-zoom icon.
       - "AI Analysis Box" (Light gradient box with Gemini icon): "Hệ thống AI nhận thấy yêu cầu làm việc nhà của phụ huynh trái với hợp đồng gia sư ban đầu. Đề xuất: Yêu cầu phụ huynh trả thêm phụ phí hoặc hoàn tất thanh toán nguyên vẹn cho CarePartner."
     * Card Footer: "Người phụ trách: Chuyên viên Hỗ trợ An toàn ECL-Care #04 · Đang xử lý"

   - COMPLAINT CREATION MODAL / SLIDE-OVER DRAWER (When clicking "+ Gửi khiếu nại mới"):
     * Clean header: "Gửi khiếu nại & Bảo vệ quyền lợi"
     * Step 1: Select Job dropdown with recent completed/cancelled tasks.
     * Step 2: Category Selector with 6 intuitive visual tiles:
       1. "Không thanh toán / Trừ tiền vô cớ"
       2. "Ép việc ngoài thỏa thuận"
       3. "Thái độ xúc phạm / Quấy rối"
       4. "Môi trường không an toàn"
       5. "Hủy ca sát giờ không báo trước"
       6. "Vấn đề khác"
     * Step 3: Incident Description textarea with "✨ AI Trợ lý diễn đạt rõ ràng" button to polish rough text into an objective report.
     * Step 4: Modern Drag-and-Drop Evidence Uploader supporting images, videos, audio, PDF.
     * Step 5: Privacy Checkbox: "Tôi cam kết thông tin trung thực và muốn Admin hỗ trợ hòa giải bảo mật".
     * Submit CTA: "Gửi khiếu nại tới Ban quản trị" (Full width orange button).

MOBILE VIEW (375px - 768px):
- Top sticky app bar with back button to Worker Profile.
- Compact hero card with instant "+ Gửi khiếu nại" floating button.
- Stepper stacks vertically or uses a sleek horizontal compact progress bar.
- Touch-friendly evidence uploader with direct camera/gallery trigger.
```

---

## 5. ĐẶC TẢ DỮ LIỆU BACKEND & QUY TẮC GHÉP NỐI (API CONTRACT)

Khi Coding Agent áp dụng giao diện vào `frontend/templates/frontend/worker_complaints.html`, cần tuân thủ các API endpoints sau:

### 5.1. Lấy danh sách khiếu nại của tôi:
- **Method & URL:** `GET /api/moderation/complaints/`
- **Response Format:**
  ```json
  [
    {
      "id": 12,
      "complaint_type": "exploitation",
      "complaint_type_display": "Bóc lột sức lao động / Ép việc",
      "title": "Bắt dọn dẹp nhà cửa khi đăng ký gia sư",
      "description": "Phụ huynh bắt lau 3 tầng nhà và nấu cơm...",
      "status": "investigating",
      "status_display": "Đang điều tra",
      "priority": "high",
      "ai_analysis": "Yêu cầu phụ huynh vi phạm thỏa thuận phạm vi công việc...",
      "ai_priority": "high",
      "admin_response": "Admin đã liên hệ phụ huynh để nhắc nhở và giải ngân tiền công.",
      "created_at": "2026-09-11T10:30:00+07:00",
      "evidences": [
        {
          "id": 5,
          "evidence_type": "image",
          "file_url": "/media/complaint_evidence/evidence_1.png",
          "description": "Ảnh chụp màn hình tin nhắn Zalo"
        }
      ]
    }
  ]
  ```

### 5.2. Gửi khiếu nại mới (Multipart Form-Data):
- **Method & URL:** `POST /api/moderation/complaints/`
- **Headers:** `Authorization: Bearer <access_token>`
- **Fields:**
  - `task_id`: ID của công việc (bắt buộc).
  - `complaint_type`: Mã loại vi phạm (`exploitation`, `abuse`, `harassment`, `non_payment`, `fraud`, `unsafe`, `other`).
  - `title`: Tiêu đề ngắn gọn (dưới 255 ký tự).
  - `description`: Mô tả chi tiết diễn biến sự việc.
  - `evidences`: Danh sách các tệp tin đính kèm (ảnh/video/tài liệu).
- **Phản hồi:** Trả về đối tượng Complaint vừa tạo với mã HTTP `201 Created`.
