# Coding Agent Prompt — Nâng cấp Giao diện Phụ huynh theo Bản thiết kế Stitch

> **Ngày tạo**: 13/09/2026  
> **Nhánh làm việc**: `feature/parent-ui-stitch-upgrade` (tạo mới từ `main`)  
> **Repo**: `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`  
> **Commit đầu tiên trên nhánh mới**: Luôn tạo nhánh trước khi làm bất kỳ thay đổi nào.  
> **Push sau khi hoàn thành**: `git push origin feature/parent-ui-stitch-upgrade` — KHÔNG merge vào `main` tự động.

---

## 0. NGUYÊN TẮC BẮT BUỘC TRƯỚC KHI LÀM

1. **ĐỌC TOÀN BỘ `AGENTS.md`** ngay lập tức. Đây là nguồn sự thật duy nhất về kiến trúc, API, model schema và quy tắc làm việc của dự án.
2. **Đọc và phân tích đầy đủ các file sau trước khi viết bất kỳ dòng code nào**:
   - `mobile/src/navigation/AppNavigator.js` — cấu trúc toàn bộ navigation của app
   - `mobile/src/screens/Parent/MyTasksScreen.js` — màn hình "Việc của tôi" cũ (814 dòng)
   - `mobile/src/screens/Parent/BookingDetailScreen.js` — chi tiết đơn (1607 dòng)
   - `mobile/src/api/matching.js` — tất cả API endpoints ghép cặp
   - `mobile/src/api/tasks.js` — tất cả API endpoints task (luồng cũ)
   - `mobile/src/api/tracking.js` — API theo dõi GPS
   - `mobile/src/theme/colors.js` — design tokens màu, typography, shadow
3. **Commit message bằng Tiếng Việt** theo quy định dự án.
4. **KHÔNG bao giờ xóa hoặc phá vỡ logic backend** — chỉ thay đổi presentation layer (UI/UX).
5. **KHÔNG tạo giao diện tĩnh** — toàn bộ dữ liệu phải đến từ API call thực tế.
6. Sau khi xong, chạy `npm test` trong `mobile/` và đảm bảo **100% test PASS** trước khi push.

---

## 1. BỐI CẢNH DỰ ÁN

EduCareLink là nền tảng kết nối Phụ huynh với CarePartner (sinh viên đại học, gia sư) tại Việt Nam. Dự án có **2 luồng hoạt động song song**:

### Luồng cũ (`core` app — `Task`/`TaskApplication`)
- Phụ huynh đăng Task (POST `/api/tasks/`), CarePartner ứng tuyển, Phụ huynh chấp nhận ứng viên → Task chuyển `in_progress`.
- Màn hình: `MyTasksScreen.js` (Parent) / `MyJobsScreen.js` (Worker).

### Luồng mới (`matching` app — `Job`/`Booking`)
- Phụ huynh đăng Job (`JobTypeSelect → TutoringForm/ChildcareForm/PickupForm → publish → AI matching`).
- Phụ huynh chọn CarePartner → Booking tạo ở trạng thái `awaiting_commitment`.
- CarePartner xác nhận cam kết (`/api/matching/bookings/<id>/commit/`) → Booking → `committed`.
- CarePartner bắt đầu ca (`/api/matching/bookings/<id>/start/`) → `in_progress`.
- Phụ huynh xác nhận hoàn thành (`/api/matching/bookings/<id>/complete/`) → `completed`.
- Màn hình hiện tại: `BookingDetailScreen.js` (dùng cho cả 2 vai trò).

### Thực trạng hiện tại của `MyTasksScreen.js`
Tab hiện có: `open` | `in_progress` | `completed` | `cancelled` — chỉ phục vụ luồng **cũ** (`core.Task`), KHÔNG hiển thị booking từ luồng mới. Đây là lỗ hổng chính cần khắc phục.

---

## 2. YÊU CẦU NÂNG CẤP CHÍNH

### 2.1. Màn hình "Việc của tôi" — `MyTasksScreen.js`

#### Kiến trúc 3 Tab mới (thay thế 4 tab cũ)

