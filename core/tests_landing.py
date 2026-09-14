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
            'full_name': 'Nguyễn Thị An',  # bắt buộc từ 2026-09-14
            'role_answers': VALID_PH_ROLE_ANSWERS.copy(),
            'feedback': 'Tôi cần tìm người trông con',
            'phone': '0912345678',
            'email': '',
        }
        self.valid_cp = {
            'role': 'carepartner',
            'full_name': 'Trần Văn Bình',  # bắt buộc từ 2026-09-14
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

    # ===== HỌ VÀ TÊN — bắt buộc (2026-09-14) =====
    def test_survey_full_name_missing_400(self):
        """Submit KHÔNG có full_name phải bị từ chối 400."""
        payload = self.valid_parent.copy()
        del payload['full_name']
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('full_name', resp.data.get('error', {}))
        self.assertEqual(LandingSurvey.objects.count(), 0)

    def test_survey_full_name_blank_400(self):
        """full_name rỗng / chỉ toàn khoảng trắng phải bị từ chối 400."""
        for blank in ('', '   '):
            payload = self.valid_parent.copy()
            payload['full_name'] = blank
            resp = self.client.post('/api/landing/survey/', payload, format='json')
            self.assertEqual(resp.status_code, 400, f'full_name={blank!r} phải bị từ chối')
            self.assertIn('full_name', resp.data.get('error', {}))
        self.assertEqual(LandingSurvey.objects.count(), 0)

    def test_survey_full_name_saved_trimmed(self):
        """full_name hợp lệ được lưu đã trim khoảng trắng 2 đầu."""
        payload = self.valid_parent.copy()
        payload['full_name'] = '  Lê Văn Cường  '
        resp = self.client.post('/api/landing/survey/', payload, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(LandingSurvey.objects.first().full_name, 'Lê Văn Cường')

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
            signup_type='tu-van', preferred_time_slot='sang',
            interested_service='tutoring', location_city='Hà Nội',
            location_district='Cầu Giấy'
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

    def test_stats_surveys_include_full_name_new_and_legacy(self):
        """2026-09-14: stats trả 'full_name' cho bảng khảo sát admin dashboard.
        Bản ghi MỚI (có full_name) → trả đúng tên; bản ghi CŨ (trước khi có
        field, full_name='') → trả rỗng để UI hiển thị 'Chưa cập nhật', không lỗi."""
        # Bản ghi mới có full_name
        LandingSurvey.objects.create(
            role='phu-huynh', full_name='Phạm Thị D',
            role_answers=VALID_PH_ROLE_ANSWERS.copy(),
            feedback='Có tên', phone='0900000009')
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=30')
        self.assertEqual(resp.status_code, 200)
        rows = resp.data['surveys']['all']
        by_id = {r['id']: r for r in rows}
        # Mọi row đều có key full_name
        for r in rows:
            self.assertIn('full_name', r)
        # Bản ghi setUp KHÔNG có full_name (legacy) → rỗng
        legacy = [r for r in rows if r['full_name'] == '']
        self.assertGreaterEqual(len(legacy), 2)
        # Bản ghi mới → đúng tên đã lưu
        named = [r for r in rows if r['full_name'] == 'Phạm Thị D']
        self.assertEqual(len(named), 1)

    def test_stats_filter_by_days(self):
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['period_days'], 365)

    def test_stats_2026_question_set(self):
        """Stats phải tổng hợp ĐỦ 16 câu hỏi 2026 khớp form /landing/ + nhãn tiếng Việt."""
        self._login_as_admin()
        # Dữ liệu mới 2026 — 1 PH + 1 CP dùng đúng bộ câu hỏi form landing
        LandingSurvey.objects.all().delete()
        LandingSurvey.objects.create(
            role='phu-huynh', role_answers=VALID_PH_ROLE_ANSWERS.copy(),
            feedback='Cần gấp', phone='0900000001', ip_address='1.1.1.1')
        LandingSurvey.objects.create(
            role='carepartner', role_answers=VALID_CP_ROLE_ANSWERS.copy(),
            feedback='', email='cp@test.com', ip_address='2.2.2.2')
        resp = self.client.get('/api/admin/feedback-stats/?days=30')
        self.assertEqual(resp.status_code, 200)
        s = resp.data['surveys']

        # Mọi nhóm câu hỏi 2026 phải tồn tại trong response
        for key in ('by_interest', 'by_necessity', 'by_child_age', 'by_budget',
                    'by_current_solution', 'by_pain_points', 'by_busy_slots',
                    'by_trust_factors', 'by_cp_type', 'by_experience',
                    'by_transport', 'by_rate', 'by_slots', 'by_concerns',
                    'by_motivations', 'recent'):
            self.assertIn(key, s, f'Thiếu key {key} trong stats')

        # Dịch vụ quan tâm: nhãn mới 2026 (không còn raw slug 'tutoring')
        interest_labels = [i['label'] for i in s['by_interest']]
        self.assertIn('Gia sư học tập tại nhà', interest_labels)
        self.assertIn('Đưa đón bé tan học', interest_labels)

        # Necessity mới: 'can-thiet' phải dịch sang tiếng Việt
        nec_labels = [n['label'] for n in s['by_necessity']]
        self.assertTrue(any('Cần thiết' in lb for lb in nec_labels), nec_labels)

        # Phụ huynh: độ tuổi bé + ngân sách
        self.assertEqual(s['by_child_age'][0]['label'], '6 – 11 tuổi (tiểu học)')
        self.assertEqual(s['by_budget'][0]['label'], '100.000–150.000đ/giờ')

        # Phụ huynh: trust factors (multi-select)
        trust_keys = [t['factor'] for t in s['by_trust_factors']]
        self.assertIn('ly-lich', trust_keys)
        self.assertIn('live-gps', trust_keys)

        # CarePartner: loại đối tượng + phương tiện + thù lao
        self.assertEqual(s['by_cp_type'][0]['label'], 'Sinh viên năm 3 – 4 / mới tốt nghiệp')
        self.assertEqual(s['by_transport'][0]['label'], 'Xe máy riêng + bằng A1')
        self.assertEqual(s['by_rate'][0]['label'], '85.000–120.000đ/giờ')

        # CarePartner: motivations + slots (multi-select)
        self.assertEqual(s['by_motivations'][0]['count'], 1)
        slot_keys = [x['slot'] for x in s['by_slots']]
        self.assertIn('chieu-tan-truong', slot_keys)

        # Bảng góp ý gần nhất: đủ dữ liệu + câu trả lời đã dịch sang tiếng Việt
        self.assertEqual(len(s['recent']), 2)
        ph_recent = next(r for r in s['recent'] if r['role'] == 'phu-huynh')
        self.assertTrue(any('6 – 11 tuổi' in a for a in ph_recent['answers']))
        self.assertEqual(ph_recent['phone'], '0900000001')

        # Signup stats: dịch vụ quan tâm + khu vực + khung giờ
        sig = resp.data['signups']
        for key in ('by_service', 'by_city', 'by_time_slot'):
            self.assertIn(key, sig)
        self.assertEqual(sig['by_service'][0]['interested_service'], 'tutoring')
        self.assertEqual(sig['by_time_slot'][0]['preferred_time_slot'], 'sang')

    def test_stats_backward_compat_old_answers(self):
        """Dữ liệu khảo sát CŨ (interests/gia-su, necessity/rat-can) vẫn hiện đúng nhãn."""
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        s = resp.data['surveys']
        # setUp tạo survey cũ: interests=['gia-su'], necessity='rat-can'
        interest_labels = [i['label'] for i in s['by_interest']]
        self.assertIn('Gia sư tại nhà', interest_labels)
        nec_labels = [n['label'] for n in s['by_necessity']]
        self.assertIn('Rất cần thiết', nec_labels)

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


class AdminFeedbackDataTableAndResetTestCase(TestCase):
    """Test tính năng 2026-09-14:

    1. GET /api/admin/feedback-stats/ trả về danh sách ĐẦY ĐỦ (surveys.all
       có `fields` = danh sách câu hỏi + đáp án người dùng đã chọn khớp form
       /landing/; signups.all có đủ mọi cột form đăng ký).
    2. POST /api/admin/feedback-reset/ xoá SẠCH mọi dữ liệu thu thập
       (survey + signup + visit) — chỉ admin.
    """

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='testpass123'
        )
        LandingSurvey.objects.create(
            role='phu-huynh', role_answers=VALID_PH_ROLE_ANSWERS.copy(),
            feedback='Cần người sớm', phone='0900000001', ip_address='1.1.1.1')
        LandingSurvey.objects.create(
            role='carepartner', role_answers=VALID_CP_ROLE_ANSWERS.copy(),
            feedback='', email='cp@test.com', ip_address='2.2.2.2')
        LandingSignup.objects.create(
            full_name='Nguyễn B', phone='0998765432', email='b@test.com',
            role='carepartner', signup_type='dung-thu',
            interested_service='pickup', location_city='Đà Nẵng',
            location_district='Sơn Trà', note='Muốn dùng thử cuối tuần')

    def _login_as_admin(self):
        resp = self.client.post('/api/auth/login/', {'username': 'admin', 'password': 'testpass123'})
        token = resp.data.get('tokens', {}).get('access') or resp.data.get('access')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_stats_full_lists_with_structured_fields(self):
        """surveys.all có `fields` (câu hỏi → đáp án đã chọn, tiếng Việt)."""
        self._login_as_admin()
        resp = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp.status_code, 200)
        s = resp.data['surveys']
        self.assertEqual(len(s['all']), 2)

        ph = next(x for x in s['all'] if x['role'] == 'phu-huynh')
        qa = {f['question']: f['answer'] for f in ph['fields']}
        # Đáp án phải được dịch sang nhãn tiếng Việt khớp form /landing/
        self.assertTrue(any('6 – 11 tuổi' in v for v in qa.values()), qa)
        self.assertTrue(any('100.000đ – 150.000đ' in v or '100.000–150.000đ' in v for v in qa.values()), qa)
        self.assertTrue(any('Lý lịch' in v for v in qa.values()), qa)
        # Đủ dịch vụ quan tâm
        self.assertIn('Gia sư học tập tại nhà', ph['services'])

        cp = next(x for x in s['all'] if x['role'] == 'carepartner')
        qa_cp = {f['question']: f['answer'] for f in cp['fields']}
        self.assertTrue(any('Xe máy' in v for v in qa_cp.values()), qa_cp)
        self.assertTrue(any('85.000–120.000đ' in v for v in qa_cp.values()), qa_cp)

        # signups.all — đủ mọi cột khớp form đăng ký /landing/ #dang-ky
        sig_all = resp.data['signups']['all']
        self.assertEqual(len(sig_all), 1)
        sg = sig_all[0]
        for key in ('full_name', 'phone', 'email', 'role', 'signup_type',
                    'interested_service', 'location_city', 'location_district',
                    'preferred_time_slot', 'trial_consent', 'note', 'created_at'):
            self.assertIn(key, sg, f'Thiếu cột {key} trong signups.all')
        self.assertEqual(sg['full_name'], 'Nguyễn B')
        self.assertEqual(sg['location_district'], 'Sơn Trà')

    def test_reset_anonymous_401(self):
        resp = self.client.post('/api/admin/feedback-reset/')
        self.assertIn(resp.status_code, [401, 403])
        # Dữ liệu KHÔNG bị xoá khi chưa đăng nhập
        self.assertEqual(LandingSurvey.objects.count(), 2)

    def test_reset_admin_deletes_everything(self):
        """POST reset xoá sạch survey + signup + visit, kể cả ngoài bộ lọc ngày."""
        from core.models import LandingPageVisit
        LandingPageVisit.objects.create(session_id='sess-1', ip_address='9.9.9.9')
        LandingPageVisit.objects.create(session_id='sess-2', ip_address='9.9.9.8')
        self.assertEqual(LandingSurvey.objects.count(), 2)
        self.assertEqual(LandingSignup.objects.count(), 1)
        self.assertEqual(LandingPageVisit.objects.count(), 2)

        self._login_as_admin()
        resp = self.client.post('/api/admin/feedback-reset/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data.get('ok'))
        self.assertEqual(resp.data['deleted']['surveys'], 2)
        self.assertEqual(resp.data['deleted']['signups'], 1)
        self.assertEqual(resp.data['deleted']['visits'], 2)

        # DB phải về 0 — trạng thái trống sẵn sàng chiến dịch mới
        self.assertEqual(LandingSurvey.objects.count(), 0)
        self.assertEqual(LandingSignup.objects.count(), 0)
        self.assertEqual(LandingPageVisit.objects.count(), 0)

        # Stats sau reset cũng phải = 0
        resp2 = self.client.get('/api/admin/feedback-stats/?days=365')
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(resp2.data['surveys']['total'], 0)
        self.assertEqual(len(resp2.data['surveys']['all']), 0)
        self.assertEqual(len(resp2.data['signups']['all']), 0)


class ProfileExposesStaffFlagTests(TestCase):
    """2026-09-14 — GET /api/profile/ phải trả is_staff/is_superuser (read-only).

    admin_dashboard.checkAdminRole() (fix M21 2026-07-24) đọc 2 field này để
    mở khóa bảng dữ liệu cho admin — trước đây serializer không expose nên
    admin luôn thấy 'Không có quyền truy cập' dù đã đăng nhập đúng."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            username='adminx', email='adminx@test.com', password='testpass123')
        self.parent = User.objects.create_user(
            username='parentx', password='testpass123', role='parent')

    def _login(self, username):
        resp = self.client.post('/api/auth/login/', {'username': username, 'password': 'testpass123'})
        token = resp.data.get('tokens', {}).get('access') or resp.data.get('access')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_profile_returns_staff_flags_for_admin(self):
        self._login('adminx')
        resp = self.client.get('/api/profile/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data.get('is_staff'))
        self.assertTrue(resp.data.get('is_superuser'))

    def test_profile_returns_false_flags_for_parent(self):
        self._login('parentx')
        resp = self.client.get('/api/profile/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data.get('is_staff'))
        self.assertFalse(resp.data.get('is_superuser'))

    def test_profile_cannot_patch_staff_flags(self):
        """Field chỉ đọc — cố nâng quyền qua PATCH phải bị chặn 400."""
        self._login('parentx')
        resp = self.client.patch('/api/profile/', {'is_staff': 'true'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.user_refetch = User.objects.get(username='parentx')
        self.assertFalse(self.user_refetch.is_staff)
