"""
e2e_matching_live_demo.py — Kiểm thử END-TO-END nghiệp vụ ghép cặp chạy TRỰC TIẾP
trên DB dev (KHÔNG qua test framework), đi đúng luồng phụ huynh ↔ sinh viên
theo tài liệu mô tả. Chạy:  python scripts/e2e_matching_live_demo.py

Kịch bản (10 bước, dữ liệu mới hoàn toàn mỗi lần chạy):
  S1  Đăng + publish việc trông trẻ (giới tính nữ) — AI fallback hoạt động
  S2  Ứng viên: đúng 6 nữ đạt yêu cầu (lọc cứng: giới tính, bán kính 33km,
      lịch rảnh, band bị chặn), điểm giảm dần, nhãn tiếng Việt, KHÔNG lộ ELO
  S3  Chọn CP → booking tạo NGAY awaiting_commitment, push critical cho CP
  S4  Gửi lại cùng Idempotency-Key → KHÔNG tạo đơn mới; 5 ứng viên khác
      → not_selected
  S5  Lazy-commit: hết deadline → committed ngay khi đọc đơn (beat không chạy)
  S6  Buffer 90': job cách 30' → 409; job cách ĐÚNG 90' → chấp nhận
  S7  CP hủy T3 (lead 4h59'): -50 ELO + phụ huynh đền 20% = 30.000đ + mở khóa
  S8  Tự động tìm người thay: loại CP vừa hủy + band bị chặn
  S9  Sửa trọng số skills trong DB → điểm thay đổi NGAY, không cần restart
  S10 Gia sư: gửi kèm yêu cầu giới tính → bị bỏ qua + thông báo công bằng,
      ứng viên nam VẪN xuất hiện (bất biến Step 11.4)
"""
import os
import sys
import uuid
import json
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.chdir(BASE)

import django  # noqa: E402

django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from django.utils import timezone as tz  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from matching.models import (  # noqa: E402
    Booking, CarePartnerAvailability, CreditBalance, EloBand, EloLedger,
    JobPost, JobSlot, MatchingWeight, Notification, ReplacementAttempt,
    SlotLock,
)
from matching.services.elo_service import EloService  # noqa: E402
from matching.constants import MATCH_LEVEL_LABELS_VI  # noqa: E402

User = get_user_model()

SUFFIX = uuid.uuid4().hex[:6]
RESULTS = []


def check(name, ok, detail=''):
    RESULTS.append((name, ok))
    mark = 'PASS' if ok else 'FAIL'
    print(f'  [{mark}] {name}' + (f' — {detail}' if detail else ''))
    if not ok:
        raise AssertionError(f'Bước FAIL: {name} — {detail}')


def section(title):
    print(f'\n─── {title} ───')


def scan_elo_leak(obj, path='root'):
    """Đệ quy tìm mọi key chứa 'elo' trong JSON trả về cho client."""
    leaks = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if 'elo' in str(k).lower():
                leaks.append(f'{path}.{k}')
            leaks.extend(scan_elo_leak(v, f'{path}.{k}'))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            leaks.extend(scan_elo_leak(v, f'{path}[{i}]'))
    return leaks


# ════════════════════════════ PREFLIGHT ════════════════════════════
section('PREFLIGHT — cấu hình đã seed')
n_bands, n_weights = EloBand.objects.count(), MatchingWeight.objects.count()
check('EloBand + MatchingWeight đã seed (đủ 6 band + 7 trọng số)',
      n_bands >= 6 and n_weights >= 7, f'bands={n_bands}, weights={n_weights}')

# ════════════════════════════ DỮ LIỆU MỚI ════════════════════════════
section('Dọn dẹp dữ liệu demo của các lần chạy trước (user "e2e-*")')
old_users = User.objects.filter(username__startswith='e2e-')
n_old = old_users.count()
for u in old_users:
    u.delete()  # FK cascade: profile, availability, booking, ledger, job...
print(f'  Đã xoá {n_old} user demo cũ (nếu có)')

section('Tạo dữ liệu demo mới (1 phụ huynh + 10 CarePartner)')
now = tz.localtime()
job_day = (tz.localdate() + datetime.timedelta(days=1))

