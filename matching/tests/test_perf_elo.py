"""
matching/tests/test_perf_elo.py — Test Task perf 7: EloService.recompute + determine_band.

Task 7 — recompute tách 2 phần khác bản chất (KHÔNG áp dụng "checkpoint cache"
nguyên văn từ báo cáo DSA vì penalty decay theo thời gian — chỉ reward mới
checkpoint-an toàn, phần đó lùi đợt sau):
  - Penalty: chỉ scan cửa sổ (now-181d, now] — ngoài cửa sổ hệ số chắc chắn
    0.00 → kết quả KHÔNG ĐỔI (biên: 179/180/180.5 ngày còn ×0.25, 181 ngày
    bị loại khỏi query — không lệch 1 ngày với _decay_factor() gốc).
  - Reward: giữ nguyên quét (checkpoint reward lùi đợt sau — cần migration +
    backfill, rủi ro chạm số liệu tín nhiệm).
  - determine_band: cache process TTL 60s + signal post_save/post_delete
    invalidate (sửa band trong admin/seed thấy NGAY — giữ contract "sửa band
    không cần deploy").

Parity: effective_elo bản mới so với bản CŨ (full scan) trên ledger đa dạng
tuổi 0→400 ngày + reward cũ/mới + cooldown T5 — lệch > 0.05 điểm là FAIL.
"""

import math
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone as tz

from matching.models import EloBand, EloLedger
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase

User = get_user_model()


# ═══════════════════════════════════════════════════════════════════
# Task 7 — recompute parity (old full-scan vs new window) + band cache
# ═══════════════════════════════════════════════════════════════════
def _recompute_reference(profile, now):
    """Bản recompute CŨ (pre-refactor): quét TOÀN BỘ ledger."""
    in_cooldown = EloService._in_recovery_cooldown(profile.user, now, 7)
    base = profile.hidden_elo if profile.hidden_elo is not None else 1200

    def old_decay(created_at, now_):
        if created_at is None:
            return 1.0
        age_seconds = (now_ - created_at).total_seconds()
        if age_seconds <= 0:
            return 1.0
        age_days = math.floor(age_seconds / 86400)
        if age_days <= 30:
            return 1.00
        if age_days <= 90:
            return 0.60
        if age_days <= 180:
            return 0.25
        return 0.00

    rewards = 0.0
    penalties = 0.0
    rows = EloLedger.objects.filter(carepartner=profile.user).only(
        'delta', 'reason_code', 'created_at')
    for row in rows:
        if row.delta > 0:
            rewards += row.delta * (0.5 if in_cooldown else 1.0)
        elif row.delta < 0:
            penalties += row.delta * old_decay(row.created_at, now)
    from matching.services.elo_service import ELO_MIN, ELO_MAX
    effective = base + rewards + penalties
    effective = max(float(ELO_MIN), min(float(ELO_MAX), effective))
    from decimal import Decimal, ROUND_HALF_UP
    return float(Decimal(str(effective)).quantize(Decimal('0.1'),
                                                  rounding=ROUND_HALF_UP))


