"""
AI Moderation Service — dùng Gemini để:
1. Kiểm duyệt task khi parent đăng (đạo đức, chính trị, luật pháp VN)
2. Phân tích khiếu nại + gợi ý xử lý cho admin
"""

import logging
import json
import re
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
        # Handle safety block — response.text có thể raise ValueError
        try:
            text = response.text
            if text:
                return text
            # response.text empty → check candidates
            logger.warning(f"[gemini] response.text empty, checking candidates...")
            if hasattr(response, 'candidates') and response.candidates:
                cand = response.candidates[0]
                if hasattr(cand, 'content') and cand.content:
                    if hasattr(cand.content, 'parts') and cand.content.parts:
                        return cand.content.parts[0].text
            logger.warning(f"[gemini] No text in response — possibly safety blocked")
            return None
        except ValueError as ve:
            # response.text raise ValueError khi bị safety block
            logger.warning(f"[gemini] response.text raised ValueError (likely safety block): {ve}")
            # Trả về JSON reject mặc định nếu AI bị safety block
            return '{"verdict": "REJECTED", "confidence": 0.9, "flags": ["safety_blocked"], "explanation": "Nội dung bị AI chặn vì có thể vi phạm tiêu chuẩn an toàn.", "suggestion": ""}'
    except Exception as e:
        logger.warning(f"Gemini call failed: {e}")
        return None


def _parse_json_safe(text):
    if not text:
        return None
    import re
    # Strip whitespace
    text = text.strip()
    # Remove markdown fences ```json ... ``` or ``` ... ```
    fence_match = re.search(r'```(?:json)?\s*(.+?)\s*```', text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()
    # Try direct JSON parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Extract {...} block (greedy)
    brace_match = re.search(r'\{.*\}', text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass
    # Fallback: extract verdict từ text (case AI trả text có chữ APPROVED/REJECTED)
    text_lower = text.lower()
    if 'rejected' in text_lower or 'reject' in text_lower:
        return {
            'verdict': 'REJECTED',
            'confidence': 0.8,
            'flags': ['ai_text_fallback'],
            'explanation': text[:200],
            'suggestion': '',
        }
    if 'needs_review' in text_lower or 'needs review' in text_lower:
        return {
            'verdict': 'NEEDS_REVIEW',
            'confidence': 0.5,
            'flags': ['ai_text_fallback'],
            'explanation': text[:200],
            'suggestion': '',
        }
    if 'approved' in text_lower or 'approve' in text_lower:
        return {
            'verdict': 'APPROVED',
            'confidence': 0.7,
            'flags': ['ai_text_fallback'],
            'explanation': text[:200],
            'suggestion': '',
        }
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
    # ⚡ Cấm nội dung KHÔNG LIÊN QUAN đến 8 danh mục cốt lõi
    'kiếm tiền online', 'kiem tien online', 'mmo', 'đầu tư', 'dau tu',
    'chứng khoán', 'chung khoan', 'crypto', 'bitcoin', 'ethereum',
    'đa cấp', 'da cap', 'pyramid', 'kinh doanh đa cấp',
    'cho vay', 'cho vay tiền', 'vay tiền', 'vay von', 'vay vốn',
    'tín dụng', 'tin dung', 'lãi suất',
    'hẹn hò', 'hen ho', 'dating', 'tinder',
    'quảng cáo', 'quang cao', 'tiếp thị', 'tieu thi',
    'bán hàng online', 'ban hang online',
    'hack tài khoản', 'hack acc', 'hack facebook', 'hack mật khẩu',
    'crack', 'phishing', 'malware', 'keylogger',
    'xem bói', 'boi toán', 'tâm linh', 'tam linh',
    'tuyển nhân viên', 'tuyen nhan vien', 'tuyển sale', 'tuyển nv',
]
# Xóa empty string nếu có
BANNED_KEYWORDS = [k for k in BANNED_KEYWORDS if k]

# Từ khóa giá quá thấp — bóc lột lao động
EXPLOITATION_PRICE_THRESHOLD = 20000  # VNĐ/giờ


# ─────────────────────────────────────────────────────────────────
#  ANTI-BYPASS NORMALIZATION
#  Người đăng có thể cố lách bộ lọc bằng cách:
#   - Chèn ký tự phân cách giữa các chữ cái: "đ.ị.t", "d_i_t", "d i t"
#   - Ký tự Unicode giống nhau (homoglyph): Cyrillic а/е/о/р/с/х trông
#     giống Latin a/e/o/p/c/x
#   - Ký tự vô hình (zero-width space/joiner) chèn giữa các chữ cái
#   - Leetspeak: "d1t", "vl", "đjt", "@", "$", "!" thay cho chữ cái
#  → Chuẩn hoá text theo nhiều "góc nhìn" rồi match TẤT CẢ, thay vì chỉ
#    match nguyên văn.
# ─────────────────────────────────────────────────────────────────

import unicodedata

_ZERO_WIDTH_CHARS = ''.join([
    '\u200b', '\u200c', '\u200d', '\u2060', '\ufeff', '\u00ad',
])
_ZERO_WIDTH_TABLE = {ord(c): None for c in _ZERO_WIDTH_CHARS}

# Homoglyph — ký tự nhìn giống Latin nhưng thuộc bảng mã khác
_HOMOGLYPH_MAP = {
    # Cyrillic → Latin
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
    'у': 'y', 'і': 'i', 'ѕ': 's', 'һ': 'h', 'ԁ': 'd', 'ⅰ': 'i',
    'к': 'k', 'м': 'm', 'т': 't', 'В': 'b', 'Н': 'h', 'А': 'a',
    # Fullwidth Latin → normal
    **{chr(0xFF41 + i): chr(0x61 + i) for i in range(26)},  # ａ-ｚ
    **{chr(0xFF21 + i): chr(0x41 + i) for i in range(26)},  # Ａ-Ｚ
}
_HOMOGLYPH_TABLE = {ord(k): v for k, v in _HOMOGLYPH_MAP.items()}

# Leetspeak — chỉ dùng cho bản "leet" riêng, không áp cho category match
_LEET_MAP = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
    '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i',
}
_LEET_TABLE = {ord(k): v for k, v in _LEET_MAP.items()}

