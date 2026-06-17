"""Admin registrations cho module Payments."""
from django.contrib import admin
from .models import (
    Wallet, PaymentOrder, EscrowTransaction,
    CommissionDebt, MonthlyCommissionStatement,
)


@admin.register(Wallet)
class WalletAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'balance', 'held_balance', 'momo_phone',
                    'bank_code', 'bank_account_number', 'updated_at')
    list_filter = ('bank_code',)
    search_fields = ('user__username', 'user__email', 'momo_phone', 'bank_account_number')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(PaymentOrder)
class PaymentOrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'parent', 'amount', 'payment_method',
                    'status', 'momo_order_id', 'momo_trans_id', 'paid_at', 'created_at')
    list_filter = ('payment_method', 'status', 'created_at')
    search_fields = ('task__title', 'parent__username', 'momo_order_id', 'momo_trans_id')
    readonly_fields = ('momo_response', 'created_at', 'paid_at', 'expired_at')
    date_hierarchy = 'created_at'


@admin.register(EscrowTransaction)
class EscrowTransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'wallet', 'task', 'txn_type', 'amount', 'momo_trans_id', 'created_at')
    list_filter = ('txn_type', 'created_at')
    search_fields = ('wallet__user__username', 'task__title', 'momo_trans_id', 'description')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)


@admin.register(CommissionDebt)
class CommissionDebtAdmin(admin.ModelAdmin):
    list_display = ('id', 'worker', 'task', 'gross_amount', 'commission_rate',
                    'commission_amount', 'status', 'statement', 'created_at', 'paid_at')
    list_filter = ('status', 'commission_rate', 'created_at')
    search_fields = ('worker__username', 'task__title')
    date_hierarchy = 'created_at'
    readonly_fields = ('commission_amount', 'created_at', 'paid_at')


@admin.register(MonthlyCommissionStatement)
class MonthlyCommissionStatementAdmin(admin.ModelAdmin):
    list_display = ('id', 'worker', 'month', 'total_gross', 'total_commission',
                    'debt_count', 'status', 'sent_at', 'paid_at')
    list_filter = ('status', 'month')
    search_fields = ('worker__username',)
    date_hierarchy = 'month'
    readonly_fields = ('sent_at', 'paid_at', 'created_at', 'updated_at')
