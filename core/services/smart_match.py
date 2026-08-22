"""
A2 — Dịch vụ ghép việc thông minh theo lịch rảnh.

Chứa logic matching/ranking hoàn toàn tách biệt khỏi view,
dễ test và không phụ thuộc request/response.

Yêu cầu đầu vào:
  - task: Task instance (đã có scheduled_time, latitude, longitude)
  - radius_m: int — bán kính tìm kiếm (mét)

Yêu cầu xếp hạng:
  1. Ưu tiên worker không có việc accepted/in_progress cùng ngày
  2. Rồi ít việc accepted/in_progress hơn trong cùng tuần ISO
  3. Rồi khoảng cách gần hơn
  4. Rồi worker ID nhỏ hơn (tie-breaker ổn định)
"""

from django.utils import timezone
from django.conf import settings
from django.db.models import Count, Q

from core.models import User, Task, TaskApplication, WorkerAvailability


# ISO weekday: Thứ Hai=1 … Chủ Nhật=7
# Model weekday: Thứ Hai=0 … Chủ Nhật=6
# Chuyển đổi: iso → model = iso - 1


def _task_weekday_model(task_time):
    """Trả về weekday theo model (0=Thứ Hai) từ timezone-aware datetime."""
    local_time = timezone.localtime(task_time)
    return local_time.isoweekday() - 1  # iso: 1(Mon)..7(Sun) → 0(Mon)..6(Sun)


def _task_time_only(task_time):
    """Trả về time() từ timezone-aware datetime."""
    return timezone.localtime(task_time).time()


def _make_tz_aware(date_val, time_val):
    """Kết hợp date + time thành timezone-aware datetime trong Asia/Ho_Chi_Minh."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo('Asia/Ho_Chi_Minh')
    return timezone.datetime.combine(date_val, time_val).replace(tzinfo=tz)


def _get_day_range(task_local_dt):
    """Trả về (day_start, day_end) timezone-aware cho ngày của task."""
    day_date = task_local_dt.date()
    day_start = _make_tz_aware(day_date, timezone.datetime.min.time())
    day_end = _make_tz_aware(day_date, timezone.datetime.max.time())
    return day_start, day_end


def _get_week_range(task_local_dt):
    """Trả về (week_start, week_end) timezone-aware cho ISO week của task."""
    iso_year, iso_week, _ = task_local_dt.isocalendar()
    monday = timezone.datetime.fromisocalendar(iso_year, iso_week, 1).date()
    sunday = monday + timezone.timedelta(days=6)
    week_start = _make_tz_aware(monday, timezone.datetime.min.time())
    week_end = _make_tz_aware(sunday, timezone.datetime.max.time())
    return week_start, week_end


def find_smart_matches(task, radius_m=None):
    """Tìm và xếp hạng CarePartner phù hợp cho task.

    Trả về:
      {'matches': [...], 'message': str|None}
    Mỗi match: {
        'worker_id': int,
        'display_name': str,
        'avatar_url': str|None,
        'qualifications': list,
        'distance_m': float,
        'distance_text': str,
        'availability_window': str,
        'workload_day': int,
        'workload_week': int,
        'rank_reason': str,
    }
    """
    if radius_m is None:
        radius_m = getattr(settings, 'SMART_MATCH_RADIUS_METERS', 5000)

    # Kiểm tra task có toạ độ
    if task.latitude is None or task.longitude is None:
        return {
            'matches': [],
            'message': 'Công việc chưa có vị trí trên bản đồ nên không thể tìm CarePartner gần đây.',
        }

    task_weekday = _task_weekday_model(task.scheduled_time)
    task_time = _task_time_only(task.scheduled_time)
    task_local = timezone.localtime(task.scheduled_time)

    # 1. Worker có availability khớp weekday + chứa task time
    avail_qs = WorkerAvailability.objects.filter(
        weekday=task_weekday,
        start_time__lte=task_time,
        end_time__gt=task_time,
    ).values_list('worker_id', 'start_time', 'end_time')

    if not avail_qs.exists():
        return {
            'matches': [],
            'message': 'Không có CarePartner nào rảnh vào khung giờ này.',
        }

    # Map worker_id → availability window
    avail_map = {}
    for wid, st, et in avail_qs:
        if wid not in avail_map:
            avail_map[wid] = f"{st.strftime('%H:%M')}–{et.strftime('%H:%M')}"

    # 2. Filter worker: approved, active, có toạ độ
    workers = User.objects.filter(
        id__in=avail_map.keys(),
        role='worker',
        is_approved=True,
        is_active=True,
        latitude__isnull=False,
        longitude__isnull=False,
    )

    if not workers.exists():
        return {
            'matches': [],
            'message': 'Không có CarePartner đủ điều kiện (đã duyệt, có vị trí) cho công việc này.',
        }

    # 3. Spatial filtering
    from performance.spatial import bounding_box_filter

    candidates = [(w.latitude, w.longitude, {'id': w.id}) for w in workers]
    in_radius = bounding_box_filter(task.latitude, task.longitude, radius_m, candidates)

    if not in_radius:
        return {
            'matches': [],
            'message': f'Không có CarePartner nào trong bán kính {radius_m/1000:.0f}km.',
        }

    # 4. Batch workload counting — timezone-aware bounds
    worker_ids = [c['id'] for c in in_radius]

    day_start, day_end = _get_day_range(task_local)
    week_start, week_end = _get_week_range(task_local)

    day_wl = dict(
        TaskApplication.objects.filter(
            worker_id__in=worker_ids, status='accepted',
            task__status__in=('open', 'in_progress', 'completed'),
            task__scheduled_time__range=(day_start, day_end),
        ).values('worker_id').annotate(c=Count('id')).values_list('worker_id', 'c')
    )
    week_wl = dict(
        TaskApplication.objects.filter(
            worker_id__in=worker_ids, status='accepted',
            task__status__in=('open', 'in_progress', 'completed'),
            task__scheduled_time__range=(week_start, week_end),
        ).values('worker_id').annotate(c=Count('id')).values_list('worker_id', 'c')
    )

    # 5. Build results
    worker_map = {w.id: w for w in workers if w.id in worker_ids}

    results = []
    for c in in_radius:
        wid = c['id']
        dist = c.get('_distance', 0)
        w = worker_map[wid]
        wd = day_wl.get(wid, 0)
        ww = week_wl.get(wid, 0)

        reasons = []
        if wd == 0:
            reasons.append('Không có việc cùng ngày')
        if ww == 0:
            reasons.append('Không có việc trong tuần')
        dist_km = dist / 1000
        reasons.append(f'Cách {dist:.0f}m' if dist < 1000 else f'Cách {dist_km:.1f}km')

        results.append({
            'worker_id': wid,
            'display_name': w.get_full_name() or w.username,
            'avatar_url': w.avatar_url,
            'qualifications': w.qualifications or [],
            'distance_m': round(dist, 1),
            'distance_text': f'{dist:.0f}m' if dist < 1000 else f'{dist_km:.1f}km',
            'availability_window': avail_map[wid],
            'workload_day': wd,
            'workload_week': ww,
            'rank_reason': ', '.join(reasons),
            '_s': (wd, ww, dist, wid),  # sort key
        })

    results.sort(key=lambda r: r['_s'])
    for r in results:
        del r['_s']

    return {'matches': results, 'message': None}