class EloRecomputeParityTests(MatchingTestBase):
    def _make_profile(self, name):
        u = User.objects.create_user(name, password='x', role='worker')
        return EloService.get_profile(u)

    def _ledger(self, cp, delta, reason, age=None, now=None):
        row = EloLedger.objects.create(
            carepartner=cp, delta=delta, reason_code=reason,
            elo_before=1200, elo_after=1200)
        if age is not None:
            base = now or tz.now()
            # auto_now_add không set tay được → update sau tạo
            EloLedger.objects.filter(pk=row.pk).update(
                created_at=base - age)
        return row

    def test_parity_across_ledger_ages_and_cooldown(self):
        """effective_elo bản mới == bản cũ trên ledger đa dạng:
        ages 0/10/45/120/179.5/180/180.5/181/200/400 ngày + reward cũ/mới
        + cooldown T5 (recent T5 → rewards ×0.5)."""
        cp = self._make_profile('elo_parity_cp')
        now = tz.now()
        D = timedelta
        # Rewards (không decay): cũ 400 ngày + mới 2 ngày
        self._ledger(cp.user, 12, 'job_completed', D(days=400))
        self._ledger(cp.user, 12, 'job_completed', D(days=2))
        self._ledger(cp.user, 10, 'review_5', D(days=100))
        # Penalties: đủ band decay + biên
        self._ledger(cp.user, -8, 'review_bad', D(days=0))
        self._ledger(cp.user, -8, 'review_bad', D(days=45))
        self._ledger(cp.user, -25, 'parent_report_valid', D(days=120))
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=179, hours=12))
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=180))
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=180, hours=12))
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=181))
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=200))
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=400))
        # Cooldown: T5 gần đây (delta -500 để chắc chắn rơi vào tier ≥150)
        self._ledger(cp.user, -500, 'T5', D(days=1))

        profile = EloService.get_profile(cp.user)

        expected = _recompute_reference(profile, now)
        effective, band = EloService.recompute(profile, now=now)
        # Parity tuyệt đối (cùng thứ tự cộng trong từng bucket) — cho phép
        # 0.05 do bước làm tròn 0.1 của bản cache
        self.assertLess(abs(effective - expected), 0.05,
                        msg=f'effective mới {effective} != cũ {expected}')

    def test_penalty_boundary_181_days_excluded_from_query(self):
        """Biên decay: 179/180/180.5 ngày → ×0.25 còn tính; 181 ngày →
        phải bị LOẠI KHỎI QUERY (không chỉ nhân 0) — không lệch 1 ngày."""
        cp = self._make_profile('elo_boundary_cp')
        now = tz.now()
        D = timedelta
        # Chỉ 1 penalty 179 ngày tuổi (×0.25 → -2.5) + 1 penalty 181 ngày
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=179), now=now)
        self._ledger(cp.user, -10, 'appeal_abuse', D(days=181), now=now)

        profile = EloService.get_profile(cp.user)
        penalty_rows = list(
            EloLedger.objects.filter(carepartner=cp.user, delta__lt=0,
                                     created_at__gt=now - D(days=181)))
        ages = [((now - r.created_at).days) for r in penalty_rows]
        self.assertEqual(ages, [179],
                         'Cửa sổ 181 ngày phải loại đúng row 181 ngày tuổi, '
                         'giữ row 179 ngày (không lệch biên)')

        expected = _recompute_reference(profile, now)
        effective, _band = EloService.recompute(profile, now=now)
        self.assertLess(abs(effective - expected), 0.05)


class DetermineBandCacheTests(MatchingTestBase):
    def test_band_cache_invalidated_on_save(self):
        """Sửa EloBand qua .save() → signal invalidate cache → recompute
        thấy ngưỡng mới NGAY (contract 'sửa band không cần deploy')."""
        profile = EloService.get_profile(
            User.objects.create_user('band_cache_cp', password='x', role='worker'))
        profile.effective_elo = 1212.0
        profile.save()

        # Làm ấm cache
        self.assertEqual(EloService.determine_band(1212.0).name, 'normal')
        self.assertIsNotNone(EloService._BAND_CACHE)

        # Owner hạ ngưỡng trusted xuống 1200 (giữ kịch bản test_elo cũ)
        trusted = EloBand.objects.get(name='trusted')
        old_min = trusted.min_elo
        trusted.min_elo = 1200
        trusted.save()
        # Signal đã invalidate → thấy ngay
        self.assertIsNone(EloService._BAND_CACHE)
        self.assertEqual(EloService.determine_band(1212.0).name, 'trusted')

        # Khôi phục
        trusted.min_elo = old_min
        trusted.save()

    def test_get_bands_cached_respects_ordering(self):
        """Danh sách band cache giữ thứ tự Meta ordering ['-min_elo'] —
        fallback 'gần nhất theo min_elo' vẫn đúng."""
        bands = EloService.get_bands_cached(ttl_seconds=60)
        mins = [b.min_elo for b in bands]
        self.assertEqual(mins, sorted(mins, reverse=True))
        # Cache hit — không query thêm (cùng object list)
        bands2 = EloService.get_bands_cached(ttl_seconds=60)
        self.assertIs(bands, bands2)
