"""
matching/services/matching_service.py — Matching Engine 7-factor (Step 2 + 11.6).

Hard filters (Step 2.2.1) — loại TRƯỚC khi chấm:
  1. Tài khoản active + approved
  2. Band không blocked + không paused + không suspended (EloService.is_matchable)
  3. Lịch rảnh cover ĐỦ MỌI slot (available_slots → covers_all_slots)
  4. Chưa có booking trùng / lock trùng (nằm trong available_slots)
  5. Trong bán kính (profile.max_radius_km hoặc config DEFAULT_MAX_RADIUS_KM)
  6. restricted chỉ khi pool < 8 (EloService.is_allowed_in_pool)

Soft scoring (Step 11.6 — trọng số từ DB MatchingWeight):
  availability 25 | skills 20 | distance 15 | rating 15 | completion 10 |
  elo 10 | response 5.  Final = Σ(w×sub)/100 × band_multiplier, làm tròn int.
  match_level (đặc tả Mục 5): >=90 very_high | 75-89 high | 60-74 medium | <60 low.
  Nhãn PHẢN ÁNH ĐÚNG ĐIỂM SỐ — không còn ghi đè low→medium khi pool đầy.
"""

import datetime
import logging
import math
import sys
import unicodedata

from django.conf import settings
from django.db import models as db_models
from django.utils import timezone

from ..config import get_config, get_int
from ..constants import MATCH_LEVEL_LABELS_VI
from ..models import (
    CandidateProposal,
    CarePartnerProfile,
    MatchingWeight,
)
from .elo_service import EloService
from .lock_service import AvailabilityPrefetch

logger = logging.getLogger('educarelink.matching.engine')

MAX_CANDIDATES_DEFAULT = 8


class FlexibleCoords(tuple):
    """Tuple hỗ trợ cả unpack 2 phần tử (lat, lng) và 3 phần tử (lat, lng, from_gps)."""
    def __new__(cls, lat, lng, from_gps=False):
        obj = super().__new__(cls, (lat, lng, from_gps))
        obj.lat = lat
        obj.lng = lng
        obj.from_gps = from_gps
        return obj

    def __iter__(self):
        try:
            frame = sys._getframe(1)
            import dis
            instrs = list(dis.get_instructions(frame.f_code))
            curr = next(i for i in instrs if i.offset == frame.f_lasti)
            if curr.opname == 'UNPACK_SEQUENCE' and curr.argval == 2:
                return iter((self.lat, self.lng))
        except Exception:
            pass
        return super().__iter__()


def get_effective_coordinates(user):
    """Vị trí HIỆU LỰC của CarePartner cho ghép cặp (Defect 4 — 2026-09-13).

    Ưu tiên GPS real-time (User.current_latitude/longitude) nếu còn 'tươi'
    (< settings.GPS_FRESHNESS_HOURS, mặc định 48h); quá hạn hoặc chưa từng
    sync → fallback vị trí đăng ký tĩnh (User.latitude/longitude).

    Trả về FlexibleCoords (lat, lng, from_gps: bool) hỗ trợ unpack linh hoạt cả 2 và 3 biến.
    """
    if user is None:
        return FlexibleCoords(None, None, False)
    freshness_hours = float(getattr(settings, 'GPS_FRESHNESS_HOURS', 48))
    cur_lat = getattr(user, 'current_latitude', None)
    cur_lng = getattr(user, 'current_longitude', None)
    last_gps = getattr(user, 'last_gps_updated_at', None)
    if (cur_lat is not None and cur_lng is not None and last_gps is not None):
        cutoff = timezone.now() - datetime.timedelta(hours=freshness_hours)
        if last_gps >= cutoff:
            return FlexibleCoords(cur_lat, cur_lng, True)
    return FlexibleCoords(getattr(user, 'latitude', None), getattr(user, 'longitude', None), False)


def get_active_weights():
    """{factor: pct} từ DB — Step 11.6, KHÔNG hardcode."""
    weights = {w.factor: w.weight_pct for w in MatchingWeight.objects.filter(is_active=True)}
    if not weights:
        logger.error('[Matching] Chưa seed MatchingWeight — matching sẽ sai!')
    return weights


def haversine_km(lat1, lng1, lat2, lng2):
    """Khoảng cách lớn-đường tròn (km)."""
    if None in (lat1, lng1, lat2, lng2):
        return None
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalize_vi(text):
    """Chuẩn hóa tiếng Việt: bỏ dấu, chuyển đ/Đ -> d, lowercase."""
    if not text:
        return ''
    t = str(text).lower().replace('đ', 'd').replace('Đ', 'd')
    t = unicodedata.normalize('NFD', t)
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return unicodedata.normalize('NFC', t).strip()


