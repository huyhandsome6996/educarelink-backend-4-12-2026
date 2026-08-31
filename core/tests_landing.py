"""
Landing Page — Test suite cho API khảo sát & đăng ký.

Chạy: python manage.py test core.tests_landing --verbosity=2

Test cases:
  - Survey: tạo thành công với feedback_type, thiếu feedback_type → 400
  - Survey: question_answers JSON, necessity optional (cho parent)
  - Survey: honeypot → 200 silent
  - Survey: email optional, validated khi có
  - Signup (tư vấn): tạo thành công, thiếu time_slot → 400
  - Signup (dùng thử): tạo thành công, thiếu consent → 400
  - Admin stats: 403 cho anonymous, 200 cho admin
  - Admin Excel: 403 cho anonymous, 200 cho admin (download file)
  - Admin AI: 403 cho anonymous, 200 cho admin (fallback khi không có API key)
  - Permission: anonymous access ok cho landing (200/201), không cần JWT
"""

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from core.models import LandingSurvey, LandingSignup

User = get_user_model()


@override_settings(DEBUG=True)
class LandingSurveyTestCase(TestCase):
    """Test POST /api/landing/survey/"""

    def setUp(self):
        self.client = APIClient()
        self.valid_parent = {
            'feedback_type': 'parent',
            'interests': ['gia-su', 'cham-soc-tre'],
            'necessity': 'can',
            'question_answers': {'ph-q1': 'an-toan', 'ph-q2': 'chua-co', 'ph-q3': '3-6'},
            'feedback': 'Tôi cần tìm người trông con',
            'email': '',
        }
        self.valid_cp = {
            'feedback_type': 'carepartner',
            'interests': ['cham-soc-tre'],
            'necessity': '',
            'question_answers': {'cp-q1': 'su-pham', 'cp-q2': 'chua-tung', 'cp-q4': 'khong-ngai'},
            'feedback': '',
            'email': 'cp@test.com',
        }

    def test_create_parent_survey_success(self):
        resp = self.client.post('/api/landing/survey/', self.valid_parent, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['ok'])
        self.assertIn('id', resp.data)
        self.assertEqual(LandingSurvey.objects.count(), 1)
        obj = LandingSurvey.objects.first()
        self.assertEqual(obj.feedback_type, 'parent')
        self.assertEqual(obj.interests, ['gia-su', 'cham-soc-tre'])
        self.assertEqual(obj.question_answers['ph-q1'], 'an-toan')

    def test_create_carepartner_survey_success(self):
        resp = self.client.post('/api/landing/survey/', self.valid_cp, format='json')
        self.assertEqual(resp.status_code, 201)
        obj = LandingSurvey.objects.get(feedback_type='carepartner')
        self.assertEqual(obj.question_answers['cp-q1'], 'su-pham')

    def test_survey_email_optional(self):
        payload = self.valid_parent.copy()
        payload['email'] = ''
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_email_validated_when_provided(self):
        payload = self.valid_parent.copy()
        payload['email'] = 'not-an-email'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_missing_feedback_type(self):
        payload = self.valid_parent.copy()
        del payload['feedback_type']
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_invalid_feedback_type(self):
        payload = self.valid_parent.copy()
        payload['feedback_type'] = 'invalid'
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_necessity_optional(self):
        """Necessity là optional (blank=True, default='')"""
        payload = self.valid_parent.copy()
        payload['necessity'] = ''
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_question_answers_optional(self):
        payload = self.valid_parent.copy()
        payload['question_answers'] = {}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_question_answers_too_many_keys(self):
        payload = self.valid_parent.copy()
        payload['question_answers'] = {f'q{i}': f'a{i}' for i in range(21)}
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_survey_invalid_interest(self):
        payload = self.valid_parent.copy()
        payload['interests'] = ['invalid-value']
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
        """Anonymous — không cần JWT."""
        resp = self.client.post('/api/landing/survey/', self.valid_parent, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_survey_ip_stored(self):
        resp = self.client.post('/api/landing/survey/', self.valid_parent, format='json', REMOTE_ADDR='1.2.3.4')
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
    """Test GET /api/admin/feedback-stats/ và POST /api/admin/feedback-stats/ai-analysis/"""

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='testpass123'
        )
        # Tạo dữ liệu mẫu
        LandingSurvey.objects.create(
            feedback_type='parent', interests=['gia-su'], necessity='rat-can',
            question_answers={'ph-q1': 'an-toan'},
            feedback='Góp ý phụ huynh', ip_address='1.1.1.1'
        )
        LandingSurvey.objects.create(
            feedback_type='carepartner', interests=['cham-soc-tre'],
            question_answers={'cp-q1': 'su-pham'},
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
        self.assertEqual(len(data['surveys']['by_date']), 1)

    def test_stats_filter_by_days(self):
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['period_days'], 365)

    def test_excel_anonymous_401(self):
        resp = self.client.get('/api/admin/feedback-stats/export/')
        self.assertIn(resp.status_code, [401, 403])

    def test_excel_admin_success(self):
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/export/?days=30')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertIn('attachment', resp['Content-Disposition'])

    def test_ai_analysis_anonymous_401(self):
        resp = self.client.post('/api/admin/feedback-stats/ai-analysis/', {'days': 30}, format='json')
        self.assertIn(resp.status_code, [401, 403])

    def test_ai_analysis_admin_fallback(self):
        """Khi không có GEMINI_API_KEY, trả fallback stats."""
        self._login_as_admin()
        resp = self.client.post('/api/admin/feedback-stats/ai-analysis/', {'days': 30}, format='json')
        self.assertEqual(resp.status_code, 200)
        # Có fallback khi không có AI key
        self.assertIn('fallback', resp.data)
        fallback = resp.data['fallback']
        self.assertIn('tong_quan', fallback)
        self.assertIn('xu_huong', fallback)
        self.assertIn('de_xuat', fallback)
        self.assertIn('so_lieu_noi_bat', fallback)