```
TAB 1: "CHỜ XÁC NHẬN"
  Nguồn dữ liệu:
  ├── API GET /api/tasks/?status=open → Task luồng cũ đang tìm ứng viên
  └── API GET /api/matching/bookings/?role=parent&status=awaiting_commitment
             → Booking đã chọn sinh viên, đang chờ sinh viên cam kết

TAB 2: "SẮP LÀM"
  Nguồn dữ liệu:
  ├── API GET /api/matching/bookings/?role=parent&status=committed
             → Booking đã cam kết, chưa bắt đầu
  └── API GET /api/matching/bookings/?role=parent&status=in_progress
             → Booking đang trong ca làm (Live GPS active)
  [Luồng cũ: Task status=in_progress cũng có thể fetch ở đây]

TAB 3: "LỊCH SỬ"
  Nguồn dữ liệu:
  ├── API GET /api/matching/bookings/?role=parent&status=completed
  ├── API GET /api/matching/bookings/?role=parent&status=cancelled_by_parent
  ├── API GET /api/matching/bookings/?role=parent&status=cancelled_by_carepartner
  └── API GET /api/tasks/?status=completed (Task luồng cũ)
  [Đổi tab "cancelled" vào đây thay vì tab riêng]
```

#### Thiết kế Card theo từng trạng thái

**Card ở Tab 1 — Booking `awaiting_commitment`** (QUAN TRỌNG NHẤT):
```
- border-t-4 amber: Đây là card Phụ huynh cần xem lại sinh viên đã chọn
- Hiển thị đầy đủ thông tin sinh viên: avatar, tên, trường ĐH, điểm uy tín (trust_score), số ca hoàn thành
- Đồng hồ đếm ngược: Tính từ booking.seconds_left (API đã trả về trường này)
- Nút "Xem chi tiết hồ sơ" → navigate('BookingDetail', { bookingId: booking.id })
- Nút "Đổi người / Hủy đơn" → gọi cancelBookingByParent() từ matching.js
- Giá hiển thị: booking.total_value_vnd
```

**Card ở Tab 1 — Task luồng cũ `open`**:
```
- border-t-4 sky blue: Đang tìm CarePartner
- Banner AI: "AI đã tìm thấy X ứng viên phù hợp" (gọi getCandidates để lấy count)
- Nút "Xem ứng viên phù hợp" → navigate('SmartMatches', { taskId }) hoặc navigate('Candidates', { taskId })
- Nút "Hủy việc" → updateTaskStatus(taskId, 'cancelled')
```

**Card ở Tab 2 — Booking `committed`**:
```
- border-t-4 emerald: Sinh viên đã xác nhận cam kết
- Badge "Sắp bắt đầu + đếm ngược đến scheduled_time"
- Mini-bar sinh viên: avatar, tên, trường ĐH, rating
- Số điện thoại: hiển thị khi đã committed (booking.carepartner_phone)
- Nút "Xem bản đồ theo dõi" → navigate('LiveTracking', { taskId: booking.task_id })
  (kiểm tra checkConsent() trước)
- Nút "Nhắn tin" → navigate('Chat', { taskId: booking.task_id })
- Nút "Xác nhận hoàn thành ca" → gọi completeBooking(booking.id) từ matching.js
```

**Card ở Tab 2 — Booking `in_progress`**:
```
- Tương tự committed nhưng badge "Đang trong ca làm"
- Live GPS Strip: hiển thị nếu checkConsent() === 'granted'
- Nút SOS: href="tel:0862427404"
```

**Card ở Tab 3 — Booking `completed`**:
```
- Badge "Đã hoàn thành", timestamp, số tiền giải ngân
- Thông tin sinh viên
- Nếu chưa đánh giá: Nút "Đánh giá Carepartner" → navigate('Review', { taskId, revieweeId })
- Nếu đã đánh giá: Hiển thị nội dung review + sao
- Nút "Xem nhật ký chăm sóc bé" → navigate('CareDiaryDetail', { taskId })
- Nút "Đặt lại sinh viên này" → navigate('JobTypeSelect') với pre-filled carepartner_id
```

#### Data fetching strategy
```javascript
// Fetch song song 2 nguồn dữ liệu không blocking nhau
const fetchAllData = async () => {
  const [tasksRes, bookingsRes] = await Promise.allSettled([
    getMyTasksAsParent(),                          // API cũ
    getBookings({ role: 'parent' }),               // API mới matching
  ]);
  // Merge và phân loại theo tab
};
```

---

### 2.2. Màn hình "Chi tiết Đơn" — `BookingDetailScreen.js`

**Phần Phụ huynh (`isParent === true`) cần được nâng cấp toàn diện** theo bản thiết kế Stitch (phần CarePartner đã được nâng cấp trước đó — KHÔNG được đụng vào).

#### 3 Giai đoạn cần hiển thị khác nhau (đã có logic `booking.status`):

