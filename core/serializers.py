from rest_framework import serializers
from .models import User, ServiceCategory, Task, TaskApplication, Review, CredentialSubmission, Notification


class UserSerializer(serializers.ModelSerializer):
    has_verification_pin = serializers.SerializerMethodField()
    tier_label = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name',
            'email', 'password', 'role', 'phone_number',
            'address', 'is_verified', 'is_approved', 'ai_profile_summary',
            'id_card_front', 'id_card_back', 'selfie_photo',
            'certificate_photo', 'qualifications', 'expo_push_token',
            'first_login', 'latitude', 'longitude',
            'auth_provider', 'avatar_url',
            'has_verification_pin',
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
            'role': {'read_only': True},
            'auth_provider': {'read_only': True},
            'tier': {'read_only': True},
            'tier_updated_at': {'read_only': True},
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

    def get_tier_label(self, obj):
        from core.services.tier_service import tier_label
        return tier_label(getattr(obj, 'tier', None) or 'bronze')

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        if user.role == 'parent':
            user.is_approved = True
        else:
            user.is_approved = False
        user.save()
        return user


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = '__all__'


class TaskSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Task
        fields = '__all__'
        read_only_fields = ['parent']


class TaskApplicationSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.username', read_only=True)
    worker_tier = serializers.CharField(source='worker.tier', read_only=True)
    worker_tier_label = serializers.SerializerMethodField()
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
    parent_username = serializers.CharField(source='task.parent.username', read_only=True)
    parent_name = serializers.CharField(source='task.parent.first_name', read_only=True)

    def get_worker_tier_label(self, obj):
        from core.services.tier_service import tier_label
        return tier_label(getattr(obj.worker, 'tier', None) or 'bronze')

    class Meta:
        model = TaskApplication
        fields = '__all__'


class ReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source='reviewer.username', read_only=True)
    reviewee_name = serializers.CharField(source='reviewee.username', read_only=True)

    class Meta:
        model = Review
        fields = '__all__'
        read_only_fields = ['reviewer', 'reviewee']
