"""
Gemini Model Helper — centralized model name + fallback chain.

Lý do: Google thường xuyên deprecate model (gemini-1.5-flash → gemini-2.0-flash
→ gemini-2.5-flash → gemini-2.5-flash-lite). Thay vì hardcode 8 chỗ,
tất cả gọi qua helper này → chỉ cần đổi 1 chỗ.

Fallback chain (thử lần lượt):
1. gemini-2.5-flash-lite (mới nhất, ổn định, rẻ)
2. gemini-2.0-flash (backup, vẫn ổn định)
3. gemini-flash-latest (alias luôn trỏ model mới nhất)
4. gemini-1.5-flash (legacy fallback)

Nếu TẤT CẢ đều fail → return error thân thiện cho user.
"""

import logging
import os

logger = logging.getLogger('educarelink.performance.gemini_model')

# Fallback chain — thử lần lượt cho đến khi thành công
GEMINI_MODELS_FALLBACK = [
    'gemini-2.5-flash-lite',      # Model mặc định — ổn định + rẻ
    'gemini-2.5-flash',            # Backup — đôi khi vẫn hoạt động
    'gemini-2.0-flash',            # Backup cũ hơn
    'gemini-2.0-flash-lite',       # Backup lite
    'gemini-flash-latest',         # Alias luôn trỏ model mới nhất
    'gemini-1.5-flash',            # Legacy fallback cuối cùng
    'gemini-1.5-flash-latest',     # Legacy alias
]

# Cache model nào hoạt động (tránh thử lại chain mỗi request)
_working_model = None
_working_model_lock = None


def get_preferred_gemini_model():
    """
    Trả về model Gemini ưu tiên (cache sau lần đầu thành công).
    """
    global _working_model
    if _working_model:
        return _working_model

    # Cho phép override qua env var
    env_model = os.environ.get('GEMINI_MODEL', '')
    if env_model:
        _working_model = env_model
        return _working_model

    # Mặc định: model đầu tiên trong chain
    _working_model = GEMINI_MODELS_FALLBACK[0]
    return _working_model


def set_working_model(model_name):
    """
    Đánh dấu model nào hoạt động (gọi sau lần đầu thành công).
    """
    global _working_model
    _working_model = model_name
    logger.info(f'[GeminiModel] Working model set: {model_name}')


def get_fallback_chain():
    """Trả về list model để thử fallback."""
    return GEMINI_MODELS_FALLBACK


def generate_content_with_fallback(client, *, contents, system_instruction=None,
                                     temperature=0.7, max_output_tokens=2048):
    """
    Gọi generate_content với fallback chain.
    Trả về (response, model_used) hoặc raise Exception nếu tất cả fail.

    Args:
        client: genai.Client instance
        contents: list of content parts
        system_instruction: system prompt (optional)
        temperature: 0.0-1.0
        max_output_tokens: int

    Returns:
        (response_object, model_name_used)

    Raises:
        Exception với message tổng hợp nếu tất cả model fail
    """
    from google import genai

    config = genai.types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )

    # Thử model đang cache trước
    cached_model = get_preferred_gemini_model()
    try_order = [cached_model] + [m for m in GEMINI_MODELS_FALLBACK if m != cached_model]

    errors = []
    last_exception = None
    for model_name in try_order:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            # Success → cache model này
            if model_name != cached_model:
                set_working_model(model_name)
            return response, model_name
        except Exception as e:
            error_msg = str(e)
            errors.append(f'{model_name}: {error_msg[:120]}')
            last_exception = e
            # Log nhưng không raise — thử model tiếp theo
            logger.warning(f'[GeminiModel] {model_name} failed: {error_msg[:200]}')
            continue

    # Tất cả model fail — raise exception với message chi tiết
    # Phân loại lỗi: nếu TẤT CẢ đều 404/NOT_FOUND → Google đã deprecate hết
    all_not_found = all('not found' in e.lower() or '404' in e.lower() or 'not_available' in e.lower()
                        for e in errors)
    if all_not_found:
        raise GeminiAllModelsDeprecatedError(
            f'Tất cả model Gemini đều bị deprecated. '
            f'Đã thử: {", ".join(try_order)}. '
            f'Admin cần kiểm tra https://ai.google.dev/gemini-api/docs/models '
            f'để lấy model name mới nhất.'
        )
    # Lỗi khác (quota, API key, network)
    raise GeminiUnavailableError(
        f'Không thể gọi Gemini. Đã thử {len(try_order)} model. '
        f'Lỗi cuối: {str(last_exception)[:200]}'
    )


class GeminiAllModelsDeprecatedError(Exception):
    """Tất cả model trong fallback chain đều bị Google deprecated."""
    pass


class GeminiUnavailableError(Exception):
    """Gemini tạm thời không khả dụng (quota, network, API key)."""
    pass


__all__ = [
    'GEMINI_MODELS_FALLBACK',
    'get_preferred_gemini_model',
    'set_working_model',
    'get_fallback_chain',
    'generate_content_with_fallback',
]
