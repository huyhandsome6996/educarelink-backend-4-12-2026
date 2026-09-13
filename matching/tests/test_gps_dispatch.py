"""
matching/tests/test_gps_dispatch.py — Test GPS real-time guard + giao thoa
Defect 1 × Defect 4 (IM brief 2026-09-13, mục VERIFICATION & ACCEPTANCE).

Kiểm thử:
1. Job "Ngữ văn" tại TP. Huế match thành công gia sư chuyên Ngữ Văn (Defect 1).
2. CarePartner đăng ký ở Huế nhưng GPS real-time đang ở Hà Nội → bị loại
   khỏi matching job Huế (Defect 4 — guard MAX_GPS_DRIFT_KM).
3. GPS quá hạn (> GPS_FRESHNESS_HOURS) → fallback vị trí đăng ký tĩnh →
   không bị loại oan.
4. TEST GIAO THOA (bắt buộc): gia sư Văn khớp skill hoàn hảo (Defect 1)
   nhưng GPS real-time đang ở Hà Nội (Defect 4) → PHẢI bị loại — đảm bảo
   2 fix không "che" lẫn nhau.
5. Job cũ thiếu child_grade_level trong type_data → matching không crash,
   xử lý như không giới hạn cấp học (Defect 3).

Chạy: python manage.py test matching.tests.test_gps_dispatch --verbosity=2
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone as tz

from matching.models import JobPost, JobSlot
from matching.services.matching_service import (
    find_candidates,
    get_effective_coordinates,
)
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase

User = get_user_model()

# Huế — TP. Huế, quanh đường Lê Lợi
HUE_LAT, HUE_LNG = 16.4680, 107.5890
# Hà Nội — quanh Cầu Giấy
HANOI_LAT, HANOI_LNG = 21.0285, 105.7945
MONDAY = date(2026, 9, 14)


class GpsDispatchTestBase(MatchingTestBase):
    """Dữ liệu chung: job gia sư Ngữ văn tại Huế + phụ huynh Huế."""

    def setUp(self):
        self.parent = User.objects.create_user(
            'parent_hue', password='x', role='parent',
            latitude=HUE_LAT, longitude=HUE_LNG)
        self.job = self._make_van_job()

    def _make_van_job(self, type_data=None):
        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring',
            title='Gia sư Ngữ văn lớp 4',
            hourly_rate_vnd=120000, status='ai_parsed',
            latitude=HUE_LAT, longitude=HUE_LNG,
            type_data=type_data if type_data is not None else {
                'subject': 'Ngữ văn', 'child_grade_level': 'primary_grade_1_5'},
            ai_parse_result={'required_skills': ['van', 'tieng_viet'],
                             'urgency': 'normal'})
        JobSlot.objects.create(job=job, date=MONDAY,
                               time_from=time(18, 0), time_to=time(20, 0))
        return job

    def _seed_literature_cp(self, name, *, registered=(HUE_LAT, HUE_LNG),
                            gps=None, gps_age_hours=None, rating=4.95,
                            reviews=20, effective=1510):
        """Gia sư Văn tại Huế — skill + major khớp hoàn hảo (Defect 1 seed).

        gps=(lat, lng) + gps_age_hours -> đặt current_latitude/longitude +
        last_gps_updated_at = now - gps_age_hours (None = chưa từng sync GPS).
        """
        cp = User.objects.create_user(
            name, password='x', role='worker', is_approved=True,
            latitude=registered[0], longitude=registered[1])
        profile = EloService.get_profile(cp)
        from matching.models import CarePartnerAvailability
        CarePartnerAvailability.objects.create(
            carepartner=cp, weekday=MONDAY.weekday(),
            time_from=time(17, 0), time_to=time(21, 30))
        profile.skills = ['van', 'ngu_van', 'tieng_viet', 'luyen_chu_dep', 'tieu_hoc']
        profile.major = 'Sư phạm Ngữ Văn (Năm 3)'
        profile.school = 'Đại học Sư Phạm - Đại học Huế'
        profile.rating_avg = rating
        profile.review_count = reviews
        profile.effective_elo = effective
        if gps is not None:
            profile.user.current_latitude = gps[0]
            profile.user.current_longitude = gps[1]
            profile.user.last_gps_updated_at = (
                tz.now() - timedelta(hours=gps_age_hours) if gps_age_hours is not None
                else tz.now())
            profile.user.save(update_fields=['current_latitude',
                                             'current_longitude',
                                             'last_gps_updated_at'])
        profile.save()
        return cp


class LiteratureTutorMatchTest(GpsDispatchTestBase):
    """Defect 1 — job 'Ngữ văn' tại TP. Huế phải match gia sư Văn Huế."""

    def test_van_job_matches_literature_tutor_in_hue(self):
        """Job Ngữ văn lớp 4 tại Huế match carepartner_van_hue (skill + major)."""
        cp = self._seed_literature_cp('cp_van_hue_1')
        result = find_candidates(self.job)
        self.assertGreaterEqual(result['total_matched'], 1)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)
        cand = next(c for c in result['candidates'] if c['carepartner_id'] == str(cp.pk))
        self.assertEqual(cand['school'], 'Đại học Sư Phạm - Đại học Huế')

    def test_van_job_major_only_tutor_retained_with_cap(self):
        """Gia sư major Ngữ Văn nhưng chưa khai báo skill → vẫn giữ lại (cap <=68)."""
        cp = self._seed_literature_cp('cp_van_major_only', effective=1250)
        from matching.models import CarePartnerProfile
        CarePartnerProfile.objects.filter(user=cp).update(skills=[])
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)
        cand = next(c for c in result['candidates'] if c['carepartner_id'] == str(cp.pk))
        self.assertLessEqual(cand['match_score'], 68)


class GpsDriftGuardTest(GpsDispatchTestBase):
    """Defect 4 — GPS real-time xa vị trí đăng ký → loại khỏi match pool."""

    def test_cp_registered_in_hue_with_gps_in_hanoi_excluded(self):
        """CP đăng ký Huế, GPS real-time (48h) đang ở Hà Nội → bị loại job Huế."""
        cp = self._seed_literature_cp('cp_gps_hanoi',
                                      gps=(HANOI_LAT, HANOI_LNG),
                                      gps_age_hours=2)
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(cp.pk), ids)
        self.assertEqual(result['total_matched'], 0)

    def test_stale_gps_falls_back_to_registered_location(self):
        """GPS quá hạn (> GPS_FRESHNESS_HOURS=48h) → fallback vị trí đăng ký → không loại oan."""
        cp = self._seed_literature_cp('cp_gps_stale',
                                      gps=(HANOI_LAT, HANOI_LNG),
                                      gps_age_hours=49)
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)

    def test_fresh_gps_near_job_used_for_distance(self):
        """GPS tươi gần job → dùng GPS; khoảng cách phản ánh GPS chứ không phải địa chỉ đăng ký."""
        # GPS lệch 1km so với job; đăng ký lệch 10km
        registered = (HUE_LAT + 0.09, HUE_LNG)   # ~10km xa job
        gps_near = (HUE_LAT + 0.009, HUE_LNG)    # ~1km
        cp = self._seed_literature_cp('cp_gps_near', registered=registered,
                                      gps=gps_near, gps_age_hours=1)
        result = find_candidates(self.job)
        cand = next(c for c in result['candidates']
                    if c['carepartner_id'] == str(cp.pk))
        self.assertLessEqual((cand['distance_km'] or 99), 5.0)

    def test_get_effective_coordinates_semantics(self):
        """get_effective_coordinates: GPS tươi → GPS; quá hạn/thiếu → đăng ký tĩnh."""
        cp = self._seed_literature_cp('cp_eff_coord',
                                      gps=(HANOI_LAT, HANOI_LNG), gps_age_hours=1)
        u = User.objects.get(username='cp_eff_coord')
        lat, lng, from_gps = get_effective_coordinates(u)
        self.assertTrue(from_gps)
        self.assertAlmostEqual(lat, HANOI_LAT)
        # Quá hạn 49h → fallback
        u.last_gps_updated_at = tz.now() - timedelta(hours=49)
        u.save(update_fields=['last_gps_updated_at'])
        lat, lng, from_gps = get_effective_coordinates(u)
        self.assertFalse(from_gps)
        self.assertAlmostEqual(lat, HUE_LAT)
        # Chưa từng sync GPS → fallback
        u2 = User.objects.get(username='parent_hue')
        lat, lng, from_gps = get_effective_coordinates(u2)
        self.assertFalse(from_gps)


class CrossoverDefect1xDefect4Test(GpsDispatchTestBase):
    """TEST GIAO THOA (bắt buộc theo IM brief): Defect 1 fix và Defect 4 fix
    không được 'che' lẫn nhau.

    Kịch bản: gia sư Văn đăng ký ở Huế, có skill Văn khớp HOÀN HẢO (defect 1
    đã fix — không còn bị loại vì thiếu gia sư Văn), NHƯNG GPS real-time đang
    ở Hà Nội trong 48h gần nhất (defect 4) → tutor này PHẢI bị loại khỏi job
    Văn ở Huế dù match skill hoàn hảo.
    """

    def test_perfect_skill_tutor_with_far_gps_excluded(self):
        cp = self._seed_literature_cp('cp_crossover',
                                      gps=(HANOI_LAT, HANOI_LNG),
                                      gps_age_hours=3)
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        # Defect 1: skill/major khớp hoàn hảo KHÔNG cứu được khi GPS drift (Defect 4)
        self.assertNotIn(str(cp.pk), ids)
        self.assertEqual(result['candidates'], [])

    def test_perfect_skill_tutor_with_near_gps_still_matched(self):
        """Đối xứng: cùng tutor đó, GPS tươi TẠI Huế → vẫn match (fix Defect 4
        không vô hiệu fix Defect 1)."""
        cp = self._seed_literature_cp('cp_crossover_near',
                                      gps=(HUE_LAT + 0.005, HUE_LNG + 0.005),
                                      gps_age_hours=1)
        result = find_candidates(self.job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)


class LegacyJobWithoutGradeLevelTest(GpsDispatchTestBase):
    """Defect 3 — JobPost cũ thiếu child_grade_level trong type_data:
    matching KHÔNG crash, xử lý như không giới hạn cấp học."""

    def test_legacy_job_type_data_missing_field_no_crash(self):
        """type_data không có key child_grade_level → find_candidates chạy bình thường."""
        legacy_job = self._make_van_job(type_data={'subject': 'Ngữ văn'})  # KHÔNG có grade
        cp = self._seed_literature_cp('cp_legacy_grade')
        result = find_candidates(legacy_job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)

    def test_legacy_job_empty_grade_treated_as_unrestricted(self):
        """child_grade_level='' (payload cũ bỏ trống) → hành vi như không giới hạn."""
        legacy_job = self._make_van_job(type_data={'subject': 'Ngữ văn',
                                                   'child_grade_level': ''})
        cp = self._seed_literature_cp('cp_legacy_grade_empty')
        result = find_candidates(legacy_job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)

    def test_legacy_job_major_generic_still_gets_bonus(self):
        """Job cũ không grade: major sư phạm chung vẫn nhận bonus như trước Defect 3."""
        legacy_job = self._make_van_job(type_data={'subject': 'Toán'})
        legacy_job.ai_parse_result = {'required_skills': ['toan'], 'urgency': 'normal'}
        legacy_job.save()
        cp = User.objects.create_user('cp_generic_sp', password='x',
                                      role='worker', is_approved=True,
                                      latitude=HUE_LAT, longitude=HUE_LNG)
        profile = EloService.get_profile(cp)
        from matching.models import CarePartnerAvailability
        CarePartnerAvailability.objects.create(
            carepartner=cp, weekday=MONDAY.weekday(),
            time_from=time(17, 0), time_to=time(21, 30))
        profile.skills = ['toan']
        profile.major = 'Sư phạm Toán học'
        profile.save()
        result = find_candidates(legacy_job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(cp.pk), ids)
