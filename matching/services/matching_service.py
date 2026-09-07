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
  match_level: >=85 very_high | 70-84 high | 55-69 medium | <55 low.
"""

import logging
import math

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
    base = (rating_avg or 0) / 5.0 * 100.0
    if review_count < 3:
        return base * 0.6 + 60.0 * 0.4  # blend — newcomers không bị phạt
    return base


def subscore_completion(completed, cancelled, no_show):
    total = completed + cancelled + no_show
    if total == 0:
        return 70.0  # newcomers cao hơn trung tính nhẹ để có đơn đầu tiên
    return completed / total * 100.0


def subscore_elo(effective_elo):
    raw = (effective_elo - 650) / 800.0 * 100.0
    return max(0.0, min(120.0, raw))


def subscore_response(within_sla, total):
    if total == 0:
        return 60.0  # newcomer mặc định (Step 11.6)
    return within_sla / total * 100.0


def match_level_of(score, pool_size):
    if score >= 85:
        return 'very_high'
    if score >= 70:
        return 'high'
    if score >= 55:
        return 'medium'
    # 'low' chỉ hiển thị khi pool < 8 (Step 11.6)
    return 'low' if pool_size < MAX_CANDIDATES_DEFAULT else 'medium'


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
                        user__is_approved=True))

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
        km = haversine_km(job.latitude, job.longitude, user.latitude, user.longitude)
        radius = profile.max_radius_km or default_radius
        if km is not None and km > radius:
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
            'latest_review': _latest_review_text(user),
            'response_tag': 'replies_fast' if (profile.responses_total and
                                               profile.responded_within_sla / profile.responses_total >= 0.8) else '',
            'availability_fit': 'full',
            '_elo': effective_elo,
            '_distance': km if km is not None else 9999.0,
            '_completion': subs['completion'],
        })

    # Sort desc + tie-break ELO > distance > completion (Step 2.2.3)
    candidates.sort(key=lambda c: (-c['match_score'], -c['_elo'], c['_distance'], -c['_completion']))

    total_matched = len(candidates)
    top = candidates[:top_n]

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

    # match_level 'low' chỉ khi pool < 8 (re-check sau khi biết pool thật)
    if total_matched >= MAX_CANDIDATES_DEFAULT:
        for cand in top:
            if cand['match_level'] == 'low':
                cand['match_level'] = 'medium'

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
