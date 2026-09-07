"""G13 — 17 assertion nghiệp vụ Flow 1 (gate QA).

Cách chạy (KHÔNG phụ thuộc thư mục hiện hành — script tự suy ra gốc repo
từ vị trí của chính nó, hoạt động từ mọi cwd: repo root, scripts/, /tmp...):
    python scripts/g13_business_rules.py

Cách chạy thứ hai tương đương (không phụ thuộc cwd hay venv activation):
    python manage.py run_g13_checks

ĐIỀU KIỆN BẮT BUỘC PHẢI CHẠY TRƯỚC (script KHÔNG tự seed dữ liệu):
    python manage.py migrate
    python manage.py seed_matching_config
Thiếu seed → preflight in hướng dẫn tiếng Việt và thoát mã 2
(trước đây thiếu seed khiến assertion #6 chết với
AttributeError: 'NoneType' object has no attribute 'tier' — đã được
preflight thay thế bằng thông báo rõ ràng).

Yêu cầu môi trường: chỉ cần Django settings backend.settings (mặc định),
DB SQLite dev là đủ. Bằng chứng gate PHẢI chạy trên CLONE SẠCH —
không phải working tree đã patch tay.

Thời gian chạy dự kiến: ~1-2 phút (phần lớn là 2 bài concurrency 50 thread
trên SQLite; trên PostgreSQL prod sẽ nhanh hơn).

Kiến trúc: file này CHỈ là bootstrap shim. Toàn bộ 17 assertion nằm ở
matching/g13_checks.py để cả 2 cách chạy dùng chung MỘT nguồn sự thật.
"""
import os
import sys

# Gốc repo tự suy ra: script nằm ở <root>/scripts/ → cha của cha = gốc repo.
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.chdir(BASE)

import django  # noqa: E402

django.setup()

from matching.g13_checks import main  # noqa: E402

if __name__ == '__main__':
    sys.exit(main())
