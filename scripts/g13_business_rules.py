"""
G13 — 15 assertion nghiệp vụ (QA gate #4 yêu cầu chạy thật + in PASS/FAIL).

Chạy: source /home/z/.venv/bin/activate
      python /home/z/my-project/scripts/g13_business_rules.py

Ghi chú trung thực:
- Assertion #6: QA prompt ghi "T3 -> credit 30%" nhưng spec
  flow1-step7-cancellation-compensation.md §7.1 quy định T3 = -50 ELO +
  ĐỀN BÙ 20% (30% là của T4). Script assert THEO SPEC và in rõ điều này.
- Assertion #7: QA prompt ghi "no-show -> credit 100%" nhưng spec T5 = 50%
  sàn 50.000đ (100% là T6-escalation). Assert theo spec + kiểm chứng sàn.
"""
import os
import sys
import time
import uuid as _uuid
from datetime import datetime as dt, timedelta, time as dtime
from threading import Barrier, Thread

BASE = '/home/z/my-project/repo-educarelink'
sys.path.insert(0, BASE)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.chdir(BASE)

import django  # noqa: E402
django.setup()

from django.utils import timezone as tz  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.db import connection  # noqa: E402

from matching.models import (  # noqa: E402
    Booking, CarePartnerAvailability, CarePartnerProfile, CreditBalance,
    EloLedger, JobPost, JobSlot, SlotLock,
)
from matching.constants import JobPostStatus  # noqa: E402
from matching.services.elo_service import EloService  # noqa: E402
from matching.services.booking_service import (  # noqa: E402
    compute_commit_deadline, select_carepartner,
)
from matching.services.lock_service import (  # noqa: E402
    BufferViolationError, SlotConflictError,
)
from matching.services.cancellation_service import (  # noqa: E402
    cancel_by_carepartner, confirm_no_show,
)
from matching.services.availability_service import (  # noqa: E402
    BlackoutConflictError, can_delete_window, create_blackout,
)
from matching.services import matching_service  # noqa: E402

User = get_user_model()
TAG = 'g13_' + _uuid.uuid4().hex[:8]

RESULTS = []


def check(idx, name, cond, actual=''):
    status = 'PASS' if cond else 'FAIL'
    RESULTS.append((idx, name, status, actual))
    print(f'[{status}] #{idx:2d} {name}' + (f'  → {actual}' if actual else ''))
    return cond


def make_cp(name, rating=4.5, elo=1200, loc=(21.0, 105.8)):
    cp = User.objects.create_user(
        TAG + name, password='x', role='worker', is_approved=True,
        first_name='G13', last_name=name, latitude=loc[0], longitude=loc[1])
    profile = EloService.get_profile(cp)
    profile.hidden_elo = elo
    profile.effective_elo = elo
    profile.rating_avg = rating
    profile.review_count = 10
    profile.save()
    EloService.recompute(profile)  # set band đúng theo hidden_elo
    return cp


def add_avail(cp, weekday, tf, tt):
    CarePartnerAvailability.objects.create(
        carepartner=cp, weekday=weekday, time_from=tf, time_to=tt)


def make_job(parent, date_, tf, tt, rate=150000, hours=None):
    job = JobPost.objects.create(
        parent=parent, job_type='tutoring',
        hourly_rate_vnd=rate, status=JobPostStatus.MATCHING,
        latitude=21.0, longitude=105.8, type_data={'subject': 'Toán'},
        ai_parse_result={},
    )
    if hours is None:
        hours = (dtime(*tt) if isinstance(tt, tuple) else tt)
    JobSlot.objects.create(
        job=job, date=date_,
        time_from=dtime(*tf) if isinstance(tf, tuple) else tf,
        time_to=dtime(*tt) if isinstance(tt, tuple) else tt)
    return job


def next_monday():
    today = tz.localdate()
    return today + timedelta(days=(7 - today.weekday()) % 7 or 7)


