# Prompt 14 — Integration Test Luồng Booking End-to-End + Concurrency

## Context
Unit test (Prompt 13) đo từng phép toán; integration test này đi TRỌN luồng nghiệp vụ thật theo đúng "End-to-end flow" của `docs/agent-spec/README.md`: đăng việc → parse → match → chọn (auto-commit) → window → cam kết → làm việc → review → ELO; NHÁNH LỄCH: hủy T1-T4, no-show T5, replacement, kháng cáo, dispute. Đặc biệt: 2 kịch bản mà spec nhấn mạnh là CONCURRENCY (50 threads) và "không push cho transaction rollback".

## Requirements (nguồn spec)
- `README.md` §End-to-end flow (đúng 2 nhánh chính + nhánh lỗi).
- Step 5 §Testing: 50 concurrent threads → 1 success 49×409; kill scheduler → GET vẫn flip; replay Idempotency-Key.
- Step 7 §Testing: toàn kịch bản cancel/no-show/appeal với THỜI GIAN THẬT mô phỏng (freeze + travel).
- Step 8 §Testing: rollback → không push; mock Expo 500 → retry; merge replacement.
- Step 10 §Testing + Step 12 §Testing: beat re-run an toàn; disputed freeze.
- `flow1-step9-availability-blackout-rules.md` §Testing: reschedule approve đổi lock atomic (không có khoảnh khắc unlock trống).

## Acceptance Criteria
1. Suite `matching/tests/integration/` ≥ 6 file: `test_happy_path.py, test_concurrency.py, test_cancellation_flows.py, test_replacement_flow.py, test_notification_delivery.py, test_scheduler_safety.py` — ≥ 40 test case.
2. `test_happy_path.py`: parent đăng job tutoring 3 buổi (Mon/Wed/Fri tuần sau) → parse (mock Gemini trả fixture) → match trả ≥1 candidate → select → awaiting_commitment (slots hard-locked, total_value đúng 3 slot) → travel qua deadline → committed (2 notification) → start → hoàn thành 3 slot lần lượt (end → awaiting_review) → cả 2 review → completed → ELO: +12×3 (job_completed per slot — theo quyết định Prompt 12) + review điểm + streak nếu chạm — assert CHÍNH XÁC số dư ELO + SỐ DÒ ledger + SỐ row StateTransitionLog theo từng hop.
3. `test_concurrency.py`: **50 thread chọn cùng CP** (ThreadPoolExecutor + `transaction.atomic` thật, PostgreSQL test DB) → đúng 1×201, 49×409 `slot_taken`; sau đó candidate list refresh KHÔNG còn CP đó cho job đó; verion_locked: đồng thời 2 parent chọn 2 CP khác nhau mà slot chồng → 1 thành công.
4. `test_cancellation_flows.py`: T1 (cancel 30h) full chain: tier đúng + ELO -15 + wallet 0 + unlock + job needs_replacement + replacement_found notification + candidates mới exclude CP cũ; T4 2 lần escalation; T5 qua no-show parent confirm; FM ×0.5.
5. `test_replacement_flow.py`: pool rỗng → no_replacement + sau mock 30 phút retry vẫn rỗng → +6h → admin alert record; auto_replace ON full điều kiện → booking mới tự tạo (slot mới lock, booking cũ cancelled_by_system? — theo spec booking cũ đã cancel, booking mới là record mới).
6. `test_notification_delivery.py`: exception GIỮA transaction (sau enqueue) → rollback → 0 push gửi (sender không chạy vì on_commit không fire); mock Expo 500 → 3 retry với next_retry_at 10/60/300 → failed → inbox vẫn có; merge 2 replacement cách 20s → 1 notification.
7. `test_scheduler_safety.py`: chạy `auto_transition()` + `noshow_scan()` + beat registry 2 lần liên tiếp → không duplicate transition/notification/ELO (assert số row trước/sau); scheduler tắt → GET booking flip lazy đúng.
8. Toàn bộ suite chạy trên PostgreSQL (CI), < 5 phút, không flaky khi chạy `pytest -n 4`.

## Technical Approach
- Fixture JSON Gemini response đặt `matching/tests/fixtures/gemini_*.json` (3 bộ: chuẩn, mơ hồ, abusive).
- Time travel helper: `freeze_time()` (13) + `travel(minutes)` advance.
- Push mock: patch `core.views.send_expo_push_notification` + `matching.services.notifier._push_one` ghi calls vào list assert.
- Concurrency: dùng `TransactionTestCase` (không wrap test trong atomic) cho test 50 threads; DB PostgreSQL từ env; nếu CI thiếu PG → mark `@skipUnless(os.environ.get('TEST_POSTGRES'))` nhưng CI PHẢI cấu hình PG service (ghi trong workflow).
- Setup dữ liệu dùng factories (13) + seed command.

## Code References
- Spec: README.md flow, Step 5/7/8/10/12 Testing Checklists.
- Tạo: `matching/tests/integration/*.py`, `matching/tests/fixtures/*.json`, `.github/workflows/backend-tests.yml` (nếu chưa có).
- Đo code: toàn bộ services matching/ (không sửa production code; nếu phát hiện bug → GHI ISSUE trong `docs/agent-prompts/KNOWN-ISSUES.md` + fix nhỏ kèm test).

## Testing Checklist (self-check của chính suite này)
- Suite xanh 2 lần liên tiếp (flaky check).
- Tắt 1 service (comment MockGemini) → test liên quan fail rõ ràng message.
- Chạy với Docker PG bản 15+ khớp prod.
- Báo cáo coverage integration ≥ 70% statements của matching/services.

## Edge Cases
- Thread race có thể flaky trên máy chậm → retry wrapper 3 lần chỉ cho test concurrency, log nếu retry.
- Clock freeze giữa thread pool phải áp dụng toàn cục (mọi thread thấy cùng now).
- Email/attachment notification không thuộc scope — chỉ push/inapp.
- Số dư ví là số nguyên VND; assert không có decimal trôi nổi.

## Dependencies
- Prompt 01-12 merge đủ. Chạy TRƯỚC khi cho phép merge branch `ghep-cap-phu-huynh-carepartner` lên main (gate).
