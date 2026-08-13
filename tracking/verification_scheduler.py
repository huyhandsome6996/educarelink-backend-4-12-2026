"""
╔══════════════════════════════════════════════════════════════════╗
║   Random Verification Check Scheduler                              ║
║   Chống CarePartner để máy lại rồi bỏ đi:                          ║
║     - Mỗi 1 phút quét các Task đang in_progress                    ║
║     - Với mỗi task, ngẫu nhiên quyết định có tạo RandomVerification║
║       Check hay không (xác suất tính theo ca làm 2-3 tiếng)        ║
║     - Khi tạo check → push còi to (channel emergency-alerts)       ║
║       + set respond_deadline = now + RESPOND_TIMEOUT_SECONDS       ║
║     - Quét các check pending quá deadline → chuyển 'timeout'       ║
║       + thông báo admin (luôn) + phụ huynh (nếu ≥2 timeout liên tiếp║
║                                                                    ║
║   Chỉ chạy trên Render (production) — local dev không chạy.        ║
║   Trigger thủ công để test nhanh:                                  ║
║     POST /api/tracking/admin/trigger-verification-check/            ║
║   (chỉ hoạt động khi DEBUG=True)                                   ║
╚══════════════════════════════════════════════════════════════════╝
"""

import os
import logging
import random
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.models import Task, User, Notification
from tracking.models import (
    LocationConsent, RandomVerificationCheck, DeviceHeartbeat,
)

logger = logging.getLogger('educarelink.tracking.verification_scheduler')

# ═══════════════════════════════════════════════════════════════════
#  HẰNG SỐ CẤU HÌNH — project owner có thể tinh chỉnh sau
# ═══════════════════════════════════════════════════════════════════

# Số lần xác minh mong muốn mỗi ca làm (ca 2-3 tiếng)
TARGET_CHECKS_PER_SHIFT = int(os.environ.get('VERIFICATION_TARGET_CHECKS_PER_SHIFT', '2'))

# Ước tính số phút của 1 ca làm (để tính xác suất mỗi phút)
# Ca 2-3 tiếng ≈ 180 phút
ESTIMATED_SHIFT_MINUTES = int(os.environ.get('VERIFICATION_ESTIMATED_SHIFT_MINUTES', '180'))

# Khoảng cách tối thiểu giữa 2 lần xác minh (phút) — tránh spam
MIN_MINUTES_BETWEEN_CHECKS = int(os.environ.get('VERIFICATION_MIN_MINUTES_BETWEEN_CHECKS', '15'))

# Thời gian CarePartner có để phản hồi (giây)
RESPOND_TIMEOUT_SECONDS = int(os.environ.get('VERIFICATION_RESPOND_TIMEOUT_SECONDS', '90'))

# Số lần timeout liên tiếp trước khi báo phụ huynh (tránh báo động sai)
CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT = int(
    os.environ.get('VERIFICATION_CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT', '2')
)

# Số lần nhập sai tối đa trước khi chuyển 'wrong_code' + báo admin
MAX_WRONG_ATTEMPTS = int(os.environ.get('VERIFICATION_MAX_WRONG_ATTEMPTS', '3'))

# Interval scheduler (phút)
CHECK_INTERVAL_MINUTES = int(os.environ.get('VERIFICATION_CHECK_INTERVAL_MINUTES', '1'))

ENABLE_VERIFICATION = os.environ.get('VERIFICATION_CHECK_ENABLED', 'true').lower() == 'true'
IS_RENDER = os.environ.get('RENDER', '') == 'true'

# Xác suất mỗi phút = target / shift_minutes
# Ví dụ: 2 checks / 180 phút ≈ 0.0111 (1.11%) mỗi phút
# Trong 180 phút kỳ vọng tạo 2 check (Poisson-like)
PROBABILITY_PER_MINUTE = TARGET_CHECKS_PER_SHIFT / max(ESTIMATED_SHIFT_MINUTES, 1)

_scheduler = None
_lock = threading.Lock()

_stats = {
    'last_run': None,
    'last_result': None,
    'started_at': None,
}


# ═══════════════════════════════════════════════════════════════════
#  SERVICE LOGIC — tách ra để có thể gọi độc lập (test, admin trigger)
# ═══════════════════════════════════════════════════════════════════

