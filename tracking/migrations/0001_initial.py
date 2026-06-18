"""Initial migration cho tracking app."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0012_user_auth_provider_user_avatar_url'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LocationConsent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('consent', models.CharField(choices=[('granted', 'Đã đồng ý chia sẻ vị trí'), ('denied', 'Không đồng ý'), ('revoked', 'Đã rút lại đồng ý (dừng khẩn cấp)')], default='denied', max_length=20)),
                ('granted_at', models.DateTimeField(blank=True, null=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('task', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='location_consent', to='core.task')),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='location_consents', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='LiveLocation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('latitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('longitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('accuracy', models.FloatField(blank=True, help_text='Độ chính xác GPS (mét)', null=True)),
                ('speed', models.FloatField(blank=True, help_text='Tốc độ di chuyển (m/s)', null=True)),
                ('heading', models.FloatField(blank=True, help_text='Hướng di chuyển (độ 0-360)', null=True)),
                ('last_seen', models.DateTimeField(auto_now=True, db_index=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('is_outside_geofence', models.BooleanField(default=False)),
                ('geofence_warned_at', models.DateTimeField(blank=True, null=True)),
                ('task', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='live_location', to='core.task')),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='live_locations', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-last_seen']},
        ),
        migrations.CreateModel(
            name='LocationHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('latitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('longitude', models.DecimalField(decimal_places=7, max_digits=10)),
                ('accuracy', models.FloatField(blank=True, null=True)),
                ('speed', models.FloatField(blank=True, null=True)),
                ('heading', models.FloatField(blank=True, null=True)),
                ('recorded_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='location_history', to='core.task')),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='location_history', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['recorded_at']},
        ),
        migrations.CreateModel(
            name='SOSAlert',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sender', models.CharField(choices=[('worker', 'Carepartner'), ('parent', 'Phụ huynh')], max_length=10)),
                ('latitude', models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ('longitude', models.DecimalField(blank=True, decimal_places=7, max_digits=10, null=True)),
                ('message', models.TextField(blank=True, default='', help_text='Tin nhắn SOS (tuỳ chọn)')),
                ('status', models.CharField(choices=[('active', 'Đang khẩn cấp — chưa xử lý'), ('resolved', 'Đã giải quyết'), ('false', 'Báo động sai')], default='active', max_length=10)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sos_alerts', to='core.task')),
                ('sender_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_sos_alerts', to=settings.AUTH_USER_MODEL)),
                ('resolved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='resolved_sos_alerts', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='locationconsent',
            index=models.Index(fields=['worker', 'consent'], name='tracking_worker_consent_idx'),
        ),
        migrations.AddIndex(
            model_name='livelocation',
            index=models.Index(fields=['worker', 'last_seen'], name='tracking_worker_last_idx'),
        ),
        migrations.AddIndex(
            model_name='livelocation',
            index=models.Index(fields=['task'], name='tracking_task_idx'),
        ),
        migrations.AddIndex(
            model_name='locationhistory',
            index=models.Index(fields=['task', 'recorded_at'], name='tracking_task_recorded_idx'),
        ),
        migrations.AddIndex(
            model_name='locationhistory',
            index=models.Index(fields=['worker', '-recorded_at'], name='tracking_worker_recorded_idx'),
        ),
        migrations.AddIndex(
            model_name='sosalert',
            index=models.Index(fields=['task', 'status'], name='tracking_sos_task_status_idx'),
        ),
        migrations.AddIndex(
            model_name='sosalert',
            index=models.Index(fields=['status', '-created_at'], name='tracking_sos_status_created_idx'),
        ),
    ]
