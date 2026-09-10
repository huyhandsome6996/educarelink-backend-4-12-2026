"""
matching/api/bookings.py — API booking (Step 5.5 + 7.9 + 9.4).

  POST /api/matching/jobs/{id}/select-carepartner/   auto-commit (header Idempotency-Key)
  GET  /api/matching/bookings/                       danh sách (query: role, status)
  GET  /api/matching/bookings/{id}/                  chi tiết + seconds_left + status_label_vi
  POST /api/matching/bookings/{id}/cancel/           CP hủy (reason_code, note, evidence)
  POST /api/matching/bookings/{id}/cancel-parent/    parent hủy (Step 7.7)
  POST /api/matching/bookings/{id}/report-no-show/   parent xác nhận đã đến/không đến
  POST /api/matching/bookings/{id}/start/            CP bắt đầu
  POST /api/matching/bookings/{id}/complete/         kết thúc → awaiting_review
  POST /api/matching/bookings/{id}/appeal/           CP kháng cáo
  GET  /api/matching/bookings/{id}/appeal/           trạng thái kháng cáo
  POST /api/matching/bookings/{id}/reschedule/       CP xin đổi giờ
  POST /api/matching/bookings/{id}/reschedule/respond/  parent duyệt/từ chối
"""

import logging

from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..constants import BookingStatus, CANCEL_REASONS, STATUS_LABELS_VI
from ..models import (
    Appeal,
    Booking,
    CancelPolicy,
    JobPost,
    RescheduleRequest,
)
from ..services import cancellation_service, reschedule_service
from ..services.booking_service import (
    commit_booking,
    lazy_commit_check,
    seconds_left,
    select_carepartner,
)
from ..services.cancellation_service import CancelValidationError
from ..services.elo_service import EloService
from ..services.lock_service import SlotConflictError

logger = logging.getLogger('educarelink.matching.api.booking')


def _job_address(job):
    """Địa chỉ hiển thị (best-effort) từ type_data theo loại job — QA 2026-09-11 #4."""
    td = getattr(job, 'type_data', None) or {}
    loc = td.get('pickup_location') or td.get('destination_location')
    if isinstance(loc, dict):
        return (loc.get('address') or loc.get('label') or loc.get('name') or '').strip()
    return (td.get('location_note') or '').strip()


# Nhãn dịch vụ tiếng Việt theo job_type — phục vụ UI Đơn của tôi (Stitch 2026-09-11)
CATEGORY_NAME_VI = {
    'tutoring': 'Gia sư',
    'pickup': 'Đón trẻ',
    'childcare': 'Trông trẻ',
}

WEEKDAY_NAMES_VI = {
    0: 'Thứ Hai', 1: 'Thứ Ba', 2: 'Thứ Tư', 3: 'Thứ Năm',
    4: 'Thứ Sáu', 5: 'Thứ Bảy', 6: 'Chủ Nhật',
}


def _first_slot_view(first):
    """Bổ sung hiển thị tiếng Việt cho first_slot (date vi + thứ + "Hôm nay")."""
    if not first:
        return None
    view = {'date': first.date, 'time_from': first.time_from, 'time_to': first.time_to}
    try:
        local_date = timezone.localtime(timezone.now()).date()
        days_ahead = (first.date - local_date).days
        if days_ahead == 0:
            view['day_of_week_vi'] = 'Hôm nay'
        elif days_ahead == 1:
            view['day_of_week_vi'] = 'Ngày mai'
        else:
            view['day_of_week_vi'] = WEEKDAY_NAMES_VI[first.date.weekday()]
        view['date_vi'] = first.date.strftime('%d/%m/%Y')
        view['time_from_vi'] = first.time_from.strftime('%H:%M') if first.time_from else ''
        view['time_to_vi'] = first.time_to.strftime('%H:%M') if first.time_to else ''
    except Exception:
        pass
    return view


