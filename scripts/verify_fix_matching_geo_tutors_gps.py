"""
scripts/verify_fix_matching_geo_tutors_gps.py — Xác minh manual flow 4 Defect
(IM brief 2026-09-13 — mục VERIFICATION & ACCEPTANCE CRITERIA #3).

Chạy: python3.13 scripts/verify_fix_matching_geo_tutors_gps.py
(kịch bản dùng APIClient của DRF — mô phỏng đúng luồng API mobile Parent:
 1. Đăng nhập phuhuynh_test
 2. Tạo job "Ngữ văn lớp 4" tại TP. Huế + child_grade_level
 3. Publish (AI parse fallback rule-based — không cần Gemini key)
 4. Xem candidates → phải là SV ĐH Sư Phạm Huế / Huế, không 'Cầu Giấy, Hà Nội'
 5. Job detail hiển thị đúng khối lớp đã chọn
 6. GPS guard: carepartner_van_hue với GPS Hà Nội fresh → bị loại
 7. gps-heartbeat: chưa consent → 403; có consent → 200; throttle → throttled
"""

import os
import sys
import django
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

# setup_test_environment: thêm 'testserver' vào ALLOWED_HOSTS cho APIClient
from django.test.utils import setup_test_environment
setup_test_environment()

from django.utils import timezone
from rest_framework.test import APIClient

from core.models import User
from tracking.models import LocationConsent
from core.models import Task

CHECKS = []


def check(label, ok, detail=''):
    CHECKS.append((label, ok))
    mark = 'PASS' if ok else 'FAIL'
    print(f'  [{mark}] {label}' + (f' — {detail}' if detail else ''))


print('=' * 72)
print('VERIFY MANUAL FLOW — Fix Matching Engine, Geo, Grade & GPS (4 Defects)')
print('=' * 72)

# ── 1. Đăng nhập phụ huynh ──
client = APIClient()
resp = client.post('/api/auth/login/', {'username': 'phuhuynh_test',
                                        'password': 'Demo@2026'}, format='json')
check('Parent đăng nhập', resp.status_code == 200)
token = resp.data['tokens']['access']
client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

today = timezone.localdate()
dates = [(today + timedelta(days=1)).isoformat()]

# ── 2. Tạo job "Ngữ văn lớp 4" tại TP. Huế ──
payload = {
    'job_type': 'tutoring',
    'subject': 'Ngữ văn',
    'specific_requirements': 'Dạy kèm môn Ngữ văn lớp 4, rèn luyện tập đọc, tập viết và văn mẫu.',
    'dates': dates,
    'time_from': '18:00',
    'time_to': '20:00',
    'latitude': 16.4680,
    'longitude': 107.5890,
    'location_note': '126 Lê Lợi, P. Phú Hội, TP. Huế',
    'hourly_rate_vnd': '120000',
    'child_grade_level': 'primary_grade_1_5',
    'tutor_seniority_preference': 'student_year_3_4',
}
resp = client.post('/api/matching/jobs/', payload, format='json')
check('Tạo job Ngữ văn lớp 4 tại TP. Huế', resp.status_code == 201,
      f'HTTP {resp.status_code}')
job_id = resp.data.get('id')
td = resp.data.get('type_data') or {}
check('child_grade_level lưu vào type_data',
      td.get('child_grade_level') == 'primary_grade_1_5', str(td.get('child_grade_level')))
check('tutor_seniority_preference lưu vào type_data',
      td.get('tutor_seniority_preference') == 'student_year_3_4',
      str(td.get('tutor_seniority_preference')))
check('location_note không chứa Cầu Giấy/Hà Nội',
      'Cầu Giấy' not in (resp.data.get('location_note') or '')
      and 'Hà Nội' not in (resp.data.get('location_note') or ''),
      resp.data.get('location_note'))

# ── 3. Publish ──
resp = client.post(f'/api/matching/jobs/{job_id}/publish/', {}, format='json')
check('Publish job (AI parse + tạo slots)', resp.status_code == 200,
      f"status={resp.data.get('status')}")

# ── 4. Danh sách candidates (POST /api/matching/candidates/ {job_id}) ──
resp = client.post('/api/matching/candidates/', {'job_id': str(job_id)}, format='json')
check('POST candidates trả 200', resp.status_code == 200,
      f'HTTP {resp.status_code}')

data = resp.data if isinstance(resp.data, dict) else {}
candidates = data.get('candidates') or []
check('Có ứng viên (Defect 1 đã fix)', len(candidates) > 0,
      f"total_matched={data.get('total_matched')}")

names = [(c.get('display_name'), c.get('school'), c.get('major')) for c in candidates]
print('   ── Top ứng viên ──')
for n, s, m in names[:5]:
    print(f'   • {n} — {s} — {m}')

hue_uni = [c for c in candidates if 'Huế' in (c.get('school') or '')]
check('Ứng viên đều từ các trường ĐH tại Huế',
      len(candidates) > 0 and len(hue_uni) == len(candidates),
      f'{len(hue_uni)}/{len(candidates)} từ trường Huế')

