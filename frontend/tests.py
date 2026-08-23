r"""Test các trang web frontend — TemplateView trả đúng HTML.

Kiểm tra:
  - Mỗi trang trả 200 OK.
  - Response chứa HTML (content-type, <html>).
  - Không yêu cầu auth cho TemplateView (JS tự check JWT).
"""

from django.test import TestCase


# Session key dùng bởi SiteAccessGateMiddleware
GATE_SESSION_KEY = 'site_gate_passed'


class WebPageTests(TestCase):
    """Các trang web care diary trả 200 + chứa HTML."""

    def setUp(self):
        # Bỏ qua SiteAccessGateMiddleware trong test
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_worker_care_diary_form_200(self):
        """GET /worker/care-diary/ → 200, HTML."""
        resp = self.client.get('/worker/care-diary/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])
        self.assertContains(resp, 'Ghi nhật ký')

    def test_parent_care_diary_detail_200(self):
        """GET /parent/care-diary/ → 200, HTML."""
        resp = self.client.get('/parent/care-diary/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])
        self.assertContains(resp, 'Chi tiết nhật ký')

    def test_parent_care_diary_history_200(self):
        """GET /parent/care-diary-history/ → 200, HTML."""
        resp = self.client.get('/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])
        self.assertContains(resp, 'Lịch sử nhật ký')

    def test_worker_jobs_contains_diary_link(self):
        """worker_jobs.html chứa link Ghi nhật ký."""
        resp = self.client.get('/worker/my-jobs/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Ghi nhật ký')

    def test_parent_tasks_contains_diary_history_link(self):
        """parent_tasks.html chứa link Lịch sử nhật ký."""
        resp = self.client.get('/parent/tasks/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Lịch sử nhật ký')

    def test_parent_home_contains_diary_link(self):
        """parent_home.html chứa link Nhật ký chăm sóc trong sidebar."""
        resp = self.client.get('/parent/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Nhật ký chăm sóc')


class B5WebPageTests(TestCase):
    """B5 — trang tracking.html có phần tử xác minh ảnh cho phụ huynh."""

    def setUp(self):
        # Bỏ qua SiteAccessGateMiddleware trong test
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_tracking_page_200(self):
        """GET /parent/tracking/ → 200, HTML."""
        resp = self.client.get('/parent/tracking/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])

    def test_tracking_contains_photo_verification_elements(self):
        """tracking.html chứa: mô tả ảnh + modal xem ảnh + hàm viewVerificationPhoto."""
        resp = self.client.get('/parent/tracking/')
        self.assertContains(resp, 'chụp ảnh tại chỗ')
        self.assertContains(resp, 'verification-photo-modal')
        self.assertContains(resp, 'viewVerificationPhoto')
        self.assertContains(resp, 'closeVerificationPhotoModal')
        # History render có nút Xem ảnh + badge loại ảnh
        self.assertContains(resp, 'Xem ảnh')
        self.assertContains(resp, 'verification_type')


class NChatWebPageTests(TestCase):
    """N — Cửa sổ chat: trang chat + entry points parent/worker không mồ côi."""

    def setUp(self):
        # Bỏ qua SiteAccessGateMiddleware trong test
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_chat_page_200(self):
        """GET /chat/ → 200, HTML."""
        resp = self.client.get('/chat/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])

    def test_chat_page_contains_core_elements(self):
        """chat.html chứa: polling, composer, trạng thái cửa sổ, escapeHtml."""
        resp = self.client.get('/chat/')
        # Entry + polling + states
        self.assertContains(resp, 'POLL_INTERVAL_MS')
        self.assertContains(resp, 'message-input')
        self.assertContains(resp, 'window-open-badge')
        self.assertContains(resp, 'window-closed-badge')
        self.assertContains(resp, 'readonly-banner')
        # API endpoints đúng contract backend
        self.assertContains(resp, '/api/chat/conversations/')
        self.assertContains(resp, 'messages/send/')
        self.assertContains(resp, 'read/')

    def test_parent_tasks_contains_chat_link(self):
        """parent_tasks.html có nút Nhắn tin với Carepartner (entry point parent)."""
        resp = self.client.get('/parent/tasks/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "location.href='/chat/?task_id=")
        self.assertContains(resp, 'Nhắn tin với Carepartner')

    def test_worker_jobs_contains_chat_link(self):
        """worker_jobs.html có nút chat (entry point worker)."""
        resp = self.client.get('/worker/my-jobs/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "location.href='/chat/?task_id=")
        self.assertContains(resp, 'Nhắn tin phụ huynh')

    def test_tracking_message_button_links_chat(self):
        """tracking.html nút Nhắn dẫn sang /chat/ (không còn toast placeholder)."""
        resp = self.client.get('/parent/tracking/')
        self.assertContains(resp, "messageCarepartner")
        self.assertNotContains(resp, 'Tính năng nhắn tin đang phát triển')
