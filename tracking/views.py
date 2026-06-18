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

from core.models import Task
from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert
from .serializers import (
    LocationConsentSerializer, LiveLocationSerializer,
    LocationHistorySerializer, SOSAlertSerializer,
    GrantConsentSerializer, UpdateLocationSerializer, SOSSerializer,
)
from .services import (
    grant_consent, revoke_consent, update_worker_location,
    get_live_location, get_location_history, trigger_sos,
    get_accepted_worker,
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
#  ADMIN ENDPOINT
# ═══════════════════════════════════════════════════════════════════

class AdminTrackingOverviewAPIView(APIView):
    """GET /api/tracking/admin/overview/ — stats tổng quan."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({
            'total_consents': LocationConsent.objects.count(),
            'active_consents': LocationConsent.objects.filter(consent='granted').count(),
            'active_live_locations': LiveLocation.objects.count(),
            'total_history_points': LocationHistory.objects.count(),
            'active_sos': SOSAlert.objects.filter(status='active').count(),
            'total_sos': SOSAlert.objects.count(),
            'geofence_radius_meters': __import__('django.conf', fromlist=['settings']).settings.TRACKING_GEOFENCE_RADIUS if hasattr(__import__('django.conf', fromlist=['settings']).settings, 'TRACKING_GEOFENCE_RADIUS') else 500,
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
