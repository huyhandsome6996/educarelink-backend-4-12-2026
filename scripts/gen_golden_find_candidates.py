"""Sinh golden output find_candidates() trên mã HIỆN TẠI (chạy trên commit cũ
pre-refactor để làm bản ghi vàng so sánh sau refactor).

Cách dùng:
    cd <repo> && DEBUG=True SECRET_KEY=dev python scripts/gen_golden_find_candidates.py

Output: matching/tests/golden_find_candidates.json
"""
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.environ.setdefault('DEBUG', 'True')
os.environ.setdefault('SECRET_KEY', 'dev-key-bench')

import django  # noqa: E402
django.setup()

from django.test.runner import DiscoverRunner  # noqa: E402
from django.test.utils import setup_test_environment  # noqa: E402


def main():
    setup_test_environment()
    runner = DiscoverRunner(verbosity=0, interactive=False)
    old_config = runner.setup_databases()
    try:
        from django.core.management import call_command
        call_command('seed_matching_config', verbosity=0)  # khớp MatchingTestBase.setUpTestData
        from matching.services.matching_service import find_candidates
        from matching.tests.test_matching_perf import (
            build_parity_fixture,
            normalize_result,
        )
        job = build_parity_fixture()
        result = find_candidates(job)
        out = normalize_result(result)
        path = os.path.join(BASE, 'matching', 'tests',
                            'golden_find_candidates.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        print(f"GOLDEN OK: total_matched={out['total_matched']}, "
              f"candidates={len(out['candidates'])} -> {path}")
    finally:
        runner.teardown_databases(old_config)


if __name__ == '__main__':
    main()
