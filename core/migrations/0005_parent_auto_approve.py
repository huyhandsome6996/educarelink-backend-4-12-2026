from django.db import migrations


def approve_parents(apps, schema_editor):
    """Đảm bảo tất cả phụ huynh (role=parent) có is_approved=True"""
    User = apps.get_model('core', 'User')
    User.objects.filter(role='parent', is_approved=False).update(is_approved=True)


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0004_user_expo_push_token'),
    ]

    operations = [
        migrations.RunPython(approve_parents, migrations.RunPython.noop),
    ]
