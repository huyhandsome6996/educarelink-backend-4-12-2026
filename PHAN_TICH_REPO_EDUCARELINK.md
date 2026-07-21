# Phân tích Repo: educarelink-backend-4-12-2026

> Nguồn: https://github.com/huyhandsome6996/educarelink-backend-4-12-2026 (nhánh `main`)
> Người phân tích: Claude (Anthropic) — clone repo về sandbox, đọc trực tiếp source code, settings, migrations, git history.
> Ngày phân tích: 2026-07-21

---

## 1. Tổng quan kiến trúc

- **Stack**: Django 5.2 + Django REST Framework (monolith), SQLite (dev) / PostgreSQL qua `DATABASE_URL` (prod, Neon/Supabase/Render), JWT (`djangorestframework-simplejwt`), React Native (Expo) cho mobile, Django Templates cho web.
- **Apps**: `core` (auth, user, task, review), `payments` (MoMo + PayOS), `tracking` (live location, SOS, geofence), `moderation` (kiểm duyệt AI), `ai_recommendations` (gợi ý AI Gemini), `performance` (cache, spatial index, connection pool), `frontend` (Django templates).
- **Quy mô**: ~15.300 dòng Python (không tính `mobile/`), `core/views.py` một mình chiếm **2.496 dòng**.
- **Deploy**: Render.com free tier, `gunicorn` với `WEB_CONCURRENCY=2`.
- **Tài liệu nội bộ**: repo có sẵn rất nhiều file `.md` tự đánh giá (`AGENTS.md` 76K, `SECURITY_AUDIT_CHECKLIST.md`, `BUG_REPORT.md`, `TEST_REPORT.md`, `SAFETY_FEATURE.md`, `PAYOS_REVIEW.md`, `SYNC_PARITY.md`...) — cho thấy quy trình review lặp lại bằng AI agent khác nhau qua thời gian.

## 2. Điểm mạnh

