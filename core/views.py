from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
import os
import requests
from django.db import models as db_models
from .models import User, Task, TaskApplication, ServiceCategory, Review, CredentialSubmission, Notification, ProfileChangeRequest


class HealthCheckAPIView(APIView):
    """API Health Check — cho keep-alive ping, không cần xác thực."""
    permission_classes = [AllowAny]

    def get(self, request):
        from django.db import connection
        from django.utils import timezone
        try:
            # Test DB connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_ok = True
        except Exception:
            db_ok = False

        return Response({
            "status": "ok" if db_ok else "degraded",
            "timestamp": timezone.now().isoformat(),
            "database": "connected" if db_ok else "error",
            "version": "1.0.0",
        })


class KeepAliveStatsAPIView(APIView):
    """API xem thống kê Keep-Alive Scheduler — chỉ Admin."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from .keepalive_scheduler import get_stats
        return Response(get_stats())


def build_absolute_uri(request, url):
    """Tạo URL tuyệt đối, đảm bảo dùng HTTPS trên Render."""
    if not url:
        return None
    abs_url = request.build_absolute_uri(url)
    # Fix: trên Render, request.build_absolute_uri() sinh ra http:// thay vì https://
    if os.environ.get('RENDER', '') or request.is_secure():
        abs_url = abs_url.replace('http://', 'https://', 1)
    return abs_url

from .serializers import (
    UserSerializer, TaskSerializer, TaskApplicationSerializer, 
    ServiceCategorySerializer, ReviewSerializer
)

def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {'refresh': str(refresh), 'access': str(refresh.access_token)}

def send_expo_push_notification(token, title, body, data=None):
    """
    Gửi push notification qua Expo.
    Tự động config priority + sound + android_channel_id theo loại alert.

    Loại alert được xác định qua data.type:
    - 'device_offline'    → critical_alerts channel, priority=high, iOS sound=critical
    - 'geofence_exit'     → geofence_alerts channel, priority=high, iOS sound=default
    - 'sos_alert'         → sos_alerts channel, priority=high, iOS sound=default
    - 'geofence_enter'    → recovery_alerts channel, priority=default
    - 'device_recovered'  → recovery_alerts channel, priority=default
    - khác (mặc định)     → default channel, priority=default
    """
    if not token:
        return
    headers = {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
    }
    data = data or {}
    alert_type = data.get('type', '')

    # Mapping alert type → Android channel + iOS config
    ALERT_CONFIG = {
        'device_offline': {
            'android_channel_id': 'critical_alerts',
            'priority': 'high',
            'ios': {'sound': 'critical', 'priority': 'high', 'category': 'CRITICAL_ALERT'},
        },
        'geofence_exit': {
            'android_channel_id': 'geofence_alerts',
            'priority': 'high',
            'ios': {'sound': 'default', 'priority': 'high', 'category': 'GEOFENCE_ALERT'},
        },
        'sos_alert': {
            'android_channel_id': 'sos_alerts',
            'priority': 'high',
            'ios': {'sound': 'default', 'priority': 'high', 'category': 'SOS_ALERT'},
        },
        'geofence_enter': {
            'android_channel_id': 'recovery_alerts',
            'priority': 'default',
            'ios': {'sound': 'default', 'priority': 'default'},
        },
        'device_recovered': {
            'android_channel_id': 'recovery_alerts',
            'priority': 'default',
            'ios': {'sound': 'default', 'priority': 'default'},
        },
    }

    payload = {
        'to': token,
        'sound': 'default',
        'title': title,
        'body': body,
        'data': data,
    }

    # Apply alert-specific config
    config = ALERT_CONFIG.get(alert_type)
    if config:
        payload['android_channel_id'] = config['android_channel_id']
        payload['priority'] = config['priority']
        payload['ios'] = config['ios']

    try:
        requests.post('https://exp.host/--/api/v2/push/send', headers=headers, json=payload, timeout=5)
    except Exception as e:
        print(f"Lỗi gửi thông báo push: {e}")

# --- PHẦN 1: TÀI KHOẢN (ONBOARDING) ---
class RegisterAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def create(self, request, *args, **kwargs):
        role = request.data.get('role', 'parent')
        
        # Validate phụ huynh: bắt buộc email + phone
        if role == 'parent':
            email = request.data.get('email', '').strip()
            phone = request.data.get('phone_number', '').strip()
            if not email:
                return Response({'email': ['Phụ huynh phải cung cấp email.']}, status=status.HTTP_400_BAD_REQUEST)
            if not phone:
                return Response({'phone_number': ['Phụ huynh phải cung cấp số điện thoại.']}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate carepartner: bắt buộc ảnh CCCD + selfie + email + phone
        if role == 'worker':
            email = request.data.get('email', '').strip()
            phone = request.data.get('phone_number', '').strip()
            if not email:
                return Response({'email': ['Carepartner phải cung cấp email.']}, status=status.HTTP_400_BAD_REQUEST)
            if not phone:
                return Response({'phone_number': ['Carepartner phải cung cấp số điện thoại.']}, status=status.HTTP_400_BAD_REQUEST)
            if not request.FILES.get('id_card_front'):
                return Response({'id_card_front': ['Ảnh mặt trước CCCD là bắt buộc.']}, status=status.HTTP_400_BAD_REQUEST)
            if not request.FILES.get('id_card_back'):
                return Response({'id_card_back': ['Ảnh mặt sau CCCD là bắt buộc.']}, status=status.HTTP_400_BAD_REQUEST)
            if not request.FILES.get('selfie_photo'):
                return Response({'selfie_photo': ['Ảnh chân dung là bắt buộc.']}, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save(role=role)
        
        # Đặt is_approved theo role (role='read_only' trong serializer nên phải set qua save())
        if role == 'parent':
            user.is_approved = True
        else:
            user.is_approved = False
        user.save()
        
        if role == 'worker':
            return Response({
                'message': 'Đăng ký thành công! Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng đợi thông báo.',
                'status': 'pending_approval'
            }, status=status.HTTP_201_CREATED)
        else:
            return Response({
                'message': 'Đăng ký thành công!',
                'status': 'approved'
            }, status=status.HTTP_201_CREATED)

class LoginAPIView(APIView):
    permission_classes = [AllowAny]
    # ⚡ BUG-005 fix: Rate limit login — 5 attempts/phút per IP (chống brute-force)
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')
        
        # Check if user exists and is locked BEFORE authenticate()
        # (Django's authenticate() returns None for inactive users)
        try:
            existing_user = User.objects.get(username=username)
            if not existing_user.is_active:
                # Verify password first to confirm it's really the account owner
                if existing_user.check_password(password):
                    return Response({
                        "error": "Tài khoản của bạn đã bị khoá. Vui lòng liên hệ Admin.",
                        "status": "account_locked"
                    }, status=status.HTTP_403_FORBIDDEN)
        except User.DoesNotExist:
            pass
        
        user = authenticate(username=username, password=password)
        if user:
            # Carepartner phải được admin duyệt mới đăng nhập được
            if user.role == 'worker' and not user.is_approved:
                return Response({
                    "error": "Tài khoản của bạn đang chờ Admin xét duyệt. Vui lòng đợi.",
                    "status": "pending_approval"
                }, status=status.HTTP_403_FORBIDDEN)
            return Response({
                "message": "Đăng nhập thành công!",
                "tokens": get_tokens_for_user(user),
                "user_id": user.id, "username": user.username, "role": user.role,
                "is_staff": user.is_staff,
                "is_approved": user.is_approved,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "first_login": user.first_login,
            }, status=status.HTTP_200_OK)
        return Response({"error": "Sai tài khoản hoặc mật khẩu"}, status=status.HTTP_401_UNAUTHORIZED)

class UserProfileAPIView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data) # Phục vụ Màn hình 11: Hồ sơ

    def patch(self, request):
        # Ngăn chặn role escalation — loại role, is_staff, is_superuser khỏi data
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        for forbidden_field in ['role', 'is_staff', 'is_superuser', 'is_approved', 'is_verified', 'qualifications', 'auth_provider', 'avatar_url']:
            data.pop(forbidden_field, None)
        
        # Nếu có password mới → hash đúng cách
        password = data.pop('password', None)
        
        serializer = UserSerializer(request.user, data=data, partial=True)
        if serializer.is_valid():
            user = serializer.save()
            # Hash mật khẩu mới nếu có
            if password:
                user.set_password(password)
                user.save()
            return Response(UserSerializer(user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# --- PHẦN 2: CHUNG CHO CẢ PHỤ HUYNH & SINH VIÊN ---
class TaskListCreateAPIView(generics.ListCreateAPIView):
    # ⚡ TỐI ƯU: select_related → giảm N+1 queries (parent + category load chung 1 query)
    queryset = Task.objects.select_related('parent', 'category').all().order_by('-created_at')
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        # Chỉ phụ huynh mới được đăng việc
        if self.request.user.role != 'parent':
            raise drf_serializers.ValidationError({'detail': 'Chỉ phụ huynh mới được đăng việc.'})
        serializer.save(parent=self.request.user) # Phục vụ Màn 4: Phụ huynh đăng việc


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
         return Task.objects.select_related('parent', 'category').filter(parent=self.request.user).order_by('-created_at')

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

class ReviewCreateAPIView(generics.CreateAPIView):
    queryset = Review.objects.all()
    serializer_class = ReviewSerializer
    permission_classes = [IsAuthenticated]
    def perform_create(self, serializer):
        # Phục vụ Màn 7: Đánh giá
        task_id = self.request.data.get('task')
        # Validate: chỉ review task đã hoàn thành
        if task_id:
            try:
                task_id = int(task_id)
            except (TypeError, ValueError):
                raise drf_serializers.ValidationError({'task': 'ID công việc không hợp lệ.'})
            try:
                task = Task.objects.get(id=task_id)
                if task.status != 'completed':
                    raise drf_serializers.ValidationError({'task': 'Chỉ đánh giá công việc đã hoàn thành.'})
                if task.parent != self.request.user:
                    raise drf_serializers.ValidationError({'task': 'Bạn chỉ được đánh giá công việc của mình.'})
                # Kiểm tra đã review chưa
                if hasattr(task, 'review'):
                    raise drf_serializers.ValidationError({'task': 'Công việc này đã được đánh giá.'})
                # Tự động xác định reviewee là worker được accept
                accepted_app = TaskApplication.objects.filter(task=task, status='accepted').first()
                if accepted_app:
                    serializer.save(reviewer=self.request.user, reviewee=accepted_app.worker)
                else:
                    raise drf_serializers.ValidationError({'task': 'Không tìm thấy người thực hiện công việc này.'})
            except Task.DoesNotExist:
                raise drf_serializers.ValidationError({'task': 'Không tìm thấy công việc.'})
        else:
            raise drf_serializers.ValidationError({'task': 'Vui lòng chọn công việc cần đánh giá.'})

# --- PHẦN 4: LUỒNG DÀNH CHO SINH VIÊN ---
class ApplyTaskAPIView(APIView):
    permission_classes = [IsAuthenticated]
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
class ChatbotAPIView(APIView):
    permission_classes = [IsAuthenticated]

    # Prompt hệ thống dạy Gemini cách hoạt động trong context của Educarelink
    SYSTEM_PROMPT = """
