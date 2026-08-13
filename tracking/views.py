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
    AlreadyAcknowledgedError,
    set_verification_pin, respond_verification_check,
    # QA-FIX-1 / Spec 2.4: parent history + cancel
    get_verification_history_for_parent, cancel_verification_check,
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
    Body: { task_id, points: [{ latitude, longitude, accuracy?, speed?,
                                heading?, recorded_at }, ...] }
    - Mỗi điểm ghi vào LocationHistory với đúng recorded_at gửi lên.
    - Chỉ điểm cuối (mới nhất theo recorded_at) mới update LiveLocation.
    - Tối đa 500 điểm/lần gọi (trả 413 nếu vượt).

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

        points = data['points']
        parsed = []
        skipped = []  # QA-FIX-1 / Spec 2.5: list điểm bị skip (idx + lý do)
        now = _tz.now()
        future_tol = timedelta(seconds=self.RECORDED_AT_FUTURE_TOLERANCE_SECONDS)
        max_age = timedelta(days=self.RECORDED_AT_MAX_AGE_DAYS)

        for idx, p in enumerate(points):
            dt = parse_datetime(p['recorded_at'])
            if dt is None:
                skipped.append({'index': idx, 'reason': 'recorded_at không parse được'})
                continue
            if _tz.is_naive(dt):
                dt = _tz.make_aware(dt, _tz.utc)

            # QA-FIX-1 / Spec 2.5: validate timestamp
            # - Không vượt quá now + 5 phút (future skew do đồng hồ lệch)
            # - Không cũ quá 7 ngày (dữ liệu mốc — có thể là cache cũ bị kẹt)
            if dt > now + future_tol:
                skipped.append({
                    'index': idx,
                    'reason': f'recorded_at vượt quá {self.RECORDED_AT_FUTURE_TOLERANCE_SECONDS}s trong tươngng lai',
                    'recorded_at': dt.isoformat(),
                })
                continue
            if dt < now - max_age:
                skipped.append({
                    'index': idx,
                    'reason': f'recorded_at cũ quá {self.RECORDED_AT_MAX_AGE_DAYS} ngày',
                    'recorded_at': dt.isoformat(),
                })
                continue

            parsed.append({
                'latitude': _Decimal(str(p['latitude'])),
                'longitude': _Decimal(str(p['longitude'])),
                'accuracy': p.get('accuracy'),
                'speed': p.get('speed'),
                'heading': p.get('heading'),
                'recorded_at': dt,
            })

        if not parsed:
            return Response({
                'error': 'Không có điểm hợp lệ nào.',
                'skipped': skipped,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Sắp xếp theo recorded_at tăng dần (cũ → mới)
        parsed.sort(key=lambda x: x['recorded_at'])

        saved = 0
        last_point = parsed[-1]  # điểm mới nhất

        # QA-FIX-1 / Bug 1.2: wrap trong transaction.atomic — nếu LiveLocation
        # update fail → rollback LocationHistory inserts (trước đây chỉ catch
        # + log → dữ liệu lệch: history có nhưng live không update).
        try:
            with transaction.atomic():
                # Insert LocationHistory với bulk_create.
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
                    )
                    for p in parsed
                ]
                LocationHistory.objects.bulk_create(objs_to_create)
                saved = len(objs_to_create)

                # Update LiveLocation với điểm mới nhất
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
            logger.error(f"[tracking] Batch insert/LiveLocation failed: {e}")
            return Response({
                'error': 'Batch insert thất bại.',
                'detail': str(e),
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # QA-FIX-1 / Spec 2.5: trả 201 Created (không phải 200 OK)
        return Response({
            'status': 'ok',
            'saved': saved,
            'skipped': skipped,
            'skipped_count': len(skipped),
            'last_recorded_at': last_point['recorded_at'].isoformat(),
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
