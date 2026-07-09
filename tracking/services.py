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

from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert, DeviceHeartbeat, DeviceOfflineAlert

logger = logging.getLogger('educarelink.tracking')

GEOFENCE_RADIUS_METERS = getattr(settings, 'TRACKING_GEOFENCE_RADIUS', 500)  # 500m mặc định
UPDATE_INTERVAL_SECONDS = getattr(settings, 'TRACKING_UPDATE_INTERVAL', 10)
HEARTBEAT_INTERVAL_SECONDS = getattr(settings, 'TRACKING_HEARTBEAT_INTERVAL', 30)
OFFLINE_THRESHOLD_SECONDS = getattr(settings, 'TRACKING_OFFLINE_THRESHOLD', 90)  # 3 lần miss heartbeat


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


# ═══════════════════════════════════════════════════════════════════
#  DEVICE OFFLINE ALERT — chống tắt máy/đập máy để phạm tội
# ═══════════════════════════════════════════════════════════════════

def update_heartbeat(*, task: Task, worker: User,
                      latitude: float = None, longitude: float = None,
                      battery_level: int = None, app_state: str = '',
                      network_type: str = '') -> DeviceHeartbeat:
    """
    Carepartner app gửi heartbeat mỗi 30s khi đang tracking.
    - Verify consent granted + task in_progress
    - Update_or_create DeviceHeartbeat
    - Nếu có alert active (đã recovered) → tự resolve + push "đã online trở lại"
    """
    # Verify consent
    try:
        consent = LocationConsent.objects.get(task=task, worker=worker)
        if consent.consent != 'granted':
            raise PermissionError(f"Consent hiện tại: {consent.consent} — không thể update heartbeat.")
    except LocationConsent.DoesNotExist:
        raise PermissionError("Carepartner chưa đồng ý chia sẻ vị trí cho task này.")

    # Verify task đang in_progress
    if task.status != 'in_progress':
        raise ValueError(f"Task status='{task.status}' — chỉ heartbeat khi in_progress.")

    # Verify worker là người được accept
    accepted_worker = get_accepted_worker(task)
    if not accepted_worker or accepted_worker.id != worker.id:
        raise PermissionError("Bạn không phải là carepartner được chọn cho task này.")

    now = timezone.now()

    with transaction.atomic():
        heartbeat, created = DeviceHeartbeat.objects.update_or_create(
            task=task,
            defaults={
                'worker': worker,
                'last_seen': now,
                'last_location_lat': Decimal(str(latitude)) if latitude else None,
                'last_location_lng': Decimal(str(longitude)) if longitude else None,
                'device_status': 'online',
                'battery_level': battery_level,
                'app_state': app_state,
                'network_type': network_type,
                'offline_detected_at': None,
                'offline_alert_sent': False,
            }
        )

        # Nếu có alert active → resolve + notify parent "thiết bị đã online trở lại"
        active_alerts = DeviceOfflineAlert.objects.filter(
            task=task, worker=worker, status='active'
        )
        for alert in active_alerts:
            alert.status = 'recovered'
            alert.recovered_at = now
            if alert.last_seen:
                duration = (now - alert.last_seen).total_seconds()
                alert.recovery_duration_seconds = int(duration)
            alert.save(update_fields=['status', 'recovered_at', 'recovery_duration_seconds'])

            # Notify parent
            _notify_user(
                task.parent,
                title="✅ Thiết bị Carepartner đã online trở lại",
                message=f"Thiết bị của carepartner đã kết nối lại cho công việc '{task.title}'. "
                        f"Đã ngoại tuyến khoảng {alert.recovery_duration_seconds}s.",
                data={
                    'type': 'device_recovered',
                    'task_id': task.id,
                    'alert_id': alert.id,
                    'priority': 'normal',
                }
            )

    return heartbeat


