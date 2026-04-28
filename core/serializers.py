from rest_framework import serializers
from .models import User, ServiceCategory, Task, TaskApplication, Review

# 1. Dịch dữ liệu Người dùng (Dùng cho Đăng ký/Đăng nhập & Màn hình Hồ sơ)
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'role', 'phone_number', 'is_verified', 'ai_profile_summary']
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

# 2. Dịch dữ liệu Danh mục dịch vụ
class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = '__all__'

# 3. Dịch dữ liệu Công việc (Task)
class TaskSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ['parent'] # Phụ huynh đăng việc sẽ tự động lấy từ Token

# 4. Dịch dữ liệu Ứng tuyển (Dành cho màn hình Việc của tôi)
class TaskApplicationSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    task_title = serializers.CharField(source='task.title', read_only=True)
    task_status = serializers.CharField(source='task.status', read_only=True)

    class Meta:
        model = TaskApplication
        fields = '__all__'

# 5. Dịch dữ liệu Đánh giá (Màn hình Review)
class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = '__all__'
        read_only_fields = ['reviewer']