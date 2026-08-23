from rest_framework import serializers
from .models import User, ServiceCategory, Task, TaskApplication, Review, CredentialSubmission, Notification, WorkerAvailability


# 1. Dịch dữ liệu Người dùng (Dùng cho Đăng ký/Đăng nhập & Màn hình Hồ sơ)
class UserSerializer(serializers.ModelSerializer):
    # Phần 3 — Field boolean cho frontend biết user đã đặt PIN xác minh chưa.
    # KHÔNG expose verification_pin_hash (hash là thông tin nhạy cảm).
    has_verification_pin = serializers.SerializerMethodField()
    # B4 — Nhãn hạng CarePartner (Đồng/Bạc/Vàng/Kim cương) cho frontend render badge
    tier_label = serializers.SerializerMethodField()

    class Meta:
        model = User
        # Bổ sung first_name, last_name để frontend mobile hiển thị tên đầy đủ
        fields = [
            'id', 'username', 'first_name', 'last_name',
            'email', 'password', 'role', 'phone_number',
            'address', 'is_verified', 'is_approved', 'ai_profile_summary',
            'id_card_front', 'id_card_back', 'selfie_photo',
            'certificate_photo', 'qualifications', 'expo_push_token',
            'first_login', 'latitude', 'longitude',
            'auth_provider', 'avatar_url',
            # Phần 3 — boolean flag (không expose hash)
            'has_verification_pin',
            # B4 — hạng CarePartner (read-only, hệ thống tự tính)
            'tier', 'tier_label', 'tier_updated_at',
        ]
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': False, 'allow_blank': True},
            'phone_number': {'required': False, 'allow_null': True, 'allow_blank': True},
            'address': {'required': False, 'allow_null': True},
            'is_verified': {'read_only': True},
            'is_approved': {'read_only': True},
            'ai_profile_summary': {'read_only': True},
            'role': {'read_only': True},  # Ngăn chặn role escalation qua API
            'auth_provider': {'read_only': True},  # Không cho thay đổi provider qua API
            'tier': {'read_only': True},  # B4 — worker không tự sửa hạng của mình
            'tier_updated_at': {'read_only': True},  # B4
            'avatar_url': {'read_only': True},
            'id_card_front': {'required': False},
            'id_card_back': {'required': False},
            'selfie_photo': {'required': False},
            'certificate_photo': {'required': False},
            'qualifications': {'required': False},
            'latitude': {'required': False, 'allow_null': True},
            'longitude': {'required': False, 'allow_null': True},
        }

    def get_has_verification_pin(self, obj):
        return bool(obj.verification_pin_hash)

    # B4 — trả nhãn tiếng Việt của hạng (VD: 'Hạng Vàng')
    def get_tier_label(self, obj):
        from core.services.tier_service import tier_label
        return tier_label(getattr(obj, 'tier', None) or 'bronze')

    def create(self, validated_data):
        # Tách password ra, dùng create_user để hash đúng cách
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        # Phụ huynh auto-approve, Carepartner phải đợi admin duyệt
        if user.role == 'parent':
            user.is_approved = True
        else:
            user.is_approved = False
        user.save()
        return user


# 2. Dịch dữ liệu Danh mục dịch vụ
class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = '__all__'


# 3. Dịch dữ liệu Công việc (Task)
class TaskSerializer(serializers.ModelSerializer):
    # Tên phụ huynh & tên danh mục (chỉ đọc) — phục vụ màn hình bảng tin mobile
    parent_name = serializers.CharField(source='parent.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ['parent']  # Tự động lấy từ JWT Token khi tạo việc

# 4. Dịch dữ liệu Ứng tuyển (Dành cho màn hình Việc của tôi — cả Parent lẫn Worker)
class TaskApplicationSerializer(serializers.ModelSerializer):
    # Thông tin worker (sinh viên)
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    # B4 — hạng CarePartner cho parent xem khi duyệt ứng viên (web + mobile render badge)
    worker_tier = serializers.CharField(source='worker.tier', read_only=True)
    worker_tier_label = serializers.SerializerMethodField()

    # Thông tin task liên kết — fix lỗi frontend bị undefined
    task_title = serializers.CharField(source='task.title', read_only=True)
    task_status = serializers.CharField(source='task.status', read_only=True)
    task_price = serializers.DecimalField(
        source='task.price', max_digits=10, decimal_places=0, read_only=True
    )
    task_location = serializers.CharField(source='task.location', read_only=True)
    task_scheduled_time = serializers.DateTimeField(
        source='task.scheduled_time', read_only=True
    )
    task_description = serializers.CharField(source='task.description', read_only=True)

    # Thông tin phụ huynh đăng việc — hiển thị trong card của sinh viên
    parent_username = serializers.CharField(source='task.parent.username', read_only=True)
    parent_name = serializers.CharField(source='task.parent.first_name', read_only=True)

    # B4 — nhãn tiếng Việt của hạng CarePartner (VD: 'Hạng Bạc')
    def get_worker_tier_label(self, obj):
        from core.services.tier_service import tier_label
        return tier_label(getattr(obj.worker, 'tier', None) or 'bronze')

    class Meta:
        model = TaskApplication
        fields = '__all__'


# 5. Dịch dữ liệu Đánh giá (Màn hình Review)
class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source='reviewer.username', read_only=True)
    reviewee_name = serializers.CharField(source='reviewee.username', read_only=True)

    class Meta:
        model = Review
        fields = '__all__'
        read_only_fields = ['reviewer', 'reviewee']


# 5. A2 — Khung giờ rảnh của CarePartner
WEEKDAY_LABELS = {
    0: 'Thứ Hai', 1: 'Thứ Ba', 2: 'Thứ Tư', 3: 'Thứ Năm',
    4: 'Thứ Sáu', 5: 'Thứ Bảy', 6: 'Chủ Nhật',
}


class WorkerAvailabilitySerializer(serializers.ModelSerializer):
    weekday_display = serializers.SerializerMethodField()

    class Meta:
        model = WorkerAvailability
        fields = ['id', 'weekday', 'weekday_display', 'start_time', 'end_time', 'created_at', 'updated_at']
        read_only_fields = ['worker', 'created_at', 'updated_at']

    def get_weekday_display(self, obj):
        return obj.get_weekday_display()

    def validate_start_time(self, value):
        end = self.initial_data.get('end_time')
        if end and value >= serializers.TimeField().to_internal_value(end):
            raise serializers.ValidationError('Giờ kết thúc phải sau giờ bắt đầu.')
        return value

    def validate(self, attrs):
        if attrs.get('start_time') and attrs.get('end_time'):
            if attrs['start_time'] >= attrs['end_time']:
                raise serializers.ValidationError({'end_time': 'Giờ kết thúc phải sau giờ bắt đầu.'})

        # Kiểm tra overlapping (chỉ khi create hoặc đổi weekday/time)
        request = self.context.get('request')
        if request and request.user:
            qs = WorkerAvailability.objects.filter(
                worker=request.user,
                weekday=attrs.get('weekday', getattr(self.instance, 'weekday', None)),
            )
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)

            st = attrs.get('start_time', getattr(self.instance, 'start_time', None))
            et = attrs.get('end_time', getattr(self.instance, 'end_time', None))
            if st and et:
                # Overlap: new_start < existing_end AND new_end > existing_start
                overlap = qs.filter(
                    start_time__lt=et,
                    end_time__gt=st,
                )
                if overlap.exists():
                    raise serializers.ValidationError(
                        'Khung giờ này bị trùng với một khung giờ đã khai báo. Vui lòng chỉnh sửa hoặc xoá khung cũ.'
                    )
        return attrs