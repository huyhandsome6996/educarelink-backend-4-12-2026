# EduCareLink — Nền tảng kết nối Phụ huynh ↔ CarePartner

Django 5.2 monolith (backend + web template) + Expo/RN mobile + Next.js admin-web.
Tính năng Flow 1 (ghép cặp Phụ huynh ↔ CarePartner): matching 7-factor, ELO ẩn,
booking auto-commit, T0–T6 đền bù bằng credit ảo, notification critical.

> Quy ước làm việc với AI agent: xem [AGENTS.md](AGENTS.md).
> Spec nghiệp vụ Flow 1: [docs/agent-spec/](docs/agent-spec/).

## Khởi động từ clone SẠCH (bắt buộc làm theo đúng thứ tự)

```bash
# 1. Clone + vào thư mục repo
git clone https://github.com/huyhandsome6996/educarelink-backend-4-12-2026.git
cd educarelink-backend-4-12-2026

# 2. Tạo virtualenv + cài dependency (Python 3.11/3.12)
python3 -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. Tạo file môi trường từ sample (KHÔNG commit .env lên git)
cp .env.example .env          # điền GEMINI_API_KEY nếu cần AI parse

# 4. Tạo schema DB + seed dữ liệu cấu hình nghiệp vụ (BẮT BUỘC —
#    không seed thì mọi tính năng matching/đền bù/ELO không chạy)
python manage.py migrate
python manage.py seed_matching_config

# 5. Chạy thử
python manage.py runserver                    # http://127.0.0.1:8000/
python manage.py test matching                # test suite Flow 1
python scripts/g13_business_rules.py          # gate G13 (17 assertion)
python manage.py run_g13_checks               # gate G13 — cách chạy 2
python scripts/check_no_hardcoded_paths.py    # gate G17 (guard hardcode)
```

**Lưu ý quan trọng:**

- `seed_matching_config` là **bước bắt buộc** — nó nạp 6 EloBand, 7 CancelPolicy
  (T0–T6), 7 MatchingWeight (tổng 100%), 16 NotificationTemplate và các key
  MatchingConfig. Script G13 có preflight: thiếu seed sẽ in hướng dẫn tiếng Việt
  và thoát mã 2.
- `scripts/g13_business_rules.py` tự suy ra gốc repo từ vị trí file — chạy được
  từ **mọi thư mục hiện hành** (repo root, `scripts/`, `/tmp`, ...).
- DB dev mặc định SQLite (`db.sqlite3`, đã gitignore). Production dùng
  PostgreSQL qua `DATABASE_URL`.

## Biến môi trường chính

Toàn bộ sample nằm trong [.env.example](.env.example). Các nhóm chính:

| Nhóm | Biến | Ghi chú |
|------|------|---------|
| Django core | `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL` | `DATABASE_URL` chỉ cần khi dùng PostgreSQL |
| AI | `GEMINI_API_KEY` | Parse job description (có rule-based fallback khi thiếu) |
| Flow 1 | `ENABLE_MATCHING_SCHEDULER` | Chỉ bật `true` trên server; local dev để `false` |
| Mobile | `EXPO_PUBLIC_USE_DEV_BACKEND`, `EXPO_PUBLIC_DEV_BACKEND_URL`, `EXPO_PUBLIC_API_URL` | Xem `mobile/.env` — app mặc định trỏ Render production |
| admin-web | `BACKEND_URL`, `NEXT_PUBLIC_API_BASE` | Xem `admin-web/README.md` |
| Payment | `PAYOS_*`, `MOMO_*` | Đều env-driven, default trỏ production |

Quy tắc repository: **không hardcode** đường dẫn máy cá nhân
(`/home/<user>/`, `/Users/<user>/`), IP LAN hay URL máy dev vào source —
gate G17 (`scripts/check_no_hardcoded_paths.py`, wire trong
`python manage.py test matching`) sẽ chặn tại CI/test.

## Cấu trúc chính

| Thư mục | Nội dung |
|---------|----------|
| `backend/`, `core/`, `payments/`, `tracking/`, ... | Django project + apps cũ |
| `matching/` | Flow 1 ghép cặp: models, services, API, scheduler, tests |
| `frontend/` | Django templates web (kèm 11 trang Flow 1 dưới `/matching-*/`) |
| `admin-web/` | Next.js 14 admin (7 trang: jobs, elo-bands, matching-weights, appeals, bookings, state-logs, home) |
| `mobile/` | Expo app (12 màn hình Flow 1 trong `src/screens/`) |
| `scripts/` | Gate QA: `g13_business_rules.py`, `check_no_hardcoded_paths.py`, ... |
| `docs/agent-spec/` | Spec nghiệp vụ 12 step + ASSUMPTIONS + bản đính chính |

## Triển khai

- Backend + web: Render.com — cấu hình trong `render.yaml` (3 services:
  `educarelink-backend`, `educarelink-tracking-scheduler`, `educarelink-admin-web`).
  Sau deploy/migrate trên môi trường mới nhớ chạy `python manage.py seed_matching_config`.
- Mobile: Expo EAS (Android trước; iOS tạm hoãn theo quyết định owner).
- admin-web: xem `admin-web/README.md` (`BACKEND_URL` env, build tĩnh).