def _get_active_consent_tasks():
    """
    Trả về queryset các Task đang in_progress + có LocationConsent granted.
    (Tái sử dụng điều kiện y hệt check_offline_devices.)
    """
    return Task.objects.filter(
        status='in_progress',
        location_consent__consent='granted',
    ).select_related('parent', 'location_consent')


def _get_task_worker(task):
    """Lấy carepartner được accept cho task (tái sử dụng logic tracking.services)."""
    from tracking.services import get_accepted_worker
    return get_accepted_worker(task)


def _should_create_check(task, worker):
    """
    Quyết định có tạo check mới cho task này ở phút hiện tại hay không:
      1. Không có check pending nào cho task → không bị overlap
      2. Lần check gần nhất (bất kỳ status) đã đủ cách MIN_MINUTES_BETWEEN_CHECKS
      3. Random() < PROBABILITY_PER_MINUTE (xác suất ngẫu nhiên mỗi phút)
    """
    now = timezone.now()

    # (1) Có check pending chưa xử lý xong → skip
    has_pending = RandomVerificationCheck.objects.filter(
        task=task, worker=worker, status='pending'
    ).exists()
    if has_pending:
        return False

    # (2) Lần check gần nhất (mọi status) phải đủ xa
    min_created_threshold = now - timedelta(minutes=MIN_MINUTES_BETWEEN_CHECKS)
    recent_check = RandomVerificationCheck.objects.filter(
        task=task, worker=worker,
        triggered_at__gte=min_created_threshold,
    ).exists()
    if recent_check:
        return False

    # (3) Xác suất ngẫu nhiên mỗi phút
    return random.random() < PROBABILITY_PER_MINUTE


def _notify_user(user, title, message, data=None):
    """Helper — tái sử dụng từ tracking.services (gửi Notification + Expo push)."""
    try:
        from tracking.services import _notify_user as _notify
        _notify(user, title=title, message=message, data=data)
    except Exception as e:
        logger.warning(f"[Verification] _notify_user failed: {e}")


@transaction.atomic
def _create_check(task, worker):
    """Tạo RandomVerificationCheck mới + push yêu cầu nhập mã cho worker."""
    now = timezone.now()
    deadline = now + timedelta(seconds=RESPOND_TIMEOUT_SECONDS)

    check = RandomVerificationCheck.objects.create(
        task=task,
        worker=worker,
        respond_deadline=deadline,
        status='pending',
    )

    # Push yêu cầu nhập mã cho CarePartner — channel emergency-alerts (còi to)
    _notify_user(
        worker,
        title="🔐 Xác minh bảo mật",
        message="Vui lòng nhập mã cá nhân để xác nhận",
        data={
            'type': 'random_verification',
            'task_id': task.id,
            'check_id': check.id,
            'priority': 'high',
            'sound': 'critical',
            'android_channel_id': 'emergency-alerts',
        }
    )
    check.push_sent = True
    check.push_retry_count = 1
    check.save(update_fields=['push_sent', 'push_retry_count'])

    logger.info(f"[Verification] Created check #{check.id} for Task#{task.id} (deadline={deadline:%H:%M:%S})")
    return check


