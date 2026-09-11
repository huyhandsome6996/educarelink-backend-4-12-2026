"""
matching/services/job_schema.py — Validate payload đăng việc theo 3 loại (Step 1).

Form fields NGUỒN: flow1-step1-parent-posting.md §A/B/C.
Gia sư cho phép môn KỸ NĂNG bất kỳ (MC, kỹ năng sống, đàn, vẽ...) —
KHÔNG bắt buộc môn phổ thông (master prompt rule 5).
"""

import datetime

from rest_framework.exceptions import ValidationError

# 5 nhóm tuổi trẻ chuẩn theo đặc tả Mục 2 + alias backward-compatibility
# (các key cũ under_3/preschool/primary/secondary/mixed vẫn hợp lệ để không
# gãy dữ liệu đã lưu trong DB và các test cũ).
CHILD_AGE_GROUPS = {
    # 5 mức chuẩn theo đặc tả Mục 2:
    '0_to_12_months': '0 - 12 tháng tuổi',
    '1_to_3_years': '1 - 3 tuổi',
    '3_to_6_years': '3 - 6 tuổi',
    '6_to_10_years': '6 - 10 tuổi',
    'over_10_years': 'Trên 10 tuổi',
    # Aliases tương thích ngược:
    'under_3': 'Dưới 3 tuổi',
    'preschool': 'Mầm non (3-6 tuổi)',
    'primary': 'Tiểu học (6-11 tuổi)',
    'secondary': 'THCS (11-15 tuổi)',
    'mixed': 'Nhiều độ tuổi',
}

# 7 việc chăm sóc trẻ chuẩn theo đặc tả Mục 2 + alias backward-compatibility
# (các key cũ feed/bath/study/play/sleep/transport vẫn hợp lệ).
CARE_DUTIES = {
    # 7 việc chuẩn theo đặc tả Mục 2:
    'general_care': 'Chăm sóc chung',
    'feeding': 'Cho ăn',
    'bathing': 'Tắm rửa',
    'sleep_monitoring': 'Trông ngủ',
    'play_activities': 'Vui chơi và tổ chức hoạt động',
    'homework_help': 'Hỗ trợ làm bài tập về nhà',
    'light_chores': 'Các việc nhẹ liên quan đến trẻ',
    # Aliases tương thích ngược:
    'feed': 'Cho ăn / bữa ăn',
    'bath': 'Tắm rửa / vệ sinh',
    'study': 'Hướng dẫn bài tập',
    'play': 'Chơi cùng bé',
    'sleep': 'Đưa bé ngủ',
    'transport': 'Đưa đón',
}

# 3 phương thức đưa đón trẻ theo đặc tả Mục 2
TRANSPORT_METHODS = {
    'walking': 'Đi bộ',
    'carepartner_vehicle': 'CarePartner tự có phương tiện',
    'parent_arranged': 'Phụ huynh sắp xếp phương tiện',
}

JOB_TYPES = ('tutoring', 'childcare', 'pickup')

# Định nghĩa field bắt buộc + optional theo từng loại (Step 1)
REQUIRED_BY_TYPE = {
    'tutoring': ['subject', 'specific_requirements', 'dates', 'time_from', 'time_to'],
    'childcare': ['child_age_group', 'number_of_children', 'care_duties',
                  'specific_requirements', 'dates', 'time_from', 'time_to'],
    'pickup': ['school_or_pickup_place_name', 'child_age_group', 'number_of_children',
               'pickup_dates', 'pickup_time_from', 'pickup_time_to',
               'destination_type', 'specific_requirements'],
}

OPTIONAL_BY_TYPE = {
    'tutoring': ['location_note'],
    'childcare': ['medical_allergy_notes', 'location_note'],
    'pickup': ['pickup_location_note', 'destination_note', 'transport_note',
               'transport_method'],
}


def _parse_date(value):
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value))
    except (TypeError, ValueError):
        raise ValidationError({'dates': f'Ngày không hợp lệ: {value!r} (định dạng YYYY-MM-DD).'})


