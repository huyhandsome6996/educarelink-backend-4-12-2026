# Parent <-> CarePartner Matching - Agent Spec Index

This directory contains the product specification for the **Parent-to-CarePartner matching feature** of EduCareLink. All agent work (coding, testing, prompt engineering) for this feature should reference these files.

## Branch
`ghep-cap-phu-huynh-carepartner`

## Files

| File | Scope | Status |
|---|---|---|
| `flow1-step1-parent-posting.md` | Parent posts a job (3 types: tutoring/childcare/pickup) | Draft - approved |
| `flow1-step1-additional-details.md` | Vietnamese labels, placeholders, options for Step 1 | Draft - approved |
| `flow1-step2-matching-engine.md` | AI parsing + auto-matching + scoring logic | Draft - approved |
| `flow1-step3-candidate-list-ui.md` | Parent-side UI showing max 8 ranked candidates | Draft - approved |
| `flow1-step4-carepartner-availability.md` | CarePartner weekly availability declaration | Draft - approved |

## Upcoming (not yet specified)
- Step 5: Booking flow (parent selects CarePartner, CarePartner confirmation)
- Step 6: Hidden ELO score system, penalties, recovery
- Step 7: Cancellation / no-show flow
- Step 8: Parent notifications + auto-replacement on CarePartner cancel
- Step 9: Blackout dates (one-off unavailability)
- Step 10: Double-booking prevention / schedule lock

## How agents should use this
- **Prompt agent**: read the matching engine (Step 2) + availability (Step 4) to write a precise coding prompt for the coding agent.
- **Coding agent**: implement strictly within the Acceptance Criteria of each step. When in doubt, escalate to the product owner via this chat.
- **Testing agent**: use the Testing Checklist at the bottom of each file as the minimum test suite. Expand with edge cases.

## Conventions
- Backend: Python/Django + DRF.
- Mobile: React Native + Expo SDK 54.
- All user-facing strings are in **Vietnamese**. Spec files use English field names with Vietnamese examples embedded.
- IDs are UUIDs.
- All times are local to the job's location (Asia/Ho_Chi_Minh).

## Change log
- 2026-09-07: Initial spec for Steps 1-4 pushed to branch.
