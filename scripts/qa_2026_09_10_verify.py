"""Verify QA 2026-09-10: 7 trang phụ huynh Flow-1 render OK + có sidebar."""
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.chdir(BASE)

import django  # noqa: E402

django.setup()

import uuid  # noqa: E402

from django.test import Client  # noqa: E402
from django.test.utils import setup_test_environment  # noqa: E402

# Cho phép test client dùng host mặc định 'testserver' kể cả khi DEBUG=False
# (tránh DisallowedHost khi chạy offline ngoài môi trường dev).
setup_test_environment()

PAGES = [
    ('/dang-viec/', 'Đăng việc ghép cặp'),
    ('/dang-viec/gia-su/', 'Gia sư dạy kèm'),
    ('/dang-viec/trong-tre/', 'Đồng hành cùng trẻ tại nhà'),
    ('/dang-viec/don-tre/', 'Đón trẻ tan trường'),
    (f'/ung-vien/{uuid.uuid4()}/', 'Danh sách ứng viên'),
    (f'/don/{uuid.uuid4()}/', 'Chi tiết đơn'),
    ('/vi-credit/', 'Ví credit'),
]

FAILS = []
client = Client()
for url, name in PAGES:
    resp = client.get(url)
    ok_status = resp.status_code == 200
    body = resp.content.decode('utf-8', 'ignore')
    has_sidebar = 'id="sidebar"' in body and 'Đăng xuất' in body
    has_bottom_nav = 'fixed bottom-0' in body
    has_ml = 'lg:ml-[260px]' in body
    active_matching = "active_tab" not in body  # chrome render không lộ chuỗi template
    checks = {
        'status200': ok_status,
        'sidebar': has_sidebar,
        'bottom-nav': has_bottom_nav,
        'main-offset': has_ml,
    }
    mark = 'PASS' if all(checks.values()) else 'FAIL'
    print(f'[{mark}] {url} — {name} ' + str(checks))
    if mark == 'FAIL':
        FAILS.append((url, checks))

# Đối chiếu nội dung đặc tả mới trên 2 form
# Chính sách 6+: form web chỉ còn nhóm tuổi 6_to_10_years / over_10_years —
# các nhóm dưới 6 tuổi (0_to_12_months, 1_to_3_years, 3_to_6_years và alias
# under_3 / preschool) đã bị xóa khỏi giao diện và PHẢI KHÔNG xuất hiện lại.
# (Lưu ý: 'primary' / 'secondary' / 'mixed' chỉ là alias backend trong
# matching/services/job_schema.py, không render trên web nên không check ở đây.)
r1 = client.get('/dang-viec/trong-tre/').content.decode()
check_label = ('Đồng hành cùng trẻ tại nhà' in r1
               and 'Trông trẻ tại nhà' not in r1)
print(f"[{('PASS' if check_label else 'FAIL')}] trong-tre — nhãn mới 'Đồng hành cùng trẻ tại nhà' (không còn 'Trông trẻ tại nhà')")
if not check_label:
    FAILS.append(('trong-tre-label', 'Đồng hành cùng trẻ tại nhà'))
for token in ['6_to_10_years', 'over_10_years',
              'general_care', 'feeding', 'bathing', 'sleep_monitoring',
              'play_activities', 'homework_help', 'light_chores']:
    if token not in r1:
        FAILS.append(('trong-tre', token))
        print(f'[FAIL] trong-tre thiếu token {token}')
for old in ['"feed"', '"bath"', '"study"', '"play"', '"sleep"', '"transport"',
            'under_3', 'preschool',
            '0_to_12_months', '1_to_3_years', '3_to_6_years']:
    if old in r1:
        FAILS.append(('trong-tre-old', old))
        print(f'[FAIL] trong-tre VẪN CÒN token nhóm tuổi <6 / key cũ {old}')

r2 = client.get('/dang-viec/don-tre/').content.decode()
for token in ['6_to_10_years', 'over_10_years', 'selectTransport',
              'transport_method', 'walking', 'carepartner_vehicle',
              'parent_arranged']:
    if token not in r2:
        FAILS.append(('don-tre', token))
        print(f'[FAIL] don-tre thiếu token {token}')
for old in ['under_3', 'preschool', '0_to_12_months', '3_to_6_years']:
    if old in r2:
        FAILS.append(('don-tre-old', old))
        print(f'[FAIL] don-tre VẪN CÒN token nhóm tuổi <6 / key cũ {old}')

# Geocode endpoint resolve + validate input (không cần mạng)
from django.urls import reverse  # noqa: E402

u1 = reverse('matching-geocode-search')
u2 = reverse('matching-geocode-reverse')
print(f'[INFO] geocode urls: {u1} | {u2}')
r = client.get(u1, {'q': 'H'})
print(f"[{'PASS' if r.status_code == 400 else 'FAIL'}] geocode search q ngắn → 400 (thông điệp VI: {r.json().get('detail')})")
if r.status_code != 400:
    FAILS.append(('geocode', 'short-q'))

print()
if FAILS:
    print(f'❌ THẤT BẠI: {len(FAILS)} kiểm tra')
    sys.exit(1)
print('✅ TẤT CẢ PASS — 7 trang có sidebar + 2 form đúng đặc tả + geocode resolve')