def _booking_dict(booking):
    b = booking
    first = b.job.slots.order_by('date', 'time_from').first()
    parent = getattr(b, 'parent', None)
    job = b.job
    td = getattr(job, 'type_data', None) or {}

    # Thù lao thực nhận 80% (quy chế giải ngân ký quỹ 80/20)
    payout_vnd = int(round((b.total_value_vnd or 0) * 0.8))
    if (b.total_value_vnd or 0) > 0 and payout_vnd < 1:
        payout_vnd = 1

    # Thông tin bé (nếu job có type_data chi tiết — additive, không mock dữ liệu)
    child_info = {
        'age_group': td.get('child_age_group', ''),
        'number_of_children': td.get('number_of_children'),
        'notes': (td.get('medical_allergy_notes') or td.get('care_duties')
                  or td.get('transport_note') or td.get('location_note') or ''),
    }

    # Thông tin phụ huynh hiển thị cho CarePartner (từ record User đã select_related)
    parent_info = {
        'full_name': (f"{parent.first_name} {parent.last_name}".strip()
                      if parent else '') or getattr(parent, 'username', ''),
        'phone': getattr(parent, 'phone_number', '') or '',
        'avatar_url': getattr(parent, 'avatar_url', '') or '',
    }

    # Vị trí làm việc — nút Chỉ đường ưu tiên toạ độ, fallback địa chỉ chữ
    loc = td.get('pickup_location') or td.get('destination_location')
    loc_addr = ''
    if isinstance(loc, dict):
        loc_addr = (loc.get('address') or loc.get('label') or loc.get('name') or '').strip()

    return {
        'id': str(b.pk),
        'job_id': str(b.job_id),
        'job_title': b.job.title,
        'job_type': getattr(b.job, 'job_type', ''),
        'job_address': _job_address(b.job),
        'category_code': getattr(b.job, 'job_type', ''),
        'category_name_vi': CATEGORY_NAME_VI.get(getattr(b.job, 'job_type', ''), ''),
        'carepartner_id': str(b.carepartner_id),
        'parent_id': str(b.parent_id),
        'parent_name': (f"{parent.first_name} {parent.last_name}".strip()
                        if parent else '') or getattr(parent, 'username', ''),
        'parent_info': parent_info,
        'child_info': child_info,
        'location_info': {
            'address': _job_address(b.job) or loc_addr,
            'latitude': getattr(b.job, 'latitude', None),
            'longitude': getattr(b.job, 'longitude', None),
        },
        'status': b.status,
        'status_label_vi': STATUS_LABELS_VI.get(b.status, b.status),
        'selected_at': b.selected_at,
        'commit_deadline': b.commit_deadline,
        'seconds_left': seconds_left(b),
        'commit_seconds_left': seconds_left(b),
        'total_value_vnd': b.total_value_vnd,
        'carepartner_payout_vnd': payout_vnd,
        'compensation_vnd': b.compensation_vnd,
        'elo_delta_applied': b.elo_delta_applied,
        'cancel_reason_code': b.cancel_reason_code,
        'cancelled_at': b.cancelled_at,
        'first_slot': _first_slot_view(first),
    }


def _get_booking(pk, user=None):
    try:
        return Booking.objects.select_related('job', 'carepartner', 'parent').get(pk=pk)
    except Booking.DoesNotExist:
        return None


def _forbidden():
    return Response({'code': 'forbidden',
                     'detail': 'Bạn không có quyền thao tác đơn này.'},
                    status=status.HTTP_403_FORBIDDEN)


