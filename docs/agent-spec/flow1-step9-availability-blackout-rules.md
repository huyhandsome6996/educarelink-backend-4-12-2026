# Flow 1 - Step 9: Availability Edit Rules + Blackout Dates

Extends Step 4 (weekly availability declaration) with the three approved editing rules.

## 9.1 Approved rules
**Rule 1 - Free edit when there is no booking.**
The CarePartner can add, change or delete any weekly availability window as long as no booking in `awaiting_commitment`, `committed`, `reschedule_requested` or `in_progress` uses that window.

**Rule 2 - Locked when booked.**
If a booking exists on a window, that window CANNOT be silently edited or deleted. The CarePartner must cancel the booking through the official cancel flow (Step 7), which applies the penalty.
- UI: the row shows a lock icon plus the text "Đang có đơn - không thể sửa. Hãy hủy đơn nếu cần."
- API returns HTTP 409 with code `availability_locked_by_booking`.

**Rule 3 - Reschedule by mutual agreement.**
The CarePartner may request a time change instead of cancelling.
1. `POST /api/bookings/{id}/reschedule` with a new date / time_from / time_to. The new time MUST be inside their own declared availability.
2. The parent receives `reschedule_requested` (critical, loud sound):
   > "CarePartner {name} đề xuất đổi buổi từ {old} sang {new}. Bạn có đồng ý không?"
3. Parent response deadline:
   | Job starts | Parent deadline |
   |---|---|
   | more than 48h | 12h |
   | 24-48h | 6h |
   | 6-24h | 2h |
   | under 6h | 30 min |
   A reminder `reschedule_answer_needed` is sent at 50% of the deadline.
4. Parent APPROVES -> old locks released, new slots locked atomically, status stays `committed`, CarePartner gets `reschedule_ok` (+1 ELO).
5. Parent DECLINES, or the deadline passes with no answer -> the request becomes `expired`. The CarePartner then has 30 minutes to choose [Tiếp tục đơn] or [Hủy đơn]. If they choose nothing, the system auto-cancels at the CURRENT lead time and applies the matching Step 7 tier. There is no free exit.
6. Max 2 reschedule requests per booking. A 3rd is rejected -> cancel only.

## 9.2 Blackout dates (one-off unavailability)
Weekly availability means "I am usually free Monday 18-21h". A blackout means "but not on this specific date".

```python
class CarePartnerBlackout(models.Model):
    id = UUIDField(primary_key=True)
    carepartner = FK(User, related_name="blackouts")
    date = DateField()
    time_from = TimeField(null=True)      # null = whole day
    time_to = TimeField(null=True)
    reason = CharField()                  # exam|health|family|travel|personal|other
    note = TextField(blank=True)
    created_at = DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [UniqueConstraint(fields=["carepartner", "date", "time_from", "time_to"],
                                        name="uniq_blackout_slot")]
        indexes = [Index(fields=["carepartner", "date"])]
```

Rules:
- Creating a blackout that overlaps an existing booking -> HTTP 409 `blackout_conflicts_with_booking`. The CarePartner must cancel or reschedule the booking first.
- Blackouts are applied in the Step 2 hard filters: a blacked-out slot is NOT available.
- Past blackouts are auto-archived by a nightly job.
- Max 30 active future blackouts.
- Anti-abuse: after 14 consecutive fully blacked-out days, set `CarePartnerProfile.matching_paused = true` and send `blackout_paused`. A blackout covering everything is effectively an inactive account.
- UI: a "Ngày không thể nhận việc" screen with a calendar; tap a date -> choose whole day or a time range -> pick a reason.

## 9.3 Availability <-> booking consistency (single source of truth)
```text
available_slots(carepartner, date) =
    weekly_windows(weekday(date))
    MINUS blackouts(date)
    MINUS booked_slots(date)          # awaiting_commitment | committed | reschedule_requested | in_progress
    MINUS slot_locks(date)            # soft holds, Step 10
```
- Matching (Step 2) MUST call this function and NEVER read the raw weekly table alone.
- Cache per (carepartner, date) with a max TTL of 60s, invalidated on any write to availability, blackout, booking or slot lock.
- Inside a booking transaction, ALWAYS bypass the cache.
- Midnight-crossing windows (e.g. 22:00-01:00) must be stored as TWO rows: 22:00-23:59 and 00:00-01:00 on the next date.

## 9.4 API additions
| Method | Path | Notes |
|---|---|---|
| POST | `/api/bookings/{id}/reschedule` | body: date, time_from, time_to, reason |
| POST | `/api/bookings/{id}/reschedule/respond` | parent: approve or decline |
| GET | `/api/carepartner/blackouts` | list future blackouts |
| POST | `/api/carepartner/blackouts` | create; 409 on booking conflict |
| DELETE | `/api/carepartner/blackouts/{id}` | delete; 409 if a booking now depends on that date being blocked (never the case) |
| PATCH | `/api/carepartner/availability/{id}` | 409 `availability_locked_by_booking` when locked |

## Acceptance Criteria
1. Editing an unbooked window succeeds immediately.
2. Editing or deleting a booked window returns 409 `availability_locked_by_booking` and the UI shows the lock.
3. Creating a blackout that conflicts with a booking returns 409 `blackout_conflicts_with_booking`.
4. Blacked-out slots are excluded from matching results.
5. A reschedule request to a time outside the CarePartner's own availability returns 400.
6. The parent deadline table is applied correctly by lead time, and the 50% reminder is sent.
7. An expired reschedule with no CarePartner choice within 30 minutes triggers an auto-cancel at the correct Step 7 tier.
8. Max 2 reschedules per booking is enforced.
9. 14 consecutive fully blacked-out days set `matching_paused = true` and send the notification.
10. `available_slots()` is the only function matching uses; a direct weekly-table read is a code-review failure.
11. Midnight-crossing windows are stored as two rows and match correctly.
12. Approving a reschedule swaps the locks atomically - no moment where the CarePartner is unlocked or double-locked.

## Testing Checklist
- Seed weekly Mon 18-21h plus a booking Mon 19-21h -> delete the window -> 409, lock icon shown.
- Add a blackout for next Monday -> a Monday job no longer matches this CarePartner.
- Add a blackout overlapping a committed booking -> 409.
- Reschedule to a time NOT in their availability -> 400.
- Reschedule approved -> old slot unlocked, new slot locked, ELO +1, both sides notified.
- Reschedule expired and the CarePartner idle for 31 minutes -> auto-cancel, correct tier, parent notified, replacement triggered.
- Third reschedule on the same booking -> rejected with a clear message.
- Black out all of the next 14 days -> `matching_paused` true and `blackout_paused` sent.
- Window 22:00-01:00 -> stored as two rows; a job 23:00-00:30 matches.
- Cache test: change availability, then match immediately -> the new data is used (cache invalidated).
- 31st future blackout -> rejected.
