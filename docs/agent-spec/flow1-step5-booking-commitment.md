# Flow 1 - Step 5: Booking + Commitment (LOCKED model: auto-commit)

## Owner decision (locked)
**Option 2 - Auto-commit.** Parent selects a CarePartner -> booking is created immediately in `awaiting_commitment`. The CarePartner does NOT accept it. Because they already declared that slot as free, being selected = a binding assignment.

> "Đã khai rảnh + được chọn = phải đi làm."

## 5.1 Flow
1. Parent taps "Chọn" on a candidate card (Step 3 UI).
2. Backend, inside ONE transaction:
   a. Re-validate that the slots are still free (Step 10 lock).
   b. Create `Booking(status=awaiting_commitment)`.
   c. Hard-lock ALL slots of the job (all dates if recurring, all-or-nothing).
   d. Mark the other candidates `not_selected`.
   e. Set `JobPost.status = carepartner_selected`.
3. Notify the CarePartner (class `critical`, loud sound):
   > "Bạn được giao đơn này vì bạn đã khai rảnh vào khung giờ đó. Vui lòng xem chi tiết. Nếu không thể thực hiện, hãy hủy trong thời gian cho phép."
4. Notify the parent:
   > "Bạn đã chọn CarePartner {name}. Đơn đang chờ hết thời gian cam kết."
5. The commitment window runs (see 5.2).
6. No cancel inside the window -> status becomes `committed` (scheduler + lazy check on read).
   - CarePartner: "Đơn đã được xác nhận. Bạn cần có mặt đúng giờ."
   - Parent: "CarePartner {name} đã cam kết thực hiện đơn của bạn."
7. At slot start -> `in_progress` (CarePartner taps "Bắt đầu", or auto at start + 15 min).
8. At slot end -> `awaiting_review` -> `completed` after both reviews, or auto-complete at +24h.

## 5.2 Commitment window
| Job starts | Window |
|---|---|
| more than 24h from now | 60 min |
| 6-24h | 30 min |
| 1-6h | 15 min |
| less than 1h | 5 min |

Hard cap: the window must end at least 5 minutes before the slot start. Otherwise the window is 0 and the booking goes straight to `committed`.

Config keys (DB/env, never hardcoded): `COMMIT_WINDOW_24H`, `COMMIT_WINDOW_6H`, `COMMIT_WINDOW_1H`, `COMMIT_WINDOW_URGENT`, `COMMIT_MIN_MARGIN_MIN`.

Penalty mapping:
- Cancel INSIDE the window = decline -> tier **T0** (lightest, see Step 7).
- Cancel AFTER `committed` = cancellation -> tiers **T1-T4** by lead time.
- No cancel and no show -> **T5**.

## 5.3 Force majeure (bất khả kháng)
The CarePartner must pick a reason when cancelling:

| Code | Vietnamese label | Class |
|---|---|---|
| `school_schedule` | Trùng lịch học đột xuất | force_majeure (note required) |
| `health` | Sức khỏe không tốt | force_majeure (note required) |
| `family_emergency` | Việc gia đình khẩn cấp | force_majeure (note required) |
| `accident` | Tai nạn / sự cố di chuyển | force_majeure (evidence recommended) |
| `wrong_job_info` | Thông tin công việc không đúng mô tả | force_majeure |
| `transport` | Không thể di chuyển | normal_cancel |
| `personal` | Lý do cá nhân | normal_cancel |
| `other` | Khác (bắt buộc ghi chú) | normal_cancel |

Rules:
- force_majeure => ELO delta multiplied by 0.5, and eligible for a zero-penalty appeal if an admin approves.
- A note is REQUIRED for force_majeure codes (min 20 characters). Evidence upload is optional (max 3 files, 5MB each, jpg/png/pdf).
- Force majeure NEVER removes the parent notification and NEVER stops auto-replacement. The parent is never left without a job.
- Anti-abuse: max 2 force-majeure cancels per rolling 30 days. From the 3rd onward the full penalty applies regardless of the reason code.

