"""
Service layer cho tracking module.
Tách logic nghiệp vụ khỏi views.
"""

import logging
import math
from datetime import timedelta
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.conf import settings

from core.models import User, Task, TaskApplication, Notification
from core.views import send_expo_push_notification

from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert

logger = logging.getLogger('educarelink.tracking')

GEOFENCE_RADIUS_METERS = getattr(settings, 'TRACKING_GEOFENCE_RADIUS', 500)  # 500m mặc định
UPDATE_INTERVAL_SECONDS = getattr(settings, 'TRACKING_UPDATE_INTERVAL', 10)


def _notify_user(user: User, title: str, message: str, data: dict = None):
    """Helper: gửi in-app Notification + Expo push."""
    try:
        Notification.objects.create(recipient=user, title=title, message=message)
    except Exception as e:
        logger.warning(f"[tracking] Notification create thất bại: {e}")
    try:
        if user.expo_push_token:
            send_expo_push_notification(
                token=user.expo_push_token,
                title=title,
                body=message,
                data=data or {},
            )
    except Exception as e:
        logger.warning(f"[tracking] Expo push thất bại cho user#{user.id}: {e}")


def get_accepted_worker(task: Task) -> User | None:
    """Lấy carepartner được accept cho task."""
    app = TaskApplication.objects.filter(task=task, status='accepted').first()
    return app.worker if app else None


def grant_consent(*, task: Task, worker: User, granted: bool = True) -> LocationConsent:
    """
    Carepartner đồng ý hoặc từ chối chia sẻ vị trí cho task.
    Idempotent: nếu đã có consent rồi thì update.
    """
    if granted:
        consent, _ = LocationConsent.objects.update_or_create(
            task=task, worker=worker,
            defaults={
                'consent': 'granted',
                'granted_at': timezone.now(),
                'revoked_at': None,
            }
        )
    else:
        consent, _ = LocationConsent.objects.update_or_create(
            task=task, worker=worker,
            defaults={
                'consent': 'denied',
                'granted_at': None,
            }
        )
    return consent


def revoke_consent(*, task: Task, worker: User) -> LocationConsent | None:
    """
    Carepartner rút lại đồng ý (dừng khẩn cấp).
    - consent → 'revoked'
    - Xóa LiveLocation (parent sẽ không thấy vị trí nữa)
    - Notify parent
    """
    try:
        consent = LocationConsent.objects.get(task=task, worker=worker)
    except LocationConsent.DoesNotExist:
        return None

    consent.consent = 'revoked'
    consent.revoked_at = timezone.now()
    consent.save()

    # Xóa vị trí hiện tại
    LiveLocation.objects.filter(task=task).delete()

    # Notify parent
    _notify_user(
        task.parent,
        title="⚠️ Carepartner đã dừng chia sẻ vị trí",
        message=f"Carepartner đã dừng chia sẻ vị trí cho công việc '{task.title}'. Vui lòng liên hệ trực tiếp để cập nhật.",
        data={'type': 'tracking_stopped', 'task_id': task.id}
    )
    return consent


def update_worker_location(*, task: Task, worker: User,
                            latitude: float, longitude: float,
                            accuracy: float = None, speed: float = None,
                            heading: float = None) -> LiveLocation:
    """
    Carepartner update vị trí hiện tại (gọi mỗi 10s).
    - Verify consent đã granted
    - Verify task đang in_progress
    - Update LiveLocation (update-in-place)
    - Append vào LocationHistory (lưu vĩnh viễn)
    - Check geofence → push warning nếu rời vùng
    """
    # Verify consent
    try:
        consent = LocationConsent.objects.get(task=task, worker=worker)
        if consent.consent != 'granted':
            raise PermissionError(f"Consent hiện tại: {consent.consent} — không thể update vị trí.")
    except LocationConsent.DoesNotExist:
        raise PermissionError("Carepartner chưa đồng ý chia sẻ vị trí cho task này.")

    # Verify task đang in_progress
    if task.status != 'in_progress':
        raise ValueError(f"Task status='{task.status}' — chỉ track khi in_progress.")

    # Verify worker là người được accept
    accepted_worker = get_accepted_worker(task)
    if not accepted_worker or accepted_worker.id != worker.id:
        raise PermissionError("Bạn không phải là carepartner được chọn cho task này.")

    with transaction.atomic():
        # Update LiveLocation (OneToOne với task — update-in-place)
        live, created = LiveLocation.objects.update_or_create(
            task=task,
            defaults={
                'worker': worker,
                'latitude': Decimal(str(latitude)),
                'longitude': Decimal(str(longitude)),
                'accuracy': accuracy,
                'speed': speed,
                'heading': heading,
            }
        )

        # Append vào LocationHistory
        LocationHistory.objects.create(
            task=task, worker=worker,
            latitude=Decimal(str(latitude)),
            longitude=Decimal(str(longitude)),
            accuracy=accuracy, speed=speed, heading=heading,
        )

        # Geofence check (nếu task có geofence tùy chỉnh HOẶC lat/lng mặc định)
        geofence_warned = False
        # Ưu tiên dùng geofence_lat/lng/radius từ task (parent vẽ trên map)
        geofence_lat = task.geofence_lat if (task.geofence_lat is not None) else task.latitude
        geofence_lng = task.geofence_lng if (task.geofence_lng is not None) else task.longitude
        geofence_radius = task.geofence_radius if (task.geofence_radius and task.geofence_radius > 0) else GEOFENCE_RADIUS_METERS

        if geofence_lat and geofence_lng:
            distance = haversine_distance(
                float(latitude), float(longitude),
                float(geofence_lat), float(geofence_lng)
            )
            outside = distance > geofence_radius
            if outside and not live.is_outside_geofence:
                # Vừa rời vùng → push cảnh báo
                live.is_outside_geofence = True
                live.geofence_warned_at = timezone.now()
                live.save(update_fields=['is_outside_geofence', 'geofence_warned_at'])
                geofence_warned = True
                _notify_user(
                    task.parent,
                    title="🚨🚨🚨 CẢNH BÁO: Carepartner rời vùng an toàn!",
                    message=f"⚠️ Carepartner đã rời khỏi vùng an toàn "
                            f"({geofence_radius:.0f}m) của công việc '{task.title}'. "
                            f"Hiện cách {distance:.0f}m. Vui lòng kiểm tra ngay!",
                    data={
                        'type': 'geofence_exit',
                        'task_id': task.id,
                        'distance': distance,
                        'radius': geofence_radius,
                        'priority': 'high',
                    }
                )
            elif not outside and live.is_outside_geofence:
                # Vừa quay lại vùng → clear flag + thông báo yên tâm
                live.is_outside_geofence = False
                live.save(update_fields=['is_outside_geofence'])
                _notify_user(
                    task.parent,
                    title="✅ Carepartner đã quay lại vùng an toàn",
                    message=f"Carepartner đã quay lại vùng an toàn của công việc '{task.title}'.",
                    data={
                        'type': 'geofence_enter',
                        'task_id': task.id,
                    }
                )

    return live


