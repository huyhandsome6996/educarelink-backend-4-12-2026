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
    """⚡ TỐI ƯU: dùng pooled singleton client."""
    try:
        from performance.gemini_pool import get_pooled_gemini_client
        return get_pooled_gemini_client()
    except ImportError:
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
#  0. KEYWORD BLACKLIST — chặn đồng bộ NGAY LẬP TỨC (không cần AI)
# ═══════════════════════════════════════════════════════════════════

# Danh sách từ khóa cấm — vi phạm pháp luật VN nghiêm trọng
# Match nếu xuất hiện trong title hoặc description (case-insensitive)
BANNED_KEYWORDS = [
    # Bạo lực / giết người / hại trẻ
    'giết', 'giet', 'hại', 'hai tre', 'hiếp', 'hiep', 'cưỡng dâm', 'cuong dam',
    'bắt cóc', 'bat coc', 'mua bán người', 'mua ban nguoi', 'buôn người',
    'ma túy', 'ma tuy', 'bán thuốc', 'ban thuoc', 'cần sa', 'can sa',
    'đánh nhau', 'danh nhau', 'đánh đập', 'danh dap', 'bạo hành', 'bao hanh',
    'vũ khí', 'vu khi', 'súng', 'sung', 'dao giết', 'dao giet',
    'cờ bạc', 'co bac', 'đánh bạc', 'danh bac', 'casino', 'xóc đĩa', 'xoc dia',
    'lừa đảo', 'lua dao', 'chiếm đoạt', 'chiem doat', 'trục lợi',
    # Chính trị / an ninh quốc gia
    'chống phá', 'chong pha', 'đảo chính', 'dao chinh', 'phản động', 'phan dong',
    # Nội dung người lớn liên quan trẻ em
    'pedophile', 'ụ trẻ', 'pedop', 'xâm hại trẻ', 'xam hai tre',
    # Khác
    'tự sát', 'tu sat', 'tự tử', 'tu tu', 'khai thác bất hợp pháp',
    # Bạo lực đối với trẻ em
    'đánh trẻ', 'danh tre', 'đánh bé', 'danh be', 'đánh con', 'danh con',
    'đánh đòn', 'danh don', 'bạo lực trẻ em', 'bao luc tre em',
    'hành hạ', 'hanh ha', 'tra tấn', 'tra tan', 'ngược đãi', 'nguoc dai',
    'bóp cổ', 'bop co', 'siết cổ', 'siet co', 'dìm nước', 'dim nuoc',
    'đốt', 'dot', 'phóng hỏa', 'phong hoa',
    'cắt thịt', 'cat thit',
    # ⚡ Từ khóa thô tục / tục tĩu (chặn ĐỒNG BỘ ngay lập tức)
    'địt', 'dit', 'địt mẹ', 'dit me', 'địt con', 'dit con',
    'buồi', 'cặc', 'lồn', 'củ cặc', 'cu cặc',
    'đụ', 'đĩ', 'điếm', 'diem',
    'bú cu', 'bu cu',
    'fuck', 'shit', 'bitch', 'dick', 'pussy', 'asshole',
    'mẹ mày', 'me may',
    'thằng chó', 'thang cho', 'con chó', 'con cho',
    'óc chó', 'oc cho',
    # ⚡ Cấm nội dung không liên quan đến dự án
    'tuyển người yêu', 'tuyen nguoi yeu', 'tìm người yêu', 'tim nguoi yeu',
    'hookup', 'one night', 'quyến rũ', 'quyen ru',
    'cờ bạc online', 'co bac online', 'đánh bài', 'danh bai',
    'tỷ lệ bóng đá', 'ty le bong da', 'cá độ', 'ca do',
    'đại lý đa cấp', 'dai ly da cap', 'kinh doanh đa cấp',
    # ⚡ Cấm từ khóa vi phạm khác
    'ăn cắp', 'an cap', 'ăn cướp', 'an cuop', 'trộm', 'trom',
    'giật đồ', 'giat do', 'cướp', 'cuop', 'lừa tiền', 'lua tien',
    'karaoke', 'massage', 'quán bar', 'quan bar',
    'xăm hình', 'xam hinh',
]
# Xóa empty string nếu có
BANNED_KEYWORDS = [k for k in BANNED_KEYWORDS if k]

# Từ khóa giá quá thấp — bóc lột lao động
EXPLOITATION_PRICE_THRESHOLD = 20000  # VNĐ/giờ


