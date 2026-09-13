"""
matching/tests/test_distance_scoring.py — Task B + E (2026-09-14):
khoảng cách là MỘT TIÊU CHÍ (15%), KHÔNG quyết định.

1. GPS tươi Hà Nội + job Hà Nội (CP đăng ký Huế) → MATCH (bỏ drift-kill).
2. GPS Hà Nội + job Huế → distance lớn (~580km) → bị hard-drop >80km,
   nhưng CHỈ với job Huế — không bị cấm mọi job.
3. Thiếu tọa độ → điểm distance = 50 (trung tính), KHÔNG còn 100.
4. Gemini re-rank chỉ REORDER top 20, không drop ai.
5. Skill-gating giữ nguyên: Piano không trả gia sư nấu ăn 99 điểm
   (SpecializedSkillGatingTest vẫn xanh — test liên quan giữ đối chiếu).

Chạy: python manage.py test matching.tests.test_distance_scoring --verbosity=2
"""

from datetime import time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.utils import timezone as tz

from matching.models import CarePartnerAvailability, MatchingWeight
from matching.services.elo_service import EloService
from matching.services.matching_service import (
    find_candidates,
    subscore_distance,
)
from matching.tests.base import MatchingTestBase

User = get_user_model()

HUE_LAT, HUE_LNG = 16.4680, 107.5890
HANOI_LAT, HANOI_LNG = 21.0285, 105.7945


