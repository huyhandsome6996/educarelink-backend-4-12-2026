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
    _major_match_bonus,
    find_candidates,
    match_level_of,
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
        """Đặc tả Mục 4: review_count == 0 -> 60.0 trung tính;
        review_count < 3 -> blend 0.6×base + 0.4×60."""
        self.assertEqual(subscore_rating(0.0, 0), 60.0)
        self.assertEqual(subscore_rating(None, 0), 60.0)
        self.assertEqual(subscore_rating(5.0, 1), 5.0 / 5 * 100 * 0.6 + 60 * 0.4)
        self.assertEqual(subscore_rating(4.0, 2), 80 * 0.6 + 24)

    def test_rating_full_history(self):
        self.assertEqual(subscore_rating(4.0, 10), 80.0)

    def test_completion_newcomer_100(self):
        """Đặc tả Mục 4: người mới chưa có đơn — mặc định 100.0%."""
        self.assertEqual(subscore_completion(0, 0, 0), 100.0)

    def test_match_level_thresholds(self):
        """Đặc tả Mục 5: ngưỡng nhãn 90/75/60 — nhãn phản ánh đúng điểm số."""
        self.assertEqual(match_level_of(95), 'very_high')
        self.assertEqual(match_level_of(90), 'very_high')
        self.assertEqual(match_level_of(89), 'high')
        self.assertEqual(match_level_of(75), 'high')
        self.assertEqual(match_level_of(74), 'medium')
        self.assertEqual(match_level_of(60), 'medium')
        self.assertEqual(match_level_of(59), 'low')
        self.assertEqual(match_level_of(40), 'low')

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
        profile.skills = ['toan'] if skills is None else skills
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


