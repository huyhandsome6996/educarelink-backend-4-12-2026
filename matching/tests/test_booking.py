"""
matching/tests/test_booking.py — Auto-commit booking (Step 5 checklist).
"""

from datetime import date, time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone as tz

from matching.constants import BookingStatus
from matching.models import (
    Booking,
    CarePartnerAvailability,
    JobPost,
    JobSlot,
    Notification,
    SlotLock,
    StateTransitionLog,
)
from matching.services.booking_service import (
    commit_booking,
    compute_commit_deadline,
    compute_total_value,
    expire_booking_on_deadline,
    lazy_commit_check,
    select_carepartner,
)
from matching.services.elo_service import EloService
from matching.services.lock_service import SlotConflictError
from matching.tests.base import MatchingTestBase

User = get_user_model()
MONDAY = date(2026, 9, 14)


class CommitWindowTest(MatchingTestBase):
    """Bảng 5.2: >24h→60'; 6-24h→30'; 1-6h→15'; <1h→5'; hard cap 5'."""

    def _check(self, minutes_to_start):
        now = tz.now()
        start = now + timedelta(minutes=minutes_to_start)
        deadline, window = compute_commit_deadline(now, start)
        return deadline, window

    def test_30h_gives_60(self):
        _d, w = self._check(30 * 60)
        self.assertEqual(w, 60)

    def test_40min_gives_5(self):
        _d, w = self._check(40)
        self.assertEqual(w, 5)

    def test_4min_window_zero(self):
        """start sau 4 phút → window 0 → committed ngay."""
        deadline, window = self._check(4)
        self.assertIsNone(deadline)
        self.assertEqual(window, 0)

    def test_hard_cap_5_minutes_before_start(self):
        """Window 60' nhưng job chỉ cách 40' → deadline vượt hard cap → window 0."""
        # 40 phút > 1h? KHÔNG — 40 phút < 1h → window 5'. Job cách 7 phút:
        # window 5' kết thúc 2' trước start → vi phạm margin 5' → window 0.
        deadline, window = self._check(7)
        self.assertIsNone(deadline)

    def test_10h_gives_30(self):
        _d, w = self._check(10 * 60)
        self.assertEqual(w, 30)

    def test_2h_gives_15(self):
        _d, w = self._check(2 * 60)
        self.assertEqual(w, 15)


class TotalValueTest(MatchingTestBase):
    def test_value_rate_times_hours_times_slots(self):
        parent = User.objects.create_user('tv', password='x', role='parent')
        job = JobPost.objects.create(parent=parent, job_type='tutoring',
                                     hourly_rate_vnd=100000)
        JobSlot.objects.create(job=job, date=MONDAY, time_from=time(19, 0),
                               time_to=time(21, 0))
        JobSlot.objects.create(job=job, date=MONDAY + timedelta(days=1),
                               time_from=time(19, 0), time_to=time(21, 0))
        # 100k × 2h × 2 slot = 400k
        self.assertEqual(compute_total_value(job), 400000)