1. **Cấu hình production khá chuẩn** cho một dự án cá nhân/sinh viên:
   - `SECRET_KEY` và `DATABASE_URL` bắt buộc lấy từ biến môi trường khi `DEBUG=False` (raise `ImproperlyConfigured` nếu thiếu).
   - Khi `DEBUG=False`: bật `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, HSTS 1 năm + preload.
   - JWT có access 60 phút, refresh 30 ngày, **rotate + blacklist** refresh token cũ.
   - Throttle rate riêng theo từng endpoint nhạy cảm: `login` 5/phút, `register` 3/giờ, `sos` 5/phút, `task_create` 10/giờ — đúng hướng chống brute-force/spam.
2. **Tách module theo domain** rõ ràng (`payments`, `tracking`, `moderation`, `ai_recommendations` là các Django app riêng, không dồn hết vào `core`).
3. **Có ý thức vận hành thực tế trên hạ tầng free-tier**: keep-alive scheduler, anomaly detection scheduler, payment settlement scheduler — biết rõ hạn chế Render free (sleep sau 15 phút) và tự xử lý.
4. **Văn hoá tự tài liệu hoá / tự audit tốt** — nhiều báo cáo bug, test, security checklist được duy trì qua thời gian, không phải "code xong bỏ đó".
5. Sử dụng `whitenoise` + `GZipMiddleware` cho static/API response — tối ưu hợp lý cho môi trường không có CDN riêng.

## 3. Danh sách lỗi / vấn đề tìm được (sắp theo mức độ nghiêm trọng)

### 🔴 Nghiêm trọng

**L1. `db.sqlite3` bị commit vào git dù đã có trong `.gitignore`**
- File tồn tại trong `git ls-files` → đã được add trước khi thêm dòng gitignore, gitignore không có tác dụng hồi tố.
- Đã kiểm tra: dữ liệu hiện tại là **seed/demo** (email dạng `phuhuynh@test.com`, `sinhvien@test.com`), không phải PII thật tại thời điểm audit — nhưng đây vẫn là **thói quen nguy hiểm**: mỗi lần dev chạy local và lỡ `git add .`/`git commit -a`, dữ liệu thật (bao gồm bảng `core_credentialsubmission` — nơi lưu ảnh CCCD/chân dung carepartner) có thể bị đẩy lên GitHub public.
- **Cần**: `git rm --cached db.sqlite3`, xác nhận không còn version nào chứa dữ liệu thật trong lịch sử git (nếu có, cần rewrite history hoặc rotate toàn bộ secrets/tài khoản liên quan).

**L2. Scheduler chạy trùng lặp khi có nhiều gunicorn worker**
- `render.yaml` đặt `WEB_CONCURRENCY=2`. `AppConfig.ready()` chạy **riêng ở từng worker process** (`core/apps.py`, `payments/apps.py`, `tracking/apps.py` đều gọi `start_scheduler()` trong `ready()`).
- Các scheduler bị ảnh hưởng: `core/keepalive_scheduler.py`, `core/anomaly_scheduler.py`, `payments/scheduler.py`, `tracking/offline_scheduler.py`.
- `threading.Lock` trong các file này chỉ chống race-condition **trong 1 process**, không ngăn được 2 process (2 worker) cùng khởi động job.
- **Hệ quả thực tế**: ping keepalive gấp đôi, quét anomaly gấp đôi → có thể gửi **thông báo trùng cho admin**, `payments/scheduler.py` xử lý settlement có thể chạy 2 lần trên cùng dữ liệu (rủi ro race condition khi update trạng thái thanh toán), gọi Gemini API cho AI recommendation/anomaly gấp đôi → tốn quota/tiền gấp đôi không cần thiết.
- **Cần**: dùng cross-process lock (file lock qua `fcntl.flock`, hoặc kiểm tra biến môi trường worker index từ gunicorn), hoặc tách các scheduler ra một dyno/service riêng chạy với `WEB_CONCURRENCY=1`, hoặc chuyển sang Celery beat/cron job thật.

**L3. Gần như không có test tự động**
- `core/tests.py` và `frontend/tests.py` chỉ là stub mặc định của Django (3 dòng, không có test case nào).
- Toàn repo chỉ có **1 file test thật**: `payments/tests/test_integration.py` (205 dòng).
- Với ~15.300 dòng Python bao gồm các luồng nhạy cảm (auth, thanh toán, live tracking, SOS, kiểm duyệt AI), độ che phủ test gần bằng 0% ở phần lõi.
- **Cần**: ưu tiên viết test cho auth/JWT, tạo & duyệt task, thanh toán, và SOS trước — đây là 4 luồng nếu lỗi sẽ ảnh hưởng trực tiếp đến an toàn người dùng hoặc tiền.

### 🟡 Trung bình

**L4. "God file" `core/views.py` — 2.496 dòng**
- Một file duy nhất xử lý nhiều domain (auth, user, task, review...) → khó review diff, khó viết unit test cô lập, xung đột merge cao khi nhiều người/nhiều agent cùng sửa.
- **Cần**: tách theo domain con, ví dụ `core/views/auth.py`, `core/views/task.py`, `core/views/profile.py`, `core/views/review.py`, dùng package `core/views/__init__.py` để giữ tương thích import.

**L5. Không có CI/CD**
- Không tồn tại `.github/workflows/`.
- Toàn bộ kiểm tra hiện dựa vào chạy tay + viết báo cáo `.md` (`TEST_REPORT.md`, `TEST_REPORT_2026_07_21.md`...) — không có gate tự động chặn merge khi có lỗi.
- **Cần**: thêm 1 workflow tối thiểu: `python manage.py test` + `flake8`/`ruff` chạy mỗi lần push/PR lên `main`.

**L6. Cache dùng `LocMemCache` (in-process) trong khi có 2 worker**
- `CACHES['default']['BACKEND'] = 'django.core.cache.backends.locmem.LocMemCache'` — cache không chia sẻ giữa các worker process.
- Với các job dùng cache để giảm gọi Gemini/DB (`performance/lru_cache.py`, `performance/request_dedup.py`), 2 worker sẽ có 2 cache riêng biệt → dedup không hiệu quả như kỳ vọng, dữ liệu cache có thể lệch pha giữa các request đến worker khác nhau.
- **Cần**: nếu ngân sách cho phép, chuyển sang Redis (`django-redis`); nếu không, ít nhất cần biết rõ giới hạn này khi debug các vấn đề "cache không nhất quán".

**L7. Migrations không đồng đều giữa các app**
- `core`: 14 migration files, `payments`: 2, `tracking`: 2, `moderation`: 1, `frontend`: 0 — không phải lỗi tự nó, nhưng số migration ít ở app xử lý tiền (`payments`) và vị trí (`tracking`) trong khi đây là các app thay đổi model nhiều lần theo lịch sử commit — nên kiểm tra migration có bị squash tay hoặc apply thủ công ngoài quy trình `makemigrations` không, dễ gây lệch schema giữa dev/prod.

### 🟢 Thấp / Nice-to-have

**L8. Không có `README.md` ở thư mục gốc**
- Người mới clone (hoặc agent mới) phải tự suy luận cấu trúc từ nhiều file `.md` rời rạc. `AGENTS.md` có vai trò như README kỹ thuật cho AI agent nhưng không thay được README chuẩn cho người.

**L9. Một số exception handling dạng bắt chung `except Exception`**
- `core/views.py` có 15 chỗ, `payments/views.py` có 2 chỗ dùng `except Exception` — dễ nuốt lỗi thật, khó debug khi có sự cố production (log không rõ nguyên nhân gốc).

**L10. `render.yaml` để lộ cấu trúc bí mật gián tiếp qua comment**
- Không lộ giá trị secret thật, nhưng comment mô tả rất chi tiết nơi lấy MoMo Partner Code/Access Key, đường dẫn sandbox docs — không phải lỗi bảo mật nghiêm trọng nhưng nên tách hướng dẫn vận hành ra file riêng (`docs/DEPLOY.md`) thay vì để trong file cấu hình deploy.

## 4. Ưu tiên xử lý gợi ý

| Thứ tự | Việc cần làm | Vì sao ưu tiên |
|---|---|---|
| 1 | Gỡ `db.sqlite3` khỏi git tracking, rà soát lịch sử git | Rủi ro PII cao nhất nếu để lâu |
| 2 | Thêm cross-process lock cho 4 scheduler | Đang thực sự chạy sai ngay lúc này trên production (2 worker) |
| 3 | Viết test cho auth, task, thanh toán, SOS | Nền tảng để sửa lỗi khác an toàn hơn |
| 4 | Thêm GitHub Actions cơ bản (test + lint) | Chặn lỗi tái diễn sau khi đã fix |
| 5 | Tách `core/views.py` theo domain | Giảm rủi ro merge conflict, dễ test hơn |
| 6 | Đánh giá chuyển cache sang Redis | Chỉ cần khi có traffic thật tăng |

---

## 5. Prompt để gửi cho agent khác (đã kết nối với repo GitHub)

Copy đoạn dưới đây gửi cho agent kia (Claude Code, Cursor, Copilot, v.v. — agent nào có quyền đọc/ghi trực tiếp vào repo qua GitHub):

```
Bạn đang làm việc trên repo GitHub: huyhandsome6996/educarelink-backend-4-12-2026 (nhánh main).
Trước khi sửa gì, đọc AGENTS.md ở root repo để hiểu quy ước dự án (ngôn ngữ commit tiếng Việt, kiến trúc, các app).

