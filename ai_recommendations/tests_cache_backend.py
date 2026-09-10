"""
ai_recommendations/tests_cache_backend.py — Test Task perf 3: CACHES theo REDIS_URL.

- REDIS_URL có giá trị → RedisCache built-in Django (prod Render/Railway).
- REDIS_URL trống → fallback LocMemCache như cũ (dev/test/CI không cần Redis).
- Giá trị cache (Decimal/datetime/list tuple) phải set/get tròn trịa (pickle).
- Test Redis thật chỉ chạy khi Redis reachable — CI không có Redis thì SKIP rõ ràng.
"""
import os
from datetime import datetime, timedelta
from decimal import Decimal
from django.core.cache import cache
from django.test import TestCase



class CacheBackendConfigTests(TestCase):
    """Task perf 3 — CACHES theo REDIS_URL, fallback LocMem không cần Redis."""

    def test_no_redis_url_uses_locmem(self):
        """Không có REDIS_URL → LocMemCache (giữ nguyên môi trường dev/test)."""
        from backend.settings import _build_caches
        cfg = _build_caches('')
        self.assertEqual(cfg['default']['BACKEND'],
                         'django.core.cache.backends.locmem.LocMemCache')
        self.assertEqual(cfg['default']['LOCATION'], 'educarelink-cache')
        self.assertEqual(cfg['default']['TIMEOUT'], 300)
        self.assertEqual(cfg['default']['OPTIONS']['MAX_ENTRIES'], 1000)

    def test_redis_url_builds_redis_backend(self):
        """Có REDIS_URL → RedisCache built-in Django với LOCATION = url."""
        from backend.settings import _build_caches
        cfg = _build_caches('redis://user:pass@host:6379/1')
        self.assertEqual(cfg['default']['BACKEND'],
                         'django.core.cache.backends.redis.RedisCache')
        self.assertEqual(cfg['default']['LOCATION'],
                         'redis://user:pass@host:6379/1')
        self.assertEqual(cfg['default']['TIMEOUT'], 300)
        self.assertEqual(cfg['default']['KEY_PREFIX'], 'educarelink')

    def test_default_cache_set_get_pickleable_values(self):
        """Giá trị đang cache trong app (Decimal/datetime/list tuple dict)
        phải set/get tròn trịa với backend hiện hành của môi trường test
        (LocMem) — đồng bộ với backend Redis (pickle mặc định)."""
        payload = {
            'dec': Decimal('19.99'),
            'dt': datetime(2026, 9, 10, 8, 30, 0),
            'slots': [(timedelta(hours=1), timedelta(hours=2))],
            'dict': {'a': [1, 2, {'b': 'c'}]},
        }
        cache.set('perf3:test:key', payload, 30)
        got = cache.get('perf3:test:key')
        self.assertEqual(got, payload)
        self.assertIsNone(cache.get('perf3:test:missing'))
        cache.delete('perf3:test:key')
        self.assertIsNone(cache.get('perf3:test:key'))


def _redis_reachable(url):
    """True nếu REDIS_URL trỏ tới Redis đang sống (chỉ TCP probe)."""
    import socket
    from urllib.parse import urlparse
    try:
        p = urlparse(url)
        host, port = p.hostname or 'localhost', p.port or 6379
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


class LiveRedisCacheTests(TestCase):
    """Chỉ chạy khi môi trường CÓ Redis thật (REDIS_URL set + reachable).
    CI/dev không có Redis → SKIP rõ ràng, không đỏ."""

    def setUp(self):
        url = os.environ.get('REDIS_URL', '')
        if not url or not _redis_reachable(url):
            self.skipTest('REDIS_URL chưa set hoặc Redis không reachable — '
                          'bỏ qua test Redis thật (fallback LocMem đã test ở trên)')
        self.url = url

    def test_redis_roundtrip(self):
        """Round-trip set/get/delete trên Redis thật (khớp backend prod)."""
        from django.core.cache.backends.redis import RedisCache
        backend = RedisCache(self.url, {'TIMEOUT': 30, 'KEY_PREFIX': 't3'})
        payload = {'slots': [(1, 2)], 'n': Decimal('1.5')}
        backend.set('perf3:live', payload, 30)
        self.assertEqual(backend.get('perf3:live'), payload)
        backend.delete('perf3:live')
        self.assertIsNone(backend.get('perf3:live'))
