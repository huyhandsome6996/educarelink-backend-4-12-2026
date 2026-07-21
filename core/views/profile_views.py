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
