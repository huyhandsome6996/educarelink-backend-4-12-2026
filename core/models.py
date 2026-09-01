from django.db import models
from django.contrib.auth.models import AbstractUser

# 1. BẢNG NGƯỜI DÙNG (Kế thừa User mặc định của Django)
class User(AbstractUser):
    ROLE_CHOICES = (
        ('parent', 'Phụ huynh'),
        ('worker', 'Carepartner'),
    )
    AUTH_PROVIDER_CHOICES = (
        ('email', 'Email / Mật khẩu'),
        ('google', 'Google'),
        ('facebook', 'Facebook'),
    )
    # B4 — Phân hạng CarePartner (Đồng / Bạc / Vàng / Kim cương)
    class CarePartnerTier(models.TextChoices):
        BRONZE = 'bronze', 'Hạng Đồng'
        SILVER = 'silver', 'Hạng Bạc'
        GOLD = 'gold', 'Hạng Vàng'
        DIAMOND = 'diamond', 'Hạng Kim cương'

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='parent')
    auth_provider = models.CharField(max_length=20, choices=AUTH_PROVIDER_CHOICES, default='email', help_text="Phương thức đăng ký/đăng nhập")
    avatar_url = models.URLField(max_length=500, blank=True, null=True, help_text="URL ảnh đại diện từ Google/Facebook")
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    # Đã xác thực CCCD/Thẻ sinh viên chưa
    is_verified = models.BooleanField(default=False) 
    
    # Trạng thái duyệt tài khoản (Admin duyệt cho Carepartner)
    is_approved = models.BooleanField(default=False, help_text="Admin duyệt tài khoản Carepartner")

    # B4 — Phân hạng CarePartner
    tier = models.CharField(
        max_length=20,
        choices=CarePartnerTier.choices,
        default=CarePartnerTier.BRONZE,
        db_index=True,
        help_text="Hạng CarePartner: bronze/silver/gold/diamond (chỉ meaningful khi role=worker & is_approved)",
    )
    tier_updated_at = models.DateTimeField(null=True, blank=True, help_text="Lần cuối hạng được cập nhật")
    tier_override = models.BooleanField(
        default=False,
        help_text="True = admin đã set hạng thủ công; không tự tính lại trừ khi force",
    )
    tier_meta = models.JSONField(
        default=dict,
        blank=True,
        help_text="Snapshot số liệu khi tính hạng: completed_jobs, avg_rating, review_count, has_cert, has_specialized",
    )

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
    
    # Hướng dẫn sử dụng lần đầu
    first_login = models.BooleanField(default=True, help_text="Đánh dấu chưa xem hướng dẫn sử dụng")

    # Vị trí địa lý (để tính khoảng cách)
    latitude = models.FloatField(null=True, blank=True, help_text="Vĩ độ (latitude) từ bản đồ")
    longitude = models.FloatField(null=True, blank=True, help_text="Kinh độ (longitude) từ bản đồ")

    # ----> MÃ CÁ NHÂN XÁC MINH (Phần 3 — Random Verification) ----
    # Carepartner đăng ký 1 mã PIN 4-6 số. Khi hệ thống bất ngờ yêu cầu xác
    # minh trong lúc task in_progress, carepartner phải nhập đúng mã này để
    # chứng minh vẫn đang cầm máy (chống để máy lại rồi bỏ đi).
    # Hash bằng django.contrib.auth.hashers.make_password — KHÔNG lưu plaintext.
    verification_pin_hash = models.CharField(
        max_length=128, blank=True, null=True,
        help_text="Hash mã cá nhân xác minh — KHÔNG lưu plaintext"
    )
    verification_pin_set_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    # ================================================================
    # QA-FIX-1 / Spec 2.3 — Helper methods cho verification PIN
    # Đóng gói logic hash/check để:
    #   - Tránh lặp logic make_password/check_password ở nhiều nơi
    #     (services.py, verification_scheduler.py, tests).
    #   - Dễ unit test, dễ audit security.
    #   - has_verification_pin_set property dùng cho scheduler check
    #     (trước đây kiểm tra `not worker.verification_pin_hash` trực tiếp).
    # ================================================================
    def set_verification_pin(self, raw_pin: str) -> None:
        """Hash + lưu PIN cá nhân. KHÔNG lưu plaintext.

        Caller chịu trách nhiệm validate format (4-6 chữ số) + re-auth
        current_password trước khi gọi method này.
        """
        from django.contrib.auth.hashers import make_password
        from django.utils import timezone as _tz
        self.verification_pin_hash = make_password(raw_pin)
        self.verification_pin_set_at = _tz.now()
        self.save(update_fields=['verification_pin_hash', 'verification_pin_set_at'])

    def check_verification_pin(self, raw_pin: str) -> bool:
        """Trả về True nếu raw_pin khớp với hash đã lưu.
        Trả về False nếu user chưa set PIN hoặc PIN sai.
        Dùng constant-time comparison (django.contrib.auth.hashers.check_password)."""
        from django.contrib.auth.hashers import check_password
        if not self.verification_pin_hash:
            return False
        return check_password(raw_pin, self.verification_pin_hash)

    @property
    def has_verification_pin_set(self) -> bool:
        """True nếu user đã đặt PIN xác minh (hash không null)."""
        return bool(self.verification_pin_hash)


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
    latitude = models.FloatField(null=True, blank=True, help_text="Vĩ độ địa điểm công việc")
    longitude = models.FloatField(null=True, blank=True, help_text="Kinh độ địa điểm công việc")
    scheduled_time = models.DateTimeField() # Thời gian bắt đầu làm

    # ---- GEOFENCE (VÙNG AN TOÀN) — thêm cho chức năng Live Tracking ----
    # Parent có thể vẽ vùng an toàn trên bản đồ khi đăng việc.
    # Carepartner rời vùng này → phụ huynh nhận chuông cảnh báo.
    geofence_lat = models.FloatField(
        null=True, blank=True,
        help_text="Vĩ độ tâm vùng an toàn (geofence) — parent vẽ trên bản đồ khi đăng việc"
    )
    geofence_lng = models.FloatField(
        null=True, blank=True,
        help_text="Kinh độ tâm vùng an toàn (geofence)"
    )
    geofence_radius = models.FloatField(
        null=True, blank=True, default=500,
        help_text="Bán kính vùng an toàn (mét). Mặc định 500m"
    )
    
    # ---> KHUNG CHỜ AI: Lưu lại câu chat gốc của phụ huynh
    ai_generated_from_prompt = models.TextField(
        blank=True, 
        null=True, 
        help_text="Lưu lại câu chat của phụ huynh nếu việc này tạo qua AI."
    )

    # N — Cửa sổ chat Parent↔CarePartner: thời điểm task THẬT SỰ hoàn thành.
    # Set tại nguồn trong TaskUpdateStatusAPIView khi status → 'completed'.
    # Chat module (conversation) dựa vào field này để tính closes_at = completed_at + 24h.
    # Null với task cũ (pre-migration) — chat signal dùng fallback timezone.now().
    completed_at = models.DateTimeField(
        null=True, blank=True,
        help_text="N: thời điểm task chuyển 'completed' (chat đóng tại completed_at + 24h).",
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
    comment = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.rating} sao cho việc: {self.task.title}"


