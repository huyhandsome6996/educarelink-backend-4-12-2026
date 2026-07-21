"""Auto-generated from core/views.py — tách theo domain (L5 refactor)."""

from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
import os
import logging
import requests
from django.db import models as db_models
from core.models import (User, Task, TaskApplication, ServiceCategory, Review,
                         CredentialSubmission, Notification, ProfileChangeRequest)
from core.serializers import (UserSerializer, TaskSerializer, TaskApplicationSerializer,
                              ServiceCategorySerializer, ReviewSerializer)
from core.views._helpers import (build_absolute_uri, get_tokens_for_user,
                                 send_expo_push_notification, haversine_distance,
                                 _get_platform_stats, _execute_admin_action)

logger = logging.getLogger('educarelink.core.views')

class TaskListCreateAPIView(generics.ListCreateAPIView):
    # ⚡ TỐI ƯU: select_related → giảm N+1 queries (parent + category load chung 1 query)
    # ⚡ FILTER: exclude tasks có moderation status='rejected' (không hiển thị trên feed)
    # ⚡ SECURITY: limit queryset to 200 records (chống DoS khi DB lớn)
    queryset = Task.objects.select_related('parent', 'category').all().order_by('-created_at')[:200]
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    # ⚡ Security: Rate limit task creation — 10/giờ (chống spam việc ảo)
    # Chỉ áp dụng cho POST (create), GET dùng default user throttle
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'task_create'

    def get_queryset(self):
        # ⚡ Filter out rejected tasks — không hiển thị trên worker feed
        qs = super().get_queryset()
        try:
            from moderation.models import TaskModeration
            rejected_task_ids = TaskModeration.objects.filter(
                status='rejected'
            ).values_list('task_id', flat=True)
            qs = qs.exclude(id__in=rejected_task_ids)
        except Exception:
            pass  # moderation module chưa sẵn sàng → không filter
        return qs

    def perform_create(self, serializer):
        # Chỉ phụ huynh mới được đăng việc
        if self.request.user.role != 'parent':
            raise drf_serializers.ValidationError({'detail': 'Chỉ phụ huynh mới được đăng việc.'})

        # ⚡ BƯỚC 1: Check keyword blacklist ĐỒNG BỘ (nhanh, <1ms)
        # Chỉ chặn những từ khóa CỰC KỲ nghiêm trọng (giết, ma túy, cờ bạc...)
        title = self.request.data.get('title', '')
        description = self.request.data.get('description', '')
        price = self.request.data.get('price', 0)

        try:
            from moderation.services import _check_banned_keywords
            blacklist_result = _check_banned_keywords(title, description, price)
            if blacklist_result['banned']:
                raise drf_serializers.ValidationError({
                    'detail': f'🚫 Công việc bị từ chối: {blacklist_result["reason"]}',
                    'flags': blacklist_result['flags'],
                    'confidence': blacklist_result['confidence'],
                })
        except ImportError:
            pass

        # ⚡ BƯỚC 2: Tạo task NGAY LẬP TỨC
        task = serializer.save(parent=self.request.user) # Phục vụ Màn 4: Phụ huynh đăng việc

        # ⚡ BƯỚC 3: AI moderation ASYNC (tối ưu 2026-07-21)
        # Trước đây: gọi moderate_task ĐỒNG BỘ → user chờ 18s cho Gemini
        # Giờ: gọi moderate_task_async → tạo TaskModeration pending ngay,
        #       spawn background thread chạy Gemini. Response trả về < 0.5s.
        # Signal post_save cũng đã được simplify (chỉ tạo pending record,
        # không gọi Gemini nữa) → tránh double-call.
        try:
            from moderation.services import moderate_task_async
            moderate_task_async(task)
            logger.info(f"[task create] Task#{task.id} ASYNC moderation spawned")
        except ImportError:
            # Fallback: nếu moderation module chưa sẵn sàng → skip
            pass
        except Exception as e:
            logger.exception(f"[task create] moderate_task_async failed: {e}")

class TaskDetailAPIView(generics.RetrieveAPIView):
    """API lấy chi tiết 1 công việc theo ID — tránh fetch ALL tasks rồi filter client-side"""
    # ⚡ TỐI ƯU: select_related + prefetch_related
    queryset = Task.objects.select_related('parent', 'category').prefetch_related('applications').all()
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

