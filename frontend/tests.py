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


class WebParityPagesTests(TestCase):
    """Parity web ↔ mobile — 4 trang mới + entry points + bug fix back button."""

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    # ── BUG FIX: back button chat (href set sớm, không đợi fetch) ──

    def test_chat_back_link_default_href_not_hash(self):
        """chat.html back-link phải có href mặc định THẬT (không '#') —
        QA vòng 3: task chưa có conversation → 404 → back giữ '#' → bấm
        không đi đâu (chỉ thêm # vào URL)."""
        resp = self.client.get('/chat/')
        # href mặc định trong HTML phải là /parent/tasks/ (initBackLink sẽ
        # đổi theo role ngay khi JS chạy — trước mọi await fetch)
        self.assertContains(resp, 'id="back-link" href="/parent/tasks/"')
        # initBackLink phải được gọi TRƯỚC fetch conversation (trong init,
        # trước mọi await)
        self.assertContains(resp, 'function initBackLink()')
        content = resp.content.decode()
        init_body = content[content.index('async function init()'):]
        self.assertLess(
            init_body.index('initBackLink();'),
            init_body.index('await authFetch'),
            'initBackLink() phải chạy trước await đầu tiên — nếu không, '
            'task 404/lỗi mạng sẽ giữ back-link href="#"',
        )

    # ── Trang thông báo (parity NotificationsScreen) ──

    def test_notifications_page_200(self):
        resp = self.client.get('/notifications/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])
        self.assertContains(resp, '/api/notifications/')
        self.assertContains(resp, 'mark-read')

    def test_bells_link_to_notifications(self):
        """Nút chuông parent_home + parent_tasks phải DẪN tới /notifications/
        (trước đây là nút chết — không có href)."""
        resp = self.client.get('/parent/')
        self.assertGreaterEqual(resp.content.decode().count('href="/notifications/"'), 2)
        resp2 = self.client.get('/parent/tasks/')
        self.assertContains(resp2, 'href="/notifications/"')

    # ── Trang khiếu nại worker (parity ComplaintScreen + MyComplaints) ──

    def test_worker_complaints_page_200(self):
        resp = self.client.get('/worker/complaints/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, '/api/moderation/complaints/')
        self.assertContains(resp, 'complaint-type')

    def test_worker_profile_has_complaints_and_earnings_links(self):
        """worker_profile menu có entry Khiếu nại + Thu nhập (parity mobile
        WorkerProfileScreen: MyComplaints + MyEarnings)."""
        resp = self.client.get('/worker/profile/')
        self.assertContains(resp, 'href="/worker/complaints/"')
        self.assertContains(resp, 'href="/worker/earnings/"')
        self.assertContains(resp, 'Khiếu nại')
        self.assertContains(resp, 'Thu nhập của tôi')

    # ── Trang thanh toán parent (parity PaymentSetupScreen) ──

    def test_parent_payments_page_200(self):
        resp = self.client.get('/parent/payments/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, '/api/payments/setup/')
        self.assertContains(resp, 'payos-setup')

    def test_parent_tasks_has_payment_button(self):
        """parent_tasks nhánh in_progress có nút Thanh toán (parity mobile
        MyTasksScreen handleSetupPayment)."""
        resp = self.client.get('/parent/tasks/')
        content = resp.content.decode()
        # Parse từng nhánh — nút phải ở nhánh in_progress
        from .tests_n_chat_entry_points import _extract_status_branches
        branches = _extract_status_branches(content)
        self.assertIn('/parent/payments/?task_id=', branches['in_progress'])

    # ── Trang thu nhập worker (parity MyEarnings + SettlementDetail) ──

    def test_worker_earnings_page_200(self):
        resp = self.client.get('/worker/earnings/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, '/api/payments/my-earnings/')
        self.assertContains(resp, '/api/payments/settlements/')

    # ── Admin 3 tab mới (parity AdminPayments/Tracking/Moderation mobile) ──

    def test_admin_dashboard_has_3_new_tabs(self):
        """admin_dashboard có nav + switchTab cases cho payments/tracking/
        moderation (parity mobile admin screens)."""
        resp = self.client.get('/admin-dashboard/')
        content = resp.content.decode()
        for tab in ('payments', 'tracking', 'moderation'):
            self.assertIn(f"switchTab('{tab}')", content,
                          f'Thiếu nav item tab admin {tab}')
            self.assertIn(f"tab === '{tab}'", content,
                          f'Thiếu switchTab case cho {tab}')
        # 3 hàm load phải tồn tại
        for fn in ('loadAdminPayments', 'loadAdminTracking', 'loadAdminModeration'):
            self.assertIn(f'function {fn}', content)
        # Actions: retry payout + override moderation
        self.assertIn('retry-payout', content)
        self.assertIn('override', content)

    def test_admin_nav_index_not_broken(self):
        """Nav items mới phải đứng SAU 8 tab cũ (index-based active state
        navItems[0..7] không được xê dịch) — kiểm tra thứ tự trong HTML."""
        resp = self.client.get('/admin-dashboard/')
        content = resp.content.decode()
        order = ['pending', 'all', 'tasks', 'users', 'credentials',
                 'notifications', 'profile_changes', 'ai_chat',
                 'payments', 'tracking', 'moderation']
        positions = [content.index(f"switchTab('{t}')") for t in order]
        self.assertEqual(positions, sorted(positions),
                         'Thứ tự nav items admin bị xáo trộn — index cũ sẽ sai')