# 6. BẢNG GỬI BẰNG CẤP (Carepartner gửi minh chứng cho Admin duyệt)
class CredentialSubmission(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Chờ duyệt'),
        ('approved', 'Đã duyệt'),
        ('rejected', 'Bị từ chối'),
    )
    # B4 — Loại minh chứng bằng cấp (phục vụ phân hạng CarePartner)
    CREDENTIAL_TYPE_CHOICES = (
        ('certificate', 'Chứng chỉ'),
        ('degree', 'Bằng cấp'),
        ('license', 'Giấy phép / license'),
        ('other', 'Khác'),
    )
    worker = models.ForeignKey(User, on_delete=models.CASCADE, related_name='credential_submissions')
    certificate_photo = models.ImageField(upload_to='credential_submissions/', blank=True, null=True, help_text="Ảnh bằng cấp/chứng chỉ minh chứng")
    description = models.TextField(blank=True, null=True, help_text="Mô tả về bằng cấp, kinh nghiệm")
    # B4 — Phân hạng CarePartner: metadata bằng cấp + flag chuyên ngành (điều kiện Hạng Kim cương)
    credential_type = models.CharField(max_length=30, choices=CREDENTIAL_TYPE_CHOICES, default='certificate', help_text="Loại minh chứng: chứng chỉ / bằng cấp / license")
    title = models.CharField(max_length=200, blank=True, default='', help_text="Tên chứng chỉ/bằng cấp (VD: Chứng chỉ Sư phạm)")
    field = models.CharField(max_length=100, blank=True, default='', help_text="Lĩnh vực (VD: Toán, Tiếng Anh, Mầm non)")
    is_specialized = models.BooleanField(default=False, help_text="True = bằng cấp chuyên ngành — điều kiện Hạng Kim cương (admin đánh dấu khi duyệt)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_review = models.TextField(blank=True, null=True, help_text="Admin viết đánh giá bằng cấp cho Carepartner")
    reviewed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.worker.username} - {self.get_status_display()} - {self.created_at.strftime('%d/%m/%Y')}"


