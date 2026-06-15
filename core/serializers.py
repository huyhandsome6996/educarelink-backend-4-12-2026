from rest_framework import serializers
from .models import User, ServiceCategory, Task, TaskApplication, Review, CredentialSubmission, Notification


# 1. Dịch dữ liệu Người dùng (Dùng cho Đăng ký/Đăng nhập & Màn hình Hồ sơ)
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        # Bổ sung first_name, last_name để frontend mobile hiển thị tên đầy đủ
        fields = [
            'id', 'username', 'first_name', 'last_name',
            'email', 'password', 'role', 'phone_number',
            'address', 'is_verified', 'is_approved', 'ai_profile_summary',
            'id_card_front', 'id_card_back', 'selfie_photo',
            'certificate_photo', 'qualifications', 'expo_push_token',
            'first_login', 'latitude', 'longitude'
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
            'id_card_front': {'required': False},
            'id_card_back': {'required': False},
            'selfie_photo': {'required': False},
            'certificate_photo': {'required': False},
            'qualifications': {'required': False},
            'latitude': {'required': False, 'allow_null': True},
            'longitude': {'required': False, 'allow_null': True},
        }

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