**Giai đoạn 1: `awaiting_commitment`** (Chờ sinh viên xác nhận)
```
Component mới: <AwaitingCommitmentView booking={booking} secondsLeft={secondsLeft} />
- Hero Banner màu amber: đồng hồ đếm ngược lớn (mm:ss), thông báo reassure
- CarePartner Spotlight Bento: Avatar + Tên + Trường ĐH + Trust Badges (CCCD, thẻ SV, uy tín)
- Chi tiết công việc & lịch hẹn (đã có trong booking data)
- MoMo Escrow Card: breakdown tài chính minh bạch
- Bottom Dock:
  * Nút "Đổi sinh viên" (35%) → cancelBookingByParent() + quay lại màn CandidatesList
  * Nút "Xem hồ sơ đầy đủ →" (65%) → navigate('CandidateProfileV2', { carepartnerId })
```

**Giai đoạn 2: `committed` | `in_progress`** (Đang theo dõi ca làm)
```
Component mới: <ActiveShiftView booking={booking} />
- Hero Banner màu emerald: trạng thái ca làm, GPS Live badge
- Map Simulation Card: Live GPS (gọi checkConsent() + navigate LiveTracking)
- Thông tin sinh viên + số điện thoại (đã có trong booking.carepartner_phone)
- Chi tiết công việc (rút gọn)
- MoMo Escrow reminder
- Bottom Dock:
  * Nút gọi điện (icon) → Linking.openURL('tel:' + booking.carepartner_phone)
  * Nút "Xác nhận hoàn thành ca" (lớn) → completeBooking(booking.id)
  * Micro-text giải thích escrow payout
```

**Giai đoạn 3: `completed`** (Đã hoàn thành)
```
Component mới: <CompletedShiftView booking={booking} />
- Dark header card "Ca làm đã kết thúc an toàn" + thời gian + số tiền giải ngân
- Care Diary Box: nội dung nhật ký từ API GET /api/matching/bookings/<id>/care-diary/ (nếu có)
- Rating & Review Form: nếu chưa đánh giá → navigate('Review', {...}); nếu đã → hiển thị sao
- Quick Praise Tags: "Đúng giờ", "Kiên nhẫn", "Bé thích" (static chips, pre-select khi đánh giá)
- MoMo Escrow Receipt: tổng kết breakdown
- Bottom Dock:
  * Nút "Xem hóa đơn" (1/3) → navigate('PaymentDetail', { paymentId })
  * Nút "Đặt lại sinh viên này tuần sau" (2/3) → navigate('JobTypeSelect')
```

---

## 3. LUỒNG TRẠNG THÁI ĐẦY ĐỦ (STATE MACHINE)

```
[PHỤHUYNH đăng việc]
         │
         ▼
    Task.status='open'
    (luồng cũ: Task API)
    HOẶC
    Job đã publish → getMatchingCandidates() → Phụ huynh chọn SV
         │
         │ selectCarePartner(jobId, carepartnerId)
         ▼
  Booking.status='awaiting_commitment'
  ← HIỂN THỊ: Tab "CHỜ XÁC NHẬN" với card SV đã chọn + countdown
         │
         │ [SV bấm commitBooking(bookingId)] ← CarePartner action
         ▼
  Booking.status='committed'
  ← HIỂN THỊ: Tab "SẮP LÀM" — SV đã xác nhận, chờ bắt đầu ca
         │
         │ [SV bấm startBooking(bookingId)] ← CarePartner action
         ▼
  Booking.status='in_progress'
  ← HIỂN THỊ: Tab "SẮP LÀM" — Đang trong ca (Live GPS active)
         │
         │ [PHỤ HUYNH bấm completeBooking(bookingId)]
         ▼
  Booking.status='completed'
  ← HIỂN THỊ: Tab "LỊCH SỬ" — Care Diary, Rating, Escrow receipt, Re-book
```

**Sự kiện đặc biệt:**
- `Booking.status='no_show'`: Sinh viên không đến → SOS, hotline 0862427404
- `Booking.status='reschedule_requested'`: SV xin đổi giờ → Phụ huynh Đồng ý/Từ chối
- `Task.status='cancelled'`: Hủy luồng cũ → hiển thị trong Tab "Lịch sử"

---

## 4. CÁC FILE CẦN THAY ĐỔI

