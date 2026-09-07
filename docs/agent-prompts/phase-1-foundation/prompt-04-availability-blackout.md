# Prompt 04 — Availability Rules + Blackout Dates + Reschedule Flow

## Context
Mở rộng lịch tuần hiện có (`WorkerAvailability`) theo đúng 3 rule của Step 9: sửa tự do khi chưa có đơn, khóa khi có đơn (409), và đổi giờ thỏa thuận (reschedule). Bổ sung blackout (nghỉ cụ thể 1 ngày) + chống lạm dụng (14 ngày nghỉ liên tiếp → pause matching). ĐẶC BIỆT: đây là nơi chuẩn hóa field `time_from/time_to` theo spec.

## Requirements (nguồn spec)
- `flow1-step4-carepartner-availability.md`: UX khai báo lịch (7 toggle ngày, multi-window/ngày, validate time_to > time_from, cấm overlap trong cùng ngày — cảnh báo + gợi ý merge); onboarding chặn activate khi 0 window; API contract §API: GET/POST/DELETE/PUT `/api/carepartners/me/availability` + PUT `/bulk`; DELETE 409 khi booking active dùng window; sửa lịch KHÔNG hủy booking sẵn có.
- `flow1-step9-availability-blackout-rules.md`:
  - Rule 1/2: free edit khi không booking ở trạng thái `awaiting_commitment|committed|reschedule_requested|in_progress`; ngược lại 409 `availability_locked_by_booking` + UI khóa (icon + text "Đang có đơn - không thể sửa. Hãy hủy đơn nếu cần.").
  - Rule 3 reschedule: `POST /api/bookings/{id}/reschedule` (new date/time PHẢI nằm trong availability của chính CP), parent nhận `reschedule_requested` critical; deadline trả lời theo lead time (>48h→12h, 24-48h→6h, 6-24h→2h, <6h→30m); reminder 50%; approve → re-lock atomic + ELO `reschedule_ok` +1; decline/hết hạn → CP có 30 phút chọn [Tiếp tục đơn]/[Hủy đơn], không chọn → auto-cancel theo tier hiện tại; max 2 reschedule/booking.
  - §9.2 Blackout: model như spec; tạo blackout trùng booking → 409 `blackout_conflicts_with_booking`; blacklist trong matching hard filter; auto-archive quá khứ (job đêm); max 30 blackout tương lai; 14 ngày nghỉ FULL liên tiếp → `matching_paused=true` + notification `blackout_paused`.
  - §9.4 API additions (reschedule, respond, blackouts CRUD, PATCH availability 409).
- Tương thích ngược: giữ endpoint cũ `/api/worker/availability/` (đang có ở `core/urls.py`) hoạt động — endpoint mới theo spec đặt cạnh trong `matching/urls.py`.

## Acceptance Criteria
1. Sửa/xóa window KHÔNG có booking → thành công ngay; có booking active → HTTP 409 body `{"code": "availability_locked_by_booking"}`.
2. Tạo window overlap trong cùng ngày → 400 với gợi ý merge (body có `merge_suggestion`); khác ngày → OK.
3. Serializer + endpoint mới chuẩn spec field name `time_from/time_to`; window 22:00-01:00 → tự tách 2 row khi lưu; job 23:00-00:30 match đúng (test).
4. Onboarding: API activate/complete profile của worker trả 400 `availability_required` nếu 0 window (chặn ở `CompleteOnboardingAPIView` path mới trong matching, không sửa view cũ).
5. Blackout CRUD: POST trùng booking → 409 `blackout_conflicts_with_booking`; blackout quá khứ bị archive job đêm (beat 00:05); thứ 31 tương lai → 400 `too_many_blackouts`.
6. 14 ngày nghỉ FULL liên tiếp (test seed blackout 14 ngày) → `CarePartnerProfile.matching_paused=true` + notification `blackout_paused` enqueue (mock sender, assert enqueue đúng 1 lần); 13 ngày → không.
7. Reschedule: tạo request mới trong availability → OK, ngoài availability → 400; parent deadline đúng bảng lead time (test 4 biên); reminder 50% (beat job, idempotent); approve → lock cũ mở + lock mới khóa trong CÙNG transaction (test: giữa 2 bước không tồn tại trạng thái lỏng — dùng assert trong test transaction), status quay lại `committed`, ELO +1 qua `EloService.apply_event(reschedule_ok)`.
8. Hết hạn + CP im lặng 31 phút → auto-cancel tier ĐÚNG theo lead time HIỆN TẠI (không tier free), status `expired_no_response`, parent notified, replacement trigger (enqueue event — xử lý thật ở Prompt 10/11; prompt này chỉ phát event `reschedule_expired`).
9. Request thứ 3 trên cùng booking → 400 `reschedule_limit_reached`.
10.available_slots (Prompt 03) đã trừ blackout — test tích hợp điểm này.