class DistanceScoringBase(MatchingTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.day = tz.localdate() + timedelta(days=7)
        cls.weekday = cls.day.weekday()

    def _make_cp(self, name, *, registered=(HUE_LAT, HUE_LNG), gps=None,
                 gps_age_hours=1, skills=('toan',), major='Sư phạm Toán',
                 completed=5, reviews=10, rating=4.5):
        cp = User.objects.create_user(
            name, password='x', role='worker', is_approved=True,
            latitude=registered[0], longitude=registered[1])
        profile = EloService.get_profile(cp)
        profile.skills = list(skills)
        profile.major = major
        profile.rating_avg = rating
        profile.review_count = reviews
        profile.jobs_completed = completed
        if gps is not None:
            cp.current_latitude, cp.current_longitude = gps
            cp.last_gps_updated_at = tz.now() - timedelta(hours=gps_age_hours)
            cp.save(update_fields=['current_latitude', 'current_longitude',
                                   'last_gps_updated_at'])
        profile.save()
        CarePartnerAvailability.objects.create(
            carepartner=cp, weekday=self.weekday,
            time_from=time(17, 0), time_to=time(22, 0))
        return cp

    def _make_job(self, name, *, lat=HANOI_LAT, lng=HANOI_LNG, skills=('toan',)):
        from matching.models import JobPost, JobSlot
        parent = User.objects.create_user(name, password='x', role='parent')
        job = JobPost.objects.create(
            parent=parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='matching', latitude=lat, longitude=lng,
            ai_parse_result={'required_skills': list(skills),
                             'urgency': 'normal'})
        JobSlot.objects.create(job=job, date=self.day,
                               time_from=time(19, 0), time_to=time(21, 0))
        return job


class GpsHanoiMatchesHanoiJobTest(DistanceScoringBase):
    def test_gps_in_hanoi_matches_hanoi_job(self):
        """CP đăng ký Huế, GPS tươi ở Hà Nội, job Hà Nội → VÀO pool (MATCH).

        Trước Task B: bị loại vì drift (Huế→Hà Nội ~580km > MAX_GPS_DRIFT_KM)
        — sai bản chất: CP ĐANG ở Hà Nội thì phải nhận được việc Hà Nội.
        """
        cp = self._make_cp('dist_hn_cp', registered=(HUE_LAT, HUE_LNG),
                           gps=(HANOI_LAT, HANOI_LNG), gps_age_hours=2)
        job = self._make_job('dist_hn_job', lat=HANOI_LAT, lng=HANOI_LNG)
        result = find_candidates(job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)
        # Khoảng cách tính theo GPS HIỆN TẠI (gần job), không phải địa chỉ Huế
        cand = next(c for c in result['candidates']
                    if c['carepartner_id'] == str(cp.pk))
        self.assertIsNotNone(cand['distance_km'])
        self.assertLessEqual(cand['distance_km'], 10.0)

    def test_gps_in_hanoi_far_from_hue_job_hard_dropped(self):
        """Cùng CP đó với job HUẾ (~580km > HARD_DROP 80km) → bị loại.
        Hard-drop chỉ chặn khoảng cách BẤT KHẢ THI, không cấm mọi job
        (test phía trên chứng minh cùng CP vẫn match job Hà Nội)."""
        self._make_cp('dist_hue_cp', registered=(HUE_LAT, HUE_LNG),
                      gps=(HANOI_LAT, HANOI_LNG), gps_age_hours=2)
        job = self._make_job('dist_hue_job', lat=HUE_LAT, lng=HUE_LNG)
        result = find_candidates(job)
        self.assertEqual(result['total_matched'], 0)

    def test_beyond_radius_under_80km_still_scored_with_zero_distance(self):
        """Task B: 25–80km (ngoài bán kính, dưới ngưỡng hard-drop) → KHÔNG bị
        loại, vẫn chấm skill/rating/ELO — chỉ bị trừ điểm distance (0)."""
        # ~40km khỏi job Hà Nội
        far_lat = HANOI_LAT + 0.36
        cp = self._make_cp('dist_40km_cp', registered=(far_lat, HANOI_LNG),
                           gps=None, completed=8, reviews=15, rating=4.8)
        job = self._make_job('dist_40km_job')
        result = find_candidates(job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)
        cand = next(c for c in result['candidates']
                    if c['carepartner_id'] == str(cp.pk))
        self.assertGreater(cand['match_score'], 0)


class MissingCoordsNeutralScoreTest(DistanceScoringBase):
    def test_missing_coords_distance_is_neutral_50_not_100(self):
        """km=None → 50 điểm trung tính (trước đây 100 — thắng cả người gần)."""
        self.assertEqual(subscore_distance(None, 20), 50.0)
        self.assertEqual(subscore_distance(None, 0), 50.0)

    def test_missing_coords_cp_still_in_pool_with_neutral_distance(self):
        cp = self._make_cp('dist_nocoord_cp', registered=(None, None))
        job = self._make_job('dist_nocoord_job')
        result = find_candidates(job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)


class GeminiRerankPreservesTop20Test(DistanceScoringBase):
    def _seed_pool(self, n=12):
        cps = []
        for i in range(n):
            cp = self._make_cp(f'dist_pool_{i:02d}', registered=(HANOI_LAT + i * 0.005, HANOI_LNG),
                               gps=None, completed=3 + i, reviews=5,
                               rating=3.5 + (i % 3) * 0.3)
            cps.append(cp)
        return cps

    def test_gemini_rerank_reorders_but_never_drops(self):
        """Mock Gemini đảo thứ tự → matching giữ ĐỦ thành viên top 20,
        chỉ đổi thứ tự; why_recommended_vi gắn vào từng ứng viên."""
        cps = self._seed_pool(12)
        job = self._make_job('dist_rerank_job')
        # Bỏ mạnh tay ELO để thứ tự rule ổn định theo completed
        MatchingWeight.objects.filter(factor='distance').update(weight_pct=15)

        rule_order = [c['carepartner_id'] for c in
                      find_candidates(job, top_n=20)['candidates']]
        self.assertEqual(len(rule_order), 12)

        reversed_ids = list(reversed(rule_order))
        fake_why = {cid: f'Gemini lí do cho {cid[:8]}' for cid in reversed_ids}

        with mock.patch('matching.services.gemini_service.get_pooled_gemini_client',
                        return_value=object()), \
             mock.patch('matching.services.gemini_service.generate_content_with_fallback',
                        side_effect=lambda *a, **k: (
                            mock.Mock(text='{"order": %s, "why": %s}' % (
                                __import__('json').dumps(reversed_ids),
                                __import__('json').dumps(fake_why))), 'model-x')):
            result = find_candidates(job, top_n=8)

        new_order = [c['carepartner_id'] for c in result['candidates']]
        # Đủ 8 người — KHÔNG drop ai
        self.assertEqual(len(new_order), 8)
        # Gemini đảo thứ tự → đầu danh sách là tail của rule
        self.assertEqual(new_order[0], reversed_ids[0])
        # why_recommended_vi gắn đúng
        cand = result['candidates'][0]
        self.assertTrue(cand.get('why_recommended_vi', '').startswith('Gemini lí do'))

    def test_gemini_down_keeps_rule_order(self):
        """Gemini chết / không có key → thứ tự rule giữ nguyên, matching
        KHÔNG chết (fallback an toàn bắt buộc)."""
        cps = self._seed_pool(4)
        job = self._make_job('dist_noai_job')
        with mock.patch('matching.services.gemini_service.get_pooled_gemini_client',
                        return_value=None):
            result = find_candidates(job, top_n=4)
        self.assertEqual(len(result['candidates']), 4)
        self.assertTrue(all(c.get('why_recommended_vi') == ''
                            for c in result['candidates']))

    def test_specialist_gating_still_blocks_cross_skill(self):
        """Đối chiếu bất biến: Piano job KHÔNG trả gia sư nấu ăn (skill-gating
        phải còn nguyên sau khi bỏ drift-kill)."""
        cook = self._make_cp('dist_cook_cp', skills=('nau_an',),
                             major='Kỹ thuật thực phẩm', gps=None)
        piano_job = self._make_job('dist_piano_job', skills=('dan_piano',))
        result = find_candidates(piano_job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(cook.pk), ids)
