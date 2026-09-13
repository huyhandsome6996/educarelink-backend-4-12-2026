"""
matching/tests/test_blackout_engine.py — Task D (2026-09-14): Lịch nghỉ
đúng NGÀY/GIỜ không bị đề xuất.

1. CP blackout 19:00–21:00 ngày D → job đúng slot đó KHÔNG có CP;
   job khung KHÁC cùng ngày VẪN có CP.
2. Full-day blackout (time_from/time_to null) → loại cả ngày.
3. Legacy matcher core/services/smart_match.py cũng trừ CarePartnerBlackout.
Timezone: Asia/Ho_Chi_Minh.

Chạy: python manage.py test matching.tests.test_blackout_engine --verbosity=2
"""

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone as tz

from matching.models import (
    CarePartnerAvailability,
    CarePartnerBlackout,
    JobPost,
    JobSlot,
)
from matching.services.elo_service import EloService
from matching.services.matching_service import find_candidates
from matching.tests.base import MatchingTestBase

User = get_user_model()


class BlackoutEngineTest(MatchingTestBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.day = tz.localdate() + timedelta(days=7)
        cls.weekday = cls.day.weekday()

    def setUp(self):
        super().setUp()
        self.parent = User.objects.create_user('bo_parent', password='x',
                                               role='parent')
        self.cp = User.objects.create_user('bo_cp', password='x',
                                           role='worker', is_approved=True,
                                           latitude=21.0, longitude=105.8)
        profile = EloService.get_profile(self.cp)
        profile.skills = ['toan']
        profile.major = 'Sư phạm Toán'
        profile.save()
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=self.weekday,
            time_from=time(17, 0), time_to=time(22, 0))

    def _make_job(self, name, time_from, time_to):
        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='matching', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=job, date=self.day,
                               time_from=time_from, time_to=time_to)
        return job

    def test_exact_slot_blackout_excludes_cp_only_for_that_slot(self):
        """Blackout 19:00–21:00 → job 19–21 KHÔNG có CP; job 17–19 cùng ngày
        VẪN có CP (trừ đúng NGÀY/GIỜ, không cấm cả ngày)."""
        CarePartnerBlackout.objects.create(
            carepartner=self.cp, date=self.day,
            time_from=time(19, 0), time_to=time(21, 0), reason='exam')

        blocked_job = self._make_job('bo_job_blocked', time(19, 0), time(21, 0))
        result = find_candidates(blocked_job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(self.cp.pk), ids)
        self.assertEqual(result['total_matched'], 0)

        free_job = self._make_job('bo_job_free', time(17, 0), time(19, 0))
        result2 = find_candidates(free_job)
        ids2 = [c['carepartner_id'] for c in result2['candidates']]
        self.assertIn(str(self.cp.pk), ids2)

    def test_full_day_blackout_excludes_whole_day(self):
        """Blackout cả ngày (time_from/time_to null) → mọi slot trong ngày
        đều không đề xuất CP."""
        CarePartnerBlackout.objects.create(
            carepartner=self.cp, date=self.day,
            time_from=None, time_to=None, reason='travel')
        for tf, tt in ((time(17, 0), time(19, 0)),
                       (time(19, 0), time(21, 0)),
                       (time(21, 0), time(22, 0))):
            job = self._make_job(f'bo_full_{tf.hour}', tf, tt)
            result = find_candidates(job)
            self.assertEqual(result['total_matched'], 0, f'{tf}-{tt}')
        # Ngày khác (không blackout) → vẫn đề xuất bình thường
        other_day = self.day + timedelta(days=1)
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=other_day.weekday(),
            time_from=time(17, 0), time_to=time(22, 0))
        job2 = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='matching', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=job2, date=other_day,
                               time_from=time(19, 0), time_to=time(21, 0))
        result2 = find_candidates(job2)
        ids2 = [c['carepartner_id'] for c in result2['candidates']]
        self.assertIn(str(self.cp.pk), ids2)

    def test_overlapping_blackout_partial_cut(self):
        """Blackout 18:30–19:30 giao slot 19:00–21:00 → slot không còn đủ
        cover → CP bị loại khỏi job đó (covers_all_slots yêu cầu đủ)."""
        CarePartnerBlackout.objects.create(
            carepartner=self.cp, date=self.day,
            time_from=time(18, 30), time_to=time(19, 30), reason='family')
        job = self._make_job('bo_overlap_job', time(19, 0), time(21, 0))
        result = find_candidates(job)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(self.cp.pk), ids)


class LegacySmartMatchBlackoutTest(MatchingTestBase):
    """Task D: legacy matcher core/services/smart_match.py cũng phải trừ
    CarePartnerBlackout (trước đây bỏ qua — job legacy vẫn đề xuất CP nghỉ)."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.day = tz.localdate() + timedelta(days=7)

    def test_legacy_smart_match_respects_blackout(self):
        from core.models import Task, WorkerAvailability
        from core.services.smart_match import find_smart_matches

        worker = User.objects.create_user('bo_legacy_cp', password='x',
                                          role='worker', is_approved=True,
                                          latitude=21.0, longitude=105.8)
        WorkerAvailability.objects.create(
            worker=worker, weekday=self.day.weekday(),
            start_time=time(18, 0), end_time=time(22, 0))
        task = Task.objects.create(
            title='Legacy task blackout test', description='x',
            price=Decimal('100000'), status='open', parent=User.objects.
            create_user('bo_legacy_parent', password='x', role='parent'),
            latitude=21.0, longitude=105.8,
            scheduled_time=tz.make_aware(
                tz.datetime.combine(self.day, time(19, 0))))

        # Chưa blackout → match được
        r1 = find_smart_matches(task)
        self.assertGreaterEqual(len(r1['matches']), 1)

        # Blackout khung 19:00–21:00 → legacy matcher loại CP
        CarePartnerBlackout.objects.create(
            carepartner=worker, date=self.day,
            time_from=time(19, 0), time_to=time(21, 0), reason='exam')
        r2 = find_smart_matches(task)
        self.assertEqual(len(r2['matches']), 0)