def check_offline_devices():
    """
    Scheduler chạy mỗi 1 phút — quét tất cả heartbeat có:
      - device_status='online'
      - task.status='in_progress'
      - consent='granted'
      - last_seen < now - OFFLINE_THRESHOLD_SECONDS (90s)

    Với mỗi heartbeat thỏa mãn → tạo DeviceOfflineAlert + push priority=high cho parent.

    Trả về dict thống kê.
    """
    now = timezone.now()
    threshold = now - timedelta(seconds=OFFLINE_THRESHOLD_SECONDS)

    # Tìm heartbeat quá hạn
    stale_heartbeats = DeviceHeartbeat.objects.filter(
        device_status='online',
        last_seen__lt=threshold,
        task__status='in_progress',
    ).select_related('task', 'worker', 'task__parent')

    stats = {
        'checked_at': now.isoformat(),
        'stale_count': stale_heartbeats.count(),
        'new_alerts': 0,
        'already_alerted': 0,
        'push_failed': 0,
    }

    for hb in stale_heartbeats:
        # Skip nếu đã có alert active cho task này (tránh spam)
        existing_active = DeviceOfflineAlert.objects.filter(
            task=hb.task, status='active'
        ).exists()
        if existing_active:
            stats['already_alerted'] += 1
            continue

        # Đánh dấu heartbeat là offline
        hb.device_status = 'offline'
        hb.offline_detected_at = now
        hb.save(update_fields=['device_status', 'offline_detected_at'])

        # Tạo alert
        alert = DeviceOfflineAlert.objects.create(
            task=hb.task,
            worker=hb.worker,
            heartbeat=hb,
            last_seen=hb.last_seen,
            last_location_lat=hb.last_location_lat,
            last_location_lng=hb.last_location_lng,
            status='active',
        )

        # Push notification CHO PHỤ HUYNH — priority=high, chuông kêu
        try:
            _notify_user(
                hb.task.parent,
                title="🚨🚨🚨 CẢNH BÁO KHẨN CẤP: Thiết bị Carepartner mất kết nối!",
                message=f"⚠️ Thiết bị của carepartner đã ngừng gửi tín hiệu "
                        f"cho công việc '{hb.task.title}'. "
                        f"Lần cuối online: {hb.last_seen:%H:%M:%S}. "
                        f"Vui lòng liên hệ carepartner NGAY hoặc gọi cơ quan chức năng nếu nghi ngờ!",
                data={
                    'type': 'device_offline',
                    'task_id': hb.task.id,
                    'alert_id': alert.id,
                    'priority': 'high',  # expo: high priority = chuông kêu
                    'sound': 'critical',  # iOS critical alert
                    'android_channel_id': 'critical_alerts',
                }
            )
            alert.push_sent = True
            alert.push_sent_at = now
            alert.save(update_fields=['push_sent', 'push_sent_at'])
            stats['new_alerts'] += 1

            # Notify admin cũng
            try:
                admin_users = User.objects.filter(is_staff=True, is_active=True)
                for admin in admin_users:
                    Notification.objects.create(
                        recipient=admin,
                        title="🚨 Thiết bị carepartner mất kết nối",
                        message=f"Task '{hb.task.title}' (#{hb.task.id}) — carepartner {hb.worker.username} "
                                f"đã offline. Parent {hb.task.parent.username} đã được báo động.",
                    )
            except Exception:
                pass

        except Exception as e:
            logger.error(f"[tracking] Offline push failed for Task#{hb.task_id}: {e}")
            stats['push_failed'] += 1

    if stats['new_alerts'] > 0 or stats['already_alerted'] > 0:
        logger.info(f"[tracking] Offline check: {stats}")

    return stats


def clear_task_heartbeat(task: Task):
    """
    Được gọi khi task completed/cancelled — clear heartbeat + close active alerts.
    """
    # Close active alerts
    DeviceOfflineAlert.objects.filter(
        task=task, status='active'
    ).update(status='task_ended')

    # Mark heartbeat as stopped
    DeviceHeartbeat.objects.filter(task=task).update(device_status='stopped')
    logger.info(f"[tracking] Cleared heartbeat for Task#{task.id} (status={task.status})")


