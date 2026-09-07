"""
matching/tests/test_availability.py — API lịch rảnh + blackout (Prompt 04 checklist).
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from matching.tests.base import MatchingTestBase
from django.utils import timezone as tz

from matching.models import (
    Booking,
    CarePartnerAvailability,
    CarePartnerBlackout,
    CarePartnerProfile,
    JobPost,
    JobSlot,
)
from matching.services.elo_service import EloService

User = get_user_model()


class AvailabilityAPITest(MatchingTestBase):
    def setUp(self):
        self.cp = User.objects.create_user('cp', password='x', role='worker',
                                           is_approved=True)
        self.parent = User.objects.create_user('p', password='x', role='parent')
        EloService.get_profile(self.cp)
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=self.cp)

    def _make_busy_booking(self, d, tf, tt):
        job = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                     hourly_rate_vnd=100000)
        JobSlot.objects.create(job=job, date=d, time_from=tf, time_to=tt)
        return Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status='committed', total_value_vnd=100000,
            selected_at=tz.now(), commit_deadline=tz.now())

    def test_create_and_list_window(self):
        resp = self.client.post('/api/matching/carepartners/me/availability/',
                                {'weekday': 0, 'time_from': '18:00', 'time_to': '21:00'},
                                format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(CarePartnerAvailability.objects.count(), 1)
        resp = self.client.get('/api/matching/carepartners/me/availability/')
        self.assertEqual(len(resp.json()['windows']), 1)
        self.assertEqual(resp.json()['windows'][0]['time_from'], '18:00:00')

    def test_overlap_returns_merge_suggestion(self):
        self.client.post('/api/matching/carepartners/me/availability/',
                         {'weekday': 0, 'time_from': '18:00', 'time_to': '21:00'},
                         format='json')
        resp = self.client.post('/api/matching/carepartners/me/availability/',
                                {'weekday': 0, 'time_from': '19:00', 'time_to': '22:00'},
                                format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('merge_suggestion', resp.json())

    def test_split_midnight_two_rows(self):
        """Window 22:00-01:00 → 2 row: 22:00-23:59 và 00:00-01:00 (Step 9.3)."""
        resp = self.client.post('/api/matching/carepartners/me/availability/',
                                {'weekday': 0, 'time_from': '22:00', 'time_to': '01:00'},
                                format='json')
        self.assertEqual(resp.status_code, 201)
        rows = CarePartnerAvailability.objects.order_by('weekday', 'time_from')
        self.assertEqual(rows.count(), 2)
        self.assertEqual((rows[0].weekday, rows[0].time_from.hour, rows[0].time_to.hour),
                         (0, 22, 23))
        self.assertEqual((rows[1].weekday, rows[1].time_from.hour, rows[1].time_to.hour),
                         (1, 0, 1))

    def test_delete_window_with_booking_409(self):
        """Weekly Mon 18-21 + booking Mon 19-21 → xóa window → 409."""
        from datetime import date as d
        self.client.post('/api/matching/carepartners/me/availability/',
                         {'weekday': 0, 'time_from': '18:00', 'time_to': '21:00'},
                         format='json')
        window = CarePartnerAvailability.objects.first()
        monday = d(2026, 9, 14)
        self._make_busy_booking(monday, time(19, 0), time(21, 0))
        resp = self.client.delete(
            f'/api/matching/carepartners/me/availability/{window.pk}/')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()['code'], 'availability_locked_by_booking')

    def test_bulk_all_or_nothing(self):
        from datetime import date as d
        self.client.post('/api/matching/carepartners/me/availability/',
                         {'weekday': 0, 'time_from': '18:00', 'time_to': '21:00'},
                         format='json')
        monday = d(2026, 9, 14)
        self._make_busy_booking(monday, time(19, 0), time(21, 0))
        resp = self.client.put('/api/matching/carepartners/me/availability/bulk/',
                               {'windows': [{'weekday': 2, 'time_from': '08:00',
                                             'time_to': '11:00'}]},
                               format='json')
        self.assertEqual(resp.status_code, 409)
        # Không xóa gì cả
        self.assertTrue(CarePartnerAvailability.objects.filter(weekday=0).exists())
        self.assertFalse(CarePartnerAvailability.objects.filter(weekday=2).exists())

    def test_parent_cannot_use(self):
        from rest_framework.test import APIClient
        c = APIClient()
        c.force_authenticate(user=self.parent)
        resp = c.post('/api/matching/carepartners/me/availability/',
                      {'weekday': 0, 'time_from': '18:00', 'time_to': '21:00'},
                      format='json')
        self.assertEqual(resp.status_code, 403)


class BlackoutAPITest(MatchingTestBase):
    def setUp(self):
        self.cp = User.objects.create_user('cp', password='x', role='worker',
                                           is_approved=True)
        self.parent = User.objects.create_user('p', password='x', role='parent')
        EloService.get_profile(self.cp)
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=self.cp)
        self.monday = date(2026, 9, 14)

    def _make_busy_booking(self, d, tf, tt):
        job = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                     hourly_rate_vnd=100000)
        JobSlot.objects.create(job=job, date=d, time_from=tf, time_to=tt)
        return Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status='committed', total_value_vnd=100000,
            selected_at=tz.now(), commit_deadline=tz.now())

    def test_create_blackout(self):
        resp = self.client.post('/api/matching/carepartners/me/blackouts/',
                                {'date': '2026-09-20', 'reason': 'exam'},
                                format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blackout_conflict_with_booking_409(self):
        self._make_busy_booking(self.monday, time(19, 0), time(21, 0))
        resp = self.client.post('/api/matching/carepartners/me/blackouts/',
                                {'date': '2026-09-14', 'reason': 'exam'},
                                format='json')
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()['code'], 'blackout_conflicts_with_booking')

    def test_31st_blackout_rejected(self):
        from matching.models import MatchingConfig
        # Đảm bảo config chuẩn 30
        cfg = MatchingConfig.objects.get(key='MAX_BLACKOUTS_FUTURE')
        cfg.value_json = 30
        cfg.save()
        from matching.config import invalidate_cache
        invalidate_cache()
        for i in range(30):
            CarePartnerBlackout.objects.create(
                carepartner=self.cp, date=self.monday + timedelta(days=i + 1),
                reason='personal')
        resp = self.client.post('/api/matching/carepartners/me/blackouts/',
                                {'date': '2026-11-01', 'reason': 'personal'},
                                format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()['code'], 'too_many_blackouts')

    def test_14_day_full_blackout_pause(self):
        """14 ngày nghỉ FULL liên tiếp → matching_paused + 1 notification."""
        from matching.models import Notification
        for i in range(14):
            CarePartnerBlackout.objects.create(
                carepartner=self.cp, date=self.monday + timedelta(days=i),
                reason='travel')
        profile = CarePartnerProfile.objects.get(user=self.cp)
        self.assertTrue(profile.matching_paused)
        notifs = Notification.objects.filter(user=self.cp, code='blackout_paused')
        self.assertEqual(notifs.count(), 1)

    def test_13_days_no_pause(self):
        for i in range(13):
            CarePartnerBlackout.objects.create(
                carepartner=self.cp, date=self.monday + timedelta(days=i),
                reason='travel')
        profile = CarePartnerProfile.objects.get(user=self.cp)
        self.assertFalse(profile.matching_paused)


class CreditAPITest(MatchingTestBase):
    def test_parent_wallet_balance(self):
        parent = User.objects.create_user('wp', password='x', role='parent')
        cp = User.objects.create_user('wc', password='x', role='worker',
                                      is_approved=True)
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.get('/api/matching/credits/balance/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['credit_vnd'], 0)
