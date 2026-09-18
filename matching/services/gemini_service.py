"""
matching/services/gemini_service.py — Tích hợp Gemini cho Flow ghép cặp (Step 11).

Nguyên tắc BẮT BUỘC (Step 11.1): Gemini làm nhiều việc nhất có thể NHƯNG
không bao giờ là nguồn sự thật duy nhất cho tiền/phạt/khóa tài khoản.
Matching KHÔNG BAO GIỜ bị chặn khi Gemini chết (rule-based fallback).

Bước parse (Step 11.3): structured output → validate schema → hỏng thì repair
retry 1 lần → hỏng nữa thì rule-based fallback, ai_parse_status = fallback.
Fields confidence < 0.6 → clarification_questions cho parent confirm.
"""

import json
import logging
import re
import time as _time

from django.utils import timezone

from performance.gemini_model import generate_content_with_fallback, get_preferred_gemini_model
from performance.gemini_pool import get_pooled_gemini_client

from ..models import AiCallLog, PromptTemplate

logger = logging.getLogger('educarelink.matching.gemini')

PROMPT_KEY = 'job_parse'
PROMPT_VERSION = 'v1'

# Keyword map rule-based (fallback khi Gemini chết / không có API key)
# QUY TẮC: Không có từ khóa < 4 ký tự (tránh false-positive substring match),
# ngoại trừ whitelist rõ ràng duy nhất: 'mc'.
SKILL_KEYWORDS = {
    'toan': ['toán', 'toan', 'math', 'đại số', 'dai so', 'hình học', 'hinh hoc', 'môn toán', 'mon toan'],
    'van': ['ngữ văn', 'ngu van', 'văn học', 'van hoc', 'literature', 'môn văn', 'mon van'],
    'tieng_viet': ['tiếng việt', 'tieng viet', 'tiengviet', 'môn tiếng việt', 'mon tieng viet'],
    'tu_nhien_xa_hoi': ['tự nhiên và xã hội', 'tu nhien va xa hoi', 'tự nhiên xã hội', 'tu nhien xa hoi', 'tnxh'],
    'tin_hoc_cong_nghe': ['tin học và công nghệ', 'tin hoc va cong nghe', 'tin học công nghệ', 'tin hoc cong nghe'],
    'tin_hoc': ['tin học', 'tin hoc', 'môn tin', 'mon tin', 'informatics', 'computer science'],
    'cong_nghe': ['công nghệ', 'cong nghe', 'môn công nghệ', 'mon cong nghe'],
    'giao_duc_cong_dan': ['giáo dục công dân', 'giao duc cong dan', 'môn gdcd', 'gdcd'],
    'khoa_hoc_tu_nhien': ['khoa học tự nhiên', 'khoa hoc tu nhien', 'khtn', 'môn khtn'],
    'lich_su_dia_ly': ['lịch sử và địa lý', 'lich su va dia ly', 'lịch sử địa lý', 'lich su dia ly'],
    'lich_su': ['lịch sử', 'lich su', 'môn lịch sử', 'mon lich su', 'môn sử', 'mon su', 'history'],
    'dia_ly': ['địa lý', 'dia ly', 'địa lí', 'dia li', 'môn địa', 'mon dia', 'geography'],
    'giao_duc_kinh_te_phap_luat': ['giáo dục kinh tế và pháp luật', 'giao duc kinh te va phap luat', 'kinh tế pháp luật', 'kinh te phap luat', 'gdkt&pl', 'gdktpl'],
    'am_nhac': ['âm nhạc', 'am nhac', 'môn âm nhạc', 'mon am nhac', 'môn nhạc', 'mon nhac', 'thanh nhạc', 'thanh nhac', 'music'],
    'luyen_chu_dep': ['luyện chữ', 'luyen chu', 'chữ đẹp', 'chu dep', 'rèn chữ', 'ren chu', 'viết chữ', 'viet chu', 'tập viết', 'tap viet'],
    'tieng_anh': ['tiếng anh', 'tieng anh', 'english', 'ielts', 'toeic', 'môn tiếng anh'],
    'ly': ['vật lý', 'vat ly', 'môn lý', 'mon ly'],
    'hoa': ['hóa học', 'hoa hoc', 'môn hóa', 'mon hoa'],
    'sinh': ['sinh học', 'sinh hoc', 'môn sinh', 'mon sinh'],
    'su_pham': ['sư phạm', 'su pham', 'giáo dục', 'giao duc'],
    'mam_non': ['mầm non', 'mam non', 'mẫu giáo', 'mau giao'],
    'trong_tre': ['trông trẻ', 'trong tre', 'chăm sóc trẻ', 'cham soc tre', 'giữ trẻ', 'giu tre'],
    'don_tre': ['đón trẻ', 'don tre', 'đưa đón', 'dua don', 'đón bé', 'don be'],
    'so_cap_cuu': ['sơ cấp cứu', 'so cap cuu', 'y tế', 'y te', 'an toàn'],
    'nau_an': ['nấu ăn', 'nau an', 'dinh dưỡng', 'dinh duong', 'ăn dặm', 'an dam'],
    'choi_cung_be': ['chơi cùng bé', 'choi cung be', 'hoạt náo', 'hoat nao', 'kể chuyện', 'ke chuyen'],
    'mc': ['mc', 'dẫn chương trình', 'dan chuong trinh'],
    'ky_nang_song': ['kỹ năng sống', 'ky nang song', 'soft skill'],
    'dan_piano': ['piano', 'đàn piano', 'dan piano', 'organ', 'đàn organ', 'dan organ', 'keyboard'],
    've': ['vẽ tranh', 've tranh', 'hội họa', 'hoi hoa', 'mỹ thuật', 'my thuat', 'dạy vẽ', 'day ve', 'học vẽ', 'hoc ve'],
    'tieu_hoc': ['tiểu học', 'tieu hoc', 'cấp 1', 'cap 1'],
    'lap_trinh': ['lập trình', 'lap trinh', 'scratch', 'stem', 'robotics', 'python'],
    'tieng_trung': ['tiếng trung', 'tieng trung', 'tiếng hoa', 'tieng hoa', 'hsk4', 'hsk5', 'hsk6'],
    'tieng_nhat': ['tiếng nhật', 'tieng nhat', 'jlpt'],
    'tieng_han': ['tiếng hàn', 'tieng han', 'topik'],
    'tieng_phap': ['tiếng pháp', 'tieng phap', 'delf', 'dalf'],
    'mua': ['múa đương đại', 'mua duong dai', 'dạy múa', 'day mua', 'học múa', 'hoc mua', 'múa bale', 'mua bale', 'khieu vu', 'khiêu vũ', 'ballet'],
    'boi_loi': ['bơi lội', 'boi loi', 'dạy bơi', 'day boi', 'học bơi', 'hoc boi'],
    'co_vua': ['cờ vua', 'co vua', 'chess'],
    'vo_thuat': ['võ thuật', 'vo thuat', 'karate', 'taekwondo', 'judo', 'vovinam'],
    'kien_nhan': ['kiên nhẫn', 'kien nhan', 'nhẫn nại', 'nhan nai'],
    'cham_soc_tre': ['chăm sóc trẻ', 'cham soc tre', 'trông trẻ', 'trong tre'],
    'da_uoi': ['đa uô~', 'gọi bé dậy'],
}
URGENCY_KEYWORDS = ['gấp', 'gap', 'ngay mai', 'ngày mai', 'hôm nay', 'hom nay', 'asap']
OFF_PLATFORM_KEYWORDS = ['trả tiền mặt', 'tra tien mat', 'chuyển khoản ngoài', 'chuyen khoan ngoai', 'ngoài app']
SENSITIVE_KEYWORDS = ['qua đêm', 'qua dem', 'ở lại đêm', 'o lai dem']
CHILD_KEYWORDS = ['bé', 'be ', 'trẻ', 'tre ', 'học sinh', 'hoc sinh', 'em nhỏ', 'em nho']

