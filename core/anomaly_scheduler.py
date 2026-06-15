"""
╔══════════════════════════════════════════════════════════════╗
║     EduCareLink AI Anomaly Detection Scheduler               ║
║     Tự động phát hiện bất thường → thông báo cho Admin       ║
║                                                              ║
║  Chạy mỗi 10 phút trên Render, quét:                         ║
║  - Tài khoản đã duyệt nhưng thiếu CCCD/ảnh chân dung         ║
║  - Lượng user mới bất thường                                 ║
║  - Tài khoản bị cấm                                          ║
║  - Bằng cấp chờ duyệt quá nhiều                              ║
║  - Task mở lâu không có người ứng tuyển                      ║
║  - Đánh giá 1 sao                                            ║
║  - Worker đã duyệt nhưng chưa xác minh                       ║
║  → Tạo Notification cho tất cả Admin                         ║
╚══════════════════════════════════════════════════════════════╝
"""

import os
import logging
import threading
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('educarelink.anomaly')

# ───────────────────────────────────────────────────────
# CẤU HÌNH
# ───────────────────────────────────────────────────────
ANOMALY_CHECK_INTERVAL_MINUTES = int(os.environ.get('ANOMALY_CHECK_INTERVAL', '10'))
ENABLE_ANOMALY = os.environ.get('ANOMALY_ENABLED', 'true').lower() == 'true'
IS_RENDER = os.environ.get('RENDER', '') == 'true'

# Tránh gửi trùng — ghi nhớ anomaly đã gửi trong 2 giờ qua
_recent_alerts = {}
_recent_alerts_lock = threading.Lock()
ALERT_COOLDOWN_MINUTES = 120  # 2 giờ

_scheduler = None
_lock = threading.Lock()


def _is_recent_alert(alert_key):
    """Kiểm tra xem alert này đã được gửi trong 2 giờ qua chưa."""
    with _recent_alerts_lock:
        last_sent = _recent_alerts.get(alert_key)
        if last_sent and (datetime.now() - last_sent) < timedelta(minutes=ALERT_COOLDOWN_MINUTES):
            return True
        return False


def _mark_alert_sent(alert_key):
    """Đánh dấu alert đã gửi."""
    with _recent_alerts_lock:
        _recent_alerts[alert_key] = datetime.now()
        # Dọn dẹp alert cũ (tránh memory leak)
        cutoff = datetime.now() - timedelta(minutes=ALERT_COOLDOWN_MINUTES * 2)
        _recent_alerts.update({k: v for k, v in _recent_alerts.items() if v > cutoff})


def _send_admin_notification(title, message):
    """Tạo Notification cho tất cả Admin (is_staff=True)."""
    try:
        from core.models import User, Notification

        admin_users = User.objects.filter(is_staff=True, is_active=True)
        if not admin_users.exists():
            return

        # Kiểm tra cooldown — tránh gửi trùng
        alert_key = f"{title[:50]}"
        if _is_recent_alert(alert_key):
            return

        # Tạo notification cho từng admin
        for admin in admin_users:
            Notification.objects.create(
                recipient=admin,
                title=title,
                message=message,
            )

        _mark_alert_sent(alert_key)
        logger.info(f"[Anomaly] Sent notification: {title}")

    except Exception as e:
        logger.error(f"[Anomaly] Failed to send notification: {e}")


