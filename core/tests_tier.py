r"""
B4 — Phân hạng CarePartner (Đồng / Bạc / Vàng / Kim cương). Test suite hoàn chỉnh.

Chạy riêng:
  DEBUG=True python manage.py test core.tests_tier --verbosity=2

Phạm vi (theo yêu cầu QA):
  1. Tính hạng đúng cho từng mức (bronze / silver / gold / diamond)
  2. Boundary case:
     - Đủ jobs nhưng thiếu rating (avg < 4.0)
     - Đủ jobs + rating nhưng thiếu số review (< 3)
     - Có chứng chỉ nhưng chưa approved (pending / rejected) → không lên gold
     - Chứng chỉ bị revoked (approved → rejected) → rời gold
     - Chứng chỉ chuyên ngành nhưng chưa đủ jobs / rating cho diamond
  3. Hạ hạng khi mất điều kiện (credential revoke, rating tụt)
  4. tier_override chặn tự tính lại (force=False giữ hạng; force=True tính lại)
  5. Quyền hạn:
     - Worker KHÔNG tự set hạng của mình qua API (403)
     - Parent / anonymous không set hạng (403)
     - Chỉ admin được set-tier / recompute-tier
     - Worker không sửa tier qua PATCH /api/profile/ (read-only)
  6. Signal: task completed → refresh tier; review tạo mới → refresh tier
  7. Response contract: profile / worker profile / candidates / all-workers
     đều trả tier + tier_label (badge web + mobile đọc các field này).
  8. Validate upload ảnh minh chứng: MIME (JPEG/PNG/WebP) + giới hạn 5MB,
     boundary đúng 5MB vẫn chấp nhận, chỉ mô tả (không ảnh) không bị chặn.
"""

from django.test import TestCase, override_settings
from django.utils import timezone as django_tz
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from core.models import User, Task, ServiceCategory, TaskApplication, Review, CredentialSubmission
from core.services.tier_service import (
    compute_tier,
    refresh_tier,
    set_tier_manual,
    tier_label,
    _gather_stats,
)


# === HELPERS ===

def _make_admin(username='admin_tier'):
    return User.objects.create_user(
        username=username, password='p', role='parent',
        is_staff=True, is_superuser=True,
    )


def _make_parent(username='parent_tier'):
    return User.objects.create_user(username=username, password='p', role='parent')


def _make_worker(username='worker_tier', is_approved=True):
    return User.objects.create_user(
        username=username, password='p', role='worker',
        is_approved=is_approved,
    )


def _make_category(name='Gia sư'):
    return ServiceCategory.objects.create(name=name, icon_name='BookOpen')


def _make_task(parent, category, status='completed', title='Việc test tier'):
    """Task hoàn thành — để tính completed_jobs cho worker."""
    return Task.objects.create(
        title=title, description='d', price=100000,
        parent=parent, category=category,
        location='Q1', latitude=10.7626, longitude=106.6600,
        scheduled_time=django_tz.now(),
        status=status,
    )


def _completed_job(parent, category, worker, title='Việc hoàn thành'):
    """Tạo 1 task completed + application accepted (tính 1 completed_job)."""
    task = _make_task(parent, category, status='completed', title=title)
    return TaskApplication.objects.create(task=task, worker=worker, status='accepted')


def _review(parent, category, worker, rating, title='Việc có review'):
    """Tạo 1 review (reviewee=worker). Review OneToOne Task → mỗi review 1 task riêng."""
    task = _make_task(parent, category, status='completed', title=title)
    return Review.objects.create(
        task=task, reviewer=parent, reviewee=worker, rating=rating,
    )


def _credential(worker, status='approved', is_specialized=False):
    return CredentialSubmission.objects.create(
        worker=worker, description='Chứng chỉ test', status=status,
        is_specialized=is_specialized,
    )


