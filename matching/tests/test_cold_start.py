"""
matching/tests/test_cold_start.py — Task C (2026-09-14): COLD-START
CarePartner mới — không bị bỏ quên sau khi admin duyệt.

1. Worker chưa duyệt KHÔNG vào pool matching (bất biến KYC — không phá).
2. Newbie đã duyệt, có skill + lịch → vào top N.
3. Exploration slot: pool toàn "lão làng" → chèn 1 newbie (0 đơn 0 review)
   vào slot cuối, không vượt mặt very_high #1.
4. Login worker pending: nhận JWT onboarding-only; matching/bookings → 403.
5. Signal duyệt: is_approved False→True → tạo CarePartnerProfile + push
   "Hồ sơ đã duyệt — khai lịch rảnh và kỹ năng".

Chạy: python manage.py test matching.tests.test_cold_start --verbosity=2
"""

from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from rest_framework.test import APIClient

from matching.models import (
    CarePartnerAvailability,
    CarePartnerProfile,
    Notification,
)
from matching.services.elo_service import EloService
from matching.services.matching_service import find_candidates
from matching.tests.base import MatchingTestBase

User = get_user_model()


class ColdStartBase(MatchingTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.day = tz.localdate() + timedelta(days=7)
        cls.weekday = cls.day.weekday()

    def _make_job(self, name='coldstart_job'):
        from matching.models import JobPost, JobSlot
        parent = User.objects.create_user(name + '_parent', password='x',
                                          role='parent')
        job = JobPost.objects.create(
            parent=parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='matching', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=job, date=self.day,
                               time_from=time(19, 0), time_to=time(21, 0))
        return job

    def _make_cp(self, name, *, approved=True, skills=('toan',),
                 avail=True, completed=0, reviews=0, rating=0.0,
                 effective=None):
        cp = User.objects.create_user(name, password='x', role='worker',
                                      is_approved=approved,
                                      latitude=21.0, longitude=105.8)
        profile = EloService.get_profile(cp)
        profile.skills = list(skills)
        profile.major = 'Sư phạm Toán'
        profile.rating_avg = rating
        profile.review_count = reviews
        profile.jobs_completed = completed
        if effective is not None:
            profile.effective_elo = effective
        profile.save()
        if avail:
            CarePartnerAvailability.objects.create(
                carepartner=cp, weekday=self.weekday,
                time_from=time(17, 0), time_to=time(22, 0))
        return cp


class UnapprovedNotInPoolTest(ColdStartBase):
    def test_unapproved_worker_not_in_find_candidates(self):
        """BẤT BIẾN KYC: worker chưa duyệt không bao giờ vào pool matching."""
        pending = self._make_cp('cs_pending_cp', approved=False)
        self._make_cp('cs_approved_cp', approved=True, completed=10, reviews=8,
                      rating=4.7, effective=1400)
        job = self._make_job()
        result = find_candidates(job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(pending.pk), ids)


class ApprovedNewbieInTopNTest(ColdStartBase):
    def test_approved_newbie_with_skills_and_availability_in_top_n(self):
        """Newbie đã duyệt, có skill + lịch → có mặt trong top N (không bị
        skill-gate / ngại dữ liệu thiếu)."""
        newbie = self._make_cp('cs_newbie_cp', approved=True,
                               skills=('toan',), completed=0, reviews=0)
        job = self._make_job()
        result = find_candidates(job, top_n=8)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertIn(str(newbie.pk), ids)


class ExplorationSlotTest(ColdStartBase):
    def test_exploration_slot_inserts_one_zero_job_cp(self):
        """Pool toàn CP có kinh nghiệm, newbie điểm thấp nằm ngoài top 8 →
        exploration chèn newbie vào slot #8, đẩy người điểm thấp nhất ra.
        Newbie KHÔNG vượt mặt very_high #1."""
        # 9 CP kinh nghiệm (điểm tăng dần) + 1 newbie (rating 0)
        for i in range(9):
            self._make_cp(f'cs_exp_{i:02d}', approved=True, completed=10 + i,
                          reviews=10, rating=4.0 + (i % 5) * 0.2,
                          effective=1200 + i * 10)
        newbie = self._make_cp('cs_exp_newbie', approved=True, completed=0,
                               reviews=0, rating=0.0)
        job = self._make_job()
        result = find_candidates(job, top_n=8)
        cands = result['candidates']
        self.assertEqual(len(cands), 8)
        top_ids = [c['carepartner_id'] for c in cands]
        self.assertIn(str(newbie.pk), top_ids)
        self.assertEqual(top_ids[-1], str(newbie.pk))  # slot cuối — không vượt #1
        # Người #1 vẫn là điểm cao nhất (không phải newbie)
        self.assertEqual(cands[0]['match_level'], 'very_high')

    def test_no_newbie_inserted_when_top_has_one(self):
        """Top N đã đủ chỗ và ĐÃ có newbie → không chèn thêm newbie thứ 2
        (chỉ MỘT exploration slot mỗi lần matching)."""
        for i in range(9):
            self._make_cp(f'cs_two_exp_{i:02d}', approved=True, completed=10 + i,
                          reviews=10, rating=4.0 + (i % 5) * 0.2,
                          effective=1200 + i * 10)
        newbie_good = self._make_cp('cs_two_newbie_a', approved=True,
                                    completed=0, reviews=0, effective=1500)
        newbie_low = self._make_cp('cs_two_newbie_b', approved=True,
                                   completed=0, reviews=0)
        job = self._make_job()
        result = find_candidates(job, top_n=8)
        top_ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertEqual(len(top_ids), 8)
        self.assertIn(str(newbie_good.pk), top_ids)
        self.assertNotIn(str(newbie_low.pk), top_ids)


class PendingWorkerLoginTest(ColdStartBase):
    def test_pending_worker_can_login_onboarding_only(self):
        """LoginAPIView: worker pending nhận JWT + status=pending_approval +
        permissions=['onboarding']; bookings API → 403 cho tới khi được duyệt."""
        pending = User.objects.create_user('cs_login_pending', password='pw12345',
                                           role='worker', is_approved=False)

        client = APIClient()
        resp = client.post('/api/auth/login/', {'username': 'cs_login_pending',
                                                'password': 'pw12345'},
                           format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.get('status'), 'pending_approval')
        self.assertIn('onboarding', resp.data.get('permissions') or [])
        self.assertIn('tokens', resp.data)
        access = resp.data['tokens']['access']

        # JWT hợp lệ nhưng matching/bookings/feed bị chặn 403
        auth = APIClient()
        auth.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        r_bookings = auth.get('/api/matching/bookings/?role=worker')
        self.assertEqual(r_bookings.status_code, 403)
        # Onboarding-status vẫn dùng được (bước bắt buộc khi chờ duyệt)
        r_status = auth.get('/api/matching/carepartners/me/onboarding-status/')
        self.assertEqual(r_status.status_code, 200)
        self.assertFalse(r_status.data['ready_for_matching'])

    def test_onboarding_status_ready_when_skills_and_availability(self):
        cp = self._make_cp('cs_onboard_ready', approved=True)
        client = APIClient()
        client.force_authenticate(cp)
        r = client.get('/api/matching/carepartners/me/onboarding-status/')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['has_skills'])
        self.assertTrue(r.data['has_availability'])
        self.assertTrue(r.data['ready_for_matching'])
        self.assertEqual(r.data['message_vi'], '')


