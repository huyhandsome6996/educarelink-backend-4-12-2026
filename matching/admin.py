"""
matching/admin.py — Django Admin cho toàn bộ app matching.

EloLedger + StateTransitionLog READ-ONLY (Step 12.4 / audit).
EloLedger có action "Điều chỉnh ELO thủ công" BẮT BUỘC nhập note
(reason_code=admin_adjust) — Step 6.8 cấm sửa âm thầm.
"""

from django.contrib import admin

from .models import (
    AiCallLog,
    Appeal,
    Booking,
    CancelPolicy,
    CarePartnerAvailability,
    CarePartnerBlackout,
    CarePartnerProfile,
    CreditBalance,
    CreditTransaction,
    DeviceToken,
    EloBand,
    EloLedger,
    JobPost,
    JobSlot,
    MatchingConfig,
    MatchingWeight,
    Notification,
    NotificationTemplate,
    PromptTemplate,
    ReplacementAttempt,
    RescheduleRequest,
    SlotLock,
    StateTransitionLog,
)


class ReadOnlyAdminMixin:
    """Chặn mọi thao tác ghi — chỉ xem."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(JobPost)
class JobPostAdmin(admin.ModelAdmin):
    list_display = ('id', 'job_type', 'title', 'parent', 'status',
                    'ai_parse_status', 'hourly_rate_vnd', 'created_at')
    list_filter = ('job_type', 'status', 'ai_parse_status', 'needs_admin_review')
    search_fields = ('title', 'parent__username', 'parent__email')
    readonly_fields = ('id', 'created_at', 'updated_at', 'ai_parse_result')


@admin.register(JobSlot)
class JobSlotAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'date', 'time_from', 'time_to', 'status')
    list_filter = ('status', 'date')


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'carepartner', 'parent', 'status',
                    'total_value_vnd', 'compensation_vnd', 'commit_deadline')
    list_filter = ('status', 'cancel_class')
    search_fields = ('carepartner__username', 'parent__username')
    readonly_fields = ('id', 'created_at', 'updated_at')


@admin.register(CarePartnerProfile)
class CarePartnerProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'hidden_elo', 'effective_elo', 'band',
                    'matching_paused', 'jobs_completed', 'jobs_cancelled')
    list_filter = ('band', 'matching_paused', 'has_vehicle')
    search_fields = ('user__username',)
    # Admin CÓ THỂ sửa band/matching_paused; elo chỉ đổi qua ledger action


@admin.register(EloBand)
class EloBandAdmin(admin.ModelAdmin):
    list_display = ('name', 'min_elo', 'max_elo', 'rank_multiplier',
                    'max_proposals_per_day', 'excluded_from_matching',
                    'only_when_pool_below', 'label_vi')
    list_editable = ('min_elo', 'max_elo', 'rank_multiplier',
                     'max_proposals_per_day', 'excluded_from_matching')


@admin.register(EloLedger)
class EloLedgerAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('carepartner', 'delta', 'reason_code', 'booking',
                    'elo_before', 'elo_after', 'created_at')
    list_filter = ('reason_code',)
    search_fields = ('carepartner__username',)
    actions = ['adjust_elo_action']

    @admin.action(description='Điều chỉnh ELO thủ công (bắt buộc nhập note)')
    def adjust_elo_action(self, request, queryset):
        """Step 6.8: chỉnh tay bắt buộc note → ghi row admin_adjust mới,
        KHÔNG sửa row cũ (audit không thể giả mạo)."""
        from django.contrib import messages
        from django import forms
        from .services.elo_service import EloService

        class AdjustForm(forms.Form):
            delta = forms.IntegerField(label='Delta (+/-)')
            note = forms.CharField(label='Lý do (bắt buộc)', min_length=5,
                                   widget=forms.Textarea)

        if 'apply' in request.POST:
            form = AdjustForm(request.POST)
            if form.is_valid():
                delta = form.cleaned_data['delta']
                note = form.cleaned_data['note']
                for cp in queryset:
                    EloService.apply_event(
                        cp, 'admin_adjust', delta_override=delta,
                        admin=request.user, note=note)
                self.message_user(request, f'Đã điều chỉnh {queryset.count()} CP.', messages.SUCCESS)
                return None
        else:
            form = AdjustForm()

        from django.template.response import TemplateResponse
        return TemplateResponse(request, 'admin/elo_adjust_form.html', {
            'form': form, 'count': queryset.count(),
            'title': 'Điều chỉnh ELO thủ công',
        })


@admin.register(StateTransitionLog)
class StateTransitionLogAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('entity', 'entity_id', 'from_status', 'to_status',
                    'actor', 'reason', 'created_at')
    list_filter = ('entity', 'actor')


@admin.register(CancelPolicy)
class CancelPolicyAdmin(admin.ModelAdmin):
    list_display = ('tier', 'trigger', 'min_lead_minutes', 'max_lead_minutes',
                    'elo_delta', 'compensation_pct', 'min_compensation_vnd',
                    'escalate_to', 'suspend_days', 'is_active')
    list_editable = ('elo_delta', 'compensation_pct', 'min_compensation_vnd', 'is_active')


@admin.register(CreditBalance)
class CreditBalanceAdmin(admin.ModelAdmin):
    list_display = ('parent', 'credit_vnd', 'updated_at')
    readonly_fields = ('credit_vnd',)  # chỉ đổi qua CreditTransaction


@admin.register(CreditTransaction)
class CreditTransactionAdmin(admin.ModelAdmin):
    list_display = ('parent', 'booking', 'amount_vnd', 'kind', 'status', 'issued_at')
    list_filter = ('kind', 'status')


@admin.register(Appeal)
class AppealAdmin(admin.ModelAdmin):
    list_display = ('carepartner', 'booking', 'reason_code', 'status',
                    'decided_at', 'created_at')
    list_filter = ('status',)
    search_fields = ('carepartner__username',)


@admin.register(CarePartnerAvailability)
class CarePartnerAvailabilityAdmin(admin.ModelAdmin):
    list_display = ('carepartner', 'weekday', 'time_from', 'time_to')
    list_filter = ('weekday',)


@admin.register(CarePartnerBlackout)
class CarePartnerBlackoutAdmin(admin.ModelAdmin):
    list_display = ('carepartner', 'date', 'time_from', 'time_to', 'reason')
    list_filter = ('reason', 'date')


@admin.register(SlotLock)
class SlotLockAdmin(admin.ModelAdmin):
    list_display = ('carepartner', 'date', 'time_from', 'time_to',
                    'lock_type', 'expires_at', 'booking')
    list_filter = ('lock_type',)


@admin.register(RescheduleRequest)
class RescheduleRequestAdmin(admin.ModelAdmin):
    list_display = ('booking', 'new_date', 'new_time_from', 'status', 'parent_deadline')
    list_filter = ('status',)


@admin.register(MatchingWeight)
class MatchingWeightAdmin(admin.ModelAdmin):
    list_display = ('factor', 'weight_pct', 'is_active')
    list_editable = ('weight_pct', 'is_active')


@admin.register(MatchingConfig)
class MatchingConfigAdmin(admin.ModelAdmin):
    list_display = ('key', 'value_json', 'note')
    search_fields = ('key',)


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ('code', 'klass', 'audience', 'is_active')
    list_editable = ('is_active',)
    list_filter = ('klass', 'audience')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'code', 'klass', 'status', 'created_at', 'sent_at')
    list_filter = ('klass', 'status')


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'is_active', 'last_success_at')
    list_filter = ('platform', 'is_active')


@admin.register(ReplacementAttempt)
class ReplacementAttemptAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('job', 'attempt_no', 'candidate_count', 'auto_assigned', 'created_at')


@admin.register(PromptTemplate)
class PromptTemplateAdmin(admin.ModelAdmin):
    list_display = ('key', 'version', 'model', 'is_active')


@admin.register(AiCallLog)
class AiCallLogAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    list_display = ('prompt_key', 'prompt_version', 'model', 'status',
                    'tokens_in', 'tokens_out', 'latency_ms', 'created_at')
