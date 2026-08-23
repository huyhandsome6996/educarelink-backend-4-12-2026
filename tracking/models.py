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
║   DEVICE OFFLINE ALERT (an toàn chống tắt máy):                   ║
║     - Carepartner app gửi heartbeat mỗi 30s                       ║
║     - Backend scheduler chạy mỗi 1 phút quét                      ║
║     - Nếu last_seen > TRACKING_OFFLINE_THRESHOLD → tạo alert       ║
║       + push notification (priority=high) cho phụ huynh            ║
║       + chuông kêu trên thiết bị parent                           ║
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

    # QA-FIX-6 / NÊN LÀM 2 — Timestamp client ghi nhận GPS, dùng để chống
    # ghi đè LiveLocation bằng điểm cũ (race condition giữa real-time và
    # batch offline flush).
    #
    # Trước đây LiveLocation chỉ có last_seen (auto_now=True, set bằng
    # thời điểm server nhận request). Khi carepartner mất mạng → batch
    # queue chứa điểm CŨ → real-time gửi điểm MỚI trước → LiveLocation
    # đúng. Sau đó batch flush chạy xong, gửi điểm CŨ qua BatchLocationAPIView
    # → update_or_create ghi đè → LiveLocation "nhảy lùi" tạm thời (~10s
    # cho tới khi real-time tiếp theo update lại).
    #
    # Fix: lưu client_recorded_at (timestamp client thật sự capture GPS).
    # Trước khi update_or_create, so sánh với existing.client_recorded_at:
    # nếu existing mới hơn → skip update, giữ nguyên dữ liệu mới hơn.
    #
    # - Real-time (UpdateLocationAPIView): client_recorded_at = now() (server
    #   time, vì client không gửi timestamp cho real-time).
    # - Batch (BatchLocationAPIView): client_recorded_at = last_point['recorded_at']
    #   (timestamp client capture GPS, có thể trong quá khứ do offline queue).
    #
    # Field nullable (null=True) để migration an toàn cho data cũ — mọi row
    # cũ sẽ có client_recorded_at=NULL. Logic so sánh handle NULL: nếu
    # existing.client_recorded_at IS NULL → luôn update (giữ behaviour cũ
    # cho row chưa được populate field mới).
    client_recorded_at = models.DateTimeField(
        blank=True, null=True, db_index=True,
        help_text="Timestamp client capture GPS. Dùng chống ghi đè LiveLocation bằng điểm cũ."
    )

    # Cờ cảnh báo geofence
    is_outside_geofence = models.BooleanField(default=False)
    geofence_warned_at = models.DateTimeField(blank=True, null=True)

    # QA-FIX-2 / E: persist trạng thái "đã cảnh báo predictive" (sắp rời
    # vùng 80-100% radius). Trước đây dùng thuộc tính tạm `_predictive_warned`
    # trên instance → mỗi GPS update tạo instance mới → flag luôn reset →
    # push lặp vô hạn "sắp rời vùng an toàn" cho cùng 1 task.
    # Giờ persist vào DB: chỉ set 1 lần khi进入 vùng 80-100%, clear khi
    # carepartner về vùng an toàn (< 80%) hoặc rời vùng (> 100%).
    predictive_warned = models.BooleanField(
        default=False,
        help_text="Đã gửi cảnh báo predictive (80-100% radius). Reset khi về vùng an toàn."
    )

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

    Phần 1 — Offline cache:
      - `recorded_at`: timestamp server nhận (auto_now_add — không đổi được).
      - `client_recorded_at`: timestamp client ghi nhận GPS (set tay qua batch).
        Khi gửi batch (offline sync), field này có giá trị quá khứ (lúc GPS
        thực sự capture điểm). Khi gửi real-time, field này = NULL (chỉ
        có recorded_at).
      - Parent view history sẽ ưu tiên client_recorded_at nếu có, fallback
        về recorded_at.

    QA-FIX-2 / B1 — Idempotent batch:
      - `client_point_id`: UUID do mobile sinh cho mỗi điểm GPS. Khi retry
        batch do network timeout/5xx, điểm đã insert rồi sẽ bị từ chối
        (unique constraint) thay vì tạo duplicate. Trước đây retry tạo
        route bị trùng lặp → parent nhìn thấy "carepartner đi đi lại lại".
      - Unique constraint: (task, worker, client_point_id) khi
        client_point_id IS NOT NULL (partial unique index — cho phép
        realtime points có client_point_id=NULL không bị constraint).
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
    # Phần 1 — Timestamp client-side (cho batch offline sync)
    client_recorded_at = models.DateTimeField(
        null=True, blank=True, db_index=True,
        help_text="Timestamp client ghi nhận GPS (cho batch offline sync). "
                  "NULL nếu gửi real-time."
    )

    # QA-FIX-2 / B1 — Idempotent batch: UUID do mobile sinh cho mỗi điểm.
    # Khi retry batch do network timeout/5xx, điểm đã insert rồi sẽ bị
    # từ chối (unique constraint) thay vì tạo duplicate. NULL cho realtime
    # points (không cần idempotent vì realtime không retry).
    client_point_id = models.CharField(
        max_length=36, null=True, blank=True, db_index=True,
        help_text="UUID do mobile sinh cho mỗi điểm GPS (idempotent batch). "
                  "NULL cho realtime points."
    )

    class Meta:
        ordering = ['recorded_at']   # chronological
        indexes = [
            models.Index(fields=['task', 'recorded_at']),
            models.Index(fields=['task', 'client_recorded_at']),
            models.Index(fields=['worker', '-recorded_at']),
        ]
        # QA-FIX-2 / B1: partial unique index — chỉ áp dụng khi
        # client_point_id IS NOT NULL (cho phép realtime points có
        # client_point_id=NULL không bị constraint). Tránh duplicate
        # khi mobile retry batch do network timeout/5xx.
        constraints = [
            models.UniqueConstraint(
                fields=['task', 'worker', 'client_point_id'],
                name='unique_task_worker_client_point_id',
                condition=models.Q(client_point_id__isnull=False),
            ),
        ]

    def __str__(self):
        ts = self.client_recorded_at or self.recorded_at
        return f"Task#{self.task_id} | ({self.latitude}, {self.longitude}) | {ts:%Y-%m-%d %H:%M:%S}"


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