class SelectCarePartnerTest(MatchingTestBase):
    def setUp(self):
        super().setUp()
        self.parent = User.objects.create_user('sp', password='x', role='parent')
        self.cp = User.objects.create_user('sc', password='x', role='worker',
                                           is_approved=True)
        self.cp2 = User.objects.create_user('sc2', password='x', role='worker',
                                            is_approved=True)
        EloService.get_profile(self.cp)
        EloService.get_profile(self.cp2)
        for c in (self.cp, self.cp2):
            CarePartnerAvailability.objects.create(
                carepartner=c, weekday=0, time_from=time(18, 0), time_to=time(22, 0))
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='matching', latitude=21.0, longitude=105.8,
            ai_parse_result={'required_skills': ['toan']})
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        from matching.models import CandidateProposal
        CandidateProposal.objects.create(job=self.job, carepartner=self.cp)
        CandidateProposal.objects.create(job=self.job, carepartner=self.cp2)

    def test_select_creates_booking_immediately(self):
        """AC1: chọn CP → booking tạo NGAY, không cần CP bấm đồng ý."""
        booking, created = select_carepartner(self.job, self.cp)
        self.assertTrue(created)
        self.assertEqual(booking.status, BookingStatus.AWAITING_COMMITMENT)
        self.assertEqual(booking.total_value_vnd, 200000)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, 'carepartner_selected')
        self.assertEqual(self.job.selected_carepartner, self.cp)

    def test_other_candidates_not_selected(self):
        select_carepartner(self.job, self.cp)
        b2 = Booking.objects.get(job=self.job, carepartner=self.cp2)
        self.assertEqual(b2.status, BookingStatus.NOT_SELECTED)

    def test_slots_hard_locked(self):
        select_carepartner(self.job, self.cp)
        from matching.models import SlotLock
        locks = SlotLock.objects.filter(carepartner=self.cp, lock_type='hard')
        self.assertEqual(locks.count(), 1)
        self.job.refresh_from_db()
        self.assertEqual(self.job.slots.first().status, 'locked')

    def test_replay_returns_same_booking(self):
        b1, _ = select_carepartner(self.job, self.cp)
        b2, created = select_carepartner(self.job, self.cp)
        self.assertFalse(created)
        self.assertEqual(b1.pk, b2.pk)
        self.assertEqual(Booking.objects.filter(job=self.job).exclude(
            status=BookingStatus.NOT_SELECTED).count(), 1)

    def test_concurrent_select_only_one_wins(self):
        """Chọn CP → job đã selected → lần 2 chọn CP khác → SlotConflict
        (slot đã bị hard lock bởi CP đầu)."""
        select_carepartner(self.job, self.cp)
        with self.assertRaises(SlotConflictError):
            select_carepartner(self.job, self.cp2)

    def test_notifications_enqueued(self):
        """Notify CP critical (job_assigned) + parent — enqueue trong transaction."""
        select_carepartner(self.job, self.cp)
        cp_notifs = Notification.objects.filter(user=self.cp, code='job_assigned')
        self.assertTrue(cp_notifs.exists())
        self.assertEqual(cp_notifs.first().klass, 'critical')
        self.assertTrue(Notification.objects.filter(
            user=self.parent, code='job_assigned').exists())

    def test_state_logs_written(self):
        select_carepartner(self.job, self.cp)
        logs = StateTransitionLog.objects.filter(entity='job_post',
                                                 entity_id=self.job.pk)
        self.assertTrue(logs.exists())

    def test_window_zero_commits_immediately(self):
        """Job bắt đầu sau vài phút → window 0 → booking committed NGAY."""
        from django.utils import timezone as _tz2
        now_local = _tz2.localtime()  # tính toán theo giờ VN, tránh lỗi UTC/VN
        start_dt = now_local + timedelta(minutes=6)
        end_dt = start_dt + timedelta(minutes=50)
        if end_dt.date() != start_dt.date():  # tránh cắt nửa đêm
            start_dt = now_local.replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(minutes=6)
            end_dt = start_dt + timedelta(minutes=50)
        # Freeze now = 3 phút trước giờ start → window 5' vi phạm hard cap
        # (deadline phải cách start >= 5') → window 0 → committed ngay (Step 5.2)
        # LƯU Ý: select_carepartner phải nằm TRONG vùng freeze — nếu gọi ngoài,
        # guard "đã qua giờ bắt đầu" so với giờ THẬT sẽ chết khi chạy sau
        # 22:47 giờ VN (branch dự phòng cắt nửa đêm đặt start = 10:06 hôm nay).
        with patch('django.utils.timezone.now', return_value=(
                start_dt - timedelta(minutes=3)).replace(second=0, microsecond=0)):
            job = JobPost.objects.create(
                parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
                status='matching', latitude=21.0, longitude=105.8)
            JobSlot.objects.create(job=job, date=start_dt.date(),
                                   time_from=start_dt.time().replace(second=0, microsecond=0),
                                   time_to=end_dt.time().replace(second=0, microsecond=0))
            booking, created = select_carepartner(job, self.cp)
        self.assertEqual(booking.status, BookingStatus.COMMITTED)


