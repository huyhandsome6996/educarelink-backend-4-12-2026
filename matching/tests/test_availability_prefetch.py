"""
matching/tests/test_availability_prefetch.py — DSA anti-N+1 (QA 2026-09-18).

Bối cảnh: POST /api/matching/candidates/ trên Render bị Gunicorn WORKER
TIMEOUT 30s trả HTML 500 → Web /ung-vien/ màn hình trắng. Nguyên nhân: N+1
query trong find_candidates (covers_all_slots → available_slots per CP ×
per ngày; can_receive_proposal 2 query/CP; _latest_review_text 1 query/CP).

Bộ test này chứng minh 3 điều:
  1. AvailabilityPrefetch cho KẾT QUẢ TƯƠNG ĐƯƠNG 100% với available_slots /
     covers_all_slots gốc qua mọi kịch bản lịch (weekly, blackout, booking,
     hard/soft lock, exclude_job).
  2. find_candidates CHẠY VỚI SỐ LƯỢNG QUERY CỐ ĐỊNH (không tăng theo số CP
     trong pool) — chặn hồi quy N+1 trong tương lai.
  3. API POST /api/matching/candidates/ trả 200 JSON đúng contract (không
     bao giờ trả HTML) và _soft_lock_candidates bulk đúng semantics.
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone as tz

from matching.models import (
    Booking,
    CarePartnerAvailability,
    CarePartnerBlackout,
    JobPost,
    JobSlot,
    SlotLock,
)
from matching.services.elo_service import EloService
from matching.services.lock_service import (
    AvailabilityPrefetch,
    available_slots,
    covers_all_slots,
)
from matching.services.matching_service import find_candidates
from matching.tests.base import MatchingTestBase

User = get_user_model()

MONDAY = date(2026, 9, 14)
TUESDAY = date(2026, 9, 15)


class AvailabilityPrefetchEquivalenceTest(MatchingTestBase):
    """Nhóm 1: prefetch ↔ available_slots gốc phải cho kết quả GIỐNG NHAU."""

    def setUp(self):
        self.cp = User.objects.create_user('pfcp', password='x', role='worker',
                                           is_approved=True,
                                           latitude=16.4637, longitude=107.5909)
        EloService.get_profile(self.cp)
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=MONDAY.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))

    def _compare(self, exclude_job=None):
        pf = AvailabilityPrefetch([self.cp.pk], [MONDAY], exclude_job=exclude_job)
        old = available_slots(self.cp, MONDAY, use_cache=False, exclude_job=exclude_job)
        new = pf.available_slots_for(self.cp.pk, MONDAY)
        self.assertEqual(old, new)
        return new

    def test_plain_weekly_window(self):
        self.assertEqual(self._compare(), [(time(18, 0), time(22, 0))])

    def test_blackout_partial(self):
        CarePartnerBlackout.objects.create(carepartner=self.cp, date=MONDAY,
                                           time_from=time(20, 0), time_to=time(21, 0))
        self.assertEqual(self._compare(), [(time(18, 0), time(20, 0)), (time(21, 0), time(22, 0))])

    def test_blackout_whole_day(self):
        CarePartnerBlackout.objects.create(carepartner=self.cp, date=MONDAY,
                                           time_from=None, time_to=None)
        self.assertEqual(self._compare(), [])

    def test_busy_booking_slot(self):
        parent = User.objects.create_user('pfp1', password='x', role='parent')
        job = JobPost.objects.create(parent=parent, job_type='tutoring',
                                     hourly_rate_vnd=100000)
        JobSlot.objects.create(job=job, date=MONDAY, time_from=time(19, 0),
                               time_to=time(20, 0))
        Booking.objects.create(job=job, carepartner=self.cp, parent=parent,
                               status='committed', total_value_vnd=100000,
                               selected_at=tz.now(), commit_deadline=tz.now())
        self.assertEqual(self._compare(), [(time(18, 0), time(19, 0)), (time(20, 0), time(22, 0))])

    def test_hard_lock_blocks(self):
        SlotLock.objects.create(carepartner=self.cp, date=MONDAY,
                                time_from=time(18, 0), time_to=time(19, 30),
                                lock_type=SlotLock.LockType.HARD)
        self.assertEqual(self._compare(), [(time(19, 30), time(22, 0))])

    def test_soft_lock_live_blocks_and_expired_not(self):
        SlotLock.objects.create(carepartner=self.cp, date=MONDAY,
                                time_from=time(21, 0), time_to=time(22, 0),
                                lock_type=SlotLock.LockType.SOFT,
                                expires_at=tz.now() + timedelta(minutes=5))
        self.assertEqual(self._compare(), [(time(18, 0), time(21, 0))])
        # Lock hết hạn → không chặn
        SlotLock.objects.update(expires_at=tz.now() - timedelta(minutes=1))
        self.assertEqual(self._compare(), [(time(18, 0), time(22, 0))])

    def test_exclude_job_skips_own_soft_lock(self):
        parent = User.objects.create_user('pfp2', password='x', role='parent')
        job = JobPost.objects.create(parent=parent, job_type='tutoring',
                                     hourly_rate_vnd=100000)
        SlotLock.objects.create(carepartner=self.cp, job=job, date=MONDAY,
                                time_from=time(18, 0), time_to=time(19, 0),
                                lock_type=SlotLock.LockType.SOFT,
                                expires_at=tz.now() + timedelta(minutes=5))
        # KHÔNG exclude_job → soft lock chặn (bình thường)
        self.assertEqual(self._compare(), [(time(19, 0), time(22, 0))])
        # CÓ exclude_job = chính job này → soft lock bị bỏ qua (Task A)
        pf = AvailabilityPrefetch([self.cp.pk], [MONDAY], exclude_job=job)
        self.assertEqual(pf.available_slots_for(self.cp.pk, MONDAY),
                         [(time(18, 0), time(22, 0))])
        old = available_slots(self.cp, MONDAY, use_cache=False, exclude_job=job)
        self.assertEqual(old, [(time(18, 0), time(22, 0))])

    def test_covers_all_slots_equivalence_multi_date(self):
        """2 slot / 2 ngày — covers_all_slots gốc ↔ covers_all_slots_for."""
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=TUESDAY.weekday(),
            time_from=time(7, 0), time_to=time(11, 0))
        SlotLock.objects.create(carepartner=self.cp, date=TUESDAY,
                                time_from=time(8, 0), time_to=time(9, 0),
                                lock_type=SlotLock.LockType.HARD)
        required = [
            (MONDAY, time(19, 0), time(20, 0)),    # Monday cover OK
            (TUESDAY, time(7, 30), time(8, 30)),   # Tuesday bị hard lock 8-9
        ]
        pf = AvailabilityPrefetch([self.cp.pk], [MONDAY, TUESDAY])
        self.assertEqual(covers_all_slots(self.cp, required), (False, [required[1]]))
        self.assertEqual(pf.covers_all_slots_for(self.cp.pk, required),
                         covers_all_slots(self.cp, required))

    def test_pool_of_many_cps_equivalence(self):
        """Cả POOL nhiều CP — kết quả per-CP giống hệt hàm gốc."""
        others = []
        for i in range(6):
            u = User.objects.create_user(f'poolcp{i}', password='x', role='worker',
                                         is_approved=True)
            EloService.get_profile(u)
            CarePartnerAvailability.objects.create(
                carepartner=u, weekday=MONDAY.weekday(),
                time_from=time(16 + i, 0), time_to=time(22, 0))
            if i % 2 == 0:
                CarePartnerBlackout.objects.create(
                    carepartner=u, date=MONDAY,
                    time_from=time(17 + i, 0), time_to=time(18 + i, 0))
            others.append(u)
        pf = AvailabilityPrefetch([u.pk for u in others] + [self.cp.pk], [MONDAY])
        for u in others + [self.cp]:
            self.assertEqual(
                pf.available_slots_for(u.pk, MONDAY),
                available_slots(u, MONDAY, use_cache=False),
                msg=f'Prefetch lệch với available_slots cho CP {u.username}')


class FindCandidatesQueryBudgetTest(MatchingTestBase):
    """Nhóm 2: chặn hồi quy N+1 — số query KHÔNG được tăng theo số CP."""

    def setUp(self):
        self.parent = User.objects.create_user('qp', password='x', role='parent',
                                               latitude=16.4637, longitude=107.5909)
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='ai_parsed', latitude=16.4637, longitude=107.5909,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'})
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))

    def _seed_cp(self, name):
        cp = User.objects.create_user(name, password='x', role='worker',
                                      is_approved=True,
                                      latitude=16.4637, longitude=107.5909)
        profile = EloService.get_profile(cp)
        CarePartnerAvailability.objects.create(
            carepartner=cp, weekday=MONDAY.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))
        profile.skills = ['toan']
        profile.school = 'ĐH Sư Phạm - Đại học Huế'
        profile.major = 'Sư phạm Toán'
        profile.save()
        return cp

    def test_query_count_constant_with_pool_size(self):
        """8 CP + 16 CP: số query khi pool ×2 phải gần như KHÔNG đổi
        (chỉ cộng ≤ 2 query). Trước DSA: +4 query/CP/ngày → +32 query."""
        for i in range(8):
            self._seed_cp(f'q8cp{i}')

        with CaptureQueriesContext(connection) as ctx8:
            r8 = find_candidates(self.job)
        self.assertGreater(r8['total_matched'], 0)

        for i in range(8, 16):
            self._seed_cp(f'q16cp{i}')
        with CaptureQueriesContext(connection) as ctx16:
            r16 = find_candidates(self.job)

        # DSA: chênh lệch phải ≤ 2 (pool ×2). Code cũ sẽ lệch 30+ query.
        self.assertLessEqual(len(ctx16) - len(ctx8), 2,
                             msg=f'N+1 hồi quy: pool 8 → {len(ctx8)} query, '
                                 f'pool 16 → {len(ctx16)} query')

    def test_find_candidates_result_contract(self):
        cp = self._seed_cp('qconcp')
        result = find_candidates(self.job)
        self.assertEqual(result['total_matched'], 1)
        cand = result['candidates'][0]
        self.assertEqual(cand['carepartner_id'], str(cp.pk))
        for field in ('display_name', 'match_score', 'match_level',
                      'match_level_vi', 'top_skills', 'distance_km',
                      'availability_fit'):
            self.assertIn(field, cand)
        # _-prefixed fields phải bị pop khỏi response
        for hidden in ('_skills', '_elo', '_distance', '_completion', '_newbie'):
            self.assertNotIn(hidden, cand)


class BulkSoftLockTest(MatchingTestBase):
    """Nhóm 3: _soft_lock_candidates bulk đúng semantics Task A."""

    def setUp(self):
        self.parent = User.objects.create_user('slp', password='x', role='parent',
                                               latitude=16.4637, longitude=107.5909)
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='ai_parsed', latitude=16.4637, longitude=107.5909)
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))

    def test_bulk_creates_lock_for_every_candidate(self):
        from matching.api.jobs import _soft_lock_candidates
        cps = []
        for i in range(3):
            u = User.objects.create_user(f'slcp{i}', password='x', role='worker')
            cps.append(u)
        _soft_lock_candidates(self.job, [{'carepartner_id': str(u.pk)} for u in cps])
        locks = SlotLock.objects.filter(job=self.job, lock_type=SlotLock.LockType.SOFT)
        self.assertEqual(locks.count(), 3 * 1)  # 3 CP × 1 slot
        for u in cps:
            self.assertTrue(locks.filter(carepartner=u).exists())
            lock = locks.filter(carepartner=u).first()
            self.assertIsNotNone(lock.expires_at)
            self.assertGreater(lock.expires_at, tz.now())

    def test_bulk_replaces_stale_overlapping_locks(self):
        """Lock mềm cũ TRÙNG KHUNG của chính CP bị xóa, lock KHÁC khung giữ lại."""
        from matching.api.jobs import _soft_lock_candidates
        u = User.objects.create_user('slcpold', password='x', role='worker')
        stale = SlotLock.objects.create(
            carepartner=u, job=self.job, date=MONDAY,
            time_from=time(19, 0), time_to=time(21, 0),
            lock_type=SlotLock.LockType.SOFT,
            expires_at=tz.now() + timedelta(minutes=5))
        keep = SlotLock.objects.create(
            carepartner=u, date=TUESDAY,
            time_from=time(10, 0), time_to=time(12, 0),
            lock_type=SlotLock.LockType.SOFT,
            expires_at=tz.now() + timedelta(minutes=5))
        _soft_lock_candidates(self.job, [{'carepartner_id': str(u.pk)}])
        self.assertFalse(SlotLock.objects.filter(pk=stale.pk).exists())
        self.assertTrue(SlotLock.objects.filter(pk=keep.pk).exists())
        # Lock mới của job đã được tạo lại
        self.assertTrue(SlotLock.objects.filter(
            carepartner=u, job=self.job, date=MONDAY).exists())


class CandidatesAPIViewTest(MatchingTestBase):
    """Nhóm 4: API trả JSON 200 đúng contract — không bao giờ màn trắng."""

    def setUp(self):
        self.parent = User.objects.create_user('apip', password='x', role='parent',
                                               latitude=16.4637, longitude=107.5909)
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=120000,
            status='ai_parsed', latitude=16.4637, longitude=107.5909,
            ai_parse_result={'required_skills': ['toan'], 'urgency': 'normal'},
            title='Gia sư Toán khu vực Vĩnh Ninh')
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        cp = User.objects.create_user('apicp', password='x', role='worker',
                                      is_approved=True,
                                      latitude=16.4637, longitude=107.5909)
        profile = EloService.get_profile(cp)
        CarePartnerAvailability.objects.create(
            carepartner=cp, weekday=MONDAY.weekday(),
            time_from=time(18, 0), time_to=time(22, 0))
        profile.skills = ['toan']
        profile.school = 'ĐH Sư Phạm - Đại học Huế'
        profile.major = 'Sư phạm Toán'
        profile.save()

        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=self.parent)

    def test_candidates_endpoint_returns_200_json(self):
        resp = self.client.post('/api/matching/candidates/',
                                {'job_id': str(self.job.pk)}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp['Content-Type'].startswith('application/json'))
        data = resp.json()
        self.assertIn('total_matched', data)
        self.assertIn('candidates', data)
        self.assertEqual(data['total_matched'], 1)
        cand = data['candidates'][0]
        self.assertIn('match_score', cand)
        self.assertIn('school', cand)
        self.assertIn('ĐH Sư Phạm', cand['school'])
        # Job đã chuyển sang trạng thái matching
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, 'matching')

    def test_soft_lock_created_after_api_call(self):
        resp = self.client.post('/api/matching/candidates/',
                                {'job_id': str(self.job.pk)}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(SlotLock.objects.filter(
            job=self.job, lock_type=SlotLock.LockType.SOFT).exists())
