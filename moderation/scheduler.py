"""
moderation/scheduler.py — Background Scanner quét công việc vi phạm MỖI 60 GIÂY.

QA 2026-09-10 Vấn đề #1: chỉ 3 danh mục (Gia sư, Đón trẻ, Trông trẻ).
Nếu bằng cách nào đó một công việc ngoài 3 danh mục lọt lên hệ thống
(lọt lưới keyword khi đăng, seed cũ, sửa title sau khi duyệt...), scanner
sẽ phát hiện và XOÁ (status='cancelled') trong vòng 1 phút, kèm log
kiểm duyệt + thông báo cho phụ huynh.

Cơ chế 2 lớp cho mỗi Task đang 'open':
  1. AI đã quyết 'rejected' (TaskModeration.status='rejected') nhưng task
     vẫn open → lệnh AI được thực thi ngay (cancel task).
  2. Rule-based keyword 3 danh mục chặn lại (_check_banned_keywords —
     <1ms, không tốn Gemini) → cancel + ghi TaskModeration rejected.

Scanner KHÔNG chạy AI (chỉ rule nhanh) — AI reject đã được xử lý bởi
nhánh 1. Safe re-run: task đã cancel rơi khỏi queryset 'open'.
"""

import logging
import os
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger('educarelink.moderation.scheduler')

_scheduler = None
_lock = threading.Lock()


def _cancel_violating_task(task, reason, flags, confidence=0.95):
    """Hủy task vi phạm + ghi log kiểm duyệt + thông báo phụ huynh (idempotent)."""
    from django.utils import timezone
    from .models import TaskModeration

    # Guard chặt: chỉ cancel khi task vẫn đang open (tránh race với luồng khác)
    if task.status != 'open':
        return False

    TaskModeration.objects.update_or_create(
        task=task,
        defaults={
            'status': 'rejected',
            'ai_verdict': reason,
            'ai_confidence': confidence,
            'ai_flags': flags,
            'ai_suggestion': 'Tự động hủy bởi scanner 60s — công việc ngoài 3 danh mục cho phép.',
            'moderated_at': timezone.now(),
        }
    )

    task.status = 'cancelled'
    task.save(update_fields=['status'])
    logger.warning(
        '[ModerationScanner] Task #%s "%s" ĐÃ BỊ HỦY — %s',
        task.id, (task.title or '')[:80], reason)

    # Thông báo cho phụ huynh (in-app + Expo push — gửi 1 lần khi cancel)
    try:
        from core.models import Notification
        from core.views import send_expo_push_notification
        Notification.objects.create(
            recipient=task.parent,
            title="Công việc đã bị gỡ khỏi hệ thống",
            message=(f"Công việc '{task.title}' không thuộc 3 danh mục dịch vụ của "
                     f"EduCareLink (Gia sư, Đón trẻ, Trông trẻ) nên đã bị gỡ bỏ. {reason[:140]}"),
        )
        if task.parent.expo_push_token:
            send_expo_push_notification(
                token=task.parent.expo_push_token,
                title="Công việc đã bị gỡ khỏi hệ thống",
                body=f"'{task.title}' không thuộc 3 danh mục: Gia sư, Đón trẻ, Trông trẻ.",
                data={'type': 'task_rejected', 'task_id': task.id},
            )
    except Exception as e:
        logger.warning('[ModerationScanner] Notify parent failed cho task #%s: %s', task.id, e)

    return True


def scan_violating_tasks():
    """Beat job 60s — quét task 'open' vi phạm 3 danh mục. Idempotent."""
    from django.db.models import Q

    from core.models import Task
    from .models import TaskModeration
    from .services import _check_banned_keywords

    open_tasks = Task.objects.filter(status='open').select_related('parent')

    # ── Lớp 1: thực thi quyết định REJECTED của AI còn treo trên task open ──
    rejected_ids = TaskModeration.objects.filter(
        status='rejected').values_list('task_id', flat=True)
    for task in open_tasks.filter(id__in=rejected_ids):
        try:
            mod = TaskModeration.objects.get(task_id=task.id)
            _cancel_violating_task(
                task,
                reason=(mod.ai_verdict or 'AI kiểm duyệt đã từ chối công việc này.'),
                flags=(mod.ai_flags or []),
                confidence=mod.ai_confidence or 1.0,
            )
        except Exception:
            logger.exception('[ModerationScanner] Lỗi thực thi AI reject task #%s', task.id)

    # ── Lớp 2: rule-based keyword 3 danh mục (lọt lưới khi đăng / seed cũ) ──
    # Bỏ qua task đã có moderation rejected (đã xử lý ở lớp 1) và task được
    # admin duyệt thủ công (admin_approved) — tôn trọng quyết định admin.
    skip_ids = set(TaskModeration.objects.filter(
        Q(status='rejected') | Q(status='admin_approved')
    ).values_list('task_id', flat=True))
    for task in open_tasks.exclude(id__in=skip_ids):
        try:
            result = _check_banned_keywords(
                task.title or '', task.description or '', task.price)
            if result.get('banned'):
                _cancel_violating_task(
                    task,
                    reason=result.get('reason', 'Công việc không thuộc 3 danh mục cho phép.'),
                    flags=result.get('flags', []),
                    confidence=result.get('confidence', 0.95),
                )
        except Exception:
            logger.exception('[ModerationScanner] Lỗi quét keyword task #%s', task.id)


def start_moderation_scheduler():
    """Khởi động APScheduler thread quét 60s — chỉ 1 lần, thread-safe."""
    global _scheduler
    with _lock:
        if _scheduler is not None and _scheduler.running:
            logger.info('[ModerationScanner] Scheduler đã chạy, skip.')
            return
        _scheduler = BackgroundScheduler(
            timezone='Asia/Ho_Chi_Minh',
            job_defaults={'coalesce': True, 'max_instances': 1})
        _scheduler.add_job(
            scan_violating_tasks,
            trigger=IntervalTrigger(seconds=60),
            id='moderation_category_scan',
            name='EduCareLink Moderation Scanner (60s — 3 danh mục)',
            replace_existing=True)
        _scheduler.start()
        logger.info('[ModerationScanner] Scheduler STARTED — quét vi phạm 3 danh mục mỗi 60s')
