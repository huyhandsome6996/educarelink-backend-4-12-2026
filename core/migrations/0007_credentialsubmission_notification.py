# Generated migration for CredentialSubmission and Notification models

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_add_first_login_field'),
    ]

    operations = [
        migrations.CreateModel(
            name='CredentialSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('certificate_photo', models.ImageField(blank=True, help_text='Ảnh bằng cấp/chứng chỉ minh chứng', null=True, upload_to='credential_submissions/')),
                ('description', models.TextField(blank=True, help_text='Mô tả về bằng cấp, kinh nghiệm', null=True)),
                ('status', models.CharField(choices=[('pending', 'Chờ duyệt'), ('approved', 'Đã duyệt'), ('rejected', 'Bị từ chối')], default='pending', max_length=20)),
                ('admin_review', models.TextField(blank=True, help_text='Admin viết đánh giá bằng cấp cho Carepartner', null=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='credential_submissions', to='core.user')),
            ],
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('message', models.TextField()),
                ('is_read', models.BooleanField(default=False, help_text='Đánh dấu đã đọc (chỉ áp dụng cho thông báo cá nhân)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('recipient', models.ForeignKey(blank=True, help_text='Null = gửi cho tất cả Carepartner', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='core.user')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