class TaskUpdateStatusAPIView(APIView):
    """API cho phụ huynh cập nhật trạng thái công việc (hoàn thành / hủy)"""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            task = Task.objects.get(pk=pk)
        except Task.DoesNotExist:
            return Response({"error": "Không tìm thấy công việc."}, status=status.HTTP_404_NOT_FOUND)

        # Chỉ phụ huynh sở hữu công việc mới được thay đổi trạng thái
        if task.parent != request.user:
            return Response({"error": "Bạn không có quyền thay đổi công việc này."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        valid_transitions = {
            'open': ['cancelled'],           # Việc đang tìm → chỉ có thể hủy
            'in_progress': ['completed', 'cancelled'],  # Việc đang làm → hoàn thành hoặc hủy
        }

        if new_status not in ['completed', 'cancelled']:
            return Response({"error": "Trạng thái không hợp lệ. Chỉ chấp nhận 'completed' hoặc 'cancelled'."}, status=status.HTTP_400_BAD_REQUEST)

        allowed = valid_transitions.get(task.status, [])
        if new_status not in allowed:
            return Response({"error": f"Không thể chuyển từ '{task.status}' sang '{new_status}'."}, status=status.HTTP_400_BAD_REQUEST)

        task.status = new_status
        task.save()

        # ⚡ Notify carepartner rằng task đã kết thúc → app tự clear tracking
        try:
            from tracking.models import LocationConsent
            accepted_app = TaskApplication.objects.filter(task=task, status='accepted').first()
            if accepted_app and accepted_app.worker:
                worker = accepted_app.worker
                if new_status == 'completed':
                    notif_title = '✅ Công việc đã hoàn thành'
                    notif_body = f'Công việc "{task.title}" đã hoàn thành. Cảm ơn bạn!'
                    notif_type = 'task_completed'
                else:
                    notif_title = '❌ Công việc đã bị hủy'
                    notif_body = f'Công việc "{task.title}" đã bị hủy bởi phụ huynh. Theo dõi vị trí đã dừng.'
                    notif_type = 'task_cancelled'

                # In-app notification
                Notification.objects.create(
                    recipient=worker,
                    title=notif_title,
                    message=notif_body,
                )
                # Push notification (kèm type để app auto clear tracking)
                if worker.expo_push_token:
                    send_expo_push_notification(
                        token=worker.expo_push_token,
                        title=notif_title,
                        body=notif_body,
                        data={
                            'type': notif_type,
                            'task_id': task.id,
                        }
                    )
        except Exception as e:
            import logging
            logging.getLogger('educarelink.task_status').warning(
                f'Notify worker on task {new_status} failed: {e}'
            )

        serializer = TaskSerializer(task)
        return Response(serializer.data)

# --- PHẦN 3: LUỒNG DÀNH CHO PHỤ HUYNH ---

class ParentTasksAPIView(generics.ListAPIView):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
         # ⚡ TỐI ƯU: select_related giảm N+1 (parent + category)
         qs = Task.objects.select_related('parent', 'category').filter(parent=self.request.user).order_by('-created_at')
         # ⚡ Filter out rejected tasks — phụ huynh cũng không thấy task bị reject
         try:
             from moderation.models import TaskModeration
             rejected_task_ids = TaskModeration.objects.filter(status='rejected').values_list('task_id', flat=True)
             qs = qs.exclude(id__in=rejected_task_ids)
         except Exception:
             pass
         return qs

class TaskCandidatesAPIView(generics.ListAPIView):
    serializer_class = TaskApplicationSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        # ⚡ TỐI ƯU: select_related('worker', 'task', 'task__parent') giảm N+1
        return TaskApplication.objects.select_related(
            'worker', 'task', 'task__parent', 'task__category'
        ).filter(task_id=self.kwargs['task_id'], task__parent=self.request.user)

class ApproveCandidateAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request, application_id):
        # Phục vụ Màn 6: Nút bấm [Chấp nhận bạn này]
        try:
            application = TaskApplication.objects.get(id=application_id, task__parent=request.user)
            if application.task.status != 'open':
                return Response({"error": "Công việc này đã đóng hoặc đang làm."}, status=status.HTTP_400_BAD_REQUEST)
            
            application.status = 'accepted'
            application.save()
            
            task = application.task
            task.status = 'in_progress'
            task.save()
            
            # Tự động từ chối các bạn khác
            TaskApplication.objects.filter(task=task, status='pending').update(status='rejected')
            
            # Gửi push notification cho ứng viên được nhận
            if hasattr(application.worker, 'expo_push_token') and application.worker.expo_push_token:
                send_expo_push_notification(
                    token=application.worker.expo_push_token,
                    title="🎉 Chúc mừng bạn!",
                    body=f"Phụ huynh đã chấp nhận bạn cho công việc '{task.title}'. Hãy mở ứng dụng để xem chi tiết!",
                    data={"task_id": task.id}
                )

            return Response({"message": f"Đã nhận {application.worker.username} làm việc!"})
        except TaskApplication.DoesNotExist:
            return Response({"error": "Không tìm thấy yêu cầu."}, status=status.HTTP_404_NOT_FOUND)

class ApplyTaskAPIView(APIView):
    permission_classes = [IsAuthenticated]
    # ⚡ Security: Rate limit apply — 20/giờ (chống spam ứng tuyển)
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'apply'
    def post(self, request, task_id):
        # Phục vụ Màn 9: Nút bấm [Ứng tuyển ngay]
        if request.user.role != 'worker':
            return Response({"error": "Chỉ Carepartner mới được nhận việc!"}, status=status.HTTP_403_FORBIDDEN)
        if not request.user.is_approved:
            return Response({"error": "Tài khoản của bạn chưa được Admin duyệt. Vui lòng đợi."}, status=status.HTTP_403_FORBIDDEN)
        try:
            task = Task.objects.get(id=task_id)
            if task.parent == request.user:
                 return Response({"error": "Không thể tự nhận việc của mình."}, status=400)

            # ================================================================
            # CONSENT CHO TRACKING (yêu cầu mới)
            # Frontend phải gửi 'consent_tracking' (true/false) trong body.
            # Nếu task có geofence → BẮT BUỘC đồng ý tracking mới được apply.
            # Nếu task không có geofence → không yêu cầu, vẫn apply bình thường.
            # ================================================================
            consent_tracking = request.data.get('consent_tracking', None)
            has_geofence = bool(task.geofence_lat and task.geofence_lng)

            if has_geofence and consent_tracking is None:
                return Response({
                    "error": "CONSENT_REQUIRED",
                    "message": "Phụ huynh đã yêu cầu theo dõi vị trí cho việc này. Bạn phải đồng ý chia sẻ vị trí mới được nhận việc.",
                    "geofence_lat": task.geofence_lat,
                    "geofence_lng": task.geofence_lng,
                    "geofence_radius": task.geofence_radius or 500,
                }, status=status.HTTP_400_BAD_REQUEST)

            app, created = TaskApplication.objects.get_or_create(
                task=task, worker=request.user, defaults={'status': 'pending'}
            )
            if created:
                # ================================================================
                # TẠO LOCATION CONSENT (nếu worker đồng ý)
                # ================================================================
                if consent_tracking is True and has_geofence:
                    try:
                        from tracking.models import LocationConsent
                        from django.utils import timezone
                        LocationConsent.objects.update_or_create(
                            task=task, worker=request.user,
                            defaults={
                                'consent': 'granted',
                                'granted_at': timezone.now(),
                                'revoked_at': None,
                            }
                        )
                    except Exception as e:
                        # Không fail nếu tracking module chưa sẵn sàng
                        import logging
                        logging.getLogger('educarelink.apply').warning(
                            f"Không tạo được LocationConsent cho task#{task.id}: {e}"
                        )

                return Response({
                    "message": "Đã ứng tuyển!",
                    "consent_tracking": bool(consent_tracking and has_geofence),
                }, status=201)
            return Response({"message": "Bạn đã ứng tuyển rồi!"}, status=400)
        except Task.DoesNotExist:
            return Response({"error": "Không tìm thấy công việc."}, status=404)

class WorkerJobsAPIView(generics.ListAPIView):
    serializer_class = TaskApplicationSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        # ⚡ TỐI ƯU: select_related giảm N+1 (worker, task, task__parent)
        return TaskApplication.objects.select_related(
            'worker', 'task', 'task__parent', 'task__category'
        ).filter(worker=self.request.user).order_by('-applied_at')

class WorkerProfileDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, worker_id):
        # ⚡ TỐI ƯU: dùng select_related('reviewer') + aggregate() thay vì loop
        # Trước: 1 query worker + 1 query reviews + N queries reviewer (N+1)
        # Sau: 1 query worker + 1 query reviews (kèm reviewer) + 1 aggregate
        try:
            worker = User.objects.get(id=worker_id, role='worker')
            # Lấy reviews + reviewer info trong 1 query (select_related)
            reviews = Review.objects.select_related('reviewer').filter(reviewee=worker).order_by('-created_at')[:50]  # limit 50

            # ⚡ Aggregate avg_rating trong DB thay vì load tất cả + tính Python
            from django.db.models import Avg, Count
            stats = Review.objects.filter(reviewee=worker).aggregate(
                avg_rating=Avg('rating'),
                review_count=Count('id')
            )
            avg_rating = round(stats['avg_rating'], 1) if stats['avg_rating'] else 0.0
            review_count = stats['review_count'] or 0

            # Bằng cấp/chứng chỉ lấy từ database (admin đã duyệt/nhập)
            qualifications = worker.qualifications if isinstance(worker.qualifications, list) else []

            # Serialize reviews (đã có reviewer info, không cần query thêm)
            serialized_reviews = []
            for r in reviews:
                serialized_reviews.append({
                    "id": r.id,
                    "rating": r.rating,
                    "comment": r.comment,
                    "reviewer_username": r.reviewer.username,
                    "reviewer_name": f"{r.reviewer.first_name} {r.reviewer.last_name}".strip() or r.reviewer.username,
                    "created_at": r.created_at.strftime('%d/%m/%Y')
                })

            data = {
                "id": worker.id,
                "username": worker.username,
                "first_name": worker.first_name,
                "last_name": worker.last_name,
                "is_verified": worker.is_verified,
                "ai_profile_summary": worker.ai_profile_summary or "Chưa có nhận xét từ AI.",
                "avg_rating": avg_rating,
                "review_count": review_count,
                "qualifications": qualifications,
                "reviews": serialized_reviews,
                "phone_number": worker.phone_number or "",
                "address": worker.address or "",
                "email": worker.email or "",
            }
            return Response(data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "Không tìm thấy hồ sơ Carepartner."}, status=status.HTTP_404_NOT_FOUND)

# --- PHẦN 5: CHATBOT AI (Tích hợp Google Gemini) ---
