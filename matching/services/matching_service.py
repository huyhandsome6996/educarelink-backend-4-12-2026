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

import logging
import math

from django.conf import settings
from django.utils import timezone

from ..config import get_config, get_int
from ..constants import MATCH_LEVEL_LABELS_VI
from ..models import (
    CandidateProposal,
    CarePartnerProfile,
    MatchingWeight,
)
from .elo_service import EloService
from .lock_service import covers_all_slots

logger = logging.getLogger('educarelink.matching.engine')

MAX_CANDIDATES_DEFAULT = 8


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


def _major_match_bonus(major, job_type, required_skills=None, child_grade_level=None):
    """Chuyên ngành khớp loại job và yêu cầu kỹ năng cụ thể (Step 11.6 skills).

    child_grade_level (Defect 3): khối lớp phụ huynh chọn (type_data.child_grade_level).
    None/'' = không giới hạn cấp học — giữ nguyên hành vi cũ, không raise KeyError
    với dữ liệu job cũ thiếu field trong type_data.
    """
    if not major:
        return 0
    major_l = major.lower()
    req_set = set(required_skills or [])

    # 1. Các nhóm môn / kỹ năng đặc thù cao (âm nhạc, CNTT, mỹ thuật, ngoại ngữ...)
    music_skills = {'dan_piano', 'piano', 'organ', 'guitar', 'am_nhac', 'thanh_nhac'}
    music_kw = ['âm nhạc', 'am nhac', 'piano', 'organ', 'guitar', 'nhạc', 'nhac', 'nghệ thuật', 'nghe thuat']

    it_skills = {'lap_trinh', 'tin_hoc', 'python', 'scratch', 'cntt'}
    it_kw = ['công nghệ thông tin', 'tin học', 'khoa học máy tính', 'it', 'cntt', 'phần mềm']

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
        if lang_matches:
            return 1 if any(kw in major_l for kw in lang_matches) else 0
        return 0

    # Nếu công việc yêu cầu kỹ năng đặc thù, chỉ cộng điểm chuyên ngành nếu chuyên ngành THẬT SỰ thuộc lĩnh vực đó
    if req_set & music_skills:
        return 1 if any(kw in major_l for kw in music_kw) else 0

    if req_set & it_skills:
        return 1 if any(kw in major_l for kw in it_kw) else 0

    if req_set & art_skills:
        return 1 if any(kw in major_l for kw in art_kw) else 0

    # 2. Đối với gia sư tiểu học / văn hóa phổ thông (Toán, Văn, Lý, Hóa, Sinh...) hoặc chăm sóc:
    elementary_tutoring = {
        'tieu_hoc', 'luyen_chu_dep', 'toan', 'tieng_viet', 'on_tap', 'kem_hoc', 'van',
        'ngu_van',  # Defect 1: biến thể skill "ngữ văn" (profile CP dùng code này)
        'ly', 'hoa', 'sinh'
    }
    education_kw = ['sư phạm', 'su pham', 'giáo dục', 'giao duc', 'pedagog',
                    # Defect 1: biến thể chuyên ngành tiểu học (có dấu / không dấu)
                    'giáo dục tiểu học', 'giao duc tieu hoc', 'tiểu học', 'tieu hoc',
                    'gd tiểu học', 'gd tieu hoc', 'primary education']
    care_kw = ['sơ cấp', 'so cap', 'chăm sóc', 'cham soc', 'nhi', 'điều dưỡng', 'dieu duong', 'y tế', 'mầm non', 'mam non']

    # Nếu job_type là tutoring: match education_kw HOẶC chuyên ngành trực tiếp môn học đó
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
                return 1 if any(kw in major_l for kw in education_kw) else 0
            for s in (req_set & set(subject_kw_map.keys())):
                if any(kw in major_l for kw in subject_kw_map[s]):
                    return 1
            return 0
        if grade_l == 'preschool_prep':
            # Tiền tiểu học (4-6 tuổi): sư phạm / giáo dục / mầm non đều được cộng điểm
            if not req_set or (req_set & elementary_tutoring):
                return 1 if (any(kw in major_l for kw in education_kw)
                             or any(kw in major_l for kw in care_kw)) else 0
            return 0

        if not req_set or (req_set & elementary_tutoring):
            if any(kw in major_l for kw in education_kw):
                return 1
            for s in (req_set & set(subject_kw_map.keys())):
                if any(kw in major_l for kw in subject_kw_map[s]):
                    return 1
            return 0
        return 0

    if job_type == 'childcare' and (any(kw in major_l for kw in education_kw) or any(kw in major_l for kw in care_kw)):
        return 1

    if job_type == 'pickup' and any(kw in major_l for kw in care_kw):
        return 1

    return 0