SAFETY_SEVERITY = {'low': 'low', 'medium': 'medium', 'high': 'high'}


def _extract_skills(text):
    text_l = (text or '').lower()
    skills = []
    for code, kws in SKILL_KEYWORDS.items():
        matched = False
        for kw in kws:
            kw_clean = kw.strip().lower()
            if not kw_clean:
                continue
            # Regex word boundary: không dính từ chữ liền kề để tránh false-positive substring
            pattern = rf'(?<!\w){re.escape(kw_clean)}(?!\w)'
            if re.search(pattern, text_l, re.IGNORECASE):
                matched = True
                break
        if matched:
            skills.append(code)
    return skills


def rule_based_parse(job):
    """Parser không AI — luôn chạy được (Step 11.2 #1 fallback)."""
    type_data = job.type_data or {}
    subject = str(type_data.get('subject') or job.title or '')
    full_text = ' '.join([job.title or '', subject, job.description or '', type_data.get('specific_requirements', '')])
    text_l = full_text.lower()

    safety_flags = []
    if any(kw in text_l for kw in CHILD_KEYWORDS):
        safety_flags.append('child_involved')
    if any(kw in text_l for kw in OFF_PLATFORM_KEYWORDS):
        safety_flags.append('off_platform_payment')
    if any(kw in text_l for kw in SENSITIVE_KEYWORDS):
        safety_flags.append('overnight_risk')

    severity = 'low'
    if 'off_platform_payment' in safety_flags or 'overnight_risk' in safety_flags:
        severity = 'high'
    elif safety_flags:
        severity = 'medium'

    extracted_skills = _extract_skills(full_text)
    type_subj_code = type_data.get('subject_code')
    if type_subj_code:
        if isinstance(type_subj_code, list):
            for code in type_subj_code:
                c = str(code).strip()
                if c and c not in extracted_skills:
                    extracted_skills.append(c)
        elif isinstance(type_subj_code, str):
            for code in [s.strip() for s in type_subj_code.split(',') if s.strip()]:
                if code and code not in extracted_skills:
                    extracted_skills.append(code)

    return {
        'job_type': job.job_type,  # AI/KIỂM TRA KHÔNG ĐƯỢC ĐÈ (Step 11.3)
        'title_vi': job.title or _auto_title(job, subject),
        'summary_vi': (job.description or subject)[:160],
        'required_skills': extracted_skills,
        'category_tags': extracted_skills,
        # Defect 3 (2026-09-13): passthrough khối lớp + ưu tiên gia sư từ type_data
        # (rule-based fallback không được làm mất thông tin phụ huynh đã chọn)
        'child_grade_level': (job.type_data or {}).get('child_grade_level') or None,
        'tutor_seniority_preference': (job.type_data or {}).get('tutor_seniority_preference') or None,
        'dates': type_data.get('_dates') or [],
        'recurrence': type_data.get('recurrence') or {},
        'time_from': type_data.get('time_from'),
        'time_to': type_data.get('time_to'),
        'hourly_rate_vnd': job.hourly_rate_vnd,
        'urgency': 'high' if any(kw in text_l for kw in URGENCY_KEYWORDS) else 'normal',
        'safety_flags': safety_flags,
        'safety_severity': severity,
        'needs_admin_review': severity == 'high',
        'gender_preference': None,
        'clarification_questions': [],
        'field_confidence': {'dates': 1.0, 'required_skills': 0.7 if subject else 0.4},
        'model_version': 'rule-based',
        'prompt_version': PROMPT_VERSION,
    }


