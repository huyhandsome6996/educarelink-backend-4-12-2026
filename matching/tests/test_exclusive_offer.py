"""
matching/tests/test_exclusive_offer.py — Task A (2026-09-14): EXCLUSIVE LOCK
khi phụ huynh đang chờ CarePartner xác nhận.

Hành vi bắt buộc:
1. Parent chọn CP → Booking.awaiting_commitment + JobPost.carepartner_selected.
2. Trong cửa sổ commit_deadline:
   - Không find_candidates lại cho job (API 409).
   - Phụ huynh KHÁC không select được cùng CP + slot (409 slot_taken).
   - CP khác KHÔNG được notify / đề xuất.
3. Chỉ khi hết hạn (EXPIRED_NO_RESPONSE) hoặc từ chối (DECLINED_IN_WINDOW)
   thì mở khóa + replacement đề xuất NGƯỜI KHÁC.
4. Soft lock TTL 300s khi parent xem danh sách ứng viên — 2 phụ huynh không
   giữ cùng 1 CP trong 5 phút (soft lock KHÔNG thay exclusive job lock).

Chạy: python manage.py test matching.tests.test_exclusive_offer --verbosity=2
"""

from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone as tz

from matching.models import (
    Booking,
    CarePartnerAvailability,
    CandidateProposal,
    JobPost,
    JobSlot,
    Notification,
    SlotLock,
)
from matching.services.booking_service import (
    expire_booking_on_deadline,
    select_carepartner,
)
from matching.services.cancellation_service import cancel_by_carepartner
from matching.services.elo_service import EloService
from matching.services.lock_service import SlotConflictError
from matching.tests.base import MatchingTestBase

User = get_user_model()

MONDAY = None  # dùng ngày tương lai để không dính quá khứ


