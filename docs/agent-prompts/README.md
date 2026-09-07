# Agent Prompts — Ghép cặp Phụ huynh ↔ CarePartner (Flow 1)

Thư mục này chứa **bộ prompt thực thi** cho coding agent, sinh ra từ phân tích gap giữa `docs/agent-spec/` và codebase `main`. Tester agent dùng các Testing Checklist trong từng prompt + 2 prompt test (13, 14) để kiểm thử.

## Cách dùng
1. Đọc `docs/agent-spec/README.md` + `OPEN-QUESTIONS.md` trước (spec là nguồn chân lý).
2. Đọc `00-ANALYSIS-REPORT.md` — đặc biệt mục **Quyết định kiến trúc** (8 điều bắt buộc).
3. Coding agent: lấy ĐÚNG 1 prompt → làm trên branch `ghep-cap-phu-huynh-carepartner` → 1 prompt = 1 PR. KHÔNG tự ý làm tasks khác.
4. Testing agent: chạy checklist của prompt tương ứng + Prompt 13/14. Test concurrency bắt buộc chạy trên PostgreSQL.

## Thứ tự thực thi (dependency)
```text
01 → (02 | 03 | 04 chạy song song) → 05 → (06 | 07) → 08 → 09 → 10 → 11 → 12 → 13 → 14
                                                            ↘ 15 (mobile, sau 11)
```

## Danh sách prompt
| # | File | Tóm tắt |
|---|---|---|
| 01 | `phase-1-foundation/prompt-01-database-schema-config.md` | App `matching/`: toàn bộ model + migration + bảng config + seed |
| 02 | `phase-1-foundation/prompt-02-hidden-elo.md` | Hidden ELO: ledger, decay, cooldown, band, throttle, CI grep |
| 03 | `phase-1-foundation/prompt-03-schedule-locking.md` | SlotLock mềm/cứng + buffer 90 phút + available_slots() |
| 04 | `phase-1-foundation/prompt-04-availability-blackout.md` | Rule khóa lịch, blackout, reschedule, cache 60s |
| 05 | `phase-2-job-matching/prompt-05-jobpost-api.md` | JobPost 3 loại + slots expansion + API đăng việc |
| 06 | `phase-2-job-matching/prompt-06-gemini-parsing.md` | Gemini structured output + fallback + safety + guardrail |
| 07 | `phase-2-job-matching/prompt-07-matching-engine.md` | 7-factor scoring + hard filters + max-8 + re-rank |
| 08 | `phase-2-job-matching/prompt-08-candidate-ui.md` | API candidates + màn hình danh sách ứng viên (mobile) |
| 09 | `phase-3-booking/prompt-09-auto-commit.md` | Auto-commit booking + commitment window + idempotency |
| 10 | `phase-3-booking/prompt-10-cancellation-compensation.md` | T0-T6, force majeure, ví credit, no-show, kháng cáo |
| 11 | `phase-3-booking/prompt-11-notifications-replacement.md` | Notification class + sound bắt buộc + auto-replacement |
| 12 | `phase-3-booking/prompt-12-execution-state-machines.md` | State machine + beat tasks + luồng thực hiện đơn |
| 13 | `phase-4-testing-integration/prompt-13-unit-tests.md` | Unit test toàn bộ business logic |
| 14 | `phase-4-testing-integration/prompt-14-integration-tests.md` | Integration test booking flow + concurrency |
| 15 | `phase-4-testing-integration/prompt-15-mobile-integration.md` | Tích hợp mobile: form, lịch, ví, thông báo, sound |

## Quy ước chung mọi prompt
- Commit message **tiếng Việt** (AGENTS.md §0).
- Model mới = UUID PK, FK `core.User`, timezone `Asia/Ho_Chi_Minh`.
- Con số nghiệp vụ đọc từ DB config, không hardcode.
- UI tiếng Việt; enum trong code tiếng Anh snake_case; label VI trong 1 bản đồ dịch duy nhất.
- Notification enqueue trong transaction + `transaction.on_commit()` gửi.
- Mọi trạng thái đổi → ghi `StateTransitionLog`; transition trái phép → HTTP 409.
