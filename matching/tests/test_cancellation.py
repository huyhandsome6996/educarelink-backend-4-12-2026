"""
matching/tests/test_cancellation.py — Hủy / phạt tier / đền bù credit /
no-show / appeal (Step 7 checklist + master prompt AC).
"""

from datetime import date, time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone as tz

from matching.constants import BookingStatus
from matching.models import (
    Appeal,
    Booking,
    CarePartnerAvailability,
    CreditBalance,
    CreditTransaction,
    EloLedger,
    JobPost,
    JobSlot,
    Notification,
    ParentTrustFlag,
    SlotLock,
)
from matching.services.booking_service import select_carepartner
from matching.services.cancellation_service import (
    cancel_by_carepartner,
    cancel_by_parent,
    confirm_no_show,
    create_appeal,
    decide_appeal,
    no_show_unconfirmed_timeout,
    select_tier_for_cancel,
    CancelValidationError,
)
from matching.services.credits_service import get_or_create_balance
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase

User = get_user_model()
MONDAY = date(2026, 9, 14)


class CancelBaseTest(MatchingTestBase):
    """Freeze time chuẩn: NOW = thứ Hai 07/09/2026 10:00 VN.
    Slot = NOW + lead_hours (duration 2h) → lead time CHÍNH XÁC cho tier."""

    NOW = None  # set trong setUp

    def setUp(self):
        super().setUp()
        import datetime as _dtmod
        from django.utils import timezone as _tz
        vn = _tz.get_current_timezone()
        self.NOW = _dtmod.datetime(2026, 9, 7, 10, 0, 0, tzinfo=vn)
        patcher = patch('django.utils.timezone.now', return_value=self.NOW)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _make_committed_booking(self, *, lead_hours=10, value=200000,
                                cp_name='ccp', status=BookingStatus.COMMITTED):
        self.parent = User.objects.create_user(f'par_{cp_name}', password='x',
                                               role='parent')
        self.cp = User.objects.create_user(cp_name, password='x', role='worker',
                                           is_approved=True)
        EloService.get_profile(self.cp)
        start = self.NOW + timedelta(hours=lead_hours)
        end = start + timedelta(hours=2)
        assert end.date() == start.date(), 'Test design: duration 2h phải cùng ngày'
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            status='carepartner_selected')
        JobSlot.objects.create(job=self.job, date=start.date(),
                               time_from=start.time().replace(second=0, microsecond=0),
                               time_to=end.time().replace(second=0, microsecond=0))
        return Booking.objects.create(
            job=self.job, carepartner=self.cp, parent=self.parent,
            status=status, total_value_vnd=value,
            selected_at=self.NOW, commit_deadline=self.NOW + timedelta(hours=1))


class TierSelectionTest(CancelBaseTest):
    def test_30h_t1(self):
        booking = self._make_committed_booking(lead_hours=30)
        policy, lead = select_tier_for_cancel(booking)
        self.assertEqual(policy.tier, 'T1')

    def test_10h_t2(self):
        booking = self._make_committed_booking(lead_hours=10)
        policy, lead = select_tier_for_cancel(booking)
        self.assertEqual(policy.tier, 'T2')

    def test_4h_t3(self):
        booking = self._make_committed_booking(lead_hours=4)
        policy, lead = select_tier_for_cancel(booking)
        self.assertEqual(policy.tier, 'T3')

    def test_1h_t4(self):
        booking = self._make_committed_booking(lead_hours=1)
        policy, lead = select_tier_for_cancel(booking)
        self.assertEqual(policy.tier, 'T4')


