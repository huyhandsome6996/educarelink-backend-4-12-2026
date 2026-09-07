# ANALYSIS REPORT — Ghép cặp Phụ huynh ↔ CarePartner (Flow 1)

> Bản phân tích gap giữa spec (`docs/agent-spec/`) và codebase hiện tại (`main`, commit `ebf6b6b`).
> Người viết: Planning Agent. Ngày: 2026-09-07. Dành cho: coding agent + testing agent.
> Cách dùng: đọc `README.md` (index) → chọn prompt theo phase → coding agent thực thi đúng 1 prompt/PR.

---

## 1. Current State (hiện trạng codebase `main`)

### 1.1 Stack & quy ước (nguồn: `AGENTS.md`)
| Hạng mục | Giá trị |
|---|---|
| Backend | Django 5.2 + DRF, Python 3.11, JWT SimpleJWT (access 60m / refresh 30d) |
| DB | SQLite (dev) / PostgreSQL (prod — Neon/Supabase/Render) |
| Mobile | React Native, Expo SDK 54 (`mobile/`), screens tại `mobile/src/screens/` |
| AI | Google Gemini `gemini-2.5-flash(-lite)` qua `google-genai`, có sẵn fallback chain `performance/gemini_model.py` + pool `performance/gemini_pool.py` |
| Push | Expo Push — helper `send_expo_push_notification()` tại `core/views.py:74`, đã có channel config (`critical_alerts`, `emergency-alerts`) |
| Timezone | `Asia/Ho_Chi_Minh` (bắt buộc mọi tính toán thời gian) |
| Ngôn ngữ | UI tiếng Việt; **commit message TIẾNG VIỆT (bắt buộc theo AGENTS.md)** |
| ID | Model hiện tại dùng **int PK**; **mọi model MỚI phải dùng UUIDField** (spec + yêu cầu owner) |
| Scheduler | KHÔNG có Celery — scheduler tự viết bằng thread, khởi động trong `Apps.ready()` (ví dụ `core/apps.py:7` → `keepalive_scheduler.start_scheduler()`, `core/anomaly_scheduler.py`, `payments/scheduler.py`) |
| Config pattern | settings-based: `backend/tier_config.py`; spec yêu cầu nâng cấp lên **bảng DB** cho mọi con số nghiệp vụ |

### 1.2 Models hiện có (`core/models.py`, 507 dòng)
| Model | Ghi chú liên quan spec |
|---|---|
| `User` | role `parent/worker`, `is_approved`, `latitude/longitude`, `expo_push_token`, `qualifications` (JSON), `tier` B4 (bronze/silver/gold/diamond) — **không có ELO, không có CarePartnerProfile** |
| `ServiceCategory` | danh mục chung, **không ràng buộc 3 loại job** (gia-sư/trông-trẻ/đón-trẻ chỉ là 3 trong nhiều category) |
| `Task` | int PK, 1 status `open/in_progress/completed/cancelled`, `price` tổng, `scheduled_time` **đơn** (1 datetime — không支持 nhiều ngày/recurring), geofence, `completed_at` |
| `TaskApplication` | `pending/accepted/rejected` — luồng **worker chủ động apply → parent duyệt** (NGƯỢC với spec auto-commit) |
| `Review` | 1-5 sao, OneToOne Task |
| `WorkerAvailability` | weekday 0=Thứ2..6=CN, `start_time/end_time`, có UniqueConstraint + CheckConstraint + index — **khớp cấu trúc Step 4** (chỉ khác tên field `start_time/end_time` vs `time_from/time_to`) |
| `Notification` | cơ bản: recipient/title/message/is_read — **không có class critical/important/info, không template, không status giao hàng, không multi-channel** |
| `CredentialSubmission`, `ProfileChangeRequest`, `PricingRule`, `LandingPageVisit/Survey/Signup` | không liên quan trực tiếp |

