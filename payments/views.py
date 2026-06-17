"""
╔══════════════════════════════════════════════════════════════════╗
║   Payment API Views                                               ║
║                                                                   ║
║   Endpoint map:                                                   ║
║     [Parent]                                                      ║
║       POST /api/payments/setup/             thiết lập thanh toán  ║
║       GET  /api/payments/<id>/               chi tiết payment     ║
║       GET  /api/payments/my/                 list payment parent  ║
║                                                                   ║
║     [Worker]                                                      ║
║       GET  /api/payments/my-earnings/        thu nhập carepartner  ║
║       GET  /api/payments/settlements/        kỳ hoa hồng tiền mặt  ║
║       GET  /api/payments/settlements/<id>/   chi tiết kỳ + QR      ║
║                                                                   ║
║     [Admin]                                                       ║
║       GET  /api/payments/admin/overview/     dashboard tổng quan  ║
║       GET  /api/payments/admin/all/          tất cả payment       ║
║       POST /api/payments/admin/<id>/retry-payout/   thử lại giải ngân ║
║       POST /api/payments/admin/settlements/regenerate-qr/  tạo lại QR ║
║       POST /api/payments/admin/run-settlement/   chạy cron thủ công ║
║                                                                   ║
║     [MoMo Webhook — không auth]                                   ║
║       POST /api/payments/momo-ipn/           IPN callback         ║
║       GET  /api/payments/momo-return/        redirect sau khi pay ║
║       GET  /api/payments/settlement-return/  redirect sau QR hoa hồng ║
╚══════════════════════════════════════════════════════════════════╝
"""

import logging
from decimal import Decimal
from datetime import timedelta

from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.conf import settings
from django.shortcuts import redirect
from rest_framework import generics, status, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny

from core.models import Task, User
from .models import Payment, CommissionSettlement, PaymentLog
from .serializers import (
    PaymentSerializer, SetupPaymentSerializer,
    CommissionSettlementSerializer, PaymentLogSerializer,
)
from .services import (
    setup_payment, handle_momo_ipn, release_escrow, refund_escrow,
    generate_monthly_settlements, send_settlement_reminders,
    _generate_settlement_qr,
)
from .momo_client import is_configured, is_sandbox

logger = logging.getLogger('educarelink.payments.api')


# ═══════════════════════════════════════════════════════════════════
#  PARENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

class SetupPaymentAPIView(APIView):
    """
    POST /api/payments/setup/
    Body: { task_id, method: 'momo_escrow' | 'cash' }

    Parent chọn phương thức thanh toán cho task.
    - momo_escrow: sinh payUrl MoMo để parent redirect tới.
    - cash: tạo record, hoa hồng được tổng hợp cuối tháng.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SetupPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task_id = serializer.validated_data['task_id']
        method = serializer.validated_data['method']

        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        if task.parent_id != request.user.id:
            return Response({'error': 'Bạn không sở hữu công việc này.'},
                            status=status.HTTP_403_FORBIDDEN)

        try:
            payment = setup_payment(task=task, method=method, actor=request.user)
        except (PermissionError, ValueError) as e:
            return Response({'error': str(e)},
                            status=status.HTTP_400_BAD_REQUEST)

        data = PaymentSerializer(payment).data
        # Frontend cần biết: redirect parent tới đâu
        data['next_action'] = (
            'redirect_to_momo' if method == 'momo_escrow' and payment.momo_pay_url
            else 'await_task_completion'
        )
        data['momo_configured'] = is_configured()
        data['momo_sandbox'] = is_sandbox()
        return Response(data, status=status.HTTP_200_OK)


class PaymentDetailAPIView(generics.RetrieveAPIView):
    """GET /api/payments/<id>/"""
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]
    queryset = Payment.objects.all()

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return Payment.objects.all()
        # Parent thấy payment của mình; Worker thấy payment nhận được
        return Payment.objects.filter(Q(parent=user) | Q(worker=user))


class MyPaymentsAPIView(generics.ListAPIView):
    """GET /api/payments/my/  — List payments của user (parent hoặc worker)."""
    serializer_class = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Payment.objects.filter(Q(parent=user) | Q(worker=user)).order_by('-initiated_at')


# ═══════════════════════════════════════════════════════════════════
#  WORKER ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

class MyEarningsAPIView(APIView):
    """
    GET /api/payments/my-earnings/

    Trả về tổng quan thu nhập của Carepartner:
      - total_earned (escrow đã completed)
      - pending_payout (held, chờ giải ngân)
      - cash_commission_owed (cần thanh toán cho nền tảng cuối tháng)
      - recent_payments (10 gần nhất)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới có earnings.'},
                            status=status.HTTP_403_FORBIDDEN)

        payments = Payment.objects.filter(worker=user)
        earned = payments.filter(status='completed').aggregate(
            t=Sum('worker_payout_amount'))['t'] or Decimal('0')
        pending = payments.filter(status='held').aggregate(
            t=Sum('worker_payout_amount'))['t'] or Decimal('0')

        # Hoa hồng nợ (chưa paid)
        settlements = CommissionSettlement.objects.filter(worker=user)
        owed = settlements.filter(status__in=['qr_generated', 'overdue', 'pending']).aggregate(
            t=Sum('total_amount'))['t'] or Decimal('0')

        recent = payments.order_by('-initiated_at')[:10]
        return Response({
            'total_earned': str(earned),
            'pending_payout': str(pending),
            'cash_commission_owed': str(owed),
            'recent_payments': PaymentSerializer(recent, many=True).data,
        })


