"""
matching/tests/test_jobs.py — API đăng việc 3 loại + publish + AI parse fallback
(Prompt 05/06 checklist).
"""

from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase

from matching.models import JobPost, JobSlot
from matching.tests.base import MatchingTestBase

User = get_user_model()

TOMORROW = None  # set tại setUp (lấy ngày VN)


class JobCreateTest(MatchingTestBase):
    def setUp(self):
        super().setUp()
        from django.utils import timezone as tz
        self.parent = User.objects.create_user('jp', password='x', role='parent')
        self.worker = User.objects.create_user('jw', password='x', role='worker',
                                               is_approved=True)
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=self.parent)
        from datetime import timedelta
        self.tomorrow = (tz.localdate() + timedelta(days=1)).isoformat()

    def test_tutoring_skill_subject_accepted(self):
        """AC tổng: môn 'MC' hoặc 'Kỹ năng sống' được chấp nhận (rule 5)."""
        for subject in ('MC', 'Kỹ năng sống'):
            resp = self.client.post('/api/matching/jobs/', {
                'job_type': 'tutoring', 'subject': subject,
                'specific_requirements': 'Cho bé tự tin hơn',
                'dates': [self.tomorrow], 'time_from': '19:00', 'time_to': '21:00',
                'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 120000,
            }, format='json')
            self.assertEqual(resp.status_code, 201, resp.json())
            self.assertEqual(resp.json()['job_type'], 'tutoring')

    def test_missing_required_field_400(self):
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'tutoring',
            'dates': [self.tomorrow], 'time_from': '19:00', 'time_to': '21:00',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 100000,
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_childcare_needs_duties(self):
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'childcare', 'child_age_group': 'preschool',
            'number_of_children': 2, 'care_duties': [],
            'specific_requirements': 'Biết nấu cháo',
            'dates': [self.tomorrow], 'time_from': '08:00', 'time_to': '17:00',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 100000,
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_childcare_full_payload_201(self):
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'childcare', 'child_age_group': 'preschool',
            'number_of_children': 2, 'care_duties': ['feed', 'play'],
            'medical_allergy_notes': 'Dị ứng hải sản',
            'specific_requirements': 'Biết nấu cháo',
            'dates': [self.tomorrow], 'time_from': '08:00', 'time_to': '17:00',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 100000,
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.json())

    def test_past_date_rejected(self):
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'tutoring', 'subject': 'Toán',
            'specific_requirements': 'Lớp 5',
            'dates': ['2020-01-01'], 'time_from': '19:00', 'time_to': '21:00',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 100000,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('quá khứ', str(resp.json()))

    def test_pickup_other_address_needs_destination(self):
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'pickup', 'school_or_pickup_place_name': 'TH Nguyễn Văn Cừ',
            'child_age_group': 'primary', 'number_of_children': 1,
            'pickup_dates': [self.tomorrow], 'pickup_time_from': '16:30',
            'pickup_time_to': '17:30', 'destination_type': 'other_address',
            'specific_requirements': 'Đón bé lớp 1',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 90000,
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('destination_location', str(resp.json()))

    def test_pickup_full_201(self):
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'pickup', 'school_or_pickup_place_name': 'TH Nguyễn Văn Cừ',
            'child_age_group': 'primary', 'number_of_children': 1,
            'pickup_dates': [self.tomorrow], 'pickup_time_from': '16:30',
            'pickup_time_to': '17:30', 'destination_type': 'parent_home',
            'specific_requirements': 'Đón bé lớp 1',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 90000,
        }, format='json')
        self.assertEqual(resp.status_code, 201, resp.json())

    def test_worker_cannot_create(self):
        from rest_framework.test import APIClient
        c = APIClient()
        c.force_authenticate(user=self.worker)
        resp = c.post('/api/matching/jobs/', {'job_type': 'tutoring'}, format='json')
        self.assertEqual(resp.status_code, 403)

    def test_tutoring_gender_notice(self):
        """Step 11.4: gender preference cho tutoring → bỏ qua + thông báo công bằng."""
        resp = self.client.post('/api/matching/jobs/', {
            'job_type': 'tutoring', 'subject': 'Toán',
            'specific_requirements': 'chỉ nhận nữ',
            'dates': [self.tomorrow], 'time_from': '19:00', 'time_to': '21:00',
            'latitude': 21.0, 'longitude': 105.8, 'hourly_rate_vnd': 100000,
            'gender_preference': 'female',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        # Thông báo công bằng hiển thị ngay (Step 11.4)
        self.assertEqual(resp.json().get('fairness_notice'),
                         'Để đảm bảo công bằng, yêu cầu giới tính không áp dụng cho việc gia sư.')
        # job không lưu gender preference
        job = JobPost.objects.get(pk=resp.json()['id'])
        self.assertEqual(job.gender_preference, '')
        # KHÔNG filter giới tính khi matching (rule-based parse không sinh gender)
        self.assertIsNone((job.ai_parse_result or {}).get('gender_preference'))


class JobPublishTest(MatchingTestBase):
    def setUp(self):
        super().setUp()
        from django.utils import timezone as tz
        from datetime import timedelta
        self.parent = User.objects.create_user('pp', password='x', role='parent')
        self.job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=150000,
            latitude=21.0, longitude=105.8,
            type_data={'subject': 'Toán lớp 5', 'specific_requirements': 'Kiên nhẫn',
                       '_dates': [(tz.localdate() + timedelta(days=1)).isoformat()],
                       'time_from': '19:00', 'time_to': '21:00', 'recurrence': {}})
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=self.parent)

    def test_publish_creates_slots_and_parses(self):
        """publish → ai_parsing → ai_parsed (fallback vì không có API key) + slots."""
        resp = self.client.post(f'/api/matching/jobs/{self.job.pk}/publish/')
        self.assertEqual(resp.status_code, 200, resp.json())
        body = resp.json()
        self.assertEqual(body['status'], 'ai_parsed')
        self.assertEqual(body['ai_parse_status'], 'fallback')  # môi trường test không AI
        self.assertEqual(body['slots_created'], 1)
        self.job.refresh_from_db()
        self.assertEqual(self.job.status, 'ai_parsed')
        self.assertTrue(self.job.slots.exists())
        slot = self.job.slots.first()
        self.assertEqual(slot.time_from, time(19, 0))

    def test_publish_extracts_mc_skill(self):
        """AI parse (rule-based fallback) ra skill 'mc' cho môn MC (AC tổng)."""
        from django.utils import timezone as tz
        from datetime import timedelta
        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=120000,
            latitude=21.0, longitude=105.8,
            type_data={'subject': 'MC', 'specific_requirements': 'Dạy kỹ năng MC',
                       '_dates': [(tz.localdate() + timedelta(days=1)).isoformat()],
                       'time_from': '19:00', 'time_to': '20:00', 'recurrence': {}})
        resp = self.client.post(f'/api/matching/jobs/{job.pk}/publish/')
        self.assertEqual(resp.status_code, 200)
        job.refresh_from_db()
        self.assertIn('mc', (job.ai_parse_result or {}).get('required_skills', []))

    def test_publish_twice_idempotent_slots(self):
        self.client.post(f'/api/matching/jobs/{self.job.pk}/publish/')
        self.client.post(f'/api/matching/jobs/{self.job.pk}/publish/')
        self.assertEqual(self.job.slots.count(), 1)

    def test_other_user_cannot_publish(self):
        from rest_framework.test import APIClient
        intruder = User.objects.create_user('intruder', password='x', role='parent')
        c = APIClient()
        c.force_authenticate(user=intruder)
        resp = c.post(f'/api/matching/jobs/{self.job.pk}/publish/')
        self.assertEqual(resp.status_code, 404)


