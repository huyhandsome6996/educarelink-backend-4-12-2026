"""
matching/api/credits.py — Ví credit phụ huynh (Step 7.3).

GET /api/matching/credits/balance/ → số dư + 50 giao dịch gần nhất.
"""

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from ..serializers import CreditBalanceSerializer
from ..services.credits_service import wallet_summary


class CreditBalanceAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if getattr(request.user, 'role', '') != 'parent':
            return Response(
                {'code': 'not_a_parent',
                 'detail': 'Chỉ phụ huynh mới có ví credit.'},
                status=403)
        balance, history = wallet_summary(request.user)
        data = CreditBalanceSerializer(balance).data
        data['history'] = [
            {
                'id': str(t.pk),
                'booking_id': str(t.booking_id) if t.booking_id else None,
                'amount_vnd': t.amount_vnd,
                'kind': t.kind,
                'status': t.status,
                'issued_at': t.issued_at,
                'note': t.note,
            }
            for t in history
        ]
        return Response(data)
