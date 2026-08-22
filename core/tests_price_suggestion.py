"""
A1 — Gợi ý giá tự động. Test suite cho PriceSuggestionAPIView.

Chạy: python manage.py test core.tests_price_suggestion --verbosity=2

Test cases:
  - Tính đúng giá theo distance với toạ độ mẫu (so khớp haversine_distance_optimized)
  - Tính đúng giá theo hourly
  - Category không có PricingRule → trả response hợp lệ không lỗi
  - Permission: user chưa đăng nhập bị 401
  - Input toạ độ không hợp lệ → 400 rõ ràng, không 500
  - Category_id không tồn tại → 400
  - Clamped giá vào [min_price, max_price]
  - Fixed type → chỉ trả price_range, không có suggested_price
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.models import User, ServiceCategory, PricingRule


@override_settings(DEBUG=True)
class PriceSuggestionA1TestCase(TestCase):
    """Test endpoint POST /api/tasks/price-suggestion/"""

    def setUp(self):
        self.client = APIClient()
        self.parent = User.objects.create_user(
            username='parent_a1', password='pass', role='parent'
        )
        self.client.force_authenticate(user=self.parent)

        # Category + PricingRule cho distance
        self.cat_distance = ServiceCategory.objects.create(
            name='Đón trẻ test', icon_name='Baby'
        )
        PricingRule.objects.create(
            category=self.cat_distance,
            pricing_type='distance',
            base_fee=20000, unit_price=15000,
            min_price=80000, max_price=150000,
        )

        # Category + PricingRule cho hourly
        self.cat_hourly = ServiceCategory.objects.create(
            name='Gia sư test', icon_name='BookOpen'
        )
        PricingRule.objects.create(
            category=self.cat_hourly,
            pricing_type='hourly',
            base_fee=0, unit_price=80000,
            min_price=150000, max_price=300000,
        )

        # Category KHÔNG có PricingRule
        self.cat_no_rule = ServiceCategory.objects.create(
            name='Khác test', icon_name='MoreHoriz'
        )

        # Category fixed
        self.cat_fixed = ServiceCategory.objects.create(
            name='Mua sắm test', icon_name='ShoppingCart'
        )
        PricingRule.objects.create(
            category=self.cat_fixed,
            pricing_type='fixed',
            base_fee=0, unit_price=0,
            min_price=50000, max_price=100000,
        )

    def test_distance_type_calculates_correctly(self):
        """Tính giá theo khoảng cách — dùng haversine_distance_optimized đã có.
        Toạ độ: Quận 1 → Quận 7 TP.HCM (~8km).
        Base fee 20k + 8km * 15k/km = 140k.
        """
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
            'latitude': 10.7769,
            'longitude': 106.7009,
            'reference_latitude': 10.7340,
            'reference_longitude': 106.7183,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data['pricing_type'], 'distance')
        self.assertIsNotNone(data['suggested_price'])
        self.assertGreater(data['suggested_price'], 0)
        # Breakdown phải có distance_km
        self.assertIn('distance_km', data['breakdown'])
        self.assertIn('base_fee', data['breakdown'])
        self.assertEqual(data['breakdown']['base_fee'], 20000)
        self.assertEqual(data['breakdown']['unit_price'], 15000)
        # Khoảng cách phải hợp lý (3-15km cho route Q1→Q7)
        self.assertGreater(data['breakdown']['distance_km'], 3)
        self.assertLess(data['breakdown']['distance_km'], 15)

    def test_hourly_type_calculates_correctly(self):
        """Tính giá theo giờ: 0 + 3h * 80k = 240k.
        """
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_hourly.id,
            'estimated_duration_hours': 3,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data['pricing_type'], 'hourly')
        self.assertEqual(data['suggested_price'], 240000)
        self.assertEqual(data['breakdown']['estimated_hours'], 3)
        self.assertEqual(data['breakdown']['unit_price'], 80000)

    def test_hourly_clamped_to_max(self):
        """Giá hourly vượt max → clamp về max.
        10h * 80k = 800k → clamp về 300k (max_price).
        """
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_hourly.id,
            'estimated_duration_hours': 10,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['suggested_price'], 300000)

    def test_hourly_clamped_to_min(self):
        """Giá hourly dưới min → clamp về min.
        1h * 80k = 80k → clamp về 150k (min_price).
        """
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_hourly.id,
            'estimated_duration_hours': 1,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['suggested_price'], 150000)

    def test_no_pricing_rule_returns_fixed_fallback(self):
        """Category không có PricingRule → trả message 'Thoả thuận trực tiếp'."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_no_rule.id,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data['pricing_type'], 'fixed')
        self.assertIsNone(data['suggested_price'])
        self.assertEqual(data['message'], 'Thoả thuận trực tiếp')

    def test_fixed_type_returns_range_only(self):
        """Fixed type → chỉ có price_range, không có suggested_price."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_fixed.id,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data['pricing_type'], 'fixed')
        self.assertIsNone(data['suggested_price'])
        self.assertIsNotNone(data['price_range'])
        self.assertEqual(data['price_range']['min'], 50000)
        self.assertEqual(data['price_range']['max'], 100000)

    def test_distance_missing_coords_returns_range(self):
        """Distance type thiếu toạ độ → trả price_range + reason."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertIsNone(data['suggested_price'])
        self.assertIn('reason', data)
        self.assertIsNotNone(data['price_range'])

    def test_hourly_missing_duration_returns_range(self):
        """Hourly type thiếu estimated_duration_hours → trả price_range + reason."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_hourly.id,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertIsNone(data['suggested_price'])
        self.assertIn('reason', data)

    def test_unauthenticated_returns_401(self):
        """User chưa đăng nhập → 401."""
        client = APIClient()
        resp = client.post('/api/tasks/price-suggestion/', {
            'category_id': 999,
        })
        self.assertEqual(resp.status_code, 401)

    def test_missing_category_id_returns_400(self):
        """Thiếu category_id → 400."""
        resp = self.client.post('/api/tasks/price-suggestion/', {})
        self.assertEqual(resp.status_code, 400)

    def test_invalid_category_id_returns_400(self):
        """category_id không tồn tại → 400."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': 99999,
        })
        self.assertEqual(resp.status_code, 400)

    def test_invalid_coordinates_returns_range(self):
        """Toạ độ không hợp lệ (text) → không crash, trả price_range."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
            'latitude': 'not_a_number',
            'longitude': 'also_bad',
        })
        self.assertEqual(resp.status_code, 200)
        # Không crash, trả range vì không tính được
        self.assertIsNone(resp.data['suggested_price'])

    def test_zero_or_negative_duration_ignored(self):
        """estimated_duration_hours <= 0 → bị ignore, trả range."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_hourly.id,
            'estimated_duration_hours': -5,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['suggested_price'])

    def test_distance_coordinates_out_of_range_ignored(self):
        """Toạ độ ngoài khoảng [-90,90] / [-180,180] → bị ignore."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
            'latitude': 999,
            'longitude': -999,
            'reference_latitude': 10.7769,
            'reference_longitude': 106.7009,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['suggested_price'])

    def test_latitude_100_rejected_as_invalid(self):
        """latitude=100 nằm trong [-180,180] nhưng NGOÀI [-90,90] → phải bị coi là không hợp lệ.
        Bug cũ dùng 'or' nên 100 pass do nằm trong [-180,180]."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
            'latitude': 100,
            'longitude': 106.7,
            'reference_latitude': 10.76,
            'reference_longitude': 106.66,
        })
        self.assertEqual(resp.status_code, 200)
        # latitude=100 là vô lý (vĩ độ chỉ -90..90) → phải bị bỏ qua
        self.assertIsNone(resp.data['suggested_price'])
        # Phải trả price_range thay vì giá tính toán sai
        self.assertIsNotNone(resp.data.get('price_range'))

    def test_longitude_200_rejected_as_invalid(self):
        """longitude=200 NGOÀI [-180,180] → phải bị coi là không hợp lệ."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
            'latitude': 10.76,
            'longitude': 200,
            'reference_latitude': 10.7626,
            'reference_longitude': 106.6602,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['suggested_price'])
        self.assertIsNotNone(resp.data.get('price_range'))

    def test_reference_latitude_100_rejected(self):
        """reference_latitude=100 (sai phạm vi lat) → thiếu toạ độ hợp lệ → trả range."""
        resp = self.client.post('/api/tasks/price-suggestion/', {
            'category_id': self.cat_distance.id,
            'latitude': 10.76,
            'longitude': 106.7,
            'reference_latitude': 100,
            'reference_longitude': 106.66,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['suggested_price'])
