#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# RESET dữ liệu mẫu mỗi lần deploy — luôn đảm bảo state demo nhất quán cho giám khảo.
# seed_demo_data đã được viết ở chế độ idempotent (xoá + tạo lại, giữ 3 tài khoản
# bảo vệ: admin / phuhuynh_test / sinhvien_test).
python manage.py seed_demo_data || echo "⚠️ seed_demo_data failed, continuing deploy..."

# Re-moderate tất cả task pending sau khi deploy (đảm bảo AI quét task cũ còn kẹt)
python manage.py remoderate_pending || echo "⚠️ remoderate_pending failed (no pending tasks?), continuing deploy..."
