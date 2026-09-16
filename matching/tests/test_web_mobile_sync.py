"""
matching/tests/test_web_mobile_sync.py — QA đồng bộ web ↔ mobile (2026-09-17).

Bao phủ 3 thay đổi backend để web bắt kịp mobile:
  1. _booking_dict trả 'reschedule_request' (pending) — phụ huynh web biết
     CP xin đổi sang khung nào + deadline phản hồi (Step 9 Rule 3).
  2. DELETE /carepartners/me/blackouts/<pk>/ trả 409 khi đang có booking
     active trong ngày bận (web ngay_ban.html hứa + mobile xử lý 409).
  3. POST /api/matching/notifications/mark-read/ set read_at (trước đây
     badge chưa đọc tăng vô hạn vì read_at không bao giờ được set).

+ Luồng reschedule end-to-end qua API (create → approve/decline) —
  trước đây Step 9 Rule 3 chưa có test nào.
"""

from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone as tz

from matching.models import (
    Booking,
    CarePartnerAvailability,
    CarePartnerBlackout,
    JobPost,
    JobSlot,
    Notification,
    RescheduleRequest,
)
from matching.services.elo_service import EloService
from matching.tests.base import MatchingTestBase

from rest_framework.test import APIClient

User = get_user_model()


def _next_monday():
    """Thứ 2 kế tiếp (luôn ở tương lai) — tránh test rot theo lịch thật."""
    today = tz.localdate()
    days_ahead = (0 - today.weekday()) % 7
    return today + timedelta(days=days_ahead or 7)


MONDAY = _next_monday()


class WebMobileSyncBase(MatchingTestBase):
    """Chuẩn bị parent + CP đã duyệt + booking committed thứ 2 19:00-21:00."""

    def setUp(self):
        self.parent = User.objects.create_user('wms_parent', password='x',
                                               role='parent')
        self.cp = User.objects.create_user('wms_cp', password='x',
                                           role='worker', is_approved=True)
        EloService.get_profile(self.cp)
        CarePartnerAvailability.objects.create(carepartner=self.cp, weekday=0,
                                               time_from=time(18, 0),
                                               time_to=time(22, 0))
        self.job = JobPost.objects.create(parent=self.parent,
                                          job_type='tutoring',
                                          hourly_rate_vnd=100000,
                                          status='carepartner_selected')
        JobSlot.objects.create(job=self.job, date=MONDAY,
                               time_from=time(19, 0), time_to=time(21, 0))
        self.booking = Booking.objects.create(
            job=self.job, carepartner=self.cp, parent=self.parent,
            status='committed', total_value_vnd=200000,
            selected_at=tz.now(), commit_deadline=tz.now())
        self.parent_client = APIClient()
        self.parent_client.force_authenticate(user=self.parent)
        self.cp_client = APIClient()
        self.cp_client.force_authenticate(user=self.cp)