# Ký tự phân cách hay bị chèn giữa các chữ để né filter
_SEPARATOR_CHARS = r' .-_*/\|~^+=,;:•●○◦'
_SEPARATOR_CHARS_ESC = re.escape(_SEPARATOR_CHARS)
# "Chữ" = bất kỳ ký tự nào không phải separator/whitespace
_LETTER_CLASS = rf'[^\s{_SEPARATOR_CHARS_ESC}]'
# Chỉ nén separator khi nó nằm giữa 2 TOKEN 1-KÝ-TỰ (kiểu viết tách từng chữ
# để né filter: "đ.ị.t", "d_i_t", "d i t") — KHÔNG nén khi giữa 2 từ nhiều
# ký tự thật (vd "di trong", "su ngoai" phải giữ nguyên, không được gộp
# thành "ditrong"/"sungoai" vì sẽ trùng với banned keyword ngắn như "dit"/"sung").
_SPELLED_OUT_PATTERN = re.compile(
    rf'(?<![^\s{_SEPARATOR_CHARS_ESC}])({_LETTER_CLASS})[{_SEPARATOR_CHARS_ESC}]+'
    rf'(?={_LETTER_CLASS}(?:[\s{_SEPARATOR_CHARS_ESC}]|$))'
)


def _normalize_text(text: str) -> str:
    """NFKC normalize + xoá ký tự vô hình + quy đổi homoglyph. Vẫn giữ dấu tiếng Việt."""
    if not text:
        return ''
    text = unicodedata.normalize('NFKC', text)
    text = text.translate(_ZERO_WIDTH_TABLE)
    text = text.translate(_HOMOGLYPH_TABLE)
    return text.lower()


