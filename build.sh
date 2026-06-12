#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# Chỉ seed data nếu database chưa có dữ liệu (tránh reset mỗi lần deploy)
python -c "
import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from core.models import User
if User.objects.count() == 0:
    print('Database trống → chạy seed_data.py...')
    exec(open('seed_data.py').read())
else:
    print(f'Database đã có {User.objects.count()} users → bỏ qua seed_data.')
"