# ═══════════════════════════════════════════════════════════════════
#  DEVICE OFFLINE ALERT — chống tắt máy/đập máy để phạm tội
# ═══════════════════════════════════════════════════════════════════
# Luồng an toàn:
#   1. Carepartner app gửi heartbeat mỗi 30s khi đang tracking
#   2. Backend scheduler chạy mỗi 1 phút — quét tất cả heartbeat có
#      task.status='in_progress' + consent='granted'
#   3. Nếu last_seen > TRACKING_OFFLINE_THRESHOLD (mặc định 60s)
#      + push notification priority=high cho phụ huynh (chuông kêu)
#      + notify admin
#   4. Khi carepartner app gửi heartbeat lại → tự resolve alert
#   5. Khi task completed/cancelled → clear heartbeat + alert
# ═══════════════════════════════════════════════════════════════════


class DeviceHeartbeat(models.Model):
    """
    Heartbeat thiết bị của carepartner khi đang tracking.
    Mỗi task chỉ có 1 row (update-in-place).
    Dùng để phát hiện thiết bị tắt nguồn/mất mạng/đập máy.
    """
    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='device_heartbeat'
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='device_heartbeats'
    )

    last_seen = models.DateTimeField(db_index=True, help_text="Lần cuối carepartner gửi heartbeat")
    last_location_lat = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True,
        help_text="Vị trí GPS lần cuối (để parent biết carepartner ở đâu khi mất kết nối)"
    )
    last_location_lng = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True
    )

    # Trạng thái thiết bị
    DEVICE_STATUS_CHOICES = (
        ('online', 'Trực tuyến — đang gửi heartbeat'),
        ('offline', 'Ngoại tuyến — không nhận heartbeat > TRACKING_OFFLINE_THRESHOLD'),
        ('stopped', 'Đã dừng — task hoàn thành/huỷ'),
    )
    device_status = models.CharField(
        max_length=20, choices=DEVICE_STATUS_CHOICES, default='online',
        db_index=True
    )

    # Thông tin thiết bị (debug + audit)
    battery_level = models.IntegerField(null=True, blank=True, help_text="% pin (0-100)")
    app_state = models.CharField(max_length=20, blank=True, default='', help_text="foreground/background/killed")
    network_type = models.CharField(max_length=20, blank=True, default='', help_text="wifi/cellular/none")

    offline_detected_at = models.DateTimeField(null=True, blank=True, help_text="Khi phát hiện offline")
    offline_alert_sent = models.BooleanField(default=False, help_text="Đã gửi push cho phụ huynh chưa")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['device_status', 'last_seen']),
            models.Index(fields=['worker', 'device_status']),
        ]

    def __str__(self):
        return f"Heartbeat Task#{self.task_id} | {self.device_status} | last_seen={self.last_seen:%H:%M:%S}"


