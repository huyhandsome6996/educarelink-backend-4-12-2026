"""B1 — Service layer cho Care Diary.

Business logic tách biệt khỏi views (§15.3).
Chỉ phụ thuộc core models — không import payments/tracking/moderation.
"""

from django.core.exceptions import PermissionDenied

from core.models import Task, TaskApplication

from .models import CareDiaryActivity, CareDiaryEntry


def _get_accepted_application(*, task_id, worker):
    """Lấy application đã accepted cho task+worker. Raise nếu không tìm thấy."""
    try:
        return TaskApplication.objects.get(
            task_id=task_id, worker=worker, status='accepted',
        )
    except TaskApplication.DoesNotExist:
        raise PermissionError(
            'Bạn không phải CarePartner được nhận việc này.'
        )


def check_worker_can_write(*, task, worker):
    """Kiểm tra worker được phép tạo/sửa nhật ký cho task.

    Raises:
        PermissionError: worker không phải người được accepted.
        ValueError: task đang open (chưa bắt đầu làm).
    """
    _get_accepted_application(task_id=task.id, worker=worker)
    if task.status == 'open':
        raise ValueError(
            'Chỉ được ghi nhật ký khi công việc đã bắt đầu hoặc đã hoàn thành.'
        )
    if task.status == 'cancelled':
        raise ValueError(
            'Không thể ghi nhật ký cho công việc đã bị hủy.'
        )


def check_can_read(*, task, user):
    """Kiểm tra user được phép xem nhật ký.

    Raises:
        PermissionError: user không phải parent chủ task hay worker accepted.
    """
    if task.parent_id == user.id:
        return  # parent chủ task
    # Kiểm tra user là worker đã được accepted trên task này
    try:
        TaskApplication.objects.get(
            task_id=task.id, worker=user, status='accepted',
        )
        return  # worker accepted — có quyền xem (nếu chưa có entry thì trả 404 ở view)
    except TaskApplication.DoesNotExist:
        pass
    raise PermissionError('Bạn không có quyền xem nhật ký này.')


def parse_completion_percent(raw):
    """Parse + validate completion_percent (0-100). Raise ValueError nếu sai."""
    try:
        val = int(raw)
    except (TypeError, ValueError):
        raise ValueError('completion_percent phải là số nguyên.')
    if val < 0 or val > 100:
        raise ValueError('completion_percent phải nằm trong khoảng 0-100.')
    return val


def get_parent_diary_history(*, parent):
    """Lấy danh sách rút gọn nhật ký của phụ huynh, sắp xếp mới nhất trước.

    Sắp xếp theo task.scheduled_time DESC (thời gian buổi chăm sóc thực tế),
    không phải entry.created_at. Lý do: phụ huynh muốn theo dõi tiến bộ
    theo thứ tự các buổi diễn ra, chứ không phải theo lúc CarePartner ghi.
    """
    from django.utils import timezone as django_tz

    entries = CareDiaryEntry.objects.filter(
        task__parent=parent,
    ).select_related('task', 'worker').order_by('-task__scheduled_time', '-created_at')

    weekday_names = [
        'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm',
        'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật',
    ]
    result = []
    for entry in entries:
        # BUG-10 fix: dùng task.scheduled_time (thời gian buổi chăm sóc),
        # không phải entry.created_at (thời gian ghi nhật ký).
        local_scheduled = django_tz.localtime(entry.task.scheduled_time)
        date_str = (
            f"{weekday_names[local_scheduled.weekday()]}, "
            f"{local_scheduled.day} Tháng {local_scheduled.month}, {local_scheduled.year}"
        )
        result.append({
            'task_id': entry.task_id,
            'task_title': entry.task.title,
            'date': date_str,
            'mood': {
                'icon': entry.mood_icon or 'happy',
                'label': entry.mood_label,
            },
            'completion_percent': entry.completion_percent,
            'worker_name': entry.worker.get_full_name() or entry.worker.username,
        })
    return result


def build_entry_response(*, entry, request=None):
    """Xây dựng response JSON cho 1 CareDiaryEntry.

    Response shape phải khớp với CareDiaryDetailScreen.js đọc:
      carepartner, date, mood, completion, activities, note, attachments.
    """
    from django.utils import timezone as django_tz

    worker = entry.worker
    # Tính stats động từ activities (không lưu riêng — tránh data lệch)
    acts = entry.activities.all()
    total = acts.count()
    done_count = acts.filter(status='done').count()
    partial_count = acts.filter(status='partial').count()
    skipped_count = acts.filter(status='skipped').count()

    # Format date tiếng Việt — BUG-10 fix: dùng scheduled_time, không phải created_at
    local_scheduled = django_tz.localtime(entry.task.scheduled_time)
    weekday_names = [
        'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm',
        'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật',
    ]
    date_str = (
        f"{weekday_names[local_scheduled.weekday()]}, "
        f"{local_scheduled.day} Tháng {local_scheduled.month}, {local_scheduled.year}"
    )

    # Ảnh đính kèm — trả absolute URL
    attachment_list = []
    for att in entry.attachments.all():
        url = None
        if att.image and request:
            url = request.build_absolute_uri(att.image.url)
            # Fix HTTPS trên Render
            import os
            if os.environ.get('RENDER', '') or request.is_secure():
                url = url.replace('http://', 'https://', 1)
        elif att.image:
            url = att.image.url
        attachment_list.append({
            'id': att.id,
            'type': 'image',
            'url': url,
        })

    return {
        'id': entry.id,
        'carepartner': {
            'name': worker.get_full_name() or worker.username,
            'role': 'CarePartner',
            'avatarInitial': (worker.first_name or worker.username)[0].upper(),
            'verified': worker.is_verified,
        },
        'date': date_str,
        'mood': {
            'icon': entry.mood_icon or 'happy',
            'label': entry.mood_label,
            'note': entry.mood_note,
        },
        'completion': {
            'percent': entry.completion_percent,
            'stats': [
                {'value': total, 'label': 'Hoạt động', 'color': '#333333'},
                {'value': done_count, 'label': 'Hoàn thành tốt', 'color': '#22c55e'},
                {'value': partial_count, 'label': 'Cần cố gắng', 'color': '#F26522'},
            ],
        },
        'activities': [
            {
                'time': a.time,
                'title': a.title,
                'desc': a.description,
                'status': a.status,
            }
            for a in acts
        ],
        'note': entry.note,
        'attachments': attachment_list,
    }