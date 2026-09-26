r"""
core/tests_chatbot_jobs.py — Test "Nhờ AI đăng việc hộ" theo LUỒNG GHÉP CẶP MỚI.

2026-09-27: ChatbotAPIView được nâng cấp — thay vì tạo core.Task 'open' cũ
(luồng ứng tuyển đã đóng 403, 5/8 danh mục bị kiểm duyệt tự huỷ), AI giờ
trả <MATCHING_JOB_JSON> → backend tạo matching.JobPost + publish ngay
(ai_parsed + JobSlot) → radar quét đề xuất tối đa 8 Carepartner.

Chạy riêng:
  python manage.py test core.tests_chatbot_jobs --verbosity=2

Phạm vi:
  1. MATCHING_JOB_JSON hợp lệ → 200, type='job_created', JobPost được tạo
     + publish (ai_parsed) + tạo JobSlot, response trả job.id
  2. Dữ liệu AI sai/thiếu (job_type lạ, giá rác) → clarification, KHÔNG tạo job
  3. Hội thoại thường (không JSON) → type='message', không tạo gì
  4. Tàn dư TASK_JSON cũ → KHÔNG tạo core.Task nữa (clarification)
  5. Worker (không phải parent) gửi JSON → không tạo job
  6. publish_jobpost() dùng chung: gọi trực tiếp + endpoint publish vẫn đúng
  7. Toạ độ: client gửi lat/lng → dùng; không gửi → fallback (không crash)
"""

import datetime
from types import SimpleNamespace
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import User, Task
from matching.models import JobPost, JobSlot
from matching.constants import JobPostStatus

# View check GEMINI_API_KEY trước khi gọi Gemini — test set key giả để đi vào
# nhánh chính (Gemini thật được mock ở từng test).
GEMINI_KEY_REQUIRED = override_settings(GEMINI_API_KEY='test-gemini-key-for-unit-tests')


def _make_parent(username='parent_chatbot'):
    return User.objects.create_user(username=username, password='p', role='parent')


def _make_worker(username='worker_chatbot'):
    return User.objects.create_user(
        username=username, password='p', role='worker', is_approved=True)


def _gemini_text(ai_text):
    """Giả lập object trả về từ generate_content_with_fallback (chỉ cần .text)."""
    return SimpleNamespace(text=ai_text)


VALID_TUTORING_JSON = """
Chào phụ huynh! Em đã hiểu nhu cầu của mình.

<MATCHING_JOB_JSON>
{
  "job_type": "tutoring",
  "hourly_rate_vnd": 120000,
  "location": "458 Minh Khai, Hai Bà Trưng, Hà Nội",
  "enable_safety": false,
  "type_data": {
    "subject": "Toán lớp 5",
    "child_grade_level": "primary_grade_1_5",
    "tutor_seniority_preference": "no_preference",
    "dates": ["{date}"],
    "time_from": "18:30",
    "time_to": "20:00"
  }
}
</MATCHING_JOB_JSON>

Em tạo tin đăng ngay cho anh/chị nhé!
""".replace('{date}', (timezone.localdate() + datetime.timedelta(days=1)).isoformat())


FAKE_PARSE_RESULT = {
    'title_vi': 'Gia sư Toán lớp 5 tại Hà Nội',
    'summary_vi': 'Kèm Toán lớp 5, 2 buổi tối mỗi tuần.',
    'safety_severity': 'low',
    'clarification_questions': [],
}


