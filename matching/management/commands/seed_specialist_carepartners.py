"""
matching/management/commands/seed_specialist_carepartners.py

Management command committed vào git để nạp CarePartner chuyên môn thật cho mọi
nhóm kỹ năng đặc thù trong hệ thống (Âm nhạc, CNTT/Lập trình, Mỹ thuật, Ngoại ngữ,
Tiểu học/Luyện chữ đẹp, Mầm non, Đưa đón an toàn).

IDEMPOTENT: get_or_create / update_or_create — chạy nhiều lần không tạo trùng.
Tất cả CarePartner đều có:
- Tài khoản active, approved, verified.
- Lịch rảnh phủ kín 7 ngày trong tuần (06:00 - 23:00).
- Bậc tin nhiệm trusted (hệ số 1.15).
- Tọa độ GPS thực tế tại khu vực Hà Nội.
"""

import datetime
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction

from matching.models import (
    CarePartnerProfile,
    CarePartnerAvailability,
    EloBand,
)

User = get_user_model()
DEFAULT_PASSWORD = 'Demo@2026'

SPECIALIST_CAREPARTNERS = [
    # ── 1. ÂM NHẠC & ĐÀN PIANO / ORGAN / GUITAR ──
    {
        'username': 'carepartner_huyenpiano',
        'first_name': 'Khánh Huyền',
        'last_name': 'Nguyễn',
        'email': 'huyen.piano@educarelink.vn',
        'phone_number': '0912345888',
        'address': '77 Hào Nam, Đống Đa, Hà Nội (gần HV Âm nhạc)',
        'lat': 21.0265,
        'lng': 105.8235,
        'gender': 'female',
        'school': 'Học viện Âm nhạc Quốc gia Việt Nam',
        'major': 'Piano & Sư phạm Âm nhạc',
        'skills': ['dan_piano', 'organ', 'am_nhac', 'su_pham', 'kien_nhan'],
        'qualifications': [
            'Sinh viên năm cuối Khoa Piano - Học viện Âm nhạc Quốc gia Việt Nam',
            'Chứng chỉ Piano Quốc tế ABRSM Grade 8',
            'Giải Nhì Festival Piano Quốc tế Hà Nội',
            'Kinh nghiệm 4 năm gia sư đàn piano & organ cho trẻ từ 5-12 tuổi',
        ],
        'summary': 'Giảng dạy Piano & Organ cơ bản đến nâng cao theo giáo trình ABRSM/Alfred. Phương pháp nhẹ nhàng, khơi gợi cảm xúc âm nhạc, rèn luyện tư thế ngón tay và khả năng xướng âm chuẩn.',
        'elo': 1580,
        'band': 'trusted',
        'jobs_completed': 38,
        'rating': 5.0,
        'review_count': 26,
    },
    {
        'username': 'carepartner_bachmusic',
        'first_name': 'Hoàng Bách',
        'last_name': 'Nguyễn',
        'email': 'bach.music@educarelink.vn',
        'phone_number': '0912345889',
        'address': 'Nguyễn Trãi, Thanh Xuân, Hà Nội',
        'lat': 20.9980,
        'lng': 105.7950,
        'gender': 'male',
        'school': 'ĐH Sư phạm Nghệ thuật Trung ương',
        'major': 'Sư phạm Âm nhạc & Nhạc cụ',
        'skills': ['dan_piano', 'guitar', 'organ', 'am_nhac', 'thanh_nhac'],
        'qualifications': [
            'Cử nhân Sư phạm Âm nhạc - ĐH Sư phạm Nghệ thuật TW',
            'Chuyên dạy Organ, Piano đệm hát và cảm thụ âm nhạc',
            'Chứng chỉ Sư phạm mầm non & thiếu nhi',
        ],
        'summary': 'Dạy kèm Organ, Piano và cảm thụ âm nhạc thiếu nhi. Phương pháp học nhạc qua trò chơi vui nhộn, giúp bé tự tin biểu diễn.',
        'elo': 1490,
        'band': 'trusted',
        'jobs_completed': 29,
        'rating': 4.9,
        'review_count': 18,
    },

    # ── 2. MỸ THUẬT & HỘI HỌA ──
    {
        'username': 'carepartner_dieulinh_ve',
        'first_name': 'Diệu Linh',
        'last_name': 'Trần',
        'email': 'dieulinh.art@educarelink.vn',
        'phone_number': '0912345890',
        'address': '42 Yết Kiêu, Hoàn Kiếm, Hà Nội (gần ĐH Mỹ thuật)',
        'lat': 21.0235,
        'lng': 105.8420,
        'gender': 'female',
        'school': 'Đại học Mỹ thuật Việt Nam',
        'major': 'Hội họa & Sư phạm Mỹ thuật',
        'skills': ['ve', 've_tranh', 'my_thuat', 'hoi_hoa', 'kien_nhan'],
        'qualifications': [
            'Sinh viên năm 4 Khoa Hội họa - ĐH Mỹ thuật Việt Nam',
            'Kinh nghiệm 3 năm dạy vẽ màu nước, sáp dầu và tạo hình sáng tạo cho bé 4-10 tuổi',
            'Giải Ba triển lãm mỹ thuật trẻ Hà Nội',
        ],
        'summary': 'Dạy kèm mỹ thuật, vẽ tranh sáng tạo và bồi dưỡng tư duy thị giác. Hướng dẫn bé phối màu, cảm nhận bố cục và tự do thể hiện thế giới quan.',
        'elo': 1520,
        'band': 'trusted',
        'jobs_completed': 31,
        'rating': 4.95,
        'review_count': 22,
    },

    # ── 3. CNTT & LẬP TRÌNH ──
    {
        'username': 'carepartner_tuankiet',
        'first_name': 'Tuấn Kiệt',
        'last_name': 'Lương',
        'email': 'tuankiet.cs@educarelink.vn',
        'phone_number': '0912345891',
        'address': 'Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội (ĐH Bách Khoa)',
        'lat': 21.0055,
        'lng': 105.8430,
        'gender': 'male',
        'school': 'ĐH Bách Khoa Hà Nội',
        'major': 'Khoa học Máy tính & Công nghệ Thông tin',
        'skills': ['lap_trinh', 'scratch', 'stem', 'toan', 'tieng_anh'],
        'qualifications': [
            'Sinh viên năm 3 Khoa CNTT - ĐH Bách Khoa Hà Nội',
            'Giải Nhì lập trình Tin học trẻ Quốc gia',
            'Giảng viên bán thời gian dạy Scratch & Python cho trẻ em tại trung tâm STEM',
        ],
        'summary': 'Dạy kèm lập trình tư duy Scratch, STEM Robotics và Python cơ bản cho học sinh từ lớp 3 đến lớp 9. Phương pháp học lập trình qua làm game tương tác.',
        'elo': 1560,
        'band': 'trusted',
        'jobs_completed': 34,
        'rating': 4.92,
        'review_count': 20,
    },

    # ── 4. NGOẠI NGỮ CHUYÊN SÂU (ANH, TRUNG, NHẬT, PHÁP) ──
    {
        'username': 'tran_minh_thu',
        'first_name': 'Minh Thư',
        'last_name': 'Trần',
        'email': 'minhthu.english@educarelink.vn',
        'phone_number': '0912345892',
        'address': 'Phạm Văn Đồng, Cầu Giấy, Hà Nội (gần ULIS)',
        'lat': 21.0420,
        'lng': 105.7810,
        'gender': 'female',
        'school': 'ĐH Ngoại ngữ - ĐHQGHN (ULIS)',
        'major': 'Sư phạm Tiếng Anh (IELTS 8.0)',
        'skills': ['tieng_anh', 'ielts', 'su_pham', 'kien_nhan'],
        'qualifications': [
            'Cử nhân Sư phạm Tiếng Anh - ĐH Ngoại ngữ ĐHQGHN',
            'IELTS 8.0 (Listening 8.5, Reading 8.5, Speaking 8.0, Writing 7.5)',
            'Chứng chỉ giảng dạy tiếng Anh quốc tế TESOL',
        ],
        'summary': 'Gia sư tiếng Anh phát âm chuẩn bản xứ, luyện nghe nói tương tác, ngữ pháp và chuẩn bị thi chứng chỉ Cambridge Starters/Movers/Flyers cho trẻ.',
        'elo': 1570,
        'band': 'trusted',
        'jobs_completed': 42,
        'rating': 5.0,
        'review_count': 30,
    },
    {
        'username': 'carepartner_lananh_chinese',
        'first_name': 'Lan Anh',
        'last_name': 'Hoàng',
        'email': 'lananh.chinese@educarelink.vn',
        'phone_number': '0912345893',
        'address': 'Xuân Thủy, Cầu Giấy, Hà Nội',
        'lat': 21.0360,
        'lng': 105.7840,
        'gender': 'female',
        'school': 'ĐH Ngoại ngữ - ĐHQGHN (ULIS)',
        'major': 'Sư phạm Tiếng Trung Quốc',
        'skills': ['tieng_trung', 'su_pham', 'kien_nhan'],
        'qualifications': [
            'Sinh viên năm 4 Khoa Ngôn ngữ & Văn hóa Trung Quốc - ULIS',
            'Chứng chỉ Hán ngữ HSK 6 (275/300) & HSKK Cao cấp',
            'Kinh nghiệm 2 năm dạy kèm tiếng Trung giao tiếp cho thiếu nhi',
        ],
        'summary': 'Dạy kèm tiếng Trung chuẩn phổ thông Bắc Kinh, rèn phát âm Pinyin chuẩn và nhận diện chữ Hán qua hình ảnh sinh động.',
        'elo': 1510,
        'band': 'trusted',
        'jobs_completed': 25,
        'rating': 4.95,
        'review_count': 16,
    },
    {
        'username': 'carepartner_nhatnam_japanese',
        'first_name': 'Nhật Nam',
        'last_name': 'Vũ',
        'email': 'nhatnam.japanese@educarelink.vn',
        'phone_number': '0912345894',
        'address': 'Nguyễn Trãi, Thanh Xuân, Hà Nội (gần HANU)',
        'lat': 20.9850,
        'lng': 105.7970,
        'gender': 'male',
        'school': 'Đại học Hà Nội (HANU)',
        'major': 'Khoa Tiếng Nhật & Sư phạm',
        'skills': ['tieng_nhat', 'su_pham', 'kien_nhan'],
        'qualifications': [
            'Cử nhân Ngôn ngữ Nhật Bản - Đại học Hà Nội',
            'Chứng chỉ năng lực tiếng Nhật JLPT N1',
            'Kinh nghiệm 2 năm gia sư tiếng Nhật cho học sinh quốc tế',
        ],
        'summary': 'Dạy kèm tiếng Nhật Hiragana, Katakana, Kanji nhập môn và văn hóa giao tiếp Nhật Bản cho thiếu nhi.',
        'elo': 1480,
        'band': 'trusted',
        'jobs_completed': 20,
        'rating': 4.9,
        'review_count': 14,
    },
    {
        'username': 'carepartner_quynhtrang_french',
        'first_name': 'Quỳnh Trang',
        'last_name': 'Lê',
        'email': 'quynhtrang.french@educarelink.vn',
        'phone_number': '0912345895',
        'address': 'Chùa Láng, Đống Đa, Hà Nội',
        'lat': 21.0220,
        'lng': 105.8030,
        'gender': 'female',
        'school': 'ĐH Ngoại ngữ - ĐHQGHN (ULIS)',
        'major': 'Sư phạm Tiếng Pháp',
        'skills': ['tieng_phap', 'su_pham', 'kien_nhan'],
        'qualifications': [
            'Sinh viên năm cuối Khoa Pháp ngữ - ĐH Ngoại ngữ ĐHQGHN',
            'Chứng chỉ tiếng Pháp Quốc tế DELF B2',
            'Kèm học sinh trường Song ngữ Pháp - Việt',
        ],
        'summary': 'Dạy kèm tiếng Pháp vỡ lòng và bổ trợ chương trình song ngữ Pháp cho học sinh tiểu học.',
        'elo': 1470,
        'band': 'trusted',
        'jobs_completed': 19,
        'rating': 4.88,
        'review_count': 12,
    },

    # ── 5. TIỂU HỌC & LUYỆN CHỮ ĐẸP ──
    {
        'username': 'nguyen_thu_ha',
        'first_name': 'Thu Hà',
        'last_name': 'Nguyễn',
        'email': 'thuha.primary@educarelink.vn',
        'phone_number': '0912345896',
        'address': '136 Xuân Thủy, Dịch Vọng Hậu, Cầu Giấy, Hà Nội',
        'lat': 21.0370,
        'lng': 105.7830,
        'gender': 'female',
        'school': 'ĐH Sư Phạm Hà Nội',
        'major': 'Sư phạm Giáo dục Tiểu học',
        'skills': ['luyen_chu_dep', 'tieu_hoc', 'su_pham', 'kien_nhan', 'van'],
        'qualifications': [
            'Sinh viên năm 4 Khoa Giáo dục Tiểu học - ĐH Sư Phạm Hà Nội',
            'Giải Nhất cuộc thi Vở sạch chữ đẹp cấp Tỉnh',
            'Chứng chỉ Nghiệp vụ Sư phạm Tiểu học',
        ],
        'summary': 'Rèn chữ đẹp nét thanh nét đậm, tư thế ngồi chuẩn y khoa và kèm văn hóa toán - tiếng Việt lớp 1 đến lớp 5.',
        'elo': 1540,
        'band': 'trusted',
        'jobs_completed': 45,
        'rating': 4.98,
        'review_count': 32,
    },
    {
        'username': 'le_thao_vy',
        'first_name': 'Thảo Vy',
        'last_name': 'Lê',
        'email': 'thaovy.hnue@educarelink.vn',
        'phone_number': '0912345897',
        'address': '26 Chùa Láng, Đống Đa, Hà Nội',
        'lat': 21.0230,
        'lng': 105.8020,
        'gender': 'female',
        'school': 'ĐH Sư Phạm Hà Nội',
        'major': 'Sư phạm Ngữ Văn & Tiểu học',
        'skills': ['luyen_chu_dep', 'van', 'su_pham', 'tieu_hoc', 'kien_nhan'],
        'qualifications': [
            'Cử nhân Sư phạm Ngữ Văn - ĐH Sư Phạm Hà Nội',
            '3 năm kinh nghiệm gia sư rèn chữ & luyện viết văn tiểu học',
        ],
        'summary': 'Kiên nhẫn uốn nắn nét chữ cho bé, chữa tật cầm bút sai và hướng dẫn phương pháp đọc hiểu tiếng Việt.',
        'elo': 1490,
        'band': 'trusted',
        'jobs_completed': 36,
        'rating': 4.92,
        'review_count': 25,
    },

    # ── 6. MẦM NON & TRÔNG TRẺ ──
    {
        'username': 'carepartner_hoango',
        'first_name': 'Hoàng Ngân',
        'last_name': 'Đỗ',
        'email': 'hoangngan.preschool@educarelink.vn',
        'phone_number': '0912345898',
        'address': 'Trần Thái Tông, Dịch Vọng, Cầu Giấy, Hà Nội',
        'lat': 21.0310,
        'lng': 105.7890,
        'gender': 'female',
        'school': 'ĐH Sư Phạm Hà Nội',
        'major': 'Giáo dục Mầm non',
        'skills': ['trong_tre', 'mam_non', 'choi_cung_be', 'so_cap_cuu', 'nau_an', 'kien_nhan'],
        'qualifications': [
            'Sinh viên năm 4 Khoa Giáo dục Mầm non - ĐH Sư Phạm Hà Nội',
            'Chứng chỉ Sơ cấp cứu Chữ thập đỏ Việt Nam',
            'Chứng chỉ Dinh dưỡng và chăm sóc trẻ ăn dặm khoa học',
        ],
        'summary': 'Chăm sóc trẻ chu đáo, kể chuyện, tổ chức trò chơi phát triển vận động tinh và rèn thói quen nề nếp cho trẻ.',
        'elo': 1550,
        'band': 'trusted',
        'jobs_completed': 50,
        'rating': 5.0,
        'review_count': 38,
    },
    {
        'username': 'vu_khanh_an',
        'first_name': 'Khánh An',
        'last_name': 'Vũ',
        'email': 'khanhan.pediatric@educarelink.vn',
        'phone_number': '0912345899',
        'address': 'Số 1 Tôn Thất Tùng, Đống Đa, Hà Nội (ĐH Y Hà Nội)',
        'lat': 21.0030,
        'lng': 105.8310,
        'gender': 'female',
        'school': 'Đại học Y Hà Nội',
        'major': 'Điều dưỡng Nhi khoa (Năm 4)',
        'skills': ['trong_tre', 'so_cap_cuu', 'mam_non', 'kien_nhan'],
        'qualifications': [
            'Sinh viên năm 4 Điều dưỡng Nhi khoa - ĐH Y Hà Nội',
            'Chứng chỉ BLS (Basic Life Support) & Sơ cứu nghẹn dị vật đường thở',
        ],
        'summary': 'Chăm sóc chuyên sâu cho trẻ nhỏ, theo dõi sức khỏe, sơ cứu tai nạn thương tích và hỗ trợ phụ huynh chăm bé an tâm tuyệt đối.',
        'elo': 1530,
        'band': 'trusted',
        'jobs_completed': 33,
        'rating': 4.96,
        'review_count': 24,
    },

    # ── 7. ĐƯA ĐÓN TRẺ AN TOÀN ──
    {
        'username': 'carepartner_phuoc',
        'first_name': 'Hữu Phước',
        'last_name': 'Nguyễn',
        'email': 'huuphuoc.med@educarelink.vn',
        'phone_number': '0912345900',
        'address': 'Giải Phóng, Đống Đa, Hà Nội (gần BV Bạch Mai)',
        'lat': 20.9990,
        'lng': 105.8410,
        'gender': 'male',
        'school': 'Đại học Y Hà Nội',
        'major': 'Bác sĩ Đa khoa (Năm 4)',
        'skills': ['don_tre', 'so_cap_cuu', 'an_toan', 'dung_gio'],
        'qualifications': [
            'Sinh viên năm 4 Bác sĩ Đa khoa - ĐH Y Hà Nội',
            'Xe máy Honda Vision mới bảo dưỡng, 2 mũ bảo hiểm đạt chuẩn',
            'Bằng lái xe máy A1, kỹ năng sơ cứu tai nạn và lái xe an toàn',
        ],
        'summary': 'Đưa đón học sinh đúng giờ, báo cáo lộ trình cho phụ huynh, tuân thủ an toàn giao thông nghiêm ngặt.',
        'elo': 1500,
        'band': 'trusted',
        'jobs_completed': 40,
        'rating': 4.94,
        'review_count': 28,
    },
    {
        'username': 'do_duc_anh',
        'first_name': 'Đức Anh',
        'last_name': 'Đỗ',
        'email': 'ducanh.transport@educarelink.vn',
        'phone_number': '0912345901',
        'address': 'Cầu Giấy, Hà Nội (gần ĐH GTVT)',
        'lat': 21.0280,
        'lng': 105.8010,
        'gender': 'male',
        'school': 'ĐH Giao Thông Vận Tải Hà Nội',
        'major': 'Kỹ thuật Giao thông',
        'skills': ['don_tre', 'so_cap_cuu', 'an_toan', 'dung_gio'],
        'qualifications': [
            'Sinh viên năm cuối ĐH Giao Thông Vận Tải',
            'Thông thạo đường xá Hà Nội, xe Lead có cốp lớn để cặp sách cho bé',
        ],
        'summary': 'Chuyên đưa đón trẻ em đi học và đi học thêm đúng giờ, cẩn thận, luôn gọi điện xác nhận phụ huynh khi đón xong bé.',
        'elo': 1480,
        'band': 'trusted',
        'jobs_completed': 27,
        'rating': 4.9,
        'review_count': 19,
    },
]