class CancelFlowTest(CancelBaseTest):
    def test_cancel_30h_t1_no_compensation(self):
        """Cancel 30h trước → T1, -15 ELO, đền 0 (Step 7 checklist)."""
        booking = self._make_committed_booking(lead_hours=30)
        booking, changed = cancel_by_carepartner(booking, 'personal')
        self.assertTrue(changed)
        self.assertEqual(booking.status, BookingStatus.CANCELLED_BY_CAREPARTNER)
        self.assertEqual(booking.elo_delta_applied, -15)
        self.assertEqual(booking.compensation_vnd, 0)
        profile = EloService.get_profile(self.cp)
        self.assertEqual(profile.effective_elo, 1185.0)

    def test_cancel_10h_t2_compensation_10pct(self):
        booking = self._make_committed_booking(lead_hours=10, value=200000)
        booking, _ = cancel_by_carepartner(booking, 'transport')
        self.assertEqual(booking.elo_delta_applied, -30)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 20000)  # 10% của 200k

    def test_cancel_4h_t3_compensation_20pct(self):
        booking = self._make_committed_booking(lead_hours=4, value=200000)
        booking, _ = cancel_by_carepartner(booking, 'transport')
        self.assertEqual(booking.elo_delta_applied, -50)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 40000)

    def test_cancel_1h_t4_compensation_30pct(self):
        booking = self._make_committed_booking(lead_hours=1, value=200000)
        booking, _ = cancel_by_carepartner(booking, 'transport')
        self.assertEqual(booking.elo_delta_applied, -80)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 60000)

    def test_force_majeure_halves_elo_keeps_compensation(self):
        """Force majeure T4 → ELO -40 (×0.5), đền vẫn 30% (Step 7 AC3)."""
        booking = self._make_committed_booking(lead_hours=1, value=200000)
        booking, _ = cancel_by_carepartner(booking, 'health', note='Tôi bị sốt cao phải nhập viện khẩn cấp')
        self.assertEqual(booking.elo_delta_applied, -40)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 60000)  # ĐỀN BÙ KHÔNG GIẢM

    def test_force_majeure_requires_20_char_note(self):
        booking = self._make_committed_booking(lead_hours=10)
        with self.assertRaises(CancelValidationError):
            cancel_by_carepartner(booking, 'health', note='ngắn')

    def test_cancel_twice_idempotent(self):
        """Gửi 2 lần → 1 phạt, 1 đền, 1 notification (Step 7 checklist cuối)."""
        booking = self._make_committed_booking(lead_hours=10, value=200000)
        cancel_by_carepartner(booking, 'transport')
        booking2, changed = cancel_by_carepartner(booking, 'transport')
        self.assertFalse(changed)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 20000)  # không cộng dồn
        self.assertEqual(EloLedger.objects.filter(
            booking=booking, reason_code='T2').count(), 1)
        self.assertEqual(
            Notification.objects.filter(user=self.parent,
                                        code='carepartner_cancelled').count(), 1)

    def test_cancel_releases_locks(self):
        booking = self._make_committed_booking(lead_hours=10)
        from matching.models import SlotLock
        SlotLock.objects.create(carepartner=self.cp, booking=booking,
                                date=MONDAY, time_from=time(19, 0),
                                time_to=time(21, 0), lock_type='hard')
        cancel_by_carepartner(booking, 'personal')
        self.assertEqual(SlotLock.objects.filter(booking=booking).count(), 0)

    def test_cancel_triggers_replacement(self):
        booking = self._make_committed_booking(lead_hours=10)
        cancel_by_carepartner(booking, 'transport')
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, 'needs_replacement')
        # Notify replacement chain
        self.assertTrue(
            Notification.objects.filter(user=self.parent, code='replacement_found')
            .exists() or
            Notification.objects.filter(user=self.parent, code='no_replacement')
            .exists())

    def test_third_force_majeure_full_penalty(self):
        """Force majeure thứ 3 trong 30 ngày → phạt FULL (Step 5.3 anti-abuse).

        Seed 2 booking FM ĐÃ HỦY trước đó trong 30 ngày (đúng path thật:
        anti-abuse đếm từ Booking.cancel_reason_code, không phải EloLedger —
        vì ledger ghi reason_code là TIER T0-T6, không phải lý do FM).
        """
        booking = self._make_committed_booking(lead_hours=10, value=200000)
        # 2 force majeure trước đó trong 30 ngày — booking đã hủy thật
        for i in range(2):
            prior_job = JobPost.objects.create(
                parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
                status='cancelled_by_carepartner')
            JobSlot.objects.create(job=prior_job, date=MONDAY,
                                   time_from=time(1 + 3 * i, 0),
                                   time_to=time(2 + 3 * i, 0))
            Booking.objects.create(
                job=prior_job, carepartner=self.cp, parent=self.parent,
                status=BookingStatus.CANCELLED_BY_CAREPARTNER,
                total_value_vnd=100000, selected_at=self.NOW,
                commit_deadline=self.NOW,
                cancel_reason_code='health', cancel_class='force_majeure',
                cancel_note='Bệnh đột xuất có giấy nhập viện',
                cancelled_at=self.NOW - timedelta(days=i + 1),
            )
        booking, _ = cancel_by_carepartner(booking, 'health',
                                           note='Lý do bất khả kháng thứ ba trong tháng này')
        # FULL T2 = -30, không ×0.5
        self.assertEqual(booking.elo_delta_applied, -30)
        self.assertEqual(booking.cancel_class, 'normal_cancel_abuse')