def _major_match_bonus(major, job_type, required_skills=None, child_grade_level=None):
    """Chuyên ngành khớp loại job và yêu cầu kỹ năng cụ thể (Step 11.6 skills).

    child_grade_level (Defect 3): khối lớp phụ huynh chọn (type_data.child_grade_level).
    None/'' = không giới hạn cấp học — giữ nguyên hành vi cũ, không raise KeyError
    với dữ liệu job cũ thiếu field trong type_data.
    """
    if not major:
        return 0
    major_l = major.lower()
    major_norm = _normalize_vi(major)
    req_set = set(required_skills or [])

    def matches_kw(keywords):
        for kw in keywords:
            kw_l = kw.lower()
            if kw_l in major_l:
                return True
            kw_norm = _normalize_vi(kw)
            if kw_norm and kw_norm in major_norm:
                return True
        return False

    # 1. Các nhóm môn / kỹ năng đặc thù cao (âm nhạc, CNTT, mỹ thuật, ngoại ngữ...)
    music_skills = {'dan_piano', 'piano', 'organ', 'guitar', 'am_nhac', 'thanh_nhac'}
    music_kw = ['âm nhạc', 'am nhac', 'piano', 'organ', 'guitar', 'nhạc', 'nhac', 'nghệ thuật', 'nghe thuat', 'thanh nhạc']

    it_skills = {'lap_trinh', 'tin_hoc', 'python', 'scratch', 'cntt', 'tin_hoc_cong_nghe'}
    it_kw = ['công nghệ thông tin', 'tin học', 'khoa học máy tính', 'it', 'cntt', 'phần mềm', 'công nghệ']

    art_skills = {'ve', 'my_thuat', 'hoi_hoa'}
    art_kw = ['mỹ thuật', 'my thuat', 'hội họa', 'hoi hoa', 'thiết kế', 'đồ họa']

    # Ngoại ngữ cụ thể
    # ⚠️ Defect 1 (2026-09-13): 'tieng_viet' (Tiếng Việt — môn Văn tiểu học) KHÔNG
    # phải ngoại ngữ. Trước đây 'tieng_' in s bắt cả 'tieng_viet' vào nhánh ngoại
    # ngữ nhưng lang_matches không có keyword cho nó → hàm luôn trả 0 dù major
    # "Sư phạm Ngữ Văn" khớp hoàn hảo → hard-gating loại oan gia sư Văn.
    # Các biến thể có dấu/không dấu đã test (bắt buộc liệt kê — tránh bug âm thầm
    # chuẩn hóa tiếng Việt như case font Manrope_800extraBold):
    #   ngữ văn | ngu van | văn học | van hoc | sư phạm văn | su pham van |
    #   văn chương | van chuong | tiếng việt | tieng viet | tiểu học | tieu hoc |
    #   giáo dục tiểu học | giao duc tieu hoc
    if any('tieng_' in s or s in ('ielts', 'toeic', 'ngoai_ngu') for s in req_set):
        lang_matches = []
        if 'tieng_viet' in req_set:
            lang_matches.extend([
                'tiếng việt', 'tieng viet', 'ngữ văn', 'ngu van', 'văn học', 'van hoc',
                'sư phạm văn', 'su pham van', 'văn chương', 'van chuong',
                'sư phạm', 'su pham', 'giáo dục tiểu học', 'giao duc tieu hoc', 'tiểu học', 'tieu hoc',
            ])
        if any(s in ('tieng_anh', 'ielts', 'toeic') for s in req_set):
            lang_matches.extend(['tiếng anh', 'tieng anh', 'english', 'sư phạm anh', 'su pham anh', 'ngôn ngữ anh', 'ngon ngu anh'])
        if 'tieng_trung' in req_set:
            lang_matches.extend(['tiếng trung', 'tieng trung', 'trung quốc', 'hán ngữ', 'han ngu', 'sư phạm tiếng trung'])
        if 'tieng_nhat' in req_set:
            lang_matches.extend(['tiếng nhật', 'tieng nhat', 'nhật bản', 'nhat ban', 'sư phạm tiếng nhật'])
        if 'tieng_han' in req_set:
            lang_matches.extend(['tiếng hàn', 'tieng han', 'hàn quốc', 'sư phạm tiếng hàn'])
        if 'tieng_phap' in req_set:
            lang_matches.extend(['tiếng pháp', 'tieng phap', 'pháp', 'sư phạm tiếng pháp'])
        if 'tieng_nga' in req_set or 'tieng_a_rap_co' in req_set:
            lang_matches.extend(['tiếng nga', 'tiếng ả rập', 'a rap'])
        if lang_matches and matches_kw(lang_matches):
            return 1

    if req_set & music_skills and matches_kw(music_kw):
        return 1

    if req_set & it_skills and matches_kw(it_kw):
        return 1

    if req_set & art_skills and matches_kw(art_kw):
        return 1

    # 2. Giáo dục tiểu học / Tier 1 (Cấp 1):
    primary_edu_kw = ['tiểu học', 'tieu hoc', 'giáo dục tiểu học', 'giao duc tieu hoc', 'sư phạm tiểu học', 'su pham tieu hoc', 'gd tiểu học', 'gd tieu hoc', 'primary education']
    tier1_skills = {
        'tieu_hoc', 'tieng_viet', 'toan', 'tu_nhien_xa_hoi', 'luyen_chu_dep',
        'am_nhac', 'van', 'ngu_van', 'tin_hoc_cong_nghe', 'tin_hoc', 'cong_nghe', 'my_thuat', 've'
    }
    if job_type == 'tutoring' and matches_kw(primary_edu_kw):
        if not req_set or (req_set & tier1_skills):
            return 1

    # 3. Môn học phổ thông cụ thể (Toán, Văn, Lý, Hóa, Sinh, Sử, Địa...)
    subject_kw_map = {
        'toan': ['toán', 'toan', 'math', 'toán học', 'toan hoc', 'sư phạm toán', 'su pham toan'],
        'van': ['ngữ văn', 'ngu van', 'văn học', 'van hoc', 'sư phạm văn', 'su pham van', 'sư phạm ngữ văn', 'su pham ngu van', 'văn', 'van'],
        'ngu_van': ['ngữ văn', 'ngu van', 'văn học', 'van hoc', 'sư phạm văn', 'su pham van', 'sư phạm ngữ văn', 'su pham ngu van', 'văn', 'van'],
        'tieng_viet': ['tiếng việt', 'tieng viet', 'tiểu học', 'tieu hoc', 'ngữ văn', 'ngu van', 'văn học', 'van hoc', 'sư phạm văn', 'sư phạm ngữ văn', 'giáo dục tiểu học', 'giao duc tieu hoc'],
        'ly': ['vật lý', 'vat ly', 'vật lí', 'vat li', 'sư phạm lý', 'su pham ly', 'sư phạm vật lý', 'su pham vat ly'],
        'hoa': ['hóa học', 'hoa hoc', 'sư phạm hóa', 'su pham hoa', 'hóa', 'hoa'],
        'sinh': ['sinh học', 'sinh hoc', 'sư phạm sinh', 'su pham sinh', 'sinh', 'sinh'],
        'lich_su': ['lịch sử', 'lich su', 'sư phạm sử', 'su pham su', 'sư phạm lịch sử', 'su pham lich su', 'sử', 'su'],
        'dia_ly': ['địa lý', 'dia ly', 'địa lí', 'dia li', 'sư phạm địa', 'su pham dia', 'sư phạm địa lý', 'su pham dia ly'],
        'lich_su_dia_ly': ['lịch sử', 'lich su', 'địa lý', 'dia ly', 'địa lí', 'dia li', 'sử', 'su', 'sư phạm sử', 'sư phạm địa'],
        'khoa_hoc_tu_nhien': ['khoa học tự nhiên', 'khoa hoc tu nhien', 'khtn', 'vật lý', 'vat ly', 'hóa học', 'hoa hoc', 'sinh học', 'sinh hoc'],
        'tin_hoc': ['tin học', 'tin hoc', 'công nghệ thông tin', 'khoa học máy tính', 'it', 'cntt'],
        'tin_hoc_cong_nghe': ['tin học', 'tin hoc', 'công nghệ thông tin', 'công nghệ'],
        'cong_nghe': ['công nghệ', 'cong nghe', 'kỹ thuật', 'ky thuat'],
        'giao_duc_cong_dan': ['giáo dục công dân', 'giao duc cong dan', 'chính trị', 'luật', 'triết học'],
        'giao_duc_kinh_te_phap_luat': ['kinh tế', 'pháp luật', 'luật', 'giáo dục công dân'],
        'tu_nhien_xa_hoi': ['tiểu học', 'tieu hoc', 'giáo dục tiểu học', 'sinh học', 'địa lý', 'khoa học'],
        'am_nhac': ['âm nhạc', 'am nhac', 'nhạc', 'nhac', 'thanh nhạc', 'thanh nhac', 'piano', 'organ'],
    }

    if job_type == 'tutoring':
        for s in req_set:
            if s in subject_kw_map and matches_kw(subject_kw_map[s]):
                return 1

    # 4. Sư phạm / giáo dục chung & Chăm sóc
    education_kw = ['sư phạm', 'su pham', 'giáo dục', 'giao duc', 'pedagog', 'tiểu học', 'tieu hoc', 'gd tiểu học', 'gd tieu hoc', 'primary education']
    care_kw = ['sơ cấp', 'so cap', 'chăm sóc', 'cham soc', 'nhi', 'điều dưỡng', 'dieu duong', 'y tế', 'mầm non', 'mam non']

    all_tutoring_skills = set(subject_kw_map.keys()) | tier1_skills | {
        'on_tap', 'kem_hoc', 'luyen_thi', 'cap_1', 'cap_2', 'cap_3'
    }

    if job_type == 'tutoring':
        # Chuyên ngành trực tiếp môn học (Vật lý, Hóa học, Sinh học, Toán học, Ngữ văn...)
        subject_kw_map = {
            'toan': ['toán', 'toan', 'math'],
            # Defect 1: bổ sung biến thể "sư phạm văn" / "văn chương" (có dấu + không dấu)
            'van': ['ngữ văn', 'ngu van', 'văn học', 'van hoc', 'sư phạm văn', 'su pham van',
                    'văn chương', 'van chuong', 'tiếng việt', 'tieng viet'],
            'ngu_van': ['ngữ văn', 'ngu van', 'văn học', 'van hoc', 'sư phạm văn', 'su pham van',
                        'văn chương', 'van chuong', 'tiếng việt', 'tieng viet'],
            'tieng_viet': ['tiếng việt', 'tieng viet', 'ngữ văn', 'ngu van', 'văn học', 'van hoc',
                           'sư phạm văn', 'su pham van', 'tiểu học', 'tieu hoc'],
            'ly': ['vật lý', 'vat ly', 'vật lí', 'vat li'],
            'hoa': ['hóa học', 'hoa hoc'],
            'sinh': ['sinh học', 'sinh hoc'],
        }

        # ── Defect 3 (2026-09-13): bonus/verify theo khối lớp phụ huynh đã chọn ──
        # child_grade_level RỖNG hoặc KHÔNG TỒN TẠI (dữ liệu job cũ tạo trước khi
        # có field này trong type_data) → coi như "không giới hạn cấp học":
        # bỏ qua bonus/filter theo cấp học, KHÔNG raise KeyError — chạy đúng
        # logic cũ bên dưới.
        grade_l = str(child_grade_level or '').strip().lower()
        if grade_l in ('secondary_grade_6_9', 'high_school_grade_10_12'):
            # THCS / THPT: chuyên ngành phải khớp ĐÚNG môn học cụ thể —
            # không nhận "sư phạm chung". Nếu job không khai báo kỹ năng/môn
            # nào (req_set rỗng) thì giữ education_kw để không chặn oan.
            if not req_set:
                return 1 if matches_kw(education_kw) else 0
            for s in (req_set & set(subject_kw_map.keys())):
                if matches_kw(subject_kw_map[s]):
                    return 1
            return 0
        if grade_l == 'preschool_prep':
            # Tiền tiểu học (4-6 tuổi): sư phạm / giáo dục / mầm non đều được cộng điểm
            if not req_set or (req_set & tier1_skills):
                return 1 if (matches_kw(education_kw) or matches_kw(care_kw)) else 0
            return 0

        if not req_set or (req_set & all_tutoring_skills):
            if matches_kw(education_kw):
                return 1
            for s in (req_set & set(subject_kw_map.keys())):
                if matches_kw(subject_kw_map[s]):
                    return 1
            return 0
        return 0

    if job_type == 'childcare' and (matches_kw(education_kw) or matches_kw(care_kw)):
        return 1

    if job_type == 'pickup' and matches_kw(care_kw):
        return 1

    return 0