def get_credit(parent):
    bal, _ = CreditBalance.objects.get_or_create(parent=parent)
    return bal

# ════════════════ Chuẩn bị dữ liệu ════════════════
# Dọn dẹp dữ liệu lần chạy trước (nếu có) — cascade theo user
User.objects.filter(username__startswith='g13_').delete()

parent = User.objects.create_user(TAG + 'parent', password='x', role='parent',
                                  latitude=21.0, longitude=105.8)

MON = next_monday()
WEEKDAY_MON = MON.weekday()

# ── #1 Buffer 90 phút ──
cp_buf = make_cp('buf')
add_avail(cp_buf, WEEKDAY_MON, dtime(17, 0), dtime(23, 59))
job1 = make_job(parent, MON, (18, 0), (19, 0))
select_carepartner(job1, cp_buf)  # job1 18:00-19:00 OK
try:
    job2a = make_job(parent, MON, (19, 30), (20, 30))
    select_carepartner(job2a, cp_buf)  # gap 30' → phải bị chặn
    check(1, 'Buffer 90\u0027: chặn 19:30-20:30 (gap 30\u0027)', False, 'KHÔNG bị chặn!')
    viol = None
except SlotConflictError as e:
    viol = type(e).__name__
    check(1, 'Buffer 90\u0027: chặn 19:30-20:30 (gap 30\u0027)',
          viol == 'BufferViolationError', f'raised {viol}')
job2b = make_job(parent, MON, (20, 30), (21, 30))
b2b, created2b = select_carepartner(job2b, cp_buf)  # gap đúng 90' → OK
check(1, 'Buffer 90\u0027: chấp nhận 20:30-21:30 (gap = 90\u0027)',
      created2b and b2b.status == 'awaiting_commitment',
      f'booking {b2b.status}')

# ── #3 Auto-commit + hard lock ALL slots (chạy trước #2 để dùng kết quả) ──
job_auto = make_job(parent, MON, (8, 0), (9, 0))
job_auto.slots.create(date=MON, time_from=dtime(10, 0), time_to=dtime(11, 0))  # 2 slot
cp_auto = make_cp('auto')
add_avail(cp_auto, WEEKDAY_MON, dtime(7, 0), dtime(12, 0))
booking_auto, created_auto = select_carepartner(job_auto, cp_auto)
locks = SlotLock.objects.filter(booking=booking_auto, lock_type='hard')
check(3, 'Auto-commit: Booking tạo NGAY (awaiting_commitment), không cần CP '
         'xác nhận, hard-lock ĐỦ slots atomically',
      created_auto and booking_auto.status == 'awaiting_commitment'
      and locks.count() == job_auto.slots.count(),
      f'status={booking_auto.status}, locks={locks.count()}/'
      f'{job_auto.slots.count()} slots')

# ── #2 Max 8 candidates ──
for i in range(20):
    cp = make_cp(f'pool{i:02d}', rating=4.0 + (i % 10) / 100)
    add_avail(cp, WEEKDAY_MON, dtime(13, 0), dtime(22, 0))
job_pool = make_job(parent, MON, (14, 0), (16, 0))
result = matching_service.find_candidates(job_pool)
check(2, 'Max 8 ứng viên: 20 CP đủ điều kiện → trả 8, total_matched=20',
      len(result['candidates']) == 8 and result['total_matched'] == 20,
      f"len={len(result['candidates'])}, total={result['total_matched']}")

# ── #4 Concurrency: 50 thread chọn cùng CP + slot ──
cp_race = make_cp('race')
add_avail(cp_race, WEEKDAY_MON, dtime(5, 0), dtime(6, 0))
job_race = make_job(parent, MON, (5, 0), (6, 0))
N = 50
barrier = Barrier(N)
out = {'created': 0, 'conflict': 0, 'replay': 0, 'other': []}