class DeviceOfflineAlert(models.Model):
    """
    Alert khi thiết bị carepartner ngoại tuyến quá lâu (> TRACKING_OFFLINE_THRESHOLD).
    Đẩy chuông kêu (priority=high) cho phụ huynh.
    """
    ALERT_STATUS_CHOICES = (
        ('active', 'Đang khẩn cấp — thiết bị vẫn offline'),
        ('recovered', 'Thiết bị đã online trở lại'),
        ('task_ended', 'Task đã kết thúc (completed/cancelled)'),
        ('false', 'Báo động sai (lỗi mạng backend)'),
    )

    task = models.ForeignKey(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='device_offline_alerts'
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='device_offline_alerts'
    )
    heartbeat = models.ForeignKey(
        DeviceHeartbeat,
        on_delete=models.CASCADE,
        related_name='alerts',
        null=True, blank=True,
    )

    # Thông tin lúc phát hiện offline
    last_seen = models.DateTimeField(help_text="Lần cuối carepartner gửi heartbeat trước khi mất kết nối")
    last_location_lat = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True,
        help_text="Vị trí GPS cuối cùng biết"
    )
    last_location_lng = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True
    )

    status = models.CharField(max_length=20, choices=ALERT_STATUS_CHOICES, default='active', db_index=True)

    # Push notification tracking
    push_sent = models.BooleanField(default=False, help_text="Đã gửi push cho phụ huynh")
    push_sent_at = models.DateTimeField(null=True, blank=True)

    # Số lần retry push đã thực hiện (Phần 2 — báo động liên tục tới khi acknowledge)
    push_retry_count = models.IntegerField(default=0, help_text="Số lần đã retry push")
    # Khi parent đã mở app và xem cảnh báo → set trường này để dừng retry loop
    acknowledged_at = models.DateTimeField(null=True, blank=True, help_text="Parent đã xem/acknowledge alert")

    # QA-FIX-1 / Spec 2.2: ai đã acknowledge (audit). SET_NULL để không mất
    # audit trail khi user bị xoá.
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name='acknowledged_offline_alerts',
        help_text="User đã acknowledge alert (audit)"
    )

    # Khi thiết bị online trở lại
    recovered_at = models.DateTimeField(null=True, blank=True)
    recovery_duration_seconds = models.IntegerField(null=True, blank=True, help_text="Thời gian offline (giây)")

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['task', 'status']),
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['worker', 'status']),
            # Index cho scheduler retry — tìm alert active chưa acknowledged
            models.Index(fields=['status', 'acknowledged_at', 'push_sent_at']),
        ]
        # QA-FIX-2 / C: partial unique index — mỗi task chỉ có 1 alert
        # active tại 1 thời điểm. Chống scheduler chạy 2 instance song
        # song cùng tạo 2 alert cho cùng task.
        # Condition: status='active' → các alert recovered/task_ended/
        # false không bị constraint.
        constraints = [
            models.UniqueConstraint(
                fields=['task'],
                name='unique_active_alert_per_task',
                condition=models.Q(status='active'),
            ),
        ]

    def __str__(self):
        return f"OfflineAlert Task#{self.task_id} | {self.get_status_display()} | {self.created_at:%H:%M:%S}"