# 7. BẢNG YÊU CẦU THAY ĐỔI HỒ SƠ (Carepartner yêu cầu sửa thông tin, Admin duyệt)
class ProfileChangeRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Chờ duyệt'),
        ('approved', 'Đã duyệt'),
        ('rejected', 'Bị từ chối'),
    )
    worker = models.ForeignKey(User, on_delete=models.CASCADE, related_name='profile_change_requests')
    # Dữ liệu thay đổi (lưu dưới dạng JSON: field -> giá trị mới)
    proposed_changes = models.JSONField(help_text="Dữ liệu thay đổi yêu cầu, ví dụ: {'first_name': 'Minh', 'phone_number': '0987654321'}")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_review = models.TextField(blank=True, null=True, help_text="Admin ghi chú lý do duyệt/từ chối")
    reviewed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.worker.username} - Yêu cầu thay đổi hồ sơ - {self.get_status_display()}"


# 9. BẢNG QUY TẮC GIÁ GỢI Ý (A1 — Tính năng gợi ý giá tự động)
# Mỗi ServiceCategory có 1 PricingRule quy định loại tính giá
# (distance=theo km, hourly=theo giờ, fixed=cố định) và các thông số
class PricingRule(models.Model):
    PRICING_TYPE_CHOICES = (
        ('distance', 'Theo khoảng cách (km)'),
        ('hourly', 'Theo thời lượng (giờ)'),
        ('fixed', 'Cố định / Thoả thuận'),
    )
    category = models.OneToOneField(
        ServiceCategory, on_delete=models.CASCADE,
        related_name='pricing_rule',
        help_text='Mỗi danh mục chỉ có 1 quy tắc giá'
    )
    pricing_type = models.CharField(max_length=20, choices=PRICING_TYPE_CHOICES, default='fixed')
    base_fee = models.DecimalField(
        max_digits=10, decimal_places=0, default=0,
        help_text='Phí mở đầu (VNĐ)'
    )
    unit_price = models.DecimalField(
        max_digits=10, decimal_places=0, default=0,
        help_text='Đơn giá mỗi km hoặc mỗi giờ (VNĐ)'
    )
    min_price = models.DecimalField(
        max_digits=10, decimal_places=0, default=0,
        help_text='Giá tối thiểu trong khoảng gợi ý (VNĐ)'
    )
    max_price = models.DecimalField(
        max_digits=10, decimal_places=0, default=0,
        help_text='Giá tối đa trong khoảng gợi ý (VNĐ)'
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Quy tắc giá gợi ý'
        verbose_name_plural = 'Quy tắc giá gợi ý'

    def __str__(self):
        return f'{self.category.name} ({self.get_pricing_type_display()})'


# 10. BẢNG THÔNG BÁO (Admin gửi thông báo cho Carepartner)
class Notification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True, help_text="Null = gửi cho tất cả Carepartner")
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False, help_text="Đánh dấu đã đọc (chỉ áp dụng cho thông báo cá nhân)")
    read_by = models.JSONField(default=list, blank=True, help_text="Danh sách user ID đã đọc thông báo chung (recipient=null)")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        if self.recipient:
            return f"Thông báo cho {self.recipient.username}: {self.title}"
        return f"Thông báo chung: {self.title}"