class SettlementListAPIView(generics.ListAPIView):
    """GET /api/payments/settlements/ — List kỳ thanh toán của worker."""
    serializer_class = CommissionSettlementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return CommissionSettlement.objects.all().order_by('-period_year', '-period_month')
        return CommissionSettlement.objects.filter(worker=user).order_by('-period_year', '-period_month')


class SettlementDetailAPIView(generics.RetrieveAPIView):
    """GET /api/payments/settlements/<id>/"""
    serializer_class = CommissionSettlementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser:
            return CommissionSettlement.objects.all()
        return CommissionSettlement.objects.filter(worker=user)


# ═══════════════════════════════════════════════════════════════════
#  ADMIN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

class AdminPaymentOverviewAPIView(APIView):
    """GET /api/payments/admin/overview/ — Stats tổng quan."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = Payment.objects.all()
        overview = {
            'total_payments': qs.count(),
            'by_method': {
                'momo_escrow': qs.filter(method='momo_escrow').count(),
                'cash': qs.filter(method='cash').count(),
            },
            'by_status': {
                s: qs.filter(status=s).count() for s, _ in Payment.STATUS_CHOICES
            },
            'total_revenue_commission': str(
                qs.filter(status='completed').aggregate(
                    t=Sum('commission_amount'))['t'] or Decimal('0')
            ),
            'total_payout_to_workers': str(
                qs.filter(status='completed').aggregate(
                    t=Sum('worker_payout_amount'))['t'] or Decimal('0')
            ),
            'total_held_in_escrow': str(
                qs.filter(status='held').aggregate(
                    t=Sum('amount'))['t'] or Decimal('0')
            ),
            'pending_payouts_failed': qs.filter(status='payout_failed').count(),
            'settlements': {
                'total': CommissionSettlement.objects.count(),
                'qr_generated': CommissionSettlement.objects.filter(status='qr_generated').count(),
                'paid': CommissionSettlement.objects.filter(status='paid').count(),
                'overdue': CommissionSettlement.objects.filter(status='overdue').count(),
                'total_owed': str(
                    CommissionSettlement.objects.filter(
                        status__in=['qr_generated', 'overdue', 'pending']
                    ).aggregate(t=Sum('total_amount'))['t'] or Decimal('0')
                ),
            },
            'momo_configured': is_configured(),
            'momo_sandbox': is_sandbox(),
        }
        return Response(overview)


class AdminAllPaymentsAPIView(generics.ListAPIView):
    """GET /api/payments/admin/all/"""
    serializer_class = PaymentSerializer
    permission_classes = [IsAdminUser]
    queryset = Payment.objects.all().order_by('-initiated_at')

    def get_queryset(self):
        qs = Payment.objects.all().order_by('-initiated_at')
        # Filter optional
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        method_filter = self.request.query_params.get('method')
        if method_filter:
            qs = qs.filter(method=method_filter)
        return qs


class AdminRetryPayoutAPIView(APIView):
    """
    POST /api/payments/admin/<id>/retry-payout/
    Admin thử lại giải ngân khi payout_failed.
    """
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            payment = Payment.objects.get(pk=pk)
        except Payment.DoesNotExist:
            return Response({'error': 'Không tìm thấy Payment.'},
                            status=status.HTTP_404_NOT_FOUND)
        if payment.status != 'payout_failed':
            return Response({'error': f"Payment status={payment.status} — không cần retry."},
                            status=status.HTTP_400_BAD_REQUEST)
        # Reset về held rồi gọi lại release_escrow
        payment.status = 'held'
        payment.save()
        release_escrow(payment)
        return Response(PaymentSerializer(payment).data)


class AdminRegenerateSettlementQRAPIView(APIView):
    """POST /api/payments/admin/settlements/<id>/regenerate-qr/"""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            s = CommissionSettlement.objects.get(pk=pk)
        except CommissionSettlement.DoesNotExist:
            return Response({'error': 'Không tìm thấy settlement.'},
                            status=status.HTTP_404_NOT_FOUND)
        ok = _generate_settlement_qr(s)
        return Response({
            'success': ok,
            'settlement': CommissionSettlementSerializer(s).data,
        })


class AdminRunMonthlySettlementAPIView(APIView):
    """
    POST /api/payments/admin/run-settlement/
    Body optional: { year, month }  (mặc định = tháng trước)
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        year = request.data.get('year')
        month = request.data.get('month')
        if year:
            year = int(year)
        if month:
            month = int(month)
        stats = generate_monthly_settlements(year=year, month=month)
        return Response(stats)


