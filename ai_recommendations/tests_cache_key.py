"""
ai_recommendations/tests_cache_key.py — Test Task perf 2: stable cache key (md5 thay built-in hash).

Core bug: built-in hash() bị randomize theo PYTHONHASHSEED → cache key đổi
giữa các process → hit rate ~0. Sau fix dùng md5 xác định — test gồm:
  - 2 process Python RIÊNG BIỆT (subprocess, PYTHONHASHSEED khác nhau) ra CÙNG key
  - [3,1,2] và [1,2,3] cùng key (đã sort)
  - 2 tập khác nhau → 2 key khác nhau
"""
import os
import subprocess
import sys
from decimal import Decimal
from datetime import datetime, timedelta

from django.test import TestCase

from ai_recommendations.services import (
    PARENT_CACHE_PREFIX,
    WORKER_CACHE_PREFIX,
    _stable_hash,
    build_parent_cache_key,
    build_worker_cache_key,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))




class StableCacheKeyTests(TestCase):
    """Cache key phải XÁC ĐỊNH (không phụ thuộc process)."""

    def test_order_independence(self):
        """[3,1,2] và [1,2,3] (cùng tập, khác thứ tự) → CÙNG key."""
        a = build_worker_cache_key(7, [3, 1, 2])
        b = build_worker_cache_key(7, [1, 2, 3])
        self.assertEqual(a, b)

    def test_different_sets_different_keys(self):
        """2 tập ID khác nhau → 2 key khác nhau (không collision thực tế)."""
        a = build_worker_cache_key(7, [1, 2, 3])
        b = build_worker_cache_key(7, [1, 2, 4])
        self.assertNotEqual(a, b)
        c = build_parent_cache_key(9, [1, 2, 3])
        d = build_parent_cache_key(9, [1, 2, 3, 4])
        self.assertNotEqual(c, d)

    def test_prefix_and_format_preserved(self):
        """Giữ nguyên prefix + format {prefix}{id}_{hash12} (hex 12 ký tự)."""
        key = build_worker_cache_key(42, [10, 20])
        self.assertTrue(key.startswith(WORKER_CACHE_PREFIX))
        suffix = key[len(WORKER_CACHE_PREFIX) + len('42_'):]
        self.assertEqual(len(suffix), 12)
        int(suffix, 16)  # hex hợp lệ
        pkey = build_parent_cache_key(5, [1])
        self.assertTrue(pkey.startswith(PARENT_CACHE_PREFIX))

    def test_stable_hash_accepts_strings_of_ints(self):
        """ID dạng chuỗi số cũng được chuẩn hóa int (khớp hành vi sort cũ)."""
        self.assertEqual(_stable_hash(['3', '1', '2']), _stable_hash([3, 1, 2]))

    def test_same_key_across_two_processes(self):
        """Cùng input trong 2 process Python RIÊNG BIỆT (PYTHONHASHSEED khác
        nhau) → CÙNG 1 key. Đây là core bug trước đây: hash() random theo
        seed mỗi process → key lệch giữa các Gunicorn worker."""
        code = (
            "import django; django.setup();"
            "from ai_recommendations.services import build_worker_cache_key, build_parent_cache_key;"
            "k1 = build_worker_cache_key(7, [3, 1, 2]);"
            "k2 = build_parent_cache_key(9, [11, 5, 8]);"
            "print('RESULT:' + k1 + '|' + k2)"
        )
        env = {
            'PYTHONHASHSEED': '1', 'DJANGO_SETTINGS_MODULE': 'backend.settings',
            'DEBUG': 'True', 'SECRET_KEY': 'dev-key-tests',
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
        }
        env2 = dict(env, PYTHONHASHSEED='99999')
        outs = []
        for e in (env, env2):
            r = subprocess.run(
                [sys.executable, '-c', code], capture_output=True, text=True,
                cwd=REPO_ROOT, env=e, timeout=60)
            self.assertEqual(r.returncode, 0,
                             f'subprocess fail: {r.stderr[-500:]}')
            result_lines = [l for l in r.stdout.splitlines()
                            if l.startswith('RESULT:')]
            self.assertEqual(len(result_lines), 1,
                             f'stdout bất thường: {r.stdout[-500:]}')
            worker_key, parent_key = result_lines[0][len('RESULT:'):].split('|')
            outs.append((worker_key, parent_key))
        self.assertEqual(outs[0], outs[1],
                         'Cache key PHẢI giống nhau giữa 2 process có '
                         'PYTHONHASHSEED khác nhau')
