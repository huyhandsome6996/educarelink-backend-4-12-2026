"""Initial migration cho moderation app."""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0013_task_geofence_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TaskModeration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('pending', 'Chờ duyệt — AI chưa xử lý'), ('approved', 'Đã duyệt — phù hợp tiêu chuẩn'), ('rejected', 'Bị từ chối — vi phạm tiêu chuẩn'), ('needs_review', 'Cần admin xem xét — AI không chắc'), ('admin_approved', 'Admin đã duyệt (override AI reject)'), ('admin_rejected', 'Admin đã từ chối (override AI approve)')], default='pending', max_length=20)),
                ('ai_verdict', models.TextField(blank=True, default='')),
                ('ai_confidence', models.FloatField(default=0)),
                ('ai_flags', models.JSONField(blank=True, default=list)),
                ('ai_suggestion', models.TextField(blank=True, default='')),
                ('admin_note', models.TextField(blank=True, default='')),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='moderation_reviews', to=settings.AUTH_USER_MODEL)),
                ('task', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='moderation', to='core.task')),
            ],
        ),
        migrations.CreateModel(
            name='Complaint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('complaint_type', models.CharField(choices=[('exploitation', 'Bóc lột / bóc lột sức lao động'), ('abuse', 'Ngược đãi (thể chất / tinh thần)'), ('harassment', 'Quấy rối / xúc phạm'), ('non_payment', 'Không trả / trả thiếu tiền'), ('fraud', 'Gian lận / lừa đảo'), ('unsafe', 'Môi trường không an toàn'), ('other', 'Khác')], max_length=20)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField()),
                ('ai_analysis', models.TextField(blank=True, default='')),
                ('ai_priority', models.CharField(choices=[('low', 'Thấp'), ('medium', 'Trung bình'), ('high', 'Cao'), ('urgent', 'Khẩn cấp')], default='medium', max_length=10)),
                ('ai_suggestion', models.TextField(blank=True, default='')),
                ('ai_analyzed', models.BooleanField(default=False)),
                ('status', models.CharField(choices=[('pending', 'Chờ xử lý'), ('investigating', 'Đang điều tra'), ('resolved', 'Đã giải quyết'), ('dismissed', 'Bác bỏ')], default='pending', max_length=20)),
                ('priority', models.CharField(choices=[('low', 'Thấp'), ('medium', 'Trung bình'), ('high', 'Cao'), ('urgent', 'Khẩn cấp')], default='medium', max_length=10)),
                ('admin_response', models.TextField(blank=True, default='')),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('complainant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='filed_complaints', to=settings.AUTH_USER_MODEL)),
                ('reported_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='received_complaints', to=settings.AUTH_USER_MODEL)),
                ('task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='complaints', to='core.task')),
                ('resolved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='resolved_complaints', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='ComplaintEvidence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('evidence_type', models.CharField(choices=[('image', 'Ảnh'), ('video', 'Video'), ('document', 'Văn bản / tài liệu')], max_length=10)),
                ('file', models.FileField(upload_to='complaint_evidence/')),
                ('description', models.TextField(blank=True, default='')),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('complaint', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='evidence', to='moderation.complaint')),
            ],
        ),
        migrations.AddIndex(model_name='taskmoderation', index=models.Index(fields=['status'], name='moderation_status_idx')),
        migrations.AddIndex(model_name='complaint', index=models.Index(fields=['status', 'priority'], name='moderation_status_pri_idx')),
        migrations.AddIndex(model_name='complaint', index=models.Index(fields=['complainant'], name='moderation_complain_idx')),
        migrations.AddIndex(model_name='complaint', index=models.Index(fields=['reported_user'], name='moderation_reported_idx')),
    ]
