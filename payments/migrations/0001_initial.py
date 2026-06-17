"""
Migration 0001_initial cho module Payments.

Tạo 5 bảng:
  - payments_wallet
  - payments_paymentorder
  - payments_escrowtransaction
  - payments_commissiondebt
  - payments_monthlycommissionstatement
"""
import decimal
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
            name='Wallet',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('balance', models.DecimalField(decimal_places=0, default=decimal.Decimal('0'), help_text='Số dư khả dụng (VNĐ) — Worker có thể rút về MoMo', max_digits=14)),
                ('held_balance', models.DecimalField(decimal_places=0, default=decimal.Decimal('0'), help_text='Tiền đang phong tỏa (VNĐ) — Parent đã trả MoMo, chờ task hoàn thành', max_digits=14)),
                ('momo_phone', models.CharField(blank=True, help_text='SĐT MoMo liên kết để nhận tiền giải ngân', max_length=15, null=True)),
                ('bank_account_number', models.CharField(blank=True, help_text='Số tài khoản ngân hàng (dự phòng, dùng cho VietQR nhận hoa hồng từ hệ thống)', max_length=30, null=True)),
                ('bank_code', models.CharField(blank=True, help_text='Mã ngân hàng (BIN), VD: 970436 = Vietcombank, 970418 = BIDV', max_length=20, null=True)),
                ('bank_account_name', models.CharField(blank=True, help_text='Tên chủ tài khoản ngân hàng (VIETQR yêu cầu IN HOA KHÔNG DẤU)', max_length=100, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='wallet', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Ví',
                'verbose_name_plural': 'Ví',
            },
        ),
        migrations.CreateModel(
            name='PaymentOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=0, help_text='Số tiền (VNĐ) — bằng đúng Task.price lúc tạo', max_digits=14)),
                ('payment_method', models.CharField(choices=[('momo', 'MoMo (giữ tiền giùm)'), ('cash', 'Tiền mặt')], default='cash', max_length=10)),
                ('status', models.CharField(choices=[('pending', 'Chờ thanh toán'), ('paid', 'Đã thanh toán'), ('failed', 'Thất bại'), ('expired', 'Hết hạn'), ('not_required', 'Không yêu cầu (cash)')], default='pending', max_length=20)),
                ('momo_order_id', models.CharField(blank=True, help_text='orderId gửi lên MoMo (unique per request)', max_length=100, null=True, unique=True)),
                ('momo_request_id', models.CharField(blank=True, help_text='requestId nội bộ khi gọi MoMo API', max_length=100, null=True)),
                ('momo_pay_url', models.URLField(blank=True, max_length=2000, null=True)),
                ('momo_trans_id', models.CharField(blank=True, help_text='transId MoMo trả về sau khi thanh toán thành công', max_length=100, null=True)),
                ('momo_response', models.JSONField(blank=True, default=dict, help_text='Toàn bộ response từ MoMo (cho debug)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('expired_at', models.DateTimeField(blank=True, null=True)),
                ('parent', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payment_orders', to=settings.AUTH_USER_MODEL)),
                ('task', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='payment_order', to='core.task')),
            ],
            options={
                'verbose_name': 'Đơn thanh toán',
                'verbose_name_plural': 'Đơn thanh toán',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='EscrowTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=0, max_digits=14)),
                ('txn_type', models.CharField(choices=[('hold', 'Phong tỏa (Parent trả MoMo)'), ('release_to_worker', 'Giải ngân cho Carepartner'), ('commission_to_admin', 'Hoa hồng chuyển cho Admin'), ('refund_held', 'Trừ tiền phong tỏa'), ('refund_to_parent', 'Hoàn tiền cho Phụ huynh'), ('disburse', 'Rút tiền về MoMo')], max_length=30)),
                ('description', models.TextField(blank=True, default='')),
                ('momo_trans_id', models.CharField(blank=True, max_length=100, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('task', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='escrow_transactions', to='core.task')),
                ('wallet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='payments.wallet')),
            ],
            options={
                'verbose_name': 'Giao dịch ví',
                'verbose_name_plural': 'Giao dịch ví',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CommissionDebt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('gross_amount', models.DecimalField(decimal_places=0, help_text='Tổng tiền Carepartner nhận trực tiếp (bằng Task.price)', max_digits=14)),
                ('commission_rate', models.DecimalField(decimal_places=4, default=decimal.Decimal('0.2000'), help_text='Tỷ lệ hoa hồng (mặc định 0.20 = 20%)', max_digits=5)),
                ('commission_amount', models.DecimalField(decimal_places=0, help_text='Tiền hoa hồng = gross_amount * commission_rate', max_digits=14)),
                ('status', models.CharField(choices=[('pending', 'Chưa thanh toán'), ('sent', 'Đã gửi QR chờ thanh toán'), ('paid', 'Đã thanh toán'), ('overdue', 'Quá hạn')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('task', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='commission_debts', to='core.task')),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='commission_debts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Khoản nợ hoa hồng',
                'verbose_name_plural': 'Khoản nợ hoa hồng',
                'ordering': ['-created_at'],
                'unique_together': {('task',)},
            },
        ),
        migrations.CreateModel(
            name='MonthlyCommissionStatement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('month', models.DateField(help_text="Ngày ĐẦU THÁNG của kỳ thanh toán, VD: 2026-03-01 cho kỳ tháng 3/2026")),
                ('period_start', models.DateField()),
                ('period_end', models.DateField()),
                ('total_gross', models.DecimalField(decimal_places=0, default=decimal.Decimal('0'), help_text='Tổng tiền mặt Carepartner nhận trong kỳ', max_digits=14)),
                ('total_commission', models.DecimalField(decimal_places=0, default=decimal.Decimal('0'), help_text='Tổng hoa hồng 20% phải nộp', max_digits=14)),
                ('debt_count', models.PositiveIntegerField(default=0, help_text='Số đơn hàng có trong kỳ')),
                ('status', models.CharField(choices=[('draft', 'Bản nháp'), ('sent', 'Đã gửi QR'), ('paid', 'Đã thanh toán'), ('overdue', 'Quá hạn')], default='draft', max_length=20)),
                ('vietqr_url', models.URLField(blank=True, max_length=2000, null=True)),
                ('qr_payload', models.TextField(blank=True, default='', help_text='Chuỗi nội dung mã QR (VietQR / emv)')),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('admin_note', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='commission_statements', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Bảng kê hoa hồng tháng',
                'verbose_name_plural': 'Bảng kê hoa hồng tháng',
                'ordering': ['-month'],
                'unique_together': {('worker', 'month')},
            },
        ),
        # Thêm FK CommissionDebt.statement SAU khi MonthlyCommissionStatement đã tạo
        migrations.AddField(
            model_name='commissiondebt',
            name='statement',
            field=models.ForeignKey(blank=True, help_text='Bảng kê tháng chứa khoản nợ này (null nếu chưa được tổng hợp)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='debts', to='payments.monthlycommissionstatement'),
        ),
    ]