def _compact_text(text: str) -> str:
    """Nén ký tự phân cách CHỈ khi bị chèn giữa các chữ cái viết tách rời
    (spelled-out obfuscation: 'đ.ị.t' → 'địt', 'd_i_t' → 'dit', 'd i t' →
    'dit'). KHÔNG nén khoảng trắng/ký tự phân cách giữa 2 từ nhiều ký tự
    thật — vd 'di trong' phải giữ nguyên 'di trong', không gộp thành
    'ditrong' (tránh trùng banned keyword ngắn như 'dit' một cách giả)."""
    if not text:
        return text
    prev = None
    while prev != text:
        prev = text
        text = _SPELLED_OUT_PATTERN.sub(r'\1', text)
    return text


def _leet_normalize(text: str) -> str:
    """Quy đổi leetspeak (0→o, 1→i, @→a...) sau khi đã normalize + compact."""
    return text.translate(_LEET_TABLE)


def _all_text_variants(raw_text: str) -> list:
    """Trả về danh sách các biến thể text để match banned keyword —
    nguyên văn, đã chuẩn hoá, đã nén ký tự phân cách, và leet-normalized."""
    normalized = _normalize_text(raw_text)
    compact = _compact_text(normalized)
    leet_compact = _leet_normalize(compact)
    variants = {raw_text.lower(), normalized, compact, leet_compact}
    return [v for v in variants if v]


def _check_banned_keywords(title: str, description: str, price) -> dict:
    """
    Check keyword blacklist đồng bộ — chặn NGAY LẬP TỨC không cần AI.
    Match trên nhiều biến thể chuẩn hoá để chống né filter bằng ký tự
    phân cách, homoglyph, ký tự vô hình, leetspeak.
    Trả về {'banned': True/False, 'reason': '...', 'flags': [...]}
    """
    raw_text = f"{title} {description}"
    text_variants = _all_text_variants(raw_text)
    flags = []

    for keyword in BANNED_KEYWORDS:
        keyword_compact = _compact_text(keyword)
        for variant in text_variants:
            if keyword in variant or keyword_compact in variant:
                flags.append(f'banned_keyword:{keyword}')
                return {
                    'banned': True,
                    'reason': f'Công việc chứa từ khóa bị cấm: "{keyword}". Nội dung vi phạm pháp luật Việt Nam hoặc tiêu chuẩn cộng đồng.',
                    'flags': flags,
                    'confidence': 1.0,
                }

    # Giữ biến `text` cho phần check phía dưới (giá) — bản gốc lowercase
    text = raw_text.lower()
    # Bản chuẩn hoá (homoglyph + zero-width) nhưng GIỮ khoảng trắng, để
    # category keywords nhiều từ (vd "gia sư") vẫn match được
    text_normalized = _normalize_text(raw_text)
    # Bản đã nén ký tự phân cách — dùng làm fallback cho category compact
    text_compact = _compact_text(text_normalized)

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

    # ⚡ CATEGORY CHECK: Chỉ chấp nhận 5 danh mục cốt lõi
    # Nếu task không chứa bất kỳ từ khóa nào của 5 danh mục → REJECT
    CATEGORY_KEYWORDS = [
        # 1. Gia sư
        'gia sư', 'gia su', 'dạy kèm', 'day kem', 'học thêm', 'hoc them', 'ôn thi', 'on thi',
        'ngoại ngữ', 'ngoai ngu', 'tiếng anh', 'tieng anh', 'tiếng việt', 'tieng viet',
        'toán', 'toan', 'lý', 'ly', 'hóa', 'hoa', 'văn', 'lịch sử', 'lich su', 'địa lý', 'dia ly',
        'piano', 'guitar', 'organ', 'vẽ', 've', 'mỹ thuật', 'my thuat', 'nhạc', 'nhac',
        'dạy', 'day', 'giaovien', 'giáo viên', 'lớp', 'lop', 'học sinh', 'hoc sinh',
        'sư phạm', 'su pham', ' ôn ', ' kiểu ', ' năng khiếu', 'nang khieu', 'ielts', 'toeic',
        # 2. Đón trẻ
        'đón trẻ', 'don tre', 'đón con', 'don con', 'đưa đón', 'dua don', 'đón bé', 'don be',
        'đón học sinh', 'don hoc sinh', 'đón em', 'don em', 'đưa con', 'dua con',
        'đi học về', 'di hoc ve', 'trường học', 'truong hoc', 'trẻ trường', 'đón hộ', 'don ho',
        # 3. Dọn dẹp
        'dọn dẹp', 'don dep', 'lau dọn', 'lau don', 'vệ sinh', 've sinh', 'dọn phòng', 'don phong',
        'dọn nhà', 'don nha', 'lau nhà', 'lau nha', 'lau sàn', 'lau san', 'chùi', 'chui',
        'quét', 'quet', 'lau chùi', 'lau chui', 'dọn vệ sinh', 'don ve sinh',
        'dọn dẹp nhà', 'don dep nha', 'lau dọn nhà', 'lau don nha',
        # 4. Trông trẻ
        'trông trẻ', 'trong tre', 'trông bé', 'trong be', 'trông con', 'trong con',
        'trông em', 'trong em', 'babysitter', 'giữ trẻ', 'giu tre', 'chăm sóc trẻ', 'cham soc tre',
        'chăm bé', 'cham be', 'chăm con', 'cham con', 'người trông trẻ', 'nguoi trong tre',
        'trông trẻ hộ', 'trong tre ho', ' giữ bé ', 'giu be',
        # 5. Mua sắm hộ
        'mua sắm', 'mua sam', 'mua hộ', 'mua ho', 'đi chợ', 'di cho', 'mua đồ', 'mua do',
        'mua giúp', 'mua giup', 'mua thực phẩm', 'mua thuc pham', 'shopping hộ', 'shopping ho',
        'mua tạp hóa', 'mua tap hoa', 'đi siêu thị', 'di sieu thi', 'mua đồ hộ', 'mua do ho',
    ]

    has_category_keyword = any(
        kw in text_normalized or _compact_text(kw) in text_compact
        for kw in CATEGORY_KEYWORDS
    )
    if not has_category_keyword:
        flags.append('khong_lien_quan_danh_muc')
        return {
            'banned': True,
            'reason': 'Công việc không thuộc 5 danh mục cốt lõi của EduCareLink (Gia sư, Đón trẻ, Dọn dẹp, Trông trẻ, Mua sắm hộ). Vui lòng đăng công việc phù hợp.',
            'flags': flags,
            'confidence': 0.95,
        }

    return {'banned': False, 'flags': flags}


