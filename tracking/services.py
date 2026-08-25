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
OFFLINE_THRESHOLD_SECONDS = getattr(settings, 'TRACKING_OFFLINE_THRESHOLD', 60)  # 2 lần miss heartbeat (30s × 2)


def _notify_user(user: User, title: str, message: str, data: dict = None):
    """Helper: gửi in-app Notification + Expo push.

    QA-FIX-1 / Bug 1.4: trả về True/False/None theo kết quả push để caller
    quyết định set push_sent=True (trước đây fire-and-forget → set True sai).

    QA-FIX-8 / Bug #1: trả về tuple (result, reason) thay vì chỉ result.
      result: True/False/None
      reason: 'ok' | 'no_token' | 'expo_rejected' | 'device_not_registered' | 'network_error'
      Caller cần reason để log chính xác và quyết định có clear token hay không.
    """
    push_result = None
    push_reason = 'network_error'
    try:
        Notification.objects.create(recipient=user, title=title, message=message)
    except Exception as e:
        logger.warning(f"[tracking] Notification create thất bại: {e}")
    try:
        if user.expo_push_token:
            push_result = send_expo_push_notification(
                token=user.expo_push_token,
                title=title,
                body=message,
                data=data or {},
            )
            if push_result is True:
                push_reason = 'ok'
            elif push_result is False:
                push_reason = 'expo_rejected'
            # None stays 'network_error'
        else:
            push_reason = 'no_token'
    except Exception as e:
        logger.warning(f"[tracking] Expo push thất bại cho user#{user.id}: {e}")
        push_result = None
        push_reason = 'network_error'
    return push_result, push_reason


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
        #
        # QA-FIX-6 / NÊN LÀM 2 — set client_recorded_at = now() (server
        # time) cho real-time. Dùng để BatchLocationAPIView so sánh khi
        # flush offline queue: nếu existing.client_recorded_at mới hơn
        # batch.last_point['recorded_at'] → skip update, tránh ghi đè
        # LiveLocation bằng điểm cũ (race condition "nhảy lùi").
        _now = timezone.now()
        live, created = LiveLocation.objects.update_or_create(
            task=task,
            defaults={
                'worker': worker,
                'latitude': Decimal(str(latitude)),
                'longitude': Decimal(str(longitude)),
                'accuracy': accuracy,
                'speed': speed,
                'heading': heading,
                'client_recorded_at': _now,
            }
        )

        # Append vào LocationHistory
        LocationHistory.objects.create(
            task=task, worker=worker,
            latitude=Decimal(str(latitude)),
            longitude=Decimal(str(longitude)),
            accuracy=accuracy, speed=speed, heading=heading,
        )

        # Geofence check (nếu task có geofence tùy chỉnh HOẶC lat/lng mặc định).
        # Dedup đã được handle qua live.is_outside_geofence flag trên model:
        # notify chỉ fire khi `outside and not live.is_outside_geofence` (lần đầu
        # rời vùng), các poll tiếp theo khi vẫn outside sẽ thấy flag đã True → skip.
        # Ưu tiên dùng geofence_lat/lng/radius từ task (parent vẽ trên map)
        geofence_lat = task.geofence_lat if (task.geofence_lat is not None) else task.latitude
        geofence_lng = task.geofence_lng if (task.geofence_lng is not None) else task.longitude
        geofence_radius = task.geofence_radius if (task.geofence_radius and task.geofence_radius > 0) else GEOFENCE_RADIUS_METERS

        # QA-FIX-2 / E: dùng `is not None` thay vì `if geofence_lat` —
        # tọa độ 0 là hợp lệ (ví dụ: nhà ở kinh độ 0 đi qua Anh/Pháp),
        # trước đây `if 0` = False → fallback về task.latitude → bỏ sót
        # geofence check hoặc dùng sai tâm vùng an toàn.
        if geofence_lat is not None and geofence_lng is not None:
            distance = haversine_distance(
                float(latitude), float(longitude),
                float(geofence_lat), float(geofence_lng)
            )
            outside = distance > geofence_radius

            # ⚡ AI PREDICTIVE WARNING — báo TRƯỚC khi rời vùng (80% radius)
            # Nếu carepartner đang ở 80-100% bán kính → cảnh báo sớm "sắp rời vùng"
            #
            # QA-FIX-2 / E: dùng live.predictive_warned (persist DB) thay vì
            # thuộc tính tạm `_predictive_warned`. Trước đây mỗi GPS update
            # tạo instance LiveLocation mới → flag luôn reset → push lặp vô hạn
            # "sắp rời vùng an toàn" cho cùng 1 task. Giờ flag persist → chỉ
            # push 1 lần khi vào vùng 80-100%, clear khi về vùng an toàn (< 80%)
            # hoặc rời vùng (> 100%).
            warning_threshold = geofence_radius * 0.8
            if not outside and distance >= warning_threshold and not live.is_outside_geofence:
                if not live.predictive_warned:
                    live.predictive_warned = True
                    live.save(update_fields=['predictive_warned'])
                    _notify_user(
                        task.parent,
                        title="⚠️ AI Cảnh báo: Carepartner sắp rời vùng an toàn!",
                        message=f"Carepartner đang ở cách tâm vùng an toàn {distance:.0f}m "
                                f"(vùng {geofence_radius:.0f}m). Có dấu hiệu sắp rời vùng — "
                                f"vui lòng để ý!",
                        data={
                            'type': 'geofence_warning',
                            'task_id': task.id,
                            'distance': distance,
                            'radius': geofence_radius,
                            'priority': 'high',
                        }
                    )
            elif not outside and distance < warning_threshold and live.predictive_warned:
                # QA-FIX-2 / E: carepartner về vùng an toàn (< 80% radius)
                # → clear predictive_warned để lần tới vào vùng 80-100% sẽ warn lại.
                # Trước đây chỉ clear khi `is_outside_geofence=True` (về từ ngoài vào)
                # → nếu carepartner chỉ đi vào vùng 80-100% rồi quay về (không rời hẳn)
                # thì flag không bao giờ clear → push warning chỉ 1 lần đúng, nhưng
                # nếu ca làm dài → carepartner ra vào vùng warning nhiều lần → không
                # warn lại được. Giờ clear ngay khi về < 80%.
                live.predictive_warned = False
                live.save(update_fields=['predictive_warned'])

            if outside and not live.is_outside_geofence:
                # Vừa rời vùng → push cảnh báo (chỉ fire lần đầu; các poll
                # tiếp theo khi vẫn ngoài vùng sẽ thấy flag đã True → skip).
                live.is_outside_geofence = True
                live.geofence_warned_at = timezone.now()
                # QA-FIX-2 / E: clear predictive_warned khi đã rời vùng (để
                # lần quay lại vùng 80-100% sẽ warn lại).
                live.predictive_warned = False
                live.save(update_fields=['is_outside_geofence', 'geofence_warned_at', 'predictive_warned'])
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
                # QA-FIX-2 / E: clear predictive_warned khi về vùng an toàn
                # (< 80% radius) — lần tới vào vùng 80-100% sẽ warn lại.
                live.predictive_warned = False
                live.save(update_fields=['is_outside_geofence', 'predictive_warned'])
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

    Phần 1: ưu tiên client_recorded_at nếu có (cho batch offline sync),
    fallback về recorded_at (server timestamp).
    """
    if task.parent_id != requester.id:
        raise PermissionError("Bạn không sở hữu task này.")

    # Sắp xếp theo client_recorded_at nếu có, fallback recorded_at
    # Dùng Coalesce trong DB để sort đúng thứ tự thời gian thực
    from django.db.models import F, Func, Value
    qs = LocationHistory.objects.filter(task=task).order_by(
        Func(F('client_recorded_at'), F('recorded_at'), function='COALESCE')
    )[:limit]
    return [
        {
            'id': h.id,
            'latitude': float(h.latitude),
            'longitude': float(h.longitude),
            'accuracy': h.accuracy,
            'speed': h.speed,
            'heading': h.heading,
            # Trả về client_recorded_at nếu có (đúng thời điểm GPS capture),
            # fallback recorded_at (thời điểm server nhận)
            'recorded_at': (h.client_recorded_at or h.recorded_at).isoformat(),
            'client_recorded_at': h.client_recorded_at.isoformat() if h.client_recorded_at else None,
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
                      network_type: str = '',
                      location_permission_status: str = 'unknown') -> DeviceHeartbeat:
    """
    Carepartner app gửi heartbeat mỗi 30s khi đang tracking.
    - Verify consent granted + task in_progress
    - Update_or_create DeviceHeartbeat
    - Nếu có alert active (đã recovered) → tự resolve + push "đã online trở lại"
    - SAFETY-LOC-001: lưu location_permission_status làm dữ liệu dự phòng.
      KHÔNG tự tạo/xóa alert ở đây — logic alert nằm ở
      report_location_permission_revoked() và check_offline_devices().
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

    # Validate location_permission_status
    valid_statuses = {'granted', 'denied', 'unknown'}
    if location_permission_status not in valid_statuses:
        location_permission_status = 'unknown'

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
                'location_permission_status': location_permission_status,
            }
        )

        # Nếu có alert active (BẤT KỂ alert_type) → resolve + notify parent
        # "thiết bị đã online trở lại" hoặc "đã bật lại vị trí".
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

            # Notify parent — nội dung khác nhau theo alert_type
            if alert.alert_type == 'location_permission_revoked':
                title = "✅ Carepartner đã bật lại chia sẻ vị trí"
                message = (f"Carepartner đã bật lại quyền vị trí cho công việc "
                          f"'{task.title}'. Theo dõi vị trí đã hoạt động bình thường.")
                data_type = 'location_permission_restored'
            else:
                title = "✅ Thiết bị Carepartner đã online trở lại"
                message = (f"Thiết bị của carepartner đã kết nối lại cho công việc "
                          f"'{task.title}'. "
                          f"Đã ngoại tuyến khoảng {alert.recovery_duration_seconds}s.")
                data_type = 'device_recovered'

            _notify_user(
                task.parent,
                title=title,
                message=message,
                data={
                    'type': data_type,
                    'task_id': task.id,
                    'alert_id': alert.id,
                    'alert_type': alert.alert_type,
                    'priority': 'normal',
                }
            )

    return heartbeat


