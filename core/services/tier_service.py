"""
B4 — Phân hạng CarePartner (Hạng Đồng / Bạc / Vàng / Kim cương).

Rule (có thể chỉnh qua settings.CAREPARTNER_TIER_RULES):
  - bronze  : is_approved (mặc định khi mới duyệt)
  - silver  : ≥ min_completed_jobs + avg_rating ≥ min + ≥ min_reviews
  - gold    : có ≥ 1 CredentialSubmission approved
  - diamond : có credential is_specialized + đủ job/rating

Cho phép hạ hạng khi không còn đủ điều kiện (trừ khi tier_override=True).
"""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db.models import Avg, Count
from django.utils import timezone

logger = logging.getLogger(__name__)

TIER_ORDER = ('bronze', 'silver', 'gold', 'diamond')


def _rules() -> dict:
    return getattr(settings, 'CAREPARTNER_TIER_RULES', {
        'silver': {'min_completed_jobs': 5, 'min_avg_rating': 4.0, 'min_reviews': 3},
        'gold': {'require_approved_credential': True},
        'diamond': {
            'require_specialized_degree': True,
            'min_completed_jobs': 10,
            'min_avg_rating': 4.5,
        },
    })


def _gather_stats(worker) -> dict[str, Any]:
    from core.models import TaskApplication, Review, CredentialSubmission

    completed_jobs = TaskApplication.objects.filter(
        worker=worker,
        status='accepted',
        task__status='completed',
    ).count()

    agg = Review.objects.filter(reviewee=worker).aggregate(
        avg_rating=Avg('rating'),
        review_count=Count('id'),
    )
    avg_rating = float(agg['avg_rating'] or 0)
    review_count = int(agg['review_count'] or 0)

    approved_creds = CredentialSubmission.objects.filter(
        worker=worker, status='approved',
    )
    has_cert = approved_creds.exists()
    has_specialized = approved_creds.filter(is_specialized=True).exists()

    return {
        'completed_jobs': completed_jobs,
        'avg_rating': round(avg_rating, 2),
        'review_count': review_count,
        'has_cert': has_cert,
        'has_specialized': has_specialized,
    }


def compute_tier(worker) -> str:
    from core.models import User

    if getattr(worker, 'role', None) != 'worker' or not getattr(worker, 'is_approved', False):
        return User.CarePartnerTier.BRONZE

    stats = _gather_stats(worker)
    rules = _rules()
    silver = rules.get('silver', {})
    diamond = rules.get('diamond', {})

    if (
        stats['has_specialized']
        and stats['completed_jobs'] >= int(diamond.get('min_completed_jobs', 10))
        and stats['avg_rating'] >= float(diamond.get('min_avg_rating', 4.5))
    ):
        return User.CarePartnerTier.DIAMOND

    if stats['has_cert']:
        return User.CarePartnerTier.GOLD

    if (
        stats['completed_jobs'] >= int(silver.get('min_completed_jobs', 5))
        and stats['avg_rating'] >= float(silver.get('min_avg_rating', 4.0))
        and stats['review_count'] >= int(silver.get('min_reviews', 3))
    ):
        return User.CarePartnerTier.SILVER

    return User.CarePartnerTier.BRONZE


def refresh_tier(worker, *, force: bool = False) -> str:
    from core.models import User

    if getattr(worker, 'role', None) != 'worker':
        return getattr(worker, 'tier', User.CarePartnerTier.BRONZE)

    if getattr(worker, 'tier_override', False) and not force:
        return worker.tier

    stats = _gather_stats(worker)
    new_tier = compute_tier(worker)
    old_tier = getattr(worker, 'tier', None) or User.CarePartnerTier.BRONZE

    if new_tier != old_tier or worker.tier_meta != stats:
        worker.tier = new_tier
        worker.tier_updated_at = timezone.now()
        worker.tier_meta = stats
        if force:
            worker.tier_override = False
        update_fields = ['tier', 'tier_updated_at', 'tier_meta']
        if force:
            update_fields.append('tier_override')
        worker.save(update_fields=update_fields)
        logger.info(
            '[Tier] worker_id=%s %s → %s | stats=%s force=%s',
            worker.pk, old_tier, new_tier, stats, force,
        )
    return new_tier


def set_tier_manual(worker, tier: str, *, actor=None) -> str:
    from core.models import User

    valid = {c.value for c in User.CarePartnerTier}
    if tier not in valid:
        raise ValueError(f'Hạng không hợp lệ: {tier}. Chọn một trong {sorted(valid)}.')

    worker.tier = tier
    worker.tier_override = True
    worker.tier_updated_at = timezone.now()
    meta = dict(worker.tier_meta or {})
    meta['manual_set_by'] = getattr(actor, 'id', None)
    meta['manual_set_at'] = timezone.now().isoformat()
    worker.tier_meta = meta
    worker.save(update_fields=['tier', 'tier_override', 'tier_updated_at', 'tier_meta'])
    logger.info('[Tier] MANUAL set worker_id=%s tier=%s by=%s', worker.pk, tier, getattr(actor, 'id', None))
    return tier


def tier_label(tier: str) -> str:
    from core.models import User
    try:
        return User.CarePartnerTier(tier).label
    except ValueError:
        return tier or 'Hạng Đồng'