# ─────────────────────────────────────────────────────────────────────
# 1. SERVICE — TÍNH HẠNG ĐÚNG CHO TỪNG MỨC
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class ComputeTierLevelTests(TestCase):
    """compute_tier trả đúng hạng bronze/silver/gold/diamond theo rule."""

    def setUp(self):
        self.parent = _make_parent()
        self.category = _make_category()
        self.worker = _make_worker()

    def test_fresh_approved_worker_is_bronze(self):
        """Worker mới được duyệt, chưa có gì → bronze."""
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_silver_full_conditions(self):
        """5 completed jobs + avg ≥ 4.0 + ≥ 3 reviews → silver."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 4, 5):
            _review(self.parent, self.category, self.worker, r)
        self.assertEqual(compute_tier(self.worker), 'silver')

    def test_gold_with_approved_credential(self):
        """Có 1 CredentialSubmission approved (không cần jobs) → gold."""
        _credential(self.worker, status='approved')
        self.assertEqual(compute_tier(self.worker), 'gold')

    def test_diamond_full_conditions(self):
        """Credential chuyên ngành approved + 10 completed jobs + avg ≥ 4.5 → diamond."""
        for i in range(10):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        _credential(self.worker, status='approved', is_specialized=True)
        self.assertEqual(compute_tier(self.worker), 'diamond')

    def test_diamond_precedence_over_gold(self):
        """Đủ điều kiện diamond → trả diamond (không dừng ở gold)."""
        for i in range(10):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5, 4):
            _review(self.parent, self.category, self.worker, r)
        _credential(self.worker, status='approved', is_specialized=True)
        # avg = (5+5+5+4)/4 = 4.75 ≥ 4.5, đủ 10 jobs → diamond
        self.assertEqual(compute_tier(self.worker), 'diamond')

    def test_unapproved_worker_always_bronze(self):
        """Worker chưa is_approved → luôn bronze dù đủ mọi điều kiện."""
        unapproved = _make_worker('worker_unapproved', is_approved=False)
        for i in range(10):
            _completed_job(self.parent, self.category, unapproved, f'Việc {i}')
        for r in (5, 5, 5):
            _review(self.parent, self.category, unapproved, r)
        _credential(unapproved, status='approved', is_specialized=True)
        self.assertEqual(compute_tier(unapproved), 'bronze')

    def test_parent_role_not_ranked(self):
        """User role=parent (dù is_approved=True) → bronze, không tính hạng."""
        self.parent.is_approved = True
        self.parent.save()
        self.assertEqual(compute_tier(self.parent), 'bronze')


# ─────────────────────────────────────────────────────────────────────
# 2. SERVICE — BOUNDARY CASES
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class ComputeTierBoundaryTests(TestCase):
    """Các case biên: thiếu đúng 1 điều kiện → không lên hạng."""

    def setUp(self):
        self.parent = _make_parent()
        self.category = _make_category()
        self.worker = _make_worker()

    def test_enough_jobs_but_low_rating_stays_bronze(self):
        """Đủ 5 jobs + 3 reviews nhưng avg rating 3.0 < 4.0 → bronze."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (3, 3, 3):
            _review(self.parent, self.category, self.worker, r)
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_enough_jobs_but_few_reviews_stays_bronze(self):
        """Đủ 5 jobs + avg 5.0 nhưng chỉ 2 reviews (< 3) → bronze."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5):
            _review(self.parent, self.category, self.worker, r)
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_4_jobs_only_stays_bronze(self):
        """4 completed jobs (thiếu 1 so với silver) → bronze."""
        for i in range(4):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_rating_exactly_4_0_reaches_silver(self):
        """avg rating đúng 4.0 (boundary inclusive) → silver."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 4, 3):
            _review(self.parent, self.category, self.worker, r)  # avg = 4.0
        self.assertEqual(compute_tier(self.worker), 'silver')

    def test_pending_credential_not_gold(self):
        """Có chứng chỉ nhưng status=pending (chưa approved) → bronze."""
        _credential(self.worker, status='pending')
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_rejected_credential_not_gold(self):
        """Có chứng chỉ nhưng status=rejected → bronze."""
        _credential(self.worker, status='rejected')
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_specialized_credential_missing_jobs_not_diamond(self):
        """Chứng chỉ chuyên ngành approved nhưng chỉ 9 jobs (< 10) → gold, không diamond."""
        for i in range(9):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        _credential(self.worker, status='approved', is_specialized=True)
        self.assertEqual(compute_tier(self.worker), 'gold')

    def test_specialized_credential_low_rating_not_diamond(self):
        """Chứng chỉ chuyên ngành + đủ 10 jobs nhưng avg 4.0 < 4.5 → gold, không diamond."""
        for i in range(10):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (4, 4, 5):
            _review(self.parent, self.category, self.worker, r)  # avg = 4.33
        _credential(self.worker, status='approved', is_specialized=True)
        self.assertEqual(compute_tier(self.worker), 'gold')

    def test_non_specialized_credential_never_diamond(self):
        """Credential approved thường (is_specialized=False) + đủ jobs/rating → tối đa gold."""
        for i in range(10):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        _credential(self.worker, status='approved', is_specialized=False)
        self.assertEqual(compute_tier(self.worker), 'gold')

    def test_completed_jobs_only_count_accepted_applications(self):
        """Application pending/ rejected trên task completed → không tính completed_job."""
        for i in range(3):
            _completed_job(self.parent, self.category, self.worker, f'Việc accepted {i}')
        # 2 ứng tuyển pending trên task completed — KHÔNG tính
        for i in range(2):
            task = _make_task(self.parent, self.category, status='completed', title=f'Việc pending {i}')
            TaskApplication.objects.create(task=task, worker=self.worker, status='pending')
        for r in (5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        stats = _gather_stats(self.worker)
        self.assertEqual(stats['completed_jobs'], 3)
        self.assertEqual(compute_tier(self.worker), 'bronze')

    def test_cancelled_task_not_counted(self):
        """Task cancelled (kể cả application accepted) → không tính completed_job."""
        task = _make_task(self.parent, self.category, status='cancelled')
        TaskApplication.objects.create(task=task, worker=self.worker, status='accepted')
        stats = _gather_stats(self.worker)
        self.assertEqual(stats['completed_jobs'], 0)


# ─────────────────────────────────────────────────────────────────────
# 3. SERVICE — HẠ HẠNG KHI MẤT ĐIỀU KIỆN
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class DowngradeTests(TestCase):
    """refresh_tier cho phép hạ hạng khi worker không còn đủ điều kiện."""

    def setUp(self):
        self.parent = _make_parent()
        self.category = _make_category()
        self.worker = _make_worker()

    def test_downgrade_gold_to_bronze_when_credential_revoked(self):
        """Credential bị thu hồi (approved → rejected) → hạ từ gold về bronze."""
        cred = _credential(self.worker, status='approved')
        refresh_tier(self.worker)
        self.assertEqual(self.worker.tier, 'gold')

        cred.status = 'rejected'  # revoked
        cred.save()
        new_tier = refresh_tier(self.worker)
        self.assertEqual(new_tier, 'bronze')
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')

    def test_downgrade_gold_to_silver_when_credential_revoked(self):
        """Gold + đủ điều kiện silver → thu hồi credential về silver (không về bronze)."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 4, 5):
            _review(self.parent, self.category, self.worker, r)
        cred = _credential(self.worker, status='approved')
        refresh_tier(self.worker)
        self.assertEqual(self.worker.tier, 'gold')

        cred.status = 'rejected'
        cred.save()
        new_tier = refresh_tier(self.worker)
        self.assertEqual(new_tier, 'silver')

    def test_downgrade_silver_when_rating_drops(self):
        """Silver → bronze khi review xấu kéo avg xuống dưới 4.0."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        refresh_tier(self.worker)
        self.assertEqual(self.worker.tier, 'silver')

        # 2 review 1 sao → avg (5*3 + 1*2)/5 = 3.4 < 4.0
        for _ in range(2):
            _review(self.parent, self.category, self.worker, 1)
        new_tier = refresh_tier(self.worker)
        self.assertEqual(new_tier, 'bronze')

    def test_refresh_updates_tier_meta_snapshot(self):
        """refresh_tier lưu snapshot stats vào tier_meta."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 4, 5):
            _review(self.parent, self.category, self.worker, r)
        refresh_tier(self.worker)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier_meta['completed_jobs'], 5)
        self.assertEqual(self.worker.tier_meta['review_count'], 3)
        self.assertAlmostEqual(self.worker.tier_meta['avg_rating'], 4.67, places=1)
        self.assertFalse(self.worker.tier_meta['has_cert'])
        self.assertIsNotNone(self.worker.tier_updated_at)


# ─────────────────────────────────────────────────────────────────────
# 4. SERVICE — TIER_OVERRIDE CHẶN TỰ TÍNH LẠI
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class TierOverrideTests(TestCase):
    """tier_override=True → refresh_tier thường KHÔNG đổi hạng; force=True bỏ override."""

    def setUp(self):
        self.parent = _make_parent()
        self.category = _make_category()
        self.worker = _make_worker()

    def test_manual_set_blocks_auto_recompute(self):
        """Admin set hạng thủ công → đủ điều kiện cao hơn cũng không tự leo hạng."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5):
            _review(self.parent, self.category, self.worker, r)

        set_tier_manual(self.worker, 'bronze', actor=None)
        self.assertEqual(self.worker.tier, 'bronze')
        self.assertTrue(self.worker.tier_override)

        # refresh_tier thường (force=False) → giữ bronze dù đủ điều kiện silver
        new_tier = refresh_tier(self.worker, force=False)
        self.assertEqual(new_tier, 'bronze')
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')
        self.assertTrue(self.worker.tier_override)

    def test_force_recompute_removes_override(self):
        """refresh_tier(force=True) bỏ override và tính lại đúng theo rule."""
        set_tier_manual(self.worker, 'diamond', actor=None)
        self.assertEqual(self.worker.tier, 'diamond')
        self.assertTrue(self.worker.tier_override)

        # Worker thực tế chưa có gì → force recompute về bronze
        new_tier = refresh_tier(self.worker, force=True)
        self.assertEqual(new_tier, 'bronze')
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')
        self.assertFalse(self.worker.tier_override)

    def test_manual_set_records_actor_in_meta(self):
        """set_tier_manual ghi manual_set_by / manual_set_at vào tier_meta."""
        admin = _make_admin()
        set_tier_manual(self.worker, 'silver', actor=admin)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier_meta['manual_set_by'], admin.id)
        self.assertIn('manual_set_at', self.worker.tier_meta)

    def test_manual_set_invalid_tier_raises(self):
        """set_tier_manual với hạng không hợp lệ → ValueError."""
        with self.assertRaises(ValueError):
            set_tier_manual(self.worker, 'platinum')

    def test_refresh_non_worker_returns_current(self):
        """refresh_tier trên user không phải worker → trả tier hiện tại, không đổi."""
        self.parent.tier = 'gold'  # gán tay để kiểm tra không bị ghi đè
        self.parent.save()
        result = refresh_tier(self.parent, force=True)
        self.assertEqual(result, 'gold')

    def test_tier_label_helper(self):
        """tier_label trả nhãn tiếng Việt đúng cho từng mã hạng."""
        self.assertEqual(tier_label('bronze'), 'Hạng Đồng')
        self.assertEqual(tier_label('silver'), 'Hạng Bạc')
        self.assertEqual(tier_label('gold'), 'Hạng Vàng')
        self.assertEqual(tier_label('diamond'), 'Hạng Kim cương')
        self.assertEqual(tier_label(''), 'Hạng Đồng')
        self.assertEqual(tier_label('invalid_code'), 'invalid_code')


