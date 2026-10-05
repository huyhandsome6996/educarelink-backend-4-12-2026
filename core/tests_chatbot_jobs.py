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
from matching.models import JobPost, JobSlot, CarePartnerBlackout
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


@GEMINI_KEY_REQUIRED
class ChatbotJobJsonRobustnessTests(TestCase):
    """Phòng vệ đầu ra Gemini: fences markdown, JSON flat, lỗi validate trả rõ."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_robust')
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    def _tomorrow(self):
        return (timezone.localdate() + datetime.timedelta(days=1)).isoformat()

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_fenced_json_inside_tag_still_parses(self, mock_gemini, mock_parse):
        """Gemini hay bọc ```json fences trong thẻ — vẫn parse được."""
        fenced = (
            "Chào anh/chị!\n\n<MATCHING_JOB_JSON>\n```json\n"
            '{"job_type": "tutoring", "hourly_rate_vnd": 150000, '
            '"location": "458 Minh Khai, Hà Nội", '
            '"type_data": {"subject": "Toán lớp 5", "dates": ["%s"], '
            '"time_from": "18:30", "time_to": "20:00"}}'
            "\n```\n</MATCHING_JOB_JSON>"
        ) % self._tomorrow()
        mock_gemini.return_value = (_gemini_text(fenced), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {'message': 'cần gia sư', 'history': []},
                                format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['type'], 'job_created')
        self.assertTrue(JobPost.objects.filter(parent=self.parent).exists())

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_flat_payload_without_type_data_nested(self, mock_gemini, mock_parse):
        """AI đặt field type_data FLAT ở top-level → tự gom về type_data."""
        flat = (
            "<MATCHING_JOB_JSON>"
            '{"job_type": "tutoring", "hourly_rate_vnd": 150000, '
            '"location": "458 Minh Khai, Hà Nội", "subject": "Toán lớp 5", '
            '"dates": ["%s"], "time_from": "18:30", "time_to": "20:00"}'
            "</MATCHING_JOB_JSON>"
        ) % self._tomorrow()
        mock_gemini.return_value = (_gemini_text(flat), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {'message': 'cần gia sư', 'history': []},
                                format='json')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        job = JobPost.objects.get(pk=data['job']['id'])
        self.assertEqual(job.type_data.get('subject'), 'Toán lớp 5')

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_validation_failure_returns_specific_errors(self, mock_gemini):
        """Thiếu/sai dữ liệu → clarification kèm lỗi cụ thể từng field."""
        bad = (
            "<MATCHING_JOB_JSON>"
            '{"job_type": "childcare", "hourly_rate_vnd": 100000, "location": "Q1", '
            '"type_data": {"child_age_group": "sai_nhom", "dates": ["%s"], '
            '"time_from": "08:00", "time_to": "17:00"}}'
            "</MATCHING_JOB_JSON>"
        ) % self._tomorrow()
        mock_gemini.return_value = (_gemini_text(bad), 'gemini-2.5-flash-lite')

        resp = self.client.post('/api/chatbot/', {'message': 'cần trông trẻ', 'history': []},
                                format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'clarification')
        # Lỗi cụ thể hiện trong phản hồi (care_duties + number_of_children thiếu, nhóm tuổi sai)
        self.assertIn('Thông tin cần bổ sung', data['response'])
        self.assertFalse(JobPost.objects.exists())