### `mobile/src/screens/Parent/MyTasksScreen.js`
- [ ] Xóa TABS cũ (`open`, `in_progress`, `completed`, `cancelled`)
- [ ] Tạo 3 tabs mới: `pending_confirmation`, `upcoming`, `history`
- [ ] Cập nhật `fetchTasks()` → `fetchAllData()` gọi song song 2 API (tasks + bookings)
- [ ] Viết `renderBookingCard(booking)` và `renderTaskCard(task)` riêng biệt
- [ ] `filtered` logic: phân loại booking và task vào đúng tab theo status mapping
- [ ] Implement countdown timer cho awaiting_commitment cards (dùng `booking.seconds_left`)
- [ ] Đảm bảo navigate đến `BookingDetail` với `{ bookingId }` (matching) hoặc các route cũ

### `mobile/src/screens/Parent/BookingDetailScreen.js`
- [ ] Giữ nguyên 100% CarePartner view (từ dòng 267 trở xuống — KHÔNG ĐƯỢC CHẠM)
- [ ] Nâng cấp toàn bộ Parent view (dòng 139-265) thành 3 component con theo phase
- [ ] `AwaitingCommitmentView`: countdown banner + student spotlight + job details + escrow card + bottom dock phase 1
- [ ] `ActiveShiftView`: active banner + GPS/map section + contact strip + job brief + escrow reminder + bottom dock phase 2
- [ ] `CompletedShiftView`: completed dark banner + care diary box + rating form + escrow receipt + bottom dock phase 3
- [ ] Bottom dock Phase 1: `cancelBookingByParent()` + navigate `CandidateProfileV2`
- [ ] Bottom dock Phase 2: `Linking.openURL(tel)` + `completeBooking(booking.id)`
- [ ] Bottom dock Phase 3: navigate `PaymentDetail` + navigate `JobTypeSelect`

### `mobile/src/theme/colors.js` (nếu cần)
- [ ] Kiểm tra đã có `COLORS.amber`, `COLORS.sky`, `COLORS.successBg` chưa — thêm nếu thiếu

---

## 5. RESET DỮ LIỆU SAU KHI NÂNG CẤP

Sau khi hoàn thành code, chạy lệnh sau để reset toàn bộ dữ liệu seed demo về trạng thái sạch phù hợp với luồng mới:

```bash
# Trong thư mục gốc dự án (backend Django)
python seed_data.py
```

Nếu `seed_data.py` không có dữ liệu mẫu cho luồng `matching` (Job/Booking), cần bổ sung:
- Tạo ít nhất 2 Job đã publish (cho parent demo account)
- Tạo 1 Booking ở trạng thái `awaiting_commitment` (parent đã chọn SV)
- Tạo 1 Booking ở trạng thái `committed` (SV đã nhận)
- Tạo 1 Booking ở trạng thái `completed` có Care Diary entry

---

## 6. THIẾT KẾ GIAO DIỆN CHI TIẾT (Từ bản Stitch)

### Design Tokens (ánh xạ vào React Native StyleSheet)

```javascript
const DESIGN = {
  // Màu nền và bề mặt
  canvas: '#F8FAFC',            // backgroundColor tổng thể
  cardSurface: '#FFFFFF',       // backgroundColor của card
  cardBorder: '#E2E8F0',        // borderColor của card

  // Màu thương hiệu
  brandOrange: '#F26522',       // active tab, primary CTA
  brandOrangeLight: '#FFF7ED',  // background pill nhẹ

  // Màu trạng thái
  trustEmerald: '#0E9F6E',      // completed, verified, confirmed
  activeBlue: '#0284C7',        // live GPS, in-progress
  pendingAmber: '#F59E0B',      // awaiting_commitment, countdown
  alertCrimson: '#EF4444',      // cancel, SOS, error

  // Text
  textPrimary: '#0F172A',       // slate-900
  textSecondary: '#475569',     // slate-600
  textMuted: '#94A3B8',         // slate-400

  // Card accent border-top
  accentAmber: '#FBBF24',       // awaiting_commitment card top
  accentEmerald: '#10B981',     // committed/in_progress card top
  accentSky: '#0EA5E9',         // open job searching card top
};
```