# ─────────────────────────────────────────────────────────────────────
# 5. API — QUYỀN HẠN SET-TIER / RECOMPUTE-TIER
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class TierAPIPermissionTests(TestCase):
    """Chỉ admin được set/recompute hạng. Worker/parent/anonymous bị chặn."""

    def setUp(self):
        self.admin = _make_admin()
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.client = APIClient()
        self.set_url = f'/api/admin/workers/{self.worker.id}/set-tier/'
        self.recompute_url = f'/api/admin/workers/{self.worker.id}/recompute-tier/'

    def test_worker_cannot_set_own_tier(self):
        """Worker tự set hạng mình qua API → 403 (KHÔNG được phép)."""
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(self.set_url, {'tier': 'diamond'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')
        self.assertFalse(self.worker.tier_override)

    def test_worker_cannot_set_other_tier(self):
        """Worker set hạng worker khác → 403."""
        other = _make_worker('worker_other')
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(
            f'/api/admin/workers/{other.id}/set-tier/', {'tier': 'gold'}, format='json'
        )
        self.assertEqual(resp.status_code, 403)

    def test_parent_cannot_set_tier(self):
        """Parent set hạng worker → 403."""
        self.client.force_authenticate(user=self.parent)
        resp = self.client.post(self.set_url, {'tier': 'gold'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_anonymous_cannot_set_tier(self):
        """Anonymous set hạng → 401 Unauthorized (không 500)."""
        self.client.force_authenticate(user=None)
        resp = self.client.post(self.set_url, {'tier': 'gold'}, format='json')
        self.assertEqual(resp.status_code, 401)

    def test_worker_cannot_recompute_tier(self):
        """Worker gọi recompute-tier → 403."""
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(self.recompute_url, {}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_admin_set_tier_success(self):
        """Admin set hạng hợp lệ → 200, tier đổi, tier_override=True."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.set_url, {'tier': 'silver'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tier'], 'silver')
        self.assertEqual(resp.data['tier_label'], 'Hạng Bạc')
        self.assertTrue(resp.data['tier_override'])
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'silver')
        self.assertTrue(self.worker.tier_override)

    def test_admin_set_tier_invalid_value(self):
        """Admin set hạng không hợp lệ → 400 với message tiếng Việt."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.set_url, {'tier': 'platinum'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Hạng không hợp lệ', resp.data['error'])
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')

    def test_admin_set_tier_missing_tier(self):
        """Admin set hạng nhưng thiếu trường tier → 400."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.set_url, {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_admin_set_tier_non_worker_404(self):
        """Admin set hạng cho user không phải worker → 404."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/admin/workers/{self.parent.id}/set-tier/', {'tier': 'gold'}, format='json'
        )
        self.assertEqual(resp.status_code, 404)

    def test_admin_set_tier_unknown_user_404(self):
        """Admin set hạng cho user_id không tồn tại → 404 (không 500)."""
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post('/api/admin/workers/999999/set-tier/', {'tier': 'gold'}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_admin_recompute_tier_success(self):
        """Admin recompute → bỏ override, tính lại theo rule (về bronze khi chưa đủ)."""
        set_tier_manual(self.worker, 'diamond', actor=self.admin)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.recompute_url, {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tier'], 'bronze')
        self.assertFalse(resp.data['tier_override'])
        self.assertIn('tier_meta', resp.data)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')
        self.assertFalse(self.worker.tier_override)

    def test_admin_recompute_after_stats_improve(self):
        """Worker đủ điều kiện silver + override đang chặn → recompute lên silver."""
        for i in range(5):
            _completed_job(self.parent, _make_category(), self.worker, f'Việc {i}')
        for r in (5, 4, 5):
            _review(self.parent, _make_category(), self.worker, r)
        set_tier_manual(self.worker, 'bronze', actor=self.admin)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(self.recompute_url, {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tier'], 'silver')


# ─────────────────────────────────────────────────────────────────────
# 6. API — WORKER KHÔNG TỰ SỬA HẠNG QUA PROFILE
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class ProfileTierReadOnlyTests(TestCase):
    """tier là read-only trong UserSerializer — worker không tự nâng hạng qua PATCH."""

    def setUp(self):
        self.worker = _make_worker()
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    def test_profile_returns_tier_fields(self):
        """GET /api/profile/ trả tier + tier_label cho mobile render badge."""
        resp = self.client.get('/api/profile/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('tier', resp.data)
        self.assertIn('tier_label', resp.data)
        self.assertIn('tier_updated_at', resp.data)
        self.assertEqual(resp.data['tier'], 'bronze')
        self.assertEqual(resp.data['tier_label'], 'Hạng Đồng')

    def test_worker_cannot_patch_own_tier(self):
        """Worker PATCH /api/profile/ gửi tier='diamond' → bị bỏ qua (read-only)."""
        resp = self.client.patch('/api/profile/', {'tier': 'diamond'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')

    def test_worker_cannot_patch_tier_updated_at(self):
        """Worker PATCH tier_updated_at → bị bỏ qua."""
        resp = self.client.patch(
            '/api/profile/', {'tier_updated_at': '2020-01-01T00:00:00Z'}, format='json'
        )
        self.assertEqual(resp.status_code, 200)
        self.worker.refresh_from_db()
        self.assertIsNone(self.worker.tier_updated_at)


# ─────────────────────────────────────────────────────────────────────
# 7. SIGNAL — TỰ ĐỘNG REFRESH KHI TASK COMPLETED / REVIEW MỚI
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class TierSignalTests(TestCase):
    """Signal B4: task completed → refresh tier; review created → refresh tier."""

    def setUp(self):
        self.parent = _make_parent()
        self.category = _make_category()
        self.worker = _make_worker()

    def test_signal_on_task_completed_upgrades_to_silver(self):
        """Hoàn thành task thứ 5 (đủ jobs) + đủ reviews → tier tự lên silver."""
        # 3 reviews trước (avg 4.67)
        for r in (5, 4, 5):
            _review(self.parent, self.category, self.worker, r)
        # 4 completed jobs
        for i in range(4):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')  # mới 4 jobs

        # Task thứ 5 chuyển sang completed → signal refresh → silver
        task = _make_task(self.parent, self.category, status='open', title='Việc thứ 5')
        TaskApplication.objects.create(task=task, worker=self.worker, status='accepted')
        task.status = 'completed'
        task.save()  # post_save signal → refresh_tier

        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'silver')

    def test_signal_on_review_created_upgrades_to_silver(self):
        """Review thứ 3 xuất hiện (đủ reviews) → tier tự lên silver."""
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5):
            _review(self.parent, self.category, self.worker, r)
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'bronze')  # mới 2 reviews

        _review(self.parent, self.category, self.worker, 5)  # review thứ 3
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'silver')

    def test_signal_respects_tier_override(self):
        """Có tier_override → task completed / review mới KHÔNG tự đổi hạng."""
        set_tier_manual(self.worker, 'bronze', actor=None)
        for i in range(5):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        self.worker.refresh_from_db()
        # Signal đã chạy refresh_tier (force=False) nhưng override chặn
        self.assertEqual(self.worker.tier, 'bronze')
        self.assertTrue(self.worker.tier_override)

    def test_signal_task_open_does_not_refresh(self):
        """Task open/in_progress save → không tính (signal chỉ chạy khi completed)."""
        task = _make_task(self.parent, self.category, status='in_progress')
        TaskApplication.objects.create(task=task, worker=self.worker, status='accepted')
        task.status = 'in_progress'
        task.save()
        self.worker.refresh_from_db()
        self.assertIsNone(self.worker.tier_updated_at)


# ─────────────────────────────────────────────────────────────────────
# 8. API — RESPONSE CONTRACT (BADGE WEB + MOBILE ĐỌC CÁC FIELD NÀY)
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class TierResponseContractTests(TestCase):
    """Các endpoint trả tier/tier_label đúng contract cho frontend B4."""

    def setUp(self):
        self.admin = _make_admin()
        self.parent = _make_parent()
        self.category = _make_category()
        self.worker = _make_worker()
        self.client = APIClient()

    def test_worker_profile_detail_returns_tier(self):
        """GET /api/worker/<id>/profile/ (tier_views override) trả tier + tier_label + tier_meta."""
        set_tier_manual(self.worker, 'gold', actor=self.admin)
        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/worker/{self.worker.id}/profile/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tier'], 'gold')
        self.assertEqual(resp.data['tier_label'], 'Hạng Vàng')
        self.assertIn('tier_meta', resp.data)

    def test_candidates_list_returns_worker_tier(self):
        """GET /api/parent/tasks/<id>/candidates/ trả worker_tier + worker_tier_label
        (browse_candidates.html + CandidatesScreen.js đọc 2 field này để vẽ badge)."""
        task = _make_task(self.parent, self.category, status='open', title='Việc cần người')
        TaskApplication.objects.create(task=task, worker=self.worker, status='pending')
        _credential(self.worker, status='approved')
        refresh_tier(self.worker)  # → gold

        self.client.force_authenticate(user=self.parent)
        resp = self.client.get(f'/api/parent/tasks/{task.id}/candidates/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['worker_tier'], 'gold')
        self.assertEqual(resp.data[0]['worker_tier_label'], 'Hạng Vàng')

    def test_admin_all_workers_returns_tier(self):
        """GET /api/admin/all-workers/ trả tier + tier_label + tier_override cho từng worker."""
        set_tier_manual(self.worker, 'silver', actor=self.admin)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get('/api/admin/all-workers/')
        self.assertEqual(resp.status_code, 200)
        entry = next(w for w in resp.data if w['id'] == self.worker.id)
        self.assertEqual(entry['tier'], 'silver')
        self.assertEqual(entry['tier_label'], 'Hạng Bạc')
        self.assertTrue(entry['tier_override'])

    def test_admin_approve_worker_sets_bronze(self):
        """Admin duyệt worker mới → tier=bronze, response chứa tier + tier_label."""
        pending = _make_worker('worker_pending', is_approved=False)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/admin/workers/{pending.id}/action/',
            {'action': 'approve'}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn('tier', resp.data)
        self.assertEqual(resp.data['tier'], 'bronze')
        pending.refresh_from_db()
        self.assertEqual(pending.tier, 'bronze')
        self.assertFalse(pending.tier_override)

    def test_admin_review_credential_updates_tier(self):
        """Admin duyệt credential (approve) → tier tự lên gold qua refresh_tier."""
        cred = _credential(self.worker, status='pending')
        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/admin/credential-submissions/{cred.id}/review/',
            {'action': 'approve'}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['tier'], 'gold')
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'gold')

    def test_admin_review_credential_is_specialized_diamond_path(self):
        """Admin duyệt credential chuyên ngành + worker đủ jobs/rating → diamond."""
        for i in range(10):
            _completed_job(self.parent, self.category, self.worker, f'Việc {i}')
        for r in (5, 5, 5, 5):
            _review(self.parent, self.category, self.worker, r)
        cred = _credential(self.worker, status='pending', is_specialized=False)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.post(
            f'/api/admin/credential-submissions/{cred.id}/review/',
            {'action': 'approve', 'is_specialized': True}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['is_specialized'])
        self.assertEqual(resp.data['tier'], 'diamond')
        self.worker.refresh_from_db()
        self.assertEqual(self.worker.tier, 'diamond')

    def test_worker_submit_credential_accepts_b4_fields(self):
        """Worker submit credential kèm credential_type/title/field (field mới B4)."""
        self.client.force_authenticate(user=self.worker)
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {
                'description': 'Chứng chỉ sư phạm mầm non',
                'credential_type': 'certificate',
                'title': 'Chứng chỉ Sư phạm Mầm non',
                'field': 'Mầm non',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201)
        cred = CredentialSubmission.objects.get(worker=self.worker)
        self.assertEqual(cred.credential_type, 'certificate')
        self.assertEqual(cred.title, 'Chứng chỉ Sư phạm Mầm non')
        self.assertEqual(cred.field, 'Mầm non')
        self.assertFalse(cred.is_specialized)

    def test_migration_seed_approved_workers_bronze(self):
        """Worker đã is_approved (tạo qua ORM, không qua admin API) → tier mặc định bronze."""
        # User tạo bằng create_user với is_approved=True → tier default = bronze
        w = _make_worker('worker_seed_check')
        self.assertEqual(w.tier, 'bronze')
        self.assertFalse(w.tier_override)
        self.assertEqual(w.tier_meta, {})


# ─────────────────────────────────────────────────────────────────────
# 9. VALIDATE UPLOAD ẢNH MINH CHỨNG BẰNG CẤP (B4 hardening)
# ─────────────────────────────────────────────────────────────────────
@override_settings(DEBUG=True)
class CredentialUploadValidationTests(TestCase):
    """WorkerSubmitCredentialAPIView validate MIME type + dung lượng ảnh."""

    def setUp(self):
        self.worker = _make_worker()
        self.client = APIClient()
        self.client.force_authenticate(user=self.worker)

    def _jpeg(self, size_kb=1):
        """Ảnh JPEG giả (content đúng MIME, dung lượng nhỏ)."""
        return SimpleUploadedFile(
            'cert.jpg', b'\xff\xd8\xff' + b'x' * (size_kb * 1024),
            content_type='image/jpeg',
        )

    def test_upload_jpeg_success(self):
        """Ảnh JPEG hợp lệ → 201, submission được tạo kèm ảnh."""
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'certificate_photo': self._jpeg(), 'description': 'Chứng chỉ test'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        cred = CredentialSubmission.objects.get(worker=self.worker)
        self.assertTrue(cred.certificate_photo)

    def test_upload_png_success(self):
        """Ảnh PNG hợp lệ → 201."""
        png = SimpleUploadedFile('cert.png', b'\x89PNG' + b'x' * 100, content_type='image/png')
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'certificate_photo': png, 'description': 'Chứng chỉ PNG'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)

    def test_upload_webp_success(self):
        """Ảnh WebP hợp lệ → 201."""
        webp = SimpleUploadedFile('cert.webp', b'RIFF' + b'x' * 100, content_type='image/webp')
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'certificate_photo': webp, 'description': 'Chứng chỉ WebP'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)

    def test_upload_pdf_rejected(self):
        """File PDF (không phải ảnh) → 400 với message tiếng Việt, không tạo submission."""
        pdf = SimpleUploadedFile('cert.pdf', b'%PDF-1.4' + b'x' * 100, content_type='application/pdf')
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'certificate_photo': pdf, 'description': 'File PDF'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('JPEG, PNG hoặc WebP', resp.data['error'])
        self.assertEqual(CredentialSubmission.objects.filter(worker=self.worker).count(), 0)

    def test_upload_oversize_rejected(self):
        """Ảnh JPEG > 5MB → 400 với message giới hạn dung lượng."""
        # 6MB — vượt MAX_CREDENTIAL_IMAGE_SIZE (5MB)
        big = SimpleUploadedFile(
            'big.jpg', b'\xff\xd8\xff' + b'x' * (6 * 1024 * 1024),
            content_type='image/jpeg',
        )
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'certificate_photo': big, 'description': 'Ảnh quá lớn'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('5MB', resp.data['error'])
        self.assertEqual(CredentialSubmission.objects.filter(worker=self.worker).count(), 0)

    def test_description_only_skips_image_validation(self):
        """Chỉ mô tả (không ảnh) → 201 — validate ảnh không can thiệp."""
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'description': 'Mô tả kinh nghiệm không kèm ảnh'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
        cred = CredentialSubmission.objects.get(worker=self.worker)
        self.assertFalse(cred.certificate_photo)

    def test_boundary_exactly_5mb_accepted(self):
        """Ảnh đúng 5MB (boundary) → 201 — 5MB vẫn được chấp nhận."""
        from core.tier_views import MAX_CREDENTIAL_IMAGE_SIZE
        payload = b'\xff\xd8\xff' + b'x' * (MAX_CREDENTIAL_IMAGE_SIZE - 3)
        self.assertEqual(len(payload), MAX_CREDENTIAL_IMAGE_SIZE)  # đúng 5MB
        ok = SimpleUploadedFile('edge.jpg', payload, content_type='image/jpeg')
        resp = self.client.post(
            '/api/worker/submit-credential/',
            {'certificate_photo': ok, 'description': 'Ảnh 5MB boundary'},
            format='multipart',
        )
        self.assertEqual(resp.status_code, 201)