class SelectCarePartnerAPIView(APIView):
    """Auto-commit booking — Idempotency-Key replay trả đúng kết quả."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, job_id):
        if getattr(request.user, 'role', '') != 'parent':
            return _forbidden()
        try:
            job = JobPost.objects.get(pk=job_id)
        except JobPost.DoesNotExist:
            return Response({'code': 'not_found', 'detail': 'Không tìm thấy bài đăng.'},
                            status=status.HTTP_404_NOT_FOUND)

        carepartner_id = request.data.get('carepartner_id')
        if not carepartner_id:
            return Response({'code': 'carepartner_id_required',
                             'detail': 'Thiếu carepartner_id.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            carepartner = JobPost._meta.get_field('parent').remote_field.model.objects.get(
                pk=carepartner_id, role='worker')
        except Exception:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                carepartner = User.objects.get(pk=carepartner_id, role='worker')
            except User.DoesNotExist:
                return Response({'code': 'not_found',
                                 'detail': 'Không tìm thấy CarePartner.'},
                                status=status.HTTP_404_NOT_FOUND)

        idem_key = request.headers.get('Idempotency-Key') or ''
        if idem_key:
            cached = cache.get(f'matching:idem:{idem_key}')
            if cached:
                return Response(cached, status=status.HTTP_200_OK)

        try:
            booking, created = select_carepartner(job, carepartner,
                                                  actor_user=request.user)
        except SlotConflictError as exc:
            logger.warning('[Select] SlotTaken job %s: %s', job_id, exc)
            return Response({'code': 'slot_taken',
                             'detail': str(exc),
                             'refresh_candidates': True},
                            status=status.HTTP_409_CONFLICT)

        body = _booking_dict(booking)
        body['created'] = created
        if idem_key:
            cache.set(f'matching:idem:{idem_key}', body, 600)
        return Response(body, status=status.HTTP_201_CREATED if created
                        else status.HTTP_200_OK)


class BookingListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = request.query_params.get('role')
        status_filter = request.query_params.get('status')
        qs = Booking.objects.order_by('-created_at')
        if role == 'parent' or request.user.role == 'parent':
            qs = qs.filter(parent=request.user)
        else:
            qs = qs.filter(carepartner=request.user)
        if status_filter:
            qs = qs.filter(status=status_filter)
        # Lazy commit check cho các đơn đang chờ cam kết (Step 5 AC4)
        for b in qs.filter(status=BookingStatus.AWAITING_COMMITMENT)[:20]:
            lazy_commit_check(b)
        qs = Booking.objects.select_related('job', 'parent', 'carepartner').filter(
            pk__in=[b.pk for b in qs[:50]]).order_by('-created_at')
        return Response({'count': qs.count(),
                         'results': [_booking_dict(b) for b in qs]})


class BookingDetailAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk not in (booking.carepartner_id, booking.parent_id):
            return _forbidden()
        booking = lazy_commit_check(booking)
        return Response(_booking_dict(booking))


class BookingCommitAPIView(APIView):
    """POST commit — Carepartner XÁC NHẬN cam kết nhận đơn (QA 2026-09-10 #2).

    awaiting_commitment → committed. Grab-style: đơn chỉ dừng ở dashboard
    khi Carepartner bấm xác nhận trong thời hạn (commit_deadline).
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id:
            return _forbidden()
        booking, changed = commit_booking(booking, actor_user=request.user)
        body = _booking_dict(booking)
        body['changed'] = changed
        return Response(body)


class BookingCancelAPIView(APIView):
    """POST cancel — CP hủy: reason_code + note + evidence (Step 5.5)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id:
            return _forbidden()
        try:
            booking, created = cancellation_service.cancel_by_carepartner(
                booking,
                reason_code=request.data.get('reason_code'),
                note=request.data.get('note', ''),
                evidence=request.data.get('evidence') or [])
        except CancelValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        body = _booking_dict(booking)
        body['changed'] = created
        return Response(body)


class BookingCancelByParentAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.parent_id:
            return _forbidden()
        try:
            booking, created = cancellation_service.cancel_by_parent(
                booking, note=request.data.get('note', ''))
        except CancelValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        body = _booking_dict(booking)
        body['changed'] = created
        return Response(body)


class ReportNoShowAPIView(APIView):
    """POST report-no-show {arrived: true|false} — parent trả lời Step 7.4.2."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.parent_id:
            return _forbidden()
        arrived = request.data.get('arrived')
        if arrived is None:
            return Response({'code': 'arrived_required',
                             'detail': 'Hãy chọn [Đã đến] hoặc [Không đến].'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            booking, penalized = cancellation_service.confirm_no_show(
                booking, parent_says_arrived=bool(arrived))
        except CancelValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        body = _booking_dict(booking)
        body['penalized'] = penalized
        return Response(body)


class BookingStartAPIView(APIView):
    """POST start — CP bấm 'Bắt đầu' (committed → in_progress)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id:
            return _forbidden()
        if booking.status not in (BookingStatus.COMMITTED,
                                  BookingStatus.SUSPECTED_NO_SHOW):
            return Response({'code': 'invalid_state',
                             'detail': f'Đơn đang "{booking.get_status_display()}".'},
                            status=status.HTTP_409_CONFLICT)
        from ..services.state import transition
        booking.started_at = timezone.now()
        booking.save(update_fields=['started_at'])
        transition(booking, BookingStatus.IN_PROGRESS, actor='carepartner',
                   actor_user=request.user, reason='CP bấm bắt đầu')
        return Response(_booking_dict(Booking.objects.get(pk=pk)))


class BookingCompleteAPIView(APIView):
    """POST complete — slot kết thúc → awaiting_review (+ ELO job_completed,
    counters cập nhật)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk not in (booking.carepartner_id, booking.parent_id):
            return _forbidden()
        if booking.status != BookingStatus.IN_PROGRESS:
            return Response({'code': 'invalid_state',
                             'detail': f'Đơn đang "{booking.get_status_display()}".'},
                            status=status.HTTP_409_CONFLICT)
        _complete_booking(booking, actor_user=request.user)
        return Response(_booking_dict(Booking.objects.get(pk=pk)))


def _complete_booking(booking, actor_user=None, auto=False):
    from ..services.state import transition
    booking.ended_at = timezone.now()
    booking.save(update_fields=['ended_at'])
    transition(booking, BookingStatus.AWAITING_REVIEW, actor='system',
               actor_user=actor_user,
               reason='Tự động' if auto else 'Kết thúc đơn')
    # ELO thưởng hoàn thành + streak (Step 6.3) — idempotent per booking
    EloService.record_completion(booking.carepartner, booking)
    # Cập nhật counters cho scoring
    profile = EloService.get_profile(booking.carepartner)
    profile.jobs_completed += 1
    profile.save(update_fields=['jobs_completed'])
    LockService_release(booking)
    NotificationService_enqueue_review(booking)


def LockService_release(booking):
    from ..services.lock_service import LockService
    LockService.release_locks(booking)


def NotificationService_enqueue_review(booking):
    from ..services.notification_service import NotificationService
    NotificationService.enqueue(booking.parent, 'review_requested', data={})
    NotificationService.enqueue(booking.carepartner, 'review_requested', data={})


class AppealCreateAPIView(APIView):
    """POST: nộp kháng cáo (Step 7.6). GET: tra đơn kháng cáo mới nhất của
    booking (mobile AppealScreen dùng để hiển thị trạng thái đơn đã nộp)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id and not request.user.is_staff:
            return _forbidden()
        appeal = booking.appeals.order_by('-created_at').first()
        if appeal is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'id': str(appeal.pk), 'status': appeal.status,
                         'status_label_vi': appeal.get_status_display(),
                         'reason_code': appeal.reason_code,
                         'admin_note': appeal.admin_note})

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id:
            return _forbidden()
        try:
            appeal = cancellation_service.create_appeal(
                booking, request.user,
                reason_code=request.data.get('reason_code'),
                note=request.data.get('note', ''),
                evidence=request.data.get('evidence') or [])
        except CancelValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'id': str(appeal.pk), 'status': appeal.status,
                         'status_label_vi': appeal.get_status_display()},
                        status=status.HTTP_201_CREATED)

    def get(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id:
            return _forbidden()
        appeal = booking.appeals.order_by('-created_at').first()
        if appeal is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'id': str(appeal.pk), 'status': appeal.status,
                         'status_label_vi': appeal.get_status_display(),
                         'admin_note': appeal.admin_note,
                         'created_at': appeal.created_at})


class RescheduleCreateAPIView(APIView):
    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.carepartner_id:
            return _forbidden()
        try:
            req = reschedule_service.create_request(
                booking,
                new_date=request.data.get('date'),
                new_time_from=request.data.get('time_from'),
                new_time_to=request.data.get('time_to'),
                reason=request.data.get('reason', ''))
        except reschedule_service.RescheduleValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'id': str(req.pk), 'status': req.status,
                         'parent_deadline': req.parent_deadline},
                        status=status.HTTP_201_CREATED)


class RescheduleRespondAPIView(APIView):
    """POST {decision: approve|decline|continue|cancel} — Step 9 Rule 3."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        booking = _get_booking(pk)
        if booking is None:
            return Response({'code': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.pk != booking.parent_id:
            return _forbidden()
        decision = request.data.get('decision')
        req = RescheduleRequest.objects.filter(
            booking=booking, status='pending').order_by('-created_at').first()
        if req is None:
            return Response({'code': 'no_pending_request',
                             'detail': 'Không có yêu cầu đổi giờ nào đang chờ.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            reschedule_service.respond(req, decision, actor_user=request.user)
        except reschedule_service.RescheduleValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response({'ok': True, 'booking': _booking_dict(Booking.objects.get(pk=pk))})
