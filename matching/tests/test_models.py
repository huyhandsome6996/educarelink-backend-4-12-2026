"""
matching/tests/test_models.py — Test schema (Prompt 01 Testing Checklist).
"""

from django.contrib.auth import get_user_model
from django.utils import timezone as tz
from django.db import IntegrityError
from django.test import TestCase
from matching.tests.base import MatchingTestBase

from matching.models import (
    Booking,
    JobPost,
    JobSlot,
    MatchingWeight,
)
from matching.services.elo_service import EloService
from matching.services.credits_service import issue_compensation, get_or_create_balance

from datetime import date, time

User = get_user_model()


class BaseModelTest(MatchingTestBase):
    def setUp(self):
        self.parent = User.objects.create_user('parent1', password='x', role='parent')
        self.cp = User.objects.create_user('cp1', password='x', role='worker',
                                           is_approved=True)

    def _make_job(self):
        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring',
            hourly_rate_vnd=100000, status='ai_parsed',
            latitude=21.0, longitude=105.8)
        JobSlot.objects.create(job=job, date=date(2026, 9, 14),
                               time_from=time(19, 0), time_to=time(21, 0))
        return job

    def test_job_slot_time_to_must_be_later(self):
        job = self._make_job()
        with self.assertRaises(IntegrityError):
            JobSlot.objects.create(job=job, date=date(2026, 9, 14),
                                   time_from=time(21, 0), time_to=time(19, 0))

    def test_hourly_rate_must_be_positive(self):
        with self.assertRaises(IntegrityError):
            JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                   hourly_rate_vnd=0)

    def test_booking_unique_per_job_carepartner(self):
        job = self._make_job()
        EloService.get_profile(self.cp)
        Booking.objects.create(
            job=job, carepartner=self.cp, parent=self.parent,
            status='awaiting_commitment', selected_at=tz.now(),
            commit_deadline=tz.now(),
            total_value_vnd=200000)
        with self.assertRaises(IntegrityError):
            Booking.objects.create(
                job=job, carepartner=self.cp, parent=self.parent,
                status='awaiting_commitment',
                selected_at=tz.now(),
                commit_deadline=tz.now(),
                total_value_vnd=200000)

    def test_uuid_primary_keys(self):
        job = self._make_job()
        self.assertEqual(len(str(job.pk)), 36)
        self.assertEqual(len(str(job.slots.first().pk)), 36)


class MatchingWeightTest(MatchingTestBase):
    def test_sum_99_rejected_on_full_save(self):
        row = MatchingWeight.objects.get(factor='availability')
        row.weight_pct = 24  # tổng còn lại = 99
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            row.full_clean()


class CreditTest(MatchingTestBase):
    def setUp(self):
        self.parent = User.objects.create_user('p1', password='x', role='parent')
        self.cp = User.objects.create_user('c1', password='x', role='worker',
                                           is_approved=True)
        from matching.models import JobPost, JobSlot
        self.job = JobPost.objects.create(parent=self.parent, job_type='tutoring',
                                          hourly_rate_vnd=100000)
        JobSlot.objects.create(job=self.job, date=date(2026, 9, 14),
                               time_from=time(19, 0), time_to=time(21, 0))
        self.booking = Booking.objects.create(
            job=self.job, carepartner=self.cp, parent=self.parent,
            status='committed', total_value_vnd=200000,
            selected_at=tz.now(),
            commit_deadline=tz.now())

    def test_compensation_idempotent(self):
        txn1, created1 = issue_compensation(self.booking, 60000, note='T3 test')
        txn2, created2 = issue_compensation(self.booking, 60000, note='T3 test')
        self.assertTrue(created1)
        self.assertFalse(created2)
        balance = get_or_create_balance(self.parent)
        self.assertEqual(balance.credit_vnd, 60000)

    def test_compensation_rounds_down_to_1000(self):
        from matching.services.credits_service import compute_compensation
        from matching.models import CancelPolicy
        policy = CancelPolicy.objects.get(tier='T2')  # 10%
        self.booking.total_value_vnd = 123456
        amount = compute_compensation(self.booking, policy)
        self.assertEqual(amount, 12000)  # 12345.6 → làm tròn xuống 12.000

    def test_t5_min_compensation_floor(self):
        from matching.services.credits_service import compute_compensation
        from matching.models import CancelPolicy
        policy = CancelPolicy.objects.get(tier='T5')  # 50%, sàn 50.000
        self.booking.total_value_vnd = 60000
        amount = compute_compensation(self.booking, policy)
        self.assertEqual(amount, 50000)  # 30.000 < sàn 50.000
