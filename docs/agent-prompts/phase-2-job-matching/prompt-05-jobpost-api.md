# Prompt 05 — JobPost 3 loại công việc + JobSlots + API đăng việc

## Context
Spec Step 1 định nghĩa form đăng việc 3 loại (tutoring/childcare/pickup) với bộ field riêng từng loại, hỗ trợ N ngày/recurring. Model khung `JobPost` đã có từ Prompt 01 nhưng `type_data` còn là JSON tự do. Prompt này: schema hóa `type_data` per-type, validate theo spec, mở rộng dates thành `JobSlot`, và dựng API đăng việc đầy đủ với nhãn tiếng Việt chuẩn `flow1-step1-additional-details.md` để mobile dùng trực tiếp.

## Requirements (nguồn spec)
- `flow1-step1-parent-posting.md` §A (tutoring): subject*, specific_requirements*, dates*, time_from*, time_to*, location(lat,lng)*, location_note, hourly_rate* VND/h > 0.
- §B (childcare): child_age_group* (5 lựa chọn), number_of_children* ≥ 1, care_duties* multi-select (7 lựa chọn), medical_allergy_notes, specific_requirements*, + phần chung như A.
- §C (pickup): school_or_pickup_place_name*, child_age_group*, number_of_children*, pickup_dates*, pickup_time_from/to*, pickup_location*+note, destination_type* (parent_home|other_address), destination_location* (bắt buộc khi other_address), destination_note, transport_note (3 lựa chọn), specific_requirements*, hourly_rate*.
- `flow1-step1-additional-details.md`: TOÀN BỘ label/placeholder/options tiếng Việt — API phải trả về metadata form (`GET /api/jobs/form-schema`) để mobile render đúng 1 nguồn.
- Validation chung: end > start; cấm ngày quá khứ; rate > 0; map có search/vị trí hiện tại/ghim tay (mobile side — tham chiếu prompt 15).
- Step 12: trạng thái draft → published khi submit; published → ai_parsing (Prompt 06).

## Acceptance Criteria
1. `POST /api/jobs/` (auth parent): body `{job_type, type_data{...}, dates[] | recurrence{}, time_from, time_to, location{lat,lng}, location_note, hourly_rate_vnd, submit: bool}` → tạo `JobPost` status `published` (submit=true) hoặc `draft`; sinh ĐÚNG N `JobSlot` (1 slot/date).
2. Recurring: body `{"pattern": "weekly", "weekdays": [2,4,6], "until": "2026-05-30"}` → expand ra mọi date khớp weekday từ hôm nay đến `until` (tối đa 60 slot, vượt → 400 `too_many_slots`); từng slot vẫn validate không quá khứ.
3. Field validation per-type ĐÚNG bảng spec: thiếu field bắt buộc → 400 với `errors` map field→thông báo tiếng Việt (vd: `"subject": "Môn học / Kỹ năng là bắt buộc"`); `destination_type=other_address` mà thiếu `destination_location` → 400; `number_of_children` < 1 → 400; `time_to <= time_from` → 400.
4. `GET /api/jobs/form-schema` trả metadata: mỗi type có danh sách field `{key, label_vi, helper_vi, placeholder_vi, type (text/textarea/date/time/map/number/select/multiselect/radio), required, options[]}` — options ĐÚNG tiếng Việt spec (child_age_group 5 mục, care_duties 7 mục, transport_note 3 mục, destination_type 2 mục).
5. Chỉ chấp nhận ĐÚNG 3 `job_type`; loại khác → 400 `invalid_job_type` (không có category tự do như luồng Task cũ).
6. Draft: parent có thể PUT cập nhật draft; publish lại validate toàn bộ; draft không hiện với ai khác (GET list lọc theo owner).
7. `GET /api/jobs/<uuid>/` + `GET /api/jobs/?role=parent&status=` (phân trang 20/trang) — serializer trả kèm `status_label_vi`, slots, type_data.
8. `DELETE /api/jobs/<uuid>/` chỉ khi draft hoặc trước khi có booking (đổi thành `cancelled_by_parent` qua state machine — Prompt 12 sẽ chuẩn hóa; ở đây minimal: draft → xóa thật; đã publish → chuyển `cancelled_by_parent` + log transition).
9. Mỗi transition ghi `StateTransitionLog` (draft→published...) qua helper `matching/services/state.py::transition_to(instance, new_status, actor, reason)` — dùng chung cho mọi prompt sau.
10. Rate limit đăng bài: tối đa 10 job đang mở/parent (400 `too_many_open_jobs`) + Gemini duplicate check hook (Prompt 06 đăng ký signal; ở đây để chỗ cắm).

