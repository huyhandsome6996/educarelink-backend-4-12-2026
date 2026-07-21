"""
╔══════════════════════════════════════════════════════════════╗
║     EduCareLink Keep-Alive Scheduler (In-Process)            ║
║     Tự ping server mỗi 3 phút — Render free không sleep      ║
║                                                              ║
║  Chạy bên trong Django process (gunicorn worker),            ║
║  không cần worker riêng, không cần DB, không cần Redis.       ║
║  Dùng APScheduler BackgroundScheduler + urllib.               ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import logging
import urllib.request
import urllib.error
import json
import time
import threading
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('educarelink.keepalive')

# ───────────────────────────────────────────────────────
# CẤU HÌNH
# ───────────────────────────────────────────────────────
RENDER_URL = os.environ.get('RENDER_URL', 'https://educarelink-backend.onrender.com')
PING_INTERVAL_MINUTES = int(os.environ.get('KEEPALIVE_INTERVAL', '3'))  # mặc định 3 phút
# ⚡ Mặc định TẮT để Render có thể sleep (tiết kiệm giờ free tier)
# Bật lại bằng cách set env var KEEPALIVE_ENABLED=true trên Render dashboard
ENABLE_KEEPALIVE = os.environ.get('KEEPALIVE_ENABLED', 'false').lower() == 'true'

# Chỉ chạy trên Render (production), không chạy local
IS_RENDER = os.environ.get('RENDER', '') == 'true'

# Thống kê (in-memory)
_stats = {
    'total_pings': 0,
    'successful': 0,
    'failed': 0,
    'last_ping': None,
    'last_status': None,
    'last_latency_ms': 0,
    'started_at': None,
}

_scheduler = None
_lock = threading.Lock()


def _ping_self():
    """Ping chính mình qua /api/health/ để giữ server thức."""
    health_url = f"{RENDER_URL.rstrip('/')}/api/health/"
    start = time.time()

    try:
        req = urllib.request.Request(health_url, headers={
            'User-Agent': 'EduCareLink-KeepAlive/2.0',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            latency = (time.time() - start) * 1000
            body = resp.read().decode('utf-8', errors='replace')
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                data = None

            _stats['total_pings'] += 1
            _stats['successful'] += 1
            _stats['last_ping'] = datetime.now().isoformat()
            _stats['last_status'] = 'ok'
            _stats['last_latency_ms'] = round(latency, 0)

            db_status = data.get('database', '?') if isinstance(data, dict) else '?'
            logger.info(
                f"[KeepAlive] Ping OK | {latency:.0f}ms | DB: {db_status} | "
                f"Total: {_stats['total_pings']} | Success: {_stats['successful']}"
            )
            return True

    except urllib.error.HTTPError as e:
        latency = (time.time() - start) * 1000
        _stats['total_pings'] += 1
        _stats['failed'] += 1
        _stats['last_ping'] = datetime.now().isoformat()
        _stats['last_status'] = f'HTTP {e.code}'
        _stats['last_latency_ms'] = round(latency, 0)
        logger.warning(
            f"[KeepAlive] Ping FAIL | HTTP {e.code} | {latency:.0f}ms | "
            f"Consecutive fails: {_stats['failed']}"
        )
        return False

    except Exception as e:
        latency = (time.time() - start) * 1000
        _stats['total_pings'] += 1
        _stats['failed'] += 1
        _stats['last_ping'] = datetime.now().isoformat()
        _stats['last_status'] = f'Error: {str(e)[:80]}'
        _stats['last_latency_ms'] = round(latency, 0)
        logger.warning(
            f"[KeepAlive] Ping FAIL | {str(e)[:80]} | "
            f"Consecutive fails: {_stats['failed']}"
        )
        return False


def get_stats():
    """Trả về thống kê keep-alive cho API endpoint."""
    return {
        'enabled': ENABLE_KEEPALIVE and IS_RENDER,
        'running': _scheduler is not None and _scheduler.running,
        'interval_minutes': PING_INTERVAL_MINUTES,
        'server_url': RENDER_URL,
        'stats': _stats.copy(),
    }


def start_scheduler():
    """Khởi động scheduler — chỉ chạy 1 lần, thread-safe."""
    global _scheduler

    # Không chạy nếu: bị tắt, không phải Render, hoặc đã chạy rồi
    if not ENABLE_KEEPALIVE:
        logger.info("[KeepAlive] DISABLED (KEEPALIVE_ENABLED != true)")
        return

    if not IS_RENDER:
        logger.info("[KeepAlive] SKIPPED — not running on Render (local dev)")
        return

    # ⚡ Cross-process lock — chống 2 gunicorn worker cùng start scheduler
    # (Render chạy WEB_CONCURRENCY=2, AppConfig.ready() chạy riêng mỗi worker)
    from core.scheduler_lock import acquire_scheduler_lock
    if acquire_scheduler_lock('keepalive') is None:
        logger.info("[KeepAlive] Lock bị worker khác giữ → skip start trên process này.")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[KeepAlive] Scheduler already running, skip.")
            return

        _stats['started_at'] = datetime.now().isoformat()

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        _scheduler.add_job(
            _ping_self,
            trigger=IntervalTrigger(minutes=PING_INTERVAL_MINUTES),
            id='keepalive_ping',
            name='EduCareLink Keep-Alive Ping',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(
            f"[KeepAlive] Scheduler STARTED | "
            f"Interval: every {PING_INTERVAL_MINUTES} min | "
            f"Target: {RENDER_URL}/api/health/"
        )

        # Ping ngay lần đầu (sau 10 giây để server sẵn sàng)
        from datetime import timedelta
        _scheduler.add_job(
            _ping_self,
            trigger='date',
            run_date=datetime.now() + timedelta(seconds=10),
            id='keepalive_initial_ping',
            name='EduCareLink Initial Ping',
            replace_existing=True,
        )


def shutdown_scheduler():
    """Dừng scheduler khi Django shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[KeepAlive] Scheduler stopped.")