class NoShowTest(CancelBaseTest):
    def _suspected(self, value=60000):
        booking = self._make_committed_booking(lead_hours=1, value=value)
        booking.status = BookingStatus.SUSPECTED_NO_SHOW
        booking.save(update_fields=['status'])
        return booking

    def test_parent_confirms_no_show_t5(self):
        """Parent bấm [Không đến] → T5 -150, đền 50% sàn 50.000 (AC tổng)."""
        booking = self._suspected(value=60000)  # 50% = 30k < sàn 50k
        booking, penalized = confirm_no_show(booking, parent_says_arrived=False)
        self.assertTrue(penalized)
        self.assertEqual(booking.status, BookingStatus.NO_SHOW)
        self.assertEqual(booking.elo_delta_applied, -150)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 50000)  # sàn, không phải 30k

    def test_parent_says_arrived_resumes(self):
        booking = self._suspected()
        booking, penalized = confirm_no_show(booking, parent_says_arrived=True)
        self.assertFalse(penalized)
        self.assertEqual(booking.status, BookingStatus.IN_PROGRESS)
        profile = EloService.get_profile(self.cp)
        effective, _band = EloService.recompute(profile)
        self.assertEqual(effective, 1200.0)  # không phạt

    def test_silence_24h_t4_only(self):
        booking = self._suspected(value=200000)
        booking.updated_at = tz.now() - timedelta(hours=25)
        booking.save(update_fields=['updated_at'])
        booking = no_show_unconfirmed_timeout(booking)
        self.assertEqual(booking.status, BookingStatus.NO_SHOW_UNCONFIRMED)
        self.assertEqual(EloLedger.objects.filter(
            booking=booking, reason_code='T4').count(), 1)


class ParentCancelTest(CancelBaseTest):
    def test_parent_cancels_2h_carepartner_gets_10_and_flag(self):
        booking = self._make_committed_booking(lead_hours=2)
        booking, _ = cancel_by_parent(booking)
        self.assertEqual(booking.status, BookingStatus.CANCELLED_BY_PARENT)
        # CP được +10 ELO (parent hủy <3h)
        self.assertTrue(EloLedger.objects.filter(
            carepartner=self.cp, reason_code='parent_cancelled_compensation',
            delta=10).exists())
        self.assertTrue(ParentTrustFlag.objects.filter(
            parent=self.parent, code='late_cancel').exists())

    def test_parent_cancels_23h_carepartner_gets_5(self):
        booking = self._make_committed_booking(lead_hours=23)
        cancel_by_parent(booking)
        self.assertTrue(EloLedger.objects.filter(
            carepartner=self.cp, reason_code='parent_cancelled_compensation',
            delta=5).exists())
        self.assertFalse(ParentTrustFlag.objects.filter(parent=self.parent).exists())

    def test_parent_cancels_30h_free(self):
        booking = self._make_committed_booking(lead_hours=30)
        cancel_by_parent(booking)
        self.assertFalse(EloLedger.objects.filter(
            carepartner=self.cp, reason_code='parent_cancelled_compensation').exists())


class AppealTest(CancelBaseTest):
    def _penalized_booking(self):
        booking = self._make_committed_booking(lead_hours=10)
        cancel_by_carepartner(booking, 'transport')  # T2 -30
        return booking

    def test_appeal_approved_reverses_elo_keeps_credit(self):
        booking = self._penalized_booking()
        appeal = create_appeal(booking, self.cp, 'transport',
                               'Xe bus bị hủy tuyến, tôi đã gọi điện báo ngay lập tức')
        appeal = decide_appeal(appeal, admin=None, decision='approved',
                               admin_note='Xác nhận hợp lệ')
        self.assertEqual(appeal.status, 'approved')
        # Ledger có row đảo +30
        self.assertTrue(EloLedger.objects.filter(
            carepartner=self.cp, reason_code='appeal_approved', delta=30).exists())
        # Đền bù parent GIỮ NGUYÊN (Step 7.6)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 20000)

    def test_fourth_appeal_auto_rejected(self):
        # 1 CP kháng cáo duy nhất — tránh self.cp bị _make_committed_booking gán lại
        abuser = User.objects.create_user('abuser', password='x', role='worker',
                                          is_approved=True)
        EloService.get_profile(abuser)
        for i in range(3):
            b = self._make_committed_booking(lead_hours=10, cp_name=f'ab{i}')
            Appeal.objects.create(booking=b,
                carepartner=abuser, reason_code='personal',
                note='Kháng cáo trước đó hợp lệ', status='rejected')
        booking = self._make_committed_booking(lead_hours=10, cp_name='ab3')
        cancel_by_carepartner(booking, 'transport')
        appeal = create_appeal(booking, abuser, 'transport',
                               'Kháng cáo thứ tư trong vòng 30 ngày đây')
        self.assertEqual(appeal.status, 'rejected')
        # anti-abuse -10 (Step 6.4)
        self.assertTrue(EloLedger.objects.filter(
            carepartner=abuser, reason_code='appeal_abuse', delta=-10).exists())

    def test_appeal_too_late(self):
        booking = self._penalized_booking()
        booking.cancelled_at = tz.now() - timedelta(days=8)
        booking.save(update_fields=['cancelled_at'])
        with self.assertRaises(CancelValidationError):
            create_appeal(booking, self.cp, 'transport', 'Xin kháng cáo quá hạn 8 ngày rồi')
