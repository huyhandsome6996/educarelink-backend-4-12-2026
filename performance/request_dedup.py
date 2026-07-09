"""
Request Deduplication — gộp nhiều requests giống nhau thành 1.

DSA: Hash table + Future pattern
- Khi request A đang chạy, request B (cùng key) đến → B đợi A xong, dùng kết quả A
- Giảm tải backend khi nhiều clients cùng request 1 dữ liệu

Ứng dụng: 10 phụ huynh cùng xem task #42 trong 5s → chỉ 1 DB query, 10 clients dùng chung kết quả.

Độ phức tạp:
- deduplicate_request(): O(1) hash lookup
- Memory: O(n) với n = số request đang chạy
"""

import threading
from concurrent.futures import Future
from typing import Callable, Any
import hashlib


class RequestDeduplicator:
    """
    Deduplicate concurrent requests cùng key.
    Thread-safe.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._inflight: dict[str, Future] = {}

    def deduplicate(self, key: str, fn: Callable[[], Any], timeout: float = 30) -> Any:
        """
        Nếu key đang có request chạy → đợi + return kết quả.
        Nếu không → chạy fn() + cache kết quả cho requests sau.

        Args:
            key: unique key per request type (vd: f"task_detail:{task_id}")
            fn: function để execute nếu miss
            timeout: max seconds đợi

        Returns:
            Result của fn()
        """
        with self._lock:
            existing = self._inflight.get(key)
            if existing is not None:
                # Request đang chạy → đợi
                pass
            else:
                # Tạo future mới
                future = Future()
                self._inflight[key] = future
                existing = future
                # Release lock trước khi gọi fn() (fn có thể chậm)
                threading.Thread(
                    target=self._execute,
                    args=(key, fn, future),
                    daemon=True,
                ).start()

        # Đợi future complete
        return existing.result(timeout=timeout)

    def _execute(self, key: str, fn: Callable, future: Future):
        """Execute fn() + set result vào future + cleanup."""
        try:
            result = fn()
            future.set_result(result)
        except Exception as e:
            future.set_exception(e)
        finally:
            with self._lock:
                self._inflight.pop(key, None)


# Singleton deduplicator cho cả process
_deduplicator = RequestDeduplicator()


def deduplicate_request(key: str, fn: Callable[[], Any], timeout: float = 30) -> Any:
    """
    Helper function để deduplicate request.

    Usage:
        result = deduplicate_request(
            f'task_detail:{task_id}',
            lambda: Task.objects.select_related('parent').get(id=task_id)
        )
    """
    return _deduplicator.deduplicate(key, fn, timeout)


def make_key(*args, **kwargs) -> str:
    """Tạo hash key từ args."""
    raw = repr((args, sorted(kwargs.items())))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]


__all__ = ['RequestDeduplicator', 'deduplicate_request', 'make_key']