raw = str(candidates)
check('Không còn "Cầu Giấy, Hà Nội" trên màn hình candidates',
      'Cầu Giấy' not in raw and 'Hà Nội' not in raw)

van_hue = next((c for c in candidates if 'Phương' in (c.get('display_name') or '')), None)
check('Gia sư chuyên Ngữ Văn (Mai Phương) xuất hiện', van_hue is not None,
      f"match={van_hue.get('match_score') if van_hue else 'N/A'}")

# ── 5. GPS guard — Mai Phương đang ở Hà Nội (GPS fresh) → bị loại ──
from matching.models import CarePartnerProfile
vh_user = User.objects.filter(username='carepartner_van_hue').first()
check('carepartner_van_hue tồn tại trong DB', vh_user is not None)
if vh_user:
    vh_user.current_latitude = 21.0285
    vh_user.current_longitude = 105.7945
    vh_user.last_gps_updated_at = timezone.now() - timedelta(hours=2)
    vh_user.save(update_fields=['current_latitude', 'current_longitude',
                                'last_gps_updated_at'])
    resp2 = client.post('/api/matching/candidates/', {'job_id': str(job_id)}, format='json')
    cand2 = (resp2.data or {}).get('candidates') or []
    names2 = [c.get('display_name') for c in cand2]
    check('GPS Hà Nội fresh → Mai Phương BỊ LOẠI khỏi job Huế (Defect 4)',
          all('Phương' not in (n or '') for n in names2),
          f'candidates còn lại: {names2}')

    # GPS hết hạn → quay lại
    vh_user.last_gps_updated_at = timezone.now() - timedelta(hours=49)
    vh_user.save(update_fields=['last_gps_updated_at'])

# ── 6. gps-heartbeat consent guard ──
wclient = APIClient()
resp = wclient.post('/api/auth/login/', {'username': 'carepartner_van_hue',
                                         'password': 'Demo@2026'}, format='json')
wtoken = resp.data['tokens']['access']
wclient.credentials(HTTP_AUTHORIZATION=f'Bearer {wtoken}')

vh_user.refresh_from_db()
has_consent = LocationConsent.objects.filter(worker=vh_user, consent='granted').exists()
if has_consent:
    # revoke tất cả để test 403
    LocationConsent.objects.filter(worker=vh_user).update(consent='revoked')
if True:
    # reset tọa độ (GPS-guard phía trên có thể đã ghi GPS Hà Nội)
    vh_user.current_latitude = None
    vh_user.current_longitude = None
    vh_user.last_gps_updated_at = None
    vh_user.save(update_fields=['current_latitude', 'current_longitude',
                                'last_gps_updated_at'])

resp = wclient.post('/api/tracking/gps-heartbeat/',
                    {'latitude': 21.0285, 'longitude': 105.7945}, format='json')
check('gps-heartbeat CHƯA có consent → 403', resp.status_code == 403,
      f'HTTP {resp.status_code} code={resp.data.get("code")}')
vh_user.refresh_from_db()
check('Chưa consent → KHÔNG ghi tọa độ', vh_user.current_latitude is None
      and vh_user.current_longitude is None)

# Tạo task + consent granted → 200
parent_user = User.objects.get(username='phuhuynh_test')
task = Task.objects.create(title='Task verify GPS', description='x',
                           price=100000, status='in_progress',
                           parent=parent_user,
                           scheduled_time=timezone.now() + timedelta(hours=2))
LocationConsent.objects.create(task=task, worker=vh_user, consent='granted',
                               granted_at=timezone.now())
resp = wclient.post('/api/tracking/gps-heartbeat/',
                    {'latitude': 16.4680, 'longitude': 107.5890}, format='json')
check('gps-heartbeat CÓ consent → 200 + ghi tọa độ', resp.status_code == 200,
      f'gps_sync={resp.data.get("gps_sync")}')
vh_user.refresh_from_db()
check('current_latitude/longitude đã ghi', vh_user.current_latitude == 16.4680
      and vh_user.current_longitude == 107.5890)

resp = wclient.post('/api/tracking/gps-heartbeat/',
                    {'latitude': 16.5, 'longitude': 107.6}, format='json')
check('Gọi lại trong 60s → throttled (không spam DB)',
      resp.status_code == 200 and resp.data.get('gps_sync') == 'throttled',
      f'gps_sync={resp.data.get("gps_sync")}')

resp = client.post('/api/tracking/gps-heartbeat/',
                   {'latitude': 16.46, 'longitude': 107.58}, format='json')
check('Parent gọi gps-heartbeat → 403', resp.status_code == 403)

# ── Tổng kết ──
fails = [c for c in CHECKS if not c[1]]
print('=' * 72)
print(f'KẾT QUẢ: {len(CHECKS) - len(fails)}/{len(CHECKS)} checks PASS')
if fails:
    print('CÁC CHECK FAIL:')
    for label, _ in fails:
        print(f'  - {label}')
    sys.exit(1)
print('✅ Toàn bộ kịch bản manual flow ĐẠT — 4 Defect đã được khắc phục.')
