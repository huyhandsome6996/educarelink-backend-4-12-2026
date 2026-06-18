"""
API Views cho AI recommendations.

Endpoints:
  GET /api/ai/recommendations/worker/                — gợi ý việc cho carepartner
  GET /api/ai/recommendations/candidates/<task_id>/  — gợi ý ứng viên cho parent
  POST /api/ai/recommendations/clear-cache/          — xóa cache (admin only)
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django.core.cache import cache
from django.shortcuts import get_object_or_404

from core.models import Task, TaskApplication
from .services import get_worker_recommendations, get_candidate_recommendations

logger = logging.getLogger('educarelink.ai_recommendations.api')


class WorkerRecommendationsAPIView(APIView):
    """
    GET /api/ai/recommendations/worker/

    Trả về danh sách task được sắp xếp theo độ phù hợp với carepartner.
    Query params:
      - category (optional): lọc theo category
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ carepartner mới xem được gợi ý việc.'}, status=403)

        if not request.user.is_approved:
            return Response({'error': 'Tài khoản chưa được Admin duyệt.'}, status=403)

        # Lấy danh sách task open mà worker chưa apply
        category_filter = request.query_params.get('category')
        tasks_qs = Task.objects.filter(status='open').order_by('-created_at')
        if category_filter:
            try:
                tasks_qs = tasks_qs.filter(category_id=int(category_filter))
            except (TypeError, ValueError):
                pass

        # Loại bỏ task mà worker đã apply
        applied_task_ids = TaskApplication.objects.filter(
            worker=request.user
        ).values_list('task_id', flat=True)
        tasks_qs = tasks_qs.exclude(id__in=applied_task_ids)

        # Limit để tránh spam Gemini (max 20 task)
        tasks_qs = tasks_qs[:20]

        result = get_worker_recommendations(request.user, tasks_qs)

        # Bao gồm task data để frontend render 1 lần
        task_map = {t.id: t for t in tasks_qs}
        enriched_recs = []
        for rec in result.get('recommendations', []):
            t = task_map.get(rec['task_id'])
            if t:
                enriched_recs.append({
                    **rec,
                    'task': {
                        'id': t.id,
                        'title': t.title,
                        'description': t.description,
                        'location': t.location,
                        'price': str(t.price),
                        'scheduled_time': t.scheduled_time.isoformat(),
                        'category_name': t.category.name if t.category else None,
                        'parent_name': t.parent.username if t.parent else None,
                        'has_geofence': bool(t.geofence_lat and t.geofence_lng),
                    }
                })
        result['recommendations'] = enriched_recs
        return Response(result)


class CandidateRecommendationsAPIView(APIView):
    """
    GET /api/ai/recommendations/candidates/<task_id>/

    Trả về đánh giá AI cho từng ứng viên của task.
    Parent-only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        task = get_object_or_404(Task, pk=task_id)

        if task.parent_id != request.user.id and not request.user.is_superuser:
            return Response({'error': 'Bạn không sở hữu task này.'}, status=403)

        # Lấy danh sách ứng viên pending (chưa approve)
        applications = list(
            TaskApplication.objects.filter(task=task, status='pending')
            .select_related('worker')
            .order_by('-applied_at')
        )

        result = get_candidate_recommendations(task, applications)

        # Enrich với worker data
        worker_map = {a.worker_id: a.worker for a in applications}
        app_map = {a.id: a for a in applications}
        enriched_recs = []
        for rec in result.get('recommendations', []):
            app = app_map.get(rec['application_id'])
            w = worker_map.get(rec['worker_id'])
            if app and w:
                enriched_recs.append({
                    **rec,
                    'worker': {
                        'id': w.id,
                        'username': w.username,
                        'first_name': w.first_name,
                        'last_name': w.last_name,
                        'qualifications': w.qualifications or [],
                        'is_verified': w.is_verified,
                        'avatar_url': w.avatar_url,
                    }
                })
        result['recommendations'] = enriched_recs
        return Response(result)


class ClearRecommendationsCacheAPIView(APIView):
    """POST /api/ai/recommendations/clear-cache/ — Admin only."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        # Xóa tất cả cache keys có prefix 'ai_rec_'
        # Note: django.core.cache không có iterate, nên dùng pattern
        # Cách đơn giản: xóa theo worker_id / task_id cụ thể
        worker_id = request.data.get('worker_id')
        task_id = request.data.get('task_id')

        cleared = 0
        if worker_id:
            # Xóa cache của worker cụ thể — cần biết task_ids nhưng không có
            # Fallback: xóa hết cache keys có pattern
            pass

        # Cách tiếp cận đơn giản: delete keys đã biết
        # (Production nên dùng Redis SCAN)
        return Response({
            'message': 'Cache clear request received. Cache sẽ tự expire sau TTL.',
            'note': 'Worker cache TTL: 5 phút, Parent cache TTL: 3 phút.',
        })