Bạn là trợ lý AI của ứng dụng Educarelink — nền tảng kết nối phụ huynh với sinh viên/người tìm việc.
Nhiệm vụ của bạn là giúp PHỤ HUYNH đăng việc nhanh chóng thông qua hội thoại tự nhiên.

CÁC DANH MỤC DỊCH VỤ (dùng ID tương ứng):
1 = Gia sư (dạy kèm, học thêm, ôn thi)
2 = Đón trẻ (đón con, đưa đón học sinh)
3 = Dọn dẹp nhà cửa (lau dọn, vệ sinh)
4 = Trông trẻ (giữ trẻ, babysitter)
5 = Mua sắm hộ (đi chợ, mua đồ)
6 = Nấu ăn (nấu bữa cho gia đình)
7 = Hỗ trợ AI (công nghệ AI hỗ trợ học tập)
8 = Khác (chuyển đồ, thú cưng, kỹ năng sống, v.v.)

QUY TẮC XỬ LÝ:
- Nếu người dùng muốn ĐĂNG VIỆC hoặc TÌM NGƯỜI: phân tích và trả về JSON trong thẻ <TASK_JSON>...</TASK_JSON>
- Nếu thiếu thông tin bắt buộc (địa điểm, thời gian, giá): hỏi lại một cách thân thiện
- Nếu chỉ hỏi thông tin thông thường: trả lời bình thường, KHÔNG tạo JSON
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện và ngắn gọn
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng, tránh hỏi lại thông tin đã cung cấp

FORMAT JSON khi tạo task (bắt buộc đủ các field):
<TASK_JSON>
{
  "category": <số 1-8>,
  "title": "<tiêu đề ngắn gọn>",
  "description": "<mô tả chi tiết yêu cầu>",
  "location": "<địa điểm cụ thể>",
  "scheduled_time": "<YYYY-MM-DDTHH:MM:00+07:00>",
  "price": <số tiền VND, không có dấu chấm>
}
</TASK_JSON>

Ví dụ: Nếu người dùng nói "Tôi cần gia sư Toán lớp 8 vào tối thứ 3 tuần này ở Quận 1, trả 200k/buổi"
→ Trả lời xác nhận lại thông tin + JSON hợp lệ bên trong thẻ <TASK_JSON>.
"""

    def _build_contents(self, user_message, chat_history=None):
        """Xây dựng danh sách messages cho Gemini API với lịch sử hội thoại"""
        contents = []

        # Thêm lịch sử hội thoại nếu có
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({
                        'role': role,
                        'parts': [{'text': text}]
                    })

        # Thêm tin nhắn hiện tại
        contents.append({
            'role': 'user',
            'parts': [{'text': user_message}]
        })

        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])  # Nhận lịch sử hội thoại từ frontend

        if not user_message:
            return Response({"error": "Tin nhắn không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')

        # Nếu chưa cấu hình API key → fallback thân thiện
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": (
                    f"🤖 Tôi nhận được tin nhắn của bạn: \"{user_message}\"\n\n"
                    "⚠️ Tính năng AI chưa được kích hoạt. Vui lòng liên hệ admin để cấu hình Gemini API key.\n\n"
                    "Trong lúc đó, bạn có thể đăng việc thủ công qua nút 'Đăng việc' trên trang chủ! 👆"
                ),
                "type": "info"
            })

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            # ⚡ Dùng pooled client (singleton, tránh init 200ms mỗi call)
            client = get_pooled_gemini_client()
            if client is None:
                # Fallback: init trực tiếp nếu pool chưa sẵn sàng
                client = genai.Client(api_key=gemini_key)

            # Xây dựng nội dung với lịch sử hội thoại
            contents = self._build_contents(user_message, chat_history)

            # ⚡ Dùng fallback chain — tự thử các model nếu 1 model bị deprecated
            gemini_response, model_used = generate_content_with_fallback(
                client,
                contents=contents,
                system_instruction=self.SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=2048,
            )
            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời câu hỏi này do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            # Kiểm tra xem AI có trả về JSON để tạo task không
            task_json_match = re.search(r'<TASK_JSON>(.*?)</TASK_JSON>', ai_text, re.DOTALL)

            if task_json_match and request.user.role == 'parent':
                # Trích xuất JSON và tự động tạo task
                raw_json = task_json_match.group(1).strip()
                task_data = json.loads(raw_json)

                # Validate bắt buộc
                required = ['category', 'title', 'description', 'location', 'scheduled_time', 'price']
                missing = [f for f in required if not task_data.get(f)]
                if missing:
                    # Thiếu field → hỏi lại
                    clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                    return Response({"response": clean_response, "type": "clarification"})

                # Lấy ServiceCategory
                try:
                    category = ServiceCategory.objects.get(id=int(task_data['category']))
                except ServiceCategory.DoesNotExist:
                    category = ServiceCategory.objects.first()

                # Tạo Task trong database
                from django.utils.dateparse import parse_datetime
                scheduled = parse_datetime(task_data['scheduled_time'])
                if not scheduled:
                    raise drf_serializers.ValidationError({'scheduled_time': 'Định dạng thời gian không hợp lệ từ AI.'})
                
                try:
                    price_val = int(str(task_data['price']).replace('.', '').replace(',', '').replace('đ', '').replace('Đ', '').replace('VNĐ', '').replace('vnd', '').strip())
                except (ValueError, TypeError):
                    raise drf_serializers.ValidationError({'price': 'Định dạng giá không hợp lệ từ AI.'})

                new_task = Task.objects.create(
                    parent=request.user,
                    category=category,
                    title=task_data['title'],
                    description=task_data['description'],
                    location=task_data['location'],
                    scheduled_time=scheduled,
                    price=price_val,
                    status='open',
                    ai_generated_from_prompt=user_message,  # Lưu lại câu chat gốc
                )

                # Trả về phản hồi sạch (không có JSON thô) + thông tin task đã tạo
                clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                return Response({
                    "response": clean_response + f"\n\n✅ Đã tạo công việc thành công!",
                    "type": "task_created",
                    "task": {
                        "id": new_task.id,
                        "title": new_task.title,
                        "category": new_task.category.id if new_task.category else None,
                        "description": new_task.description,
                        "price": str(new_task.price),
                        "location": new_task.location,
                        "scheduled_time": new_task.scheduled_time.isoformat(),
                        "status": new_task.status,
                    }
                })
            else:
                # Phản hồi hội thoại thông thường (không tạo task)
                clean_response = re.sub(r'<TASK_JSON>.*?</TASK_JSON>', '', ai_text, flags=re.DOTALL).strip()
                return Response({
                    "response": clean_response,
                    "type": "message"
                })

        except Exception as e:
            # Lỗi kết nối Gemini — trả về thân thiện
            error_msg = str(e)
            import logging
            logger = logging.getLogger('educarelink.chatbot')
            logger.error(f'[Chatbot] Gemini error: {error_msg}', exc_info=True)

            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper() or 'permission_denied' in error_msg.lower():
                detail = "API key Gemini không hợp lệ. Vui lòng kiểm tra lại trong file .env."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini miễn phí trong hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH_DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper() or '503' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải (High Demand). Vui lòng thử lại sau vài giây!"
            elif 'deprecated' in error_msg.lower() or 'GeminiAllModelsDeprecated' in type(e).__name__:
                detail = (
                    "⚙️ Hệ thống AI đang bảo trì (Google đã cập nhật model). "
                    "Admin đang cập nhật — vui lòng thử lại sau ít phút."
                )
            elif 'NOT_FOUND' in error_msg.upper() or 'MODEL' in error_msg.upper():
                detail = (
                    "⚙️ Model AI đang được cập nhật. "
                    "Vui lòng thử lại sau ít phút hoặc liên hệ admin."
                )
            else:
                detail = f"Lỗi kết nối AI: {error_msg[:150]}"

            return Response({
                "response": f"❌ {detail}",
                "type": "error"
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# --- PHẦN 6: ADMIN QUẢN LÝ DUYỆT TÀI KHOẢN CAREPARTNER ---
class AdminPendingWorkersAPIView(APIView):
    """API lấy danh sách Carepartner chờ duyệt (dành cho trang Admin)"""
    permission_classes = [IsAdminUser]  # Yêu cầu quyền admin (is_staff=True)

    def get(self, request):
        pending = User.objects.filter(role='worker', is_approved=False).order_by('-date_joined')
        data = []
        for u in pending:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'id_card_front': build_absolute_uri(request,u.id_card_front.url) if u.id_card_front else None,
                'id_card_back': build_absolute_uri(request,u.id_card_back.url) if u.id_card_back else None,
                'selfie_photo': build_absolute_uri(request,u.selfie_photo.url) if u.selfie_photo else None,
                'certificate_photo': build_absolute_uri(request,u.certificate_photo.url) if u.certificate_photo else None,
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)


class AdminApproveWorkerAPIView(APIView):
    """API duyệt hoặc từ chối tài khoản Carepartner"""
    permission_classes = [IsAdminUser]  # Yêu cầu quyền admin (is_staff=True)

    def post(self, request, user_id):
        action = request.data.get('action')  # 'approve' hoặc 'reject'
        qualifications = request.data.get('qualifications', []) # Array of strings

        try:
            worker = User.objects.get(id=user_id, role='worker')
            if action == 'approve':
                worker.is_approved = True
                worker.is_verified = True
                if isinstance(qualifications, list) and len(qualifications) > 0:
                    worker.qualifications = qualifications
                worker.save()
                return Response({'message': f'Đã duyệt tài khoản {worker.username}.'})
            elif action == 'reject':
                # Soft-delete: Đánh dấu là rejected thay vì xoá hẳn
                worker.is_approved = False
                worker.is_active = False  # Vô hiệu hoá đăng nhập
                worker.save()
                return Response({'message': f'Đã từ chối tài khoản {worker.username}.'})
            elif action == 'update_qualifications':
                if isinstance(qualifications, list):
                    worker.qualifications = qualifications
                    worker.save()
                    return Response({'message': f'Đã cập nhật bằng cấp cho {worker.username}.'})
                return Response({'error': 'Danh sách bằng cấp không hợp lệ.'}, status=400)
            else:
                return Response({'error': 'Action không hợp lệ.'}, status=400)
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminToggleUserActiveAPIView(APIView):
    """API khoá/mở tài khoản người dùng (Admin)"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            # Không cho phép khoá chính mình hoặc superuser
            if user.id == request.user.id:
                return Response({'error': 'Không thể khoá chính tài khoản của bạn.'}, status=400)
            if user.is_superuser:
                return Response({'error': 'Không thể khoá tài khoản Superuser.'}, status=400)

            user.is_active = not user.is_active
            user.save(update_fields=['is_active'])
            status_text = 'mở khoá' if user.is_active else 'khoá'
            return Response({
                'message': f'Đã {status_text} tài khoản {user.username}.',
                'is_active': user.is_active,
            })
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminRevokeCarepartnerAPIView(APIView):
    """API tước quyền Carepartner — đổi role từ worker về parent"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            if user.role != 'worker':
                return Response({'error': 'Tài khoản này không phải là Carepartner.'}, status=400)

            user.role = 'parent'
            user.is_approved = False
            user.is_verified = False
            user.qualifications = []
            user.save(update_fields=['role', 'is_approved', 'is_verified', 'qualifications'])
            return Response({
                'message': f'Đã tước quyền Carepartner của {user.username}. Tài khoản đã chuyển về vai trò Phụ huynh.',
            })
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy tài khoản.'}, status=404)


class AdminAllUsersAPIView(APIView):
    """API lấy tất cả người dùng (Admin) — hỗ trợ khoá/mở tài khoản"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        users = User.objects.filter(is_staff=False, is_superuser=False).order_by('-date_joined')
        data = []
        for u in users:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'role': u.role,
                'auth_provider': u.auth_provider,
                'avatar_url': u.avatar_url or '',
                'is_active': u.is_active,
                'is_approved': u.is_approved,
                'is_verified': u.is_verified,
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)


