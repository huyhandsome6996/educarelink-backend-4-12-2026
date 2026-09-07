"""
matching/api/admin_manage.py — API quản trị cho web admin (Next.js admin-web).

Toàn bộ endpoint yêu cầu IsAdminUser (staff token SimpleJWT).
Mục tiêu: admin đổi EloBand / MatchingWeight NGAY KHÔNG CẦN DEPLOY
(Step 6 AC11 + 11.6), duyệt kháng cáo, xem state logs.
"""

from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import (
    AiCallLog,
    Appeal,
    Booking,
    EloBand,
    JobPost,
    MatchingWeight,
    StateTransitionLog,
)
from ..services import cancellation_service


class EloBandAdminAPIView(APIView):
    """GET/PUT /api/matching/admin/elo-bands/ — threshold hiệu lực ngay."""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({'results': [
            {'id': b.id, 'name': b.name, 'min_elo': b.min_elo, 'max_elo': b.max_elo,
             'rank_multiplier': str(b.rank_multiplier),
             'max_proposals_per_day': b.max_proposals_per_day,
             'label_vi': b.label_vi, 'excluded_from_matching': b.excluded_from_matching,
             'only_when_pool_below': b.only_when_pool_below}
            for b in EloBand.objects.order_by('-min_elo')
        ]})

    def put(self, request):
        """Body: {name: {min_elo, max_elo, rank_multiplier, max_proposals_per_day, ...}}"""
        data = request.data or {}
        updated = []
        for name, fields in data.items():
            band = EloBand.objects.filter(name=name).first()
            if band is None:
                continue
            for field in ('min_elo', 'max_elo', 'rank_multiplier',
                          'max_proposals_per_day', 'label_vi',
                          'excluded_from_matching', 'only_when_pool_below'):
                if field in fields:
                    setattr(band, field, fields[field])
            band.save()
            updated.append(band.name)
        return Response({'updated': updated})


class MatchingWeightAdminAPIView(APIView):
    """GET/PUT /api/matching/admin/matching-weights/ — tổng phải = 100."""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({'results': [
            {'factor': w.factor, 'weight_pct': w.weight_pct, 'is_active': w.is_active}
            for w in MatchingWeight.objects.order_by('factor')
        ]})

    def put(self, request):
        """Body: {factor: weight_pct, ...} — validate tổng 100 trước khi ghi."""
        data = request.data or {}
        if not data:
            return Response({'code': 'empty', 'detail': 'Không có thay đổi.'},
                            status=400)
        weights = {w.factor: w.weight_pct for w in MatchingWeight.objects.filter(is_active=True)}
        for factor, pct in data.items():
            if factor in weights:
                weights[factor] = int(pct)
        total = sum(weights.values())
        if total != 100:
            return Response(
                {'code': 'weight_sum_invalid',
                 'detail': f'Tổng trọng số phải = 100 (hiện = {total}).',
                 'total': total},
                status=400)
        for factor, pct in data.items():
            MatchingWeight.objects.filter(factor=factor).update(weight_pct=int(pct))
        return Response({'updated': list(data.keys()), 'total': total})


class AppealAdminAPIView(APIView):
    """GET /appeals (queue) + POST /appeals/{id}/decide {decision, admin_note}."""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get('status', 'pending')
        qs = Appeal.objects.select_related('booking', 'carepartner').order_by('-created_at')
        if status_filter and status_filter != 'all':
            qs = qs.filter(status=status_filter)
        return Response({'results': [
            {'id': str(a.pk), 'status': a.status,
             'carepartner': a.carepartner.username,
             'booking_id': str(a.booking_id),
             'reason_code': a.reason_code,
             'note': a.note, 'evidence': a.evidence,
             'ai_precheck': a.ai_precheck,
             'created_at': a.created_at,
             'decided_at': a.decided_at, 'admin_note': a.admin_note}
            for a in qs[:100]
        ]})


class AppealDecideAPIView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, pk):
        decision = request.data.get('decision')
        if decision not in ('approved', 'partially_approved', 'rejected'):
            return Response({'code': 'invalid_decision',
                             'detail': 'decision: approved | partially_approved | rejected'},
                            status=400)
        try:
            appeal = Appeal.objects.get(pk=pk)
        except Appeal.DoesNotExist:
            return Response({'code': 'not_found'}, status=404)
        try:
            appeal = cancellation_service.decide_appeal(
                appeal, admin=request.user, decision=decision,
                admin_note=request.data.get('admin_note', ''))
        except cancellation_service.CancelValidationError as exc:
            return Response({'code': 'validation_error', 'detail': str(exc)}, status=409)
        return Response({'id': str(appeal.pk), 'status': appeal.status})


class StateLogAdminAPIView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        entity = request.query_params.get('entity')
        qs = StateTransitionLog.objects.order_by('-created_at')
        if entity:
            qs = qs.filter(entity=entity)
        return Response({'results': [
            {'id': str(row.pk), 'entity': row.entity, 'entity_id': str(row.entity_id),
             'from_status': row.from_status, 'to_status': row.to_status,
             'actor': row.actor, 'reason': row.reason, 'created_at': row.created_at}
            for row in qs[:200]
        ]})


class BookingAdminAPIView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        status_filter = request.query_params.get('status')
        qs = Booking.objects.select_related('job', 'carepartner', 'parent')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({'results': [
            {'id': str(b.pk), 'status': b.status,
             'job_title': b.job.title, 'job_id': str(b.job_id),
             'carepartner': b.carepartner.username, 'parent': b.parent.username,
             'total_value_vnd': b.total_value_vnd,
             'compensation_vnd': b.compensation_vnd,
             'elo_delta_applied': b.elo_delta_applied,
             'cancel_reason_code': b.cancel_reason_code,
             'created_at': b.created_at}
            for b in qs[:100]
        ]})


class JobAdminAPIView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({'results': [
            {'id': str(j.pk), 'job_type': j.job_type, 'title': j.title,
             'parent': j.parent.username, 'status': j.status,
             'ai_parse_status': j.ai_parse_status,
             'ai_parse_result': j.ai_parse_result,
             'hourly_rate_vnd': j.hourly_rate_vnd,
             'needs_admin_review': j.needs_admin_review,
             'total_matched': j.total_matched, 'created_at': j.created_at}
            for j in JobPost.objects.select_related('parent')
            .order_by('-created_at')[:100]
        ]})