def run_verification_check():
    """
    Job chạy mỗi 1 phút:
      1. Quét task in_progress + consent granted
      2. Với mỗi task, random quyết định có tạo check mới
      3. Quét check pending quá deadline → 'timeout' + notify admin + parent (nếu cần)
      4. Retry push cho check pending chưa phản hồi (giống offline alert)

    Trả về dict thống kê.
    """
    now = timezone.now()
    stats = {
        'checked_at': now.isoformat(),
        'tasks_scanned': 0,
        'checks_created': 0,
        'timeouts_marked': 0,
        'parent_alerts_sent': 0,
        'retries_pushed': 0,
    }

    # === (1) + (2) Quét task + random tạo check ===
    tasks = _get_active_consent_tasks()
    stats['tasks_scanned'] = tasks.count()

    for task in tasks:
        worker = _get_task_worker(task)
        if not worker:
            continue

        # Worker chưa đặt PIN → không tạo check (sẽ chặn nhận task ở phần mobile)
        if not worker.verification_pin_hash:
            continue

        if _should_create_check(task, worker):
            try:
                _create_check(task, worker)
                stats['checks_created'] += 1
            except Exception as e:
                logger.exception(f"[Verification] Create check failed for Task#{task.id}: {e}")

    # === (3) Quét check pending quá deadline → 'timeout' ===
    expired_checks = RandomVerificationCheck.objects.filter(
        status='pending',
        respond_deadline__lt=now,
    ).select_related('task', 'worker', 'task__parent')

    for check in expired_checks:
        check.status = 'timeout'
        check.save(update_fields=['status'])

        # Notify admin (luôn)
        try:
            admin_users = User.objects.filter(is_staff=True, is_active=True)
            for admin in admin_users:
                Notification.objects.create(
                    recipient=admin,
                    title="⏰ CarePartner không phản hồi xác minh",
                    message=f"Task '{check.task.title}' (#{check.task.id}) — carepartner "
                            f"{check.worker.username} không nhập mã xác minh trong vòng "
                            f"{RESPOND_TIMEOUT_SECONDS}s. Hệ thống đã chuyển trạng thái timeout.",
                )
        except Exception:
            pass

        # Notify parent nếu ≥ CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT timeout liên tiếp
        consecutive_timeouts = RandomVerificationCheck.objects.filter(
            task=check.task,
            status='timeout',
        ).order_by('-triggered_at')[:CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT]

        if consecutive_timeouts.count() >= CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT:
            # Kiểm tra xem các timeout có liên tiếp không (không có confirmed/wrong_code ở giữa)
            timeout_ids = list(consecutive_timeouts.values_list('id', flat=True))
            recent_checks = RandomVerificationCheck.objects.filter(
                task=check.task,
            ).order_by('-triggered_at')[:CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT]
            all_timeouts = all(c.status == 'timeout' for c in recent_checks)

            if all_timeouts:
                _notify_user(
                    check.task.parent,
                    title="⚠️ CarePartner liên tục không phản hồi xác minh",
                    message=f"CarePartner đã bỏ qua {CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT} lần xác minh "
                            f"liên tiếp cho công việc '{check.task.title}'. Vui lòng liên hệ ngay!",
                    data={
                        'type': 'verification_timeout_critical',
                        'task_id': check.task.id,
                        'priority': 'high',
                        'android_channel_id': 'emergency-alerts',
                    }
                )
                stats['parent_alerts_sent'] += 1

        stats['timeouts_marked'] += 1
        logger.info(f"[Verification] Check #{check.id} timed out (Task#{check.task_id})")

    # === (4) Retry push cho check pending chưa phản hồi (giống offline Alert) ===
    # Mỗi 30s gửi lại push cho check pending (max 5 lần).
    # RandomVerificationCheck không có field push_sent_at riêng — dùng
    # triggered_at + push_retry_count * 30s để ước tính lần push gần nhất.
    retry_threshold = now - timedelta(seconds=30)
    pending_for_retry = RandomVerificationCheck.objects.filter(
        status='pending',
        push_retry_count__lt=5,
        respond_deadline__gte=now,  # chưa hết hạn
        triggered_at__lt=retry_threshold,  # đã qua ít nhất 30s từ lần tạo
    ).select_related('task', 'worker')

    # Nếu push_retry_count > 0, cần thêm khoảng cách 30s kể từ lần push cuối.
    # Vì không có push_sent_at, ta tính: trigger_time + retry_count * 30s phải < now
    for check in list(pending_for_retry):
        if check.push_retry_count > 0:
            estimated_last_push = check.triggered_at + timedelta(
                seconds=30 * check.push_retry_count
            )
            if estimated_last_push > now:
                continue  # chưa đủ 30s từ lần push cuối
        try:
            _notify_user(
                check.worker,
                title=f"🔐 Xác minh bảo mật (lần {check.push_retry_count + 1}/5)",
                message="Vui lòng nhập mã cá nhân để xác nhận — đang đợi phản hồi!",
                data={
                    'type': 'random_verification',
                    'task_id': check.task.id,
                    'check_id': check.id,
                    'retry': check.push_retry_count + 1,
                    'priority': 'high',
                    'sound': 'critical',
                    'android_channel_id': 'emergency-alerts',
                }
            )
            check.push_sent = True
            check.push_retry_count += 1
            check.save(update_fields=['push_sent', 'push_retry_count'])
            stats['retries_pushed'] += 1
        except Exception as e:
            logger.warning(f"[Verification] Retry push failed for Check#{check.id}: {e}")

    if stats['checks_created'] > 0 or stats['timeouts_marked'] > 0 or stats['retries_pushed'] > 0:
        logger.info(f"[Verification Scheduler] {stats}")

    return stats