class ExclusiveOfferTestBase(MatchingTestBase):
    """Seed: 1 phụ huynh + 2 CarePartner cùng rảnh khung giờ job."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.day = (tz.localdate() + timedelta(days=7))
        cls.weekday = cls.day.weekday()

    def setUp(self):
        super().setUp()
        self.parent_a = User.objects.create_user('pa', password='x', role='parent')
        self.parent_b = User.objects.create_user('pb', password='x', role='parent')
        self.cp1 = self._make_cp('cp_excl_1')
        self.cp2 = self._make_cp('cp_excl_2')
        self.job_a = self._make_job(self.parent_a, status='matching')
        CandidateProposal.objects.create(job=self.job_a, carepartner=self.cp1)
        CandidateProposal.objects.create(job=self.job_a, carepartner=self.cp2)

    def _make_cp(self, name):
        cp = User.objects.create_user(name, password='x', role='worker',
                                      is_approved=True)
        profile = EloService.get_profile(cp)
        profile.skills = ['toan']
        profile.major = 'Sư phạm Toán'
        profile.save()
        CarePartnerAvailability.objects.create(
            carepartner=cp, weekday=self.weekday,
            time_from=time(18, 0), time_to=time(22, 0))
        return cp

    def _make_job(self, parent, status='matching'):
        job = JobPost.objects.create(
            parent=parent, job_type='tutoring', hourly_rate_vnd=100000,
            status=status, latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=job, date=self.day,
                               time_from=time(19, 0), time_to=time(21, 0))
        return job


class CandidatesAPI409WhileAwaitingTest(ExclusiveOfferTestBase):
    def test_candidates_api_409_while_awaiting_commitment(self):
        """Job đang awaiting_commitment → API candidates trả 409 (không
        find_candidates lại trong cửa sổ cam kết)."""
        from rest_framework.test import APIClient
        select_carepartner(self.job_a, self.cp1, actor_user=self.parent_a)
        self.job_a.refresh_from_db()
        self.assertEqual(self.job_a.status, 'carepartner_selected')

        client = APIClient()
        client.force_authenticate(self.parent_a)
        resp = client.post('/api/matching/candidates/',
                           {'job_id': str(self.job_a.pk)}, format='json')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.data.get('code'), 'invalid_state')


class SecondParentSelectBlockedTest(ExclusiveOfferTestBase):
    def test_second_parent_cannot_select_same_cp_slot(self):
        """Phụ huynh B chọn CÙNG CP cho job khác trùng slot → SlotConflictError
        (hard lock của CP từ job A chặn)."""
        select_carepartner(self.job_a, self.cp1, actor_user=self.parent_a)
        job_b = self._make_job(self.parent_b, status='matching')
        CandidateProposal.objects.create(job=job_b, carepartner=self.cp1)
        with self.assertRaises(SlotConflictError):
            select_carepartner(job_b, self.cp1, actor_user=self.parent_b)


class NoNotifyOtherCpTest(ExclusiveOfferTestBase):
    def test_other_cp_not_notified_during_window(self):
        """Trong cửa sổ cam kết: chỉ CP được CHỌN nhận job_assigned — CP khác
        chỉ bị đánh dấu not_selected, KHÔNG có notification nào."""
        select_carepartner(self.job_a, self.cp1, actor_user=self.parent_a)
        self.assertEqual(
            Notification.objects.filter(user=self.cp1,
                                        code='job_assigned').count(), 1)
        # CP2 không nhận bất kỳ notification matching nào
        self.assertEqual(
            Notification.objects.filter(user=self.cp2,
                                        code__in=['job_assigned',
                                                  'replacement_found']).count(), 0)
        # CP2 có booking not_selected (bị đánh dấu loại)
        self.assertTrue(Booking.objects.filter(
            job=self.job_a, carepartner=self.cp2,
            status='not_selected').exists())


class ExpireThenReplacementTest(ExclusiveOfferTestBase):
    def test_expire_then_replacement_proposes_next(self):
        """Hết hạn commit_deadline → EXPIRED_NO_RESPONSE + release locks +
        replacement đề xuất NGƯỜI KHÁC (không đề xuất lại CP hết hạn)."""
        from matching.services.replacement_service import run_replacement_for_job
        from matching.models import ReplacementAttempt

        booking, _created = select_carepartner(self.job_a, self.cp1,
                                               actor_user=self.parent_a)
        self.assertEqual(booking.status, 'awaiting_commitment')
        # Trôi qua deadline
        Booking.objects.filter(pk=booking.pk).update(
            commit_deadline=tz.now() - timedelta(minutes=1))
        booking.refresh_from_db()

        expired = expire_booking_on_deadline(booking)
        self.assertEqual(expired.status, 'expired_no_response')
        # Slot được mở khóa
        self.assertEqual(
            SlotLock.objects.filter(booking=expired,
                                    lock_type=SlotLock.LockType.HARD).count(), 0)
        # Replacement đã tự chạy
        self.assertTrue(ReplacementAttempt.objects.filter(job=self.job_a).exists())
        self.job_a.refresh_from_db()
        self.assertEqual(self.job_a.status, 'needs_replacement')

        # Danh sách replacement KHÔNG còn CP hết hạn — đề xuất người khác
        result = run_replacement_for_job(self.job_a)
        self.assertIsNotNone(result)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(self.cp1.pk), ids)
        self.assertIn(str(self.cp2.pk), ids)


class DeclineThenReplacementTest(ExclusiveOfferTestBase):
    def test_decline_then_replacement_proposes_next(self):
        """CP từ chối trong cửa sổ → DECLINED_IN_WINDOW + release locks +
        replacement đề xuất NGƯỜI KHÁC."""
        from matching.services.replacement_service import run_replacement_for_job
        from matching.models import ReplacementAttempt

        booking, _created = select_carepartner(self.job_a, self.cp1,
                                               actor_user=self.parent_a)
        declined, _changed = cancel_by_carepartner(
            Booking.objects.get(pk=booking.pk), 'personal',
            note='Từ chối trong cửa sổ cam kết')
        self.assertEqual(declined.status, 'declined_in_window')
        # Slot được mở khóa
        self.assertEqual(
            SlotLock.objects.filter(booking=declined,
                                    lock_type=SlotLock.LockType.HARD).count(), 0)
        self.assertTrue(ReplacementAttempt.objects.filter(job=self.job_a).exists())

        # Danh sách replacement KHÔNG còn CP vừa từ chối — đề xuất người khác
        result = run_replacement_for_job(self.job_a)
        self.assertIsNotNone(result)
        ids = [c['carepartner_id'] for c in result['candidates']]
        self.assertNotIn(str(self.cp1.pk), ids)
        self.assertIn(str(self.cp2.pk), ids)


class SoftLockOnCandidateViewTest(ExclusiveOfferTestBase):
    def test_soft_lock_on_candidate_view(self):
        """Parent xem danh sách ứng viên → mỗi CP được đề xuất giữ soft lock
        TTL 300s cho job. Phụ huynh KHÁC không select được cùng CP trong TTL
        (SlotConflictError). Soft lock KHÔNG thay exclusive job lock (hard)."""
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(self.parent_a)
        resp = client.post('/api/matching/candidates/',
                           {'job_id': str(self.job_a.pk)}, format='json')
        self.assertEqual(resp.status_code, 200)

        # Soft lock tồn tại cho các CP trong danh sách, gắn với job, TTL <= 300s
        locks = SlotLock.objects.filter(job=self.job_a,
                                        lock_type=SlotLock.LockType.SOFT)
        self.assertTrue(locks.exists())
        for lock in locks:
            ttl = (lock.expires_at - tz.now()).total_seconds()
            self.assertGreater(ttl, 0)
            self.assertLessEqual(ttl, 301)

        # Parent B tạo job trùng khung + chọn cùng CP → bị chặn (soft lock 5')
        job_b = self._make_job(self.parent_b, status='matching')
        CandidateProposal.objects.create(job=job_b, carepartner=self.cp1)
        with self.assertRaises(SlotConflictError):
            select_carepartner(job_b, self.cp1, actor_user=self.parent_b)

        # Soft lock KHÔNG thay exclusive job lock: parent A chọn CP1 cho
        # chính job A vẫn thành công (hard lock thay soft lock).
        booking, created = select_carepartner(self.job_a, self.cp1,
                                              actor_user=self.parent_a)
        self.assertTrue(created)
        self.assertEqual(booking.status, 'awaiting_commitment')