Một agent khác (Claude) đã audit repo và tìm ra các lỗi sau, xếp theo mức độ nghiêm trọng. Hãy tạo 1 nhánh mới tên "fix/audit-2026-07-21" từ main, xử lý TỪNG lỗi bằng 1 commit riêng (commit message tiếng Việt theo quy ước AGENTS.md), rồi mở Pull Request về main. KHÔNG merge trực tiếp vào main.

## Lỗi cần sửa (theo thứ tự ưu tiên):

1. [Nghiêm trọng] db.sqlite3 đang bị track trong git dù có trong .gitignore.
   - Chạy `git rm --cached db.sqlite3`, commit riêng.
   - Kiểm tra lịch sử git xem các version cũ của file này có chứa dữ liệu người dùng thật (bảng core_user, core_credentialsubmission) không. Nếu có, báo cáo lại cho tôi trước khi làm gì thêm — KHÔNG tự ý rewrite git history nếu chưa xác nhận.

2. [Nghiêm trọng] 4 scheduler sau đang khởi động trong AppConfig.ready() của mỗi app:
   - core/keepalive_scheduler.py (gọi từ core/apps.py)
   - core/anomaly_scheduler.py (gọi từ core/apps.py)
   - payments/scheduler.py (gọi từ payments/apps.py)
   - tracking/offline_scheduler.py (gọi từ tracking/apps.py)
   Vì render.yaml đặt WEB_CONCURRENCY=2, mỗi scheduler này sẽ bị khởi động TRÙNG ở 2 gunicorn worker process (AppConfig.ready() chạy riêng mỗi process). threading.Lock hiện tại không chống được vì đây là race condition GIỮA CÁC PROCESS, không phải giữa threads.
   Yêu cầu: thêm cơ chế lock cấp process (ví dụ dùng fcntl.flock trên 1 file lock chung trong /tmp, hoặc kiểm tra một cách đáng tin cậy chỉ worker đầu tiên mới thực sự start scheduler) để đảm bảo mỗi job chỉ chạy bởi ĐÚNG 1 worker process tại 1 thời điểm, dù WEB_CONCURRENCY tăng lên bao nhiêu. Viết logic này thành 1 helper module chung (ví dụ core/scheduler_lock.py) để 4 scheduler đều tái sử dụng, tránh lặp code.

