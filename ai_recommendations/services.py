"""
AI Recommendation Service — dùng Gemini để gợi ý việc + đánh giá ứng viên.

2 luồng:
1. WORKER recommendations:
   - Input: profile carepartner (bằng cấp, học lực, đánh giá, ai_profile_summary)
            + danh sách task đang mở
   - Output: list task được sắp xếp theo độ phù hợp + lý do AI gợi ý
   - KHÔNG xóa task không phù hợp, chỉ ĐẨY task phù hợp lên đầu

2. PARENT candidate recommendations:
   - Input: chi tiết task + danh sách ứng viên (profile, bằng cấp, đánh giá, sao)
   - Output: list ứng viên được xếp hạng + nhận xét AI cho từng người
   - Parent chỉ tham khảo, quyền quyết định vẫn là parent
"""

import logging
import json
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.core.cache import cache

logger = logging.getLogger('educarelink.ai_recommendations')

# Cache TTL — tránh spam Gemini API
CACHE_TTL_WORKER = 300  # 5 phút
CACHE_TTL_PARENT = 180  # 3 phút

# Cache key prefixes — dùng cho clear-cache endpoint
WORKER_CACHE_PREFIX = 'ai_rec_worker_'
PARENT_CACHE_PREFIX = 'ai_rec_parent_'


def build_worker_cache_key(worker_id, task_ids):
    """
    Build cache key cho worker recommendations — phải khớp đúng logic
    trong get_worker_recommendations() để clear-cache có thể xoá đúng key.

    Args:
        worker_id: int
        task_ids: iterable of int (sẽ được sort + hash)
    """
    sorted_ids = sorted(int(tid) for tid in task_ids)
    return f'{WORKER_CACHE_PREFIX}{worker_id}_{hash(tuple(sorted_ids))}'


def build_parent_cache_key(task_id, app_ids):
    """
    Build cache key cho parent candidate recommendations — phải khớp đúng logic
    trong get_candidate_recommendations() để clear-cache có thể xoá đúng key.

    Args:
        task_id: int
        app_ids: iterable of int (sẽ được sort + hash)
    """
    sorted_ids = sorted(int(aid) for aid in app_ids)
    return f'{PARENT_CACHE_PREFIX}{task_id}_{hash(tuple(sorted_ids))}'


def _get_gemini_client():
    """⚡ TỐI ƯU: dùng pooled singleton client thay vì init mỗi call."""
    try:
        from performance.gemini_pool import get_pooled_gemini_client
        return get_pooled_gemini_client(), None
    except ImportError:
        # Fallback: legacy init nếu performance module chưa sẵn sàng
        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return None, None
        try:
            from google import genai
            return genai.Client(api_key=gemini_key), None
        except Exception as e:
            logger.warning(f"Không thể khởi tạo Gemini client: {e}")
            return None, str(e)


