from rest_framework import serializers
from .models import User, ServiceCategory, Task, TaskApplication, Review

# 1. Dịch dữ liệu Người dùng (Dùng cho Đăng ký/Đăng nhập)
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'role', 'phone_number', 'is_verified', 'ai_profile_summary']
        # Ẩn password đi khi trả dữ liệu về điện thoại để bảo mật
        extra_kwargs = {'password': {'write_only': True}}

    # Mã hóa mật khẩu khi đăng ký
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
    # Lấy thêm tên người đăng và tên danh mục thay vì chỉ lấy mỗi cái ID
    parent_name = serializers.CharField(source='parent.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'

# 4. Dịch dữ liệu Ứng tuyển
class TaskApplicationSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.username', read_only=True)

    class Meta:
        model = TaskApplication
        fields = '__all__'