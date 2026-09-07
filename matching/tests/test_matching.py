"""
matching/tests/test_matching.py — Matching Engine 7-factor (Prompt 07 checklist,
Step 2.6 Testing Checklist).
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone as tz

from matching.models import (
    CarePartnerProfile,
    JobPost,
    JobSlot,
    MatchingWeight,
)
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase
from matching.services.matching_service import (
    find_candidates,
    subscore_availability,
    subscore_completion,
    subscore_distance,
    subscore_elo,
    subscore_rating,
    subscore_response,
    subscore_skills,
)

User = get_user_model()

MONDAY = date(2026, 9, 14)


class SubscoreTest(MatchingTestBase):
    def test_rating_newcomer_blend(self):
        """review_count < 3 → blend 0.6×base + 0.4×60."""
        self.assertEqual(subscore_rating(5.0, 0), 5.0 / 5 * 100 * 0.6 + 60 * 0.4)
        self.assertEqual(subscore_rating(4.0, 2), 80 * 0.6 + 24)

    def test_rating_full_history(self):
        self.assertEqual(subscore_rating(4.0, 10), 80.0)

    def test_completion_newcomer_70(self):
        self.assertEqual(subscore_completion(0, 0, 0), 70.0)

    def test_completion_rate(self):
        self.assertEqual(subscore_completion(8, 2, 0), 80.0)

    def test_response_newcomer_60(self):
        self.assertEqual(subscore_response(0, 0), 60.0)

    def test_elo_clamp(self):
        self.assertEqual(subscore_elo(1450), 100.0)
        self.assertEqual(subscore_elo(650), 0.0)
        self.assertEqual(subscore_elo(2000), 120.0)  # cap 120
        self.assertEqual(subscore_elo(100), 0.0)

    def test_distance_decay_and_vehicle(self):
        # bán kính 20km: 10km → 50 điểm
        self.assertEqual(subscore_distance(10, 20), 50.0)
        # có xe: 10km hiệu quả = 7.5km → 62.5 điểm
        self.assertAlmostEqual(subscore_distance(10, 20, has_vehicle=True), 62.5)
        self.assertEqual(subscore_distance(25, 20), 0.0)

    def test_skills_jaccard_major_bonus(self):
        s = subscore_skills(['toan', 'tieu_hoc'], ['toan', 'kien_nhan'],
                            'Sư phạm Toán', 'tutoring')
        # jaccard 1/3 → 60×(1/3) + 40×1 = 60.0
        self.assertAlmostEqual(s, 60.0)

    def test_availability(self):
        self.assertEqual(subscore_availability(3, 3), 100.0)
        self.assertEqual(subscore_availability(1, 2), 50.0)


class MatchingBaseTest(MatchingTestBase):
    def setUp(self):
        self.parent = User.objects.create_user('p', password='x', role='parent',
                                               latitude=21.0, longitude=105.8)
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='ai_parsed', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))

    def _seed_cp(self, name, *, avail=True, lat=21.0, lng=105.8, rating=0.0,
                 reviews=0, skills=None, school='', major='', effective=None,
                 completed=0, cancelled=0, no_show=0, radius=None, band=None):
        cp = User.objects.create_user(name, password='x', role='worker',
                                      is_approved=True, latitude=lat, longitude=lng)
        profile = EloService.get_profile(cp)
        if avail:
            from matching.models import CarePartnerAvailability
            CarePartnerAvailability.objects.create(
                carepartner=cp, weekday=MONDAY.weekday(),
                time_from=time(18, 0), time_to=time(22, 0))
        profile.rating_avg = rating
        profile.review_count = reviews
        profile.skills = skills or []
        profile.school = school
        profile.major = major
        profile.jobs_completed = completed
        profile.jobs_cancelled = cancelled
        profile.jobs_no_show = no_show
        if effective is not None:
            profile.effective_elo = effective
        profile.save()
        if band:
            from matching.models import EloBand
            profile.band = EloBand.objects.get(name=band)
            profile.save()
        if radius:
            profile.max_radius_km = radius
            profile.save()
        return cp


class HardFilterTest(MatchingBaseTest):
    def test_spec_case_ABC(self):
        """Step 2.6: A (Mon 18-22, 4.9 sao, 1km) top; B (4.2, 8km) mid;
        C (không rảnh) bị loại."""
        a = self._seed_cp('cpa', rating=4.9, reviews=10, effective=1250,
                          skills=['toan'], major='Sư phạm Toán',
                          lat=21.009, lng=105.8, school='DHSPHN')
        b = self._seed_cp('cpb', rating=4.2, reviews=10, effective=1100,
                          lat=21.08, lng=105.8)
        c = self._seed_cp('cpc', avail=False, rating=5.0, reviews=10)

        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertEqual(result['total_matched'], 2)
        self.assertEqual(ids[0], str(a.pk))
        self.assertEqual(ids[1], str(b.pk))
        self.assertNotIn(str(c.pk), ids)

    def test_blocked_excluded(self):
        self._seed_cp('blockedcp', effective=500, band='blocked',
                      rating=4.9, reviews=10)
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 0)

    def test_paused_excluded(self):
        cp = self._seed_cp('pausedcp')
        profile = CarePartnerProfile.objects.get(user=cp)
        profile.matching_paused = True
        profile.save()
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 0)

    def test_out_of_radius_excluded(self):
        self._seed_cp('farcpp', lat=21.5, lng=106.2, radius=20)  # ~65km
        near = self._seed_cp('nearcp', lat=21.01, lng=105.8)
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn('farcpp', ids)
        self.assertIn(str(near.pk), ids)

    def test_booked_slot_excluded(self):
        """CP có booking trùng slot → loại (Step 2.2.1 #3)."""
        cp = self._seed_cp('busycp')
        job2 = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                      hourly_rate_vnd=100000)
        JobSlot.objects.create(job=job2, date=MONDAY, time_from=time(19, 0),
                               time_to=time(21, 0))
        from matching.models import Booking
        Booking.objects.create(job=job2, carepartner=cp, parent=self.parent,
                               status='committed', total_value_vnd=100000,
                               selected_at=tz.now(), commit_deadline=tz.now())
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 0)