### 1.3 Matching hiện có (`core/services/smart_match.py`, 210 dòng)
- Input: 1 `Task` với 1 `scheduled_time` → lọc theo weekday + time-point (không phải range coverage).
- Hard filters: `role='worker', is_approved=True, is_active=True, có toạ độ`, bán kính qua `performance/spatial.py::bounding_box_filter`.
- Ranking: workload-ngày → workload-tuần → khoảng cách → worker_id. **Không có 7-factor, không ELO, không kiểm tra booking trùng, không buffer 90 phút, không max-8.**
- Endpoint: `GET /api/parent/tasks/<id>/smart-matches/` (`core/urls.py`, view `SmartMatchAPIView`).

### 1.4 Hạ tầng có thể tái sử dụng (quan trọng cho coding agent)
| Tài sản | Vị trí | Dùng cho |
|---|---|---|
| Gemini fallback chain + cache model | `performance/gemini_model.py`, `performance/gemini_pool.py` | Prompt 6, 7 |
| Bounding-box spatial filter | `performance/spatial.py::bounding_box_filter` | Prompt 7 |
| Expo push helper có channel/priority config | `core/views.py:74` `send_expo_push_notification()` | Prompt 11 |
| Scheduler thread pattern | `core/apps.py ready()` + `core/keepalive_scheduler.py`, `core/anomaly_scheduler.py` | Prompt 9, 11, 12 (beat tasks) |
| Kiểm duyệt AI task khi đăng | `moderation/services.py` | Prompt 6 (safety screening tham chiếu pattern) |
| MoMo Payment/escrow | `payments/` | ghi chú: Phase 2 trừ tiền CP, MVP chỉ credit |
| Mobile screens sẵn có | `mobile/src/screens/Parent/{CreateTaskScreen,SmartMatchesScreen,CandidatesScreen,CandidateProfileScreen,MyTasksScreen}.js`, `mobile/src/screens/Worker/{WorkerAvailabilityScreen,MyJobsScreen}.js`, `mobile/src/api/tasks.js`, theme `mobile/src/theme/colors.js` | Prompt 8, 15 |
| Config constants pattern | `backend/tier_config.py` | tham chiếu khi làm bảng DB config |
| Admin patterns | `core/admin.py`, `core/tier_views.py`, `core/admin_stats.py` | Prompt 1, 2, 10 (admin pages) |

---

## 2. Gaps Identified (theo từng spec step)