def report_location_permission_revoked(*, task: Task, worker: User,
                                        permission_status: str) -> dict:
    """SAFETY-LOC-001: Xử lý khi mobile báo cáo quyền vị trí bị thu hồi hoặc
    được cấp lại. Mobile gọi API này NGAY khi phát hiện thay đổi (debounce —
    chỉ khi trạng thái THAY ĐỔI, không gọi lặp mỗi 30s).

    Flow:
      1. Verify consent granted + task in_progress + worker đúng người.
      2. Cập nhật DeviceHeartbeat.location_permission_status.
      3. Nếu permission_status != 'granted':
           - Tạo DeviceOfflineAlert(alert_type='location_permission_revoked', status='active')
             nếu chưa có alert active cho task này.
           - Push NGAY LẬP TỨC (priority=high) cho phụ huynh với nội dung
             riêng biệt (khác với 'mất kết nối thiết bị').
      4. Nếu permission_status == 'granted' VÀ có alert active loại
         'location_permission_revoked' cho task này:
           - Resolve alert (status='recovered') + notify parent "đã bật lại vị trí".

    Lưu ý thiết kế:
      - KHÔNG gọi revoke_consent() — đây là báo cáo bất thường, task vẫn
        in_progress, worker vẫn có thể bật lại quyền.
      - UniqueConstraint (unique_active_alert_per_task) đảm bảo mỗi task chỉ
        có 1 alert active tại 1 thời điểm (bất kể alert_type). Nếu đang có
        device_offline active, tạo location_permission_revoked sẽ fail constraint
        → log warning, không tạo alert mới (device_offline quan trọng hơn).

    Trả về dict chứa alert hiện tại (nếu có) để mobile/web hiển thị.
    """
    # Verify consent
    try:
        consent = LocationConsent.objects.get(task=task, worker=worker)
        if consent.consent != 'granted':
            raise PermissionError(
                f"Consent hiện tại: {consent.consent} — không thể báo cáo quyền vị trí."
            )
    except LocationConsent.DoesNotExist:
        raise PermissionError("Carepartner chưa đồng ý chia sẻ vị trí cho task này.")

    # Verify task đang in_progress
    if task.status != 'in_progress':
        raise ValueError(f"Task status='{task.status}' — chỉ báo cáo khi in_progress.")

    # Verify worker là người được accept
    accepted_worker = get_accepted_worker(task)
    if not accepted_worker or accepted_worker.id != worker.id:
        raise PermissionError("Bạn không phải là carepartner được chọn cho task này.")

    now = timezone.now()
    result = {'permission_status': permission_status, 'alert': None}

    with transaction.atomic():
        # Cập nhật DeviceHeartbeat.location_permission_status
        heartbeat = DeviceHeartbeat.objects.filter(task=task).first()
        if heartbeat:
            heartbeat.location_permission_status = permission_status
            heartbeat.save(update_fields=['location_permission_status'])

        if permission_status != 'granted':
            # ---- QUYỀN VỊ TRÍ BỊ TẮT ----
            # Kiểm tra xem đã có alert active cho task này chưa
            # (bất kể alert_type — unique constraint đảm bảo chỉ 1 active/task)
            existing_active = DeviceOfflineAlert.objects.filter(
                task=task, status='active'
            ).first()

            if existing_active:
                if existing_active.alert_type == 'location_permission_revoked':
                    # Đã báo rồi — không spam, chỉ trả về alert hiện tại
                    result['alert'] = {
                        'id': existing_active.id,
                        'status': existing_active.status,
                        'alert_type': existing_active.alert_type,
                    }
                    logger.info(
                        f"[SAFETY-LOC-001] Alert#{existing_active.id} already active for "
                        f"Task#{task.id} — skipping duplicate"
                    )
                else:
                    # Đang có alert loại khác (device_offline) — không ghi đè
                    # vì device_offline (mất kết nối hoàn toàn) quan trọng hơn.
                    logger.warning(
                        f"[SAFETY-LOC-001] Task#{task.id} already has active alert "
                        f"type={existing_active.alert_type} — not creating permission alert"
                    )
                    result['alert'] = {
                        'id': existing_active.id,
                        'status': existing_active.status,
                        'alert_type': existing_active.alert_type,
                    }
            else:
                # Tạo alert mới
                try:
                    last_loc_lat = heartbeat.last_location_lat if heartbeat else None
                    last_loc_lng = heartbeat.last_location_lng if heartbeat else None
                    alert = DeviceOfflineAlert.objects.create(
                        task=task,
                        worker=worker,
                        heartbeat=heartbeat,
                        last_seen=heartbeat.last_seen if heartbeat else now,
                        last_location_lat=last_loc_lat,
                        last_location_lng=last_loc_lng,
                        status='active',
                        alert_type='location_permission_revoked',
                    )

                    # Push NGAY LẬP TỨC cho phụ huynh — nội dung riêng biệt
                    push_result, push_reason = _notify_user(
                        task.parent,
                        title="🚨 CẢNH BÁO: Carepartner đã tắt chia sẻ vị trí!",
                        message=(
                            f"Carepartner đã tắt quyền vị trí hoặc GPS trong lúc "
                            f"đang làm việc '{task.title}'. "
                            f"Theo dõi vị trí hiện không khả dụng. "
                            f"Vui lòng liên hệ carepartner NGAY!"
                        ),
                        data={
                            'type': 'location_permission_revoked',
                            'critical': True,
                            'task_id': task.id,
                            'alert_id': alert.id,
                            'alert_type': 'location_permission_revoked',
                            'priority': 'high',
                            'sound': 'critical',
                            'android_channel_id': 'emergency-alerts',
                        }
                    )

                    alert.push_sent_at = now
                    alert.push_retry_count = 1
                    if push_result is True:
                        alert.push_sent = True
                    alert.save(
                        update_fields=['push_sent', 'push_sent_at', 'push_retry_count']
                    )

                    result['alert'] = {
                        'id': alert.id,
                        'status': 'active',
                        'alert_type': 'location_permission_revoked',
                    }

                    logger.info(
                        f"[SAFETY-LOC-001] Created permission-revoked alert #{alert.id} "
                        f"for Task#{task.id} (push={push_reason})"
                    )

                    # Notify admin
                    try:
                        admin_users = User.objects.filter(is_staff=True, is_active=True)
                        for admin in admin_users:
                            Notification.objects.create(
                                recipient=admin,
                                title=(
                                    "🚨 Carepartner tắt quyền vị trí trong ca làm"
                                ),
                                message=(
                                    f"Task '{task.title}' (#{task.id}) — carepartner "
                                    f"{worker.username} đã tắt quyền vị trí/GPS. "
                                    f"Parent {task.parent.username} đã được báo động."
                                ),
                            )
                    except Exception:
                        pass

                except Exception as e:
                    logger.error(
                        f"[SAFETY-LOC-001] Failed to create permission alert for "
                        f"Task#{task.id}: {e}"
                    )
                    raise

        else:
            # ---- QUYỀN VỊ TRÍ ĐÃ ĐƯỢC CẤP LẠI ----
            # Tìm alert active loại location_permission_revoked cho task này
            permission_alert = DeviceOfflineAlert.objects.filter(
                task=task, status='active',
                alert_type='location_permission_revoked'
            ).first()

            if permission_alert:
                permission_alert.status = 'recovered'
                permission_alert.recovered_at = now
                if permission_alert.last_seen:
                    duration = (now - permission_alert.last_seen).total_seconds()
                    permission_alert.recovery_duration_seconds = int(duration)
                permission_alert.save(
                    update_fields=[
                        'status', 'recovered_at', 'recovery_duration_seconds'
                    ]
                )

                # Notify parent "đã bật lại vị trí"
                _notify_user(
                    task.parent,
                    title="✅ Carepartner đã bật lại chia sẻ vị trí",
                    message=(
                        f"Carepartner đã bật lại quyền vị trí cho công việc "
                        f"'{task.title}'. Theo dõi vị trí đã hoạt động bình thường."
                    ),
                    data={
                        'type': 'location_permission_restored',
                        'task_id': task.id,
                        'alert_id': permission_alert.id,
                        'alert_type': 'location_permission_revoked',
                        'priority': 'normal',
                    }
                )

                result['alert'] = {
                    'id': permission_alert.id,
                    'status': 'recovered',
                    'alert_type': 'location_permission_revoked',
                }

                logger.info(
                    f"[SAFETY-LOC-001] Recovered permission alert #{permission_alert.id} "
                    f"for Task#{task.id}"
                )

    return result


