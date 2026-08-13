"""
QA-FIX-2 migration — bổ sung fields + constraints cho an toàn CarePartner.

Tác động:
  1. AddField LocationHistory.client_point_id (CharField, max_length=36,
     null=True, blank=True, db_index=True)
     — Idempotent batch: mobile sinh UUID cho mỗi điểm, retry không tạo
     duplicate nhờ unique constraint.

  2. Add UniqueConstraint (task, worker, client_point_id) WHERE
     client_point_id IS NOT NULL — partial unique index. Cho phép
     realtime points có client_point_id=NULL không bị constraint.

  3. AddField LiveLocation.predictive_warned (BooleanField, default=False)
     — Persist trạng thái "đã gửi cảnh báo predictive geofence" vào DB.
     Trước đây dùng thuộc tính tạm → push lặp vô hạn.

  4. Add UniqueConstraint task WHERE status='active' trên DeviceOfflineAlert
     — Chống scheduler chạy 2 instance song song tạo 2 alert cho cùng task.

  5. Add UniqueConstraint (task, worker) WHERE status='pending' trên
     RandomVerificationCheck — Chống scheduler tạo 2 check pending cho
     cùng (task, worker).

Backward compatible (tất cả fields đều có default), chạy trên DB hiện có
không cần downtime.
"""
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('tracking', '0005_deviceofflinealert_acknowledged_by_and_more'),
    ]

    operations = [
        # === B1 — LocationHistory.client_point_id (idempotent batch) ===
        migrations.AddField(
            model_name='locationhistory',
            name='client_point_id',
            field=models.CharField(
                max_length=36,
                null=True,
                blank=True,
                db_index=True,
                help_text="UUID do mobile sinh cho mỗi điểm GPS (idempotent batch). NULL cho realtime points.",
            ),
        ),
        # B1 — partial unique index: (task, worker, client_point_id) WHERE
        # client_point_id IS NOT NULL. Tránh duplicate khi mobile retry batch.
        migrations.AddConstraint(
            model_name='locationhistory',
            constraint=models.UniqueConstraint(
                condition=models.Q(client_point_id__isnull=False),
                fields=['task', 'worker', 'client_point_id'],
                name='unique_task_worker_client_point_id',
            ),
        ),

        # === E — LiveLocation.predictive_warned (persist geofence flag) ===
        migrations.AddField(
            model_name='livelocation',
            name='predictive_warned',
            field=models.BooleanField(
                default=False,
                help_text="Đã gửi cảnh báo predictive (80-100% radius). Reset khi về vùng an toàn.",
            ),
        ),

        # === C — DeviceOfflineAlert: 1 active alert per task (chống race) ===
        migrations.AddConstraint(
            model_name='deviceofflinealert',
            constraint=models.UniqueConstraint(
                condition=models.Q(status='active'),
                fields=['task'],
                name='unique_active_alert_per_task',
            ),
        ),

        # === C — RandomVerificationCheck: 1 pending check per (task, worker) ===
        migrations.AddConstraint(
            model_name='randomverificationcheck',
            constraint=models.UniqueConstraint(
                condition=models.Q(status='pending'),
                fields=['task', 'worker'],
                name='unique_pending_check_per_task_worker',
            ),
        ),
    ]