def get_effective_coordinates(user):
    """Vị trí HIỆU LỰC của CarePartner cho ghép cặp (Defect 4 — 2026-09-13).

    Ưu tiên GPS real-time (User.current_latitude/longitude) nếu còn "tươi"
    (< settings.GPS_FRESHNESS_HOURS, mặc định 48h); quá hạn hoặc chưa từng
    sync → fallback vị trí đăng ký tĩnh (User.latitude/longitude).

    Trả về (lat, lng, from_gps: bool). Ngưỡng cấu hình qua Django settings
    (GPS_FRESHNESS_HOURS / MAX_GPS_DRIFT_KM) — KHÔNG hard-code, dễ tinh chỉnh
    khi lên production. Dùng `is not None` thay vì truthiness để không coi
    tọa độ 0.0 là "không có".
    """
    freshness_hours = float(getattr(settings, 'GPS_FRESHNESS_HOURS', 48))
    if (user.current_latitude is not None and user.current_longitude is not None
            and user.last_gps_updated_at is not None):
        age_seconds = (timezone.now() - user.last_gps_updated_at).total_seconds()
        if age_seconds < freshness_hours * 3600:
            return user.current_latitude, user.current_longitude, True
    return user.latitude, user.longitude, False


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


def subscore_skills(required_skills, cp_skills, major, job_type, child_grade_level=None):
    j = _jaccard(required_skills, cp_skills)
    major_bonus = _major_match_bonus(major, job_type, required_skills, child_grade_level)
    return 60.0 * j + 40.0 * major_bonus


