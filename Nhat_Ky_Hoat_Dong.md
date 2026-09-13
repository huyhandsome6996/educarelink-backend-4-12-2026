### Hotfix đăng việc gia sư 'any' → 1.4.7 vc30 (2026-09-14)
- **Lỗi người dùng báo cáo** (screenshot 2:23): đăng việc "Gia sư & Kèm học" hiện modal
  "Chưa thể đăng việc — Ưu tiên gia sư không hợp lệ: 'any'. Chọn 1 trong: student_year_1_2,
  student_year_3_4, graduate, no_preference" → KHÔNG đăng được việc nào khi ưu tiên để mặc định.
- **Nguyên nhân gốc**: mobile TutoringForm.js `SENIORITY_OPTIONS` dùng key `'any'` + default
  state `'any'`, backend `job_schema.validate_job_payload` chỉ nhận 4 giá trị chuẩn trong
  `TUTOR_SENIORITY_PREFERENCES` → 400 mọi lần submit tutoring không chọn rõ ưu tiên.
- **Fix 2 phía (commit a8171be)**: backend normalize `'any'` → `'no_preference'` (app 1.4.6
  đã cài hết lỗi ngay khi Render deploy, không cần update store); mobile đổi key chip +
  default sang `'no_preference'`. Test hồi quy: AC-B9 backend ('any' pass, giá trị lạ vẫn 400),
  AC-M6 mobile (keys ⊆ 4 giá trị chuẩn, chip mặc định no_preference).
- **Verify**: manage.py check OK; matching.tests **232/232 OK**; mobile **17 suites / 138 tests PASS**.
- Bump **1.4.7 / versionCode 30** + RELEASE_NOTES_1.4.7.md + test kỳ vọng version.

