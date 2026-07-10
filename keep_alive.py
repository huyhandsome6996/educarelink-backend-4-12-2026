#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║           EduCareLink Keep-Alive Tool v1.0                   ║
║   Giữ server Render luôn thức — không bị sleep!             ║
║                                                              ║
║   • Ping mỗi 3 phút để Render free không sleep               ║
║   • AI health check mỗi 30 phút bằng Gemini                  ║
║   • Thống kê uptime, latency, lỗi realtime                   ║
║   • Log chi tiết ra file + terminal                          ║
╚══════════════════════════════════════════════════════════════╝

Cách chạy:
    python keep_alive.py

Cấu hình qua biến môi trường (hoặc sửa trực tiếp):
    RENDER_URL     — URL server Render (mặc định: https://educarelink-backend.onrender.com)
    GEMINI_KEY     — Gemini API key (nếu có, bật AI health check)
    PING_INTERVAL  — Khoảng ping tính bằng giây (mặc định: 180 = 3 phút)
    AI_INTERVAL    — Khoảng AI check tính bằng phút (mặc định: 30)

Yêu cầu:
    pip install requests  (chỉ cần nếu muốn AI health check)
    Nếu không có requests, chỉ dùng urllib tiêu chuẩn.
"""

import urllib.request
import urllib.error
import json
import time
import sys
import os
import logging
import datetime
import signal
import threading

# ═══════════════════════════════════════════════════════
# CẤU HÌNH
# ═══════════════════════════════════════════════════════
RENDER_URL = os.environ.get('RENDER_URL', 'https://educarelink-backend.onrender.com')
GEMINI_KEY = os.environ.get('GEMINI_KEY', os.environ.get('GEMINI_API_KEY', ''))
PING_INTERVAL = int(os.environ.get('PING_INTERVAL', '180'))    # 3 phút
AI_CHECK_INTERVAL = int(os.environ.get('AI_INTERVAL', '30'))   # 30 phút
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'keep_alive.log')

# ═══════════════════════════════════════════════════════
# MÀU TERMINAL
# ═══════════════════════════════════════════════════════
class Color:
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    DIM = '\033[2m'
    BG_GREEN = '\033[42m'
    BG_RED = '\033[41m'

    @staticmethod
    def support_color():
        """Kiểm tra terminal có hỗ trợ màu không."""
        if os.name == 'nt':
            return False
        if not hasattr(sys.stdout, 'isatty'):
            return False
        return sys.stdout.isatty()

USE_COLOR = Color.support_color()

def c(text, *colors):
    """Tô màu text nếu terminal hỗ trợ."""
    if not USE_COLOR:
        return str(text)
    return ''.join(colors) + str(text) + Color.RESET

# ═══════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════
logger = logging.getLogger('keep_alive')
logger.setLevel(logging.DEBUG)

# File handler — log mọi thứ
fh = logging.FileHandler(LOG_FILE, encoding='utf-8')
fh.setLevel(logging.DEBUG)
fh.setFormatter(logging.Formatter('%(asctime)s | %(levelname)-7s | %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
logger.addHandler(fh)

# Console handler — chỉ INFO trở lên
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
ch.setFormatter(logging.Formatter('%(message)s'))
logger.addHandler(ch)

# ═══════════════════════════════════════════════════════
# THỐNG KÊ
# ═══════════════════════════════════════════════════════
class Stats:
    def __init__(self):
        self.total_pings = 0
        self.successful = 0
        self.failed = 0
        self.total_latency = 0.0
        self.min_latency = float('inf')
        self.max_latency = 0.0
        self.ai_checks = 0
        self.start_time = time.time()
        self.last_success = None
        self.last_fail = None
        self.consecutive_fails = 0
        self.max_consecutive_fails = 0

    @property
    def uptime_pct(self):
        if self.total_pings == 0:
            return 100.0
        return (self.successful / self.total_pings) * 100

    @property
    def avg_latency(self):
        if self.successful == 0:
            return 0.0
        return self.total_latency / self.successful

    @property
    def running_time(self):
        elapsed = int(time.time() - self.start_time)
        hours, remainder = divmod(elapsed, 3600)
        minutes, seconds = divmod(remainder, 60)
        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"

stats = Stats()

# ═══════════════════════════════════════════════════════
# SHUTDOWN FLAG
# ═══════════════════════════════════════════════════════
running = True

def signal_handler(sig, frame):
    global running
    print()  # newline after ^C
    logger.info(c("🛑 Đang dừng keep-alive...", Color.YELLOW, Color.BOLD))
    running = False

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# ═══════════════════════════════════════════════════════
# BANNER
# ═══════════════════════════════════════════════════════
def show_banner():
    banner = f"""
{c('╔══════════════════════════════════════════════════════════════╗', Color.CYAN, Color.BOLD)}
{c('║', Color.CYAN, Color.BOLD)}  {c('EduCareLink Keep-Alive Tool v1.0', Color.WHITE, Color.BOLD)}                        {c('║', Color.CYAN, Color.BOLD)}
{c('║', Color.CYAN, Color.BOLD)}  Giữ Render luôn thức — không bị sleep!               {c('║', Color.CYAN, Color.BOLD)}
{c('╚══════════════════════════════════════════════════════════════╝', Color.CYAN, Color.BOLD)}

  {c('Server:', Color.BOLD)}     {RENDER_URL}
  {c('Ping:', Color.BOLD)}       Mỗi {PING_INTERVAL}s ({PING_INTERVAL // 60} phút)
  {c('AI Check:', Color.BOLD)}   Mỗi {AI_CHECK_INTERVAL} phút {c('(có Gemini key)', Color.GREEN) if GEMINI_KEY else c('(không có Gemini key — tắt)', Color.DIM)}
  {c('Log file:', Color.BOLD)}   {LOG_FILE}
"""
    logger.info(banner)

# ═══════════════════════════════════════════════════════
# PING CHÍNH
# ═══════════════════════════════════════════════════════
def ping_server(url):
    """Ping server, trả về (status_code, latency_ms, response_data)."""
    start = time.time()
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'EduCareLink-KeepAlive/1.0',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            latency = (time.time() - start) * 1000
            body = resp.read().decode('utf-8', errors='replace')
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                data = None
            return resp.status, latency, data
    except urllib.error.HTTPError as e:
        latency = (time.time() - start) * 1000
        return e.code, latency, None
    except Exception as e:
        latency = (time.time() - start) * 1000
        return None, latency, str(e)


def do_ping():
    """Thực hiện 1 lần ping và cập nhật thống kê."""
    stats.total_pings += 1
    ping_num = stats.total_pings

    now = datetime.datetime.now().strftime('%H:%M:%S')

    # Ping health endpoint
    health_url = f"{RENDER_URL.rstrip('/')}/api/health/"
    code, latency, data = ping_server(health_url)

    # Nếu health endpoint lỗi → thử root URL (server vẫn có thể đang thức)
    if code != 200:
        root_code, root_latency, _ = ping_server(RENDER_URL.rstrip('/') + '/')
        if root_code and root_code < 500:
            code, latency, data = root_code, root_latency, {"status": "ok", "note": "via root URL"}

    if code == 200 and data and (data.get('status') == 'ok' or isinstance(data, dict)):
        stats.successful += 1
        stats.total_latency += latency
        stats.min_latency = min(stats.min_latency, latency)
        stats.max_latency = max(stats.max_latency, latency)
        stats.last_success = datetime.datetime.now()
        stats.consecutive_fails = 0

        db_status = data.get('database', '?') if isinstance(data, dict) else '?'
        latency_str = f"{latency:.0f}ms"
        if latency < 500:
            lat_color = Color.GREEN
        elif latency < 2000:
            lat_color = Color.YELLOW
        else:
            lat_color = Color.RED

        logger.info(
            f"  {c('✅', Color.GREEN)} [{now}] Ping #{ping_num:>4d} | "
            f"{c(latency_str, lat_color, Color.BOLD)} | "
            f"DB: {c(db_status, Color.GREEN)} | "
            f"Uptime: {c(f'{stats.uptime_pct:.1f}%', Color.GREEN, Color.BOLD)} | "
            f"Avg: {stats.avg_latency:.0f}ms"
        )
        logger.debug(f"Ping #{ping_num} OK — {latency:.0f}ms — DB: {db_status} — Response: {data}")
        return True

    elif code is not None:
        # Có response nhưng không phải 200
        stats.failed += 1
        stats.last_fail = datetime.datetime.now()
        stats.consecutive_fails += 1
        stats.max_consecutive_fails = max(stats.max_consecutive_fails, stats.consecutive_fails)

        logger.info(
            f"  {c('⚠️', Color.YELLOW)} [{now}] Ping #{ping_num:>4d} | "
            f"HTTP {c(str(code), Color.RED, Color.BOLD)} | "
            f"{latency:.0f}ms | "
            f"Fail liên tiếp: {stats.consecutive_fails}"
        )
        logger.debug(f"Ping #{ping_num} HTTP {code} — {latency:.0f}ms")
        return False

    else:
        # Không kết nối được
        stats.failed += 1
        stats.last_fail = datetime.datetime.now()
        stats.consecutive_fails += 1
        stats.max_consecutive_fails = max(stats.max_consecutive_fails, stats.consecutive_fails)

        error_msg = str(data)[:80] if data else 'Unknown error'
        logger.info(
            f"  {c('❌', Color.RED)} [{now}] Ping #{ping_num:>4d} | "
            f"{c('KHÔNG KẾT NỐI', Color.RED, Color.BOLD)} | "
            f"{error_msg} | "
            f"Fail liên tiếp: {stats.consecutive_fails}"
        )
        logger.debug(f"Ping #{ping_num} FAILED — {error_msg}")
        return False

# ═══════════════════════════════════════════════════════
# AI HEALTH CHECK (Gemini)
# ═══════════════════════════════════════════════════════
def ai_health_check():
    """Dùng Gemini AI để kiểm tra sức khỏe server định kỳ.
    Gửi health data cho AI phân tích và đưa ra lời khuyên."""
    if not GEMINI_KEY:
        return

    stats.ai_checks += 1
    now = datetime.datetime.now().strftime('%H:%M:%S')
    logger.info(f"  {c('🤖', Color.MAGENTA)} [{now}] AI Health Check #{stats.ai_checks}...")

    # Thu thập dữ liệu sức khỏe
    health_data = {
        "total_pings": stats.total_pings,
        "successful": stats.successful,
        "failed": stats.failed,
        "uptime_pct": round(stats.uptime_pct, 1),
        "avg_latency_ms": round(stats.avg_latency, 0),
        "min_latency_ms": round(stats.min_latency, 0) if stats.min_latency != float('inf') else 0,
        "max_latency_ms": round(stats.max_latency, 0),
        "consecutive_fails": stats.consecutive_fails,
        "max_consecutive_fails": stats.max_consecutive_fails,
        "running_time": stats.running_time,
        "server_url": RENDER_URL,
        "last_success": stats.last_success.strftime('%H:%M:%S') if stats.last_success else 'Chưa có',
        "last_fail": stats.last_fail.strftime('%H:%M:%S') if stats.last_fail else 'Chưa có',
    }

    prompt = f"""Bạn là AI giám sát hệ thống của nền tảng EduCareLink (deploy trên Render free tier).
Dưới đây là dữ liệu health check từ tool keep-alive. Hãy phân tích ngắn gọn:

{json.dumps(health_data, indent=2, ensure_ascii=False)}

Phân tích:
1. Tình trạng server (tốt/cảnh báo/lỗi)
2. Có vấn đề gì cần chú ý không?
3. Lời khuyên (1 câu)

Trả lời siêu ngắn, tối đa 3 dòng, bằng tiếng Việt."""

    try:
        # ⚡ Fallback chain model — thử lần lượt nếu 1 model bị deprecated
        # Thử import shared model list từ performance module (nếu Django available)
        # Nếu không → dùng local copy (đồng bộ với performance/gemini_model.py)
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
            import django
            if not django.apps.apps.ready:
                django.setup()
            from performance.gemini_model import GEMINI_MODELS_FALLBACK as models_to_try
        except Exception:
            # Standalone mode — local copy đồng bộ với performance/gemini_model.py
            models_to_try = [
                'gemini-2.5-flash-lite',
                'gemini-2.5-flash',
                'gemini-2.0-flash',
                'gemini-2.0-flash-lite',
                'gemini-flash-latest',
                'gemini-1.5-flash',
                'gemini-1.5-flash-latest',
            ]

        ai_text = None
        # Thử dùng requests nếu có (nhanh hơn)
        try:
            import requests as req_lib
            for model_name in models_to_try:
                try:
                    response = req_lib.post(
                        f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_KEY}',
                        json={
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 256}
                        },
                        timeout=15
                    )
                    if response.status_code == 200:
                        result = response.json()
                        ai_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                        if ai_text:
                            break
                    elif response.status_code == 404:
                        # Model deprecated → thử model tiếp theo
                        continue
                    else:
                        ai_text = f"Lỗi API: HTTP {response.status_code}"
                        break
                except Exception:
                    continue
        except ImportError:
            # Fallback dùng urllib
            for model_name in models_to_try:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_KEY}'
                payload = json.dumps({
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 256}
                }).encode('utf-8')
                req = urllib.request.Request(url, data=payload, headers={
                    'Content-Type': 'application/json',
                })
                try:
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        result = json.loads(resp.read().decode('utf-8'))
                        ai_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                        if ai_text:
                            break
                except urllib.error.HTTPError as he:
                    if he.code == 404:
                        continue  # Model deprecated → thử model tiếp theo
                    else:
                        ai_text = f"Lỗi API: HTTP {he.code}"
                        break

        if ai_text:
            # Hiển thị phản hồi AI (mỗi dòng thụt vào)
            for line in ai_text.strip().split('\n'):
                if line.strip():
                    logger.info(f"  {c('│', Color.MAGENTA)} {line.strip()}")
        else:
            logger.info(f"  {c('│', Color.DIM)} AI không trả về kết quả")

    except Exception as e:
        logger.info(f"  {c('│', Color.DIM)} AI check lỗi: {str(e)[:60]}")

    logger.info(f"  {c('└──', Color.MAGENTA)} AI Health Check hoàn tất")

# ═══════════════════════════════════════════════════════
# THỐNG KÊ CHI TIẾT
# ═══════════════════════════════════════════════════════
def show_stats():
    """Hiển thị thống kê tổng quan."""
    now = datetime.datetime.now().strftime('%H:%M:%S')
    logger.info(f"""
  {c('═══ THỐNG KÊ ═══', Color.CYAN, Color.BOLD)}
  {c('⏱', Color.WHITE)} Thời gian chạy:   {c(stats.running_time, Color.BOLD)}
  {c('📡', Color.WHITE)} Tổng ping:         {c(str(stats.total_pings), Color.BOLD)}
  {c('✅', Color.GREEN)} Thành công:        {c(str(stats.successful), Color.GREEN, Color.BOLD)}
  {c('❌', Color.RED)} Thất bại:           {c(str(stats.failed), Color.RED, Color.BOLD) if stats.failed > 0 else c('0', Color.GREEN)}
  {c('📊', Color.WHITE)} Uptime:            {c(f'{stats.uptime_pct:.1f}%', Color.GREEN if stats.uptime_pct > 95 else Color.RED, Color.BOLD)}
  {c('⚡', Color.WHITE)} Latency TB:        {c(f'{stats.avg_latency:.0f}ms', Color.BOLD)}
  {c('🏃', Color.WHITE)} Min/Max:           {c(f'{stats.min_latency:.0f}ms', Color.GREEN) if stats.min_latency != float('inf') else '?'} / {c(f'{stats.max_latency:.0f}ms', Color.YELLOW if stats.max_latency < 3000 else Color.RED)}
  {c('🤖', Color.MAGENTA)} AI checks:         {c(str(stats.ai_checks), Color.MAGENTA)}
  {c('🔥', Color.WHITE)} Fail liên tiếp:     {c(str(stats.consecutive_fails), Color.RED if stats.consecutive_fails > 3 else Color.GREEN)}
""")

# ═══════════════════════════════════════════════════════
# VÒNG LẶP CHÍNH
# ═══════════════════════════════════════════════════════
def main():
    global running

    show_banner()

    # Ping lần đầu ngay lập tức
    logger.info(c("  🚀 Bắt đầu ping...", Color.GREEN, Color.BOLD))
    do_ping()

    last_ai_check = time.time()
    last_stats_show = time.time()
    ping_count_since_stats = 0

    while running:
        try:
            # Đợi interval
            wait_end = time.time() + PING_INTERVAL
            while time.time() < wait_end and running:
                time.sleep(1)

            if not running:
                break

            # Ping
            do_ping()
            ping_count_since_stats += 1

            # AI health check mỗi AI_CHECK_INTERVAL phút
            now_ts = time.time()
            if GEMINI_KEY and (now_ts - last_ai_check) >= (AI_CHECK_INTERVAL * 60):
                ai_health_check()
                last_ai_check = now_ts

            # Hiển thị thống kê mỗi 10 ping
            if ping_count_since_stats >= 10:
                show_stats()
                ping_count_since_stats = 0

        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"  Lỗi không mong đợi: {e}")
            time.sleep(5)

    # Hiển thị thống kê cuối cùng
    logger.info(f"\n{c('═══════════════════════════════════════', Color.CYAN)}")
    logger.info(c("  THỐNG KÊ CUỐI CÙNG", Color.CYAN, Color.BOLD))
    logger.info(f"{c('═══════════════════════════════════════', Color.CYAN)}")
    show_stats()
    logger.info(f"  Log chi tiết: {LOG_FILE}")
    logger.info(c("  Tạm biệt! 👋\n", Color.YELLOW))


if __name__ == '__main__':
    main()
