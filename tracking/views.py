"""
API Views cho tracking module.

Endpoint map:
  [Carepartner]
    POST /api/tracking/consent/                 grant/deny consent cho task
    POST /api/tracking/consent/<task_id>/revoke/ dừng khẩn cấp (revoke)
    POST /api/tracking/location/                 update vị trí (mỗi 10s)

  [Parent]
    GET  /api/tracking/<task_id>/live/           lấy vị trí hiện tại
    GET  /api/tracking/<task_id>/history/        lấy lịch sử toàn bộ
    GET  /api/tracking/<task_id>/consent/        check consent status

  [Both]
    POST /api/tracking/sos/                      bấm SOS khẩn cấp
    GET  /api/tracking/sos/<task_id>/            list SOS alerts của task
    POST /api/tracking/sos/<sos_id>/resolve/     đánh dấu đã giải quyết
"""

import logging
from datetime import timedelta
from django.db import transaction
from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.throttling import ScopedRateThrottle

from rest_framework.parsers import MultiPartParser, FormParser
from core.models import Task
from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert, DeviceHeartbeat, DeviceOfflineAlert
from .serializers import (
    LocationConsentSerializer, LiveLocationSerializer,
    LocationHistorySerializer, SOSAlertSerializer,
    GrantConsentSerializer, UpdateLocationSerializer, SOSSerializer,
    HeartbeatSerializer, LocationPermissionStatusSerializer,
    RandomVerificationCheckSerializer, SetVerificationPinSerializer,
    RespondVerificationCheckSerializer, BatchLocationSerializer,
    DeviceOfflineAlertSerializer,
)
from .services import (
    grant_consent, revoke_consent, update_worker_location,
    get_live_location, get_location_history, trigger_sos,
    get_accepted_worker,
    update_heartbeat, get_device_status, get_offline_alerts_for_task,
    check_offline_devices, retry_offline_alert_pushes, acknowledge_offline_alert,
    AlreadyAcknowledgedError,
    set_verification_pin, respond_verification_check,
    # QA-FIX-1 / Spec 2.4: parent history + cancel
    get_verification_history_for_parent, cancel_verification_check,
    # B5 — xác thực bằng ảnh trong ca
    submit_verification_photo, get_verification_photo,
    # SAFETY-LOC-001
    report_location_permission_revoked,
)

logger = logging.getLogger('educarelink.tracking.api')


# ═══════════════════════════════════════════════════════════════════
#  CAREPARTNER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

