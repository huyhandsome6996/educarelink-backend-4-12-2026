"""Django admin registration cho payments."""

from django.contrib import admin
from .models import Payment, CommissionSettlement, PaymentLog


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'parent', 'worker', 'method', 'status',
                    'amount', 'commission_amount', 'worker_payout_amount',
                    'initiated_at', 'completed_at')
    list_filter = ('method', 'status', 'initiated_at')
    search_fields = ('task__title', 'parent__username', 'worker__username',
                     'momo_order_id', 'momo_trans_id')
    readonly_fields = ('initiated_at', 'held_at', 'completed_at', 'refunded_at',
                       'momo_order_id', 'momo_request_id', 'momo_trans_id',
                       'momo_pay_url', 'momo_qr_code_url',
                       'momo_result_code', 'momo_message',
                       'payout_request_id', 'payout_trans_id', 'payout_response')
    list_per_page = 50


@admin.register(CommissionSettlement)
class CommissionSettlementAdmin(admin.ModelAdmin):
    list_display = ('id', 'worker', 'period_year', 'period_month',
                    'total_tasks', 'total_amount', 'status',
                    'generated_at', 'due_at', 'paid_at')
    list_filter = ('status', 'period_year', 'period_month')
    search_fields = ('worker__username', 'momo_order_id', 'momo_trans_id')
    readonly_fields = ('momo_order_id', 'momo_request_id', 'momo_pay_url',
                       'momo_qr_code_url', 'momo_trans_id',
                       'momo_result_code', 'momo_message',
                       'generated_at', 'paid_at', 'created_at', 'updated_at')
    list_per_page = 50


@admin.register(PaymentLog)
class PaymentLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'event_type', 'payment', 'settlement', 'actor',
                    'created_at', 'message')
    list_filter = ('event_type', 'created_at')
    search_fields = ('message', 'payment__id', 'settlement__id')
    readonly_fields = ('created_at',)
    list_per_page = 100
