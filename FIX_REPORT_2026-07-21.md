# Báo cáo fix lỗi audit 2026-07-21 — EduCareLink Backend

> Agent thực hiện: Z.ai
> Ngày: 2026-07-21
> Nhánh làm việc: `fix/audit-2026-07-21` (tạo từ `main`)
> File audit gốc: `PHAN_TICH_REPO_EDUCARELINK.md` (nhánh `docs/repo-analysis-2026-07-21`)
> Tổng số lỗi xử lý: **6** (3 Nghiêm trọng + 3 Trung bình)

---

## Tóm tắt nhanh

| # | Mức độ | Lỗi | Commit | Trạng thái |
|---|---|---|---|---|
| L1 | 🔴 Nghiêm trọng | `db.sqlite3` bị track trong git | `55830d6` | ✅ Đã gỡ khỏi index. **Phát hiện PII thật trong history — chờ user quyết định có rewrite hay không** |
| L2 | 🔴 Nghiêm trọng | 4 scheduler chạy trùng trên 2 gunicorn worker | `1df2d91` | ✅ Cross-process lock bằng `fcntl.flock` |
| L3 | 🔴 Nghiêm trọng | Gần như không có test tự động | `66180fe` | ✅ Thêm 39 test case (auth, task, payment, SOS) |
| L4 | 🟡 Trung bình | Không có CI | — | ⚠️ File `django-ci.yml` đã soạn sẵn (lưu `/home/z/my-project/download/`), PAT không có scope `workflow` → user tự thêm |
| L5 | 🟡 Trung bình | `core/views.py` god file 2496 dòng | `9fce861` | ✅ Tách thành package `core/views/` với 8 file con |
| L6 | 🟡 Trung bình | `LocMemCache` không nhất quán giữa 2 worker | `7f6066c` | ✅ Ghi chú giới hạn vào `performance/README.md` (không fix code theo yêu cầu) |

---

## Chi tiết từng lỗi

### L1 — `db.sqlite3` bị track trong git (Nghiêm trọng)

**Commit**: `55830d6` — `chore: gỡ db.sqlite3 khỏi git tracking + báo cáo PII trong history`

**Việc đã làm**:
1. `git rm --cached db.sqlite3` — gỡ file khỏi git index (file vẫn còn local để chạy dev, **không sửa git history**).
2. Viết script `/home/z/my-project/scripts/check_sqlite_history.py` rà soát 11 commit chạm `db.sqlite3` từ 2026-04-12 đến 2026-06-27.
3. Tạo file `DB_HISTORY_AUDIT.md` ở root repo (commit cùng) báo cáo chi tiết.

**Phát hiện quan trọng — CÓ dữ liệu thật (PII) trong git history**:

| commit (lần đầu xuất hiện) | user_id | username | email | phone |
|---|---|---|---|---|
| `e4dba138` (2026-06-12) trở đi | 6 | `iamdoinb6996@gmail.commmmmm` | `iamdoinb6996@gmail.com` | `0862427404` |
| `e4dba138` (2026-06-12) trở đi | 7 | `test` | `highschoolofthedead252@gmail.com` | `0981636166` |

- Email `iamdoinb6996@gmail.com` **không khớp** pattern test (`@test.com` / `@example.com` / `@demo.com`). Username GitHub của repo là `huyhandsome6996` (cùng số `6996`), cùng họ tên "Huy Hồ" → gần như chắc chắn là **email cá nhân thật của chủ repo**. SĐT `0862427404` là số Viettel hợp lệ.
- Email `highschoolofthedead252@gmail.com` cùng SĐT `0981636166` cũng có dấu hiệu thật (Gmail hợp lệ, SĐT Viettel).
- Các tài khoản khác (`phuhuynh_lan`, `carepartner_anh`, v.v.) dùng `@email.com` (domain không tồn tại) + SĐT dạng sequential fake (`0982222222`, `0983333333`...) → được coi là dữ liệu demo.
- **Bảng `core_credentialsubmission` rỗng trong toàn bộ history** — không có ảnh CCCD / chân dung / bằng cấp thật bị đẩy lên git.

**Hành động tiếp theo — CẦN USER XÁC NHẬN**:

Theo yêu cầu ban đầu ("KHÔNG tự ý rewrite git history nếu chưa xác nhận"), agent KHÔNG thực hiện `git filter-repo` / BFG. User cần chọn 1 trong 2 lựa chọn (xem `DB_HISTORY_AUDIT.md` mục 4):

