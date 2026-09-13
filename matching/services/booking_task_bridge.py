"""
matching/services/booking_task_bridge.py — Cầu Booking (matching) → Task (core).

BỐI CẢNH — N-003 (QA 2026-09-13):
  Chat EduCareLink mở trên core.Task (chat.Conversation.task OneToOne, cửa sổ
  mở khi task → 'in_progress', đóng 24h sau completed_at — chat/services.py).
  Tracking + Review (core.Review.task OneToOne) cũng gắn Task. Booking Flow 1
  KHÔNG có Task → nút chat/đánh giá trên thẻ booking của phụ huynh sẽ 404
  (trước đây client còn truyền nhầm booking.job_id — JobPost UUID — làm taskId).

GIẢI PHÁP (phương án (i) của QA): khi booking → in_progress, tạo 1 Task
"mirror" + TaskApplication(accepted) cho CarePartner của booking, rồi chuyển
Task → in_progress. Signal chat (chat/signals.py) tự mở conversation — KHÔNG
sửa chat/core. Booking.task giữ liên kết để serializer trả task_id về client.

Đồng bộ vòng đời (sync_task_mirror_on_transition, gọi từ state.transition):
  booking IN_PROGRESS      → tạo/đảm bảo Task mirror + Task → 'in_progress'
                             (chat MỞ)
  booking AWAITING_REVIEW  → Task → 'completed' (completed_at = ended_at)
                             (chat đóng tại completed_at + 24h — đúng cửa sổ
                             N-003 "Chat (24h)" trên thẻ đã hoàn thành)
  booking COMPLETED        → không đổi (đã hoàn thành ở bước trên)
  booking hủy/no_show/...  → Task → 'cancelled' nếu chưa completed
                             (chat ĐÓNG NGAY — đúng chính sách task bị hủy)

Cam kết an toàn:
  - Idempotent: gọi nhiều lần không tạo trùng (get_or_create + check status).
  - KHÔNG BAO GIỜ làm hỏng luồng booking: mọi lỗi mirror được nuốt + log
    (booking vẫn chuyển trạng thái bình thường; chat button client-side tự
    ẩn khi task_id rỗng — degradation trung thực, không 404).
  - Chạy trong transaction.atomic() (savepoint) — rollback cùng luồng gọi.
"""

import logging

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('educarelink.matching.booking_task_bridge')

# Trạng thái booking kết thúc mà KHÔNG có ca làm thật → task mirror phải hủy
# (chat đóng ngay nếu từng mở). Chuẩn chính sách: task 'cancelled' → đóng NGAY.
_TERMINAL_WITHOUT_SHIFT = frozenset({
    'cancelled_by_parent',
    'cancelled_by_carepartner',
    'declined_in_window',
    'expired_no_response',
    'no_show',
    'no_show_unconfirmed',
})


def _slot_start_aware(booking):
    """Thời điểm bắt đầu ca (timezone-aware) từ first_slot — fallback started_at."""
    first = booking.job.slots.order_by('date', 'time_from').first() if booking.job_id else None
    if first and first.date:
        import datetime as dt
        try:
            tz = timezone.get_current_timezone()
            hh, mm = (first.time_from.hour, first.time_from.minute) if first.time_from else (0, 0)
            return timezone.make_aware(dt.datetime.combine(first.date, dt.time(hh, mm)), tz)
        except Exception:
            pass
    return booking.started_at or timezone.now()


def ensure_task_for_booking(booking):
    """Đảm bảo booking có Task mirror + TaskApplication(accepted). Idempotent.

    Tạo Task ở status 'open' TRƯỚC rồi mới tạo application, sau đó flip
    'in_progress' — thứ tự này bắt buộc: signal chat mở conversation chỉ khi
    task CHUYỂN sang 'in_progress' VÀ đã có application accepted (xem
    chat/services.open_conversation_for_task).

    Trả về (task, created). Không raise — lỗi được log và trả (None, False).
    """
    if booking.task_id:
        return booking.task, False

    from core.models import Task, TaskApplication

    job = booking.job
    title = (job.title or 'Ca chăm sóc EduCareLink')[:255]
    address = ''
    td = getattr(job, 'type_data', None) or {}
    loc = td.get('pickup_location') or td.get('destination_location')
    if isinstance(loc, dict):
        address = (loc.get('address') or loc.get('label') or loc.get('name') or '')
    if not address:
        address = (td.get('location_note') or '') or 'Theo thỏa thuận với phụ huynh'

    try:
        with transaction.atomic():
            task = Task.objects.create(
                title=title,
                description=(getattr(job, 'description', '') or '')[:5000],
                price=booking.total_value_vnd or 0,
                status='open',
                parent=booking.parent,
                category=None,  # job_type Flow 1 không map 1-1 ServiceCategory legacy
                location=address[:255],
                latitude=getattr(job, 'latitude', None),
                longitude=getattr(job, 'longitude', None),
                scheduled_time=_slot_start_aware(booking),
            )
            TaskApplication.objects.get_or_create(
                task=task, worker=booking.carepartner,
                defaults={'status': 'accepted'},
            )
            # Flip 'open' → 'in_progress' ở lần save RIÊNG để post_save signal
            # của chat thấy old='open' → new='in_progress' và MỞ conversation.
            task.status = 'in_progress'
            task.save(update_fields=['status'])

            booking.task = task
            booking.save(update_fields=['task', 'updated_at'])
        logger.info('[Bridge] Booking %s → Task mirror #%s (in_progress, chat mở)',
                    booking.pk, task.pk)
        return task, True
    except Exception:
        logger.warning('[Bridge] Không tạo được Task mirror cho booking %s',
                       booking.pk, exc_info=True)
        return None, False


def sync_task_mirror_on_transition(booking, to_status):
    """Hook trung tâm gọi từ state.transition() SAU khi booking đổi status.

    Không raise — mọi exception bị nuốt + log (mirror fail không được phá
    luồng booking tiền + trạng thái).
    """
    try:
        if to_status == 'in_progress':
            ensure_task_for_booking(booking)
            return

        task = booking.task
        if task is None:
            return

        if to_status == 'awaiting_review':
            # Ca kết thúc → task completed + completed_at → chat 24h window.
            if task.status != 'completed':
                with transaction.atomic():
                    task.completed_at = booking.ended_at or timezone.now()
                    task.status = 'completed'
                    task.save(update_fields=['status', 'completed_at'])
                logger.info('[Bridge] Task mirror #%s → completed (chat +24h)',
                            task.pk)
            return

        if to_status in _TERMINAL_WITHOUT_SHIFT:
            if task.status not in ('completed', 'cancelled'):
                with transaction.atomic():
                    task.status = 'cancelled'
                    task.save(update_fields=['status'])
                logger.info('[Bridge] Task mirror #%s → cancelled (booking %s)',
                            task.pk, to_status)
            return
    except Exception:
        logger.warning('[Bridge] sync mirror lỗi cho booking %s (→ %s)',
                       getattr(booking, 'pk', '?'), to_status, exc_info=True)
