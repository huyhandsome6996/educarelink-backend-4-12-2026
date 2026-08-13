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
from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.throttling import ScopedRateThrottle

from core.models import Task
from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert, DeviceHeartbeat, DeviceOfflineAlert
from .serializers import (
    LocationConsentSerializer, LiveLocationSerializer,
    LocationHistorySerializer, SOSAlertSerializer,
    GrantConsentSerializer, UpdateLocationSerializer, SOSSerializer,
    HeartbeatSerializer,
    RandomVerificationCheckSerializer, SetVerificationPinSerializer,
    RespondVerificationCheckSerializer, BatchLocationSerializer,
)
from .services import (
    grant_consent, revoke_consent, update_worker_location,
    get_live_location, get_location_history, trigger_sos,
    get_accepted_worker,
    update_heartbeat, get_device_status, get_offline_alerts_for_task,
    check_offline_devices, retry_offline_alert_pushes, acknowledge_offline_alert,
    set_verification_pin, respond_verification_check,
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

        return Response({
            'is_tracking': True,
            'location': LiveLocationSerializer(live).data,
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
        battery_level?, app_state?, network_type?
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
            )
            return Response({
                'status': 'ok',
                'heartbeat_id': hb.id,
                'last_seen': hb.last_seen.isoformat(),
                'device_status': hb.device_status,
            }, status=status.HTTP_200_OK)
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
            'offline_threshold_seconds': getattr(dj_settings, 'TRACKING_OFFLINE_THRESHOLD', 90),
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
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id, alert_id):
        try:
            alert = acknowledge_offline_alert(alert_id=alert_id, requester=request.user)
            return Response({
                'status': 'acknowledged',
                'alert_id': alert.id,
                'acknowledged_at': alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
                'push_retry_count': alert.push_retry_count,
            })
        except ValueError as e:
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
                current_password=serializer.validated_data['current_password'],
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
        })


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
    Body: { task_id }
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

        from .verification_scheduler import trigger_verification_check_now
        try:
            check = trigger_verification_check_now(task_id)
            return Response({
                'status': 'created',
                'check_id': check.id,
                'task_id': check.task_id,
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
#  PHẦN 1 — BATCH LOCATION (cache offline + sync khi có mạng lại)
# ═══════════════════════════════════════════════════════════════════

class BatchLocationAPIView(APIView):
    """
    POST /api/tracking/location/batch/

    CarePartner gửi batch các điểm vị trí đã lưu offline khi mất mạng.
    Body: { task_id, points: [{ latitude, longitude, accuracy?, speed?,
                                heading?, recorded_at }, ...] }
    - Mỗi điểm ghi vào LocationHistory với đúng recorded_at gửi lên.
    - Chỉ điểm cuối (mới nhất theo recorded_at) mới update LiveLocation.
    - Tối đa 500 điểm/lần gọi.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
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

        points = data['points']
        parsed = []
        for p in points:
            dt = parse_datetime(p['recorded_at'])
            if dt is None:
                continue
            if _tz.is_naive(dt):
                dt = _tz.make_aware(dt, _tz.utc)
            parsed.append({
                'latitude': _Decimal(str(p['latitude'])),
                'longitude': _Decimal(str(p['longitude'])),
                'accuracy': p.get('accuracy'),
                'speed': p.get('speed'),
                'heading': p.get('heading'),
                'recorded_at': dt,
            })

        if not parsed:
            return Response({'error': 'Không có điểm hợp lệ nào.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Sắp xếp theo recorded_at tăng dần (cũ → mới)
        parsed.sort(key=lambda x: x['recorded_at'])

        saved = 0
        errors = []
        last_point = parsed[-1]  # điểm mới nhất

        # Insert LocationHistory với bulk_create.
        # Phần 1: LocationHistory.recorded_at = auto_now_add (server timestamp).
        # Để lưu timestamp client-side (quá khứ), ta dùng field riêng
        # `client_recorded_at` — set trực tiếp trên object trước bulk_create.
        # bulk_create không trigger auto_now_add nhưng cũng không set field
        # auto → để recorded_at tự set bằng now() (default DB behavior),
        # còn client_recorded_at = parsed value.
        objs_to_create = []
        for p in parsed:
            obj = LocationHistory(
                task=task,
                worker=request.user,
                latitude=p['latitude'],
                longitude=p['longitude'],
                accuracy=p['accuracy'],
                speed=p['speed'],
                heading=p['heading'],
                client_recorded_at=p['recorded_at'],
            )
            objs_to_create.append(obj)

        try:
            LocationHistory.objects.bulk_create(objs_to_create)
            saved = len(objs_to_create)
        except Exception as e:
            logger.error(f"[tracking] Batch insert failed: {e}")
            errors.append(str(e))

        # Update LiveLocation với điểm mới nhất
        if saved > 0:
            try:
                LiveLocation.objects.update_or_create(
                    task=task,
                    defaults={
                        'worker': request.user,
                        'latitude': last_point['latitude'],
                        'longitude': last_point['longitude'],
                        'accuracy': last_point['accuracy'],
                        'speed': last_point['speed'],
                        'heading': last_point['heading'],
                    },
                )
            except Exception as e:
                logger.error(f"[tracking] Batch LiveLocation update failed: {e}")
                errors.append(f"LiveLocation update failed: {e}")

        return Response({
            'status': 'ok',
            'saved': saved,
            'errors': errors,
            'last_recorded_at': last_point['recorded_at'].isoformat() if saved > 0 else None,
        })


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