ph1 = User.objects.create_user(f'e2e-ph1-{SUFFIX}', password='x', role='parent',
                               latitude=21.30, longitude=105.95,
                               email=f'ph1-{SUFFIX}@e2e.local', phone_number='0900000001')
ph2 = User.objects.create_user(f'e2e-ph2-{SUFFIX}', password='x', role='parent',
                               latitude=21.30, longitude=105.95,
                               email=f'ph2-{SUFFIX}@e2e.local', phone_number='0900000002')

# Pin job đặt tại (21.30, 105.95) — cách vùng dữ liệu demo cũ ~(21.0, 105.8)
# hơn 30km → CP cũ tự bị lọc cứng bán kính, demo độc lập với dữ liệu tồn tại.
PIN_LAT, PIN_LNG = 21.30, 105.95


def make_cp(name, gender, lat, lng, rating, elo, with_avail=True):
    cp = User.objects.create_user(f'e2e-{name}-{SUFFIX}', password='x', role='worker',
                                  is_approved=True,
                                  latitude=lat, longitude=lng,
                                  email=f'{name}-{SUFFIX}@e2e.local',
                                  phone_number='0912' + uuid.uuid4().hex[:4])
    p = EloService.get_profile(cp)
    p.gender = gender
    p.rating_avg = rating
    p.review_count = 9
    p.hidden_elo = elo          # điểm gốc (sổ cái trống → effective = hidden)
    p.school = 'ĐHQG Hà Nội'
    p.major = 'Giáo dục tiểu học'
    p.save()
    EloService.recompute(p)     # tính effective_elo + band ĐÚNG như production
    if with_avail:
        for wd in range(7):
            CarePartnerAvailability.objects.create(
                carepartner=cp, weekday=wd,
                time_from=datetime.time(0, 0), time_to=datetime.time(23, 59))
    return cp


# 6 nữ đạt chuẩn (cách pin job < 1.5km, ELO 1600 = bậc "rất đáng tin cậy" ×1.15
# để luôn vượt các CP demo cũ trong DB — chỉ dùng để ổn định thứ hạng demo)
good = [
    make_cp('f1', 'female', 21.305, 105.952, 4.9, 1600),
    make_cp('f2', 'female', 21.296, 105.948, 4.8, 1600),
    make_cp('f3', 'female', 21.302, 105.945, 4.7, 1600),
    make_cp('f4', 'female', 21.298, 105.953, 4.6, 1600),
    make_cp('f5', 'female', 21.294, 105.951, 4.5, 1600),
    make_cp('f6', 'female', 21.301, 105.949, 4.4, 1600),
]
f_far = make_cp('f7', 'female', 21.60, 105.95, 5.0, 1600)      # ~33km — ngoài bán kính
f8 = make_cp('f8', 'female', 21.297, 105.947, 4.9, 1600, with_avail=False)  # thiếu lịch rảnh
f9 = make_cp('f9', 'female', 21.299, 105.954, 4.8, 520)         # band BỊ CHẶN (<650)
m1 = make_cp('m1', 'male', 21.303, 105.946, 4.9, 1600)          # nam — bị lọc ở childcare
m2 = make_cp('m2', 'male', 21.295, 105.950, 4.5, 1500)          # nam thứ hai
print(f'  Đã tạo: PH × 2, CP nữ đạt chuẩn × 6, nữ xa × 1, nữ thiếu lịch × 1, '
      f'nữ band chặn × 1, nam × 2')

c_ph1 = APIClient(SERVER_NAME='localhost')
c_ph1.force_authenticate(user=ph1)
c_ph2 = APIClient(SERVER_NAME='localhost')
c_ph2.force_authenticate(user=ph2)
cp_top = None  # sẽ gán ở S3