class AdminAllWorkersAPIView(APIView):
    """API lấy tất cả Carepartner (đã duyệt + chờ duyệt)"""
    permission_classes = [IsAdminUser]  # Yêu cầu quyền admin (is_staff=True)

    def get(self, request):
        workers = User.objects.filter(role='worker').order_by('-date_joined')
        data = []
        for u in workers:
            data.append({
                'id': u.id,
                'username': u.username,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'email': u.email,
                'phone_number': u.phone_number,
                'is_approved': u.is_approved,
                'date_joined': u.date_joined.strftime('%d/%m/%Y %H:%M'),
                'id_card_front': build_absolute_uri(request,u.id_card_front.url) if u.id_card_front else None,
                'id_card_back': build_absolute_uri(request,u.id_card_back.url) if u.id_card_back else None,
                'selfie_photo': build_absolute_uri(request,u.selfie_photo.url) if u.selfie_photo else None,
                'certificate_photo': build_absolute_uri(request,u.certificate_photo.url) if u.certificate_photo else None,
                'qualifications': u.qualifications if isinstance(u.qualifications, list) else [],
            })
        return Response(data)

class AdminSeedDemoDataAPIView(APIView):
    """API tạo dữ liệu mẫu cho ban giám khảo — Chỉ Admin"""
    permission_classes = [IsAdminUser]

    def post(self, request):
        from django.core.management import call_command
        from io import StringIO
        out = StringIO()
        try:
            call_command('seed_demo_data', stdout=out)
            output = out.getvalue()
            return Response({
                'message': 'Đã tạo dữ liệu mẫu thành công!',
                'details': output[-2000:] if len(output) > 2000 else output,
            })
        except Exception as e:
            import logging
            logger = logging.getLogger('educarelink.seed')
            logger.exception(f'[SeedDemoData] Error: {e}')
            return Response({
                'error': f'Lỗi khi tạo dữ liệu mẫu: {str(e)[:200]}',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CompleteOnboardingAPIView(APIView):
    """API đánh dấu đã hoàn thành hướng dẫn sử dụng lần đầu"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.first_login:
            return Response({'message': 'Hướng dẫn đã được hoàn thành trước đó.'}, status=status.HTTP_200_OK)
        user.first_login = False
        user.save(update_fields=['first_login'])
        return Response({'message': 'Đã hoàn thành hướng dẫn sử dụng!'}, status=status.HTTP_200_OK)


# --- PHẦN 7: CAREPARTNER GỬI BẰNG CẤP CHO ADMIN DUYỆT ---
class WorkerSubmitCredentialAPIView(APIView):
    """API cho Carepartner gửi ảnh minh chứng + mô tả bằng cấp cho Admin duyệt"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới được gửi bằng cấp.'}, status=status.HTTP_403_FORBIDDEN)

        certificate_photo = request.FILES.get('certificate_photo')
        description = request.data.get('description', '').strip()

        if not certificate_photo and not description:
            return Response({'error': 'Vui lòng tải lên ảnh hoặc viết mô tả về bằng cấp.'}, status=status.HTTP_400_BAD_REQUEST)

        submission = CredentialSubmission.objects.create(
            worker=request.user,
            certificate_photo=certificate_photo if certificate_photo else None,
            description=description if description else None,
            status='pending'
        )

        return Response({
            'message': 'Đã gửi bằng cấp thành công! Vui lòng đợi Admin duyệt.',
            'submission': {
                'id': submission.id,
                'certificate_photo': build_absolute_uri(request, submission.certificate_photo.url) if submission.certificate_photo else None,
                'description': submission.description,
                'status': submission.status,
                'created_at': submission.created_at.strftime('%d/%m/%Y %H:%M'),
            }
        }, status=status.HTTP_201_CREATED)

    def get(self, request):
        """Lấy danh sách bằng cấp đã gửi của Carepartner hiện tại"""
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới có danh sách bằng cấp.'}, status=status.HTTP_403_FORBIDDEN)

        submissions = CredentialSubmission.objects.filter(worker=request.user).order_by('-created_at')
        data = []
        for s in submissions:
            data.append({
                'id': s.id,
                'certificate_photo': build_absolute_uri(request, s.certificate_photo.url) if s.certificate_photo else None,
                'description': s.description,
                'status': s.status,
                'status_display': s.get_status_display(),
                'admin_review': s.admin_review,
                'reviewed_at': s.reviewed_at.strftime('%d/%m/%Y %H:%M') if s.reviewed_at else None,
                'created_at': s.created_at.strftime('%d/%m/%Y %H:%M'),
            })
        return Response(data)


# --- PHẦN 8: ADMIN DUYỆT BẰNG CẤP VÀ GỬI THÔNG BÁO ---
class AdminCredentialSubmissionsAPIView(APIView):
    """API lấy danh sách bằng cấp chờ duyệt (Admin)"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get('status', 'pending')
        if status_filter == 'all':
            submissions = CredentialSubmission.objects.all().order_by('-created_at')
        else:
            submissions = CredentialSubmission.objects.filter(status=status_filter).order_by('-created_at')

        data = []
        for s in submissions:
            data.append({
                'id': s.id,
                'worker_id': s.worker.id,
                'worker_username': s.worker.username,
                'worker_name': f"{s.worker.first_name} {s.worker.last_name}".strip() or s.worker.username,
                'certificate_photo': build_absolute_uri(request, s.certificate_photo.url) if s.certificate_photo else None,
                'description': s.description,
                'status': s.status,
                'status_display': s.get_status_display(),
                'admin_review': s.admin_review,
                'reviewed_at': s.reviewed_at.strftime('%d/%m/%Y %H:%M') if s.reviewed_at else None,
                'created_at': s.created_at.strftime('%d/%m/%Y %H:%M'),
            })
        return Response(data)


class AdminReviewCredentialAPIView(APIView):
    """API cho Admin duyệt/từ chối + viết đánh giá bằng cấp cho Carepartner"""
    permission_classes = [IsAdminUser]

    def post(self, request, submission_id):
        try:
            submission = CredentialSubmission.objects.get(id=submission_id)
        except CredentialSubmission.DoesNotExist:
            return Response({'error': 'Không tìm thấy yêu cầu gửi bằng cấp.'}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')  # 'approve' hoặc 'reject'
        admin_review = request.data.get('admin_review', '').strip()  # Admin viết đánh giá
        qualifications_update = request.data.get('qualifications', [])  # Cập nhật bằng cấp cho user

        from django.utils import timezone

        if action == 'approve':
            submission.status = 'approved'
            submission.admin_review = admin_review if admin_review else 'Bằng cấp đã được xác nhận bởi Admin.'
            submission.reviewed_at = timezone.now()
            submission.save()

            worker = submission.worker
            is_upgrade = '[NÂNG CẤP]' in (submission.description or '')

            if is_upgrade:
                # Phụ huynh nâng cấp thành Carepartner → đổi role + duyệt
                worker.role = 'worker'
                worker.is_approved = True
                worker.is_verified = True
                worker.save(update_fields=['role', 'is_approved', 'is_verified'])
                logger.info(f"[Upgrade] {worker.username} upgraded to Carepartner by admin")
            else:
                # Carepartner bình thường gửi bằng cấp
                if not worker.is_verified:
                    worker.is_verified = True
                    worker.save(update_fields=['is_verified'])

            # Cập nhật qualifications cho worker nếu admin có nhập
            if isinstance(qualifications_update, list) and len(qualifications_update) > 0:
                existing_quals = worker.qualifications if isinstance(worker.qualifications, list) else []
                for q in qualifications_update:
                    if q and q not in existing_quals:
                        existing_quals.append(q)
                worker.qualifications = existing_quals
                worker.save(update_fields=['qualifications'])

            # Gửi thông báo
            if is_upgrade:
                Notification.objects.create(
                    recipient=worker,
                    title='Đã được duyệt làm Carepartner!',
                    message=f'Chúc mừng! Admin đã duyệt hồ sơ nâng cấp của bạn. Bạn nay đã là Carepartner. {submission.admin_review}'
                )
                if worker.expo_push_token:
                    send_expo_push_notification(
                        token=worker.expo_push_token,
                        title='Đã được duyệt làm Carepartner!',
                        body='Admin đã duyệt hồ sơ nâng cấp của bạn.',
                        data={'type': 'upgrade_approved'}
                    )
            else:
                Notification.objects.create(
                    recipient=worker,
                    title='Bằng cấp đã được duyệt!',
                    message=f'Admin đã duyệt bằng cấp của bạn. {submission.admin_review}'
                )
                if worker.expo_push_token:
                    send_expo_push_notification(
                        token=worker.expo_push_token,
                        title='Bằng cấp đã được duyệt!',
                        body=f'Admin đã duyệt bằng cấp của bạn.',
                        data={'type': 'credential_approved'}
                    )

            return Response({'message': f'Đã duyệt bằng cấp cho {worker.username}.'})

        elif action == 'reject':
            submission.status = 'rejected'
            is_upgrade = '[NÂNG CẤP]' in (submission.description or '')
            submission.admin_review = admin_review if admin_review else ('Hồ sơ nâng cấp không đạt yêu cầu.' if is_upgrade else 'Bằng cấp không đạt yêu cầu.')
            submission.reviewed_at = timezone.now()
            submission.save()

            # Gửi thông báo cho user
            if is_upgrade:
                Notification.objects.create(
                    recipient=submission.worker,
                    title='Yêu cầu nâng cấp bị từ chối',
                    message=f'Admin đã từ chối hồ sơ nâng cấp Carepartner của bạn. Lý do: {submission.admin_review}'
                )
                if submission.worker.expo_push_token:
                    send_expo_push_notification(
                        token=submission.worker.expo_push_token,
                        title='Yêu cầu nâng cấp bị từ chối',
                        body='Admin đã từ chối hồ sơ nâng cấp của bạn.',
                        data={'type': 'upgrade_rejected'}
                    )
            else:
                Notification.objects.create(
                    recipient=submission.worker,
                    title='Bằng cấp bị từ chối',
                    message=f'Admin đã từ chối bằng cấp của bạn. Lý do: {submission.admin_review}'
                )
                if submission.worker.expo_push_token:
                    send_expo_push_notification(
                        token=submission.worker.expo_push_token,
                        title='Bằng cấp bị từ chối',
                        body=f'Admin đã từ chối bằng cấp của bạn.',
                        data={'type': 'credential_rejected'}
                    )

            return Response({'message': f'Đã từ chối bằng cấp của {submission.worker.username}.'})

        else:
            return Response({'error': 'Action không hợp lệ. Dùng approve hoặc reject.'}, status=status.HTTP_400_BAD_REQUEST)


class AdminSendNotificationAPIView(APIView):
    """API cho Admin gửi thông báo cho 1 Carepartner hoặc tất cả"""
    permission_classes = [IsAdminUser]

    def post(self, request):
        title = request.data.get('title', '').strip()
        message = request.data.get('message', '').strip()
        recipient_id = request.data.get('recipient_id')  # Null = gửi cho tất cả worker
        send_to_all = request.data.get('send_to_all', False)

        if not title or not message:
            return Response({'error': 'Tiêu đề và nội dung thông báo là bắt buộc.'}, status=status.HTTP_400_BAD_REQUEST)

        if send_to_all:
            # Gửi cho tất cả Carepartner (đã duyệt)
            workers = User.objects.filter(role='worker', is_approved=True, is_active=True)
            notifications = []
            for worker in workers:
                notifications.append(Notification(
                    recipient=worker,
                    title=title,
                    message=message
                ))
                # Push notification
                if worker.expo_push_token:
                    send_expo_push_notification(
                        token=worker.expo_push_token,
                        title=title,
                        body=message,
                        data={'type': 'admin_notification'}
                    )
            Notification.objects.bulk_create(notifications)
            return Response({'message': f'Đã gửi thông báo cho {len(notifications)} Carepartner.'})
        else:
            # Gửi cho 1 Carepartner cụ thể
            if not recipient_id:
                return Response({'error': 'Cần chỉ định recipient_id hoặc send_to_all=true.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                worker = User.objects.get(id=recipient_id, role='worker')
            except User.DoesNotExist:
                return Response({'error': 'Không tìm thấy Carepartner.'}, status=status.HTTP_404_NOT_FOUND)

            notification = Notification.objects.create(
                recipient=worker,
                title=title,
                message=message
            )

            # Push notification
            if worker.expo_push_token:
                send_expo_push_notification(
                    token=worker.expo_push_token,
                    title=title,
                    body=message,
                    data={'type': 'admin_notification'}
                )

            return Response({'message': f'Đã gửi thông báo cho {worker.username}.'})


class UserNotificationsAPIView(APIView):
    """API lấy danh sách thông báo của người dùng hiện tại"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # Lấy thông báo cá nhân + thông báo chung (recipient=null)
        notifications = Notification.objects.filter(
            db_models.Q(recipient=user) | db_models.Q(recipient=None)
        ).order_by('-created_at')

        data = []
        for n in notifications:
            if n.recipient_id is not None:
                # Thông báo cá nhân: dùng is_read
                is_read = n.is_read
            else:
                # Thông báo chung: kiểm tra user ID trong read_by
                read_by = n.read_by if isinstance(n.read_by, list) else []
                is_read = user.id in read_by

            data.append({
                'id': n.id,
                'title': n.title,
                'message': n.message,
                'is_read': is_read,
                'is_broadcast': n.recipient is None,
                'created_at': n.created_at.strftime('%d/%m/%Y %H:%M'),
            })

        # KHÔNG tự động đánh dấu đã đọc — chỉ đánh dấu khi gọi endpoint mark-read
        return Response(data)


class UnreadNotificationCountAPIView(APIView):
    """API đếm số thông báo chưa đọc"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        # Đếm thông báo cá nhân chưa đọc
        personal_unread = Notification.objects.filter(recipient=user, is_read=False).count()

        # Đếm thông báo chung chưa đọc (recipient=null và user ID chưa trong read_by)
        broadcast_notifications = Notification.objects.filter(recipient=None)
        broadcast_unread = 0
        for n in broadcast_notifications:
            read_by = n.read_by if isinstance(n.read_by, list) else []
            if user.id not in read_by:
                broadcast_unread += 1

        return Response({'unread_count': personal_unread + broadcast_unread})


class MarkNotificationsReadAPIView(APIView):
    """API đánh dấu thông báo đã đọc — gọi riêng, không tự động khi GET"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        notification_ids = request.data.get('notification_ids', None)  # List of IDs, or None = mark all

        if notification_ids is not None:
            # Đánh dấu các thông báo cụ thể đã đọc
            notifications = Notification.objects.filter(
                db_models.Q(recipient=user) | db_models.Q(recipient=None),
                id__in=notification_ids
            )
        else:
            # Đánh dấu TẤT CẢ thông báo chưa đọc thành đã đọc
            notifications = Notification.objects.filter(
                db_models.Q(recipient=user) | db_models.Q(recipient=None)
            )

        marked_count = 0
        for n in notifications:
            if n.recipient_id is not None and not n.is_read:
                n.is_read = True
                n.save(update_fields=['is_read'])
                marked_count += 1
            elif n.recipient_id is None:
                read_by = n.read_by if isinstance(n.read_by, list) else []
                if user.id not in read_by:
                    read_by.append(user.id)
                    n.read_by = read_by
                    n.save(update_fields=['read_by'])
                    marked_count += 1

        return Response({'message': f'Đã đánh dấu {marked_count} thông báo là đã đọc.', 'marked_count': marked_count})


# --- PHẦN 9: YÊU CẦU THAY ĐỔI HỒ SƠ (CAREPARTNER GỬI, ADMIN DUYỆT) ---
class WorkerProfileChangeRequestAPIView(APIView):
    """API cho Carepartner gửi yêu cầu thay đổi hồ sơ cá nhân — Admin sẽ duyệt"""
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    ALLOWED_FIELDS = ['first_name', 'last_name', 'phone_number', 'address', 'email']

    def post(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới được yêu cầu thay đổi hồ sơ.'}, status=status.HTTP_403_FORBIDDEN)

        proposed_changes = {}
        for field in self.ALLOWED_FIELDS:
            if field in request.data:
                value = request.data.get(field, '').strip() if isinstance(request.data.get(field), str) else request.data.get(field)
                # Chỉ lưu nếu thực sự thay đổi
                current_value = getattr(request.user, field, '') or ''
                if str(value) != str(current_value):
                    proposed_changes[field] = value

        if not proposed_changes:
            return Response({'error': 'Không có thay đổi nào để gửi.'}, status=status.HTTP_400_BAD_REQUEST)

        change_request = ProfileChangeRequest.objects.create(
            worker=request.user,
            proposed_changes=proposed_changes,
            status='pending'
        )

        # Gửi thông báo cho Admin (tạo notification cho tất cả admin/staff)
        admin_users = User.objects.filter(is_staff=True, is_active=True)
        for admin in admin_users:
            Notification.objects.create(
                recipient=admin,
                title='Yêu cầu thay đổi hồ sơ',
                message=f'Carepartner {request.user.username} ({request.user.first_name} {request.user.last_name}) yêu cầu thay đổi hồ sơ cá nhân. Vui lòng kiểm tra và duyệt.'
            )

        return Response({
            'message': 'Đã gửi yêu cầu thay đổi hồ sơ! Vui lòng đợi Admin duyệt.',
            'request': {
                'id': change_request.id,
                'proposed_changes': change_request.proposed_changes,
                'status': change_request.status,
                'created_at': change_request.created_at.strftime('%d/%m/%Y %H:%M'),
            }
        }, status=status.HTTP_201_CREATED)

    def get(self, request):
        """Lấy danh sách yêu cầu thay đổi hồ sơ của Carepartner hiện tại"""
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới có danh sách yêu cầu.'}, status=status.HTTP_403_FORBIDDEN)

        requests_list = ProfileChangeRequest.objects.filter(worker=request.user).order_by('-created_at')
        data = []
        for r in requests_list:
            data.append({
                'id': r.id,
                'proposed_changes': r.proposed_changes,
                'status': r.status,
                'status_display': r.get_status_display(),
                'admin_review': r.admin_review,
                'reviewed_at': r.reviewed_at.strftime('%d/%m/%Y %H:%M') if r.reviewed_at else None,
                'created_at': r.created_at.strftime('%d/%m/%Y %H:%M'),
            })
        return Response(data)


class AdminProfileChangeRequestsAPIView(APIView):
    """API cho Admin xem danh sách yêu cầu thay đổi hồ sơ"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get('status', 'pending')
        if status_filter == 'all':
            requests_list = ProfileChangeRequest.objects.all().order_by('-created_at')
        else:
            requests_list = ProfileChangeRequest.objects.filter(status=status_filter).order_by('-created_at')

        data = []
        for r in requests_list:
            data.append({
                'id': r.id,
                'worker_id': r.worker.id,
                'worker_username': r.worker.username,
                'worker_name': f"{r.worker.first_name} {r.worker.last_name}".strip() or r.worker.username,
                'proposed_changes': r.proposed_changes,
                'status': r.status,
                'status_display': r.get_status_display(),
                'admin_review': r.admin_review,
                'reviewed_at': r.reviewed_at.strftime('%d/%m/%Y %H:%M') if r.reviewed_at else None,
                'created_at': r.created_at.strftime('%d/%m/%Y %H:%M'),
            })
        return Response(data)


class AdminReviewProfileChangeRequestAPIView(APIView):
    """API cho Admin duyệt/từ chối yêu cầu thay đổi hồ sơ"""
    permission_classes = [IsAdminUser]

    def post(self, request, request_id):
        from django.utils import timezone

        try:
            change_request = ProfileChangeRequest.objects.get(id=request_id)
        except ProfileChangeRequest.DoesNotExist:
            return Response({'error': 'Không tìm thấy yêu cầu thay đổi hồ sơ.'}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')  # 'approve' hoặc 'reject'
        admin_review = request.data.get('admin_review', '').strip()

        if action == 'approve':
            change_request.status = 'approved'
            change_request.admin_review = admin_review if admin_review else 'Yêu cầu thay đổi hồ sơ đã được Admin duyệt.'
            change_request.reviewed_at = timezone.now()
            change_request.save()

            # Áp dụng thay đổi vào hồ sơ của worker
            worker = change_request.worker
            allowed_fields = ['first_name', 'last_name', 'phone_number', 'address', 'email']
            for field, value in change_request.proposed_changes.items():
                if field in allowed_fields:
                    # Kiểm tra trùng email
                    if field == 'email' and value:
                        existing = User.objects.filter(email=value).exclude(id=worker.id)
                        if existing.exists():
                            return Response({'error': f'Email "{value}" đã được sử dụng bởi tài khoản khác.'}, status=status.HTTP_400_BAD_REQUEST)
                    setattr(worker, field, value)
            worker.save(update_fields=[f for f in change_request.proposed_changes.keys() if f in allowed_fields])

            # Gửi thông báo cho worker
            Notification.objects.create(
                recipient=worker,
                title='Yêu cầu thay đổi hồ sơ đã được duyệt!',
                message=f'Admin đã duyệt yêu cầu thay đổi hồ sơ của bạn. {change_request.admin_review}'
            )

            # Push notification
            if worker.expo_push_token:
                send_expo_push_notification(
                    token=worker.expo_push_token,
                    title='Hồ sơ đã được cập nhật!',
                    body='Admin đã duyệt yêu cầu thay đổi hồ sơ của bạn.',
                    data={'type': 'profile_change_approved'}
                )

            return Response({'message': f'Đã duyệt yêu cầu thay đổi hồ sơ cho {worker.username}.'})

        elif action == 'reject':
            change_request.status = 'rejected'
            change_request.admin_review = admin_review if admin_review else 'Yêu cầu thay đổi hồ sơ bị từ chối.'
            change_request.reviewed_at = timezone.now()
            change_request.save()

            # Gửi thông báo cho worker
            Notification.objects.create(
                recipient=change_request.worker,
                title='Yêu cầu thay đổi hồ sơ bị từ chối',
                message=f'Admin đã từ chối yêu cầu thay đổi hồ sơ của bạn. Lý do: {change_request.admin_review}'
            )

            # Push notification
            if change_request.worker.expo_push_token:
                send_expo_push_notification(
                    token=change_request.worker.expo_push_token,
                    title='Yêu cầu thay đổi hồ sơ bị từ chối',
                    body='Admin đã từ chối yêu cầu thay đổi hồ sơ của bạn.',
                    data={'type': 'profile_change_rejected'}
                )

            return Response({'message': f'Đã từ chối yêu cầu thay đổi hồ sơ của {change_request.worker.username}.'})

        else:
            return Response({'error': 'Action không hợp lệ. Dùng approve hoặc reject.'}, status=status.HTTP_400_BAD_REQUEST)


# --- PHẦN 10: CAREPARTNER AI CHATBOT & TRUNG TÂM TRỢ GIÚP ---
class WorkerChatbotAPIView(APIView):
    """API Chatbot AI dành riêng cho Carepartner — hỗ trợ tư vấn việc làm, kỹ năng, v.v."""
    permission_classes = [IsAuthenticated]

    SYSTEM_PROMPT = """
Bạn là trợ lý AI của ứng dụng Educarelink — nền tảng kết nối phụ huynh với sinh viên/người chăm sóc (Carepartner).
Nhiệm vụ của bạn là giúp CAREPARTNER (người chăm sóc) giải đáp thắc mắc, tư vấn kỹ năng, và hỗ trợ trong quá trình làm việc.

BẠN CÓ THỂ HỖ TRỢ:
1. Tư vấn kỹ năng làm việc: cách chăm sóc trẻ, gia sư hiệu quả, giao tiếp với phụ huynh
2. Giải đáp thắc mắc về nền tảng: cách ứng tuyển, xem việc, cập nhật hồ sơ
3. Gợi ý cách tăng đánh giá sao và thu hút phụ huynh
4. Hỗ trợ viết mô tả bản thân ấn tượng
5. Tư vấn an toàn khi làm việc (đặc biệt với trẻ em)
6. Giải thích các quyền lợi và trách nhiệm của Carepartner

QUY TẮC:
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện và chuyên nghiệp
- Cung cấp câu trả lời chi tiết, có ví dụ thực tế khi có thể
- Không tạo task hay thực hiện hành động thay người dùng — chỉ tư vấn và hướng dẫn
- Nếu câu hỏi ngoài phạm vi, hãy lịch sự chuyển hướng về chủ đề liên quan
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng
"""

    def _build_contents(self, user_message, chat_history=None):
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        contents.append({'role': 'user', 'parts': [{'text': user_message}]})
        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        # Chỉ Carepartner mới được sử dụng chatbot này
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới được sử dụng tính năng này.'}, status=status.HTTP_403_FORBIDDEN)

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])

        if not user_message:
            return Response({"error": "Tin nhắn không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": "Tính năng AI chưa được kích hoạt. Vui lòng liên hệ admin để cấu hình.",
                "type": "info"
            })

        # Bổ sung ngữ cảnh người dùng vào system prompt
        user = request.user
        enriched_prompt = self.SYSTEM_PROMPT + f"""

THÔNG TIN NGƯỜI DÙNG HIỆN TẠI:
- Tên: {user.first_name} {user.last_name}
- Vai trò: Carepartner
- Đã xác thực: {'Có' if user.is_verified else 'Chưa'}
- Bằng cấp: {', '.join(user.qualifications) if isinstance(user.qualifications, list) and user.qualifications else 'Chưa cập nhật'}
"""

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            client = get_pooled_gemini_client()
            if client is None:
                client = genai.Client(api_key=gemini_key)

            contents = self._build_contents(user_message, chat_history)

            gemini_response, model_used = generate_content_with_fallback(
                client,
                contents=contents,
                system_instruction=enriched_prompt,
                temperature=0.8,
                max_output_tokens=2048,
            )
            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                "response": ai_text,
                "type": "message"
            })

        except Exception as e:
            error_msg = str(e)
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"
            return Response({"response": detail, "type": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class HelpCenterAPIView(APIView):
    """API Trung tâm trợ giúp AI — trả lời câu hỏi về nền tảng EduCareLink"""
    permission_classes = [IsAuthenticated]

    SYSTEM_PROMPT = """
Bạn là trợ lý AI của Trung tâm trợ giúp EduCareLink — nền tảng kết nối phụ huynh với sinh viên/người chăm sóc (Carepartner).

NHIỆM VỤ: Giúp người dùng giải đáp mọi thắc mắc về cách sử dụng nền tảng EduCareLink.

HƯỚNG DẪN CHI TIẾT VỀ NỀN TẢNG:

**Đối với Phụ huynh:**
1. Đăng việc: Vào trang chủ → bấm nút "Đăng việc" hoặc dùng AI Chatbot để mô tả yêu cầu → AI tự động tạo việc
2. Tìm Carepartner: Đăng việc → chờ Carepartner ứng tuyển → duyệt ứng viên phù hợp
3. Quản lý việc: Xem danh sách việc đã đăng, cập nhật trạng thái (hoàn thành/hủy)
4. Đánh giá: Sau khi hoàn thành việc → vào "Việc của tôi" → đánh giá Carepartner
5. Chatbot AI: Bấm "AI Trợ lý" trên sidebar → mô tả yêu cầu bằng lời nói tự nhiên

**Đối với Carepartner:**
1. Tìm việc: Vào "Tìm việc" → duyệt danh sách → bấm "Ứng tuyển"
2. Việc của tôi: Xem danh sách việc đã ứng tuyển và trạng thái
3. Hồ sơ: Cập nhật thông tin cá nhân → gửi yêu cầu thay đổi (Admin sẽ duyệt)
4. Bằng cấp: Tải lên ảnh bằng cấp/chứng chỉ → Admin xem xét và đánh giá
5. Thông báo: Nhận thông báo từ Admin (duyệt hồ sơ, duyệt bằng cấp, v.v.)

**Quy trình đăng ký Carepartner:**
- Điền thông tin → Tải ảnh CCCD mặt trước + mặt sau + ảnh chân dung → Chờ Admin duyệt
- Sau khi được duyệt, có thể bắt đầu ứng tuyển việc

**Quy trình thay đổi hồ sơ:**
- Vào "Chỉnh sửa hồ sơ" → Sửa thông tin → Bấm "Lưu thay đổi" → Yêu cầu gửi đến Admin
- Admin sẽ duyệt hoặc từ chối → Nhận thông báo kết quả

**Quy trình gửi bằng cấp:**
- Vào "Bằng cấp của tôi" → Tải ảnh + mô tả → Gửi → Chờ Admin đánh giá
- Admin duyệt → Bằng cấp được cập nhật vào hồ sơ

QUY TẮC:
- Luôn trả lời bằng TIẾNG VIỆT, thân thiện, rõ ràng
- Hướng dẫn từng bước khi giải thích tính năng
- Nếu câu hỏi không liên quan đến EduCareLink, lịch sự chuyển hướng
- Sử dụng ngữ cảnh cuộc hội thoại trước đó để hiểu ý người dùng
"""

    def _build_contents(self, user_message, chat_history=None):
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        contents.append({'role': 'user', 'parts': [{'text': user_message}]})
        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])

        if not user_message:
            return Response({"error": "Tin nhắn không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": "Tính năng AI chưa được kích hoạt. Vui lòng liên hệ admin.",
                "type": "info"
            })

        # Bổ sung ngữ cảnh người dùng
        user = request.user
        role_display = 'Phụ huynh' if user.role == 'parent' else 'Carepartner'
        enriched_prompt = self.SYSTEM_PROMPT + f"""

THÔNG TIN NGƯỜI DÙNG HIỆN TẠI:
- Tên: {user.first_name} {user.last_name}
- Vai trò: {role_display}
- Đã xác thực: {'Có' if user.is_verified else 'Chưa'}
- Tài khoản đã duyệt: {'Có' if user.is_approved else 'Chưa'}
"""

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            client = get_pooled_gemini_client()
            if client is None:
                client = genai.Client(api_key=gemini_key)

            contents = self._build_contents(user_message, chat_history)

            gemini_response, model_used = generate_content_with_fallback(
                client,
                contents=contents,
                system_instruction=enriched_prompt,
                temperature=0.7,
                max_output_tokens=2048,
            )
            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            return Response({
                "response": ai_text,
                "type": "message"
            })

        except Exception as e:
            error_msg = str(e)
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng AI hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"
            return Response({"response": detail, "type": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# ===== DISTANCE CALCULATION API =====
import math as math_module

def haversine_distance(lat1, lon1, lat2, lon2):
    """Tính khoảng cách giữa 2 điểm trên Trái Đất bằng công thức Haversine (đơn vị: km)"""
    R = 6371  # Bán kính Trái Đất (km)
    dlat = math_module.radians(lat2 - lat1)
    dlon = math_module.radians(lon2 - lon1)
    a = math_module.sin(dlat / 2)**2 + math_module.cos(math_module.radians(lat1)) * math_module.cos(math_module.radians(lat2)) * math_module.sin(dlon / 2)**2
    c = 2 * math_module.asin(math_module.sqrt(a))
    return round(R * c, 2)


class DistanceCalculationAPIView(APIView):
    """Tính khoảng cách giữa 2 người dùng hoặc giữa người dùng và công việc.
    Sử dụng Haversine cho khoảng cách chính xác + Gemini AI để ước tính thời gian di chuyển."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        lat1 = request.data.get('lat1')
        lon1 = request.data.get('lon1')
        lat2 = request.data.get('lat2')
        lon2 = request.data.get('lon2')

        # Hoặc truyền user_id / task_id để tự lấy tọa độ
        user_id = request.data.get('user_id')
        task_id = request.data.get('task_id')

        # Lấy tọa độ từ user_id
        if user_id and (lat2 is None or lon2 is None):
            try:
                target_user = User.objects.get(id=user_id)
                if target_user.latitude is not None and target_user.longitude is not None:
                    lat2 = target_user.latitude
                    lon2 = target_user.longitude
                else:
                    return Response({"error": "Người dùng này chưa cập nhật vị trí trên bản đồ."}, status=status.HTTP_400_BAD_REQUEST)
            except User.DoesNotExist:
                return Response({"error": "Không tìm thấy người dùng."}, status=status.HTTP_404_NOT_FOUND)

        # Lấy tọa độ từ task_id
        if task_id and (lat2 is None or lon2 is None):
            try:
                task = Task.objects.get(id=task_id)
                if task.latitude is not None and task.longitude is not None:
                    lat2 = task.latitude
                    lon2 = task.longitude
                else:
                    return Response({"error": "Công việc này chưa có vị trí trên bản đồ."}, status=status.HTTP_400_BAD_REQUEST)
            except Task.DoesNotExist:
                return Response({"error": "Không tìm thấy công việc."}, status=status.HTTP_404_NOT_FOUND)

        # Nếu không có lat1/lon1, dùng vị trí của người dùng hiện tại
        if lat1 is None or lon1 is None:
            if request.user.latitude is not None and request.user.longitude is not None:
                lat1 = request.user.latitude
                lon1 = request.user.longitude
            else:
                return Response({"error": "Bạn chưa cập nhật vị trí trên bản đồ. Vui lòng chọn vị trí trong hồ sơ."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            lat1 = float(lat1)
            lon1 = float(lon1)
            lat2 = float(lat2)
            lon2 = float(lon2)
        except (TypeError, ValueError):
            return Response({"error": "Tọa độ không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        # Tính khoảng cách bằng Haversine
        distance_km = haversine_distance(lat1, lon1, lat2, lon2)

        # Dùng Gemini AI để ước tính thời gian di chuyển
        travel_info = None
        gemini_key = os.environ.get('GEMINI_API_KEY', '')
        if gemini_key:
            try:
                from google import genai
                from performance.gemini_pool import get_pooled_gemini_client
                from performance.gemini_model import generate_content_with_fallback

                client = get_pooled_gemini_client()
                if client is None:
                    client = genai.Client(api_key=gemini_key)

                prompt = (
                    f"Hai địa điểm có tọa độ ({lat1}, {lon1}) và ({lat2}, {lon2}), "
                    f"khoảng cách đường chim bay là {distance_km} km. "
                    f"Đây là Việt Nam. Hãy ước tính thời gian di chuyển thực tế bằng xe máy "
                    f"(phương tiện phổ biến nhất ở Việt Nam) và bằng ô tô. "
                    f"Chỉ trả lời ngắn gọn theo format: 'Xe máy: ~X phút, Ô tô: ~Y phút'. "
                    f"Không thêm giải thích."
                )
                gemini_response, _ = generate_content_with_fallback(
                    client,
                    contents=prompt,
                    temperature=0.3,
                    max_output_tokens=128,
                )
                travel_info = gemini_response.text.strip()
            except Exception:
                travel_info = None

        result = {
            "distance_km": distance_km,
            "lat1": lat1, "lon1": lon1,
            "lat2": lat2, "lon2": lon2,
        }
        if travel_info:
            result["travel_info"] = travel_info

        return Response(result)


# ===== ADMIN AI CHATBOT — THỐNG KÊ, PHÁT HIỆN BẤT THƯỜNG, HÀNH ĐỘNG, PHÂN TÍCH ẢNH =====

import base64 as _base64

def _get_platform_stats():
    """Trích xuất thống kê nền tảng thực tế từ database để làm ngữ cảnh cho AI."""
    from django.utils import timezone
    now = timezone.now()
    today = now.date()
    week_ago = today - __import__('datetime').timedelta(days=7)

    total_users = User.objects.count()
    total_parents = User.objects.filter(role='parent').count()
    total_workers = User.objects.filter(role='worker').count()
    active_workers = User.objects.filter(role='worker', is_active=True, is_approved=True).count()
    pending_workers = User.objects.filter(role='worker', is_approved=False).count()
    banned_users = User.objects.filter(is_active=False).exclude(is_staff=True).count()
    unverified_workers = User.objects.filter(role='worker', is_verified=False, is_approved=True).count()
    new_users_week = User.objects.filter(date_joined__date__gte=week_ago).count()
    total_tasks = Task.objects.count()
    open_tasks = Task.objects.filter(status='open').count()
    in_progress_tasks = Task.objects.filter(status='in_progress').count()
    completed_tasks = Task.objects.filter(status='completed').count()
    cancelled_tasks = Task.objects.filter(status='cancelled').count()
    pending_credentials = CredentialSubmission.objects.filter(status='pending').count()
    pending_profile_changes = ProfileChangeRequest.objects.filter(status='pending').count()
    total_reviews = Review.objects.count()
    avg_rating = Review.objects.aggregate(avg=db_models.Avg('rating'))['avg']

    # Phát hiện bất thường (anomaly)
    anomalies = []

    # 1. Tài khoản không có ảnh CCCD nhưng đã được duyệt
    no_id_approved = User.objects.filter(
        role='worker', is_approved=True
    ).filter(
        db_models.Q(id_card_front='') | db_models.Q(id_card_front__isnull=True)
    ).count()
    if no_id_approved > 0:
        anomalies.append(f"⚠️ {no_id_approved} Carepartner đã duyệt nhưng KHÔNG có ảnh CCCD mặt trước")

    # 2. Tài khoản không có ảnh chân dung
    no_selfie = User.objects.filter(
        role='worker', is_approved=True
    ).filter(
        db_models.Q(selfie_photo='') | db_models.Q(selfie_photo__isnull=True)
    ).count()
    if no_selfie > 0:
        anomalies.append(f"⚠️ {no_selfie} Carepartner đã duyệt nhưng KHÔNG có ảnh chân dung")

    # 3. Tài khoản bị khóa (is_active=False)
    if banned_users > 0:
        banned_list = User.objects.filter(is_active=False).exclude(is_staff=True).values_list('username', flat=True)[:10]
        anomalies.append(f"⚠️ {banned_users} tài khoản đang bị khóa: {', '.join(list(banned_list))}")

    # 4. Nhiều đăng ký mới bất thường (>10 trong tuần)
    if new_users_week > 10:
        anomalies.append(f"⚠️ {new_users_week} người dùng mới trong 7 ngày qua — có thể cần kiểm tra spam")

    # 5. Carepartner đã duyệt nhưng chưa xác thực
    if unverified_workers > 0:
        anomalies.append(f"⚠️ {unverified_workers} Carepartner đã duyệt nhưng chưa xác thực CCCD")

    # 6. Bằng cấp chờ duyệt quá nhiều
    if pending_credentials > 5:
        anomalies.append(f"⚠️ {pending_credentials} bằng cấp đang chờ duyệt — cần xử lý kịp thời")

    # 7. Việc đăng nhưng không ai ứng tuyển
    old_open_tasks = Task.objects.filter(
        status='open',
        created_at__date__lt=week_ago
    ).count()
    if old_open_tasks > 0:
        anomalies.append(f"⚠️ {old_open_tasks} việc đã đăng >7 ngày vẫn chưa có người nhận")

    # 8. Đánh giá 1 sao
    one_star_reviews = Review.objects.filter(rating=1).count()
    if one_star_reviews > 0:
        anomalies.append(f"⚠️ {one_star_reviews} đánh giá 1 sao — cần kiểm tra chất lượng Carepartner")

    stats_text = f"""
THỐNG KÊ NỀN TẢNG ({today.strftime('%d/%m/%Y')}):
- Tổng người dùng: {total_users} (Phụ huynh: {total_parents}, Carepartner: {total_workers})
- Carepartner hoạt động: {active_workers} | Chờ duyệt: {pending_workers}
- Tài khoản bị khóa: {banned_users}
- Người dùng mới (7 ngày): {new_users_week}
- Tổng việc: {total_tasks} (Mở: {open_tasks}, Đang làm: {in_progress_tasks}, Xong: {completed_tasks}, Hủy: {cancelled_tasks})
- Bằng cấp chờ duyệt: {pending_credentials}
- Yêu cầu sửa hồ sơ chờ duyệt: {pending_profile_changes}
- Tổng đánh giá: {total_reviews} | Điểm TB: {round(avg_rating, 1) if avg_rating else 'Chưa có'}
"""
    if anomalies:
        stats_text += "\nPHÁT HIỆN BẤT THƯỜNG:\n" + "\n".join(anomalies)
    else:
        stats_text += "\nKhông phát hiện bất thường."

    return stats_text


def _execute_admin_action(command_text):
    """Phân tích lệnh từ admin và thực hiện hành động. Trả về (success, message)."""
    import re
    cmd = command_text.strip().lower()

    # Cấm/khóa tài khoản: "cấm user 5" hoặc "khóa user 5" hoặc "ban user 5"
    ban_match = re.search(r'(cấm|khóa|ban|lock)\s+(user\s+)?(\d+)', cmd)
    if ban_match:
        user_id = int(ban_match.group(3))
        try:
            target = User.objects.get(id=user_id)
            if target.is_staff:
                return False, f"Không thể khóa tài khoản admin (ID: {user_id})"
            if not target.is_active:
                return False, f"Tài khoản {target.username} (ID: {user_id}) đã bị khóa trước đó"
            target.is_active = False
            target.save(update_fields=['is_active'])
            return True, f"✅ Đã khóa tài khoản {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy user ID: {user_id}"

    # Mở khóa: "mở user 5" hoặc "unban user 5" hoặc "unlock user 5"
    unban_match = re.search(r'(mở|mở khóa|unban|unlock|kích hoạt)\s+(user\s+)?(\d+)', cmd)
    if unban_match:
        user_id = int(unban_match.group(3))
        try:
            target = User.objects.get(id=user_id)
            if target.is_active:
                return False, f"Tài khoản {target.username} (ID: {user_id}) đang hoạt động bình thường"
            target.is_active = True
            target.save(update_fields=['is_active'])
            return True, f"✅ Đã mở khóa tài khoản {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy user ID: {user_id}"

    # Duyệt tài khoản: "duyệt user 5" hoặc "approve user 5"
    approve_match = re.search(r'(duyệt|approve|chấp nhận)\s+(user\s+)?(\d+)', cmd)
    if approve_match:
        user_id = int(approve_match.group(3))
        try:
            target = User.objects.get(id=user_id, role='worker')
            if target.is_approved:
                return False, f"Carepartner {target.username} (ID: {user_id}) đã được duyệt trước đó"
            target.is_approved = True
            target.is_active = True
            target.save(update_fields=['is_approved', 'is_active'])
            # Gửi thông báo
            Notification.objects.create(
                recipient=target,
                title='Tài khoản đã được duyệt!',
                message='Chúc mừng! Tài khoản Carepartner của bạn đã được Admin duyệt. Bây giờ bạn có thể ứng tuyển việc.'
            )
            return True, f"✅ Đã duyệt Carepartner {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy Carepartner ID: {user_id}"

    # Từ chối tài khoản: "từ chối user 5" hoặc "reject user 5"
    reject_match = re.search(r'(từ chối|từchối|reject|refuse)\s+(user\s+)?(\d+)', cmd)
    if reject_match:
        user_id = int(reject_match.group(3))
        try:
            target = User.objects.get(id=user_id, role='worker')
            if not target.is_approved and target.is_active:
                return False, f"Carepartner {target.username} (ID: {user_id}) đã bị từ chối trước đó"
            target.is_approved = False
            target.is_active = False
            target.save(update_fields=['is_approved', 'is_active'])
            Notification.objects.create(
                recipient=target,
                title='Tài khoản chưa được duyệt',
                message='Rất tiếc, tài khoản Carepartner của bạn chưa được Admin duyệt. Vui lòng cập nhật hồ sơ và thử lại.'
            )
            return True, f"✅ Đã từ chối Carepartner {target.username} (ID: {user_id})"
        except User.DoesNotExist:
            return False, f"Không tìm thấy Carepartner ID: {user_id}"

    return None, None  # Không phải lệnh hành động


class AdminChatbotAPIView(APIView):
    """API Chatbot AI dành riêng cho Admin — thống kê, phát hiện bất thường, hành động, phân tích ảnh bằng cấp."""
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    SYSTEM_PROMPT = """Bạn là AI Trợ lý Quản trị của nền tảng EduCareLink — hệ thống kết nối phụ huynh với sinh viên/người chăm sóc (Carepartner).

KHẢ NĂNG CỦA BẠN:
1. **Thống kê & Tổng hợp**: Cung cấp số liệu tổng quan, xu hướng, báo cáo về nền tảng.
2. **Phát hiện bất thường**: Cảnh báo tài khoản đáng ngờ, đánh giá thấp, việc không ai nhận, v.v.
3. **Hành động tài khoản**: Khi admin yêu cầu, bạn có thể gợi ý lệnh để:
   - Khóa tài khoản: "cấm user <ID>" hoặc "khóa user <ID>"
   - Mở khóa: "mở user <ID>" hoặc "mở khóa user <ID>"
   - Duyệt Carepartner: "duyệt user <ID>"
   - Từ chối: "từ chối user <ID>"
4. **Phân tích hình ảnh bằng cấp**: Khi admin gửi ảnh bằng cấp/chứng chỉ, bạn đọc nội dung, đánh giá tính hợp lệ, và gợi ý cách viết đánh giá cho admin.
5. **Viết thông báo**: Soạn thông báo chuyên nghiệp cho Carepartner.
6. **Tư vấn cải tiến**: Đề xuất cách tối ưu quy trình duyệt, quản lý, vận hành nền tảng.

QUY TẮC:
- Luôn trả lời bằng TIẾNG VIỆT, chuyên nghiệp, rõ ràng, có cấu trúc.
- Khi admin yêu cầu hành động (cấm, duyệt, mở khóa...), bạn phải XÁC NHẬN lại trước: "Bạn có chắc muốn <hành động> với tài khoản <tên> (ID: <id>) không?"
- Sau khi admin xác nhận, thực hiện hành động và báo kết quả.
- Khi phân tích ảnh bằng cấp, hãy mô tả chi tiết nội dung, đánh giá mức độ hợp lệ, và gợi ý mẫu đánh giá cho admin (admin có thể dùng hoặc không).
- Nếu không đủ thông tin, hãy yêu cầu admin cung cấp thêm.
- KHÔNG tự ý thực hiện hành động nếu admin chưa xác nhận.
"""

    def _build_contents(self, user_message, chat_history=None):
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})
        contents.append({'role': 'user', 'parts': [{'text': user_message}]})
        return contents

    def _build_contents_with_image(self, user_message, image_base64, mime_type, chat_history=None):
        """Xây dựng nội dung cho Gemini kèm hình ảnh (dùng cho phân tích bằng cấp)."""
        contents = []
        if chat_history and isinstance(chat_history, list):
            for msg in chat_history:
                role = msg.get('role', '')
                text = msg.get('text', '')
                if role in ('user', 'model') and text:
                    contents.append({'role': role, 'parts': [{'text': text}]})

        image_part = {
            'inline_data': {
                'mime_type': mime_type,
                'data': image_base64
            }
        }
        contents.append({
            'role': 'user',
            'parts': [
                {'text': user_message},
                image_part
            ]
        })
        return contents

    def post(self, request):
        from django.conf import settings
        import json
        import re

        user_message = request.data.get('message', '').strip()
        chat_history = request.data.get('history', [])
        image_file = request.FILES.get('image')

        if not user_message and not image_file:
            return Response({"error": "Tin nhắn hoặc hình ảnh không được trống."}, status=status.HTTP_400_BAD_REQUEST)

        gemini_key = getattr(settings, 'GEMINI_API_KEY', '')
        if not gemini_key or gemini_key == 'your_gemini_api_key_here':
            return Response({
                "response": "Tính năng AI chưa được kích hoạt. Vui lòng cấu hình GEMINI_API_KEY.",
                "type": "info"
            })

        # Bước 1: Kiểm tra xem có phải lệnh hành động không
        if user_message:
            action_success, action_msg = _execute_admin_action(user_message)
            if action_success is not None:
                # Đây là lệnh hành động, trả về kết quả ngay
                return Response({
                    "response": action_msg,
                    "type": "action_result"
                })

        # Bước 2: Lấy ngữ cảnh thống kê nền tảng
        stats_context = _get_platform_stats()

        # Bước 3: Nếu admin nhắn "thống kê" hoặc "tình hình" → trả về thống kê trực tiếp
        if user_message and any(kw in user_message.lower() for kw in ['thống kê', 'tình hình', 'số liệu', 'bao nhiêu', 'tổng quan', 'overview', 'stats']):
            enriched_prompt = self.SYSTEM_PROMPT + f"""

{stats_context}

Hãy dựa trên số liệu thực tế ở trên để trả lời admin. Phân tích và đưa ra nhận xét, lời khuyên cụ thể."""
        else:
            enriched_prompt = self.SYSTEM_PROMPT + f"""

NGỮ CẢNH NỀN TẢNG HIỆN TẠI:
{stats_context}

Hãy sử dụng thông tin này khi cần để trả lời admin."""

        try:
            from google import genai
            from performance.gemini_pool import get_pooled_gemini_client
            from performance.gemini_model import generate_content_with_fallback

            client = get_pooled_gemini_client()
            if client is None:
                client = genai.Client(api_key=gemini_key)

            # Nếu có ảnh bằng cấp → dùng Gemini Vision
            if image_file:
                image_data = image_file.read()
                image_b64 = _base64.b64encode(image_data).decode('utf-8')
                mime_type = image_file.content_type or 'image/jpeg'

                analysis_prompt = user_message or "Hãy phân tích ảnh bằng cấp/chứng chỉ này. Mô tả chi tiết nội dung, loại bằng cấp, trường/cơ sở cấp, ngày cấp, và bất kỳ thông tin nào có thể đọc được. Sau đó đánh giá mức độ hợp lệ và gợi ý cách viết đánh giá cho admin."

                contents = self._build_contents_with_image(
                    analysis_prompt, image_b64, mime_type, chat_history
                )

                gemini_response, _ = generate_content_with_fallback(
                    client,
                    contents=contents,
                    system_instruction=enriched_prompt,
                    temperature=0.5,
                    max_output_tokens=3000,
                )
            else:
                # Chat thông thường
                contents = self._build_contents(user_message, chat_history)
                gemini_response, _ = generate_content_with_fallback(
                    client,
                    contents=contents,
                    system_instruction=enriched_prompt,
                    temperature=0.7,
                    max_output_tokens=2048,
                )

            ai_text = gemini_response.text
            if not ai_text:
                return Response({"response": "AI không thể trả lời do bộ lọc an toàn. Vui lòng thử câu hỏi khác.", "type": "error"}, status=status.HTTP_400_BAD_REQUEST)

            response_type = "message"
            if image_file:
                response_type = "image_analysis"
            elif any(kw in user_message.lower() for kw in ['thống kê', 'tình hình', 'số liệu', 'bao nhiêu', 'tổng quan']):
                response_type = "statistics"

            return Response({
                "response": ai_text,
                "type": response_type
            })

        except Exception as e:
            error_msg = str(e)
            if 'API_KEY' in error_msg.upper() or 'INVALID' in error_msg.upper():
                detail = "API key Gemini không hợp lệ."
            elif 'QUOTA' in error_msg.upper() or 'RESOURCE_EXHAUSTED' in error_msg.upper():
                detail = "Đã hết hạn mức sử dụng Gemini hôm nay. Thử lại vào ngày mai!"
            elif 'HIGH DEMAND' in error_msg.upper() or 'UNAVAILABLE' in error_msg.upper():
                detail = "Hệ thống AI đang quá tải. Vui lòng thử lại sau vài giây!"
            else:
                detail = f"Lỗi kết nối AI: {error_msg}"
            return Response({"response": detail, "type": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