## Technical Approach
- Model `RescheduleRequest` (từ Prompt 01): `booking` FK, `new_date/time_from/time_to`, `reason`, `status` (`pending|approved|declined|expired`), `parent_deadline`, `responded_at`, `reminder_sent_at`, index `(booking, status)`.
- Service `matching/services/availability_service.py`: `can_delete_window(window)`, `split_midnight(w)`, `check_14_day_pause(cp)`; `matching/services/reschedule_service.py`: `create_request`, `respond`, `expire_idle` (gọi từ beat mỗi phút).
- Beat scheduler: `matching/schedulers/reschedule_watchdog.py` — mỗi 60s quét: reminder 50%, expiry + 30 phút idle, blackout archive 00:05 hằng ngày, pause check 01:00 hằng ngày. Pattern thread như `core/anomaly_scheduler.py`.
- APIs (matching/urls.py):
  - `GET|POST /api/carepartner/availability` + `DELETE|PATCH /api/carepartner/availability/<uuid>/` + `PUT /api/carepartner/availability/bulk` (spec path `/api/carepartners/me/availability` — dùng path này cho đúng spec, ghi chú deviation cũ `/api/worker/availability/` vẫn sống).
  - `GET|POST|DELETE /api/carepartner/blackouts[/<uuid>/]`.
  - `POST /api/bookings/<uuid>/reschedule` + `POST /api/bookings/<uuid>/reschedule/respond`.
- Event bus nội bộ: `matching/services/events.py` publish đơn giản qua Django signal (`reschedule_expired`, `blackout_paused`...) — các prompt sau订阅.

## Code References
- Spec: `flow1-step9-availability-blackout-rules.md` (toàn bộ), `flow1-step4-carepartner-availability.md` (API + UX).
- Sửa/tạo: `matching/urls.py`, `matching/api/availability.py`, `matching/api/blackouts.py`, `matching/api/reschedule.py`, `matching/services/availability_service.py`, `matching/services/reschedule_service.py`, `matching/schedulers/reschedule_watchdog.py`, serializer mới `matching/serializers.py` (availability/blackout/reschedule).
- Tham chiếu view cũ: `core/views.py` `WorkerAvailabilityListCreateAPIView`, `WorkerAvailabilityDetailAPIView`; model `core/models.py:347` `WorkerAvailability` (weekday 0=Thứ2 — GIỮ NGUYÊN quy ước này).

## Testing Checklist (spec §Testing + bổ sung)
- Weekly Mon 18-21 + booking Mon 19-21 → xóa window → 409 + UI lock (API trả đúng code).
- Blackout thứ 2 tới → job Monday không match CP này (kết nối available_slots).
- Blackout trùng committed booking → 409.
- Reschedule ra ngoài availability → 400.
- Approve → slot cũ mở, slot mới khóa, ELO +1, 2 notification (parent+CP) mỗi thứ 1 lần.
- Expired + idle 31 phút → auto-cancel đúng tier, parent notified, event replacement phát.
- Reschedule thứ 3 → 400.
- 14 ngày full blackout → matching_paused + `blackout_paused` đúng 1 lần.
- Window 22:00-01:00 → 2 row; job 23:00-00:30 match.
- Đổi availability rồi match ngay → dùng dữ liệu mới (cache invalidate qua signal).
- Blackout thứ 31 → 400.

## Edge Cases
- Booking ở `awaiting_commitment` cũng KHÓA window (spec liệt kê rõ 4 trạng thái).
- Bulk replace: nếu ≥1 window mới xóa trúng booking → FAIL TOÀN BỘ (all-or-nothing) với 409.
- Blackout range nhiều ngày (date_from>date_to không có — model 1 ngày; tạo nhiều row qua 1 request `dates[]` — hỗ trợ tối đa 30 tương lai tổng cộng).
- Timezone: ngày xét "hôm nay" theo Asia/Ho_Chi_Minh, không UTC.

## Dependencies
- Prompt 01 (model), Prompt 03 (available_slots + LockService), Prompt 02 (EloService cho +1). Event replacement do Prompt 10/11 xử lý.