def _jaccard(set_a, set_b):
    a, b = set(set_a or []), set(set_b or [])
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ─────────────────────────────────────────────────────────────────
# Sub-scores (Step 11.6) — hàm thuần, dễ test
# ─────────────────────────────────────────────────────────────────
def subscore_availability(covered, required):
    if required == 0:
        return 100.0
    return covered / required * 100.0


def subscore_skills(required_skills, cp_skills, major, job_type, child_grade_level=None, use_match_ratio=False):
    major_bonus = _major_match_bonus(major, job_type, required_skills, child_grade_level)
    if not required_skills:
        return 100.0 if major_bonus else 60.0
    if use_match_ratio:
        matched = [s for s in (cp_skills or []) if s in required_skills]
        ratio = len(matched) / len(required_skills)
        return 60.0 * ratio + 40.0 * major_bonus
    j = _jaccard(required_skills, cp_skills)
    return 60.0 * j + 40.0 * major_bonus


def subscore_distance(km, max_radius_km, has_vehicle=False):
    """Task B/E (2026-09-14): km None → 50 điểm TRUNG TÍNH (không còn 100 —
    tránh người thiếu tọa độ thắng người có GPS gần job). Không có tọa độ
    (chưa cấp GPS + không khai địa chỉ) là trạng thái thiếu dữ liệu, không
    phải ưu tiên tuyệt đối."""
    if km is None:
        return 50.0
    effective = km * (0.75 if has_vehicle else 1.0)
    if max_radius_km <= 0:
        return 0.0
    return max(0.0, 100.0 - (effective / max_radius_km) * 100.0)