@GEMINI_KEY_REQUIRED
class LegacyTaskJsonConversionTests(TestCase):
    """Model thỉnh thoảng vẫn xuất <TASK_JSON> schema cũ → CHUYỂN ĐỔI thành
    JobPost Flow 1 thay vì bỏ lỡ tin đăng (chống hồi quy về luồng cũ)."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_legacy')
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_legacy_tutoring_task_json_converted_to_jobpost(self, mock_gemini, mock_parse):
        tomorrow = (timezone.localdate() + datetime.timedelta(days=1)).isoformat()
        legacy = (
            'Em sẽ tạo ngay!\n<TASK_JSON>{"category": 1, "title": "Gia sư Toán lớp 5", '
            '"description": "Dạy ôn thi", "location": "458 Minh Khai, Hà Nội", '
            '"scheduled_time": "' + tomorrow + 'T18:30:00+07:00", "price": 200000}</TASK_JSON>'
        )
        mock_gemini.return_value = (_gemini_text(legacy), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {'message': 'cần gia sư', 'history': []},
                                format='json')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # KHÔNG còn tạo core.Task — mà tạo JobPost Flow 1 luôn
        self.assertEqual(data['type'], 'job_created')
        self.assertFalse(Task.objects.filter(parent=self.parent).exists())
        job = JobPost.objects.get(pk=data['job']['id'])
        self.assertEqual(job.job_type, 'tutoring')
        # price tổng 200000 / 2h → 100.000đ/giờ
        self.assertEqual(job.hourly_rate_vnd, 100000)
        self.assertEqual(job.slots.count(), 1)
        slot = job.slots.first()
        self.assertEqual(slot.time_from.hour, 18)
        self.assertEqual(slot.time_to.hour, 20)

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_legacy_childcare_task_json_converted(self, mock_gemini, mock_parse):
        tomorrow = (timezone.localdate() + datetime.timedelta(days=1)).isoformat()
        legacy = (
            '<TASK_JSON>{"category": 4, "title": "Trông bé 2 tuổi", '
            '"description": "x", "location": "Q1", '
            '"scheduled_time": "' + tomorrow + 'T08:00:00+07:00", "price": 400000}</TASK_JSON>'
        )
        mock_gemini.return_value = (_gemini_text(legacy), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {'message': 'cần trông trẻ', 'history': []},
                                format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        job = JobPost.objects.get(pk=data['job']['id'])
        self.assertEqual(job.job_type, 'childcare')
        self.assertEqual(job.hourly_rate_vnd, 200000)  # 400k/2h
        self.assertTrue(job.type_data.get('enable_safety'))

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_legacy_locked_category_still_not_created(self, mock_gemini):
        """Category 3 (dọn dẹp) — dịch vụ ngừng → không tạo gì, làm rõ."""
        legacy = ('<TASK_JSON>{"category": 3, "title": "Dọn dẹp", "description": "x", '
                  '"location": "Q1", "scheduled_time": "2026-10-01T08:00:00+07:00", '
                  '"price": 300000}</TASK_JSON>')
        mock_gemini.return_value = (_gemini_text(legacy), 'gemini-2.5-flash-lite')
        resp = self.client.post('/api/chatbot/', {'message': 'cần dọn nhà', 'history': []},
                                format='json')
        self.assertEqual(resp.json()['type'], 'clarification')
        self.assertFalse(JobPost.objects.exists())
        self.assertFalse(Task.objects.exists())


@GEMINI_KEY_REQUIRED
class PastDateHealingTests(TestCase):
    """Lớp chữa ngày server-side: AI tính sai 'ngày mai' theo mốc 2024 →
    ngày quá khứ tự dời sang ngày gần nhất cùng thứ trong tương lai."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_heal')
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_all_past_dates_healed_to_future_same_weekday(self, mock_gemini, mock_parse):
        # 'ngày mai' theo AI = 2024-05-17 (Thứ Sáu) — quá khứ hoàn toàn
        past = ("<MATCHING_JOB_JSON>"
                '{"job_type": "tutoring", "hourly_rate_vnd": 150000, '
                '"location": "458 Minh Khai, Hà Nội", '
                '"type_data": {"subject": "Toán lớp 5", "dates": ["2024-05-17"], '
                '"time_from": "18:30", "time_to": "20:00"}}'
                "</MATCHING_JOB_JSON>")
        mock_gemini.return_value = (_gemini_text(past), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {'message': 'cần gia sư', 'history': []},
                                format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        job = JobPost.objects.get(pk=data['job']['id'])
        slot = job.slots.first()
        today = timezone.localdate()
        # Slot phải ở tương lai và giữ nguyên thứ của ngày AI xuất ra (Thứ Sáu)
        self.assertGreaterEqual(slot.date, today)
        self.assertEqual(slot.date.weekday(), 4)  # Friday

    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_future_dates_not_touched(self, mock_gemini, mock_parse):
        future = (timezone.localdate() + datetime.timedelta(days=3)).isoformat()
        ok_json = ("<MATCHING_JOB_JSON>"
                   '{"job_type": "tutoring", "hourly_rate_vnd": 150000, '
                   '"location": "Hà Nội", '
                   '"type_data": {"subject": "Toán lớp 5", "dates": ["%s"], '
                   '"time_from": "18:30", "time_to": "20:00"}}'
                   "</MATCHING_JOB_JSON>") % future
        mock_gemini.return_value = (_gemini_text(ok_json), 'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/', {'message': 'cần gia sư', 'history': []},
                                format='json')
        job = JobPost.objects.get(pk=resp.json()['job']['id'])
        self.assertEqual(job.slots.first().date.isoformat(), future)


# ═══════════════════════════════════════════════════════════════════
# chatbot-fix-1 (2026-09-30) — test cho 9 mục fix Flow 1 + worker blackout
# ═══════════════════════════════════════════════════════════════════

@GEMINI_KEY_REQUIRED
class ChatbotRateFloorTests(TestCase):
    """M2 — sàn giá 50.000đ/giờ ở luồng MATCHING_JOB_JSON (khớp nhánh legacy)."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_rate_floor')
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_rate_below_50000_returns_clarification_no_job(self, mock_gemini):
        """30k/g từng được tạo thực tế (E2E 6d-1) — giờ phải clarification + 0 JobPost."""
        low = ("<MATCHING_JOB_JSON>"
               '{"job_type": "tutoring", "hourly_rate_vnd": 30000, '
               '"location": "458 Minh Khai, Hà Nội", '
               '"type_data": {"subject": "Toán lớp 5", "dates": ["'
               + (timezone.localdate() + datetime.timedelta(days=1)).isoformat()
               + '"], "time_from": "18:30", "time_to": "20:00"}}'
               "</MATCHING_JOB_JSON>")
        mock_gemini.return_value = (_gemini_text(low), 'gemini-2.5-flash-lite')

        resp = self.client.post('/api/chatbot/',
                                {'message': 'cần gia sư 30k một giờ', 'history': []},
                                format='json')
        data = resp.json()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(data['type'], 'clarification')
        # Thông báo thân thiện nói rõ sàn 50.000đ/giờ
        self.assertIn('50.000', data['response'])
        self.assertFalse(JobPost.objects.exists())


@GEMINI_KEY_REQUIRED
class ChatbotBlankMessageGuardTests(TestCase):
    """M4 — tin nhắn rỗng/toàn trống bị chặn TRƯỚC khi chèn prefix ngày + gọi Gemini."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_blank')
        self.client.force_authenticate(user=self.parent)

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_blank_message_rejected_before_gemini(self, mock_gemini):
        # Trước fix: prefix ngày chèn trước làm message không bao giờ rỗng
        # → Gemini bị gọi oan với tin nhắn trắng (200).
        resp = self.client.post('/api/chatbot/', {'message': '   ', 'history': []},
                                format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.json())
        mock_gemini.assert_not_called()


@GEMINI_KEY_REQUIRED
class ChatbotHcmcFallbackWarningTests(TestCase):
    """H2 — rơi xuống fallback TP.HCM (không GPS client/profile, geocode fail)
    → response text phải có dòng cảnh báo 'TP.HCM' (toạ độ giữ nguyên hành vi)."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_hcmc_warn')
        self.parent.latitude, self.parent.longitude = None, None
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    @mock.patch('matching.api.geocode._cached_json', return_value=None)
    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_hcmc_fallback_adds_warning_to_response(self, mock_gemini, mock_parse,
                                                    mock_geo):
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON),
                                    'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        resp = self.client.post('/api/chatbot/',
                                {'message': 'cần gia sư', 'history': []}, format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        self.assertIn('TP.HCM', data['response'])
        job = JobPost.objects.get(pk=data['job']['id'])
        # Toạ độ giữ nguyên hành vi cũ: vẫn có fallback TP.HCM
        self.assertAlmostEqual(job.latitude, 10.762622, places=4)
        self.assertAlmostEqual(job.longitude, 106.660172, places=4)


@GEMINI_KEY_REQUIRED
class JobSchemaHardeningTests(TestCase):
    """H3+M1 — job_schema chặn until trước dates + cap 84 ngày cụ thể."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_schema')
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_recurrence_until_before_dates_returns_clarification(self, mock_gemini):
        """until <= max(dates) → ValidationError → clarification (không tạo job)."""
        tomorrow = (timezone.localdate() + datetime.timedelta(days=1)).isoformat()
        bad = ("<MATCHING_JOB_JSON>"
               '{"job_type": "tutoring", "hourly_rate_vnd": 120000, '
               '"location": "Hà Nội", "type_data": {"subject": "Toán lớp 5", '
               '"dates": ["%s"], "time_from": "18:30", "time_to": "20:00", '
               '"recurrence": {"pattern": "weekly", "weekdays": [%d], "until": "%s"}}}'
               "</MATCHING_JOB_JSON>") % (
            tomorrow, (timezone.localdate() + datetime.timedelta(days=1)).weekday(),
            timezone.localdate().isoformat())  # until = HÔM NAY < dates
        mock_gemini.return_value = (_gemini_text(bad), 'gemini-2.5-flash-lite')

        resp = self.client.post('/api/chatbot/',
                                {'message': 'cần gia sư lặp weekly', 'history': []},
                                format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'clarification')
        self.assertIn('until', data['response'])
        self.assertFalse(JobPost.objects.exists())

    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_100_dates_returns_clarification(self, mock_gemini):
        """>84 ngày cụ thể → ValidationError → clarification (không tạo job)."""
        import json as _json
        today = timezone.localdate()
        many_dates = [(today + datetime.timedelta(days=i)).isoformat()
                      for i in range(1, 101)]
        bad = ("<MATCHING_JOB_JSON>"
               '{"job_type": "tutoring", "hourly_rate_vnd": 120000, '
               '"location": "Hà Nội", "type_data": {"subject": "Toán lớp 5", '
               '"dates": %s, "time_from": "18:30", "time_to": "20:00"}}'
               "</MATCHING_JOB_JSON>") % _json.dumps(many_dates)
        mock_gemini.return_value = (_gemini_text(bad), 'gemini-2.5-flash-lite')

        resp = self.client.post('/api/chatbot/',
                                {'message': 'cần gia sư 100 ngày', 'history': []},
                                format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'clarification')
        self.assertIn('84', data['response'])
        self.assertFalse(JobPost.objects.exists())


@GEMINI_KEY_REQUIRED
class PublishZeroSlotsTests(TestCase):
    """H3 — publish parse "xong" mà 0 JobSlot → phải ai_failed, không ai_parsed."""

    def setUp(self):
        self.parent = _make_parent('parent_zero_slot')

    @mock.patch('matching.api.jobs.parse_job_post')
    def test_publish_without_slots_transitions_to_ai_failed(self, mock_parse):
        from matching.api.jobs import publish_jobpost
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')

        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', title='Gia sư không lịch',
            hourly_rate_vnd=100000, latitude=20.9958, longitude=105.8672,
            type_data={'subject': 'Toán lớp 5', 'recurrence': {}},  # KHÔNG _dates
            recurrence={}, status=JobPostStatus.DRAFT)

        ok, payload = publish_jobpost(job, actor_user=self.parent)
        self.assertFalse(ok)
        self.assertEqual(payload['code'], 'ai_failed')
        job.refresh_from_db()
        self.assertEqual(job.status, JobPostStatus.AI_FAILED)
        self.assertEqual(job.slots.count(), 0)


