"""
scripts/qa_ung_vien_render_check.py — QA 2026-09-18 (màn hình trắng /ung-vien/).

Kiểm tra 3 lớp KHÔNG cần server thật:
  1. Template ung_vien.html render được (không lỗi cú pháp Django/Jinja),
     chứa đủ khối UI Stitch bắt buộc và sidebar 260px.
  2. Trang KHÔNG rò rỉ đường dẫn API / không còn dữ liệu phi-Huế.
  3. E2E qua Django test client (SQLite local): parent tạo job + publish +
     gọi POST /api/matching/candidates/ → 200 JSON < 2 giây, kèm đo số query.
"""

import os
import sys
import time as _time
import uuid as _uuid

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

# Script chạy ngoài TestCase → cần cho phép host 'testserver' của test client
from django.conf import settings as _settings
_settings.ALLOWED_HOSTS = list(_settings.ALLOWED_HOSTS) + ['testserver', 'localhost']

from datetime import date, time

from django.contrib.auth import get_user_model
from django.template.loader import get_template
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone as tz

from matching.models import JobPost, JobSlot, CarePartnerAvailability, SlotLock
from matching.services.elo_service import EloService

User = get_user_model()

REQUIRED_BLOCKS = [
    'lg:ml-[260px]',                       # khung sidebar 260px
    '_parent_chrome.html',                 # sidebar include
    'jobCapsule', 'radarText',             # Job Capsule + radar banner
    'GỢI Ý HÀNG ĐẦU', 'Thẻ SV chuẩn',  # hero ribbon + badge
    'Chọn CarePartner này', 'Chọn bạn này',   # CTA
    'Điều chỉnh yêu cầu / Đổi khung giờ',     # empty state CTA
    'Thử lại ngay', 'Quay lại chỉnh sửa yêu cầu',  # error box buttons
    'Ký quỹ an toàn MoMo Escrow', 'Bảo hiểm đổi ứng viên 100%',  # safety box
    'Idempotency-Key',                     # chống bấm lặp
    'Chưa tìm thấy CarePartner phù hợp trong khung giờ đã chọn',
    'Đang kết nối CarePartner phù hợp tại Huế',
    'Khớp chuyên môn · Ưu tiên gần nhà',
    'EduCareLink Guarantee',
]

FORBIDDEN_PATTERNS = [
    '/api/matching/candidates',   # không lộ API path trong UI tĩnh
    '/api/parent/my-tasks',       # luồng cũ core.Task
    'radarPayloadPreview',        # payload debug
    'Bách Khoa', 'Ngoại Thương', 'Chu Văn An', 'Thụy Khuê', 'Landmark',
    'Hà Nội', 'TP.HCM', 'TP. Hồ Chí Minh', 'Cầu Giấy', '21.0', '105.8',
]


