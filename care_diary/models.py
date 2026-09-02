"""B1 — Nhật ký chăm sóc (Care Diary).

Module độc lập, chỉ phụ thuộc core (§15.1 Module Isolation).
1 Task = tối đa 1 CareDiaryEntry (OneToOne).
Activities + Attachments tách bảng riêng vì có file ảnh + enum status cần validate.
stats (đếm activities theo status) tính động khi trả API, không lưu riêng.
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class CareDiaryEntry(models.Model):
    """Nhật ký chăm sóc cho 1 task — do CarePartner tạo."""
    task = models.OneToOneField(
        'core.Task', on_delete=models.CASCADE, related_name='care_diary',
    )
    worker = models.ForeignKey(
        'core.User', on_delete=models.CASCADE, related_name='care_diary_entries',
    )
    mood_icon = models.CharField(max_length=30, blank=True, default='')
    mood_label = models.CharField(max_length=100, blank=True, default='')
    mood_note = models.TextField(blank=True, default='')
    completion_percent = models.PositiveSmallIntegerField(
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Nhật ký chăm sóc'
        verbose_name_plural = 'Nhật ký chăm sóc'

    def __str__(self):
        return f'CareDiary #{self.id} — Task #{self.task_id}'


class CareDiaryActivity(models.Model):
    """Hoạt động trong buổi chăm sóc — timeline."""
    STATUS_CHOICES = [
        ('done', 'Hoàn thành'),
        ('partial', 'Một phần'),
        ('skipped', 'Bỏ qua'),
    ]
    entry = models.ForeignKey(
        CareDiaryEntry, on_delete=models.CASCADE, related_name='activities',
    )
    time = models.CharField(max_length=10)          # "15:30"
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default='done',
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = 'Hoạt động nhật ký'
        verbose_name_plural = 'Hoạt động nhật ký'
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.time} — {self.title}'


class CareDiaryAttachment(models.Model):
    """Ảnh đính kèm nhật ký chăm sóc."""
    entry = models.ForeignKey(
        CareDiaryEntry, on_delete=models.CASCADE, related_name='attachments',
    )
    image = models.ImageField(upload_to='care_diary_attachments/')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Ảnh đính kèm nhật ký'
        verbose_name_plural = 'Ảnh đính kèm nhật ký'
        ordering = ['id']

    def __str__(self):
        return f'Attachment #{self.id} — Entry #{self.entry_id}'
