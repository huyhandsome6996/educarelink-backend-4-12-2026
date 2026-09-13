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

# ── Defect 3 (2026-09-13): khối lớp / độ tuổi của bé cho job GIA SƯ ──
# 4 mức chuẩn (IM brief Task 3). Lưu vào JobPost.type_data['child_grade_level'].
# Dữ liệu cũ tạo trước khi có field sẽ KHÔNG có key này → matching coi như
# "không giới hạn cấp học" (bỏ qua bonus/filter theo cấp học, không raise KeyError).
CHILD_GRADE_LEVELS = {
    'preschool_prep': 'Tiền tiểu học (4 - 6 tuổi)',
    'primary_grade_1_5': 'Tiểu học (Lớp 1 - 5)',
    'secondary_grade_6_9': 'THCS (Lớp 6 - 9)',
    'high_school_grade_10_12': 'THPT (Lớp 10 - 12)',
}

# ── Defect 3 (2026-09-13): ưu tiên độ tuổi gia sư (optional) ──
TUTOR_SENIORITY_PREFERENCES = {
    'student_year_1_2': 'Sinh viên năm 1-2',
    'student_year_3_4': 'Sinh viên năm 3-4 (Ưu tiên Sư phạm)',
    'graduate': 'Cử nhân / Đã tốt nghiệp',
    'no_preference': 'Không yêu cầu',
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
    # Defect 3: thêm child_grade_level + tutor_seniority_preference + subject_code + school_level + child_age
    'tutoring': ['location_note', 'child_grade_level', 'tutor_seniority_preference', 'child_age', 'school_level', 'subject_code'],
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

        # child_age validation: [6, 18]
        child_age = payload.get('child_age')
        if child_age not in (None, ''):
            try:
                age_int = int(child_age)
                if not (6 <= age_int <= 18):
                    errors['child_age'] = 'Tuổi của trẻ phải từ 6 đến 18.'
                else:
                    clean['child_age'] = age_int
            except (TypeError, ValueError):
                errors['child_age'] = 'Tuổi của trẻ phải là số nguyên từ 6 đến 18.'

        # subject_code validation: support list[str] or str
        subj_code = payload.get('subject_code')
        if subj_code not in (None, '', []):
            if isinstance(subj_code, list):
                clean['subject_code'] = [str(s).strip() for s in subj_code if str(s).strip()]
            elif isinstance(subj_code, str):
                clean['subject_code'] = str(subj_code).strip()
            else:
                errors['subject_code'] = 'Mã môn học không hợp lệ.'

        if payload.get('school_level'):
            clean['school_level'] = str(payload.get('school_level')).strip()
        if payload.get('tutor_seniority_preference'):
            seniority_raw = str(payload.get('tutor_seniority_preference')).strip()
            # Hotfix 2026-09-14: mobile gửi 'any' (label "Không yêu cầu") nhưng backend
            # chỉ nhận 'no_preference' → app 1.4.6 đăng việc tutoring luôn bị 400.
            # Chuẩn hóa alias cũ về giá trị chuẩn thay vì từ chối.
            if seniority_raw == 'any':
                seniority_raw = 'no_preference'
            clean['tutor_seniority_preference'] = seniority_raw

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

    t_from = _parse_time(clean['time_from'])
    t_to = _parse_time(clean['time_to'])
    duration_mins = (t_to.hour * 60 + t_to.minute) - (t_from.hour * 60 + t_from.minute)
    if job_type == 'tutoring' and duration_mins < 30:
        raise ValidationError({'time_to': 'Giờ kết thúc phải sau giờ bắt đầu ít nhất 30 phút.'})

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
        if field not in clean and field not in ('child_age', 'subject_code'):
            clean[field] = str(payload.get(field) or '').strip()

    # ── Defect 3: validate khối lớp + ưu tiên gia sư (chỉ tutoring, đều optional) ──
    if job_type == 'tutoring':
        grade_level = clean.get('child_grade_level')
        if grade_level and grade_level not in CHILD_GRADE_LEVELS:
            raise ValidationError({
                'child_grade_level': (f'Khối lớp không hợp lệ: {grade_level!r}. '
                                      f'Chọn 1 trong: {", ".join(CHILD_GRADE_LEVELS)}.')})
        seniority = clean.get('tutor_seniority_preference')
        if seniority and seniority not in TUTOR_SENIORITY_PREFERENCES:
            raise ValidationError({
                'tutor_seniority_preference': (f'Ưu tiên gia sư không hợp lệ: {seniority!r}. '
                                               f'Chọn 1 trong: {", ".join(TUTOR_SENIORITY_PREFERENCES)}.')})

    # Điểm đón pickup → dùng như vị trí chính nếu chưa có
    if job_type == 'pickup' and payload.get('pickup_location'):
        clean['pickup_location'] = payload['pickup_location']

    return clean


def expand_slot_dates(type_data):
    """Tạo danh sách date từ dates + recurrence weekly (tối đa 12 tuần)."""
    from datetime import date as d, timedelta

    raw_dates = type_data.get('_dates') or type_data.get('dates') or type_data.get('pickup_dates') or []
    dates = {d.fromisoformat(str(x)) for x in raw_dates if x}
    if not dates:
        return []
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