class GenderHardFilterTest(MatchingBaseTest):
    """ITEM #1 (A3) — Hard filter #5 giới tính (flow1-step2-matching-engine.md dòng 57).

    Parent yêu cầu giới tính cụ thể (childcare/pickup) → CP khác giới bị LOẠI trước
    khi chấm điểm; CP chưa khai báo gender KHÔNG bị chặn (newcomer-friendly);
    tutoring KHÔNG BAO GIỜ lọc giới tính (bất biến Step 11.4 — 2 lớp upstream ở
    jobs.py + gemini_service.py, và lớp phòng thủ thứ 3 ngay trong find_candidates).
    """

    def setUp(self):
        self.parent = User.objects.create_user('gp', password='x', role='parent',
                                               latitude=21.0, longitude=105.8)
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='childcare', hourly_rate_vnd=100000,
            status='ai_parsed', latitude=21.0, longitude=105.8,
            gender_preference='female',
            ai_parse_result={'required_skills': [], 'urgency': 'normal'})
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))

    def _seed_cp_with_gender(self, name, gender):
        cp = self._seed_cp(name)
        profile = CarePartnerProfile.objects.get(user=cp)
        profile.gender = gender
        profile.save()
        return cp

    def test_male_excluded_when_parent_requires_female(self):
        """CP nam phải bị loại khỏi candidates khi parent yêu cầu 'female'."""
        self._seed_cp_with_gender('malecp', 'male')
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 0)
        self.assertEqual(result['candidates'], [])

    def test_female_included_when_parent_requires_female(self):
        """CP nữ đúng yêu cầu giới tính vẫn vào pool bình thường."""
        f = self._seed_cp_with_gender('femalecp', 'female')
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 1)
        self.assertEqual([c['carepartner_id'] for c in result['candidates']],
                         [str(f.pk)])

    def test_filter_selective_in_mixed_pool(self):
        """Pool trộn giới tính: chỉ CP đúng giới tính được giữ — filter mang tính chọn lọc."""
        self._seed_cp_with_gender('malecp2', 'male')
        f = self._seed_cp_with_gender('femalecp2', 'female')
        result = find_candidates(self.job)
        self._assert_excluded(result, 'malecp2')
        self.assertIn(str(f.pk), [c['carepartner_id'] for c in result['candidates']])

    def _assert_excluded(self, result, username):
        u = User.objects.get(username=username)
        self.assertNotIn(str(u.pk), [c['carepartner_id'] for c in result['candidates']])

    def test_unset_gender_not_blocked(self):
        """CP chưa khai báo gender (blank) KHÔNG bị auto-reject — newcomer-friendly."""
        u = self._seed_cp('unsetcp')  # gender mặc định ''
        profile = CarePartnerProfile.objects.get(user=u)
        self.assertEqual(profile.gender, '')
        result = find_candidates(self.job)
        self.assertEqual([c['carepartner_id'] for c in result['candidates']],
                         [str(u.pk)])

    def test_no_gender_preference_includes_everyone(self):
        """Parent không yêu cầu giới tính → không ai bị loại vì lý do giới tính."""
        self.job.gender_preference = ''
        self.job.save()
        self._seed_cp_with_gender('malecp3', 'male')
        f = self._seed_cp_with_gender('femalecp3', 'female')
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 2)

    def test_pickup_job_type_also_filters(self):
        """Hard filter áp cho cả job_type='pickup' (không chỉ childcare)."""
        self.job.job_type = 'pickup'
        self.job.save()
        self._seed_cp_with_gender('malecp4', 'male')
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 0)

    def test_tutoring_never_filters_gender(self):
        """Bất biến Step 11.4: kể cả gender_preference 'lọt' vào job tutoring
        (ghi thẳng DB — vượt 2 lớp upstream jobs.py + gemini_service.py) thì CP
        nam vẫn KHÔNG bị loại khi parent đăng gia sư yêu cầu 'female'."""
        tutoring_job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='ai_parsed', latitude=21.0, longitude=105.8,
            gender_preference='female',  # simulating upstream bypass
            ai_parse_result={'required_skills': [], 'urgency': 'normal'})
        JobSlot.objects.create(job=tutoring_job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        m = self._seed_cp_with_gender('malecp5', 'male')
        result = find_candidates(tutoring_job)
        self.assertEqual([c['carepartner_id'] for c in result['candidates']],
                         [str(m.pk)])


class SpecializedSkillGatingTest(MatchingBaseTest):
    """Regression & Bug tests cho kỹ năng môn đặc thù (Piano, Múa, Vẽ, Ngoại ngữ...).
    
    Ngăn chặn tuyệt đối việc gán CarePartner không liên quan (Toán, Trông trẻ...)
    cho môn đặc thù khi không có người đáp ứng.
    """

    def setUp(self):
        super().setUp()
        self.piano_job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=150000,
            status='ai_parsed', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['dan_piano'], 'urgency': 'normal'})
        JobSlot.objects.create(job=self.piano_job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))

    def test_zero_skill_zero_major_excluded_from_pool(self):
        """dan_piano job loại hoàn toàn candidate có 0 music skill + math major."""
        self._seed_cp('math_teacher', rating=5.0, reviews=20, effective=1400,
                      skills=['toan'], major='Sư phạm Toán', school='ĐH Sư Phạm')
        result = find_candidates(self.piano_job)
        self.assertEqual(result['total_matched'], 0)
        self.assertEqual(result['candidates'], [])

    def test_music_major_no_skill_gets_capped_not_excluded(self):
        """dan_piano job giữ lại candidate có music major nhưng skills=[], điểm bị cap <= 68."""
        music_cp = self._seed_cp('music_student', rating=5.0, reviews=5, effective=1200,
                                 skills=[], major='Học viện Âm nhạc', school='Học viện Âm nhạc Quốc gia')
        result = find_candidates(self.piano_job)
        self.assertEqual(result['total_matched'], 1)
        cand = result['candidates'][0]
        self.assertEqual(cand['carepartner_id'], str(music_cp.pk))
        self.assertLessEqual(cand['match_score'], 68.0)

    def test_elementary_tutoring_still_gets_general_su_pham_bonus(self):
        """Elementary tutoring với bằng sư phạm nói chung vẫn nhận _major_match_bonus == 1."""
        bonus_general = _major_match_bonus('Đại học Sư phạm Hà Nội', 'tutoring', ['tieu_hoc'])
        self.assertEqual(bonus_general, 1)

        bonus_math_for_math = _major_match_bonus('Sư phạm Toán', 'tutoring', ['toan'])
        self.assertEqual(bonus_math_for_math, 1)

        # Trái lại, sư phạm toán cho đàn piano phải nhận 0
        bonus_math_for_piano = _major_match_bonus('Sư phạm Toán', 'tutoring', ['dan_piano'])
        self.assertEqual(bonus_math_for_piano, 0)

    def test_total_matched_zero_when_no_specialist_available(self):
        """Mô phỏng đúng bug ban đầu của user; trả về total_matched == 0 khi không có specialist nào rảnh."""
        # 3 ứng viên xuất sắc nhưng không có ai có chuyên môn đàn piano
        self._seed_cp('math_cp', rating=4.9, reviews=15, effective=1350,
                      skills=['toan'], major='Sư phạm Toán', school='ĐH Sư Phạm')
        self._seed_cp('childcare_cp', rating=5.0, reviews=30, effective=1450,
                      skills=['trong_tre', 'nau_an'], major='Giáo dục Mầm non', school='ĐH Thủ Đô')
        self._seed_cp('english_cp', rating=4.8, reviews=12, effective=1300,
                      skills=['tieng_anh'], major='Ngôn ngữ Anh', school='ĐH Ngoại Ngữ')

        result = find_candidates(self.piano_job)
        self.assertEqual(result['total_matched'], 0)
        self.assertEqual(result['candidates'], [])

    def test_zero_skill_business_major_excluded_for_math_job(self):
        """Candidate 0 skill + business major cho job Toán (required_skills=['toan']) -> total_matched == 0."""
        # self.job đã có required_skills=['toan']
        self._seed_cp('biz_cp', skills=[], major='Quản trị Kinh doanh', school='ĐH Kinh tế Quốc dân')
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 0)
        self.assertEqual(result['candidates'], [])

    def test_physics_major_no_skill_retained_for_physics_job(self):
        """Candidate có major 'Sư phạm Vật Lý' (không có skill ly khai báo) cho job Lý -> vẫn được giữ lại (không bị loại oan nhờ major bonus)."""
        physics_job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=120000,
            status='ai_parsed', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['ly'], 'urgency': 'normal'})
        JobSlot.objects.create(job=physics_job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        phys_cp = self._seed_cp('phys_teacher', skills=[], major='Sư phạm Vật Lý', school='ĐH Sư Phạm Hà Nội')
        result = find_candidates(physics_job)
        self.assertEqual(result['total_matched'], 1)
        cand = result['candidates'][0]
        self.assertEqual(cand['carepartner_id'], str(phys_cp.pk))
        self.assertLessEqual(cand['match_score'], 68.0)


