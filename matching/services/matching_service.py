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

import heapq
import logging
import math
from datetime import datetime as _dt, time as _time

from django.db.models import Count, Max, Q
from django.utils import timezone

from performance.spatial import haversine_distance_optimized

from ..config import get_config, get_int
from ..constants import MATCH_LEVEL_LABELS_VI
from ..models import (
    CandidateProposal,
    CarePartnerProfile,
    MatchingWeight,
)
from .elo_service import EloService
from .lock_service import covers_all_slots, load_slot_context

logger = logging.getLogger('educarelink.matching.engine')

MAX_CANDIDATES_DEFAULT = 8


def get_active_weights():
    """{factor: pct} từ DB — Step 11.6, KHÔNG hardcode."""
    weights = {w.factor: w.weight_pct for w in MatchingWeight.objects.filter(is_active=True)}
    if not weights:
        logger.error('[Matching] Chưa seed MatchingWeight — matching sẽ sai!')
    return weights


# Bán kính Trái Đất (km) — khớp công thức haversine bên dưới (R=6371.0)
_EARTH_RADIUS_KM = 6371.0


def _bounding_box_q(latitude, longitude, delta_km):
    """Q() lọc SQL theo khung chữ nhật ngoại tiếp bán kính delta_km quanh job.

    CÁCH CHỌN DELTA (an toàn tuyệt đối — KHÔNG loại nhầm CP hợp lệ):
    Caller truyền delta_km = max(DEFAULT_MAX_RADIUS_KM, MAX(max_radius_km) của
    mọi CarePartnerProfile) — 1 query aggregate rẻ. Bất kỳ CP nào sống sót qua
    hard-filter bán kính (km <= profile.max_radius_km hoặc default) đều cách
    job <= delta_km, nên nằm trong khung này. Khung là SIÊU TẬP của đường tròn
    bán kính delta_km theo mô hình cầu khớp đúng haversine (R=6371):
      - Vĩ độ: |Δφ| <= alpha = delta_km / R (rad) — chính xác tuyệt đối trên cầu.
      - Kinh độ: điểm cách trung tâm góc cầu alpha có |Δλ| tối đa tại vĩ độ cao
        nhất của vòng tròn (|φ0| + alpha) → |Δλ| <= alpha / cos(|φ0| + alpha).
        Nếu vòng tròn chạm cực (|φ0| + alpha >= 90°) hoặc khung vượt ±180°
        (qua kinh tuyến ngày) → BỎ lọc kinh độ (siêu tập, an toàn).
    CP không có tọa độ (lat/lng NULL) KHÔNG bị loại — khớp hành vi cũ (km None
    → không lọc bán kính, newcomer-friendly).

    Trả Q() (không lọc) khi job thiếu tọa độ hoặc delta không dương.
    """
    if latitude is None or longitude is None or not delta_km or delta_km <= 0:
        return Q()
    alpha = delta_km / _EARTH_RADIUS_KM  # radian — góc cầu tối đa
    lat_delta = math.degrees(alpha)
    lat_q = (Q(user__latitude__isnull=True)
             | Q(user__latitude__gte=latitude - lat_delta,
                 user__latitude__lte=latitude + lat_delta))

    max_phi = abs(math.radians(latitude)) + alpha
    if max_phi < math.pi / 2:  # vòng tròn không chạm cực
        lng_delta = math.degrees(alpha / math.cos(max_phi))
        lng_min, lng_max = longitude - lng_delta, longitude + lng_delta
        if lng_min >= -180.0 and lng_max <= 180.0:  # không vướng kinh tuyến ngày
            lng_q = (Q(user__longitude__isnull=True)
                     | Q(user__longitude__gte=lng_min,
                         user__longitude__lte=lng_max))
            # KM là None khi ÍT NHẤT MỘT toạ độ NULL → phải pass; cả hai có
            # giá trị mới chịu lọc khung. Viết là (NULL một trong hai) OR
            # (đủ khung vĩ độ AND đủ khung kinh độ) — không được AND rời
            # từng chiều vì sẽ loại CP chỉ có lng ngoài khung nhưng lat NULL.
            return lat_q | lng_q | (lat_q & lng_q)
    return lat_q


def _batch_latest_reviews(user_ids):
    """{user_id: review_mới_nhất_text} — MỘT query cho toàn bộ CP (khử N+1
    _latest_review_text vốn chạy 1 query .first() mỗi CP trong vòng lặp).

    Kỹ thuật: order theo -created_at, giữ bản ghi ĐẦU TIÊN của mỗi reviewee
    — tương đương .order_by('-created_at').first() per user (SQLite không
    hỗ trợ DISTINCT ON của Postgres). Tách Python tạo dict trước vòng lặp.
    """
    from core.models import Review
    if not user_ids:
        return {}
    out = {}
    remaining = set(user_ids)
    rows = (Review.objects.filter(reviewee_id__in=user_ids)
            .only('reviewee_id', 'comment', 'created_at')
            .order_by('-created_at', 'reviewee_id'))
    for r in rows:
        if r.reviewee_id in remaining:
            remaining.discard(r.reviewee_id)
            out[r.reviewee_id] = (r.comment or '')[:120]
            if not remaining:
                break
    return out