# ═══════════════════════════════════════════════════════════════════
#  1. TASK MODERATION
# ═══════════════════════════════════════════════════════════════════

TASK_MODERATION_PROMPT = """Bạn là hệ thống kiểm duyệt nội dung AI của EduCareLink.

Nhiệm vụ: Kiểm duyệt công việc phụ huynh đăng. CHỈ CHẤP NHẬN 5 DANH MỤC:

1. Gia sư — dạy kèm, học thêm, ôn thi, ngoại ngữ, năng khiếu (piano, guitar, vẽ)
2. Đón trẻ — đưa đón học sinh, đón con đi học về
3. Dọn dẹp nhà cửa — lau dọn, vệ sinh, dọn phòng
4. Trông trẻ — giữ trẻ, babysitter, chăm sóc trẻ
5. Mua sắm hộ — đi chợ, mua đồ giúp

REJECTED nếu:
- Không thuộc 5 danh mục trên (ví dụ: nấu ăn, dắt chó, rửa xe, trồng cây, chuyển nhà, làm bánh, bán hàng, xăm hình, karaoke, massage, xem bói, đầu tư, crypto, đa cấp, cho vay, hẹn hò, tuyển nhân viên, hack, crack)
- Vi phạm pháp luật VN (bạo lực, ma túy, cờ bạc, vũ khí, lừa đảo, hiếp dâm, mua bán người, chính trị phản động, tự sát)
- Vi phạm tiêu chuẩn cộng đồng (bóc lột giá < 20.000đ/giờ, nude, khiêu dâm, prostitution, hookup, tuyển người yêu, quấy rối, phân biệt đối xử)
- Spam, quảng cáo, link đáng ngờ, tin nhắn vô nghĩa

APPROVED nếu: thuộc 1 trong 5 danh mục trên + hợp pháp + đạo đức.

⚠️ CHỐNG NÉ FILTER: Người đăng có thể cố tình viết sai chính tả, chèn dấu
chấm/gạch/khoảng trắng giữa các chữ cái (vd "đ.ị.t", "d_i_t"), dùng ký tự
Unicode nhìn giống chữ cái thường (Cyrillic, fullwidth), số thay chữ
(1337speak: "d1t", "vl"), hoặc viết tắt/teencode để né bộ lọc từ khóa.
LUÔN đọc hiểu Ý NGHĨA THỰC SỰ đằng sau cách viết, không chỉ so khớp chữ
nguyên văn — nếu nội dung thực chất vi phạm dù được viết lách bằng ký tự
lạ, vẫn REJECTED.

OUTPUT BẮT BUỘC: chỉ trả JSON thuần, không markdown fence, không text thừa.
{"verdict": "APPROVED", "confidence": 0.95, "flags": [], "explanation": "tiếng Việt", "suggestion": ""}
{"verdict": "REJECTED", "confidence": 1.0, "flags": ["khong_lien_quan"], "explanation": "tiếng Việt", "suggestion": ""}
{"verdict": "NEEDS_REVIEW", "confidence": 0.5, "flags": [], "explanation": "tiếng Việt", "suggestion": "gợi ý admin"}"""