| # | Spec | Gap chính | Mức độ |
|---|---|---|---|
| S1 | Step 1 (posting) | Không có `JobPost` theo 3 loại + form fields riêng biệt; `Task` chỉ 1 datetime, không dates[]/recurring/destination. Mobile `CreateTaskScreen` đi luồng cũ | 🔴 lớn |
| S2 | Step 2 (matching) | `smart_match.py` thiếu: JobRequirement, slot-expansion từ lịch tuần, kiểm tra booking trùng + blackout, 7-factor scoring, max-8, `total_matched`, API contract mới | 🔴 lớn |
| S3 | Step 3 (UI) | `SmartMatchesScreen` hiển thị theo schema cũ; thiếu header total_matched, match_level VI, chips, latest_review, empty/loading states, "Xem thêm" | 🟡 trung |
| S4 | Step 4 (availability) | Model khớp; thiếu: chặn activate khi 0 window, API `/api/carepartners/me/availability` (hiện là `/api/worker/availability/`), bulk replace, 409 khi xóa window có booking | 🟢 nhỏ-vừa |
| S5 | Step 5 (auto-commit) | **Hoàn toàn chưa có**: model Booking, commitment window, hard cap 5', force-majeure codes, idempotency, 409 slot_taken | 🔴 lớn |
| S6 | Step 6 (ELO) | Chưa có: hidden_elo, EloLedger, EloBand, decay/cooldown, throttle, CI grep test | 🔴 lớn |
| S7 | Step 7 (cancel) | Chưa có: CancelPolicy, tier T0-T6, Compensation, ParentWallet, Appeal, no-show flow, ParentTrustFlag | 🔴 lớn |
| S8 | Step 8 (notify) | Có push helper + Notification cơ bản; thiếu: class/priority/sound chuẩn spec, NotificationTemplate, DeviceToken (đang là 1 field trên User), retry/backoff, inbox chuẩn, auto-replacement, ReplacementAttempt, quiet hours | 🔴 lớn |
| S9 | Step 9 (blackout/reschedule) | Chưa có CarePartnerBlackout, reschedule flow, 14-day pause, available_slots() single-source, cache 60s, midnight split | 🔴 lớn |
| S10 | Step 10 (lock) | Chưa có SlotLock (soft 5'/hard), **buffer 90 phút**, all-or-nothing recurring, kiểm soát concurrency | 🔴 lớn |
| S11 | Step 11 (Gemini) | Có Gemini client; thiếu: task registry, structured-output contract, `ai_parse_status`, confidence→clarification, gender guardrail, MatchingWeight DB, PromptTemplate, AiCallLog, token budget, batching re-rank | 🔴 lớn |
| S12 | Step 12 (state machines) | Status của Task/TaskApplication khác hoàn toàn bộ trạng thái spec; thiếu StateTransitionLog, transition map data-driven, beat tasks | 🔴 lớn |

### Quyết định kiến trúc (BẮT BUỘC tuân theo — mọi prompt đều dựa vào đây)
1. **App mới `matching/`** chứa toàn bộ luồng ghép cặp (JobPost, Booking, ELO, lock, cancel, notification v2...). KHÔNG sửa `Task`/`TaskApplication` hiện có — chúng đang bị `tracking/`, `chat/`, `payments/` tham chiếu dày đặc. Luồng cũ vẫn chạy song song cho đến khi owner quyết định chuyển hẳn.
2. **UUID PK cho mọi model mới**. FK tới `core.User`.
3. **Không đụng URL cũ**: endpoint mới dùng prefix riêng (`/api/jobs/`, `/api/bookings/`, `/api/matching/`, `/api/carepartner/`, `/api/devices/`, `/api/wallet/`). Riêng notification inbox mới đi `/api/v2/notifications/` (tránh đè `/api/notifications/` mà mobile bản đang store đang gọi) — deviation có chủ đích, đã ghi trong prompt 11.
4. **Mọi con số nghiệp vụ vào DB**: `EloBand`, `CancelPolicy`, `MatchingWeight`, `NotificationTemplate`, `PromptTemplate` + management command `seed_matching_config`. Cấm hardcode trọng số/threshold.
5. **Tồn tại song song với tier B4**: `User.tier` (bronze..diamond) vẫn giữ; ELO là trục tin nhiệm mới gắn vào `CarePartnerProfile` — không merge, không xóa B4.
6. **State machine data-driven**: 1 module `matching/state.py` khai báo transition map từ Step 12; mọi API đi qua validator; vi phạm → HTTP 409 + `StateTransitionLog`.
7. **Notification**: enqueue trong transaction, gửi ở `transaction.on_commit()` (Step 12.3.5).
8. **Booking + ELO + compensation + lock phải ATOMIC trong cùng transaction** với transition (Step 12.3.4).

---

## 3. Implementation Plan

### Dependency graph
```text
P1-01 Schema+Config ──┬──> P1-02 ELO service ──────┐
                      ├──> P1-03 Lock+Buffer ──────┤
                      └──> P1-04 Blackout+Resched ─┤
P2-05 JobPost API ────┬──> P2-06 Gemini parsing ────┤
                      │                             ├──> P2-07 Matching engine ──> P2-08 Candidates API+UI
                      └─────────────────────────────┘                                     │
P3-09 Auto-commit booking <── needs 03, 05, 08 ──────────────────────────────────────────┘
P3-10 Cancel/Compensation/Appeal <── needs 09, 02
P3-11 Notifications+Replacement <── needs 09, 10 (infra DeviceToken/Template có thể làm sớm)
P3-12 Execution+StateMachines+schedulers <── needs 09, 10, 11
P4-13 Unit tests <── sau 01..07   |   P4-14 Integration tests <── sau 09..12
P4-15 Mobile integration <── sau 05, 08, 09, 10, 11
```

### Bảng task (15 prompts — mỗi prompt = 1 nhánh/PR trên branch `ghep-cap-phu-huynh-carepartner`)

| Prompt | File | Phase | Ước lượng | Rủi ro chính |
|---|---|---|---|---|
| 01 | `phase-1-foundation/prompt-01-database-schema-config.md` | 1 | XL (3-4 ngày) | migration đụng User; seed config sai |
| 02 | `phase-1-foundation/prompt-02-hidden-elo.md` | 1 | L (2-3 ngày) | sai biên decay/cooldown |
| 03 | `phase-1-foundation/prompt-03-schedule-locking.md` | 1 | L (2 ngày) | race condition — phải test 50 threads |
| 04 | `phase-1-foundation/prompt-04-availability-blackout.md` | 1 | L (2-3 ngày) | window cắt qua nửa đêm; cache invalidate |
| 05 | `phase-2-job-matching/prompt-05-jobpost-api.md` | 2 | L (2 ngày) | validation 3 loại form |
| 06 | `phase-2-job-matching/prompt-06-gemini-parsing.md` | 2 | XL (2-3 ngày) | structured output + fallback |
| 07 | `phase-2-job-matching/prompt-07-matching-engine.md` | 2 | XL (3 ngày) | hiệu năng <2s; đúng công thức 11.6 |
| 08 | `phase-2-job-matching/prompt-08-candidate-ui.md` | 2 | M (1.5 ngày) | map label VI đủ 12 seed case |
| 09 | `phase-3-booking/prompt-09-auto-commit.md` | 3 | XL (3 ngày) | atomic select + idempotency |
| 10 | `phase-3-booking/prompt-10-cancellation-compensation.md` | 3 | XL (3-4 ngày) | tier/force-majeure/escalation/idempotent |
| 11 | `phase-3-booking/prompt-11-notifications-replacement.md` | 3 | XL (3 ngày) | sound trên máy thật; retry không trùng |
| 12 | `phase-3-booking/prompt-12-execution-state-machines.md` | 3 | L (2-3 ngày) | beat task idempotent khi re-run |
| 13 | `phase-4-testing-integration/prompt-13-unit-tests.md` | 4 | L (2 ngày) | đúng biên số học |
| 14 | `phase-4-testing-integration/prompt-14-integration-tests.md` | 4 | L (2 ngày) | mô phỏng concurrency thật |
| 15 | `phase-4-testing-integration/prompt-15-mobile-integration.md` | 4 | XL (3-4 ngày) | đồng bộ 2 nền tảng + sound |

Tổng ước lượng: ~35-40 ngày-cong cho 1 agent; ~2 tuần nếu 3 agent chạy song song theo phase (P1 song song 02/03/04 sau khi 01 xong; P2 song song 06/07 sau 05; P3 tuần tự 09→10→11→12).

### Chiến lược test
- **Mỗi prompt có Testing Checklist riêng là bộ tối thiểu** (Step README yêu cầu); Prompt 13/14 nâng thành suite đầy đủ.
- Concurrency (Step 10) và thời gian (Step 5, 7) phải có test freeze-time (`unittest.mock.patch` trên `django.utils.timezone.now`).
- CI gate: grep serializer cấm lộ `hidden_elo|effective_elo` (Step 6 AC3).
- Mobile: bắn push thật trên Android vật lý (AC Step 8.1) — tester agent cần thiết bị, không đủ với emulator.

### Rủi ro tổng thể
| Rủi ro | Giảm thiểu |
|---|---|
| 2 hệ status (Task cũ vs JobPost mới) gây nhầm cho mobile dev | Prompt 15 liệt kê rõ endpoint nào thuộc hệ mới |
| Gemini chi phí/latency | token budget + cache + fallback rule-based (Step 11.7) — có AC riêng |
| Concurrency lock sai trên SQLite dev | test bắt buộc chạy trên PostgreSQL (CI) — ghi trong prompt 03/09/14 |
| Spec thay đổi (`OPEN-QUESTIONS.md` là living doc) | mọi số đọc từ DB config; đổi = data change, không deploy |
