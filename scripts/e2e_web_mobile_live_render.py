#!/usr/bin/env python3
"""
e2e_web_mobile_live_render.py — KIỂM THỬ E2E ĐỒNG BỘ 2 CHIỀU WEB ↔ MOBILE
chạy TRỰC TIẾP trên môi trường Render production (HTTP thật + JWT thật).

Nguyên tắc: Web (fetch + Bearer) và Mobile (axios + Bearer) gọi CHUNG một
tập API /api/matching/* với CÙNG JWT từ POST /api/auth/login/. Script này
đóng vai 2 client riêng biệt:
  - WEB client   : JWT phụ huynh  (phuhuynh_test)  — như ung_vien.html/don.html
  - MOBILE client: JWT CarePartner (sinhvien_test) — như MyJobsScreen/JobAssignedModal
  - MOBILE client: JWT phụ huynh (cùng tài khoản đăng nhập trên 2 nền tảng)
                   — như MyTasksScreen getBookings({role:'parent'})

Kịch bản (map PROMPT_CODING_AGENT_KIEM_THU_DONG_BO_WEB_MOBILE.md PHẦN 4):
  S0  Kết nối Render + health
  S1  Đăng nhập 2 tài khoản qua /api/auth/login/ (cùng API cả 2 nền tảng)
  TC1 WEB → MOBILE : phụ huynh đăng việc Gia sư Toán tại Huế qua API →
      publish → candidates → chọn CarePartner → MOBILE (cùng JWT) phải thấy
      đơn ngay: parent list (MyTasksScreen) + worker feed (JobAssignedModal)
  TC2 MOBILE → WEB : CarePartner commit trên "mobile" → WEB phụ huynh F5
      phải thấy "Đã cam kết" (committed)
  TC3 ĐỔI LỊCH + HUỶ 2 CHIỀU : mobile xin đổi giờ → web thấy yêu cầu →
      web duyệt → mobile thấy khung mới → web huỷ → cả 2 phía thấy huỷ
  S10 Kiểm tra HỢP ĐỒNG JSON: field mà UI 2 bên render phải đầy đủ

Chạy:  python scripts/e2e_web_mobile_live_render.py
Hoặc:  EDUCARELINK_URL=http://127.0.0.1:8000 python scripts/e2e_web_mobile_live_render.py
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE_URL = os.environ.get(
    'EDUCARELINK_URL', 'https://educarelink-backend.onrender.com').rstrip('/')

PARENT_USER = os.environ.get('QA_PARENT_USER', 'phuhuynh_test')
PARENT_PASS = os.environ.get('QA_PARENT_PASS', 'Demo@2026')
WORKER_USER = os.environ.get('QA_WORKER_USER', 'sinhvien_test')
WORKER_PASS = os.environ.get('QA_WORKER_PASS', 'Demo@2026')

# Toạ độ trung tâm TP. Huế — địa bàn triển khai duy nhất của dự án
HUE_LAT, HUE_LNG = 16.4637, 107.5909

RESULTS = []
TIMINGS = []


def check(name, ok, detail=''):
    RESULTS.append((name, ok))
    mark = 'PASS' if ok else 'FAIL'
    print(f'  [{mark}] {name}' + (f' — {detail}' if detail else ''))
    return ok


def section(title):
    print(f'\n─── {title} ───')


def http(method, path, token=None, body=None, idem=None, timeout=35):
    """HTTP thật — y hệt cách Web fetch / Mobile axios gọi production."""
    req = urllib.request.Request(BASE_URL + path,
                                 data=json.dumps(body).encode()
                                 if body is not None else None,
                                 method=method)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Accept', 'application/json')
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    if idem:
        req.add_header('Idempotency-Key', idem)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode('utf-8')
            ms = (time.time() - t0) * 1000
            TIMINGS.append((f'{method} {path}', ms))
            # Trang HTML (landing/admin) → giữ raw; JSON API → parse
            try:
                parsed = json.loads(raw) if raw.strip() else {}
            except ValueError:
                parsed = {'_html': raw[:120]}
            return r.status, parsed, ms
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', errors='replace')
        ms = (time.time() - t0) * 1000
        TIMINGS.append((f'{method} {path}', ms))
        try:
            return e.code, json.loads(raw), ms
        except Exception:
            return e.code, {'_raw': raw[:300]}, ms
    except Exception as e:  # timeout, conn refused...
        TIMINGS.append((f'{method} {path}', (time.time() - t0) * 1000))
        return 0, {'_error': str(e)}, (time.time() - t0) * 1000


def login(username, password):
    """POST /api/auth/login/ — đúng endpoint Web form + Mobile AuthContext dùng."""
    for attempt in (1, 2):  # throttle 5/phút/IP → chờ 35s nếu 429
        st, body, ms = http('POST', '/api/auth/login/',
                            body={'username': username, 'password': password})
        if st == 200:
            tok = (body.get('tokens') or {}).get('access') or body.get('access')
            return tok, body.get('user_id'), ms
        if st == 429 and attempt == 1:
            print(f'  [WAIT] login throttle 429 — chờ 35 giây thử lại...')
            time.sleep(35)
            continue
        return None, None, ms
    return None, None, 0


def pick_weekdays(n_days=2, min_gap_days=1):
    """Chọn n ngày làm việc (T2–T6) trong tương lai — lịch rảnh seed của
    sinhvien_test phủ 17:00–21:30 ngày thường → ca 19:00–20:00 luôn hợp lệ."""
    out, d = [], datetime.date.today() + datetime.timedelta(days=2)
    while len(out) < n_days:
        if d.weekday() < 5:  # 0=T2 .. 4=T6
            out.append(d)
        d += datetime.timedelta(days=1)
    # đảm bảo 2 ngày cách nhau đủ xa (không đụng buffer 90' giữa ca)
    if len(out) == 2 and (out[1] - out[0]).days < min_gap_days:
        out[1] = out[0] + datetime.timedelta(days=7 - out[0].weekday()
                                             + out[1].weekday())
    return out


# ════════════════════════════ S0 — KẾT NỐI ════════════════════════════
section(f'S0 — Kết nối môi trường LIVE: {BASE_URL}')
st, body0, ms = http('GET', '/')
check('Render trả lời HTTP 200', st == 200,
      f'{ms:.0f} ms' + ('' if st == 200 else f' — {str(body0)[:200]}'))
if st != 200:  # Render free tier hay "ngủ đông" — đánh thức tối đa 90s
    print('  [WAIT] Render đang thức dậy (cold start) — thử lại trong 90 giây...')
    for _ in range(3):
        time.sleep(30)
        st, body0, ms = http('GET', '/')
        if st == 200:
            check('Render trả lời HTTP 200 (sau khi thức dậy)', True,
                  f'{ms:.0f} ms')
            break
if st != 200:
    print('KHÔNG kết nối được môi trường live — dừng.')
    sys.exit(1)

# ════════════════════════════ S1 — ĐĂNG NHẬP ════════════════════════════
section('S1 — Đăng nhập CÙNG một tài khoản lấy JWT (API chung Web & Mobile)')
web_tok, parent_id, ms1 = login(PARENT_USER, PARENT_PASS)
check(f'Web login phụ huynh "{PARENT_USER}" → JWT 200', bool(web_tok),
      f'{ms1:.0f} ms')
mob_tok, worker_id, ms2 = login(WORKER_USER, WORKER_PASS)
check(f'Mobile login CarePartner "{WORKER_USER}" → JWT 200', bool(mob_tok),
      f'{ms2:.0f} ms')
if not (web_tok and mob_tok):
    print('Không lấy được JWT — dừng. Kiểm tra lại tài khoản demo trên Render.')
    sys.exit(1)

# Cùng JWT phụ huynh dùng trên MOBILE (MyTasksScreen gọi getBookings)
mob_parent_tok = web_tok

# ═══════════════════ TC1 — WEB ĐĂNG VIỆC → MOBILE THẤY NGAY ═══════════════════
d1, d2 = pick_weekdays(2)
booking_id, job_id = None, None

for attempt, day in enumerate((d1, d1 + datetime.timedelta(days=7),
                               d1 + datetime.timedelta(days=14)), start=1):
    section(f'TC1[{attempt}] — WEB phụ huynh đăng việc Gia sư Toán tại Huế '
            f'({day:%a %d/%m})')
    st, job, _ = http('POST', '/api/matching/jobs/', token=web_tok, body={
        'job_type': 'tutoring', 'subject': 'Toán',
        'specific_requirements': f'QA đồng bộ 2 chiều — kèm bài tập lớp 5, '
                                 f'học tại nhà phường Vĩnh Ninh ({day:%d/%m})',
        'dates': [day.isoformat()], 'time_from': '19:00', 'time_to': '20:00',
        'latitude': HUE_LAT, 'longitude': HUE_LNG,
        'location_note': '12 Nguyễn Huệ, P. Vĩnh Ninh, TP. Huế',
        'hourly_rate_vnd': 120000,
    })
    if not check('WEB: POST /api/matching/jobs/ → 201', st == 201,
                 str(job)[:160]):
        continue
    jid = job['id']
    st, pub, _ = http('POST', f'/api/matching/jobs/{jid}/publish/',
                      token=web_tok)
    check('WEB: publish → ai_parsed', st == 200 and
          pub.get('status') == 'ai_parsed', str(pub)[:120])

    st, cands, ms_c = http('POST', '/api/matching/candidates/',
                           token=web_tok, body={'job_id': jid})
    lst = (cands.get('candidates') or []) if st == 200 else []
    check(f'WEB: POST /api/matching/candidates/ → 200 (<2000 ms)', st == 200,
          f'{ms_c:.0f} ms, {len(lst)} ứng viên, '
          f'total_matched={cands.get("total_matched")}')
    found = next((c for c in lst if str(c.get('carepartner_id')) ==
                  str(worker_id)), None)
    if not found:
        print(f'  [SKIP] {WORKER_USER} không trong danh sách ngày này '
              f'(slot có thể đã bị khoá bởi dữ liệu demo cũ) — thử ngày khác')
        continue
    check(f'MOBILE CP "{WORKER_USER}" xuất hiện trong ứng viên WEB '
          f'(điểm {found.get("match_score")}, '
          f'"{found.get("match_level_vi")}")', True)

    st, sel, _ = http('POST', f'/api/matching/jobs/{jid}/select-carepartner/',
                      token=web_tok, body={'carepartner_id': worker_id},
                      idem=f'qa-sync-{uuid.uuid4().hex[:10]}')
    ok = st in (200, 201) and sel.get('status') == 'awaiting_commitment'
    if check('WEB: chọn CarePartner → booking awaiting_commitment', ok,
             str(sel)[:160]):
        booking_id, job_id = sel['id'], jid
        break

if not booking_id:
    print('\nKHÔNG tạo được booking sau 3 lần thử — dừng.')
    sys.exit(1)

section('TC1 — MOBILE mở app bằng CÙNG tài khoản phải thấy đơn ngay')
# (a) Mobile PHU HUYNH — MyTasksScreen getBookings({role:'parent'})
st, bl, _ = http('GET', '/api/matching/bookings/?role=parent',
                 token=mob_parent_tok)
rows = bl.get('results', []) if st == 200 else []
row = next((b for b in rows if b['id'] == booking_id), None)
check('MOBILE (JWT phụ huynh): GET bookings?role=parent thấy đơn từ WEB',
      bool(row), f'{len(rows)} đơn trong list')
check('MOBILE: trạng thái đúng awaiting_commitment',
      bool(row) and row['status'] == 'awaiting_commitment',
      row.get('status_label_vi', '') if row else '')
check('MOBILE: đúng loại việc tutoring + địa chỉ Huế',
      bool(row) and row['job_type'] == 'tutoring' and
      'Huế' in ((row.get('location_info') or {}).get('address') or
                row.get('job_address') or ''),
      (row.get('location_info') or {}).get('address', '') if row else '')
# (b) Mobile CAREPARTNER — JobAssignedModal poll awaiting_commitment
st, wl, _ = http('GET', '/api/matching/bookings/?status=awaiting_commitment',
                 token=mob_tok)
wrows = wl.get('results', []) if st == 200 else []
check('MOBILE (JWT CarePartner): feed đơn chờ cam kết thấy đơn WEB vừa tạo',
      any(b['id'] == booking_id for b in wrows), f'{len(wrows)} đơn chờ')
# (c) Nguồn dữ liệu WEB "Việc của tôi"
st, jl, _ = http('GET', '/api/matching/jobs/', token=web_tok)
jrow = next((j for j in jl.get('results', []) if j['id'] == job_id), None)
check('WEB "Việc của tôi": GET /api/matching/jobs/ → has_booking=True',
      bool(jrow) and jrow.get('has_booking') is True,
      jrow.get('status_label_vi', '') if jrow else '')

# ═══════════════════ TC2 — MOBILE CAM KẾT → WEB THẤY "ĐÃ KHÓA LỊCH" ═══════════════════
section('TC2 — MOBILE CarePartner xác nhận cam kết → WEB phụ huynh F5')
st, cm, _ = http('POST', f'/api/matching/bookings/{booking_id}/commit/',
                 token=mob_tok)
check('MOBILE: POST commit → committed', st == 200 and
      cm.get('status') == 'committed', str(cm)[:120])
st, bl2, _ = http('GET', '/api/matching/bookings/?role=parent',
                  token=web_tok)
row2 = next((b for b in bl2.get('results', []) if b['id'] == booking_id),
            None)
check('WEB F5 "Việc của tôi": trạng thái chuyển committed', bool(row2) and
      row2['status'] == 'committed', row2.get('status_label_vi', '')
      if row2 else '')
st, det, _ = http('GET', f'/api/matching/bookings/{booking_id}/',
                  token=web_tok)
check('WEB trang /don/<id>/: GET detail → committed + đủ thông tin CP',
      st == 200 and det.get('status') == 'committed' and
      det.get('carepartner_info', {}).get('full_name'),
      det.get('carepartner_info', {}).get('full_name', '') if st == 200
      else str(det)[:120])

# ═══════════════════ TC3 — ĐỔI LỊCH + HUỶ ĐỒNG BỘ 2 CHIỀU ═══════════════════
section(f'TC3a — MOBILE xin đổi giờ → {d2:%a %d/%m} 19:30-21:00')
st, rs, _ = http('POST', f'/api/matching/bookings/{booking_id}/reschedule/',
                 token=mob_tok, body={
                     'date': d2.isoformat(), 'time_from': '19:30',
                     'time_to': '21:00',
                     'reason': 'QA sync — trùng lịch thi giữa kỳ'})
check('MOBILE: POST reschedule → 201', st == 201, str(rs)[:140])
st, bl3, _ = http('GET', '/api/matching/bookings/?role=parent',
                  token=web_tok)
row3 = next((b for b in bl3.get('results', []) if b['id'] == booking_id),
            None)
check('WEB: thấy đơn chuyển reschedule_requested + yêu cầu đổi giờ',
      bool(row3) and row3['status'] == 'reschedule_requested' and
      (row3.get('reschedule_request') or {}).get('new_date') ==
      d2.isoformat(),
      str(row3.get('reschedule_request'))[:120] if row3 else '')

section('TC3b — WEB phụ huynh DUYỆT đổi giờ → MOBILE thấy khung mới')
st, ap, _ = http('POST',
                 f'/api/matching/bookings/{booking_id}/reschedule/respond/',
                 token=web_tok, body={'decision': 'approve'})
check('WEB: POST reschedule/respond approve → 200', st == 200,
      str(ap)[:140])
st, det2, _ = http('GET', f'/api/matching/bookings/{booking_id}/',
                   token=mob_tok)
check('MOBILE: đơn committed trở lại, khung giờ mới ' + f'{d2} 19:30',
      st == 200 and det2.get('status') == 'committed' and
      (det2.get('first_slot') or {}).get('date') == d2.isoformat(),
      str(det2.get('first_slot'))[:120] if st == 200 else str(det2)[:120])
check('MOBILE: reschedule_request đã dọn sạch sau duyệt',
      st == 200 and det2.get('reschedule_request') is None)

section('TC3c — WEB phụ huynh HUỶ đơn → cả 2 phía thấy huỷ')
st, cx, _ = http('POST', f'/api/matching/bookings/{booking_id}/cancel-parent/',
                 token=web_tok, body={'note': 'QA sync — gia đình đổi kế hoạch'})
check('WEB: POST cancel-parent → 200', st == 200, str(cx)[:140])
st, bl4, _ = http('GET', '/api/matching/bookings/?role=parent',
                  token=web_tok)
w4 = next((b for b in bl4.get('results', []) if b['id'] == booking_id),
          None)
check('WEB: trạng thái cancelled_by_parent', bool(w4) and
      w4['status'] == 'cancelled_by_parent',
      w4.get('status_label_vi', '') if w4 else '')
st, det3, _ = http('GET', f'/api/matching/bookings/{booking_id}/',
                   token=mob_tok)
check('MOBILE: phía CarePartner cũng thấy cancelled_by_parent',
      st == 200 and det3.get('status') == 'cancelled_by_parent',
      det3.get('status', '') if st == 200 else str(det3)[:120])

# ═══════════════════ S10 — HỢP ĐỒNG JSON CHO UI 2 BÊN ═══════════════════
section('S10 — Hợp đồng JSON: field UI Web & Mobile render phải đầy đủ')
required = ['id', 'status', 'status_label_vi', 'job_title', 'job_type',
            'first_slot', 'total_value_vnd', 'carepartner_info']
missing = [k for k in required if k not in (det3 or {})]
check(f'Booking detail trả đủ {len(required)} field cho cả 2 UI',
      not missing, f'thiếu: {missing}' if missing else 'đầy đủ')
cp_info = (det3 or {}).get('carepartner_info') or {}
check('carepartner_info có full_name + school (UI hero card 2 bên)',
      'full_name' in cp_info and 'school' in cp_info,
      f"school={cp_info.get('school', '')!r}")
hue_ok = 'Huế' in str(cp_info.get('school', ''))
check('Trường CP thuộc Đại học Huế (địa bàn duy nhất)', hue_ok,
      cp_info.get('school', ''))

# ═══════════════════ TỔNG KẾT ════════════════════════════
n_pass = sum(1 for _, ok in RESULTS if ok)
print('\n' + '═' * 64)
print(f'═══ E2E WEB ↔ MOBILE LIVE: {n_pass}/{len(RESULTS)} assertion PASS ═══')
print('═' * 64)
print('\nThời gian phản hồi API (live Render):')
for name, ms in TIMINGS:
    bar = '●' * min(int(ms / 250) + 1, 12)
    slow = '  ⚠ >2000ms' if ms > 2000 else ''
    print(f'  {ms:7.0f} ms {bar:<12} {name}{slow}')
cand = [ms for name, ms in TIMINGS if '/candidates/' in name]
if cand:
    print(f'\n  → candidates API chậm nhất: {max(cand):.0f} ms '
          f'({"ĐẠT <2s" if max(cand) < 2000 else "VƯỢT 2s"})')
sys.exit(0 if n_pass == len(RESULTS) else 1)
