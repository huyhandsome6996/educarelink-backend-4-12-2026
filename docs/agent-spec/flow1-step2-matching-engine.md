# Flow 1 - Step 2: AI Read + Auto-Matching Engine

## Goal
After a parent posts a job (Flow 1 Step 1), the system must:
1. Let an AI model parse the job post (title + description + structured fields).
2. Automatically find suitable CarePartners (student workers) using a hybrid rule+AI scoring system.
3. Return a ranked list of candidates for the parent to choose from (see Step 3).

This step does NOT book the CarePartner. It only produces a ranked candidate list.

---

## 2.1 AI Reading the Job Post

The AI must read both the structured form payload and any free-text description to produce a normalized **JobRequirement** object.

### Input
- Structured payload from Step 1 (job_type + typed fields).
- Optional free-text title/description the parent may have added.

### Output: JobRequirement
Fields:
- `job_type`: tutoring | childcare | pickup
- `category_tags`: list of tags extracted from text (e.g. ["toan", "lop 5", "kien nhan"])
- `required_skills`: normalized skill list (e.g. ["teaching", "primary_school"])
- `dates`: list of ISO dates
- `time_from`, `time_to`: HH:MM strings
- `location`: { lat, lng, address }
- `destination_location`: for pickup jobs, the drop-off point
- `child_age_group`, `number_of_children`: childcare/pickup specific
- `hourly_rate_vnd`: integer
- `special_requirements`: e.g. ["su pham", "nu"]
- `urgency`: normal | high
- `safety_flags`: e.g. ["child_involved"]

### AI responsibilities
- Extract skills/tags from free text (e.g. "day toan lop 5" -> skills: math, primary).
- Resolve dates & times to a list of datetime slots (one slot per date+time range).
- Flag jobs involving children (safety_flags: child_involved).
- Flag urgent jobs (e.g. "can gap", "ngay mai").
- Detect sensitive/suspicious content and mark for admin review.

If the AI is uncertain, return confidence scores per field and ask the parent to confirm.

---

## 2.2 Filtering + Scoring CarePartners

For every active CarePartner in the system, compute a match score against the JobRequirement.

### 2.2.1 Hard filters (eliminate before scoring)
A CarePartner is REJECTED if any of these fail:
1. Account not active (disabled, banned, unverified).
2. No availability overlap with any required date+time slot (see 2.3).
3. Already booked in any overlapping slot.
4. Outside max distance (CarePartner's configured max radius OR default 20km).
5. Missing required skills when the parent explicitly requires a specific skill (e.g. "can nu", "can sinh vien su pham").
6. Hidden ELO too low (see ELO spec - separate doc, later step).

### 2.2.2 Soft scoring (for candidates passing hard filters)
Compute a score in [0, 100]:

| Factor | Weight | Logic |
|---|---:|---|
| Availability fit | 25% | % of required slots covered. 100% = all slots covered. |
| Skills / major match | 20% | Match required_skills against CarePartner's tags/major. Full match = 100. |
| Distance | 15% | Closer = higher. Linear decay from 0km (100) to max_radius (0). |
| Star rating | 15% | Rating / 5 * 100. New users (no rating) get neutral 60. |
| Completion rate | 10% | % of past jobs completed successfully. |
| Hidden ELO | 10% | Normalized ELO (see ELO spec). |
| Response speed | 5% | % of requests replied within SLA. |

### 2.2.3 Ranking
- Sort candidates descending by final score.
- Return top N (N=8, see Step 3).
- Tie-breaker: ELO > distance > completion rate.

### 2.2.4 AI-assisted re-ranking (optional, post-MVP)
After rule-based ranking, pass the top ~20 candidates + JobRequirement to an AI model that may re-rank based on semantic fit (e.g. "phu huynh muon nguoi kien nhan" -> prefer CarePartners with reviews containing "kien nhan", "nhe nhang"). AI re-ranking must not drop anyone from the rule-based top-20, only reorder within it.

---

## 2.3 Availability Check Logic

CarePartners declare a weekly recurring schedule (see Step 4). For each required job slot (date, time_from, time_to):

1. Find the weekday of the date.
2. Find all CarePartner availability windows on that weekday.
3. Check that the job time range is fully contained in at least one availability window.
4. Check that no existing booking overlaps the slot.
5. Check blackout dates (future Step 5).

If a CarePartner misses any required slot -> hard-reject.

Recurring weekly jobs: if the parent posts "every Monday 19-21h for 4 weeks", treat as N separate slots and require availability for ALL of them.

---

## 2.4 API Contract

### Endpoint
`POST /api/matching/candidates`

### Request
{ "job_id": "uuid" }

### Response
{
  "job_id": "uuid",
  "total_matched": 47,
  "candidates": [
    {
      "carepartner_id": "uuid",
      "display_name": "Nguyen Van A",
      "avatar_url": "...",
      "school": "DH Su pham Ha Noi",
      "major": "Giao duc Tieu hoc",
      "rating": 4.9,
      "completed_jobs": 34,
      "distance_km": 1.5,
      "match_score": 92,
      "match_level": "very_high | high | medium | low",
      "top_skills": ["toan", "tieu hoc", "kien nhan"],
      "latest_review": "Co day rat nhiet tinh...",
      "response_tag": "replies_fast | always_on_time",
      "availability_fit": "full | partial"
    }
  ]
}

- `candidates` array is sorted by score desc.
- Max length: 8 (enforced by backend).
- `total_matched` tells how many candidates passed hard filters (for UX: "Co 47 CarePartner phu hop, hien thi 8 nguoi tot nhat").

---

## Acceptance Criteria
1. Given a posted job, the system produces a ranked candidate list within <2s.
2. Hard filters reject ineligible CarePartners (no availability, already booked, too far, banned).
3. Scoring uses all 7 weighted factors.
4. Returned list is max 8 candidates.
5. Candidates are sorted by score desc, stable order.
6. New CarePartners (no rating, no jobs) are not excluded - they get neutral defaults.
7. API response matches the schema above.

## Testing Checklist
- Post a tutoring job Monday 19-21h, seed 3 CarePartners:
  - A: available Mon 18-22h, 4.9 star, 1km away -> top.
  - B: available Mon 19-21h, 4.2 star, 8km -> mid.
  - C: not available Mon -> excluded.
- Verify C is not in candidates.
- Verify A ranks above B.
- Post a job with date in the past -> system rejects before matching.
- Post a job at max radius edge -> include CarePartner exactly at boundary.
- Seed a CarePartner with an overlapping booking -> excluded.
- Verify new CarePartner (0 rating, 0 jobs) appears with neutral defaults.
