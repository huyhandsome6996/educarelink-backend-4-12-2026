"""
matching/services/chatbot_engine.py — Nguồn sự thật chung cho AI Chatbot Flow 1/2.

Phục vụ 2 view trong core/views.py:
  - ChatbotAPIView (phụ huynh): đăng việc bằng ngôn ngữ tự nhiên + radar preview.
  - WorkerChatbotAPIView (CarePartner): co-pilot lịch + radar diagnostics + khai bận.

Nguyên tắc BẮT BUỘC (Architectural Migration Brief v2 — mục 2/3/4):
  1. CHỐNG GIẢ MẠO TAG: <MATCHING_JOB_JSON> / <BLACKOUT_ACTION_JSON> chỉ được
     parse từ output của Gemini (role model/assistant) — TUYỆT ĐỐI không parse
     từ tin nhắn người dùng. extract_tagged_json() chỉ được gọi với `ai_text`.
  2. DRAFT → XÁC NHẬN → PUBLISH: parse được JSON lần đầu → JobPost status='draft'
     (KHÔNG publish, KHÔNG thông báo cho CarePartner nào). Preview count chỉ ĐẾM
     (find_candidates top_n=0, không ghi CandidateProposal, không notify).
  3. IDEMPOTENT: nhiều lượt chat trong cùng phiên cập nhật CÙNG draft
     (ưu tiên draft_job_id client gửi lên; fallback = draft chatbot mới nhất
     của parent còn ở trạng thái draft trong cửa sổ CHATBOT_DRAFT_WINDOW_HOURS).
  4. TIMEZONE: mọi "ngày tương đối" do Gemini resolve nhờ system prompt chứa
     thời điểm hiện tại quy đổi Asia/Ho_Chi_Minh (TIME_ZONE settings).
  5. VALIDATE MỀM: JSON sai/thiếu field/enum sai/giá < 50k → câu hỏi làm rõ
     tiếng Việt, KHÔNG crash 500, KHÔNG lưu JobPost không hợp lệ.
  6. KHÔNG BỊA SỐ LIỆU: gợi ý "giờ vàng"/thu nhập chỉ được dùng số liệu thật
     từ radar_stats_for_carepartner(); thiếu dữ liệu → nói định tính.
"""

import json
import logging
import re
from datetime import datetime, timedelta

from django.utils import timezone

from ..constants import JobPostStatus
from ..models import JobPost
from ..services.job_schema import (
    CARE_DUTIES,
    CHILD_AGE_GROUPS,
    JOB_TYPES,
    TRANSPORT_METHODS,
)

logger = logging.getLogger('educarelink.chatbot.engine')

# Sàn giá/giờ theo brief mục 2.1 (>= 50.000đ) — áp ở lớp chatbot, không sửa DB.
MIN_HOURLY_RATE_VND = 50000
# Cửa sổ coi là "cùng phiên chat" khi client không gửi draft_job_id:
# draft chatbot của cùng parent được update_at trong khoảng này → update thay vì tạo mới.
CHATBOT_DRAFT_WINDOW_HOURS = 6

JOB_TAG = 'MATCHING_JOB_JSON'
BLACKOUT_TAG = 'BLACKOUT_ACTION_JSON'

WEEKDAY_VI = ['thứ Hai', 'thứ Ba', 'thứ Tư', 'thứ Năm',
              'thứ Sáu', 'thứ Bảy', 'Chủ Nhật']

# Trạng thái JobPost được tính là "đang tìm người" cho radar diagnostics
ACTIVE_JOB_STATUSES = (
    JobPostStatus.PUBLISHED,
    JobPostStatus.AI_PARSING,
    JobPostStatus.AI_PARSED,
    JobPostStatus.MATCHING,
    JobPostStatus.NEEDS_REPLACEMENT,
)


# ═══════════════════════════════════════════════════════════════════
# Thời gian (timezone Việt Nam)
# ═══════════════════════════════════════════════════════════════════
def now_vn():
    """Thời điểm hiện tại theo Asia/Ho_Chi_Minh (settings.TIME_ZONE)."""
    return timezone.localtime(timezone.now())