class LazyCommitTest(MatchingTestBase):
    """QA 2026-09-10 Vấn đề #2 — Grab-style: quá hạn KHÔNG phản hồi →
    hết hạn (EXPIRED_NO_RESPONSE), KHÔNG còn auto-commit."""

    def _make_awaiting_booking(self, cp, parent, deadline_delta):
        job = JobPost.objects.create(parent=parent, job_type='tutoring',
                                     hourly_rate_vnd=100000,
                                     status='carepartner_selected')
        JobSlot.objects.create(job=job, date=MONDAY, time_from=time(19, 0),
                               time_to=time(21, 0))
        return Booking.objects.create(
            job=job, carepartner=cp, parent=parent,
            status=BookingStatus.AWAITING_COMMITMENT,
            selected_at=tz.now(), commit_deadline=tz.now() + deadline_delta,
            total_value_vnd=200000)

    def test_get_flips_status_after_deadline(self):
        """Scheduler chết → GET vẫn lật awaiting → expired_no_response +
        thông báo phụ huynh + chạy replacement."""
        from matching.models import Notification, ReplacementAttempt
        from matching.constants import STATUS_LABELS_VI

        parent = User.objects.create_user('lcp', password='x', role='parent')
        cp = User.objects.create_user('lcc', password='x', role='worker',
                                      is_approved=True)
        cp.first_name = 'Không'; cp.last_name = 'Phản hồi'; cp.save()
        EloService.get_profile(cp)
        booking = self._make_awaiting_booking(
            cp, parent, -timedelta(minutes=1))
        booking = lazy_commit_check(booking)
        self.assertEqual(booking.status, BookingStatus.EXPIRED_NO_RESPONSE)
        self.assertEqual(booking.status_label_vi if hasattr(booking, 'status_label_vi')
                         else STATUS_LABELS_VI[booking.status], 'Hết hạn phản hồi')
        # Phụ huynh nhận thông báo critical 'commit_expired'
        self.assertTrue(Notification.objects.filter(
            user=parent, code='commit_expired').exists())
        # Slot của CP hết hạn được mở khóa
        self.assertFalse(
            SlotLock.objects.filter(booking=booking).exists())
        # Replacement chạy → phụ huynh được đề xuất chọn người khác
        self.assertTrue(ReplacementAttempt.objects.filter(
            job=booking.job).exists())

    def test_not_expired_inside_window(self):
        """Còn trong cửa sổ → lazy check giữ nguyên awaiting."""
        parent = User.objects.create_user('lcp2', password='x', role='parent')
        cp = User.objects.create_user('lcc2', password='x', role='worker',
                                      is_approved=True)
        EloService.get_profile(cp)
        booking = self._make_awaiting_booking(
            cp, parent, timedelta(minutes=10))
        booking = lazy_commit_check(booking)
        self.assertEqual(booking.status, BookingStatus.AWAITING_COMMITMENT)

    def test_commit_booking_carepartner_confirms(self):
        """Carepartner bấm XÁC NHẬN trước deadline → committed + thông báo."""
        from matching.models import Notification

        parent = User.objects.create_user('lcp3', password='x', role='parent')
        cp = User.objects.create_user('lcc3', password='x', role='worker',
                                      is_approved=True)
        cp.first_name = 'Minh'; cp.last_name = 'Anh'; cp.save()
        EloService.get_profile(cp)
        booking = self._make_awaiting_booking(
            cp, parent, timedelta(minutes=30))
        booking, changed = commit_booking(booking, actor_user=cp)
        self.assertTrue(changed)
        self.assertEqual(booking.status, BookingStatus.COMMITTED)
        self.assertIsNotNone(booking.committed_at)
        # CP + parent đều nhận thông báo cam kết
        self.assertTrue(Notification.objects.filter(
            user=cp, code='booking_committed').exists())
        self.assertTrue(Notification.objects.filter(
            user=parent, code='booking_committed_parent').exists())

    def test_commit_booking_idempotent(self):
        """Commit 2 lần → lần 2 không đổi trạng thái (changed=False)."""
        parent = User.objects.create_user('lcp4', password='x', role='parent')
        cp = User.objects.create_user('lcc4', password='x', role='worker',
                                      is_approved=True)
        EloService.get_profile(cp)
        booking = self._make_awaiting_booking(
            cp, parent, timedelta(minutes=30))
        booking, changed1 = commit_booking(booking, actor_user=cp)
        booking, changed2 = commit_booking(booking, actor_user=cp)
        self.assertTrue(changed1)
        self.assertFalse(changed2)
        self.assertEqual(booking.status, BookingStatus.COMMITTED)

    def test_commit_after_expiry_returns_unchanged(self):
        """Đơn đã hết hạn → commit muộn không đổi trạng thái."""
        parent = User.objects.create_user('lcp5', password='x', role='parent')
        cp = User.objects.create_user('lcc5', password='x', role='worker',
                                      is_approved=True)
        EloService.get_profile(cp)
        booking = self._make_awaiting_booking(
            cp, parent, -timedelta(minutes=1))
        expired = expire_booking_on_deadline(booking)
        self.assertEqual(expired.status, BookingStatus.EXPIRED_NO_RESPONSE)
        expired, changed = commit_booking(expired, actor_user=cp)
        self.assertFalse(changed)
        self.assertEqual(expired.status, BookingStatus.EXPIRED_NO_RESPONSE)
