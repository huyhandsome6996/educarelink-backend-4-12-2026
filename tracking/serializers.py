"""
Serializers cho tracking module.
"""

from rest_framework import serializers
from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert


class LocationConsentSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    task_title = serializers.CharField(source='task.title', read_only=True)

    class Meta:
        model = LocationConsent
        fields = ['id', 'task', 'task_title', 'worker', 'worker_name',
                  'consent', 'granted_at', 'revoked_at', 'created_at', 'updated_at']
        read_only_fields = ['worker', 'consent', 'granted_at', 'revoked_at', 'created_at', 'updated_at']


class LiveLocationSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    task_title = serializers.CharField(source='task.title', read_only=True)

    class Meta:
        model = LiveLocation
        fields = ['id', 'task', 'task_title', 'worker', 'worker_name',
                  'latitude', 'longitude', 'accuracy', 'speed', 'heading',
                  'last_seen', 'is_outside_geofence', 'geofence_warned_at', 'created_at']
        read_only_fields = fields


class LocationHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LocationHistory
        fields = ['id', 'latitude', 'longitude', 'accuracy', 'speed', 'heading', 'recorded_at']


class SOSAlertSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender_user.username', read_only=True)
    task_title = serializers.CharField(source='task.title', read_only=True)

    class Meta:
        model = SOSAlert
        fields = ['id', 'task', 'task_title', 'sender', 'sender_name',
                  'latitude', 'longitude', 'message', 'status',
                  'created_at', 'resolved_at']
        read_only_fields = ['sender', 'sender_user', 'status', 'resolved_at', 'created_at']


class GrantConsentSerializer(serializers.Serializer):
    """Input cho API grant consent."""
    task_id = serializers.IntegerField()
    granted = serializers.BooleanField(default=True)


class UpdateLocationSerializer(serializers.Serializer):
    """Input cho API update vị trí."""
    task_id = serializers.IntegerField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    accuracy = serializers.FloatField(required=False, allow_null=True)
    speed = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)


class SOSSerializer(serializers.Serializer):
    """Input cho API SOS."""
    task_id = serializers.IntegerField()
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    message = serializers.CharField(required=False, allow_blank=True, default='')
