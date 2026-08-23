# Generated manually for B2 Points Rewards

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Voucher',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('points_required', models.PositiveIntegerField(help_text='Số điểm cần để đổi')),
                ('discount_value', models.PositiveIntegerField(help_text='Giá trị voucher (VNĐ), VD: 30000')),
                ('expiry_date', models.DateField(blank=True, help_text='Hạn dùng của voucher template (null = không hết hạn)', null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Voucher',
                'verbose_name_plural': 'Voucher',
                'ordering': ['points_required', 'id'],
            },
        ),
        migrations.CreateModel(
            name='VoucherRedemption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=16, unique=True)),
                ('status', models.CharField(choices=[('active', 'Còn hiệu lực'), ('used', 'Đã dùng'), ('expired', 'Hết hạn')], default='active', max_length=16)),
                ('points_spent', models.PositiveIntegerField()),
                ('redeemed_at', models.DateTimeField(auto_now_add=True)),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='voucher_redemptions', to=settings.AUTH_USER_MODEL)),
                ('voucher', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='redemptions', to='rewards.voucher')),
            ],
            options={
                'verbose_name': 'Lượt đổi voucher',
                'verbose_name_plural': 'Lượt đổi voucher',
                'ordering': ['-redeemed_at'],
            },
        ),
        migrations.CreateModel(
            name='PointTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('points', models.IntegerField(help_text='Số điểm (+ cộng / - trừ)')),
                ('reason', models.CharField(choices=[('task_completed', 'Hoàn thành công việc'), ('review_bonus_5star', 'Bonus đánh giá 5 sao'), ('voucher_redeem', 'Đổi voucher'), ('adjustment', 'Điều chỉnh thủ công')], max_length=32)),
                ('note', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('review', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='point_transactions', to='core.review')),
                ('task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='point_transactions', to='core.task')),
                ('user', models.ForeignKey(help_text='Phụ huynh nhận/trừ điểm', on_delete=django.db.models.deletion.CASCADE, related_name='point_transactions', to=settings.AUTH_USER_MODEL)),
                ('voucher_redemption', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='point_transactions', to='rewards.voucherredemption')),
            ],
            options={
                'verbose_name': 'Giao dịch điểm',
                'verbose_name_plural': 'Giao dịch điểm',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='pointtransaction',
            index=models.Index(fields=['user', '-created_at'], name='idx_pt_user_created'),
        ),
        migrations.AddIndex(
            model_name='pointtransaction',
            index=models.Index(fields=['user', 'reason'], name='idx_pt_user_reason'),
        ),
        migrations.AddConstraint(
            model_name='pointtransaction',
            constraint=models.UniqueConstraint(condition=models.Q(('reason', 'task_completed'), ('task__isnull', False)), fields=('task', 'reason'), name='uniq_points_task_completed'),
        ),
        migrations.AddConstraint(
            model_name='pointtransaction',
            constraint=models.UniqueConstraint(condition=models.Q(('reason', 'review_bonus_5star'), ('review__isnull', False)), fields=('review', 'reason'), name='uniq_points_review_bonus'),
        ),
    ]
