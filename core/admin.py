from django.contrib import admin
from .models import User, ServiceCategory, Task, TaskApplication, Review, CredentialSubmission, ProfileChangeRequest, Notification, SystemSetting

# Register your models here.

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'is_approved', 'is_verified', 'is_staff', 'is_active')
    list_filter = ('role', 'is_approved', 'is_verified', 'is_staff')
    search_fields = ('username', 'email', 'first_name', 'last_name')

@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'updated_at', 'updated_by')
    readonly_fields = ('updated_at', 'updated_by')
    
    def save_model(self, request, obj, form, change):
        # Tự động lưu admin đã cập nhật
        if not change:  # Mới tạo
            obj.updated_by = request.user
        super().save_model(request, obj, form, change)