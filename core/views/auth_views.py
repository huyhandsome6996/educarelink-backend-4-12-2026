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

class RegisterAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    # ⚡ Security: Rate limit register — 3/giờ per IP (chống spam account)
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'register'

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