def vn_time_context():
    """Khối ngữ cảnh ngày giờ NHÚNG VÀO SYSTEM PROMPT mỗi lượt gọi (brief 2.3).

    Gemini dựa vào đây để resolve "tối thứ 3 tuần này", "chiều mai"... thành
    ngày tuyệt đối đúng múi giờ Việt Nam — không bị lệch UTC.
    """
    now = now_vn()
    tomorrow = now + timedelta(days=1)
    end_of_week = now + timedelta(days=(6 - now.weekday()))
    return (
        f"\nTHỜI ĐIỂM HIỆN TẠI (MÚI GIỜ VIỆT NAM Asia/Ho_Chi_Minh):\n"
        f"- Bây giờ: {now.strftime('%Y-%m-%d %H:%M')} — {WEEKDAY_VI[now.weekday()]}\n"
        f"- Hôm nay: {now.date().isoformat()} ({WEEKDAY_VI[now.weekday()]})\n"
        f"- Ngày mai: {tomorrow.date().isoformat()} ({WEEKDAY_VI[tomorrow.weekday()]})\n"
        f"- Chủ nhật tuần này: {(now + timedelta(days=(6 - now.weekday()))).date().isoformat()}\n"
        f"- Hôm nay là {WEEKDAY_VI[now.weekday()]}, còn {6 - now.weekday()} ngày nữa đến Chủ nhật "
        f"(cuối tuần này: {end_of_week.date().isoformat()})\n"
        f"- Tuần này = từ thứ Hai {now.date().isoformat()} đến Chủ nhật {end_of_week.date().isoformat()}; "
        f"'tuần sau' = 7 ngày kế tiếp sau Chủ nhật tuần này.\n"
        f"Khi người dùng nói ngày tương đối, bạn PHẢI tính ra ngày tuyệt đối "
        f"YYYY-MM-DD dựa trên thời điểm trên. Không được dùng mốc thời gian khác.\n"
    )


# ═══════════════════════════════════════════════════════════════════
# Trích xuất tag JSON — CHỈ dùng cho output của AI (chống giả mạo)
# ═══════════════════════════════════════════════════════════════════
def extract_tagged_json(text, tag):
    """Lấy JSON object từ khối <TAG>...</TAG> TRONG TEXT CỦA AI.

    Trả về (data|None, reason). Chỉ khớp object {...} đầu tiên trong khối tag.
    Caller PHẢI truyền text nguồn là output model (ai_text) — không bao giờ là
    tin nhắn người dùng (anti-forgery, brief mục 2.5 / 3.1).
    """
    if not text:
        return None, 'empty_text'
    m = re.search(rf'<{tag}>\s*(\{{.*?\}})\s*</{tag}>', text, re.DOTALL)
    if not m:
        return None, 'no_tag'
    raw = m.group(1).strip()
    # bỏ fence nếu AI lỡ bọc ```json
    raw = re.sub(r'^```(json)?', '', raw).strip()
    raw = re.sub(r'```$', '', raw).strip()
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None, 'bad_json'
    if not isinstance(data, dict):
        return None, 'not_object'
    return data, None


def remove_tag_blocks(text, tag):
    """Cắt khối <TAG>...</TAG> khỏi văn bản để hiển thị sạch cho người dùng."""
    if not text:
        return ''
    return re.sub(rf'<{tag}>.*?</{tag}>', '', text, flags=re.DOTALL).strip()


def is_echoed_from_user(ai_text, user_message, tag):
    """Phòng sâu anti-forgery (brief 2.5).

    Nếu AI chỉ ECHO lại nguyên khối JSON do người dùng tự gõ trong tin nhắn
    (cùng nội dung) → coi như giả mạo, không tạo dữ liệu. JSON do AI tổng hợp
    thật sẽ khác nội dung người dùng gửi.
    """
    mine, err = extract_tagged_json(user_message or '', tag)
    if mine is None:
        return False
    theirs, _ = extract_tagged_json(ai_text or '', tag)
    if theirs is None:
        return False

    def _norm(d):
        return json.dumps(d, sort_keys=True, ensure_ascii=False)

    return _norm(mine) == _norm(theirs)


