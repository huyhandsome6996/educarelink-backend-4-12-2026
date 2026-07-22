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
from rest_framework import status
from django.core.cache import cache
from django.shortcuts import get_object_or_404

from core.models import Task, TaskApplication
from .services import (
    get_worker_recommendations,
    get_candidate_recommendations,
    build_worker_cache_key,
    build_parent_cache_key,
    WORKER_CACHE_PREFIX,
    PARENT_CACHE_PREFIX,
)

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
    """
    POST /api/ai/recommendations/clear-cache/ — Admin only.

    Body (chọn 1 trong 3):
      - {worker_id: <int>}      — xoá cache recommendation của carepartner đó
      - {task_id: <int>}        — xoá cache candidate recommendation của task đó
      - {all: true}             — xoá toàn bộ cache có prefix ai_rec_worker_ /
                                  ai_rec_parent_ (best-effort, vì LocMemCache
                                  không hỗ trợ SCAN; production nên dùng Redis)

    Trả về số key thực sự bị xoá (cleared) + danh sách key đã xoá (deleted_keys).
    Nếu không có key nào khớp (cache miss hoặc data đã thay đổi), cleared = 0
    và response nói rõ — không báo 'thành công' khi không làm gì.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        worker_id = request.data.get('worker_id')
        task_id = request.data.get('task_id')
        clear_all = request.data.get('all') is True

        if not (worker_id or task_id or clear_all):
            return Response(
                {
                    'error': "Cần cung cấp 'worker_id', 'task_id', hoặc {'all': true}.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted_keys = []

        # ── Case 1: clear theo worker_id ──────────────────────────────
        # Build lại đúng cache key mà WorkerRecommendationsAPIView đã set,
        # bằng cách lặp lại cùng query (open tasks mà worker chưa apply).
        if worker_id:
            try:
                wid = int(worker_id)
            except (TypeError, ValueError):
                return Response(
                    {'error': f'worker_id phải là int, nhận được {worker_id!r}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                applied_task_ids = TaskApplication.objects.filter(
                    worker_id=wid
                ).values_list('task_id', flat=True)
                task_ids = list(
                    Task.objects.filter(status='open')
                    .exclude(id__in=applied_task_ids)
                    .values_list('id', flat=True)[:20]
                )
                cache_key = build_worker_cache_key(wid, task_ids)
                if cache.has_key(cache_key):
                    cache.delete(cache_key)
                    deleted_keys.append(cache_key)
            except Exception as e:
                logger.warning(f"[clear-cache] Worker {wid} rebuild key failed: {e}")

        # ── Case 2: clear theo task_id ────────────────────────────────
        # Build lại đúng cache key mà CandidateRecommendationsAPIView đã set,
        # bằng cách lặp lại cùng query (pending applications của task).
        if task_id:
            try:
                tid = int(task_id)
            except (TypeError, ValueError):
                return Response(
                    {'error': f'task_id phải là int, nhận được {task_id!r}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                app_ids = list(
                    TaskApplication.objects.filter(
                        task_id=tid, status='pending'
                    ).values_list('id', flat=True)
                )
                cache_key = build_parent_cache_key(tid, app_ids)
                if cache.has_key(cache_key):
                    cache.delete(cache_key)
                    deleted_keys.append(cache_key)
            except Exception as e:
                logger.warning(f"[clear-cache] Task {tid} rebuild key failed: {e}")

        # ── Case 3: clear all (best-effort) ───────────────────────────
        # LocMemCache lưu entry trong OrderedDict _cache (private API), với key
        # được encode dạng "{key_prefix}:{version}:{key}" (mặc định ":1:key").
        # cache.delete(user_key) sẽ re-apply prefix+version → match raw key và
        # đồng bộ xoá cả _cache + _expire_info. Production nên dùng Redis SCAN.
        if clear_all:
            try:
                locmem = getattr(cache, '_cache', None)
                if hasattr(locmem, 'keys'):
                    for raw_key in list(locmem.keys()):
                        if not (
                            WORKER_CACHE_PREFIX in raw_key
                            or PARENT_CACHE_PREFIX in raw_key
                        ):
                            continue
                        # Strip prefix "{key_prefix}:{version}:" — mặc định ":1:".
                        # Dùng rsplit để tách phần user_key (phần sau 2 dấu ':').
                        # An toàn kể cả khi key_prefix chứa ':' (rare).
                        parts = raw_key.split(':', 2)
                        user_key = parts[2] if len(parts) == 3 else raw_key
                        # Tìm lại key để xoá (idempotent — đã xoá thì no-op)
                        if cache.has_key(user_key):
                            cache.delete(user_key)
                            if user_key not in deleted_keys:
                                deleted_keys.append(user_key)
                else:
                    logger.info(
                        "[clear-cache] Cache backend không có _cache dict — "
                        "skip 'all' branch. Production nên dùng Redis SCAN."
                    )
            except Exception as e:
                logger.warning(f"[clear-cache] 'all' branch failed: {e}")

        cleared = len(deleted_keys)
        if cleared > 0:
            return Response({
                'message': f'Đã xoá {cleared} cache key(s).',
                'cleared': cleared,
                'deleted_keys': deleted_keys,
                'note': 'Cache sẽ được build lại lần tới khi AI recommendation view được gọi.',
            })
        # Honest response: không xoá được key nào (cache miss, hoặc data đã
        # thay đổi khiến key rebuild không khớp key đã set).
        return Response({
            'message': 'Không tìm thấy cache key nào khớp để xoá.',
            'cleared': 0,
            'deleted_keys': [],
            'note': (
                'Có thể cache đã expire (TTL worker=5 phút, parent=3 phút), '
                'hoặc tập task_ids / app_ids hiện tại khác với lúc cache được set '
                '(làm cache_key hash khác nhau). Recommendation sẽ được tính lại '
                'lần gọi tiếp theo.'
            ),
        }, status=status.HTTP_200_OK)