@GEMINI_KEY_REQUIRED
class JobPostScheduleSlotsCountTests(TestCase):
    """L1 — get_schedule đếm JobSlot (job_schema đã pop dates khỏi type_data)."""

    def setUp(self):
        self.parent = _make_parent('parent_schedule')

    def _job_with_slots(self, n):
        from datetime import time as dtime
        first_day = timezone.localdate() + datetime.timedelta(days=1)
        job = JobPost.objects.create(
            parent=self.parent, job_type='tutoring', title='Gia sư Toán lớp 5',
            hourly_rate_vnd=100000, latitude=20.9958, longitude=105.8672,
            type_data={'subject': 'Toán lớp 5', 'time_from': '18:30',
                       'time_to': '20:00'},
            recurrence={}, status=JobPostStatus.AI_PARSED)
        for i in range(n):
            JobSlot.objects.create(
                job=job, date=first_day + datetime.timedelta(days=i),
                time_from=dtime(18, 30), time_to=dtime(20, 0))
        return job

    def test_multiple_slots_show_buoi_suffix(self):
        from matching.api.jobs import JobPostSerializer
        job = self._job_with_slots(2)
        self.assertEqual(JobPostSerializer(job).data['schedule'],
                         '18:30 - 20:00 (2 buổi)')

    def test_single_slot_keeps_plain_range(self):
        from matching.api.jobs import JobPostSerializer
        job = self._job_with_slots(1)
        self.assertEqual(JobPostSerializer(job).data['schedule'], '18:30 - 20:00')


