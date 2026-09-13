# PROMPT: Implement CarePartner "My Jobs" 4-Tab Lifecycle Architecture & Booking Confirmation Workflow

---

## 📌 Executive Summary & Context for Claude

You are working on the repository **`educarelink-backend-4-12-2026`**, a production-grade fullstack application connecting **Vietnamese Parents** with vetted **CarePartners** (university students & educators) for tutoring, childcare, and school pickup services.

- **Repository**: `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`
- **Active Working Branch**: `feature/fix-matching-geo-tutors-gps` (DO NOT commit to `main`).
- **All Previous Work Status**: All changes up to this point have already been verified, tested (14/14 test suites, 115/115 tests passing), and pushed to remote `origin/feature/fix-matching-geo-tutors-gps`.
- **Tech Stack**:
  - **Backend**: Django 5.2 monolith, Django REST Framework (DRF), SimpleJWT, PostgreSQL/SQLite, Vietnamese timezone (`Asia/Ho_Chi_Minh`), MoMo Escrow Payment v2, Live GPS Tracking.
  - **Mobile**: React Native 0.81.5, Expo SDK 54 (`expo ~54.0.36`), React 19.1.0, React Navigation 7.x, `@testing-library/react-native` v14.0.1.
  - **Design System**: Google Stitch UI (Bento Grid, Zero Jargon, Warm Professionalism, High-Contrast Brand Orange `#F26522` / `#EA580C`, Emerald Green `#00714C` / `#0E9F6E`, Amber `#F59E0B`).

---

## 🎯 The Core Problem to Solve

Currently, in the CarePartner (Worker) view:
1. **Broken / Outdated Lifecycle in "My Jobs" (`mobile/src/screens/Worker/MyJobsScreen.js`)**:
   - `MyJobsScreen.js` currently only defines 2 legacy tabs: `['accepted', 'history']`.
   - In fact, `MyJobsScreen.js` explicitly discarded `awaiting_commitment` bookings with:
     ```javascript
     // Bỏ qua awaiting_commitment (đơn chưa xác nhận nằm ở Trang chủ)
     if (b.status === 'awaiting_commitment') return;
     ```
   - This meant that when a parent selected a student, the student had no dedicated "Pending Confirmation" tab in their primary jobs hub.
2. **Missing Transition When CarePartner Confirms**:
   - When the student clicks "Xác nhận cam kết" (Confirm / Commit Booking) on `BookingDetailScreen.js` or in the feed, the app does not reactively navigate the student to the "My Jobs" screen under the **"Sắp làm"** (Upcoming) tab.
   - There was no 1-tap confirmation directly inside "My Jobs".

---

## 📋 Exact Business Requirements

When a CarePartner confirms a booking, the job **MUST immediately transition** to the **"Việc của tôi" (My Jobs)** screen.
The **"Việc của tôi"** screen for CarePartners must feature **EXACTLY 4 dedicated lifecycle tabs**:

### Tab 1: "Chờ xác nhận" (Pending Confirmation)
- **Definition**: Contains all tasks/bookings where a Parent has chosen this CarePartner, but the CarePartner has **NOT yet confirmed / committed** (`booking.status === 'awaiting_commitment'`).
- **Urgency & Countdown**: Displays an active real-time countdown ribbon based on `booking.seconds_left` (e.g., `"Còn 45 phút 20 giây để xác nhận"`). Turns critical red/amber when under 10 minutes.
- **Spotlight Information**:
  - Parent profile: Name, verified CCCD badge, 100% MoMo Escrow funded badge.
  - Service details: Category tag (Gia sư / Trông trẻ / Đón trẻ), subject/task title, scheduled slot (`date_vi`, `time_from` – `time_to`).
  - Job address and approximate distance.
  - **Guaranteed Student Payout**: Net earnings in VNĐ (`carepartner_payout_vnd` or `80% of total_value_vnd`).
- **Action Buttons on Each Card**:
  1. **Primary Button ("Xác nhận cam kết")**: 1-tap confirmation. Directly invokes `commitBooking(booking.id)`:
     - On success: Displays positive feedback, smoothly moves the card from Tab 1 into Tab 2 ("Sắp làm"), and automatically switches the active tab to "Sắp làm".
  2. **Secondary Button ("Từ chối")**: Opens reason modal (`school_schedule`, `exam`, `personal`, etc.) and calls `cancelBooking(booking.id, { reason_code, note })`.
  3. **Card Tap**: Navigates to `BookingDetailScreen` with `{ bookingId: booking.id }`.

### Tab 2: "Sắp làm" (Upcoming / Committed)
- **Definition**: Contains jobs that the CarePartner has **confirmed**, but the scheduled time has not arrived yet (`booking.status === 'committed'`), as well as currently active shifts (`booking.status === 'in_progress'`).
- **Unmasked Contact Information**: Now that the booking is committed, display full Parent contact details:
  - Quick dial button: `"Gọi 09xxxxxxxx"` via `Linking.openURL('tel:...')`.
  - Quick chat/SMS button: `"Nhắn tin 1-1"`.