def _batch_proposal_counts(user_ids, when=None):
    """{user_id: số CandidateProposal hôm nay} — 1 query GROUP BY cho toàn bộ
    CP (khử N+1 EloService.can_receive_proposal vốn COUNT mỗi CP).
    Ngày lịch theo timezone hiện hành — khớp đúng cách tính trong
    can_receive_proposal (timezone.localdate)."""
    when = when or timezone.now()
    if not user_ids:
        return {}
    day_start = timezone.make_aware(
        _dt.combine(timezone.localdate(when), _time.min))
    rows = (CandidateProposal.objects
            .filter(carepartner_id__in=user_ids, proposed_at__gte=day_start)
            .values('carepartner_id')
            .annotate(n=Count('id')))
    return {row['carepartner_id']: row['n'] for row in rows}


def haversine_km(lat1, lng1, lat2, lng2):
    """Khoảng cách lớn-đường tròn (km) — Task perf 6.

    Delegate sang performance.spatial.haversine_distance_optimized (bản tối
    ưu đã được dùng thật ở core/views.py — gom bước chuyển radian, nhanh hơn
    khi gọi hàng loạt). LƯU Ý ĐƠN VỊ: hàm đó trả MÉT (EARTH_RADIUS_M) →
    chia /1000 giữ đúng đơn vị KM cho toàn bộ logic phía sau (so sánh với
    radius, distance_km trả client...). Chữ ký + đơn vị trả về GIỮ NGUYÊN —
    không sửa nơi gọi.
    """
    if None in (lat1, lng1, lat2, lng2):
        return None
    return haversine_distance_optimized(lat1, lng1, lat2, lng2) / 1000.0


def _major_match_bonus(major, job_type):
    """Chuyên ngành khớp loại job → +1 (Step 11.6 skills)."""
    if not major:
        return 0
    major_l = major.lower()
    education_kw = ['sư phạm', 'su pham', 'giáo dục', 'giao duc', 'sư', 'pedagog']
    care_kw = ['sơ cấp', 'so cap', 'chăm sóc', 'cham soc', 'nhi', 'điều dưỡng', 'dieu duong']
    if job_type in ('tutoring', 'childcare') and any(kw in major_l for kw in education_kw):
        return 1
    if job_type in ('childcare', 'pickup') and any(kw in major_l for kw in care_kw):
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


