"""
Migration thêm geofence fields cho Task model.
Parent có thể vẽ vùng an toàn trên bản đồ khi đăng việc.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_user_auth_provider_user_avatar_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='Task',
            name='geofence_lat',
            field=models.FloatField(blank=True, help_text='Vĩ độ tâm vùng an toàn (geofence) — parent vẽ trên bản đồ khi đăng việc', null=True),
        ),
        migrations.AddField(
            model_name='Task',
            name='geofence_lng',
            field=models.FloatField(blank=True, help_text='Kinh độ tâm vùng an toàn (geofence)', null=True),
        ),
        migrations.AddField(
            model_name='Task',
            name='geofence_radius',
            field=models.FloatField(blank=True, default=500, help_text='Bán kính vùng an toàn (mét). Mặc định 500m'),
        ),
    ]
