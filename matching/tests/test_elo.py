"""
matching/tests/test_elo.py — Hidden ELO (Prompt 02 Testing Checklist + Step 6 AC).

Bao gồm test grep CI: KHÔNG serializer nào chứa hidden_elo / effective_elo.
"""

import os
import re

from datetime import datetime, timedelta, time, date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from django.test import TestCase
from matching.tests.base import MatchingTestBase

from matching.models import (
    Booking,
    CarePartnerProfile,
    EloBand,
    EloLedger,
    JobPost,
    JobSlot,
)
from matching.services.elo_service import (
    EloService,
    ELO_MIN,
    ELO_MAX,
)

User = get_user_model()


def _freeze(dt):
    """Patcher cho timezone.now."""
    return patch('django.utils.timezone.now', return_value=dt)


class EloBaseTest(MatchingTestBase):
    def setUp(self):
        self.cp = User.objects.create_user('cp', password='x', role='worker',
                                           is_approved=True)
        self.parent = User.objects.create_user('p', password='x', role='parent')
        self.profile = EloService.get_profile(self.cp)

    def _make_booking(self, status='completed'):
        job = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                     hourly_rate_vnd=100000)
        JobSlot.objects.create(job=job, date=date(2026, 9, 14),
                               time_from=time(19, 0), time_to=time(21, 0))
        return Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status=status, total_value_vnd=200000,
            selected_at=tz.now(), commit_deadline=tz.now())


class NewProfileTest(EloBaseTest):
    def test_new_cp_is_1200_normal_band(self):
        effective, band = EloService.recompute(self.profile)
        self.assertEqual(effective, 1200.0)
        self.assertEqual(band.name, 'normal')
        # Band normal phủ 1050-1249 đúng spec
        self.assertEqual(band.min_elo, 1050)
        self.assertEqual(band.max_elo, 1249)


class IdempotencyTest(EloBaseTest):
    def test_same_event_twice_one_delta(self):
        booking = self._make_booking()
        ledger1, applied1 = EloService.apply_event(self.cp, 'job_completed', booking=booking)
        ledger2, applied2 = EloService.apply_event(self.cp, 'job_completed', booking=booking)
        self.assertTrue(applied1)
        self.assertFalse(applied2)
        self.assertEqual(ledger1.pk, ledger2.pk)
        self.assertEqual(
            EloLedger.objects.filter(booking=booking, reason_code='job_completed').count(), 1)
        # Chỉ +12 một lần
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.effective_elo, 1212.0)

    def test_reward_sum_across_events(self):
        """1200 → 3 job 5 sao → 1200 + 36(job) + 30(review_5) + 8(streak_3) = 1274 → good."""
        for i in range(3):
            booking = self._make_booking()
            EloService.record_completion(self.cp, booking)
            EloService.apply_event(self.cp, 'review_5', booking=booking)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.effective_elo, 1274.0)
        self.assertEqual(self.profile.band.name, 'good')