@GEMINI_KEY_REQUIRED
class ChatbotJobCreationTests(TestCase):
    """AI trả MATCHING_JOB_JSON → tạo + publish matching.JobPost."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent()
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    def _post_chat(self, message='Tôi cần gia sư Toán lớp 5', history=None):
        return self.client.post('/api/chatbot/', {
            'message': message,
            'history': history or [],
        }, format='json')

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_matching_job_json_creates_and_publishes_jobpost(self, mock_gemini, mock_parse):
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self._post_chat()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        self.assertIn('job', data)
        self.assertTrue(str(data['job']['id']).strip())  # job.id không rỗng

        # JobPost tồn tại, thuộc parent, đã publish (ai_parsed)
        job = JobPost.objects.get(pk=data['job']['id'])
        self.assertEqual(job.parent, self.parent)
        self.assertEqual(job.job_type, 'tutoring')
        self.assertEqual(job.hourly_rate_vnd, 120000)
        self.assertEqual(job.status, JobPostStatus.AI_PARSED)
        self.assertEqual(job.ai_parse_status, 'ok')
        # Đã tạo slot từ dates + time
        self.assertEqual(job.slots.count(), 1)
        slot = job.slots.first()
        self.assertEqual(slot.time_from.hour, 18)
        self.assertEqual(slot.time_from.minute, 30)
        # Toạ độ ưu tiên từ hồ sơ user (đã set trong setUp)
        self.assertEqual(job.location_note, '458 Minh Khai, Hai Bà Trưng, Hà Nội')
        # enable_safety=false được lưu trong type_data
        self.assertFalse(job.type_data.get('enable_safety'))
        # KHÔNG tạo core.Task cũ
        self.assertFalse(Task.objects.filter(parent=self.parent).exists())

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_invalid_job_type_returns_clarification_no_job(self, mock_gemini):
        bad = ("Em chưa rõ lắm ạ\n<MATCHING_JOB_JSON>"
               '{"job_type": "cleaning", "hourly_rate_vnd": 100000, "type_data": {}}'
               "</MATCHING_JOB_JSON>")
        mock_gemini.return_value = (_gemini_text(bad), 'gemini-2.5-flash-lite')

        resp = self._post_chat()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['type'], 'clarification')
        self.assertFalse(JobPost.objects.exists())

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_bad_rate_returns_clarification(self, mock_gemini):
        bad = ("<MATCHING_JOB_JSON>"
               '{"job_type": "tutoring", "hourly_rate_vnd": "miễn phí", "type_data": {}}'
               "</MATCHING_JOB_JSON>")
        mock_gemini.return_value = (_gemini_text(bad), 'gemini-2.5-flash-lite')

        resp = self._post_chat()
        self.assertEqual(resp.json()['type'], 'clarification')
        self.assertFalse(JobPost.objects.exists())

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_plain_message_no_job(self, mock_gemini):
        mock_gemini.return_value = (
            _gemini_text('Chào anh/chị! Em có thể giúp đăng việc: gia sư, trông trẻ, đón trẻ.'),
            'gemini-2.5-flash-lite')
        resp = self._post_chat('Trợ lý là gì?')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['type'], 'message')
        self.assertFalse(JobPost.objects.exists())

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_legacy_task_json_does_not_create_task(self, mock_gemini):
        # Tàn dư prompt cũ — tuyệt đối không tạo core.Task 'open' nữa
        legacy = ('Em sẽ giúp nhé\n<TASK_JSON>{"category": 3, "title": "Dọn dẹp", '
                  '"description": "x", "location": "Q1", '
                  '"scheduled_time": "2026-10-01T08:00:00+07:00", "price": 200000}</TASK_JSON>')
        mock_gemini.return_value = (_gemini_text(legacy), 'gemini-2.5-flash-lite')

        resp = self._post_chat('Tôi cần người dọn dẹp nhà')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['type'], 'clarification')
        self.assertFalse(Task.objects.filter(parent=self.parent).exists())
        self.assertFalse(JobPost.objects.exists())

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_worker_role_never_creates_job(self, mock_gemini, mock_parse):
        worker = _make_worker()
        client = APIClient()
        client.force_authenticate(user=worker)
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON), 'gemini-2.5-flash-lite')

        resp = client.post('/api/chatbot/', {'message': 'Tôi cần gia sư'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['type'], 'message')
        self.assertFalse(JobPost.objects.exists())
        mock_parse.assert_not_called()

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_coordinates_fallback_without_client_gps(self, mock_gemini, mock_parse):
        # Không gửi lat/lng + profile không có toạ độ → vẫn tạo job (fallback), không crash
        self.parent.latitude, self.parent.longitude = None, None
        self.parent.save(update_fields=['latitude', 'longitude'])
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self._post_chat()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['type'], 'job_created')
        job = JobPost.objects.get(pk=resp.json()['job']['id'])
        self.assertIsNotNone(job.latitude)
        self.assertIsNotNone(job.longitude)

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_client_gps_overrides_profile(self, mock_gemini, mock_parse):
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {
            'message': 'Tôi cần gia sư Toán lớp 5',
            'history': [],
            'latitude': 16.4637,
            'longitude': 107.5909,
        }, format='json')
        job = JobPost.objects.get(pk=resp.json()['job']['id'])
        self.assertAlmostEqual(job.latitude, 16.4637)
        self.assertAlmostEqual(job.longitude, 107.5909)


@GEMINI_KEY_REQUIRED
class PublishJobPostSharedFunctionTests(TestCase):
    """publish_jobpost() dùng chung cho API + chatbot — state machine đúng."""

    def setUp(self):
        self.parent = _make_parent('parent_publish_fn')

    def _make_draft_job(self):
        tomorrow = timezone.localdate() + datetime.timedelta(days=1)
        return JobPost.objects.create(
            parent=self.parent, job_type='tutoring', title='Gia sư Toán lớp 5',
            hourly_rate_vnd=120000, latitude=20.9958, longitude=105.8672,
            location_note='458 Minh Khai',
            type_data={'subject': 'Toán lớp 5', 'specific_requirements': 'Dạy ôn thi',
                       '_dates': [tomorrow.isoformat()], 'time_from': '18:30',
                       'time_to': '20:00', 'recurrence': {}},
            recurrence={}, status=JobPostStatus.DRAFT)

    @mock.patch('matching.api.jobs.parse_job_post')
    def test_publish_jobpost_function_success(self, mock_parse):
        from matching.api.jobs import publish_jobpost
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        job = self._make_draft_job()
        ok, payload = publish_jobpost(job, actor_user=self.parent)

        self.assertTrue(ok)
        self.assertEqual(payload['id'], str(job.pk))
        job.refresh_from_db()
        self.assertEqual(job.status, JobPostStatus.AI_PARSED)
        self.assertEqual(job.title, 'Gia sư Toán lớp 5 tại Hà Nội')
        self.assertEqual(job.slots.count(), 1)

    @mock.patch('matching.api.jobs.parse_job_post')
    def test_publish_jobpost_function_parse_crash_falls_back(self, mock_parse):
        from matching.api.jobs import publish_jobpost
        mock_parse.side_effect = RuntimeError('gemini down')

        job = self._make_draft_job()
        ok, payload = publish_jobpost(job, actor_user=self.parent)

        # parse crash → nuốt exception → AI_FAILED (không raise treo chatbot)
        self.assertFalse(ok)
        self.assertEqual(payload['code'], 'ai_failed')
        job.refresh_from_db()
        self.assertEqual(job.status, JobPostStatus.AI_FAILED)

    @mock.patch('matching.api.jobs.parse_job_post')
    def test_publish_endpoint_still_works_after_refactor(self, mock_parse):
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')
        job = self._make_draft_job()

        client = APIClient()
        client.force_authenticate(user=self.parent)
        resp = client.post(f'/api/matching/jobs/{job.pk}/publish/')

        self.assertEqual(resp.status_code, 200)
        job.refresh_from_db()
        self.assertEqual(job.status, JobPostStatus.AI_PARSED)
