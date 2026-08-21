"""B4 — API admin set/recompute hạng CarePartner."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status

from .models import User


class AdminSetWorkerTierAPIView(APIView):
    """Admin set hạng thủ công (bật tier_override). Body: {\"tier\": \"silver\"}"""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        from core.services.tier_service import set_tier_manual, tier_label
        tier = (request.data.get('tier') or '').strip().lower()
        try:
            worker = User.objects.get(id=user_id, role='worker')
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy CarePartner.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            set_tier_manual(worker, tier, actor=request.user)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'message': f'Đã set hạng {tier_label(tier)} cho {worker.username}.',
            'tier': worker.tier,
            'tier_label': tier_label(worker.tier),
            'tier_override': True,
        })


class AdminRecomputeWorkerTierAPIView(APIView):
    """Admin tính lại hạng theo rule (bỏ override)."""
    permission_classes = [IsAdminUser]

    def post(self, request, user_id):
        from core.services.tier_service import refresh_tier, tier_label
        try:
            worker = User.objects.get(id=user_id, role='worker')
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy CarePartner.'}, status=status.HTTP_404_NOT_FOUND)
        new_tier = refresh_tier(worker, force=True)
        worker.refresh_from_db()
        return Response({
            'message': f'Đã tính lại hạng cho {worker.username}.',
            'tier': new_tier,
            'tier_label': tier_label(new_tier),
            'tier_meta': worker.tier_meta,
            'tier_override': False,
        })
