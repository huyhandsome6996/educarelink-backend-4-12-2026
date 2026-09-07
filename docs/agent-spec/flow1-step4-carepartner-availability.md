# Flow 1 - Step 4: CarePartner Availability Declaration

## Goal
When a student registers as a CarePartner (or later in settings), they declare a weekly recurring availability schedule. This schedule is a soft commitment: the system treats declared slots as "available for work" and uses them for matching.

## Scope
- Per-weekday availability windows (recurring weekly).
- Multi-window per day allowed.
- Editable anytime.
- Does NOT cover one-off blackout dates (future step).

---

## Data Model

### CarePartnerAvailability
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| carepartner_id | uuid | FK to CarePartner |
| weekday | int | 0=Mon..6=Sun |
| time_from | time | HH:MM |
| time_to | time | HH:MM, must be > time_from |
| created_at | datetime | |
| updated_at | datetime | |

Composite unique: (carepartner_id, weekday, time_from, time_to).

### Storage rule
Store the weekly template, not specific dates. The matching engine expands this template to concrete dates when evaluating a job.

---

## UX Flow

### Onboarding (required before CarePartner can receive jobs)
1. CarePartner completes profile.
2. System redirects to "Khai bao lich ranh" screen.
3. CarePartner must declare at least 1 availability window to activate their profile.

### Edit screen (settings)
- Always accessible from Profile -> "Lich ranh cua toi".

### UI components

#### Day selector
- 7 toggle buttons: Thu 2, Thu 3, ..., Chu nhat.
- Each day has its own list of time windows.

#### Per-day time windows
- "Add window" button -> shows time picker row: [from] -> [to] [Xoa].
- Multiple rows allowed per day.
- Validation:
  - time_to > time_from.
  - No overlapping windows within the same day (show warning, allow merge suggestion).

#### Helper text
- Top of screen: "Day la thoi gian ban co the nhan viec. Ban co the thay doi bat cu luc nao."
- Warning under each day: "Khi ban khai ranh va duoc phu huynh chon, ban co trach nhiem thuc hien. Huy ngang se anh huong den diem tin nhiem."

---

## Default state on registration
- All days empty.
- "Tiep tuc" button disabled until at least 1 window is declared.

---

## Edit semantics
- CarePartner can add/remove/edit windows freely when no booking exists on affected slots.
- If a CarePartner has an active/upcoming booking on a slot they try to remove:
  - Show warning: "Ban dang co 1 cong viec vao {date} {time_from}-{time_to}. Ban khong the xoa khung gio nay cho den khi cong viec ket thuc hoac bi huy."
  - Block the removal.
- Changing availability does NOT cancel existing bookings - bookings live on concrete dates, independent of the weekly template.

---

## API Contract

### GET /api/carepartners/me/availability
Returns:
{
  "windows": [
    { "id": "uuid", "weekday": 0, "time_from": "18:00", "time_to": "21:00" },
    { "id": "uuid", "weekday": 2, "time_from": "18:00", "time_to": "21:00" }
  ]
}

### POST /api/carepartners/me/availability
Body: { "weekday": 0, "time_from": "18:00", "time_to": "21:00" }
Returns: the created window.
Error 400 if overlap or invalid.

### DELETE /api/carepartners/me/availability/{id}
Error 409 if an active booking uses the window.

### PUT /api/carepartners/me/availability/{id}
Same validation as POST.

### PUT /api/carepartners/me/availability/bulk
Replace entire weekly template. Used by the onboarding "save all" flow.
Body:
{
  "windows": [
    { "weekday": 0, "time_from": "18:00", "time_to": "21:00" },
    { "weekday": 2, "time_from": "18:00", "time_to": "21:00" }
  ]
}
Same 409 rule: cannot delete windows with active bookings.

---

## Acceptance Criteria
1. New CarePartner cannot activate profile without at least 1 window.
2. Multiple windows per day allowed.
3. Overlapping windows within the same day are rejected or auto-merged.
4. time_to > time_from enforced.
5. Windows with active bookings cannot be deleted.
6. Editing availability does not cancel existing bookings.
7. Matching engine reads from this data.

## Testing Checklist
- Register new CarePartner -> try to activate with 0 windows -> blocked.
- Add Mon 18:00-21:00, Mon 19:00-22:00 -> overlap rejected or merged.
- Add Mon 18:00-21:00, Tue 08:00-11:00 -> both saved.
- Create a booking on next Monday 19:00-21:00 -> try to delete Mon window -> 409 error.
- Edit Mon 18:00-21:00 -> 18:00-22:00 -> booking still valid.
- Verify matching engine sees updated windows.

---

## Notes for Coding Agent
- Use a date-picker/time-picker library; do not use raw text inputs.
- Weekly template is independent of calendar dates. Expansion happens in matching engine.
- All labels in Vietnamese:
  - Screen title: "Khai bao lich ranh"
  - Days: "Thu 2".."Thu 7", "Chu nhat"
  - Add button: "+ Them khung gio"
  - Save: "Luu lich"
  - Warning: "Khi ban khai ranh va duoc phu huynh chon, ban co trach nhiem thuc hien. Huy ngang se anh huong den diem tin nhiem."