def get_live_location(*, task: Task, requester: User) -> LiveLocation | None:
    """
    Parent lấy vị trí hiện tại của carepartner.
    - Verify requester là parent sở hữu task
    - Verify consent đã granted
    """
    if task.parent_id != requester.id:
        raise PermissionError("Bạn không sở hữu task này.")

    try:
        consent = LocationConsent.objects.get(task=task)
    except LocationConsent.DoesNotExist:
        return None

    if consent.consent != 'granted':
        return None

    return LiveLocation.objects.filter(task=task).first()


def get_location_history(*, task: Task, requester: User, limit: int = 1000):
    """
    Parent lấy lịch sử toàn bộ vị trí (lưu vĩnh viễn).
    Trả về list of dict cho frontend render polyline.
    """
    if task.parent_id != requester.id:
        raise PermissionError("Bạn không sở hữu task này.")

    qs = LocationHistory.objects.filter(task=task).order_by('recorded_at')[:limit]
    return [
        {
            'id': h.id,
            'latitude': float(h.latitude),
            'longitude': float(h.longitude),
            'accuracy': h.accuracy,
            'speed': h.speed,
            'heading': h.heading,
            'recorded_at': h.recorded_at.isoformat(),
        }
        for h in qs
    ]


def trigger_sos(*, task: Task, sender: User, latitude: float = None,
                 longitude: float = None, message: str = '') -> SOSAlert:
    """
    Carepartner hoặc parent bấm SOS.
    - Tạo SOSAlert
    - Push notification ngay cho bên kia
    """
    is_worker = (sender.role == 'worker')
    is_parent = (task.parent_id == sender.id)

    if not (is_worker or is_parent):
        raise PermissionError("Bạn không liên quan đến task này.")

    sender_role = 'worker' if is_worker else 'parent'
    recipient = task.parent if is_worker else get_accepted_worker(task)

    alert = SOSAlert.objects.create(
        task=task,
        sender=sender_role,
        sender_user=sender,
        latitude=Decimal(str(latitude)) if latitude else None,
        longitude=Decimal(str(longitude)) if longitude else None,
        message=message,
        status='active',
    )

    # Push cho recipient
    if recipient:
        sender_name = sender.first_name or sender.username
        location_text = ""
        if latitude and longitude:
            location_text = f" Vị trí: ({latitude:.5f}, {longitude:.5f})"
        _notify_user(
            recipient,
            title=f"🆘 SOS từ {sender_name}",
            message=f"{sender_name} vừa bấm SOS khẩn cấp cho công việc '{task.title}'.{location_text}",
            data={
                'type': 'sos_alert',
                'task_id': task.id,
                'sos_id': alert.id,
                'sender_role': sender_role,
            }
        )

    return alert


def clear_task_tracking(task: Task):
    """
    Được gọi khi task chuyển sang 'completed' hoặc 'cancelled'.
    - Xóa LiveLocation (parent không thấy vị trí nữa)
    - KHÔNG xóa LocationHistory (lưu vĩnh viễn để parent xem lại)
    - KHÔNG xóa LocationConsent (giữ để audit)
    """
    LiveLocation.objects.filter(task=task).delete()
    logger.info(f"[tracking] Cleared LiveLocation for Task#{task.id} (status={task.status})")


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Tính khoảng cách giữa 2 điểm GPS theo công thức Haversine.
    Trả về khoảng cách tính bằng mét.
    """
    R = 6371000  # Bán kính Trái Đất (mét)
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c
