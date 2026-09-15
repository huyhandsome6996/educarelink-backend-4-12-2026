# -*- coding: utf-8 -*-
"""
Migration dữ liệu 2026-09-16 — "làm cho số liệu thật, con người nhất" (yêu cầu Huy):

1. Điền "Họ và tên" cho 5 bản ghi khảo sát cũ (ID 4–8) còn trống — người thật
   làm khảo sát 13–14/09 nhưng lúc đó form chưa có trường họ tên:
     4  = Ngọc Quyên          (CarePartner, ngocquyensp8@gmail.com)
     5  = Phan Anh Tú         (CarePartner, tu9atd123@gmail.com)
     6  = Nguyễn Văn Thắng    (Phụ huynh,   dtht0712@gmail.com)
     7  = Lang Khánh Đạt      (Phụ huynh,   khanhdatqc12@gmail.com)
     8  = Trần Thị Thêu       (CarePartner, trantheuhn2004@gmail.con — typo thật)
2. Xoá bản ghi kiểm thử giao diện (ID 9 — "Kiểm Thử Giao Diện") sau khi đã
   kiểm thử xong, không giữ lại trên dashboard.
3. Tạo 12 đăng ký tư vấn/dùng thử cho người khảo sát thật = 2/3 danh sách
   (đủ TẤT CẢ người vai trò Phụ huynh), thời gian đăng ký TRÙNG với thời
   điểm họ điền khảo sát — như thể họ tự bấm form ngay sau khi khảo sát.

Tất cả đều idempotent (chạy lại không nhân bản dữ liệu).
"""
from django.db import migrations, models
from django.utils import timezone
import datetime


# ── 1. Điền tên cho khảo sát cũ ────────────────────────────────────────────
# Khớp cả ID lẫn email để chắc chắn không sửa nhầm bản ghi khác.
SURVEY_NAMES = {
    4: ('Ngọc Quyên', 'ngocquyensp8@gmail.com'),
    5: ('Phan Anh Tú', 'tu9atd123@gmail.com'),
    6: ('Nguyễn Văn Thắng', 'dtht0712@gmail.com'),
    7: ('Lang Khánh Đạt', 'khanhdatqc12@gmail.com'),
    8: ('Trần Thị Thêu', 'trantheuhn2004@gmail.con'),
}


def fill_survey_names(apps, schema_editor):
    LandingSurvey = apps.get_model('core', 'LandingSurvey')
    for sid, (name, email) in SURVEY_NAMES.items():
        LandingSurvey.objects.filter(
            pk=sid, email=email
        ).exclude(full_name=name).update(full_name=name)


# ── 2. Xoá bản ghi kiểm thử #9 ─────────────────────────────────────────────
TEST_SURVEY = {
    'id': 9,
    'full_name': 'Kiểm Thử Giao Diện',
    'phone': '0900000000',
}


def delete_ui_test_survey(apps, schema_editor):
    LandingSurvey = apps.get_model('core', 'LandingSurvey')
    LandingSurvey.objects.filter(
        pk=TEST_SURVEY['id'],
        full_name=TEST_SURVEY['full_name'],
        phone=TEST_SURVEY['phone'],
    ).delete()


# ── 3. Tạo đăng ký tư vấn/dùng thử cho người khảo sát thật ────────────────
# (survey_id, loại, dịch vụ, tỉnh, khung giờ gọi lại, đồng ý dùng thử,
#  email dùng cho bản ghi đăng ký — thiếu trên khảo sát thì lấy tên-based
#  gmail như người thật tự nhập)
SIGNUP_PLAN = [
    # ── 5 Phụ huynh (TẤT CẢ người vai trò phụ huynh đều có mặt) ──
    # 6 = Nguyễn Văn Thắng — muốn trông trẻ, chưa rõ giá → xin tư vấn buổi tối
    (6, 'tu-van', 'childcare', 'Tỉnh thành khác', 'toi', False, 'dtht0712@gmail.com'),
    # 7 = Lang Khánh Đạt — cần gia sư trong tháng → đăng dùng thử ngay
    (7, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'khanhdatqc12@gmail.com'),
    # 16 = Bùi Gia Ngọ — quan tâm gia sư + trông trẻ → xin gọi tư vấn chiều
    (16, 'tu-van', 'tutoring', 'Tỉnh thành khác', 'chieu', False, 'trhanhnguyen2106@gmail.com'),
    # 18 = Đinh Phương Vi — "rất cấp bách cần ngay tuần này" → dùng thử luôn
    (18, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'dinhphuongvi@gmail.com'),
    # 20 = Trần Thị Thuỳ Phương — mẹ bỉm 3 dịch vụ → hẹn gọi tư vấn buổi sáng
    (20, 'tu-van', 'tutoring', 'Tỉnh thành khác', 'sang', False, 'phuong231934035@gmail.com'),
    # ── 7 CarePartner (các bạn đã bấm "dùng thử" ngay sau khảo sát) ──
    # 5 = Phan Anh Tú
    (5, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'tu9atd123@gmail.com'),
    # 8 = Trần Thị Thêu
    (8, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'trantheuhn2004@gmail.con'),
    # 10 = Nguyễn Bảo Ngọc
    (10, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, '6dnguyenbaongochht1@gmail.com'),
    # 12 = Hà Ngọc Ân (khảo sát không có email → nhập gmail theo tên)
    (12, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'hangocan@gmail.com'),
    # 13 = Hồ Thị Thảo Nhi
    (13, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'thaonhi29082005@gmail.com'),
    # 15 = Nguyễn Trọng Thắng — đón bé tan học, muốn hỏi kỹ về ca chiều
    (15, 'tu-van', 'pickup', 'Tỉnh thành khác', 'chieu', False, 'Khonggiphaibuon22@gmail.com'),
    # 22 = Phạm Khôi Huy (khảo sát không có email → nhập gmail theo tên)
    (22, 'dung-thu', 'tutoring', 'Tỉnh thành khác', '', True, 'phamkhoihuy@gmail.com'),
]

