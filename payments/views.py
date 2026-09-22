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
import time
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
# PayOS — import cấp module để test có thể mock (unittest.mock.patch)
from .payos_client import (
    create_payment_link, verify_webhook, cancel_payment_link,
    is_payos_enabled, confirm_webhook,
)

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

        # ⚡ BUG-006 fix: Block setup 2 lần — chỉ cho phép nếu chưa có payment
        # hoặc payment cũ đã cancelled (cho phép retry)
        existing = Payment.objects.filter(task=task).first()
        if existing and existing.status not in ('cancelled', 'pending'):
            return Response({
                'error': 'Công việc này đã được thiết lập thanh toán rồi.',
                'existing_payment_id': existing.id,
                'existing_method': existing.method,
                'existing_status': existing.status,
            }, status=status.HTTP_400_BAD_REQUEST)

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
        return qs[:500]  # ⚡ Security: cap 500 records (chống DoS)


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
    """GET /api/payments/health/ — kiểm tra MoMo + PayOS config (debug)."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({
            'momo_configured': is_configured(),
            'momo_sandbox': is_sandbox(),
            'payos_enabled': is_payos_enabled(),
            'commission_rate': str(getattr(settings, 'PAYMENT_COMMISSION_RATE', 0.20)),
        })


# ═══════════════════════════════════════════════════════════════════
#  PAYOS ENDPOINTS (VietQR bank transfer — miễn phí 100%)
# ═══════════════════════════════════════════════════════════════════

class PayOSSetupAPIView(APIView):
    """
    POST /api/payments/payos-setup/
    Body: { task_id }

    ── VIETQR GATE (feature/vietqr-payment-gate-booking) ──
    Được gọi NGAY SAU khi phụ huynh chọn CarePartner (task đang
    'pending_payment'). Tạo PayOS payment link → phụ huynh quét QR VietQR.
    CHỈ SAU webhook PAID, booking mới được xác nhận
    (application accepted + task in_progress).

    Returns:
        {
            "checkout_url": "https://payos.vn/...",
            "payment_link_id": "...",
            "order_code": 12345,
            "amount": 200000,
            "qr_code": "data:image/png;base64,...",   # nếu PayOS trả về
            "qr_expires_at": "2026-09-17T10:45:00Z",  # hạn QR để đếm ngược
            "payment_id": 7
        }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.utils.dateparse import parse_datetime

        if not is_payos_enabled():
            return Response({
                'error': 'PayOS chưa được cấu hình. Vui lòng liên hệ admin.',
                'fallback': 'Sử dụng MoMo hoặc Tiền mặt.',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        task_id = request.data.get('task_id')
        if not task_id:
            return Response({'error': 'task_id là bắt buộc.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        if task.parent_id != request.user.id:
            return Response({'error': 'Bạn không sở hữu công việc này.'},
                            status=status.HTTP_403_FORBIDDEN)

        # ── VietQR gate: chỉ tạo QR khi phụ huynh VỪA chọn CarePartner ──
        # (trước đây điều kiện là task 'in_progress' — luồng sau-chọn.)
        if task.status != 'pending_payment':
            return Response({'error': 'Công việc chưa ở trạng thái chờ thanh toán.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # CarePartner đang chờ thanh toán (payment_pending) — KHÔNG còn lấy
        # từ 'accepted' vì 'accepted' chỉ được set sau khi webhook PAID.
        pending_app = task.applications.filter(status='payment_pending').first()
        if not pending_app:
            return Response({'error': 'Không tìm thấy CarePartner đang chờ thanh toán cho công việc này.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Tạo hoặc update Payment record.
        # get_or_create: payment có thể đã tồn tại ở lần chọn TRƯỚC bị huỷ
        # (rollback → status='cancelled') — phải reset về 'pending' + gán lại
        # worker là CarePartner vừa được chọn lần này.
        payment, created = Payment.objects.get_or_create(
            task=task,
            defaults={
                'parent': task.parent,
                'worker': pending_app.worker,
                'amount': task.price,
                'method': 'payos',
                'status': 'pending',
            }
        )

        if payment.method != 'payos' and payment.status not in ('cancelled', 'pending'):
            return Response({
                'error': 'Công việc này đã được thiết lập thanh toán với phương thức khác.',
                'existing_method': payment.method,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Tạo PayOS payment link
        order_code = int(f"{task.id}{int(time.time())}"[:15])  # max 15 digits
        description = f"ECL task {task.id} - {task.title[:30]}"

        result = create_payment_link(
            order_code=order_code,
            amount=int(task.price),
            description=description,
            buyer_name=f"{task.parent.last_name} {task.parent.first_name}".strip()[:50],
            buyer_email=task.parent.email[:100] if task.parent.email else None,
            buyer_phone=task.parent.phone_number[:20] if task.parent.phone_number else None,
        )

        if not result:
            return Response({
                'error': 'Không thể tạo payment link PayOS. Vui lòng thử lại hoặc dùng MoMo.',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Update payment record — reset trạng thái để lần chọn mới sạch sẽ
        payment.method = 'payos'
        payment.status = 'pending'
        payment.worker = pending_app.worker
        payment.amount = task.price
        payment.payos_order_code = result['order_code']
        payment.payos_checkout_url = result['checkout_url']
        payment.payos_payment_link_id = result.get('payment_link_id')
        payment.payos_status = 'PENDING'
        payment.payos_expires_at = parse_datetime(result['expired_at']) if result.get('expired_at') else None
        if payment.payos_expires_at is None:
            # PayOS không trả hạn → fallback N phút (settings) để cron expiry
            # biết thời điểm rollback, tránh task kẹt ở 'pending_payment'.
            from datetime import timedelta as _timedelta
            payment.payos_expires_at = timezone.now() + _timedelta(
                minutes=int(getattr(settings, 'PAYOS_SELECTION_TIMEOUT_MINUTES', 15)))
        payment.save()

        # Log
        PaymentLog.objects.create(
            payment=payment,
            event_type='payos_link_created',
            message=f'PayOS payment link created: order_code={result["order_code"]}',
            payload={k: v for k, v in result.items() if k != 'qr_code'},
            actor=request.user,
        )

        response_data = {
            'checkout_url': result['checkout_url'],
            'payment_link_id': result.get('payment_link_id'),
            'order_code': result['order_code'],
            'amount': int(task.price),
            'description': description,
            'payment_id': payment.id,
            'status': 'pending',
            # Hạn QR để frontend đếm ngược (ISO 8601) — null nếu PayOS không trả
            'qr_expires_at': result.get('expired_at'),
        }
        if result.get('qr_code'):
            response_data['qr_code'] = result['qr_code']
        return Response(response_data, status=status.HTTP_200_OK)


class PayOSWebhookAPIView(APIView):
    """
    POST /api/payments/payos-webhook/

    ── VIETQR GATE ──
    PayOS gọi webhook này khi:
    - Parent chuyển khoản thành công → status=PAID:
        1. payment → 'held' (escrow) — như cũ
        2. (MỚI) xác nhận đặt lịch: application 'payment_pending' → 'accepted',
           task 'pending_payment' → 'in_progress', reject các application khác,
           gửi notification "🎉 Chúc mừng bạn!" cho CarePartner
           (payments.services.confirm_booking_after_payment)
        3. (BẢO MẬT) số tiền webhook KHÁCH payment.amount → KHÔNG set 'held',
           KHÔNG xác nhận đặt lịch — ghi log 'payos_amount_mismatch' để admin soát.
    - Parent huỷ / link hết hạn → status=CANCELLED/EXPIRED:
        rollback application → 'pending', task → 'open'
        (payments.services.rollback_pending_selection)

    ⚠️ Endpoint này KHÔNG cần auth (PayOS gọi server-to-server).
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from .services import confirm_booking_after_payment, rollback_pending_selection

        webhook_body = request.data if isinstance(request.data, dict) else {}

        result = verify_webhook(webhook_body)
        if not result:
            logger.warning('[PayOS Webhook] Verification failed')
            return Response({'error': 'Webhook verification failed'},
                            status=status.HTTP_400_BAD_REQUEST)

        order_code = result.get('order_code')
        payos_status = result.get('status')
        amount = result.get('amount')

        if not order_code:
            logger.warning(f'[PayOS Webhook] No order_code in webhook: {result}')
            return Response({'error': 'No order_code'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Find payment by payos_order_code
        try:
            payment = Payment.objects.get(payos_order_code=order_code)
        except Payment.DoesNotExist:
            logger.warning(f'[PayOS Webhook] Payment not found for order_code={order_code}')
            return Response({'error': 'Payment not found'},
                            status=status.HTTP_404_NOT_FOUND)

        # ── BẢO MẬT (test #6): số tiền phải khớp payment.amount ──
        # Tránh kịch bản webhook giả/mất đồng bộ xác nhận booking với số tiền
        # thực nhận. Chỉ so khi cả 2 bên đều có số tiền hợp lệ.
        try:
            webhook_amount = int(amount) if amount is not None else None
        except (TypeError, ValueError):
            webhook_amount = None
        if webhook_amount is not None and int(payment.amount) != webhook_amount:
            payment.payos_status = payos_status  # ghi nhận để admin soát
            payment.save(update_fields=['payos_status'])
            PaymentLog.objects.create(
                payment=payment,
                event_type='payos_amount_mismatch',
                message=(f'PayOS webhook amount={webhook_amount} VNĐ KHÁCH với '
                         f'payment.amount={int(payment.amount)} VNĐ — KHÔNG xác nhận '
                         f'escrow/đặt lịch.'),
                payload=result,
            )
            logger.warning(f'[PayOS Webhook] Amount mismatch order_code={order_code}: '
                           f'webhook={webhook_amount} vs payment={payment.amount}')
            return Response({'error': 'Amount mismatch'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Update payment status
        payment.payos_status = payos_status

        if payos_status == 'PAID':
            # Parent đã chuyển khoản → escrow
            payment.status = 'held'
            payment.held_at = timezone.now()
            payment.payos_account_reference = result.get('account_reference')

            PaymentLog.objects.create(
                payment=payment,
                event_type='payos_payment_held',
                message=f'PayOS payment held: {amount} VNĐ from {result.get("account_reference")}',
                payload=result,
            )

            # Notify parent + worker
            try:
                from core.models import Notification
                from core.views import send_expo_push_notification

                Notification.objects.create(
                    recipient=payment.parent,
                    title="✅ Đã nhận thanh toán",
                    message=f'Phụ huynh đã thanh toán {int(amount):,}đ cho công việc "{payment.task.title}". Tiền đang được giữ.',
                )
                if payment.parent.expo_push_token:
                    send_expo_push_notification(
                        token=payment.parent.expo_push_token,
                        title="✅ Đã nhận thanh toán",
                        body=f'{int(amount):,}đ đã được giữ cho công việc "{payment.task.title}"',
                        data={'type': 'payment_held', 'task_id': payment.task.id}
                    )

                if payment.worker:
                    Notification.objects.create(
                        recipient=payment.worker,
                        title="💰 Tiền đã được giữ",
                        message=f'Công việc "{payment.task.title}" đã được thanh toán. Hãy yên tâm làm việc!',
                    )
                    if payment.worker.expo_push_token:
                        send_expo_push_notification(
                            token=payment.worker.expo_push_token,
                            title="💰 Tiền đã được giữ",
                            body=f'Công việc "{payment.task.title}" đã có tiền. Yên tâm làm việc nhé!',
                            data={'type': 'payment_held', 'task_id': payment.task.id}
                        )
            except Exception as e:
                logger.warning(f'[PayOS Webhook] Notify failed: {e}')

            payment.save()

            # ── VIETQR GATE: xác nhận đặt lịch SAU khi escrow xong ──
            # application accepted + task in_progress + reject others +
            # notification "🎉 Chúc mừng bạn!" — transaction + select_for_update.
            try:
                confirm_booking_after_payment(payment, source='webhook')
            except Exception as e:
                # Escrow đã 'held' — confirm lỗi (hiếm) KHÔNG được làm mất tiền:
                # log nghiêm trọng để admin soi, trả 200 để PayOS ngừng retry
                # (confirm là idempotent — có thể chạy lại thủ công).
                logger.exception(
                    f'[PayOS Webhook] confirm_booking_after_payment thất bại '
                    f'payment#{payment.id} task#{payment.task_id}: {e}')
        else:
            payment.save()
            if payos_status in ('CANCELLED', 'EXPIRED'):
                # ── VIETQR GATE: rollback lựa chọn chưa thanh toán ──
                # application → 'pending', task → 'open' (để chọn người khác).
                # rollback_pending_selection đã ghi PaymentLog tương ứng.
                rollback_pending_selection(
                    payment,
                    event_type='payos_payment_cancelled' if payos_status == 'CANCELLED'
                               else 'vietqr_selection_expired',
                    message=f'PayOS webhook {payos_status} — rollback về open/pending',
                )

        logger.info(f'[PayOS Webhook] Processed: order_code={order_code} status={payos_status}')
        return Response({'status': 'ok'}, status=status.HTTP_200_OK)


class PayOSReturnAPIView(APIView):
    """GET /api/payments/payos-return/ — Redirect parent sau khi pay thành công."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        order_code = request.query_params.get('orderCode')
        status_param = request.query_params.get('status', 'PAID')
        frontend_url = getattr(settings, 'PAYOS_RETURN_BASE_URL',
                               'https://educarelink-backend.onrender.com')
        return redirect(
            f"{frontend_url.rstrip('/')}/parent/tasks/?payment=payos_success&order={order_code}"
        )


class PayOSCancelAPIView(APIView):
    """GET /api/payments/payos-cancel/ — Redirect parent khi hủy payment."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        order_code = request.query_params.get('orderCode')
        frontend_url = getattr(settings, 'PAYOS_RETURN_BASE_URL',
                               'https://educarelink-backend.onrender.com')
        return redirect(
            f"{frontend_url.rstrip('/')}/parent/tasks/?payment=payos_cancelled&order={order_code}"
        )


class PaymentStatusAPIView(APIView):
    """
    GET /api/payments/<id>/status/

    Endpoint nhẹ cho frontend POLLING trong màn hình QR VietQR
    (mobile PaymentQRScreen & web modal trả về 3 field thay vì full record).
    Parent sở hữu payment / worker được chọn / admin mới được xem.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related('task').get(pk=pk)
        except Payment.DoesNotExist:
            return Response({'error': 'Không tìm thấy Payment.'},
                            status=status.HTTP_404_NOT_FOUND)

        user = request.user
        allowed = (user.is_superuser
                   or payment.parent_id == user.id
                   or payment.worker_id == user.id)
        if not allowed:
            return Response({'error': 'Bạn không có quyền xem payment này.'},
                            status=status.HTTP_403_FORBIDDEN)

        return Response({
            'payment_id': payment.id,
            'task_id': payment.task_id,
            'status': payment.status,
            'payos_status': payment.payos_status,
            'task_status': payment.task.status,
            'checkout_url': payment.payos_checkout_url,
            'qr_expires_at': payment.payos_expires_at.isoformat() if payment.payos_expires_at else None,
        })


class CancelSelectionAPIView(APIView):
    """
    POST /api/payments/<id>/cancel-selection/

    ── VIETQR GATE ──
    Phụ huynh bấm "Huỷ" khi đang xem QR VietQR: huỷ payment đang 'pending' +
    rollback lựa chọn (application 'payment_pending' → 'pending', task
    'pending_payment' → 'open') + gọi PayOS API huỷ payment link nếu có.
    Chỉ parent CHỦ SỞ HỮU payment mới được huỷ, và chỉ khi chưa thanh toán.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from .services import rollback_pending_selection

        try:
            payment = Payment.objects.select_related('task').get(pk=pk)
        except Payment.DoesNotExist:
            return Response({'error': 'Không tìm thấy Payment.'},
                            status=status.HTTP_404_NOT_FOUND)

        if payment.parent_id != request.user.id and not request.user.is_superuser:
            return Response({'error': 'Chỉ phụ huynh sở hữu payment mới được huỷ.'},
                            status=status.HTTP_403_FORBIDDEN)

        if payment.status != 'pending':
            return Response({'error': f'Payment đang ở trạng thái "{payment.status}" — không thể huỷ lựa chọn.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Huỷ payment link phía PayOS (best-effort — link hết hạn cũng không sao)
        if payment.payos_order_code:
            cancel_payment_link(payment.payos_order_code,
                                'Phụ huynh huỷ chọn CarePartner trước khi thanh toán')

        changed = rollback_pending_selection(
            payment,
            event_type='selection_cancelled',
            message=f'Parent#{request.user.id} huỷ chọn CarePartner khi đang xem QR — task#{payment.task_id} về open',
            actor=request.user,
        )
        return Response({
            'message': ('Đã huỷ lựa chọn. Bạn có thể chọn CarePartner khác.' if changed
                        else 'Lựa chọn đã được huỷ trước đó.'),
            'task_id': payment.task_id,
            'task_status': payment.task.status,
        })


class PayOSConfirmWebhookAPIView(APIView):
    """
    POST /api/payments/payos-confirm-webhook/
    Admin gọi 1 lần để register webhook URL với PayOS.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        webhook_url = request.data.get('webhook_url') or getattr(settings, 'PAYOS_WEBHOOK_URL', '')

        if not webhook_url:
            return Response({'error': 'webhook_url is required'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Trả 503 nếu PayOS chưa config credentials (tránh 500 confusing)
        if not is_payos_enabled():
            return Response({
                'error': 'PayOS chưa được cấu hình. Vui lòng set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY trước.',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        success = confirm_webhook(webhook_url)
        if success:
            return Response({'message': f'Webhook confirmed: {webhook_url}'})
        else:
            return Response({'error': 'Failed to confirm webhook'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
