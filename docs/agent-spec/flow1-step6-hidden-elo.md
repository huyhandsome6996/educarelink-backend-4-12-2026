# Flow 1 - Step 6: Hidden ELO / Trust Score

## Purpose
An invisible trust score per CarePartner. It decides how often they are proposed, their rank position, priority for new jobs, and whether they get restricted for abuse.

**The raw number is NEVER exposed to any client (mobile or web).**

## 6.1 Model
- `CarePartnerProfile.hidden_elo`: int, default `1200`, clamped to `[400, 2000]`.
- Every change writes exactly one ledger row.
- Matching uses the EFFECTIVE score = base + rewards + (penalties x decay factor), see 6.5.

```python
class EloLedger(models.Model):
    id = UUIDField(primary_key=True)
    carepartner = FK(User, related_name="elo_ledger")
    delta = IntegerField()                    # positive = reward, negative = penalty
    reason_code = CharField()                 # see 6.3 / 6.4
    booking = FK(Booking, null=True)
    elo_before = IntegerField()
    elo_after = IntegerField()
    decay_at = DateTimeField(null=True)       # penalties only
    note = TextField(blank=True)
    created_by_admin = FK(User, null=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [Index(fields=["carepartner", "created_at"]),
                   Index(fields=["reason_code", "created_at"])]
        constraints = [UniqueConstraint(fields=["booking", "reason_code"],
                                        name="uniq_elo_event_per_booking")]

class EloBand(models.Model):                  # configurable, never hardcoded
    name = CharField()                        # trusted|good|normal|watch|restricted|blocked
    min_elo = IntegerField()
    max_elo = IntegerField()
    rank_multiplier = DecimalField()
    max_proposals_per_day = IntegerField(null=True)
    label_vi = CharField()
    excluded_from_matching = BooleanField(default=False)
    only_when_pool_below = IntegerField(default=8, null=True)
```

## 6.2 Bands
| Band | Range | Matching effect | User-visible label (VI) |
|---|---|---|---|
| trusted | >= 1450 | final score x1.15, always eligible for the top-8 | "CarePartner đáng tin cậy" |
| good | 1250-1449 | x1.05 | "Phản hồi tốt" / "Đúng giờ" |
| normal | 1050-1249 | x1.00 | no label shown |
| watch | 850-1049 | x0.85, max 4 proposals/day | "Cần cải thiện phản hồi" |
| restricted | 650-849 | x0.60, max 1 proposal/day, shown only when the pool has < 8 | "Đang bị hạn chế đề xuất" |
| blocked | < 650 | hard-excluded from matching | "Tạm khóa - liên hệ hỗ trợ" |

## 6.3 Earning points
| Event | reason_code | delta |
|---|---|---|
| Job completed on time | `job_completed` | +12 |
| Parent rating 5 star | `review_5` | +10 |
| Parent rating 4 star | `review_4` | +6 |
| Parent rating 3 star | `review_3` | +1 |
| Parent rating 1-2 star | `review_bad` | -8 |
| Positive review text (Gemini sentiment > 0.6) | `positive_review_text` | +4 |
| Streak: 3 consecutive completed jobs, no cancel | `streak_3` | +8 |
| Streak: 5 consecutive | `streak_5` | +15 |
| Streak: 10 consecutive | `streak_10` | +30 |
| 30 days with no cancellation | `clean_month` | +10 |
| Profile complete (skills, school, avatar, ID verified) | `profile_complete` | +5 (one time only) |
| Acknowledged a booking within 5 min | `fast_ack` | +2 (max 1 per day) |
| Reschedule approved by the parent, no cancel | `reschedule_ok` | +1 |
| Parent cancelled the job (compensation to the CP) | `parent_cancelled_compensation` | +5 or +10 (Step 7.7) |

Notes: streak counters reset to zero on any cancel or no-show. `profile_complete` fires once per account.

