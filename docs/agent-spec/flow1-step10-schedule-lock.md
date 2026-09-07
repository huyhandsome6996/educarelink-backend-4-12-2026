# Flow 1 - Step 10: Double-Booking Prevention / Schedule Lock

## 10.1 Problem
Two parents can select the same CarePartner for the same slot at the same moment. Exactly one must win. The loser must see a refreshed list, never a broken booking.

## 10.2 Lock model
```python
class SlotLock(models.Model):
    id = UUIDField(primary_key=True)
    carepartner = FK(User, related_name="slot_locks")
    start_dt = DateTimeField()
    end_dt = DateTimeField()
    booking = FK(Booking, null=True)       # null while it is only a soft hold
    kind = CharField()                     # soft_hold | hard
    expires_at = DateTimeField(null=True)  # soft holds only
    created_at = DateTimeField(auto_now_add=True)
    class Meta:
        indexes = [Index(fields=["carepartner", "start_dt", "end_dt"]),
                   Index(fields=["kind", "expires_at"])]
```

Overlap rule: two ranges overlap when `A.start < B.end AND B.start < A.end`.

Enforced at BOTH levels:
1. Application level: `SELECT ... FOR UPDATE` on the CarePartner's existing locks inside a transaction, then insert. Lock rows in a deterministic order (`ORDER BY carepartner_id, start_dt`) to avoid deadlocks.
2. Database level (PostgreSQL, requires the `btree_gist` extension):
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE slot_lock
  ADD CONSTRAINT slot_lock_no_overlap
  EXCLUDE USING gist (
    carepartner_id WITH =,
    tstzrange(start_dt, end_dt) WITH &&
  );
```
Because a partial predicate is not supported by every Django migration path, the `soft_hold` expiry is handled by deleting expired rows lazily on read plus a beat task every 60 seconds. If `btree_gist` cannot be enabled in the target environment, fall back to a unique index on `(carepartner_id, start_dt)` plus the application-level check, and record the risk in the deployment notes.

## 10.3 Two-phase lock
**Phase A - soft hold (the parent is choosing).**
- When the parent opens the candidate list, the top-8 candidates get a `soft_hold` for each job slot with a TTL of 5 minutes (`SOFT_HOLD_TTL`).
- Soft holds do NOT hide the candidate from other parents; they only reserve the right to win the race.
- Expired soft holds are deleted lazily on read and by a beat task every 60s.
- Purpose: prevent a parent from choosing someone who was taken 30 seconds ago.

**Phase B - hard lock (the parent tapped select).**
Inside ONE transaction:
1. Validate the soft hold if one exists.
2. Insert `kind = hard` locks for ALL slots of the job (all-or-nothing for recurring jobs).
3. Create the `Booking` (Step 5).
4. Point the locks at the booking.
Any conflict -> rollback -> HTTP 409 `slot_taken`.

## 10.4 409 handling (UX requirement)
On 409 the client MUST:
1. Show: "CarePartner này vừa nhận đơn khác. Hệ thống đã cập nhật danh sách mới cho bạn."
2. Re-fetch `/api/matching/candidates` - the taken CarePartner is now excluded.
3. Never leave the parent on a stale list.

## 10.5 Unlock triggers
| Event | Action |
|---|---|
| Booking cancelled at any tier | delete hard locks for the remaining, not-yet-started slots |
| Booking completed | keep the lock as history; it stops conflicting because the time is in the past |
| Reschedule approved | delete the old locks and create new ones atomically |
| Job post withdrawn by the parent | delete all related locks |
| Soft hold expired | delete |
| Nightly job | delete locks whose `end_dt` is older than 7 days |

## 10.6 Recurring jobs
- A job with N dates creates N slot locks.
- All-or-nothing: if any single date is unavailable or conflicted, the whole selection fails with 409 and the response lists the failed dates as `conflicted_dates: [...]`.
- Partial acceptance is NOT allowed in MVP; it avoids messy half-booked jobs.

## 10.7 Concurrency requirements
- The select endpoint must be idempotent: the client sends an `Idempotency-Key` header; a replay returns the original booking instead of creating a second one.
- Target p95 latency under 500ms for the select endpoint at 100 concurrent users.
- All lock queries must run inside `transaction.atomic()` with `select_for_update()`.

## Acceptance Criteria
1. Under a 50-thread concurrent select for the same CarePartner and slot, exactly 1 booking is created and 49 receive 409.
2. The DB exclusion constraint rejects an overlapping hard lock even when the application check is bypassed.
3. Recurring job selection is all-or-nothing and reports `conflicted_dates`.
4. Soft holds expire after `SOFT_HOLD_TTL` and stop blocking.
5. Cancelling a booking releases the locks for future slots within 1 second.
6. A reschedule swaps locks atomically; killing the process mid-transaction leaves no partial state.
7. The select endpoint is idempotent with `Idempotency-Key`.
8. A 409 triggers a client-side candidate refresh.
9. Locks for past dates are cleaned by the nightly job.
10. p95 select latency is under 500ms at 100 concurrent users.

## Testing Checklist
- Concurrency test with locust or k6, 50 threads on the same slot -> assert exactly 1 success.
- Direct DB insert of an overlapping hard lock -> constraint violation raised.
- Recurring Mon/Wed/Fri where Wed is taken -> 409 with `conflicted_dates: ["2026-04-15"]` and NO locks created for Mon or Fri.
- Create a soft hold, wait TTL + 10s -> another parent can hard-lock the slot.
- Cancel a 3-date booking after date 1 -> locks for dates 2 and 3 released, date 1 kept.
- Reschedule approved -> old locks gone, new locks present, single transaction.
- Replay the same select request with the same Idempotency-Key -> one booking only.
- Load test 100 concurrent users -> p95 under 500ms.
- Nightly cleanup removes locks older than 7 days.
- Overlap edge: an existing lock 19:00-21:00 and a request 21:00-22:00 -> allowed (touching ranges do not overlap).
