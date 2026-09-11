"""
Gemini Model Helper — centralized model name + fallback chain.

Lý do: Google thường xuyên deprecate model (gemini-1.5-flash → gemini-2.0-flash
→ gemini-2.5-flash → gemini-2.5-flash-lite). Thay vì hardcode 8 chỗ,
tất cả gọi qua helper này → chỉ cần đổi 1 chỗ.

Fallback chain (thử lần lượt):
1. gemini-2.5-pro (model TỐT NHẤT — chất lượng cao nhất, dùng cho moderation + chatbot)
2. gemini-2.5-flash (backup — cân bằng tốc độ + chất lượng)
3. gemini-2.5-flash-lite (backup — rẻ + nhanh)
4. gemini-2.0-flash (backup cũ hơn)
5. gemini-flash-latest (alias luôn trỏ model mới nhất)
6. gemini-1.5-flash (legacy fallback cuối cùng)

Nếu TẤT CẢ đều fail → return error thân thiện cho user.

Lưu ý: gemini-2.5-pro chậm hơn flash (3-8s vs 1-3s) nhưng chất lượng
cao hơn đáng kể — đặc biệt cho AI moderation (kiểm duyệt nội dung vi phạm)
và chatbot (câu trả lời có tâm, context-aware).
"""

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError

logger = logging.getLogger('educarelink.performance.gemini_model')

# ── Ngân sách thời gian gọi Gemini (QA 2026-09-11: publish treo 26.5s vì
# Gemini chậm/quota không có timeout → mobile axios 10s cắt ngang → user
# thấy lỗi "Không đăng được bài" dù backend vẫn xử lý xong phía sau) ──
# GEMINI_CALL_TIMEOUT_S   : tối đa 1 lần gọi 1 model
# GEMINI_TOTAL_BUDGET_S   : tổng ngân sách cho cả fallback chain
GEMINI_CALL_TIMEOUT_S = float(os.environ.get('GEMINI_CALL_TIMEOUT_S', '8'))
GEMINI_TOTAL_BUDGET_S = float(os.environ.get('GEMINI_TOTAL_BUDGET_S', '14'))

# Fallback chain — thử lần lượt cho đến khi thành công
# ⚡ Đã quay lại flash-lite (nhanh hơn Pro, đủ chất lượng cho demo)
GEMINI_MODELS_FALLBACK = [
    'gemini-2.5-flash-lite',      # ⭐ Model mặc định — ổn định + rẻ + nhanh
    'gemini-2.5-flash',            # Backup — cân bằng tốc độ + chất lượng
    'gemini-2.5-pro',              # Backup — chậm nhưng chất lượng cao nhất
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
                                     temperature=0.7, max_output_tokens=2048,
                                     disable_thinking=False):
    """
    Gọi generate_content với fallback chain + NGÂN SÁCH THỜI GIAN cứng.
    Trả về (response, model_used) hoặc raise Exception nếu tất cả fail.

    QA 2026-09-11: trước đây hàm không có timeout — Gemini chậm/quota treo
    request 26.5s khiến mobile axios (10s) cắt ngang → lỗi "Không đăng được
    bài". Giờ mỗi model chỉ được tối đa GEMINI_CALL_TIMEOUT_S giây và cả
    chain không vượt quá GEMINI_TOTAL_BUDGET_S giây.

    Args:
        client: genai.Client instance
        contents: list of content parts
        system_instruction: system prompt (optional)
        temperature: 0.0-1.0
        max_output_tokens: int
        disable_thinking: True → đặt thinking_budget=0 (model 2.5 tốc độ nhanh,
            tránh tình trạng "thinking" ăn hết max_output_tokens trả text rỗng).
            Nếu model từ chối thinking_config thì tự retry không có nó.

    Returns:
        (response_object, model_name_used)

    Raises:
        Exception với message tổng hợp nếu tất cả model fail
    """
    from google import genai

    def _build_config(with_thinking_flag):
        kwargs = dict(
            system_instruction=system_instruction,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        if with_thinking_flag:
            kwargs['thinking_config'] = genai.types.ThinkingConfig(thinking_budget=0)
        return genai.types.GenerateContentConfig(**kwargs)

    # Thử model đang cache trước
    cached_model = get_preferred_gemini_model()
    try_order = [cached_model] + [m for m in GEMINI_MODELS_FALLBACK if m != cached_model]

    deadline = time.monotonic() + GEMINI_TOTAL_BUDGET_S
    errors = []
    last_exception = None

    # 1 worker duy nhất: request Gemini chạy nền, main thread chờ có hạn —
    # khi hết giờ bỏ qua model đó (thread cũ sẽ tự chết khi HTTP trả về)
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='gemini-call')
    try:
        for model_name in try_order:
            remaining = deadline - time.monotonic()
            if remaining < 1.0:
                errors.append(f'{model_name}: bỏ qua — hết ngân sách thời gian')
                continue
            per_call = min(GEMINI_CALL_TIMEOUT_S, remaining)

            use_thinking_flag = disable_thinking
            future = executor.submit(
                client.models.generate_content,
                model=model_name, contents=contents,
                config=_build_config(use_thinking_flag))
            try:
                response = future.result(timeout=per_call)
            except FutureTimeoutError:
                future.cancel()
                errors.append(f'{model_name}: timeout {per_call:.0f}s')
                last_exception = TimeoutError(f'{model_name} quá {per_call:.0f}s')
                logger.warning('[GeminiModel] %s timeout sau %.1fs — thử model kế tiếp',
                               model_name, per_call)
                continue
            except Exception as e:
                # Model chê thinking_config (2.0/1.5 không hỗ trợ) → thử lại
                # chính model đó KHÔNG có thinking_config trước khi bỏ qua
                if use_thinking_flag and 'thinking' in str(e).lower():
                    try:
                        response = client.models.generate_content(
                            model=model_name, contents=contents,
                            config=_build_config(False))
                    except Exception as e2:
                        error_msg = str(e2)
                        errors.append(f'{model_name}: {error_msg[:120]}')
                        last_exception = e2
                        logger.warning('[GeminiModel] %s failed (no-thinking retry): %s',
                                       model_name, error_msg[:200])
                        continue
                else:
                    error_msg = str(e)
                    errors.append(f'{model_name}: {error_msg[:120]}')
                    last_exception = e
                    logger.warning('[GeminiModel] %s failed: %s',
                                   model_name, error_msg[:200])
                    continue

            # Success → cache model này
            if model_name != cached_model:
                set_working_model(model_name)
            return response, model_name
    finally:
        executor.shutdown(wait=False)

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
