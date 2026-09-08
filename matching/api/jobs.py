"""
matching/api/jobs.py — API đăng việc + danh sách ứng viên (Step 1 / 2 / 3).

  POST /api/matching/jobs/                      tạo JobPost (draft → validate)
  POST /api/matching/jobs/{id}/publish/         đăng + trigger AI parse → slots
  POST /api/matching/candidates/                danh sách max 8 CP (body: job_id)
"""

import logging

from django.db import transaction
from rest_framework import permissions, status
from rest_framework.generics import CreateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from ..constants import JobPostStatus
from ..models import JobPost, JobSlot, StateTransitionLog
from ..services import matching_service
from ..services.gemini_service import parse_job_post, seed_default_prompt_template
from ..services.job_schema import expand_slot_dates, validate_job_payload
from ..services.state import transition

logger = logging.getLogger('educarelink.matching.api')

# Model JobPost của matching — serializer inline để tránh vòng import
from rest_framework import serializers


class JobPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobPost
        fields = ['id', 'job_type', 'title', 'description', 'type_data',
                  'hourly_rate_vnd', 'status', 'ai_parse_status',
                  'latitude', 'longitude', 'location_note', 'recurrence',
                  'clarification_questions', 'total_matched', 'created_at']
        read_only_fields = ['id', 'title', 'description', 'status',
                            'ai_parse_status', 'type_data', 'recurrence',
                            'clarification_questions', 'total_matched', 'created_at']