# ════════════════════════════ S1 ════════════════════════════
section('S1 — PH đăng việc TRONG TRẺ (giới tính nữ) + publish')
r = c_ph1.post('/api/matching/jobs/', {
    'job_type': 'childcare',
    'child_age_group': 'primary',
    'number_of_children': 1,
    'care_duties': ['feed', 'study', 'play'],
    'specific_requirements': 'Cần bạn nữ kiên nhẫn trông bé gái lớp 1 làm bài tập',
    'medical_allergy_notes': 'Bé dị ứng tôm',
    'dates': [job_day.isoformat()],
    'time_from': '09:00', 'time_to': '10:30',
    'latitude': PIN_LAT, 'longitude': PIN_LNG,
    'hourly_rate_vnd': 100000,
    'gender_preference': 'female',
}, format='json')
check('POST /jobs/ tạo bài đăng 201', r.status_code == 201, str(r.json())[:160])
job1_id = r.json()['id']

r = c_ph1.post(f'/api/matching/jobs/{job1_id}/publish/')
check('Publish → ai_parsed (fallback khi không có GEMINI key — đúng thiết kế)',
      r.status_code == 200 and r.json()['status'] == 'ai_parsed'
      and r.json()['ai_parse_status'] == 'fallback', str(r.json())[:160])
check('Job tạo đúng 1 slot 09:00-10:30',
      JobSlot.objects.filter(job_id=job1_id, time_from=datetime.time(9, 0),
                             time_to=datetime.time(10, 30)).count() == 1)

# ════════════════════════════ S2 ════════════════════════════
section('S2 — Danh sách ứng viên: lọc cứng + chấm điểm mềm')
r = c_ph1.post('/api/matching/candidates/', {'job_id': job1_id}, format='json')
body = r.json()
cands = body['candidates']
good_ids = {str(cp.pk) for cp in good}
got_ids = {c['carepartner_id'] for c in cands}
bad_ids = {str(f_far.pk), str(f8.pk), str(f9.pk), str(m1.pk), str(m2.pk)}
from matching.models import CarePartnerProfile  # noqa: E402
check('Giới hạn cứng ≤ 8 ứng viên hiển thị dù tổng số người phù hợp nhiều hơn',
      len(cands) <= 8 and body.get('total_matched', 0) >= 6,
      f"hiển thị={len(cands)}, tổng={body.get('total_matched')} (DB còn dữ liệu demo cũ)")
check('Cả 6 CP nữ của bài test đều được đề xuất', good_ids <= got_ids,
      f'thiếu={good_ids - got_ids}')
check('Lọc cứng ĐÚNG: nữ 33km (ngoài bán kính), nữ thiếu lịch rảnh, '
      'nữ band bị chặn, 2 nam — KHÔNG ai lọt', not (bad_ids & got_ids),
      f'lọt={bad_ids & got_ids}')
check('Mọi ứng viên trả về đều NỮ (đối chiếu DB — lọc giới tính đúng trên toàn DB)',
      all(CarePartnerProfile.objects.get(user_id=i).gender == 'female'
          for i in got_ids))
scores = [c['match_score'] for c in cands]
check('Điểm xếp giảm dần (ổn định, tái lập được)', scores == sorted(scores, reverse=True),
      f'{scores[:3]}...')
check('Nhãn phù hợp đúng 4 chuỗi tiếng Việt theo đặc tả',
      set(c['match_level_vi'] for c in cands) <= set(MATCH_LEVEL_LABELS_VI.values()),
      str(sorted(set(c['match_level_vi'] for c in cands))))
leaks = scan_elo_leak(body)
check('KHÔNG lộ điểm tín nhiệm ẩn (rà quét đệ quy mọi key JSON)', not leaks,
      str(leaks[:4]))
first_run_scores = {c['carepartner_id']: c['match_score'] for c in cands}

# ════════════════════════════ S3 ════════════════════════════
section('S3 — PH chọn ứng viên (điểm cao nhất trong nhóm nữ demo) → đơn tạo NGAY')
cp_top_id = [c for c in cands if c['carepartner_id'] in good_ids][0]['carepartner_id']
cp_top = User.objects.get(pk=cp_top_id)
r = c_ph1.post(f'/api/matching/jobs/{job1_id}/select-carepartner/',
               {'carepartner_id': cp_top_id}, format='json',
               HTTP_IDEMPOTENCY_KEY=f'e2e-{SUFFIX}-001')
