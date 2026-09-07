"""
matching/tests/base.py — Base cho mọi test của app matching.

setUpTestData chạy seed_matching_config 1 lần/class để các bảng config
(EloBand / CancelPolicy / MatchingWeight / MatchingConfig / Templates) sẵn sàng.
"""

from django.core.management import call_command
from django.test import TestCase


class MatchingTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        call_command('seed_matching_config', verbosity=0)
