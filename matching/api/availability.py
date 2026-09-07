"""
matching/api/availability.py — API lịch rảnh + blackout (Step 4 + 9).

Path chuẩn spec:
  GET|POST      /api/carepartners/me/availability
  PUT|DELETE    /api/carepartners/me/availability/<uuid>/
  PUT           /api/carepartners/me/availability/bulk
  GET|POST      /api/carepartners/me/blackouts
  DELETE        /api/carepartners/me/blackouts/<uuid>/

(Endpoint cũ /api/worker/availability/ của core vẫn sống song song.)
"""

import logging

from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CarePartnerAvailability, CarePartnerBlackout
from ..serializers import (
    AvailabilityBulkSerializer,
    AvailabilityWindowSerializer,
    BlackoutSerializer,
)
from ..services.availability_service import (
    AvailabilityLockedError,
    BlackoutConflictError,
    TooManyBlackoutsError,
    can_delete_window,
    check_overlap_same_day,
    create_blackout,
    split_midnight,
)
from ..services.lock_service import invalidate_availability_cache

logger = logging.getLogger('educarelink.matching.api')

WORKER_ONLY = permissions.IsAuthenticated & ~permissions.IsAdminUser


def _ensure_worker(user):
    """User phải là CarePartner (role=worker). Trả lỗi hoặc None."""
    if getattr(user, 'role', '') != 'worker':
        return Response(
            {'code': 'not_a_carepartner',
             'detail': 'Chỉ CarePartner mới có lịch rảnh / ngày bận.'},
            status=status.HTTP_403_FORBIDDEN)
    return None


