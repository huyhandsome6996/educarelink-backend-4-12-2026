"""
AI Moderation Service — dùng Gemini để:
1. Kiểm duyệt task khi parent đăng (đạo đức, chính trị, luật pháp VN)
2. Phân tích khiếu nại + gợi ý xử lý cho admin
"""

import logging
import json
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger('educarelink.moderation')

CACHE_TTL = 600  # 10 phút


def _get_gemini_client():
    gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not gemini_key or gemini_key == 'your_gemini_api_key_here':
        return None
    try:
        from google import genai
        return genai.Client(api_key=gemini_key)
    except Exception as e:
        logger.warning(f"Không thể khởi tạo Gemini client: {e}")
        return None


def _safe_call_gemini(client, system_prompt, user_prompt, temperature=0.2, max_tokens=2048):
    try:
        from google import genai
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[{'role': 'user', 'parts': [{'text': user_prompt}]}],
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )
        return response.text
    except Exception as e:
        logger.warning(f"Gemini call failed: {e}")
        return None


def _parse_json_safe(text):
    if not text:
        return None
    import re
    patterns = [r'```json\s*(.+?)\s*```', r'```\s*(.+?)\s*```', r'(\{.*\})']
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


# ═══════════════════════════════════════════════════════════════════
#  1. TASK MODERATION
# ═══════════════════════════════════════════════════════════════════

TASK_MODERATION_PROMPT = """Bạn là hệ thống kiểm duyệt nội dung AI của EduCareLink — nền tảng kết nối phụ huynh với carepartner (sinh viên) tại Việt Nam.

Nhiệm vụ: Kiểm duyệt công việc đăng tải dựa trên:
1. Luật pháp Việt Nam (Hiến pháp, Bộ luật Dân sự, Luật Lao động, Luật Bảo vệ trẻ em)
2. Đạo đức xã hội Việt Nam
3. Chính trị: không chống phá Nhà nước, không vi phạm an ninh quốc gia
4. Tiêu chuẩn cộng đồng: không bóc lột, không phân biệt đối xử, không nội dung người lớn với trẻ em

Quy tắc đánh giá:
- APPROVED: công việc bình thường, phù hợp (gia sư, dọn dẹp, trông trẻ, nấu ăn, v.v.)
- REJECTED: vi phạm rõ ràng (bóc lột sức lao động, giá quá thấp < 20.000đ/giờ, nội dung vi phạm)
- NEEDS_REVIEW: nằm trong vùng xám, cần admin xem xét

Trả về JSON:
{
  "verdict": "APPROVED" | "REJECTED" | "NEEDS_REVIEW",
  "confidence": 0.0-1.0,
  "flags": ["liệt kê cờ vi phạm nếu có, vd: lua_dao, boc_lot, chinh_tri, bao_luc, nguoi_lon, ..."],
  "explanation": "giải thích ngắn gọn tiếng Việt",
  "suggestion": "nếu NEEDS_REVIEW, gợi ý cho admin"
}

Luôn dùng TIẾNG VIỆT. Trung thực, khách quan."""