def race_worker():
    try:
        barrier.wait()
        attempts = 0
        while attempts < 15:
            attempts += 1
            try:
                _b, created = select_carepartner(job_race, cp_race)
                if created:
                    out['created'] += 1
                else:
                    out['replay'] += 1  # idempotent replay cùng booking
                break
            except SlotConflictError:
                out['conflict'] += 1
                break
            except Exception as e:
                # SQLite dev-DB: 'database is locked' khi 50 connection cùng
                # ghi — retry (trên PostgreSQL prod: select_for_update row
                # lock xử lý tuần tự, không cần retry). Kết quả cuối vẫn
                # phải là: đúng 1 booking, không double-booking.
                if 'locked' in str(e).lower() and attempts < 15:
                    time.sleep(0.05 * attempts)
                    continue
                out['other'].append(f'{type(e).__name__}: {e}')
                break
    finally:
        connection.close()


threads = [Thread(target=race_worker) for _ in range(N)]
for t in threads:
    t.start()
for t in threads:
    t.join()
active = Booking.objects.filter(job=job_race, carepartner=cp_race).exclude(
    status='not_selected').count()
check(4, 'Concurrency 4a — 50 thread cùng CP + slot → đúng 1 booking '
         '(49 còn lại được bảo vệ: slot_taken hoặc idempotent replay)',
      out['created'] == 1 and active == 1 and not out['other'],
      f"1 created, {out['conflict']} slot_taken, "
      f"{out['replay']} idempotent-replay(cùng booking), other={out['other']}")

# ── #4b Concurrency: 50 thread, CÙNG job/slot, KHÁC CP → 49 nhận 409 ──
race_cps = []
for i in range(N):
    cp = make_cp(f'race2{i:02d}')
    add_avail(cp, WEEKDAY_MON, dtime(3, 0), dtime(4, 30))
    race_cps.append(cp)
job_race2 = make_job(parent, MON, (3, 0), (4, 0))
barrier2 = Barrier(N)
out2 = {'created': 0, 'conflict': 0, 'replay': 0, 'other': []}


def race_worker2(cp_i):
    cp = race_cps[cp_i]
    try:
        barrier2.wait()
        attempts = 0
        while attempts < 15:
            attempts += 1
            try:
                _b, created = select_carepartner(job_race2, cp)
                if created:
                    out2['created'] += 1
                else:
                    out2['replay'] += 1
                break
            except SlotConflictError:
                out2['conflict'] += 1
                break
            except Exception as e:
                if 'locked' in str(e).lower() and attempts < 15:
                    time.sleep(0.05 * attempts)
                    continue
                out2['other'].append(f'{type(e).__name__}: {e}')
                break
    finally:
        connection.close()


threads2 = [Thread(target=race_worker2, args=(i,)) for i in range(N)]
for t in threads2:
    t.start()
for t in threads2:
    t.join()
active2 = Booking.objects.filter(job=job_race2).exclude(
    status='not_selected').count()
check(4, 'Concurrency 4b — 50 thread khác CP cùng slot → đúng 1 created, '
         '49 nhận SlotConflictError (409 slot_taken)',
      out2['created'] == 1 and out2['conflict'] == N - 1
      and active2 == 1 and not out2['other'],
      f"1 created, {out2['conflict']} slot_taken, "
      f"{out2['replay']} replay, other={out2['other']}")

# ── #5 Commitment window ──
now0 = tz.now()
CASES = [(30 * 60, 60), (10 * 60, 30), (3 * 60, 15), (30, 5), (4, 0)]
detail5 = []
ok5 = True
for lead, expect in CASES:
    start = now0 + timedelta(minutes=lead)
    deadline, window = compute_commit_deadline(now0, start)
    ok5 = ok5 and (window == expect) and ((deadline is None) == (expect == 0))
    detail5.append(f'{lead}p→{window}')
check(5, 'Commitment window 30h→60p, 10h→30p, 3h→15p, 30p→5p, 4p→0 (ngay)',
      ok5, ', '.join(detail5))