class ScoringTest(MatchingBaseTest):
    def test_max_8_and_total_matched(self):
        """10 CP đủ điều kiện → trả 8 + total_matched 10 (Step 2 AC4)."""
        for i in range(10):
            self._seed_cp(f'bulk{i:02d}', rating=4.0, reviews=5)
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 10)
        self.assertEqual(len(result['candidates']), 8)

    def test_weights_from_db_change_ranking(self):
        """Đổi W_DISTANCE từ 15 → 25 → ranking đổi không cần deploy (Step 11.6)."""
        far = self._seed_cp('farhigh', rating=4.9, reviews=10, effective=1300,
                            lat=21.06, lng=105.8)  # ~7km
        near = self._seed_cp('nearlow', rating=4.0, reviews=10, effective=1100,
                             lat=21.001, lng=105.8)  # ~0.1km
        r1 = find_candidates(self.job)
        ids1 = [c['carepartner_id'] for c in r1['candidates']]
        # với distance 15%: far thắng nhờ rating+elo
        self.assertEqual(ids1[0], str(far.pk))

        MatchingWeight.objects.filter(factor='distance').update(weight_pct=25)
        MatchingWeight.objects.filter(factor='rating').update(weight_pct=5)
        r2 = find_candidates(self.job)
        ids2 = [c['carepartner_id'] for c in r2['candidates']]
        # với distance 25%: near thắng nhờ gần
        self.assertEqual(ids2[0], str(near.pk))
        # restore
        MatchingWeight.objects.filter(factor='distance').update(weight_pct=15)
        MatchingWeight.objects.filter(factor='rating').update(weight_pct=15)

    def test_newcomer_not_excluded(self):
        """CP mới 0 review 0 đơn vẫn xuất hiện với neutral defaults (Step 2 AC6)."""
        newbie = self._seed_cp('newbie')
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(newbie.pk), ids)
        cand = next(c for c in result['candidates'] if c['carepartner_id'] == str(newbie.pk))
        self.assertEqual(cand['completed_jobs'], 0)

    def test_match_level_vi_in_candidates(self):
        """match_level tiếng Việt hiển thị (Step 3 + master prompt AC)."""
        self._seed_cp('goodcp', rating=4.9, reviews=10, effective=1500,
                      skills=['toan'], major='Sư phạm', band='trusted')
        result = find_candidates(self.job)
        cand = result['candidates'][0]
        self.assertIn('match_level_vi', cand)
        self.assertTrue(cand['match_level_vi'])

    def test_proposals_logged(self):
        """Matching ghi CandidateProposal (throttle ELO dùng)."""
        self._seed_cp('logcp')
        find_candidates(self.job)
        from matching.models import CandidateProposal
        self.assertTrue(CandidateProposal.objects.filter(job=self.job).exists())

    def test_api_contract_fields(self):
        """Response đúng schema Step 2.4."""
        self._seed_cp('cpc', rating=4.5, reviews=6)
        result = find_candidates(self.job)
        cand = result['candidates'][0]
        for field in ('carepartner_id', 'display_name', 'rating', 'completed_jobs',
                      'distance_km', 'match_score', 'match_level', 'top_skills',
                      'latest_review', 'response_tag', 'availability_fit'):
            self.assertIn(field, cand)
