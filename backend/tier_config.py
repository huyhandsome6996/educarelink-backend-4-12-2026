# B4 — Phân hạng CarePartner (import trong settings.py)
CAREPARTNER_TIER_RULES = {
    'silver': {'min_completed_jobs': 5, 'min_avg_rating': 4.0, 'min_reviews': 3},
    'gold': {'require_approved_credential': True},
    'diamond': {
        'require_specialized_degree': True,
        'min_completed_jobs': 10,
        'min_avg_rating': 4.5,
    },
}