# ═══════════════════════════════════════════════════════════════════
# Validate payload MATCHING_JOB_JSON (validate mềm — không crash)
# ═══════════════════════════════════════════════════════════════════
def _parse_rate(value):
    """Giá/giờ → int | None. Chấp nhận '120k', '120.000', '120000đ'..."""
    if value in (None, ''):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value)
    s = str(value).strip().lower()
    s = s.replace('đ', '').replace('vnd', '').replace('vnđ', '').strip()
    multiplier = 1
    if s.endswith('k'):
        multiplier = 1000
        s = s[:-1].strip()
    s = s.replace('.', '').replace(',', '').replace(' ', '')
    try:
        return int(float(s)) * multiplier
    except (ValueError, TypeError):
        return None


def _parse_dates(value, today):
    """List ngày ISO | None (sai định dạng). Trả (dates, errors)."""
    errors = []
    if value in (None, ''):
        return [], []
    if not isinstance(value, list):
        value = [value]
    dates = []
    for item in value:
        try:
            d = datetime.strptime(str(item).strip()[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            errors.append(f'Ngày "{item}" không đúng định dạng YYYY-MM-DD.')
            continue
        if d < today:
            errors.append(
                f'Ngày {d.isoformat()} đã qua rồi. Bạn giúp mình xác nhận lại ngày nhé?')
            continue
        dates.append(d)
    return sorted(set(dates)), errors


def _parse_time(value):
    """'19:00' / '19h' / '19h30' / '7'... → 'HH:MM' | None."""
    if value in (None, ''):
        return None
    s = str(value).strip().lower().replace('.', ':')
    m = re.match(r'^(\d{1,2}):(\d{1,2})$', s)
    if not m:
        m = re.match(r'^(\d{1,2})h(\d{1,2})?$', s)
        if not m:
            m = re.match(r'^(\d{1,2})$', s)
            if not m:
                return None
            hh, mm = int(m.group(1)), 0
        else:
            hh, mm = int(m.group(1)), int(m.group(2) or 0)
    else:
        hh, mm = int(m.group(1)), int(m.group(2))
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        return None
    return f'{hh:02d}:{mm:02d}'


def _fmt_vnd(n):
    """120000 → '120.000' (kiểu Việt Nam, dấu chấm)."""
    return f'{n:,}'.replace(',', '.')


def validate_matching_job_payload(data, now=None):
    """Validate JSON do Gemini xuất ra (brief 2.1 + 2.4).

    Trả về (clean, errors):
      clean  — dict chuẩn hoá (job_type, title, description, type_data,
               hourly_rate_vnd, location_text, gender_preference...)
      errors — list câu tiếng Việt để hỏi lại người dùng
    KHÔNG BAO GIỜ raise — mọi lỗi trả về dạng hội thoại.
    Việc thiếu toạ độ xử lý riêng ở view (client gửi lat/lng hoặc geocode).
    """
    now = now or now_vn()
    today = now.date()
    clean = {}
    errors = []

    # ── job_type ──
    job_type = str(data.get('job_type') or '').strip().lower()
    if job_type not in JOB_TYPES:
        return {}, [f'Loại công việc "{data.get("job_type")}" không thuộc 3 loại '
                    f'gia sư / trông trẻ / đón trẻ. Bạn muốn đăng loại nào vậy?']
    clean['job_type'] = job_type

    clean['title'] = str(data.get('title') or '').strip()[:255]
    clean['description'] = str(data.get('description') or '').strip()[:2000]
    clean['location_text'] = str(
        data.get('location_text') or data.get('location') or '').strip()[:255]

    # ── Giá/giờ (sàn 50k theo brief — thông báo mềm như mục 2.4) ──
    rate = _parse_rate(data.get('hourly_rate_vnd'))
    if rate is None:
        errors.append('Bạn cho mình biết mức giá mong muốn theo giờ (ví dụ 120.000đ/giờ) nhé.')
    elif rate < MIN_HOURLY_RATE_VND:
        errors.append(
            f'Mức giá {_fmt_vnd(rate)}đ/giờ hơi thấp so với mặt bằng chung — '
            f'giá phổ biến thường từ {_fmt_vnd(MIN_HOURLY_RATE_VND)}đ/giờ trở lên. '
            f'Bạn có muốn điều chỉnh không?')
    else:
        clean['hourly_rate_vnd'] = rate

    # ── type_data theo loại ──
    td = {}
    required = {}

    if job_type == 'tutoring':
        subject = str(data.get('subject') or '').strip()
        if len(subject) < 2:
            errors.append('Bạn muốn tìm gia sư môn gì / kỹ năng nào vậy?')
        else:
            td['subject'] = subject

    if job_type in ('childcare', 'pickup'):
        age = str(data.get('child_age_group') or '').strip()
        if age not in CHILD_AGE_GROUPS:
            errors.append('Bé nhà mình ở nhóm tuổi nào (0-12 tháng, 1-3 tuổi, '
                          '3-6 tuổi, 6-10 tuổi hay trên 10 tuổi)?')
        else:
            td['child_age_group'] = age
        try:
            n = int(data.get('number_of_children') or 0)
            if n < 1:
                raise ValueError
            td['number_of_children'] = n
        except (TypeError, ValueError):
            errors.append('Bạn có bao nhiêu bé cần chăm sóc/giúp đón?')

    if job_type == 'childcare':
        duties = data.get('care_duties') or []
        if isinstance(duties, str):
            duties = [duties]
        if not isinstance(duties, list) or not duties:
            errors.append('Bạn cần CarePartner hỗ trợ những việc gì (cho ăn, tắm rửa, '
                          'hỗ trợ bài tập, vui chơi...)?')
        else:
            bad = [d for d in duties if d not in CARE_DUTIES]
            if bad:
                errors.append('Một số việc bạn chọn chưa đúng danh mục: '
                              + ', '.join(map(str, bad)) + '. Bạn giúp mình chọn lại nhé?')
            else:
                td['care_duties'] = duties

    if job_type == 'pickup':
        place = str(data.get('school_or_pickup_place_name') or '').strip()
        if not place:
            errors.append('Bạn cho mình biết tên trường / địa điểm đón bé nhé.')
        else:
            td['school_or_pickup_place_name'] = place
        dest = str(data.get('destination_type') or '').strip()
        if dest and dest not in ('parent_home', 'other_address'):
            errors.append('Điểm đến của bé là về nhà hay địa chỉ khác?')
        elif dest:
            td['destination_type'] = dest
        transport = str(data.get('transport_method') or '').strip()
        if transport:
            if transport not in TRANSPORT_METHODS:
                errors.append('Phương thức đưa đón chọn một trong: đi bộ, '
                              'CarePartner tự có xe, hoặc phụ huynh sắp xếp phương tiện.')
            else:
                td['transport_method'] = transport

    # ── Ngày + giờ (resolve tương đối đã làm ở prompt; validate ở đây) ──
    date_key = 'pickup_dates' if job_type == 'pickup' else 'dates'
    dates, date_errors = _parse_dates(data.get(date_key), today)
    errors.extend(date_errors)
    if not date_errors and not dates:
        errors.append('Bạn muốn làm vào những ngày nào vậy?')
    time_from = _parse_time(data.get('time_from'))
    time_to = _parse_time(data.get('time_to'))
    if time_from is None or time_to is None:
        errors.append('Bạn cho mình biết khung giờ bắt đầu và kết thúc (ví dụ 18:00-20:00).')
    elif time_to <= time_from:
        errors.append('Giờ kết thúc cần sau giờ bắt đầu. Bạn xem lại giúp mình nhé.')
    else:
        td['time_from'] = time_from
        td['time_to'] = time_to
        td['_dates'] = [d.isoformat() for d in dates]
        td[date_key] = [d.isoformat() for d in dates]

    # specific_requirements: tự điền nếu trống (đồng bộ job_schema)
    req = str(data.get('specific_requirements') or '').strip()
    if not req:
        if job_type == 'tutoring':
            req = f'Dạy kèm môn {td.get("subject") or "học tập"}, hướng dẫn bài tập và hỗ trợ bé học tập.'
        elif job_type == 'childcare':
            req = 'Chăm sóc, vui chơi và đảm bảo an toàn cho bé.'
        else:
            req = 'Đưa đón bé đúng giờ và đảm bảo an toàn giao thông.'
    td['specific_requirements'] = req[:500]

    clean['type_data'] = td

    # ── Recurrence weekly (tuỳ chọn) ──
    recurrence = data.get('recurrence') or {}
    if isinstance(recurrence, dict) and recurrence.get('pattern') == 'weekly':
        weekdays = recurrence.get('weekdays') or []
        until = recurrence.get('until')
        if (all(isinstance(w, int) and 0 <= w <= 6 for w in weekdays)
                and until):
            clean['recurrence'] = {'pattern': 'weekly',
                                   'weekdays': weekdays, 'until': str(until)}

    # ── Giới tính (chỉ childcare/pickup; tutoring bỏ qua — Step 11.4) ──
    gender = str(data.get('gender_preference') or '').strip().lower()
    if gender in ('male', 'female', 'nam', 'nữ', 'nu'):
        gender = 'male' if gender in ('male', 'nam') else 'female'
        clean['gender_preference'] = '' if job_type == 'tutoring' else gender

    return clean, errors


# ═══════════════════════════════════════════════════════════════════
# Geocode địa chỉ (server-side qua proxy Nominatim — brief 2.4)
# ═══════════════════════════════════════════════════════════════════
def geocode_address(address_text):
    """Địa chỉ → (lat, lng, display_name) | None. Không raise."""
    if not address_text or len(str(address_text).strip()) < 4:
        return None
    try:
        from ..api.geocode import _cached_json, _nominatim
        import hashlib
        q = str(address_text).strip()
        key = 'geo:search:' + hashlib.md5(q.lower().encode()).hexdigest()
        results = _cached_json(key, lambda: _nominatim('/search', {
            'format': 'json', 'limit': 1, 'q': q, 'accept-language': 'vi',
        }))
        if results and isinstance(results, list):
            first = results[0]
            return (float(first['lat']), float(first['lon']),
                    first.get('display_name') or q)
    except Exception as exc:  # noqa: BLE001 — geocode fail phải mềm
        logger.warning('[ChatbotEngine] geocode fail cho %r: %s', address_text[:80], exc)
    return None


# ═══════════════════════════════════════════════════════════════════
# Draft JobPost — idempotent (brief 2.2)
# ═══════════════════════════════════════════════════════════════════
def initial_title_for(job_type, type_data):
    """Tiêu đề khởi tạo theo type_data (đồng bộ logic JobPostCreateAPIView)."""
    if job_type == 'tutoring':
        subj = type_data.get('subject') or 'Kèm học 1:1'
        return f'Gia sư {subj}'.strip()[:80]
    if job_type == 'childcare':
        age_str = CHILD_AGE_GROUPS.get(type_data.get('child_age_group'), '')
        num = type_data.get('number_of_children', 1)
        age_part = f' ({age_str})' if age_str else ''
        return f'Trông {num} bé{age_part}'.strip()[:80]
    if job_type == 'pickup':
        place = (type_data.get('school_or_pickup_place_name')
                 or type_data.get('pickup_location_note') or 'trường học')
        num = type_data.get('number_of_children', 1)
        return f'Đón {num} bé tại {place}'.strip()[:80]
    return 'Công việc mới'


def find_latest_chatbot_draft(parent):
    """Draft chatbot mới nhất của parent (còn draft) — dùng cho idempotency."""
    window_start = timezone.now() - timedelta(hours=CHATBOT_DRAFT_WINDOW_HOURS)
    return (JobPost.objects
            .filter(parent=parent,
                    status=JobPostStatus.DRAFT,
                    type_data__chatbot_draft=True,
                    updated_at__gte=window_start)
            .order_by('-updated_at')
            .first())


def upsert_draft_job(parent, clean, latitude=None, longitude=None,
                     location_display='', draft_job_id=None):
    """Tạo MỚI hoặc CẬP NHẬT draft chatbot (brief 2.2 điểm 3).

    Trả về (job, created). Draft đánh dấu type_data.chatbot_draft=True để
    không bao giờ đụng draft tạo từ form thường.
    """
    job = None
    if draft_job_id:
        candidate = (JobPost.objects
                     .filter(pk=draft_job_id, parent=parent,
                             status=JobPostStatus.DRAFT,
                             type_data__chatbot_draft=True)
                     .first())
        job = candidate
    if job is None:
        job = find_latest_chatbot_draft(parent)

    td = dict(clean.get('type_data') or {})
    td['chatbot_draft'] = True
    if location_display:
        td['location_display'] = location_display[:255]

    if job is not None:
        job.job_type = clean['job_type']
        job.title = clean.get('title') or initial_title_for(clean['job_type'], td)
        job.description = clean.get('description', '')
        job.type_data = td
        if clean.get('hourly_rate_vnd'):
            job.hourly_rate_vnd = clean['hourly_rate_vnd']
        job.recurrence = clean.get('recurrence') or {}
        job.gender_preference = clean.get('gender_preference') or ''
        job.ai_parse_status = ''
        job.ai_parse_result = {}
        job.clarification_questions = []
        job.total_matched = None
        if latitude is not None and longitude is not None:
            job.latitude = float(latitude)
            job.longitude = float(longitude)
        job.location_note = clean.get('location_text') or job.location_note or ''
        job.save()
        return job, False

    job = JobPost.objects.create(
        parent=parent,
        job_type=clean['job_type'],
        title=clean.get('title') or initial_title_for(clean['job_type'], td),
        description=clean.get('description', ''),
        type_data=td,
        hourly_rate_vnd=clean.get('hourly_rate_vnd') or MIN_HOURLY_RATE_VND,
        status=JobPostStatus.DRAFT,
        latitude=float(latitude) if latitude is not None else None,
        longitude=float(longitude) if longitude is not None else None,
        location_note=clean.get('location_text') or '',
        recurrence=clean.get('recurrence') or {},
        gender_preference=clean.get('gender_preference') or '',
    )
    return job, True


def slots_from_type_data(type_data):
    """Danh sách (date, time_from, time_to) từ type_data — KHÔNG tạo JobSlot row."""
    from datetime import datetime as dt
    td = type_data or {}
    raw_dates = td.get('_dates') or td.get('dates') or td.get('pickup_dates') or []
    tf, tt = td.get('time_from'), td.get('time_to')
    if not raw_dates or not tf or not tt:
        return []
    try:
        from datetime import time as dtime
        fh, fm = str(tf).split(':')[:2]
        th, tm = str(tt).split(':')[:2]
        start = dtime(int(fh), int(fm))
        end = dtime(int(th), int(tm))
        if start >= end:
            return []
        slots = []
        for raw in raw_dates:
            slots.append((dt.strptime(str(raw)[:10], '%Y-%m-%d').date(), start, end))
        return slots
    except (ValueError, TypeError):
        return []


def preview_match_count(job):
    """Đếm số CarePartner khớp draft — KHÔNG side effect (brief 2.2 điểm 1).

    find_candidates(top_n=0) chỉ tính total_matched, không ghi CandidateProposal,
    không gửi thông báo, không hiển thị job cho CarePartner nào.
    Trả None nếu lỗi (thiếu config...) — chatbot vẫn chạy, chỉ thiếu con số.
    """
    from .matching_service import find_candidates
    slots = slots_from_type_data(job.type_data)
    try:
        result = find_candidates(job, required_slots=slots, top_n=0)
        return result.get('total_matched')
    except Exception as exc:  # noqa: BLE001
        logger.warning('[ChatbotEngine] preview_match_count fail: %s', exc)
        return None


ZERO_MATCH_HINT = ('Hiện chưa có CarePartner phù hợp với khung giờ và bán kính này. '
                   'Bạn có muốn nới rộng bán kính, đổi khung giờ khác, hoặc tăng mức giá '
                   'để thu hút thêm CarePartner không?')


# ═══════════════════════════════════════════════════════════════════
# Radar diagnostics cho CarePartner (brief 3.1 + 3.3 — số liệu THẬT)
# ═══════════════════════════════════════════════════════════════════
def radar_stats_for_carepartner(user):
    """Số liệu thật cho co-pilot CarePartner. KHÔNG BAO GIỜ bịa số.

    Trả dict:
      has_data          — đủ dữ liệu để nêu số hay chỉ nói định tính
      radius_km         — bán kính đang dùng
      active_jobs_in_radius, top_demand_weekdays (theo slot thật),
      open_windows, future_blackouts, profile số đơn/đánh giá.
    """
    from ..models import (CarePartnerAvailability, CarePartnerBlackout,
                          CarePartnerProfile)
    from .matching_service import haversine_km

    profile, _ = (CarePartnerProfile.objects
                  .select_related('band').get_or_create(user=user))
    radius = profile.max_radius_km or 20

    jobs = list(JobPost.objects.filter(
        status__in=ACTIVE_JOB_STATUSES,
        latitude__isnull=False, longitude__isnull=False,
        parent__is_active=True,
    ).prefetch_related('slots')[:400])  # cap để không quét vô hạn

    in_radius = []
    for job in jobs:
        km = haversine_km(job.latitude, job.longitude, user.latitude, user.longitude)
        if km is not None and km <= max(radius, 35):
            in_radius.append(job)

    weekday_counter = {}
    for job in in_radius:
        for slot in job.slots.all():
            weekday_counter[slot.date.weekday()] = weekday_counter.get(slot.date.weekday(), 0) + 1
    top_demand = sorted(weekday_counter.items(), key=lambda kv: -kv[1])[:3]

    windows = CarePartnerAvailability.objects.filter(carepartner=user)
    blackouts = CarePartnerBlackout.objects.filter(
        carepartner=user, date__gte=timezone.localdate())

    return {
        'has_data': len(in_radius) > 0,
        'radius_km': radius,
        'active_jobs_in_radius': len(in_radius),
        'top_demand_weekdays': [
            {'weekday_vi': WEEKDAY_VI[wd], 'slots': n} for wd, n in top_demand
        ],
        'open_windows': windows.count(),
        'future_blackouts': blackouts.count(),
        'jobs_completed': profile.jobs_completed,
        'rating_avg': round(profile.rating_avg, 1),
        'review_count': profile.review_count,
        'matching_paused': profile.matching_paused,
    }


def radar_stats_prompt_block(stats):
    """Chuyển radar stats thành khối ngữ cảnh cho prompt (brief 3.3).

    Quy tắc chống bịa: chỉ cho phép AI nhắc CÁC SỐ CÓ TRONG KHỐI NÀY.
    Không đủ dữ liệu → yêu cầu nói định tính, tuyệt đối không nêu %.
    """
    if not stats or not stats.get('has_data'):
        return (
            '\nSỐ LIỆU THẬT HIỆN TẠI: chưa đủ dữ liệu việc trong bán kính của bạn.\n'
            'QUY TẮC: KHÔNG được nêu bất kỳ con số/% cụ thể nào về cơ hội ghép việc hay '
            'thu nhập — chỉ nói định tính (ví dụ "mở thêm khung giờ tối sẽ tăng khả năng '
            'được ghép việc").\n'
        )
    demand = '; '.join(
        f"{d['weekday_vi']}: {d['slots']} khung giờ đang cần"
        for d in stats['top_demand_weekdays']) or 'không có dữ liệu theo ngày'
    return (
        f"\nSỐ LIỆU THẬT (chỉ được dùng ĐÚNG các số này, không được bịa thêm số khác):\n"
        f"- Số bài đăng đang tìm CarePartner trong bán kính ~{stats['radius_km']}km: "
        f"{stats['active_jobs_in_radius']} bài.\n"
        f"- Nhu cầu theo ngày (tính từ slot thật): {demand}.\n"
        f"- Lịch rảnh bạn đã khai: {stats['open_windows']} khung giờ/tuần.\n"
        f"- Ngày bận đã khai trong tương lai: {stats['future_blackouts']} ngày.\n"
        f"- Bạn đã hoàn thành {stats['jobs_completed']} đơn, đánh giá trung bình "
        f"{stats['rating_avg']}/5 ({stats['review_count']} lượt).\n"
        f"QUY TẮC: Khi tư vấn 'giờ vàng'/cơ hội ghép việc, chỉ dẫn chiếu các con số trên. "
        f"Không được tự sinh % tăng cơ hội hay số tiền thu nhập không có trong dữ liệu.\n"
    )


# ═══════════════════════════════════════════════════════════════════
# Validate BLACKOUT_ACTION_JSON (brief 3.1 + 3.2)
# ═══════════════════════════════════════════════════════════════════
BLACKOUT_REASONS = ('exam', 'health', 'family', 'travel', 'personal', 'other')
BLACKOUT_REASON_LABELS = {
    'exam': 'Thi / kiểm tra', 'health': 'Sức khỏe', 'family': 'Việc gia đình',
    'travel': 'Đi xa', 'personal': 'Cá nhân', 'other': 'Khác',
}


def validate_blackout_action(data, now=None):
    """Validate blackout do AI trích xuất. Trả (clean, errors) — không raise.

    Brief 3.2: cấm ngày quá khứ (lệch timezone cũng bị chặn ở đây); reason
    phải thuộc 6 mã chuẩn; giờ tuỳ chọn (null = bận cả ngày).
    """
    now = now or now_vn()
    today = now.date()
    clean, errors = {}, []

    action = str(data.get('action') or 'create_blackout').strip()
    if action != 'create_blackout':
        return {}, [f'Hành động "{action}" chưa được hỗ trợ. Mình chỉ giúp bạn khai ngày bận nhé.']

    try:
        date = datetime.strptime(str(data.get('date'))[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return {}, ['Ngày bận không rõ (cần định dạng YYYY-MM-DD). Bạn nói lại giúp mình: '
                    'bận ngày nào vậy?']
    if date < today:
        errors.append(f'Ngày {date.isoformat()} đã qua rồi nên không thể khai bận. '
                      f'Bạn giúp mình xác nhận lại ngày nhé?')
    else:
        clean['date'] = date

    tf = _parse_time(data.get('time_from')) if data.get('time_from') else None
    tt = _parse_time(data.get('time_to')) if data.get('time_to') else None
    if (tf is None) != (tt is None):
        errors.append('Bạn muốn bận cả ngày hay khoảng giờ cụ thể (ví dụ 07:00-11:30)?')
    elif tf and tt and tf >= tt:
        errors.append('Giờ kết thúc cần sau giờ bắt đầu. Bạn xem lại giúp mình nhé.')
    else:
        clean['time_from'] = tf
        clean['time_to'] = tt

    reason = str(data.get('reason') or 'other').strip().lower()
    if reason not in BLACKOUT_REASONS:
        reason = 'other'
    clean['reason'] = reason
    clean['note'] = str(data.get('note') or '').strip()[:500]

    return clean, errors


def blackout_booking_conflict(user, date, time_from, time_to):
    """Kiểm tra trước (mềm) ngày bận có đụng booking active không → cảnh báo card."""
    from ..constants import BUSY_BOOKING_STATUSES
    from ..models import Booking

    for booking in Booking.objects.filter(
            carepartner=user, status__in=BUSY_BOOKING_STATUSES).distinct():
        for slot in booking.job.slots.filter(date=date):
            if time_from is None or _overlaps_slot(time_from, time_to,
                                                   slot.time_from, slot.time_to):
                return True
    return False


def _overlaps_slot(tf1, tt1, tf2, tt2):
    return tf1 < tt2 and tf2 < tt1


# ═══════════════════════════════════════════════════════════════════
# Lịch sử hội thoại
# ═══════════════════════════════════════════════════════════════════
def build_contents(user_message, chat_history=None):
    """Danh sách contents cho Gemini — chỉ nhận role user/model, tối đa 20 lượt."""
    contents = []
    if isinstance(chat_history, list):
        for msg in chat_history[-20:]:
            role = str(msg.get('role', ''))
            text = msg.get('text', '')
            if role in ('user', 'model') and text:
                contents.append({'role': role, 'parts': [{'text': text}]})
    contents.append({'role': 'user', 'parts': [{'text': user_message}]})
    return contents
