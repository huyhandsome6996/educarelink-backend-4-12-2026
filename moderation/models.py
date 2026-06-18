"""
╔══════════════════════════════════════════════════════════════════╗
║   Moderation Module — Kiểm duyệt công việc + Khiếu nại + AI       ║
║                                                                   ║
║   1. TaskModeration: AI tự duyệt task khi parent đăng             ║
║      - Kiểm tra: đạo đức, chính trị, luật pháp VN, tiêu chuẩn     ║
║        cộng đồng                                                  ║
║      - Trạng thái: pending → approved / rejected / needs_review   ║
║      - Nếu AI không chắc → needs_review (admin duyệt thủ công)    ║
║                                                                   ║
║   2. Complaint: Carepartner khiếu nại phụ huynh                   ║
║      - Loại: bóc lột, ngược đãi, quấy rối, không trả tiền,       ║
║        gian lận, khác                                             ║
║      - Bằng chứng: văn bản, ảnh, video (multipart upload)         ║
║      - AI phân tích + gợi ý xử lý cho admin                       ║
║                                                                   ║
║   3. Admin: giao diện duyệt task + xử lý khiếu nại                ║
║      - AI 24/7 hỗ trợ: phân loại, tóm tắt, gợi ý hành động        ║
╚══════════════════════════════════════════════════════════════════╝
"""

from django.db import models
from django.conf import settings


class TaskModeration(models.Model):
    """Kết quả kiểm duyệt AI cho từng task."""
    STATUS_CHOICES = (
        ('pending',      'Chờ duyệt — AI chưa xử lý'),
        ('approved',     'Đã duyệt — phù hợp tiêu chuẩn'),
        ('rejected',     'Bị từ chối — vi phạm tiêu chuẩn'),
        ('needs_review', 'Cần admin xem xét — AI không chắc'),
        ('admin_approved',  'Admin đã duyệt (override AI reject)'),
        ('admin_rejected',  'Admin đã từ chối (override AI approve)'),
    )

    task = models.OneToOneField(
        'core.Task',
        on_delete=models.CASCADE,
        related_name='moderation'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # AI analysis
    ai_verdict = models.TextField(blank=True, default='', help_text="AI đánh giá chi tiết")
    ai_confidence = models.FloatField(default=0, help_text="Độ tin cậy 0-1")
    ai_flags = models.JSONField(default=list, blank=True, help_text="Các cờ vi phạm: ['chinh_tri', 'bao_luc', 'lua_dao', ...]")
    ai_suggestion = models.TextField(blank=True, default='', help_text="Gợi ý AI cho admin nếu needs_review")

    # Admin override
    admin_note = models.TextField(blank=True, default='', help_text="Ghi chú admin khi override")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='moderation_reviews'
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status'])]

    def __str__(self):
        return f"Task#{self.task_id} | {self.get_status_display()}"


class Complaint(models.Model):
    """Carepartner khiếu nại phụ huynh."""
    COMPLAINT_TYPE_CHOICES = (
        ('exploitation',  'Bóc lột / bóc lột sức lao động'),
        ('abuse',         'Ngược đãi (thể chất / tinh thần)'),
        ('harassment',    'Quấy rối / xúc phạm'),
        ('non_payment',   'Không trả / trả thiếu tiền'),
        ('fraud',         'Gian lận / lừa đảo'),
        ('unsafe',        'Môi trường không an toàn'),
        ('other',         'Khác'),
    )
    STATUS_CHOICES = (
        ('pending',       'Chờ xử lý'),
        ('investigating', 'Đang điều tra'),
        ('resolved',      'Đã giải quyết'),
        ('dismissed',     'Bác bỏ'),
    )
    PRIORITY_CHOICES = (
        ('low',    'Thấp'),
        ('medium', 'Trung bình'),
        ('high',   'Cao'),
        ('urgent', 'Khẩn cấp'),
    )

    complainant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='filed_complaints', help_text="Carepartner gửi khiếu nại"
    )
    reported_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='received_complaints', help_text="Phụ huynh bị khiếu nại"
    )
    task = models.ForeignKey(
        'core.Task', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='complaints', help_text="Task liên quan (nếu có)"
    )

    complaint_type = models.CharField(max_length=20, choices=COMPLAINT_TYPE_CHOICES)
    title = models.CharField(max_length=255)
    description = models.TextField(help_text="Mô tả chi tiết sự việc")

    # AI analysis
    ai_analysis = models.TextField(blank=True, default='', help_text="AI tóm tắt + phân loại")
    ai_priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium', help_text="AI đề xuất mức ưu tiên")
    ai_suggestion = models.TextField(blank=True, default='', help_text="AI gợi ý hành động cho admin")
    ai_analyzed = models.BooleanField(default=False)

    # Admin
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    admin_response = models.TextField(blank=True, default='', help_text="Phản hồi admin cho carepartner")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='resolved_complaints'
    )
    resolved_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'priority']),
            models.Index(fields=['complainant']),
            models.Index(fields=['reported_user']),
        ]

    def __str__(self):
        return f"#{self.id} | {self.get_complaint_type_display()} | {self.get_status_display()}"


class ComplaintEvidence(models.Model):
    """Bằng chứng đính kèm khiếu nại (ảnh, video, văn bản)."""
    EVIDENCE_TYPE_CHOICES = (
        ('image', 'Ảnh'),
        ('video', 'Video'),
        ('document', 'Văn bản / tài liệu'),
    )

    complaint = models.ForeignKey(
        Complaint, on_delete=models.CASCADE,
        related_name='evidence'
    )
    evidence_type = models.CharField(max_length=10, choices=EVIDENCE_TYPE_CHOICES)
    file = models.FileField(upload_to='complaint_evidence/', help_text="File ảnh/video/văn bản")
    description = models.TextField(blank=True, default='', help_text="Mô tả bằng chứng")

    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Complaint#{self.complaint_id} | {self.get_evidence_type_display()}"
