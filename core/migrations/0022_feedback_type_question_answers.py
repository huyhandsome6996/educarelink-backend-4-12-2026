from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0021_landing_survey_signup'),
    ]

    operations = [
        # 1. Xóa field 'role' cũ
        migrations.RemoveField(
            model_name='landingsurvey',
            name='role',
        ),
        # 2. Thêm field 'feedback_type' mới (carepartner / parent)
        migrations.AddField(
            model_name='landingsurvey',
            name='feedback_type',
            field=models.CharField(choices=[('carepartner', 'Người đồng hành (Carepartner)'), ('parent', 'Phụ huynh')], help_text='Loại người phản hồi: carepartner hoặc parent', max_length=20),
        ),
        # 3. Thêm field 'question_answers' cho câu hỏi riêng từng vai trò
        migrations.AddField(
            model_name='landingsurvey',
            name='question_answers',
            field=models.JSONField(blank=True, default=dict, help_text='Câu trả lời theo bộ câu hỏi riêng từng vai trò (key=question_id, value=answer)'),
        ),
        # 4. Cho phép necessity để trống (parent có thể không cần)
        migrations.AlterField(
            model_name='landingsurvey',
            name='necessity',
            field=models.CharField(blank=True, choices=[('rat-can', 'Rất cần thiết — đang tìm giải pháp ngay'), ('can', 'Cần thiết — đang cân nhắc'), ('binh-thuong', 'Bình thường — tìm hiểu thêm'), ('chua-can', 'Chưa cần thiết lúc này')], default='', max_length=20),
        ),
    ]
