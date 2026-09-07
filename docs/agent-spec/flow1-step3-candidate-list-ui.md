# Flow 1 - Step 3: Candidate List UI (Parent Side)

## Goal
Display the ranked CarePartner candidates to the parent after the parent posts a job. The list is capped at 8 candidates max, sorted from best fit to worst fit.

## Scope
- Read-only list view.
- Tapping a candidate opens CarePartner profile (out of scope here, just deep-link).
- Tapping "Book / Chon" on a candidate moves to Step 5 (booking flow - separate doc).

---

## UI Layout

### Header
- Text: "Co {total_matched} CarePartner phu hop voi cong viec cua ban. Hien thi {n} nguoi tot nhat."
- Example: "Co 47 CarePartner phu hop. Hien thi 8 nguoi tot nhat."
- If total_matched == 0: show empty state "Hien chua co CarePartner phu hop. Thu mo rong thoi gian hoac dia diem."
- If total_matched <= 8: text becomes "Co {total_matched} CarePartner phu hop."

### Candidate Card (repeated, max 8 cards)
Each card contains:

| Element | Type | Notes |
|---|---|---|
| Avatar | image, 48x48, round | Fallback to initials |
| Display name | text | |
| School / Major | small text, secondary | e.g. "DH Su pham HN - GD Tieu hoc" |
| Star rating | star 4.9 (34 danh gia) | Show "(moi)" if <5 reviews |
| Completed jobs | badge | 34 don hoan thanh |
| Distance | badge | 1.5 km |
| Match level | color tag | Rat phu hop / Phu hop cao / Phu hop |
| Top skills | chip-list | max 3 chips |
| Response tag | small badge | Phan hoi nhanh or Thuong dung gio |
| Latest review | italic text, truncated 2 lines | |
| Availability fit | text | Trung toan bo lich / Trung 2/3 buoi |
| Book button | primary button | Label: "Chon CarePartner nay" |

### Order
- Card #1 = highest score -> show subtle "De xuat hang dau" ribbon.
- Cards 2-8 in descending score order.

### Footer (if total_matched > 8)
- Button: "Xem them {total_matched - 8} CarePartner khac" -> navigates to full list screen (paginated, 20/page).

---

## Data Mapping
UI consumes the /api/matching/candidates response from Step 2.

Mapping:
- match_level -> Vietnamese label:
  - very_high -> "Rat phu hop" (green)
  - high -> "Phu hop cao" (blue)
  - medium -> "Phu hop" (gray)
  - low -> "Co the can nhac" (light gray)
- response_tag -> Vietnamese:
  - replies_fast -> "Phan hoi nhanh"
  - always_on_time -> "Thuong dung gio"
- availability_fit -> Vietnamese:
  - full -> "Trung toan bo lich"
  - partial -> "Trung mot phan"

---

## Empty / Loading States

### Loading
- Skeleton list with 8 placeholder cards.
- Show "Dang tim CarePartner phu hop..." text.

### Empty (0 matches)
- Illustration + text: "Chua co CarePartner phu hop voi yeu cau nay."
- CTA: "Sua lai yeu cau" -> back to Step 1 form.

### Partial (<8 matches)
- Show all matches, no "Xem them" footer.
- Helper text: "Day la tat ca CarePartner phu hop hien co."

---

## Acceptance Criteria
1. Parent sees exactly the candidates returned by Step 2 API.
2. Max 8 cards on the initial screen.
3. Order matches backend ranking (descending score).
4. Empty state renders when total_matched == 0.
5. "Xem them" footer only appears if total_matched > 8.
6. Tapping the Book button passes carepartner_id + job_id to the booking flow.
7. Tapping avatar/name opens CarePartner profile.

## Testing Checklist
- Seed 0, 1, 5, 8, 12, 47 candidates -> verify each UI state renders correctly.
- Verify cards are ordered by score desc.
- Verify match_level color mapping.
- Verify Vietnamese labels render (no raw keys).
- Verify skeleton while loading.
- Verify "Xem them" button only when total > 8.
- Verify tapping Book button routes with correct params.
