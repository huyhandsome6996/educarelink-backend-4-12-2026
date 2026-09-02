from django.contrib import admin
from .models import TaskModeration, Complaint, ComplaintEvidence


@admin.register(TaskModeration)
class TaskModerationAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'status', 'ai_confidence', 'reviewed_by', 'created_at')
    list_filter = ('status',)
    search_fields = ('task__title', 'ai_verdict')
    readonly_fields = ('created_at', 'updated_at', 'ai_verdict', 'ai_confidence', 'ai_flags', 'ai_suggestion')


@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ('id', 'complainant', 'reported_user', 'complaint_type', 'status', 'priority', 'created_at')
    list_filter = ('status', 'priority', 'complaint_type')
    search_fields = ('title', 'description', 'complainant__username', 'reported_user__username')
    readonly_fields = ('ai_analysis', 'ai_priority', 'ai_suggestion', 'ai_analyzed', 'created_at', 'updated_at')


@admin.register(ComplaintEvidence)
class ComplaintEvidenceAdmin(admin.ModelAdmin):
    list_display = ('id', 'complaint', 'evidence_type', 'uploaded_at')
    list_filter = ('evidence_type',)
    readonly_fields = ('uploaded_at',)
