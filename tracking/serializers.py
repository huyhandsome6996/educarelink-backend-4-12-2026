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


class HeartbeatSerializer(serializers.Serializer):
    """Input cho API heartbeat (chống tắt máy)."""
    task_id = serializers.IntegerField()
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)
    battery_level = serializers.IntegerField(required=False, allow_null=True, min_value=0, max_value=100)
    app_state = serializers.CharField(required=False, allow_blank=True, default='')
    network_type = serializers.CharField(required=False, allow_blank=True, default='')


# ═══════════════════════════════════════════════════════════════════
#  PHẦN 3 — Random Verification Check
# ═══════════════════════════════════════════════════════════════════

class RandomVerificationCheckSerializer(serializers.ModelSerializer):
    """Serializer cho RandomVerificationCheck — dùng cho admin list + worker pending."""
    task_title = serializers.CharField(source='task.title', read_only=True)
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        from .models import RandomVerificationCheck
        model = RandomVerificationCheck
        fields = [
            'id', 'task', 'task_title', 'worker', 'worker_name',
            'triggered_at', 'respond_deadline',
            'status', 'status_display', 'attempts', 'responded_at',
            'response_lat', 'response_lng',
            'push_sent', 'push_retry_count',
        ]
        read_only_fields = fields


class SetVerificationPinSerializer(serializers.Serializer):
    """Input cho API set/đổi mã PIN cá nhân."""
    pin = serializers.CharField(min_length=4, max_length=6)
    current_password = serializers.CharField(write_only=True)


class RespondVerificationCheckSerializer(serializers.Serializer):
    """Input cho API phản hồi verification check."""
    pin = serializers.CharField(min_length=4, max_length=6)
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)


class BatchLocationSerializer(serializers.Serializer):
    """Input cho API batch location (Phần 1 — cache offline).

    QA-FIX-2 / B1: thêm field client_point_id (optional UUID string)
    cho idempotent retry. Nếu mobile gửi cùng client_point_id 2 lần
    (do network timeout giữa commit và response), backend sẽ skip
    point đã tồn tại thay vì tạo duplicate.
    """
    task_id = serializers.IntegerField()
    # Dùng DictField(child=...) KHÔNG ép kiểu — ta validate thủ công trong validate_points
    # vì points chứa cả số (lat/lng/accuracy) VÀ string (recorded_at).
    points = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        max_length=500,
    )

    def validate_points(self, value):
        for i, p in enumerate(value):
            required_keys = ('latitude', 'longitude', 'recorded_at')
            for k in required_keys:
                if k not in p:
                    raise serializers.ValidationError(f"Điểm #{i} thiếu field '{k}'.")
            if not isinstance(p['latitude'], (int, float)) or not isinstance(p['longitude'], (int, float)):
                raise serializers.ValidationError(f"Điểm #{i} có latitude/longitude không hợp lệ.")
            # recorded_at: string ISO 8601
            if not isinstance(p['recorded_at'], str):
                raise serializers.ValidationError(f"Điểm #{i} có recorded_at không phải chuỗi ISO.")
            # accuracy/speed/heading nếu có phải là số hoặc null
            for opt_field in ('accuracy', 'speed', 'heading'):
                if opt_field in p and p[opt_field] is not None:
                    if not isinstance(p[opt_field], (int, float)):
                        raise serializers.ValidationError(f"Điểm #{i} có {opt_field} không phải số.")
            # QA-FIX-2 / B1: client_point_id chỉ validate kiểu string — length
            # check để view xử lý (cho phép batch partial success: điểm hỏng
            # bị rejected, điểm OK vẫn insert). Trước đây serializer reject
            # cả batch → mobile không biết điểm nào hỏng.
            if 'client_point_id' in p and p['client_point_id'] is not None:
                if not isinstance(p['client_point_id'], str):
                    raise serializers.ValidationError(
                        f"Điểm #{i} có client_point_id không phải chuỗi."
                    )
        return value
