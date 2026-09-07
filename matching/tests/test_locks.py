"""
matching/tests/test_locks.py — Schedule Locking + Buffer 90' + available_slots
(Prompt 03 Testing Checklist, Step 10).
"""

from datetime import date, time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase
from matching.tests.base import MatchingTestBase
from django.utils import timezone as tz

from matching.models import (
    Booking,
    JobPost,
    JobSlot,
    SlotLock,
)
from matching.services.lock_service import (
    BufferViolationError,
    LockService,
    SlotConflictError,
    available_slots,
    covers_all_slots,
    invalidate_availability_cache,
)

User = get_user_model()

D = date(2026, 9, 14)  # thứ Hai


class LockBaseTest(MatchingTestBase):
    def setUp(self):
        self.parent = User.objects.create_user('p', password='x', role='parent')
        self.cp = User.objects.create_user('cp', password='x', role='worker',
                                           is_approved=True)
        from matching.services.elo_service import EloService
        EloService.get_profile(self.cp)

    def _make_job(self, status='ai_parsed', slots=((D, time(18, 0), time(19, 0)),)):
        job = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                     hourly_rate_vnd=100000, status=status)
        for d, tf, tt in slots:
            JobSlot.objects.create(job=job, date=d, time_from=tf, time_to=tt)
        return job

    def _make_booking(self, slots, status='committed'):
        job = self._make_job(slots=slots)
        return Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status=status, total_value_vnd=100000,
            selected_at=tz.now(), commit_deadline=tz.now())


class BufferTest(LockBaseTest):
    """Ví dụ đúng trong spec: Job 18:00-19:00 → 19:30 FAIL, 20:30 PASS."""

    def test_buffer_90_fail_1930(self):
        self._make_booking([(D, time(18, 0), time(19, 0))])
        with self.assertRaises(BufferViolationError):
            LockService.validate_buffer(self.cp, D, time(19, 30), time(20, 30))

    def test_buffer_90_pass_2030(self):
        self._make_booking([(D, time(18, 0), time(19, 0))])
        LockService.validate_buffer(self.cp, D, time(20, 30), time(21, 30))

    def test_buffer_90_fail_2029(self):
        self._make_booking([(D, time(18, 0), time(19, 0))])
        with self.assertRaises(BufferViolationError):
            LockService.validate_buffer(self.cp, D, time(20, 29), time(21, 29))

    def test_buffer_60_fail(self):
        """AC tổng: 2 job cách 60 phút → reject."""
        self._make_booking([(D, time(18, 0), time(19, 0))])
        with self.assertRaises(BufferViolationError):
            LockService.validate_buffer(self.cp, D, time(20, 0), time(21, 0))

    def test_buffer_cross_day(self):
        """Job 23:00-23:59 hôm trước vs 00:30 hôm sau → gap 31 phút → FAIL."""
        prev = D - timedelta(days=1)
        self._make_booking([(prev, time(23, 0), time(23, 59))])
        with self.assertRaises(BufferViolationError):
            LockService.validate_buffer(self.cp, D, time(0, 30), time(1, 30))

    def test_overlap_is_conflict_not_buffer(self):
        self._make_booking([(D, time(18, 0), time(19, 0))])
        with self.assertRaises(SlotConflictError):
            LockService.validate_buffer(self.cp, D, time(18, 30), time(19, 30))

    def test_buffer_reads_config(self):
        """BUFFER_MINUTES đổi trong DB → validate theo giá trị mới (không hardcode)."""
        from matching.models import MatchingConfig
        cfg = MatchingConfig.objects.get(key='BUFFER_MINUTES')
        cfg.value_json = 30
        cfg.save()
        from matching.config import invalidate_cache
        invalidate_cache()
        self._make_booking([(D, time(18, 0), time(19, 0))])
        # Gap 60 phút — trước đây FAIL với 90', giờ PASS với 30'
        LockService.validate_buffer(self.cp, D, time(20, 0), time(21, 0))


class HardLockTest(LockBaseTest):
    def test_all_or_nothing(self):
        """1/3 slot trùng hard lock có sẵn → KHÔNG slot nào được lock."""
        job = self._make_job()
        booking_a = Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status='awaiting_commitment', total_value_vnd=100000,
            selected_at=tz.now(), commit_deadline=tz.now())
        # Booking A hard lock 18-19 thành công
        LockService.hard_lock([(D, time(18, 0), time(19, 0))], booking_a, self.cp, job=job)

        job_b = self._make_job(slots=((D, time(8, 0), time(9, 0)),
                                      (D, time(10, 0), time(11, 0)),
                                      (D, time(18, 0), time(19, 0))))
        booking_b = Booking.objects.create(
            job=job_b, carepartner=self.cp, parent=self.parent,
            status='awaiting_commitment', total_value_vnd=100000,
            selected_at=tz.now(), commit_deadline=tz.now())
        slots = [(D, time(8, 0), time(9, 0)),
                 (D, time(10, 0), time(11, 0)),
                 (D, time(18, 0), time(19, 0))]  # slot cuối trùng hard lock của booking A
        with self.assertRaises(SlotConflictError):
            with transaction.atomic():
                LockService.hard_lock(slots, booking_b, self.cp, job=job)
        # Chỉ có lock của booking A — booking B không được lock slot nào
        self.assertEqual(
            SlotLock.objects.filter(booking=booking_b).count(), 0)
        self.assertEqual(
            SlotLock.objects.filter(booking=booking_a).count(), 1)

    def test_soft_lock_of_same_cp_replaced(self):
        """2 soft lock chồng nhau CÙNG CP → thế chỗ hợp lệ."""
        LockService.soft_lock(self.cp, [(D, time(15, 0), time(16, 0))])
        LockService.soft_lock(self.cp, [(D, time(15, 30), time(16, 30))])
        self.assertEqual(
            SlotLock.objects.filter(carepartner=self.cp, lock_type='soft').count(), 1)

    def test_release_locks_idempotent(self):
        job = self._make_job()
        booking = Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status='committed', total_value_vnd=100000,
            selected_at=tz.now(), commit_deadline=tz.now())
        LockService.hard_lock([(D, time(18, 0), time(19, 0))], booking, self.cp, job=job)
        self.assertTrue(LockService.release_locks(booking) > 0)
        self.assertEqual(LockService.release_locks(booking), 0)  # gọi 2 lần không lỗi


