from django.contrib import admin

from .models import CareDiaryEntry, CareDiaryActivity, CareDiaryAttachment


@admin.register(CareDiaryEntry)
class CareDiaryEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'worker', 'completion_percent', 'created_at')
    list_filter = ('completion_percent', 'created_at')
    search_fields = ('task__title', 'worker__username')
    raw_id_fields = ('task', 'worker')


@admin.register(CareDiaryActivity)
class CareDiaryActivityAdmin(admin.ModelAdmin):
    list_display = ('id', 'entry', 'time', 'title', 'status', 'order')
    list_filter = ('status',)
    search_fields = ('title',)
    raw_id_fields = ('entry',)


@admin.register(CareDiaryAttachment)
class CareDiaryAttachmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'entry', 'image', 'created_at')
    raw_id_fields = ('entry',)
