# Flow 1 - Step 7: Cancellation, No-Show, Penalty Tiers + Parent Compensation

Approved by the product owner: **T5 (no-show) and T4 (cancel under 3h) are extremely bad, so the parent MUST be compensated, and T5 compensation > T4 compensation.**

## 7.1 Penalty tiers
Lead time = `slot_start - cancel_time`. For recurring jobs use the EARLIEST remaining slot.

| Tier | Trigger | ELO delta | Compensation to parent | Repeat escalation |
|---|---|---:|---:|---|
| T0 | Cancel / decline INSIDE the commitment window | -5 | 0 | none |
| T1 | Cancel after `committed`, lead time more than 24h | -15 | 0 | none |
| T2 | Lead time 6h - 24h | -30 | 10% of job value | none |
| T3 | Lead time 3h - 6h | -50 | 20% of job value | none |
| T4 | Lead time under 3h | -80 | 30% of job value | 2x in 30 days -> charge as T5 |
| T5 | No-show: did not arrive, no notice | -150 | 50% of job value, minimum 50.000 VND | 2x in 30 days -> suspend 7 days |
| T6 | Violation while already restricted/blocked, or 3rd T4/T5 in 30 days | -250 | 100% of job value | suspend 30 days, review for a permanent ban |

Force-majeure multiplier: ELO delta x0.5. **Compensation is UNCHANGED** - the parent is always made whole; the platform absorbs the difference (7.3).

All tier numbers live in the `CancelPolicy` DB table, never hardcoded.

## 7.2 Job value
`job_value = hourly_rate x hours_per_slot x number_of_slots`, frozen at selection time in `Booking.total_value_vnd`.
- For recurring jobs cancelled after some dates were already completed, the value used is the REMAINING slots only.
- Compensation is rounded DOWN to the nearest 1.000 VND.
- Minimum compensation for T5 = 50.000 VND even if 50% computes lower.
- The hourly rate is a required field in Step 1, so there is no "thỏa thuận" case. Fallback if data is missing: platform default 100.000 VND/hour.

## 7.3 Who funds the compensation - DEFAULT: platform credit
MVP decision (provisional, see OPEN-QUESTIONS.md Q1):
- Compensation is issued as **platform credit** into `ParentWallet.credit_vnd`.
- Credit pays the platform service fee on future jobs. It is NOT withdrawable cash.
- The CarePartner pays no cash in MVP. Their penalty is ELO + proposal restriction, plus a recorded `debt_vnd` for a later phase.
- Rationale: no escrow or CarePartner wallet exists yet, so the platform cannot take real money from a student. Credit keeps the parent whole and is legally simple.
- Phase 2 (once a wallet/escrow exists): deduct from CarePartner earnings, capped at 30% of their available balance per event.

## 7.4 No-show detection
1. At `slot_start + 15 min`, if the booking is still `committed` (never started) -> status `suspected_no_show`.
2. Parent is prompted: "CarePartner đã đến chưa?" with buttons [Đã đến] [Không đến].
3. Parent taps [Không đến] -> `no_show` confirmed -> T5 applied (ELO + compensation + replacement + admin alert).
4. Parent does not answer within 24h -> if GPS check-in exists use it, otherwise mark `no_show_unconfirmed` and apply T4 only, flag for admin review.
5. The CarePartner may dispute within 48h through the appeal flow (7.6).

## 7.5 Auto-replacement trigger
Any tier >= T1 immediately triggers (details in Step 8):
1. Unlock the cancelled CarePartner's remaining slots.
2. `JobPost.status = needs_replacement`.
3. Re-run matching (Step 2) excluding the cancelled CarePartner for this job.
4. Notify the parent with the number of new candidates AND the compensation issued.
5. If the pool is empty -> notify "chưa có CarePartner phù hợp", keep the job open, retry every 30 min for 6h, then alert an admin.

## 7.6 Appeal (kháng cáo) - simple, admin-reviewed
- The CarePartner can appeal any penalty within 7 days.
- Payload: `reason_code`, `note` (min 20 chars), `evidence[]` (max 3 files, 5MB each).
- Statuses: `pending` -> `approved` | `partially_approved` | `rejected`.
- `approved`: the ELO delta is reversed with a compensating ledger row `appeal_approved`; any suspension is lifted; **the parent compensation is KEPT** (platform absorbs it).
- `partially_approved`: 50% of the ELO delta is reversed.
- `rejected`: nothing changes; the CarePartner receives the admin's note.
- Max 3 appeals per rolling 30 days; the 4th is auto-rejected with a warning (anti-abuse).
- Gemini may pre-classify an appeal as `likely_valid` / `needs_review` / `likely_invalid` with a short rationale, but **the final decision is always a human admin in MVP**.

## 7.7 Parent-side cancellation (must not break, full parent score is Phase 2)
| Situation | Effect |
|---|---|
| Parent cancels more than 24h before start | free, no penalty, slots unlocked |
| Parent cancels under 24h | booking cancelled, CarePartner gets `+5` ELO (`parent_cancelled_compensation`) and a notification |
| Parent cancels under 3h before start, or after start | CarePartner gets `+10` ELO and a `ParentTrustFlag` is recorded on the parent account |
No parent trust SCORE in MVP - flag only, visible to admins.

