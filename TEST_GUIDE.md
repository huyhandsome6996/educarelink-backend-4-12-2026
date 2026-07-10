# 🧪 TEST GUIDE — EduCareLink

> **Mục đích**: Hướng dẫn coding agent test toàn diện toàn bộ tính năng EduCareLink — không chỉ backend API mà còn **trải nghiệm người dùng (UX)** trên web và mobile.
>
> **Repo**: `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
> **Production**: `https://educarelink-backend.onrender.com`
> **Demo accounts**: `admin`/`Demo@2026`, `phuhuynh_test`/`Demo@2026`, `sinhvien_test`/`Demo@2026`
>
> **Cách dùng**:
> 1. Đọc từ trên xuống dưới
> 2. Mỗi test case có: Bước thực hiện → Expected result → Đánh giá UX
> 3. Cuối file có bảng tổng kết → điền kết quả

---

## 📋 MỤC LỤC

1. [Setup môi trường test](#1-setup)
2. [Test Admin — Quản trị hệ thống](#2-admin)
3. [Test Phụ huynh — Đăng việc + Thanh toán + Theo dõi](#3-parent)
4. [Test Carepartner — Tìm việc + Tracking + An toàn](#4-carepartner)
5. [Test tính năng an toàn cốt lõi](#5-safety)
6. [Test AI features](#6-ai)
7. [Test Payments (MoMo)](#7-payments)
8. [Test Performance + Tối ưu](#8-performance)
9. [Test UX/UI trên Web](#9-web-ux)
10. [Test UX/UI trên Mobile](#10-mobile-ux)
11. [Test Edge Cases + Error Handling](#11-edge-cases)
12. [Tổng kết + Sign-off](#12-summary)

---

## 1. Setup môi trường test <a name="setup"></a>

### 1.1 Clone + chạy local

```bash
git clone https://github.com/huyhandsome6996/educarelink-backend-4-12-2026.git
cd educarelink-backend-4-12-2026

# Backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Điền GEMINI_API_KEY nếu test AI
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver

# Mobile (terminal khác)
cd mobile
npm install --legacy-peer-deps
npx expo start
```

### 1.2 Test production

```
Web: https://educarelink-backend.onrender.com/
API: https://educarelink-backend.onrender.com/api/
Admin Django: https://educarelink-backend.onrender.com/admin/
```

### 1.3 Demo accounts

| Vai trò | Username | Password | Ghi chú |
|---|---|---|---|
| Admin | `admin` | `Demo@2026` | is_staff + is_superuser |
| Phụ huynh | `phuhuynh_test` | `Demo@2026` | Có task mẫu |
| Carepartner | `sinhvien_test` | `Demo@2026` | Đã approved + verified |

---

## 2. Test Admin — Quản trị hệ thống <a name="admin"></a>

### 2.1 Đăng nhập Admin

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.1.1 | Mở web → `/login/` → nhập admin/Demo@2026 → Đăng nhập | Redirect `/admin-dashboard/` | ⬜ Form dễ dùng? Placeholder rõ? |
| 2.1.2 | Kiểm tra Quick Actions bar (6 nút) | Hiển thị: AI Trợ lý, Thanh toán, Duyệt hồ sơ, Kiểm duyệt, Tracking, Gửi thông báo | ⬜ Icon + label rõ? |
| 2.1.3 | Click "Tạo dữ liệu mẫu" → confirm | Tạo demo data mới | ⬜ Confirm dialog rõ? |

### 2.2 Duyệt Carepartner

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.2.1 | Tab "Chờ duyệt" → xem list carepartner pending | Hiển thị card với avatar, tên, SĐT, email | ⬜ Thông tin đủ để quyết định? |
| 2.2.2 | Click "Duyệt" cho 1 carepartner | Alert "Đã duyệt" + list refresh | ⬜ Feedback tức thì? |
| 2.2.3 | Click "Từ chối" → confirm | Alert "Đã từ chối" + list refresh | ⬜ Confirm không vô tình? |
| 2.2.4 | Tab "Carepartner" → click "Khoá" / "Mở khoá" | Trạng thái thay đổi | ⬜ Toggle trực quan? |
| 2.2.5 | Click "Tước quyền" → confirm | Carepartner → Phụ huynh | ⬜ Confirm rõ ràng? |

### 2.3 Duyệt bằng cấp + Sửa hồ sơ

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.3.1 | Quick Actions → "Duyệt hồ sơ" → tab "Bằng cấp" | List submissions với ảnh + mô tả | ⬜ Ảnh hiển thị được? |
| 2.3.2 | Click "Duyệt" → modal nhập admin note → confirm | Alert thành công + list refresh | ⬜ Modal dễ dùng? |
| 2.3.3 | Click "Từ chối" → modal → confirm | Alert thành công | ⬜ |
| 2.3.4 | Tab "Sửa hồ sơ" → xem list profile change requests | Hiển thị proposed_changes | ⬜ Thay đổi rõ ràng? |
| 2.3.5 | Duyệt/từ chối profile change | Alert + refresh | ⬜ |

### 2.4 Gửi thông báo

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.4.1 | Quick Actions → "Gửi thông báo" | Form: mode (broadcast/individual) + title + message | ⬜ Form rõ? |
| 2.4.2 | Chọn "Gửi cho tất cả" → nhập title + message → "Gửi" | Alert "Đã gửi" | ⬜ |
| 2.4.3 | Chọn "Gửi cho 1 Carepartner" → picker → chọn worker → gửi | Alert thành công | ⬜ Picker dễ tìm? |
| 2.4.4 | Xem preview trước khi gửi | Hiển thị preview card | ⬜ Preview giúp kiểm tra? |

### 2.5 Admin AI Chatbot (vision)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.5.1 | Quick Actions → "AI Trợ lý" | Mở chat screen | ⬜ Welcome message rõ? |
| 2.5.2 | Gửi "Thống kê nhanh hệ thống" | AI trả response < 15s | ⬜ Response hữu ích? |
| 2.5.3 | Click 📎 → chọn ảnh → gửi "Phân tích ảnh này" | AI phân tích ảnh | ⬜ Upload mượt? |
| 2.5.4 | Quick action "Khiếu nại" → hỏi "Có bao nhiêu khiếu nại chờ?" | AI trả số liệu | ⬜ |

### 2.6 Admin Payments

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.6.1 | Quick Actions → "Thanh toán" → tab "Tổng quan" | Stats: total payments, revenue, held, settlements | ⬜ Dashboard dễ đọc? |
| 2.6.2 | Tab "Giao dịch" → filter theo status | List payments với filter | ⬜ Filter hoạt động? |
| 2.6.3 | Click "Thử lại giải ngân" cho payment payout_failed | Alert thành công | ⬜ |
| 2.6.4 | Click "Chạy monthly settlement" → modal nhập year/month → confirm | Alert + stats | ⬜ Modal rõ? |
| 2.6.5 | Tab "Audit log" → xem logs | List event logs | ⬜ Logs dễ trace? |

### 2.7 Admin Tracking Overview

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.7.1 | Quick Actions → "Tracking" | Stats: consents, live locations, SOS, heartbeats | ⬜ |
| 2.7.2 | Xem keepalive scheduler stats | Hiển thị interval, last ping, latency | ⬜ |

### 2.8 Admin Moderation (Kiểm duyệt + Khiếu nại)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 2.8.1 | Quick Actions → "Kiểm duyệt" → tab "Kiểm duyệt task" | List tasks needs_review | ⬜ |
| 2.8.2 | Click "Duyệt" / "Từ chối" override AI → modal | Alert + refresh | ⬜ |
| 2.8.3 | Tab "Khiếu nại" → list complaints | Hiển thị type, status, AI analysis | ⬜ |
| 2.8.4 | Click "AI phân tích" cho 1 complaint | AI trả analysis + suggestion | ⬜ |
| 2.8.5 | Resolve complaint → modal nhập response | Alert + refresh | ⬜ |

---

## 3. Test Phụ huynh — Đăng việc + Thanh toán + Theo dõi <a name="parent"></a>

### 3.1 Đăng ký + Onboarding

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.1.1 | `/register/` → chọn "Phụ Huynh" → điền form → submit | Tự động đăng nhập → onboarding | ⬜ Form ngắn gọn? |
| 3.1.2 | Onboarding → "Bắt đầu" | Redirect `/parent/` | ⬜ Onboarding hữu ích? |

### 3.2 Đăng việc (Create Task)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.2.1 | `/parent/` → "Đăng việc" → form | Form: tiêu đề, mô tả, giá, danh mục, địa điểm, thời gian | ⬜ Form rõ ràng? |
| 3.2.2 | Điền đủ → "Đăng" | Redirect `/parent/tasks/` + task mới xuất hiện | ⬜ Response nhanh (<2s)? |
| 3.2.3 | Kiểm tra AI moderation | TaskModeration status = pending → approved (sau vài giây) | ⬜ User biết đang duyệt? |
| 3.2.4 | Thử đăng task vi phạm (vd: "Tuyển người làm việc 5000đ/giờ") | AI reject hoặc needs_review | ⬜ AI hoạt động? |

### 3.3 Quản lý việc

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.3.1 | `/parent/tasks/` → tab "Đang tìm" | List task open | ⬜ Tab rõ? |
| 3.3.2 | Click "Xem ứng viên" cho 1 task | List candidates + AI recommendations | ⬜ AI gợi ý hữu ích? |
| 3.3.3 | Click "Chấp nhận" 1 ứng viên | Task → in_progress + push cho carepartner | ⬜ Feedback tức thì? |
| 3.3.4 | Tab "Đang làm" → click "Hoàn thành" | Task → completed | ⬜ |
| 3.3.5 | Click "Đánh giá" → chọn sao + comment → submit | Review tạo thành công | ⬜ Star rating dễ dùng? |

### 3.4 Thanh toán (MoMo)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.4.1 | Task in_progress → "Thiết lập thanh toán" | Chọn momo_escrow / cash | ⬜ 2 option rõ? |
| 3.4.2 | Chọn "cash" → confirm | Payment record tạo, alert | ⬜ |
| 3.4.3 | Chọn "momo_escrow" → confirm → redirect MoMo | payUrl MoMo mở | ⬜ Redirect mượt? |
| 3.4.4 | Sau khi pay → MoMo IPN → Payment status=held | Backend tự update | ⬜ (test backend) |

### 3.5 Theo dõi Carepartner (Live Tracking)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.5.1 | Task in_progress → "Theo dõi vị trí" | LiveTrackingScreen mở | ⬜ Map hiển thị? |
| 3.5.2 | Xem vị trí carepartner realtime (poll 5s) | Marker di chuyển | ⬜ Cập nhật mượt? |
| 3.5.3 | Xem device status bar (online/offline + battery) | Hiển thị trạng thái | ⬜ Rõ ràng? |
| 3.5.4 | Click "SOS" → confirm | Push SOS cho carepartner | ⬜ Confirm rõ? |
| 3.5.5 | Click "Gọi" / "Nhắn" | Mở dialer / messenger | ⬜ |

### 3.6 Chatbot Phụ huynh

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.6.1 | Tab "AI Trợ lý" → chat "Tôi cần gia sư Toán lớp 5" | AI trả lời + có thể tạo task | ⬜ Response < 15s? |
| 3.6.2 | AI tạo task → confirm | Task xuất hiện trong my-tasks | ⬜ Tạo task qua chat tiện? |
| 3.6.3 | Chat follow-up "Đổi giá thành 200000đ" | AI hiểu context | ⬜ Context awareness? |

### 3.7 Nâng cấp Carepartner

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 3.7.1 | Parent home → "Nâng cấp Carepartner" | Form upload CCCD + selfie | ⬜ Form rõ? |
| 3.7.2 | Upload đủ → submit | Alert "Đã gửi, chờ admin duyệt" | ⬜ |
| 3.7.3 | Kiểm tra upgrade status | Hiển thị pending | ⬜ |

---

## 4. Test Carepartner — Tìm việc + Tracking + An toàn <a name="carepartner"></a>

### 4.1 Đăng ký + Duyệt

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 4.1.1 | `/register/` → chọn "Sinh Viên" → form + upload CCCD | Form có 4 image picker | ⬜ Upload dễ? |
| 4.1.2 | Submit → "Chờ admin duyệt" | Không auto-login | ⬜ Thông báo rõ? |
| 4.1.3 | Admin duyệt → login lại | Login thành công | ⬜ |

### 4.2 Tìm việc (Worker Feed)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 4.2.1 | `/worker/` → bảng tin việc làm | List task với AI recommendations | ⬜ AI gợi ý match_score? |
| 4.2.2 | Search "gia sư" → filter | List filter theo keyword | ⬜ Search responsive? |
| 4.2.3 | Click task → detail | Hiển thị đầy đủ info | ⬜ |
| 4.2.4 | Click "Ứng tuyển" → consent modal (nếu có geofence) | Modal hỏi đồng ý tracking | ⬜ Modal rõ ràng? |
| 4.2.5 | Đồng ý → "Đã ứng tuyển" | Push cho parent | ⬜ |

### 4.3 Việc của tôi (My Jobs)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 4.3.1 | Tab "Việc của tôi" → tab "Sắp làm" | List accepted tasks | ⬜ |
| 4.3.2 | Task accepted → "Bắt đầu chia sẻ vị trí" | Tracking start + foreground notification | ⬜ Notification rõ? |
| 4.3.3 | ActiveTrackingBanner hiển thị | "Đang theo dõi vị trí" + nút dừng | ⬜ Banner không gây phiền? |
| 4.3.4 | Click "SOS khẩn cấp" → modal → gửi | Push SOS cho parent | ⬜ SOS dễ tìm? |
| 4.3.5 | Click "Dừng chia sẻ" | Tracking stop + parent notified | ⬜ |

### 4.4 Hồ sơ Carepartner

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 4.4.1 | Tab "Tài khoản" → xem hồ sơ | Avatar, tên, AI summary, bằng cấp, đánh giá | ⬜ Thông tin đầy đủ? |
| 4.4.2 | "Gửi bằng cấp mới" → modal upload | Modal form | ⬜ |
| 4.4.3 | "Yêu cầu sửa hồ sơ" → modal form | Modal form | ⬜ |
| 4.4.4 | "Khiếu nại của tôi" → list | List complaints + status | ⬜ |
| 4.4.5 | "Thu nhập" → earnings + settlements | Total earned, pending, owed | ⬜ |

### 4.5 Chatbot Carepartner

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 4.5.1 | Tab "AI Trợ lý" → chat "Làm sao viết hồ sơ hấp dẫn?" | AI trả lời context-aware | ⬜ Response hữu ích? |

### 4.6 Tạo khiếu nại

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 4.6.1 | "Khiếu nại" → form: type, title, description, evidence | Form đầy đủ | ⬜ |
| 4.6.2 | Upload evidence (ảnh) → submit | Complaint tạo + AI analyze | ⬜ AI phân tích? |
| 4.6.3 | Xem "Khiếu nại của tôi" → complaint xuất hiện | List với AI analysis + status | ⬜ |

---

## 5. Test tính năng an toàn cốt lõi <a name="safety"></a>

> ⚠️ Đây là phần QUAN TRỌNG NHẤT — đảm bảo an toàn trẻ em.

### 5.1 Geofence Exit Alert (Rời vùng an toàn)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 5.1.1 | Parent tạo task có geofence (lat/lng/radius) | Task có geofence fields | ⬜ |
| 5.1.2 | Carepartner accept + grant consent + start tracking | Tracking chạy | ⬜ |
| 5.1.3 | Carepartner di chuyển ra ngoài bán kính | Backend detect geofence exit | ⬜ (test backend) |
| 5.1.4 | Parent nhận push notification "🚨🚨🚨 CẢNH BÁO: Carepartner rời vùng an toàn!" | Push đến < 5s | ⬜ Push nhanh? |
| 5.1.5 | Nếu app parent đang mở → Alert dialog + vibration | Popup + chuông kêu | ⬜ Chuông kêu ngay? |
| 5.1.6 | LiveTrackingScreen hiển thị badge "⚠️ Rời vùng an toàn" | Badge rõ | ⬜ |
| 5.1.7 | Carepartner quay lại vùng → push "✅ Quay lại vùng an toàn" | Push recovery | ⬜ |
| 5.1.8 | Alert "Gọi 113" / "Gọi Carepartner" hoạt động | Mở dialer | ⬜ |

### 5.2 Device Offline Alert (Tắt máy/đập máy)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 5.2.1 | Carepartner đang tracking → tắt app / tắt máy | Heartbeat ngừng | ⬜ |
| 5.2.2 | Đợi 90s (3 lần miss heartbeat) | Backend scheduler detect | ⬜ (test backend) |
| 5.2.3 | Parent nhận push "🚨🚨🚨 CẢNH BÁO KHẨN CẤP: Thiết bị mất kết nối!" | Push đến < 2 phút | ⬜ Push nhanh? |
| 5.2.4 | App parent mở → Alert + vibration pattern khẩn cấp | Chuông kêu to + rung | ⬜ Chuông đủ to? |
| 5.2.5 | LiveTrackingScreen hiển thị offline alert banner (đỏ) | Banner rõ + vị trí cuối | ⬜ Banner nổi bật? |
| 5.2.6 | Banner có "Gọi 113" + "Gọi Carepartner" | Button hoạt động | ⬜ |
| 5.2.7 | Carepartner mở app lại → heartbeat resume → alert recovered | Push "✅ Online trở lại" | ⬜ Auto resolve? |
| 5.2.8 | Admin cũng nhận notification | Notification admin | ⬜ |

### 5.3 SOS (Cả parent + worker)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 5.3.1 | Parent LiveTracking → "SOS" → confirm | Push "🆘 SOS từ parent" cho carepartner | ⬜ |
| 5.3.2 | Carepartner MyJobs → "SOS" → modal → gửi | Push "🆘 SOS từ carepartner" cho parent | ⬜ |
| 5.3.3 | App nhận SOS → Alert + vibration | Popup khẩn cấp | ⬜ |
| 5.3.4 | List SOS alerts của task | Hiển thị history | ⬜ |
| 5.3.5 | Resolve SOS | Status → resolved | ⬜ |

### 5.4 Background Tracking (App chạy nền)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 5.4.1 | Carepartner start tracking → app vào nền | Foreground service notification hiện | ⬜ Notification persistent? |
| 5.4.2 | Đợi 5 phút → kiểm tra backend nhận location + heartbeat | Vẫn nhận data | ⬜ Tracking tiếp tục? |
| 5.4.3 | Kill app (swipe) → đợi 1 phút → mở lại | Auto-resume tracking | ⬜ Auto resume? |
| 5.4.4 | Reboot device → mở app | Auto-resume tracking | ⬜ Resume sau reboot? |
| 5.4.5 | Parent complete/cancel task → carepartner nhận push | Push "task_completed/cancelled" | ⬜ Push đến? |
| 5.4.6 | Carepartner app auto stop tracking khi nhận push | Tracking dừng + alert | ⬜ Auto stop? |
| 5.4.7 | Mở MyJobsScreen → fetchJobs check task_status → auto stop | Backup stop | ⬜ |

### 5.5 Notification Channels (Android)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 5.5.1 | Channel "critical_alerts" — sound + vibration | Chuông kêu to + rung mạnh | ⬜ Đủ khẩn cấp? |
| 5.5.2 | Channel "geofence_alerts" — sound + vibration | Chuông + rung | ⬜ |
| 5.5.3 | Channel "sos_alerts" — sound + vibration | Chuông + rung | ⬜ |
| 5.5.4 | Channel "recovery_alerts" — priority thấp hơn | Thông báo nhẹ | ⬜ Không gây phiền? |
| 5.5.5 | Lockscreen visibility PUBLIC | Thấy notification khi khoá màn hình | ⬜ |

---

## 6. Test AI features <a name="ai"></a>

### 6.1 Gemini Model Fallback

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 6.1.1 | POST `/api/chatbot/` → AI trả lời | Response < 15s, type=message | ⬜ Response nhanh? |
| 6.1.2 | Check `performance/gemini_model.py` có 7 model fallback | List 7 models | ⬜ |
| 6.1.3 | All 6 chỗ trong core/views.py dùng helper | Grep `generate_content_with_fallback` = 6 | ⬜ |
| 6.1.4 | Error message thân thiện khi all models fail | "⚙️ Hệ thống AI đang bảo trì" | ⬜ Không technical? |

### 6.2 AI Moderation

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 6.2.1 | Đăng task mới → check moderation status | Pending → approved/rejected < 30s | ⬜ Async không chặn? |
| 6.2.2 | POST `/api/tasks/` response time | < 2s (không đợi AI) | ⬜ Nhanh? |
| 6.2.3 | Đăng task vi phạm → AI reject | Status rejected + notify parent | ⬜ AI chính xác? |

### 6.3 AI Recommendations

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 6.3.1 | Worker feed → AI recommendations | match_score + reason | ⬜ Gợi ý hợp lý? |
| 6.3.2 | Parent candidates → AI ranking | Sort theo match_score | ⬜ |
| 6.3.3 | Cache hit (gọi 2 lần liên tiếp) | Lần 2 nhanh hơn rõ | ⬜ |

### 6.4 AI Chatbot (Admin + Worker + Help Center)

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 6.4.1 | Admin chatbot → "Thống kê" | AI trả số liệu | ⬜ Chính xác? |
| 6.4.2 | Worker chatbot → "Lời khuyên" | AI context-aware (biết profile) | ⬜ |
| 6.4.3 | Help center → "Hướng dẫn đăng việc" | AI hướng dẫn chi tiết | ⬜ Hữu ích? |
| 6.4.4 | Admin chatbot vision → upload ảnh → "Phân tích" | AI phân tích ảnh | ⬜ |

---

## 7. Test Payments (MoMo) <a name="payments"></a>

### 7.1 Setup Payment

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 7.1.1 | Task in_progress → setup cash | Payment created, status=pending | ⬜ |
| 7.1.2 | Task in_progress → setup momo_escrow | payUrl MoMo | ⬜ Redirect? |
| 7.1.3 | Complete task (cash) → payment completed | Hoa hồng ghi nợ | ⬜ |

### 7.2 MoMo IPN Webhook

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 7.2.1 | POST `/api/payments/momo-ipn/` với signature đúng | 204 No Content | ⬜ |
| 7.2.2 | IPN với signature sai | 400 Bad Request | ⬜ Verify working? |
| 7.2.3 | IPN resultCode=0 → Payment status=held | Update DB | ⬜ |

### 7.3 Escrow Release + Refund

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 7.3.1 | Task completed (momo_escrow held) → signal trigger | release_escrow() gọi | ⬜ |
| 7.3.2 | Task cancelled (held) → signal trigger | refund_escrow() gọi | ⬜ |
| 7.3.3 | Payment status → completed / refunded | Update đúng | ⬜ |

### 7.4 Monthly Settlement

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 7.4.1 | Admin → run monthly settlement | CommissionSettlement tạo | ⬜ |
| 7.4.2 | Settlement có QR MoMo | momo_qr_code_url | ⬜ QR hiển thị? |
| 7.4.3 | Worker quét QR → pay → IPN → settlement paid | Status=paid | ⬜ |

---

## 8. Test Performance + Tối ưu <a name="performance"></a>

### 8.1 Backend Benchmark

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 8.1.1 | GET `/api/tasks/` response time | < 100ms | ⬜ Nhanh? |
| 8.1.2 | POST `/api/tasks/` response time | < 500ms (async moderation) | ⬜ |
| 8.1.3 | GET `/api/performance/stats/` | Cache hit rate, pool status | ⬜ |
| 8.1.4 | Gzip middleware hoạt động | Response header Content-Encoding: gzip | ⬜ |

### 8.2 Database Query Optimization

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 8.2.1 | TaskListCreateAPIView có select_related | Check code | ⬜ |
| 8.2.2 | WorkerProfileDetailAPIView dùng aggregate | Check code | ⬜ |
| 8.2.3 | No N+1 queries (Django Debug Toolbar) | 0 duplicate queries | ⬜ |

### 8.3 Mobile Cache

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 8.3.1 | Mở worker feed 2 lần liên tiếp | Lần 2 nhanh hơn (cache) | ⬜ |
| 8.3.2 | Pull-to-refresh → fresh data | Cache invalidate | ⬜ |
| 8.3.3 | Offline → app vẫn hiển thị cached data | Stale data | ⬜ |

### 8.4 Schedulers

| # | Bước | Expected | UX đánh giá |
|---|---|---|---|
| 8.4.1 | Keepalive scheduler (3 min ping) | Server không sleep | ⬜ |
| 8.4.2 | Anomaly scheduler (10 min) | Detect bất thường | ⬜ |
| 8.4.3 | Offline check scheduler (1 min) | Detect heartbeat quá hạn | ⬜ |
| 8.4.4 | Monthly settlement (1st of month 9h) | Auto tạo settlements | ⬜ |

---

## 9. Test UX/UI trên Web <a name="web-ux"></a>

### 9.1 Design Consistency

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 9.1.1 | Màu primary đồng nhất #F26522 (cam) | Tất cả page dùng cam | ⬜ |
| 9.1.2 | Font consistent | Cùng font family | ⬜ |
| 9.1.3 | Button style đồng nhất | Same border-radius, padding | ⬜ |
| 9.1.4 | Sidebar navigation (desktop) | Dễ điều hướng | ⬜ |
| 9.1.5 | Responsive mobile (max-w-md) | Hiển thị OK trên mobile | ⬜ |

### 9.2 User Flow

| # | Flow | Expected | Đánh giá |
|---|---|---|---|
| 9.2.1 | Splash → Login → Parent Home | Mượt < 1s mỗi step | ⬜ |
| 9.2.2 | Parent Home → Create Task → My Tasks | Flow logic | ⬜ |
| 9.2.3 | Worker Feed → Task Detail → Apply → My Jobs | Flow logic | ⬜ |
| 9.2.4 | Admin Dashboard → all 6 quick actions | Mọi action reachable | ⬜ |

### 9.3 Error Handling (Web)

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 9.3.1 | Network error → toast/message | Thông báo rõ | ⬜ |
| 9.3.2 | 401 → redirect login | Không crash | ⬜ |
| 9.3.3 | Form validation error | Hiển thị inline error | ⬜ |
| 9.3.4 | Empty state (no tasks) | Hiển thị empty state đẹp | ⬜ |
| 9.3.5 | Loading state | Spinner/skeleton | ⬜ |

---

## 10. Test UX/UI trên Mobile <a name="mobile-ux"></a>

### 10.1 Navigation

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 10.1.1 | Bottom tab navigation (Parent 3 tabs) | Dễ switch | ⬜ |
| 10.1.2 | Bottom tab navigation (Worker 4 tabs) | Dễ switch | ⬜ |
| 10.1.3 | Stack navigation (back button) | Back hoạt động | ⬜ |
| 10.1.4 | Modal presentation (CreateTask, PaymentSetup) | Slide up | ⬜ |

### 10.2 Forms

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 10.2.1 | Login form — keyboard không đè | KeyboardAvoidingView | ⬜ |
| 10.2.2 | Register form — image picker hoạt động | Mở gallery/camera | ⬜ |
| 10.2.3 | Create task — date/time picker | Native picker | ⬜ |
| 10.2.4 | Form validation — realtime | Hiển thị error inline | ⬜ |

### 10.3 Performance (Mobile)

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 10.3.1 | App khởi động < 3s | Splash → login nhanh | ⬜ |
| 10.3.2 | List scroll mượt | 60fps | ⬜ |
| 10.3.3 | Image loading | expo-image cache | ⬜ |
| 10.3.4 | API call < 2s mỗi endpoint | Nhanh | ⬜ |

### 10.4 Accessibility

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 10.4.1 | Button size ≥ 44pt | Dễ chạm | ⬜ |
| 10.4.2 | Contrast ratio ≥ 4.5:1 | Đọc được | ⬜ |
| 10.4.3 | Font size đủ lớn (≥ 14pt body) | Đọc được | ⬜ |
| 10.4.4 | Error messages tiếng Việt | Hiểu được | ⬜ |

---

## 11. Test Edge Cases + Error Handling <a name="edge-cases"></a>

### 11.1 Auth Edge Cases

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 11.1.1 | Login sai password 5 lần | Rate limit / lock | ⬜ |
| 11.1.2 | Token hết hạn → auto refresh | Transparent | ⬜ |
| 11.1.3 | Refresh token hết hạn → logout | Redirect login | ⬜ |
| 11.1.4 | Worker chưa approved login | 403 pending_approval | ⬜ |
| 11.1.5 | OAuth email trùng email provider khác | 409 conflict | ⬜ |

### 11.2 Task Edge Cases

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 11.2.1 | Apply task đã completed | 400 error | ⬜ |
| 11.2.2 | Apply task của mình | 400 error | ⬜ |
| 11.2.3 | Apply task 2 lần | 400 "đã ứng tuyển" | ⬜ |
| 11.2.4 | Approve 2 ứng viên cùng task | Chỉ 1 accepted, rest rejected | ⬜ |
| 11.2.5 | Review task chưa completed | 400 error | ⬜ |
| 11.2.6 | Review task 2 lần | 400 "đã đánh giá" | ⬜ |

### 11.3 Tracking Edge Cases

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 11.3.1 | Update location task không in_progress | 400 error | ⬜ |
| 11.3.2 | Update location không phải accepted worker | 403 error | ⬜ |
| 11.3.3 | Heartbeat task completed → auto clear | Tracking stop | ⬜ |
| 11.3.4 | Revoke consent → LiveLocation deleted | Parent không thấy vị trí | ⬜ |
| 11.3.5 | SOS task không liên quan | 403 error | ⬜ |

### 11.4 Payment Edge Cases

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 11.4.1 | Setup payment task không sở hữu | 403 error | ⬜ |
| 11.4.2 | Setup payment 2 lần | 1 Payment per task | ⬜ |
| 11.4.3 | Refund task không held | Skip | ⬜ |
| 11.4.4 | MoMo IPN sai signature | 400 error | ⬜ |

### 11.5 AI Edge Cases

| # | Kiểm tra | Expected | Đánh giá |
|---|---|---|---|
| 11.5.1 | GEMINI_API_KEY chưa config | Fallback message thân thiện | ⬜ |
| 11.5.2 | Gemini timeout | Fallback | ⬜ |
| 11.5.3 | Gemini quota exhausted | "Hết hạn mức" message | ⬜ |
| 11.5.4 | All 7 models deprecated | "⚙️ Bảo trì" message | ⬜ |
| 11.5.5 | AI response không parse JSON | Fallback | ⬜ |

---

## 12. Tổng kết + Sign-off <a name="summary"></a>

### Bảng tổng kết

| Phần | Tổng test cases | Pass | Fail | Pending | Tỷ lệ pass |
|---|---|---|---|---|---|
| 2. Admin | 35 | | | | |
| 3. Parent | 25 | | | | |
| 4. Carepartner | 20 | | | | |
| 5. Safety (CỐT LÕI) | 30 | | | | |
| 6. AI | 15 | | | | |
| 7. Payments | 12 | | | | |
| 8. Performance | 12 | | | | |
| 9. Web UX | 15 | | | | |
| 10. Mobile UX | 16 | | | | |
| 11. Edge Cases | 20 | | | | |
| **TỔNG** | **200** | | | | |

### Critical issues (an toàn)

> Liệt kê các issue ❌ liên quan tính năng an toàn (section 5):

1. ...
2. ...

### UX issues

> Liệt kê các vấn đề UX (section 9 + 10):

1. ...
2. ...

### Recommendations

1. ...
2. ...

### Sign-off

- **Tester**: <tên agent>
- **Ngày test**: <YYYY-MM-DD>
- **Kết luận**: <PASS / FAIL / NEEDS FIX>
- **Commit test**: <commit hash>
- **Production URL tested**: https://educarelink-backend.onrender.com

---

## 📝 Hướng dẫn cho Tester

### Bước 1: Setup
```bash
git clone https://github.com/huyhandsome6996/educarelink-backend-4-12-2026.git
cd educarelink-backend-4-12-2026
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver
```

### Bước 2: Test production
```bash
# Health check
curl https://educarelink-backend.onrender.com/api/health/

# Login
curl -X POST https://educarelink-backend.onrender.com/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Demo@2026"}'

# Test chatbot
curl -X POST https://educarelink-backend.onrender.com/api/chatbot/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message":"test","history":[]}'
```

### Bước 3: Test mobile
```bash
cd mobile
npm install --legacy-peer-deps
npx expo start
# Quét QR bằng Expo Go trên điện thoại
```

### Bước 4: Điền kết quả
- Mỗi test case: ✅ (pass) / ❌ (fail) / ⚠️ (cần xem)
- Cuối file: điền tổng kết + issues + sign-off

### Bước 5: Commit
```bash
git add TEST_GUIDE.md
git commit -m "test: kết quả test toàn diện EduCareLink"
git push origin main
```

---

*File này thay thế AUDIT_CHECKLIST.md (đã xoá) — focus vào cả backend + UX frontend.*
*Tạo bởi Z.ai (Super Z) — 200 test cases covering admin, parent, carepartner, safety, AI, payments, performance, UX.*