class DecayTest(EloBaseTest):
    def _apply_t5_backdated(self, days_ago):
        booking = self._make_booking(status='no_show')
        past = tz.now() - timedelta(days=days_ago, hours=1)
        with patch('django.utils.timezone.now', return_value=past):
            EloService.apply_event(self.cp, 'T5', booking=booking)
        return booking

    def test_decay_boundary_exact(self):
        """30d23h59 ×1.00; 31d ×0.60; 90d23h59 ×0.60; 91d ×0.25;
        180d23h59 ×0.25; 181d ×0.00."""
        now = tz.now()
        cases = [
            (timedelta(days=30, hours=23, minutes=59), 0.60),  # -150 → -90.0 → clamp watch
            (timedelta(days=31, minutes=1), 0.60),
            (timedelta(days=90, hours=23, minutes=59), 0.25),
            (timedelta(days=181, minutes=1), 0.00),
        ]
        # Kiểm tra trực tiếp _decay_factor (biên theo NGÀY)
        f = EloService._decay_factor(now - timedelta(days=30, hours=23, minutes=59), now)
        self.assertEqual(f, 1.00)
        f = EloService._decay_factor(now - timedelta(days=31, minutes=1), now)
        self.assertEqual(f, 0.60)
        f = EloService._decay_factor(now - timedelta(days=90, hours=23, minutes=59), now)
        self.assertEqual(f, 0.60)
        f = EloService._decay_factor(now - timedelta(days=91, minutes=1), now)
        self.assertEqual(f, 0.25)
        f = EloService._decay_factor(now - timedelta(days=180, hours=23, minutes=59), now)
        self.assertEqual(f, 0.25)
        f = EloService._decay_factor(now - timedelta(days=181, minutes=1), now)
        self.assertEqual(f, 0.00)

    def test_backdated_penalty_100_days(self):
        """-150 backdate 100 ngày → ×0.25 = -37.5."""
        booking = self._make_booking(status='no_show')
        EloService.apply_event(self.cp, 'T5', booking=booking)
        # Backdate row ledger 100 ngày (mô phỏng penalty cũ)
        past = tz.now() - timedelta(days=100, hours=2)
        EloLedger.objects.filter(booking=booking, reason_code='T5').update(created_at=past)
        eff, _band = EloService.recompute(self.profile)
        self.assertEqual(eff, 1162.5)

    def test_backdate_200_days_ignored(self):
        booking = self._make_booking(status='no_show')
        EloService.apply_event(self.cp, 'T5', booking=booking)
        past = tz.now() - timedelta(days=200, hours=2)
        EloLedger.objects.filter(booking=booking, reason_code='T5').update(created_at=past)
        eff, _band = EloService.recompute(self.profile)
        self.assertEqual(eff, 1200.0)


class CooldownTest(EloBaseTest):
    def test_reward_half_during_7day_cooldown(self):
        """Job 3 ngày sau no-show → +12 chỉ tính +6 (50%)."""
        booking = self._make_booking(status='no_show')
        EloService.apply_event(self.cp, 'T5', booking=booking)
        later = tz.now() + timedelta(days=3)
        with _freeze(later):
            good_booking = self._make_booking()
            EloService.apply_event(self.cp, 'job_completed', booking=good_booking)
        self.profile.refresh_from_db()
        # 1200 - 150 + 6 = 1056
        self.assertEqual(self.profile.effective_elo, 1056.0)

    def test_full_reward_after_cooldown(self):
        booking = self._make_booking(status='no_show')
        EloService.apply_event(self.cp, 'T5', booking=booking)
        later = tz.now() + timedelta(days=8)
        with _freeze(later):
            good_booking = self._make_booking()
            EloService.apply_event(self.cp, 'job_completed', booking=good_booking)
        self.profile.refresh_from_db()
        # 1200 - 150 + 12 = 1062
        self.assertEqual(self.profile.effective_elo, 1062.0)


class BandGateTest(EloBaseTest):
    def _set_effective(self, value):
        self.profile.effective_elo = value
        band = EloService.determine_band(value)
        self.profile.band = band
        self.profile.save()
        return band

    def test_t5_drops_to_watch(self):
        EloService.apply_event(self.cp, 'T5')  # booking None OK cho test đơn giản
        self.profile.refresh_from_db()
        # 1200 - 150 = 1050 → đúng biên dưới normal (1050-1249)
        self.assertEqual(self.profile.effective_elo, 1050.0)
        self.assertEqual(self.profile.band.name, 'normal')
        # Thêm T3 (-50) → 1000 → watch (850-1049)
        EloService.apply_event(self.cp, 'T3')
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.effective_elo, 1000.0)
        self.assertEqual(self.profile.band.name, 'watch')

    def test_blocked_never_matchable(self):
        band = self._set_effective(500)
        self.assertEqual(band.name, 'blocked')
        self.assertFalse(EloService.is_matchable(self.profile))

    def test_restricted_pool_rule(self):
        band = self._set_effective(700)
        self.assertEqual(band.name, 'restricted')
        self.assertFalse(EloService.is_allowed_in_pool(self.profile, pool_size=8))
        self.assertTrue(EloService.is_allowed_in_pool(self.profile, pool_size=3))

    def test_effective_clamped(self):
        """Ledger tổng ±5000 → effective vẫn nằm [400, 2000]."""
        for _ in range(100):
            EloService.apply_event(self.cp, 'job_completed', delta_override=50)
        self.profile.refresh_from_db()
        eff, _ = EloService.recompute(self.profile)
        self.assertEqual(eff, float(ELO_MAX))

        for _ in range(100):
            EloService.apply_event(self.cp, 'T5', delta_override=-50)
        self.profile.refresh_from_db()
        eff, _ = EloService.recompute(self.profile)
        self.assertEqual(eff, float(ELO_MIN))


