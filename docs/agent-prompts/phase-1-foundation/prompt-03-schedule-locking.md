# Prompt 03 — Schedule Locking + Buffer 90 phút + available_slots()

## Context
Chống double-booking là ràng buộc NON-NEGOTIABLE: soft lock 5 phút giữ chỗ khi phụ huynh đang xem, hard lock ở mức DB khi booking tạo thật, và **buffer 90 phút giữa 2 job liên tiếp của cùng CarePartner** (OPEN-QUESTIONS LOCKED #6). Đồng thời định nghĩa HÀM DUY NHẤT `available_slots()` — mọi nơi (matching, booking, reschedule) phải đi qua hàm này, cấm đọc thẳng bảng lịch tuần.

## Requirements (nguồn spec)
- `flow1-step10-schedule-lock.md` (toàn bộ, ngắn): Rule 1 soft lock 5 phút; Rule 2 hard lock DB constraint; Rule 3 buffer 90' — ví dụ spec: Job 18:00-19:00 → 19:30 FAIL, 20:30 PASS.
- `flow1-step9-availability-blackout-rules.md` §9.3: `available_slots(cp, date) = weekly_windows(weekday) MINUS blackouts MINUS booked_slots (awaiting_commitment|committed|reschedule_requested|in_progress) MINUS slot_locks (soft holds)`; cache theo (cp, date) TTL tối đa 60s, invalidate khi availability/blackout/booking/lock thay đổi; trong transaction booking PHẢI bypass cache; window cắt qua nửa đêm lưu 2 row.
- `flow1-step2-matching-engine.md` §2.2.1 hard filter 3: "Already booked in any overlapping slot"; §2.3: slot job phải nằm TRỌN VẸN trong 1 window availability.
- `flow1-step5-booking-commitment.md` §5.1.2.c: hard-lock ALL slots (all-or-nothing với recurring).

## Acceptance Criteria
1. `LockService.hard_lock(slots, booking, carepartner)` tạo lock type=`hard` trong CÙNG transaction của caller; nếu 1 slot bất kỳ trùng → raise `SlotConflictError` (service tự rollback — KHÔNG lock 1 phần).
2. DB chống overlapping hard-lock: phần override `save()`/`clean()` + query SELECT ... FOR UPDATE trên lock của carepartner trong khung giờ (kết hợp unique/condition phù hợp PostgreSQL). 50 thread chọn đồng thời 1 slot → ĐÚNG 1 thành công, 49 nhận exception ràng buộc (test tích hợp ở Prompt 14, unit test ở đây dùng transaction.atomic + TestCase transaction=True).
3. `validate_buffer(carepartner, slot)` — đúng công thức: khoảng trống giữa job cũ (kết thúc) và job mới (bắt đầu) ≥ 90 phút VÀ giữa job mới (kết thúc) và job sau ≥ 90 phút. Test: job 18:00-19:00, mới 19:30-20:30 → FAIL; 20:30-21:30 → PASS; 20:29 → FAIL (biên).
4. Buffer config từ DB: bảng `MatchingConfig(key, value_json)` seed `BUFFER_MINUTES=90`; không hardcode.
5. `available_slots(cp, date)` trả list các (time_from, time_to) rảnh theo đúng công thức §9.3; loại cả slot có soft lock còn hạn (< 5 phút kể từ tạo).
6. Soft lock: `LockService.soft_lock(carepartner, slots, ttl=300s)` — lock tự hết hạn; beat task dọn lock hết hạn chạy mỗi phút (idempotent); khi tạo hard lock thành công → soft locks trùng bị xóa.
7. Cache: kết quả `available_slots` cached (LocMem/TTL 60s qua `performance/lru_cache.py` pattern hoặc cache framework); invalidation signal sau khi ghi Availability/Blackout/Booking/SlotLock; trong `transaction.atomic` hàm bypass cache (`using_cache=False`).
8. Window 22:00-01:00 → 2 row (22:00-23:59:59 và 00:00-01:00 ngày sau); job 23:00-00:30 match (test đi kèm — lưu ý JobSlot không cho crossing; availability mới cho).
9. Slots bị booking ở trạng thái `awaiting_commitment/committed/reschedule_requested/in_progress` → KHÔNG available; trạng thái hủy/hoàn thành → available lại.
10. Hàm raise `TypeError` nếu truyền ngày không aware / carepartner không phải role worker.

## Technical Approach
- `matching/services/lock_service.py`: class `LockService` với `soft_lock`, `hard_lock`, `release_locks(booking)`, `validate_buffer`, `has_conflict`.
- `matching/services/availability.py`: `available_slots(carepartner, date, use_cache=True)` — SINGLE SOURCE; `expand_weekly_windows(cp, date)`; tách split-midnight ở layer đọc (weekly template vẫn lưu start<end trong ngày, rule 22:00-01:00 được serializer tách khi lưu — phối hợp Prompt 04).
- Row-level lock: `SlotLock.objects.select_for_update().filter(carepartner=..., date=..., ...)` trong `transaction.atomic(Savepoint=False)`.
- Beat task: `matching/schedulers/lock_cleanup.py` thread mỗi 60s (pattern copy từ `core/keepalive_scheduler.py`, start từ `matching/apps.py ready()` với env flag `ENABLE_MATCHING_SCHEDULER` để tắt trong test).
- Trả về object gọn: `SlotStatus(free|soft_locked|hard_locked|booked|blacked_out|buffer_violation)` để matching/debug dùng chung.

## Code References
- Spec: `flow1-step10-schedule-lock.md`, `flow1-step9-availability-blackout-rules.md` §9.3, `flow1-step5-booking-commitment.md` §5.1.
- Tạo: `matching/services/lock_service.py`, `matching/services/availability.py`, `matching/schedulers/lock_cleanup.py`, `matching/apps.py` (bổ sung start scheduler), `matching/tests/test_locks.py`.
- Tham chiếu: `core/services/smart_match.py:24-58` (helper timezone `_make_tz_aware` — tái dùng pattern, KHÔNG import chéo sang luồng cũ), `performance/lru_cache.py` (cache pattern).

## Testing Checklist
- Book 18:00-19:00 → thử 19:30-20:30 FAIL; 20:30-21:30 PASS (đúng ví dụ spec).
- 2 soft lock chồng nhau cùng carepartner → thứ 2 ghi đè/thế chỗ hợp lệ (cùng user không tự chặn).
- Soft lock hết hạn sau 300s (freeze time) → available_slots trả slot lại.
- hard_lock khi 1/3 slot trùng → KHÔNG slot nào được lock (all-or-nothing).
- Booking chuyển `cancelled_by_carepartner` → hard lock tự mở (signal/post_save hook trong service `release_locks`).
- `available_slots` với blackout (tạo blackout qua model trực tiếp) → slot biến mất.
- Cache: đổi availability rồi gọi ngay → dữ liệu mới (invalidate hoạt động); gọi trong atomic → không đọc cache cũ.
- Buffer với 2 job KHÁNG ngày (23:00-00:30 hôm trước vs 01:00 hôm sau) → tính đúng khoảng cách ± ngày.

## Edge Cases
- Job midnight-crossing KHÔNG được phép ở JobSlot (Step 1 time picker trong ngày) nhưng buffer phải vẫn đúng khi CP có job 22:00-23:59 và job mới 00:30 hôm sau (khoảng 31 phút → FAIL).
- DST không áp dụng (VN không DST) — nhưng code vẫn phải dùng aware datetime.
- CarePartner có 2 booking song song ở 2 job khác nhau cùng slot → bị chặn bởi hard lock, không phải buffer.
- Xóa/cancel booking → lock release PHẢI idempotent (gọi 2 lần không lỗi).

## Dependencies
- Prompt 01 (bảng SlotLock, Booking, MatchingConfig seed BUFFER_MINUTES).
- Prompt 04 (blackout — available_slots dùng; nếu 04 chưa xong, test blackout bằng cách tạo model trực tiếp).
- Prompt 09 sẽ gọi `LockService.hard_lock` trong luồng select.
