"""Benchmark THẬT cho Task perf 1 (khử N+1 find_candidates).

Đo trên test DB riêng (không đụng db.sqlite3):
  - số query của find_candidates() (CaptureQueriesContext)
  - thời gian chạy (best-of-3)

Cách chạy (chạy trên MỖI phiên bản code muốn so sánh):
    cd <repo> && DEBUG=True SECRET_KEY=dev python scripts/bench_find_candidates.py

Output: bảng N=10/100/500 → in stdout, để số liệu vào PR description.
"""
import os
import sys
import time as _time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.environ.setdefault('DEBUG', 'True')
os.environ.setdefault('SECRET_KEY', 'dev-key-bench')

import django  # noqa: E402
django.setup()

from datetime import time  # noqa: E402

from django.contrib.auth import get_user_model  # noqa: E402
from django.db import connection  # noqa: E402
from django.test.runner import DiscoverRunner  # noqa: E402
from django.test.utils import CaptureQueriesContext, setup_test_environment  # noqa: E402
from django.utils import timezone as tz  # noqa: E402

MONDAY = tz.localdate() + tz.timedelta(days=(7 - tz.localdate().weekday()) % 7 or 7)
# Đảm bảo MONDAY là thứ 2 tuần tới (không trùng hôm nay lặp)
if MONDAY.weekday() != 0:
    MONDAY = MONDAY + tz.timedelta(days=(0 - MONDAY.weekday()))


def build_bench_db(n):
    """Tạo parent + job + N CP đủ điều kiện (avail cover, trong bán kính)."""
    from matching.management.commands.seed_matching_config import Command as SeedCmd
    SeedCmd().run_verbosity = 0
    from django.core.management import call_command
    call_command('seed_matching_config', verbosity=0)

    from matching.models import (CarePartnerAvailability, JobPost, JobSlot)
    from matching.services.elo_service import EloService

    User = get_user_model()
    parent = User.objects.create_user(f'bench_parent_{n}', password='x',
                                      role='parent', latitude=21.0, longitude=105.8)
    job = JobPost.objects.create(
        parent=parent, job_type='tutoring', hourly_rate_vnd=100000,
        status='ai_parsed', latitude=21.0, longitude=105.8,
        ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
    JobSlot.objects.create(job=job, date=MONDAY, time_from=time(19, 0),
                           time_to=time(21, 0))
    for i in range(n):
        u = User.objects.create_user(f'bench_cp_{n}_{i}', password='x',
                                     role='worker', is_approved=True,
                                     latitude=21.0 + (i % 100) * 0.0004,
                                     longitude=105.8)
        EloService.get_profile(u)
        CarePartnerAvailability.objects.create(
            carepartner=u, weekday=MONDAY.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))
    return job


def measure(job, runs=3):
    from matching.services.matching_service import find_candidates
    best_time = None
    queries = None
    connection.queries_log.clear()  # tránh tràn deque 9000 gây đếm sai
    for _ in range(runs):
        with CaptureQueriesContext(connection) as ctx:
            t0 = _time.perf_counter()
            result = find_candidates(job)
            elapsed = _time.perf_counter() - t0
        queries = len(ctx)
        best_time = elapsed if best_time is None else min(best_time, elapsed)
    return result['total_matched'], queries, best_time


def main():
    setup_test_environment()
    runner = DiscoverRunner(verbosity=0, interactive=False)
    old_config = runner.setup_databases()
    try:
        print(f"{'N':>5} | {'total_matched':>13} | {'queries':>7} | {'time_ms':>9}")
        print('-' * 44)
        for n in (10, 100, 500):
            job = build_bench_db(n)
            total, queries, secs = measure(job)
            print(f"{n:>5} | {total:>13} | {queries:>7} | {secs * 1000:>9.1f}")
            # Dời batch CP vừa đo ra xa để không lọt vào vòng đo kế tiếp
            User = get_user_model()
            User.objects.filter(username__startswith=f'bench_cp_{n}_').update(
                latitude=22.0, longitude=120.0)
    finally:
        runner.teardown_databases(old_config)


if __name__ == '__main__':
    main()
