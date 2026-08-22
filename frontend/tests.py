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
