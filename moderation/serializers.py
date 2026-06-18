"""Serializers cho moderation module."""
from rest_framework import serializers
from .models import TaskModeration, Complaint, ComplaintEvidence


class TaskModerationSerializer(serializers.ModelSerializer):
    task_title = serializers.CharField(source='task.title', read_only=True)

    class Meta:
        model = TaskModeration
        fields = ['id', 'task', 'task_title', 'status', 'ai_verdict',
                  'ai_confidence', 'ai_flags', 'ai_suggestion',
                  'admin_note', 'reviewed_by', 'reviewed_at',
                  'created_at', 'updated_at']
        read_only_fields = ['task', 'ai_verdict', 'ai_confidence', 'ai_flags',
                            'ai_suggestion', 'reviewed_by', 'reviewed_at',
                            'created_at', 'updated_at']


class ComplaintEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplaintEvidence
        fields = ['id', 'complaint', 'evidence_type', 'file', 'description', 'uploaded_at']
        read_only_fields = ['complaint', 'uploaded_at']


class ComplaintSerializer(serializers.ModelSerializer):
    complainant_name = serializers.CharField(source='complainant.username', read_only=True)
    reported_user_name = serializers.CharField(source='reported_user.username', read_only=True)
    task_title = serializers.CharField(source='task.title', read_only=True, default=None)
    evidence = ComplaintEvidenceSerializer(many=True, read_only=True)

    class Meta:
        model = Complaint
        fields = ['id', 'complainant', 'complainant_name', 'reported_user',
                  'reported_user_name', 'task', 'task_title',
                  'complaint_type', 'title', 'description',
                  'ai_analysis', 'ai_priority', 'ai_suggestion', 'ai_analyzed',
                  'status', 'priority', 'admin_response',
                  'resolved_by', 'resolved_at',
                  'created_at', 'updated_at', 'evidence']
        read_only_fields = ['complainant', 'ai_analysis', 'ai_priority',
                            'ai_suggestion', 'ai_analyzed', 'resolved_by',
                            'resolved_at', 'created_at', 'updated_at']


class CreateComplaintSerializer(serializers.Serializer):
    reported_user_id = serializers.IntegerField()
    task_id = serializers.IntegerField(required=False, allow_null=True)
    complaint_type = serializers.ChoiceField(choices=[
        'exploitation', 'abuse', 'harassment', 'non_payment', 'fraud', 'unsafe', 'other'
    ])
    title = serializers.CharField(max_length=255)
    description = serializers.CharField()


class ResolveComplaintSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['investigating', 'resolved', 'dismissed'])
    priority = serializers.ChoiceField(choices=['low', 'medium', 'high', 'urgent'], required=False)
    admin_response = serializers.CharField(required=False, allow_blank=True, default='')


class OverrideModerationSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['admin_approved', 'admin_rejected'])
    admin_note = serializers.CharField(required=False, allow_blank=True, default='')