# ═══════════════════════════════════════════════════════════════════
#  RANDOM VERIFICATION CHECK — xác minh ngẫu nhiên trong ca làm
#  Chống carepartner để máy lại rồi bỏ đi: hệ thống bất ngờ yêu cầu
#  carepartner nhập đúng mã cá nhân để chứng minh vẫn đang cầm máy.
# ═══════════════════════════════════════════════════════════════════

class RandomVerificationCheck(models.Model):
    """
    Xác minh ngẫu nhiên trong ca làm — hệ thống bất ngờ yêu cầu CarePartner
    nhập mã cá nhân để chứng minh vẫn đang cầm máy, không báo trước lịch.

    B5 — Xác thực bằng ảnh trong ca (bổ sung cho PIN):
      - verification_type='photo': thay vì nhập PIN, CarePartner phải chụp
        1 ảnh (selfie tại chỗ) để chứng minh vẫn đang cầm máy. Ảnh hợp lệ
        được nộp → status='confirmed' (tái sử dụng state machine, không
        thêm state mới — ảnh là "câu trả lời đúng" của check).
      - Ảnh không public qua /media/ — chỉ xem qua API có auth
        (GET /api/tracking/verification-checks/<id>/photo/) dành cho
        worker của check, phụ huynh của task, và admin.

    QA-FIX-1 / Bug 1.3: thêm 2 field để chống spam push phụ huynh khi
    CarePartner liên tục timeout:
      - parent_alert_sent: đã gửi alert cho phụ huynh chưa (1 lần/streak).
        Reset về False khi check kết thúc (confirmed/wrong_code/cancelled).
      - consecutive_timeouts_count: số lần timeout liên tiếp hiện tại.
        Reset về 0 khi check kết thúc (confirmed/wrong_code/cancelled).
    """
    STATUS_CHOICES = (
        ('pending',    'Đang chờ CarePartner phản hồi'),
        ('confirmed',  'CarePartner nhập đúng mã trong thời hạn'),
        ('wrong_code', 'CarePartner nhập sai mã'),
        ('timeout',    'Hết thời gian, CarePartner không phản hồi'),
        # QA-FIX-1 / Spec 2.4: admin/parent có thể huỷ check khi đang pending
        # (vd: phát hiện false alarm, task đã completed, ...). Trước đây
        # check pending chỉ có thể chờ timeout → không có cách chủ động dừng.
        ('cancelled',  'Đã bị huỷ bởi admin/parent (không tính vào streak)'),
    )
    # B5 — loại xác minh: 'pin' (nhập mã PIN) hoặc 'photo' (chụp ảnh).
    # Mặc định 'pin' để mọi row hiện có (data cũ) vẫn là PIN check —
    # migration thêm field với default không phá dữ liệu cũ.
    VERIFICATION_TYPE_CHOICES = (
        ('pin',   'Nhập mã PIN cá nhân'),
        ('photo', 'Chụp ảnh xác minh tại chỗ'),
    )
    task = models.ForeignKey('core.Task', on_delete=models.CASCADE, related_name='verification_checks')
    worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='verification_checks')

    triggered_at = models.DateTimeField(auto_now_add=True, help_text="Thời điểm hệ thống bất ngờ chọn để yêu cầu xác minh")
    respond_deadline = models.DateTimeField(help_text="Hạn chót phản hồi, ví dụ triggered_at + RESPOND_TIMEOUT_SECONDS")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    attempts = models.IntegerField(default=0, help_text="Số lần nhập sai")
    responded_at = models.DateTimeField(blank=True, null=True)

    # B5 — loại check (pin/photo). Có index để scheduler + admin filter nhanh.
    verification_type = models.CharField(
        max_length=10, choices=VERIFICATION_TYPE_CHOICES, default='pin', db_index=True,
        help_text="B5: loại xác minh — 'pin' (nhập mã) hoặc 'photo' (chụp ảnh).",
    )

    # B5 — ảnh xác minh (chỉ đúng 1 ảnh/check nên đặt field trực tiếp trên
    # model theo Phương án A). Lưu theo convention upload_to của dự án.
    # ⚠️ KHÔNG serve qua /media/ public — chỉ qua API endpoint có auth.
    photo = models.ImageField(
        upload_to='verification_photos/', blank=True, null=True,
        help_text="B5: ảnh xác minh CarePartner chụp tại chỗ.",
    )
    photo_submitted_at = models.DateTimeField(
        blank=True, null=True,
        help_text="B5: thời điểm ảnh hợp lệ được nộp (check chuyển 'confirmed').",
    )

    # B5 — chống gửi trùng thông báo "ảnh đã được nộp" cho phụ huynh
    # (giống cơ chế parent_alert_sent chống spam timeout alert).
    # Mỗi check chỉ có 1 ảnh → chỉ gửi 1 lần; flag là lớp phòng vệ khi
    # client retry request nộp ảnh.
    parent_photo_notification_sent = models.BooleanField(
        default=False,
        help_text="B5: đã gửi thông báo 'ảnh đã nộp' cho phụ huynh chưa (1 lần/check).",
    )

    # Vị trí lúc phản hồi (đối chiếu chéo với LiveLocation, tận dụng lại logic phần 1)
    response_lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    response_lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    # Push retry tracking (giống DeviceOfflineAlert — gửi lại nếu chưa phản hồi)
    push_sent = models.BooleanField(default=False, help_text="Đã gửi push yêu cầu xác minh")
    push_retry_count = models.IntegerField(default=0, help_text="Số lần đã retry push")

    # QA-FIX-1 / Bug 1.3: chống spam push phụ huynh khi CarePartner liên tục timeout.
    # - parent_alert_sent: đã gửi alert cho phụ huynh trong streak này chưa.
    #   Chỉ gửi 1 lần/streak (reset khi confirmed/wrong_code/cancelled).
    # - consecutive_timeouts_count: số timeout liên tiếp cho task này.
    #   Mỗi timeout tăng +1; reset về 0 khi confirmed/wrong_code/cancelled.
    parent_alert_sent = models.BooleanField(
        default=False,
        help_text="Đã gửi alert cho phụ huynh trong streak timeout hiện tại (chỉ 1 lần/streak)."
    )
    consecutive_timeouts_count = models.IntegerField(
        default=0,
        help_text="Số timeout liên tiếp hiện tại. Reset khi confirmed/wrong_code/cancelled."
    )

    class Meta:
        ordering = ['-triggered_at']
        indexes = [
            models.Index(fields=['task', 'status']),
            models.Index(fields=['worker', 'status']),
            models.Index(fields=['status', 'respond_deadline']),
        ]
        # QA-FIX-2 / C: partial unique index — mỗi (task, worker) chỉ có
        # 1 check pending tại 1 thời điểm. Chống scheduler chạy 2 instance
        # song song cùng tạo 2 check cho cùng task.
        constraints = [
            models.UniqueConstraint(
                fields=['task', 'worker'],
                name='unique_pending_check_per_task_worker',
                condition=models.Q(status='pending'),
            ),
        ]

    def __str__(self):
        return f"VerifyCheck Task#{self.task_id} | {self.get_status_display()} | {self.triggered_at:%H:%M:%S}"


