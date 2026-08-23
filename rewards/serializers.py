"""Serializers cho API rewards."""

from rest_framework import serializers

from .models import PointTransaction, Voucher, VoucherRedemption


class PointTransactionSerializer(serializers.ModelSerializer):
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    task_title = serializers.SerializerMethodField()

    class Meta:
        model = PointTransaction
        fields = [
            'id', 'points', 'reason', 'reason_display', 'note',
            'task_id', 'task_title', 'created_at',
        ]

    def get_task_title(self, obj):
        if obj.task_id and obj.task:
            return obj.task.title
        return None


class VoucherSerializer(serializers.ModelSerializer):
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Voucher
        fields = [
            'id', 'title', 'description', 'points_required',
            'discount_value', 'expiry_date', 'is_active', 'is_expired',
        ]


class VoucherRedemptionSerializer(serializers.ModelSerializer):
    voucher_title = serializers.CharField(source='voucher.title', read_only=True)
    discount_value = serializers.IntegerField(source='voucher.discount_value', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = VoucherRedemption
        fields = [
            'id', 'code', 'status', 'status_display', 'points_spent',
            'voucher_id', 'voucher_title', 'discount_value',
            'redeemed_at', 'used_at',
        ]
