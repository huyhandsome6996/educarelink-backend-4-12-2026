"""
Landing Page — Test suite cho API khảo sát & đăng ký.

Chạy: python manage.py test core.tests_landing --verbosity=2

Test cases:
  - Survey: tạo thành công, thiếu role → 400, thiếu necessity → 400, email invalid → 400
  - Survey: honeypot → 200 silent
  - Signup (tư vấn): tạo thành công, thiếu time_slot → 400
  - Signup (dùng thử): tạo thành công, thiếu consent → 400, thiếu name/phone/email/role → 400
  - Signup: phone invalid → 400
  - Signup: honeypot → 200 silent
  - Permission: anonymous access ok (200/201), không cần JWT
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from core.models import LandingSurvey, LandingSignup


@override_settings(DEBUG=True)
class LandingSurveyTestCase(TestCase):
    """Test POST /api/landing/survey/"""

    def setUp(self):
        self.client = APIClient()
        self.valid_payload = {
            'role': 'phu-huynh',
            'interests': ['gia-su', 'cham-soc-tre'],
            'necessity': 'can',
            'feedback': 'Tôi cần tìm người trông con',
            'email': '',
        }

    def test_create_survey_success(self):
        resp = self.client.post('/api/landing/survey/', self.valid_payload, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['ok'])
        self.assertIn('id', resp.data)
        self.assertEqual(LandingSurvey.objects.count(), 1)
        obj = LandingSurvey.objects.first()
        self.assertEqual(obj.role, 'phu-huynh')
        self.assertEqual(obj.interests, ['gia-su', 'cham-soc-tre'])

    def test_survey_email_optional(self):
        payload = self.valid_payload.copy()
        payload['email'] = ''
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_email_validated_when_provided(self):
        payload = self.valid_payload.copy()
        payload['email'] = 'not-an-email'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_missing_role(self):
        payload = self.valid_payload.copy()
        del payload['role']
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_missing_necessity(self):
        payload = self.valid_payload.copy()
        del payload['necessity']
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_invalid_interest(self):
        payload = self.valid_payload.copy()
        payload['interests'] = ['invalid-value']
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_honeypot_silent_reject(self):
        payload = self.valid_payload.copy()
        payload['website_url'] = 'http://spam.com'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(LandingSurvey.objects.count(), 0)

    def test_survey_no_auth_required(self):
        """Anonymous — không cần JWT."""
        resp = self.client.post('/api/landing/survey/', self.valid_payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_ip_stored(self):
        resp = self.client.post('/api/landing/survey/', self.valid_payload, format='json', REMOTE_ADDR='1.2.3.4')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(LandingSurvey.objects.first().ip_address, '1.2.3.4')


@override_settings(DEBUG=True)
class LandingSignupTestCase(TestCase):
    """Test POST /api/landing/signup/"""

    def setUp(self):
        self.client = APIClient()
        self.valid_consult = {
            'full_name': 'Nguyễn Văn A',
            'phone': '0912345678',
            'email': 'test@example.com',
            'role': 'phu-huynh',
            'signup_type': 'tu-van',
            'preferred_time_slot': 'sang',
            'trial_consent': False,
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
            'note': 'Tôi muốn thử nghiệm tính năng định vị',
        }

    def test_create_consult_success(self):
        resp = self.client.post('/api/landing/signup/', self.valid_consult, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(resp.data['signup_type'], 'tu-van')
        self.assertEqual(LandingSignup.objects.count(), 1)
        obj = LandingSignup.objects.first()
        self.assertEqual(obj.full_name, 'Nguyễn Văn A')
        self.assertEqual(obj.preferred_time_slot, 'sang')

    def test_create_trial_success(self):
        resp = self.client.post('/api/landing/signup/', self.valid_trial, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['signup_type'], 'dung-thu')
        obj = LandingSignup.objects.first()
        self.assertTrue(obj.trial_consent)

    def test_consult_missing_time_slot(self):
        payload = self.valid_consult.copy()
        payload['preferred_time_slot'] = ''
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('preferred_time_slot', resp.data['error'])

    def test_trial_missing_consent(self):
        payload = self.valid_trial.copy()
        payload['trial_consent'] = False
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('trial_consent', resp.data['error'])

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
        self.assertIn('phone', resp.data['error'])

    def test_invalid_email(self):
        payload = self.valid_consult.copy()
        payload['email'] = 'not-email'
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('email', resp.data['error'])

    def test_signup_honeypot_silent_reject(self):
        payload = self.valid_consult.copy()
        payload['website_url'] = 'bot'
        resp = self.client.post('/api/landing/signup/', payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['ok'])
        self.assertEqual(LandingSignup.objects.count(), 0)

    def test_signup_no_auth_required(self):
        resp = self.client.post('/api/landing/signup/', self.valid_consult, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_signup_ip_stored(self):
        resp = self.client.post('/api/landing/signup/', self.valid_consult, format='json', REMOTE_ADDR='10.0.0.1')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(LandingSignup.objects.first().ip_address, '10.0.0.1')
