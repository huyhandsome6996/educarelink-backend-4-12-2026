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

class AdminAllTasksAPIView(APIView):
    """GET /api/admin/all-tasks/?moderation_status=all|pending|approved|rejected|needs_review
    List tất cả task cho admin kiểm duyệt."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from moderation.models import TaskModeration
        mod_status = request.query_params.get('moderation_status', 'all')

        tasks = Task.objects.select_related('parent', 'category').order_by('-created_at')

        # Filter theo moderation status
        if mod_status != 'all':
            task_ids = TaskModeration.objects.filter(status=mod_status).values_list('task_id', flat=True)
            tasks = tasks.filter(id__in=task_ids)

        data = []
        for t in tasks:
            # Get moderation info
            try:
                mod = TaskModeration.objects.get(task=t)
                mod_status_val = mod.status
                mod_verdict = mod.ai_verdict
            except TaskModeration.DoesNotExist:
                mod_status_val = 'pending'
                mod_verdict = ''

            data.append({
                'id': t.id,
                'title': t.title,
                'description': t.description,
                'price': str(t.price),
                'status': t.status,
                'location': t.location,
                'scheduled_time': t.scheduled_time.isoformat() if t.scheduled_time else None,
                'category_name': t.category.name if t.category else 'Khác',
                'parent_name': f"{t.parent.last_name or ''} {t.parent.first_name or ''}".strip() or t.parent.username,
                'parent_username': t.parent.username,
                'geofence_lat': float(t.geofence_lat) if t.geofence_lat else None,
                'geofence_lng': float(t.geofence_lng) if t.geofence_lng else None,
                'geofence_radius': float(t.geofence_radius) if t.geofence_radius else None,
                'moderation_status': mod_status_val,
                'moderation_verdict': mod_verdict,
                'created_at': t.created_at.isoformat() if t.created_at else None,
            })
        return Response(data)

class AdminModerateTaskAPIView(APIView):
    """POST /api/admin/all-tasks/<task_id>/moderate/
    Admin duyệt hoặc xóa công việc.
    Body: {action: 'approve_task' | 'reject_task'}"""
    permission_classes = [IsAdminUser]

    def post(self, request, task_id):
        from moderation.models import TaskModeration
        action = request.data.get('action')
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'}, status=status.HTTP_404_NOT_FOUND)

        if action == 'approve_task':
            # Admin duyệt task
            TaskModeration.objects.update_or_create(
                task=task,
                defaults={
                    'status': 'admin_approved',
                    'ai_verdict': 'Đã được admin duyệt thủ công.',
                    'reviewed_by': request.user,
                }
            )
            # Notify parent
            try:
                Notification.objects.create(
                    recipient=task.parent,
                    title="✅ Công việc đã được admin duyệt",
                    message=f'Công việc "{task.title}" đã được admin duyệt.',
                )
                if task.parent.expo_push_token:
                    send_expo_push_notification(
                        token=task.parent.expo_push_token,
                        title="✅ Công việc được duyệt",
                        body=f'"{task.title}" đã được admin duyệt.',
                        data={'type': 'task_approved', 'task_id': task.id}
                    )
            except Exception as e:
                logger.warning(f"Notify parent on admin approve failed: {e}")
            return Response({'message': 'Đã duyệt công việc.'})

        elif action == 'reject_task':
            # Admin xóa task
            reason = request.data.get('reason', 'Admin xóa công việc do vi phạm hoặc không phù hợp.')
            try:
                Notification.objects.create(
                    recipient=task.parent,
                    title="🚫 Công việc đã bị admin xóa",
                    message=f'Công việc "{task.title}" đã bị admin xóa. Lý do: {reason[:150]}',
                )
                if task.parent.expo_push_token:
                    send_expo_push_notification(
                        token=task.parent.expo_push_token,
                        title="🚫 Công việc bị xóa",
                        body=f'"{task.title}" bị admin xóa: {reason[:100]}',
                        data={'type': 'task_rejected', 'task_id': task.id}
                    )
            except Exception as e:
                logger.warning(f"Notify parent on admin reject failed: {e}")
            task.delete()
            logger.info(f"[admin] Task#{task_id} DELETED by admin {request.user.username}")
            return Response({'message': 'Đã xóa công việc.'})

        else:
            return Response({'error': 'Action không hợp lệ. Dùng approve_task hoặc reject_task.'}, status=status.HTTP_400_BAD_REQUEST)

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
