"""
API Views cho module Payments (MoMo + Escrow + Commission 20%).

ENDPOINTS:
  ── MoMo Payment Gateway ────────────────────────────────────────
  POST /api/payments/momo/create/                  Parent tạo đơn MoMo cho task
  GET  /api/payments/momo/return/                  Return URL (frontend) — chỉ hiển thị trạng thái
  POST /api/payments/momo/ipn/                     MoMo IPN (notifyUrl) — AllowAny

  ── Wallet ──────────────────────────────────────────────────────
  GET  /api/payments/wallet/                       Xem ví của user hiện tại
  PATCH /api/payments/wallet/                      Cập nhật momo_phone / bank info
  GET  /api/payments/wallet/transactions/          Lịch sử giao dịch ví
  POST /api/payments/wallet/withdraw/              Worker rút tiền về MoMo (Disbursement)

  ── Task Payment Status ─────────────────────────────────────────
  GET  /api/payments/task/<task_id>/               Xem trạng thái thanh toán của task

  ── Commission (Worker) ─────────────────────────────────────────
  GET  /api/payments/commission/my-debts/          Worker xem nợ hoa hồng
  GET  /api/payments/commission/my-statements/     Worker xem bảng kê tháng
  GET  /api/payments/commission/statements/<id>/   Chi tiết statement + QR URL

  ── Admin ───────────────────────────────────────────────────────
  GET  /api/payments/admin/transactions/           Tất cả giao dịch (filter theo type/user)
  GET  /api/payments/admin/statements/             Tất cả statement (filter theo status/month)
  POST /api/payments/admin/statements/<id>/mark-paid/   Admin xác nhận đã nhận tiền
  POST /api/payments/admin/statements/generate/    Trigger gen statements (manual)
  GET  /api/payments/admin/revenue/                Tổng quan doanh thu hoa hồng
  GET  /api/payments/admin/scheduler-stats/        Trạng thái commission scheduler
"""
import logging
from decimal import Decimal
from datetime import date, timedelta

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from django.utils import timezone
from django.db.models import Sum, Count, Q

from core.models import Task, User
from payments.models import (
    Wallet, PaymentOrder, EscrowTransaction,
    CommissionDebt, MonthlyCommissionStatement,
)
from payments.services import momo_service, escrow_service, commission_service
from .serializers import (
    WalletSerializer, WalletUpdateSerializer, PaymentOrderSerializer,
    EscrowTransactionSerializer, CommissionDebtSerializer,
    MonthlyCommissionStatementSerializer, CreateMoMoPaymentSerializer,
    WithdrawSerializer,
)

logger = logging.getLogger('educarelink.payments_views')


