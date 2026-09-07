# Prompt 09 — Auto-Commit Booking + Commitment Window

## Context
Quyết định LOCKED của owner (Step 5): **auto-commit** — phụ huynh chọn = booking tạo NGAY ở `awaiting_commitment`, CarePartner KHÔNG accept. "Đã khai rảnh + được chọn = phải đi làm." Đây là prompt trọng yếu nhất về concurrency: chọn CP phải atomic (re-validate slots + hard lock all-or-nothing + đánh dấu not_selected + đổi status job) và chịu được 50 thread song song.

## Requirements (nguồn `flow1-step5-booking-commitment.md`)
- §5.1 flow 10 bước: select → transaction {re-validate slots còn trống (Step 10), tạo Booking `awaiting_commitment`, hard-lock ALL slots all-or-nothing, other candidates `not_selected`, JobPost → `carepartner_selected`} → notify CP (critical,LOUD: "Bạn được giao đơn này vì bạn đã khai rảnh vào khung giờ đó. Vui lòng xem chi tiết. Nếu không thể thực hiện, hãy hủy trong thời gian cho phép.") + notify parent ("Bạn đã chọn CarePartner {name}. Đơn đang chờ hết thời gian cam kết.") → window chạy → hết window không hủy → `committed` (scheduler + lazy check) + 2 notification → slot start → `in_progress` (tap "Bắt đầu" hoặc auto +15 phút) → slot end → `awaiting_review` → `completed` sau reviews hoặc auto +24h.
- §5.2 commitment window theo thời điểm bắt đầu slot SỚM NHẤT: >24h → 60 phút; 6-24h → 30 phút; 1-6h → 15 phút; <1h → 5 phút. Hard cap: window phải kết thúc trước slot start ít nhất 5 phút (`COMMIT_MIN_MARGIN_MIN`) — nếu không đủ → window = 0 → `committed` NGAY.
- Config keys DB/env: `COMMIT_WINDOW_24H=60`, `COMMIT_WINDOW_6H=30`, `COMMIT_WINDOW_1H=15`, `COMMIT_WINDOW_URGENT=5`, `COMMIT_MIN_MARGIN_MIN=5` (phút).
- Penalty mapping (xử lý ở Prompt 10 — ở đây chỉ set đúng trạng thái nguồn): cancel trong window → `declined_in_window` (T0); sau `committed` → T1-T4; không hủy không đi làm → T5.
- §5.4 model Booking ĐÃ CÓ từ Prompt 01 — bổ sung runtime: `commit_deadline` tính đúng, `total_value_vnd` = hourly_rate × hours_per_slot × số slot FROZEN lúc select.
- §5.5 API: `POST /api/jobs/{job_id}/select-carepartner` (header `Idempotency-Key`, 409 `slot_taken` khi thua race); `GET /api/bookings/{id}` (trả commit_deadline, seconds_left, status_label_vi); `POST /api/bookings/{id}/start|complete`; `GET /api/bookings?role=&status=`.

## Acceptance Criteria
1. Parent chọn CP → 201 Booking `awaiting_commitment` + ĐỦ slots hard-locked + candidates khác → `not_selected` (các Booking `proposed` tương ứng) + JobPost → `carepartner_selected` — TẤT CẢ trong 1 transaction; mất điện giữa chừng không để trạng thái lửng.
2. Race: 50 thread cùng select 1 CP+slot → đúng 1 success, 49 HTTP 409 `{"code": "slot_taken"}` + response kèm candidate list mới (refresh).
3. Idempotency: replay cùng `Idempotency-Key` → trả về booking cũ, KHÔNG tạo bản 2 (bảng `IdempotencyRecord(key, response_json, created_at)` unique key, TTL 24h cleanup).
4. `commit_deadline` đúng bảng §5.2 4 biên: start +30h → 60'; +40' → 5'; +4' → window 0 + status `committed` NGAY (không qua awaiting); +26h → 30'; +5h → 15'. Timezone Asia/Ho_Chi_Minh đúng khi slot start là 00:30 hôm sau.
5. Window hết → scheduler flip `committed` + 2 notification ĐÚNG 1 lần mỗi bên ("Đơn đã được xác nhận..." / "CarePartner {name} đã cam kết..."); lazy check: scheduler chết, GET booking → status tự flip trước khi trả response.
6. `total_value_vnd` frozen = rate × hours/slot × slot_count (test recurring 3 slot × 2h × 50k = 300k); KHÔNG đổi khi parent sửa rate sau select.
7. Recurring mà 1 ngày đã bị ai khóa → 409 `{"code": "slot_taken", "conflicted_dates": [...]}`, KHÔNG lock ngày nào (all-or-none) — test đúng checklist spec.
8. `POST /start` chỉ CP của booking; start khi chưa `committed` → 409; auto-start +15 phút sau slot start (beat task Prompt 12 — ở đây expose hook `BookingService.auto_transition()`).
9. Notification `job_assigned` enqueue TRONG transaction, gửi on_commit (Step 12.3.5) — test mock sender: exception sau enqueue → không push được gửi khi rollback.
10. GET /api/bookings phân trang + lọc role (parent/worker) + status; response có `seconds_left` tính realtime, `status_label_vi` từ constants.

