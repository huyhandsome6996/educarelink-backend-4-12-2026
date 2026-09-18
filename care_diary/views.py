"""B1 — API endpoints cho Nhật ký chăm sóc.

Views chỉ làm I/O, business logic trong services.py (§15.3).
Chỉ phụ thuộc core models — không import payments/tracking/moderation.
"""

import json
import os

from django.db import IntegrityError, transaction

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView

from core.models import Task, TaskApplication

from .models import CareDiaryEntry, CareDiaryActivity, CareDiaryAttachment
from . import services

# Thông điệp trùng nhật ký — dùng chung cho exists() check thân thiện và
# nhánh IntegrityError (race condition, C1) để 2 nhánh không tự lệch nhau.
DUPLICATE_DIARY_MSG = 'Nhật ký cho công việc này đã tồn tại. Dùng PATCH để sửa.'


def _build_absolute_uri(request, url):
    """Tạo URL tuyệt đối, đảm bảo dùng HTTPS trên Render."""
    if not url:
        return None
    abs_url = request.build_absolute_uri(url)
    if os.environ.get('RENDER', '') or request.is_secure():
        abs_url = abs_url.replace('http://', 'https://', 1)
    return abs_url


def _parse_confirm_clear(data):
    """H1 — parse cờ confirm_clear_assessment từ JSON body hoặc multipart.

    Chấp nhận boolean true hoặc chuỗi 'true'/'1'/'yes'. Chuỗi 'false'/'0'/''
    hoặc không gửi → False (mặc định: KHÔNG cho phép xóa dữ liệu đánh giá).
    """
    raw = data.get('confirm_clear_assessment', False)
    return str(raw).strip().lower() in ('true', '1', 'yes')