# ── #6 Cancel T3 → -50 ELO + credit 20% (THEO SPEC §7.1 — QA ghi 30% là của T4) ──
cp_t3 = make_cp('t3')
add_avail(cp_t3, tz.localdate().weekday(), dtime(0, 0), dtime(23, 59))
job_t3 = make_job(parent, tz.localdate(), (15, 0), (17, 0), rate=150000)  # 300k
start_t3 = tz.make_aware(dt.combine(tz.localdate(), dtime(15, 0)))
# đẩy đồng hồ về "bây giờ" mà lead = 4h59' trước 15:00 (dùng freeze giả lập:
# tạo booking trước, rồi service tính lead theo now thật — nên ta dựng slot
# để "now thật" rơi vào khoảng T3): slot 15:00 hôm nay, chạy khi < 3h?
# Để deterministic: slot = 19:00, giờ chạy test 14:01 → lead 299'. Nếu giờ
# thực ngoài khoảng, dùng EloLedger để kiểm chứng thay vì thời gian thực.
# → Cách chắc chắn: freeze không được (script ngoài test framework) — dùng
# logic: tạo booking XONG, ghi số phút lead thực tế, chỉ assert khi lead ∈
# [180,360). Script chạy lúc nào cũng được vì ta tự chọn slot theo now:
now_real = tz.localtime()
slot_start = (now_real + timedelta(minutes=299)).replace(second=0, microsecond=0)
slot_date = slot_start.date()
slot_tf = slot_start.time()
slot_tt = (dt.combine(slot_date, slot_tf) + timedelta(hours=2)).time()
cp_t3b = make_cp('t3b')
add_avail(cp_t3b, slot_date.weekday(), dtime(0, 0), dtime(23, 59))
job_t3b = make_job(parent, slot_date, slot_tf.hour and
                   (slot_tf.hour, slot_tf.minute) or (slot_tf.hour, slot_tf.minute),
                   (slot_tt.hour, slot_tt.minute), rate=150000)
job_t3b.slots.all().delete()
job_t3b.slots.create(date=slot_date, time_from=slot_tf, time_to=slot_tt)
booking_t3, _c = select_carepartner(job_t3b, cp_t3b)
booking_t3.status = 'committed'
booking_t3.commit_deadline = tz.now() - timedelta(minutes=1)
booking_t3.save(update_fields=['status', 'commit_deadline'])
credit_before6 = get_credit(parent).credit_vnd
booking_t3, _r = cancel_by_carepartner(booking_t3, 'transport',
                                       note='Xe hỏng giữa đường')
booking_t3.refresh_from_db()
credit6 = get_credit(parent)
elo6 = EloLedger.objects.filter(carepartner=cp_t3b, booking=booking_t3,
                                delta__lt=0).order_by('-created_at').first()
expect_credit6 = int(300000 * 0.20)  # T3 = 20% THEO SPEC
check(6, "Cancel T3 (lead 299') → ELO -50 + credit 20% × 300.000 = 60.000đ "
         '(spec §7.1; QA ghi 30% — đó là của T4)',
      elo6 and elo6.reason_code == 'T3' and elo6.delta == -50
      and booking_t3.status == 'cancelled_by_carepartner'
      and credit6.credit_vnd - credit_before6 == expect_credit6,
      f"tier={elo6.reason_code if elo6 else None}, elo={elo6.delta if elo6 else None}, "
      f"credit_delta={credit6.credit_vnd - credit_before6} (kỳ vọng {expect_credit6})")