def _auto_title(job, subject=''):
    type_data = getattr(job, 'type_data', None) or {}
    if getattr(job, 'job_type', '') == 'tutoring':
        subj = subject or type_data.get('subject') or 'Kèm học 1:1'
        return f"Gia sư {subj}".strip()[:80]
    elif getattr(job, 'job_type', '') == 'childcare':
        from .job_schema import CHILD_AGE_GROUPS
        age_group = type_data.get('child_age_group')
        age_str = CHILD_AGE_GROUPS.get(age_group, '')
        num = type_data.get('number_of_children', 1)
        age_part = f" ({age_str})" if age_str else ""
        return f"Trông {num} bé{age_part}".strip()[:80]
    elif getattr(job, 'job_type', '') == 'pickup':
        place = (
            type_data.get('school_or_pickup_place_name') or
            type_data.get('pickup_location_note') or
            'trường học'
        )
        num = type_data.get('number_of_children', 1)
        return f"Đón {num} bé tại {place}".strip()[:80]
    titles = {'tutoring': 'Gia sư', 'childcare': 'Trông trẻ', 'pickup': 'Đón trẻ'}
    return f"{titles.get(getattr(job, 'job_type', ''), 'Công việc')} {subject}".strip()[:80]


# JSON schema rút gọn của kết quả parse (Step 11.3)
RESPONSE_SCHEMA_KEYS = {
    'job_type', 'title_vi', 'summary_vi', 'required_skills', 'dates',
    'time_from', 'time_to', 'hourly_rate_vnd', 'urgency', 'safety_flags',
    'safety_severity', 'needs_admin_review', 'gender_preference',
    'clarification_questions', 'field_confidence',
    # Defect 3: khối lớp / độ tuổi + ưu tiên gia sư (optional — có thể null)
    'child_grade_level', 'tutor_seniority_preference',
}


