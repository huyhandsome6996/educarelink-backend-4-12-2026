#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt

python manage.py collectstatic --no-input
python manage.py migrate

# RESET dữ liệu mẫu mỗi lần deploy — luôn đảm bảo state demo nhất quán cho môi trường demo.
# seed_demo_data đã được viết ở chế độ idempotent (xoá + tạo lại, giữ 3 tài khoản
# bảo vệ: admin / phuhuynh_test / sinhvien_test).
python manage.py seed_demo_data || echo "⚠️ seed_demo_data failed, continuing deploy..."

# Nạp cấu hình matching ELO & CarePartners chuyên môn cao vào DB
python manage.py seed_matching_config || echo "⚠️ seed_matching_config failed, continuing deploy..."
python manage.py seed_specialist_carepartners || echo "⚠️ seed_specialist_carepartners failed, continuing deploy..."
python manage.py seed_super_carepartner || echo "⚠️ seed_super_carepartner failed, continuing deploy..."

# PHẦN 14 — Phủ dữ liệu mẫu ĐẦY ĐỦ cho TẤT CẢ tài khoản (yêu cầu owner 2026-10-06:
# mọi phụ huynh & CarePartner đều có đơn hàng/chat/thanh toán/thông báo như thật
# để ban giám khảo trải nghiệm). Idempotent additive-only — chỉ tạo thứ còn thiếu,
# KHÔNG đụng username/password của bất kỳ tài khoản nào.
python manage.py seed_all_accounts_coverage || echo "⚠️ seed_all_accounts_coverage failed, continuing deploy..."

# Re-moderate tất cả task pending sau khi deploy (đảm bảo AI quét task cũ còn kẹt)
python manage.py remoderate_pending || echo "⚠️ remoderate_pending failed (no pending tasks?), continuing deploy..."

# B1 — Phủ nhật ký mẫu Care Diary cho TẤT CẢ tài khoản hiện có (yêu cầu owner
# 2026-09-20: dữ liệu mẫu toàn hệ thống + kiểm thử tính năng). Idempotent —
# chỉ thêm entry còn thiếu sau khi seed_demo_data đã reset, không xoá dữ liệu cũ.
python manage.py seed_care_diary_sample || echo "⚠️ seed_care_diary_sample failed, continuing deploy..."
