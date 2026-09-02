# Generated for QA-FIX-6 / NÊN LÀM 2 — LiveLocation.client_recorded_at
# Migration này AN TOÀN cho Postgres/Render đã có data:
#   - AddField với null=True, blank=True → không cần default, không sửa
#     data cũ. Mọi row cũ sẽ có client_recorded_at=NULL.
#   - AddIndex trên field nullable — Postgres handle OK (partial index
#     ngầm hiểu NULL không nằm trong index). SQLite (dev) cũng OK.
#
# Không có AlterField/RemoveField/RunPython → không rủi ro gãy data.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tracking', '0008_qa_fix_5_scheduler_health'),
    ]

    operations = [
        migrations.AddField(
            model_name='livelocation',
            name='client_recorded_at',
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text='Timestamp client capture GPS. Dùng chống ghi đè LiveLocation bằng điểm cũ.',
                null=True,
            ),
        ),
    ]