def _validate_parse_result(raw):
    """Kiểm tra kết quả AI tối thiểu hợp lệ; trả (dict, errors)."""
    errors = []
    if not isinstance(raw, dict):
        return None, ['Kết quả không phải JSON object']
    if raw.get('urgency') not in (None, 'normal', 'high'):
        errors.append('urgency sai')
    if raw.get('safety_severity') not in (None, 'low', 'medium', 'high'):
        errors.append('safety_severity sai')
    if not isinstance(raw.get('required_skills') or [], list):
        errors.append('required_skills không phải list')
    if errors or not raw:
        return None, errors or ['Kết quả rỗng']
    return raw, []


def parse_job_post(job):
    """Parse 1 JobPost. Trả về (result_dict, ai_parse_status).

    Status: ok (AI 1 lần) | repaired (AI sau 1 retry) | fallback (rule-based).
    Mỗi lần gọi AI ghi 1 row AiCallLog (Step 11.8).
    """
    cache_key = f'matching:ai_parse:{job.pk}:{job.updated_at.timestamp():.0f}'
    from django.core.cache import cache
    cached = cache.get(cache_key)
    if cached is not None:
        return cached['result'], cached['status']

    result, status = _parse_with_gemini(job)
    if result is None:
        result = rule_based_parse(job)
        status = 'fallback'
    cache.set(cache_key, {'result': result, 'status': status}, 3600)
    return result, status


