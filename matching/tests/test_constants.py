"""
matching/tests/test_constants.py — State machine data-driven (Step 12)
+ test seed idempotent (Prompt 01 Testing Checklist).
"""

from django.core.management import call_command
from django.test import TestCase

from matching.constants import (
    BOOKING_TRANSITIONS,
    FORCE_MAJEURE_CODES,
    JOBPOST_TRANSITIONS,
    STATUS_LABELS_VI,
    BookingStatus,
    JobPostStatus,
    is_valid_transition,
)
from matching.models import (
    CancelPolicy,
    EloBand,
    MatchingWeight,
    NotificationTemplate,
)


class StateMachineTest(TestCase):
    def test_all_status_have_vi_labels(self):
        """13 + 16 nhãn tiếng Việt (Step 12 AC6)."""
        for status_value, _label in JobPostStatus.choices:
            self.assertIn(status_value, STATUS_LABELS_VI)
        for status_value, _label in BookingStatus.choices:
            self.assertIn(status_value, STATUS_LABELS_VI)
        # 13 job + 16 booking − 3 nhãn dùng chung (in_progress, completed,
        # cancelled_by_parent) = 26 nhãn duy nhất
        self.assertEqual(len(STATUS_LABELS_VI), 26)

    def test_every_transition_target_is_known_status(self):
        """Duyệt ngược: mọi đích-to của bảng đều là enum hợp lệ."""
        for mapping, enum_cls in ((JOBPOST_TRANSITIONS, JobPostStatus),
                                  (BOOKING_TRANSITIONS, BookingStatus)):
            valid = set(enum_cls.values)
            for from_status, targets in mapping.items():
                self.assertIn(from_status, valid)
                for to_status in targets:
                    self.assertIn(to_status, valid,
                                  f'{from_status} → {to_status} không phải enum hợp lệ')

    def test_every_status_appears_in_transition_map(self):
        for mapping, enum_cls in ((JOBPOST_TRANSITIONS, JobPostStatus),
                                  (BOOKING_TRANSITIONS, BookingStatus)):
            for status_value in enum_cls.values:
                self.assertIn(status_value, mapping)

    def test_happy_path_valid(self):
        path = [JobPostStatus.DRAFT, JobPostStatus.PUBLISHED,
                JobPostStatus.AI_PARSING, JobPostStatus.AI_PARSED,
                JobPostStatus.MATCHING, JobPostStatus.CAREPARTNER_SELECTED,
                JobPostStatus.IN_PROGRESS, JobPostStatus.COMPLETED]
        for frm, to in zip(path, path[1:]):
            self.assertTrue(is_valid_transition(JOBPOST_TRANSITIONS, frm, to))

    def test_draft_to_completed_invalid(self):
        self.assertFalse(is_valid_transition(
            JOBPOST_TRANSITIONS, JobPostStatus.DRAFT, JobPostStatus.COMPLETED))

    def test_booking_window_cancel_flow(self):
        self.assertTrue(is_valid_transition(
            BOOKING_TRANSITIONS,
            BookingStatus.AWAITING_COMMITMENT, BookingStatus.DECLINED_IN_WINDOW))
        self.assertTrue(is_valid_transition(
            BOOKING_TRANSITIONS, BookingStatus.COMMITTED,
            BookingStatus.SUSPECTED_NO_SHOW))
        self.assertTrue(is_valid_transition(
            BOOKING_TRANSITIONS, BookingStatus.SUSPECTED_NO_SHOW,
            BookingStatus.NO_SHOW))

    def test_force_majeure_codes_exact(self):
        self.assertEqual(
            FORCE_MAJEURE_CODES,
            frozenset({'school_schedule', 'health', 'family_emergency',
                       'accident', 'wrong_job_info'}))


class SeedIdempotencyTest(TestCase):
    """Chạy seed 2 lần → số row không đổi (Prompt 01 AC10)."""

    def _counts(self):
        return (
            EloBand.objects.count(),
            CancelPolicy.objects.count(),
            MatchingWeight.objects.filter(is_active=True).count(),
            NotificationTemplate.objects.count(),
        )

    def test_seed_twice_same_counts(self):
        call_command('seed_matching_config', verbosity=0)
        first = self._counts()
        # QA 2026-09-10 #2: thêm 2 template commit_expired +
        # booking_committed_parent → 16 + 2 = 18
        self.assertEqual(first, (6, 7, 7, 18))
        call_command('seed_matching_config', verbosity=0)
        self.assertEqual(self._counts(), first)

    def test_seed_weight_sum_100(self):
        call_command('seed_matching_config', verbosity=0)
        total = sum(w.weight_pct for w in MatchingWeight.objects.filter(is_active=True))
        self.assertEqual(total, 100)

    def test_tier_deltas_match_spec(self):
        call_command('seed_matching_config', verbosity=0)
        expected = {'T0': -5, 'T1': -15, 'T2': -30, 'T3': -50,
                    'T4': -80, 'T5': -150, 'T6': -250}
        for tier, delta in expected.items():
            self.assertEqual(CancelPolicy.objects.get(tier=tier).elo_delta, delta)

    def test_trusted_band_multiplier(self):
        call_command('seed_matching_config', verbosity=0)
        self.assertEqual(float(EloBand.objects.get(name='trusted').rank_multiplier), 1.15)
        self.assertEqual(EloBand.objects.get(name='watch').max_proposals_per_day, 4)
        self.assertEqual(EloBand.objects.get(name='restricted').only_when_pool_below, 8)
        self.assertTrue(EloBand.objects.get(name='blocked').excluded_from_matching)