def get_device_status(*, task: Task, requester: User) -> dict:
    """
    Parent lấy trạng thái thiết bị carepartner cho task.
    Trả về:
      - heartbeat info (last_seen, device_status, battery, location cuối)
      - active_offline_alerts: list alert active
      - seconds_since_last_seen: số giây từ lần cuối heartbeat
      - is_offline: bool (True nếu > OFFLINE_THRESHOLD_SECONDS)
    """
    if task.parent_id != requester.id and not requester.is_superuser:
        raise PermissionError("Bạn không sở hữu task này.")

    try:
        hb = DeviceHeartbeat.objects.get(task=task)
    except DeviceHeartbeat.DoesNotExist:
        return {
            'has_heartbeat': False,
            'is_offline': False,
            'message': 'Carepartner chưa bật chia sẻ vị trí.',
        }

    now = timezone.now()
    seconds_since = (now - hb.last_seen).total_seconds() if hb.last_seen else None
    is_offline = (
        hb.device_status == 'offline' or
        (seconds_since is not None and seconds_since > OFFLINE_THRESHOLD_SECONDS)
    )

    active_alerts = DeviceOfflineAlert.objects.filter(
        task=task, status='active'
    ).order_by('-created_at')

    return {
        'has_heartbeat': True,
        'is_offline': is_offline,
        'device_status': hb.device_status,
        'last_seen': hb.last_seen.isoformat() if hb.last_seen else None,
        'seconds_since_last_seen': int(seconds_since) if seconds_since else None,
        'offline_threshold_seconds': OFFLINE_THRESHOLD_SECONDS,
        'last_location': {
            'latitude': float(hb.last_location_lat) if hb.last_location_lat else None,
            'longitude': float(hb.last_location_lng) if hb.last_location_lng else None,
        },
        'battery_level': hb.battery_level,
        'app_state': hb.app_state,
        'network_type': hb.network_type,
        'active_alerts': [
            {
                'id': a.id,
                'status': a.status,
                'last_seen': a.last_seen.isoformat() if a.last_seen else None,
                'created_at': a.created_at.isoformat(),
                'push_sent': a.push_sent,
                'recovered_at': a.recovered_at.isoformat() if a.recovered_at else None,
                'recovery_duration_seconds': a.recovery_duration_seconds,
            }
            for a in active_alerts
        ],
        'last_alert': {
            'id': active_alerts[0].id,
            'created_at': active_alerts[0].created_at.isoformat(),
            'last_seen': active_alerts[0].last_seen.isoformat() if active_alerts[0].last_seen else None,
        } if active_alerts else None,
    }


def get_offline_alerts_for_task(*, task: Task, requester: User, limit: int = 50):
    """Parent lấy list offline alerts của task (lưu vĩnh viễn)."""
    if task.parent_id != requester.id and not requester.is_superuser:
        raise PermissionError("Bạn không sở hữu task này.")

    qs = DeviceOfflineAlert.objects.filter(task=task).order_by('-created_at')[:limit]
    return [
        {
            'id': a.id,
            'status': a.status,
            'last_seen': a.last_seen.isoformat() if a.last_seen else None,
            'last_location': {
                'latitude': float(a.last_location_lat) if a.last_location_lat else None,
                'longitude': float(a.last_location_lng) if a.last_location_lng else None,
            },
            'push_sent': a.push_sent,
            'push_sent_at': a.push_sent_at.isoformat() if a.push_sent_at else None,
            'recovered_at': a.recovered_at.isoformat() if a.recovered_at else None,
            'recovery_duration_seconds': a.recovery_duration_seconds,
            'created_at': a.created_at.isoformat(),
        }
        for a in qs
    ]
