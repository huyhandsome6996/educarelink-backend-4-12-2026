"""B1 — Seed dữ liệu mẫu Care Diary phủ TOÀN BỘ tài khoản hiện có.

Yêu cầu owner (2026-09-20): "tạo dữ liệu mẫu cho tất cả các tài khoản hiện
có của hệ thống — coi như 1 cách kiểm thử xem nó có hoạt động hay không".

Lệnh làm 2 pha:
  PHASE A — với MỌI task đang 'in_progress' / 'completed' đã có CarePartner
  được accepted mà chưa có nhật ký → sinh 1 entry hoàn chỉnh:
  mood + timeline hoạt động + form đánh giá chuyên sâu THEO DANH MỤC
  (gia-su → 'tutoring', trong-tre → 'childcare', còn lại → 'general').

  PHASE B — với MỌI tài khoản active (phụ huynh lẫn CarePartner) chưa thể
  thấy được nhật ký nào → tạo 1 task [DEMO] hoàn chỉnh (task + ứng tuyển
  accepted) kèm nhật ký mẫu. Ưu tiên ghép cặp "phụ huynh chưa có" với
  "carepartner chưa có" để 2 tài khoản cùng được phủ bằng 1 task.

Nguyên tắc an toàn:
  - IDEMPOTENT: chỉ THÊM dữ liệu còn thiếu, KHÔNG xoá/sửa entry đã có —
    chạy lại bao nhiêu lần cũng không sinh trùng.
  - THÂN THIỆU PIPELINE: thiết kế để khai báo trong build.sh SAU
    seed_demo_data (seed_demo_data xoá sạch diary mỗi deploy → lệnh này
    phủ lại cho mọi task/tài khoản). Mỗi item chạy trong transaction
    riêng + try/except — 1 item lỗi chỉ cảnh báo, KHÔNG làm chết deploy.
  - ĐÚNG SCHEMA: assessment_data được kiểm bằng ĐÚNG hàm
    care_diary.services.validate_assessment_data mà API/web/mobile dùng
    → dữ liệu mẫu luôn nạp lại được vào form sửa của CarePartner.
  - §15.1 Isolation: chỉ import core + care_diary.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import ServiceCategory, Task, TaskApplication, User

from ...models import CareDiaryActivity, CareDiaryEntry
from ...services import validate_assessment_data

# Trạng thái task được phép ghi nhật ký (đồng bộ check_worker_can_write:
# chỉ chặn 'open' và 'cancelled' — nhưng seed chỉ phủ 2 trạng thái này
# vì đây là 2 entry point thực tế của UI web/mobile).
ELIGIBLE_STATUSES = ('in_progress', 'completed')

DEMO_TITLE_PREFIX = '[DEMO]'


# ═══════════════════════════════════════════════════════════════════
# NỘI DUNG MẪU — FORM GIA SƯ (tutoring)
# Đủ mọi trường UI render: lesson_content{subject,topic,is_new_knowledge,
# is_review}, comprehension{score,score_label,attitude},
# classwork_homework{classwork_status,homework}, remarks{...}
# ═══════════════════════════════════════════════════════════════════
TUTORING_VARIANTS = [
    {
        'data': {
            'lesson_content': {
                'subject': 'Toán',
                'topic': 'Phân số — quy đồng mẫu số và so sánh',
                'is_new_knowledge': True,
                'is_review': False,
            },
            'comprehension': {
                'score': 5,
                'score_label': 'Tiếp thu xuất sắc',
                'attitude': 'Chăm chú, chủ động giơ tay hỏi bài',
            },
            'classwork_homework': {
                'classwork_status': 'Hoàn thành tốt toàn bộ bài trên lớp',
                'homework': 'Làm 5 bài quy đồng trang 42 SGK, nộp trước buổi tới',
            },
            'remarks': {
                'knowledge_gap': 'Còn nhầm khi tìm mẫu số chung nhỏ nhất của 3 số',
                'next_session_plan': 'Luyện tốc độ quy đồng + kiểm tra 15 phút đầu buổi',
            },
        },
        'mood': ('excited', 'Hào hứng', 'Bé rất hào hứng, tự nguyện lên bảng làm bài.'),
        'note': ('Bé tiếp thu bài quy đồng rất nhanh, làm đúng 6/8 bài tự luyện. '
                 'Nhà trường khuyên phụ huynh cho bé luyện thêm bài tìm MSCNN ở nhà.'),
        'activities': [
            ('17:00', 'Kiểm tra đầu vào 10 phút', 'Bé làm nhanh 5 câu về phân số đã học.', 'done'),
            ('17:15', 'Dạy bài mới: quy đồng mẫu số', 'Giải mẫu 3 bài trên bảng, bé làm lại từng bước.', 'done'),
            ('18:00', 'Chữa bài tập trong SGK', 'Chữa 8 bài, bé tự sửa đúng 6 bài.', 'done'),
            ('18:40', 'Trò chơi "đua phép tính"', 'Bé thắng 2 hiệp trên 3, ghi nhớ quy tắc nhanh.', 'done'),
            ('19:00', 'Giao bài tập về nhà', 'Ghi bài vào vở và dặn dò phụ huynh đồng hành.', 'done'),
        ],
    },
    {
        'data': {
            'lesson_content': {
                'subject': 'Tiếng Anh',
                'topic': 'Phát âm IPA cơ bản và hội thoại giới thiệu bản thân',
                'is_new_knowledge': False,
                'is_review': True,
            },
            'comprehension': {
                'score': 4,
                'score_label': 'Hiểu bài nhanh',
                'attitude': 'Tự tin, mạnh dạn đọc to trước lớp',
            },
            'classwork_homework': {
                'classwork_status': 'Hoàn thành tốt phần hội thoại theo cặp',
                'homework': 'Nghe lại file MP3 15 phút/ngày và luyện 5 câu giới thiệu',
            },
            'remarks': {
                'knowledge_gap': 'Còn nhầm giữa âm /ɪ/ và /iː/ khi nghe nhanh',
                'next_session_plan': 'Luyện nghe phân biệt cặp âm /ɪ/–/iː/ bằng flashcard',
            },
        },
        'mood': ('happy', 'Vui vẻ', 'Bé vui vẻ, thích các trò chơi phát âm.'),
        'note': ('Bé đã đọc trôi chày đoạn hội thoại giới thiệu bản thân. '
                 'Cần luyện thêm cặp âm ngắn/dài nhưng tinh thần học rất tốt.'),
        'activities': [
            ('19:00', 'Khởi động bài hát "Hello Song"', 'Cả lớp hát và vỗ tay theo nhịp.', 'done'),
            ('19:10', 'Ôn bảng IPA đã học', 'Bé đọc lại 12 âm, đúng 10/12.', 'done'),
            ('19:40', 'Luyện hội thoại theo cặp', 'Bé đóng vai khách mới đến lớp, nói 6 câu liền mạch.', 'done'),
            ('20:10', 'Trò chơi "bingo phát âm"', 'Bé thắng 1 vòng, nhận sticker khuyến khích.', 'done'),
            ('20:30', 'Giao bài nghe về nhà', 'Hướng dẫn phụ huynh cách mở file nghe.', 'done'),
        ],
    },
    {
        'data': {
            'lesson_content': {
                'subject': 'Ngữ văn',
                'topic': 'Phân tích hình ảnh cô Tấm trong truyện cổ tích',
                'is_new_knowledge': True,
                'is_review': False,
            },
            'comprehension': {
                'score': 3,
                'score_label': 'Tiếp thu ở mức cơ bản',
                'attitude': 'Có lúc mất tập trung, cần nhắc nhở nhẹ nhàng',
            },
            'classwork_homework': {
                'classwork_status': 'Hoàn thành dàn ý, chưa viết hết đoạn văn',
                'homework': 'Hoàn thành đoạn văn 10 câu theo dàn ý đã làm trên lớp',
            },
            'remarks': {
                'knowledge_gap': 'Bé còn liệt kê chi tiết chưa chọn được chi tiết tiêu biểu',
                'next_session_plan': 'Lập bảng chi tiết — ý nghĩa, luyện chọn chi tiết tiêu biểu',
            },
        },
        'mood': ('neutral', 'Bình an', 'Bé học đều, cần thêm thời gian để sâu sát.'),
        'note': ('Buổi ôn tập lại kiến thức cũ nên tiến độ chậm hơn dự kiến. '
                 'Bé nắm được dàn ý cơ bản, bài viết về nhà hoàn thiện sẽ chấm kỹ.'),
        'activities': [
            ('16:00', 'Kể lại cốt truyện Tấm Cám', 'Bé kể mạch lạc, nhớ đủ nhân vật.', 'done'),
            ('16:20', 'Dạy cách chọn chi tiết tiêu biểu', 'Phân tích 3 chi tiết mẫu cùng bé.', 'done'),
            ('17:00', 'Lập dàn ý phân tích cô Tấm', 'Dàn ý xong, đoạn văn mới viết được nửa.', 'partial'),
            ('17:30', 'Đọc mẫu đoạn văn tham khảo', 'Bé đọc và gạch chân từ ngữ miêu tả.', 'done'),
            ('17:50', 'Nhận xét và giao bài về nhà', 'Dặn bé hoàn thiện đoạn văn còn lại.', 'done'),
        ],
    },
]


# ═══════════════════════════════════════════════════════════════════
# NỘI DUNG MẪU — FORM TRONG TRẺ (childcare)
# Đủ mọi trường UI render: meals[{time,meal,amount}], nap{quality,
# start_time,end_time}, hygiene_health{physical_condition,diaper_toilet},
# activities{mood_during,list}, notes_for_parents
# ═══════════════════════════════════════════════════════════════════
CHILDCARE_VARIANTS = [
    {
        'data': {
            'meals': [
                {'time': '11:30', 'meal': 'Cơm gà rau củ (mẹ chuẩn bị sẵn)', 'amount': 'Ăn hết 1 bát cơm, gần hết phần thức'},
                {'time': '15:00', 'meal': 'Sữa tươi + bánh quy', 'amount': 'Uống được 180ml, ăn hết bánh'},
            ],
            'nap': {'start_time': '12:30', 'end_time': '13:45', 'quality': 'Ngủ sâu khoảng 1 tiếng 15 phút, tự dậy tỉnh táo, không quấy khóc'},
            'hygiene_health': {
                'physical_condition': 'Bé khỏe mạnh bình thường, không ho, không sốt',
                'diaper_toilet': 'Tự đi vệ sinh đúng giờ, rửa tay sạch trước và sau khi ăn',
            },
            'activities': {
                'mood_during': 'Vui vẻ, ngoan ngoãn, hợp tác rất tốt cả buổi',
                'list': ['Tô màu tranh chú gấu', 'Xếp khối Lego tòa tháp', 'Nghe kể chuyện Tấm Cám', 'Chơi ú tim ngoài sân'],
            },
            'notes_for_parents': ('Bé ăn ngon và ngủ đủ giấc. Chiều nay bé thích trò tô màu nhất, '
                                  'mẹ có thể khuyến khích bé tô thêm ở nhà để rèn tay ạ.'),
        },
        'mood': ('happy', 'Vui vẻ', 'Bé trông vui vẻ và hợp tác suốt buổi.'),
        'note': ('Ca chăm sóc diễn ra suôn sẻ: ăn hết bữa trưa, ngủ trưa đủ 1 tiếng 15 phút. '
                 'Bé thích nhất hoạt động tô màu, giao bé cho mẹ lúc 17:30 trong tình trạng vui vẻ.'),
        'activities': [
            ('11:00', 'Có mặt, bàn giao và hỏi thăm sức khỏe bé', 'Mẹ dặn khẩu phần ăn và giờ ngủ trưa.', 'done'),
            ('11:30', 'Cho bé ăn trưa', 'Bé tự ăn, được khen "khá giả" nên ăn hết bát.', 'done'),
            ('12:30', 'Đưa bé đi ngủ trưa', 'Kể 2 truyện ngắn, bé ngủ sau 10 phút.', 'done'),
            ('14:00', 'Hoạt động sáng tạo: tô màu và xếp hình', 'Hoàn thành 1 bức tranh tô màu tặng mẹ.', 'done'),
            ('15:00', 'Ăn xế chiều', 'Sữa và bánh quy, bé tự mang khay ra sau khi ăn xong.', 'done'),
            ('17:30', 'Dọn dẹp và bàn giao bé cho mẹ', 'Báo cáo đầy đủ các mốc trong ngày.', 'done'),
        ],
    },
    {
        'data': {
            'meals': [
                {'time': '11:45', 'meal': 'Cơm sườn rang + canh bí', 'amount': 'Ăn 3/4 bát, thích sườn nhất'},
                {'time': '14:30', 'meal': 'Sữa chua nho đen', 'amount': 'Ăn hết 1 hộp'},
                {'time': '16:00', 'meal': 'Bánh bao nhỏ', 'amount': 'Ăn hết 1 cái'},
            ],
            'nap': {'start_time': '13:00', 'end_time': '13:50', 'quality': 'Ngủ ngắn khoảng 50 phút, dậy sớm vì có tiếng xe ngoài đường'},
            'hygiene_health': {
                'physical_condition': 'Bé khỏe mạnh, hiếu động, ra mồ hôi lưng nhiều khi chơi',
                'diaper_toilet': 'Tự giác tốt, không có sự cố nào trong buổi',
            },
            'activities': {
                'mood_during': 'Rất hiếu động, thích các trò chơi vận động ngoài trời',
                'list': ['Đua xe đạp 3 bánh', 'Chơi bóng rổ mini', 'Làm toán vui 10 phút', 'Xem tranh tô học chữ'],
            },
            'notes_for_parents': ('Bé năng lượng cao, chơi rất hết mình. Buổi tới cô sẽ tổ chức thêm '
                                  'trò vận động nhẹ giữa giờ để bé không quá mồ hôi trước bữa tối ạ.'),
        },
        'mood': ('excited', 'Hào hứng', 'Bé hào hứng với các trò vận động.'),
        'note': ('Bé hoạt bát đặc biệt hôm nay, chơi đua xe đạp liên tục 40 phút. '
                 'Ngủ trưa hơi ngắn nên cuối buổi có hơi quậy, đã dỗ bằng trò chơi chữ ổn trở lại.'),
        'activities': [
            ('11:45', 'Ăn trưa', 'Bé gọt vỏ sườn xong mới ăn cơm, tự giác tốt.', 'done'),
            ('13:00', 'Ngủ trưa', 'Ngủ ngắn 50 phút, dậy sớm một chút.', 'done'),
            ('14:00', 'Chơi vận động ngoài sân', 'Đua xe đạp và ném bóng 40 phút.', 'done'),
            ('15:30', 'Học chữ trên bảng treo', 'Bé đọc đúng 8/10 từ mới.', 'done'),
            ('16:30', 'Ăn xế và dọn dẹp', 'Bé tự cất khay đồ ăn của mình.', 'done'),
        ],
    },
    {
        'data': {
            'meals': [
                {'time': '11:30', 'meal': 'Cháo thịt bằm trứng (mẹ nấu sẵn)', 'amount': 'Ăn được nửa bát, ăn chậm hơn thường ngày'},
                {'time': '15:30', 'meal': 'Nước cam + bánh bông lan', 'amount': 'Uống hết 1 cốc nhỏ'},
            ],
            'nap': {'start_time': '12:45', 'end_time': '14:15', 'quality': 'Ngủ được 1 tiếng 30 phút — ngủ bù do hôm qua thức khuya'},
            'hygiene_health': {
                'physical_condition': 'Hơi sổ mũi nhẹ, không sốt, vẫn chơi bình thường',
                'diaper_toilet': 'Bình thường, đã lau mũi và rửa tay sạch cho bé',
            },
            'activities': {
                'mood_during': 'Bé hơi mệt lúc đầu, sau chơi ổn trở lại',
                'list': ['Ngủ trưa dài', 'Lau mũi và uống nước ấm', 'Xếp hình yên tĩnh', 'Nghe nhạc nhí đung đưa'],
            },
            'notes_for_parents': ('Hôm nay bé hơi sổ mũi nhẹ nên cô giữ bé chơi trong nhà, cho uống nhiều nước ấm. '
                                  'Mẹ lưu ý theo dõi đêm nay, nếu bé ho nhiều hơn thì nên khám bác sĩ ạ.'),
        },
        'mood': ('alert-circle', 'Cảnh báo nhẹ', 'Bé hơi sổ mũi nhẹ, phụ huynh lưu ý theo dõi thêm.'),
        'note': ('Bé ít hoạt động hơn ngày thường vì hơi nghẹt mũi. Đã lau mũi trước bữa ăn nên bé ăn được nửa bát. '
                 'Tổng thể vẫn ổn, khuyên mẹ cho bé mặc thêm áo mỏng khi ngủ.'),
        'activities': [
            ('11:30', 'Ăn trưa (cháo thịt bằm)', 'Bé ăn chậm, được nửa bát — do nghẹt mũi.', 'partial'),
            ('12:15', 'Lau mũi, súc mũi nước muối', 'Bé hợp tác, mũi thông hơn sau khi lau.', 'done'),
            ('12:45', 'Ngủ trưa', 'Ngủ dài 1 tiếng 30 phút, hồi phục rõ.', 'done'),
            ('14:30', 'Xếp hình nhẹ nhàng trong nhà', 'Bé chơi yên tĩnh 30 phút.', 'done'),
            ('15:30', 'Ăn xế: nước cam + bánh', 'Bé uống hết cốc cam, tinh thần vui hơn.', 'done'),
            ('17:00', 'Bàn giao bé cho mẹ', 'Báo cụ thể tình trạng sổ mũi để mẹ theo dõi.', 'done'),
        ],
    },
]


# ═══════════════════════════════════════════════════════════════════
# NỘI DUNG MẪU — FORM CHUNG (general — dùng cho Đón trẻ & danh mục khác)
# ═══════════════════════════════════════════════════════════════════
GENERAL_VARIANTS = [
    {
        'mood': ('thumbs-up', 'Tích cực', 'Ca đón trẻ diễn ra đúng kế hoạch, bé vui vẻ.'),
        'note': 'Đón bé đúng giờ, trao đổi ngắn với giáo viên chủ nhiệm rồi đưa bé về nhà an toàn.',
        'activities': [
            ('16:30', 'Có mặt tại cổng trường, xuất trình thẻ đón', 'Đối diện bảo vệ và giáo viên chủ nhiệm.', 'done'),
            ('16:45', 'Đưa bé về nhà an toàn', 'Đi đường bộ, bé đeo vành đai an toàn.', 'done'),
            ('17:00', 'Bé uống sữa và làm bài tập', 'Bé tự làm bài, cô chỉ ngồi cạnh hỗ trợ.', 'done'),
            ('17:45', 'Bàn giao bé cho phụ huynh', 'Chụp ảnh xác nhận giờ bàn giao.', 'done'),
        ],
    },
    {
        'mood': ('happy', 'Vui vẻ', 'Bé kể chuyện lớp học suốt đường về, rất vui.'),
        'note': 'Bé kể chuyện bạn cùng lớp chết cười cả đường. Đã nhắc bé đội mũ bảo hiểm đúng quy định.',
        'activities': [
            ('16:30', 'Đón bé tan học', 'Hỏi nhanh giáo viên: bé hôm nay tích cực phát biểu.', 'done'),
            ('16:50', 'Dừng mua sữa đậu nành (phụ huynh dặn trước)', 'Bé tự trả tiền và cảm ơn cô bán hàng.', 'done'),
            ('17:10', 'Về đến nhà, bàn giao cho bà nội', 'Báo lại phụ huynh qua tin nhắn kèm ảnh.', 'done'),
        ],
    },
    {
        'mood': ('sad', 'Cần động viên', 'Bé mệt sau giờ thể dục, đã chăm sóc và báo phụ huynh.'),
        'note': ('Bé mệt nhẹ sau giờ thể dục nên về chậm hơn 10 phút. Đã cho bé nghỉ uống nước '
                 'giữa đường và báo phụ huynh ngay qua tin nhắn.'),
        'activities': [
            ('16:30', 'Đón bé tan học', 'Giáo viên báo bé vừa hết giờ thể dục, hơi mệt.', 'done'),
            ('16:40', 'Cho bé nghỉ uống nước 15 phút', 'Bé hết mệt, nói chuyện vui trở lại.', 'done'),
            ('17:15', 'Đưa bé về nhà', 'Về chậm hơn dự kiến, đã báo trước phụ huynh.', 'done'),
            ('17:35', 'Bàn giao và dặn dò', 'Dặn phụ huynh cho bé nghỉ sớm tối nay.', 'done'),
        ],
    },
]

# Phần trăm hoàn thành cho task đang diễn ra (chọn theo task.id)
IN_PROGRESS_PERCENTS = (45, 60, 75)

# Bố cục task demo cho PHASE B (theo mã danh mục)
DEMO_TASK_TEMPLATES = {
    'gia-su': {
        'title': '[DEMO] Gia sư Toán lớp 5 — buổi học mẫu có nhật ký chăm sóc',
        'description': ('Task demo tự sinh bởi seed_care_diary_sample để mỗi tài khoản đều xem được '
                        'nhật ký mẫu. Bé lớp 5 cần chữa bài tập toán cuối tuần, ưu tiên gia sư kiên nhẫn.'),
        'price': 250000,
    },
    'trong-tre': {
        'title': '[DEMO] Trông bé 5 tuổi buổi chiều — ca mẫu có nhật ký chăm sóc',
        'description': ('Task demo tự sinh bởi seed_care_diary_sample để mỗi tài khoản đều xem được '
                        'nhật ký mẫu. Trông bé 14h-18h: ăn xế, tô màu, dỗ ngủ trưa.'),
        'price': 220000,
    },
}
DEMO_TASK_FALLBACK = {
    'title': '[DEMO] Đón bé tan học — ca mẫu có nhật ký chăm sóc',
    'description': ('Task demo tự sinh bởi seed_care_diary_sample để mỗi tài khoản đều xem được '
                    'nhật ký mẫu. Đón bé tại cổng trường và đưa về nhà an toàn.'),
    'price': 120000,
}

DEMO_LOCATION = 'Tp. Huế (task demo — địa điểm mẫu)'
DEMO_LAT, DEMO_LNG = 16.4602, 107.6008


class Command(BaseCommand):
    help = ('Seed dữ liệu mẫu Care Diary phủ TẤT CẢ tài khoản hiện có '
            '(idempotent — chỉ thêm entry còn thiếu, không xoá dữ liệu cũ).')

    # ------------------------------------------------------------------
    def _log(self, msg):
        try:
            self.stdout.write(msg)
        except Exception:
            self.stdout.write(msg.encode('ascii', errors='replace').decode('ascii'))

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Chỉ thống kê, không ghi dữ liệu.')

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        now = timezone.now()
        stats = {'a_created': 0, 'a_skipped': 0, 'b_created': 0, 'errors': 0}

        self._log('\n[CareDiary Seed] PHASE A — phủ nhật ký cho mọi task hợp lệ...')
        self._phase_a(stats)

        self._log('\n[CareDiary Seed] PHASE B — phủ nhật ký cho mọi tài khoản còn thiếu...')
        self._phase_b(stats, now)

        summary = self._summary(stats)
        self._log(summary)

    # ══════════════════════════════════════════════════════════════════
    # PHASE A — mọi task in_progress/completed có accepted worker
    # ══════════════════════════════════════════════════════════════════
    def _phase_a(self, stats):
        tasks = Task.objects.filter(status__in=ELIGIBLE_STATUSES)
        accepted_workers = {
            app.task_id: app.worker
            for app in TaskApplication.objects.filter(
                status='accepted', task__in=tasks).select_related('worker')
        }
        existing_task_ids = set(
            CareDiaryEntry.objects.filter(task__in=tasks).values_list('task_id', flat=True))

        for task in tasks:
            if task.id in existing_task_ids:
                stats['a_skipped'] += 1
                continue
            worker = accepted_workers.get(task.id)
            if worker is None:
                # Task hợp lệ nhưng chưa có CarePartner accepted → không thể
                # có nhật ký (đúng luật kinh doanh), bỏ qua im lặng.
                continue
            if self._create_entry(task, worker, stats):
                stats['a_created'] += 1
                self._log('   + Task #{} "{}" → entry cho {}'.format(
                    task.id, task.title[:60], worker.username))

    # ══════════════════════════════════════════════════════════════════
    # PHASE B — mọi tài khoản active phải có ≥1 nhật ký xem được
    # ══════════════════════════════════════════════════════════════════
    def _phase_b(self, stats, now):
        covered_parent_ids = set(
            CareDiaryEntry.objects.values_list('task__parent_id', flat=True))
        covered_worker_ids = set(
            CareDiaryEntry.objects.values_list('worker_id', flat=True))

        parents = list(
            User.objects.filter(role='parent', is_active=True).order_by('id'))
        workers = list(
            User.objects.filter(role='worker', is_active=True).order_by('id'))
        if not parents or not workers:
            self._log('   ! Thiếu phụ huynh hoặc carepartner trong DB — bỏ qua Phase B.')
            return

        uncovered_parents = [u for u in parents if u.id not in covered_parent_ids]
        uncovered_workers = [u for u in workers if u.id not in covered_worker_ids]
        self._log('   i Cần phủ thêm: {} phụ huynh, {} carepartner'.format(
            len(uncovered_parents), len(uncovered_workers)))

        worker_queue = list(uncovered_workers)  # ưu tiên ghép cặp đôi còn thiếu
        categories = self._ordered_categories()

        # 1) Ghép phụ huynh chưa phủ với carepartner chưa phủ (nếu còn)
        for idx, parent in enumerate(uncovered_parents):
            if worker_queue:
                worker = worker_queue.pop(0)
            else:
                worker = self._least_loaded_worker(workers)
            self._create_demo_task(parent, worker, categories, idx, stats, now)

        # 2) Carepartner chưa phủ còn lại → task demo của phụ huynh ít việc nhất
        for idx, worker in enumerate(worker_queue):
            parent = self._least_loaded_parent(parents)
            self._create_demo_task(parent, worker, categories, idx, stats, now)

    # ------------------------------------------------------------------
    def _ordered_categories(self):
        """Danh mục ưu tiên cho task demo: xen kẽ Gia sư / Trông trẻ."""
        codes = ['gia-su', 'trong-tre']
        found = [ServiceCategory.objects.filter(code=c).first() for c in codes]
        pairs = [c for c in found if c is not None]
        return pairs or list(ServiceCategory.objects.all()[:2])

    def _least_loaded_worker(self, workers):
        """Carepartner ít nhật ký nhất, ưu tiên đã xác minh — nếu hoà chọn id nhỏ."""
        def key(u):
            return (CareDiaryEntry.objects.filter(worker=u).count(),
                    0 if u.is_verified else 1, u.id)
        return sorted(workers, key=key)[0]

    def _least_loaded_parent(self, parents):
        """Phụ huynh đang giữ ít task demo nhất — tránh dồn dữ liệu vào 1 người."""
        def key(u):
            return (Task.objects.filter(parent=u, title__startswith=DEMO_TITLE_PREFIX).count(), u.id)
        return sorted(parents, key=key)[0]

    # ------------------------------------------------------------------
    def _create_demo_task(self, parent, worker, categories, idx, stats, now):
        """Tạo 1 task [DEMO] + application accepted + nhật ký, trong 1 transaction."""

        def _failed(reason):
            stats['errors'] += 1
            self._log('   ! Bỏ qua phủ dữ liệu cho parent={}/worker={}: {}'.format(
                getattr(parent, 'username', '?'), getattr(worker, 'username', '?'), reason))

        if worker is None:
            return _failed('không còn carepartner active để giao việc')

        template = DEMO_TASK_FALLBACK
        category = categories[idx % len(categories)] if categories else None
        if category is not None and category.code in DEMO_TASK_TEMPLATES:
            template = DEMO_TASK_TEMPLATES[category.code]

        scheduled = now - timedelta(days=2 + (idx % 4))
        try:
            with transaction.atomic():
                task = Task.objects.create(
                    title=template['title'],
                    description=template['description'],
                    price=template['price'],
                    category=category,
                    parent=parent,
                    location=DEMO_LOCATION,
                    latitude=DEMO_LAT,
                    longitude=DEMO_LNG,
                    status='completed',
                    scheduled_time=scheduled,
                )
                TaskApplication.objects.create(
                    task=task, worker=worker, status='accepted')
                if not self._create_entry(task, worker, stats):
                    raise ValueError('không sinh được entry nhật ký')
        except Exception as exc:  # noqa: BLE001 — seed không được làm chết deploy
            return _failed(str(exc))
        stats['b_created'] += 1
        self._log('   + Task [DEMO] #{} cho parent={} × worker={}'.format(
            task.id, parent.username, worker.username))

    # ══════════════════════════════════════════════════════════════════
    # SINH NỘI DUNG NHẬT KÝ THEO DANH MỤC TASK
    # ══════════════════════════════════════════════════════════════════
    def _build_assessment(self, task):
        """Chọn loại + nội dung form theo mã danh mục, validate bằng service thật.

        Returns:
            (assessment_type, assessment_data, variant) hoặc (None, None, None)
            nếu dữ liệu mẫu không qua validate (schema đổi — sẽ log warning).
        """
        code = task.category.code if task.category else ''
        if code == 'gia-su':
            variant = TUTORING_VARIANTS[task.id % len(TUTORING_VARIANTS)]
            atype, adata = 'tutoring', variant['data']
        elif code == 'trong-tre':
            variant = CHILDCARE_VARIANTS[task.id % len(CHILDCARE_VARIANTS)]
            atype, adata = 'childcare', variant['data']
        else:
            variant = GENERAL_VARIANTS[task.id % len(GENERAL_VARIANTS)]
            atype, adata = 'general', {}
        # Đi qua đúng validator của API — dữ liệu mẫu phải "hợp lệ như data thật".
        clean_type, clean_data = validate_assessment_data(task, atype, adata)
        return clean_type, clean_data, variant

    def _create_entry(self, task, worker, stats):
        """Sinh 1 entry + timeline hoạt động cho task. Trả True nếu tạo mới."""

        def _failed(reason):
            stats['errors'] += 1
            self._log('   ! Không tạo được entry cho task #{}: {}'.format(task.id, reason))

        if CareDiaryEntry.objects.filter(task=task).exists():
            return False
        try:
            atype, adata, variant = self._build_assessment(task)
        except Exception as exc:  # noqa: BLE001 — schema drift → cảnh báo rõ ràng
            _failed('assessment không qua validate: {}'.format(exc))
            return False

        mood_icon, mood_label, mood_note = variant['mood']
        if task.status == 'completed':
            percent = 100
        else:
            percent = IN_PROGRESS_PERCENTS[task.id % len(IN_PROGRESS_PERCENTS)]
        # Task đang diễn ra: hoạt động cuối còn "đang làm" — chân thực hơn
        activities = list(variant['activities'])
        if task.status == 'in_progress' and activities:
            time_, title_, desc_, _ = activities[-1]
            activities[-1] = (time_, title_, desc_, 'partial')

        try:
            with transaction.atomic():
                entry = CareDiaryEntry.objects.create(
                    task=task, worker=worker,
                    assessment_type=atype, assessment_data=adata,
                    mood_icon=mood_icon, mood_label=mood_label,
                    mood_note=mood_note, completion_percent=percent,
                    note=variant['note'],
                )
                for order, (time_, title_, desc_, status_) in enumerate(activities):
                    CareDiaryActivity.objects.create(
                        entry=entry, time=time_, title=title_,
                        description=desc_, status=status_, order=order,
                    )
        except Exception as exc:  # noqa: BLE001
            _failed(str(exc))
            return False
        return True

    # ------------------------------------------------------------------
    def _summary(self, stats):
        entries = CareDiaryEntry.objects.count()
        activities = CareDiaryActivity.objects.count()
        parents_total = User.objects.filter(role='parent', is_active=True).count()
        workers_total = User.objects.filter(role='worker', is_active=True).count()
        parents_covered = User.objects.filter(
            role='parent', is_active=True,
            posted_tasks__care_diary__isnull=False).distinct().count()
        workers_covered = User.objects.filter(
            role='worker', is_active=True,
            care_diary_entries__isnull=False).distinct().count()
        return (
            '\n[CareDiary Seed] HOÀN TẤT — Phase A: +{} entry (bỏ qua {} đã có) | '
            'Phase B: +{} task [DEMO] | Lỗi: {}\n'
            '[CareDiary Seed] Tổng hệ thống: {} nhật ký / {} hoạt động | '
            'Phủ phụ huynh: {}/{} | Phủ carepartner: {}/{}'.format(
                stats['a_created'], stats['a_skipped'], stats['b_created'],
                stats['errors'], entries, activities,
                parents_covered, parents_total, workers_covered, workers_total))