def moderate_task(task):
    """Kiểm duyệt task bằng AI Gemini + keyword blacklist."""
    from .models import TaskModeration
    from django.utils import timezone

    logger.info(f"[moderate_task] START Task#{task.id} title='{task.title[:50]}'")

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
        logger.info(f"[moderate_task] Task#{task.id} REJECTED by keyword blacklist: {blacklist_result['flags']}")
        return moderation

    # ⚡ BƯỚC 2: Nếu không bị blacklist → gọi AI Gemini để kiểm duyệt sâu hơn
    client = _get_gemini_client()
    if not client:
        # Không có AI → auto-approved (đã check blacklist rồi)
        logger.warning(f"[moderate_task] Task#{task.id} NO GEMINI CLIENT → auto-approved")
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

    logger.info(f"[moderate_task] Task#{task.id} calling Gemini...")
    ai_text = _safe_call_gemini(client, TASK_MODERATION_PROMPT, user_prompt, temperature=0.2, max_tokens=1024)
    logger.info(f"[moderate_task] Task#{task.id} Gemini response length: {len(ai_text) if ai_text else 0}")
    if ai_text:
        logger.info(f"[moderate_task] Task#{task.id} Gemini response preview: {ai_text[:300]}")

    if not ai_text:
        logger.warning(f"[moderate_task] Task#{task.id} AI no response → NEEDS_REVIEW")
        moderation, _ = TaskModeration.objects.update_or_create(
            task=task,
            defaults={'status': 'needs_review', 'ai_verdict': 'AI không phản hồi — chuyển admin duyệt.', 'ai_confidence': 0.0}
        )
        return moderation

    parsed = _parse_json_safe(ai_text)
    if not parsed:
        logger.warning(f"[moderate_task] Task#{task.id} AI parse failed → NEEDS_REVIEW. Raw: {ai_text[:200]}")
        moderation, _ = TaskModeration.objects.update_or_create(
            task=task,
            defaults={'status': 'needs_review', 'ai_verdict': 'Không parse được AI — chuyển admin duyệt.', 'ai_confidence': 0.0}
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

    logger.info(f"[moderate_task] Task#{task.id} verdict={verdict} → status={status} confidence={confidence}")

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


# ════════════════════════════════════════════════════════════════════
#  ASYNC MODERATION (tối ưu 2026-07-21)
# ════════════════════════════════════════════════════════════════════
# Trước đây: moderate_task chạy ĐỒNG BỘ trong perform_create → user chờ 18s
# Giờ: moderate_task_async tạo TaskModeration 'pending' ngay lập tức,
#       sau đó chạy Gemini trong background thread. Task xuất hiện ngay
#       trên feed (status='open', moderation='pending'). Khi AI xong:
#       - approved → update TaskModeration
#       - rejected → notify parent + xóa task
#       - fail → needs_review (admin duyệt thủ công)
#
# An toàn trên Render/gunicorn vì:
#  - Daemon thread nhẹ, không block response
#  - Django DB transaction đã commit task trước khi spawn thread
#  - Nếu thread bị kill → TaskModeration stuck 'pending' → admin review
#  - Task vẫn hiển thị trên feed (chỉ rejected mới bị ẩn)
# ════════════════════════════════════════════════════════════════════


def moderate_task_async(task):
    """
    Tạo TaskModeration 'pending' NGAY LẬP TỨC + chạy AI moderation trong
    background thread. Non-blocking — trả về moderation record pending.

    Flow:
        1. Sync: tạo TaskModeration(status='pending')
        2. Spawn daemon thread → gọi moderate_task(task)
        3. Trong thread:
           - approved → update TaskModeration
           - rejected → notify parent + xóa task
           - exception → needs_review
        4. Thread tự đóng DB connection khi xong

    Returns: TaskModeration (status='pending') — để caller biết moderation
    đang chạy ngầm.
    """
    import threading
    from django.db import connections
    from .models import TaskModeration

    # Bước 1: Tạo pending moderation record NGAY LẬP TỨC (sync, < 5ms)
    moderation, _ = TaskModeration.objects.update_or_create(
        task=task,
        defaults={
            'status': 'pending',
            'ai_verdict': 'Đang kiểm duyệt AI... (vài giây)',
            'ai_confidence': 0.0,
        }
    )

    task_id = task.id
    parent_id = task.parent_id if task.parent else None

    # Bước 2: Handler chạy trong background thread
    def _run_in_thread():
        try:
            # Re-fetch task (object trong memory có thể stale)
            from core.models import Task, Notification
            task_obj = Task.objects.select_related('parent', 'category').get(id=task_id)

            # Gọi moderate_task (sẽ tự update TaskModeration)
            result = moderate_task(task_obj)

            if result and result.status == 'rejected':
                # Notify parent + xóa task (cùng logic với bản sync cũ)
                parent = task_obj.parent
                reason = (result.ai_verdict or 'Vi phạm tiêu chuẩn cộng đồng')[:300]
                Notification.objects.create(
                    recipient=parent,
                    title="🚫 Công việc đã bị xóa",
                    message=f'Công việc "{task_obj.title}" đã bị AI xóa vì: {reason[:150]}. Vui lòng đăng lại nội dung phù hợp.',
                )
                # Push notification (best-effort)
                if parent and parent.expo_push_token:
                    try:
                        from core.views import send_expo_push_notification
                        send_expo_push_notification(
                            token=parent.expo_push_token,
                            title="🚫 Công việc bị xóa",
                            body=f'"{task_obj.title}" bị AI xóa: {reason[:100]}',
                            data={'type': 'task_rejected', 'task_id': task_id}
                        )
                    except Exception as push_err:
                        logger.warning(f"[async moderation] Push notif failed: {push_err}")
                # Xóa task
                task_obj.delete()
                logger.info(f"[async moderation] Task#{task_id} DELETED (rejected by AI)")
            else:
                logger.info(f"[async moderation] Task#{task_id} done → status={result.status if result else 'unknown'}")

        except Exception as e:
            logger.exception(f"[async moderation] Task#{task_id} FAILED: {e}")
            # Fallback: needs_review để admin duyệt thủ công
            try:
                TaskModeration.objects.filter(task_id=task_id, status='pending').update(
                    status='needs_review',
                    ai_verdict='AI kiểm duyệt thất bại — chuyển admin duyệt.',
                )
            except Exception:
                pass
        finally:
            # Đóng DB connections để tránh leak trên gunicorn
            connections.close_all()

    # Bước 3: Spawn thread (daemon=True → không block process shutdown)
    thread = threading.Thread(target=_run_in_thread, daemon=True, name=f"moderate-task-{task_id}")
    thread.start()
    logger.info(f"[async moderation] Thread spawned for Task#{task_id}")

    return moderation
