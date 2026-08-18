"""
QA-FIX-1 migration — thêm fields cho DeviceOfflineAlert + RandomVerificationCheck.

Backward compatible (tất cả fields đều có default), chạy trên DB hiện có
không cần downtime.

Các fields thêm:
  - DeviceOfflineAlert.acknowledged_by (FK → User, SET_NULL, default=None)
    Spec 2.2: audit ai đã acknowledge alert.
  - RandomVerificationCheck.parent_alert_sent (BooleanField, default=False)
    Bug 1.3: flag chống spam push parent (chỉ gửi 1 lần/streak timeout).
  - RandomVerificationCheck.consecutive_timeouts_count (IntegerField, default=0)
    Bug 1.3: đếm số timeout liên tiếp hiện tại.

Không cần alter STATUS_CHOICES của RandomVerificationCheck (đã thêm 'cancelled'
trong model — choices chỉ là metadata, không ảnh hưởng DB schema).
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('tracking', '0004_locationhistory_client_recorded_at_and_more'),
    ]

    operations = [
        # Spec 2.2 — DeviceOfflineAlert.acknowledged_by
        migrations.AddField(
            model_name='deviceofflinealert',
            name='acknowledged_by',
            field=models.ForeignKey(
                on_delete=models.SET_NULL,
                related_name='acknowledged_offline_alerts',
                to=settings.AUTH_USER_MODEL,
                null=True,
                blank=True,
                help_text="User đã acknowledge alert (audit)",
            ),
        ),
        # Bug 1.3 — RandomVerificationCheck.parent_alert_sent
        migrations.AddField(
            model_name='randomverificationcheck',
            name='parent_alert_sent',
            field=models.BooleanField(
                default=False,
                help_text="Đã gửi alert cho phụ huynh trong streak timeout hiện tại (chỉ 1 lần/streak).",
            ),
        ),
        # Bug 1.3 — RandomVerificationCheck.consecutive_timeouts_count
        migrations.AddField(
            model_name='randomverificationcheck',
            name='consecutive_timeouts_count',
            field=models.IntegerField(
                default=0,
                help_text="Số timeout liên tiếp hiện tại. Reset khi confirmed/wrong_code/cancelled.",
            ),
        ),
        # Spec 2.4 — alter STATUS_CHOICES để thêm 'cancelled' (chỉ metadata,
        # không đổi DB schema vì max_length vẫn = 20).
        migrations.AlterField(
            model_name='randomverificationcheck',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Đang chờ CarePartner phản hồi'),
                    ('confirmed', 'CarePartner nhập đúng mã trong thời hạn'),
                    ('wrong_code', 'CarePartner nhập sai mã'),
                    ('timeout', 'Hết thời gian, CarePartner không phản hồi'),
                    ('cancelled', 'Đã bị huỷ bởi admin/parent (không tính vào streak)'),
                ],
                db_index=True,
                default='pending',
                max_length=20,
            ),
        ),
    ]