- **Lựa chọn A**: Rewrite history (force push tất cả nhánh) — PII hoàn toàn biến mất, nhưng bắt buộc tất cả collaborator/agent clone lại, có thể ảnh hưởng Render deploy.
- **Lựa chọn B**: Để nguyên history, rotate email/SĐT lộ — an toàn vận hành, chấp nhận rủi ro dư.

---

### L2 — 4 scheduler chạy trùng trên 2 gunicorn worker (Nghiêm trọng)

**Commit**: `1df2d91` — `fix: thêm cross-process lock cho 4 scheduler (chống chạy trùng trên 2 gunicorn worker)`

**Vấn đề**: `render.yaml` đặt `WEB_CONCURRENCY=2`. `AppConfig.ready()` chạy riêng ở mỗi worker process → 4 scheduler bị khởi động TRÙNG:
- `core/keepalive_scheduler.py` (gọi từ `core/apps.py`)
- `core/anomaly_scheduler.py` (gọi từ `core/apps.py`)
- `payments/scheduler.py` (gọi từ `payments/apps.py`)
- `tracking/offline_scheduler.py` (gọi từ `tracking/apps.py`)

`threading.Lock` chỉ chống race trong 1 process, không đủ.

**Fix**:
- Tạo helper module `core/scheduler_lock.py` dùng `fcntl.flock(LOCK_EX | LOCK_NB)` để acquire cross-process exclusive lock trên file `/tmp/educarelink_scheduler_*.lock`.
- Mỗi `start_xxx_scheduler()` gọi `acquire_scheduler_lock(name)` trước khi start. Nếu trả `None` (worker khác đã giữ lock) → skip start trên process này.
- Lock tự nhả khi process exit (kernel close fd) — không cần cleanup thủ công.
- Fallback an toàn nếu `fcntl` không có (Windows / dev).

**Files sửa**:
- `core/scheduler_lock.py` (mới)
- `core/keepalive_scheduler.py` — thêm 5 dòng gọi `acquire_scheduler_lock('keepalive')`
- `core/anomaly_scheduler.py` — thêm 5 dòng gọi `acquire_scheduler_lock('anomaly')`
- `payments/scheduler.py` — thêm 5 dòng gọi `acquire_scheduler_lock('payments_settlement')`
- `tracking/offline_scheduler.py` — thêm 5 dòng gọi `acquire_scheduler_lock('tracking_offline')`

**Smoke test** (script `/home/z/my-project/scripts/test_scheduler_lock.py`): ✅ PASSED
- Process A acquire OK
- Process B (con) bị chặn (trả `None`)
- Sau khi A release, B acquire lại được
- File lock chứa metadata `pid=<PID>` cho debug

---

### L3 — Gần như không có test tự động (Nghiêm trọng)

**Commit**: `66180fe` — `test: thêm test tự động cho auth, task lifecycle, payment, SOS`

**Trước**: `core/tests.py` và `frontend/tests.py` chỉ là stub Django mặc định (3 dòng). Toàn repo chỉ có 1 file test thật: `payments/tests/test_integration.py` (205 dòng, không chạy qua `manage.py test` mà chạy script standalone). Độ che phủ test ≈ 0% ở các luồng nhạy cảm.

**Sau**: Thêm **39 test case** (Django TestCase + DRF APIClient) cho 4 luồng chính:

#### a. Auth JWT — `core/tests.py` (10 tests)

`RegisterAPITest` (4):
- `test_register_parent_success` — parent đăng ký → 201 + auto-approve
- `test_register_parent_missing_email` — thiếu email → 400
- `test_register_parent_missing_phone` — thiếu phone → 400
- `test_register_worker_pending_approval` — worker đăng ký với CCCD + selfie (PNG thật) → 201 + pending_approval

`LoginRefreshAPITest` (5):
- `test_login_parent_success` — 200 + access + refresh token
- `test_login_wrong_password` — 401
- `test_login_worker_not_approved` — 403 + status='pending_approval'
- `test_login_locked_account` — 403 + status='account_locked'
- `test_refresh_token_flow` — refresh cũ → access mới

#### b. Task lifecycle — `core/tests.py` (6 tests)