### Deploy 1.4.6 vc29 (2026-09-14)
- Render: push main → auto deploy + `migrate` (core.0028) + seed_matching_config (key mới: HARD_DROP_DISTANCE_KM/GEMINI_RERANK_*/template profile_approved). Verify live: `/api/matching/carepartners/me/onboarding-status/` + `/api/tracking/matching-gps-consent/` trả dữ liệu thật với JWT demo → **E2E PASS**.
- EAS build production ANDROID (1.4.6, vc29): FINISHED — [build log](https://expo.dev/accounts/huybodoi123/projects/educarelink/builds/83faf0c9-de8d-414c-826f-f73d6d032b4f).
- Submit CH Play: **track internal — THÀNH CÔNG** (release "1.4.6" vc29 status=completed, thay 1.4.5/vc28; tester nhận update ngay như các bản 1.4.4/1.4.5 trước).
- Track production: Google trả `FAILED_PRECONDITION` khi gán vc29 (cả status completed lẫn staged 50%) — Console cho thấy production CHƯA TỪNG có release (các bản trước đi internal/alpha): tài khoản cá nhân mới phải đạt điều kiện closed-testing (20 tester × 14 ngày) trước khi mở production. Cần promote trong Play Console khi đủ điều kiện — không thể bypass bằng API.
## Matching chuẩn sản phẩm + deploy CH Play 1.4.6 (2026-09-14)

### Bối cảnh
- QA audit 2026-09-13 (HEAD b1dd5c8): CHƯA ĐẠT — GPS drift-kill loại cả pool, không Gemini re-rank,
  không exploration slot cho CP mới, payload push thiếu data.class=critical, DeviceToken không bao giờ được ghi.
- Nhiệm vụ: Task A–G (CODING_AGENT_PROMPT_MATCHING_STANDARD_GPS_NOTIF_CHPLAY.md) → build/submit CH Play.

### Công việc đã làm (Task A–G)
- **Task B — ranking**: XÓA khối MAX_GPS_DRIFT_KM loại cả pool trong matching_service.find_candidates.
  Bán kính → điểm phạt (subscore_distance=0 ngoài bán kính); chỉ hard-drop khi km > HARD_DROP_DISTANCE_KM=80 (MatchingConfig).
  km=None → 50 điểm trung tính (trước đây 100). Sort key giữ nguyên.
- **Task B — Gemini re-rank** (spec 2.2.4/11.2 #8): rerank_candidates() trong gemini_service.py — input top 20 candidate
  (ẨN ELO), output hoán vị + why_recommended_vi 1 câu; timeout 2.5s (ThreadPoolExecutor), lỗi/no key → giữ thứ tự rule;
  log AiCallLog(prompt_key='candidate_rerank'); find_candidates gọi khi pool >= 2 + GEMINI_RERANK_ENABLED (MatchingConfig).
- **Task E — GPS**: User.matching_gps_consent (migration core.0028) tách consent ghép cặp khỏi live-tracking per-task.
  GpsHeartbeatAPIView: chưa consent → 200 gps_sync='no_matching_consent' (không còn 403 im lặng); consent flag ĐỦ để ghi.
  Endpoint mới POST/GET /api/tracking/matching-gps-consent/. sync_user_gps_coordinates(allow_matching_flag=True) cho heartbeat ngoài ca.
- **Task A — exclusive lock**: CandidatesAPIView soft_lock TTL 300s cho mọi CP vừa đề xuất (2 PH không cùng giữ 1 CP 5').
  _find_conflicts đổi semantics: soft lock CỦA CHÍNH CP ở JOB KHÁC mới chặn select (soft lock của job đang xét không tự chặn —
  available_slots(exclude_job=job) bypass). Replacement loại CP có booking declined_in_window/expired_no_response/cancelled_by_carepartner.
- **Task C — cold-start**: signal pre_save+post_save core.User bắt is_approved False→True → coldstart_service.on_worker_approved
  (tạo CarePartnerProfile ELO 1200 band normal + push profile_approved — template seed mới, tổng 19 template).
  LoginAPIView: worker pending nhận JWT + status=pending_approval + permissions=['onboarding']; WorkerMustBeApproved chặn
  bookings/notifications (403) cho pending. Exploration slot trong find_candidates: top N thiếu newbie → chèn 1 newbie vào #N.
  GET /api/matching/carepartners/me/onboarding-status/ (has_skills/has_availability/ready_for_matching).
- **Task D — blackout**: core/services/smart_match.py trừ CarePartnerBlackout (khung giờ giao task start / cả ngày).
- **Task F — chuông/popup**: _build_payload critical thêm data.class='critical' + data.sound. POST /api/matching/device-token/
  (upsert DeviceToken). PATCH /profile/ expo_push_token → upsert DeviceToken. Mobile JobAssignedModal (push + poll 15s,
  Xác nhận/Chi tiết/Từ chối, chuông + rung); NotificationListener playLoud cho MỌI job_assigned. Web: job_assigned_alert.js
  (poll 15s + ding WebAudio + modal cùng 3 nút), worker_gps_heartbeat.js (mở trang + mỗi 5 phút) — include trong _worker_chrome.html.
- **Task G — parity**: SYNC_PARITY.md thêm bảng Flow 1 /api/matching/*; smoke test WebMobileParitySmokeTest (cùng JWT tạo job + đọc bookings).

### Test (số thật, chạy local)
- python manage.py check: 0 issues
- python manage.py test matching.tests tracking.tests_gps_heartbeat tracking.tests_gps_settings: **245/245 OK**
- cd mobile && CI=true npx jest: **17 suites, 137/137 PASS** (thêm jobAssignedModalGps.test.js — 7 case)
- Test mới: test_exclusive_offer (6), test_distance_scoring (8), test_cold_start (8), test_blackout_engine (4), test_job_alerts (6)
- Sửa test cũ: tests_gps_heartbeat (403 → 200 no_matching_consent theo contract Task E — có chú thích),
  test_constants seed count 18→19 (template profile_approved), MyJobsScreen.acceptance mock getOnboardingStatus.

### File chính đã sửa
- matching/: services/matching_service.py, gemini_service.py, lock_service.py, replacement_service.py, notification_service.py,
  coldstart_service.py (NEW), api/jobs.py, api/permissions.py (NEW), api/device_token.py (NEW), api/onboarding.py (NEW),
  api/bookings.py, api/notifications.py, urls.py, constants.py, management/commands/seed_matching_config.py
- core/: models.py (matching_gps_consent), migrations/0028, signals.py (approval hook), views.py (LoginAPIView + profile PATCH DeviceToken)
- core/services/smart_match.py: trừ blackout
- tracking/: services.py, views.py (MatchingGpsConsentAPIView), urls.py, tests_gps_heartbeat.py
- mobile/: App.js, src/components/JobAssignedModal.js (NEW), NotificationListener.js, context/AuthContext.js, api/matching.js, api/tracking.js,
  navigation/AppNavigator.js, screens/Worker/MyJobsScreen.js, WorkerProfileScreen.js, app.json 1.4.6/vc29
- frontend/: static/js/worker_gps_heartbeat.js (NEW), static/js/job_assigned_alert.js (NEW), _worker_chrome.html
- docs: SYNC_PARITY.md, mobile/store-listing/RELEASE_NOTES_1.4.6.md

### Lưu ý cho agent tiếp theo
- matching config mới (seed_matching_config tự nạp): HARD_DROP_DISTANCE_KM=80, GEMINI_RERANK_ENABLED=true, GEMINI_RERANK_POOL=20.
- Render cần migrate (core.0028) khi deploy — build.sh đã tự chạy migrate.
- Soft lock TTL 300s: parent xem candidates → 8 CP bị giữ 5 phút cho job đó; select chính job vẫn OK (exclude_job).

## "Việc của tôi" 4 tab vòng đời CarePartner + luồng xác nhận booking + parity web (2026-09-13)

### Công việc đã làm
- Viết lại MyJobsScreen.js theo KIẾN TRÚC 4 TAB VÒNG ĐỜI: Chờ xác nhận (awaiting_commitment) / Sắp làm (committed + in_progress — in_progress luôn đầu danh sách) / Đã hoàn thành (completed + awaiting_review) / Lịch sử (audit log đầy đủ + việc legacy TaskApplication). Trước đây đơn awaiting_commitment bị bỏ qua hoàn toàn.
- Tab 1: countdown thời gian thực từ booking.seconds_left ("Còn X phút Y giây để xác nhận", <10 phút chuyển đỏ), hết hạn → vô hiệu nút + tự đồng bộ backend sau 4s; nút Xác nhận cam kết (commitBooking) cập nhật cục bộ + tự chuyển sang tab Sắp làm; nút Từ chối mở modal lý do (8 mã CANCEL_REASONS, force majeure cần note ≥ 20 ký tự) → cancelBooking; badge CCCD đã xác minh + MoMo Escrow; thu nhập ròng carepartner_payout_vnd (fallback 80%).
- Tab 2: liên hệ phụ huynh số thật (tel:/sms:), Chỉ đường Google Maps theo toạ độ job, Báo bận/Đổi giờ (requestReschedule Step 9 Rule 3), banner Emerald cho ca đang diễn ra + Kết thúc ca (completeBooking).
- Tab 3: tiền đã vào ví, thời gian hoàn thành (ended_at), "Phụ huynh chưa đánh giá" khi chưa có review, Xem biên lai.
- Tab 4: audit log đầy đủ (kể cả completed), chip lọc Tất cả/Hoàn thành/Đã hủy/Bồi thường, badge "Bạn đã từ chối nhận ca", bồi thường compensation_vnd, kháng cáo ELO; sắp mới kết thúc trước.
- Confirmation Jump: BookingDetailScreen nhánh CarePartner sau commitBooking → Alert "Xem ca sắp làm" → navigate MyJobs/MyJobsMain với initialTab='upcoming' + highlightBookingId (viền cam 2s + auto scroll).
- Parity web worker_jobs.html: nâng cấp 2 tab cũ → 4 tab tương đương mobile, thêm commit/reject đơn awaiting (countdown tự đếm từng giây, hết hạn vô hiệu nút + refetch), modal lý do từ chối, SĐT phụ huynh + Chỉ đường cho committed, biên lai cho completed, badge bồi thường.
- Serializer booking bổ sung (additive): parent_info.is_verified, started_at, ended_at.
- Test mới: mobile/src/screens/Worker/__tests__/MyJobsScreen.acceptance.test.js — 7 case (mount/API, badge 4 tab, countdown/payout/CCCD, commit thành công chuyển tab, commit lỗi giữ nguyên + Alert, Confirmation Jump highlight, Lịch sử audit log + bồi thường).

### File đã sửa
- mobile/src/screens/Worker/MyJobsScreen.js: viết lại toàn bộ (2 tab → 4 tab vòng đời)
- mobile/src/screens/Parent/BookingDetailScreen.js: handleCommitAndJump — chỉ nhánh CarePartner
- frontend/templates/frontend/worker_jobs.html: 4 tab + commit/reject + liên hệ + biên lai
- matching/api/bookings.py: _booking_dict thêm is_verified/started_at/ended_at
- frontend/tests_n_chat_entry_points.py: parser nhận biến thể isLegacy && item.task_status (ý nghĩa assertion giữ nguyên)
- mobile/src/screens/Worker/__tests__/MyJobsScreen.acceptance.test.js: NEW — 7 acceptance case

### Lệnh đã chạy
- npx jest (mobile): 15/15 suites, 122/122 PASS (baseline trước khi sửa: 115/115)
- python3.13 manage.py test matching: 185/185 OK
- python3.13 manage.py test frontend.tests_n_chat_entry_points: worker test xanh; 3 FAIL MyTasksScreen (parent) là lỗi CŨ có sẵn trên base commit (đã verify bằng git stash — không do thay đổi này)

### Lưu ý cho agent tiếp theo
- Booking payload CHƯA có review (Review model gắn Task legacy) → Tab 3 hiển thị "Phụ huynh chưa đánh giá". Nếu cần review thật cho booking flow: thêm model/API riêng.
- Tracking/SOS backend gắn Task (task_id) — booking flow chưa tích hợp → GPS toggle + SOS chỉ hoạt động cho việc legacy; ca booking in_progress có hotline trong BookingDetail.
- MoMo Escrow per-booking chưa có field trạng thái → badge "MoMo Escrow bảo đảm" mang tính mô tả chính sách, không phải trạng thái escrow thật.
- 3 test frontend MyTasksScreen (parent mobile) FAIL có sẵn từ trước (cùng kiểu parser đã lỗi thời sau rewrite Stitch) — nên có task riêng fix.

## Merge-safety: khôi phục N-003 chat phụ huynh + bỏ dữ liệu demo + fix GPS env (2026-09-13)

### Bối cảnh
- Commit 7320253 trên feature/fix-matching-geo-tutors-gps bị QA chặn merge vì 3 BLOCKER:
  (A) regression N-003 — MyTasksScreen bản Stitch rewrite XOÁ 2 nút chat của phụ huynh
  (in_progress + completed); ghi chú trước đây "3 FAIL là pre-existing trên base" SAI so
  với origin/main (3 test này PASS khi chạy trên main).
  (B) dữ liệu demo bịa trên thẻ live ("18:00 – 20:00", "45/120", "38%", "Bán kính 200m",
  "Cập nhật 45s trước", diary excerpt, "Đã đánh giá 5 sao" mặc định, '16/09/2026',
  candidateCount || 3).
  (C) backend/settings.py gán GPS_FRESHNESS_HOURS / MAX_GPS_DRIFT_KM 2 lần — khối
  hardcode cuối file GHI ĐÈ biến môi trường.

### Công việc đã làm
- BLOCKER A (backend bridge — phương án (i) của QA "create/link a Task khi booking
  committed/in_progress"): matching.Booking thêm FK nullable `task` → core.Task
  (migration 0004_booking_task_link). Service mới matching/services/booking_task_bridge.py
  tạo Task mirror + TaskApplication(accepted) khi booking → in_progress (signal chat tự
  MỞ conversation — không sửa chat/core), đồng bộ vòng đời qua hook trung tâm trong
  state.transition(): awaiting_review → Task completed + completed_at (chat đóng +24h);
  hủy/no_show → Task cancelled (chat đóng ngay). Idempotent, atomic, nuốt lỗi (lỗi mirror
  không phá luồng tiền/trạng thái).
- Serializer _booking_dict: thêm `task_id` (client DÙNG CHO navigate('Chat') — KHÔNG còn
  truyền job_id JobPost UUID làm taskId như trước) + `review` {rating, comment} (rating
  thật cho Blocker B); select_related task__review tránh N+1.
- BLOCKER A (mobile parent): MyTasksScreen — khôi phục chat legacy: LegacyTaskCard với
  nhánh `{task.status === 'in_progress' && ...}` (nút "Nhắn tin với Carepartner") và
  `{task.status === 'completed' && ...}` (nút "Chat (24h)"), onPress navigate('Chat')
  TRỰC TIẾP (không qua checkConsent/LiveTracking — đúng root cause N-003); thẻ booking
  InProgressBookingCard + HistoryBookingCard(completed) có nút chat với taskId =
  booking.task_id (ẩn khi null — không ship nút 404); BỎ nút chat sai ở CommittedBookingCard
  (chat chưa tồn tại ở committed) — giữ gọi điện; BookingDetailScreen nhánh PHỤ HUYNH
  (ActiveShiftView + CompletedShiftView) thêm nút chat tương tự; nhánh CarePartner
  KHÔNG đụng đến.
- BLOCKER B: giờ ca hiển thị từ first_slot; progress "Đã làm X/Y phút" + thanh % TÍNH
  TỪ started_at + slot (ẩn khi thiếu); radar GPS thay bằng trạng thái THẬT từ
  checkConsent + getLiveLocation (task mirror) — không có → "Chưa có tín hiệu" trung
  thực; ngày lịch sử từ ended_at (thiếu → '—'); diary excerpt bịa XOÁ — chỉ còn link
  "Xem toàn bộ" khi có task_id; "Đã đánh giá 5 sao" mặc định XOÁ — hiển thị rating thật
  từ booking.review / CTA "Đánh giá Carepartner" (taskId = task mirror, không job_id);
  candidateCount thật — 0 thì hiện "Chưa có sinh viên nào gần nhà".
- Chống trùng thẻ (mirror dedup): task/application legacy trùng booking.task_id bị lọc
  khỏi MyTasksScreen (parent mobile), MyJobsScreen (worker mobile) và worker_jobs.html
  (web) — 1 ca chỉ 1 thẻ; parent_tasks.html (web, legacy-only) tự động hiển thị mirror
  như task thường → web phụ huynh có chat đúng cổng hiện có, không trùng.
- BLOCKER C: xoá khối hardcode GPS cuối backend/settings.py (1 nguồn sự thật: env
  với default 48h/50km) + test mới tracking/tests_gps_settings.py (3 test: env override
  qua subprocess, default, chặn regression "gán 2 lần").
- Tests mới/cập nhật: matching/tests/test_booking_task_bridge.py (14 test: tạo mirror,
  mở chat, đóng +24h, hủy đóng ngay, idempotent, serializer task_id/review, mirror fail
  không phá booking, JobPost không bị hook); MyTasksScreen.renderSmoke.test.js cập nhật
  +3 test (chat trong ca điều hướng đúng taskId mirror, review thật, legacy chat + dedup
  mirror) và KHÔNG còn yêu cầu chuỗi demo; giữ nguyên ý nghĩa frontend/tests_n_chat_entry_points.py
  (không xoá/skip test nào — 3 test parent chuyển FAIL → PASS nhờ phục hồi chat).

### File đã sửa
- backend/settings.py (xoá 2 dòng hardcode), tracking/tests_gps_settings.py (NEW)
- matching/models.py + matching/migrations/0004_booking_task_link.py (NEW)
- matching/services/booking_task_bridge.py (NEW), matching/services/state.py (hook)
- matching/api/bookings.py (task_id + review + select_related)
- matching/tests/test_booking_task_bridge.py (NEW — 14 test)
- mobile/src/screens/Parent/MyTasksScreen.js (LegacyTaskCard NEW, chat N-003, Blocker B)
- mobile/src/screens/Parent/BookingDetailScreen.js (chat + review thật — nhánh phụ huynh)
- mobile/src/screens/Worker/MyJobsScreen.js + frontend/templates/frontend/worker_jobs.html (dedup mirror)
- mobile/src/screens/Parent/__tests__/MyTasksScreen.renderSmoke.test.js (cập nhật +3)

### Lệnh đã chạy (kết quả thật)
- python3.13 manage.py check: 0 issues
- python3.13 manage.py test matching: 199/199 OK (185 cũ + 14 mới; GPS drift vẫn loại
  CP đăng ký Huế GPS Hà Nội)
- python3.13 manage.py test tracking.tests_gps_heartbeat: 9/9 OK
- python3.13 manage.py test tracking.tests_gps_settings: 3/3 OK
- python3.13 manage.py test frontend.tests_n_chat_entry_points: 10/10 OK (3 FAIL → 0)
- python3.13 manage.py test chat: 44/44 OK; tracking: 222/222 OK
- cd mobile && npm test -- --watchAll=false --ci: 16 suites / 130/130 PASS

### Lưu ý cho agent tiếp theo
- Chat/tracking/đánh giá cho Flow 1 hoạt động qua TASK MIRROR (booking.task_id) —
  KHÔNG truyền job_id làm taskId. Booking cũ (trước deploy 0004) chưa có mirror →
  nút chat/review tự ẩn (trung thực), không 404.
- Mirror chỉ tạo khi booking → in_progress (không tạo ở committed) — chính sách cửa
  sổ chat N giữ nguyên: mở lúc bắt đầu ca, đóng 24h sau kết thúc.
- N-002 worker mobile đã xanh từ trước và được giữ nguyên.
