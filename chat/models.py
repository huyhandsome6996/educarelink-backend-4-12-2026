"""
╔══════════════════════════════════════════════════════════════════╗
║   EduCareLink — Chat Module (N — Cửa sổ chat còn hiệu lực)        ║
║                                                                   ║
║   Chat trực tiếp giữa Phụ huynh và CarePartner, chỉ mở trong      ║
║   một cửa sổ thời gian nhất định:                                 ║
║     - MỞ khi task chuyển 'in_progress' (phụ huynh duyệt đơn —     ║
║       Lựa chọn A-1, xem WORKLOG "## N — Cửa sổ chat")             ║
║     - ĐÓNG tại completed_at + 24 giờ (Nên đọc Task.completed_at)  ║
║     - Task 'cancelled' → đóng NGAY (không có ca làm thật)         ║
║                                                                   ║
║   Kiến trúc (AGENTS.md §15):                                      ║
║     - Module độc lập, chỉ phụ thuộc core                          ║
║     - Tích hợp Task lifecycle qua signal post_save (không sửa     ║
║       core/views.py để gọi chat — chỉ set completed_at tại nguồn) ║
║     - Service layer: toàn bộ business logic trong services.py     ║
║     - Scheduler quét đóng cửa sổ hết hạn + lazy-close tại mọi    ║
║       API read/write (đúng kể cả scheduler chưa chạy)             ║
║                                                                   ║
║   Bảo mật:                                                        ║
║     - Chỉ đúng 2 người (parent + worker của task) truy cập        ║
║       conversation; người ngoài → 403 (không lộ tồn tại)          ║
║     - Nội dung tin nhắn qua kiểm duyệt từ khoá cấm TRƯỚC khi lưu  ║
║       (nền tảng liên quan trẻ em)                                 ║
║     - Cửa sổ đóng → READ-ONLY: giữ lịch sử cho mục đích an toàn/  ║
║       tranh chấp, chỉ chặn gửi tin mới                            ║
╚══════════════════════════════════════════════════════════════════╝
"""

from django.conf import settings
from django.db import models


class Conversation(models.Model):
    """
    Phiên chat giữa phụ huynh và CarePartner cho 1 task.

    CHỈ tạo record khi cửa sổ chat MỞ (task → 'in_progress') — không tạo
    sẵn lúc task 'open' để tránh rác data cho task không bao giờ được nhận
    (vì vậy KHÔNG cần trạng thái 'pending' như spec nhắc; status chỉ có
    'open' | 'closed').

    Vòng đời:
      - open_conversation_for_task(task) tạo record khi task in_progress
      - Task completed → closes_at = completed_at + 24h (status vẫn 'open',
        việc đóng diễn ra khi hết hạn: scheduler quét hoặc lazy-close ở
        mọi API read/write — closes_at <= now → 'closed')
      - Task cancelled → đóng NGAY (status='closed', closed_at=now)
      - Sau khi đóng: READ-ONLY — Message giữ nguyên để tra cứu sau này,
        chỉ chặn gửi tin mới (send_message raise PermissionError 403).

    Denormalize parent/worker từ task để query nhanh + ownership check
    không cần join Task mỗi lần.
    """
    STATUS_CHOICES = (
        ('open',   'Đang mở — có thể gửi tin nhắn'),
        ('closed', 'Đã đóng — chỉ xem lại lịch sử (read-only)'),
    )

    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='conversation',
    )
    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_conversations_as_parent',
    )
    worker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_conversations_as_worker',
    )

    opens_at = models.DateTimeField(help_text="Thời điểm cửa sổ chat mở (task → in_progress)")
    # Hạn chót đóng cửa sổ. NULL khi task chưa completed (chưa biết hạn).
    # Khi task completed → completed_at + 24h. Khi cancelled → thời điểm huỷ.
    closes_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Hạn chót đóng cửa sổ (completed_at + 24h). NULL = task chưa kết thúc.",
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='open', db_index=True)
    # Thời điểm THẬT SỰ chuyển 'closed' (scheduler hoặc lazy-close) — khác
    # closes_at (là hạn chót). Audit + debug.
    closed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cuộc trò chuyện'
        verbose_name_plural = 'Cuộc trò chuyện'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['status', 'closes_at']),  # scheduler quét
            models.Index(fields=['parent', 'status']),
            models.Index(fields=['worker', 'status']),
        ]

    def __str__(self):
        return f"Chat Task#{self.task_id} | {self.parent.username} ↔ {self.worker.username} | {self.status}"


class Message(models.Model):
    """
    Tin nhắn trong conversation.

    - created_at tăng theo id (AutoField) → dùng ?since=<id> cho polling
      client (giống pattern pending check B5 nhưng thưa hơn).
    - read_at nullable theo pattern Notification.is_read / DeviceOfflineAlert
      .acknowledged_at của dự án — NULL = chưa đọc. Đánh dấu theo batch
      (mark_messages_read đánh dấu mọi tin của người kia gửi cho requester).
    - Tin nhắn bị kiểm duyệt chặn KHÔNG BAO GIỜ được tạo row (block tại
      service layer trước save) — nên không cần field moderation_status;
      tin trong DB mặc định là đã qua kiểm duyệt.
    """
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_messages_sent',
    )
    content = models.TextField(help_text="Nội dung tin nhắn (đã qua kiểm duyệt từ khoá cấm)")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Thời điểm người nhận đọc (NULL = chưa đọc).",
    )

    class Meta:
        verbose_name = 'Tin nhắn chat'
        verbose_name_plural = 'Tin nhắn chat'
        ordering = ['id']  # id tăng dần = thứ tự thời gian → polling since=<id>
        indexes = [
            models.Index(fields=['conversation', 'id']),
            models.Index(fields=['conversation', 'read_at']),
        ]

    def __str__(self):
        return f"Msg#{self.id} Conversation#{self.conversation_id} từ {self.sender.username}: {self.content[:30]}"
