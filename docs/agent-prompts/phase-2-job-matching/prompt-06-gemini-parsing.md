# Prompt 06 — Gemini Job Parsing + Safety Screening + Guardrails

## Context
Sau khi job được published (Prompt 05), Gemini parse payload thành `JobRequirement` chuẩn hóa (Step 2.1) theo contract structured-output của Step 11.3. Nguyên tắc chủ đạo (Step 11.1): dùng Gemini tối đa những chỗ nó giỏi, NHƯNG không bao giờ là nguồn chân lý duy nhất cho tiền bạc/xử phạt/cấm tài khoản; matching phải chạy được cả khi Gemini chết. Repo ĐÃ CÓ hạ tầng Gemini (`performance/gemini_model.py` fallback chain + `gemini_pool.py`) — tái sử dụng, không dựng lại.

## Requirements (nguồn `flow1-step11-ai-gemini-scoring.md`)
- §11.2 task registry MVP scope của prompt này: #1 parse JobRequirement, #2 title/summary VI, #3 clarification questions, #4 classify job_type (parent choice luôn thắng), #5 normalize skills, #6 safety screening, #7 urgency, #11 duplicate/spam, #16 onboarding assistant (để chỗ cắm, không bắt buộc).
- §11.3 structured output: JSON schema ĐẦY ĐỦ như spec (job_type, title_vi, summary_vi, required_skills, target_group, dates, recurrence, time_from/to, hourly_rate_vnd, location, special_requirements, gender_preference, experience_required, suitable_for_newbie, urgency, sensitivity_level, safety_flags, needs_verification, needs_admin_review, clarification_questions, field_confidence, model_version, prompt_version). BẮT BUỘC dùng Gemini structured output / function calling — cấm parse JSON tự do.
- Validation: schema fail → retry 1 lần kèm repair instruction → vẫn fail → rule-based fallback + `ai_parse_status = fallback` (ok | repaired | fallback lưu trên JobPost). Confidence < 0.6 → clarification_questions hỏi lại parent. AI KHÔNG được override `job_type` parent chọn.
- §11.4 gender guardrail: CHỈ cho phép childcare/pickup; tutoring → bỏ hẳn + hiện notice "Để đảm bảo công bằng, yêu cầu giới tính không áp dụng cho việc gia sư."; khi cho phép là SOFT (score boost) trừ khi parent xác nhận lý do an toàn; log mọi lần dùng.
- §11.5 safety: 5 nhóm flag (child endanger, medical, overnight, hate, off-platform payment); severity low=log, medium=cảnh báo parent vẫn cho đăng, high=CHẶN đăng + tạo admin review item (`JobPost.needs_admin_review=true`).
- §11.7 chi phí: temperature 0.1, max_output_tokens 1200, timeout 8s, retry 1; cache theo `(job_id, updated_at)`; token budget/ngày → vượt thì degrade rule-based + alert owner; AiCallLog ghi MỖI call (tokens_in/out, latency, status ok|repaired|fallback|error).