class AvailableSlotsTest(LockBaseTest):
    def _set_weekly(self):
        from matching.models import CarePartnerAvailability
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=0, time_from=time(17, 0), time_to=time(22, 0))

    def test_free_slot_full_window(self):
        self._set_weekly()
        self.assertEqual(available_slots(self.cp, D), [(time(17, 0), time(22, 0))])

    def test_blackout_cuts_slot(self):
        from matching.models import CarePartnerBlackout
        self._set_weekly()
        CarePartnerBlackout.objects.create(carepartner=self.cp, date=D,
                                           time_from=time(18, 0), time_to=time(19, 30),
                                           reason='exam')
        self.assertEqual(available_slots(self.cp, D),
                         [(time(17, 0), time(18, 0)), (time(19, 30), time(22, 0))])

    def test_full_day_blackout(self):
        from matching.models import CarePartnerBlackout
        self._set_weekly()
        CarePartnerBlackout.objects.create(carepartner=self.cp, date=D, reason='health')
        self.assertEqual(available_slots(self.cp, D), [])

    def test_busy_booking_cuts_slot(self):
        self._set_weekly()
        self._make_booking([(D, time(19, 0), time(20, 0))])
        self.assertEqual(available_slots(self.cp, D),
                         [(time(17, 0), time(19, 0)), (time(20, 0), time(22, 0))])

    def test_cancelled_booking_returns_slot(self):
        """Booking hủy/hoàn thành → slot available lại (Step 9.3)."""
        self._set_weekly()
        booking = self._make_booking([(D, time(19, 0), time(20, 0))])
        self.assertEqual(available_slots(self.cp, D),
                         [(time(17, 0), time(19, 0)), (time(20, 0), time(22, 0))])
        booking.status = 'cancelled_by_carepartner'
        booking.save()
        invalidate_availability_cache(self.cp, D)
        self.assertEqual(available_slots(self.cp, D), [(time(17, 0), time(22, 0))])

    def test_soft_lock_expiry(self):
        """Soft lock hết hạn 300s → slot available lại."""
        self._set_weekly()
        LockService.soft_lock(self.cp, [(D, time(17, 0), time(18, 0))])
        invalidate_availability_cache(self.cp, D)
        self.assertEqual(available_slots(self.cp, D), [(time(18, 0), time(22, 0))])
        future = tz.now() + timedelta(seconds=301)
        with patch('django.utils.timezone.now', return_value=future):
            self.assertEqual(available_slots(self.cp, D), [(time(17, 0), time(22, 0))])

    def test_cache_invalidation(self):
        """Đổi availability rồi gọi ngay → dữ liệu mới (invalidate hoạt động)."""
        from matching.models import CarePartnerAvailability
        self._set_weekly()
        self.assertEqual(available_slots(self.cp, D), [(time(17, 0), time(22, 0))])
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=0, time_from=time(8, 0), time_to=time(10, 0))
        invalidate_availability_cache(self.cp, D)
        self.assertEqual(available_slots(self.cp, D),
                         [(time(8, 0), time(10, 0)), (time(17, 0), time(22, 0))])

    def test_covers_all_slots(self):
        from matching.models import CarePartnerAvailability
        CarePartnerAvailability.objects.create(
            carepartner=self.cp, weekday=0, time_from=time(18, 0), time_to=time(21, 0))
        ok, missing = covers_all_slots(
            self.cp, [(D, time(19, 0), time(21, 0))])
        self.assertTrue(ok)
        ok, missing = covers_all_slots(
            self.cp, [(D, time(18, 0), time(19, 0)),
                      (date(2026, 9, 15), time(19, 0), time(21, 0))])  # thứ 3 — chưa khai
        self.assertFalse(ok)
        self.assertEqual(len(missing), 1)


class SchedulerCleanupTest(LockBaseTest):
    def test_cleanup_expired_locks(self):
        from matching.schedulers.matching_scheduler import cleanup_expired_locks
        LockService.soft_lock(self.cp, [(D, time(9, 0), time(10, 0))], ttl_seconds=-1)
        self.assertEqual(
            SlotLock.objects.filter(carepartner=self.cp, lock_type='soft').count(), 1)
        cleanup_expired_locks()
        self.assertEqual(
            SlotLock.objects.filter(carepartner=self.cp, lock_type='soft').count(), 0)