check('Select 201 → awaiting_commitment (KHÔNG cần CP bấm đồng ý)',
      r.status_code == 201 and r.json()['status'] == 'awaiting_commitment',
      str(r.json())[:140])
booking1_id = r.json()['id']
check('Giá trị đơn chốt 150.000đ (100k × 1.5h) — đóng băng từ lúc chọn',
      r.json()['total_value_vnd'] == 150000, str(r.json()['total_value_vnd']))
check('Push thông báo LỚP CRITICAL (job_assigned) cho CP được chọn',
      Notification.objects.filter(user=cp_top, code='job_assigned',
                                  klass='critical').exists())
check('Toàn bộ slot bị KHÓA CỨNG (hard lock) trong lịch CP',
      SlotLock.objects.filter(booking_id=booking1_id, lock_type='hard').count() == 1)

# ════════════════════════════ S4 ════════════════════════════
section('S4 — Chống trùng lặp + ứng viên khác bị đánh dấu')
r2 = c_ph1.post(f'/api/matching/jobs/{job1_id}/select-carepartner/',
                {'carepartner_id': cp_top_id}, format='json',
                HTTP_IDEMPOTENCY_KEY=f'e2e-{SUFFIX}-001')
check('Gửi LẠI cùng Idempotency-Key → trả đúng đơn cũ, không tạo đơn mới',
      r2.status_code == 200 and r2.json()['id'] == booking1_id
      and Booking.objects.filter(job_id=job1_id).exclude(status='not_selected')
      .count() == 1)
check(f'{len(cands) - 1} ứng viên còn lại → not_selected (không đề xuất lại cho đơn này)',
      Booking.objects.filter(job_id=job1_id, status='not_selected').count()
      == len(cands) - 1)
check('Job chuyển trạng thái đã chọn CarePartner (carepartner_selected)',
      JobPost.objects.get(pk=job1_id).status == 'carepartner_selected')

# ════════════════════════════ S5 ════════════════════════════
section('S5 — Cửa sổ cam kết hết hạn → committed qua KIỂM TRA LƯỜI')
b1 = Booking.objects.get(pk=booking1_id)
b1.commit_deadline = tz.now() - datetime.timedelta(seconds=1)
b1.save(update_fields=['commit_deadline'])
r = c_ph1.get(f'/api/matching/bookings/{booking1_id}/')
check('Beat scheduler KHÔNG chạy nhưng đơn vẫn tự committed khi đọc '
      '(cơ chế dự phòng đúng thiết kế)',
      r.json()['status'] == 'committed', r.json()['status'])

# ════════════════════════════ S6 ════════════════════════════
section('S6 — Khoảng nghỉ 90 phút giữa 2 đơn của cùng CP')
r = c_ph2.post('/api/matching/jobs/', {
    'job_type': 'tutoring', 'subject': 'Toán lớp 5',
    'specific_requirements': 'Kèm bài tập về nhà',
    'dates': [job_day.isoformat()],
    'time_from': '11:00', 'time_to': '12:00',   # job1 kết thúc 10:30 → gap 30'
    'latitude': PIN_LAT, 'longitude': PIN_LNG, 'hourly_rate_vnd': 120000,
}, format='json')
job2_id = r.json()['id']
c_ph2.post(f'/api/matching/jobs/{job2_id}/publish/')
c_ph2.post('/api/matching/candidates/', {'job_id': job2_id}, format='json')
r = c_ph2.post(f'/api/matching/jobs/{job2_id}/select-carepartner/',
               {'carepartner_id': cp_top_id}, format='json',
               HTTP_IDEMPOTENCY_KEY=f'e2e-{SUFFIX}-002')
check('Job cách 30 phút → CHẶN 409 (buffer 90\')', r.status_code == 409,
      f'code={getattr(r, "data", {}).get("code", r.status_code)}')