# 11. BẢNG LỊCH RẢNH TUẦN CỦA CAREPARTNER (A2 — Ghép việc thông minh)
# Mỗi CarePartner có thể khai báo các khung giờ rảnh lặp lại hàng tuần,
# ví dụ Thứ 2 14:00–18:00. Hệ thống dùng để ghép việc phù hợp.
class WorkerAvailability(models.Model):
    WEEKDAY_CHOICES = (
        (0, 'Thứ Hai'),
        (1, 'Thứ Ba'),
        (2, 'Thứ Tư'),
        (3, 'Thứ Năm'),
        (4, 'Thứ Sáu'),
        (5, 'Thứ Bảy'),
        (6, 'Chủ Nhật'),
    )

    worker = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='availability_windows',
        help_text='CarePartner sở hữu khung giờ này'
    )
    weekday = models.IntegerField(choices=WEEKDAY_CHOICES, help_text='Thứ trong tuần (0=Thứ Hai, 6=Chủ Nhật)')
    start_time = models.TimeField(help_text='Giờ bắt đầu (VD: 14:00)')
    end_time = models.TimeField(help_text='Giờ kết thúc (VD: 18:00)')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Khung giờ rảnh'
        verbose_name_plural = 'Khung giờ rảnh'
        constraints = [
            models.UniqueConstraint(
                fields=['worker', 'weekday', 'start_time', 'end_time'],
                name='unique_availability_window',
            ),
            models.CheckConstraint(
                check=models.Q(start_time__lt=models.F('end_time')),
                name='check_start_before_end',
                violation_error_message='Giờ kết thúc phải sau giờ bắt đầu.',
            ),
        ]
        indexes = [
            models.Index(fields=['worker', 'weekday'], name='idx_worker_weekday'),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.start_time >= self.end_time:
            raise ValidationError({
                'end_time': 'Giờ kết thúc phải sau giờ bắt đầu.'
            })

    def __str__(self):
        return f"{self.worker.username} — {self.get_weekday_display()} {self.start_time}–{self.end_time}"


# ────────────────────────────────────────────────────────────────────
# LANDING PAGE — Khảo sát góp ý & Đăng ký tư vấn/dùng thử
# ────────────────────────────────────────────────────────────────────

class LandingPageVisit(models.Model):
    """Lượt truy cập landing page — chỉ đếm session thật (không ảo).

    Mỗi browser session chỉ ghi 1 lần (frontend dùng sessionStorage).
    Bot detection qua user-agent + rate-limit per IP.
    """
    session_id = models.CharField(max_length=64, db_index=True,
                                   help_text='Frontend-generated UUID, 1 per browser session')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    referrer = models.URLField(blank=True, default='')
    visited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-visited_at']
        verbose_name = 'Lượt truy cập landing'
        verbose_name_plural = 'Lượt truy cập landing'
        indexes = [
            models.Index(fields=['-visited_at'], name='idx_visit_visited_at'),
        ]

    def __str__(self):
        return f"Visit {self.session_id[:8]}… ({self.visited_at.strftime('%d/%m/%Y %H:%M')})"


class LandingSurvey(models.Model):
    """Dữ liệu khảo sát/góp ý từ trang landing công khai.

    Form không yêu cầu đăng nhập. Email là optional.
    Có 2 role: carepartner / phu-huynh, mỗi role có bộ câu hỏi riêng
    lưu trong role_answers (JSONField).
    """
    ROLE_CHOICES = (
        ('carepartner', 'Người đồng hành (CarePartner)'),
        ('phu-huynh', 'Phụ huynh'),
    )
    INTEREST_CHOICES = (
        ('gia-su', 'Gia sư tại nhà'),
        ('cham-soc-tre', 'Chăm sóc trẻ em'),
        ('don-dep', 'Dọn dẹp nhà cửa'),
        ('mua-sam', 'Mua sắm hộ'),
        ('an-toan', 'Định vị & an toàn thời gian thực'),
        ('nhat-ky', 'Nhật ký chăm sóc'),
    )

    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    role_answers = models.JSONField(
        default=dict, blank=True,
        help_text='Bộ câu hỏi riêng theo role (carepartner/phu-huynh)')
    feedback = models.TextField(blank=True, default='',
                               help_text='Góp ý tự do (common cho cả 2 role)')
    email = models.EmailField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Khảo sát landing page'
        verbose_name_plural = 'Khảo sát landing page'

    def __str__(self):
        return f"Survey #{self.id} ({self.get_role_display()})"


class LandingSignup(models.Model):
    """Đăng ký tư vấn miễn phí hoặc dùng thử miễn phí từ trang landing.

    Form không yêu cầu đăng nhập.
    """
    ROLE_CHOICES = (
        ('phu-huynh', 'Phụ huynh'),
        ('carepartner', 'Sinh viên Carepartner'),
    )
    TYPE_CHOICES = (
        ('tu-van', 'Tư vấn miễn phí'),
        ('dung-thu', 'Dùng thử miễn phí'),
    )
    TIME_SLOT_CHOICES = (
        ('sang', 'Buổi sáng (8:00 – 11:00)'),
        ('chieu', 'Buổi chiều (13:00 – 17:00)'),
        ('toi', 'Buổi tối (18:00 – 20:00)'),
    )

    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=15)
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    signup_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    preferred_time_slot = models.CharField(
        max_length=10, choices=TIME_SLOT_CHOICES,
        blank=True, default='',
        help_text='Khung giờ gọi lại (chỉ cho tư vấn)'
    )
    trial_consent = models.BooleanField(
        default=False,
        help_text='Đồng ý kích hoạt dùng thử (chỉ cho dùng thử)'
    )
    note = models.TextField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Đăng ký landing page'
        verbose_name_plural = 'Đăng ký landing page'

    def __str__(self):
        return f"Signup #{self.id} — {self.full_name} ({self.get_signup_type_display()})"