class GrantConsentAPIView(APIView):
    """
    POST /api/tracking/consent/
    Body: { task_id, granted: true|false }

    Carepartner đồng ý hoặc từ chối chia sẻ vị trí khi nhận việc.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GrantConsentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task_id = serializer.validated_data['task_id']
        granted = serializer.validated_data['granted']

        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Verify worker được accept cho task
        accepted = get_accepted_worker(task)
        if not accepted or accepted.id != request.user.id:
            return Response({'error': 'Bạn không phải là carepartner được chọn cho task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        consent = grant_consent(task=task, worker=request.user, granted=granted)
        return Response(LocationConsentSerializer(consent).data, status=status.HTTP_200_OK)


class RevokeConsentAPIView(APIView):
    """
    POST /api/tracking/consent/<task_id>/revoke/

    Carepartner dừng chia sẻ vị trí khẩn cấp.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            consent = revoke_consent(task=task, worker=request.user)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

        if not consent:
            return Response({'error': 'Không tìm thấy consent cho task này.'},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(LocationConsentSerializer(consent).data)


class UpdateLocationAPIView(APIView):
    """
    POST /api/tracking/location/
    Body: { task_id, latitude, longitude, accuracy?, speed?, heading? }

    Carepartner gửi vị trí hiện tại (gọi mỗi 10s).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UpdateLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            task = Task.objects.get(pk=data['task_id'])
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            live = update_worker_location(
                task=task, worker=request.user,
                latitude=data['latitude'], longitude=data['longitude'],
                accuracy=data.get('accuracy'), speed=data.get('speed'),
                heading=data.get('heading'),
            )
            return Response(LiveLocationSerializer(live).data, status=status.HTTP_200_OK)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ═══════════════════════════════════════════════════════════════════
#  PARENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

class LiveLocationAPIView(APIView):
    """
    GET /api/tracking/<task_id>/live/

    Parent lấy vị trí hiện tại của carepartner (poll mỗi 5s).

    QA-FIX-2 / B3: trả thêm thông tin stale/offline cho UI Parent:
      - last_seen: thời điểm GPS cuối cùng
      - seconds_since_last_seen: số giây đã qua
      - is_offline: True nếu > TRACKING_OFFLINE_THRESHOLD
      - is_stale: True nếu vị trí cũ hơn 30s (location có thể không còn live)
      - offline_threshold_seconds: ngưỡng cấu hình (không hardcode 60/90s)
    UI Parent dùng các field này để hiển thị rõ "vị trí cuối cùng lúc X"
    thay vì giả như vị trí live khi carepartner mất mạng.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            live = get_live_location(task=task, requester=request.user)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

        if not live:
            return Response({
                'is_tracking': False,
                'message': 'Carepartner chưa bật chia sẻ vị trí hoặc task không ở trạng thái in_progress.',
            })

        # QA-FIX-2 / B3: tính stale/offline status cho UI
        from django.utils import timezone as _tz
        from tracking.services import OFFLINE_THRESHOLD_SECONDS
        now = _tz.now()
        seconds_since = (now - live.last_seen).total_seconds() if live.last_seen else None
        # Stale = vị trí cũ hơn 30s (location có thể không còn live, nhưng
        # chưa đến ngưỡng offline). is_offline = vượt ngưỡng cấu hình.
        is_stale = seconds_since is not None and seconds_since > 30
        is_offline = seconds_since is not None and seconds_since > OFFLINE_THRESHOLD_SECONDS

        return Response({
            'is_tracking': True,
            'location': LiveLocationSerializer(live).data,
            # QA-FIX-2 / B3: thông tin stale/offline cho UI Parent
            'last_seen': live.last_seen.isoformat() if live.last_seen else None,
            'seconds_since_last_seen': int(seconds_since) if seconds_since is not None else None,
            'is_stale': is_stale,
            'is_offline': is_offline,
            'offline_threshold_seconds': OFFLINE_THRESHOLD_SECONDS,
        })


class LocationHistoryAPIView(APIView):
    """
    GET /api/tracking/<task_id>/history/?limit=1000

    Parent lấy lịch sử toàn bộ vị trí (lưu vĩnh viễn).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        limit = int(request.query_params.get('limit', 1000))
        try:
            history = get_location_history(task=task, requester=request.user, limit=limit)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

        return Response({
            'count': len(history),
            'task_id': task.id,
            'task_title': task.title,
            'history': history,
        })


class CheckConsentAPIView(APIView):
    """
    GET /api/tracking/<task_id>/consent/

    Parent (hoặc carepartner) check trạng thái consent của task.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Verify requester liên quan đến task
        is_parent = (task.parent_id == request.user.id)
        accepted = get_accepted_worker(task)
        is_worker = accepted and accepted.id == request.user.id
        if not (is_parent or is_worker or request.user.is_superuser):
            return Response({'error': 'Bạn không liên quan đến task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        try:
            consent = LocationConsent.objects.get(task=task)
        except LocationConsent.DoesNotExist:
            return Response({
                'has_consent': False,
                'consent': 'pending',
                'message': 'Carepartner chưa được hỏi đồng ý.',
            })

        return Response({
            'has_consent': True,
            'consent': LocationConsentSerializer(consent).data,
        })


# ═══════════════════════════════════════════════════════════════════
#  SOS ENDPOINTS (cả 2 bên)
# ═══════════════════════════════════════════════════════════════════

class SOSCreateAPIView(APIView):
    """
    POST /api/tracking/sos/
    Body: { task_id, latitude?, longitude?, message? }

    Carepartner hoặc parent bấm SOS khẩn cấp.
    """
    permission_classes = [IsAuthenticated]
    # ⚡ Security: Rate limit SOS — 5/phút (chống spam khẩn cấp)
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'sos'

    def post(self, request):
        serializer = SOSSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            task = Task.objects.get(pk=data['task_id'])
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            alert = trigger_sos(
                task=task, sender=request.user,
                latitude=data.get('latitude'),
                longitude=data.get('longitude'),
                message=data.get('message', ''),
            )
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

        return Response(SOSAlertSerializer(alert).data, status=status.HTTP_201_CREATED)


class SOSListAPIView(APIView):
    """
    GET /api/tracking/sos/<task_id>/

    List SOS alerts của task (cả 2 bên đều xem được).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        is_parent = (task.parent_id == request.user.id)
        accepted = get_accepted_worker(task)
        is_worker = accepted and accepted.id == request.user.id
        if not (is_parent or is_worker or request.user.is_superuser):
            return Response({'error': 'Bạn không liên quan đến task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        alerts = SOSAlert.objects.filter(task=task).order_by('-created_at')
        return Response(SOSAlertSerializer(alerts, many=True).data)


class SOSResolveAPIView(APIView):
    """
    POST /api/tracking/sos/<sos_id>/resolve/

    Đánh dấu SOS đã giải quyết.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, sos_id):
        try:
            alert = SOSAlert.objects.get(pk=sos_id)
        except SOSAlert.DoesNotExist:
            return Response({'error': 'Không tìm thấy SOS alert.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Verify requester liên quan đến task
        task = alert.task
        is_parent = (task.parent_id == request.user.id)
        accepted = get_accepted_worker(task)
        is_worker = accepted and accepted.id == request.user.id
        if not (is_parent or is_worker or request.user.is_superuser):
            return Response({'error': 'Bạn không liên quan đến task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        alert.status = 'resolved'
        alert.resolved_at = __import__('django.utils.timezone', fromlist=['now']).now()
        alert.resolved_by = request.user
        alert.save()
        return Response(SOSAlertSerializer(alert).data)


# ═══════════════════════════════════════════════════════════════════
#  DEVICE HEARTBEAT & OFFLINE ALERT (chống tắt máy/đập máy)
# ═══════════════════════════════════════════════════════════════════

class HeartbeatAPIView(APIView):
    """
    POST /api/tracking/heartbeat/
    Body: {
        task_id, latitude?, longitude?,
        battery_level?, app_state?, network_type?,
        location_permission_status?  // SAFETY-LOC-001
    }

    Carepartner app gửi heartbeat mỗi 30s khi đang tracking.
    Backend dùng để phát hiện thiết bị tắt nguồn/mất mạng.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = HeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            task = Task.objects.get(pk=data['task_id'])
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            hb = update_heartbeat(
                task=task, worker=request.user,
                latitude=data.get('latitude'),
                longitude=data.get('longitude'),
                battery_level=data.get('battery_level'),
                app_state=data.get('app_state', ''),
                network_type=data.get('network_type', ''),
                # SAFETY-LOC-001: truyền location_permission_status
                location_permission_status=data.get('location_permission_status', 'unknown'),
            )
            return Response({
                'status': 'ok',
                'heartbeat_id': hb.id,
                'last_seen': hb.last_seen.isoformat(),
                'device_status': hb.device_status,
                'location_permission_status': hb.location_permission_status,
            }, status=status.HTTP_200_OK)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class LocationPermissionStatusAPIView(APIView):
    """
    POST /api/tracking/location-permission-status/
    Body: { task_id, status: 'granted'|'denied' }

    SAFETY-LOC-001: Mobile gọi NGAY khi phát hiện quyền vị trí thay đổi
    (bị thu hồi hoặc được cấp lại). KHÔNG gọi mỗi 30s — chỉ khi thay đổi.

    Backend:
      - denied: tạo alert loại 'location_permission_revoked' + push KHẨN CẤP
      - granted: resolve alert + push "đã bật lại vị trí"
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = LocationPermissionStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            task = Task.objects.get(pk=data['task_id'])
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            result = report_location_permission_revoked(
                task=task,
                worker=request.user,
                permission_status=data['status'],
            )
            return Response(result, status=status.HTTP_200_OK)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DeviceStatusAPIView(APIView):
    """
    GET /api/tracking/<task_id>/device-status/

    Parent lấy trạng thái thiết bị carepartner (online/offline + alert active).
    Poll mỗi 10s khi đang theo dõi.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            status_data = get_device_status(task=task, requester=request.user)
            return Response(status_data)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class OfflineAlertsListAPIView(APIView):
    """
    GET /api/tracking/<task_id>/offline-alerts/?limit=50

    Parent lấy list offline alerts của task (lưu vĩnh viễn — để xem lại lịch sử).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        limit = int(request.query_params.get('limit', 50))
        try:
            alerts = get_offline_alerts_for_task(task=task, requester=request.user, limit=limit)
            return Response({
                'count': len(alerts),
                'task_id': task.id,
                'task_title': task.title,
                'alerts': alerts,
            })
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


# ═══════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINT
# ═══════════════════════════════════════════════════════════════════

class AdminTrackingOverviewAPIView(APIView):
    """GET /api/tracking/admin/overview/ — stats tổng quan."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.conf import settings as dj_settings
        return Response({
            'total_consents': LocationConsent.objects.count(),
            'active_consents': LocationConsent.objects.filter(consent='granted').count(),
            'active_live_locations': LiveLocation.objects.count(),
            'total_history_points': LocationHistory.objects.count(),
            'active_sos': SOSAlert.objects.filter(status='active').count(),
            'total_sos': SOSAlert.objects.count(),
            'geofence_radius_meters': getattr(dj_settings, 'TRACKING_GEOFENCE_RADIUS', 500),
            # Device offline alert stats
            'device_heartbeats': {
                'total': DeviceHeartbeat.objects.count(),
                'online': DeviceHeartbeat.objects.filter(device_status='online').count(),
                'offline': DeviceHeartbeat.objects.filter(device_status='offline').count(),
                'stopped': DeviceHeartbeat.objects.filter(device_status='stopped').count(),
            },
            'offline_alerts': {
                'total': DeviceOfflineAlert.objects.count(),
                'active': DeviceOfflineAlert.objects.filter(status='active').count(),
                'recovered': DeviceOfflineAlert.objects.filter(status='recovered').count(),
                'task_ended': DeviceOfflineAlert.objects.filter(status='task_ended').count(),
            },
            'offline_threshold_seconds': getattr(dj_settings, 'TRACKING_OFFLINE_THRESHOLD', 60),
            'heartbeat_interval_seconds': getattr(dj_settings, 'TRACKING_HEARTBEAT_INTERVAL', 30),
        })


class AdminRunOfflineCheckAPIView(APIView):
    """
    POST /api/tracking/admin/run-offline-check/

    Admin trigger manual check offline devices (debug).
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        stats = check_offline_devices()
        return Response(stats)


class AcknowledgeOfflineAlertAPIView(APIView):
    """
    POST /api/tracking/<task_id>/offline-alerts/<alert_id>/acknowledge/

    Parent mở app và xem cảnh báo → gọi endpoint này để acknowledge,
    dừng retry push loop (Phần 2).

    QA-FIX-1 / Bug 1.5: map exception → status code đúng:
      - AlreadyAcknowledgedError → 400 (alert đã được acknowledge rồi)
      - ValueError (task_id mismatch) → 404 (chống dùng alert_id của task khác)
      - PermissionError → 403 (parent khác không được ack alert của task không phải mình)
    Trước đây mọi ValueError đều map → 404, kể cả "đã acknowledged" → không
    phân biệt được với UI.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id, alert_id):
        try:
            alert = acknowledge_offline_alert(
                alert_id=alert_id, requester=request.user,
                task_id=task_id,
            )
            return Response({
                'status': 'acknowledged',
                'alert_id': alert.id,
                'acknowledged_at': alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
                'acknowledged_by': alert.acknowledged_by_id,
                'push_retry_count': alert.push_retry_count,
            })
        except AlreadyAcknowledgedError as e:
            # QA-FIX-1 / Bug 1.5: alert đã ack → 400 (không phải 404 im lặng)
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as e:
            # QA-FIX-1 / Bug 1.5: task_id mismatch → 404 (không透露 alert tồn tại)
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class AdminRunRetryPushAPIView(APIView):
    """
    POST /api/tracking/admin/run-retry-push/

    Admin trigger manual retry push cho alert active chưa acknowledged (debug).
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        stats = retry_offline_alert_pushes()
        return Response(stats)


# ═══════════════════════════════════════════════════════════════════
#  PHẦN 3 — RANDOM VERIFICATION CHECK (CarePartner nhập mã PIN)
# ═══════════════════════════════════════════════════════════════════

from .models import RandomVerificationCheck  # noqa: E402


class SetVerificationPinAPIView(APIView):
    """
    POST /api/tracking/verification-pin/set/

    CarePartner đặt/đổi mã cá nhân (PIN 4-6 số).
    Body: { pin, current_password }
    - current_password: mật khẩu tài khoản — xác thực lại tránh ai cầm máy đổi PIN.
    - Hash bằng make_password — KHÔNG lưu plaintext.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetVerificationPinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user = set_verification_pin(
                user=request.user,
                pin=serializer.validated_data['pin'],
                # QA-FIX-6 / BẮT BUỘC 2: current_password optional — user
                # OAuth (Google/Facebook) không cần, user email/password cần.
                # Service layer tự quyết định dựa trên user.has_usable_password().
                current_password=serializer.validated_data.get('current_password'),
            )
            return Response({
                'status': 'ok',
                'pin_set_at': user.verification_pin_set_at.isoformat() if user.verification_pin_set_at else None,
            })
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PendingVerificationCheckAPIView(APIView):
    """
    GET /api/tracking/verification-checks/pending/

    CarePartner poll (hoặc dùng ngay khi nhận push) để lấy check đang chờ của mình.
    Trả về check_id, respond_deadline — KHÔNG tiết lộ trước sắp có check.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Chỉ worker mới có check
        if request.user.role != 'worker':
            return Response({'has_pending': False})

        check = RandomVerificationCheck.objects.filter(
            worker=request.user,
            status='pending',
        ).order_by('respond_deadline').first()

        if not check:
            return Response({'has_pending': False})

        # Trả về kèm seconds_remaining để mobile hiển thị đếm ngược
        from django.utils import timezone as _tz
        now = _tz.now()
        seconds_remaining = max(0, int((check.respond_deadline - now).total_seconds()))

        return Response({
            'has_pending': True,
            'check_id': check.id,
            'task_id': check.task_id,
            'triggered_at': check.triggered_at.isoformat(),
            'respond_deadline': check.respond_deadline.isoformat(),
            'seconds_remaining': seconds_remaining,
            'attempts': check.attempts,
            # B5 — loại check để mobile hiện UI chụp ảnh ('photo') hay nhập mã ('pin')
            'verification_type': check.verification_type,
        })


class VerificationPhotoAPIView(APIView):
    """
    GET /api/tracking/verification-checks/<check_id>/photo/

    B5 — Xem ảnh xác minh (serve bytes ảnh QUA API CÓ AUTH — KHÔNG dùng
    URL /media/ public, chống truy cập trái phép cho link bị lộ).

    Quyền: chỉ (1) worker sở hữu check, (2) phụ huynh của task, (3) admin.

    Response:
      - 200: bytes ảnh (Content-Type: image/jpeg|png|webp) — client dùng
        <img src=objectURL> (web, fetch blob + Authorization header) hoặc
        Image source có headers (mobile expo-image).
      - 400: check chưa có ảnh
      - 403: người không liên quan

    ?format=json — trả metadata JSON thay vì bytes (tiện debug/test).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, check_id):
        import mimetypes
        import os
        from django.http import HttpResponse

        try:
            check = get_verification_photo(check_id=check_id, requester=request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

        # Metadata JSON mode (debug/test)
        if request.query_params.get('format') == 'json':
            return Response({
                'check_id': check.id,
                'task_id': check.task_id,
                'status': check.status,
                'verification_type': check.verification_type,
                'photo_submitted_at': check.photo_submitted_at.isoformat() if check.photo_submitted_at else None,
                'file_name': os.path.basename(check.photo.name) if check.photo else None,
            })

        # Serve bytes ảnh — đọc từ storage qua FieldFile API (hoạt động cả
        # local FS lẫn S3 sau này, không hardcode path).
        try:
            photo_file = check.photo
            photo_file.open('rb')
            content_type = mimetypes.guess_type(photo_file.name)[0] or 'application/octet-stream'
            response = HttpResponse(photo_file.read(), content_type=content_type)
            photo_file.close()
            # Không cache aggressively — ảnh xác minh là dữ liệu nhạy cảm,
            # tránh browser/CDN giữ bản sao khi đã hết quyền truy cập.
            response['Cache-Control'] = 'private, no-store'
            return response
        except (FileNotFoundError, OSError, ValueError) as e:
            logger.warning(f"[tracking] B5 photo read failed for Check#{check_id}: {e}")
            return Response(
                {'error': 'Không đọc được file ảnh từ bộ nhớ.'},
                status=status.HTTP_404_NOT_FOUND,
            )


class SubmitVerificationPhotoAPIView(VerificationPhotoAPIView):
    """
    POST /api/tracking/verification-checks/<check_id>/photo/

    B5 — CarePartner nộp ảnh xác minh cho check loại verification_type='photo'.

    Request: multipart/form-data
      - photo: file ảnh (bắt buộc — JPEG/PNG/WebP, <= VERIFICATION_PHOTO_MAX_MB)
      - latitude / longitude: tọa độ lúc chụp (optional, form fields)

    Response:
      - 200: { status: 'confirmed', check_id, photo_submitted_at, responded_at }
      - 400: file không hợp lệ / check đã kết thúc / hết hạn / sai loại check /
             không đang tham gia task / nộp trùng
      - 403: người khác cố nộp (không phải worker của check)

    GET (kế thừa từ VerificationPhotoAPIView) — xem ảnh có auth.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, check_id):
        photo_file = request.FILES.get('photo')

        # latitude/longitude gửi kèm qua form fields (multipart) — parse an toàn
        def _parse_coord(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        try:
            check = submit_verification_photo(
                check_id=check_id,
                requester=request.user,
                photo_file=photo_file,
                latitude=_parse_coord(request.data.get('latitude')),
                longitude=_parse_coord(request.data.get('longitude')),
            )
            return Response({
                'status': 'confirmed',
                'check_id': check.id,
                'task_id': check.task_id,
                'photo_submitted_at': check.photo_submitted_at.isoformat() if check.photo_submitted_at else None,
                'responded_at': check.responded_at.isoformat() if check.responded_at else None,
            })
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            # File không hợp lệ / hết hạn / đã nộp / sai loại check — trả 400
            # để mobile hiển thị message tiếng Việt.
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RespondVerificationCheckAPIView(APIView):
    """
    POST /api/tracking/verification-checks/<check_id>/respond/

    CarePartner phản hồi check — nhập mã PIN.
    Body: { pin, latitude?, longitude? }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, check_id):
        serializer = RespondVerificationCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            check = respond_verification_check(
                check_id=check_id,
                requester=request.user,
                pin=serializer.validated_data['pin'],
                latitude=serializer.validated_data.get('latitude'),
                longitude=serializer.validated_data.get('longitude'),
            )
            return Response({
                'status': 'confirmed',
                'check_id': check.id,
                'responded_at': check.responded_at.isoformat(),
            })
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            # Có thể là "hết thời gian" hoặc "sai mã" — trả 400 để mobile hiển thị message
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminListVerificationChecksAPIView(APIView):
    """
    GET /api/tracking/admin/verification-checks/?worker=&task=&status=

    Admin xem lịch sử toàn bộ check (lọc theo worker/task/status).
    Phục vụ đánh giá tin cậy CarePartner.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.db.models import Q as _Q
        qs = RandomVerificationCheck.objects.all().order_by('-triggered_at')

        worker_id = request.query_params.get('worker')
        if worker_id:
            qs = qs.filter(worker_id=worker_id)

        task_id = request.query_params.get('task')
        if task_id:
            qs = qs.filter(task_id=task_id)

        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        # B5 — filter theo loại check (pin/photo)
        type_filter = request.query_params.get('verification_type')
        if type_filter:
            qs = qs.filter(verification_type=type_filter)

        limit = int(request.query_params.get('limit', 100))
        qs = qs[:limit]

        return Response({
            'count': len(qs),
            'checks': RandomVerificationCheckSerializer(qs, many=True).data,
        })


class AdminTriggerVerificationCheckAPIView(APIView):
    """
    POST /api/tracking/admin/trigger-verification-check/

    Admin trigger manual tạo verification check cho 1 task (debug).
    Body: { task_id, verification_type? }  — verification_type: 'pin' | 'photo'
    (B5: truyền 'photo' để test luồng ảnh; bỏ trống thì random như scheduler).
    Chỉ hoạt động khi DEBUG=True.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        from django.conf import settings as dj_settings
        if not getattr(dj_settings, 'DEBUG', False):
            return Response(
                {'error': 'Endpoint chỉ hoạt động khi DEBUG=True.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        task_id = request.data.get('task_id')
        if not task_id:
            return Response({'error': 'task_id là bắt buộc.'}, status=status.HTTP_400_BAD_REQUEST)

        # B5 — cho phép chỉ định loại check để test thủ công
        verification_type = request.data.get('verification_type')
        if verification_type not in (None, 'pin', 'photo'):
            return Response(
                {'error': "verification_type chỉ nhận 'pin' hoặc 'photo'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .verification_scheduler import trigger_verification_check_now
        try:
            check = trigger_verification_check_now(task_id, verification_type=verification_type)
            return Response({
                'status': 'created',
                'check_id': check.id,
                'task_id': check.task_id,
                'verification_type': check.verification_type,
                'respond_deadline': check.respond_deadline.isoformat(),
            })
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminRunVerificationCheckAPIView(APIView):
    """
    POST /api/tracking/admin/run-verification-check/

    Admin trigger manual chạy full verification check job (debug).
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        from .verification_scheduler import run_verification_check
        stats = run_verification_check()
        return Response(stats)


class AdminVerificationSchedulerStatsAPIView(APIView):
    """GET /api/tracking/admin/verification-scheduler/stats/"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from .verification_scheduler import get_stats
        return Response(get_stats())


# ═══════════════════════════════════════════════════════════════════
#  QA-FIX-1 / Spec 2.4 — Parent verification history + Cancel check
# ═══════════════════════════════════════════════════════════════════

class ParentVerificationHistoryAPIView(APIView):
    """
    GET /api/tracking/<task_id>/verification-checks/history/?limit=100

    Parent xem lịch sử verification checks của task mình.
    Trả về list of dict cho frontend render timeline:
      - triggered_at, status, attempts, responded_at, ...
      - parent_alert_sent, consecutive_timeouts_count (debug)

    QA-FIX-1 / Spec 2.4: trước đây parent không có endpoint xem lịch sử
    verification checks — chỉ admin xem được. Parent cần biết carepartner
    đã xác minh đúng/sai/timeout bao nhiêu lần để đánh giá tin cậy.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        limit = int(request.query_params.get('limit', 100))
        try:
            checks = get_verification_history_for_parent(
                task=task, requester=request.user, limit=limit,
            )
            return Response({
                'count': len(checks),
                'task_id': task.id,
                'task_title': task.title,
                'checks': checks,
            })
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


class CancelVerificationCheckAPIView(APIView):
    """
    POST /api/tracking/verification-checks/<check_id>/cancel/

    Admin HOẶC parent sở hữu task có thể huỷ verification check đang pending.
    Body (optional): { reason: str }

    QA-FIX-1 / Spec 2.4: trước đây check pending chỉ có thể chờ timeout
    (90s). Nếu parent phát hiện false alarm hoặc task đã completed, không
    có cách chủ động dừng check → push vẫn retry 5 lần trong 90s.

    Worker (carepartner) KHÔNG được huỷ — phải nhập mã hoặc chờ timeout
    (tránh carepartner huỷ để trốn xác minh).

    Response:
      - 200: { status: 'cancelled', check_id, responded_at }
      - 400: check đã kết thúc (confirmed/wrong_code/timeout/cancelled)
      - 403: worker cố huỷ, hoặc parent khác không sở hữu task
      - 404: không tìm thấy check
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, check_id):
        reason = request.data.get('reason', '') if isinstance(request.data, dict) else ''
        try:
            check = cancel_verification_check(
                check_id=check_id, requester=request.user, reason=reason,
            )
            return Response({
                'status': 'cancelled',
                'check_id': check.id,
                'task_id': check.task_id,
                'responded_at': check.responded_at.isoformat() if check.responded_at else None,
            })
        except ValueError as e:
            # ValueError có thể là "Không tìm thấy" hoặc "đã kết thúc".
            # Cả 2 đều trả 400 (giống RespondVerificationCheckAPIView pattern)
            # để mobile hiển thị message rõ ràng.
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except PermissionError as e:
            # Có thể là worker cố huỷ, hoặc parent khác không sở hữu task.
            # Trả 403 để mobile hiển thị message rõ ràng.
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


# ═══════════════════════════════════════════════════════════════════
#  PHẦN 1 — BATCH LOCATION (cache offline + sync khi có mạng lại)
# ═══════════════════════════════════════════════════════════════════

class BatchLocationAPIView(APIView):
    """
    POST /api/tracking/location/batch/

    CarePartner gửi batch các điểm vị trí đã lưu offline khi mất mạng.
    Body: {
      task_id: 123,
      points: [
        {
          client_point_id: "uuid-optional",  # QA-FIX-2/B1: idempotent
          latitude: 10.123,
          longitude: 106.123,
          accuracy?: 10,
          speed?: 0,
          heading?: 0,
          recorded_at: "2026-08-13T10:00:00Z"
        },
        ...
      ]
    }
    - Mỗi điểm ghi vào LocationHistory với đúng recorded_at gửi lên.
    - Chỉ điểm cuối (mới nhất theo recorded_at) mới update LiveLocation.
    - Tối đa 500 điểm/lần gọi (trả 413 nếu vượt).
    - QA-FIX-2 / B1: nếu client_point_id đã tồn tại → skip (đã insert rồi),
      không tạo duplicate. Trả về inserted/already_exists/rejected per-point
      để mobile biết điểm nào cần xoá khỏi queue cục bộ.

    QA-FIX-1 / Bug 1.2: wrap toàn bộ insert + LiveLocation update trong
    transaction.atomic() — nếu LiveLocation update fail thì rollback
    LocationHistory inserts (trước đây chỉ catch + log → dữ liệu lệch).

    QA-FIX-1 / Spec 2.5:
    - Trả 201 Created (không phải 200) khi insert thành công.
    - Trả 413 Request Entity Too Large nếu > 500 points (trước đây
      serializer trả 400 — không phân biệt với validation error khác).
    - Validate recorded_at: không vượt quá ±5 phút so với now (future
      skew) và không cũ quá 7 ngày (dữ liệu mốc). Điểm không hợp lệ
      bị SKIP riêng (không làm hỏng cả batch) — trả về skip_count.

    QA-FIX-2 / B1 (idempotent):
    - Mobile sinh UUID cho mỗi điểm GPS → gửi kèm client_point_id.
    - Nếu network timeout sau khi backend đã commit → mobile retry →
      unique constraint (task, worker, client_point_id) reject duplicate.
    - Response trả về list inserted_ids + already_exists_ids + rejected
      list (lý do reject per-point) → mobile chỉ xoá row có
      client_point_id thuộc inserted HOẶC already_exists khỏi queue
      cục bộ. Trước đây mobile xoá cả chunk → mất dữ liệu khi 1 điểm
      hỏng, hoặc duplicate khi retry thành công.
    """
    permission_classes = [IsAuthenticated]

    # QA-FIX-1 / Spec 2.5: hằng số validate recorded_at
    RECORDED_AT_FUTURE_TOLERANCE_SECONDS = 5 * 60   # ±5 phút
    RECORDED_AT_MAX_AGE_DAYS = 7                     # không cũ quá 7 ngày
    MAX_POINTS_PER_BATCH = 500

    def post(self, request):
        # QA-FIX-1 / Spec 2.5: check > 500 points TRƯỚC khi serializer
        # (serializer cũng có max_length=500 defense-in-depth, nhưng trả 400
        # thay vì 413 — ta return sớm 413 để mobile phân biệt).
        raw_points = request.data.get('points') if isinstance(request.data, dict) else None
        if isinstance(raw_points, list) and len(raw_points) > self.MAX_POINTS_PER_BATCH:
            return Response({
                'error': f'Tối đa {self.MAX_POINTS_PER_BATCH} điểm/lần gọi.',
                'received': len(raw_points),
                'max': self.MAX_POINTS_PER_BATCH,
            }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        serializer = BatchLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            task = Task.objects.get(pk=data['task_id'])
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Verify worker là người được accept (tái sử dụng logic UpdateLocationAPIView)
        accepted = get_accepted_worker(task)
        if not accepted or accepted.id != request.user.id:
            return Response({'error': 'Bạn không phải là carepartner được chọn cho task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        # Verify task đang in_progress + consent granted (gọi service có sẵn)
        try:
            consent = LocationConsent.objects.get(task=task, worker=request.user)
            if consent.consent != 'granted':
                return Response({'error': f"Consent hiện tại: {consent.consent} — không thể update vị trí."},
                                status=status.HTTP_403_FORBIDDEN)
        except LocationConsent.DoesNotExist:
            return Response({'error': 'Carepartner chưa đồng ý chia sẻ vị trí cho task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        if task.status != 'in_progress':
            return Response({'error': f"Task status='{task.status}' — chỉ track khi in_progress."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Parse + sắp xếp points theo recorded_at
        from django.utils import timezone as _tz
        from django.utils.dateparse import parse_datetime
        from decimal import Decimal as _Decimal
        import uuid as _uuid

        points = data['points']
        parsed = []
        # QA-FIX-2 / B1: per-point result lists cho mobile.
        # - inserted_ids: client_point_id mới insert thành công (mobile xoá khỏi queue).
        # - already_exists_ids: client_point_id đã tồn tại từ trước (mobile cũng xoá —
        #   đã sync rồi, retry là do mobile không nhận response trước).
        # - rejected: list {client_point_id, reason} — mobile tăng sync_attempts
        #   và skip riêng (không drop cả chunk).
        inserted_ids = []
        already_exists_ids = []
        rejected = []
        skipped = []  # legacy field cho test cũ (point invalid format)

        now = _tz.now()
        future_tol = timedelta(seconds=self.RECORDED_AT_FUTURE_TOLERANCE_SECONDS)
        max_age = timedelta(days=self.RECORDED_AT_MAX_AGE_DAYS)

        # Pre-fetch existing client_point_ids để check idempotent trong 1 query
        # (tránh N+1 queries cho N points).
        all_client_point_ids = [
            p.get('client_point_id') for p in points
            if p.get('client_point_id')
        ]
        existing_ids_set = set()
        if all_client_point_ids:
            existing_qs = LocationHistory.objects.filter(
                task=task,
                worker=request.user,
                client_point_id__in=all_client_point_ids,
            ).values_list('client_point_id', flat=True)
            existing_ids_set = set(existing_qs)

        for idx, p in enumerate(points):
            # QA-FIX-2 / B1: parse client_point_id (optional). Nếu có,
            # validate UUID format. Nếu không có → realtime point (cho phép).
            client_point_id = p.get('client_point_id')
            if client_point_id is not None:
                if not isinstance(client_point_id, str) or len(client_point_id) > 36:
                    rejected.append({
                        'index': idx,
                        'client_point_id': client_point_id,
                        'reason': 'client_point_id không hợp lệ (phải là UUID string ≤ 36 ký tự)',
                    })
                    continue
                # Check idempotent: nếu đã tồn tại → skip (đã insert rồi)
                if client_point_id in existing_ids_set:
                    already_exists_ids.append(client_point_id)
                    continue

            dt = parse_datetime(p['recorded_at'])
            if dt is None:
                reason = 'recorded_at không parse được'
                if client_point_id:
                    rejected.append({'index': idx, 'client_point_id': client_point_id, 'reason': reason})
                else:
                    skipped.append({'index': idx, 'reason': reason})
                continue
            if _tz.is_naive(dt):
                dt = _tz.make_aware(dt, _tz.utc)

            # QA-FIX-1 / Spec 2.5: validate timestamp
            if dt > now + future_tol:
                reason = f'recorded_at vượt quá {self.RECORDED_AT_FUTURE_TOLERANCE_SECONDS}s trong tươngng lai'
                if client_point_id:
                    rejected.append({
                        'index': idx, 'client_point_id': client_point_id,
                        'reason': reason, 'recorded_at': dt.isoformat(),
                    })
                else:
                    skipped.append({'index': idx, 'reason': reason, 'recorded_at': dt.isoformat()})
                continue
            if dt < now - max_age:
                reason = f'recorded_at cũ quá {self.RECORDED_AT_MAX_AGE_DAYS} ngày'
                if client_point_id:
                    rejected.append({
                        'index': idx, 'client_point_id': client_point_id,
                        'reason': reason, 'recorded_at': dt.isoformat(),
                    })
                else:
                    skipped.append({'index': idx, 'reason': reason, 'recorded_at': dt.isoformat()})
                continue

            parsed.append({
                'client_point_id': client_point_id,
                'latitude': _Decimal(str(p['latitude'])),
                'longitude': _Decimal(str(p['longitude'])),
                'accuracy': p.get('accuracy'),
                'speed': p.get('speed'),
                'heading': p.get('heading'),
                'recorded_at': dt,
            })

        if not parsed and not already_exists_ids:
            return Response({
                'error': 'Không có điểm hợp lệ nào.',
                'skipped': skipped,
                'rejected': rejected,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Sắp xếp theo recorded_at tăng dần (cũ → mới)
        parsed.sort(key=lambda x: x['recorded_at'])

        saved = 0
        # QA-FIX-2 / B1: nếu tất cả điểm đều đã tồn tại (already_exists), không
        # cần update LiveLocation (giữ nguyên vị trí cuối đã update từ trước).
        if parsed:
            last_point = parsed[-1]  # điểm mới nhất

            # QA-FIX-1 / Bug 1.2: wrap trong transaction.atomic — nếu LiveLocation
            # update fail → rollback LocationHistory inserts.
            # QA-FIX-2 / B1: dùng ignore_conflicts=False + catch IntegrityError
            # cho trường hợp race condition (2 request đồng thời cùng client_point_id).
            from django.db import IntegrityError
            try:
                with transaction.atomic():
                    # Insert LocationHistory với bulk_create.
                    # QA-FIX-2 / B1: nếu 1 point bị unique constraint violation
                    # (race condition), bulk_create rollback cả batch. Do đó ta
                    # insert per-point cho an toàn — điểm nào fail thì add vào
                    # already_exists_ids, điểm nào OK thì add vào inserted_ids.
                    objs_to_create = [
                        LocationHistory(
                            task=task,
                            worker=request.user,
                            latitude=p['latitude'],
                            longitude=p['longitude'],
                            accuracy=p['accuracy'],
                            speed=p['speed'],
                            heading=p['heading'],
                            client_recorded_at=p['recorded_at'],
                            client_point_id=p['client_point_id'],
                        )
                        for p in parsed
                    ]
                    try:
                        LocationHistory.objects.bulk_create(objs_to_create)
                        saved = len(objs_to_create)
                        inserted_ids = [p['client_point_id'] for p in parsed if p['client_point_id']]
                    except IntegrityError:
                        # Race condition: 1 trong các point đã bị insert bởi
                        # request khác giữa lúc ta check existing_ids_set và
                        # bulk_create. Fallback per-point insert.
                        logger.warning(
                            "[tracking] Batch bulk_create IntegrityError — fallback per-point"
                        )
                        for p in parsed:
                            try:
                                LocationHistory.objects.create(
                                    task=task,
                                    worker=request.user,
                                    latitude=p['latitude'],
                                    longitude=p['longitude'],
                                    accuracy=p['accuracy'],
                                    speed=p['speed'],
                                    heading=p['heading'],
                                    client_recorded_at=p['recorded_at'],
                                    client_point_id=p['client_point_id'],
                                )
                                saved += 1
                                if p['client_point_id']:
                                    inserted_ids.append(p['client_point_id'])
                            except IntegrityError:
                                # Point đã tồn tại (race) → already_exists
                                if p['client_point_id']:
                                    already_exists_ids.append(p['client_point_id'])

                    # Update LiveLocation với điểm mới nhất (chỉ khi có insert mới)
                    #
                    # QA-FIX-6 / NÊN LÀM 2 — Chống "nhảy lùi" vị trí khi
                    # batch offline flush chạy sau real-time update.
                    #
                    # Kịch bản lỗi:
                    #   1. CarePartner mất mạng → queue offline chứa điểm cũ.
                    #   2. CarePartner có mạng lại → real-time gửi điểm MỚI
                    #      trước (qua UpdateLocationAPIView) → LiveLocation
                    #      cập nhật đúng, client_recorded_at = now().
                    #   3. Ngay sau đó flushOfflineQueue chạy xong, gửi batch
                    #      chứa điểm CŨ (recorded_at trong quá khứ) qua
                    #      endpoint này.
                    #   4. update_or_create ghi đè LiveLocation bằng toạ độ
                    #      CŨ → parent thấy vị trí "nhảy lùi" tạm thời (~10s
                    #      cho tới real-time tiếp theo update lại).
                    #
                    # Fix: trước khi update, query LiveLocation hiện có.
                    # Nếu existing.client_recorded_at != None VÀ
                    # existing.client_recorded_at >= last_point['recorded_at']
                    # → SKIP update (giữ nguyên dữ liệu mới hơn). Vẫn insert
                    # LocationHistory bình thường (history là append-only).
                    #
                    # Nếu existing.client_recorded_at == None (row cũ chưa
                    # được populate field mới, hoặc mới tạo) → luôn update
                    # (giữ behaviour cũ cho backward compat).
                    if saved > 0:
                        batch_last_recorded_at = last_point['recorded_at']
                        existing = LiveLocation.objects.filter(task=task).first()
                        skip_live_update = False
                        if existing and existing.client_recorded_at is not None:
                            if existing.client_recorded_at >= batch_last_recorded_at:
                                # Existing mới hơn → skip update, giữ nguyên
                                skip_live_update = True
                                logger.info(
                                    f"[tracking] Batch skip LiveLocation update for Task#{task.id}: "
                                    f"existing.client_recorded_at={existing.client_recorded_at.isoformat()} "
                                    f">= batch last_point.recorded_at={batch_last_recorded_at.isoformat()} "
                                    f"(chống nhảy lùi vị trí)."
                                )
                        if not skip_live_update:
                            LiveLocation.objects.update_or_create(
                                task=task,
                                defaults={
                                    'worker': request.user,
                                    'latitude': last_point['latitude'],
                                    'longitude': last_point['longitude'],
                                    'accuracy': last_point['accuracy'],
                                    'speed': last_point['speed'],
                                    'heading': last_point['heading'],
                                    # QA-FIX-6 / NÊN LÀM 2: set client_recorded_at
                                    # = timestamp client capture GPS (có thể trong
                                    # quá khứ do offline queue).
                                    'client_recorded_at': batch_last_recorded_at,
                                },
                            )
            except Exception as e:
                logger.error(f"[tracking] Batch insert/LiveLocation failed: {e}")
                # QA-FIX-2 / B1: không透露 exception detail nội bộ cho client.
                return Response({
                    'error': 'Batch insert thất bại. Vui lòng thử lại.',
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # QA-FIX-1 / Spec 2.5: trả 201 Created (không phải 200 OK)
        # QA-FIX-2 / B1: trả per-point result để mobile xử lý queue cục bộ.
        return Response({
            'status': 'ok',
            'saved': saved,
            'inserted_ids': inserted_ids,
            'already_exists_ids': already_exists_ids,
            'rejected': rejected,
            'rejected_count': len(rejected),
            'skipped': skipped,
            'skipped_count': len(skipped),
            'last_recorded_at': parsed[-1]['recorded_at'].isoformat() if parsed else None,
        }, status=status.HTTP_201_CREATED)


class TrackingHealthCheckAPIView(APIView):
    """GET /api/tracking/health/ — debug."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({
            'status': 'ok',
            'module': 'tracking',
            'version': '1.0.0',
        })


class SchedulerHealthAPIView(APIView):
    """
    GET /api/tracking/scheduler-health/ — monitoring endpoint.

    QA-FIX-3 / C: trả về trạng thái scheduler lần chạy gần nhất (đọc từ
    file /tmp/tracking_scheduler_health.json do management command ghi).

    QA-FIX-5 / M2: căn chỉnh kiến trúc — /tmp không chia sẻ giữa Cron container
    và web container trên Render. Endpoint đọc từ DB (SchedulerHealth model)
    trước, fallback về /tmp file cho dev local + test.

    Monitoring ngoài (UptimeRobot, Render Stats, ...) poll endpoint này:
      - 200 + last_run_at gần đây (< 3 phút) → scheduler đang chạy.
      - 200 + last_run_at cũ (> 5 phút) → scheduler KHÔNG chạy (cron die,
        env var sai, exception). Cần alert admin.
      - 200 + null (chưa có data) → scheduler chưa chạy lần nào sau deploy.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from django.utils import timezone as _tz
        from django.utils.dateparse import parse_datetime as _parse_dt
        from django.conf import settings as _dj_settings

        # QA-FIX-5 / M2: ưu tiên đọc DB (chia sẻ giữa Cron và web service).
        health = None
        health_source = None
        try:
            from .management.commands.run_tracking_schedulers import _read_health_db
            health = _read_health_db()
            if health:
                health_source = 'db'
        except Exception as e:
            # Không fail cứng — fallback /tmp file bên dưới.
            pass

        # Fallback /tmp file (cho dev local + test chưa migrate SchedulerHealth).
        if not health:
            try:
                from .management.commands.run_tracking_schedulers import _read_health_file
                health = _read_health_file()
                if health:
                    health_source = 'file'
            except Exception:
                pass

        if not health:
            return Response({
                'status': 'no_data',
                'message': 'Scheduler chưa chạy lần nào sau deploy (chưa có DB row + chưa có /tmp file).',
                'hint': 'Kiểm tra Render Cron Job "educarelink-tracking-scheduler" đã tạo chưa + đã migrate 0008 chưa.',
                'health_source': 'none',
                'scheduler_in_web_worker': getattr(
                    _dj_settings, 'TRACKING_SCHEDULER_IN_WEB_WORKER', False
                ),
            })

        last_run_str = health.get('last_run_at')
        try:
            last_run_dt = _parse_dt(last_run_str) if last_run_str else None
        except Exception:
            last_run_dt = None

        seconds_since = None
        is_stale = False
        if last_run_dt:
            seconds_since = int((_tz.now() - last_run_dt).total_seconds())
            # Stale nếu > 3 phút (cron 1 phút → miss 3 lần liên tiếp = đáng lo)
            is_stale = seconds_since > 180

        return Response({
            'status': 'stale' if is_stale else 'ok',
            'last_run_at': last_run_str,
            'seconds_since_last_run': seconds_since,
            'is_stale': is_stale,
            'stale_threshold_seconds': 180,
            'health_source': health_source,
            'health_data': health,
            'scheduler_in_web_worker': getattr(
                _dj_settings, 'TRACKING_SCHEDULER_IN_WEB_WORKER', False
            ),
        })