def _parse_with_gemini(job):
    """Trả (result|None, status) — None khi phải fallback."""
    tpl = PromptTemplate.objects.filter(key=PROMPT_KEY, is_active=True).order_by('-id').first()
    if tpl is None:
        return None, 'fallback'

    client = get_pooled_gemini_client()
    if client is None:
        return None, 'fallback'

    type_data = job.type_data or {}
    user_content = json.dumps({
        'job_type_chosen_by_parent': job.job_type,
        'type_data': type_data,
        'description': job.description,
        'hourly_rate_vnd': job.hourly_rate_vnd,
    }, ensure_ascii=False, default=str)

    system = tpl.body
    temperature = tpl.temperature
    max_tokens = tpl.max_output_tokens

    for attempt in (1, 2):  # 1 lần + 1 repair retry (Step 11.3)
        started = _time.time()
        try:
            repair_hint = ''
            if attempt == 2:
                repair_hint = ('\nLẦN TRƯỚC KẾT QUẢ SAI SCHEMA. Trả lại ĐÚNG JSON '
                               'object với đúng các key yêu cầu, không thêm chữ nào khác.')
            response = generate_content_with_fallback(
                client, contents=[user_content + repair_hint],
                system_instruction=system,
                temperature=temperature, max_output_tokens=max_tokens,
                disable_thinking=True)  # QA: tắt thinking — parse JSON nhanh 1-3s, tránh thinking ăn hết token trả text rỗng
        except Exception as exc:
            logger.warning('[Gemini] Parse lỗi lần %d: %s', attempt, exc)
            _log_call(tpl, 0, 0, _time.time() - started, 'error')
            # QA 2026-09-11: Gemini KHÔNG khả dụng (timeout/quota/network) thì
            # đừng thử lại — attempt 2 chỉ tốn thêm ~14s ngân sách rồi vẫn
            # fallback. Chỉ attempt 2 cho trường hợp SAI SCHEMA (repair) phía dưới.
            break

        latency = int((_time.time() - started) * 1000)
        try:
            text = response.text
            raw = json.loads(_strip_json_fence(text))
            parsed, errors = _validate_parse_result(raw)
            if parsed is None:
                _log_call(tpl, len(user_content), len(text or ''), latency, 'repaired' if attempt == 1 else 'fallback')
                continue
            # AI KHÔNG ĐƯỢC ĐÈ job_type parent chọn (Step 11.3)
            parsed['job_type'] = job.job_type
            # Gender guardrail: tutoring bỏ qua (Step 11.4)
            if parsed.get('gender_preference') and job.job_type == 'tutoring':
                parsed['gender_preference'] = None
            # Fields confidence < 0.6 → clarification questions
            questions = parsed.get('clarification_questions') or []
            for field, conf in (parsed.get('field_confidence') or {}).items():
                if isinstance(conf, (int, float)) and conf < 0.6:
                    questions.append(f'Hãy xác nhận lại "{field}" trong bài đăng của bạn.')
            parsed['clarification_questions'] = questions[:5]
            parsed['model_version'] = get_preferred_gemini_model()
            parsed['prompt_version'] = PROMPT_VERSION
            status = 'ok' if attempt == 1 else 'repaired'
            _log_call(tpl, len(user_content), len(text or ''), latency, status)
            return parsed, status
        except (json.JSONDecodeError, AttributeError, TypeError) as exc:
            logger.warning('[Gemini] Parse JSON hỏng lần %d: %s', attempt, exc)
            _log_call(tpl, len(user_content), 0, latency, 'repaired' if attempt == 1 else 'fallback')
            continue

    return None, 'fallback'


def _strip_json_fence(text):
    text = (text or '').strip()
    text = re.sub(r'^```(json)?', '', text).strip()
    text = re.sub(r'```$', '', text).strip()
    return text


def _log_call(tpl, tokens_in, tokens_out, seconds, status):
    try:
        AiCallLog.objects.create(
            prompt_key=tpl.key, prompt_version=tpl.version,
            model=get_preferred_gemini_model(),
            tokens_in=tokens_in or 0, tokens_out=tokens_out or 0,
            latency_ms=int(seconds * 1000) if seconds else 0,
            status=status)
    except Exception:
        logger.exception('[Gemini] Ghi AiCallLog lỗi')


