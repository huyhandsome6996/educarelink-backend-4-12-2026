"""
frontend/tests_chatbot_flow12_smoke.py — Smoke-check web cho Flow 1/2 (brief 5.6).

Brief yêu cầu: "bổ sung ít nhất test/smoke-check thủ công có ghi lại kết quả
cho chatbot.html và worker_chatbot.html". File này tự động hoá smoke-check đó:

  1. Hai trang web chatbot render 200 cho đúng vai trò (parent / worker).
  2. Source template chứa các marker UI Flow 1/2 bắt buộc:
     - chatbot.html: card BẢN NHÁP, 2 nút (publish + chỉnh sửa), modal chọn
       vị trí (geocode thất bại), gửi draft_job_id/lat/lng/pending payload.
     - worker_chatbot.html: card khai bận 1-tap, POST endpoint chuẩn blackouts,
       xử lý cờ merged (gộp lịch bận).
  3. Trang KHÔNG còn logic cũ đã bị xoá (addTaskCard / data.task ở chatbot).

Chạy: python manage.py test frontend.tests_chatbot_flow12_smoke --verbosity=2
"""

import re

from django.test import TestCase

from django.contrib.auth import get_user_model

User = get_user_model()


class ChatbotFlow12WebSmokeTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.parent = User.objects.create_user(
            username='web_parent', email='web_parent@example.com',
            password='pass12345!', role='parent',
            first_name='Web', last_name='Parent')
        cls.worker = User.objects.create_user(
            username='web_worker', email='web_worker@example.com',
            password='pass12345!', role='worker',
            first_name='Web', last_name='Worker')

    def _get_source(self, url_name):
        resp = self.client.get('/parent/chatbot/' if url_name == 'chatbot'
                               else '/worker/chatbot/')
        return resp

    def test_parent_chatbot_page_renders_200_for_parent(self):
        self.client.force_login(self.parent)
        resp = self.client.get('/parent/chatbot/')
        self.assertEqual(resp.status_code, 200)

    def test_worker_chatbot_page_renders_200_for_worker(self):
        self.client.force_login(self.worker)
        resp = self.client.get('/worker/chatbot/')
        self.assertEqual(resp.status_code, 200)

    def _template_source(self, template_name):
        from django.template.loader import get_template
        template = get_template(template_name)
        with open(template.origin.name, encoding='utf-8') as f:
            return f.read()

    def test_parent_chatbot_contains_flow12_markers(self):
        source = self._template_source('frontend/chatbot.html')

        # Card bản nháp + 2 nút theo brief 2.2
        self.assertIn('BẢN NHÁP — CHƯA ĐĂNG', source)
        self.assertIn('Xem & Chọn CarePartner Ngay', source)
        self.assertIn('Chỉnh sửa thông tin', source)
        self.assertIn('publishAndGoToCandidates', source)

        # Preview radar + gợi ý 0-match (brief 2.2.4)
        self.assertIn('preview_matched', source)
        self.assertIn('zero_match_hint', source)

        # Card + modal xác nhận vị trí trên bản đồ (brief 2.4)
        self.assertIn('Xác nhận vị trí trên bản đồ', source)
        self.assertIn('geocode/search', source)
        self.assertIn('pending_job_payload', source)

        # Gửi kèm draft_job_id mỗi lượt chat (idempotent)
        self.assertIn('draft_job_id', source)

    def test_worker_chatbot_contains_blackout_markers(self):
        source = self._template_source('frontend/worker_chatbot.html')

        # Card khai bận 1-tap (brief 3.1)
        self.assertIn('Xác nhận khai ngày bận', source)
        self.assertIn('confirmBlackoutAction', source)
        self.assertIn('/matching/carepartners/me/blackouts/', source)

        # Gộp lịch bận chồng lấn (brief 3.2)
        self.assertIn('merged', source)

    def test_parent_chatbot_has_no_dead_task_card_logic(self):
        """Dọn code chết (brief 4.1): UI web không còn renderer task cũ."""
        source = self._template_source('frontend/chatbot.html')
        self.assertNotIn('addTaskCard', source)
        self.assertNotRegex(source, r'data\.task\b')
