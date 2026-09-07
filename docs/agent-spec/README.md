# Parent <-> CarePartner Matching - Agent Spec Index

This directory is the single source of truth for the **Parent-to-CarePartner matching feature** of EduCareLink. Every agent working on this feature (prompt writer, coder, tester, QA) reads these files first.

## Branch
`ghep-cap-phu-huynh-carepartner` - ALL matching work lives on this one branch only.

## Read order
1. This file.
2. `OPEN-QUESTIONS.md` - what is still undecided and which provisional default to implement.
3. The step file you are working on, plus the step files it links to.

## Files
| File | Scope | Status |
|---|---|---|
| `flow1-step1-parent-posting.md` | Parent posts a job. 3 types only: tutoring, childcare, pickup | approved |
| `flow1-step1-additional-details.md` | Vietnamese labels, placeholders, dropdown options for Step 1 | approved |
| `flow1-step2-matching-engine.md` | AI parsing plus auto-matching plus scoring logic | approved |
| `flow1-step3-candidate-list-ui.md` | Parent-side UI showing at most 8 ranked candidates | approved |
| `flow1-step4-carepartner-availability.md` | CarePartner weekly availability declaration | approved |
| `flow1-step5-booking-commitment.md` | Auto-commit booking model, commitment window, force majeure | approved |
| `flow1-step6-hidden-elo.md` | Hidden ELO trust score, bands, decay, recovery, admin | approved |
| `flow1-step7-cancellation-compensation.md` | Penalty tiers T0-T6, parent compensation, no-show, appeal | approved |
| `flow1-step8-notifications-replacement.md` | Notification classes, Vietnamese copy, mandatory sound, auto-replacement | approved |
| `flow1-step9-availability-blackout-rules.md` | Availability edit rules, reschedule flow, blackout dates | approved |
| `flow1-step10-schedule-lock.md` | Double-booking prevention, soft hold, hard lock, concurrency | approved |
| `flow1-step11-ai-gemini-scoring.md` | Gemini task registry, structured output, guardrails, scoring weights | approved |
| `flow1-step12-state-machines.md` | JobPost and Booking states, transitions, global rules | approved |
| `OPEN-QUESTIONS.md` | Undecided items with provisional defaults | living document |

## End-to-end flow
```text
Parent posts a job (Step 1)
  -> Gemini parses it into a JobRequirement (Step 2, Step 11)
  -> System filters and scores CarePartners (Step 2, Step 6, Step 9, Step 11)
  -> Parent sees at most 8 ranked candidates (Step 3)
  -> Parent selects one -> the booking auto-commits (Step 5)
  -> Slots are hard-locked, no double booking (Step 10)
  -> CarePartner is notified with a loud sound (Step 8)
  -> The commitment window runs, then the booking is committed (Step 5)
  -> The job is performed and reviewed (Step 12)
  -> ELO rewards are applied (Step 6)

If the CarePartner declines, cancels or no-shows:
  -> A penalty tier T0-T6 is applied (Step 7)
  -> The parent is notified and compensated (Step 7, Step 8)
  -> Replacement candidates are found automatically (Step 8)
  -> The CarePartner may appeal, an admin decides (Step 7)
```

## How agents should use this
- **Prompt agent**: read the step files relevant to the task, quote section numbers in the prompt you write for the coding agent, and always point at `OPEN-QUESTIONS.md` so provisional values are not hardcoded.
- **Coding agent**: implement strictly within the Acceptance Criteria of each step. Every number in these specs (weights, tiers, windows, thresholds) MUST come from a DB config table or a settings key, never a literal. When something is unclear, escalate to the product owner through the chat instead of guessing.
- **Testing agent**: the Testing Checklist at the bottom of each file is the MINIMUM suite. Add edge cases, especially concurrency (Step 10), time boundaries (Step 5, Step 7) and notification delivery on real devices (Step 8).

## Conventions
- Backend: Python, Django, Django REST Framework, PostgreSQL.
- Mobile: React Native with Expo SDK 54.
- All user-facing strings are Vietnamese. Spec files use English field names with Vietnamese copy embedded where it is user-visible.
- IDs are UUIDs.
- All times are local to the job location, timezone Asia/Ho_Chi_Minh.
- Notifications are enqueued inside a transaction and sent on commit.
- AI is advisory for anything financial or punitive; a human admin decides bans and appeals.

## Out of scope for this branch
CH Play deployment, EAS build, Expo submit and Google service account work. That belongs to a different effort and must not be mixed into this branch.

## Change log
- 2026-09-07: initial spec for Steps 1-4.
- 2026-09-07: added Steps 5-12 plus `OPEN-QUESTIONS.md`, covering booking auto-commit, hidden ELO, cancellation tiers and compensation, notifications with mandatory sound, availability rules and blackouts, schedule locking, Gemini capabilities and scoring config, and the full state machines.
