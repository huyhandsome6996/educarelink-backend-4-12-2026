"""
matching/management/commands/seed_super_carepartner.py

Nạp SIÊU CarePartner Hồ Quang Huy — tài khoản demo "cái gì cũng nhất":
- Thông thạo TẤT CẢ các bộ môn/kỹ năng hiện có của hệ thống (47 skill codes
  gom từ map kỹ năng gemini_service + các nhóm chuyên sâu seed_specialist).
- hidden_elo = 2000 — ĐIỂM ELO CAO NHẤT HỆ THỐNG (ELO_MAX clamp,
  vượt mọi CarePartner khác: nhóm specialist cao nhất là 1580).
- Tier Hạng Kim cương (diamond) — bậc phân hạng cao nhất của User (B4).
- Rating 5.0 sao / 99 đánh giá / 99 ca hoàn thành / streak 99 — mọi chỉ số đều trần.
- Avatar thật: static/images/avatars/hu_quang_huy.png (serve qua Whitenoise).

IDEMPOTENT: update_or_create — chạy nhiều lần không tạo trùng; khi user đã
tồn tại thì GIỮ NGUYÊN mật khẩu (chỉ set mật khẩu Demo@2026 lần tạo đầu).

build.sh gọi lệnh này sau seed_specialist_carepartners → mỗi lần deploy tự
đảm bảo Hồ Quang Huy luôn tồn tại trên prod với chỉ số trần.

Mật khẩu demo: Demo@2026 (đồng bộ quy ước AGENTS.md §0).
"""

import datetime

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from matching.models import CarePartnerAvailability, CarePartnerProfile, EloBand

User = get_user_model()

DEFAULT_PASSWORD = 'Demo@2026'

USERNAME = 'carepartner_huquanghuy'
FIRST_NAME = 'Quang Huy'
LAST_NAME = 'Hồ'
EMAIL = 'iamdoinb6996@gmail.com'
PHONE = '0862427404'
ADDRESS = '36 Lê Lợi, P. Vĩnh Ninh, TP. Huế (trung tâm — 5 phút tới mọi điểm trong phố)'

# Avatar được serve qua Whitenoise (STATIC_ROOT). Dùng URL tuyệt đối của
# prod để mobile (React Native Image uri=) load được — web render cũng OK.
AVATAR_URL = 'https://educarelink-backend.onrender.com/static/images/avatars/hu_quang_huy.png'

# Tọa độ trung tâm TP. Huế — tối ưu khoảng cách matching tới mọi phụ huynh demo.
LAT = 16.4637
LNG = 107.5909

QUALIFICATIONS = [
    'Cử nhân xuất sắc Sư phạm Toán - ĐH Sư Phạm - ĐH Huế (tốt nghiệp loại Xuất sắc)',
    'IELTS 8.5 Overall — giảng dạy tiếng Anh giao tiếp & luyện thi Cambridge/IELTS cho thiếu nhi',
    'Chứng chỉ Piano & Organ ABRSM Grade 8 — 5 năm dạy nhạc cụ cho trẻ 4-12 tuổi',
    'Giải Nhất Tin học trẻ Quốc gia — dạy lập trình Scratch/Python/STEM Robotics',
    'Giải Nhất Vở sạch chữ đẹp cấp Tỉnh — luyện chữ đẹp tiểu học',
    'Chứng chỉ Sơ cấp cứu Chữ thập đỏ Việt Nam + BLS (Basic Life Support)',
    'Chứng chỉ Nghiệp vụ Sư phạm Mầm non & Tiểu học — 5 năm trông trẻ toàn thời gian',
    'Bằng lái xe máy A1 — đưa đón trẻ an toàn, thông thạo mọi tuyến đường TP. Huế',
]

AI_PROFILE_SUMMARY = (
    'CarePartner toàn năng số 1 EduCareLink — điểm ELO cao nhất hệ thống (2000, bậc tin nhiệm tối đa). '
    'Thông thạo TẤT CẢ bộ môn: gia sư mọi môn từ tiểu học đến THPT (Toán, Văn, Tiếng Anh, Lý, Hóa, Sinh, '
    'Lịch sử, Địa lý, GDCD, Tin học), ngoại ngữ 4 thứ tiếng (Anh IELTS 8.5, Trung HSK6, Nhật JLPT N1, Pháp DELF B2), '
    'âm nhạc (Piano, Organ, Guitar), mỹ thuật, lập trình Scratch/STEM, luyện chữ đẹp. '
    'Chăm sóc trẻ toàn diện: mầm non, trông trẻ, đưa đón, sơ cấp cứu, nấu ăn dinh dưỡng. '
    '99 ca hoàn thành 100% đúng giờ, 5.0 sao tuyệt đối, streak 99 không hủy — "cái gì cũng nhất".'
)

# Ghi nguồn của từng nhóm skill để dễ maintain:
#   - NHÓM 1: toàn bộ key của SKILL_MAP trong matching/services/gemini_service.py
#     (mọi môn học/kỹ năng hệ thống AI parse được)
#   - NHÓM 2: các code chuyên sâu seed_specialist_carepartners.py dùng thêm
SUPER_SKILLS = [
    # NHÓM 1 — Môn học & kỹ năng chính (gemini_service SKILL_MAP)
    'toan', 'van', 'tieng_viet', 'tu_nhien_xa_hoi', 'tin_hoc_cong_nghe',
    'tin_hoc', 'cong_nghe', 'giao_duc_cong_dan', 'khoa_hoc_tu_nhien',
    'lich_su_dia_ly', 'lich_su', 'dia_ly', 'giao_duc_kinh_te_phap_luat',
    'am_nhac', 'luyen_chu_dep', 'tieng_anh', 'ly', 'hoa', 'sinh',
    'su_pham', 'mam_non', 'trong_tre', 'don_tre', 'so_cap_cuu', 'nau_an',
    'choi_cung_be', 'mc', 'ky_nang_song', 'dan_piano', 've', 'tieu_hoc',
    'lap_trinh', 'tieng_trung', 'tieng_nhat', 'tieng_phap', 'kien_nhan',
    'cham_soc_tre',
    # NHÓM 2 — Chuyên sâu (seed_specialist)
    'organ', 'guitar', 'thanh_nhac', 've_tranh', 'my_thuat', 'hoi_hoa',
    'ielts', 'scratch', 'stem', 'an_toan', 'dung_gio',
]