def _run_anomaly_checks():
    """Chạy tất cả kiểm tra bất thường."""
    try:
        from core.models import User, Task, TaskApplication, CredentialSubmission, Review
        from django.utils import timezone

        now = timezone.now()
        week_ago = now - timedelta(days=7)
        day_ago = now - timedelta(days=1)
        hour_ago = now - timedelta(hours=1)
        alert_count = 0

        # ── 1. Tài khoản đã duyệt nhưng thiếu CCCD ──
        no_id_workers = User.objects.filter(
            role='worker', is_approved=True, is_active=True
        ).filter(
            id_card_front__isnull=True
        ).count()
        if no_id_workers > 0:
            _send_admin_notification(
                "[AI Cảnh báo] Worker đã duyệt nhưng thiếu CCCD",
                f"Phát hiện {no_id_workers} Carepartner đã được duyệt nhưng chưa tải lên ảnh CCCD. "
                f"Vui lòng kiểm tra lại hồ sơ để đảm bảo tính minh bạch."
            )
            alert_count += 1

        # ── 2. Tài khoản đã duyệt nhưng thiếu ảnh chân dung ──
        no_selfie_workers = User.objects.filter(
            role='worker', is_approved=True, is_active=True
        ).filter(
            selfie_photo__isnull=True
        ).count()
        if no_selfie_workers > 0:
            _send_admin_notification(
                "[AI Cảnh báo] Worker đã duyệt nhưng thiếu ảnh chân dung",
                f"Phát hiện {no_selfie_workers} Carepartner đã được duyệt nhưng chưa có ảnh chân dung. "
                f"Điều này có thể là rủi ro bảo mật."
            )
            alert_count += 1

        # ── 3. Tài khoản bị cấm ──
        banned_count = User.objects.filter(is_active=False).exclude(is_staff=True).count()
        if banned_count > 0:
            recent_banned = User.objects.filter(
                is_active=False, date_joined__gte=day_ago
            ).exclude(is_staff=True).count()
            if recent_banned > 0:
                _send_admin_notification(
                    "[AI Cảnh báo] Tài khoản bị cấm gần đây",
                    f"Có {recent_banned} tài khoản bị cấm trong 24 giờ qua "
                    f"(tổng cộng {banned_count} tài khoản bị cấm). "
                    f"Có thể cần điều tra thêm nếu số lượng bất thường."
                )
                alert_count += 1

        # ── 4. Lượng user mới bất thường (spike) ──
        new_users_week = User.objects.filter(date_joined__date__gte=week_ago).count()
        new_users_day = User.objects.filter(date_joined__gte=day_ago).count()
        if new_users_day > 10:
            _send_admin_notification(
                "[AI Cảnh báo] Lượng đăng ký bất thường",
                f"Phát hiện {new_users_day} tài khoản mới trong 24 giờ qua "
                f"({new_users_week} trong tuần). Có thể có đăng ký ảo hoặc spam."
            )
            alert_count += 1

        # ── 5. Worker đã duyệt nhưng chưa xác minh ──
        unverified_approved = User.objects.filter(
            role='worker', is_approved=True, is_verified=False, is_active=True
        ).count()
        if unverified_approved > 0:
            _send_admin_notification(
                "[AI Cảnh báo] Worker đã duyệt chưa xác minh",
                f"Có {unverified_approved} Carepartner đã được duyệt nhưng chưa được xác minh (is_verified=False). "
                f"Nên hoàn tất quy trình xác minh."
            )
            alert_count += 1

        # ── 6. Quá nhiều bằng cấp chờ duyệt ──
        pending_creds = CredentialSubmission.objects.filter(status='pending').count()
        if pending_creds > 5:
            _send_admin_notification(
                "[AI Cảnh báo] Bằng cấp chờ duyệt tích lũy",
                f"Hiện có {pending_creds} bằng cấp chờ duyệt. "
                f"Nên xử lý kịp thời để không làm chậm quy trình onboarding."
            )
            alert_count += 1

        # ── 7. Task mở lâu không có ứng tuyển ──
        old_open_tasks = Task.objects.filter(
            status='open', created_at__date__lt=week_ago
        ).count()
        if old_open_tasks > 0:
            _send_admin_notification(
                "[AI Cảnh báo] Task mở quá 7 ngày không có ứng tuyển",
                f"Có {old_open_tasks} task đã mở hơn 7 ngày nhưng chưa có Carepartner ứng tuyển. "
                f"Có thể cần điều chỉnh yêu cầu hoặc khu vực."
            )
            alert_count += 1

        # ── 8. Đánh giá 1 sao ──
        one_star_reviews = Review.objects.filter(rating=1).count()
        recent_one_star = Review.objects.filter(rating=1, created_at__gte=day_ago).count()
        if recent_one_star > 0:
            _send_admin_notification(
                "[AI Cảnh báo] Đánh giá 1 sao gần đây",
                f"Có {recent_one_star} đánh giá 1 sao trong 24 giờ qua "
                f"(tổng cộng {one_star_reviews}). Nên kiểm tra nguyên nhân."
            )
            alert_count += 1

        # ── 9. Tài khoản đăng ký trong 1 giờ qua (bot detection) ──
        rapid_signups = User.objects.filter(date_joined__gte=hour_ago).count()
        if rapid_signups > 5:
            _send_admin_notification(
                "[AI Cảnh báo] Đăng ký nhanh bất thường — có thể là bot",
                f"Phát hiện {rapid_signups} tài khoản đăng ký trong 1 giờ qua. "
                f"Đây có thể là hoạt động bot. Nên kiểm tra danh sách user mới."
            )
            alert_count += 1

        # ── 10. Task bị hủy nhiều gần đây ──
        cancelled_tasks = Task.objects.filter(
            status='cancelled', created_at__gte=day_ago
        ).count()
        if cancelled_tasks >= 3:
            _send_admin_notification(
                "[AI Cảnh báo] Nhiều task bị hủy trong 24 giờ",
                f"Có {cancelled_tasks} task bị hủy trong 24 giờ qua. "
                f"Có thể có vấn đề về trải nghiệm người dùng cần điều tra."
            )
            alert_count += 1

        logger.info(f"[Anomaly] Check complete — {alert_count} alerts sent")

    except Exception as e:
        logger.error(f"[Anomaly] Check failed: {e}")


def start_anomaly_scheduler():
    """Khởi động anomaly detection scheduler — chỉ chạy trên Render."""
    global _scheduler

    if not ENABLE_ANOMALY:
        logger.info("[Anomaly] DISABLED (ANOMALY_ENABLED != true)")
        return

    if not IS_RENDER:
        logger.info("[Anomaly] SKIPPED — not running on Render (local dev)")
        return

    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info("[Anomaly] Scheduler already running, skip.")
            return

        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1},
        )

        _scheduler.add_job(
            _run_anomaly_checks,
            trigger=IntervalTrigger(minutes=ANOMALY_CHECK_INTERVAL_MINUTES),
            id='anomaly_check',
            name='EduCareLink AI Anomaly Detection',
            replace_existing=True,
        )

        _scheduler.start()
        logger.info(
            f"[Anomaly] Scheduler STARTED | "
            f"Interval: every {ANOMALY_CHECK_INTERVAL_MINUTES} min"
        )

        # Chạy lần đầu sau 30 giây (để server sẵn sàng)
        _scheduler.add_job(
            _run_anomaly_checks,
            trigger='date',
            run_date=datetime.now() + timedelta(seconds=30),
            id='anomaly_initial_check',
            name='EduCareLink Initial Anomaly Check',
            replace_existing=True,
        )


def shutdown_anomaly_scheduler():
    """Dừng scheduler khi Django shutdown."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Anomaly] Scheduler stopped.")