### Card Structure Template (React Native)
```jsx
// Card awaiting_commitment
<View style={[styles.card, { borderTopWidth: 4, borderTopColor: DESIGN.accentAmber }]}>
  {/* Header row: status pill + price */}
  <View style={styles.cardHeader}>
    <View style={[styles.statusPill, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
      <Animated.View style={[styles.pingDot, { backgroundColor: DESIGN.pendingAmber }]} />
      <Text style={{ color: '#92400E', fontFamily: 'Manrope', fontWeight: '700', fontSize: 11 }}>
        Chờ sinh viên xác nhận
      </Text>
    </View>
    <Text style={styles.cardPrice}>{booking.total_value_vnd?.toLocaleString('vi-VN')}đ</Text>
  </View>

  {/* Countdown amber box */}
  <CountdownBox secondsLeft={booking.seconds_left} />

  {/* Student spotlight bento */}
  <StudentSpotlight carepartner={booking.carepartner} />

  {/* Job details brief */}
  <JobDetailsBrief booking={booking} />

  {/* Action dock */}
  <View style={styles.cardActions}>
    <TouchableOpacity onPress={() => navigation.navigate('CandidateProfileV2', { id: booking.carepartner_id })}>
      <Text>Xem chi tiết hồ sơ</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => handleCancelByParent(booking.id)}>
      <Text style={{ color: DESIGN.alertCrimson }}>Đổi người / Hủy đơn</Text>
    </TouchableOpacity>
  </View>
</View>
```

---

## 7. TIÊU CHÍ NGHIỆM THU (Acceptance Criteria)

### Giao diện & UX
- [ ] Tab "Chờ xác nhận": Hiển thị đúng Booking `awaiting_commitment` với card sinh viên đã chọn, countdown đếm ngược chính xác.
- [ ] Tab "Chờ xác nhận": Hiển thị đúng Task `open` từ luồng cũ.
- [ ] Tab "Sắp làm": Hiển thị Booking `committed` và `in_progress` — KHÔNG lẫn với `awaiting_commitment`.
- [ ] Tab "Lịch sử": Hiển thị Booking `completed/cancelled` và Task `completed` từ cả 2 luồng.
- [ ] Countdown timer đếm đúng và không giật / memory leak khi chuyển tab.
- [ ] `BookingDetailScreen` Parent view: 3 giai đoạn hiển thị đúng theo `booking.status`.
- [ ] Không có text hardcoded "ELO" — phải là "Điểm uy tín" hoặc "Điểm tín nhiệm".

### Kết nối Backend (Quan trọng nhất)
- [ ] `getBookings({ role: 'parent' })` được gọi thực tế và dữ liệu render từ response.
- [ ] `cancelBookingByParent(bookingId, note)` kết nối đúng endpoint `/api/matching/bookings/<id>/cancel-parent/`.
- [ ] `completeBooking(bookingId)` gọi đúng `/api/matching/bookings/<id>/complete/`.
- [ ] `checkConsent(taskId)` được gọi trước khi navigate LiveTracking.
- [ ] Refresh (pull-to-refresh) hoạt động cả 2 nguồn dữ liệu.

### Kỹ thuật
- [ ] `npm test` trong `mobile/` → 100% PASS, không có test mới bị fail.
- [ ] Không có `console.error` hay crash khi không có dữ liệu (empty states hiển thị đúng).
- [ ] Animation/countdown không gây memory leak (clearInterval trong useEffect cleanup).
- [ ] Tất cả TouchableOpacity có `activeOpacity={0.85}`.

---

## 8. HƯỚNG DẪN TẠO NHÁNH VÀ PUSH

```bash
# 1. Cập nhật local từ remote main
git fetch origin
git checkout main
git pull origin main

# 2. Tạo nhánh mới để làm việc
git checkout -b feature/parent-ui-stitch-upgrade

# 3. Sau khi hoàn thành, push nhánh lên remote
git push origin feature/parent-ui-stitch-upgrade

# 4. KHÔNG merge vào main tự động — chờ review
```

---

## 9. TÀI LIỆU THAM KHẢO TRONG REPO

- **Bản thiết kế HTML màn hình "Việc của tôi"**: Xem file `stitch_prompt_phu_huynh_viec_cua_toi.md` — đây là prompt đã dùng để tạo ra bản thiết kế Stitch.
- **Bản thiết kế HTML chi tiết đơn**: Xem file `stitch_prompt_phu_huynh_chi_tiet_don.md`.
- **API spec đầy đủ luồng matching**: Xem `AGENTS.md` §6 — mục 6.8 Matching (Flow 1).
- **Schema Booking**: Xem `AGENTS.md` §5 — không có `Booking` model vì matching app dùng model riêng, cần xem `matching/models.py` để biết field chính xác.
- **Hotline hỗ trợ 24/7**: `0862427404` — cần hard-code vào SOS button và các màn hình cần thiết.
