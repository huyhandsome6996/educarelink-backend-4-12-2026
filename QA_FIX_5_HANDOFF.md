# QA-FIX-5 — Handoff document

Ngày: 14-08-2026
Commit: `<TBD>` — QA-FIX-5: fix 3 bug QA phát hiện sau commit 9747188 (QA-FIX-4)

## Mục lục

1. [Tóm tắt](#tóm-tắt)
2. [Bug High — trộn vị trí giữa 2 task](#bug-high--trộn-vị-trí-giữa-2-task)
3. [Bug Medium — health endpoint sai kiến trúc](#bug-medium--health-endpoint-sai-kiến-trúc)
4. [Bug Medium — cron thiếu SECRET_KEY/DATABASE_URL](#bug-medium--cron-thiếu-secret_keydatabase_url)
5. [Test kết quả](#test-kết-quả)
6. [Còn lại UNTESTABLE](#còn-lại-untestable)
7. [Bước tiếp theo cho QA](#bước-tiếp-theo-cho-qa)

---

## Tóm tắt

QA phát hiện 3 bug sau khi review commit `9747188` (QA-FIX-4):

| # | Mức độ | Bug | Fix |
|---|--------|-----|-----|
| H1 | High | Queue offline chỉ tách theo user, không theo task → điểm của task B có thể bị gửi nhầm vào task A | `flushOfflineQueue` duyệt qua từng task_id riêng biệt, mỗi task = 1 (hoặc nhiều) request batch riêng |
| M2 | Medium | `/api/tracking/scheduler-health/` đọc `/tmp` file, nhưng Render Cron container và web container không chia sẻ `/tmp` | Thêm `SchedulerHealth` model (DB-based), endpoint đọc DB trước, fallback `/tmp` cho dev local |
| M3 | Medium | `render.yaml` cron không khai báo `SECRET_KEY` + `DATABASE_URL` → nếu deploy-er quên copy thủ công, cron fail silently | Thêm `check_scheduler_env` management command fail-fast + khai báo tường minh `sync: false` trong render.yaml |

---

## Bug High — trộn vị trí giữa 2 task

### Triệu chứng

Worker làm task A offline → queue còn điểm chưa sync. Task A kết thúc. Worker bắt đầu task B (vẫn offline). Khi có mạng lại:
- `getChunk(userId)` lấy 200 điểm của **mọi task** theo thời gian.
- `flushOfflineQueue()` dùng `chunk[0].task_id` làm `task_id` của cả request.
- Điểm của task B trong cùng chunk bị POST dưới `task_id=A`.
- Backend không có thông tin task gốc của từng point → không từ chối được.

### Fix

**`mobile/src/services/OfflineLocationQueue.js`** (thêm 2 hàm mới):

```js
// Lấy danh sách task_id có điểm chờ trong queue của user, sắp xếp FIFO.
export async function getDistinctTaskIds(userId) { ... }

// Lấy chunk của (user_id, task_id) cụ thể — KHÔNG trộn task.
export async function getChunkByTask(userId, taskId, size = CHUNK_SIZE) { ... }
```

**`mobile/src/services/LocationService.js`** (rewrite `flushOfflineQueue`):

Trước:
```js
while (loopCount < MAX_LOOPS) {
  const chunk = await getChunk(userId, CHUNK_SIZE_EXPORT);  // ❌ trộn task
  const taskId = chunk[0].task_id;  // ❌ chỉ dùng task_id của điểm đầu
  await apiClient.post('/tracking/location/batch/', { task_id: taskId, points });
}
```

Sau:
```js
const taskEntries = await getDistinctTaskIds(userId);  // ✅ duyệt theo task
for (const entry of taskEntries) {
  const taskId = entry.task_id;
  while (taskLoopCount < MAX_TASK_LOOPS) {
    const chunk = await getChunkByTask(userId, taskId, CHUNK_SIZE_EXPORT);  // ✅ chỉ 1 task
    await apiClient.post('/tracking/location/batch/', { task_id: taskId, points });
  }
}
```

### Behavior

- Mỗi batch request chỉ chứa điểm của **1 task** — không bao giờ trộn.
- Task A (cũ hơn) flush trước theo FIFO — ưu tiên sync task đã completed/cancelled.
- Nếu 1 task có > 200 điểm → chunk thành nhiều request (loop while trong task).
- **5xx/network error**: dừng cả flush (`stopAll=true`) — không thử task khác (mạng yếu sẽ fail y hệt).
- **4xx error**: chỉ break task đó, thử task tiếp theo (4xx là lỗi client-specific cho task/point đó).

### Test

- Backend: `tracking/tests_qa_fix_5.py::QAFix5H1TestCase` (3 tests) — verify 2 task có LocationHistory riêng, cùng `client_point_id` khác task không xung đột, cùng task + cùng `client_point_id` → idempotent.
- Mobile: `mobile/scripts/test_qa5_mobile_flush_isolation.test.js` (6 tests) — mock SQLite + apiClient, verify `flushOfflineQueue` tạo N request riêng (1 per task), 5xx stop all, 4xx skip task.

---

## Bug Medium — health endpoint sai kiến trúc

### Triệu chứng

- `render.yaml` có Cron Job `educarelink-tracking-scheduler` chạy mỗi 1 phút.
- Cron ghi `/tmp/tracking_scheduler_health.json` (trong container cron).
- Web service đọc cùng path qua API `/api/tracking/scheduler-health/` (trong container web).
- **Render Cron và web service là 2 container độc lập, không chia sẻ `/tmp`** → endpoint luôn trả `no_data` dù cron đã chạy.

### Fix

**`tracking/models.py`** (thêm model mới):

```python
class SchedulerHealth(models.Model):
    """Singleton row (id=1) — update thay vì insert mới."""
    last_run_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(max_length=20, default='cron')  # cron/daemon/web_worker/test
    scheduler_kind = models.CharField(max_length=20, default='both')
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True, default='')
    stats = models.JSONField(default=dict, blank=True)

    @classmethod
    def get_singleton(cls):
        obj, _ = cls.objects.get_or_create(pk=1, defaults={...})
        return obj

    @classmethod
    def record_run(cls, *, last_run_at, source='cron', scheduler_kind='both',
                   success=True, error_message='', stats=None,
                   started_at=None, finished_at=None):
        with transaction.atomic():
            obj = cls.get_singleton()
            # update fields
            obj.save()
        return obj
```

**`tracking/management/commands/run_tracking_schedulers.py`** (thêm `_record_health_db` + `_read_health_db`):

```python
def _record_health_db(stats, only='both', started_at=None, finished_at=None, source='cron'):
    """Ghi health vào DB — chia sẻ giữa Cron container và web service."""
    SchedulerHealth.record_run(...)

def _read_health_db():
    """Đọc health từ DB — trả về dict hoặc None."""
    obj = SchedulerHealth.get_singleton()
    if obj.last_run_at is None:
        return None
    return { ... }
```

Mỗi lần chạy `_run_once()` hoặc `_run_once_internal()` (daemon mode), ngoài việc ghi `/tmp` file (giữ cho dev local), cũng gọi `_record_health_db()`.

**`tracking/views.py`** (`SchedulerHealthAPIView`):

```python
def get(self, request):
    # 1. Đọc DB trước (production path)
    health = _read_health_db()
    if health:
        health_source = 'db'

    # 2. Fallback /tmp file (cho dev local + test chưa migrate)
    if not health:
        health = _read_health_file()
        if health:
            health_source = 'file'

    # 3. Trả no_data nếu cả 2 đều không có
    ...
```

### Migration

`tracking/migrations/0008_qa_fix_5_scheduler_health.py` — tạo bảng `SchedulerHealth`.

**Lưu ý deploy**: migration 0008 phải chạy trên production TRƯỚC khi cron lần đầu tiên ghi DB. Render tự chạy `python manage.py migrate` trong `build.sh` nên không cần thao tác thủ công.

### Test

`tracking/tests_qa_fix_5.py::QAFix5M2SchedulerHealthDBTestCase` (8 tests):
- `test_m2_singleton_get_or_create` — `get_singleton()` trả cùng row.
- `test_m2_record_run_creates_row` — `record_run()` tạo row với stats đúng.
- `test_m2_record_run_updates_existing_row` — lần 2 update, không tạo row mới.
- `test_m2_endpoint_reads_from_db_first` — endpoint trả `health_source=db` khi có DB row.
- `test_m2_endpoint_stale_when_db_old` — `status='stale'` khi `last_run_at` cũ.
- `test_m2_endpoint_no_data_when_db_empty_and_file_missing` — `status='no_data'` khi cả 2 rỗng.
- `test_m2_endpoint_fallback_to_file_when_db_empty` — fallback `/tmp` khi DB rỗng.
- `test_m2_management_command_writes_db_health` — `run_tracking_schedulers --once` ghi DB.

---

## Bug Medium — cron thiếu SECRET_KEY/DATABASE_URL

### Triệu chứng

- `backend/settings.py` bắt buộc `SECRET_KEY` và `DATABASE_URL` khi `RENDER=true`.
- `render.yaml` cron chỉ có comment "copy thủ công từ Dashboard" — không khai báo tường minh.
- Nếu deploy-er import Blueprint mà không làm bước thủ công → cron fail silently với lỗi cryptic (`ImproperlyConfigured` từ Django settings).

### Fix

**1. Thêm management command `check_scheduler_env`** (`tracking/management/commands/check_scheduler_env.py`):

```python
class Command(BaseCommand):
    REQUIRED_ENV_VARS = [
        ('SECRET_KEY', 'Django SECRET_KEY — sync từ web service qua Dashboard'),
        ('DATABASE_URL', 'Postgres connection string — sync từ web service qua Dashboard'),
    ]

    def handle(self, *args, **options):
        missing = []
        for var_name, hint in self.REQUIRED_ENV_VARS:
            if not os.environ.get(var_name):
                missing.append((var_name, hint))
                self.stderr.write(self.style.ERROR(f'  ✗ {var_name} — MISSING'))
        if missing:
            # In checklist deploy rõ ràng
            self.stderr.write(...)
            sys.exit(1)  # fail-fast
```

**2. Cập nhật `render.yaml`** cron job:

```yaml
- type: cron
  name: educarelink-tracking-scheduler
  startCommand: "python manage.py check_scheduler_env && python manage.py run_tracking_schedulers --once --only both"
  envVars:
    # ✨ Khai báo tường minh với sync: false — Render Dashboard sẽ prompt nhập
    - key: SECRET_KEY
      sync: false
    - key: DATABASE_URL
      sync: false
    - key: GEMINI_API_KEY
      sync: false
    # ... các env vars khác giữ nguyên
```

### Behavior

- Khi cron run, `check_scheduler_env` chạy TRƯỚC.
- Nếu thiếu env var → in checklist deploy + exit 1 → `&&` ngăn `run_tracking_schedulers` chạy.
- Render log sẽ hiển thị checklist rõ ràng → deploy-er biết phải làm gì.
- Nếu đủ env var → `check_scheduler_env` exit 0 → `run_tracking_schedulers` chạy bình thường.

### Test

`tracking/tests_qa_fix_5.py::QAFix5M3CheckSchedulerEnvTestCase` (5 tests):
- `test_m3_check_passes_when_all_env_vars_present` — exit 0 khi đủ.
- `test_m3_check_fails_when_secret_key_missing` — exit 1 khi thiếu SECRET_KEY.
- `test_m3_check_fails_when_database_url_missing` — exit 1 khi thiếu DATABASE_URL.
- `test_m3_render_yaml_cron_has_secret_key_and_database_url` — render.yaml có khai báo `sync: false`.
- `test_m3_render_yaml_cron_startcommand_calls_check_env` — startCommand gọi `check_scheduler_env` trước `run_tracking_schedulers`.

---

## Test kết quả

| Suite | Số test | Kết quả |
|-------|---------|---------|
| Backend Django tracking (tests_safety_module + tests_qa_fixes + tests_qa_fix_2 + tests_qa_fix_3 + tests_qa_fix_5) | 127 | **PASS** |
| Mobile JS (test_qa5_mobile_flush_isolation.test.js) | 6 | **PASS** |
| `npx expo-doctor` | 18 checks | **18/18 PASS** |
| `npx expo prebuild --platform android` | 1 | **PASS** (sound file copy OK) |
| `npx expo export --platform android` | 1 | **PASS** (3.88 MB JS bundle) |
| `node --check` 7 file JS quan trọng | 7 | **PASS** |

---

## Còn lại UNTESTABLE

Không thể verify trong môi trường dev local — cần device thật + Render production:

1. **Native EAS Android build** — cần `eas build --platform android` cloud build.
2. **Custom sound + full-screen intent trên device thật** — cần EAS Build + Android device.
3. **iOS critical alert** — cần Apple entitlement (chưa có).
4. **Scheduler production trên Render** — chưa deploy, chỉ verify được qua code review + test local.
5. **Push/background location khi app killed** — cần device thật.
6. **DB health trên Render production** — cần deploy + check endpoint thật.
7. **Cron fail-fast behavior trên Render** — cần deploy Render với env var thiếu để verify log.

---

## Bước tiếp theo cho QA

### Bắt buộc verify trước merge

1. **Backend test suite cô lập**:
   ```bash
   python manage.py test tracking --verbosity=2
   ```
   → kỳ vọng 127 tests PASS.

2. **Mobile JS test**:
   ```bash
   cd mobile
   npm install --no-save @babel/register@^7 @babel/preset-env@^7 --prefix /tmp/babel-test
   node scripts/test_qa5_mobile_flush_isolation.test.js
   ```
   → kỳ vọng 6 tests PASS.

3. **Mobile build**:
   ```bash
   cd mobile
   npx expo-doctor        # 18/18 PASS
   npx expo prebuild --platform android   # PASS + log copy sound file
   npx expo export --platform android     # PASS, bundle ~3.88 MB
   ```

### Verify sau deploy (Render staging)

1. **Migrate DB**:
   ```bash
   python manage.py migrate tracking
   ```
   → Verify migration `0008_qa_fix_5_scheduler_health` chạy thành công.

2. **Verify cron env vars**:
   - Render Dashboard → Cron Job `educarelink-tracking-scheduler` → Environment.
   - Verify `SECRET_KEY`, `DATABASE_URL`, `GEMINI_API_KEY` đã được set (copy từ web service).

3. **Verify cron health**:
   ```bash
   curl https://educarelink-backend.onrender.com/api/tracking/scheduler-health/
   ```
   → Kỳ vọng:
   ```json
   {
     "status": "ok",
     "health_source": "db",  // ✅ DB-based, không phải file
     "seconds_since_last_run": <60,
     "is_stale": false
   }
   ```

4. **Verify fail-fast**:
   - Tạm thời xóa `SECRET_KEY` khỏi Cron env vars.
   - Đợi ≤ 1 phút → check Render logs.
   - Kỳ vọng: log in ra checklist deploy + cron exit 1 (không chạy scheduler).
   - Restore `SECRET_KEY` → cron chạy bình thường trở lại.

### Verify trên device thật (Android)

1. **Test offline cache + flush tách task**:
   - Worker accept task A + task B (cùng parent).
   - Bật task A → tắt mạng → đi 100m → 10 điểm GPS được cache.
   - Tắt task A (completed).
   - Bật task B → đi 100m khác → 10 điểm GPS cache.
   - Bật mạng lại → verify:
     - 2 request batch riêng (xem backend logs).
     - LocationHistory của task A có 10 điểm, task B có 10 điểm.
     - Không có điểm nào bị gán sai task.

2. **Test custom alarm sound**:
   - Build EAS Development Build.
   - Cài lên device.
   - Trigger offline alert (tắt máy carepartner > 60s).
   - Verify: device kêu còi `emergency_alarm.wav` (loop), vibration, full-screen notification.

3. **Test random verification PIN**:
   - Worker đặt PIN 4-6 số.
   - Bật task → đợi scheduler random trigger (≤ 180 phút).
   - Verify: modal hiện ô nhập PIN + còi báo + vibration.
   - Nhập sai 3 lần → status `wrong_code` + admin notification.
   - Không nhập 90s → status `timeout` + admin notification. Timeout 2 lần liên tiếp → parent notification (1 lần/streak).