- **Shift Readiness & Routing**:
  - Detailed address, landmark notes, and "Xem bản đồ / Chỉ đường" (opens Google Maps / Apple Maps).
  - Time countdown until shift start.
- **Active Shift Handling (`in_progress`)**:
  - If a shift is currently running, prominently display an **Emerald Green Active Shift Banner** with:
    - Live GPS Tracking status (`LocationService`).
    - Toggle GPS consent / Start Tracking.
    - SOS Emergency Button.
- **Action Buttons**:
  - `"Xem chi tiết ca làm"` -> `BookingDetailScreen`.
  - `"Báo bận / Đổi giờ"` -> Reason dialog.

### Tab 3: "Đã hoàn thành" (Completed)
- **Definition**: Contains all jobs successfully finished by the CarePartner (`booking.status === 'completed'`).
- **Card Content**:
  - Completed timestamp (`ended_at`).
  - Net earnings credited: `carepartner_payout_vnd` formatted as currency (e.g. `240.000đ`).
  - Parent Review & Rating: Star rating (1-5 ⭐) and parent's written feedback.
  - Badge: `"Đã giải ngân ví"` / `"Tiền đã vào ví CarePartner"`.
  - Action button: `"Xem biên lai ca làm"`.

### Tab 4: "Lịch sử" (Full Audit History)
- **Definition**: The complete, permanent audit log of ALL jobs associated with this CarePartner. It stores **EVERYTHING**:
  - Completed jobs (`completed`).
  - Jobs cancelled by parent (`cancelled_by_parent`).
  - Jobs cancelled / declined by the student (`cancelled_by_carepartner`).
  - No-show events (`no_show`, showing compensation if applicable: `compensation_vnd`).
  - Legacy rejected applications (`rejected`).
- **Filtering & Audit Visibility**:
  - Quick filter chips: `"Tất cả"`, `"Hoàn thành"`, `"Đã hủy"`, `"Bồi thường"`.
  - Color-coded status badges for instant clarity:
    - Completed: Emerald green badge (`#ECFDF5` / `#0E9F6E`).
    - Cancelled by Parent: Gray badge with explanation (`"Phụ huynh hủy ca"`).
    - Declined by Student: Neutral badge (`"Bạn đã từ chối nhận ca"`).
    - No-Show: Amber/red warning badge.

---

## 🔄 The Confirmation Jump & Transition Workflow

Ensure smooth inter-screen transitions across the application:

1. **Confirmation from `BookingDetailScreen.js`**:
   - Location: `mobile/src/screens/Parent/BookingDetailScreen.js` (used by both roles).
   - In lines ~754-774, when the student taps `"Xác nhận cam kết"`:
     ```javascript
     // Current call:
     await commitBooking(bookingId);
     ```
   - **Update**: Upon successful `commitBooking(bookingId)`:
     - Show alert / toast: `"Đã cam kết nhận đơn thành công! Ca làm đã chuyển sang mục Sắp làm."`
     - Navigate directly to `MyJobsMain` under the `WorkerJobsStack` with params:
       ```javascript
       navigation.navigate('MyJobs', {
         screen: 'MyJobsMain',
         params: { initialTab: 'upcoming', highlightBookingId: bookingId }
       });
       ```
2. **Confirmation from Tab 1 of `MyJobsScreen.js`**:
   - Tapping `"Xác nhận cam kết"` right on the card triggers an inline loading spinner on that card.
   - Calls `commitBooking(booking.id)`.
   - On response:
     - Removes booking from `awaiting_commitment` state.
     - Adds updated booking (`status = 'committed'`) to `upcoming` state.
     - Automatically animates the active tab indicator to `"Sắp làm"`.
     - Updates tab badge counters immediately.

---

## 🏗️ Architecture, Files & Codebase Map

### Relevant Files
| File Path | Role | Action Required |
|---|---|---|
| `mobile/src/screens/Worker/MyJobsScreen.js` | Main CarePartner Jobs Screen | **Full rewrite/upgrade** to the 4-tab Stitch architecture |
| `mobile/src/screens/Parent/BookingDetailScreen.js` | Booking Detail Screen | Update confirmation CTA navigation to jump to `MyJobs` |
| `mobile/src/api/matching.js` | Matching & Booking API Client | Contains `getBookings`, `commitBooking`, `cancelBooking`, `startBooking`, `completeBooking` |
| `mobile/src/navigation/AppNavigator.js` | Navigation Stacks | Verify `WorkerJobsStack` -> `MyJobsMain` wiring & params |
| `mobile/src/screens/Worker/__tests__/MyJobsScreen.acceptance.test.js` | Test Suite | **New comprehensive acceptance test file** |

