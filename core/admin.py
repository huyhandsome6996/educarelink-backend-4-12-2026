from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import (
    User, ServiceCategory, Task, TaskApplication, Review,
    CredentialSubmission, ProfileChangeRequest, Notification,
)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = (
        'username', 'email', 'role', 'is_approved', 'tier',
        'tier_override', 'is_active', 'is_staff',
    )
    list_filter = ('role', 'is_approved', 'tier', 'is_active', 'is_staff')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone_number')
    actions = ['recompute_tier_action']

    fieldsets = DjangoUserAdmin.fieldsets + (
        ('CarePartner', {
            'fields': (
                'role', 'is_verified', 'is_approved',
                'tier', 'tier_override', 'tier_updated_at', 'tier_meta',
                'phone_number', 'address', 'latitude', 'longitude',
                'qualifications', 'expo_push_token',
            ),
        }),
    )
    readonly_fields = ('tier_updated_at',)

    @admin.action(description='Tính lại hạng CarePartner (bỏ override)')
    def recompute_tier_action(self, request, queryset):
        from core.services.tier_service import refresh_tier
        count = 0
        for user in queryset.filter(role='worker'):
            refresh_tier(user, force=True)
            count += 1
        self.message_user(request, f'Đã tính lại hạng cho {count} CarePartner.')


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'icon_name')


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'parent', 'status', 'price', 'scheduled_time', 'created_at')
    list_filter = ('status',)


@admin.register(TaskApplication)
class TaskApplicationAdmin(admin.ModelAdmin):
    list_display = ('task', 'worker', 'status', 'applied_at')
    list_filter = ('status',)


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('task', 'reviewer', 'reviewee', 'rating', 'created_at')


@admin.register(CredentialSubmission)
class CredentialSubmissionAdmin(admin.ModelAdmin):
    list_display = (
        'worker', 'title', 'credential_type', 'is_specialized',
        'status', 'created_at', 'reviewed_at',
    )
    list_filter = ('status', 'credential_type', 'is_specialized')


@admin.register(ProfileChangeRequest)
class ProfileChangeRequestAdmin(admin.ModelAdmin):
    list_display = ('worker', 'status', 'created_at', 'reviewed_at')
    list_filter = ('status',)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'recipient', 'is_read', 'created_at')
    list_filter = ('is_read',)