# ───────────────────────────────────────────────────────────────────
# MoMo PAYMENT GATEWAY
# ───────────────────────────────────────────────────────────────────
class CreateMoMoPaymentAPIView(APIView):
    """
    POST /api/payments/momo/create/
    Body: { "task_id": 123 }

    Logic:
      1. Lấy PaymentOrder của task (signal đã tự tạo cash khi task created)
      2. Validate: parent là owner, task.status='open', chưa có payment thành công
      3. Đổi method → momo, status → pending
      4. Gọi MoMo API → nhận payUrl
      5. Trả về payUrl cho frontend mở
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateMoMoPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task_id = serializer.validated_data['task_id']

        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        if task.parent != request.user:
            return Response({'error': 'Bạn không phải chủ công việc này.'},
                            status=status.HTTP_403_FORBIDDEN)

        if task.status not in ('open',):
            return Response(
                {'error': f'Công việc đã ở trạng thái {task.status} — không thể khởi tạo thanh toán.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment_order, _ = PaymentOrder.objects.get_or_create(
            task=task,
            defaults={
                'parent': task.parent,
                'amount': task.price,
                'payment_method': PaymentOrder.METHOD_MOMO,
                'status': PaymentOrder.STATUS_PENDING,
            },
        )

        # Nếu đã PAID → không cho tạo lại
        if payment_order.status == PaymentOrder.STATUS_PAID:
            return Response({'error': 'Đơn thanh toán đã hoàn tất.', 'pay_url': None},
                            status=status.HTTP_400_BAD_REQUEST)

        # Nếu method=cash → đổi sang momo (parent đổi ý)
        if payment_order.payment_method == PaymentOrder.METHOD_CASH:
            payment_order.payment_method = PaymentOrder.METHOD_MOMO
            payment_order.status = PaymentOrder.STATUS_PENDING

        # Cập nhật amount (đều dùng task.price làm chuẩn)
        payment_order.amount = task.price

        # Gọi MoMo
        if not momo_service.is_configured():
            return Response(
                {'error': 'MoMo chưa được cấu hình trên server. Vui lòng liên hệ Admin.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        result = momo_service.create_payment_url(
            payment_order_id=payment_order.id,
            task_id=task.id,
            parent_id=request.user.id,
            amount=task.price,
            order_info=f"EduCareLink - {task.title[:50]} - Task#{task.id}",
        )

        if not result['success']:
            return Response(
                {'error': f"MoMo error: {result['error']}", 'momo_response': result['momo_response']},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Lưu metadata MoMo
        payment_order.momo_order_id = result['order_id']
        payment_order.momo_request_id = result['request_id']
        payment_order.momo_pay_url = result['pay_url']
        payment_order.momo_response = result['momo_response']
        payment_order.save()

        return Response({
            'message': 'Đã tạo đơn thanh toán MoMo. Vui lòng mở payUrl để thanh toán.',
            'pay_url': result['pay_url'],
            'momo_order_id': result['order_id'],
            'payment_order_id': payment_order.id,
            'amount': str(task.price),
        }, status=status.HTTP_200_OK)


class MoMoReturnAPIView(APIView):
    """
    GET /api/payments/momo/return/

    MoMo redirect user về đây sau khi thanh toán (redirectUrl).
    Đây là URL frontend, không xử lý logic — chỉ echo query params để frontend render.

    Query params từ MoMo:
      partnerCode, orderId, requestId, amount, orderInfo, orderType, transId,
      resultCode, message, responseTime, extraData, signature
    """
    permission_classes = [AllowAny]

    def get(self, request):
        # Echo lại toàn bộ query params để frontend tự xử lý
        return Response({
            'message': 'MoMo return callback',
            'params': dict(request.query_params),
            'note': 'Logic xác thực thực tế được xử lý tại IPN (notifyUrl) — đây chỉ là redirect UI.',
        })


class MoMoIPNAPIView(APIView):
    """
    POST /api/payments/momo/ipn/

    MoMo gọi server-to-server tại đây (notifyUrl) khi giao dịch xong (thành công/thất bại).

    Logic:
      1. Verify HMAC signature → nếu fail → trả 204 (MoMo sẽ retry)
      2. Parse extraData → lấy payment_order_id
      3. Tìm PaymentOrder → nếu đã paid → skip (idempotent)
      4. Nếu resultCode=0 → mark_paid + hold_escrow_on_momo_paid
      5. Nếu resultCode!=0 → mark_failed
      6. Trả về ack JSON {"resultCode":0,"message":"Thành công"}
    """
    permission_classes = [AllowAny]  # MoMo IPN không có JWT

    def post(self, request):
        payload = request.data

        # 1. Verify signature
        if not momo_service.verify_ipn_signature(payload):
            logger.warning(f"[MoMo IPN] Signature verification FAILED — payload: {payload}")
            return Response(
                {'resultCode': 99, 'message': 'Signature verification failed'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Parse
        parsed = momo_service.parse_ipn_result(payload)
        extra_data = parsed['extra_data']
        payment_order_id = extra_data.get('payment_order_id')

        if not payment_order_id:
            logger.error(f"[MoMo IPN] Missing payment_order_id in extraData — payload: {payload}")
            return Response(
                {'resultCode': 99, 'message': 'Missing payment_order_id'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payment_order = PaymentOrder.objects.get(pk=payment_order_id)
        except PaymentOrder.DoesNotExist:
            logger.error(f"[MoMo IPN] PaymentOrder#{payment_order_id} not found")
            return Response(
                {'resultCode': 99, 'message': 'PaymentOrder not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 3. Idempotent
        if payment_order.status == PaymentOrder.STATUS_PAID:
            logger.info(f"[MoMo IPN] Idempotent skip — PaymentOrder#{payment_order_id} already paid")
            return Response(momo_service.build_ipn_ack_response(True))

        # 4. Update status
        if parsed['success']:
            payment_order.mark_paid(
                momo_trans_id=parsed['momo_trans_id'],
                momo_response=dict(payload),
            )
            # 5. Hold escrow
            escrow_service.hold_escrow_on_momo_paid(payment_order)
            logger.info(
                f"[MoMo IPN] PAID OK — PaymentOrder#{payment_order_id} | "
                f"transId={parsed['momo_trans_id']} | amount={parsed['amount']}"
            )
        else:
            payment_order.status = PaymentOrder.STATUS_FAILED
            payment_order.momo_response = dict(payload)
            payment_order.save(update_fields=['status', 'momo_response', 'updated_at'])
            logger.warning(
                f"[MoMo IPN] FAILED — PaymentOrder#{payment_order_id} | "
                f"resultCode={parsed['result_code']} | message={parsed['message']}"
            )

        return Response(momo_service.build_ipn_ack_response(True))


# ───────────────────────────────────────────────────────────────────
# WALLET
# ───────────────────────────────────────────────────────────────────
class MyWalletAPIView(APIView):
    """GET / PATCH /api/payments/wallet/ — xem & cập nhật ví của user hiện tại."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        return Response(WalletSerializer(wallet).data)

    def patch(self, request):
        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        serializer = WalletUpdateSerializer(wallet, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(WalletSerializer(wallet).data)


class MyWalletTransactionsAPIView(generics.ListAPIView):
    """GET /api/payments/wallet/transactions/ — lịch sử giao dịch ví user hiện tại."""
    serializer_class = EscrowTransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        wallet, _ = Wallet.objects.get_or_create(user=self.request.user)
        return EscrowTransaction.objects.filter(wallet=wallet).order_by('-created_at')


class WithdrawAPIView(APIView):
    """
    POST /api/payments/wallet/withdraw/
    Body: { "amount": 50000, "order_info": "Rut tien ve MoMo" }

    Worker rút tiền từ ví nội bộ về ví MoMo cá nhân qua MoMo Disbursement API.
    Yêu cầu:
      - User là Worker
      - Wallet.momo_phone đã set
      - Wallet.balance >= amount
      - MoMo đã cấp quyền Disbursement (env MOMO_DISBURSEMENT_ENDPOINT)
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != 'worker':
            return Response({'error': 'Chỉ Carepartner mới được rút tiền.'},
                            status=status.HTTP_403_FORBIDDEN)

        serializer = WithdrawSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        amount = serializer.validated_data['amount']
        order_info = serializer.validated_data.get('order_info') or f"ECL Withdraw {request.user.username}"

        wallet, _ = Wallet.objects.get_or_create(user=request.user)
        result = escrow_service.disburse_to_momo(wallet, amount, order_info)

        if not result['success']:
            return Response({'error': result['error']}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'message': f'Đã rút {amount} VNĐ về ví MoMo.',
            'momo_trans_id': result['momo_trans_id'],
            'new_balance': str(wallet.balance),
        }, status=status.HTTP_200_OK)


# ───────────────────────────────────────────────────────────────────
# TASK PAYMENT STATUS
# ───────────────────────────────────────────────────────────────────
class TaskPaymentStatusAPIView(APIView):
    """GET /api/payments/task/<task_id>/ — xem trạng thái thanh toán của 1 task."""
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({'error': 'Không tìm thấy công việc.'},
                            status=status.HTTP_404_NOT_FOUND)

        # Chỉ parent owner, worker được accepted, hoặc admin mới được xem
        is_admin = request.user.is_staff
        is_owner = task.parent == request.user
        is_assigned_worker = task.applications.filter(
            worker=request.user, status='accepted'
        ).exists()

        if not (is_admin or is_owner or is_assigned_worker):
            return Response({'error': 'Bạn không có quyền xem thanh toán của task này.'},
                            status=status.HTTP_403_FORBIDDEN)

        try:
            payment_order = task.payment_order
        except PaymentOrder.DoesNotExist:
            return Response({'error': 'Task chưa có PaymentOrder.'},
                            status=status.HTTP_404_NOT_FOUND)

        data = PaymentOrderSerializer(payment_order).data
        # Thêm thông tin commission debt (nếu có)
        debt = CommissionDebt.objects.filter(task=task).first()
        if debt:
            data['commission_debt'] = CommissionDebtSerializer(debt).data
        # Thêm escrow transactions
        txns = EscrowTransaction.objects.filter(task=task)
        data['transactions'] = EscrowTransactionSerializer(txns, many=True).data
        return Response(data)


# ───────────────────────────────────────────────────────────────────
# COMMISSION (WORKER)
# ───────────────────────────────────────────────────────────────────
class MyCommissionDebtsAPIView(generics.ListAPIView):
    """GET /api/payments/commission/my-debts/ — Worker xem nợ hoa hồng của mình."""
    serializer_class = CommissionDebtSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CommissionDebt.objects.filter(worker=self.request.user).order_by('-created_at')


class MyCommissionStatementsAPIView(generics.ListAPIView):
    """GET /api/payments/commission/my-statements/ — Worker xem bảng kê tháng."""
    serializer_class = MonthlyCommissionStatementSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return MonthlyCommissionStatement.objects.filter(
            worker=self.request.user
        ).order_by('-month')


class CommissionStatementDetailAPIView(APIView):
    """GET /api/payments/commission/statements/<id>/ — chi tiết statement + QR URL."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            stmt = MonthlyCommissionStatement.objects.get(pk=pk)
        except MonthlyCommissionStatement.DoesNotExist:
            return Response({'error': 'Không tìm thấy bảng kê.'}, status=status.HTTP_404_NOT_FOUND)

        # Chỉ worker owner hoặc admin được xem
        if stmt.worker != request.user and not request.user.is_staff:
            return Response({'error': 'Không có quyền xem.'}, status=status.HTTP_403_FORBIDDEN)

        return Response(MonthlyCommissionStatementSerializer(stmt).data)


# ───────────────────────────────────────────────────────────────────
# ADMIN
# ───────────────────────────────────────────────────────────────────
class AdminTransactionsAPIView(generics.ListAPIView):
    """GET /api/payments/admin/transactions/ — tất cả giao dịch (filter ?type=&username=)."""
    serializer_class = EscrowTransactionSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = EscrowTransaction.objects.all().order_by('-created_at')
        txn_type = self.request.query_params.get('type')
        if txn_type:
            qs = qs.filter(txn_type=txn_type)
        username = self.request.query_params.get('username')
        if username:
            qs = qs.filter(wallet__user__username__icontains=username)
        return qs


class AdminStatementsAPIView(generics.ListAPIView):
    """GET /api/payments/admin/statements/ — tất cả statement (filter ?status=&month=)."""
    serializer_class = MonthlyCommissionStatementSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = MonthlyCommissionStatement.objects.all().order_by('-month', '-created_at')
        stmt_status = self.request.query_params.get('status')
        if stmt_status:
            qs = qs.filter(status=stmt_status)
        return qs


class AdminMarkStatementPaidAPIView(APIView):
    """POST /api/payments/admin/statements/<id>/mark-paid/ — admin xác nhận đã nhận tiền."""
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        try:
            stmt = MonthlyCommissionStatement.objects.get(pk=pk)
        except MonthlyCommissionStatement.DoesNotExist:
            return Response({'error': 'Không tìm thấy bảng kê.'}, status=status.HTTP_404_NOT_FOUND)

        admin_note = request.data.get('admin_note', '')
        result = commission_service.mark_statement_paid(stmt, admin_note=admin_note)
        return Response({
            'message': 'Đã xác nhận thanh toán.',
            'statement_id': stmt.id,
            'worker': stmt.worker.username,
            'amount': str(stmt.total_commission),
            'result': result,
        })


class AdminGenerateStatementsAPIView(APIView):
    """
    POST /api/payments/admin/statements/generate/
    Body (optional): { "target_month": "2026-03-01", "dry_run": false }

    Admin trigger thủ công việc tổng hợp hoa hồng (test hoặc chạy lại).
    Nếu không truyền target_month → mặc định lấy tháng trước.
    """
    permission_classes = [IsAdminUser]

    def post(self, request):
        target_month_str = request.data.get('target_month')
        dry_run = bool(request.data.get('dry_run', False))

        target_month = None
        if target_month_str:
            try:
                target_month = date.fromisoformat(target_month_str)
            except ValueError:
                return Response({'error': 'target_month sai format (YYYY-MM-DD).'},
                                status=status.HTTP_400_BAD_REQUEST)

        result = commission_service.generate_monthly_statements(
            target_month=target_month, dry_run=dry_run
        )
        return Response({
            'message': 'Đã sinh bảng kê.' if not dry_run else 'Dry run OK.',
            'statements_created': result['statements_created'],
            'total_commission': str(result['total_commission']),
            'workers_processed': result['workers_processed'],
        })


class AdminRevenueAPIView(APIView):
    """
    GET /api/payments/admin/revenue/

    Tổng quan doanh thu hoa hồng cho Admin:
      - Total revenue (đã thu): sum commission của statements paid
      - Pending revenue: sum commission của debts pending/sent chưa paid
      - Total transactions count
      - Revenue theo tháng (12 tháng gần nhất)
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        # Tổng doanh thu đã thu
        paid_revenue = MonthlyCommissionStatement.objects.filter(
            status=MonthlyCommissionStatement.STATUS_PAID
        ).aggregate(total=Sum('total_commission'))['total'] or Decimal('0')

        # Doanh thu chờ thu (statement sent/overdue)
        pending_revenue_stmt = MonthlyCommissionStatement.objects.filter(
            status__in=[MonthlyCommissionStatement.STATUS_SENT,
                        MonthlyCommissionStatement.STATUS_OVERDUE]
        ).aggregate(total=Sum('total_commission'))['total'] or Decimal('0')

        # Doanh thu chưa tổng hợp (debts pending chưa có statement)
        pending_debts_total = CommissionDebt.objects.filter(
            status=CommissionDebt.STATUS_PENDING,
            statement__isnull=True,
        ).aggregate(total=Sum('commission_amount'))['total'] or Decimal('0')

        # MoMo revenue đã phân (chuyển vào ví Admin)
        momo_commission_total = EscrowTransaction.objects.filter(
            txn_type=EscrowTransaction.TYPE_COMMISSION_TO_ADMIN
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Revenue theo tháng (6 tháng gần nhất)
        monthly = []
        today = timezone.now().date()
        for i in range(6):
            # Tính ngày đầu tháng của tháng cách đây i tháng
            month_first = today.replace(day=1)
            for _ in range(i):
                # Lùi 1 tháng
                month_first = (month_first.replace(day=1) - timedelta(days=1)).replace(day=1)
            if month_first.month == 12:
                next_month_first = month_first.replace(year=month_first.year + 1, month=1, day=1)
            else:
                next_month_first = month_first.replace(month=month_first.month + 1, day=1)
            month_end = next_month_first - timedelta(days=1)

            stmt_total = MonthlyCommissionStatement.objects.filter(
                month=month_first
            ).aggregate(total=Sum('total_commission'))['total'] or Decimal('0')

            momo_total = EscrowTransaction.objects.filter(
                txn_type=EscrowTransaction.TYPE_COMMISSION_TO_ADMIN,
                created_at__date__gte=month_first,
                created_at__date__lte=month_end,
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

            monthly.append({
                'month': month_first.isoformat(),
                'cash_commission': str(stmt_total),
                'momo_commission': str(momo_total),
                'total': str(stmt_total + momo_total),
            })

        return Response({
            'paid_revenue_cash': str(paid_revenue),
            'pending_revenue_statements': str(pending_revenue_stmt),
            'pending_revenue_unbilled': str(pending_debts_total),
            'momo_commission_released_to_admin_wallet': str(momo_commission_total),
            'commission_rate': str(commission_service.COMMISSION_RATE),
            'monthly_breakdown': monthly,
        })


class AdminSchedulerStatsAPIView(APIView):
    """GET /api/payments/admin/scheduler-stats/ — trạng thái commission scheduler."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        from payments.commission_scheduler import get_stats
        return Response(get_stats())