def _safe_call_gemini(client, system_prompt, user_prompt, temperature=0.3, max_tokens=2048):
    """⚡ TỐI ƯU: dùng fallback chain thay vì hardcode model."""
    try:
        from performance.gemini_model import generate_content_with_fallback
        response, _ = generate_content_with_fallback(
            client,
            contents=[{'role': 'user', 'parts': [{'text': user_prompt}]}],
            system_instruction=system_prompt,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        return response.text
    except Exception as e:
        logger.warning(f"Gemini call failed: {e}")
        return None


def _parse_json_safe(text):
    """Parse JSON từ text có thể chứa markdown code blocks hoặc text thừa."""
    if not text:
        return None
    # Tìm JSON trong code block
    import re
    patterns = [
        r'```json\s*(.+?)\s*```',
        r'```\s*(.+?)\s*```',
        r'(\{.*\}|\[.*\])',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    # Thử parse trực tiếp
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ═══════════════════════════════════════════════════════════════════
#  1. WORKER RECOMMENDATIONS — gợi ý việc cho carepartner
# ═══════════════════════════════════════════════════════════════════

WORKER_SYSTEM_PROMPT = """Bạn là hệ thống gợi ý việc làm AI của EduCareLink — nền tảng kết nối phụ huynh với sinh viên/carepartner.

Nhiệm vụ: Đánh giá mức độ phù hợp của các công việc với hồ sơ carepartner, dựa trên:
- Bằng cấp, chứng chỉ (qualifications)
- Tóm tắt AI về carepartner (ai_profile_summary) nếu có
- Lịch sử đánh giá từ phụ huynh (số sao trung bình, nhận xét)
- Vị trí địa lý (khoảng cách tương đối)
- Mức giá

Quy tắc:
1. KHÔNG loại bỏ công việc nào — chỉ SẮP XẾP theo độ phù hợp (cao → thấp)
2. Với mỗi công việc, đưa ra:
   - match_score (0-100): điểm phù hợp
   - reason (1-2 câu): lý do tại sao phù hợp hoặc kém phù hợp
3. Trả về JSON hợp lệ theo format yêu cầu
4. Luôn dùng TIẾNG VIỆT, thân thiện, khách quan
5. Nếu carepartner chưa có bằng cấp/thông tin, vẫn gợi ý dựa trên ngữ cảnh (ví dụ: task đơn giản như dọn dẹp, mua sắm không cần bằng cấp)
"""


def get_worker_recommendations(worker, tasks_qs):
    """
    Gợi ý việc cho carepartner.

    Args:
        worker: User instance (role='worker')
        tasks_qs: QuerySet các task đang 'open' (chưa có ai apply hoặc worker chưa apply)

    Returns:
        dict: {
            'has_ai': bool,
            'recommendations': [{'task_id': int, 'match_score': int, 'reason': str}, ...],
            'cached': bool,
        }
    """
    tasks = list(tasks_qs)
    if not tasks:
        return {'has_ai': False, 'recommendations': [], 'cached': False, 'message': 'Không có việc nào để gợi ý.'}

    # Check cache
    task_ids = [t.id for t in tasks]
    cache_key = build_worker_cache_key(worker.id, task_ids)
    cached = cache.get(cache_key)
    if cached:
        cached['cached'] = True
        return cached

    client, err = _get_gemini_client()
    if not client:
        # Fallback: không có AI → trả task theo thứ tự cũ (created_at desc)
        return {
            'has_ai': False,
            'recommendations': [
                {'task_id': t.id, 'match_score': 50, 'reason': 'Chưa có AI gợi ý — hiển thị theo thời gian đăng.'}
                for t in tasks
            ],
            'cached': False,
            'message': 'AI chưa kích hoạt. Hiển thị theo thời gian đăng.',
        }

    # Build worker profile context
    worker_profile = _build_worker_profile(worker)
    tasks_context = _build_tasks_context(tasks)

    user_prompt = f"""Hồ sơ carepartner:
{worker_profile}

Danh sách công việc cần đánh giá (thứ tự random):
{tasks_context}

Hãy đánh giá mức độ phù hợp của MỖI công việc với carepartner trên.
Trả về JSON duy nhất theo format:
{{
  "recommendations": [
    {{"task_id": <id>, "match_score": <0-100>, "reason": "<lý do ngắn 1-2 câu tiếng Việt>"}},
    ...
  ]
}}

Lưu ý:
- Sắp xếp recommendations theo match_score GIẢM DẦN (phù hợp nhất lên đầu)
- KHÔNG bỏ sót task nào
- match_score 80-100: rất phù hợp, 50-79: phù hợp, 0-49: ít phù hợp nhưng vẫn hiển thị
"""

    ai_text = _safe_call_gemini(client, WORKER_SYSTEM_PROMPT, user_prompt, temperature=0.3, max_tokens=3072)
    if not ai_text:
        return {
            'has_ai': False,
            'recommendations': [
                {'task_id': t.id, 'match_score': 50, 'reason': 'AI tạm thời không khả dụng.'}
                for t in tasks
            ],
            'cached': False,
            'message': 'AI tạm thời không khả dụng.',
        }

    parsed = _parse_json_safe(ai_text)
    if not parsed or 'recommendations' not in parsed:
        return {
            'has_ai': False,
            'recommendations': [
                {'task_id': t.id, 'match_score': 50, 'reason': 'Không parse được phản hồi AI.'}
                for t in tasks
            ],
            'cached': False,
        }

    # Validate + ensure all tasks are covered
    valid_task_ids = {t.id for t in tasks}
    recs = parsed['recommendations']
    seen_ids = set()
    cleaned = []
    for rec in recs:
        tid = rec.get('task_id')
        if tid in valid_task_ids and tid not in seen_ids:
            seen_ids.add(tid)
            cleaned.append({
                'task_id': tid,
                'match_score': min(100, max(0, int(rec.get('match_score', 50)))),
                'reason': str(rec.get('reason', ''))[:300],
            })
    # Append any missing tasks
    for t in tasks:
        if t.id not in seen_ids:
            cleaned.append({
                'task_id': t.id,
                'match_score': 50,
                'reason': 'Chưa có đánh giá AI.',
            })

    # Sort by match_score desc
    cleaned.sort(key=lambda x: x['match_score'], reverse=True)

    result = {
        'has_ai': True,
        'recommendations': cleaned,
        'cached': False,
        'generated_at': timezone.now().isoformat(),
    }

    # Cache
    cache.set(cache_key, result, CACHE_TTL_WORKER)
    return result


def _build_worker_profile(worker):
    """Build text profile cho worker để gửi Gemini."""
    parts = [f"- Họ tên: {worker.first_name} {worker.last_name}".strip()]
    if worker.email:
        parts.append(f"- Email: {worker.email}")
    if worker.phone_number:
        parts.append(f"- SĐT: {worker.phone_number}")
    if worker.qualifications and len(worker.qualifications) > 0:
        quals = ', '.join(worker.qualifications[:10])
        parts.append(f"- Bằng cấp/Chứng chỉ: {quals}")
    else:
        parts.append("- Bằng cấp/Chứng chỉ: (chưa có)")
    if worker.ai_profile_summary:
        parts.append(f"- Tóm tắt AI: {worker.ai_profile_summary}")

    # Đánh giá
    from core.models import Review
    reviews = Review.objects.filter(reviewee=worker).order_by('-created_at')[:5]
    if reviews.exists():
        avg = sum(r.rating for r in reviews) / reviews.count()
        parts.append(f"- Số sao TB: {avg:.1f}/5 ({reviews.count()} đánh giá)")
        for r in reviews[:3]:
            comment_short = (r.comment or '')[:100]
            parts.append(f"  • {r.rating}⭐: {comment_short}")
    else:
        parts.append("- Đánh giá: chưa có")

    return '\n'.join(parts)


def _build_tasks_context(tasks):
    """Build text mô tả các task để gửi Gemini."""
    lines = []
    for t in tasks:
        lines.append(f"Task ID {t.id}:")
        lines.append(f"  Tiêu đề: {t.title}")
        lines.append(f"  Mô tả: {t.description[:200]}")
        lines.append(f"  Địa điểm: {t.location}")
        lines.append(f"  Giá: {t.price} VNĐ")
        if t.category:
            lines.append(f"  Danh mục: {t.category.name}")
        lines.append(f"  Thời gian: {t.scheduled_time.strftime('%d/%m/%Y %H:%M')}")
        lines.append("")
    return '\n'.join(lines)


# ═══════════════════════════════════════════════════════════════════
#  2. PARENT CANDIDATE RECOMMENDATIONS — gợi ý ứng viên cho parent
# ═══════════════════════════════════════════════════════════════════

PARENT_SYSTEM_PROMPT = """Bạn là trợ lý AI của EduCareLink — nền tảng kết nối phụ huynh với carepartner.

Nhiệm vụ: Đánh giá và xếp hạng các ứng viên cho một công việc, dựa trên:
- Bằng cấp, chứng chỉ phù hợp với yêu cầu công việc
- Số sao đánh giá trung bình từ phụ huynh trước
- Nhận xét từ phụ huynh trước
- Tóm tắt AI về carepartner (nếu có)

Quy tắc:
1. Trả về JSON theo format yêu cầu
2. Với mỗi ứng viên, đưa ra:
   - match_score (0-100)
   - reason: lý do ngắn gọn (1-2 câu) giải thích vì sao phù hợp/kém phù hợp
   - highlight: 1 điểm mạnh nổi bật (nếu có), hoặc 'Chưa có thông tin'
3. KHÔNG quyết định thay phụ huynh — chỉ cung cấp thông tin tham khảo
4. Luôn dùng TIẾNG VIỆT, khách quan, trung thực
5. Nếu ứng viên chưa có bằng cấp/đánh giá → vẫn đánh giá dựa trên ngữ cảnh, không bỏ qua
"""


def get_candidate_recommendations(task, applications):
    """
    Gợi ý ứng viên cho parent.

    Args:
        task: Task instance
        applications: list TaskApplication có status='pending' (chưa approve)

    Returns:
        dict: {
            'has_ai': bool,
            'summary': str (tổng quan ngắn),
            'recommendations': [{'application_id': int, 'worker_id': int, 'match_score': int, 'reason': str, 'highlight': str}, ...],
            'cached': bool,
        }
    """
    if not applications:
        return {
            'has_ai': False,
            'summary': 'Chưa có ứng viên nào ứng tuyển.',
            'recommendations': [],
            'cached': False,
        }

    # Check cache
    app_ids = [a.id for a in applications]
    cache_key = build_parent_cache_key(task.id, app_ids)
    cached = cache.get(cache_key)
    if cached:
        cached['cached'] = True
        return cached

    client, err = _get_gemini_client()
    if not client:
        return {
            'has_ai': False,
            'summary': 'AI chưa kích hoạt. Parent tự đánh giá ứng viên.',
            'recommendations': [
                {
                    'application_id': a.id,
                    'worker_id': a.worker_id,
                    'match_score': 50,
                    'reason': 'Chưa có AI đánh giá.',
                    'highlight': '—',
                } for a in applications
            ],
            'cached': False,
        }

    # Build task context
    task_ctx = f"""Công việc cần tuyển:
- Tiêu đề: {task.title}
- Mô tả: {task.description[:300]}
- Địa điểm: {task.location}
- Giá: {task.price} VNĐ
- Danh mục: {task.category.name if task.category else 'Khác'}
"""

    # Build candidates context
    from core.models import Review
    candidates_lines = ["Danh sách ứng viên:"]
    for app in applications:
        w = app.worker
        candidates_lines.append(f"\nỨng viên (application_id={app.id}, worker_id={w.id}):")
        candidates_lines.append(f"  - Tên: {w.first_name} {w.last_name}".strip())
        if w.qualifications and len(w.qualifications) > 0:
            candidates_lines.append(f"  - Bằng cấp: {', '.join(w.qualifications[:5])}")
        else:
            candidates_lines.append("  - Bằng cấp: (chưa cung cấp)")
        if w.ai_profile_summary:
            candidates_lines.append(f"  - Tóm tắt AI: {w.ai_profile_summary[:200]}")

        reviews = Review.objects.filter(reviewee=w).order_by('-created_at')[:5]
        if reviews.exists():
            avg = sum(r.rating for r in reviews) / reviews.count()
            candidates_lines.append(f"  - Số sao TB: {avg:.1f}/5 ({reviews.count()} đánh giá)")
            for r in reviews[:3]:
                candidates_lines.append(f"    • {r.rating}⭐: {(r.comment or '')[:80]}")
        else:
            candidates_lines.append("  - Đánh giá: chưa có")
    candidates_ctx = '\n'.join(candidates_lines)

    user_prompt = f"""{task_ctx}

{candidates_ctx}

Hãy đánh giá mức độ phù hợp của MỖI ứng viên với công việc trên.
Trả về JSON duy nhất theo format:
{{
  "summary": "<1-2 câu tóm tắt chung về chất lượng ứng viên, ví dụ: 'Có 2/3 ứng viên có bằng cấp phù hợp'>",
  "recommendations": [
    {{
      "application_id": <id>,
      "worker_id": <id>,
      "match_score": <0-100>,
      "reason": "<lý do 1-2 câu>",
      "highlight": "<1 điểm mạnh nổi bật, hoặc 'Chưa có thông tin'>
    }},
    ...
  ]
}}

Lưu ý:
- Sắp xếp recommendations theo match_score GIẢM DẦN (phù hợp nhất lên đầu)
- KHÔNG bỏ sót ứng viên nào
- Trung thực: nếu ứng viên không phù hợp, vẫn nêu rõ nhưng lịch sự
"""

    ai_text = _safe_call_gemini(client, PARENT_SYSTEM_PROMPT, user_prompt, temperature=0.3, max_tokens=3072)
    if not ai_text:
        return {
            'has_ai': False,
            'summary': 'AI tạm thời không khả dụng.',
            'recommendations': [
                {
                    'application_id': a.id, 'worker_id': a.worker_id,
                    'match_score': 50, 'reason': 'AI không khả dụng.', 'highlight': '—',
                } for a in applications
            ],
            'cached': False,
        }

    parsed = _parse_json_safe(ai_text)
    if not parsed or 'recommendations' not in parsed:
        return {
            'has_ai': False,
            'summary': 'Không parse được phản hồi AI.',
            'recommendations': [
                {
                    'application_id': a.id, 'worker_id': a.worker_id,
                    'match_score': 50, 'reason': '—', 'highlight': '—',
                } for a in applications
            ],
            'cached': False,
        }

    # Validate
    valid_app_ids = {a.id for a in applications}
    seen = set()
    cleaned = []
    for rec in parsed['recommendations']:
        aid = rec.get('application_id')
        wid = rec.get('worker_id')
        if aid in valid_app_ids and aid not in seen:
            seen.add(aid)
            cleaned.append({
                'application_id': aid,
                'worker_id': wid,
                'match_score': min(100, max(0, int(rec.get('match_score', 50)))),
                'reason': str(rec.get('reason', ''))[:300],
                'highlight': str(rec.get('highlight', '—'))[:200],
            })
    # Append missing
    for a in applications:
        if a.id not in seen:
            cleaned.append({
                'application_id': a.id, 'worker_id': a.worker_id,
                'match_score': 50, 'reason': 'Chưa có đánh giá AI.', 'highlight': '—',
            })

    cleaned.sort(key=lambda x: x['match_score'], reverse=True)

    result = {
        'has_ai': True,
        'summary': str(parsed.get('summary', ''))[:500],
        'recommendations': cleaned,
        'cached': False,
        'generated_at': timezone.now().isoformat(),
    }
    cache.set(cache_key, result, CACHE_TTL_PARENT)
    return result