## Technical Approach
- `matching/models.py` bổ sung: hằng `TYPE_DATA_SCHEMA = {"tutoring": {...}, "childcare": {...}, "pickup": {...}}` (key, required, type, options) dùng bởi serializer + form-schema endpoint — MỘT nguồn duy nhất.
- Serializer `JobPostCreateSerializer` validate thủ công (không ModelSerializer mù): per-type field check + chuyển `location {lat,lng}` → `latitude/longitude`.
- `matching/services/job_service.py`: `create_job(parent, payload)`, `expand_recurrence(...)`, `create_slots(job, dates)`, `form_schema()`.
- `matching/api/jobs.py` + urls `/api/jobs/...`. Auth: `IsAuthenticated` + check `role == 'parent'` (403 nếu worker).
- State helper `matching/services/state.py`: `transition_to(instance, to_status, actor, reason)` — validate theo constants map, ghi log, raise `InvalidTransition` → 409 (dùng từ Prompt 05 trở đi toàn dự án).
- VN timezone: validate "quá khứ" theo `timezone.localdate()`.

## Code References
- Spec: `flow1-step1-parent-posting.md`, `flow1-step1-additional-details.md`, `flow1-step12-state-machines.md` §12.1.
- Tạo: `matching/services/job_service.py`, `matching/services/state.py`, `matching/api/jobs.py`, `matching/serializers.py` (JobPost*), test `matching/tests/test_job_api.py`.
- Tham chiếu (KHÔNG sửa): `core/views.py` `TaskListCreateAPIView` (pattern pagination/permission), `mobile/src/screens/Parent/CreateTaskScreen.js` (đối chiếu field khi thiết kế form-schema).

## Testing Checklist
- POST tutoring đủ field → 201, đúng 3 slots cho 3 dates, status published, transition log có draft→published (2 row nếu có draft trung gian).
- POST pickup `other_address` thiếu destination → 400; `parent_home` → OK và `destination_location` không bắt buộc.
- POST childcare `number_of_children=0` → 400; `care_duties` rỗng → 400.
- Recurrence weekly [2,4,6] until 30 ngày → đúng số slot, không dính ngày quá khứ.
- `dates` chứa ngày qua khứ → 400; time_to = time_from → 400.
- Worker gọi POST /api/jobs/ → 403.
- GET form-schema: đúng label VI từng field, đủ options tiếng Việt đúng thứ tự spec.
- 11 job mở → job thứ 11 → 400 too_many_open_jobs.
- draft → PUT sửa → publish; parent khác GET draft → 404.

## Edge Cases
- `until` quá xa (> 60 slot) → 400 + message VI gợi ý rút ngắn.
- dates trùng nhau trong 1 request → dedupe im lặng (không tạo slot trùng — unique (job, date, time_from)).
- time_from 23:30, time_to 00:30 (crossing) → 400 `time_range_crosses_midnight` (spec JobSlot không hỗ trợ crossing).
- hourly_rate_vnd kiểu string "150k" → 400 yêu cầu số nguyên (mobile chịu trách nhiệm format).

## Dependencies
- Prompt 01 (model + state constants), Prompt 04 (state helper có thể cần transition bị chặn bởi availability — không blocking).
- Prompt 06 sẽ đăng ký signal parse sau published; Prompt 07 consume slots.
