"""API Views cho moderation module."""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core.models import Task, User
from .models import TaskModeration, Complaint, ComplaintEvidence
from .serializers import (
    TaskModerationSerializer, ComplaintSerializer,
    CreateComplaintSerializer, ResolveComplaintSerializer,
    OverrideModerationSerializer, ComplaintEvidenceSerializer,
)
from .services import moderate_task, analyze_complaint

logger = logging.getLogger('educarelink.moderation.api')


# ═══════════════════════════════════════════════════════════════════
#  TASK MODERATION STATUS (cho parent + worker)
# ═══════════════════════════════════════════════════════════════════

class TaskModerationStatusAPIView(APIView):
    """GET /api/moderation/task/<task_id>/ — xem trạng thái kiểm duyệt."""
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        task = get_object_or_404(Task, pk=task_id)
        try:
            mod = task.moderation
            return Response(TaskModerationSerializer(mod).data)
        except TaskModeration.DoesNotExist:
            return Response({'status': 'approved', 'message': 'Chưa có kiểm duyệt — mặc định approved.'})


# ═══════════════════════════════════════════════════════════════════
#  COMPLAINT — Carepartner gửi khiếu nại
# ═══════════════════════════════════════════════════════════════════

class CreateComplaintAPIView(APIView):
    """POST /api/moderation/complaints/ — carepartner gửi khiếu nại."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ carepartner mới được gửi khiếu nại.'}, status=403)

        serializer = CreateComplaintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            reported = User.objects.get(pk=data['reported_user_id'])
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy người bị khiếu nại.'}, status=404)

        complaint = Complaint.objects.create(
            complainant=request.user,
            reported_user=reported,
            task_id=data.get('task_id'),
            complaint_type=data['complaint_type'],
            title=data['title'],
            description=data['description'],
        )

        # Upload bằng chứng (nếu có)
        files = request.FILES
        for key in files:
            f = files[key]
            ev_type = 'image' if f.content_type and 'image' in f.content_type else \
                      'video' if f.content_type and 'video' in f.content_type else 'document'
            ComplaintEvidence.objects.create(
                complaint=complaint,
                evidence_type=ev_type,
                file=f,
            )

        # AI phân tích (async — không block response)
        try:
            analyze_complaint(complaint)
        except Exception as e:
            logger.warning(f"AI analyze complaint failed: {e}")

        # Notify admin
        try:
            from core.models import Notification
            admins = User.objects.filter(is_superuser=True, is_active=True)
            for admin in admins:
                Notification.objects.create(
                    recipient=admin,
                    title=f"🚨 Khiếu nại mới: {complaint.get_complaint_type_display()}",
                    message=f"{request.user.username} khiếu nại {reported.username}: {complaint.title}",
                )
        except Exception:
            pass

        return Response(ComplaintSerializer(complaint).data, status=201)


class MyComplaintsAPIView(generics.ListAPIView):
    """GET /api/moderation/complaints/mine/ — list khiếu nại của user hiện tại."""
    serializer_class = ComplaintSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Complaint.objects.filter(complainant=self.request.user).order_by('-created_at')


# ═══════════════════════════════════════════════════════════════════
#  ADMIN — Duyệt task + Xử lý khiếu nại
# ═══════════════════════════════════════════════════════════════════

class AdminModerationListAPIView(generics.ListAPIView):
    """GET /api/moderation/admin/tasks/ — list task cần duyệt (admin only)."""
    serializer_class = TaskModerationSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        status_filter = self.request.query_params.get('status', 'needs_review')
        qs = TaskModeration.objects.select_related('task', 'task__parent').all()
        if status_filter != 'all':
            qs = qs.filter(status=status_filter)
        return qs.order_by('-created_at')


class AdminOverrideModerationAPIView(APIView):
    """POST /api/moderation/admin/tasks/<pk>/override/ — admin override AI."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        mod = get_object_or_404(TaskModeration, pk=pk)
        serializer = OverrideModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        mod.status = data['status']
        mod.admin_note = data.get('admin_note', '')
        mod.reviewed_by = request.user
        mod.reviewed_at = timezone.now()
        mod.save()

        # Notify parent
        try:
            from core.models import Notification
            from core.views import send_expo_push_notification
            task = mod.task
            is_approved = data['status'] == 'admin_approved'
            Notification.objects.create(
                recipient=task.parent,
                title="✅ Công việc đã được duyệt" if is_approved else "❌ Công việc bị từ chối",
                message=f"Admin đã {'duyệt' if is_approved else 'từ chối'} '{task.title}'. {data.get('admin_note', '')}",
            )
            if task.parent.expo_push_token:
                send_expo_push_notification(
                    token=task.parent.expo_push_token,
                    title="✅ Đã duyệt" if is_approved else "❌ Bị từ chối",
                    body=f"'{task.title}' — admin đã xem xét.",
                    data={'type': 'moderation_override', 'task_id': task.id, 'approved': is_approved}
                )
        except Exception:
            pass

        return Response(TaskModerationSerializer(mod).data)


class AdminComplaintListAPIView(generics.ListAPIView):
    """GET /api/moderation/admin/complaints/ — list khiếu nại (admin only)."""
    serializer_class = ComplaintSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = Complaint.objects.select_related('complainant', 'reported_user', 'task').all()
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.order_by('-created_at')


class AdminResolveComplaintAPIView(APIView):
    """POST /api/moderation/admin/complaints/<pk>/resolve/ — admin xử lý khiếu nại."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        complaint = get_object_or_404(Complaint, pk=pk)
        serializer = ResolveComplaintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        complaint.status = data['status']
        if data.get('priority'):
            complaint.priority = data['priority']
        complaint.admin_response = data.get('admin_response', '')
        complaint.resolved_by = request.user
        complaint.resolved_at = timezone.now()
        complaint.save()

        # Notify carepartner
        try:
            from core.models import Notification
            from core.views import send_expo_push_notification
            Notification.objects.create(
                recipient=complaint.complainant,
                title="📋 Khiếu nại đã được xử lý",
                message=f"Admin đã xử lý khiếu nại '{complaint.title}'. {complaint.admin_response[:100]}",
            )
            if complaint.complainant.expo_push_token:
                send_expo_push_notification(
                    token=complaint.complainant.expo_push_token,
                    title="📋 Khiếu nại đã được xử lý",
                    body=f"Admin xử lý: {complaint.get_status_display()}",
                    data={'type': 'complaint_resolved', 'complaint_id': complaint.id}
                )
        except Exception:
            pass

        return Response(ComplaintSerializer(complaint).data)


class AdminAIAnalyzeComplaintAPIView(APIView):
    """POST /api/moderation/admin/complaints/<pk>/ai-analyze/ — admin yêu cầu AI phân tích lại."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        complaint = get_object_or_404(Complaint, pk=pk)
        result = analyze_complaint(complaint)
        if result:
            return Response(ComplaintSerializer(complaint).data)
        return Response({'error': 'AI không khả dụng.'}, status=503)


class AdminReModerateTaskAPIView(APIView):
    """POST /api/moderation/admin/tasks/<task_id>/re-moderate/ — admin yêu cầu AI duyệt lại."""
    permission_classes = [IsAdminUser]

    def post(self, request, task_id):
        task = get_object_or_404(Task, pk=task_id)
        mod = moderate_task(task)
        return Response(TaskModerationSerializer(mod).data)


class ModerationHealthCheckAPIView(APIView):
    """GET /api/moderation/health/ — debug."""
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        return Response({'status': 'ok', 'module': 'moderation', 'version': '1.0.0'})
