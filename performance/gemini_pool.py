"""
Gemini Client Pool — tái sử dụng HTTP client giữa các requests.

Lý do: mỗi lần gọi _get_gemini_client() sẽ tạo mới genai.Client →
init HTTP/2 connection + TLS handshake → ~200ms overhead per call.

Giải pháp: giữ 1 singleton client cho cả process, reuse connection.

Độ phức tạp:
- get_client(): O(1) — chỉ return reference
- Memory: O(1) — 1 client duy nhất
"""

import threading
import logging
from django.conf import settings

logger = logging.getLogger('educarelink.performance.gemini_pool')

# Singleton client — thread-safe (genai.Client đã handle concurrent calls)
_gemini_client_singleton = None
_gemini_init_lock = threading.Lock()
_gemini_init_attempted = False


def get_pooled_gemini_client():
    """
    Trả về singleton Gemini client (tạo mới lần đầu, reuse sau đó).
    Returns None nếu chưa config GEMINI_API_KEY.
    """
    global _gemini_client_singleton, _gemini_init_attempted

    # Fast path — đã init thành công
    if _gemini_client_singleton is not None:
        return _gemini_client_singleton

    # Fast path — đã thử + fail rồi (tránh retry mỗi request)
    if _gemini_init_attempted:
        return None

    with _gemini_init_lock:
        # Double-check sau khi acquire lock
        if _gemini_client_singleton is not None:
            return _gemini_client_singleton
        if _gemini_init_attempted:
            return None

        _gemini_init_attempted = True
        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return None

        try:
            from google import genai
            _gemini_client_singleton = genai.Client(api_key=gemini_key)
            logger.info('[GeminiPool] Singleton client initialized')
            return _gemini_client_singleton
        except Exception as e:
            logger.warning(f'[GeminiPool] Init failed: {e}')
            return None


def reset_gemini_client():
    """
    Reset client (cho test hoặc khi credentials đổi).
    """
    global _gemini_client_singleton, _gemini_init_attempted
    with _gemini_init_lock:
        _gemini_client_singleton = None
        _gemini_init_attempted = False


__all__ = ['get_pooled_gemini_client', 'reset_gemini_client']