class Command(BaseCommand):
    help = 'Nạp CarePartner chuyên môn thật (Piano, Mỹ thuật, CNTT, Ngoại ngữ, Tiểu học, Mầm non, Đón trẻ) — Idempotent'

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
        self._log('=== BAT DAU NAP SPECIALIST CAREPARTNERS VAO DATABASE ===', self.style.NOTICE)

        band_trusted = EloBand.objects.filter(name='trusted').first() or EloBand.objects.first()

        created_count = 0
        updated_count = 0

        with transaction.atomic():
            for item in SPECIALIST_CAREPARTNERS:
                user, created = User.objects.get_or_create(
                    username=item['username'],
                    defaults={
                        'first_name': item['first_name'],
                        'last_name': item['last_name'],
                        'email': item['email'],
                        'phone_number': item['phone_number'],
                        'role': 'worker',
                        'is_approved': True,
                        'is_active': True,
                        'is_verified': True,
                        'address': item['address'],
                        'latitude': item['lat'],
                        'longitude': item['lng'],
                    }
                )

                if not created:
                    user.first_name = item['first_name']
                    user.last_name = item['last_name']
                    user.email = item['email']
                    user.phone_number = item['phone_number']
                    user.role = 'worker'
                    user.is_approved = True
                    user.is_active = True
                    user.is_verified = True
                    user.address = item['address']
                    user.latitude = item['lat']
                    user.longitude = item['lng']
                    user.save()
                    updated_count += 1
                else:
                    user.set_password(DEFAULT_PASSWORD)
                    user.save()
                    created_count += 1

                # Cập nhật qualifications & summary trên user
                user.qualifications = item.get('qualifications', [])
                user.ai_profile_summary = item.get('summary', '')
                user.save()

                # Cập nhật CarePartnerProfile
                prof, _ = CarePartnerProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        'band': band_trusted,
                        'school': item['school'],
                        'major': item['major'],
                        'gender': item['gender'],
                        'skills': item['skills'],
                        'rating_avg': item['rating'],
                        'review_count': item['review_count'],
                        'jobs_completed': item['jobs_completed'],
                        'jobs_cancelled': 0,
                        'jobs_no_show': 0,
                        'hidden_elo': item['elo'],
                        'effective_elo': float(item['elo']),
                        'has_vehicle': True,
                        'max_radius_km': 30,
                        'responded_within_sla': item['jobs_completed'],
                        'responses_total': item['jobs_completed'],
                    }
                )
                prof.band = band_trusted
                prof.school = item['school']
                prof.major = item['major']
                prof.gender = item['gender']
                prof.skills = item['skills']
                prof.rating_avg = item['rating']
                prof.review_count = item['review_count']
                prof.jobs_completed = item['jobs_completed']
                prof.hidden_elo = item['elo']
                prof.effective_elo = float(item['elo'])
                prof.has_vehicle = True
                prof.max_radius_km = 30
                prof.matching_paused = False
                prof.save()

                # Nạp lịch rảnh 7 ngày trong tuần (06:00 - 23:00)
                CarePartnerAvailability.objects.filter(carepartner=user).delete()
                for wd in range(7):
                    CarePartnerAvailability.objects.create(
                        carepartner=user,
                        weekday=wd,
                        time_from=datetime.time(6, 0),
                        time_to=datetime.time(23, 0),
                    )

                self._log(
                    f"  [OK] {user.username} ({user.get_full_name()}) - {item['school']} - Skills: {item['skills']}",
                    self.style.SUCCESS
                )

        self._log(
            f'\nHoan tat nap Specialist CarePartners! Tao moi: {created_count}, Cap nhat: {updated_count}.',
            self.style.SUCCESS
        )