# ── #7 No-show T5 → -150 ELO + credit 50% sàn 50.000đ (THEO SPEC; QA ghi 100%) ──
cp_ns = make_cp('noshow')
add_avail(cp_ns, tz.localdate().weekday(), dtime(0, 0), dtime(23, 59))
# slot trong tương lai (select yêu cầu) — beat task mới là thứ phát hiện
# "start + 15' chưa vào làm" → đặt suspected_no_show mô phỏng beat (như
# integration test), confirm_no_show chỉ kiểm tra trạng thái.
start_ns = (tz.localtime() + timedelta(minutes=30)).replace(second=0, microsecond=0)
ns_date, ns_tf = start_ns.date(), start_ns.time()
ns_tt = (dt.combine(ns_date, ns_tf) + timedelta(hours=1)).time()
job_ns = make_job(parent, ns_date,
                  (ns_tf.hour, ns_tf.minute), (ns_tt.hour, ns_tt.minute),
                  rate=60000)  # 60k × 1h → 50% = 30k < sàn 50k
booking_ns, _c = select_carepartner(job_ns, cp_ns)
booking_ns.status = 'committed'
booking_ns.save(update_fields=['status'])
# mô phỏng beat task: start + 15' đã qua mà chưa start → suspected_no_show
booking_ns.status = 'suspected_no_show'
booking_ns.save(update_fields=['status'])
credit_before7 = get_credit(parent).credit_vnd
booking_ns, _created7 = confirm_no_show(booking_ns, parent_says_arrived=False)
booking_ns.refresh_from_db()
elo7 = EloLedger.objects.filter(carepartner=cp_ns, booking=booking_ns,
                                delta__lt=0).order_by('-created_at').first()
credit7 = get_credit(parent)
check(7, 'No-show (start+15\u0027, chưa vào làm) → no_show, ELO -150, credit '
         '50% sàn 50.000đ (60k×50%=30k → sàn 50k) — spec §7.1',
      booking_ns.status == 'no_show' and elo7 and elo7.delta == -150
      and credit7.credit_vnd - credit_before7 == 50000,
      f"status={booking_ns.status}, elo={elo7.delta if elo7 else None}, "
      f'credit_delta={credit7.credit_vnd - credit_before7} (sàn 50.000đ)')

# ── #8 FM 'health' note <20 ký tự → từ chối; ≥20 → ELO ×0.5, GIỮ đền bù ──
cp_fm = make_cp('fm')
add_avail(cp_fm, tz.localdate().weekday(), dtime(0, 0), dtime(23, 59))
start8 = (tz.localtime() + timedelta(minutes=90)).replace(second=0, microsecond=0)
d8, tf8 = start8.date(), start8.time()
tt8 = (dt.combine(d8, tf8) + timedelta(hours=2)).time()
job8 = make_job(parent, d8, (tf8.hour, tf8.minute), (tt8.hour, tt8.minute), rate=100000)
booking8, _c = select_carepartner(job8, cp_fm)
booking8.status = 'committed'
booking8.save(update_fields=['status'])
rejected_ok = False
try:
    cancel_by_carepartner(booking8, 'health', note='ngắn')
except Exception as e:
    rejected_ok = '20' in str(e)  # thông báo yêu cầu ≥20 ký tự
credit_before8 = get_credit(parent).credit_vnd
booking8, _r = cancel_by_carepartner(booking8, 'health',
                                     note='Bị nhập viện đột ngột, không thể tham gia ca làm')
booking8.refresh_from_db()
elo8 = EloLedger.objects.filter(carepartner=cp_fm, booking=booking8,
                                delta__lt=0).order_by('-created_at').first()
credit8 = get_credit(parent)
# job8: 100k/giờ × 2h = 200.000đ → T4 đền 30% = 60.000đ (FM GIỮ đền bù)
check(8, "FM 'health' note<20 → từ chối (400); note≥20 → ELO T4 -80×0.5=-40, "
         'giữ đền bù 30%',
      rejected_ok and elo8 and elo8.delta == -40
      and credit8.credit_vnd - credit_before8 == 60000,
      f'reject={rejected_ok}, elo={elo8.delta if elo8 else None}, '
      f'credit_delta={credit8.credit_vnd - credit_before8} (30% × 200k = 60k)')