def subscore_rating(rating_avg, review_count):
    """Điểm đánh giá sao (đặc tả Mục 4):
    - Người mới chưa có review (review_count == 0): điểm trung tính 60.0/100.
    - 1-2 review: blend 0.6×điểm thực + 0.4×60 để chuyển mượt.
    - Từ 3 review: 100% theo điểm thực tế.
    """
    if not review_count or review_count == 0:
        return 60.0
    base = (rating_avg or 0) / 5.0 * 100.0
    if review_count < 3:
        return base * 0.6 + 60.0 * 0.4  # blend cho 1-2 review đầu
    return base


def subscore_completion(completed, cancelled, no_show):
    """Tỷ lệ hoàn thành đơn (đặc tả Mục 4): người mới chưa có đơn nào được
    tính mặc định 100% để không bị bất lợi khi tìm việc đầu tiên."""
    total = completed + cancelled + no_show
    if total == 0:
        return 100.0  # người mới chưa có đơn: mặc định 100% theo đặc tả
    return completed / total * 100.0


def subscore_elo(effective_elo):
    raw = (effective_elo - 650) / 800.0 * 100.0
    return max(0.0, min(120.0, raw))


def subscore_response(within_sla, total):
    if total == 0:
        return 60.0  # newcomer mặc định (Step 11.6)
    return within_sla / total * 100.0