### API Contracts
1. **`getBookings({ role: 'carepartner' })`**:
   - Returns `{ count: number, results: Booking[] }` or `Booking[]`.
   - Booking model attributes:
     - `id`: string (UUID or pk)
     - `job_title`: string
     - `status`: `'awaiting_commitment'` | `'committed'` | `'in_progress'` | `'completed'` | `'cancelled_by_parent'` | `'cancelled_by_carepartner'` | `'no_show'`
     - `status_label_vi`: Vietnamese display label
     - `seconds_left`: integer (countdown seconds left for awaiting_commitment)
     - `total_value_vnd`: integer
     - `carepartner_payout_vnd`: integer (80% net payout to worker)
     - `parent_name`: string
     - `parent_phone`: string (unmasked only when committed/in_progress)
     - `job_address`: string
     - `first_slot`: `{ date, date_vi, day_of_week_vi, time_from, time_to }`
     - `category_name_vi`: string
     - `compensation_vnd`: integer (if no_show)
     - `review`: `{ rating, comment }` (if completed and reviewed)
2. **`commitBooking(bookingId)`**:
   - `POST /api/matching/bookings/<bookingId>/commit/`
   - Returns `{ id, status: 'committed', status_label_vi: 'Đã cam kết' }`
3. **`cancelBooking(bookingId, { reason_code, note, evidence })`**:
   - `POST /api/matching/bookings/<bookingId>/cancel/`

---

## 🎨 UI/UX Design System Guidelines (Google Stitch UI)

1. **DO NOT change or duplicate the Bottom Tab Bar**:
   - Use standard `ScrollView` / `FlatList` with `contentContainerStyle={{ paddingBottom: 110 }}`.
   - Do NOT render a custom bottom nav bar inside `MyJobsScreen.js`.
2. **Tab Header Component**:
   - 4 horizontal pills with active indicator:
     - `Chờ xác nhận (${countPending})` (Amber dot if count > 0)
     - `Sắp làm (${countUpcoming})` (Brand Orange dot)
     - `Đã hoàn thành (${countCompleted})` (Green dot)
     - `Lịch sử (${countHistory})`
   - Smooth horizontal scroll or flex grid layout with active underline / filled pill styling (`#F26522` background, white text when active).
3. **Safe Area Inset Defensive Pattern**:
   - When calling `useSafeAreaInsets()`, **ALWAYS** wrap in a defensive fallback to prevent Jest crashes when not wrapped with `SafeAreaProvider`:
     ```javascript
     let insets = { top: 12, bottom: 24, left: 0, right: 0 };
     try {
       const safeInsets = useSafeAreaInsets();
       if (safeInsets) insets = safeInsets;
     } catch (_) {}
     ```
4. **Zero Jargon & Vietnamese UI**:
   - Error messages, modal text, button labels, and alerts must be natural, warm Vietnamese.

---

## 🧪 Verification & Acceptance Testing Guidelines

Create an acceptance test file at:
`mobile/src/screens/Worker/__tests__/MyJobsScreen.acceptance.test.js`

### Mandatory Test Cases:
1. **Mount & Multi-source Parallel Fetch**:
   - Verify `MyJobsScreen` mounts cleanly without crashing.
   - Verify it fetches `getBookings({ role: 'carepartner' })` and `getMyJobsAsWorker()`.
2. **4-Tab Segregation & Accurate Badge Counts**:
   - Tab 1: `Chờ xác nhận (1)` (contains `awaiting_commitment` booking).
   - Tab 2: `Sắp làm (1)` (contains `committed` booking).
   - Tab 3: `Đã hoàn thành (1)` (contains `completed` booking).
   - Tab 4: `Lịch sử (4)` (contains completed, cancelled, no-show, and rejected items).
3. **Countdown & Spotlight in Tab 1 ("Chờ xác nhận")**:
   - Verifies countdown timer displays formatted time from `seconds_left`.
   - Verifies parent information and payout amount are visible.
4. **1-Tap Commit Interaction**:
   - Pressing `"Xác nhận cam kết"` in Tab 1 calls `commitBooking(bookingId)`.
   - Verifies optimistic / reactive UI update moving the card into Tab 2.
5. **Full Suite Health Check**:
   - Run `npx jest src/screens/Worker/__tests__/MyJobsScreen.acceptance.test.js` -> MUST PASS 100%.
   - Run `npm test` from `mobile/` -> All 14+ test suites and 115+ tests MUST PASS.

---

## 🚀 Execution Checklist for Claude

1. [ ] Check current git branch: `git branch --show-current` (ensure on `feature/fix-matching-geo-tutors-gps`).
2. [ ] Review existing `mobile/src/screens/Worker/MyJobsScreen.js` and `mobile/src/screens/Parent/BookingDetailScreen.js`.
3. [ ] Rewrite `MyJobsScreen.js` with the 4-tab architecture, real countdown timer, 1-tap commit/decline, unmasked contact info, and Stitch styling.
4. [ ] Update `BookingDetailScreen.js` to navigate to `MyJobs` with `{ initialTab: 'upcoming' }` upon confirming.
5. [ ] Create `mobile/src/screens/Worker/__tests__/MyJobsScreen.acceptance.test.js` and verify it passes.
6. [ ] Run full test suite `npm test` in `mobile/`.
7. [ ] Commit changes with a clean Vietnamese message:
   `git commit -m "Nâng cấp giao diện Việc của tôi của CarePartner với 4 tab vòng đời và luồng chuyển đổi khi xác nhận đơn"`