## Acceptance Criteria
1. Publish job → signal enqueue parse → JobPost.status `ai_parsing` → parse xong `ai_parsed` (transition qua state helper) + tạo/cập nhật `JobRequirement` (JSON lưu trên JobPost `ai_requirement`) + JobSlots đồng bộ từ dates parse ra.
2. Gọi Gemini bằng structured output với JSON schema spec; response fail schema → retry 1 lần → fallback `matching/services/rule_parser.py` (regex/dict VN→chuẩn: "cần gấp"→urgency high; "can nu"→special_requirements ["nu"]...).
3. `ai_parse_status` đúng 3 giá trị; test mock 3 đường: ok, repaired (lần 1 fail schema, lần 2 pass), fallback (Gemini lỗi/malformed 2 lần).
4. Field confidence < 0.6 → có mặt trong `clarification_questions`; API `GET /api/jobs/<id>/clarifications` cho parent xem; parent `POST .../confirm` sửa field → status quay lại `ai_parsed` (từ `ai_failed` theo Step 12).
5. Parent chọn tutoring + description ghi "chỉ nhận nữ" → `gender_preference` KHÔNG lưu, response API kèm notice công bằng; childcare/pickup "cần bạn nữ" → lưu `gender_preference=female` + row `GenderPreferenceLog`.
6. Nội dung "trả tiền mặt ngoài app" → safety severity high → job KHÔNG được publish (`needs_admin_review`), tạo AdminReviewItem, parent nhận cảnh báo; nội dung medium (vd "qua đêm có trẻ") → cảnh báo vẫn đăng.
7. Gemini 503/mock lỗi → matching vẫn chạy rule-based (test ở Prompt 07 consume); AiCallLog.status = error với latency + error message.
8. Mọi call ghi AiCallLog (prompt_key, prompt_version, model, tokens, latency_ms, status); body request/response CHỈ lưu khi needs_admin_review=true.
9. Cache: parse lại job KHÔNG đổi → không tốn token (tokens_out=0, hit cache — test 2 lần gọi).
10. PromptTemplate seed qua `seed_matching_config` thêm key `job_parse_v1` với body prompt tiếng Việt + variables đúng schema; đổi template trong DB → lần parse sau dùng bản mới (test bằng 2 version).
11. Duplicate/spam: job text trùng ≥ 90% với job mở của cùng parent trong 24h → flag `duplicate` → 400 khi publish (dùng Gemini #11 hoặc so khớp đơn giản khi fallback).

## Technical Approach
- `matching/services/gemini_client.py`: wrapper duy nhất gọi `performance/gemini_model.py::get_preferred_gemini_model()` + `google_genai` SDK, tham số §11.7, timeout 8s, tự viết AiCallLog.
- `matching/services/job_parser.py`: `parse_job(job) -> (requirement dict, status)`; repair flow; confidence check; `apply_guardrails(requirement, job)` xử lý gender + safety; đồng bộ JobSlots.
- `matching/services/rule_parser.py`: fallback thuần Python (keyword map VN: môn học, độ tuổi, gấp, nữ/nam, ngày mai...).
- `matching/services/safety.py`: map severity → hành động; tạo `AdminReviewItem` (model mới nhỏ trong matching hoặc dùng JSON trên JobPost + trang admin lọc `needs_admin_review=true` — chọn phương án admin lọc JobPost để giảm bảng).
- Signal: postMutation khi `transition_to(job, 'published')` → enqueue. Hàng đợi: thread pool mini (như scheduler pattern) hoặc gọi đồng bộ trong request với celery-like worker nhẹ — CHỌN đồng bộ-in-background-thread (env `ENABLE_MATCHING_AI`).
- Token budget: bảng `MatchingConfig(key='ai_daily_budget_tokens')`; counter theo ngày trong `AiCallLog` (SUM tokens_out WHERE created_at date = today); vượt → `degrade_ai()` trả fallback luôn.

## Code References
- Spec: `flow1-step11-ai-gemini-scoring.md` (§11.2-11.8), `flow1-step2-matching-engine.md` §2.1, `flow1-step12-state-machines.md` (ai_parsing transitions).
- Sử dụng: `performance/gemini_model.py` (chain), `performance/gemini_pool.py`, pattern moderation `moderation/services.py` (cách gọi Gemini + parse JSON an toàn hiện có).
- Tạo: `matching/services/{gemini_client,job_parser,rule_parser,safety}.py`, `matching/tests/test_gemini_parsing.py`, cập nhật `matching/management/commands/seed_matching_config.py` (thêm PromptTemplate seed).
- Sửa `matching/api/jobs.py`: thêm clarifications + confirm endpoint.

## Testing Checklist (spec §Testing + bổ sung)
- "Cần bạn nữ đưa đón bé gái lớp 1 từ trường về nhà vào 16h30 hằng ngày" → pickup, gender=female, child_involved, recurrence daily, sensitivity medium.
- Tutoring chứa "chỉ nhận nữ" → gender null + notice.
- Mơ hồ "cần người giúp" → ≥1 clarification + confidence thấp.
- "trả tiền mặt ngoài app" → high flag → block + admin item.
- Malformed JSON mock → repair 1 lần → fallback; job vẫn matchable.
- Gemini 503 → fallback, AiCallLog.error, alert log.
- Newcomer-safe: parse KHÔNG phụ thuộc lịch sử user.
- 2 lần parse không đổi → lần 2 tokens_out = 0 (cache).
- Parent đổi job_type sau parse → AI không override (test gửi body type khác → final type = parent's).

## Edge Cases
- Description tiếng Việt không dấu + teencode ("can gap lam") — rule_parser phải bắt.
- Ảnh trong description (URL) → bỏ qua, chỉ parse text.
- Job draft edit nhiều lần → cache key (job_id, updated_at) tự invalidate.
- Gemini trả thiếu field schema → coi như fail → repair.
- Budget cạn giữa ngày → mọi job về fallback + admin dashboard badge "AI degraded".

## Dependencies
- Prompt 01 (AiCallLog, PromptTemplate, MatchingConfig), Prompt 05 (JobPost + signal published).
- Prompt 07 consume `ai_requirement` — hợp đồng JSON phải chốt trong prompt này.