# ── #9 FM lần 3 trong rolling 30 ngày → phạt ĐẦY ĐỦ (không ×0.5) ──
# Slot ngày+1/+2/+3 giờ +3h → lead > 24h → T1 (-15). FM lần 1,2 → ×0.5 = -7;
# lần 3 (đã có 2 FM trong 30 ngày) → phạt ĐẦY ĐỦ -15 (không giảm).
cp_fm3 = make_cp('fm3')
for wd in range(7):
    add_avail(cp_fm3, wd, dtime(0, 0), dtime(23, 59))
fm_deltas = []
for i in range(3):
    st = (tz.localtime() + timedelta(days=i + 1, hours=3)).replace(
        second=0, microsecond=0)
    dd, tff = st.date(), st.time()
    ttt = (dt.combine(dd, tff) + timedelta(hours=1)).time()
    j = make_job(parent, dd, (tff.hour, tff.minute), (ttt.hour, ttt.minute),
                 rate=100000)
    bk, _c = select_carepartner(j, cp_fm3)
    bk.status = 'committed'
    bk.save(update_fields=['status'])
    cancel_by_carepartner(bk, 'health',
                          note='Bệnh đột xuất có giấy nhập viện đầy đủ lần '
                               f'thu {i + 1}')
    led = EloLedger.objects.filter(carepartner=cp_fm3, booking=bk,
                                   delta__lt=0).order_by('-created_at').first()
    fm_deltas.append(led.delta if led else None)
check(9, 'FM lần 3 trong 30 ngày → phạt ĐẦY ĐỦ (-15, không ×0.5; lần 1,2 bị '
         'giảm còn -7)',
      fm_deltas[:2] == [-7, -7] and fm_deltas[2] == -15,
      f'deltas 3 lần FM = {fm_deltas}')

# ── #10 Decay: penalty 100 ngày → ×0.25; 200 ngày → bỏ qua ──
now_d = tz.now()
# CP1: -100 cách 100 ngày → decay ×0.25 → effective = 1200 - 25 = 1175
cp_dec1 = make_cp('decay1')
profile_d1 = EloService.get_profile(cp_dec1)
EloLedger.objects.create(carepartner=cp_dec1, delta=-100, reason_code='T2',
                         elo_before=1200, elo_after=1100)
EloLedger.objects.filter(carepartner=cp_dec1, delta=-100).update(
    created_at=now_d - timedelta(days=100))
eff100, _ = EloService.recompute(profile_d1, now=now_d)
# CP2: -100 cách 200 ngày → decay ×0.00 → effective = 1200
cp_dec2 = make_cp('decay2')
profile_d2 = EloService.get_profile(cp_dec2)
EloLedger.objects.create(carepartner=cp_dec2, delta=-100, reason_code='T2',
                         elo_before=1200, elo_after=1100)
EloLedger.objects.filter(carepartner=cp_dec2, delta=-100).update(
    created_at=now_d - timedelta(days=200))
eff200, _ = EloService.recompute(profile_d2, now=now_d)
check(10, 'Decay penalty: -100 cách 100 ngày → effective -25; cách 200 ngày → 0',
      abs((1200 - 25) - eff100) < 0.11 and abs(1200 - eff200) < 0.11,
      f'eff@100d={eff100} (kỳ vọng 1175), eff@200d={eff200} (kỳ vọng 1200)')

# ── #11 Cooldown: reward 3 ngày sau T5 → chỉ tính 50% ──
cp_cool = make_cp('cooldown')
profile_cool = EloService.get_profile(cp_cool)
now_c = tz.now()
EloLedger.objects.create(carepartner=cp_cool, delta=-150, reason_code='T5',
                         elo_before=1200, elo_after=1050)
EloLedger.objects.create(carepartner=cp_cool, delta=+10, reason_code='review_5',
                         elo_before=1050, elo_after=1060)