## 7.8 Data model
```python
class CancelPolicy(models.Model):          # one active row per tier
    tier = CharField()                     # T0..T6
    min_lead_minutes = IntegerField()
    max_lead_minutes = IntegerField(null=True)   # null = unlimited
    elo_delta = IntegerField()             # negative
    compensation_pct = IntegerField()
    min_compensation_vnd = IntegerField(default=0)
    force_majeure_multiplier = DecimalField(default=0.5)
    repeat_window_days = IntegerField(default=30)
    repeat_threshold = IntegerField(null=True)
    escalate_to = CharField(blank=True)
    suspend_days = IntegerField(default=0)
    is_active = BooleanField(default=True)

class Compensation(models.Model):
    id = UUIDField(primary_key=True)
    booking = FK(Booking, related_name="compensations")
    parent = FK(User, related_name="compensations")
    amount_vnd = PositiveIntegerField()
    kind = CharField(default="platform_credit")
    status = CharField(default="issued")   # issued | revoked
    issued_at = DateTimeField(auto_now_add=True)
    note = TextField(blank=True)

class Appeal(models.Model):
    id = UUIDField(primary_key=True)
    booking = FK(Booking, related_name="appeals")
    carepartner = FK(User, related_name="appeals")
    reason_code = CharField()
    note = TextField()
    evidence = JSONField(default=list)
    ai_precheck = JSONField(null=True)     # {"verdict": "...", "rationale": "..."}
    status = CharField(default="pending")
    admin = FK(User, null=True)
    admin_note = TextField(blank=True)
    decided_at = DateTimeField(null=True)
    created_at = DateTimeField(auto_now_add=True)

class ParentWallet(models.Model):
    parent = OneToOneField(User, related_name="wallet")
    credit_vnd = PositiveIntegerField(default=0)
    updated_at = DateTimeField(auto_now=True)

class ParentTrustFlag(models.Model):
    parent = FK(User, related_name="trust_flags")
    booking = FK(Booking, null=True)
    code = CharField()                     # late_cancel | repeated_late_cancel
    note = TextField(blank=True)
    created_at = DateTimeField(auto_now_add=True)
```

## 7.9 API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/bookings/{id}/cancel` | applies the tier, issues compensation, triggers replacement |
| POST | `/api/bookings/{id}/report-no-show` | parent confirms or denies the no-show |
| POST | `/api/bookings/{id}/appeal` | CarePartner appeals a penalty |
| GET | `/api/bookings/{id}/appeal` | appeal status |
| GET | `/api/wallet/credit` | parent credit balance + history |
| GET | `/api/carepartner/penalties` | the CarePartner's own visible events (labels only, no numbers) |
| admin | `/admin/penalties/appeals/` | review queue |

## Acceptance Criteria
1. The correct tier is chosen automatically from the lead time; no manual tier selection anywhere.
2. The ELO delta and the compensation are applied in the SAME DB transaction as the cancel, and both are idempotent.
3. Force majeure halves the ELO delta but never reduces the compensation.
4. Compensation lands in the parent wallet and shows in the wallet history with a booking reference.
5. Repeat escalation works: 2x T4/T5 in 30 days; 3rd -> T6 + suspension.
6. Suspension blocks work: a suspended CarePartner cannot be matched and cannot start jobs.
7. The no-show flow confirms via the parent's answer, with a 24h timeout path applying T4 only.
8. The 7-day appeal window and the 3-appeals-per-30-days cap are enforced.
9. An approved appeal reverses the ELO but does NOT claw back the parent compensation.
10. Auto-replacement always fires for tier >= T1, including when the pool is empty.
11. All tier numbers come from `CancelPolicy`; changing them needs no deploy.

## Testing Checklist
- Cancel 30h before start -> T1, -15, compensation 0.
- Cancel 10h before -> T2, -30, 10% credit in the parent wallet.
- Cancel 4h before -> T3, -50, 20%.
- Cancel 1h before -> T4, -80, 30%.
- No-show confirmed by the parent -> T5, -150, 50% with the 50.000 VND floor: a job worth 60.000 VND must pay 50.000, not 30.000.
- Force-majeure T4 -> ELO -40, compensation still 30%.
- Two T4 events in 30 days -> the third is charged at T5 level plus suspension.
- Recurring job with 3 dates, cancelled after date 1 was completed -> lead time computed from date 2, value = remaining slots only.
- Appeal approved -> the ledger has a reversing row; the wallet credit is unchanged.
- Fourth appeal in 30 days -> auto-rejected with a warning.
- Parent cancels 2h before start -> CarePartner +10 ELO and a `ParentTrustFlag` is created.
- Send the same cancel request twice -> one penalty, one compensation, one notification.
- Change `CancelPolicy` T4 compensation to 40% in the DB -> the next T4 pays 40% without a deploy.