def _parse_and_validate_assessment(data, task, entry=None):
    """Helper dùng chung POST/PATCH — parse + validate form đánh giá chuyên sâu.

    assessment_data có thể là dict (JSON body) hoặc chuỗi JSON (multipart
    form). Với PATCH (entry khác None), type/data mặc định kế thừa từ entry
    khi client không gửi. Gom logic về 1 chỗ để 2 nhánh POST/PATCH không tự
    lệch nhau khi sửa sau này (QA review §7 — nợ kỹ thuật trùng lặp).

    Returns:
        (assessment_type, assessment_data, None)  — hợp lệ.
        (None, None, Response)                    — lỗi, view trả Response ngay.
    """
    raw_type = str(data.get('assessment_type', '') or '').strip()
    if not raw_type:
        raw_type = (entry.assessment_type if entry is not None else None) or 'general'
    default_assessment = (entry.assessment_data or {}) if entry is not None else {}
    raw_assessment = data.get('assessment_data', default_assessment)
    if isinstance(raw_assessment, str):
        try:
            raw_assessment = json.loads(raw_assessment) if raw_assessment.strip() else {}
        except json.JSONDecodeError:
            return None, None, Response(
                {'assessment_data': ['assessment_data phải là object JSON hợp lệ.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
    try:
        assessment_type, assessment_data = services.validate_assessment_data(
            task=task, assessment_type=raw_type, assessment_data=raw_assessment,
            # H1 — truyền giá trị hiện tại của entry (chỉ có ở PATCH) để
            # chặn hạ cấp tutoring/childcare → general xóa dữ liệu âm thầm;
            # POST (entry=None) không có gì để bảo vệ → mặc định None/False.
            current_type=(entry.assessment_type if entry is not None else None),
            current_data=(entry.assessment_data if entry is not None else None),
            allow_clear=_parse_confirm_clear(data),
        )
    except services.AssessmentValidationError as e:
        return None, None, Response(e.errors, status=status.HTTP_400_BAD_REQUEST)
    return assessment_type, assessment_data, None


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

        # 2. Lấy task — M3: select_related('category') luôn để
        # get_allowed_assessment_types() không gây thêm 1 query N+1
        try:
            task = Task.objects.select_related('parent', 'category').get(pk=task_id)
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

        # 4. Parse data — hỗ trợ cả JSON body và multipart form
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

        # 5. Validate completion_percent
        try:
            completion = services.parse_completion_percent(data.get('completion_percent', 0))
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # 5b. CARE DIARY NÂNG CẤP — validate form đánh giá chuyên sâu theo
        # danh mục (dùng chung helper với PATCH). Lỗi trả field-level theo
        # API contract.
        assessment_type, assessment_data, err = _parse_and_validate_assessment(
            data, task,
        )
        if err is not None:
            return err

        # 6. Chống trùng (OneToOne) + tạo entry — C1: bọc transaction.atomic()
        # chống race condition TOCTOU. Nếu 2 request POST gửi gần như đồng thời
        # (double-tap, retry khi mất mạng, web + mobile cùng submit), cả 2 có
        # thể cùng vượt qua bước exists() trước khi request kia kịp commit —
        # request vào sau sẽ chạm ràng buộc unique của OneToOne ngay ở tầng
        # DB. Bắt IntegrityError trả 400 thân thiện thay vì để lộ lỗi 500.
        # Lưu ý: except phải nằm NGOÀI khối atomic (sai ở trong atomic sẽ
        # dẫn tới TransactionManagementError trên PostgreSQL khi commit).
        try:
            with transaction.atomic():
                if CareDiaryEntry.objects.filter(task_id=task_id).exists():
                    return Response(
                        {'error': DUPLICATE_DIARY_MSG},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                entry = CareDiaryEntry.objects.create(
                    task=task,
                    worker=request.user,
                    assessment_type=assessment_type,
                    assessment_data=assessment_data,
                    mood_icon=services.normalize_mood_icon(data.get('mood_icon', ''))[:30],
                    mood_label=str(data.get('mood_label', ''))[:100],
                    mood_note=str(data.get('mood_note', '')),
                    completion_percent=completion,
                    note=str(data.get('note', '')),
                )
        except IntegrityError:
            return Response(
                {'error': DUPLICATE_DIARY_MSG},
                status=status.HTTP_400_BAD_REQUEST,
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
            # M3: select_related 'task__category' — validate assessment ở dưới
            # đọc entry.task.category, tránh 1 query riêng mỗi PATCH
            entry = CareDiaryEntry.objects.select_related(
                'task', 'task__category',
            ).get(
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
                elif field == 'mood_icon':
                    val = str(services.normalize_mood_icon(val))[:FIELD_MAX_LENGTH[field]]
                elif field in FIELD_MAX_LENGTH:
                    val = str(val)[:FIELD_MAX_LENGTH[field]]
                setattr(entry, field, str(val) if isinstance(val, str) else val)

        # CARE DIARY NÂNG CẤP — sửa loại + nội dung form đánh giá.
        # Xử lý riêng khỏi vòng mood phía trên vì assessment_data là dict,
        # không được stringify. Chỉ validate khi client gửi ít nhất 1 trong
        # 2 trường → entry cũ (general, {}) PATCH mood vẫn hoạt động bình thường.
        if 'assessment_type' in data or 'assessment_data' in data:
            assessment_type, assessment_data, err = _parse_and_validate_assessment(
                data, entry.task, entry=entry,
            )
            if err is not None:
                return err
            entry.assessment_type = assessment_type
            entry.assessment_data = assessment_data

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


class ParentCareDiaryHistoryAPIView(APIView):
    """Danh sách rút gọn nhật ký của phụ huynh — sắp xếp mới nhất trước.

    Phụ huynh xem lịch sử các buổi chăm sóc đã có nhật ký,
    bấm vào từng item để xem chi tiết (CareDiaryDetail).
    Không phân trang: số lượng task/phụ huynh có giới hạn tự nhiên,
    và codebase chưa có pattern phân trang nào để theo.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'parent':
            return Response(
                {'error': 'Chỉ phụ huynh mới xem được lịch sử nhật ký.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        history = services.get_parent_diary_history(parent=request.user)
        return Response(history, status=status.HTTP_200_OK)