## 5.4 Data model
```python
class Booking(models.Model):
    id = UUIDField(primary_key=True)
    job = FK(JobPost, related_name="bookings")
    carepartner = FK(User, related_name="carepartner_bookings")
    parent = FK(User, related_name="parent_bookings")
    status = CharField(choices=BookingStatus)      # see Step 12
    selected_at = DateTimeField()
    commit_deadline = DateTimeField()              # selected_at + window
    committed_at = DateTimeField(null=True)
    started_at = DateTimeField(null=True)
    ended_at = DateTimeField(null=True)
    total_value_vnd = PositiveIntegerField()       # frozen at selection time
    cancel_reason_code = CharField(blank=True)
    cancel_class = CharField(blank=True)           # force_majeure | normal_cancel
    cancel_note = TextField(blank=True)
    cancel_evidence = JSONField(default=list)
    cancelled_at = DateTimeField(null=True)
    cancelled_by = CharField(blank=True)           # carepartner | parent | system | admin
    compensation_vnd = PositiveIntegerField(default=0)
    elo_delta_applied = IntegerField(default=0)

    class Meta:
        indexes = [
            Index(fields=["carepartner", "status"]),
            Index(fields=["job", "status"]),
            Index(fields=["status", "commit_deadline"]),
        ]
        constraints = [
            UniqueConstraint(fields=["job", "carepartner"], name="uniq_job_carepartner_booking"),
        ]
```

## 5.5 API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/jobs/{job_id}/select-carepartner` | body: carepartner_id; header: Idempotency-Key; 409 `slot_taken` if the race is lost |
| GET | `/api/bookings/{id}` | returns `commit_deadline`, `seconds_left`, `status_label_vi` |
| POST | `/api/bookings/{id}/cancel` | body: reason_code, note, evidence[] |
| POST | `/api/bookings/{id}/start` | CarePartner only |
| POST | `/api/bookings/{id}/complete` | moves to `awaiting_review` |
| GET | `/api/bookings` | query: role, status; paginated |

## Acceptance Criteria
1. Selecting a candidate creates a booking WITHOUT requiring CarePartner acceptance.
2. All job slots are locked atomically; a concurrent second parent gets HTTP 409 plus a refreshed candidate list.
3. `commit_deadline` follows table 5.2 and is timezone-correct (Asia/Ho_Chi_Minh).
4. Auto-transition `awaiting_commitment` -> `committed` works via the scheduler AND via a lazy check on any read.
5. The CarePartner receives a push with sound within 10 seconds of selection.
6. Cancel inside the window records `declined_in_window`; after it, `cancelled_by_carepartner` with the correct tier.
7. force_majeure codes require a note of at least 20 characters; evidence is optional and validated for size and type.
8. `total_value_vnd` is computed at selection time and frozen (it drives compensation).
9. Recurring jobs lock ALL dates or none.
10. No double booking is possible under concurrent load.

## Testing Checklist
- Parent selects A for Mon 19-21h -> `awaiting_commitment`, slot locked, other candidates `not_selected`.
- 50 concurrent threads select the same CarePartner + slot -> exactly 1 success, 49 get 409.
- Window maths: start in 30h -> 60min; start in 40min -> 5min; start in 4min -> window 0 and status `committed` immediately.
- Cancel at minute 10 of a 60min window -> tier T0.
- Freeze time past the deadline -> `committed`, both notifications sent exactly once.
- Recurring Mon/Wed/Fri where Wed is already taken -> 409 with `conflicted_dates`, zero locks created.
- force_majeure cancel with a 5-character note -> HTTP 400.
- Third force_majeure cancel within 30 days -> full penalty applied.
- Kill the scheduler -> a GET on the booking still flips the status to `committed`.
- Replay the select request with the same Idempotency-Key -> only one booking exists.
