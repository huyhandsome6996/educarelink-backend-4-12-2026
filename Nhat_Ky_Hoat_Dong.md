
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
