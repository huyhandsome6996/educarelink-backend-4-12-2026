"""
╔══════════════════════════════════════════════════════════════════╗
║   EduCareLink — Tracking Module (Live Location Sharing)           ║
║                                                                   ║
║   Mô hình:                                                        ║
║     - Carepartner đồng ý chia sẻ vị trí khi nhận việc             ║
║     - Khi task 'in_progress': 每 10s carepartner app gửi vị trí  ║
║       hiện tại → LiveLocation (bảng duy nhất, update nếu đã có)   ║
║       + append vào LocationHistory (lưu vĩnh viễn)                ║
║     - Parent app/web GET LiveLocation mỗi 5s để realtime          ║
║     - Khi task completed/cancelled: clear LiveLocation (History    ║
║       vẫn giữ vĩnh viễn để parent xem lại route)                  ║
║                                                                   ║
║   Geofencing: so sánh vị trí carepartner vs task.latitude/         ║
║   longitude. Nếu rời khỏi bán kính 500m → cảnh báo push.          ║
║                                                                   ║
║   SOS: cả 2 bên có thể bấm SOS → gửi vị trí hiện tại + push ngay  ║
║                                                                   ║
║   Bảo mật:                                                        ║
║     - Parent chỉ xem được vị trí carepartner của task mình         ║
║     - Carepartner chỉ update được vị trí của task mình đã accept   ║
║     - LocationHistory vĩnh viễn nhưng chỉ parent sở hữu task xem  ║
╚══════════════════════════════════════════════════════════════════╝
"""

from django.db import models
from django.conf import settings


class LocationConsent(models.Model):
    """
    Lưu đồng ý của Carepartner cho từng task.
    Mỗi task chỉ có 1 consent (OneToOne).
    """
    CONSENT_CHOICES = (
        ('granted', 'Đã đồng ý chia sẻ vị trí'),
        ('denied',  'Không đồng ý'),
        ('revoked', 'Đã rút lại đồng ý (dừng khẩn cấp)'),
    )

    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='location_consent'
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='location_consents'
    )
    consent = models.CharField(max_length=20, choices=CONSENT_CHOICES, default='denied')

    # Thời gian đồng ý / rút lại
    granted_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['worker', 'consent']),
        ]

    def __str__(self):
        return f"Task#{self.task_id} | Worker#{self.worker_id} | {self.get_consent_display()}"


class LiveLocation(models.Model):
    """
    Vị trí HIỆN TẠI của carepartner cho 1 task đang in_progress.
    Mỗi task chỉ có 1 row (update-in-place). Khi task completed → xóa.
    """
    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='live_location'
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='live_locations'
    )

    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    accuracy = models.FloatField(null=True, blank=True, help_text="Độ chính xác GPS (mét)")
    speed = models.FloatField(null=True, blank=True, help_text="Tốc độ di chuyển (m/s)")
    heading = models.FloatField(null=True, blank=True, help_text="Hướng di chuyển (độ 0-360)")

    last_seen = models.DateTimeField(auto_now=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # Cờ cảnh báo geofence
    is_outside_geofence = models.BooleanField(default=False)
    geofence_warned_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-last_seen']
        indexes = [
            models.Index(fields=['worker', 'last_seen']),
            models.Index(fields=['task']),
        ]

    def __str__(self):
        return f"Task#{self.task_id} | ({self.latitude}, {self.longitude}) | {self.last_seen:%H:%M:%S}"


class LocationHistory(models.Model):
    """
    Lịch sử toàn bộ vị trí carepartner đã gửi (lưu vĩnh viễn).
    Dùng để parent xem lại route sau khi task hoàn thành.
    Mỗi lần LiveLocation update → append 1 row vào đây.
    """
    task = models.ForeignKey(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='location_history'
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='location_history'
    )

    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    accuracy = models.FloatField(null=True, blank=True)
    speed = models.FloatField(null=True, blank=True)
    heading = models.FloatField(null=True, blank=True)

    recorded_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['recorded_at']   # chronological
        indexes = [
            models.Index(fields=['task', 'recorded_at']),
            models.Index(fields=['worker', '-recorded_at']),
        ]

    def __str__(self):
        return f"Task#{self.task_id} | ({self.latitude}, {self.longitude}) | {self.recorded_at:%Y-%m-%d %H:%M:%S}"


class SOSAlert(models.Model):
    """
    SOS alert từ carepartner hoặc parent.
    Khi 1 trong 2 bên bấm nút SOS → tạo record + push notification cho bên kia.
    """
    SOS_SENDER_CHOICES = (
        ('worker', 'Carepartner'),
        ('parent', 'Phụ huynh'),
    )
    SOS_STATUS_CHOICES = (
        ('active',   'Đang khẩn cấp — chưa xử lý'),
        ('resolved', 'Đã giải quyết'),
        ('false',    'Báo động sai'),
    )

    task = models.ForeignKey(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='sos_alerts'
    )
    sender = models.CharField(max_length=10, choices=SOS_SENDER_CHOICES)
    sender_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_sos_alerts'
    )

    # Vị trí khi bấm SOS (nếu có)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    message = models.TextField(blank=True, default='', help_text="Tin nhắn SOS (tuỳ chọn)")
    status = models.CharField(max_length=10, choices=SOS_STATUS_CHOICES, default='active')

    resolved_at = models.DateTimeField(blank=True, null=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resolved_sos_alerts'
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['task', 'status']),
            models.Index(fields=['status', '-created_at']),
        ]

    def __str__(self):
        return f"SOS Task#{self.task_id} | {self.get_sender_display()} | {self.get_status_display()} | {self.created_at:%H:%M:%S}"