ELO_MAX = 2000  # trần clamp theo matching/services/elo_service.py (ELO_MAX)


class Command(BaseCommand):
    help = ('Nạp SIÊU CarePartner Hồ Quang Huy (elo 2000 cao nhất hệ thống, '
            'đủ mọi bộ môn, hạng Kim cương) — IDEMPOTENT')

    def _log(self, msg, style_func=None):
        out = style_func(msg) if style_func else msg
        try:
            self.stdout.write(out)
        except (UnicodeEncodeError, Exception):
            try:
                safe_msg = str(out).encode('ascii', errors='replace').decode('ascii')
                self.stdout.write(safe_msg)
            except Exception:
                pass

    def handle(self, *args, **options):
        self._log('=== NAP SIÊU CAREPARTNER Hồ Quang Huy VAO DATABASE ===', self.style.NOTICE)

        band_trusted = (EloBand.objects.filter(name='trusted').first()
                        or EloBand.objects.order_by('-min_elo').first())

        with transaction.atomic():
            user, created = User.objects.get_or_create(
                username=USERNAME,
                defaults={
                    'first_name': FIRST_NAME,
                    'last_name': LAST_NAME,
                    'email': EMAIL,
                    'phone_number': PHONE,
                    'role': 'worker',
                    'is_approved': True,
                    'is_active': True,
                    'is_verified': True,
                    'address': ADDRESS,
                    'latitude': LAT,
                    'longitude': LNG,
                    'avatar_url': AVATAR_URL,
                },
            )
            if created:
                user.set_password(DEFAULT_PASSWORD)

            # Cập nhật ĐỒNG THỜI hồ sơ + phân hạng diamond (bậc cao nhất B4)
            user.first_name = FIRST_NAME
            user.last_name = LAST_NAME
            user.email = EMAIL
            user.phone_number = PHONE
            user.role = 'worker'
            user.is_approved = True
            user.is_active = True
            user.is_verified = True
            user.address = ADDRESS
            user.latitude = LAT
            user.longitude = LNG
            user.avatar_url = AVATAR_URL
            user.tier = User.CarePartnerTier.DIAMOND
            user.tier_updated_at = timezone.now()
            user.tier_override = False
            user.tier_meta = {
                'completed_jobs': 99,
                'avg_rating': 5.0,
                'review_count': 99,
                'has_cert': True,
                'has_specialized': True,
                'seed_source': 'seed_super_carepartner',
            }
            user.qualifications = QUALIFICATIONS
            user.ai_profile_summary = AI_PROFILE_SUMMARY
            user.save()

            # Hồ sơ matching — MỌI chỉ số đều trần, elo cao nhất hệ thống
            prof, _ = CarePartnerProfile.objects.get_or_create(user=user)
            prof.band = band_trusted
            prof.band_updated_at = timezone.now()
            prof.hidden_elo = ELO_MAX
            prof.effective_elo = float(ELO_MAX)
            prof.matching_paused = False
            prof.suspended_until = None
            prof.auto_replace = False
            prof.max_radius_km = 50
            prof.has_vehicle = True
            prof.gender = 'male'
            prof.school = 'Đại học Sư Phạm - Đại học Huế'
            prof.major = 'Sư phạm Toán (tổng hợp mọi bộ môn: Gia sư · Trông trẻ · Đưa đón · Âm nhạc · Ngoại ngữ · STEM)'
            prof.skills = SUPER_SKILLS
            prof.rating_avg = 5.0
            prof.review_count = 99
            prof.jobs_completed = 99
            prof.jobs_cancelled = 0
            prof.jobs_no_show = 0
            prof.streak_count = 99
            prof.responded_within_sla = 99
            prof.responses_total = 99
            prof.save()

            # Lịch rảnh phủ kín 7 ngày trong tuần (06:00 - 23:00) — nhận được
            # mọi ca mọi khung giờ như seed_specialist_carepartners.
            CarePartnerAvailability.objects.filter(carepartner=user).delete()
            for wd in range(7):
                CarePartnerAvailability.objects.create(
                    carepartner=user,
                    weekday=wd,
                    time_from=datetime.time(6, 0),
                    time_to=datetime.time(23, 0),
                )

        self._log(
            f'\n[OK] {user.username} — {user.get_full_name()} — {user.email} / {user.phone_number}',
            self.style.SUCCESS,
        )
        self._log(
            f'     ELO: {ELO_MAX} (CAO NHẤT HỆ THỐNG) | Tier: {user.tier} | '
            f'Skills: {len(SUPER_SKILLS)} bộ môn | Rating 5.0/99 review | 99 ca hoàn thành',
            self.style.SUCCESS,
        )
        # In danh sách elo các CP khác để xác nhận "cao nhất hệ thống"
        others = (CarePartnerProfile.objects.exclude(user__username=USERNAME)
                  .order_by('-hidden_elo')[:3])
        for p in others:
            self._log(f'     So sánh — {p.user.username}: elo {p.hidden_elo}')
        self._log('HOAN TAT SIÊU CAREPARTNER (idempotent — chạy lại an toàn).')
