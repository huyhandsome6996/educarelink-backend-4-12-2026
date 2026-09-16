# -*- coding: utf-8 -*-
"""Tiện ích thời gian — hiển thị theo giờ Việt Nam (Asia/Ho_Chi_Minh).

Bối cảnh (bug 2026-09-16): DB luôn lưu UTC (USE_TZ = True), nhưng nhiều
điểm hiển thị gọi .strftime() thẳng trên datetime ORM trả về → in giờ UTC,
lệch 7 giờ so với đồng hồ người dùng tại Việt Nam. Ví dụ thật: khảo sát
điền lúc 10:48 sáng giờ VN nhưng dashboard hiện "03:48".

Nguyên tắc: mọi điểm hiển thị thời gian cho người dùng (dashboard admin,
báo cáo Excel, thông báo, prompt AI...) phải đi qua fmt_vn() để quy đổi
UTC → TIME_ZONE (Asia/Ho_Chi_Minh) trước khi format. Việc LƯU DB vẫn giữ
nguyên chuẩn UTC (không đổi dữ liệu cũ — chỉ sửa lớp hiển thị).
"""
from django.utils import timezone

# Múi giờ hiển thị chuẩn của hệ thống (khớp backend/settings.py TIME_ZONE)
VN_TIMEZONE = 'Asia/Ho_Chi_Minh'


def fmt_vn(dt, fmt='%d/%m/%Y %H:%M'):
    """Format datetime theo giờ Việt Nam.

    - dt None/rỗng → '' (giữ hành vi cũ của các dòng `if x else ''`)
    - datetime aware (chuẩn ORM với USE_TZ=True) → quy đổi UTC →
      TIME_ZONE (Asia/Ho_Chi_Minh) rồi mới format
    - datetime naive (hiếm — dữ liệu tự tạo trong code, không qua ORM
      aware pipeline) → format nguyên trạng, không tự đoán múi giờ
    - fmt: định dạng strftime (mặc định '16/09/2026 10:48')
    """
    if not dt:
        return ''
    if timezone.is_aware(dt):
        dt = timezone.localtime(dt)
    return dt.strftime(fmt)