class RuleBasedParserTest(MatchingTestBase):
    def setUp(self):
        super().setUp()
        self.parent = User.objects.create_user('rpp', password='x', role='parent')

    def test_urgency_and_safety_flags(self):
        from matching.services.gemini_service import rule_based_parse
        from django.utils import timezone as tz
        from datetime import timedelta
        job = JobPost.objects.create(
            parent=self.parent, job_type='pickup', hourly_rate_vnd=90000,
            type_data={'subject': 'Đón bé gấp ngày mai',
                       'specific_requirements': 'Đón bé lớp 1',
                       '_dates': [(tz.localdate() + timedelta(days=1)).isoformat()],
                       'time_from': '16:30', 'time_to': '17:30', 'recurrence': {}})
        result = rule_based_parse(job)
        self.assertEqual(result['urgency'], 'high')
        self.assertIn('child_involved', result['safety_flags'])
        # AI KHÔNG được đè job_type
        self.assertEqual(result['job_type'], 'pickup')

    def test_off_platform_payment_flagged(self):
        from matching.services.gemini_service import rule_based_parse
        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', hourly_rate_vnd=100000,
            title='Dạy kèm - trả tiền mặt ngoài app',
            type_data={'subject': 'Toán', 'specific_requirements': '',
                       '_dates': [], 'time_from': '19:00', 'time_to': '21:00',
                       'recurrence': {}})
        result = rule_based_parse(job)
        self.assertIn('off_platform_payment', result['safety_flags'])
        self.assertEqual(result['safety_severity'], 'high')
        self.assertTrue(result['needs_admin_review'])