def trigger_verification_check_now(task_id):
    """
    Admin trigger thủ công tạo check cho 1 task (debug, chỉ khi DEBUG=True).
    Bypass random check + min interval — tạo ngay lập tức.
    """
    try:
        task = Task.objects.get(pk=task_id, status='in_progress')
    except Task.DoesNotExist:
        raise ValueError("Không tìm thấy task đang in_progress.")

    worker = _get_task_worker(task)
    if not worker:
        raise ValueError("Task chưa có carepartner được accept.")

    if not worker.verification_pin_hash:
        raise ValueError("CarePartner chưa đặt mã cá nhân — không thể tạo check.")

    # Skip pending check nếu đã có
    has_pending = RandomVerificationCheck.objects.filter(
        task=task, worker=worker, status='pending'
    ).exists()
    if has_pending:
        raise ValueError("Task đã có check pending — vui lòng đợi xử lý xong.")

    return _create_check(task, worker)


# ═══════════════════════════════════════════════════════════════════
#  SCHEDULER LIFECYCLE
# ═══════════════════════════════════════════════════════════════════

def _run_verification_job():
    """Job wrapper cho APScheduler."""
    try:
        stats = run_verification_check()
        _stats['last_run'] = datetime.now().isoformat()
        _stats['last_result'] = stats
    except Exception as e:
        logger.exception(f"[Verification Scheduler] Job FAILED: {e}")


def get_stats():
    return {
        'enabled': ENABLE_VERIFICATION and IS_RENDER,
        'running': _scheduler is not None and _scheduler.running,
        'interval_minutes': CHECK_INTERVAL_MINUTES,
        'probability_per_minute': round(PROBABILITY_PER_MINUTE, 4),
        'constants': {
            'TARGET_CHECKS_PER_SHIFT': TARGET_CHECKS_PER_SHIFT,
            'ESTIMATED_SHIFT_MINUTES': ESTIMATED_SHIFT_MINUTES,
            'MIN_MINUTES_BETWEEN_CHECKS': MIN_MINUTES_BETWEEN_CHECKS,
            'RESPOND_TIMEOUT_SECONDS': RESPOND_TIMEOUT_SECONDS,
            'CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT': CONSECUTIVE_TIMEOUTS_BEFORE_PARENT_ALERT,
            'MAX_WRONG_ATTEMPTS': MAX_WRONG_ATTEMPTS,
        },
        'stats': _stats.copy(),
    }


def start_verification_scheduler():
    """Khởi động scheduler — thread-safe, chỉ chạy 1 instance."""
    global _scheduler

    if not ENABLE_VERIFICATION:
        logger.info("[Verification Scheduler] DISABLED (VERIFICATION_CHECK_ENABLED != true)")
        return

    if not IS_RENDER:
        logger.info("[Verification Scheduler] SKIPPED — local dev (not Render)")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[Verification Scheduler] Already running, skip.")
            return

        _stats['started_at'] = datetime.now().isoformat()

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        _scheduler.add_job(
            _run_verification_job,
            trigger=IntervalTrigger(minutes=CHECK_INTERVAL_MINUTES),
            id='verification_check',
            name='EduCareLink Random Verification Check',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(
            f"[Verification Scheduler] STARTED | "
            f"Interval: every {CHECK_INTERVAL_MINUTES} min | "
            f"Probability: {PROBABILITY_PER_MINUTE:.4f} per minute | "
            f"Target: {TARGET_CHECKS_PER_SHIFT} checks/shift | "
            f"Timeout: {RESPOND_TIMEOUT_SECONDS}s"
        )

        # Chạy lần đầu sau 60 giây (để server sẵn sàng + tránh chạy cùng lúc với offline_check)
        _scheduler.add_job(
            _run_verification_job,
            trigger='date',
            run_date=datetime.now() + timedelta(seconds=60),
            id='verification_initial_check',
            name='EduCareLink Initial Verification Check',
            replace_existing=True,
        )


def shutdown_verification_scheduler():
    """Dừng scheduler khi Django shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Verification Scheduler] stopped.")
