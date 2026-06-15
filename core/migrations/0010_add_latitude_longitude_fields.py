# Generated migration: Add latitude/longitude to User and Task models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_add_notification_read_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='latitude',
            field=models.FloatField(blank=True, null=True, help_text='Vĩ độ (latitude) từ bản đồ'),
        ),
        migrations.AddField(
            model_name='user',
            name='longitude',
            field=models.FloatField(blank=True, null=True, help_text='Kinh độ (longitude) từ bản đồ'),
        ),
        migrations.AddField(
            model_name='task',
            name='latitude',
            field=models.FloatField(blank=True, null=True, help_text='Vĩ độ địa điểm công việc'),
        ),
        migrations.AddField(
            model_name='task',
            name='longitude',
            field=models.FloatField(blank=True, null=True, help_text='Kinh độ địa điểm công việc'),
        ),
    ]