@GEMINI_KEY_REQUIRED
class ChatbotRadarPreviewTests(TestCase):
    """P1 (spec §2.B) — ngay sau publish: total_matched + preview top 3 trong
    response job_created; radar lỗi KHÔNG được làm hỏng response."""

    def setUp(self):
        self.client = APIClient()
        self.parent = _make_parent('parent_radar')
        self.parent.latitude, self.parent.longitude = 20.9958, 105.8672
        self.parent.save(update_fields=['latitude', 'longitude'])
        self.client.force_authenticate(user=self.parent)

    @staticmethod
    def _fake_radar():
        return {
            'total_matched': 12,
            'candidates': [
                {'carepartner_id': 'u%d' % i, 'display_name': 'CP %d' % i,
                 'school': 'ĐH KHTN', 'rating': 4.8, 'distance_km': 1.5 + i,
                 'match_score': 95 - i, 'match_level': 'very_high'}
                for i in range(4)
            ],
        }

    @mock.patch('matching.services.matching_service.find_candidates')
    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_job_created_contains_total_matched_and_top3_preview(
            self, mock_gemini, mock_parse, mock_radar):
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON),
                                    'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')
        mock_radar.return_value = self._fake_radar()

        resp = self.client.post('/api/chatbot/',
                                {'message': 'cần gia sư', 'history': []}, format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        self.assertEqual(data['job']['total_matched'], 12)
        preview = data['job']['candidates_preview']
        self.assertEqual(len(preview), 3)  # top 3 dù radar trả 4
        for cand in preview:
            self.assertEqual(set(cand.keys()),
                             {'display_name', 'school', 'rating',
                              'distance_km', 'match_score'})
        self.assertEqual(preview[0]['display_name'], 'CP 0')
        # total_matched được persist lên job cho trang ứng viên dùng lại
        job = JobPost.objects.get(pk=data['job']['id'])
        self.assertEqual(job.total_matched, 12)

    @mock.patch('matching.services.matching_service.find_candidates')
    @mock.patch('matching.api.jobs.parse_job_post')
    @mock.patch('performance.gemini_model.generate_content_with_fallback')
    def test_radar_failure_still_returns_job_created(
            self, mock_gemini, mock_parse, mock_radar):
        mock_gemini.return_value = (_gemini_text(VALID_TUTORING_JSON),
                                    'gemini-2.5-flash-lite')
        mock_parse.return_value = (dict(FAKE_PARSE_RESULT), 'ok')
        mock_radar.side_effect = RuntimeError('radar down')

        resp = self.client.post('/api/chatbot/',
                                {'message': 'cần gia sư', 'history': []}, format='json')
        data = resp.json()
        self.assertEqual(data['type'], 'job_created')
        self.assertIsNone(data['job']['total_matched'])
        self.assertEqual(data['job']['candidates_preview'], [])
        # Job vẫn được tạo + publish bình thường
        job = JobPost.objects.get(pk=data['job']['id'])
        self.assertEqual(job.status, JobPostStatus.AI_PARSED)


@GEMINI_KEY_REQUIRED
class WorkerChatbotBlackoutTests(TestCase):
    """P1 (spec §3) — worker chatbot xuất BLACKOUT_ACTION_JSON → preview
    blackout_created (BACKEND KHÔNG GHI DB); validate ngày/reason/cap/trùng."""

    def setUp(self):
        self.client = APIClient()
        self.worker = _make_worker('worker_blackout')
        self.client.force_authenticate(user=self.worker)
        self.blackouts_before = CarePartnerBlackout.objects.count()

    def _post(self, message):
        return self.client.post('/api/worker/chatbot/',
                                {'message': message, 'history': []}, format='json')

    def _blackout_text(self, entries):
        import json as _json
        return ("Em đã ghi nhận lịch bận của anh/chị nhé!\n\n"
                "<BLACKOUT_ACTION_JSON>\n%s\n</BLACKOUT_ACTION_JSON>\n\n"
                "Anh/chị kiểm tra và xác nhận giúp em!") % _json.dumps(
                    entries, ensure_ascii=False)

    def test_valid_blackout_tag_returns_preview_without_db_write(self):
        d1 = (timezone.localdate() + datetime.timedelta(days=2)).isoformat()
        d2 = (timezone.localdate() + datetime.timedelta(days=5)).isoformat()
        text = self._blackout_text([
            {'date': d1, 'time_from': None, 'time_to': None,
             'reason': 'exam', 'note': 'Thi Giải tích 2 cả ngày'},
            {'date': d2, 'time_from': '18:30', 'time_to': '20:00',
             'reason': 'health', 'note': 'Khám răng'},
        ])
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (_gemini_text(text), 'gemini-2.5-flash-lite')
            resp = self._post('Tôi bận thi ngày %s và khám răng %s' % (d1, d2))

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['type'], 'blackout_created')
        self.assertEqual(len(data['blackouts']), 2)
        first = data['blackouts'][0]
        self.assertEqual(first['date'], d1)
        self.assertIsNone(first['time_from'])
        self.assertIsNone(first['time_to'])
        self.assertEqual(first['reason'], 'exam')
        self.assertEqual(first['reason_label_vi'], 'Thi / kiểm tra')
        self.assertEqual(first['note'], 'Thi Giải tích 2 cả ngày')
        second = data['blackouts'][1]
        self.assertEqual(second['time_from'], '18:30')
        self.assertEqual(second['reason_label_vi'], 'Sức khỏe')
        # JSON tag KHÔNG được lộ ra text hiển thị
        self.assertNotIn('BLACKOUT_ACTION_JSON', data['response'])
        # BACKEND KHÔNG GHI DB — preview-then-confirm
        self.assertEqual(CarePartnerBlackout.objects.count(), self.blackouts_before)

    def test_past_date_blackout_is_filtered(self):
        past = (timezone.localdate() - datetime.timedelta(days=1)).isoformat()
        future = (timezone.localdate() + datetime.timedelta(days=3)).isoformat()
        text = self._blackout_text([
            {'date': past, 'time_from': None, 'time_to': None,
             'reason': 'exam', 'note': 'quá khứ — phải bị lọc'},
            {'date': future, 'time_from': None, 'time_to': None,
             'reason': 'family', 'note': 'hợp lệ'},
        ])
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (_gemini_text(text), 'gemini-2.5-flash-lite')
            resp = self._post('Tôi bận')

        data = resp.json()
        self.assertEqual(data['type'], 'blackout_created')
        self.assertEqual(len(data['blackouts']), 1)
        self.assertEqual(data['blackouts'][0]['date'], future)
        self.assertEqual(CarePartnerBlackout.objects.count(), self.blackouts_before)

    def test_more_than_five_blackouts_capped(self):
        today = timezone.localdate()
        entries = [{'date': (today + datetime.timedelta(days=i + 1)).isoformat(),
                    'time_from': None, 'time_to': None,
                    'reason': 'personal', 'note': 'ngày %d' % i}
                   for i in range(7)]
        text = self._blackout_text(entries)
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (_gemini_text(text), 'gemini-2.5-flash-lite')
            resp = self._post('Tôi bận cả tuần tới')

        data = resp.json()
        self.assertEqual(data['type'], 'blackout_created')
        self.assertEqual(len(data['blackouts']), 5)  # cap tối đa 5 mục

    def test_unknown_reason_maps_to_other(self):
        future = (timezone.localdate() + datetime.timedelta(days=2)).isoformat()
        text = self._blackout_text([
            {'date': future, 'time_from': None, 'time_to': None,
             'reason': 'sick_leave_liên_mẫn', 'note': 'lý do lạ'},
        ])
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (_gemini_text(text), 'gemini-2.5-flash-lite')
            resp = self._post('Tôi bận')

        data = resp.json()
        self.assertEqual(data['type'], 'blackout_created')
        self.assertEqual(data['blackouts'][0]['reason'], 'other')
        self.assertEqual(data['blackouts'][0]['reason_label_vi'], 'Khác')

    def test_duplicate_date_deduplicated(self):
        future = (timezone.localdate() + datetime.timedelta(days=4)).isoformat()
        text = self._blackout_text([
            {'date': future, 'time_from': '08:00', 'time_to': '10:00',
             'reason': 'exam', 'note': 'buổi sáng'},
            {'date': future, 'time_from': '19:00', 'time_to': '21:00',
             'reason': 'exam', 'note': 'trùng ngày — phải bị bỏ'},
        ])
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (_gemini_text(text), 'gemini-2.5-flash-lite')
            resp = self._post('Tôi bận 2 ca cùng ngày')

        data = resp.json()
        self.assertEqual(len(data['blackouts']), 1)
        self.assertEqual(data['blackouts'][0]['time_from'], '08:00')

    def test_plain_message_stays_message(self):
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (
                _gemini_text('• Để tăng sao đánh giá, anh/chị nên phản hồi nhanh trong 15 phút.'),
                'gemini-2.5-flash-lite')
            resp = self._post('Làm sao tăng đánh giá?')

        data = resp.json()
        self.assertEqual(data['type'], 'message')
        self.assertIn('tăng sao', data['response'])
        self.assertEqual(CarePartnerBlackout.objects.count(), self.blackouts_before)

    def test_tag_with_zero_valid_items_stays_message(self):
        text = self._blackout_text([
            {'date': 'ngày-nào-đó', 'reason': 'exam'},  # sai format ngày
            {'date': (timezone.localdate() - datetime.timedelta(days=2)).isoformat(),
             'reason': 'exam', 'note': 'quá khứ'},
        ])
        with mock.patch('performance.gemini_model.generate_content_with_fallback') as mg:
            mg.return_value = (_gemini_text(text), 'gemini-2.5-flash-lite')
            resp = self._post('Tôi bận')

        data = resp.json()
        self.assertEqual(data['type'], 'message')
        self.assertNotIn('BLACKOUT_ACTION_JSON', data['response'])

    def test_non_worker_forbidden(self):
        parent = _make_parent('parent_worker_chatbot')
        client = APIClient()
        client.force_authenticate(user=parent)
        resp = client.post('/api/worker/chatbot/',
                           {'message': 'xin chào', 'history': []}, format='json')
        self.assertEqual(resp.status_code, 403)
