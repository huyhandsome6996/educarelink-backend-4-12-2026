# Prompt 01 — Database Schema + Bảng Config (nền tảng app `matching/`)

## Context
Toàn bộ Flow 1 (ghép cặp) cần một lớp dữ liệu mới hoàn toàn: JobPost 3 loại, JobSlot, Booking auto-commit, ELO, khóa lịch, đền bù, notification v2, state machine log. Codebase hiện tại chỉ có `Task`/`TaskApplication` (int PK, 1 datetime, luồng apply-duyệt) — KHÔNG đáp ứng spec và đang bị `tracking/`, `chat/`, `payments/` tham chiếu dày đặc. Quyết định kiến trúc: tạo **app Django mới `matching/`** chứa song song toàn bộ entity mới, không đụng luồng cũ.

## Requirements (nguồn spec)
- **S1** `flow1-step1-parent-posting.md` §A/B/C: JobPost 3 loại tutoring/childcare/pickup với bộ field riêng từng loại (chi tiết field-level nằm ở Prompt 05 — prompt này chỉ dựng khung model + các field chung).
- **S5** `flow1-step5-booking-commitment.md` §5.4: model `Booking` đầy đủ 24 field như spec (status, commit_deadline, cancel_*, compensation_vnd, elo_delta_applied...), UniqueConstraint `(job, carepartner)`, indexes `(carepartner,status)`, `(job,status)`, `(status,commit_deadline)`.
- **S6** `flow1-step6-hidden-elo.md` §6.1: `EloLedger` (unique `(booking, reason_code)`, indexes), `EloBand` (6 band, `rank_multiplier`, `max_proposals_per_day`, `only_when_pool_below`...).
- **S7** `flow1-step7-cancellation-compensation.md` §7.8: `CancelPolicy`, `Compensation`, `Appeal`, `ParentWallet`, `ParentTrustFlag` — đúng field như spec.
- **S8** `flow1-step8-notifications-replacement.md` §8.7: `Notification` (mới, trong app matching — KHÔNG đụng `core.models.Notification`), `DeviceToken` (unique `(user, token)`), `NotificationTemplate`, `ReplacementAttempt`.
- **S9** `flow1-step9-availability-blackout-rules.md` §9.2: `CarePartnerBlackout` (unique `(carepartner, date, time_from, time_to)`).
- **S10** `flow1-step10-schedule-lock.md`: `SlotLock` (soft/hard — chi tiết behavior ở Prompt 03, prompt này chỉ dựng bảng).
- **S11** `flow1-step11-ai-gemini-scoring.md` §11.6/§11.8: `MatchingWeight` (validate tổng = 100 khi save), `PromptTemplate` (unique `(key, version)`), `AiCallLog`.
- **S12** `flow1-step12-state-machines.md` §12.1/§12.2/§12.4: enum JobPostStatus (13 trạng thái), BookingStatus (16 trạng thái) + `StateTransitionLog`.