class AdminPaymentLogsAPIView(generics.ListAPIView):
    """GET /api/payments/admin/logs/?payment_id=&settlement_id="""
    serializer_class = PaymentLogSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = PaymentLog.objects.all().order_by('-created_at')
        pid = self.request.query_params.get('payment_id')
        sid = self.request.query_params.get('settlement_id')
        if pid:
            qs = qs.filter(payment_id=pid)
        if sid:
            qs = qs.filter(settlement_id=sid)
        return qs[:500]   # cap


# ═══════════════════════════════════════════════════════════════════
#  MOMO WEBHOOK ENDPOINTS (không auth — MoMo gọi)
# ═══════════════════════════════════════════════════════════════════

class MomoIPNAPIView(APIView):
    """
    POST /api/payments/momo-ipn/
    MoMo gọi server-to-server khi giao dịch thay đổi trạng thái.
    Trả 204 để MoMo biết đã nhận.
    """
    permission_classes = [AllowAny]
    authentication_classes = []   # Bypass JWT

    def post(self, request):
        payload = request.data
        logger.info(f"[MoMo IPN] payload keys: {list(payload.keys())}")
        try:
            ok = handle_momo_ipn(payload)
            if ok:
                return Response({}, status=status.HTTP_204_NO_CONTENT)
            return Response({'error': 'invalid payload'},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"[MoMo IPN] error: {e}")
            return Response({'error': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MomoReturnAPIView(APIView):
    """
    GET /api/payments/momo-return/?order_id=...
    Redirect phụ huynh về frontend sau khi pay xong.
    (MoMo redirect browser, không phải server-to-server.)
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        order_id = request.query_params.get('orderId', '')
        result_code = request.query_params.get('resultCode', '')
        # Redirect về trang task detail trên frontend
        frontend_url = getattr(settings, 'MOMO_RETURN_BASE_URL',
                               'https://educarelink-backend.onrender.com')
        # Trích task_id từ orderId (format: EduCareLink_<task_id>_<ts>)
        task_id = ''
        parts = order_id.split('_')
        if len(parts) >= 3 and parts[0] == 'EduCareLink':
            try:
                task_id = int(parts[2])
            except ValueError:
                pass
        redirect_url = f"{frontend_url.rstrip('/')}/parent/tasks/?payment_status={result_code}&task_id={task_id}"
        return redirect(redirect_url)


class SettlementReturnAPIView(APIView):
    """GET /api/payments/settlement-return/?settlement_id=..."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        sid = request.query_params.get('settlement_id', '')
        result_code = request.query_params.get('resultCode', '')
        frontend_url = getattr(settings, 'MOMO_RETURN_BASE_URL',
                               'https://educarelink-backend.onrender.com')
        return redirect(
            f"{frontend_url.rstrip('/')}/worker/settlements/?id={sid}&status={result_code}"
        )


class PaymentHealthCheckAPIView(APIView):
    """GET /api/payments/health/ — kiểm tra MoMo config (debug)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({
            'momo_configured': is_configured(),
            'momo_sandbox': is_sandbox(),
            'commission_rate': str(getattr(settings, 'PAYMENT_COMMISSION_RATE', 0.20)),
        })