r = c_ph2.post('/api/matching/jobs/', {
    'job_type': 'tutoring', 'subject': 'Toán lớp 5',
    'specific_requirements': 'Kèm bài tập về nhà',
    'dates': [job_day.isoformat()],
    'time_from': '12:00', 'time_to': '13:00',   # 10:30 → 12:00 = ĐÚNG 90'
    'latitude': PIN_LAT, 'longitude': PIN_LNG, 'hourly_rate_vnd': 120000,
}, format='json')
job3_id = r.json()['id']
c_ph2.post(f'/api/matching/jobs/{job3_id}/publish/')
c_ph2.post('/api/matching/candidates/', {'job_id': job3_id}, format='json')
r = c_ph2.post(f'/api/matching/jobs/{job3_id}/select-carepartner/',
               {'carepartner_id': cp_top_id}, format='json',
               HTTP_IDEMPOTENCY_KEY=f'e2e-{SUFFIX}-003')
check('Job cách ĐÚNG 90 phút → CHẤP NHẬN (ranh giới đúng spec)',
      r.status_code == 201, f'status={r.status_code} {str(r.json())[:120]}')
booking3_id = r.json()['id']
elo_before = EloService.get_profile(cp_top).effective_elo
c_cp = APIClient(SERVER_NAME='localhost')
c_cp.force_authenticate(user=cp_top)
r = c_cp.post(f'/api/matching/bookings/{booking3_id}/cancel/', {
    'reason_code': 'personal', 'note': 'Trùng lịch cá nhân', 'evidence': [],
}, format='json')
check('CP hủy trong cửa sổ → T0, trừ đúng 5 điểm (quyền lợi hợp lệ)',
      r.status_code == 200 and r.json()['elo_delta_applied'] == -5,
      f"delta={r.json().get('elo_delta_applied')}")
check('Hủy T0 KHÔNG đền bù cho PH', r.json().get('credit_compensation_vnd') in (0, None),
      str(r.json().get('credit_compensation_vnd')))

# ════════════════════════════ S7 ════════════════════════════
section('S7 — CP hủy T3 (còn 4h59\'): trừ điểm + đền bù + mở khóa')
slot1 = JobSlot.objects.filter(job_id=job1_id).first()
t3_start = tz.localtime() + datetime.timedelta(hours=4, minutes=59)  # GIỜ LOCAL
slot1.date = t3_start.date()
slot1.time_from = t3_start.time().replace(second=0, microsecond=0)
slot1.time_to = (t3_start + datetime.timedelta(minutes=90)).time()
slot1.save()
elo_before = EloService.get_profile(cp_top).effective_elo
r = c_cp.post(f'/api/matching/bookings/{booking1_id}/cancel/', {
    'reason_code': 'personal', 'note': 'Xin lỗi, tôi có việc đột xuất',
    'evidence': [],
}, format='json')
check('Hủy lead 4h59\' → đúng bậc T3', r.json()['elo_delta_applied'] == -50,
      f"delta={r.json()['elo_delta_applied']} (T3 = -50)")
check('Trạng thái đơn → cancelled_by_carepartner',
      r.json()['status'] == 'cancelled_by_carepartner')
check('Sổ cái ELO ghi dòng T3 -50 (có idempotency chống ghi trùng)',
      EloLedger.objects.filter(carepartner=cp_top, reason_code='T3', delta=-50,
                               booking_id=booking1_id).exists())
bal = CreditBalance.objects.get(parent=ph1)
check('PH đền bù 20% × 150.000 = 30.000đ credit ảo', bal.credit_vnd == 30000,
      f'{bal.credit_vnd}đ')
check('Khóa cứng slot ĐƯỢC MỞ (không mất khung giờ oan)',
      SlotLock.objects.filter(booking_id=booking1_id).count() == 0)
check('Job chuyển → cần người thay thế (needs_replacement)',
      JobPost.objects.get(pk=job1_id).status == 'needs_replacement')

# ════════════════════════════ S8 ════════════════════════════
section('S8 — Tự động tìm người thay thế')
check('ReplacementAttempt được ghi lại (truy vết được)',
      ReplacementAttempt.objects.filter(job_id=job1_id).exists())
r = c_ph1.post('/api/matching/candidates/', {'job_id': job1_id}, format='json')
ids = {c['carepartner_id'] for c in r.json()['candidates']}
check('Chạy lại ghép cặp: LOẠI đúng CP vừa hủy và band bị chặn',
      cp_top_id not in ids and str(f9.pk) not in ids,
      f'vừa hủy trong list={cp_top_id in ids}, band chặn trong list={str(f9.pk) in ids}')
