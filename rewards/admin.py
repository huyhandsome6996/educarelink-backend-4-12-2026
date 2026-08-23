from django.contrib import admin

from .models import PointTransaction, Voucher, VoucherRedemption


@admin.register(PointTransaction)
class PointTransactionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'points', 'reason', 'task', 'created_at')
    list_filter = ('reason', 'created_at')
    search_fields = ('user__username', 'note')
    readonly_fields = ('created_at',)
    raw_id_fields = ('user', 'task', 'review', 'voucher_redemption')


@admin.register(Voucher)
class VoucherAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'title', 'points_required', 'discount_value',
        'expiry_date', 'is_active', 'created_at',
    )
    list_filter = ('is_active',)
    search_fields = ('title', 'description')
    list_editable = ('is_active',)


@admin.register(VoucherRedemption)
class VoucherRedemptionAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'code', 'user', 'voucher', 'status',
        'points_spent', 'redeemed_at',
    )
    list_filter = ('status',)
    search_fields = ('code', 'user__username')
    readonly_fields = ('code', 'redeemed_at')
    raw_id_fields = ('user', 'voucher')