def _check_banned_keywords(title: str, description: str, price) -> dict:
    """
    Check keyword blacklist đồng bộ — chặn NGAY LẬP TỨC không cần AI.
    Trả về {'banned': True/False, 'reason': '...', 'flags': [...]}
    """
    text = f"{title} {description}".lower()
    flags = []

    for keyword in BANNED_KEYWORDS:
        if keyword in text:
            flags.append(f'banned_keyword:{keyword}')
            return {
                'banned': True,
                'reason': f'Công việc chứa từ khóa bị cấm: "{keyword}". Nội dung vi phạm pháp luật Việt Nam hoặc tiêu chuẩn cộng đồng.',
                'flags': flags,
                'confidence': 1.0,
            }

    # Check giá bóc lột (nếu price < 20.000 VNĐ → nghi ngờ bóc lột)
    try:
        price_val = int(str(price).replace('.', '').replace(',', '').replace('đ', '').replace('Đ', '').replace('VNĐ', '').replace('vnd', '').strip())
        if price_val < EXPLOITATION_PRICE_THRESHOLD:
            flags.append('exploitation_low_price')
            return {
                'banned': True,
                'reason': f'Mức lương {price_val} VNĐ quá thấp (dưới {EXPLOITATION_PRICE_THRESHOLD} VNĐ), nghi ngờ bóc lột lao động theo Luật Lao động Việt Nam.',
                'flags': flags,
                'confidence': 0.95,
            }
    except (ValueError, TypeError):
        pass

    return {'banned': False, 'flags': flags}


# ═══════════════════════════════════════════════════════════════════
#  1. TASK MODERATION
# ═══════════════════════════════════════════════════════════════════

TASK_MODERATION_PROMPT = """Bạn là hệ thống kiểm duyệt nội dung AI của EduCareLink — nền tảng kết nối phụ huynh với carepartner (sinh viên) tại Việt Nam.

Nhiệm vụ: Kiểm duyệt công việc đăng tải dựa trên:
1. Luật pháp Việt Nam (Hiến pháp, Bộ luật Dân sự, Luật Lao động, Luật Bảo vệ trẻ em, Luật Phòng chống bạo lực gia đình)
2. Đạo đức xã hội Việt Nam
3. Chính trị: không chống phá Nhà nước, không vi phạm an ninh quốc gia
4. Tiêu chuẩn cộng đồng: không bóc lột, không phân biệt đối xử, không nội dung người lớn với trẻ em
5. AN TOÀN TRẺ EM: bất kỳ nội dung nào có nguy cơ hại trẻ em → REJECTED ngay lập tức

Quy tắc đánh giá:
- APPROVED: công việc bình thường, phù hợp (gia sư, dọn dẹp, trông trẻ, nấu ăn, v.v.)
- REJECTED: vi phạm rõ ràng (bóc lột sức lao động, giá quá thấp < 20.000đ/giờ, nội dung vi phạm pháp luật, bạo lực, hại trẻ em, lừa đảo, ma túy, cờ bạc, vũ khí, chính trị phản động)
- NEEDS_REVIEW: nằm trong vùng xám, cần admin xem xét

LƯU Ý QUAN TRỌNG: Nếu nội dung có bất kỳ dấu hiệu vi phạm pháp luật (giết người, bắt cóc, hiếp dâm, ma túy, bạo lực, vũ khí, cờ bạc, lừa đảo) → REJECTED với confidence 1.0.

Trả về JSON:
{
  "verdict": "APPROVED" | "REJECTED" | "NEEDS_REVIEW",
  "confidence": 0.0-1.0,
  "flags": ["liệt kê cờ vi phạm nếu có, vd: lua_dao, boc_lot, chinh_tri, bao_luc, nguoi_lon, giet_nguoi, ma_tuy, co_bac, ..."],
  "explanation": "giải thích ngắn gọn tiếng Việt",
  "suggestion": "nếu NEEDS_REVIEW, gợi ý cho admin"
}

Luôn dùng TIẾNG VIỆT. Trung thực, khách quan. KHÔNG bao giờ APPROVED nội dung vi phạm pháp luật."""


