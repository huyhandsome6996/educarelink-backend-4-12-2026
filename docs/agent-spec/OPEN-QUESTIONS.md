# Open Questions - Product Owner Decisions Needed

Every item has a **provisional default**. Agents MUST implement the provisional default now so work does not stall. When the owner answers, update the relevant spec file AND this table, and mark the row `[LOCKED]`.

## Questions
| # | Question | Provisional default | Impact if changed |
|---|---|---|---|
| Q1 | Who funds the parent compensation? | `[PROVISIONAL]` Platform credit in the parent wallet. Not cash, not withdrawable. The CarePartner only records a `debt_vnd` for a later phase. | Real money from a CarePartner requires a wallet plus escrow first, roughly 2-3 extra weeks. |
| Q2 | Are the compensation percentages approved? T2 10%, T3 20%, T4 30%, T5 50% with a 50.000 VND floor, T6 100% | `[PROVISIONAL]` Yes, as written in Step 7. | Direct cost per cancelled job. |
| Q3 | Commitment window lengths 60 / 30 / 15 / 5 minutes | `[PROVISIONAL]` As written in Step 5.2. | Too short is unfair to students sitting in class; too long makes the parent wait. |
| Q4 | Auto-replacement: may the system pick the next CarePartner without the parent? | `[PROVISIONAL]` OFF by default, a parent toggle in settings, and it only fires for very_high or high matches when the job starts within 6h. | Always ON removes parent control; never ON kills urgent jobs. |
| Q5 | Recurring jobs: allow partial acceptance of some dates only? | `[PROVISIONAL]` No. All dates or nothing. | Partial acceptance creates more matches but messy half-booked jobs. |
| Q6 | Do we need a parent trust score too? | `[PROVISIONAL]` MVP uses a flag only (`ParentTrustFlag`), no score. A full parent score is Phase 2. | Parents who cancel late currently damage CarePartner goodwill with no consequence. |
| Q7 | Loud sound on iOS while the phone is in silent mode | `[PROVISIONAL]` Not achievable without Apple's Critical Alerts entitlement. We ship a loud sound for normal mode plus vibration. | Requires an application to Apple; usually granted only for safety or time-critical apps. |
| Q8 | Should the CarePartner see their band label at all? | `[PROVISIONAL]` Yes, a coarse label only such as "Cần cải thiện phản hồi". Never the number, never the deltas. | Fully hidden removes the motivation to improve. |
| Q9 | GPS check-in for no-show detection | `[PROVISIONAL]` Out of MVP. The parent's answer confirms a no-show. | GPS gives strong evidence but needs a location permission and a privacy policy update. |
| Q10 | Should the parent prepay or escrow the job value? | `[PROVISIONAL]` No in MVP. Compensation stays platform credit. | Escrow makes compensation real money and reduces non-payment risk, but it is a large scope. |
| Q11 | Suspension lengths: 7 days after 2x T5, 30 days at T6 | `[PROVISIONAL]` As written in Step 7. | Too harsh loses student supply; too soft makes parents churn. |
| Q12 | Should Gemini auto-block a post on a high safety flag? | `[PROVISIONAL]` Yes, block until an admin clears it. | Auto-blocking without review can wrongly block legitimate jobs. |
| Q13 | May a CarePartner counter-offer a higher rate? | `[PROVISIONAL]` No in MVP. | Adds negotiation complexity to matching. |
| Q14 | How many force-majeure cancels are free per 30 days? | `[PROVISIONAL]` 2. The 3rd onward takes the full penalty. | Too many becomes an escape hatch; too few punishes genuinely sick students. |
| Q15 | Soft hold TTL while a parent browses candidates | `[PROVISIONAL]` 5 minutes, non-blocking for other parents. | Longer holds reduce races but can strand inventory. |
| Q16 | Who pays when the platform issues compensation but the CarePartner is at fault? | `[PROVISIONAL]` The platform absorbs it in MVP and records `debt_vnd`. | Depends on Q1 and Q10. |

## Already LOCKED decisions - do not re-open without the owner
- Booking model = auto-commit, Option 2. There is no CarePartner acceptance step.
- The parent sees at most 8 candidates, ranked.
- Only 3 job types exist: tutoring, childcare, pickup.
- The hidden ELO number is never exposed to any user.
- Force majeure halves the ELO penalty but never removes the parent compensation.
- Notifications: mobile critical pushes MUST have a loud sound; web must play sound where the browser allows it.
- Gemini is advisory for anything punitive or financial; a human admin decides bans and appeal outcomes.
- Matching must keep working during a Gemini outage via the rule-based fallback.
- Weekly availability is a commitment: a booked window cannot be silently edited, only cancelled through the official flow.

## How agents should use this file
- Coding agent: implement the provisional defaults. Put every provisional number in a DB config table or a settings key, never a literal in code, so a decision change needs no deploy.
- Testing agent: write tests against the config values, not against hardcoded numbers, so changing a decision does not break the suite.
- Prompt agent: when writing prompts for the coding agent, quote the relevant spec section and this file's row number.