class ThrottleTest(EloBaseTest):
    def test_watch_band_max_4_proposals(self):
        from matching.models import CandidateProposal, JobPost
        band = EloBand.objects.get(name='watch')
        self.profile.band = band
        self.profile.effective_elo = 900
        self.profile.save()
        for i in range(3):
            job = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                         hourly_rate_vnd=100000)
            CandidateProposal.objects.create(job=job, carepartner=self.cp)
        self.assertTrue(EloService.can_receive_proposal(self.cp))  # 3 < 4
        job4 = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                      hourly_rate_vnd=100000)
        CandidateProposal.objects.create(job=job4, carepartner=self.cp)
        # Đề xuất thứ 5 trong ngày → bị chặn (band watch max 4)
        self.assertFalse(EloService.can_receive_proposal(self.cp))

    def test_paused_not_matchable(self):
        self.profile.matching_paused = True
        self.profile.save()
        self.assertFalse(EloService.can_receive_proposal(self.cp))


class FastAckTest(EloBaseTest):
    def test_fast_ack_once_per_day(self):
        ledger1, applied1 = EloService.apply_event(self.cp, 'fast_ack')
        ledger2, applied2 = EloService.apply_event(self.cp, 'fast_ack')
        self.assertTrue(applied1)
        self.assertFalse(applied2)


class ELOLeakTest(MatchingTestBase):
    """Step 6 AC3 — grep CI: serializer/api cấm hidden_elo & effective_elo."""

    def test_no_elo_leak_in_serializers_and_api(self):
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        offenders = []
        for sub in ('matching/serializers.py', 'matching/api'):
            path = os.path.join(root, sub)
            if os.path.isfile(path):
                files = [path]
            else:
                files = [os.path.join(path, f) for f in os.listdir(path) if f.endswith('.py')]
            for fp in files:
                with open(fp, encoding='utf-8') as fh:
                    content = fh.read()
                if re.search(r'hidden_elo|effective_elo', content):
                    offenders.append(fp)
        self.assertEqual(offenders, [],
                         f'Serializer/API leaked ELO fields: {offenders}')

    def test_trust_api_has_no_numbers(self):
        from rest_framework.test import APIClient
        user = User.objects.create_user('trustcp', password='x', role='worker',
                                        is_approved=True)
        EloService.get_profile(user)
        EloService.apply_event(user, 'job_completed')
        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.get('/api/matching/carepartner/trust/')
        self.assertEqual(resp.status_code, 200)
        body = resp.content.decode('utf-8')
        for banned in ('hidden_elo', 'effective_elo', '"1200"', '1200.0'):
            self.assertNotIn(banned, body)
        self.assertIn('band_label_vi', body)


class BandRecomputeTest(EloBaseTest):
    def test_change_band_threshold_no_deploy(self):
        """Sửa EloBand trong DB → band recompute theo dữ liệu mới, không deploy."""
        trusted = EloBand.objects.get(name='trusted')
        self.profile.effective_elo = 1212.0
        EloService.recompute(self.profile)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.band.name, 'normal')  # ban đầu

        # Owner hạ ngưỡng trusted xuống 1200
        trusted.min_elo = 1200
        trusted.save()

        eff, band = EloService.recompute(self.profile)
        self.assertEqual(band.name, 'trusted')  # không cần deploy
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.band.name, 'trusted')