check('Ứng viên tốt khác vẫn được đề xuất lại (còn đường quay lại cho người khác)',
      len(ids & good_ids) >= 5, f'nhóm demo còn={len(ids & good_ids)}')

# ════════════════════════════ S9 ════════════════════════════
section('S9 — Chỉnh trọng số trong DB có hiệu lực NGAY')
w = MatchingWeight.objects.get(factor='skills')
old_w = w.weight_pct
job_day2 = tz.localdate() + datetime.timedelta(days=2)
r = c_ph1.post('/api/matching/jobs/', {
    'job_type': 'childcare', 'child_age_group': 'primary', 'number_of_children': 1,
    'care_duties': ['feed'], 'specific_requirements': 'Trông bé buổi tối',
    'dates': [job_day2.isoformat()],
    'time_from': '09:00', 'time_to': '10:30',
    'latitude': PIN_LAT, 'longitude': PIN_LNG, 'hourly_rate_vnd': 100000,
}, format='json')
job4_id = r.json()['id']
c_ph1.post(f'/api/matching/jobs/{job4_id}/publish/')
r = c_ph1.post('/api/matching/candidates/', {'job_id': job4_id}, format='json')
base_scores = {c['carepartner_id']: c['match_score'] for c in r.json()['candidates']}

w.weight_pct = old_w + 15
w.save(update_fields=['weight_pct'])
r = c_ph1.post('/api/matching/candidates/', {'job_id': job4_id}, format='json')
new_scores = {c['carepartner_id']: c['match_score'] for c in r.json()['candidates']}
check('Sửa weight skills 20→35 → điểm thay đổi ngay không restart',
      any(new_scores[k] != base_scores[k] for k in base_scores),
      f'VD: {[k[:4] for k in base_scores]} {base_scores.get(list(base_scores)[0])} '
      f'→ {new_scores.get(list(base_scores)[0])}')
w.weight_pct = old_w
w.save(update_fields=['weight_pct'])
r = c_ph1.post('/api/matching/candidates/', {'job_id': job4_id}, format='json')
back_scores = {c['carepartner_id']: c['match_score'] for c in r.json()['candidates']}
check('Trả weight về 20 → điểm quay lại như cũ (xác định, tái lập)',
      back_scores == base_scores)

# ════════════════════════════ S10 ════════════════════════════
section('S10 — Gia sư: bất biến công bằng giới tính (Step 11.4)')
r = c_ph1.post('/api/matching/jobs/', {
    'job_type': 'tutoring', 'subject': 'MC kỹ năng sống',   # môn KỸ NĂNG tự do
    'specific_requirements': 'Cần bạn nữ tự tin đứng lớp',
    'dates': [job_day2.isoformat()],
    'time_from': '19:00', 'time_to': '20:30',
    'latitude': PIN_LAT, 'longitude': PIN_LNG, 'hourly_rate_vnd': 150000,
    'gender_preference': 'female',
}, format='json')
job5_id = r.json()['id']
check('Tạo job gia sư kèm yêu cầu giới tính → nhận thông báo công bằng',
      'fairness_notice' in r.json(), r.json().get('fairness_notice', '')[:80])
c_ph1.post(f'/api/matching/jobs/{job5_id}/publish/')
r = c_ph1.post('/api/matching/candidates/', {'job_id': job5_id}, format='json')
ids5 = {c['carepartner_id'] for c in r.json()['candidates']}
check('Ứng viên NAM vẫn xuất hiện trong gia sư (không lọc giới tính)',
      str(m1.pk) in ids5, f'm1 trong list={str(m1.pk) in ids5}')

# ════════════════════════════ TỔNG KẾT ════════════════════════════
n_pass = sum(1 for _, ok in RESULTS if ok)
print('\n' + '═' * 60)
print(f'═══ E2E LIVE: {n_pass}/{len(RESULTS)} assertion PASS '
      f'(mã dữ liệu demo: {SUFFIX}) ═══')
print('═' * 60)
sys.exit(0 if n_pass == len(RESULTS) else 1)