`TaskLifecycleTest`:
- `test_parent_create_task_happy_path` — 201 + task='open'
- `test_worker_cannot_create_task` — 400 (DRF ValidationError)
- `test_unauthenticated_cannot_create_task` — 401
- `test_full_lifecycle_apply_approve_complete_review` — end-to-end happy path
- `test_cannot_complete_open_task` — chỉ 'cancelled' cho phép từ 'open'
- `test_worker_cannot_approve_own_application` — 404 (filter `task__parent=request.user`)

#### c. AI moderation edge case — `core/tests.py` (2 tests)

`TaskModerationRejectTest`:
- `test_task_with_banned_keyword_is_rejected` — từ khóa 'ma túy' → 400 (chặn đồng bộ)
- `test_task_with_exploitation_price_is_rejected` — giá < 20.000đ → 400 (bóc lột lao động)

#### d. Payment flow — `payments/tests/test_payment_flow.py` (12 tests)

`CashPaymentFlowTest` (6):
- `test_setup_cash_payment` — commission 20% tính đúng
- `test_cash_payment_completes_on_task_completion` — signal → release_escrow → completed
- `test_setup_payment_permission` — worker không setup được (PermissionError)
- `test_setup_payment_invalid_method` — method='bitcoin' → ValueError
- `test_setup_payment_task_already_completed` — task completed → ValueError
- `test_payment_log_is_created` — PaymentLog 'payment_created'

`MomoEscrowFlowTest` (5) — mock `momo_create_payment` / `momo_transfer_to_wallet`:
- `test_setup_momo_escrow_generates_payurl` — gọi API, lưu payUrl
- `test_setup_momo_escrow_failure_does_not_raise` — fallback gracefully
- `test_momo_ipn_success_moves_to_held` — IPN resultCode=0 → status='held'
- `test_momo_escrow_release_on_completion` — full flow setup → IPN → complete → completed

`PaymentCommissionTest` (2):
- `test_commission_20_percent` — rate mặc định = 0.20
- `test_commission_amount_for_various_prices` — 500k/1M/2M tính đúng

#### e. SOS endpoint — `tracking/tests/test_sos.py` (10 tests)

`SOSPermissionTest` (6):
- `test_parent_can_sos` — parent → 201
- `test_worker_can_sos` — worker accepted → 201
- `test_stranger_cannot_sos` — user lạ → 403
- `test_unauthenticated_cannot_sos` — anonymous → 401
- `test_sos_nonexistent_task` — 404
- `test_sos_missing_task_id` — 400

`SOSThrottleTest` (1):
- `test_sos_throttle_5_per_minute` — 5 OK, request thứ 6 → 429

`SOSListResolveTest` (3):
- `test_parent_can_list_sos` — 200
- `test_stranger_cannot_list_sos` — 403
- `test_parent_can_resolve_sos` — status='resolved'

**Setup kỹ thuật**:
- Tạo `_NoThrottleTestCase` base class — `@override_settings` tăng throttle rates + clear `django.core.cache` trong `setUp` để test không bị 429 khi login nhiều lần (share IP `127.0.0.1`).
- `SOSThrottleTest` giữ throttle `5/min` để verify rate limit thật sự hoạt động.
- Mock `_notify_user` để không gọi Expo Push API thật.
- Mock `momo_create_payment` / `momo_transfer_to_wallet` để không gọi MoMo API thật.

**Kết quả**: 39/39 PASSED trong 17.9s.

---

### L4 — Không có CI (Trung bình)

**Commit**: *(bị drop khỏi PR này — xem ghi chú bên dưới)*

**File nội dung**: `.github/workflows/django-ci.yml` — đã soạn sẵn, lưu tại `/home/z/my-project/download/django-ci.yml` để user tự thêm.

**Cấu hình**:
- Trigger: `push` + `pull_request` vào nhánh `main`
- Runner: `ubuntu-latest`, Python 3.11 (theo AGENTS.md §2)
- Cài từ `requirements.txt` + `coverage`
- Env: `DEBUG=True`, `SECRET_KEY=ci-test-secret-key`, `DATABASE_URL=sqlite:///db_test.sqlite3`
- Tắt scheduler + external integrations (Gemini, MoMo, PayOS) qua env
- Steps: checkout → setup Python → install → run migrations → run tests với coverage → upload artifact
- `concurrency` group để hủy workflow cũ khi push liên tiếp (tiết kiệm phút CI)
- Timeout: 10 phút

**⚠️ Ghi chú quan trọng**: GitHub PAT hiện tại của agent KHÔNG có scope `workflow`, nên agent không thể push file `.github/workflows/django-ci.yml` lên repo. Agent đã soạn sẵn nội dung file và lưu tại:

```
/home/z/my-project/download/django-ci.yml
```

**User cần tự thêm file này vào repo** bằng 1 trong 2 cách:

**Cách 1 — GitHub UI (đơn giản nhất)**:
1. Vào https://github.com/huyhandsome6996/educarelink-backend-4-12-2026
2. Nhấn "Add file" → "Create new file"
3. Đặt tên: `.github/workflows/django-ci.yml`
4. Copy nội dung từ `/home/z/my-project/download/django-ci.yml` paste vào
5. Commit trực tiếp lên `main` (hoặc tạo PR riêng)

**Cách 2 — Đổi PAT có scope `workflow`**:
1. Vào GitHub Settings → Developer settings → Personal access tokens
2. Edit PAT hiện tại → tick thêm `workflow` scope → Save
3. Commit `.github/workflows/django-ci.yml` lên nhánh `fix/audit-2026-07-21` (hoặc nhánh mới) rồi push.

Sau khi file xuất hiện trên repo, CI sẽ tự chạy ở push/PR tiếp theo.

---

### L5 — `core/views.py` god file 2496 dòng (Trung bình)

**Commit**: `d5efc79` — `refactor: tách core/views.py (2496 dòng) thành package core/views/ theo domain`

**Trước**: 1 file 2496 dòng chứa 40 API view + 6 helper functions, gộp nhiều domain.

**Sau**: tách thành package `core/views/` với 8 file:

| File | Dòng | Số view | Domain |
|---|---|---|---|
| `__init__.py` | 87 | — | Re-export cho backward compat |
| `_helpers.py` | 307 | — | 6 helper functions |
| `auth_views.py` | 193 | 6 | HealthCheck, KeepAliveStats, Register, Login, UserProfile, CompleteOnboarding |
| `task_views.py` | 353 | 9 | TaskListCreate, TaskDetail, TaskUpdateStatus, ParentTasks, TaskCandidates, ApproveCandidate, ApplyTask, WorkerJobs, WorkerProfileDetail |
| `review_views.py` | 52 | 1 | ReviewCreate |
| `profile_views.py` | 394 | 6 | WorkerSubmitCredential, AdminCredentialSubmissions, AdminReviewCredential, WorkerProfileChangeRequest, AdminProfileChangeRequests, AdminReviewProfileChangeRequest |
| `admin_views.py` | 457 | 13 | AdminPendingWorkers, AdminApproveWorker, AdminToggleUserActive, AdminRevokeCarepartner, AdminAllUsers, AdminAllWorkers, AdminAllTasks, AdminModerateTask, AdminSeedDemoData, AdminSendNotification, UserNotifications, UnreadNotificationCount, MarkNotificationsRead |
| `chatbot_views.py` | 840 | 5 | ChatbotAPIView, WorkerChatbotAPIView, AdminChatbotAPIView, HelpCenterAPIView, DistanceCalculationAPIView |
| **Tổng** | **2683** | **40** | (so với 2496 gốc — tăng do header imports nhân 6) |

**Backward compatibility**:
- `core/urls.py` import `from .views import ...` vẫn hoạt động (re-export qua `__init__.py`).
- Các app khác (`payments`, `moderation`, `tracking`) import `send_expo_push_notification` từ `core.views` vẫn hoạt động.
- `python manage.py check` → 0 issues.
- Tất cả 39 test case (auth, task, payment, SOS) vẫn PASS sau refactor.

**Script sinh**: `/home/z/my-project/scripts/split_core_views.py` (lưu lại để reuse nếu cần re-split).

---

### L6 — `LocMemCache` không nhất quán giữa 2 worker (Trung bình)

**Commit**: `dddc48d` — `docs: ghi rõ giới hạn LocMemCache khi chạy 2 gunicorn worker`

Theo yêu cầu gốc: "Không cần fix code ngay, chỉ cần ghi chú giới hạn này vào `performance/README.md` và đề xuất chuyển Redis khi có ngân sách."

**Đã thêm** vào `performance/README.md` (sau section "Tối ưu tiếp theo") section mới:

`⚠️ Giới hạn đã biết: LocMemCache không nhất quán giữa các gunicorn worker`

Nội dung:
- **Vấn đề**: `LocMemCache` là in-process, `WEB_CONCURRENCY=2` → 2 cache riêng không chia sẻ.
- **Bảng hệ quả thực tế**:
  - `performance/lru_cache.py` — cache hit rate thấp hơn báo cáo
  - `performance/request_dedup.py` — dedup không hiệu quả
  - DRF throttling — rate thực tế = 2× configured
  - Gemini quota — tiêu hao gấp đôi khi cache miss ở worker thứ 2
