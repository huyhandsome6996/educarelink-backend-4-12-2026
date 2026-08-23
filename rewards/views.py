"""B2 — API endpoints tích điểm / đổi voucher.

Views chỉ I/O; business logic trong services.py.
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import Voucher, VoucherRedemption
from .serializers import (
    PointTransactionSerializer,
    VoucherSerializer,
    VoucherRedemptionSerializer,
)


def _require_parent(user):
    if getattr(user, 'role', None) != 'parent':
        return Response(
            {'error': 'Chỉ phụ huynh mới dùng được tính năng tích điểm.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class RewardsSummaryAPIView(APIView):
    """GET số dư điểm + hạng + lịch sử giao dịch gần đây."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        err = _require_parent(request.user)
        if err:
            return err

        balance = services.get_balance(request.user)
        tier = services.get_tier(request.user)
        history = services.get_transaction_history(request.user, limit=30)

        return Response({
            'balance': balance,
            'lifetime_points': tier['lifetime_points'],
            'tier': {
                'code': tier['code'],
                'label': tier['label'],
                'next_tier_label': tier['next_tier_label'],
                'next_tier_threshold': tier['next_tier_threshold'],
                'points_to_next': tier['points_to_next'],
            },
            'transactions': PointTransactionSerializer(history, many=True).data,
        })


class VoucherListAPIView(APIView):
    """GET danh sách voucher đang active (mọi phụ huynh đều thấy)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        err = _require_parent(request.user)
        if err:
            return err

        qs = services.list_active_vouchers()
        balance = services.get_balance(request.user)
        data = VoucherSerializer(qs, many=True).data
        # Thêm flag có đủ điểm không — tiện cho UI
        for item in data:
            item['can_redeem'] = balance >= item['points_required']
        return Response({
            'balance': balance,
            'vouchers': data,
        })


class VoucherRedeemAPIView(APIView):
    """POST đổi voucher theo id."""
    permission_classes = [IsAuthenticated]

    def post(self, request, voucher_id):
        err = _require_parent(request.user)
        if err:
            return err

        try:
            voucher = Voucher.objects.get(pk=voucher_id)
        except Voucher.DoesNotExist:
            return Response(
                {'error': 'Không tìm thấy voucher.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            redemption = services.redeem_voucher(request.user, voucher)
        except services.InsufficientPointsError as e:
            return Response(
                {
                    'error': str(e),
                    'balance': e.balance,
                    'required': e.required,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        except services.VoucherNotAvailableError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                'message': 'Đổi voucher thành công!',
                'redemption': VoucherRedemptionSerializer(redemption).data,
                'balance': services.get_balance(request.user),
            },
            status=status.HTTP_201_CREATED,
        )


class MyRedemptionsAPIView(APIView):
    """GET danh sách voucher đã đổi của phụ huynh."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        err = _require_parent(request.user)
        if err:
            return err

        qs = (
            VoucherRedemption.objects.filter(user=request.user)
            .select_related('voucher')
            .order_by('-redeemed_at')
        )
        return Response(VoucherRedemptionSerializer(qs, many=True).data)
