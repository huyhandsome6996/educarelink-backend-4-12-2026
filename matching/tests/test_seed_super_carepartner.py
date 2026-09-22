"""
matching/tests/test_seed_super_carepartner.py — 2026-09-20.

Test management command seed_super_carepartner (siêu CarePartner Hồ Quang Huy):
- Tạo user đúng email/phone/tên, role worker, approved + verified.
- hidden_elo = 2000 — CAO NHẤT HỆ THỐNG (vượt mọi CarePartner khác, trần clamp
  ELO_MAX theo elo_service).
- Tier diamond (bậc phân hạng B4 cao nhất).
- skills phủ đủ mọi bộ môn hệ thống (>= 40 codes, gồm đại diện từng nhóm).
- Availability phủ 7 ngày trong tuần.
- IDEMPOTENT: chạy lại không tạo trùng, giữ nguyên mật khẩu lần đầu đặt.

Chạy: python manage.py test matching.tests.test_seed_super_carepartner
"""

from django.core.management import call_command
from django.test import TestCase

from matching.models import CarePartnerAvailability, CarePartnerProfile


class SeedSuperCarePartnerTests(TestCase):
    USERNAME = 'carepartner_huquanghuy'

    def _run_seed(self):
        call_command('seed_super_carepartner', verbosity=0)

    def test_creates_user_with_exact_contact_info(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self._run_seed()
        user = User.objects.get(username=self.USERNAME)
        self.assertEqual(user.email, 'iamdoinb6996@gmail.com')
        self.assertEqual(user.phone_number, '0862427404')
        self.assertEqual(user.get_full_name(), 'Quang Huy Hồ')
        self.assertEqual(user.role, 'worker')
        self.assertTrue(user.is_approved and user.is_active and user.is_verified)
        self.assertTrue(user.check_password('Demo@2026'))
        # Avatar static đã nạp (URL tuyệt đối prod để mobile load được)
        self.assertIn('avatars/hu_quang_huy.png', user.avatar_url)

    def test_elo_is_highest_in_system(self):
        from django.contrib.auth import get_user_model
        from matching.models import EloBand
        User = get_user_model()
        # Tạo các CarePartner "đối thủ" với elo cao gần trần
        rival = User.objects.create_user('rival_cp', password='x', role='worker')
        band = EloBand.objects.create(
            name='trusted', min_elo=1450, max_elo=2000, rank_multiplier='1.15')
        CarePartnerProfile.objects.create(user=rival, hidden_elo=1900,
                                          effective_elo=1900.0, band=band)
        self._run_seed()
        huy = CarePartnerProfile.objects.get(user__username=self.USERNAME)
        self.assertEqual(huy.hidden_elo, 2000)
        # Cao nhất toàn hệ thống
        top = CarePartnerProfile.objects.order_by('-hidden_elo').first()
        self.assertEqual(top.user.username, self.USERNAME)

    def test_tier_diamond_and_profile_metrics_maxed(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self._run_seed()
        user = User.objects.get(username=self.USERNAME)
        self.assertEqual(user.tier, 'diamond')
        prof = user.carepartner_profile
        self.assertEqual(prof.rating_avg, 5.0)
        self.assertEqual(prof.jobs_completed, 99)
        self.assertEqual(prof.jobs_cancelled, 0)
        self.assertGreaterEqual(len(prof.skills), 40)
        # Đại diện đủ nhóm bộ môn hệ thống
        for skill in ('toan', 'tieng_anh', 'dan_piano', 've', 'lap_trinh',
                      'trong_tre', 'don_tre', 'mam_non', 'luyen_chu_dep',
                      'kien_nhan'):
            self.assertIn(skill, prof.skills)

    def test_availability_full_week(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self._run_seed()
        user = User.objects.get(username=self.USERNAME)
        rows = CarePartnerAvailability.objects.filter(carepartner=user)
        self.assertEqual(rows.count(), 7)
        self.assertEqual(set(rows.values_list('weekday', flat=True)), set(range(7)))

    def test_idempotent_rerun_keeps_single_user_and_password(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self._run_seed()
        user = User.objects.get(username=self.USERNAME)
        user.set_password('NewPass@2026')  # user đổi mật khẩu sau khi tạo
        user.save()
        self._run_seed()  # chạy lại → không tạo trùng, KHÔNG reset mật khẩu
        self.assertEqual(User.objects.filter(username=self.USERNAME).count(), 1)
        user.refresh_from_db()
        self.assertTrue(user.check_password('NewPass@2026'))
        self.assertEqual(CarePartnerProfile.objects.filter(user=user).count(), 1)
