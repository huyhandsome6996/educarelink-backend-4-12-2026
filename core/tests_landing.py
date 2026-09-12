"""
Landing Page — Test suite cho API khảo sát & đăng ký.

Chạy: python manage.py test core.tests_landing --verbosity=2

Test cases:
  - Survey: tạo thành công CP/PH, thiếu field bắt buộc, role_answers rỗng → 400
  - Survey: honeypot → 200 silent, email optional/validated
  - Signup: tư vấn/dùng thử, missing fields, honeypot
  - Admin stats: 401 anonymous, 200 admin
  - Admin Excel: 401 anonymous, 200 admin (download file)
  - Admin AI: 401 anonymous, 200 admin (fallback)
  - Throttle: 429 sau >15 request/phút
  - Fallback analysis: cp==ph case
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from django.core.cache import cache
from core.models import LandingSurvey, LandingSignup

User = get_user_model()


VALID_CP_ROLE_ANSWERS = {
    'services': ['tutoring', 'pickup'],
    'carepartner_type': 'sv-nam-3-4',
    'transport_method': 'xe-may',
    'available_slots': ['chieu-tan-truong', 'toi-trong-tuan'],
    'expected_rate': '85-120k',
    'motivations': ['flow1', 'thulao'],
}

VALID_PH_ROLE_ANSWERS = {
    'services': ['tutoring', 'pickup'],
    'child_age': '6-11',
    'busy_slots': ['tan-tam-1630-1830'],
    'trust_factors': ['ly-lich', 'live-gps'],
    'budget_range': '100-150k',
    'necessity': 'can-thiet',
}


@override_settings(DEBUG=True)
class LandingSurveyTestCase(TestCase):
    """Test POST /api/landing/survey/"""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.valid_parent = {
            'role': 'phu-huynh',
            'role_answers': VALID_PH_ROLE_ANSWERS.copy(),
            'feedback': 'Tôi cần tìm người trông con',
            'phone': '0912345678',
            'email': '',
        }
        self.valid_cp = {
            'role': 'carepartner',
            'role_answers': VALID_CP_ROLE_ANSWERS.copy(),
            'feedback': '',
            'phone': '',
            'email': 'cp@test.com',
        }

    def test_create_parent_survey_success(self):
        resp = self.client.post('/api/landing/survey/', self.valid_parent, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['ok'])
        self.assertIn('id', resp.data)
        self.assertEqual(LandingSurvey.objects.count(), 1)
        obj = LandingSurvey.objects.first()
        self.assertEqual(obj.role, 'phu-huynh')
        self.assertEqual(obj.phone, '0912345678')
        self.assertEqual(obj.role_answers['services'], ['tutoring', 'pickup'])
        self.assertEqual(obj.role_answers['child_age'], '6-11')
        self.assertEqual(obj.role_answers['necessity'], 'can-thiet')

    def test_create_carepartner_survey_success(self):
        resp = self.client.post('/api/landing/survey/', self.valid_cp, format='json')
        self.assertEqual(resp.status_code, 201)
        obj = LandingSurvey.objects.get(role='carepartner')
        self.assertEqual(obj.email, 'cp@test.com')
        self.assertEqual(obj.role_answers['services'], ['tutoring', 'pickup'])
        self.assertEqual(obj.role_answers['carepartner_type'], 'sv-nam-3-4')
        self.assertEqual(obj.role_answers['transport_method'], 'xe-may')

    def test_survey_email_optional_when_phone_provided(self):
        payload = self.valid_parent.copy()
        payload['phone'] = '0912345678'
        payload['email'] = ''
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_phone_optional_when_email_provided(self):
        payload = self.valid_cp.copy()
        payload['phone'] = ''
        payload['email'] = 'cp@test.com'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_require_phone_or_email_missing_both_400(self):
        payload = self.valid_parent.copy()
        payload['phone'] = ''
        payload['email'] = ''
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('contact', resp.data.get('error', {}))

    def test_survey_invalid_phone_400(self):
        payload = self.valid_parent.copy()
        payload['phone'] = '123'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('phone', resp.data.get('error', {}))

    def test_survey_email_validated_when_provided(self):
        payload = self.valid_parent.copy()
        payload['email'] = 'not-an-email'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_missing_role(self):
        payload = self.valid_parent.copy()
        del payload['role']
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_invalid_role(self):
        payload = self.valid_parent.copy()
        payload['role'] = 'invalid'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_honeypot_silent_reject(self):
        payload = self.valid_parent.copy()
        payload['website_url'] = 'http://spam.com'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(LandingSurvey.objects.count(), 0)

    def test_survey_no_auth_required(self):
        resp = self.client.post('/api/landing/survey/', self.valid_parent, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_ip_stored(self):
        resp = self.client.post('/api/landing/survey/', self.valid_parent, format='json', REMOTE_ADDR='1.2.3.4')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(LandingSurvey.objects.first().ip_address, '1.2.3.4')

    # Bug #4: role_answers validation
    def test_cp_empty_role_answers_400(self):
        payload = self.valid_cp.copy()
        payload['role_answers'] = {}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_ph_empty_role_answers_400(self):
        payload = self.valid_parent.copy()
        payload['role_answers'] = {}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_cp_missing_services_400(self):
        payload = self.valid_cp.copy()
        payload['role_answers'] = {'carepartner_type': 'sv-nam-3-4', 'transport_method': 'xe-may', 'expected_rate': '85-120k'}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_ph_missing_necessity_400(self):
        payload = self.valid_parent.copy()
        payload['role_answers'] = {'services': ['tutoring'], 'child_age': '6-11', 'budget_range': '100-150k'}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_ph_missing_child_age_400(self):
        payload = self.valid_parent.copy()
        payload['role_answers'] = {'services': ['tutoring'], 'budget_range': '100-150k', 'necessity': 'can-thiet'}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_ph_missing_budget_400(self):
        payload = self.valid_parent.copy()
        payload['role_answers'] = {'services': ['tutoring'], 'child_age': '6-11', 'necessity': 'can-thiet'}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_cp_missing_expected_rate_400(self):
        payload = self.valid_cp.copy()
        payload['role_answers'] = {'services': ['tutoring'], 'carepartner_type': 'sv-nam-3-4', 'transport_method': 'xe-may'}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_role_answers_not_dict_400(self):
        payload = self.valid_parent.copy()
        payload['role_answers'] = 'not a dict'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_new_sharp_keys_2026_accepted(self):
        """Bộ câu hỏi sắc bén 2026-09-12: current_solution / pain_points (PH),
        experience / concerns (CP) — key mới optional phải lưu trữ trọn vẹn."""
        payload = self.valid_parent.copy()
        payload['role_answers'] = {
            'services': ['pickup'],
            'child_age': '3-6',
            'current_solution': 'nguoi-than',
            'pain_points': ['gio-tan-tam', 'kho-tin'],
            'busy_slots': ['tan-tam-1630-1830'],
            'budget_range': 'don-50-80k',
            'necessity': 'rat-cap-bach',
        }
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        obj = LandingSurvey.objects.filter(role='phu-huynh').first()
        self.assertEqual(obj.role_answers['current_solution'], 'nguoi-than')
        self.assertEqual(obj.role_answers['pain_points'], ['gio-tan-tam', 'kho-tin'])

        payload_cp = self.valid_cp.copy()
        payload_cp['role_answers'] = {
            'services': ['childcare'],
            'carepartner_type': 'su-pham',
            'experience': '1-3-nam',
            'transport_method': 'di-bo-xe-dap',
            'available_slots': ['sang-ngay-thuong'],
            'expected_rate': '60-85k',
            'concerns': ['trach-nhiem-su-co', 'ky-nang-xu-ly'],
        }
        resp = self.client.post('/api/landing/survey/', payload_cp, format='json')
        self.assertEqual(resp.status_code, 201)
        obj_cp = LandingSurvey.objects.filter(role='carepartner').first()
        self.assertEqual(obj_cp.role_answers['experience'], '1-3-nam')
        self.assertEqual(obj_cp.role_answers['concerns'], ['trach-nhiem-su-co', 'ky-nang-xu-ly'])


@override_settings(DEBUG=True)
class LandingSignupTestCase(TestCase):
    """Test POST /api/landing/signup/"""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.valid_consult = {
            'full_name': 'Nguyễn Văn A',
            'phone': '0912345678',
            'email': 'test@example.com',
            'role': 'phu-huynh',
            'signup_type': 'tu-van',
            'preferred_time_slot': 'sang',
            'trial_consent': False,
            'interested_service': 'pickup',
            'location_city': 'TP. Hồ Chí Minh',
            'location_district': 'Bình Thạnh',
            'note': '',
        }
        self.valid_trial = {
            'full_name': 'Trần Thị B',
            'phone': '0987654321',
            'email': 'b@carepartner.com',
            'role': 'carepartner',
            'signup_type': 'dung-thu',
            'preferred_time_slot': '',
            'trial_consent': True,
            'interested_service': 'tutoring',
            'location_city': 'Hà Nội',
            'location_district': 'Cầu Giấy',
            'note': 'Tôi muốn thử nghiệm tính năng định vị',
        }

    def test_create_consult_success(self):
        resp = self.client.post('/api/landing/signup/', self.valid_consult, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(resp.data['signup_type'], 'tu-van')
        self.assertEqual(LandingSignup.objects.count(), 1)

    def test_create_trial_success(self):
        resp = self.client.post('/api/landing/signup/', self.valid_trial, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['signup_type'], 'dung-thu')

    def test_consult_missing_time_slot(self):
        payload = self.valid_consult.copy()
        payload['preferred_time_slot'] = ''
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_trial_missing_consent(self):
        payload = self.valid_trial.copy()
        payload['trial_consent'] = False
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_signup_missing_service_400(self):
        payload = self.valid_consult.copy()
        payload['interested_service'] = ''
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_signup_missing_city_400(self):
        payload = self.valid_consult.copy()
        payload['location_city'] = ''
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_signup_stores_service_and_location(self):
        resp = self.client.post('/api/landing/signup/', self.valid_trial, format='json')
        self.assertEqual(resp.status_code, 201)
        obj = LandingSignup.objects.first()
        self.assertEqual(obj.interested_service, 'tutoring')
        self.assertEqual(obj.location_city, 'Hà Nội')
        self.assertEqual(obj.location_district, 'Cầu Giấy')

    def test_missing_required_fields(self):
        for field in ['full_name', 'phone', 'email', 'role']:
            with self.subTest(field=field):
                payload = self.valid_consult.copy()
                payload[field] = ''
                resp = self.client.post('/api/landing/signup/', payload, format='json')
                self.assertIn(resp.status_code, [400, 422])

    def test_invalid_phone(self):
        payload = self.valid_consult.copy()
        payload['phone'] = '123'
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_signup_honeypot_silent_reject(self):
        payload = self.valid_consult.copy()
        payload['website_url'] = 'bot'
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(LandingSignup.objects.count(), 0)

    def test_signup_no_auth_required(self):
        resp = self.client.post('/api/landing/signup/', self.valid_consult, format='json')
        self.assertEqual(resp.status_code, 201)


@override_settings(DEBUG=True)
class AdminFeedbackStatsTestCase(TestCase):
    """Test GET /api/admin/feedback-stats/ và POST /api/admin/feedback-ai-analysis/"""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='testpass123'
        )
        LandingSurvey.objects.create(
            role='phu-huynh',
            role_answers={'interests': ['gia-su'], 'necessity': 'rat-can'},
            feedback='Góp ý phụ huynh', ip_address='1.1.1.1'
        )
        LandingSurvey.objects.create(
            role='carepartner',
            role_answers={'services': ['cham-soc-tre'], 'experience': 'duoi-1-nam', 'expected_rate': '30-50k', 'interest_level': 'quan-tam'},
            feedback='', ip_address='2.2.2.2'
        )
        LandingSignup.objects.create(
            full_name='Nguyễn A', phone='0912345678',
            email='a@test.com', role='phu-huynh',
            signup_type='tu-van', preferred_time_slot='sang'
        )

    def _login_as_admin(self):
        resp = self.client.post('/api/auth/login/', {'username': 'admin', 'password': 'testpass123'})
        token = resp.data.get('tokens', {}).get('access') or resp.data.get('access')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_stats_anonymous_401(self):
        resp = self.client.get('/api/admin/feedback-stats/')
        self.assertIn(resp.status_code, [401, 403])

    def test_stats_admin_success(self):
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=30')
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        self.assertEqual(data['surveys']['total'], 2)
        self.assertEqual(data['signups']['total'], 1)
        self.assertEqual(len(data['surveys']['by_type']), 2)

    def test_stats_filter_by_days(self):
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['period_days'], 365)

    def test_excel_anonymous_401(self):
        resp = self.client.get('/api/admin/feedback-excel/')
        self.assertIn(resp.status_code, [401, 403])

    def test_excel_admin_success(self):
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-excel/?days=30')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('excel' if hasattr(resp, 'data') else 'application/vnd', str(resp.get('Content-Type', '')))

    def test_ai_analysis_anonymous_401(self):
        resp = self.client.post('/api/admin/feedback-ai-analysis/', {'days': 30}, format='json')
        self.assertIn(resp.status_code, [401, 403])

    def test_ai_analysis_admin_fallback(self):
        self._login_as_admin()
        resp = self.client.post('/api/admin/feedback-ai-analysis/', {'days': 30}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('fallback', resp.data)
        fb = resp.data['fallback']
        self.assertIn('tong_quan', fb)
        self.assertIn('xu_huong', fb)
        self.assertIn('de_xuat', fb)
        self.assertIn('so_lieu_noi_bat', fb)

    # Bug #6: fallback analysis cp==ph
    def test_ai_fallback_equal_counts(self):
        self._login_as_admin()
        LandingSurvey.objects.all().delete()
        LandingSurvey.objects.create(
            role='carepartner',
            role_answers=VALID_CP_ROLE_ANSWERS.copy(),
            feedback='', ip_address='1.1.1.1'
        )
        LandingSurvey.objects.create(
            role='phu-huynh',
            role_answers=VALID_PH_ROLE_ANSWERS.copy(),
            feedback='', ip_address='2.2.2.2'
        )
        resp = self.client.post('/api/admin/feedback-ai-analysis/', {'days': 30}, format='json')
        self.assertEqual(resp.status_code, 200)
        mo_ta = resp.data['fallback']['xu_huong'][0]['mo_ta']
        self.assertIn('ngang nhau', mo_ta)

    # Bug #6: fallback analysis 0==0
    def test_ai_fallback_empty_db(self):
        self._login_as_admin()
        LandingSurvey.objects.all().delete()
        resp = self.client.post('/api/admin/feedback-ai-analysis/', {'days': 30}, format='json')
        self.assertEqual(resp.status_code, 200)
        mo_ta = resp.data['fallback']['xu_huong'][0]['mo_ta']
        self.assertIn('ngang nhau', mo_ta)


    # Bug #7 regression: Excel export must translate slugs to Vietnamese labels
    def test_excel_ph_role_answers_no_raw_slugs(self):
        """_fmt_role_answers() must convert real frontend slugs to readable Vietnamese.

        E.g. 'da-tung' → 'Đã từng', 'gia-re' → 'Giá hợp lý'.
        If labels are misaligned, raw slugs like 'da-tung' or 'gia-re' leak into the Excel.
        This test catches exactly that class of bug.
        """
        self._login_as_admin()
        LandingSurvey.objects.create(
            role='phu-huynh',
            role_answers={
                'interests': ['gia-su', 'nhat-ky'],
                'necessity': 'rat-can',
                'used_service_before': 'da-tung',
                'important_factors': ['gia-re', 'uy-tin', 'co-xac-minh'],
            },
            feedback='test anti-slug', ip_address='10.0.0.1'
        )
        resp = self.client.get('/api/admin/feedback-excel/?days=30')
        self.assertEqual(resp.status_code, 200)
        # Parse the xlsx in-memory
        import openpyxl
        from io import BytesIO
        wb = openpyxl.load_workbook(BytesIO(resp.content))
        ws = wb['Góp ý']
        # Find the row containing our survey (column 5 = feedback)
        cell_text = ''
        for row in ws.iter_rows(min_row=2, values_only=True):
            if row and len(row) >= 4:
                cell_text += ' '.join(str(c) for c in row)
        # Assert Vietnamese labels present
        self.assertIn('Đã từng', cell_text)
        self.assertIn('Giá hợp lý', cell_text)
        self.assertIn('Đáng tin cậy', cell_text)
        self.assertIn('Đã xác minh danh tính', cell_text)
        self.assertIn('Nhật ký chăm sóc', cell_text)
        # Assert raw slugs are NOT present (the whole point of the test)
        self.assertNotIn('da-tung', cell_text)
        self.assertNotIn('gia-re', cell_text)
        self.assertNotIn('co-xac-minh', cell_text)


@override_settings(DEBUG=True)
class LandingThrottleTestCase(TestCase):
    """Bug #2: Verify ScopedRateThrottle works for landing_form scope."""

    def setUp(self):
        self.client = APIClient()
        self.valid_payload = {
            'role': 'phu-huynh',
            'role_answers': VALID_PH_ROLE_ANSWERS.copy(),
            'feedback': 'throttle test',
            'email': '',
        }

    def test_survey_throttle_429(self):
        """After >15 requests in <1 min, should get 429."""
        for i in range(16):
            payload = self.valid_payload.copy()
            payload['role_answers'] = VALID_PH_ROLE_ANSWERS.copy()
            resp = self.client.post('/api/landing/survey/', payload, format='json')
        # At least one of the last requests should be 429
        # (first 15 may pass, 16th should be throttled)
        last_statuses = []
        for i in range(5):
            payload = self.valid_payload.copy()
            payload['role_answers'] = VALID_PH_ROLE_ANSWERS.copy()
            resp = self.client.post('/api/landing/survey/', payload, format='json')
            last_statuses.append(resp.status_code)
        self.assertIn(429, last_statuses, 'Expected 429 throttle after >15 requests/min')