- **Tại sao chưa fix**: chi phí Redis, trade-off, workaround TTL 300s
- **Dấu hiệu cần upgrade**: traffic tăng, cache miss bất thường, cần throttle chính xác, share session state
- **Hướng dẫn migrate Redis** (settings code sample, env var, test, monitor)
- **Lưu ý debug**: phân biệt cache split vs bug code

---

## Kết quả test cuối cùng

```bash
$ DEBUG=True SECRET_KEY="test-secret-key-for-django-tests-only" \
  python manage.py test core payments.tests.test_payment_flow tracking.tests.test_sos --verbosity=1

[KeepAlive] DISABLED (KEEPALIVE_ENABLED != true)
[Anomaly] SKIPPED — not running on Render (local dev)
[Payments Scheduler] SKIPPED — local dev (not Render)
[Offline Scheduler] SKIPPED — local dev (not Render)
Ran 39 tests in 17.865s

OK
Destroying test database for alias 'default'...
```

**39/39 PASSED**. Phân bổ:
- `core/`: 17 tests (auth + task lifecycle + moderation)
- `payments/tests/test_payment_flow.py`: 12 tests (cash + MoMo escrow + commission)
- `tracking/tests/test_sos.py`: 10 tests (permission + throttle + list/resolve)

---

## Danh sách commit trên nhánh `fix/audit-2026-07-21`

```
58caf0b docs: báo cáo tổng kết fix lỗi audit 2026-07-21
7f6066c docs: ghi rõ giới hạn LocMemCache khi chạy 2 gunicorn worker
9fce861 refactor: tách core/views.py (2496 dòng) thành package core/views/ theo domain
66180fe test: thêm test tự động cho auth, task lifecycle, payment, SOS
1df2d91 fix: thêm cross-process lock cho 4 scheduler (chống chạy trùng trên 2 gunicorn worker)
55830d6 chore: gỡ db.sqlite3 khỏi git tracking + báo cáo PII trong history
```

*(Commit `24fc569` cho L4 — `.github/workflows/django-ci.yml` — bị drop khỏi PR vì GitHub PAT không có scope `workflow`. File YAML đã soạn sẵn tại `/home/z/my-project/download/django-ci.yml`, user tự thêm vào repo.)*

Tất cả commit message bằng tiếng Việt + conventional prefix, theo quy ước AGENTS.md §20.4.
Tác giả: `HuyHandsome <huyhandsome6996@users.noreply.github.com>`.

---

## Câu hỏi / việc CẦN USER review sau khi merge PR

### 1. (L1) Quyết định về git history + PII

Xem `DB_HISTORY_AUDIT.md` và chọn:
- [ ] **Lựa chọn A**: rewrite history (force push, all collaborators phải re-clone)
- [ ] **Lựa chọn B**: giữ nguyên history, rotate email/SĐT lộ

### 2. (L4) Bật CI require status check (tùy chọn)

Sau khi PR merge, vào GitHub repo → Settings → Branches → Branch protection rules → main → Require status checks to pass before merging → chọn `test` (tên job trong `django-ci.yml`). Khi đó mọi PR tương lai phải pass CI mới merge được.

### 3. (L6) Quyết định khi nào upgrade Redis

Theo dõi `performance/stats/` endpoint. Khi cache hit rate thấp bất thường hoặc Gemini quota tiêu hao nhanh → setup Redis (theo hướng dẫn trong `performance/README.md`).

---

## Những việc KHÔNG làm (ngoài scope yêu cầu)

- ❌ Không tự merge PR vào main (theo yêu cầu: "Không tự merge PR vào main — để tôi review trước").
- ❌ Không rewrite git history (theo yêu cầu: "KHÔNG tự ý rewrite git history nếu chưa xác nhận").
- ❌ Không fix thêm các lỗi L7-L10 trong file audit (migrations không đồng đều, không có README root, except Exception chung, render.yaml lộ cấu trúc secret) — không nằm trong yêu cầu 6 lỗi cần fix.
- ❌ Không sửa migration (L7) — cần review kỹ schema prod trước khi quyết định squash.

---

*File này được tạo trên nhánh `fix/audit-2026-07-21` — agent không tự merge, để user review.*
