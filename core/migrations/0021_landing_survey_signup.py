# Generated manually for landing page survey + signup models

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0020_task_completed_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='LandingSurvey',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(choices=[('phu-huynh', 'Phụ huynh tìm người chăm sóc'), ('carepartner', 'Sinh viên muốn làm Carepartner'), ('doi-tac', 'Trường học / tổ chức đối tác'), ('khac', 'Khác')], max_length=20)),
                ('interests', models.JSONField(blank=True, default=list, help_text='Danh sách giá trị INTEREST_CHOICES')),
                ('necessity', models.CharField(choices=[('rat-can', 'Rất cần thiết — đang tìm giải pháp ngay'), ('can', 'Cần thiết — đang cân nhắc'), ('binh-thuong', 'Bình thường — tìm hiểu thêm'), ('chua-can', 'Chưa cần thiết lúc này')], max_length=20)),
                ('feedback', models.TextField(blank=True, default='')),
                ('email', models.EmailField(blank=True, default='')),
                ('ip_address', models.GenericIPAddressField(null=True, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Khảo sát landing page',
                'verbose_name_plural': 'Khảo sát landing page',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='LandingSignup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('full_name', models.CharField(max_length=200)),
                ('phone', models.CharField(max_length=15)),
                ('email', models.EmailField()),
                ('role', models.CharField(choices=[('phu-huynh', 'Phụ huynh'), ('carepartner', 'Sinh viên Carepartner')], max_length=20)),
                ('signup_type', models.CharField(choices=[('tu-van', 'Tư vấn miễn phí'), ('dung-thu', 'Dùng thử miễn phí')], max_length=20)),
                ('preferred_time_slot', models.CharField(blank=True, choices=[('sang', 'Buổi sáng (8:00 – 11:00)'), ('chieu', 'Buổi chiều (13:00 – 17:00)'), ('toi', 'Buổi tối (18:00 – 20:00)')], default='', help_text='Khung giờ gọi lại (chỉ cho tư vấn)', max_length=10)),
                ('trial_consent', models.BooleanField(default=False, help_text='Đồng ý kích hoạt dùng thử (chỉ cho dùng thử)')),
                ('note', models.TextField(blank=True, default='')),
                ('ip_address', models.GenericIPAddressField(null=True, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Đăng ký landing page',
                'verbose_name_plural': 'Đăng ký landing page',
                'ordering': ['-created_at'],
            },
        ),
    ]
