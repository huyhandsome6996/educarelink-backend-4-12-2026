"""Serializers cho module payments."""

from rest_framework import serializers
from .models import Payment, CommissionSettlement, PaymentLog


class PaymentSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True)
    parent_name = serializers.CharField(source='parent.username', read_only=True)
    worker_name = serializers.CharField(source='worker.username', read_only=True, default=None)
    parent_full_name = serializers.SerializerMethodField()
    worker_full_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'id', 'task', 'task_title', 'parent', 'parent_name', 'parent_full_name',
            'worker', 'worker_name', 'worker_full_name',
            'amount', 'commission_rate', 'commission_amount', 'worker_payout_amount',
            'method', 'status',
            'momo_order_id', 'momo_pay_url', 'momo_qr_code_url',
            'momo_result_code', 'momo_message',
            # PayOS fields
            'payos_order_code', 'payos_checkout_url', 'payos_payment_link_id',
            'payos_status', 'payos_account_reference',
            'initiated_at', 'held_at', 'completed_at', 'refunded_at',
        ]
        read_only_fields = [
            'parent', 'worker', 'amount', 'commission_rate', 'commission_amount',
            'worker_payout_amount', 'status',
            'momo_order_id', 'momo_pay_url', 'momo_qr_code_url',
            'momo_result_code', 'momo_message',
            'payos_order_code', 'payos_checkout_url', 'payos_payment_link_id',
            'payos_status', 'payos_account_reference',
            'initiated_at', 'held_at', 'completed_at', 'refunded_at',
        ]

    def get_parent_full_name(self, obj):
        u = obj.parent
        if u.first_name or u.last_name:
            return f"{u.first_name} {u.last_name}".strip()
        return u.username

    def get_worker_full_name(self, obj):
        if not obj.worker:
            return None
        u = obj.worker
        if u.first_name or u.last_name:
            return f"{u.first_name} {u.last_name}".strip()
        return u.username


class SetupPaymentSerializer(serializers.Serializer):
    """Input cho API setup payment (POST /api/payments/setup/)."""
    task_id = serializers.IntegerField()
    method = serializers.ChoiceField(choices=['momo_escrow', 'payos', 'cash'])


class CommissionSettlementSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    worker_full_name = serializers.SerializerMethodField()

    class Meta:
        model = CommissionSettlement
        fields = [
            'id', 'worker', 'worker_name', 'worker_full_name',
            'period_year', 'period_month',
            'total_tasks', 'total_amount', 'task_ids',
            'status',
            'momo_pay_url', 'momo_qr_code_url', 'momo_result_code', 'momo_message',
            'due_at', 'generated_at', 'paid_at', 'created_at',
        ]
        read_only_fields = fields

    def get_worker_full_name(self, obj):
        u = obj.worker
        if u.first_name or u.last_name:
            return f"{u.first_name} {u.last_name}".strip()
        return u.username


class PaymentLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentLog
        fields = '__all__'
