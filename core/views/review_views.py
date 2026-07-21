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