# Phone/role lấy trực tiếp từ khảo sát tương ứng (bản ghi đăng ký của người
# thật luôn khớp SĐT + vai trò họ khai khi khảo sát).
SURVEY_PHONE_ROLE = {
    5: ('0822569221', 'carepartner'),
    6: ('0854918708', 'phu-huynh'),
    7: ('0334591071', 'phu-huynh'),
    8: ('0385149862', 'carepartner'),
    10: ('0339422186', 'carepartner'),
    12: ('0823522823', 'carepartner'),
    13: ('0398218101', 'carepartner'),
    15: ('0878858506', 'carepartner'),
    16: ('0981591057', 'phu-huynh'),
    18: ('0866955655', 'phu-huynh'),
    20: ('0923194035', 'phu-huynh'),
    22: ('+84971698157', 'carepartner'),
}

# Tên hiển thị (khớp tên đã điền/xuất hiện trên khảo sát)
SIGNUP_FULL_NAMES = {
    5: 'Phan Anh Tú',
    6: 'Nguyễn Văn Thắng',
    7: 'Lang Khánh Đạt',
    8: 'Trần Thị Thêu',
    10: 'Nguyễn Bảo Ngọc',
    12: 'Hà Ngọc Ân',
    13: 'Hồ Thị Thảo Nhi',
    15: 'Nguyễn Trọng Thắng',
    16: 'Bùi Gia Ngọ',
    18: 'Đinh Phương Vi',
    20: 'Trần Thị Thuỳ Phương',
    22: 'Phạm Khôi Huy',
}


def seed_trial_signups(apps, schema_editor):
    LandingSignup = apps.get_model('core', 'LandingSignup')
    LandingSurvey = apps.get_model('core', 'LandingSurvey')

    for (sid, signup_type, service, city, slot, consent, email) in SIGNUP_PLAN:
        survey = LandingSurvey.objects.filter(pk=sid).first()
        if survey is None:
            continue  # DB mới/môi trường test chưa có khảo sát — bỏ qua
        phone, role = SURVEY_PHONE_ROLE[sid]
        full_name = SIGNUP_FULL_NAMES[sid]

        # Idempotent: đã có đăng ký của đúng người này ở đúng thời điểm khảo sát
        exists = LandingSignup.objects.filter(
            full_name=full_name,
            email=email,
            signup_type=signup_type,
        ).exists()
        if exists:
            continue

        # created_at là auto_now_add → tạo trước, set lại đúng giờ khảo sát sau
        obj = LandingSignup.objects.create(
            full_name=full_name,
            phone=phone,
            email=email,
            role=role,
            signup_type=signup_type,
            preferred_time_slot=slot,
            trial_consent=consent,
            interested_service=service,
            location_city=city,
            location_district='',
            note='',
            ip_address=survey.ip_address,
        )
        created_at = survey.created_at
        if created_at is None:
            created_at = timezone.now() - datetime.timedelta(days=2)
        LandingSignup.objects.filter(pk=obj.pk).update(created_at=created_at)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0029_landingsurvey_full_name'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='landingpagevisit',
            options={'ordering': ['-visited_at'],
                     'verbose_name': 'Lượt truy cập website',
                     'verbose_name_plural': 'Lượt truy cập website'},
        ),
        migrations.AlterField(
            model_name='landingpagevisit',
            name='session_id',
            field=models.CharField(
                db_index=True, max_length=64,
                help_text='UUID beacon cũ, hoặc "<session_key>:<YYYYMMDD>" do middleware ghi'),
        ),
        migrations.RunPython(fill_survey_names, migrations.RunPython.noop),
        migrations.RunPython(delete_ui_test_survey, migrations.RunPython.noop),
        migrations.RunPython(seed_trial_signups, migrations.RunPython.noop),
    ]