def main():
    failures = []

    # ── 1. Template render ──
    tpl = get_template('frontend/ung_vien.html')
    html = tpl.render()
    for block in REQUIRED_BLOCKS:
        if block not in html:
            failures.append(f'THIEU khoi UI: {block}')
    for bad in FORBIDDEN_PATTERNS:
        if bad in html:
            failures.append(f'LEAK / phi-Hue: template chua "{bad}"')
    print(f'[1] Template render OK — {len(html)} bytes, '
          f'{len(REQUIRED_BLOCKS)} khoi UI bat buoc, '
          f'{len(FORBIDDEN_PATTERNS)} mau cam')

    # ── 2. E2E: đăng nhập parent → tạo job → publish → candidates API ──
    uname = f'qa_uv_parent_{_uuid.uuid4().hex[:8]}'
    parent = User.objects.create_user(uname, password='x', role='parent',
                                      latitude=16.4637, longitude=107.5909,
                                      is_approved=True)
    job = JobPost.objects.create(
        parent=parent, job_type='tutoring', hourly_rate_vnd=120000,
        status='ai_parsed', latitude=16.4637, longitude=107.5909,
        ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'},
        title='Gia sư Toán lớp 5 khu Vĩnh Ninh, Huế')
    d1 = tz.localdate() + tz.timedelta(days=2)
    d2 = tz.localdate() + tz.timedelta(days=3)
    JobSlot.objects.create(job=job, date=d1, time_from=time(19, 0), time_to=time(21, 0))
    JobSlot.objects.create(job=job, date=d2, time_from=time(19, 0), time_to=time(21, 0))

    for i in range(12):
        u = User.objects.create_user(f'qa_uv_cp_{_uuid.uuid4().hex[:8]}_{i}',
                                     password='x', role='worker',
                                     is_approved=True,
                                     latitude=16.4637 + i * 0.001,
                                     longitude=107.5909)
        p = EloService.get_profile(u)
        CarePartnerAvailability.objects.create(
            carepartner=u, weekday=d1.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))
        p.skills = ['toan', 'tieu_hoc']
        p.school = ['ĐH Sư Phạm - Đại học Huế', 'ĐH Y Dược - Đại học Huế',
                    'Đại học Khoa học - Đại học Huế'][i % 3]
        p.major = 'Sư phạm Toán'
        p.save()

    client = Client()

    # Trang /ung-vien/<job_id>/ render 200 qua view thật (Django session —
    # trang là template render phía server, không cần JWT)
    client.force_login(parent)
    t0 = _time.perf_counter()
    resp = client.get(f'/ung-vien/{job.pk}/')
    page_ms = (_time.perf_counter() - t0) * 1000
    if resp.status_code != 200:
        failures.append(f'Trang /ung-vien/ tra ve {resp.status_code}')
    body = resp.content.decode('utf-8')
    for bad in ('Bách Khoa', 'Hà Nội', 'Landmark'):
        if bad in body:
            failures.append(f'Trang /ung-vien/ chua phi-Hue: {bad}')
    print(f'[2] GET /ung-vien/{str(job.pk)[:8]}.../ → {resp.status_code} '
          f'({page_ms:.0f} ms)')

    # API candidates — dùng JWT THẬT như Web/Mobile đang dùng
    login = client.post('/api/auth/login/',
                        data=f'{{"username": "{uname}", "password": "x"}}',
                        content_type='application/json')
    if login.status_code != 200:
        failures.append(f'Login API tra ve {login.status_code}: {login.content[:200]!r}')
    body_login = login.json() if login.status_code == 200 else {}
    tokens = body_login.get('tokens') or {}
    access = tokens.get('access') or body_login.get('access') or body_login.get('access_token')
    if not access:
        failures.append('Login không trả access token')
    auth = {'HTTP_AUTHORIZATION': f'Bearer {access}'}

    # API candidates — đo thời gian + số query (trước DSA ~500 query, 30s+)
    t0 = _time.perf_counter()
    with CaptureQueriesContext(connection) as ctx:
        api = client.post('/api/matching/candidates/',
                          data=f'{{"job_id": "{job.pk}"}}',
                          content_type='application/json', **auth)
    elapsed = _time.perf_counter() - t0
    if api.status_code != 200:
        failures.append(f'API candidates tra ve {api.status_code}: '
                        f'{api.content[:200]!r}')
    if not api['Content-Type'].startswith('application/json'):
        failures.append(f'API tra ve khong phai JSON: {api["Content-Type"]}')
    if elapsed >= 2.0:
        failures.append(f'API chua {elapsed:.2f}s (>= 2s)')
    data = api.json()
    print(f'[3] POST /api/matching/candidates/ → {api.status_code} JSON '
          f'{elapsed * 1000:.0f} ms, {len(ctx)} queries, '
          f"total_matched={data.get('total_matched')}, "
          f"top={data['candidates'][0]['match_score']}đ "
          f"({data['candidates'][0]['school']})")

    # Đăng lại lần 2 (replay soft lock path) — vẫn phải nhanh & ổn định
    t0 = _time.perf_counter()
    api2 = client.post('/api/matching/candidates/',
                       data=f'{{"job_id": "{job.pk}"}}',
                       content_type='application/json', **auth)
    print(f'[4] Lần 2 (replay soft lock) → {api2.status_code} '
          f'{(_time.perf_counter() - t0) * 1000:.0f} ms, '
          f"total_matched={api2.json().get('total_matched')}")
    if api2.status_code != 200:
        failures.append('Lần 2 không 200')

    locks = SlotLock.objects.filter(job=job).count()
    # Chỉ TOP 8 (MAX_CANDIDATES) được soft lock × 2 slot = 16
    expected_locks = min(8, data['total_matched']) * 2
    print(f'[5] Soft lock sau 2 lần gọi: {locks} (kỳ vọng {expected_locks} '
          f'= top 8 × 2 slot)')
    if locks != expected_locks:
        failures.append(f'Soft lock count sai: {locks} != {expected_locks}')

    print()
    if failures:
        print('=== THAT BAI ===')
        for f in failures:
            print(' -', f)
        sys.exit(1)
    print('=== TAT CA QA PASS ===')


if __name__ == '__main__':
    main()
