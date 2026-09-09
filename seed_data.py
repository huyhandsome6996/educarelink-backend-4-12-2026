"""
EDUCARELINK — SEED DATA SCRIPT (MASTER DEMO)
============================================
Script nạp toàn bộ dữ liệu mẫu đầy đủ nhất cho ban giám khảo và kiểm thử toàn hệ thống.
Chạy lệnh: python seed_data.py
Hoặc: python manage.py seed_demo_data
"""

import os
import sys
import django

# Cấu hình để chạy script độc lập
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

try:
    django.setup()
except Exception as e:
    print(f"[LỖI] Lỗi khi khởi động Django: {e}")
    print("   Hãy đảm bảo bạn đang chạy script từ thư mục gốc của dự án (nơi có manage.py)")
    sys.exit(1)

from django.core.management import call_command

if __name__ == '__main__':
    call_command('seed_demo_data')
