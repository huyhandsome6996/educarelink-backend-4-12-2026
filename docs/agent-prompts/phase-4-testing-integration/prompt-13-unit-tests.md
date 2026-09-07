# Prompt 13 — Unit Test Toàn Bộ Business Logic

## Context
Bộ test tối thiểu của từng spec file (Testing Checklist cuối mỗi file) hiện nằm rải rác trong các prompt 01-12 dưới dạng yêu cầu; prompt này TẠO SUITE UNIT TEST THỐNG NHẤT cho toàn bộ phép toán nghiệp vụ — nơi sai 1 biên là sai tiền/sai điểm tin nhiệm. Tester agent dùng suite này làm gate CI. Nguyên tắc: test thuần logic (freeze time, mock AI), KHÔNG mock DB.

## Requirements (nguồn spec)
- Step 2 §Testing: seed A/B/C matching; quá khứ; biên radius; booking trùng; newcomer neutral.
- Step 5 §Testing: window math 5 biên; cancel T0 trong window; freeze deadline; recurring thiếu 1 ngày → 409 + zero locks; FM note < 20 ký tự → 400; replay idempotency.
- Step 6 §Testing: 1200→1274 band good; T5 band drop; decay 100 ngày = -37.5; 200 ngày bỏ qua; cooldown 50%; blocked absent; restricted pool; grep serializer; webhook 2 lần; throttle watch; band edit không deploy.
- Step 7 §Testing: 5 biên tier; FM giữ đền bù; 2×T4 escalation; recurring value còn lại; appeal 4 nhánh; parent cancel 3 nhánh; replay cancel; CancelPolicy DB-edit.
- Step 9 §Testing: khóa window có booking; blackout xung đột; reschedule ngoài availability; expired +31'; 3rd reschedule; 14 ngày pause; midnight split; cache invalidate; 31st blackout.
- Step 10 §Testing: buffer 19:30 FAIL / 20:30 PASS.
- Step 11 §Testing: 4 case parse (gender/ambiguity/abusive/malformed); weights DB; sum 99 reject; Gemini 503 fallback; newcomer defaults; 1 batched call; VI sentence ≤120 ký tự; cache re-parse.
- Step 12 §Testing: transition hợp lệ/409; log 1 row/hop; disputed freeze; idempotent penalty.

## Acceptance Criteria
1. Suite `matching/tests/unit/` gồm ≥ 9 file: `test_window_math.py, test_tier_resolution.py, test_elo_math.py, test_subscores.py, test_buffer.py, test_availability_math.py, test_blackout_rules.py, test_state_transitions.py, test_guardrails.py` — tổng ≥ 120 test case.
2. MỌI test freeze thời gian qua helper chung `matching/tests/utils.py::freeze_time(dt)` (mock `django.utils.timezone.now` + `datetime.now` trong matching namespace) — cấm `datetime.now()` trong code nguồn (có test grep).
3. Biên SỐ HỌC test ĐÚNG từng con số spec (ví dụ decay: tạo penalty 30d23h59'59" → ×1.00; +1s → ×0.60; window: start cách 24h00'01" → 30 phút).
4. `test_subscores.py` kiểm 7 công thức §11.6 với bảng expected dựng sẵn (≥ 3 case/công thức, gồm newcomer).
5. Coverage: `pytest --cov=matching/services --cov-fail-under=85` pass (config trong `pytest.ini`/`pyproject.toml` thêm nếu chưa có).
6. Suite chạy KHÔNG cần network (mock mọi Gemini/Expo call qua `responses`/`unittest.mock`), không cần thiết bị.
7. Chạy trên PostgreSQL (CI env `DATABASE_URL`) — SQLite chỉ dùng local dev; test concurrency cơ bản (select_for_update) mark skip nếu SQLite.

## Technical Approach
- Factory: `matching/tests/factories.py` (User parent/worker, JobPost + slots, Booking theo trạng thái, EloLedger seed, CancelPolicy/EloBand từ seed command — gọi trong setUpClass 1 lần).
- Pattern parametrize (`@pytest.mark.parametrize`) cho bảng tier/window/decay — mỗi dòng spec = 1 param.
- Test đặt tên tiếng Anh chuẩn `test_<hành_vi>_<điều_kiện>_<kết_quả>`; comment tiếng Việt ngắn giải thích spec line.

## Code References
- Spec: Testing Checklist của 12 file.
- Tạo: `matching/tests/{utils.py, factories.py, unit/*.py}`; sửa `pytest.ini`/CI workflow nếu repo có (`.github/workflows` — kiểm tra; nếu chưa có thêm file workflow đơn giản chạy pytest + coverage).
- Tham chiếu style test hiện có: `core/tests_smart_match.py`, `core/tests_tier.py`.

## Testing Checklist
- `pytest matching/tests/unit -q` xanh 100%.
- Chỉnh 1 dòng công thức decay sai → test đỏ (sanity check người bảo trì).
- Suite < 60s.
- Chạy song song (`pytest -n auto` nếu có pytest-xdist) không flaky.

## Edge Cases
- Timezone: các biên "ngày" (throttle theo ngày, clean_month 30 ngày) phải test KHÔNG đối xứng qua nửa đêm VN (23:59 vs 00:01).
- Leap year / tháng 31 ngày cho clean_month + decay (dùng timedelta, không cộng tháng thủ công).
- Ledger rỗng → effective = 1200; band normal.
- matching với JobPost không slot → 400 chứ không chia 0.

## Dependencies
- Prompt 01-07 đã merge (đo logic cần code thật). Chạy sau Phase 2, song song Phase 3 (cập nhật thêm khi 09-12 merge).
