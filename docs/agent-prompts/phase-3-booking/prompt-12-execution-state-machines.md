# Prompt 12 — Job Execution Flow + State Machine Enforcement + Beat Tasks

## Context
Step 12 chốt 2 state machine (JobPost 13 trạng thái, Booking 16 trạng thái) với luật toàn cục: transition không liệt kê → 409 `InvalidTransition`; MỖI transition ghi `StateTransitionLog`; side effects (lock/ELO/đền bù/notification enqueue) CÙNG transaction; notification gửi sau commit; client KHÔNG set status trực tiếp; `disputed` đóng băng ELO; beat tasks phải re-run an toàn. Prompt này: (a) bộ thực thi transition dùng chung (nâng cấp helper của Prompt 05 thành bộ đầy đủ), (b) toàn bộ beat tasks chu kỳ, (c) API luồng thực hiện đơn (start/complete/review/dispute).

## Requirements (nguồn `flow1-step12-state-machines.md`)
- §12.1 JobPost transitions bảng (draft→published→ai_parsing→ai_parsed→matching→carepartner_selected→in_progress→completed; needs_admin_review; needs_replacement↔carepartner_selected/matching; cancelled_by_parent; expired).
- §12.2 Booking transitions 22 dòng (đủ proposed/not_selected/awaiting_commitment/committed/reschedule_requested/in_progress/awaiting_review/completed/declined_in_window/cancelled_by_*/suspected_no_show/no_show/no_show_unconfirmed/expired_no_response/disputed).
- §12.3 8 luật toàn cục (409; log 1 row/transition; idempotent per (booking, reason_code) với side effect tài chính; atomic; on_commit notify; client không set status; disputed freeze ELO; label VI duy nhất).
- §12.4 StateTransitionLog đã có từ Prompt 01.
- Happy path + checklist spec: walk draft→completed có log mỗi bước; draft→completed trực tiếp → 409; disputed chặn ELO; beat re-run không duplicate.
- Luồng thực hiện (từ Step 5 §5.1.7-8 + Step 12): slot start → CP tap "Bắt đầu" (hoặc auto +15'); slot end → `awaiting_review` → cả 2 review → `completed` (hoặc auto +24h); ELO reward áp tại completed (job_completed +12, review_* theo sao, positive_review_text +4 qua Gemini sentiment, streak, clean_month).

## Acceptance Criteria
1. `matching/services/state.py::transition_to(instance, to, actor, reason)` — dùng cho JobPost + Booking; transition ngoài bảng → raise `InvalidTransition` → view trả 409 `{"code": "invalid_transition", "from": ..., "to": ...}`; MỖI transition thành công ghi ĐÚNG 1 StateTransitionLog (entity, entity_id, from, to, actor, actor_user, reason).
2. Refactor: mọi view/service từ Prompt 05-11 đi qua helper này (grep test: cấm gán trực tiếp `.status =` ngoài module state — test quét AST/regex `matching/` trừ constants.py).
3. Beat tasks (tất cả idempotent — chạy 2 lần không tạo transition/notification trùng, có `StateTransitionLog` làm nguồn kiểm):
   a. Mỗi 30s: commitment window hết hạn → committed (Prompt 09);
   b. Mỗi 60s: slot start + chưa start + 15' → suspected_no_show (Prompt 10);
   c. Mỗi 60s: auto-start tại start+15' (booking committed → in_progress nếu CP không tap — ĐÚNG Step 5.1.7);
   d. Mỗi 5': slot end → awaiting_review + notification `review_requested` info cho 2 bên;
   e. Hằng 00:30: awaiting_review quá 24h → completed + apply ELO rewards;
   f. Hằng 00:10: JobPost start date đã qua mà chưa booking thành công → `expired` + notify parent (checklist Step 12 AC7);
   g. Mỗi phút: reminder 60m trước slot (Prompt 11 đã có — đăng ký chung registry beat);
   h. Reschedule watchdog (Prompt 04) — đăng ký chung.
4. Review flow: `POST /api/bookings/{id}/review` (rating 1-5 + comment, mỗi bên 1 lần — unique (booking, reviewer)) → khi CẢ HAI review xong → booking `completed` + job `completed` (nếu mọi slot xong) → apply ELO: job_completed +12 (đúng giờ: started_at ≤ slot_start+15'), review_5/4/3/bad theo sao, positive_review_text +4 nếu Gemini sentiment > 0.6 (dùng gemini_client Prompt 06, fallback bỏ qua điểm này khi AI lỗi), streak_3/5/10, clean_month.
5. Auto-complete +24h mà chỉ 1 bên review → vẫn completed, chỉ áp điểm review của bên đã đánh giá.
6. Dispute: `POST /api/bookings/{id}/dispute` (bất kỳ bên, note bắt buộc) → `disputed` — ĐÓNG BĂNG mọi ELO thay đổi của booking này (guard trong EloService: booking.status == disputed → hoãn apply, job beat quét lại khi admin xử xong); admin resolve → apply/reverse theo quyết định (transition disputed → completed/no_show/cancelled_*).
7. `in_progress → awaiting_review` đúng giờ kết thúc slot (time end local VN); booking recurring N slots → Booking mỗi slot? KHÔNG — 1 Booking/job nhưng track tiến độ qua JobSlot.status (`locked→done`); `completed` job chỉ khi TẤT CẢ slot done + reviews xong (spec: all slots done and reviewed).
8. Vietnamese label: mọi API response status kèm `status_label_vi` từ `STATUS_LABELS_VI`; test không có enum raw nào lộ (serializer fields).
9. ELO apply idempotent: webhook completed bắn 2 lần → +12 một lần (unique (booking, reason_code) đã có).
10. Toàn bộ scheduler start/stop qua 1 registry `matching/schedulers/registry.py`, env `ENABLE_MATCHING_SCHEDULER`, tránh start trùng khi Django autoreload (pattern keepalive hiện có).

## Technical Approach
- Nâng cấp `matching/services/state.py`: TRANSITIONS map từ constants (Prompt 01) + hooks pre/post per transition (registry callable) để các service đăng ký side effect đúng thứ tự: validate → ghi log → side effects → commit.
- `matching/services/review_service.py`: submit review + aggregate + gọi EloService bundle.
- `matching/schedulers/beat.py`: 1 thread chính chạy registry các job (interval dict), safe-rerun bằng cách check trạng thái đích trước khi transition (`if booking.status != expected: skip`).
- Dispute guard: `EloService.apply_event` kiểm tra booking status; nếu disputed → ghi vào `EloDeferred` (row chờ) — beat xử lý khi resolve.
- APIs: `matching/api/bookings.py` bổ sung start/complete/review/dispute; admin view resolve dispute (Django Admin action + bắt buộc admin_note).

## Code References
- Spec: `flow1-step12-state-machines.md` toàn bộ; `flow1-step5-booking-commitment.md` §5.1.7-8; `flow1-step6-hidden-elo.md` §6.3 (reward events).
- Sửa: `matching/services/state.py`, `matching/api/bookings.py`, `matching/urls.py`, `matching/models.py` (Booking.review relation hoặc dùng model `BookingReview` mới), scheduler registry.
- Tạo: `matching/services/review_service.py`, `matching/schedulers/beat.py`, tests `matching/tests/test_state_machine.py`, `test_review_flow.py`.
- Tham chiếu: `core/views.py::TaskUpdateStatusAPIView` (chỉ tham khảo, không sửa), `core/anomaly_scheduler.py` (pattern).

## Testing Checklist (spec §Testing — 12 dòng + bổ sung)
- Walk happy path 8 bước → mỗi hop đúng 1 log row.
- draft → completed trực tiếp → 409.
- Cancel trong window → declined_in_window + T0 + notify + replacement (ghép 09/10/11).
- Deadline hết → committed + 2 notification đúng 1 lần.
- start+15' chưa start → suspected_no_show; parent "Không đến" → no_show + T5 + đền bù + replacement.
- Parent im 24h → no_show_unconfirmed T4 only.
- Reschedule approved → re-lock + ELO +1 (04).
- Reschedule expired + 31' idle → expired_no_response đúng tier.
- Dispute → completion sau đó KHÔNG áp ELO cho tới admin resolve.
- Cancel 2 lần → 1 penalty/compensation/notification.
- Mock exception sau enqueue → không push cho trạng thái đã rollback.
- Beat chạy 2 lần liên tiếp → không duplicate transition/log.

## Edge Cases
- 2 slot cùng job: slot 1 xong (done), slot 2 bị cancel bởi parent → job kết thúc `cancelled_by_parent`, slot 1 giữ completed + ELO job_completed tính cho slot 1 (business: mỗi slot hoàn thành đều +12 — GHI CHÚ quyết định này trong code, khớp "Job completed on time" per-slot).
- Booking committed nhưng job bị parent cancel đúng lúc slot đang in_progress → theo 7.7 (CP +10 nếu <3h).
- CP start TRƯỚC slot start 10 phút → cho phép (không có rule cấm start sớm; ghi log).
- Review sau completed (+24h auto) → vẫn cho review muộn nhưng KHÔNG áp lại ELO review (config `LATE_REVIEW_ELO=false`).
- Server restart giữa beat → job tiếp theo chạy lại an toàn (idempotent theo trạng thái).

## Dependencies
- Prompt 01 (constants/log), 02 (EloService + deferred guard), 03-04, 05 (state helper gốc), 09, 10, 11.
- Sau prompt này luồng backend Flow 1 KHÉP ĐẦY ĐỘNG.
