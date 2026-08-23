"""B2 — API endpoints tích điểm / đổi voucher.

Views chỉ I/O; business logic trong services.py.
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import Voucher, VoucherRedemption, PointTransaction
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


class AdminVoucherListCreateAPIView(APIView):
    """GET tất cả voucher / POST tạo voucher mới."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = Voucher.objects.all().order_by('-is_active', 'points_required', 'id')
        return Response(VoucherSerializer(qs, many=True).data)

    def post(self, request):
        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({'error': 'Thiếu tiêu đề voucher.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            points_required = int(request.data.get('points_required') or 0)
            discount_value = int(request.data.get('discount_value') or 0)
        except (TypeError, ValueError):
            return Response({'error': 'points_required / discount_value phải là số.'}, status=status.HTTP_400_BAD_REQUEST)
        if points_required <= 0 or discount_value <= 0:
            return Response({'error': 'points_required và discount_value phải > 0.'}, status=status.HTTP_400_BAD_REQUEST)

        voucher = Voucher.objects.create(
            title=title,
            description=(request.data.get('description') or '').strip(),
            points_required=points_required,
            discount_value=discount_value,
            expiry_date=request.data.get('expiry_date') or None,
            is_active=bool(request.data.get('is_active', True)),
        )
        return Response(VoucherSerializer(voucher).data, status=status.HTTP_201_CREATED)


class AdminVoucherDetailAPIView(APIView):
    """PATCH cập nhật / DELETE xóa voucher."""
    permission_classes = [IsAdminUser]

    def patch(self, request, voucher_id):
        try:
            voucher = Voucher.objects.get(pk=voucher_id)
        except Voucher.DoesNotExist:
            return Response({'error': 'Không tìm thấy voucher.'}, status=status.HTTP_404_NOT_FOUND)

        for field in ('title', 'description', 'expiry_date'):
            if field in request.data:
                val = request.data[field]
                if field == 'title':
                    val = (val or '').strip()
                    if not val:
                        return Response({'error': 'Tiêu đề không được trống.'}, status=status.HTTP_400_BAD_REQUEST)
                if field == 'expiry_date' and val == '':
                    val = None
                setattr(voucher, field, val)

        for field in ('points_required', 'discount_value'):
            if field in request.data:
                try:
                    val = int(request.data[field])
                except (TypeError, ValueError):
                    return Response({'error': f'{field} phải là số.'}, status=status.HTTP_400_BAD_REQUEST)
                if val <= 0:
                    return Response({'error': f'{field} phải > 0.'}, status=status.HTTP_400_BAD_REQUEST)
                setattr(voucher, field, val)

        if 'is_active' in request.data:
            voucher.is_active = bool(request.data['is_active'])

        voucher.save()
        return Response(VoucherSerializer(voucher).data)

    def delete(self, request, voucher_id):
        try:
            voucher = Voucher.objects.get(pk=voucher_id)
        except Voucher.DoesNotExist:
            return Response({'error': 'Không tìm thấy voucher.'}, status=status.HTTP_404_NOT_FOUND)
        voucher.delete()
        return Response({'message': 'Đã xóa voucher.'}, status=status.HTTP_200_OK)


class AdminRedemptionsListAPIView(APIView):
    """GET danh sách mã đổi voucher (mới nhất trước)."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = (
            VoucherRedemption.objects.select_related('voucher', 'user')
            .order_by('-redeemed_at')[:100]
        )
        data = []
        for r in qs:
            row = VoucherRedemptionSerializer(r).data
            row['user_id'] = r.user_id
            row['username'] = getattr(r.user, 'username', '')
            row['user_name'] = (
                f'{(r.user.last_name or "")} {(r.user.first_name or "")}'.strip()
                or r.user.username
            )
            data.append(row)
        return Response(data)


class AdminAdjustPointsAPIView(APIView):
    """POST cộng/trừ điểm thủ công cho phụ huynh."""
    permission_classes = [IsAdminUser]

    def post(self, request):
        from core.models import User

        try:
            user_id = int(request.data.get('user_id'))
            points = int(request.data.get('points'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'user_id và points phải là số nguyên.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if points == 0:
            return Response({'error': 'points không được bằng 0.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Không tìm thấy user.'}, status=status.HTTP_404_NOT_FOUND)

        if getattr(user, 'role', None) != 'parent':
            return Response(
                {'error': 'Chỉ điều chỉnh điểm cho phụ huynh.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        note = (request.data.get('note') or 'Điều chỉnh bởi admin').strip()[:255]
        tx = PointTransaction.objects.create(
            user=user,
            points=points,
            reason=PointTransaction.REASON_ADJUSTMENT,
            note=note,
        )
        balance = services.get_balance(user)
        return Response({
            'message': f'Đã {"cộng" if points > 0 else "trừ"} {abs(points)} điểm cho @{user.username}.',
            'transaction_id': tx.id,
            'balance': balance,
        }, status=status.HTTP_201_CREATED)