## Acceptance Criteria
1. `python manage.py startapp matching` + đăng ký vào `INSTALLED_APPS` (file `backend/settings.py`) — app nằm cạnh `payments/`, `tracking/`.
2. `python manage.py makemigrations matching && migrate` chạy sạch trên PostgreSQL.
3. Mọi model mới dùng `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`; FK tới `core.models.User`.
4. Tồn tại đủ 21 model: `JobPost, JobSlot, Booking, SlotLock, CarePartnerProfile, EloLedger, EloBand, CancelPolicy, Compensation, Appeal, ParentWallet, ParentTrustFlag, CarePartnerBlackout, MatchingWeight, NotificationTemplate, Notification, DeviceToken, ReplacementAttempt, PromptTemplate, AiCallLog, StateTransitionLog, RescheduleRequest`.
5. `CarePartnerProfile` là OneToOne với `User` (related_name=`carepartner_profile`) chứa: `hidden_elo` (default 1200), `effective_elo`, `band` FK EloBand, `band_updated_at`, `matching_paused` (bool), `max_radius_km` (null → default 20), `has_vehicle` (bool), `school`, `major`, `skills` (JSON list), `auto_replace` (bool default False).
6. `JobPost` có: `parent` FK, `job_type` choices (`tutoring/childcare/pickup`), `title/description` (điền bởi Gemini sau), `type_data` JSONField (field riêng từng loại — Prompt 05 định nghĩa schema), `hourly_rate_vnd` PositiveInteger > 0, `status` choices ĐỦ 13 trạng thái Step 12.1, `ai_parse_status` (`ok|repaired|fallback|null`), `latitude/longitude`, `location_note`, `recurrence` JSONField, `needs_admin_review` bool, `gender_preference` (null), `total_matched` (int null), `selected_carepartner` FK null.
7. `JobSlot`: `job` FK related_name=`slots`, `date` DateField, `time_from/time_to` TimeField, `status` (`locked|free|done`), unique `(job, date, time_from)`; index `(carepartner-denormalized không cần — truy vấn qua booking/lock)`.
8. CheckConstraint: `hourly_rate_vnd > 0`; `JobSlot.time_to > time_from`; `MatchingWeight` tổng trọng số = 100 (validate ở `clean()`, không bắt buộc DB constraint).
9. `matching/constants.py`: định nghĩa `JOBPOST_TRANSITIONS` + `BOOKING_TRANSITIONS` (dict data-driven đúng 100% bảng Step 12) + `STATUS_LABELS_VI` (bản đồ enum → tiếng Việt Step 12.1/12.2) + reason codes force majeure (Step 5.3) + notification codes (Step 8.3). KHÔNG có if-else rải rác ở service.
10. Management command `python manage.py seed_matching_config`: nạp EloBand (6 band đúng bảng §6.2), CancelPolicy (T0..T6 đúng bảng §7.1), MatchingWeight (7 trọng số §11.6), NotificationTemplate (16 template §8.3). Command idempotent (chạy lại không nhân bản, dùng update_or_create).
11. Admin Django đăng ký đủ các model với `list_display` hợp lý; `EloLedger` và `StateTransitionLog` là read-only trong admin.
12. Mọi `CharField` status/choices có `help_text` tiếng Việt; file models có comment tiếng Việt đầu mỗi class (theo phong cách `core/models.py`).

## Technical Approach
- Cấu trúc app: `matching/{models.py (chia 4 section bằng comment), constants.py, admin.py, migrations/, management/commands/seed_matching_config.py, services/ (trống, các prompt sau điền), tests/}`.
- Đặt tên bảng rõ ràng: `class Meta: db_table` KHÔNG cần — để mặc định `matching_*`; `verbose_name` tiếng Việt.
- Enum dùng `models.TextChoices` (giống style `User.CarePartnerTier`).
- `Notification` mới đặt trong `matching/models.py` — Django namespacing theo app nên không xung đột `core.Notification`; ghi chú rõ trong docstring để tránh nhầm.
- Indexes đúng theo từng spec (Booking §5.4, Notification §8.7, EloLedger §6.1, Blackout §9.2, StateTransitionLog §12.4).

## Code References
- Spec: toàn bộ `docs/agent-spec/flow1-step5/6/7/8/9/10/11/12*.md` (phần Data model của từng file).
- Kiểu tham chiếu: `core/models.py` (style comment tiếng Việt, TextChoices, constraints), `backend/settings.py` (INSTALLED_APPS), `backend/tier_config.py` (pattern config), `core/admin.py` (pattern admin).
- KHÔNG sửa: `core/models.py`, `core/views.py`, `mobile/` (prompt này chỉ tạo app mới + 1 dòng INSTALLED_APPS).

## Testing Checklist
- `makemigrations --check` không báo thiếu migration sau khi clone repo mới.
- Test model: tạo Booking vi phạm unique `(job, carepartner)` → IntegrityError; `MatchingWeight` tổng 99 → ValidationError; `JobSlot` time_to <= time_from → IntegrityError.
- Test seed: chạy command 2 lần → số row EloBand vẫn = 6, CancelPolicy = 7, MatchingWeight active = 1 bộ, NotificationTemplate = 16.
- Test constants: mọi enum status trong `STATUS_LABELS_VI` (13 + 16 nhãn VI); mọi transition trong bảng Step 12 đều có trong dict; viết test duyệt ngược (mỗi đích-to của bảng có trong dict).
- Test `EloBand` default: band `normal` phủ 1050-1249 đúng spec.

## Edge Cases
- `EloBand.only_when_pool_below` cho phép null (band trusted/good/normal) — không ép default 8 cứng.
- `CancelPolicy.max_lead_minutes` null = vô cực (T1); `escalate_to` blank = không escalation.
- `Booking.cancel_evidence` JSON list rỗng mặc định; `total_value_vnd` > 0 (CheckConstraint).
- Migration phải chạy được trên DB rỗng VÀ trên DB đã có data (app mới, không đụng bảng cũ — nhưng `User` thêm nothing, chỉ FK từ bảng mới).

## Dependencies
- Không có (task đầu tiên). Prompt 02-12 đều phụ thuộc task này.