def subscore_skills(required_skills, cp_skills, major, job_type):
    j = _jaccard(required_skills, cp_skills)
    return 60.0 * j + 40.0 * _major_match_bonus(major, job_type)


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

    # ── TASK perf 1.1: bounding-box filter TRƯỚC ở SQL ──
    # delta = bán kính lớn nhất có thể trong hệ thống (max của mọi
    # profile.max_radius_km và DEFAULT_MAX_RADIUS_KM) → khung là siêu tập
    # của mọi đường tròn bán kính từng CP → KHÔNG loại nhầm ai (chi tiết
    # chứng minh trong docstring _bounding_box_q). CP không có tọa độ
    # (NULL) vẫn đi qua khung — khớp hành vi cũ.
    max_profile_radius = (CarePartnerProfile.objects
                          .aggregate(m=Max('max_radius_km'))['m']) or 0
    box_q = _bounding_box_q(job.latitude, job.longitude,
                            max(default_radius, max_profile_radius))

    profiles = list((CarePartnerProfile.objects
                     .select_related('user', 'band')
                     .filter(user__role='worker',
                             user__is_active=True,
                             user__is_approved=True)
                     .filter(box_q)))

    # ── TASK perf 1.2 + 1.3: batch-load trước vòng lặp (khử N+1) ──
    # Lịch rảnh: 5 query cho TOÀN BỘ CP × ngày (trước đây 4-5 query × CP × ngày).
    cp_user_ids = [p.user_id for p in profiles]
    unique_dates = sorted({d for d, _, _ in required_slots})
    slot_ctx = load_slot_context(cp_user_ids, unique_dates)
    # Review mới nhất: 1 query (trước đây 1 query .first() mỗi CP).
    latest_reviews = _batch_latest_reviews(cp_user_ids)
    # Số đề xuất hôm nay: 1 query GROUP BY (trước đây 1 COUNT mỗi CP qua
    # can_receive_proposal → giờ truyền sẵn qua tham số today_count).
    proposal_counts = _batch_proposal_counts(cp_user_ids)

    for profile in profiles:
        user = profile.user
        if user.pk in exclude:
            continue
        # ── Hard filters ──
        if not EloService.is_matchable(profile):
            continue
        ok_cover, _missing = covers_all_slots(user, required_slots,
                                              prefetched=slot_ctx)
        if not ok_cover:
            continue
        km = haversine_km(job.latitude, job.longitude, user.latitude, user.longitude)
        radius = profile.max_radius_km or default_radius
        if km is not None and km > radius:
            continue
        # Hard filter #5: parent yêu cầu giới tính cụ thể (chỉ childcare/pickup —
        # tutoring đã bị vô hiệu ở trên) → CP khác giới bị LOẠI trước khi chấm điểm,
        # không chỉ ảnh hưởng điểm soft skill. CP chưa khai báo gender (bỏ trống)
        # KHÔNG bị loại — dữ liệu thiếu không chặn ghép cặp (newcomer-friendly,
        # cùng tinh thần với cách bỏ qua distance/rating thiếu phía trên).
        if gender_preference and profile.gender and profile.gender != gender_preference:
            continue
        pool_qualified += 1
        # restricted chỉ vào pool khi < 8 (chỉnh sau khi biết pool đủ điều kiện)
        if not EloService.is_allowed_in_pool(profile, pool_qualified - 1) and pool_qualified - 1 >= top_n:
            continue
        if not EloService.can_receive_proposal(
                user, profile=profile, today_count=proposal_counts.get(user.pk, 0)):
            continue

        # ── Sub-scores ──
        effective_elo = profile.effective_elo if profile.effective_elo is not None else (profile.hidden_elo or 1200)
        band = profile.band
        band_multiplier = float(band.rank_multiplier) if band else 1.0

        subs = {
            'availability': subscore_availability(len(required_slots), len(required_slots)),
            'skills': subscore_skills(required_skills, profile.skills or [], profile.major, job.job_type),
            'distance': subscore_distance(km, radius, profile.has_vehicle),
            'rating': subscore_rating(profile.rating_avg, profile.review_count),
            'completion': subscore_completion(profile.jobs_completed, profile.jobs_cancelled, profile.jobs_no_show),
            'elo': subscore_elo(effective_elo),
            'response': subscore_response(profile.responded_within_sla, profile.responses_total),
        }
        weighted = sum(weights.get(f, 0) * s for f, s in subs.items()) / 100.0
        final = int(round(weighted * band_multiplier))
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
            'latest_review': latest_reviews.get(user.pk, ''),
            'response_tag': 'replies_fast' if (profile.responses_total and
                                               profile.responded_within_sla / profile.responses_total >= 0.8) else '',
            'availability_fit': 'full',
            '_elo': effective_elo,
            '_distance': km if km is not None else 9999.0,
            '_completion': subs['completion'],
        })

    # Top-K bằng heapq.nlargest — Task perf 5: O(N log K) thay vì sort toàn
    # mảng O(N log N) khi chỉ cần top_n (~8) phần tử.
    # Key (score, elo, -distance, completion) với nlargest TƯƠNG ĐƯƠNG chính
    # xác sort key cũ (-score, -elo, distance, -completion) ascending:
    # heapq.nlargest ≡ sorted(iterable, key, reverse=True)[:n] — cả tie
    # cũng giữ nguyên thứ tự gốc (sorted stable, reverse=True không đảo tie).
    total_matched = len(candidates)
    top = heapq.nlargest(top_n, candidates, key=_candidate_rank_key)

    # Ghi đề xuất (throttle đã lọc ở trên) — unique (job, cp)
    now = timezone.now()
    for idx, cand in enumerate(top):
        CandidateProposal.objects.get_or_create(
            job=job, carepartner_id=cand['carepartner_id'],
            defaults=dict(match_score=cand['match_score'], match_level=cand['match_level'],
                          proposed_at=now))
        cand.pop('_elo', None)
        cand.pop('_distance', None)
        cand.pop('_completion', None)

    # Đặc tả Mục 5: nhãn match_level phản ánh ĐÚNG điểm số của ứng viên —
    # đã bỏ đoạn ghi đè 'low' → 'medium' khi pool đủ 8 người (code cũ ép
    # nhãn sai sự thật, gây khó hiểu cho phụ huynh khi so sánh điểm/nhãn).

    return {'total_matched': total_matched, 'candidates': top}


def _candidate_rank_key(c):
    """Key cho heapq.nlargest (Task perf 5) — tương đương sort key cũ
    (-match_score, -_elo, _distance, -_completion) ascending."""
    return (c['match_score'], c['_elo'], -c['_distance'], c['_completion'])


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
