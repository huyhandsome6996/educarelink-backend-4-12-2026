"""Tests B2 — Tích điểm đổi quà."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from core.models import User, ServiceCategory, Task, Review
from rewards.models import PointTransaction, Voucher, VoucherRedemption
from rewards import services


def _make_parent(username='parent1'):
    return User.objects.create_user(
        username=username, password='testpass123', role='parent',
    )


def _make_worker(username='worker1'):
    return User.objects.create_user(
        username=username, password='testpass123', role='worker',
        is_approved=True,
    )


def _make_task(parent, price=100000, status='open', title='Test task'):
    cat, _ = ServiceCategory.objects.get_or_create(name='Gia sư')
    return Task.objects.create(
        title=title,
        description='desc',
        price=Decimal(str(price)),
        status=status,
        parent=parent,
        category=cat,
        location='HCM',
        scheduled_time=timezone.now() + timedelta(days=1),
    )


class CalculatePointsTests(TestCase):
    def test_formula_floor_price_div_5000(self):
        self.assertEqual(services.calculate_task_points(100000), 20)
        self.assertEqual(services.calculate_task_points(5000), 1)
        self.assertEqual(services.calculate_task_points(4999), 0)
        self.assertEqual(services.calculate_task_points(1500000), 300)
        self.assertEqual(services.calculate_task_points(0), 0)
        self.assertEqual(services.calculate_task_points(-100), 0)


class AwardTaskPointsTests(TestCase):
    def setUp(self):
        self.parent = _make_parent()

    def test_award_on_completed(self):
        # Tạo open để signal không cộng sẵn; gán completed in-memory rồi gọi service
        task = _make_task(self.parent, price=100000, status='open')
        task.status = 'completed'
        tx = services.award_points_for_task(task)
        self.assertIsNotNone(tx)
        self.assertEqual(tx.points, 20)
        self.assertEqual(services.get_balance(self.parent), 20)

    def test_no_award_when_cancelled(self):
        task = _make_task(self.parent, price=100000, status='cancelled')
        tx = services.award_points_for_task(task)
        self.assertIsNone(tx)
        self.assertEqual(services.get_balance(self.parent), 0)

    def test_no_award_when_open(self):
        task = _make_task(self.parent, price=100000, status='open')
        self.assertIsNone(services.award_points_for_task(task))

    def test_idempotent_no_double_award(self):
        task = _make_task(self.parent, price=100000, status='open')
        task.status = 'completed'
        tx1 = services.award_points_for_task(task)
        tx2 = services.award_points_for_task(task)
        self.assertIsNotNone(tx1)
        self.assertIsNone(tx2)
        self.assertEqual(
            PointTransaction.objects.filter(
                task=task, reason=PointTransaction.REASON_TASK_COMPLETED,
            ).count(),
            1,
        )
        self.assertEqual(services.get_balance(self.parent), 20)

    def test_signal_on_status_change(self):
        task = _make_task(self.parent, price=50000, status='in_progress')
        self.assertEqual(services.get_balance(self.parent), 0)
        task.status = 'completed'
        task.save()
        self.assertEqual(services.get_balance(self.parent), 10)  # 50000/5000


class ReviewBonusTests(TestCase):
    def setUp(self):
        self.parent = _make_parent()
        self.worker = _make_worker()
        self.task = _make_task(self.parent, price=100000, status='completed')

    def test_five_star_bonus(self):
        review = Review.objects.create(
            task=self.task,
            reviewer=self.parent,
            reviewee=self.worker,
            rating=5,
            comment='Tuyệt vời',
        )
        # Signal đã chạy; gọi lại vẫn idempotent
        services.award_review_bonus(review)
        bonus_qs = PointTransaction.objects.filter(
            review=review, reason=PointTransaction.REASON_REVIEW_BONUS,
        )
        self.assertEqual(bonus_qs.count(), 1)
        self.assertEqual(bonus_qs.first().points, 20)

    def test_four_star_no_bonus(self):
        review = Review.objects.create(
            task=self.task,
            reviewer=self.parent,
            reviewee=self.worker,
            rating=4,
        )
        self.assertEqual(
            PointTransaction.objects.filter(
                reason=PointTransaction.REASON_REVIEW_BONUS,
            ).count(),
            0,
        )
        self.assertIsNone(services.award_review_bonus(review))


class TierTests(TestCase):
    def setUp(self):
        self.parent = _make_parent()

    def _add_points(self, n):
        PointTransaction.objects.create(
            user=self.parent,
            points=n,
            reason=PointTransaction.REASON_ADJUSTMENT,
            note='test',
        )

    def test_bronze_default(self):
        tier = services.get_tier(self.parent)
        self.assertEqual(tier['code'], 'bronze')
        self.assertEqual(tier['label'], 'Đồng')

    def test_silver_at_500(self):
        self._add_points(500)
        self.assertEqual(services.get_tier(self.parent)['code'], 'silver')

    def test_gold_at_1500(self):
        self._add_points(1500)
        self.assertEqual(services.get_tier(self.parent)['code'], 'gold')

    def test_platinum_at_3000(self):
        self._add_points(3000)
        tier = services.get_tier(self.parent)
        self.assertEqual(tier['code'], 'platinum')
        self.assertIsNone(tier['points_to_next'])

    def test_tier_not_drop_after_redeem(self):
        self._add_points(1600)  # Vàng
        self.assertEqual(services.get_tier(self.parent)['code'], 'gold')
        # Trừ điểm (mô phỏng đổi voucher)
        PointTransaction.objects.create(
            user=self.parent,
            points=-200,
            reason=PointTransaction.REASON_VOUCHER_REDEEM,
        )
        # Lifetime vẫn 1600 → vẫn Vàng
        self.assertEqual(services.get_lifetime_points(self.parent), 1600)
        self.assertEqual(services.get_tier(self.parent)['code'], 'gold')
        self.assertEqual(services.get_balance(self.parent), 1400)


class RedeemVoucherTests(TestCase):
    def setUp(self):
        self.parent = _make_parent()
        PointTransaction.objects.create(
            user=self.parent,
            points=100,
            reason=PointTransaction.REASON_ADJUSTMENT,
        )
        self.voucher = Voucher.objects.create(
            title='GoFood 30K',
            points_required=50,
            discount_value=30000,
            is_active=True,
        )

    def test_redeem_success(self):
        red = services.redeem_voucher(self.parent, self.voucher)
        self.assertEqual(red.status, VoucherRedemption.STATUS_ACTIVE)
        self.assertTrue(len(red.code) >= 8)
        self.assertEqual(services.get_balance(self.parent), 50)
        self.assertEqual(red.points_spent, 50)

    def test_insufficient_points(self):
        expensive = Voucher.objects.create(
            title='Big', points_required=9999, discount_value=100000, is_active=True,
        )
        with self.assertRaises(services.InsufficientPointsError):
            services.redeem_voucher(self.parent, expensive)

    def test_inactive_voucher(self):
        self.voucher.is_active = False
        self.voucher.save()
        with self.assertRaises(services.VoucherNotAvailableError):
            services.redeem_voucher(self.parent, self.voucher)


class RedeemRaceConditionTests(TransactionTestCase):
    """2 request đổi cùng lúc — chỉ 1 thành công nếu vừa đủ điểm."""

    def setUp(self):
        self.parent = _make_parent('race_parent')
        PointTransaction.objects.create(
            user=self.parent,
            points=50,
            reason=PointTransaction.REASON_ADJUSTMENT,
        )
        self.voucher = Voucher.objects.create(
            title='Race', points_required=50, discount_value=10000, is_active=True,
        )

    def test_concurrent_redeem(self):
        results = {'ok': 0, 'fail': 0}

        def attempt():
            try:
                services.redeem_voucher(self.parent, self.voucher)
                return 'ok'
            except services.InsufficientPointsError:
                return 'fail'
            except Exception:
                return 'fail'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(attempt) for _ in range(2)]
            for f in as_completed(futures):
                results[f.result()] = results.get(f.result(), 0) + 1

        self.assertEqual(results['ok'], 1)
        self.assertEqual(results['fail'], 1)
        self.assertEqual(services.get_balance(self.parent), 0)
        self.assertEqual(
            VoucherRedemption.objects.filter(user=self.parent).count(), 1,
        )


class RewardsAPITests(TestCase):
    def setUp(self):
        self.parent = _make_parent('api_parent')
        self.worker = _make_worker('api_worker')
        self.client = APIClient()
        token = RefreshToken.for_user(self.parent)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        PointTransaction.objects.create(
            user=self.parent, points=80,
            reason=PointTransaction.REASON_ADJUSTMENT,
        )
        self.voucher = Voucher.objects.create(
            title='API Voucher', points_required=30,
            discount_value=15000, is_active=True,
        )

    def test_summary(self):
        resp = self.client.get('/api/rewards/summary/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['balance'], 80)
        self.assertIn('tier', resp.data)

    def test_list_vouchers(self):
        resp = self.client.get('/api/rewards/vouchers/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['vouchers']), 1)
        self.assertTrue(resp.data['vouchers'][0]['can_redeem'])

    def test_redeem_api(self):
        resp = self.client.post(f'/api/rewards/vouchers/{self.voucher.id}/redeem/')
        self.assertEqual(resp.status_code, 201)
        self.assertIn('code', resp.data['redemption'])
        self.assertEqual(resp.data['balance'], 50)

    def test_worker_forbidden(self):
        client = APIClient()
        token = RefreshToken.for_user(self.worker)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        resp = client.get('/api/rewards/summary/')
        self.assertEqual(resp.status_code, 403)