def moderate_task(task):
    """Kiểm duyệt task bằng AI Gemini."""
    from .models import TaskModeration
    from django.utils import timezone

    client = _get_gemini_client()
    if not client:
        # Không có AI → auto-approved (không chặn user)
        moderation, _ = TaskModeration.objects.get_or_create(
            task=task,
            defaults={
                'status': 'approved',
                'ai_verdict': 'AI chưa kích hoạt — tự động duyệt.',
                'ai_confidence': 0.0,
            }
        )
        return moderation

    user_prompt = f"""Kiểm duyệt công việc sau:

Tiêu đề: {task.title}
Mô tả: {task.description[:500]}
Giá: {task.price} VNĐ
Địa điểm: {task.location}
Danh mục: {task.category.name if task.category else 'Khác'}

Hãy đánh giá theo tiêu chuẩn pháp luật, đạo đức, chính trị Việt Nam."""

    ai_text = _safe_call_gemini(client, TASK_MODERATION_PROMPT, user_prompt, temperature=0.2, max_tokens=1024)
    if not ai_text:
        moderation, _ = TaskModeration.objects.get_or_create(
            task=task,
            defaults={'status': 'approved', 'ai_verdict': 'AI không phản hồi — tự động duyệt.', 'ai_confidence': 0.0}
        )
        return moderation

    parsed = _parse_json_safe(ai_text)
    if not parsed:
        moderation, _ = TaskModeration.objects.get_or_create(
            task=task,
            defaults={'status': 'approved', 'ai_verdict': 'Không parse được AI — tự động duyệt.', 'ai_confidence': 0.0}
        )
        return moderation

    verdict = parsed.get('verdict', 'APPROVED').upper()
    confidence = float(parsed.get('confidence', 0.5))
    flags = parsed.get('flags', [])
    explanation = str(parsed.get('explanation', ''))[:1000]
    suggestion = str(parsed.get('suggestion', ''))[:500]

    status_map = {
        'APPROVED': 'approved',
        'REJECTED': 'rejected',
        'NEEDS_REVIEW': 'needs_review',
    }
    status = status_map.get(verdict, 'approved')

    moderation, _ = TaskModeration.objects.update_or_create(
        task=task,
        defaults={
            'status': status,
            'ai_verdict': explanation,
            'ai_confidence': confidence,
            'ai_flags': flags,
            'ai_suggestion': suggestion,
        }
    )

    # Notify parent if rejected
    if status == 'rejected':
        try:
            from core.models import Notification
            from core.views import send_expo_push_notification
            Notification.objects.create(
                recipient=task.parent,
                title="⚠️ Công việc bị từ chối",
                message=f"Công việc '{task.title}' không đạt tiêu chuẩn cộng đồng. Lý do: {explanation[:150]}",
            )
            if task.parent.expo_push_token:
                send_expo_push_notification(
                    token=task.parent.expo_push_token,
                    title="⚠️ Công việc bị từ chối",
                    body=f"'{task.title}' không đạt kiểm duyệt. Vui lòng sửa và đăng lại.",
                    data={'type': 'task_rejected', 'task_id': task.id}
                )
        except Exception as e:
            logger.warning(f"Notify parent failed: {e}")

    return moderation


# ═══════════════════════════════════════════════════════════════════
#  2. COMPLAINT ANALYSIS
# ═══════════════════════════════════════════════════════════════════

COMPLAINT_ANALYSIS_PROMPT = """Bạn là trợ lý AI hỗ trợ admin xử lý khiếu nại trên EduCareLink — nền tảng kết nối phụ huynh với carepartner (sinh viên) tại Việt Nam.

Nhiệm vụ: Phân tích khiếu nại từ carepartner, giúp admin:
1. Tóm tắt sự việc ngắn gọn
2. Đánh giá mức độ nghiêm trọng (low/medium/high/urgent)
3. Gợi ý hành động cụ thể cho admin
4. Nếu cần hỗ trợ khẩn cấp (bạo lực, quấy rối) → urgent + gợi ý liên hệ cơ quan chức năng

Quy tắc:
- Trung thực, khách quan, bảo vệ quyền lợi cả 2 bên
- Nếu thiếu thông tin → gợi ý admin thu thập thêm
- Luôn dùng TIẾNG VIỆT
- Không kết tội nếu chưa có bằng chứng đủ

Trả về JSON:
{
  "summary": "tóm tắt 1-2 câu",
  "priority": "low" | "medium" | "high" | "urgent",
  "analysis": "phân tích chi tiết 3-5 câu",
  "suggested_action": "gợi ý hành động cụ thể cho admin",
  "needs_investigation": true/false
}"""


def analyze_complaint(complaint):
    """Phân tích khiếu nại bằng AI Gemini."""
    client = _get_gemini_client()
    if not client:
        complaint.ai_analyzed = False
        complaint.save(update_fields=['ai_analyzed'])
        return None

    user_prompt = f"""Phân tích khiếu nại sau:

Loại khiếu nại: {complaint.get_complaint_type_display()}
Tiêu đề: {complaint.title}
Mô tả: {complaint.description[:500]}
Người khiếu nại: {complaint.complainant.username} (carepartner)
Người bị khiếu nại: {complaint.reported_user.username} (phụ huynh)
Số bằng chứng đính kèm: {complaint.evidence.count()}

Hãy phân tích và gợi ý hành động."""

    ai_text = _safe_call_gemini(client, COMPLAINT_ANALYSIS_PROMPT, user_prompt, temperature=0.3, max_tokens=1024)
    if not ai_text:
        complaint.ai_analyzed = False
        complaint.save(update_fields=['ai_analyzed'])
        return None

    parsed = _parse_json_safe(ai_text)
    if not parsed:
        complaint.ai_analyzed = False
        complaint.save(update_fields=['ai_analyzed'])
        return None

    complaint.ai_analysis = str(parsed.get('analysis', ''))[:1000]
    complaint.ai_priority = parsed.get('priority', 'medium')
    complaint.ai_suggestion = str(parsed.get('suggested_action', ''))[:500]
    complaint.ai_analyzed = True
    complaint.save(update_fields=['ai_analysis', 'ai_priority', 'ai_suggestion', 'ai_analyzed'])
    return parsed
