from django.db import models
from django.contrib.auth.models import AbstractUser

# 1. BẢNG NGƯỜI DÙNG (Kế thừa User mặc định của Django)
class User(AbstractUser):
    ROLE_CHOICES = (
        ('parent', 'Phụ huynh'),
        ('worker', 'Carepartner'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='parent')
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    # Đã xác thực CCCD/Thẻ sinh viên chưa
    is_verified = models.BooleanField(default=False) 
    
    # Trạng thái duyệt tài khoản (Admin duyệt cho Carepartner)
    is_approved = models.BooleanField(default=False, help_text="Admin duyệt tài khoản Carepartner")
    
    # Ảnh xác minh danh tính (dành cho Carepartner)
    id_card_front = models.ImageField(upload_to='id_cards/', blank=True, null=True, help_text="Ảnh mặt trước CCCD")
    id_card_back = models.ImageField(upload_to='id_cards/', blank=True, null=True, help_text="Ảnh mặt sau CCCD")
    selfie_photo = models.ImageField(upload_to='selfies/', blank=True, null=True, help_text="Ảnh chân dung")
    
    # Bằng cấp & Chứng chỉ do Carepartner upload, Admin điền text
    certificate_photo = models.ImageField(upload_to='certificates/', blank=True, null=True, help_text="Ảnh bằng cấp/chứng chỉ")
    qualifications = models.JSONField(default=list, blank=True, help_text="Danh sách bằng cấp do admin nhập sau khi duyệt")
    
    # Notifications
    expo_push_token = models.CharField(max_length=255, blank=True, null=True, help_text="Expo Push Token cho thông báo")
    
    # ----> KHUNG CHỜ AI: Lưu tóm tắt hồ sơ do AI sinh ra
    ai_profile_summary = models.TextField(
        blank=True, 
        null=True, 
        help_text="AI sẽ tự động tổng hợp điểm mạnh dựa trên lịch sử."
    )

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"


# 2. BẢNG DANH MỤC DỊCH VỤ (Gia sư, Đón trẻ...)
class ServiceCategory(models.Model):
    name = models.CharField(max_length=100) 
    icon_name = models.CharField(max_length=50, blank=True, help_text="Tên icon, VD: BookOpen, Baby")
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


# 3. BẢNG CÔNG VIỆC (Do phụ huynh đăng)
class Task(models.Model):
    STATUS_CHOICES = (
        ('open', 'Đang tìm người'),
        ('in_progress', 'Đang thực hiện'),
        ('completed', 'Đã hoàn thành'),
        ('cancelled', 'Đã hủy'),
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=0) # Lương (VNĐ)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    
    # Khóa ngoại: Ai là người đăng? Thuộc danh mục nào?
    parent = models.ForeignKey(User, on_delete=models.CASCADE, related_name='posted_tasks')
    category = models.ForeignKey(ServiceCategory, on_delete=models.SET_NULL, null=True)
    
    location = models.CharField(max_length=255)
    scheduled_time = models.DateTimeField() # Thời gian bắt đầu làm
    
    # ---> KHUNG CHỜ AI: Lưu lại câu chat gốc của phụ huynh
    ai_generated_from_prompt = models.TextField(
        blank=True, 
        null=True, 
        help_text="Lưu lại câu chat của phụ huynh nếu việc này tạo qua AI."
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} - {self.get_status_display()}"


# 4. BẢNG ỨNG TUYỂN (Khi Carepartner bấm nhận việc)
class TaskApplication(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Đang chờ duyệt'),
        ('accepted', 'Đã được chọn'),
        ('rejected', 'Bị từ chối'),
    )
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='applications')
    worker = models.ForeignKey(User, on_delete=models.CASCADE, related_name='applications')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    applied_at = models.DateTimeField(auto_now_add=True)

    # Đảm bảo 1 worker chỉ ứng tuyển 1 task 1 lần
    class Meta:
        unique_together = ('task', 'worker')

    def __str__(self):
        return f"{self.worker.username} ứng tuyển: {self.task.title}"


# 5. BẢNG ĐÁNH GIÁ (Review sau khi xong việc)
class Review(models.Model):
    task = models.OneToOneField(Task, on_delete=models.CASCADE, related_name='review')
    reviewer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews_given')
    reviewee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews_received')
    rating = models.IntegerField(choices=[(i, i) for i in range(1, 6)]) # 1 đến 5 sao
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.rating} sao cho việc: {self.task.title}"