class JobPostCreateAPIView(CreateAPIView):
    """POST /api/matching/jobs/ — parent tạo job (validate riêng từng loại)."""
    serializer_class = JobPostSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', '') != 'parent':
            return Response({'code': 'not_a_parent',
                             'detail': 'Chỉ phụ huynh mới đăng được việc.'},
                            status=status.HTTP_403_FORBIDDEN)
        job_type = request.data.get('job_type')
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        hourly_rate = request.data.get('hourly_rate_vnd') or request.data.get('hourly_rate')

        try:
            hourly_rate = int(hourly_rate)
        except (TypeError, ValueError):
            return Response({'code': 'invalid_rate',
                             'detail': 'Giá/giờ phải là số VND > 0.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if hourly_rate <= 0:
            return Response({'code': 'invalid_rate',
                             'detail': 'Giá/giờ phải là số VND > 0.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if latitude in (None, '') or longitude in (None, ''):
            return Response({'code': 'location_required',
                             'detail': 'Hãy chọn vị trí công việc trên bản đồ.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            type_data = validate_job_payload(job_type, request.data,
                                             user_role=request.user.role)
        except Exception as exc:
            detail = getattr(exc, 'detail', {'detail': str(exc)})
            return Response({'code': 'validation_error', 'detail': detail},
                            status=status.HTTP_400_BAD_REQUEST)

        # Gender guardrail Step 11.4: tutoring bỏ qua gender preference
        notice = None
        gender = request.data.get('gender_preference')
        if gender and job_type == 'tutoring':
            gender = None
            notice = 'Để đảm bảo công bằng, yêu cầu giới tính không áp dụng cho việc gia sư.'

        job = JobPost.objects.create(
            parent=request.user,
            job_type=job_type,
            hourly_rate_vnd=hourly_rate,
            latitude=float(latitude), longitude=float(longitude),
            location_note=request.data.get('location_note', '') or
            type_data.get('location_note', '') or type_data.get('pickup_location_note', ''),
            type_data=type_data,
            recurrence=type_data.get('recurrence', {}),
            gender_preference=gender or '',
            status=JobPostStatus.DRAFT,
        )
        data = JobPostSerializer(job).data
        if notice:
            data['fairness_notice'] = notice
        return Response(data, status=status.HTTP_201_CREATED)


class JobPostPublishAPIView(APIView):
    """POST /api/matching/jobs/{id}/publish/ — đăng + trigger AI parse.

    draft → published → ai_parsing (enqueue) — parse chạy Synchronous trong
    request này (MVP, không Celery); kết quả → ai_parsed + tạo JobSlots,
    hoặc ai_failed (parent phải confirm). Safety severity high → needs_admin_review.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, job_id):
        try:
            job = JobPost.objects.get(pk=job_id, parent=request.user)
        except JobPost.DoesNotExist:
            return Response({'code': 'not_found',
                             'detail': 'Không tìm thấy bài đăng.'},
                            status=status.HTTP_404_NOT_FOUND)

        if job.status == JobPostStatus.PUBLISHED:
            # Idempotent re-publish → vẫn chạy parse lại nếu chưa ai_parse
            pass
        elif job.status not in (JobPostStatus.DRAFT, JobPostStatus.AI_FAILED):
            return Response({'code': 'invalid_state',
                             'detail': f'Bài đang ở trạng thái "{job.get_status_display()}".'},
                            status=status.HTTP_409_CONFLICT)

        seed_default_prompt_template()

        with transaction.atomic():
            if job.status == JobPostStatus.DRAFT:
                transition(job, JobPostStatus.PUBLISHED, actor='parent',
                           actor_user=request.user, reason='Đăng bài')
            transition(job, JobPostStatus.AI_PARSING, actor='system',
                       actor_user=None, reason='Chạy Gemini parse')

        try:
            result, parse_status = parse_job_post(job)
        except Exception:
            logger.exception('[JobPublish] Parse crash job %s', job.pk)
            result, parse_status = None, 'fallback'

        if result is None:
            with transaction.atomic():
                transition(job, JobPostStatus.AI_FAILED, actor='system',
                           reason='AI và fallback đều lỗi')
            return Response({'code': 'ai_failed',
                             'detail': 'Không phân tích được bài đăng. Hãy kiểm tra lại các trường.'},
                            status=status.HTTP_200_OK)

        job.ai_parse_status = parse_status
        job.ai_parse_result = result
        job.title = result.get('title_vi') or job.title
        job.description = result.get('summary_vi') or job.description
        job.clarification_questions = result.get('clarification_questions') or []

        # Safety: severity high → chờ admin duyệt (Step 11.5)
        severity = result.get('safety_severity') or 'low'
        if result.get('needs_admin_review') or severity == 'high':
            job.needs_admin_review = True

        _create_slots(job)

        # LƯU ĐÚNG mọi field parse trước khi transition (transition chỉ save status)
        job.total_matched = None
        job.save(update_fields=['ai_parse_status', 'ai_parse_result', 'title',
                                'description', 'clarification_questions',
                                'needs_admin_review', 'total_matched', 'updated_at'])

        # ai_parsing → ai_parsed (hoặc needs_admin_review)
        with transaction.atomic():
            if job.needs_admin_review:
                transition(job, JobPostStatus.NEEDS_ADMIN_REVIEW, actor='system',
                           reason='Safety flag mức high')
            else:
                transition(job, JobPostStatus.AI_PARSED, actor='system',
                           reason=f'Parse xong ({parse_status})')

        return Response({
            'id': str(job.pk),
            'status': job.status,
            'status_label_vi': job.get_status_display(),
            'ai_parse_status': job.ai_parse_status,
            'title': job.title,
            'clarification_questions': job.clarification_questions,
            'slots_created': job.slots.count(),
            'needs_admin_review': job.needs_admin_review,
        })


def _create_slots(job):
    """ai_parsed → tạo JobSlot từ dates + time (Step 12.1 side effect)."""
    if job.slots.exists():
        return
    type_data = job.type_data or {}
    try:
        dates = expand_slot_dates(type_data)
    except Exception as exc:
        logger.warning('[JobPublish] expand_slot_dates lỗi: %s', exc)
        return
    from datetime import time as dtime
    tf_parts = (type_data.get('time_from') or '00:00').split(':')
    tt_parts = (type_data.get('time_to') or '00:00').split(':')
    tf = dtime(int(tf_parts[0]), int(tf_parts[1]))
    tt = dtime(int(tt_parts[0]), int(tt_parts[1]))
    for d in dates:
        JobSlot.objects.get_or_create(
            job=job, date=d, time_from=tf,
            defaults={'time_to': tt})


def _excluded_for_resent_list(job):
    """Danh sách CP bị loại khi PH xem lại danh sách ứng viên của job.

    1) CP có đơn của job này ở trạng thái cancelled_by_carepartner (CP tự hủy —
       Step 8.5: "sinh viên vừa hủy không được phép xuất hiện lại trong danh sách mới").
    2) CP đã được đề xuất >= MAX_ATTEMPT_PROPOSALS lần mà không được chọn
       (Step 8.5.3) — cách đếm khớp replacement_service._proposal_count_excluding_selected.
    """
    from ..models import Booking, CandidateProposal, ReplacementAttempt

    excluded = set(Booking.objects.filter(
        job=job, status='cancelled_by_carepartner'
    ).values_list('carepartner_id', flat=True))

    attempt_count = ReplacementAttempt.objects.filter(job=job).count()
    if attempt_count + 1 >= 3:  # = _proposal_count_excluding_selected(proposal)
        excluded.update(
            CandidateProposal.objects.filter(job=job)
            .values_list('carepartner_id', flat=True))
    return excluded


class CandidatesAPIView(APIView):
    """POST /api/matching/candidates/ {job_id} → max 8 CP (Step 2.4 contract).

    Step 8.5: CP từng TỰ HỦY đơn của job này KHÔNG được đề xuất lại trong
    danh sách mới (kể cả khi PH tự làm mới — không chỉ ở luồng replacement).
    CP được đề xuất >= 3 lần không được chọn cũng bị loại (Step 8.5.3),
    semantics khớp replacement_service.run_replacement_for_job().
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        job_id = request.data.get('job_id')
        if not job_id:
            return Response({'code': 'job_id_required',
                             'detail': 'Thiếu job_id.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            job = JobPost.objects.get(pk=job_id, parent=request.user)
        except JobPost.DoesNotExist:
            return Response({'code': 'not_found',
                             'detail': 'Không tìm thấy bài đăng.'},
                            status=status.HTTP_404_NOT_FOUND)

        if job.status not in (JobPostStatus.AI_PARSED, JobPostStatus.MATCHING,
                              JobPostStatus.NEEDS_REPLACEMENT):
            return Response({'code': 'invalid_state',
                             'detail': f'Bài đang ở trạng thái "{job.get_status_display()}".'},
                            status=status.HTTP_409_CONFLICT)

        result = matching_service.find_candidates(
            job, exclude_carepartners=_excluded_for_resent_list(job))
        if job.status == JobPostStatus.AI_PARSED:
            with transaction.atomic():
                transition(job, JobPostStatus.MATCHING, actor='system',
                           reason='Sinh danh sách ứng viên')
        if job.total_matched != result['total_matched']:
            job.total_matched = result['total_matched']
            job.save(update_fields=['total_matched'])

        # Nhãn match_level tiếng Việt cho UI (Step 3)
        from ..constants import MATCH_LEVEL_LABELS_VI
        for cand in result['candidates']:
            cand['match_level_vi'] = matching_service.label_vi_for_level(cand['match_level'])
        result['match_level_labels_vi'] = MATCH_LEVEL_LABELS_VI
        return Response(result)
