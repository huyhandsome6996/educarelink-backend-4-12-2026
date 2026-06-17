"""Serializers cho module Payments."""
from decimal import Decimal
from rest_framework import serializers

from payments.models import (
    Wallet, PaymentOrder, EscrowTransaction,
    CommissionDebt, MonthlyCommissionStatement,
)


class WalletSerializer(serializers.ModelSerializer):
    total_balance = serializers.ReadOnlyField()
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = Wallet
        fields = [
            'id', 'user', 'username', 'role',
            'balance', 'held_balance', 'total_balance',
            'momo_phone', 'bank_account_number', 'bank_code', 'bank_account_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['balance', 'held_balance', 'created_at', 'updated_at']


class WalletUpdateSerializer(serializers.ModelSerializer):
    """Cho phép user cập nhật thông tin nhận tiền (momo_phone, bank)."""

    class Meta:
        model = Wallet
        fields = ['momo_phone', 'bank_account_number', 'bank_code', 'bank_account_name']


class PaymentOrderSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True)
    parent_username = serializers.CharField(source='parent.username', read_only=True)
    worker_username = serializers.SerializerMethodField()

    class Meta:
        model = PaymentOrder
        fields = [
            'id', 'task', 'task_title', 'parent', 'parent_username', 'worker_username',
            'amount', 'payment_method', 'status',
            'momo_order_id', 'momo_pay_url', 'momo_trans_id',
            'created_at', 'paid_at', 'expired_at',
        ]
        read_only_fields = [
            'parent', 'amount', 'status', 'momo_order_id', 'momo_pay_url',
            'momo_trans_id', 'created_at', 'paid_at', 'expired_at',
        ]

    def get_worker_username(self, obj):
        application = obj.task.applications.filter(status='accepted').first()
        return application.worker.username if application else None


class CreateMoMoPaymentSerializer(serializers.Serializer):
    task_id = serializers.IntegerField()


class EscrowTransactionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='wallet.user.username', read_only=True)
    txn_type_display = serializers.CharField(source='get_txn_type_display', read_only=True)

    class Meta:
        model = EscrowTransaction
        fields = [
            'id', 'task', 'wallet', 'username',
            'amount', 'txn_type', 'txn_type_display',
            'description', 'momo_trans_id', 'created_at',
        ]


class CommissionDebtSerializer(serializers.ModelSerializer):
    worker_username = serializers.CharField(source='worker.username', read_only=True)
    task_title = serializers.CharField(source='task.title', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = CommissionDebt
        fields = [
            'id', 'worker', 'worker_username', 'task', 'task_title',
            'gross_amount', 'commission_rate', 'commission_amount',
            'status', 'status_display', 'statement',
            'created_at', 'paid_at',
        ]


class MonthlyCommissionStatementSerializer(serializers.ModelSerializer):
    worker_username = serializers.CharField(source='worker.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    month_str = serializers.SerializerMethodField()
    debts = CommissionDebtSerializer(many=True, read_only=True)

    class Meta:
        model = MonthlyCommissionStatement
        fields = [
            'id', 'worker', 'worker_username',
            'month', 'month_str', 'period_start', 'period_end',
            'total_gross', 'total_commission', 'debt_count',
            'status', 'status_display',
            'vietqr_url', 'qr_payload',
            'sent_at', 'paid_at', 'admin_note',
            'debts', 'created_at', 'updated_at',
        ]

    def get_month_str(self, obj):
        return obj.month.strftime('%m/%Y') if obj.month else None


class WithdrawSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=0, min_value=Decimal('1000'))
    order_info = serializers.CharField(max_length=200, required=False, allow_blank=True)