class RescheduleRequestInfoTest(WebMobileSyncBase):
    """(1) Booking dict trả thông tin yêu cầu đổi giờ đang chờ."""

    def _create_request(self):
        resp = self.cp_client.post(
            f'/api/matching/bookings/{self.booking.pk}/reschedule/',
            {'date': str(MONDAY), 'time_from': '21:00', 'time_to': '22:00',
             'reason': 'Trùng lịch thi giữa kỳ'},
            format='json')
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp

    def test_create_reschedule_moves_booking_to_requested(self):
        self._create_request()
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'reschedule_requested')
        self.assertEqual(RescheduleRequest.objects.count(), 1)

    def test_detail_contains_pending_reschedule_request(self):
        """Parent GET booking detail → reschedule_request có khung mới +
        deadline — dữ liệu để web render card duyệt/từ chối."""
        self._create_request()
        resp = self.parent_client.get(
            f'/api/matching/bookings/{self.booking.pk}/')
        self.assertEqual(resp.status_code, 200)
        rs = resp.json().get('reschedule_request')
        self.assertIsNotNone(rs)
        self.assertEqual(rs['new_date'], str(MONDAY))
        self.assertEqual(rs['new_time_from'], '21:00')
        self.assertEqual(rs['new_time_to'], '22:00')
        self.assertEqual(rs['reason'], 'Trùng lịch thi giữa kỳ')
        self.assertEqual(rs['status'], 'pending')
        self.assertIsNotNone(rs['parent_deadline'])

    def test_no_pending_request_returns_null(self):
        resp = self.parent_client.get(
            f'/api/matching/bookings/{self.booking.pk}/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json().get('reschedule_request'))

    def test_approve_swaps_slot_and_returns_committed(self):
        """Duyệt đổi giờ → JobSlot thay bằng khung mới (ATOMIC) + booking
        committed + reschedule_request trở lại None."""
        self._create_request()
        resp = self.parent_client.post(
            f'/api/matching/bookings/{self.booking.pk}/reschedule/respond/',
            {'decision': 'approve'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertTrue(body['ok'])
        self.assertEqual(body['booking']['status'], 'committed')
        self.assertIsNone(body['booking']['reschedule_request'])
        slot = JobSlot.objects.filter(job=self.job).first()
        self.assertIsNotNone(slot)
        self.assertEqual(slot.date, MONDAY)
        self.assertEqual(slot.time_from, time(21, 0))
        self.assertEqual(slot.time_to, time(22, 0))
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'committed')

    def test_decline_keeps_original_slot(self):
        self._create_request()
        resp = self.parent_client.post(
            f'/api/matching/bookings/{self.booking.pk}/reschedule/respond/',
            {'decision': 'decline'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertEqual(body['booking']['status'], 'committed')
        self.assertIsNone(body['booking']['reschedule_request'])
        slot = JobSlot.objects.filter(job=self.job).first()
        self.assertEqual(slot.time_from, time(19, 0))
        self.assertEqual(slot.time_to, time(21, 0))

    def test_reschedule_outside_availability_rejected_400(self):
        """Khung mới phải nằm trong lịch rảnh CP (Step 9.1.3.1) —
        21:30-22:30 tràn ra ngoài window 18:00-22:00 → 400."""
        resp = self.cp_client.post(
            f'/api/matching/bookings/{self.booking.pk}/reschedule/',
            {'date': str(MONDAY), 'time_from': '21:30', 'time_to': '22:30'},
            format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('detail', resp.json())

    def test_reschedule_without_pending_respond_400(self):
        resp = self.parent_client.post(
            f'/api/matching/bookings/{self.booking.pk}/reschedule/respond/',
            {'decision': 'approve'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json().get('code'), 'no_pending_request')


class BlackoutDeleteConflictTest(WebMobileSyncBase):
    """(2) Xóa ngày bận bị chặn 409 khi có booking active trong ngày."""

    def _make_blackout(self):
        return CarePartnerBlackout.objects.create(
            carepartner=self.cp, date=MONDAY,
            time_from=None, time_to=None, reason='other')

    def test_delete_blocked_when_busy_booking_on_date(self):
        blackout = self._make_blackout()
        resp = self.cp_client.delete(
            f'/api/matching/carepartners/me/blackouts/{blackout.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json().get('code'),
                         'blackout_conflicts_with_booking')
        self.assertTrue(CarePartnerBlackout.objects.filter(pk=blackout.pk).exists())

    def test_delete_allowed_after_booking_completed(self):
        blackout = self._make_blackout()
        self.booking.status = 'completed'
        self.booking.save(update_fields=['status'])
        resp = self.cp_client.delete(
            f'/api/matching/carepartners/me/blackouts/{blackout.pk}/')
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(CarePartnerBlackout.objects.filter(pk=blackout.pk).exists())

    def test_delete_other_free_date_ok(self):
        blackout = CarePartnerBlackout.objects.create(
            carepartner=self.cp, date=MONDAY + timedelta(days=3),
            time_from=None, time_to=None, reason='exam')
        resp = self.cp_client.delete(
            f'/api/matching/carepartners/me/blackouts/{blackout.pk}/')
        self.assertEqual(resp.status_code, 204)


class MatchingNotificationMarkReadTest(WebMobileSyncBase):
    """(3) mark-read set read_at — đồng bộ hành vi 'Đọc tất cả' web."""

    def _make_notification(self, code='job_assigned'):
        return Notification.objects.create(
            user=self.cp, code=code, klass='critical',
            title_vi='Bạn có đơn mới', body_vi='Nội dung')

    def test_mark_all_read(self):
        self._make_notification()
        self._make_notification('booking_committed')
        resp = self.cp_client.post(
            '/api/matching/notifications/mark-read/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['marked'], 2)
        self.assertEqual(body['unread'], 0)
        self.assertFalse(Notification.objects.filter(
            user=self.cp, read_at__isnull=True).exists())

    def test_mark_selected_ids_only(self):
        n1 = self._make_notification()
        self._make_notification('booking_committed')
        resp = self.cp_client.post(
            '/api/matching/notifications/mark-read/',
            {'ids': [str(n1.pk)]}, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['marked'], 1)
        self.assertEqual(body['unread'], 1)
        n1.refresh_from_db()
        self.assertIsNotNone(n1.read_at)


class BookingDictContractTest(WebMobileSyncBase):
    """Hợp đồng _booking_dict dùng chung web + mobile (QA 2026-09-17)."""

    def test_booking_dict_has_elo_delta_applied_field(self):
        """Web don.html đọc elo_delta_applied (trước đây đọc elo_delta
        không tồn tại → toast phạt không bao giờ hiện)."""
        resp = self.parent_client.get(
            f'/api/matching/bookings/{self.booking.pk}/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('elo_delta_applied', resp.json())

    def test_cancel_response_contains_elo_delta_applied(self):
        """POST cancel trả elo_delta_applied để web toast điểm tín nhiệm."""
        resp = self.cp_client.post(
            f'/api/matching/bookings/{self.booking.pk}/cancel/',
            {'reason_code': 'transport', 'note': 'Xe hỏng giữa đường'},
            format='json')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertIn('elo_delta_applied', resp.json())