def seed_default_prompt_template():
    """Tạo PromptTemplate mặc định cho parse (gọi từ seed hoặc lần chạy đầu)."""
    PromptTemplate.objects.update_or_create(
        key=PROMPT_KEY, version=PROMPT_VERSION,
        defaults=dict(
            body=(
                'Bạn là trợ lý đọc bài đăng việc chăm sóc trẻ/gia sư trên nền tảng '
                'EduCareLink (Việt Nam). Hãy phân tích payload JSON đầu vào và trả về '
                'CHÍNH XÁC MỘT JSON object (không markdown, không giải thích) với các key: '
                'job_type (giữ nguyên giá trị đầu vào - KHÔNG được đổi), title_vi, summary_vi, '
                'required_skills (list code kỹ năng: toan, van, tieng_anh, ly, hoa, sinh, '
                'su_pham, mc, ky_nang_song, dan_piano, ve, tieu_hoc, kien_nhan, cham_soc_tre), '
                'category_tags (list), '
                'child_grade_level (1 trong: preschool_prep|primary_grade_1_5|secondary_grade_6_9|'
                'high_school_grade_10_12|null — suy từ mô tả nếu có), '
                'tutor_seniority_preference (student_year_1_2|student_year_3_4|graduate|no_preference|null), '
                'dates (list YYYY-MM-DD), recurrence (object hoặc {}), '
                'time_from, time_to, hourly_rate_vnd (int), urgency (normal|high), '
                'safety_flags (list: child_involved|off_platform_payment|overnight_risk|...), '
                'safety_severity (low|medium|high), needs_admin_review (bool), '
                'gender_preference (null|"female"|"male" - chỉ khi hợp lệ), '
                'clarification_questions (list câu hỏi làm rõ bằng tiếng Việt nếu thiếu thông tin), '
                'field_confidence (object field→0..1). '
                'Toàn bộ văn bản sinh ra phải tiếng Việt tự nhiên.'),
            variables=['job_type_chosen_by_parent', 'type_data', 'description'],
            model='gemini-2.5-flash-lite', temperature=0.1, max_output_tokens=1200,
            is_active=True),
    )


# ═══════════════════════════════════════════════════════════════════
# Task B (2026-09-14) — GEMINI RE-RANK top 20 → top 8
# (spec 2.2.4 / 11.2 task 8)
# ═══════════════════════════════════════════════════════════════════

RERANK_PROMPT_KEY = 'candidate_rerank'
RERANK_PROMPT_VERSION = 'v1'
# QA 2026-09-18 (màn hình trắng /ung-vien/): hard cap 1.5s — Gemini chậm/quota
# KHÔNG ĐƯỢC làm nghẽn luồng đồng bộ candidates. Quá hạn → bỏ ngay, trả thứ
# tự rule-based nguyên bản (KHÔNG retry — mọi retry đều nằm ngoài ngân sách).
RERANK_TIMEOUT_S = 1.5


