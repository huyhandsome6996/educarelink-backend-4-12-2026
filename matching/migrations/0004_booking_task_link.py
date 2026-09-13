# N-003 (QA 2026-09-13) — Link Booking → core.Task (mirror cho chat/tracking/đánh giá)

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0027_user_current_latitude_user_current_longitude_and_more'),
        ('matching', '0003_alter_notificationtemplate_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='booking',
            name='task',
            field=models.ForeignKey(
                blank=True, null=True,
                help_text='Task mirror (core) của ca làm — chat/tracking/đánh giá. '
                          'Tạo khi booking → in_progress.',
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='flow1_bookings', to='core.task'),
        ),
    ]