3. [Nghiêm trọng] Gần như không có test tự động: core/tests.py và frontend/tests.py chỉ là stub Django mặc định (3 dòng). Chỉ có payments/tests/test_integration.py là test thật.
   Yêu cầu: viết test case (dùng Django TestCase / DRF APITestCase) cho các luồng sau, theo đúng thứ tự:
   a. Đăng ký + đăng nhập + refresh token (JWT) cho cả 2 role Parent và Carepartner.
   b. Tạo task, duyệt ứng viên, hoàn thành task (happy path + 1-2 edge case như task bị AI moderation từ chối).
   c. Luồng thanh toán cơ bản (không cần test toàn bộ MoMo/PayOS thật, có thể mock client thanh toán).
   d. Endpoint SOS trong tracking — đảm bảo throttle rate và permission hoạt động đúng.
   Đặt test trong đúng file tests.py/tests/ của từng app tương ứng.

4. [Trung bình] Không có CI. Thêm file .github/workflows/django-ci.yml chạy `python manage.py test` mỗi khi có push hoặc pull_request vào nhánh main. Dùng Python 3.11, cài từ requirements.txt, dùng SQLite cho CI (không cần DATABASE_URL thật).

5. [Trung bình] core/views.py dài 2496 dòng, gộp nhiều domain khác nhau (auth, task, profile, review...).
   Yêu cầu: tách thành package core/views/ với các file con theo domain (ví dụ auth_views.py, task_views.py, profile_views.py, review_views.py), giữ core/views/__init__.py import lại đầy đủ để không phá vỡ import ở nơi khác (core/urls.py và các app khác import từ core.views). Sau khi tách, chạy lại toàn bộ test ở bước 3 để đảm bảo không có gì bị hỏng khi refactor.

6. [Trung bình] CACHES đang dùng LocMemCache (in-process) trong khi WEB_CONCURRENCY=2, khiến cache không nhất quán giữa 2 worker. Không cần fix ngay lập tức, nhưng ghi chú lại giới hạn này vào performance/README.md, và đề xuất (không cần code) việc chuyển sang Redis khi ngân sách cho phép.

Sau khi hoàn thành, viết 1 file báo cáo FIX_REPORT_2026-07-21.md ở root repo, tóm tắt mỗi lỗi đã fix như thế nào, commit hash tương ứng, và kết quả chạy test cuối cùng. Không tự merge PR vào main — để tôi review trước.
```

---

*Ghi chú: db.sqlite3 hiện tại chứa dữ liệu seed/demo (email dạng `...@test.com`), không phải PII thật tại thời điểm audit này (2026-07-21). Tuy vậy việc file này bị track trong git vẫn là rủi ro cần xử lý ngay, vì không đảm bảo các lần commit tương lai sẽ luôn là dữ liệu demo.*
