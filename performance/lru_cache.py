"""
LRU Cache implementation — cấu trúc dữ liệu cho AI response memoization.

DSU lý thuyết:
- Kết hợp Hash Map (O(1) lookup) + Doubly Linked List (O(1) insert/delete)
- OrderedDict của Python đã implement sẵn pattern này
- Khi cache đầy → loại bỏ entry ít dùng nhất (LRU policy)

Ứng dụng: cache AI prompt → response để tránh gọi Gemini lại cho cùng prompt.
Lợi ích: giảm 90% thời gian response cho AI calls lặp lại.

Độ phức tạp:
- get(key): O(1)
- put(key, value): O(1)
- Memory: O(capacity)
"""

import hashlib
import threading
import time
from collections import OrderedDict
from functools import wraps
from typing import Any, Callable, Optional


class LRUCache:
    """
    Thread-safe LRU Cache với TTL support.
    - capacity: số entry tối đa (LRU eviction khi đầy)
    - ttl: thời gian sống mỗi entry (seconds), 0 = vĩnh viễn
    """

    def __init__(self, capacity: int = 100, ttl: float = 300):
        self.capacity = max(1, capacity)
        self.ttl = max(0, ttl)
        self._cache: OrderedDict = OrderedDict()
        self._lock = threading.RLock()
        self._stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'expired': 0,
        }

    def _make_key(self, *args, **kwargs) -> str:
        """Tạo hash key từ args + kwargs (để cache bất kỳ input nào)."""
        raw = repr((args, sorted(kwargs.items())))
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]

    def get(self, key: str) -> Optional[Any]:
        """Lấy giá trị từ cache. Trả None nếu miss hoặc expired."""
        with self._lock:
            if key not in self._cache:
                self._stats['misses'] += 1
                return None

            value, expires_at = self._cache[key]

            # Check TTL
            if self.ttl > 0 and time.time() > expires_at:
                del self._cache[key]
                self._stats['expired'] += 1
                self._stats['misses'] += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._stats['hits'] += 1
            return value

    def put(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Thêm entry vào cache. Evict LRU nếu đầy."""
        with self._lock:
            effective_ttl = self.ttl if ttl is None else ttl
            expires_at = time.time() + effective_ttl if effective_ttl > 0 else float('inf')

            if key in self._cache:
                # Update existing + move to end
                self._cache[key] = (value, expires_at)
                self._cache.move_to_end(key)
            else:
                # Evict LRU if at capacity
                while len(self._cache) >= self.capacity:
                    self._cache.popitem(last=False)  # FIFO (oldest = LRU)
                    self._stats['evictions'] += 1

                self._cache[key] = (value, expires_at)

    def get_or_compute(self, key: str, compute_fn: Callable[[], Any], ttl: Optional[float] = None) -> Any:
        """
        Lấy từ cache, nếu miss thì compute_fn() + cache kết quả.
        Đây là pattern memoization (top-down DP).
        """
        cached_value = self.get(key)
        if cached_value is not None:
            return cached_value

        # Compute + cache
        value = compute_fn()
        if value is not None:
            self.put(key, value, ttl)
        return value

    def invalidate(self, key: str) -> None:
        """Xoá 1 entry khỏi cache."""
        with self._lock:
            self._cache.pop(key, None)

    def clear(self) -> None:
        """Xoá toàn bộ cache."""
        with self._lock:
            self._cache.clear()

    def stats(self) -> dict:
        """Trả về thống kê cache (hit rate, size, evictions)."""
        with self._lock:
            total = self._stats['hits'] + self._stats['misses']
            hit_rate = (self._stats['hits'] / total * 100) if total > 0 else 0
            return {
                'size': len(self._cache),
                'capacity': self.capacity,
                'hit_rate': round(hit_rate, 2),
                **self._stats,
            }


# ═══════════════════════════════════════════════════════════════════
#  DECORATOR cho memoization — dùng cho AI calls
# ═══════════════════════════════════════════════════════════════════

# Singleton caches (1 instance per process)
_AI_RESPONSE_CACHE = LRUCache(capacity=200, ttl=600)  # 10 phút, 200 entries
_MODERATION_CACHE = LRUCache(capacity=100, ttl=1800)  # 30 phút, 100 entries


def cached(cache: LRUCache = None, key_fn: Callable = None, ttl: Optional[float] = None):
    """
    Decorator memoization cho functions.

    Usage:
        @cached(cache=_AI_RESPONSE_CACHE)
        def call_gemini(prompt): ...

    Args:
        cache: LRUCache instance (mặc định dùng _AI_RESPONSE_CACHE)
        key_fn: function để generate key từ args (mặc định dùng hash args)
        ttl: override TTL của cache
    """
    if cache is None:
        cache = _AI_RESPONSE_CACHE

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Generate key
            if key_fn:
                key = key_fn(*args, **kwargs)
            else:
                # Skip 'self' if it's a method (use class name + args)
                cache_args = args[1:] if args and hasattr(args[0], fn.__name__) else args
                key = cache._make_key(fn.__name__, *cache_args, **kwargs)

            return cache.get_or_compute(key, lambda: fn(*args, **kwargs), ttl)
        wrapper._cache = cache
        return wrapper

    return decorator


def get_ai_cache_stats() -> dict:
    """Stats cho AI response cache."""
    return _AI_RESPONSE_CACHE.stats()


def get_moderation_cache_stats() -> dict:
    """Stats cho moderation cache."""
    return _MODERATION_CACHE.stats()


def invalidate_ai_cache_for_prompt(prompt: str) -> None:
    """Xoá cache entry cho 1 prompt cụ thể."""
    key = _AI_RESPONSE_CACHE._make_key(prompt)
    _AI_RESPONSE_CACHE.invalidate(key)


# Export singleton caches để modules khác dùng
__all__ = [
    'LRUCache', 'cached',
    '_AI_RESPONSE_CACHE', '_MODERATION_CACHE',
    'get_ai_cache_stats', 'get_moderation_cache_stats',
    'invalidate_ai_cache_for_prompt',
]