class AvailabilityListCreateAPIView(generics.ListCreateAPIView):
    """GET: toàn bộ window lịch tuần của chính mình. POST: thêm 1 window."""
    serializer_class = AvailabilityWindowSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (CarePartnerAvailability.objects
                .filter(carepartner=self.request.user)
                .order_by('weekday', 'time_from'))

    def list(self, request, *args, **kwargs):
        # Spec Step 4: GET trả {"windows": [...]}
        data = AvailabilityWindowSerializer(self.get_queryset(), many=True).data
        return Response({'windows': data})

    def create(self, request, *args, **kwargs):
        err = _ensure_worker(request.user)
        if err:
            return err
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        wd = ser.validated_data['weekday']
        tf, tt = ser.validated_data['time_from'], ser.validated_data['time_to']

        # Overlap cùng ngày → 400 + gợi ý merge (Step 4)
        overlaps = check_overlap_same_day(request.user, wd, tf, tt)
        if overlaps:
            merge = [{'id': str(w.pk), 'weekday': w.weekday,
                      'time_from': str(min(w.time_from, tf)),
                      'time_to': str(max(w.time_to, tt))} for w in overlaps]
            return Response(
                {'code': 'overlap_windows',
                 'detail': 'Khung giờ này chồng lấn khung đã có trong cùng ngày.',
                 'merge_suggestion': merge[0] if len(merge) == 1 else merge},
                status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            created_rows = []
            for w_day, w_from, w_to in split_midnight(wd, tf, tt):
                row, _created = CarePartnerAvailability.objects.get_or_create(
                    carepartner=request.user, weekday=w_day,
                    time_from=w_from, time_to=w_to)
                created_rows.append(row)
        invalidate_availability_cache(request.user)
        data = AvailabilityWindowSerializer(created_rows, many=True).data
        return Response({'windows': data}, status=status.HTTP_201_CREATED)


class AvailabilityDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    """PUT: sửa window. DELETE: xóa — 409 nếu booking active đang dùng."""
    serializer_class = AvailabilityWindowSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'put', 'patch', 'delete']

    def get_queryset(self):
        return CarePartnerAvailability.objects.filter(carepartner=self.request.user)

    def update(self, request, *args, **kwargs):
        window = self.get_object()
        ser = self.get_serializer(window, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        wd = ser.validated_data.get('weekday', window.weekday)
        tf = ser.validated_data.get('time_from', window.time_from)
        tt = ser.validated_data.get('time_to', window.time_to)

        # Rule 2 (Step 9.1): booking active nằm trong khung CŨ nhưng khung MỚI
        # không còn phủ trọn slot đó → 409 availability_locked_by_booking.
        from ..constants import BUSY_BOOKING_STATUSES
        from ..models import Booking

        def _overlaps(a1, a2, b1, b2):
            return a1 < b2 and b1 < a2

        for booking in Booking.objects.filter(
                carepartner=request.user, status__in=BUSY_BOOKING_STATUSES).distinct():
            for slot in booking.job.slots.all().only('date', 'time_from', 'time_to'):
                if slot.date.weekday() != wd:
                    continue
                in_old = _overlaps(window.time_from, window.time_to,
                                   slot.time_from, slot.time_to)
                in_new = tf <= slot.time_from and slot.time_to <= tt
                if in_old and not in_new:
                    return Response(
                        {'code': 'availability_locked_by_booking',
                         'detail': 'Đang có đơn - không thể sửa. Hãy hủy đơn nếu cần.'},
                        status=status.HTTP_409_CONFLICT)

        overlaps = check_overlap_same_day(request.user, wd, tf, tt, exclude_pk=window.pk)
        if overlaps:
            return Response(
                {'code': 'overlap_windows',
                 'detail': 'Khung giờ này chồng lấn khung đã có trong cùng ngày.',
                 'merge_suggestion': {'weekday': wd, 'time_from': str(min(overlaps[0].time_from, tf)),
                                      'time_to': str(max(overlaps[0].time_to, tt))}},
                status=status.HTTP_400_BAD_REQUEST)

        window = ser.save()
        invalidate_availability_cache(request.user)
        return Response(AvailabilityWindowSerializer(window).data)

    def destroy(self, request, *args, **kwargs):
        window = self.get_object()
        allowed, booking = can_delete_window(window)
        if not allowed:
            return Response(
                {'code': 'availability_locked_by_booking',
                 'detail': 'Đang có đơn - không thể xóa. Hãy hủy đơn nếu cần.',
                 'booking_id': str(booking.pk) if booking else None},
                status=status.HTTP_409_CONFLICT)
        window.delete()
        invalidate_availability_cache(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvailabilityBulkAPIView(APIView):
    """PUT bulk — thay toàn bộ lịch tuần (onboarding "Lưu lịch").
    All-or-nothing: ≥1 window mới xóa trúng booking → FAIL TOÀN BỘ 409."""

    permission_classes = [permissions.IsAuthenticated]

    def put(self, request):
        err = _ensure_worker(request.user)
        if err:
            return err
        ser = AvailabilityBulkSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        windows = ser.validated_data['windows']

        # Kiểm tra booking active trên toàn bộ window hiện có trước khi xóa
        existing = CarePartnerAvailability.objects.filter(carepartner=request.user)
        new_keys = {(w['weekday'], w['time_from'], w['time_to']) for w in windows}
        to_delete = []
        for w in existing:
            covered = any(
                w.weekday == wd and tf <= w.time_from and w.time_to <= tt
                for wd, tf, tt in new_keys)
            if not covered:
                to_delete.append(w)
        for w in to_delete:
            allowed, _booking = can_delete_window(w)
            if not allowed:
                return Response(
                    {'code': 'availability_locked_by_booking',
                     'detail': 'Đang có đơn - không thể thay đổi lịch. Hãy hủy đơn nếu cần.'},
                    status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            to_delete_pk = [w.pk for w in to_delete]
            CarePartnerAvailability.objects.filter(pk__in=to_delete_pk).delete()
            for wd, tf, tt in [(w['weekday'], w['time_from'], w['time_to']) for w in windows]:
                for r_day, r_from, r_to in split_midnight(wd, tf, tt):
                    CarePartnerAvailability.objects.get_or_create(
                        carepartner=request.user, weekday=r_day,
                        time_from=r_from, time_to=r_to)
        invalidate_availability_cache(request.user)
        data = AvailabilityWindowSerializer(
            CarePartnerAvailability.objects.filter(carepartner=request.user), many=True).data
        return Response({'windows': data})


class BlackoutListCreateAPIView(generics.ListCreateAPIView):
    """GET: các ngày bận tương lai. POST: tạo — 409 khi trùng booking."""
    serializer_class = BlackoutSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from django.utils import timezone
        return (CarePartnerBlackout.objects
                .filter(carepartner=self.request.user,
                        date__gte=timezone.localdate())
                .order_by('date', 'time_from'))

    def create(self, request, *args, **kwargs):
        err = _ensure_worker(request.user)
        if err:
            return err
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            blackout = create_blackout(
                request.user,
                date=ser.validated_data['date'],
                time_from=ser.validated_data.get('time_from'),
                time_to=ser.validated_data.get('time_to'),
                reason=ser.validated_data.get('reason', 'other'),
                note=ser.validated_data.get('note', ''))
        except BlackoutConflictError as exc:
            return Response({'code': 'blackout_conflicts_with_booking',
                             'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        except TooManyBlackoutsError as exc:
            return Response({'code': 'too_many_blackouts',
                             'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BlackoutSerializer(blackout).data, status=status.HTTP_201_CREATED)


class BlackoutDetailAPIView(generics.DestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CarePartnerBlackout.objects.filter(carepartner=self.request.user)

    def perform_destroy(self, instance):
        invalidate_availability_cache(self.request.user, instance.date)
        instance.delete()
