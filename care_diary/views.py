"""B1 — API endpoints cho Nhật ký chăm sóc.

Views chỉ làm I/O, business logic trong services.py (§15.3).
Chỉ phụ thuộc core models — không import payments/tracking/moderation.
"""

import json
import os

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from core.models import Task, TaskApplication

from .models import CareDiaryEntry, CareDiaryActivity, CareDiaryAttachment
from . import services


def _build_absolute_uri(request, url):
    """Tạo URL tuyệt đối, đảm bảo dùng HTTPS trên Render."""
    if not url:
        return None
    abs_url = request.build_absolute_uri(url)
    if os.environ.get('RENDER', '') or request.is_secure():
        abs_url = abs_url.replace('http://', 'https://', 1)
    return abs_url


class WorkerCareDiaryAPIView(APIView):
    """CarePartner tạo (POST) hoặc sửa (PATCH) nhật ký cho task.

    Quyết định thiết kế: cho phép sửa nhật ký kể cả sau khi task completed.
    Lý do: CarePartner có thể bổ sung ghi chú sau ca làm.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, task_id):
        """Tạo nhật ký mới cho task."""
        # 1. Kiểm tra role
        if request.user.role != 'worker':
            return Response(
                {'error': 'Chỉ CarePartner mới được ghi nhật ký.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 2. Lấy task
        try:
            task = Task.objects.select_related('parent').get(pk=task_id)
        except Task.DoesNotExist:
            return Response(
                {'error': 'Không tìm thấy công việc.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 3. Business validation
        try:
            services.check_worker_can_write(task=task, worker=request.user)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Chống trùng (OneToOne)
        if CareDiaryEntry.objects.filter(task_id=task_id).exists():
            return Response(
                {'error': 'Nhật ký cho công việc này đã tồn tại. Dùng PATCH để sửa.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 5. Parse data — hỗ trợ cả JSON body và multipart form
        data = request.data
        activities_raw = data.get('activities')
        if isinstance(activities_raw, str):
            try:
                activities_raw = json.loads(activities_raw)
            except json.JSONDecodeError:
                return Response(
                    {'error': 'activities phải là mảng JSON hợp lệ.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # 6. Validate + tạo entry
        try:
            completion = services.parse_completion_percent(data.get('completion_percent', 0))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        entry = CareDiaryEntry.objects.create(
            task=task,
            worker=request.user,
            mood_icon=str(data.get('mood_icon', ''))[:30],
            mood_label=str(data.get('mood_label', ''))[:100],
            mood_note=str(data.get('mood_note', '')),
            completion_percent=completion,
            note=str(data.get('note', '')),
        )

        # 7. Tạo activities
        VALID_STATUSES = dict(CareDiaryActivity.STATUS_CHOICES).keys()
        if activities_raw and isinstance(activities_raw, list):
            for idx, act in enumerate(activities_raw):
                act_status = act.get('status', 'done')
                if act_status not in VALID_STATUSES:
                    return Response(
                        {'error': f"Trạng thái hoạt động không hợp lệ: '{act_status}'. Giá trị cho phép: {', '.join(VALID_STATUSES)}."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                CareDiaryActivity.objects.create(
                    entry=entry,
                    time=str(act.get('time', ''))[:10],
                    title=str(act.get('title', ''))[:200],
                    description=str(act.get('description', '')),
                    status=act_status,
                    order=act.get('order', idx),
                )

        return Response(
            services.build_entry_response(entry=entry, request=request),
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, task_id):
        """Sửa nhật ký đã tạo. Chỉ chủ nhật ký mới sửa được."""
        if request.user.role != 'worker':
            return Response(
                {'error': 'Chỉ CarePartner mới được ghi nhật ký.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            entry = CareDiaryEntry.objects.select_related('task').get(
                task_id=task_id,
            )
        except CareDiaryEntry.DoesNotExist:
            return Response(
                {'error': 'Chưa có nhật ký cho công việc này.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Chỉ chủ nhật ký được sửa
        if entry.worker_id != request.user.id:
            return Response(
                {'error': 'Bạn không phải người tạo nhật ký này.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Parse data
        data = request.data
        updatable_fields = [
            'mood_icon', 'mood_label', 'mood_note',
            'completion_percent', 'note',
        ]
        FIELD_MAX_LENGTH = {'mood_icon': 30, 'mood_label': 100}
        for field in updatable_fields:
            if field in data:
                val = data[field]
                if field == 'completion_percent':
                    try:
                        val = services.parse_completion_percent(val)
                    except ValueError as e:
                        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
                elif field in FIELD_MAX_LENGTH:
                    val = str(val)[:FIELD_MAX_LENGTH[field]]
                setattr(entry, field, str(val) if isinstance(val, str) else val)
        entry.save()
        # Replace activities nếu gửi lên
        activities_raw = data.get('activities')
        if activities_raw is not None:
            if isinstance(activities_raw, str):
                try:
                    activities_raw = json.loads(activities_raw)
                except json.JSONDecodeError:
                    return Response(
                        {'error': 'activities phải là mảng JSON hợp lệ.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            # Xoá cũ, tạo mới
            entry.activities.all().delete()
            VALID_STATUSES = dict(CareDiaryActivity.STATUS_CHOICES).keys()
            if isinstance(activities_raw, list):
                for idx, act in enumerate(activities_raw):
                    act_status = act.get('status', 'done')
                    if act_status not in VALID_STATUSES:
                        return Response(
                            {'error': f"Trạng thái hoạt động không hợp lệ: '{act_status}'. Giá trị cho phép: {', '.join(VALID_STATUSES)}."},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    CareDiaryActivity.objects.create(
                        entry=entry,
                        time=str(act.get('time', ''))[:10],
                        title=str(act.get('title', ''))[:200],
                        description=str(act.get('description', '')),
                        status=act_status,
                        order=act.get('order', idx),
                    )

        return Response(
            services.build_entry_response(entry=entry, request=request),
            status=status.HTTP_200_OK,
        )


class CareDiaryDetailAPIView(APIView):
    """Xem nhật ký chăm sóc — parent chủ task hoặc worker chủ nhật ký."""
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response(
                {'error': 'Không tìm thấy công việc.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Permission check
        try:
            services.check_can_read(task=task, user=request.user)
        except PermissionError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

        # Lấy entry
        try:
            entry = CareDiaryEntry.objects.select_related(
                'task', 'worker',
            ).prefetch_related('activities', 'attachments').get(task_id=task_id)
        except CareDiaryEntry.DoesNotExist:
            return Response(
                {'error': 'Task này chưa có nhật ký chăm sóc.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            services.build_entry_response(entry=entry, request=request),
            status=status.HTTP_200_OK,
        )


class WorkerCareDiaryAttachmentAPIView(APIView):
    """Upload thêm ảnh cho nhật ký đã tồn tại. Chỉ chủ nhật ký mới upload được."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, task_id):
        if request.user.role != 'worker':
            return Response(
                {'error': 'Chỉ CarePartner mới được tải lên ảnh.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            entry = CareDiaryEntry.objects.get(task_id=task_id)
        except CareDiaryEntry.DoesNotExist:
            return Response(
                {'error': 'Chưa có nhật ký cho công việc này.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if entry.worker_id != request.user.id:
            return Response(
                {'error': 'Bạn không phải người tạo nhật ký này.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        images = request.FILES.getlist('images')
        if not images:
            return Response(
                {'error': 'Vui lòng chọn ít nhất 1 ảnh.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        for img in images:
            att = CareDiaryAttachment.objects.create(entry=entry, image=img)
            created.append({
                'id': att.id,
                'type': 'image',
                'url': _build_absolute_uri(request, att.image.url),
            })

        return Response({'attachments': created}, status=status.HTTP_201_CREATED)