## Technical Approach
- `matching/services/booking_service.py`:
  - `select_carepartner(job, carepartner, idem_key, actor)` — `transaction.atomic()` + `select_for_update` trên JobPost + SlotLock insert qua `LockService.hard_lock` (Prompt 03) + validate buffer + tạo booking + proposed→not_selected cho candidates khác + state transition job + enqueue notifications.
  - `commit_window(slot_start, now)` — hàm thuần đọc config, trả (window_minutes, deadline).
  - `auto_transition(now)` — flip awaiting→committed theo deadline; gọi từ scheduler mỗi 30s + lazy trong `BookingSerializer.to_representation`.
- `matching/services/idempotency.py`: decorator/API helper.
- Scheduler `matching/schedulers/booking_watchdog.py` mỗi 30s (pattern scheduler có sẵn; env flag tắt trong test).
- APIs `matching/api/bookings.py`; serializer `BookingSerializer` (KHÔNG chứa elo/effective — nhớ grep test Prompt 02).
- Thêm `Booking.ack_at` (null) — Prompt 02 response speed dùng sau; không bắt buộc logic ở đây ngoài set khi CP mở detail (PUT heartbeat nhẹ).

## Code References
- Spec: `flow1-step5-booking-commitment.md` toàn bộ; `flow1-step10-schedule-lock.md`; `flow1-step12-state-machines.md` §12.2 transitions proposed→awaiting_commitment→committed.
- Tạo: services + api + scheduler + tests như trên; sửa `matching/urls.py`, `matching/models.py` (thêm `IdempotencyRecord`, `Booking.ack_at`).
- Tái sử dụng: `LockService` (03), state helper (05), notification enqueue service khung (11 — nếu 11 chưa merge, dùng stub `matching/services/notify.py::enqueue(user, code, context)` ghi row Notification status=queued; Prompt 11 thay thế sender).
- Tham chiếu chống race: `payments/services.py` (escrow transaction pattern hiện có).

## Testing Checklist (spec §Testing + bổ sung)
- Chọn A Mon 19-21 → awaiting_commitment, slot locked, others not_selected (assert DB).
- 50 threads → 1 thành công 49×409; conflicted_dates đúng với recurring thiếu 1 ngày.
- Window math 5 biên (30h/26h/5h/40m/4m) — freeze time.
- Cancel minute 10/60 window → trạng thái `declined_in_window` (tier T0 do Prompt 10; ở đây assert status).
- Freeze qua deadline → committed + notification đúng 1 lần/bên.
- Scheduler kill → GET flip status (lazy).
- Idempotency replay → 1 booking; key khác cùng body → 409 do slot lock.
- total_value frozen (đổi rate sau select → value giữ nguyên).
- start sai người → 403; start khi awaiting → 409.
- Exception giữa transaction → toàn bộ rollback (slot không lock, không booking, KHÔNG push).

## Edge Cases
- Parent tự chọn chính mình / chọn worker chưa approved → 400/403 với message VI.
- Job `needs_replacement` → select lại hợp lệ (chọn người thay) — cùng endpoint, job state từ needs_replacement → carepartner_selected (Step 12 transition).
- 2 parent chọn 2 CP khác nhau cùng lúc cho 2 job chồng slot → cả 2 atomically, 1 thua 409.
- `commit_deadline` sau slot start (job sắp bắt đầu < 5') → committed ngay tại select (window 0).
- Clock: mọi calc qua `timezone.now()` aware; test freeze dùng mock cùng module.

## Dependencies
- Prompt 01, 02 (elo_delta_applied field, không gọi penalty), 03 (LockService + buffer), 04 (state helper + availability validate khi reschedule), 05 (job slots), 07 (candidates list cho 409 refresh), stub notify từ 11.