class WorkerApprovedSignalTest(ColdStartBase):
    def test_approval_creates_profile_and_push(self):
        """is_approved False→True → profile ELO 1200 + band normal + push
        nhắc khai lịch rảnh và kỹ năng (không lộ số ELO)."""
        worker = User.objects.create_user('cs_signal_worker', password='x',
                                          role='worker', is_approved=False)
        self.assertFalse(CarePartnerProfile.objects.filter(user=worker).exists())

        worker.is_approved = True
        worker.save()  # signal pre_save + post_save bắt flip

        profile = CarePartnerProfile.objects.filter(user=worker).first()
        self.assertIsNotNone(profile)
        self.assertEqual(profile.hidden_elo, 1200)
        self.assertIsNotNone(profile.band)
        self.assertEqual(profile.band.name, 'normal')
        notif = Notification.objects.filter(user=worker, code='profile_approved').first()
        self.assertIsNotNone(notif)
        self.assertIn('khai lịch rảnh', notif.body_vi)

    def test_approval_signal_not_fired_without_flip(self):
        """Save thường (không flip) không sinh notification trùng."""
        worker = User.objects.create_user('cs_signal_none', password='x',
                                          role='worker', is_approved=True)
        worker.first_name = 'Đổi tên'
        worker.save()
        self.assertEqual(
            Notification.objects.filter(user=worker,
                                        code='profile_approved').count(), 0)