def check_offline_devices():
    """
    Scheduler chạy mỗi 1 phút — quét tất cả heartbeat có:
      - device_status='online'
      - task.status='in_progress'
      - consent='granted'
      - last_seen < now - OFFLINE_THRESHOLD_SECONDS (mặc định 60s)

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
        #
        # QA-FIX-1 / Bug 1.4: chỉ set push_sent=True khi _notify_user trả True.
        #
        # QA-FIX-7 / N1 (sửa lại QA-FIX-6 / NÊN LÀM 1 — field tương thích
        # ngược bị đảo ngược):
        # ----------------------------------------------------------------
        # QA-FIX-6 trước đây đổi data.type='device_offline' → 'device_offline_critical'
        # và thêm data.legacy_type='device_offline'. NHƯNG app mobile CŨ
        # (nhánh main) chỉ check `if (data.type === 'device_offline')` —
        # nó không biết field legacy_type → với data.type='device_offline_critical'
        # app cũ KHÔNG match → mất hoàn toàn cảnh báo (y hệt như chưa sửa).
        #
        # Fix QA-FIX-7: ĐẢO LẠI — giữ data.type='device_offline' (giá trị CŨ)
        # để app cũ tiếp tục match đúng điều kiện hiện có của nó (KHÔNG cần
        # sửa gì ở app cũ). Thêm field MỚI data.critical=True để đánh dấu
        # "bản nâng cấp cần xử lý khẩn cấp hơn — còi to, channel
        # emergency-alerts". App MỚI đọc data.critical để quyết định hành
        # vi (channel/sound), app CŨ ignore field này và vẫn báo động được
        # (channel critical_alerts cũ + sound default).
        #
        # send_expo_push_notification (core/views.py) cũng đã được cập nhật
        # để khi type='device_offline' VÀ critical=True → dùng channel
        # emergency-alerts (còi to) thay vì critical_alerts mặc định.
        try:
            push_result, push_reason = _notify_user(
                hb.task.parent,
                title="🚨🚨🚨 CẢNH BÁO KHẨN CẤP: Thiết bị Carepartner mất kết nối!",
                message=f"⚠️ Thiết bị của carepartner đã ngừng gửi tín hiệu "
                        f"cho công việc '{hb.task.title}'. "
                        f"Lần cuối online: {hb.last_seen:%H:%M:%S}. "
                        f"Vui lòng liên hệ carepartner NGAY hoặc gọi cơ quan chức năng nếu nghi ngờ!",
                data={
                    'type': 'device_offline',
                    'critical': True,
                    'task_id': hb.task.id,
                    'alert_id': alert.id,
                    'priority': 'high',
                    'sound': 'critical',
                    'android_channel_id': 'emergency-alerts',
                }
            )

            # QA-FIX-8 / Bug #1: LUÔN cập nhật push_sent_at và
            # push_retry_count trên mọi outcome (True/False/None),
            # kể cả fail. Trước đây chỉ cập nhật khi push_result=True
            # → khi parent không có token, alert không bao giờ tiến
            # tới max_retry → infinite loop.
            alert.push_sent_at = now
            alert.push_retry_count = 1

            if push_result is True:
                alert.push_sent = True
                alert.save(update_fields=['push_sent', 'push_sent_at', 'push_retry_count'])
                stats['new_alerts'] += 1
            elif push_reason == 'no_token':
                logger.warning(
                    f"[tracking] Alert#{alert.id}: parent {hb.task.parent.username} "
                    f"has no expo_push_token — cannot push, "
                    f"in-app Notification still created"
                )
                alert.save(update_fields=['push_sent', 'push_sent_at', 'push_retry_count'])
                stats['push_failed'] += 1
            else:
                # Expo rejected hoặc network error
                alert.save(update_fields=['push_sent', 'push_sent_at', 'push_retry_count'])
                stats['push_failed'] += 1
                logger.warning(
                    f"[tracking] Offline push FAILED ({push_reason}) for Task#{hb.task_id}"
                )

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


# ═══════════════════════════════════════════════════════════════════
#  PHẦN 2 — RETRY PUSH cho DeviceOfflineAlert
#  Mô phỏng kiểu "gọi điện đến" liên tục cho tới khi parent phản hồi:
#    - Mỗi 30s gửi lại push cho alert active chưa acknowledged
#    - Tối đa 5 lần (OFFLINE_PUSH_MAX_RETRIES)
#  Sau 5 lần vẫn không acknowledge → vẫn giữ alert active (để parent xem
#  khi mở app), nhưng không push nữa (tránh spam).
# ═══════════════════════════════════════════════════════════════════

OFFLINE_PUSH_MAX_RETRIES = getattr(settings, 'TRACKING_OFFLINE_PUSH_MAX_RETRIES', 5)
OFFLINE_PUSH_RETRY_INTERVAL_SECONDS = getattr(
    settings, 'TRACKING_OFFLINE_PUSH_RETRY_INTERVAL', 30
)


def retry_offline_alert_pushes():
    """
    Scheduler chạy mỗi 1 phút — gửi lại push cho các DeviceOfflineAlert:
      - status='active' (chưa recovered)
      - acknowledged_at IS NULL (parent chưa xem)
      - push_retry_count < OFFLINE_PUSH_MAX_RETRIES (chưa vượt số lần tối đa)
      - push_sent_at < now - OFFLINE_PUSH_RETRY_INTERVAL_SECONDS (đủ khoảng cách giữa 2 lần retry)

    QA-FIX-1 / Bug 1.4: chỉ set push_sent=True + tăng push_retry_count khi
    _notify_user trả về True (trước đây fire-and-forget → set True sai).

    QA-FIX-1 / SUP-1: log warning riêng cho từng alert đạt max retry
    (trước đây chỉ đếm số lượng).

    Trả về dict thống kê.
    """
    now = timezone.now()
    retry_threshold = now - timedelta(seconds=OFFLINE_PUSH_RETRY_INTERVAL_SECONDS)

    pending_alerts = DeviceOfflineAlert.objects.filter(
        status='active',
        acknowledged_at__isnull=True,
        push_retry_count__lt=OFFLINE_PUSH_MAX_RETRIES,
    ).filter(
        Q(push_sent_at__isnull=True) | Q(push_sent_at__lt=retry_threshold)
    ).select_related('task', 'task__parent', 'worker')

    # QA-FIX-1 / SUP-1: query riêng các alert đã đạt max retry để log warning
    # chi tiết cho từng alert (trước đây chỉ đếm số lượng).
    max_reached_alerts = DeviceOfflineAlert.objects.filter(
        status='active',
        acknowledged_at__isnull=True,
        push_retry_count__gte=OFFLINE_PUSH_MAX_RETRIES,
    ).select_related('task', 'task__parent', 'worker')

    stats = {
        'checked_at': now.isoformat(),
        'retried_count': 0,
        'max_reached_count': max_reached_alerts.count(),
        'push_failed': 0,
    }

    # Log warning cho từng alert đạt max retry
    for alert in max_reached_alerts:
        logger.warning(
            f"[tracking] Alert#{alert.id} (Task#{alert.task_id}) đã đạt max retry "
            f"({OFFLINE_PUSH_MAX_RETRIES}/{OFFLINE_PUSH_MAX_RETRIES}) — parent "
            f"{alert.task.parent.username} chưa acknowledge. Stopping push loop "
            f"(alert vẫn active để parent xem khi mở app)."
        )

    for alert in pending_alerts:
        # Nếu đã đạt max retry → skip (không push nữa)
        if alert.push_retry_count >= OFFLINE_PUSH_MAX_RETRIES:
            stats['max_reached_count'] += 1
            continue

        try:
            push_result, push_reason = _notify_user(
                alert.task.parent,
                title=f"🚨🚨🚨 CẢNH BÁO KHẨN CẤP (lần {alert.push_retry_count + 1}/{OFFLINE_PUSH_MAX_RETRIES})",
                message=f"⚠️ Thiết bị carepartner VẪN mất kết nối cho công việc "
                        f"'{alert.task.title}'. Lần cuối online: {alert.last_seen:%H:%M:%S}. "
                        f"Vui lòng kiểm tra NGAY!",
                data={
                    'type': 'device_offline',
                    'critical': True,
                    'task_id': alert.task.id,
                    'alert_id': alert.id,
                    'retry': alert.push_retry_count + 1,
                    'priority': 'high',
                    'sound': 'critical',
                    'android_channel_id': 'emergency-alerts',
                }
            )

            # QA-FIX-8 / Bug #1: LUÔN cập nhật push_sent_at và
            # push_retry_count trên mọi outcome. Nếu không cập nhật
            # khi fail → query pending_alerts luôn match (push_sent_at
            # cũ < threshold) → infinite retry loop.
            alert.push_sent_at = now
            alert.push_retry_count += 1

            if push_result is True:
                alert.push_sent = True
                alert.save(update_fields=['push_sent', 'push_sent_at', 'push_retry_count'])
                stats['retried_count'] += 1
            elif push_reason == 'no_token':
                logger.warning(
                    f"[tracking] Alert#{alert.id}: parent {alert.task.parent.username} "
                    f"has no expo_push_token — cannot push retry #{alert.push_retry_count}"
                )
                alert.save(update_fields=['push_sent', 'push_sent_at', 'push_retry_count'])
                stats['push_failed'] += 1

                # QA-FIX-8 / Bug #1: khi đạt max retry VÀ parent không
                # có push token → escalate cho admin.
                if alert.push_retry_count >= OFFLINE_PUSH_MAX_RETRIES:
                    _escalate_no_push_channel(alert)
            else:
                # Expo rejected hoặc network error
                alert.save(update_fields=['push_sent', 'push_sent_at', 'push_retry_count'])
                stats['push_failed'] += 1
                if push_reason == 'expo_rejected':
                    logger.warning(
                        f"[tracking] Retry push FAILED (Expo rejected) for Alert#{alert.id}"
                    )
                else:
                    logger.warning(
                        f"[tracking] Retry push FAILED (network/timeout) for Alert#{alert.id}"
                    )

                # QA-FIX-8 / Bug #1: Expo trả DeviceNotRegistered →
                # clear dead token để tránh retry vô ích.
                if push_result is False and push_reason == 'expo_rejected':
                    parent = alert.task.parent
                    if parent.expo_push_token:
                        logger.warning(
                            f"[tracking] Clearing dead expo_push_token for "
                            f"parent {parent.username} (user#{parent.id})"
                        )
                        parent.expo_push_token = ''
                        parent.save(update_fields=['expo_push_token'])

        except Exception as e:
            # QA-FIX-8 / Bug #1: ngay cả khi exception, vẫn cập nhật
            # retry count để không infinite loop.
            alert.push_sent_at = now
            alert.push_retry_count += 1
            alert.save(update_fields=['push_sent_at', 'push_retry_count'])
            logger.error(f"[tracking] Retry push failed for Alert#{alert.id}: {e}")
            stats['push_failed'] += 1

    if stats['retried_count'] > 0 or stats['push_failed'] > 0:
        logger.info(f"[tracking] Offline retry push: {stats}")

    return stats


def _escalate_no_push_channel(alert: DeviceOfflineAlert):
    """QA-FIX-8 / Bug #1: khi alert đạt max retry mà parent không có
    push token → tạo in-app Notification cho admin yêu cầu liên hệ
    thủ công (SMS, gọi điện).
    """
    try:
        admin_users = User.objects.filter(is_staff=True, is_active=True)
        for admin in admin_users:
            Notification.objects.create(
                recipient=admin,
                title=f"⚠️ Push channel unavailable cho parent {alert.task.parent.username}",
                message=(
                    f"Alert#{alert.id} (Task#{alert.task_id}) đã thử push "
                    f"{OFFLINE_PUSH_MAX_RETRIES} lần nhưng parent "
                    f"{alert.task.parent.username} không có expo_push_token. "
                    f"Cần liên hệ parent qua SMS/gọi điện thủ công."
                ),
            )
        logger.warning(
            f"[tracking] Alert#{alert.id}: escalated to admin — "
            f"parent {alert.task.parent.username} has no push channel "
            f"after {OFFLINE_PUSH_MAX_RETRIES} retries."
        )
    except Exception as e:
        logger.error(f"[tracking] Admin escalation failed for Alert#{alert.id}: {e}")


class AlreadyAcknowledgedError(ValueError):
    """QA-FIX-1 / Bug 1.5: exception riêng cho alert đã acknowledged."""
    pass


def acknowledge_offline_alert(*, alert_id: int, requester: User,
                                    task_id: int = None) -> DeviceOfflineAlert:
    """
    Parent mở app và xem cảnh báo → acknowledge → dừng retry loop.
    - Verify requester là parent sở hữu task
    - Set acknowledged_at = now + acknowledged_by = requester (QA-FIX-1 / Spec 2.2)
    - KHÔNG đổi status (vẫn 'active' cho tới khi thiết bị recovered)

    QA-FIX-1 / Bug 1.5:
    - Nếu alert đã được acknowledge (acknowledged_at không null) → raise
      AlreadyAcknowledgedError (view map → 400).
    - Nếu task_id truyền vào không khớp alert.task_id → raise ValueError
      (view map → 404 — chống dùng alert_id của task khác).
    """
    try:
        alert = DeviceOfflineAlert.objects.get(pk=alert_id)
    except DeviceOfflineAlert.DoesNotExist:
        raise ValueError("Không tìm thấy alert.")

    # QA-FIX-1 / Bug 1.5: task_id mismatch → 404 (không透露 alert tồn tại)
    if task_id is not None and alert.task_id != task_id:
        raise ValueError(f"Alert #{alert_id} không thuộc task #{task_id}.")

    if alert.task.parent_id != requester.id and not requester.is_superuser:
        raise PermissionError("Bạn không sở hữu task này.")

    # QA-FIX-1 / Bug 1.5: alert đã acknowledge → 400 (không phải 200 im lặng)
    if alert.acknowledged_at is not None:
        raise AlreadyAcknowledgedError(
            f"Alert #{alert.id} đã được acknowledge lúc "
            f"{alert.acknowledged_at.isoformat()}."
        )

    alert.acknowledged_at = timezone.now()
    # QA-FIX-1 / Spec 2.2: set acknowledged_by để audit.
    if hasattr(alert, 'acknowledged_by') and alert.acknowledged_by_id is None:
        alert.acknowledged_by = requester
        alert.save(update_fields=['acknowledged_at', 'acknowledged_by'])
    else:
        alert.save(update_fields=['acknowledged_at'])

    return alert


# ═══════════════════════════════════════════════════════════════════
#  PHẦN 3 — RANDOM VERIFICATION CHECK
#  Service: respond_verification_check (CarePartner nhập mã PIN)
# ═══════════════════════════════════════════════════════════════════

# QA-FIX-1 / Spec 2.3: không cần import check_password/make_password ở đây
# nữa — User model tự đóng gói logic hash/check qua set_verification_pin() /
# check_verification_pin() / has_verification_pin_set.

# Import constants từ verification_scheduler (tránh circular import: dùng lazy import trong hàm)
def _get_verification_constants():
    from .verification_scheduler import (
        RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS,
    )
    return RESPOND_TIMEOUT_SECONDS, MAX_WRONG_ATTEMPTS


def _get_b5_photo_constants():
    """B5 — hằng số xác minh ảnh (lazy import tránh circular import)."""
    from .verification_scheduler import (
        PHOTO_RESPOND_TIMEOUT_SECONDS, VERIFICATION_PHOTO_MAX_MB,
    )
    return PHOTO_RESPOND_TIMEOUT_SECONDS, VERIFICATION_PHOTO_MAX_MB


# ═══════════════════════════════════════════════════════════════════
#  B5 — XÁC THỰC BẰNG ẢNH TRONG CA LÀM
#  (bổ sung cho RandomVerificationCheck PIN hiện có — Phương án A:
#   thêm field lên model, tái sử dụng state machine + scheduler)
# ═══════════════════════════════════════════════════════════════════

# Format ảnh hợp lệ — kiểm tra bằng Pillow đọc THẬT nội dung byte
# (không tin content_type client khai báo hay đuôi file).
ALLOWED_PHOTO_FORMATS = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}


def validate_verification_photo(photo_file):
    """
    B5 — Validate ảnh xác minh TRƯỚC khi lưu:
      1. File tồn tại, không rỗng
      2. Dung lượng <= VERIFICATION_PHOTO_MAX_MB (mặc định 5MB)
      3. MIME type THẬT (đọc bytes bằng Pillow + verify) — từ chối file
         giả mạo đuôi .jpg / content_type image/* nhưng nội dung không
         phải ảnh hợp lệ.
      4. Format trong danh sách cho phép: JPEG / PNG / WebP

    Trả về (True, '') nếu hợp lệ, (False, '<lỗi tiếng Việt>') nếu không.
    Không raise — để caller quyết định trả 400 với message rõ ràng.
    """
    if photo_file is None:
        return False, "Thiếu file ảnh. Vui lòng gửi field 'photo' (multipart/form-data)."

    # (1) + (2) Kiểm tra dung lượng
    _, MAX_MB = _get_b5_photo_constants()
    max_bytes = int(MAX_MB * 1024 * 1024)
    try:
        size = photo_file.size
    except (AttributeError, OSError):
        return False, "Không đọc được file ảnh."
    if not size:
        return False, "File ảnh rỗng."
    if size > max_bytes:
        return False, (
            f"Ảnh quá lớn ({size / 1024 / 1024:.1f}MB). "
            f"Giới hạn {MAX_MB:.0f}MB — vui lòng chụp lại."
        )

    # (3) Đọc nội dung thật bằng Pillow — detect format từ bytes, KHÔNG
    # tin content_type client khai báo (chống MIME giả mạo).
    try:
        from PIL import Image
        # seek(0) đề phòng file đã bị đọc một phần
        if hasattr(photo_file, 'seek'):
            try:
                photo_file.seek(0)
            except Exception:
                pass
        img = Image.open(photo_file)
        img.verify()  # verify ép Pillow kiểm tra toàn bộ cấu trúc file
        # Sau verify() con trỏ file đã tiêu thụ — seek lại cho handler save
        if hasattr(photo_file, 'seek'):
            try:
                photo_file.seek(0)
            except Exception:
                pass
        real_format = img.format
    except Exception:
        return False, "File không phải ảnh hợp lệ (nội dung không đọc được bằng bộ giải mã ảnh)."

    # (4) Format cho phép
    if real_format not in ALLOWED_PHOTO_FORMATS:
        return False, (
            f"Định dạng ảnh không được hỗ trợ ({real_format}). "
            f"Chỉ chấp nhận JPEG, PNG hoặc WebP."
        )

    return True, ''


def submit_verification_photo(*, check_id: int, requester: User,
                               photo_file, latitude: float = None,
                               longitude: float = None) -> 'RandomVerificationCheck':
    """
    B5 — CarePartner nộp ảnh xác minh cho RandomVerificationCheck
    (verification_type='photo').

    State machine (tái sử dụng nguyên của PIN — không state mới):
      - Chỉ nộp được khi status='pending' + còn hạn respond_deadline
      - Ảnh hợp lệ → status='confirmed' + responded_at + response_lat/lng
        + reset streak counters (giống nhập đúng PIN)
      - Quá deadline → status='timeout' + raise ValueError (giống PIN)
      - Check đã kết thúc (confirmed/timeout/cancelled/wrong_code) →
        raise ValueError — chặn transition không hợp lệ + chặn nộp trùng
      - Check loại 'pin' → raise ValueError (không nộp ảnh cho check PIN)

    Quyền:
      - Chỉ worker sở hữu check (check.worker == requester)
      - Task phải đang in_progress VÀ requester phải là worker được
        accept cho task đó (đối chiếu TaskApplication status='accepted')

    Side effect: thông báo phụ huynh (in-app + Expo push) khi ảnh hợp lệ
    được nộp — CHỈ 1 LẦN/check (parent_photo_notification_sent flag,
    chống spam giống cơ chế parent_alert_sent).
    """
    from .models import RandomVerificationCheck

    try:
        check = RandomVerificationCheck.objects.select_related('task', 'worker', 'task__parent').get(pk=check_id)
    except RandomVerificationCheck.DoesNotExist:
        raise ValueError("Không tìm thấy yêu cầu xác minh.")

    # ── Quyền: chỉ chủ sở hữu check ──────────────────────────────────
    if check.worker_id != requester.id:
        raise PermissionError("Bạn không phải là carepartner được yêu cầu xác minh.")

    # ── Loại check phải là photo ─────────────────────────────────────
    if check.verification_type != 'photo':
        raise ValueError(
            "Yêu cầu này là xác minh bằng mã PIN — vui lòng nhập mã thay vì nộp ảnh."
        )

    now = timezone.now()

    # ── State machine: chặn transition không hợp lệ ──────────────────
    if check.status != 'pending':
        # Bao gồm đã có ảnh (confirmed) → chặn nộp trùng với lỗi rõ ràng.
        if check.status == 'confirmed' and check.photo:
            raise ValueError("Bạn đã nộp ảnh cho yêu cầu này rồi.")
        raise ValueError(
            f"Yêu cầu xác minh đã kết thúc với trạng thái: {check.get_status_display()}."
        )

    # ── Deadline: quá hạn → timeout (giống respond_verification_check) ──
    if now > check.respond_deadline:
        check.status = 'timeout'
        check.save(update_fields=['status'])
        raise ValueError("Đã hết thời gian phản hồi. Yêu cầu xác minh đã chuyển trạng thái timeout.")

    # ── Task phải đang diễn ra + requester là worker được assign ─────
    task = check.task
    if task.status != 'in_progress':
        raise ValueError(
            f"Công việc hiện không đang thực hiện (trạng thái: {task.get_status_display()}). "
            "Không thể nộp ảnh xác minh."
        )
    accepted_app = TaskApplication.objects.filter(
        task=task, worker=requester, status='accepted'
    ).exists()
    if not accepted_app:
        raise ValueError("Bạn không phải carepartner đang thực hiện công việc này.")

    # ── Validate file (size + MIME thật) TRƯỚC khi lưu ───────────────
    is_valid, error_msg = validate_verification_photo(photo_file)
    if not is_valid:
        # Ảnh bị từ chối → check vẫn giữ nguyên trạng thái 'pending'
        # (giống nhập sai PIN chưa đủ MAX_WRONG_ATTEMPTS).
        logger.info(
            f"[tracking] B5 photo rejected for Check#{check.id}: {error_msg}"
        )
        raise ValueError(error_msg)

    # ── Lưu ảnh + chuyển confirmed (giống nhập đúng PIN) ─────────────
    check.photo = photo_file
    check.photo_submitted_at = now
    check.status = 'confirmed'
    check.responded_at = now
    check.response_lat = Decimal(str(latitude)) if latitude is not None else None
    check.response_lng = Decimal(str(longitude)) if longitude is not None else None
    # Chấm dứt streak timeout (giống PIN confirm — Bug 1.3)
    check.parent_alert_sent = False
    check.consecutive_timeouts_count = 0
    check.save(update_fields=[
        'photo', 'photo_submitted_at', 'status', 'responded_at',
        'response_lat', 'response_lng',
        'parent_alert_sent', 'consecutive_timeouts_count',
    ])

    logger.info(
        f"[tracking] B5 photo submitted for Check#{check.id} by User#{requester.id} "
        f"(Task#{task.id}, size={photo_file.size})"
    )

    # ── Thông báo phụ huynh: ảnh hợp lệ đã được nộp (chỉ 1 lần) ─────
    # Chống gửi trùng bằng parent_photo_notification_sent (giống
    # parent_alert_sent chống spam timeout alert). Notification in-app
    # gần như không fail (DB write); push Expo best-effort — sau khi đã
    # set flag thì không retry (phụ huynh vẫn thấy ảnh trong lịch sử
    # xác minh trên web/mobile).
    if not check.parent_photo_notification_sent:
        try:
            _notify_user(
                task.parent,
                title="📷 Ảnh xác minh đã được gửi",
                message=(
                    f"CarePartner {requester.username} đã gửi ảnh xác minh cho công việc "
                    f"'{task.title}'. Vào trang theo dõi để xem ảnh."
                ),
                data={
                    'type': 'photo_verification_submitted',
                    'task_id': task.id,
                    'check_id': check.id,
                    'worker_id': requester.id,
                }
            )
        except Exception as e:
            logger.warning(
                f"[tracking] B5 parent photo notification failed for Check#{check.id}: {e}"
            )
        finally:
            # Set flag trong mọi trường hợp — 1 lần/check, không spam.
            RandomVerificationCheck.objects.filter(pk=check.pk).update(
                parent_photo_notification_sent=True
            )

    return check


def get_verification_photo(*, check_id: int, requester: User) -> 'RandomVerificationCheck':
    """
    B5 — Lấy ảnh xác minh (kèm permission check) để view serve bytes.

    Quyền xem ảnh (chỉ 3 đối tượng):
      - Worker sở hữu check (chụp ảnh — xem lại ảnh mình đã nộp)
      - Phụ huynh của task
      - Admin (is_superuser/is_staff)

    KHÔNG trả URL /media/ public — view sẽ đọc bytes từ storage và trả
    qua HTTP response có auth. File vật lý cũng nằm NGOÀI MEDIA_ROOT
    (PrivateVerificationPhotoStorage → PRIVATE_MEDIA_ROOT) nên kể cả khi
    biết tên file cũng không thể tự dựng URL /media/ để lấy (backend/urls.py
    còn chặn 403 ^media/verification_photos/ làm lớp phòng thủ thứ 2).

    Raise:
      - ValueError: không tìm thấy check / check chưa có ảnh
      - PermissionError: người không liên quan
    """
    from .models import RandomVerificationCheck

    try:
        check = RandomVerificationCheck.objects.select_related('task').get(pk=check_id)
    except RandomVerificationCheck.DoesNotExist:
        raise ValueError("Không tìm thấy yêu cầu xác minh.")

    is_owner_worker = (check.worker_id == requester.id)
    is_parent = (check.task.parent_id == requester.id)
    is_admin = requester.is_superuser or requester.is_staff

    if not (is_owner_worker or is_parent or is_admin):
        # Không tiết lộ sự tồn tại của check cho người ngoài — trả 403
        # (đồng bộ permission error convention với respond/cancel).
        raise PermissionError("Bạn không có quyền xem ảnh xác minh này.")

    if not check.photo:
        raise ValueError("Yêu cầu xác minh này chưa có ảnh.")

    return check


def set_verification_pin(*, user: User, pin: str, current_password: str = None) -> User:
    """
    CarePartner đặt/đổi mã cá nhân (PIN 4-6 số).
    - Validate PIN: 4-6 chữ số
    - Validate current_password: nếu user đã có PIN → bắt buộc xác thực lại mật khẩu tài khoản
      (tránh ai cầm máy đổi PIN tuỳ tiện)
    - Hash PIN + save qua user.set_verification_pin() — KHÔNG lưu plaintext

    QA-FIX-1 / Spec 2.3: refactor để gọi user.set_verification_pin()
    (trước đây gọi make_password trực tiếp → lặp logic).

    QA-FIX-6 / BẮT BUỘC 2 — Hỗ trợ user đăng ký qua Google/Facebook:
    Trước đây hàm này LUÔN gọi authenticate(username, password=current_password)
    để xác thực lại trước khi cho đổi PIN. Nhưng user đăng ký qua Google/Facebook
    được gọi set_unusable_password() (xem core/oauth_views.py:212, :342) →
    họ KHÔNG có mật khẩu thật → authenticate() luôn trả None → họ KHÔNG BAO GIỜ
    đặt được PIN → bị miễn trừ vĩnh viễn khỏi xác minh ngẫu nhiên (giống hệt
    hệ quả của việc không đặt PIN, xem BẮT BUỘC 1).

    Fix: phân biệt 2 trường hợp:
      - user.has_usable_password() == True (đăng ký email/password) →
        giữ nguyên luồng cũ: bắt buộc current_password đúng.
      - user.has_usable_password() == False (đăng ký Google/Facebook) →
        bỏ qua current_password. Lý do: user này đã đăng nhập hợp lệ qua
        JWT access token (endpoint SetVerificationPinAPIView yêu cầu
        IsAuthenticated), nếu attacker có access token thì họ đã có khả
        năng làm mọi việc user làm được (đổi email, password, ...). Buộc
        thêm current_password cho user OAuth không tăng security mà chỉ
        block tính năng. Mobile app được thiết kế để ẩn trường
        current_password khi user.auth_provider != 'email'.
    """
    import re
    from django.contrib.auth import authenticate

    # Validate PIN format: 4-6 chữ số
    if not re.match(r'^\d{4,6}$', pin):
        raise ValueError("Mã cá nhân phải là 4-6 chữ số.")

    # ================================================================
    # QA-FIX-6 / BẮT BUỘC 2 — Re-auth theo loại user
    # ================================================================
    if user.has_usable_password():
        # User đăng ký qua email/password → bắt buộc xác thực lại mật khẩu
        # tài khoản để chống ai cầm máy đổi PIN.
        if not current_password:
            raise PermissionError("Vui lòng nhập mật khẩu tài khoản để xác nhận.")

        user_auth = authenticate(username=user.username, password=current_password)
        if not user_auth or user_auth.id != user.id:
            raise PermissionError("Mật khẩu tài khoản không đúng.")
    else:
        # User đăng ký qua Google/Facebook (set_unusable_password) → không
        # có mật khẩu để xác thực lại. Dựa vào JWT IsAuthenticated của
        # endpoint để bảo vệ. current_password (nếu client gửi) bị bỏ qua.
        # Log để audit: ai đó cố gửi current_password cho user OAuth sẽ
        # bị ignore — không phải lỗi, chỉ là không cần thiết.
        if current_password:
            logger.info(
                f"[tracking] set_verification_pin: User#{user.id} "
                f"(auth_provider={user.auth_provider}) gửi current_password "
                f"nhưng has_usable_password=False → bỏ qua re-auth password."
            )

    # QA-FIX-1 / Spec 2.3: dùng helper method của User model.
    user.set_verification_pin(pin)
    logger.info(f"[tracking] Verification PIN set for User#{user.id}")
    return user


def respond_verification_check(*, check_id: int, requester: User,
                                pin: str, latitude: float = None,
                                longitude: float = None) -> 'RandomVerificationCheck':
    """
    CarePartner phản hồi RandomVerificationCheck — nhập mã PIN.
    Logic:
      - Nếu quá respond_deadline → trả lỗi, set 'timeout' nếu chưa set
      - requester.check_verification_pin(pin) đúng → 'confirmed'
        + reset parent_alert_sent/consecutive_timeouts_count (chấm dứt streak)
      - Sai → tăng attempts; >= MAX_WRONG_ATTEMPTS → 'wrong_code' + báo admin
        + reset consecutive_timeouts_count (chấm dứt streak — wrong_code không
          phải timeout nên không cộng dồn streak)

    QA-FIX-1 / Spec 2.3: dùng user.check_verification_pin() + has_verification_pin_set
    (trước đây gọi check_password trực tiếp + kiểm tra verification_pin_hash trực tiếp).
    QA-FIX-1 / Bug 1.3: reset parent_alert_sent + consecutive_timeouts_count
    khi status chuyển sang 'confirmed'/'wrong_code'.
    """
    from .models import RandomVerificationCheck

    try:
        check = RandomVerificationCheck.objects.get(pk=check_id)
    except RandomVerificationCheck.DoesNotExist:
        raise ValueError("Không tìm thấy yêu cầu xác minh.")

    # Verify requester là worker của check
    if check.worker_id != requester.id:
        raise PermissionError("Bạn không phải là carepartner được yêu cầu xác minh.")

    # B5 — check loại photo phải nộp ẢNH, không nhập PIN.
    if check.verification_type == 'photo':
        raise ValueError(
            "Yêu cầu này là xác minh bằng ảnh — vui lòng chụp ảnh để xác nhận thay vì nhập mã."
        )

    now = timezone.now()

    # Nếu check đã xử lý (confirmed/wrong_code/timeout/cancelled) → không cho phản hồi lại
    if check.status != 'pending':
        raise ValueError(f"Yêu cầu xác minh đã kết thúc với trạng thái: {check.get_status_display()}.")

    # Nếu quá deadline → set 'timeout' + trả lỗi
    if now > check.respond_deadline:
        check.status = 'timeout'
        check.save(update_fields=['status'])
        raise ValueError("Đã hết thời gian phản hồi. Yêu cầu xác minh đã chuyển trạng thái timeout.")

    # Verify worker đã đặt PIN (dùng property mới của User model)
    if not requester.has_verification_pin_set:
        raise PermissionError("Bạn chưa đặt mã cá nhân. Vui lòng đặt mã trước khi phản hồi.")

    # Check PIN — dùng helper method của User model
    _, MAX_WRONG_ATTEMPTS = _get_verification_constants()
    if requester.check_verification_pin(pin):
        # Đúng mã → confirmed + reset streak (Bug 1.3)
        check.status = 'confirmed'
        check.responded_at = now
        check.response_lat = Decimal(str(latitude)) if latitude else None
        check.response_lng = Decimal(str(longitude)) if longitude else None
        # QA-FIX-1 / Bug 1.3: chấm dứt streak timeout
        check.parent_alert_sent = False
        check.consecutive_timeouts_count = 0
        check.save(update_fields=[
            'status', 'responded_at', 'response_lat', 'response_lng',
            'parent_alert_sent', 'consecutive_timeouts_count',
        ])
        logger.info(f"[tracking] Verification Check#{check.id} confirmed by User#{requester.id}")
        return check
    else:
        # Sai mã → tăng attempts
        check.attempts += 1
        if check.attempts >= MAX_WRONG_ATTEMPTS:
            check.status = 'wrong_code'
            check.responded_at = now
            # QA-FIX-1 / Bug 1.3: wrong_code chấm dứt streak (không phải timeout)
            check.parent_alert_sent = False
            check.consecutive_timeouts_count = 0
            check.save(update_fields=[
                'attempts', 'status', 'responded_at',
                'parent_alert_sent', 'consecutive_timeouts_count',
            ])

            # Báo admin (nghi ngờ không phải đúng CarePartner đang cầm máy)
            try:
                admin_users = User.objects.filter(is_staff=True, is_active=True)
                for admin in admin_users:
                    Notification.objects.create(
                        recipient=admin,
                        title="🚨 CarePartner nhập sai mã xác minh",
                        message=f"Task '{check.task.title}' (#{check.task.id}) — carepartner "
                                f"{check.worker.username} đã nhập sai mã {check.attempts} lần liên tiếp. "
                                f"Có dấu hiệu không phải đúng người đang cầm máy — kiểm tra ngay!",
                    )
            except Exception:
                pass
            logger.warning(f"[tracking] Verification Check#{check.id} WRONG_CODE (User#{requester.id})")
            raise ValueError(f"Bạn đã nhập sai mã {check.attempts} lần. Yêu cầu đã bị khoá — admin đã được báo.")
        else:
            check.save(update_fields=['attempts'])
            remaining = MAX_WRONG_ATTEMPTS - check.attempts
            raise ValueError(f"Mã không đúng. Còn {remaining} lần thử.")


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


# ═══════════════════════════════════════════════════════════════════
#  QA-FIX-1 / Spec 2.4 — Verification check history (parent) + cancel
# ═══════════════════════════════════════════════════════════════════

def get_verification_history_for_parent(*, task: Task, requester: User,
                                          limit: int = 100) -> list:
    """
    Parent xem lịch sử verification checks của task mình.
    Trả về list of dict cho frontend render timeline.

    QA-FIX-1 / Spec 2.4: trước đây parent không có endpoint xem lịch sử
    verification checks — chỉ admin xem được. Parent cần biết carepartner
    đã xác minh đúng/sai/timeout bao nhiêu lần để đánh giá tin cậy.
    """
    if task.parent_id != requester.id and not requester.is_superuser:
        raise PermissionError("Bạn không sở hữu task này.")

    from .models import RandomVerificationCheck
    qs = RandomVerificationCheck.objects.filter(task=task).order_by('-triggered_at')[:limit]
    return [
        {
            'id': c.id,
            'task_id': c.task_id,
            'worker_id': c.worker_id,
            'worker_name': c.worker.username,
            'triggered_at': c.triggered_at.isoformat(),
            'respond_deadline': c.respond_deadline.isoformat(),
            'status': c.status,
            'status_display': c.get_status_display(),
            'attempts': c.attempts,
            'responded_at': c.responded_at.isoformat() if c.responded_at else None,
            'response_lat': float(c.response_lat) if c.response_lat else None,
            'response_lng': float(c.response_lng) if c.response_lng else None,
            'parent_alert_sent': c.parent_alert_sent,
            'consecutive_timeouts_count': c.consecutive_timeouts_count,
            # B5 — field xác minh ảnh: type + có ảnh + thời điểm nộp.
            # Ảnh KHÔNG trả URL public — frontend dùng check_id gọi
            # GET /api/tracking/verification-checks/<id>/photo/ (có auth).
            'verification_type': c.verification_type,
            'verification_type_display': c.get_verification_type_display(),
            'has_photo': bool(c.photo),
            'photo_submitted_at': c.photo_submitted_at.isoformat() if c.photo_submitted_at else None,
        }
        for c in qs
    ]


def cancel_verification_check(*, check_id: int, requester: User,
                                reason: str = '') -> 'RandomVerificationCheck':
    """
    Admin HOẶC parent sở hữu task có thể huỷ verification check đang pending.

    QA-FIX-1 / Spec 2.4: trước đây check pending chỉ có thể chờ timeout
    (90s — RESPOND_TIMEOUT_SECONDS). Nếu parent phát hiện false alarm hoặc task đã completed, không
    có cách chủ động dừng check → push vẫn retry 5 lần trong 90s + 30s grace.

    Worker (carepartner) KHÔNG được huỷ — phải nhập mã hoặc chờ timeout.
    Điều này tránh carepartner huỷ check để trốn xác minh.

    Logic:
      - Chỉ cho huỷ nếu status='pending' (đã confirmed/wrong_code/timeout/
        cancelled thì không huỷ lại được).
      - Set status='cancelled' + responded_at=now + reset streak counters
        (cancelled không tính vào streak timeout — nó là hành động chủ động
        của admin/parent, không phải do carepartner timeout).
      - Notify worker rằng check đã bị huỷ.
    """
    from .models import RandomVerificationCheck

    try:
        check = RandomVerificationCheck.objects.get(pk=check_id)
    except RandomVerificationCheck.DoesNotExist:
        raise ValueError("Không tìm thấy yêu cầu xác minh.")

    # Permission: admin (is_superuser) hoặc parent sở hữu task.
    # Worker (role='worker') bị từ chối — phải nhập mã hoặc chờ timeout.
    is_admin = requester.is_superuser
    is_parent = (check.task.parent_id == requester.id)
    if not (is_admin or is_parent):
        raise PermissionError(
            "Chỉ admin hoặc phụ huynh sở hữu task mới được huỷ yêu cầu xác minh."
        )

    # Chỉ huỷ được nếu đang pending
    if check.status != 'pending':
        raise ValueError(
            f"Không thể huỷ yêu cầu đã kết thúc (trạng thái: {check.get_status_display()})."
        )

    now = timezone.now()
    check.status = 'cancelled'
    check.responded_at = now
    # Cancel không tính vào streak timeout → reset counters (giống confirmed/wrong_code).
    check.parent_alert_sent = False
    check.consecutive_timeouts_count = 0
    check.save(update_fields=[
        'status', 'responded_at',
        'parent_alert_sent', 'consecutive_timeouts_count',
    ])

    # Notify worker rằng check đã bị huỷ (không cần nhập mã nữa).
    try:
        cancelled_by_role = 'admin' if is_admin else 'parent'
        _notify_user(
            check.worker,
            title="✅ Yêu cầu xác minh đã được huỷ",
            message=f"Yêu cầu xác minh cho công việc '{check.task.title}' đã bị "
                    f"{cancelled_by_role} huỷ. Bạn không cần nhập mã nữa.",
            data={
                'type': 'verification_cancelled',
                'task_id': check.task.id,
                'check_id': check.id,
            }
        )
    except Exception as e:
        logger.warning(
            f"[tracking] cancel_verification_check: notify worker failed: {e}"
        )

    logger.info(
        f"[tracking] Verification Check#{check.id} cancelled by "
        f"User#{requester.id} (reason={reason!r})"
    )
    return check


def cancel_pending_verification_checks_for_task(task: Task) -> int:
    """Huỷ tất cả pending RandomVerificationCheck của task khi task kết thúc.

    Gọi từ tracking.signals._clear_tracking_on_task_save() khi task chuyển
    sang 'completed' hoặc 'cancelled'. Tái sử dụng pattern từ
    cancel_verification_check() — set status='cancelled', responded_at=now,
    reset parent_alert_sent=False, consecutive_timeouts_count=0.

    KHÔNG gửi notification cho worker (khác với cancel thủ công) vì lý do
    huỷ là "task đã xong" — không cần làm phiền CarePartner thêm.

    Trả về số check đã huỷ.
    """
    from .models import RandomVerificationCheck

    pending_checks = RandomVerificationCheck.objects.filter(
        task=task, status='pending',
    )
    count = pending_checks.count()
    if count == 0:
        return 0

    now = timezone.now()
    updated = pending_checks.update(
        status='cancelled',
        responded_at=now,
        parent_alert_sent=False,
        consecutive_timeouts_count=0,
    )
    if updated > 0:
        logger.info(
            f"[tracking] Auto-cancelled {updated} pending verification check(s) "
            f"for Task#{task.id} (task ended — status={task.status})"
        )
    return updated
