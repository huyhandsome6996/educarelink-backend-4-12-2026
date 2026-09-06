# Flow 1 - Step 1: Parent Job Posting

## Goal
Parent can post a job by choosing exactly one of 3 job types:
1. Tutoring / Gia su
2. Childcare / Trong tre
3. Pickup / Don tre

## Scope
- Parent sees only 3 job type options.
- UI language: Vietnamese.

## A. Tutoring Form / Gia Su
1. `subject`: text input, required.
2. `specific_requirements`: textarea, required.
3. `dates`: calendar picker, required.
4. `time_from`: time picker, required.
5. `time_to`: time picker, required.
6. `location`: map picker, required.
7. `location_note`: text input, optional.
8. `hourly_rate`: number input, required, VND/hour > 0.

## B. Childcare Form / Trong Tre
1. `child_age_group`: select, required.
2. `number_of_children`: number >= 1, required.
3. `care_duties`: multi-select, required.
4. `medical_allergy_notes`: textarea, optional.
5. `specific_requirements`: textarea, required.
6. `dates`, `time_from`, `time_to`, `location`, `location_note`, `hourly_rate`: same as Tutoring.

## C. Pickup Form / Don Tre
1. `school_or_pickup_place_name`: text input, required.
2. `child_age_group`: select, required.
3. `number_of_children`: number >= 1, required.
4. `pickup_dates`: calendar picker, required.
5. `pickup_time_from`: time picker, required.
6. `pickup_time_to`: time picker, required.
7. `pickup_location`: map picker, required.
8. `pickup_location_note`: text input, optional.
9. `destination_type`: radio (parent_home / other_address), required.
10. `destination_location`: map picker, required if other_address.
11. `destination_note`: text input, optional.
12. `transport_note`: optional select/text.
13. `specific_requirements`: textarea, required.
14. `hourly_rate`: number input, required, VND/hour > 0.

## Acceptance Criteria
1. Parent sees exactly 3 job types.
2. Date/time use picker components.
3. Map supports search, current location, manual pin.
4. Submitted data structured by job_type.