def subscore_distance(km, max_radius_km, has_vehicle=False):
    if km is None:
        return 100.0  # không có tọa độ → không phạt (newcomer-friendly)
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
    parsed = job.ai_parse_result or {}
    required_skills = parsed.get('required_skills') or []
    # Defect 3: khối lớp phụ huynh chọn (job cũ thiếu field → None = không giới hạn)
    child_grade_level = (job.type_data or {}).get('child_grade_level') or None

    # ── Hard filter #5: giới tính (flow1-step2-matching-engine.md dòng 57) ──
    # Bất biến Step 11.4: tutoring KHÔNG BAO GIỜ lọc theo giới tính. Bất biến này
    # được ép ở 2 lớp upstream — matching/api/jobs.py (null gender_preference trước
    # khi lưu JobPost khi job_type == 'tutoring') và gemini_service.py (null sau khi
    # parse). Dòng dưới đây là lớp phòng thủ thứ 3 NGAY TẠI NƠI TIÊU DÙNG: kể cả
    # gender_preference "lọt" vào job tutoring (ghi thẳng DB, import cũ...) thì vẫn
    # vô hiệu hóa ở đây, không bao giờ dùng để loại ứng viên gia sư.
    gender_preference = '' if job.job_type == 'tutoring' else (job.gender_preference or '')

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

    for profile in profiles:
        user = profile.user
        if user.pk in exclude:
            continue
        # ── Hard filters ──
        if not EloService.is_matchable(profile):
            continue
        ok_cover, _missing = covers_all_slots(user, required_slots)
        if not ok_cover:
            continue
        # ── Defect 4: dùng vị trí HIỆU LỰC (GPS real-time nếu còn tươi) ──
        eff_lat, eff_lng, from_gps = get_effective_coordinates(user)
        # Chống "đi công tác / về quê": GPS real-time xa hơn MAX_GPS_DRIFT_KM
        # (mặc định 50km) so với vị trí ĐÃ ĐĂNG KÝ → CarePartner đang ở xa
        # nơi đăng ký → LOẠI khỏi match pool (kể cả khớp skill hoàn hảo).
        if from_gps:
            drift_km = haversine_km(eff_lat, eff_lng, user.latitude, user.longitude)
            max_drift_km = float(getattr(settings, 'MAX_GPS_DRIFT_KM', 50))
            if drift_km is not None and drift_km > max_drift_km:
                logger.info(
                    '[Matching] Loại %s: GPS drift %.1fkm > %.0fkm (đăng ký %.4f,%.4f — GPS %.4f,%.4f)',
                    user.username, drift_km, max_drift_km,
                    user.latitude or 0, user.longitude or 0, eff_lat or 0, eff_lng or 0)
                continue
        km = haversine_km(job.latitude, job.longitude, eff_lat, eff_lng)
        radius = profile.max_radius_km or default_radius
        # Bán kính: CP có phương tiện hoặc khu vực đô thị mở rộng tối đa 35km để luôn có ứng viên phù hợp
        max_allowed_km = max(radius, 35) if profile.has_vehicle else max(radius, 25)
        if km is not None and km > max_allowed_km:
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
        if not EloService.can_receive_proposal(user):
            continue

        # ── Sub-scores ──
        effective_elo = profile.effective_elo if profile.effective_elo is not None else (profile.hidden_elo or 1200)
        band = profile.band
        band_multiplier = float(band.rank_multiplier) if band else 1.0

        subs = {
            'availability': subscore_availability(len(required_slots), len(required_slots)),
            'skills': subscore_skills(required_skills, profile.skills or [], profile.major,
                                      job.job_type, child_grade_level),
            'distance': subscore_distance(km, radius, profile.has_vehicle),
            'rating': subscore_rating(profile.rating_avg, profile.review_count),
            'completion': subscore_completion(profile.jobs_completed, profile.jobs_cancelled, profile.jobs_no_show),
            'elo': subscore_elo(effective_elo),
            'response': subscore_response(profile.responded_within_sla, profile.responses_total),
        }
        weighted = sum(weights.get(f, 0) * s for f, s in subs.items()) / 100.0
        final = int(round(weighted * band_multiplier))

        # Skill-Gating Score Cap: Nếu job có required_skills nhưng ứng viên chỉ vào pool nhờ bằng cấp/chuyên ngành
        # mà chưa có kỹ năng thực tế (hoặc độ phủ kỹ năng thấp < 0.25),
        # khống chế điểm tối đa không vượt quá 68 điểm (tránh điểm ảo 90-100 do các yếu tố phụ)
        if required_skills and (not profile.skills or _jaccard(required_skills, profile.skills) < 0.25):
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
            'latest_review': _latest_review_text(user),
            'response_tag': 'replies_fast' if (profile.responses_total and
                                               profile.responded_within_sla / profile.responses_total >= 0.8) else '',
            'availability_fit': 'full',
            '_skills': subs['skills'],
            '_elo': effective_elo,
            '_distance': km if km is not None else 9999.0,
            '_completion': subs['completion'],
        })

    # Sort desc: điểm match -> điểm kỹ năng chuyên môn -> ELO -> khoảng cách -> tỷ lệ hoàn thành
    candidates.sort(key=lambda c: (-c['match_score'], -c['_skills'], -c['_elo'], c['_distance'], -c['_completion']))

    total_matched = len(candidates)
    top = candidates[:top_n]

    # Ghi đề xuất (throttle đã lọc ở trên) — unique (job, cp)
    now = timezone.now()
    for idx, cand in enumerate(top):
        CandidateProposal.objects.get_or_create(
            job=job, carepartner_id=cand['carepartner_id'],
            defaults=dict(match_score=cand['match_score'], match_level=cand['match_level'],
                          proposed_at=now))
        cand.pop('_skills', None)
        cand.pop('_elo', None)
        cand.pop('_distance', None)
        cand.pop('_completion', None)

    # Đặc tả Mục 5: nhãn match_level phản ánh ĐÚNG điểm số của ứng viên —
    # đã bỏ đoạn ghi đè 'low' → 'medium' khi pool đủ 8 người (code cũ ép
    # nhãn sai sự thật, gây khó hiểu cho phụ huynh khi so sánh điểm/nhãn).

    return {'total_matched': total_matched, 'candidates': top}


def _latest_review_text(user):
    """Review mới nhất của CP (từ luồng Review hiện có — chỉ đọc)."""
    from core.models import Review
    review = (Review.objects.filter(reviewee=user)
              .select_related('reviewer').order_by('-created_at').first())
    if review is None:
        return ''
    return (review.comment or '')[:120]


def label_vi_for_level(level):
    return MATCH_LEVEL_LABELS_VI.get(level, level)
