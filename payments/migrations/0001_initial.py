"""Initial migration cho payments app."""

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import decimal


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('core', '0012_user_auth_provider_user_avatar_url'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=0, help_text='Tổng số tiền phụ huynh trả (VNĐ)', max_digits=12)),
                ('commission_rate', models.DecimalField(decimal_places=4, default=decimal.Decimal('0.2000'), help_text='Tỷ lệ hoa hồng — mặc định 20%', max_digits=5)),
                ('commission_amount', models.DecimalField(decimal_places=0, default=0, help_text='Tiền hoa hồng nền tảng = amount * commission_rate', max_digits=12)),
                ('worker_payout_amount', models.DecimalField(decimal_places=0, default=0, help_text='Tiền Carepartner nhận được = amount - commission_amount', max_digits=12)),
                ('method', models.CharField(choices=[('momo_escrow', 'MoMo Escrow — Phụ huynh trả qua MoMo, tiền được giữ'), ('cash', 'Tiền mặt — Phụ huynh trả trực tiếp cho Carepartner')], max_length=20)),
                ('status', models.CharField(choices=[('pending', 'Chờ thanh toán — Phụ huynh chưa hoàn tất bước pay (momo) hoặc chưa chốt phương thức (cash)'), ('held', 'Đang giữ tiền — MoMo đã nhận tiền, chờ Task hoàn thành để giải ngân'), ('completed', 'Đã hoàn tất — Đã giải ngân cho Carepartner và giữ hoa hồng'), ('cancelled', 'Đã huỷ — Task bị huỷ trước khi thanh toán'), ('refunded', 'Đã hoàn tiền — Hoàn 100% cho phụ huynh do Task bị huỷ'), ('payout_failed', 'Giải ngân thất bại — Tiền vẫn nằm trong MoMo, cần Admin xử lý')], default='pending', max_length=20)),
                ('momo_order_id', models.CharField(blank=True, help_text="orderId MoMo — EduCareLink_<task_id>_<timestamp>", max_length=100, null=True)),
                ('momo_request_id', models.CharField(blank=True, max_length=100, null=True)),
                ('momo_trans_id', models.CharField(blank=True, help_text='transId MoMo trả về sau khi phụ huynh pay thành công', max_length=100, null=True)),
                ('momo_pay_url', models.URLField(blank=True, help_text='payUrl sâu tới app/web MoMo để phụ huynh thanh toán', max_length=2000, null=True)),
                ('momo_qr_code_url', models.URLField(blank=True, help_text='qrCodeUrl từ MoMo — phụ huynh có thể quét', max_length=2000, null=True)),
                ('momo_result_code', models.IntegerField(blank=True, null=True)),
                ('momo_message', models.CharField(blank=True, max_length=255, null=True)),
                ('payout_request_id', models.CharField(blank=True, max_length=100, null=True)),
                ('payout_trans_id', models.CharField(blank=True, max_length=100, null=True)),
                ('payout_response', models.JSONField(blank=True, default=dict)),
                ('initiated_at', models.DateTimeField(auto_now_add=True)),
                ('held_at', models.DateTimeField(blank=True, help_text='Khi MoMo xác nhận đã giữ tiền', null=True)),
                ('completed_at', models.DateTimeField(blank=True, help_text='Khi đã giải ngân cho worker', null=True)),
                ('refunded_at', models.DateTimeField(blank=True, null=True)),
                ('parent', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments_as_parent', to=settings.AUTH_USER_MODEL)),
                ('task', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='payment', to='core.task')),
                ('worker', models.ForeignKey(blank=True, help_text='Carepartner được chọn — có thể null nếu Task chưa chốt người làm', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payments_as_worker', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-initiated_at'],
            },
        ),
        migrations.CreateModel(
            name='CommissionSettlement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_year', models.IntegerField(help_text='Năm của kỳ thanh toán')),
                ('period_month', models.IntegerField(help_text='Tháng của kỳ thanh toán (1-12)')),
                ('total_tasks', models.IntegerField(default=0, help_text='Số Task hoàn thành trong kỳ')),
                ('total_amount', models.DecimalField(decimal_places=0, default=0, help_text='Tổng hoa hồng Carepartner nợ nền tảng (VNĐ)', max_digits=14)),
                ('task_ids', models.JSONField(blank=True, default=list, help_text='Danh sách Payment.id được tính trong kỳ này')),
                ('status', models.CharField(choices=[('pending', 'Chờ sinh QR'), ('qr_generated', 'Đã sinh QR — chờ Carepartner thanh toán'), ('paid', 'Carepartner đã thanh toán hoa hồng'), ('overdue', 'Quá hạn — chưa thanh toán sau N ngày'), ('cancelled', 'Đã huỷ — không thu tiếp')], default='pending', max_length=20)),
                ('momo_order_id', models.CharField(blank=True, max_length=100, null=True)),
                ('momo_request_id', models.CharField(blank=True, max_length=100, null=True)),
                ('momo_pay_url', models.URLField(blank=True, max_length=2000, null=True)),
                ('momo_qr_code_url', models.URLField(blank=True, max_length=2000, null=True)),
                ('momo_trans_id', models.CharField(blank=True, max_length=100, null=True)),
                ('momo_result_code', models.IntegerField(blank=True, null=True)),
                ('momo_message', models.CharField(blank=True, max_length=255, null=True)),
                ('due_at', models.DateTimeField(blank=True, help_text='Hạn thanh toán (mặc định +7 ngày sau khi sinh QR)', null=True)),
                ('generated_at', models.DateTimeField(blank=True, help_text='Khi QR được sinh', null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('worker', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='commission_settlements', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-period_year', '-period_month'],
                'unique_together': {('worker', 'period_year', 'period_month')},
            },
        ),
        migrations.CreateModel(
            name='PaymentLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('payment_created', 'Tạo bản ghi thanh toán'), ('momo_pay_url_generated', 'Sinh payUrl MoMo thành công'), ('momo_pay_url_failed', 'Sinh payUrl MoMo thất bại'), ('momo_ipn_held', 'MoMo IPN: tiền đã được giữ'), ('momo_ipn_failed', 'MoMo IPN: phụ huynh thanh toán thất bại'), ('escrow_released', 'Giải ngân escrow cho Carepartner thành công'), ('escrow_release_failed', 'Giải ngân escrow thất bại'), ('refund_initiated', 'Bắt đầu hoàn tiền'), ('refund_completed', 'Hoàn tiền thành công'), ('refund_failed', 'Hoàn tiền thất bại'), ('cash_recorded', 'Ghi nhận hoa hồng tiền mặt'), ('settlement_created', 'Tạo kỳ thanh toán tháng'), ('settlement_qr_generated', 'Sinh QR cho kỳ thanh toán'), ('settlement_qr_failed', 'Sinh QR thất bại'), ('settlement_paid', 'Carepartner đã thanh toán kỳ hoa hồng'), ('settlement_overdue', 'Kỳ thanh toán quá hạn'), ('settlement_reminder_sent', 'Gửi nhắc nhở kỳ thanh toán'), ('manual_override', 'Admin chỉnh sửa thủ công')], max_length=40)),
                ('message', models.TextField(blank=True, default='')),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, help_text='User thực hiện action — null nếu là hệ thống (cron, IPN)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payment_logs', to=settings.AUTH_USER_MODEL)),
                ('payment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='logs', to='payments.payment')),
                ('settlement', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='logs', to='payments.commissionsettlement')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['parent', 'status'], name='payments_parent_status_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['worker', 'status'], name='payments_worker_status_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['method', 'status'], name='payments_method_status_idx'),
        ),
        migrations.AddIndex(
            model_name='payment',
            index=models.Index(fields=['momo_order_id'], name='payments_momo_order_idx'),
        ),
        migrations.AddIndex(
            model_name='commissionsettlement',
            index=models.Index(fields=['worker', 'status'], name='payments_settle_worker_idx'),
        ),
        migrations.AddIndex(
            model_name='commissionsettlement',
            index=models.Index(fields=['period_year', 'period_month'], name='payments_settle_period_idx'),
        ),
        migrations.AddIndex(
            model_name='commissionsettlement',
            index=models.Index(fields=['status', 'due_at'], name='payments_settle_due_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentlog',
            index=models.Index(fields=['payment', 'event_type'], name='payments_log_payment_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentlog',
            index=models.Index(fields=['settlement', 'event_type'], name='payments_log_settle_idx'),
        ),
        migrations.AddIndex(
            model_name='paymentlog',
            index=models.Index(fields=['event_type', '-created_at'], name='payments_log_event_idx'),
        ),
    ]
