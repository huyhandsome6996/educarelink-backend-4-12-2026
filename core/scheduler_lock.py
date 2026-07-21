"""
╔══════════════════════════════════════════════════════════════════╗
║   Cross-Process Scheduler Lock                                   ║
║                                                                  ║
║   Render.com chạy gunicorn với WEB_CONCURRENCY=2 → 2 worker      ║
║   process, mỗi process chạy AppConfig.ready() riêng, dẫn đến     ║
║   các background scheduler bị khởi động TRÙNG ở cả 2 worker.     ║
║                                                                  ║
║   threading.Lock chỉ chống race trong 1 process, không đủ.       ║
║   Module này dùng fcntl.flock (file lock cấp OS) để đảm bảo      ║
║   mỗi scheduler chỉ được start bởi ĐÚNG 1 worker process.        ║
║                                                                  ║
║   Cách dùng (trong start_xxx_scheduler của mỗi app):             ║
║                                                                  ║
║       from core.scheduler_lock import acquire_scheduler_lock     ║
║                                                                  ║
║       lock_fd = acquire_scheduler_lock('keepalive')              ║
║       if lock_fd is None:                                        ║
║           # worker khác đã giữ lock → skip                       ║
║           return                                                 ║
║       # ... start scheduler như bình thường ...                  ║
║                                                                  ║
║   Lock tự nhả khi process exit (kernel close fd) → worker        ║
║   còn lại có thể giữ lock ở lần restart tiếp theo.               ║
║                                                                  ║
║   Lock file nằm ở thư mục SCHEDULER_LOCK_DIR (mặc định /tmp),   ║
║   có thể override qua env var SCHEDULER_LOCK_DIR.                ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import logging
import tempfile
import errno
from pathlib import Path

logger = logging.getLogger('educarelink.scheduler_lock')

try:
    import fcntl  # chỉ có trên Unix/Linux (Render chạy Linux)
    _HAS_FCNTL = True
except ImportError:
    _HAS_FCNTL = False
    logger.warning(
        "[SchedulerLock] fcntl không khả dụng (Windows?). "
        "Cross-process lock sẽ fallback về threading.Lock trong process."
    )

# Thư mục chứa lock file — có thể override qua env
# Mặc định /tmp vì luôn tồn tại trên Linux/Render, ghi được, không persist
SCHEDULER_LOCK_DIR = os.environ.get(
    'SCHEDULER_LOCK_DIR',
    tempfile.gettempdir()
)

# Map: scheduler_name → file descriptor (giữ tham chiếu để lock không bị GC)
_lock_fds: dict = {}


def _lock_path(scheduler_name: str) -> Path:
    """Trả về path của lock file cho scheduler."""
    safe = scheduler_name.replace('/', '_').replace(' ', '_')
    return Path(SCHEDULER_LOCK_DIR) / f"educarelink_scheduler_{safe}.lock"


def acquire_scheduler_lock(scheduler_name: str):
    """
    Thử acquire cross-process lock cho scheduler.

    Trả về:
    - file descriptor (int) nếu acquire thành công → gọi keep_lock hoặc để fd mở
      cho đến khi process exit (lock tự nhả).
    - None nếu đã có process khác giữ lock → caller SKIP start scheduler.

    Cơ chế: fcntl.flock(LOCK_EX | LOCK_NB) — non-blocking exclusive lock.
    Nếu process đang giữ lock exit đột ngột, kernel tự close fd → lock được nhả.
    """
    if not _HAS_FCNTL:
        # Fallback: không có fcntl (Windows/dev) → luôn trả về "đã acquire"
        # để scheduler vẫn chạy. Trong môi trường dev thì chấp nhận được.
        # Trên Render (Linux) thì fcntl luôn có.
        logger.debug(f"[SchedulerLock] {scheduler_name}: fcntl unavailable, fallback to no-op")
        return -1

    lock_file = _lock_path(scheduler_name)
    try:
        lock_file.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(str(lock_file), os.O_CREAT | os.O_RDWR, 0o644)
    except OSError as e:
        logger.error(f"[SchedulerLock] {scheduler_name}: cannot open lock file {lock_file}: {e}")
        return None

    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        # Lock đã bị process khác giữ
        os.close(fd)
        logger.info(
            f"[SchedulerLock] {scheduler_name}: lock held by another worker, "
            f"skip scheduler start on this process"
        )
        return None
    except OSError as e:
        os.close(fd)
        logger.error(f"[SchedulerLock] {scheduler_name}: flock error: {e}")
        return None

    # Ghi metadata debug (PID, time) — không bắt buộc, chỉ để admin xem dễ debug
    try:
        os.ftruncate(fd, 0)
        os.write(fd, f"pid={os.getpid()}\n".encode())
        os.fsync(fd)
    except OSError:
        pass

    _lock_fds[scheduler_name] = fd
    logger.info(
        f"[SchedulerLock] {scheduler_name}: lock acquired by PID {os.getpid()} "
        f"at {lock_file}"
    )
    return fd


def release_scheduler_lock(scheduler_name: str):
    """
    Nhả lock — thường không cần gọi vì process exit sẽ tự nhả.
    Chỉ dùng khi muốn chủ động nhả (vd: shutdown_scheduler khi test).
    """
    fd = _lock_fds.pop(scheduler_name, None)
    if fd is None or fd == -1:
        return
    try:
        if _HAS_FCNTL:
            fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
    except OSError:
        pass
    logger.info(f"[SchedulerLock] {scheduler_name}: lock released")


def is_lock_held(scheduler_name: str) -> bool:
    """Kiểm tra xem scheduler này có đang bị lock bởi process nào không (debug/admin)."""
    if not _HAS_FCNTL:
        return False
    lock_file = _lock_path(scheduler_name)
    if not lock_file.exists():
        return False
    try:
        fd = os.open(str(lock_file), os.O_RDWR)
    except OSError:
        return False
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
        return False
    except BlockingIOError:
        os.close(fd)
        return True
    except OSError:
        try:
            os.close(fd)
        except OSError:
            pass
        return False