## 6.4 Losing points
The full tier table lives in Step 7: T0 -5, T1 -15, T2 -30, T3 -50, T4 -80, T5 -150, T6 -250.
Applied by the cancellation service, idempotent per (booking, reason_code).
Extra non-tier penalties:
| Event | reason_code | delta |
|---|---|---|
| Repeated slow acknowledgement (3 in 7 days) | `slow_ack_repeat` | -6 |
| Valid parent report verified by admin | `parent_report_valid` | -25 |
| Appeal abuse (3 rejected appeals in 30 days) | `appeal_abuse` | -10 |

## 6.5 Decay + recovery
Penalty rows carry `decay_at`. Effective penalty = `delta x factor` based on age:
| Age of the penalty | factor |
|---|---|
| 0-30 days | 1.00 |
| 31-90 days | 0.60 |
| 91-180 days | 0.25 |
| more than 180 days | 0.00 (ignored) |

- Rewards NEVER decay.
- **Recovery cooldown:** for 7 days after a T5 (no-show) or T6, every positive delta counts at only 50%. This prevents instant recovery after a serious violation.
- Effective ELO = `1200 + sum(rewards) + sum(penalty x factor)`, clamped to `[400, 2000]`.
- Recompute on every ledger write and cache on the profile (`effective_elo`, `band`, `band_updated_at`) so matching never recomputes per query.

## 6.6 How Step 2 matching consumes it
1. `elo_subscore = clamp((effective_elo - 650) / (1450 - 650) * 100, 0, 120)` -> feeds the 10% weight in Step 2.
2. The band multiplier is applied to the FINAL weighted score.
3. Hard filter: the `blocked` band is excluded completely.
4. `restricted` is included only when the qualified pool has fewer than 8 candidates.
5. Daily proposal throttle per band (6.2), counted on the Asia/Ho_Chi_Minh calendar day.

## 6.7 What the CarePartner sees
- Never the number, never the delta values.
- Only the band label plus a progress hint:
  > "Hoàn thành thêm 2 đơn đúng giờ để cải thiện mức độ ưu tiên đề xuất."
- A "Tín nhiệm" screen: band label, the last 10 events with human-readable reasons (no numbers), next milestone text.
- If `restricted` or `blocked`: a banner explaining how to recover plus a link to the appeal flow (Step 7.6).

## 6.8 Admin
- Admin page: full ledger, manual adjustment (note required), band override, suspension.
- Every manual adjustment writes `reason_code = admin_adjust` with the admin user id. Silent edits are forbidden.

## Acceptance Criteria
1. A new CarePartner starts at 1200, band `normal`.
2. Exactly one ledger row per event; no orphan deltas.
3. `hidden_elo` / `effective_elo` appear in NO client-facing serializer (enforced by a grep test in CI).
4. The band is recomputed on every ledger write and cached.
5. Decay boundaries at 30/90/180 days are exact.
6. The 7-day 50% cooldown after T5/T6 is enforced.
7. `blocked` never appears in candidate lists; `restricted` appears only when the pool is below 8.
8. Proposal throttles are enforced per calendar day.
9. Idempotent: the same event applied twice for one booking produces one delta.
10. The effective score never leaves `[400, 2000]`.
11. Band thresholds and multipliers are editable in the DB without a deploy.

## Testing Checklist
- Seed 1200 -> 3 completed 5-star jobs -> 1200 + 36 + 30 + 8 = 1274 -> band `good`.
- Apply T5 (-150) -> verify the band drops per the thresholds.
- Backdate a -150 penalty by 100 days -> effective -37.5.
- Backdate by 200 days -> fully ignored.
- Complete a job 3 days after a no-show -> only +6 counted (50% of +12) due to the cooldown.
- Seed a perfect-match `blocked` CarePartner -> absent from candidates.
- Seed 10 qualified candidates including one `restricted` -> excluded from the top 8. Seed only 3 including it -> it may appear.
- Grep every serializer for `hidden_elo` -> zero hits.
- Fire the completion webhook twice -> +12 only once (unique constraint).
- Throttle: the 5th proposal of the day to a `watch` CarePartner -> suppressed and logged.
- Edit `EloBand.trusted.min_elo` to 1300 -> band recomputed without a deploy.