def moderate_task(task):
    """Kiểm duyệt task bằng AI Gemini + keyword blacklist."""
    from .models import TaskModeration
    from django.utils import timezone

    # ⚡ BƯỚC 1: Check keyword blacklist ĐỒNG BỘ — chặn ngay lập tức
    blacklist_result = _check_banned_keywords(
        task.title or '',
        task.description or '',
        task.price
    )
    if blacklist_result['banned']:
        # Chặn NGAY LẬP TỨC — không cần AI
        moderation, _ = TaskModeration.objects.update_or_create(
            task=task,
            defaults={
                'status': 'rejected',
                'ai_verdict': blacklist_result['reason'],
                'ai_confidence': blacklist_result['confidence'],
                'ai_flags': blacklist_result['flags'],
                'ai_suggestion': 'Nội dung vi phạm nghiêm trọng — tự động từ chối.',
            }
        )
        # Notify parent
        try:
            from core.models import Notification
            from core.views import send_expo_push_notification
            Notification.objects.create(
                recipient=task.parent,
                title="🚫 Công việc bị từ chối",
                message=f"Công việc '{task.title}' vi phạm tiêu chuẩn cộng đồng: {blacklist_result['reason'][:150]}",
            )
            if task.parent.expo_push_token:
                send_expo_push_notification(
                    token=task.parent.expo_push_token,
                    title="🚫 Công việc bị từ chối",
                    body=f"'{task.title}' vi phạm pháp luật hoặc tiêu chuẩn cộng đồng.",
                    data={'type': 'task_rejected', 'task_id': task.id}
                )
        except Exception as e:
            logger.warning(f"Notify parent on blacklist reject failed: {e}")
        logger.info(f"[moderation] Task#{task.id} REJECTED by keyword blacklist: {blacklist_result['flags']}")
        return moderation

    # ⚡ BƯỚC 2: Nếu không bị blacklist → gọi AI Gemini để kiểm duyệt sâu hơn
    client = _get_gemini_client()
    if not client:
        # Không có AI → auto-approved (đã check blacklist rồi)
        moderation, _ = TaskModeration.objects.update_or_create(
            task=task,
            defaults={
                'status': 'approved',
                'ai_verdict': 'Đã kiểm tra từ khóa cấm — không phát hiện vi phạm. AI chưa kích hoạt.',
                'ai_confidence': 0.5,
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


def moderate_task_sync(title, description, price, location='', category_id=None):
    """
    ⚡ Kiểm duyệt ĐỒNG BỘ bằng AI Gemini — gọi NGAY LÚC ĐĂNG TASK.
    Timeout 5 giây — nếu AI không trả lời kịp → cho tạo task, async moderate sau.

    Trả về:
    {
        'rejected': True/False,
        'reason': str,
        'flags': list,
        'confidence': float,
    }
    """
    import threading

    client = _get_gemini_client()
    if not client:
        return {'rejected': False, 'reason': '', 'flags': [], 'confidence': 0.0}

    # Lấy category name
    category_name = 'Khác'
    if category_id:
        try:
            from core.models import ServiceCategory
            cat = ServiceCategory.objects.get(id=int(category_id))
            category_name = cat.name
        except Exception:
            pass

    user_prompt = f"""Kiểm duyệt công việc sau:

Tiêu đề: {title}
Mô tả: {description[:500]}
Giá: {price} VNĐ
Địa điểm: {location}
Danh mục: {category_name}

Hãy đánh giá theo tiêu chuẩn pháp luật, đạo đức, chính trị Việt Nam."""

    # ⚡ Chạy AI call với timeout 5 giây dùng thread
    result_box = [None]  # thread-safe container
    error_box = [None]

    def _call_ai():
        try:
            ai_text = _safe_call_gemini(client, TASK_MODERATION_PROMPT, user_prompt, temperature=0.2, max_tokens=512)
            result_box[0] = ai_text
        except Exception as e:
            error_box[0] = e

    t = threading.Thread(target=_call_ai, daemon=True)
    t.start()
    t.join(timeout=5.0)  # ⡡ Đợi tối đa 5 giây

    if t.is_alive():
        # AI chưa trả lời sau 5s → cho tạo task, async moderate sau
        logger.warning('[moderate_task_sync] AI timeout 5s — cho phép tạo task, async moderate sau')
        return {'rejected': False, 'reason': '', 'flags': [], 'confidence': 0.0}

    if error_box[0]:
        logger.warning(f'[moderate_task_sync] AI error: {error_box[0]}')
        return {'rejected': False, 'reason': '', 'flags': [], 'confidence': 0.0}

    ai_text = result_box[0]
    if not ai_text:
        return {'rejected': False, 'reason': '', 'flags': [], 'confidence': 0.0}

    parsed = _parse_json_safe(ai_text)
    if not parsed:
        return {'rejected': False, 'reason': '', 'flags': [], 'confidence': 0.0}

    verdict = parsed.get('verdict', 'APPROVED').upper()
    confidence = float(parsed.get('confidence', 0.5))
    flags = parsed.get('flags', [])
    explanation = str(parsed.get('explanation', ''))[:500]

    if verdict == 'REJECTED':
        logger.info(f'[moderate_task_sync] REJECTED: "{title}" — {flags}')
        return {
            'rejected': True,
            'reason': explanation,
            'flags': flags,
            'confidence': confidence,
        }

    logger.info(f'[moderate_task_sync] {verdict}: "{title}" — {confidence}')
    return {
        'rejected': False,
        'reason': explanation,
        'flags': flags,
        'confidence': confidence,
    }


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
