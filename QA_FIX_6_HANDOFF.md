# QA-FIX-6 — Handoff document

Ngày: 14-08-2026
Branch: `feature/module-an-toan-carepartner`
Commit: `<TBD>` — QA-FIX-6: 4 vấn đề QA phát hiện ở vòng QA lần 2

## Mục lục

1. [Tóm tắt](#tóm-tắt)
2. [BẮT BUỘC 1 — Chặn worker chưa đặt PIN nhận việc](#bắt-buộc-1)
3. [BẮT BUỘC 2 — CarePartner OAuth đặt được PIN](#bắt-buộc-2)
4. [NÊN LÀM 1 — Tương thích ngược push type device_offline](#nên-làm-1)
5. [NÊN LÀM 2 — LiveLocation không bị batch cũ ghi đè](#nên-làm-2)
6. [BONUS — pyyaml trong requirements.txt](#bonus)
7. [Lựa chọn thiết kế](#lựa-chọn-thiết-kế)
8. [Test kết quả](#test-kết-quả)
9. [Còn lại UNTESTABLE](#còn-lại-untestable)
10. [Bước tiếp theo cho QA](#bước-tiếp-theo-cho-qa)

---

## Tóm tắt

QA vòng 2 báo cáo 4 vấn đề còn lại sau 5 vòng QA-FIX. QA-FIX-6 xử lý tất cả 4 + 1 bonus:

| # | Mức độ | Vấn đề | Fix |
|---|--------|--------|-----|
| B1 | BẮT BUỘC | Worker chưa đặt PIN vẫn nhận việc → miễn trừ vĩnh viễn khỏi xác minh ngẫu nhiên | Thêm check `verification_pin_hash != null` ở `ApplyTaskAPIView` (chặn trước cả consent check) |
| B2 | BẮT BUỘC | User OAuth (Google/Facebook) không đặt được PIN do `set_unusable_password` → `authenticate()` luôn fail | `set_verification_pin` phân loại theo `has_usable_password()`: user email/password vẫn cần current_password; user OAuth bỏ qua (dựa vào JWT IsAuthenticated) |
| N1 | NÊN LÀM | App mobile cũ không nhận diện `device_offline_critical` → mất cảnh báo offline | Thêm `legacy_type='device_offline'` trong cùng payload push (không tốn thêm request) |
| N2 | NÊN LÀM | Batch offline flush ghi đè LiveLocation bằng điểm cũ → "nhảy lùi" tạm thời | Thêm `LiveLocation.client_recorded_at` (migration nullable, an toàn cho Postgres). Batch so sánh timestamp trước khi update_or_create: nếu existing mới hơn → skip. |
| BONUS | Low | `pyyaml` thiếu trong `requirements.txt` → 5 test fail với ModuleNotFoundError | Thêm `PyYAML==6.0.2` vào `requirements.txt` |

---

<a name="bắt-buộc-1"></a>
## BẮT BUỘC 1 — Chặn worker chưa đặt PIN nhận việc

### Vấn đề

`verification_scheduler.py` có dòng `if not worker.verification_pin_hash: continue` — nghĩa là worker chưa đặt PIN sẽ được miễn trừ **vĩnh viễn** khỏi tính năng xác minh ngẫu nhiên. Nhưng không có gì trong `core/views.py` (luồng apply/accept) chặn worker đó tiếp tục nhận việc → worker (cố ý hoặc vô ý) không đặt PIN vẫn nhận việc bình thường, vô hiệu hoá toàn bộ mục đích module xác minh.

### Fix

Thêm check ở `core/views.py`, `ApplyTaskAPIView.post()` — **chặn TRƯỚC consent check**:

```python
if not request.user.verification_pin_hash:
    return Response({
        "error": "PIN_REQUIRED",
        "message": "Bạn cần đặt mã cá nhân xác minh trước khi nhận việc. Vào Hồ sơ > Đặt mã cá nhân.",
    }, status=status.HTTP_403_FORBIDDEN)
```

**Lý do chọn apply (không phải accept)**: apply là điểm sớm nhất trong luồng nhận việc, worker nhận feedback rõ ràng trước khi đầu tư thời gian, parent không thấy candidates không thể thực sự làm việc.

### Tests

`QAFix6B1PinRequiredToApplyTestCase` (5 tests PASS):
- `test_b1_worker_without_pin_cannot_apply_no_geofence` — worker chưa PIN apply task thường → 403 PIN_REQUIRED.
- `test_b1_worker_without_pin_cannot_apply_geofence_before_consent` — worker chưa PIN apply task geofence → 403 PIN_REQUIRED (chặn TRƯỚC consent check).
- `test_b1_worker_with_pin_can_apply_no_geofence` — worker có PIN apply task thường → 201 (như cũ).
- `test_b1_worker_with_pin_can_apply_geofence_with_consent` — worker có PIN apply task geofence + consent → 201.
- `test_b1_worker_with_pin_apply_geofence_without_consent_returns_consent_required` — worker có PIN apply task geofence + không consent → 400 CONSENT_REQUIRED.

### Files

- `core/views.py` — `ApplyTaskAPIView.post()` thêm PIN check.
- `tracking/tests_qa_fix_6.py::QAFix6B1PinRequiredToApplyTestCase` — 5 tests.

---

<a name="bắt-buộc-2"></a>
## BẮT BUỘC 2 — CarePartner OAuth đặt được PIN

### Vấn đề

`tracking/services.py::set_verification_pin()` bắt buộc gọi `authenticate(username, password=current_password)`. Nhưng user đăng ký qua Google/Facebook được gọi `set_unusable_password()` (xem `core/oauth_views.py:212, :342`) → họ không có mật khẩu thật → `authenticate()` luôn trả `None` → họ **không bao giờ đặt được PIN** → bị miễn trừ vĩnh viễn khỏi xác minh ngẫu nhiên (giống hệt hệ quả B1).

### Fix

Sửa `set_verification_pin()` để phân loại user:

```python
if user.has_usable_password():
    # User email/password → bắt buộc current_password đúng (giữ hành vi cũ)
    if not current_password:
        raise PermissionError("Vui lòng nhập mật khẩu tài khoản để xác nhận.")
    user_auth = authenticate(username=user.username, password=current_password)
    if not user_auth or user_auth.id != user.id:
        raise PermissionError("Mật khẩu tài khoản không đúng.")
else:
    # User Google/Facebook (set_unusable_password) → bỏ qua current_password.
    # Dựa vào JWT IsAuthenticated của endpoint để bảo vệ.
    if current_password:
        logger.info(...)  # audit log, ignore input
```

Cũng sửa:
- `tracking/serializers.py::SetVerificationPinSerializer` — `current_password` thành `required=False, allow_null=True, allow_blank=True`.
- `tracking/views.py::SetVerificationPinAPIView.post()` — dùng `.get('current_password')` thay vì `['current_password']`.

### Tests

`QAFix6B2OAuthSetPinTestCase` (8 tests PASS):
- `test_b2_google_user_set_pin_without_current_password` — user Google đặt PIN không cần password → OK.
- `test_b2_facebook_user_set_pin_without_current_password` — user Facebook đặt PIN không cần password → OK.
- `test_b2_google_user_set_pin_ignores_current_password` — user Google gửi password (bất kỳ) → vẫn OK (bỏ qua).
- `test_b2_email_user_set_pin_requires_current_password` — user email/password không gửi password → PermissionError.
- `test_b2_email_user_set_pin_wrong_current_password` — user email/password sai password → PermissionError.
- `test_b2_email_user_set_pin_correct_current_password` — user email/password đúng password → OK (giữ hành vi cũ).
- `test_b2_endpoint_google_user_set_pin_no_current_password` — endpoint test cho user Google (200 OK).
- `test_b2_endpoint_email_user_set_pin_no_current_password` — endpoint test cho user email (403).

### Files

- `tracking/services.py` — `set_verification_pin()` rewrite logic re-auth.
- `tracking/serializers.py` — `SetVerificationPinSerializer.current_password` optional.
- `tracking/views.py` — `SetVerificationPinAPIView.post()` dùng `.get()`.
- `tracking/tests_qa_fix_6.py::QAFix6B2OAuthSetPinTestCase` — 8 tests.

---

<a name="nên-làm-1"></a>
## NÊN LÀM 1 — Tương thích ngược push type device_offline

### Vấn đề

PR này đổi `data.type` từ `'device_offline'` (cũ) sang `'device_offline_critical'` (mới, channel riêng `emergency-alerts` + sound `emergency_alarm.wav`). App mobile cũ chưa cập nhật chỉ nhận diện `'device_offline'` → mất hoàn toàn cảnh báo khi CarePartner offline.

### Fix

Thêm field `legacy_type='device_offline'` vào `data` dict ở **2 chỗ** trong `tracking/services.py`:
- `check_offline_devices()` (initial alert push, ~dòng 562-571).
- `retry_offline_alert_pushes()` (retry push, ~dòng 688-698).

**Không tốn thêm request push** — chỉ thêm 1 field trong `data` của cùng payload.

### Behavior

- Mobile mới ưu tiên `data.type='device_offline_critical'` → đúng channel + sound.
- Mobile cũ fallback `data.legacy_type='device_offline'` → channel `critical_alerts` cũ + sound mặc định (vẫn báo động được).

### Lựa chọn thiết kế — giữ `legacy_type` trong bao lâu

**Target: 2-3 tháng sau release QA-FIX-6 (~2026-11).** Theo dõi analytics/version distribution trước khi xoá. Khi xoá cũng cần dọn dẹp code mobile cũ nhận diện `'device_offline'` (chuyển hoàn toàn sang `'device_offline_critical'`).

Lý do chọn 2-3 tháng: đủ thời gian cho user tự update app (Google Play auto-update thường 1-2 tháng cho.majority user base). Nếu sau 3 tháng vẫn còn >5% user cũ, gia hạn thêm 1 tháng.

### Tests

`QAFix6N1LegacyPushTypeTestCase` (2 tests PASS):
- `test_n1_initial_alert_has_both_type_and_legacy_type` — mock `send_expo_push_notification`, verify payload có cả 2 field.
- `test_n1_retry_push_has_both_type_and_legacy_type` — tương tự cho retry push, có thêm `retry: 1`.

### Files

- `tracking/services.py` — 2 chỗ thêm `legacy_type` (initial + retry).
- `tracking/tests_qa_fix_6.py::QAFix6N1LegacyPushTypeTestCase` — 2 tests.

---

<a name="nên-làm-2"></a>
## NÊN LÀM 2 — LiveLocation không bị batch cũ ghi đè

### Vấn đề

`BatchLocationAPIView` (~dòng 1139) dùng `LiveLocation.objects.update_or_create` ghi đè bằng `last_point` của batch mà không so sánh timestamp. Kịch bản lỗi:

1. CarePartner mất mạng → queue offline chứa điểm cũ.
2. Có mạng lại → real-time gửi điểm **mới** trước → LiveLocation đúng.
3. `flushOfflineQueue()` chạy xong, gửi batch chứa điểm **cũ** → ghi đè LiveLocation → parent thấy vị trí "nhảy lùi" tạm thời (~10s cho tới real-time tiếp theo).

### Fix

**Bước 1 — Thêm field `client_recorded_at` vào `LiveLocation`:**

```python
# tracking/models.py
client_recorded_at = models.DateTimeField(
    blank=True, null=True, db_index=True,
    help_text="Timestamp client capture GPS. Dùng chống ghi đè LiveLocation bằng điểm cũ."
)
```

Migration `0009_qa_fix_6_livelocation_client_recorded_at.py` — `AddField` với `null=True`, **an toàn cho Postgres/Render có data cũ** (mọi row cũ sẽ có `client_recorded_at=NULL`).

**Bước 2 — Real-time set `client_recorded_at = now()`** trong `update_worker_location()` (services.py).

**Bước 3 — Batch so sánh timestamp trước khi update_or_create:**

```python
# tracking/views.py::BatchLocationAPIView
if saved > 0:
    batch_last_recorded_at = last_point['recorded_at']
    existing = LiveLocation.objects.filter(task=task).first()
    skip_live_update = False
    if existing and existing.client_recorded_at is not None:
        if existing.client_recorded_at >= batch_last_recorded_at:
            skip_live_update = True  # existing mới hơn → skip, không "nhảy lùi"
    if not skip_live_update:
        LiveLocation.objects.update_or_create(
            task=task,
            defaults={..., 'client_recorded_at': batch_last_recorded_at},
        )
```

**Backward compat**: nếu `existing.client_recorded_at IS NULL` (row cũ chưa populate field mới) → luôn update (giữ behaviour cũ).

### Tests

`QAFix6N2LiveLocationNoStaleOverwriteTestCase` (5 tests PASS):
- `test_n2_realtime_sets_client_recorded_at` — real-time update → `client_recorded_at != None`.
- `test_n2_batch_older_does_not_overwrite_realtime` — real-time (11.0, 107.0) → batch cũ (9.0, 105.0, recorded_at -2 phút) → LiveLocation vẫn (11.0, 107.0).
- `test_n2_batch_newer_overwrites_realtime` — real-time → batch mới hơn 30s → LiveLocation cập nhật.
- `test_n2_batch_when_no_existing_livelocation_creates_new` — chưa có LiveLocation → batch tạo mới.
- `test_n2_batch_with_null_existing_cra_still_updates` — existing `client_recorded_at=None` → batch vẫn update (backward compat).

### Files

- `tracking/models.py` — `LiveLocation.client_recorded_at` field.
- `tracking/migrations/0009_qa_fix_6_livelocation_client_recorded_at.py` — migration.
- `tracking/services.py` — `update_worker_location` set `client_recorded_at = now()`.
- `tracking/views.py` — `BatchLocationAPIView` thêm skip logic.
- `tracking/tests_qa_fix_6.py::QAFix6N2LiveLocationNoStaleOverwriteTestCase` — 5 tests.

---

<a name="bonus"></a>
## BONUS — pyyaml trong requirements.txt

### Vấn đề

`tracking/tests_qa_fix_3.py` và `tracking/tests_qa_fix_5.py` tự parse `render.yaml` để verify cấu hình cron job → cần `pyyaml`. Trước đây thiếu dependency này → 5 test fail với `ModuleNotFoundError: No module named 'yaml'` trên môi trường mới clone repo dù code hoàn toàn đúng.

### Fix

Thêm `PyYAML==6.0.2` vào `requirements.txt` (cuối file, có comment giải thích).

### Files

- `requirements.txt` — thêm `PyYAML==6.0.2`.

---

<a name="lựa-chọn-thiết-kế"></a>
## Lựa chọn thiết kế

### B2 — Phương án xác thực thay thế cho user OAuth

QA prompt đề xuất 2 phương án:
1. Chỉ cần JWT IsAuthenticated (đơn giản).
2. Token freshness check (an toàn hơn, phức tạp hơn).

**Chọn phương án 1** (chỉ JWT IsAuthenticated). Lý do:
- User OAuth không có mật khẩu để xác thực lại — buộc thêm current_password là vô nghĩa.
- Endpoint `SetVerificationPinAPIView` đã yêu cầu `IsAuthenticated` → nếu attacker có access token, họ đã có khả năng làm mọi việc user làm được (đổi email, password, v.v.). Buộc thêm current_password cho user OAuth **không tăng security** mà chỉ block tính năng.
- Token freshness check thêm complexity (cần parse JWT, check `iat`) nhưng lợi ích security hạn chế — nếu attacker có token cũ vẫn trong hạn, họ vẫn dùng được.
- Mobile app nên ẩn trường `current_password` khi `user.auth_provider != 'email'` để UX rõ ràng.

### N1 — Giữ `legacy_type` trong bao lâu

**Target: 2-3 tháng sau release QA-FIX-6 (~2026-11).** Chi tiết xem ở phần [NÊN LÀM 1](#nên-làm-1).

---

<a name="test-kết-quả"></a>
## Test kết quả

| Lệnh | Kết quả |
|---|---|
| `manage.py check` | ✅ PASS, 0 lỗi |
| `manage.py makemigrations --check --dry-run` | ✅ "No changes detected" |
| `manage.py migrate` (DB sqlite sạch, full history từ đầu) | ✅ PASS, 9 migration tracking + 15 core + moderation + payments + token_blacklist + sessions chạy thành công theo đúng thứ tự |
| `manage.py test tracking.tests_qa_fix_6` (20 test mới) | ✅ PASS 100% |
| `manage.py test tracking` (147 test: 127 cũ + 20 mới) | ✅ PASS 100% |
| `manage.py test` (toàn hệ thống) | ✅ PASS 147 tests |

### Migration safety cho Postgres/Render

- `0009_qa_fix_6_livelocation_client_recorded_at.py`: chỉ `AddField` với `null=True, blank=True` (không cần default, không sửa data cũ). **Không có** `AlterField`/`RemoveField`/`RunPython` → không rủi ro gãy data trên Postgres production.
- Tất cả migration tracking từ `0001` đến `0009` đã verify chạy thành công trên DB sạch.

---

<a name="còn-lại-untestable"></a>
## Còn lại UNTESTABLE (giữ nguyên từ QA-FIX-3/4/5)

- Native EAS Android build (cần eas build cloud).
- Custom sound + full-screen intent trên device thật (cần EAS Build).
- iOS critical alert (cần entitlement Apple).
- Scheduler production trên Render (chưa deploy).
- Push/background location khi app killed (cần device thật).
- DB health trên Render production (cần deploy + check endpoint thật).
- Cron fail-fast behavior trên Render (cần deploy với env var thiếu để verify log).

---

<a name="bước-tiếp-theo-cho-qa"></a>
## Bước tiếp theo cho QA

### Trước khi merge

1. **Review code** 4 vùng fix: `core/views.py:ApplyTaskAPIView`, `tracking/services.py:set_verification_pin`, `tracking/services.py` push call sites (legacy_type), `tracking/views.py:BatchLocationAPIView` + `tracking/models.py:LiveLocation`.
2. **Run test suite**: `pip install -r requirements.txt` (đảm bảo có PyYAML), `python manage.py test` — phải pass 147 tests.
3. **Verify migration**: `python manage.py makemigrations --check --dry-run` → "No changes detected".

### Sau khi merge — Quy trình deploy an toàn (5 bước)

Lưu ý: nhánh này vẫn **đổi kiến trúc scheduler** từ "tự chạy trong web service" sang "Render Cron Job riêng". Nếu deploy mà quên cấu hình tay, scheduler mới sẽ không chạy → tính năng phát hiện offline (đang chạy tốt trên production) sẽ bị gãy. **Đây là rủi ro cao nhất**, không phải bug code.

1. **Merge PR** vào `main` trên GitHub — nhưng **CHƯA trigger deploy production** (tạm tắt auto-deploy nếu Render đang auto-deploy theo push vào `main`).
2. Trên Render Dashboard: xác nhận service có dùng Blueprint sync (`render.yaml`) hay tạo service thủ công.
3. Nếu dùng Blueprint: sau khi Render tạo Cron Job mới từ `render.yaml`, **vào ngay Cron Job đó → Environment → "Copy from existing service" → chọn service web hiện tại → chọn đúng `SECRET_KEY`, `DATABASE_URL`, `GEMINI_API_KEY`, `EXPO_ACCESS_TOKEN`** (đúng checklist trong comment `render.yaml`).
4. Đợi 1-2 phút, gọi `curl https://<domain>/api/tracking/scheduler-health/` — phải thấy `status=ok` (không phải `no_data` hay `stale`).
5. Chỉ sau bước 4 xác nhận `status=ok`, mới coi như deploy an toàn. Nếu không thấy `status=ok` trong 5 phút → rollback deploy và kiểm tra log Cron Job.

### E2E test trên thiết bị thật (sau khi deploy staging)

1. **Offline sync 2 task cùng user** — verify QA-FIX-5 fix bug trộn task vẫn hoạt động.
2. **Worker chưa đặt PIN cố apply** — verify B1 chặn đúng với thông báo tiếng Việt.
3. **User Google/Facebook đặt PIN** — verify B2 cho phép đặt PIN không cần password.
4. **App mobile cũ (build trước QA-FIX-6) nhận push offline** — verify N1 `legacy_type` hoạt động.
5. **Real-time + batch flush close-time** — verify N2 không "nhảy lùi" vị trí.
6. **Foreground/background/killed/reboot** — verify scheduler + push vẫn hoạt động.
7. **Notification channel + sound + vibration + acknowledge** — verify đầy đủ.