# ═══════════════════════════════════════════════════════════════════
#  SCHEDULER HEALTH — QA-FIX-5 / M2
# ═══════════════════════════════════════════════════════════════════
# Vấn đề QA phát hiện: render.yaml có Cron Job 'educarelink-tracking-scheduler'
# chạy mỗi 1 phút. Cron ghi /tmp/tracking_scheduler_health.json. Web service
# đọc cùng path qua API /api/tracking/scheduler-health/. Trên Render, Cron
# Job và web service là 2 container độc lập, không chia sẻ /tmp → endpoint
# luôn trả 'no_data' dù cron đã chạy.
#
# Giải pháp: persist health vào DB (SchedulerHealth model). Cron + web
# service dùng chung DB nên endpoint thấy được lần chạy gần nhất của cron.
# Vẫn giữ /tmp file như fallback (cho dev local + log).
# ═══════════════════════════════════════════════════════════════════


class SchedulerHealth(models.Model):
    """
    Lưu trạng thái scheduler lần chạy gần nhất — DB-based thay vì /tmp file
    (QA-FIX-5 / M2: /tmp không chia sẻ giữa Cron container và web container).

    Schema: chỉ 1 row duy nhất (singleton — được update thay vì insert mới).
    Trường `source` cho biết process nào ghi (cron/daemon/web_worker/test).

    Endpoint /api/tracking/scheduler-health/ đọc row này thay vì /tmp file.
    Monitoring ngoài (UptimeRobot, Render Stats, ...) poll endpoint:
      - 200 + last_run_at gần đây (< 3 phút) → scheduler đang chạy.
      - 200 + last_run_at cũ (> 3 phút) → scheduler KHÔNG chạy (cron die,
        env var sai, exception). Cần alert admin.
      - 200 + null (chưa có row) → scheduler chưa chạy lần nào sau deploy.
    """
    # Singleton — chỉ 1 row, dùng id=1 cố định.
    SCHEDULER_CHOICES = (
        ('both', 'Cả offline + verification'),
        ('offline', 'Chỉ offline check'),
        ('verification', 'Chỉ verification check'),
        ('unknown', 'Không xác định'),
    )

    last_run_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Thời điểm scheduler chạy lần gần nhất (UTC). NULL nếu scheduler chưa chạy lần nào."
    )
    started_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Thời điểm bắt đầu lần chạy (UTC)."
    )
    finished_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Thời điểm kết thúc lần chạy (UTC)."
    )
    source = models.CharField(
        max_length=20, default='cron',
        help_text="Process nào ghi: cron/daemon/web_worker/test."
    )
    scheduler_kind = models.CharField(
        max_length=20, choices=SCHEDULER_CHOICES, default='both',
        help_text="Scheduler nào chạy: both/offline/verification."
    )
    success = models.BooleanField(
        default=True,
        help_text="True nếu chạy không exception. False nếu có error."
    )
    error_message = models.TextField(
        blank=True, default='',
        help_text="Exception message nếu success=False."
    )
    stats = models.JSONField(
        default=dict, blank=True,
        help_text="Stats dict trả về từ offline_scheduler/verification_scheduler."
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Scheduler health'
        ordering = ['-last_run_at']

    def __str__(self):
        return f"SchedulerHealth | last_run={self.last_run_at:%Y-%m-%d %H:%M:%S} | source={self.source}"

    @classmethod
    def get_singleton(cls):
        """Trả về singleton row (id=1). Tạo nếu chưa có."""
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                'last_run_at': None,
                'source': 'unknown',
                'scheduler_kind': 'unknown',
            }
        )
        return obj

    @classmethod
    def record_run(cls, *, last_run_at, source='cron', scheduler_kind='both',
                   success=True, error_message='', stats=None,
                   started_at=None, finished_at=None):
        """
        Cập nhật singleton row với lần chạy gần nhất.
        Atomic update để tránh race khi 2 scheduler chạy đồng thời.
        """
        from django.db import transaction
        with transaction.atomic():
            obj = cls.get_singleton()
            obj.last_run_at = last_run_at
            obj.source = source
            obj.scheduler_kind = scheduler_kind
            obj.success = success
            obj.error_message = error_message[:2000] if error_message else ''
            obj.stats = stats or {}
            obj.started_at = started_at
            obj.finished_at = finished_at
            obj.save()
        return obj