EloLedger.objects.filter(carepartner=cp_cool, delta=10).update(
    created_at=now_c - timedelta(days=3))
eff_c, _ = EloService.recompute(profile_cool, now=now_c)
# effective = 1200 -150×1.0 + 10×0.5 = 1055
check(11, 'Cooldown 7 ngày sau T5: reward +10 chỉ tính 50% → effective 1055',
      abs(1055.0 - eff_c) < 0.11, f'effective={eff_c} (kỳ vọng 1055.0)')

# ── #12 Blackout trùng ngày có booking → 409 ──
cp_blk = make_cp('blackout')
add_avail(cp_blk, WEEKDAY_MON, dtime(0, 0), dtime(23, 59))
job_blk = make_job(parent, MON, (7, 0), (8, 0))
select_carepartner(job_blk, cp_blk)
conflict_raised = False
try:
    create_blackout(cp_blk, MON, reason='personal')
except BlackoutConflictError:
    conflict_raised = True
check(12, 'Blackout trùng ngày có booking → BlackoutConflictError (API 409)',
      conflict_raised)

# ── #13 Xóa availability window đang có booking → 409 ──
window_locked = CarePartnerAvailability.objects.get(
    carepartner=cp_blk, weekday=WEEKDAY_MON, time_from=dtime(0, 0))
allowed, locked_booking = can_delete_window(window_locked)
check(13, 'Xóa khung lịch rảnh đang có booking → chặn (409 '
          'availability_locked_by_booking)',
      allowed is False and locked_booking is not None,
      f'allowed={allowed}, booking={str(locked_booking.pk)[:8]}…')

# ── #14 Replacement re-run loại CP bị hủy + band blocked ──
cp_cancel = make_cp('cancelled', elo=1200)
cp_good = make_cp('good14', elo=1300)
cp_blocked = make_cp('blocked14', elo=500)
for cp in (cp_cancel, cp_good, cp_blocked):
    add_avail(cp, WEEKDAY_MON, dtime(18, 0), dtime(22, 0))
job_re = make_job(parent, MON, (19, 0), (21, 0))
booking_re, _c = select_carepartner(job_re, cp_cancel)
booking_re.status = 'committed'
booking_re.save(update_fields=['status'])
cancel_by_carepartner(booking_re, 'personal', note='')
result_re = matching_service.find_candidates(
    job_re, exclude_carepartners=[cp_cancel.pk])
ids = [c['carepartner_id'] for c in result_re['candidates']]
check(14, 'Replacement re-run: loại CP vừa hủy + band blocked; còn CP tốt',
      str(cp_cancel.pk) not in ids and str(cp_blocked.pk) not in ids
      and str(cp_good.pk) in ids,
      f'candidates={len(ids)} (good in: {str(cp_good.pk) in ids}, '
      f'cancelled out: {str(cp_cancel.pk) not in ids}, '
      f'blocked out: {str(cp_blocked.pk) not in ids})')

# ── #15 KHÔNG serializer nào lộ hidden_elo / effective_elo ──
import glob  # noqa: E402
leaks = []
for path in (glob.glob(os.path.join(BASE, 'matching', 'serializers.py')) +
             glob.glob(os.path.join(BASE, 'matching', 'api', '*.py'))):
    src = open(path, encoding='utf-8').read()
    for field in ('hidden_elo', 'effective_elo'):
        if field in src:
            leaks.append(f'{os.path.basename(path)}:{field}')
check(15, 'Không serializer/API nào expose hidden_elo hay effective_elo',
      not leaks, 'leaks: ' + (', '.join(leaks) if leaks else 'không có'))

# ════════════════ Tổng kết ════════════════
passed = sum(1 for r in RESULTS if r[2] == 'PASS')
print()
print(f'═══ G13: {passed}/{len(RESULTS)} assertion PASS ═══')
sys.exit(0 if passed == len(RESULTS) else 1)