def rerank_candidates(job, candidates):
    """Sắp lại thứ tự ứng viên bằng Gemini ngữ nghĩa (CHỈ REORDER, KHÔNG drop).

    Input: job + list candidate dict do rule-engine chọn (tối đa ~20).
    Output: (ordered_list, why_map) — ordered_list là HOÁN VỊ của input (đủ
    số lượng, không mất ai), why_map: {carepartner_id: 'why_recommended_vi'}.

    Bảo đảm tuyệt đối:
      - KHÔNG AI bị drop khỏi pool (nếu Gemini trả thiếu → phần còn lại ghép
        theo thứ tự rule cũ ở cuối).
      - KHÔNG lộ ELO / hidden_elo cho AI (chỉ dữ liệu công khai).
      - Timeout 2.5s — quá hạn / lỗi / không có key → giữ thứ tự rule.
      - Matching KHÔNG bao giờ chết vì AI (mọi exception nuốt + log).
      - Mỗi lần gọi AI ghi 1 row AiCallLog (prompt_key='candidate_rerank').
    """
    ids = [c['carepartner_id'] for c in candidates]
    id_set = set(ids)
    client = get_pooled_gemini_client()
    if client is None:
        return None, {}

    payload = {
        'job': {
            'job_type': job.job_type,
            'title': job.title,
            'hourly_rate_vnd': job.hourly_rate_vnd,
            'required_skills': list((getattr(job, 'ai_parse_result', None) or {})
                                    .get('required_skills') or []),
        },
        # ẨN ELO — chỉ dữ liệu công khai PH đang thấy (spec 2.2.4)
        'candidates': [{
            'id': c['carepartner_id'],
            'name': c.get('display_name') or '',
            'school': c.get('school') or '',
            'major': c.get('major') or '',
            'skills': c.get('top_skills') or [],
            'rating': c.get('rating'),
            'completed_jobs': c.get('completed_jobs'),
            'distance_km': c.get('distance_km'),
            'availability_fit': c.get('availability_fit') or '',
            'latest_review': (c.get('latest_review') or '')[:120],
        } for c in candidates],
    }
    system = (
        'Bạn là trợ lý xếp hạng ứng viên cho nền tảng EduCareLink (Việt Nam). '
        'Dựa trên nhu cầu công việc, hãy xếp lại thứ tự các ứng viên: người phù hợp '
        'nhất (kỹ năng/chuyên ngành đúng môn, kinh nghiệm, đánh giá tốt, khoảng cách '
        'hợp lý) đứng trước. Trả về CHÍNH XÁC MỘT JSON object (không markdown, không '
        'giải thích) dạng: {"order": ["<id>", ...], "why": {"<id>": "<1 câu tiếng Việt '
        'tại sao ứng viên này phù hợp>"}}. BẮT BUỘC: order phải chứa ĐỦ MỌI id của '
        'danh sách đầu vào, không thêm id lạ, không bỏ id nào. Mỗi why là 1 câu '
        'tiếng Việt ngắn (tối đa 25 từ).'
    )

    started = _time.time()
    user_content = json.dumps(payload, ensure_ascii=False, default=str)
    tokens_in = len(user_content)
    try:
        from concurrent.futures import ThreadPoolExecutor

        def _call():
            return generate_content_with_fallback(
                client, contents=[user_content], system_instruction=system,
                temperature=0.1, max_output_tokens=1500, disable_thinking=True)

        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_call)
        try:
            response, _model_used = future.result(timeout=RERANK_TIMEOUT_S)
        except Exception:
            future.cancel()
            executor.shutdown(wait=False)
            _log_rerank_call(tokens_in, 0, int((_time.time() - started) * 1000), 'timeout')
            return None, {}
        executor.shutdown(wait=False)
    except Exception:
        _log_rerank_call(tokens_in, 0, int((_time.time() - started) * 1000), 'error')
        return None, {}

    latency = int((_time.time() - started) * 1000)
    try:
        text = response.text
        raw = json.loads(_strip_json_fence(text))
        order = [str(x) for x in (raw.get('order') or []) if str(x) in id_set]
        why_raw = raw.get('why') or {}
        why_map = {}
        if isinstance(why_raw, dict):
            for k, v in why_raw.items():
                k = str(k)
                if k in id_set and isinstance(v, str) and v.strip():
                    why_map[k] = v.strip()[:200]
        # ÉP HOÁN VỊ: id Gemini trả trước, phần còn lại ghép theo thứ tự rule
        # → KHÔNG BAO GIỜ drop người đã vào top 20 rule-based.
        seen = set(order)
        full_order = order + [i for i in ids if i not in seen]
        by_id = {c['carepartner_id']: c for c in candidates}
        ordered = [by_id[i] for i in full_order]
        _log_rerank_call(tokens_in, len(text or ''), latency, 'ok')
        return ordered, why_map
    except (json.JSONDecodeError, AttributeError, TypeError):
        _log_rerank_call(tokens_in, 0, latency, 'error')
        return None, {}


def _log_rerank_call(tokens_in, tokens_out, latency_ms, status):
    """AiCallLog cho re-rank — không có PromptTemplate DB, ghi trực tiếp."""
    try:
        AiCallLog.objects.create(
            prompt_key=RERANK_PROMPT_KEY, prompt_version=RERANK_PROMPT_VERSION,
            model=get_preferred_gemini_model(),
            tokens_in=tokens_in or 0, tokens_out=tokens_out or 0,
            latency_ms=latency_ms or 0, status=status)
    except Exception:
        logger.exception('[Gemini] Ghi AiCallLog (rerank) lỗi')
