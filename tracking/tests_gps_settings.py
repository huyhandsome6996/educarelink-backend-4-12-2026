"""
Test cấu hình GPS settings — BUG QA 2026-09-13 (Blocker C).

Bối cảnh: backend/settings.py từng GHI ĐÈ biến môi trường bằng khối
hardcode ở cuối file:

    GPS_FRESHNESS_HOURS = int(os.environ.get('GPS_FRESHNESS_HOURS', '48'))  # env
    ...
    GPS_FRESHNESS_HOURS = 48        # ← GHI ĐÈ env — env không bao giờ có tác dụng
    MAX_GPS_DRIFT_KM = 50.0         # ← GHI ĐÈ env

Đã xóa khối hardcode → duy nhất 1 nguồn sự thật: env với default 48 / 50.
Test này spawn subprocess với env đặt trước để xác nhận settings ĐỌC ĐƯỢC
env (import settings trong-process sẽ vô ích vì giá trị chốt lúc import).

Chạy: python manage.py test tracking.tests_gps_settings
"""

import os
import re
import subprocess
import sys

from django.test import TestCase

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_PROBE_CODE = (
    "import os\n"
    "import django\n"
    "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')\n"
    "django.setup()\n"
    "from django.conf import settings\n"
    "print(int(settings.GPS_FRESHNESS_HOURS), float(settings.MAX_GPS_DRIFT_KM))\n"
)


def _probe(extra_env):
    env = {k: v for k, v in os.environ.items()
           if k not in ('GPS_FRESHNESS_HOURS', 'MAX_GPS_DRIFT_KM')}
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, '-c', _PROBE_CODE],
        cwd=REPO_ROOT, env=env,
        capture_output=True, text=True, timeout=120,
    )


def _probe_values(extra_env):
    """Chạy probe, trả về (freshness, drift) từ DÒNG CUỐI stdout (tránh log app-ready)."""
    proc = _probe(extra_env)
    last_line = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ''
    return proc, last_line.split()


class GpsSettingsEnvTests(TestCase):
    """GPS settings phải đọc từ biến môi trường — không bị hardcode ghi đè."""

    def test_env_overrides_take_effect(self):
        """Đặt GPS_FRESHNESS_HOURS=7 / MAX_GPS_DRIFT_KM=12.5 → settings phải là 7 / 12.5.

        Trước khi fix, khối hardcode cuối settings.py đè env → giá trị luôn
        48 / 50 dù env đặt gì (BUG Blocker C)."""
        proc, values = _probe_values(
            {'GPS_FRESHNESS_HOURS': '7', 'MAX_GPS_DRIFT_KM': '12.5'})
        self.assertEqual(
            proc.returncode, 0,
            f'Probe thất bại:\nstdout={proc.stdout}\nstderr={proc.stderr}')
        self.assertEqual(values, ['7', '12.5'])

    def test_defaults_when_env_missing(self):
        """Không đặt env → settings dùng default 48 giờ / 50 km (khối env chuẩn)."""
        proc, values = _probe_values({})
        self.assertEqual(
            proc.returncode, 0,
            f'Probe thất bại:\nstdout={proc.stdout}\nstderr={proc.stderr}')
        self.assertEqual(values, ['48', '50.0'])

    def test_settings_module_has_single_assignment(self):
        """Chốt hạ: source settings.py chỉ được gán GPS_FRESHNESS_HOURS /
        MAX_GPS_DRIFT_KM ĐÚNG 1 LẦN (chặn regression copy-paste khối hardcode)."""
        settings_path = os.path.join(REPO_ROOT, 'backend', 'settings.py')
        with open(settings_path, encoding='utf-8') as f:
            source = f.read()
        for var in ('GPS_FRESHNESS_HOURS', 'MAX_GPS_DRIFT_KM'):
            assignments = re.findall(
                rf'^(?!\s*#)\s*{var}\s*=', source, re.MULTILINE)
            self.assertEqual(
                len(assignments), 1,
                f'settings.py chỉ được gán {var} đúng 1 lần (khối env — chặn '
                f'regression khối hardcode ghi đè env)')