def match_level_of(score, pool_size=0):
    """Ngưỡng nhãn mức độ phù hợp theo đặc tả Mục 5 (pool_size giữ lại cho
    backward-compat với chữ ký cũ nhưng KHÔNG còn dùng để ghi đè nhãn)."""
    if score >= 90:
        return 'very_high'
    if score >= 75:
        return 'high'
    if score >= 60:
        return 'medium'
    return 'low'


# ─────────────────────────────────────────────────────────────────
# Engine chính
# ─────────────────────────────────────────────────────────────────
def find_candidates(job, required_slots=None, top_n=None, exclude_carepartners=None):
    """Chạy matching cho 1 JobPost.

    Trả dict theo API contract Step 2.4:
    {total_matched, candidates: [... max 8 ...]}
    Ghi CandidateProposal cho từng CP được đề xuất (throttle theo band).
    """
    top_n = top_n or get_int('MAX_CANDIDATES', MAX_CANDIDATES_DEFAULT)
    weights = get_active_weights()
    parsed = getattr(job, 'ai_parse_result', None) or {}
    required_skills = list(parsed.get('required_skills') or [])
    type_data = getattr(job, 'type_data', None) or {}
    # Defect 3: khối lớp phụ huynh chọn (job cũ thiếu field → None = không giới hạn)
    child_grade_level = type_data.get('child_grade_level') or None
    sc = type_data.get('subject_code')
    if sc:
        if isinstance(sc, list):
            for c in sc:
                c_str = str(c).strip()
                if c_str and c_str not in required_skills:
                    required_skills.append(c_str)
        elif isinstance(sc, str):
            for c in [s.strip() for s in sc.split(',') if s.strip()]:
                if c and c not in required_skills:
                    required_skills.append(c)

    # ── Hard filter #5: giới tính (flow1-step2-matching-engine.md dòng 57) ──
    # Bất biến Step 11.4: tutoring KHÔNG BAO GIỜ lọc theo giới tính. Bất biến này
    # được ép ở 2 lớp upstream — matching/api/jobs.py (null gender_preference trước
    # khi lưu JobPost khi job_type == 'tutoring') và gemini_service.py (null sau khi
    # parse). Dòng dưới đây là lớp phòng thủ thứ 3 NGAY TẠI NƠI TIÊU DÙNG: kể cả
    # gender_preference "lọt" vào job tutoring (ghi thẳng DB, import cũ...) thì vẫn
    # vô hiệu hóa ở đây, không bao giờ dùng để loại ứng viên gia sư.
    gender_preference = '' if getattr(job, 'job_type', '') == 'tutoring' else (getattr(job, 'gender_preference', '') or '')

    # Required slots từ JobSlot
    if required_slots is None:
        required_slots = [(s.date, s.time_from, s.time_to) for s in job.slots.all()]

    default_radius = get_int('DEFAULT_MAX_RADIUS_KM', 20)
    exclude = set(exclude_carepartners or [])
    candidates = []
    pool_qualified = 0

    profiles = (CarePartnerProfile.objects
                .select_related('user', 'band')
                .filter(user__role='worker',
                        user__is_active=True,
                        user__is_approved=True)
                .exclude(user__username__startswith='g13_')
                .exclude(user__username__startswith='test_'))

    # ══ DSA (2026-09-18): CHỐT DẬT N+1 QUERY — nguyên nhân API 30s+ timeout ══
    # Trước đây mỗi CP trong pool gây 4+ round-trips (availability, blackout,
    # booking, lock) × từng ngày slot + thêm 2 query proposal + 1 query review
    # → 60-80+ queries mạng tới Neon PG (100-300ms/lần) → 30-45s → Gunicorn
    # WORKER TIMEOUT trả HTML 500 → Web /ung-vien/ màn hình trắng.
    # Giờ: prefetch ĐÚNG 1 LẦN cho cả pool (5 query cố định, không phụ thuộc
    # số CP), ghép nối trong Python bằng dict/set tra cứu O(1):
    profiles = list(profiles)
    all_profile_ids = [p.user_id for p in profiles]
    required_dates = list({s[0] for s in required_slots})
    avail_pf = AvailabilityPrefetch(all_profile_ids, required_dates, exclude_job=job)

    # DSA: 1 query đếm đề xuất HÔM NAY của cả pool (thay can_receive_proposal
    # 2 query/CP: get_or_create profile + count CandidateProposal)
    day_start = timezone.make_aware(
        datetime.datetime.combine(timezone.localdate(), datetime.time.min))
    from ..models import CandidateProposal as _CP
    proposal_counts = {
        row['carepartner_id']: row['cnt']
        for row in (_CP.objects.filter(carepartner_id__in=all_profile_ids,
                                       proposed_at__gte=day_start)
                    .values('carepartner_id').annotate(cnt=db_models.Count('id')))
    }

    # DSA: 1 query review mới nhất của cả pool (thay _latest_review_text
    # 1 query/CP) — sort reviewee_id + -created_at, giữ review đầu tiên/CP
    from core.models import Review as _Review
    latest_review_map = {}
    for rev in (_Review.objects.filter(reviewee_id__in=all_profile_ids)
                .only('reviewee_id', 'comment', 'created_at')
                .order_by('reviewee_id', '-created_at')):
        if rev.reviewee_id not in latest_review_map:
            latest_review_map[rev.reviewee_id] = (rev.comment or '')[:120]

    for profile in profiles:
        user = profile.user
        if user.pk in exclude:
            continue
        # ── Hard filters ──
        if not EloService.is_matchable(profile):
            continue
        # Task A (2026-09-14): soft lock giữ cho CHÍNH job này không chặn
        # CP xuất hiện lại khi parent xem lại danh sách (chỉ soft lock của
        # job KHÁC mới làm CP bận trong cửa sổ 5 phút).
        # DSA: tra cứu từ prefetch (O(1) dict) thay vì covers_all_slots
        # query 4+ round-trips/CP/ngày.
        ok_cover, _missing = avail_pf.covers_all_slots_for(user.pk, required_slots)
        if not ok_cover:
            continue
        # ── Defect 4: dùng vị trí HIỆU LỰC (GPS real-time nếu còn tươi) ──
        # Task B (2026-09-14): BỎ drift-exclude toàn pool (MAX_GPS_DRIFT_KM).
        # SV Huế đang ở Hà Nội (GPS tươi) phải nhận được việc Hà Nội — GPS
        # hiện tại mới là vị trí thật; drift so với địa chỉ đăng ký KHÔNG
        # còn là lý do loại cả pool. Khoảng cách chỉ là MỘT tiêu chí 15%.
        eff_lat, eff_lng, _from_gps = get_effective_coordinates(user)
        km = haversine_km(job.latitude, job.longitude, eff_lat, eff_lng)
        radius = profile.max_radius_km or default_radius
        # Task B: bán kính → ĐIỂM PHẠT (subscore_distance = 0 ngoài bán kính),
        # KHÔNG hard-kill. Chỉ loại khi xa bất khả thi đi làm —
        # HARD_DROP_DISTANCE_KM (MatchingConfig, mặc định 80km).
        hard_drop_km = get_int('HARD_DROP_DISTANCE_KM', 80)
        if km is not None and km > hard_drop_km:
            logger.info(
                '[Matching] Loại %s: cách job %.1fkm > HARD_DROP %.0fkm (GPS hiện tại dùng cho distance)',
                user.username, km, hard_drop_km)
            continue
        # Hard filter #5: parent yêu cầu giới tính cụ thể (chỉ childcare/pickup —
        # tutoring đã bị vô hiệu ở trên) → CP khác giới bị LOẠI trước khi chấm điểm,
        # không chỉ ảnh hưởng điểm soft skill. CP chưa khai báo gender (bỏ trống)
        # KHÔNG bị loại — dữ liệu thiếu không chặn ghép cặp (newcomer-friendly,
        # cùng tinh thần với cách bỏ qua distance/rating thiếu phía trên).
        if gender_preference and profile.gender and profile.gender != gender_preference:
            continue

        # ── Hard filter #6: Skill-Gating cho mọi công việc có yêu cầu kỹ năng/chuyên môn ──
        # Bất kể môn đặc thù (Piano, Vẽ...) hay môn phổ thông (Toán, Văn, Lý, Hóa, Sinh, Ngoại ngữ...):
        # CarePartner PHẢI có ít nhất 1 kỹ năng trùng khớp HOẶC chuyên ngành đại học phù hợp.
        # Nếu hoàn toàn không có kỹ năng lẫn chuyên ngành phù hợp, CarePartner KHÔNG
        # thể dạy/làm công việc này và bị LOẠI HOÀN TOÀN khỏi danh sách đề xuất.
        matched_skills = [s for s in (profile.skills or []) if s in required_skills]
        has_skill_match = len(matched_skills) > 0
        has_major_match = _major_match_bonus(profile.major, job.job_type, required_skills,
                                             child_grade_level) > 0

        if required_skills and not has_skill_match and not has_major_match:
            continue

        pool_qualified += 1
        # restricted chỉ vào pool khi < 8 (chỉnh sau khi biết pool đủ điều kiện)
        if not EloService.is_allowed_in_pool(profile, pool_qualified - 1) and pool_qualified - 1 >= top_n:
            continue
        # Throttle đề xuất/ngày theo band (Step 6.6.5) — DSA: dùng số đếm đã
        # prefetch trước (tương đương can_receive_proposal, không query lại;
        # is_matchable đã kiểm tra ở đầu vòng lặp nên không cần gọi lại)
        band = profile.band
        if band is not None and band.max_proposals_per_day is not None:
            if proposal_counts.get(user.pk, 0) >= band.max_proposals_per_day:
                logger.warning('[ELO] Throttle: %s (band %s) đã nhận %d đề xuất hôm nay',
                               user.username, band.name, proposal_counts.get(user.pk, 0))
                continue

        # ── Sub-scores ──
        effective_elo = profile.effective_elo if profile.effective_elo is not None else (profile.hidden_elo or 1200)
        band = profile.band
        band_multiplier = float(band.rank_multiplier) if band else 1.0
        subs = {
            'availability': subscore_availability(len(required_slots), len(required_slots)),
            'skills': subscore_skills(required_skills, profile.skills or [], profile.major,
                                      job.job_type, child_grade_level=child_grade_level, use_match_ratio=True),
            'distance': subscore_distance(km, radius, profile.has_vehicle),
            'rating': subscore_rating(profile.rating_avg, profile.review_count),
            'completion': subscore_completion(profile.jobs_completed, profile.jobs_cancelled, profile.jobs_no_show),
            'elo': subscore_elo(effective_elo),
            'response': subscore_response(profile.responded_within_sla, profile.responses_total),
        }
        weighted = sum(weights.get(f, 0) * s for f, s in subs.items()) / 100.0
        final = int(round(weighted * band_multiplier))

        # Skill-Gating Score Cap: Chỉ khống chế điểm khi ứng viên vào pool CHỈ nhờ bằng cấp/chuyên ngành
        # mà hoàn toàn không có kỹ năng thực tế nào trùng khớp (has_skill_match == False)
        if required_skills and not has_skill_match and has_major_match:
            final = min(final, 68)

        final = max(0, min(100, final))
        level = match_level_of(final, min(pool_qualified, 100))

        candidates.append({
            'carepartner_id': str(user.pk),
            'display_name': (user.get_full_name() or user.username),
            'avatar_url': user.avatar_url or '',
            'school': profile.school,
            'major': profile.major,
            'rating': round(profile.rating_avg, 1),
            'completed_jobs': profile.jobs_completed,
            'distance_km': round(km, 1) if km is not None else None,
            'match_score': final,
            'match_level': level,
            'match_level_vi': MATCH_LEVEL_LABELS_VI.get(level, level),
            'top_skills': (profile.skills or [])[:4],
            'latest_review': latest_review_map.get(user.pk, ''),
            'response_tag': 'replies_fast' if (profile.responses_total and
                                               profile.responded_within_sla / profile.responses_total >= 0.8) else '',
            'availability_fit': 'full',
            '_skills': subs['skills'],
            '_elo': effective_elo,
            '_distance': km if km is not None else 9999.0,
            '_completion': subs['completion'],
            # Task C: cờ exploration — CP mới 0 đơn 0 review
            '_newbie': (profile.jobs_completed == 0 and profile.review_count == 0),
        })

    # Sort desc: điểm match -> điểm kỹ năng chuyên môn -> ELO -> khoảng cách -> tỷ lệ hoàn thành
    candidates.sort(key=lambda c: (-c['match_score'], -c['_skills'], -c['_elo'], c['_distance'], -c['_completion']))

    total_matched = len(candidates)

    # ── Task B (2026-09-14): Gemini re-rank top 20 → top 8 (spec 2.2.4/11.2 #8) ──
    # Chỉ REORDER trong pool rule-based, KHÔNG drop phần tử. Gemini chết / hết
    # timeout / không có key → giữ nguyên thứ tự rule. Matching KHÔNG bao giờ
    # chết vì AI.
    rerank_pool_size = max(get_int('GEMINI_RERANK_POOL', 20), top_n)
    pool = candidates[:rerank_pool_size]
    why_map = {}
    if len(pool) >= 2 and get_config('GEMINI_RERANK_ENABLED', True):
        try:
            from .gemini_service import rerank_candidates
            ordered, why_map = rerank_candidates(job, pool)
            if ordered:
                pool = ordered
        except Exception:
            logger.exception('[Matching] Gemini re-rank lỗi — giữ thứ tự rule')
            why_map = {}
    top = pool[:top_n]

    # ── Task C (2026-09-14): Exploration slot — newcomer không bị ghẻ lạnh ──
    # Nếu top N không có ai 0 đơn + 0 review, chèn 1 newbie (đã pass hard
    # filter) vào vị trí CUỐI, đẩy người điểm thấp nhất ra. Newbie KHÔNG bao
    # giờ vượt mặt very_high #1 — slot là #N.
    if top and not any(c.get('_newbie') for c in top):
        top_ids = {c['carepartner_id'] for c in top}
        newbie = next((c for c in candidates[top_n:] if c.get('_newbie')
                       and c['carepartner_id'] not in top_ids), None)
        if newbie is None:
            newbie = next((c for c in candidates if c.get('_newbie')
                           and c['carepartner_id'] not in top_ids), None)
        if newbie is not None:
            logger.info('[Matching] Exploration slot: chèn newbie %s vào #%d cho job %s',
                        newbie['display_name'], top_n, job.pk)
            top = top[:-1] + [newbie]

    # Ghi đề xuất — DSA (2026-09-18): 2 query cho toàn bộ top thay vì
    # get_or_create ×8 (1-2 query/người). ignore_conflicts=True giữ nguyên
    # semantics get_or_create: row đã tồn tại (trùng unique (job, carepartner))
    # KHÔNG bị ghi đè — đúng behavior cũ của get_or_create-with-defaults.
    now = timezone.now()
    if top:
        top_ids = [c['carepartner_id'] for c in top]
        existing_ids = set(_CP.objects.filter(job=job, carepartner_id__in=top_ids)
                           .values_list('carepartner_id', flat=True))
        missing_rows = [
            _CP(job=job, carepartner_id=c['carepartner_id'],
                match_score=c['match_score'], match_level=c['match_level'])
            for c in top if c['carepartner_id'] not in existing_ids
        ]
        if missing_rows:
            try:
                _CP.objects.bulk_create(missing_rows, batch_size=100,
                                        ignore_conflicts=True)
            except Exception:
                logger.exception('[Matching] Ghi CandidateProposal lỗi job %s', job.pk)
    for idx, cand in enumerate(top):
        cand['why_recommended_vi'] = why_map.get(cand['carepartner_id'], '')
        cand.pop('_skills', None)
        cand.pop('_elo', None)
        cand.pop('_distance', None)
        cand.pop('_completion', None)
        cand.pop('_newbie', None)

    # Đặc tả Mục 5: nhãn match_level phản ánh ĐÚNG điểm số của ứng viên —
    # đã bỏ đoạn ghi đè 'low' → 'medium' khi pool đủ 8 người (code cũ ép
    # nhãn sai sự thật, gây khó hiểu cho phụ huynh khi so sánh điểm/nhãn).

    return {'total_matched': total_matched, 'candidates': top}


def _latest_review_text(user):
    """Review mới nhất của CP (từ luồng Review hiện có — chỉ đọc).

    DSA (2026-09-18): find_candidates không còn gọi hàm này trong vòng lặp —
    đã thay bằng latest_review_map prefetch 1 query cho cả pool. Hàm giữ lại
    cho các caller khác (compatibility).
    """
    from core.models import Review
    review = (Review.objects.filter(reviewee=user)
              .select_related('reviewer').order_by('-created_at').first())
    if review is None:
        return ''
    return (review.comment or '')[:120]


def label_vi_for_level(level):
    return MATCH_LEVEL_LABELS_VI.get(level, level)
