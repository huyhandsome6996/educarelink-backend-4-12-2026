# Generated manually for B4 — Phân hạng CarePartner

from django.db import migrations, models


def seed_tier_for_approved_workers(apps, schema_editor):
    """Worker đã is_approved → tier=bronze (mặc định)."""
    User = apps.get_model('core', 'User')
    User.objects.filter(role='worker', is_approved=True).update(tier='bronze')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_user_verification_pin_hash_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='tier',
            field=models.CharField(
                choices=[
                    ('bronze', 'Hạng Đồng'),
                    ('silver', 'Hạng Bạc'),
                    ('gold', 'Hạng Vàng'),
                    ('diamond', 'Hạng Kim cương'),
                ],
                db_index=True,
                default='bronze',
                help_text='Hạng CarePartner: bronze/silver/gold/diamond (chỉ meaningful khi role=worker & is_approved)',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='tier_updated_at',
            field=models.DateTimeField(blank=True, help_text='Lần cuối hạng được cập nhật', null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='tier_override',
            field=models.BooleanField(
                default=False,
                help_text='True = admin đã set hạng thủ công; không tự tính lại trừ khi force',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='tier_meta',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Snapshot số liệu khi tính hạng: completed_jobs, avg_rating, review_count, has_cert, has_specialized',
            ),
        ),
        migrations.AddField(
            model_name='credentialsubmission',
            name='credential_type',
            field=models.CharField(
                choices=[
                    ('certificate', 'Chứng chỉ'),
                    ('degree', 'Bằng cấp'),
                    ('license', 'Giấy phép / license'),
                    ('other', 'Khác'),
                ],
                default='certificate',
                help_text='Loại minh chứng: chứng chỉ / bằng cấp / license',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='credentialsubmission',
            name='title',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Tên chứng chỉ/bằng cấp (VD: Chứng chỉ Sư phạm)',
                max_length=200,
            ),
        ),
        migrations.AddField(
            model_name='credentialsubmission',
            name='field',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Lĩnh vực (VD: Toán, Tiếng Anh, Mầm non)',
                max_length=100,
            ),
        ),
        migrations.AddField(
            model_name='credentialsubmission',
            name='is_specialized',
            field=models.BooleanField(
                default=False,
                help_text='True = bằng cấp chuyên ngành — điều kiện Hạng Kim cương (admin đánh dấu khi duyệt)',
            ),
        ),
        migrations.RunPython(seed_tier_for_approved_workers, migrations.RunPython.noop),
    ]
