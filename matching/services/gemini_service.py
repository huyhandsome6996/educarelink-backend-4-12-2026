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
SKILL_KEYWORDS = {
    'toan': ['toan', 'math'],
    'van': ['van', 'ngu van', 'literature'],
    'tieng_anh': ['anh', 'english', 'tieng anh'],
    'ly': ['vat ly', 'ly'],
    'hoa': ['hoa hoc', 'hoa'],
    'sinh': ['sinh hoc', 'sinh'],
    'su_pham': ['su pham', 'sư phạm'],
    'mc': ['mc', 'mai múng', 'dẫn chương trình', 'dan chuong trinh'],
    'ky_nang_song': ['kỹ năng sống', 'ky nang song', 'soft skill'],
    'dan_piano': ['piano', 'đàn', 'dan'],
    've': ['vẽ', 've tranh', 'hội họa'],
    'tieu_hoc': ['tiểu học', 'tieu hoc', 'cấp 1'],
    'kien_nhan': ['kiên nhẫn', 'kien nhan', 'nhẫn nại'],
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
        if any(kw in text_l for kw in kws):
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

    return {
        'job_type': job.job_type,  # AI/KIỂM TRA KHÔNG ĐƯỢC ĐÈ (Step 11.3)
        'title_vi': job.title or _auto_title(job, subject),
        'summary_vi': (job.description or subject)[:160],
        'required_skills': _extract_skills(full_text),
        'category_tags': _extract_skills(full_text),
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


def _auto_title(job, subject):
    titles = {'tutoring': 'Gia sư', 'childcare': 'Trông trẻ', 'pickup': 'Đón trẻ'}
    return f"{titles.get(job.job_type, 'Công việc')} {subject}".strip()[:80]


# JSON schema rút gọn của kết quả parse (Step 11.3)
RESPONSE_SCHEMA_KEYS = {
    'job_type', 'title_vi', 'summary_vi', 'required_skills', 'dates',
    'time_from', 'time_to', 'hourly_rate_vnd', 'urgency', 'safety_flags',
    'safety_severity', 'needs_admin_review', 'gender_preference',
    'clarification_questions', 'field_confidence',
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
                'category_tags (list), dates (list YYYY-MM-DD), recurrence (object hoặc {}), '
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
