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
    lazy_commit_check,
    seconds_left,
    select_carepartner,
)
from ..services.cancellation_service import CancelValidationError
from ..services.elo_service import EloService
from ..services.lock_service import SlotConflictError

logger = logging.getLogger('educarelink.matching.api.booking')


def _booking_dict(booking):
    b = booking
    first = b.job.slots.order_by('date', 'time_from').first()
    return {
        'id': str(b.pk),
        'job_id': str(b.job_id),
        'job_title': b.job.title,
        'carepartner_id': str(b.carepartner_id),
        'parent_id': str(b.parent_id),
        'status': b.status,
        'status_label_vi': STATUS_LABELS_VI.get(b.status, b.status),
        'selected_at': b.selected_at,
        'commit_deadline': b.commit_deadline,
        'seconds_left': seconds_left(b),
        'total_value_vnd': b.total_value_vnd,
        'compensation_vnd': b.compensation_vnd,
        'cancel_reason_code': b.cancel_reason_code,
        'first_slot': ({'date': first.date, 'time_from': first.time_from,
                        'time_to': first.time_to} if first else None),
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
        qs = Booking.objects.filter(
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
    permission_classes = [permissions.IsAuthenticated]

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