def _parse_time(value):
    if isinstance(value, datetime.time):
        return value
    try:
        hh, mm = str(value).split(':')[:2]
        return datetime.time(int(hh), int(mm))
    except (TypeError, ValueError):
        raise ValidationError({'time': f'Giờ không hợp lệ: {value!r} (định dạng HH:MM).'})


def validate_job_payload(job_type, payload, user_role='parent'):
    """Validate toàn bộ payload tạo JobPost. Trả về dict đã chuẩn hóa.

    Raise ValidationError (400) với message tiếng Việt. KHÔNG cho loại khác
    3 loại job. Location (lat/lng) kiểm tra riêng ở serializer.
    """
    if job_type not in JOB_TYPES:
        raise ValidationError({'job_type': 'Chỉ hỗ trợ 3 loại: gia sư / trông trẻ / đón trẻ.'})
    if user_role != 'parent':
        raise ValidationError({'detail': 'Chỉ phụ huynh mới đăng được việc.'})

    payload = payload or {}
    errors = {}
    clean = {}

    # Tự động điền specific_requirements mặc định nếu phụ huynh để trống
    req = str(payload.get('specific_requirements') or '').strip()
    if not req:
        if job_type == 'tutoring':
            subj = str(payload.get('subject') or 'học tập').strip()
            req = f'Dạy kèm môn {subj}, hướng dẫn bài tập và hỗ trợ bé học tập.'
        elif job_type == 'childcare':
            req = 'Chăm sóc, vui chơi và đảm bảo an toàn cho bé.'
        elif job_type == 'pickup':
            req = 'Đưa đón bé đúng giờ và đảm bảo an toàn giao thông.'
        payload['specific_requirements'] = req

    # ── Field bắt buộc riêng từng loại ──
    for field in REQUIRED_BY_TYPE[job_type]:
        value = payload.get(field)
        if value in (None, '', []):
            errors[field] = 'Trường này là bắt buộc.'
            continue
        clean[field] = value

    if errors:
        raise ValidationError(errors)

    # ── Chuẩn hóa theo loại ──
    if job_type == 'tutoring':
        # Môn học là TEXT tự do — chấp nhận kỹ năng (MC, kỹ năng sống, đàn, vẽ...)
        clean['subject'] = str(clean['subject']).strip()
        if len(clean['subject']) < 2:
            errors['subject'] = 'Môn học/kỹ năng cần ít nhất 2 ký tự.'

    if job_type in ('childcare', 'pickup'):
        if clean.get('child_age_group') not in CHILD_AGE_GROUPS:
            errors['child_age_group'] = 'Chọn độ tuổi của trẻ.'
        try:
            n = int(clean.get('number_of_children', 0))
            if n < 1:
                raise ValueError
            clean['number_of_children'] = n
        except (TypeError, ValueError):
            errors['number_of_children'] = 'Số lượng trẻ phải là số nguyên >= 1.'
        if job_type == 'childcare':
            duties = clean.get('care_duties') or []
            if not isinstance(duties, list) or not duties:
                errors['care_duties'] = 'Chọn ít nhất 1 công việc chăm sóc.'
            else:
                bad = [d for d in duties if d not in CARE_DUTIES]
                if bad:
                    errors['care_duties'] = f'Công việc không hợp lệ: {bad}'
                else:
                    clean['care_duties'] = duties

    if job_type == 'pickup':
        if clean.get('destination_type') not in ('parent_home', 'other_address'):
            errors['destination_type'] = 'Chọn điểm đến: về nhà hoặc địa chỉ khác.'
        if clean['destination_type'] == 'other_address' and not payload.get('destination_location'):
            errors['destination_location'] = 'Cần vị trí điểm đến trên bản đồ.'
        else:
            clean['destination_location'] = payload.get('destination_location')

        # Kiểm tra transport_method nếu có gửi lên (đặc tả Mục 2 — 3 lựa chọn)
        transport_method = payload.get('transport_method')
        if transport_method and transport_method not in TRANSPORT_METHODS:
            errors['transport_method'] = 'Phương thức di chuyển không hợp lệ.'
        elif transport_method:
            clean['transport_method'] = transport_method

    if errors:
        raise ValidationError(errors)

    # ── Dates + times ──
    date_key = 'pickup_dates' if job_type == 'pickup' else 'dates'
    time_from_key = 'pickup_time_from' if job_type == 'pickup' else 'time_from'
    time_to_key = 'pickup_time_to' if job_type == 'pickup' else 'time_to'

    dates_raw = clean.pop(date_key)
    if not isinstance(dates_raw, list):
        dates_raw = [dates_raw]
    dates = sorted({_parse_date(d) for d in dates_raw})
    from django.utils import timezone
    today = timezone.localdate()

    # Khắc phục độ lệch múi giờ (UTC vs GMT+7): nếu client gửi ngày hôm qua (do toISOString),
    # tự động chuẩn hóa về ngày hôm nay để tránh từ chối nhầm yêu cầu đăng bài
    yesterday = today - datetime.timedelta(days=1)
    normalized_dates = []
    for d in dates:
        if d == yesterday:
            normalized_dates.append(today)
        else:
            normalized_dates.append(d)
    dates = sorted(set(normalized_dates))

    past = [d for d in dates if d < today]
    if past:
        raise ValidationError({date_key: f'Không được chọn ngày trong quá khứ: {past[0]}.'})

    clean['_dates'] = [d.isoformat() for d in dates]
    clean['time_from'] = _parse_time(clean.pop(time_from_key)).strftime('%H:%M')
    clean['time_to'] = _parse_time(clean.pop(time_to_key)).strftime('%H:%M')
    if clean['time_to'] <= clean['time_from']:
        raise ValidationError({'time_to': 'Giờ kết thúc phải sau giờ bắt đầu.'})

    # ── Recurrence (tùy chọn) ──
    recurrence = payload.get('recurrence') or {}
    if recurrence:
        pattern = recurrence.get('pattern')
        if pattern == 'weekly':
            weekdays = recurrence.get('weekdays') or []
            if not all(isinstance(w, int) and 0 <= w <= 6 for w in weekdays):
                raise ValidationError({'recurrence': 'weekdays phải là list số 0-6 (0=Thứ Hai).'})
            if not recurrence.get('until'):
                raise ValidationError({'recurrence': 'Cần ngày kết thúc lặp (until).'})
            clean['recurrence'] = {'pattern': 'weekly',
                                   'weekdays': weekdays,
                                   'until': str(_parse_date(recurrence['until']))}
        elif pattern:
            raise ValidationError({'recurrence': 'Chỉ hỗ trợ pattern "weekly" hoặc bỏ trống.'})
    else:
        clean['recurrence'] = {}

    # ── Location note / các field optional ──
    for field in OPTIONAL_BY_TYPE[job_type]:
        clean[field] = str(payload.get(field) or '').strip()

    # Điểm đón pickup → dùng như vị trí chính nếu chưa có
    if job_type == 'pickup' and payload.get('pickup_location'):
        clean['pickup_location'] = payload['pickup_location']

    return clean


def expand_slot_dates(type_data):
    """Tạo danh sách date từ dates + recurrence weekly (tối đa 12 tuần)."""
    from datetime import date as d, timedelta

    dates = {d.fromisoformat(x) for x in type_data['_dates']}
    recurrence = type_data.get('recurrence') or {}
    if recurrence.get('pattern') == 'weekly':
        until = d.fromisoformat(recurrence['until'])
        weekdays = set(recurrence['weekdays'])
        if not weekdays or until < max(dates, default=until):
            raise ValidationError({'recurrence': 'until phải sau các ngày đã chọn.'})
        cursor = max(dates)
        # sinh thêm các ngày lặp trong 12 tuần tới
        for _ in range(12 * 7):
            cursor += timedelta(days=1)
            if cursor > until:
                break
            if cursor.weekday() in weekdays:
                dates.add(cursor)
        # cộng thêm các weekday trước ngày đầu (trong tuần hiện tại → until)
        cursor = max(dates)
        while cursor.weekday() not in weekdays:
            cursor += timedelta(days=1)
        walker = cursor
        while walker <= until:
            if walker not in dates and walker.weekday() in weekdays:
                dates.add(walker)
            walker += timedelta(days=7)
    return sorted(dates)
