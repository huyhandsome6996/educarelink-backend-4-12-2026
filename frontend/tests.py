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

    def test_parent_home_in_progress_diary_link_targets_detail(self):
        """2026-09-15 — Nút 'Xem nhật ký ca' (task in_progress) phải trỏ tới
        trang CHI TIẾT /parent/care-diary/?task_id=... (trang detail tự hiển thị
        thông báo 'chưa có nhật ký' khi CP chưa ghi).

        Lỗi cũ: trỏ tới /parent/care-diary-history/?task_id=... — trang history
        không đọc param task_id nên phụ huynh không thấy nhật ký của ca đó."""
        resp = self.client.get('/parent/')
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode('utf-8')
        self.assertIn('/parent/care-diary/?task_id=', html)
        self.assertNotIn('/parent/care-diary-history/?task_id=', html)

    def test_parent_history_mood_map_covers_mobile_icons(self):
        """2026-09-15 — Trang history map đủ mood icon mobile gửi lên
        ('alert-circle', 'thumbs-up') — đồng bộ với trang chi tiết."""
        resp = self.client.get('/parent/care-diary-history/')
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode('utf-8')
        self.assertIn("'alert-circle'", html)
        self.assertIn("'thumbs-up'", html)


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
        """parent_tasks.html có nút Nhắn tin (entry point parent).

        2026-09-19 — Flow 1 ghép cặp rút gọn text nút trên danh sách thành
        'Nhắn tin'; text đầy đủ 'Nhắn tin với Carepartner' chuyển sang
        trang chi tiết task (/parent/task-detail/) — cả 2 entry đều phải sống."""
        resp = self.client.get('/parent/tasks/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "location.href='/chat/?task_id=")
        self.assertContains(resp, 'Nhắn tin')
        # Trang chi tiết task giữ text đầy đủ + nút chat
        resp2 = self.client.get('/parent/task-detail/')
        self.assertContains(resp2, 'Nhắn tin với Carepartner')
        self.assertContains(resp2, "location.href='/chat/?task_id=")

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

    def test_parent_task_detail_has_payment_button(self):
        """Flow 1 + cổng VietQR (2026-09-16): thanh toán chuyển sang bước
        pending_payment trên trang CHI TIẾT task — phụ huynh trả tiền qua
        QR PayOS TRƯỚC khi task vào in_progress.

        Thẻ in_progress trong danh sách parent_tasks chỉ còn Nhắn tin +
        Theo dõi (không nút thanh toán — tránh hiểu nhầm thu thêm tiền khi
        escrow đã giữPayment). Test bảo đảm: (1) trang chi tiết vẫn có nút
        Thanh toán dẫn /parent/payments/; (2) danh sách in_progress có nút
        Nhắn tin và KHÔNG còn nút thanh toán."""
        resp = self.client.get('/parent/task-detail/')
        self.assertEqual(resp.status_code, 200)
        content = resp.content.decode()
        self.assertIn('/parent/payments/?task_id=', content)
        self.assertIn('Thanh toán', content)
        # Danh sách parent_tasks: nhánh in_progress theo thiết kế Flow 1
        resp2 = self.client.get('/parent/tasks/')
        from .tests_n_chat_entry_points import _extract_status_branches
        branches = _extract_status_branches(resp2.content.decode())
        self.assertIn("location.href='/chat/?task_id=", branches['in_progress'])
        self.assertNotIn('/parent/payments/?task_id=', branches['in_progress'])

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

    def test_admin_dashboard_js_syntax_valid(self):
        """REGRESSION (bug QA vòng 4): JS trong admin-dashboard phải hợp lệ.

        Lỗi thật đã xảy ra: chèn 3 tab mới để thừa 1 dấu '}' → SyntaxError
        → TOÀN BỘ JS trang chết (không tương tác gì, bảng loading vô tận).
        Test trích JS và chạy node --check; đồng thời assert pattern lỗi
        cũ không quay lại.
        """
        import re
        import subprocess
        import tempfile
        import os

        resp = self.client.get('/admin-dashboard/')
        content = resp.content.decode()

        # Pattern lỗi cũ: return; } } else if — dấu } thừa giữa các case
        self.assertNotIn(
            'return;\n            }\n            } else if',
            content,
            'Phát hiện dấu } thừa trong switchTab — sẽ làm SyntaxError chết cả trang',
        )

        # Trích JS và syntax-check bằng node (bỏ qua nếu môi trường không có node)
        scripts = re.findall(r'<script>([\s\S]*?)</script>', content)
        self.assertGreaterEqual(len(scripts), 1, 'Trang phải có <script>')
        js = '\n'.join(scripts)
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.js', delete=False, encoding='utf-8',
        ) as tmp:
            tmp.write(js)
            tmp_path = tmp.name
        try:
            r = subprocess.run(
                ['node', '--check', tmp_path],
                capture_output=True, text=True, timeout=30,
            )
            if r.returncode != 0:
                self.fail(f'JS admin-dashboard SYNTAX ERROR (chết cả trang): '
                          f'{r.stderr[:400]}')
        except FileNotFoundError:
            # node không có trong môi trường — bỏ qua phần check node,
            # pattern check phía trên vẫn chạy
            pass
        finally:
            os.unlink(tmp_path)


class SiteGateDisabledTests(TestCase):
    """Site gate phải TẮT mặc định (mở khoá công khai cho nộp sản phẩm).

    Huy yêu cầu 2026-08-23: xoá/khoá màn nhập mật khẩu để mọi người cùng
    truy cập. Middleware giữ nguyên nhưng mặc định disabled qua
    SITE_GATE_ENABLED (mặc định false khi không set env).
    Test KHÔNG set session bypass — vào thẳng trang phải thấy 200.
    """

    def test_home_accessible_without_gate(self):
        """Vào trang chủ KHÔNG bị redirect sang /site-gate/."""
        resp = self.client.get('/')
        self.assertNotEqual(resp.status_code, 302, 'Không được redirect')
        self.assertNotIn('site-gate', resp.get('Location', '') if resp.status_code == 302 else '')

    def test_login_page_accessible_without_gate(self):
        resp = self.client.get('/login/')
        self.assertEqual(resp.status_code, 200)

    def test_admin_dashboard_not_redirected_to_gate(self):
        resp = self.client.get('/admin-dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertNotEqual(resp.status_code, 302)

    def test_gate_enabled_still_works(self):
        """Bật lại SITE_GATE_ENABLED=true → redirect sang gate (công tắc
        hoạt động đúng chiều — không phá khả năng khoá lại sau demo)."""
        import os
        from django.test import override_settings
        # Middleware đọc env lúc __init__ — override qua client handler
        os.environ['SITE_GATE_ENABLED'] = 'true'
        try:
            client = self.client_class()
            resp = client.get('/login/')
            self.assertEqual(resp.status_code, 302)
            self.assertIn('/site-gate/', resp['Location'])
        finally:
            os.environ.pop('SITE_GATE_ENABLED', None)


class AdminDashboardUiUpgradeTests(TestCase):
    """2026-09-14 — Nâng cấp giao diện admin dashboard (glassmorphism).

    Chỉ "thay áo" visual: smoke test bảo đảm các cấu phần UI mới xuất hiện
    VÀ mọi cấu phần chức năng (id/onclick mà JS dashboard phụ thuộc) vẫn
    nguyên vẹn trong HTML."""

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def _get_dashboard(self):
        resp = self.client.get('/admin-dashboard/')
        self.assertEqual(resp.status_code, 200)
        return resp.content.decode('utf-8')

    def test_dashboard_glass_design_elements(self):
        html = self._get_dashboard()
        # Lucide icons CDN + nhóm điều hướng phân nhóm (label không phải .nav-item)
        self.assertIn('lucide.min.js', html)
        self.assertIn('nav-group-label', html)
        self.assertIn('Phê duyệt &amp; Vận hành', html)
        self.assertIn('H&#7879; th&#7889;ng AI &amp; An to&#224;n', html)

    def test_dashboard_keeps_all_12_tabs_in_order(self):
        """Đủ 12 tab đúng thứ tự — switchTab() dùng navItems[index]."""
        html = self._get_dashboard()
        import re
        order = re.findall(r"switchTab\('([a-z_]+)'\)", html)
        # Lọc trùng (mỗi tab 1 nav-item; switchTab cũng xuất hiện trong JS → chỉ đếm chỗ onclick)
        expected = ['pending', 'all', 'tasks', 'users', 'credentials',
                    'notifications', 'profile_changes', 'ai_chat',
                    'payments', 'tracking', 'feedback_stats', 'moderation']
        nav_order = [t for t in order if t in expected]
        # onclick trong sidebar: 12 tab đúng thứ tự (feedback_stats trước moderation)
        self.assertEqual(nav_order[:12], expected)

    def test_dashboard_functional_hooks_intact(self):
        """ID/hàm JS mà dashboard phụ thuộc phải còn nguyên."""
        html = self._get_dashboard()
        for hook in ['id="pendingBadge"', 'id="taskPendingBadge"', 'id="credentialBadge"',
                     'id="profileChangeBadge"', 'id="feedbackStatsBadge"', 'id="moderationBadge"',
                     'id="statPending"', 'id="statApproved"', 'id="statTotal"',
                     'id="pageTitle"', 'id="pageSubtitle"', 'id="tableTitle"', 'id="tableBody"',
                     'id="sidebar"', 'id="sidebarOverlay"', 'id="hamburgerBtn"',
                     'id="editModal"', 'id="photoModal"', 'id="notifModal"', 'id="credentialModal"',
                     'id="landingDetailModal"', 'id="aiChatPanel"', 'id="toast"', 'id="seedBtn"',
                     'onclick="seedDemoData()"', 'onclick="logoutAdmin()"', 'onclick="loadData()"',
                     'onclick="toggleSidebar()"', 'function switchTab(', 'function loadData(']:
            self.assertIn(hook, html)

    def test_dashboard_hides_ip_display(self):
        """2026-09-16 — KHÔNG hiển thị 'IP duy nhất' trên dashboard (IP chỉ
        lưu nội bộ; hiển thị ra khiến số truy cập trông nhỏ hơn thực tế)."""
        html = self._get_dashboard()
        self.assertNotIn('IP duy nhất', html)
        self.assertNotIn('unique_ips', html)
        # Thay bằng nhãn phạm vi đếm mới
        self.assertIn('Toàn website', html)

    def test_dashboard_tables_number_from_1_not_pk(self):
        """2026-09-16 — Bảng khảo sát & đăng ký đánh số STT từ 1 theo thứ tự
        hiển thị, không dùng ID pk (pk cũ bắt đầu từ 4/3 nhìn rất kỳ)."""
        html = self._get_dashboard()
        # 2 bảng (khảo sát + đăng ký) đều map kèm idx để in STT = idx + 1
        self.assertEqual(html.count('filtered.map((r, idx)'), 2)
        self.assertEqual(html.count('${idx + 1}'), 2)
        # Không còn chỗ nào in thẳng ID pk ra ô số thứ tự
        self.assertNotIn('>${r.id}</td>', html)


class LandingSurveyFullNameTests(TestCase):
    """2026-09-14 — Trường 'Họ và tên' bắt buộc trên form khảo sát /landing/."""

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_landing_renders_full_name_field(self):
        resp = self.client.get('/landing/')
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode('utf-8')
        self.assertIn('id="survey-fullname"', html)
        self.assertIn('field-survey-fullname', html)
        # required ở tầng HTML
        self.assertRegex(html, r'id="survey-fullname"[^>]*required')
        # label tiếng Việt
        self.assertIn('Họ và tên', html)

    def test_landing_survey_js_sends_full_name(self):
        """Payload JS phải gồm full_name trước khi POST /api/landing/survey/."""
        resp = self.client.get('/landing/')
        html = resp.content.decode('utf-8')
        self.assertIn("full_name: fullNameVal", html)
        self.assertIn("document.getElementById('survey-fullname')", html)


class NoCacheHTMLMiddlewareTests(TestCase):
    """2026-09-15 — Trang HTML luôn gửi 'Cache-Control: no-cache, must-revalidate'.

    Sau deploy, trình duyệt/tab mở từ trước đó phải nhận được bản HTML mới
    (fix: người dùng không thấy trường 'Họ và tên' vì trang cũ trong cache).
    """

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_landing_html_has_no_cache(self):
        resp = self.client.get('/landing/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Cache-Control'], 'no-cache, must-revalidate')

    def test_admin_dashboard_html_has_no_cache(self):
        resp = self.client.get('/admin-dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Cache-Control'], 'no-cache, must-revalidate')

    def test_api_json_not_touched(self):
        """API (JSON cho app mobile) không bị gắn header no-cache của HTML."""
        resp = self.client.get('/api/landing/survey/')
        self.assertIn(resp.status_code, (200, 400, 401, 405))
        ctype = resp.get('Content-Type', '')
        if ctype.startswith('application/json'):
            self.assertIsNone(resp.get('Cache-Control'))


class DonCuaToiPageTests(TestCase):
    """2026-09-27 (trước kỳ thi demo) — /don-cua-toi/ KHÔNG redirect auth
    phía server.

    Lỗi prod: DonCuaToiView.dispatch check request.user.is_authenticated,
    nhưng web auth bằng JWT ở localStorage (Django request.user luôn
    anonymous) → luôn redirect /login/?next=/don-cua-toi/ → login page
    JS thấy token lại đẩy về /don-cua-toi/ → VÒNG LẶP REDIRECT VÔ HẠN
    khi CarePartner đã đăng nhập bấm 'Việc của tôi' trên bottom nav.
    """

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_anonymous_gets_200_not_redirect(self):
        """Anonymous → 200 HTML (không 302 về /login/)."""
        resp = self.client.get('/don-cua-toi/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('text/html', resp['Content-Type'])
        self.assertContains(resp, 'Đơn ghép cặp của tôi')

    def test_page_has_client_side_jwt_guard(self):
        """Trang phải tự guard bằng JWT client-side (quy ước worker_jobs)."""
        resp = self.client.get('/don-cua-toi/')
        self.assertContains(resp, "localStorage.getItem('token')")
        self.assertContains(resp, "next=/don-cua-toi/")


class AIJobPostingFlow1UpgradeTests(TestCase):
    """2026-09-27 — "Nhờ AI đăng việc hộ" nâng cấp theo luồng ghép cặp Flow 1.

    - chatbot.html: card tin đăng JobPost mới (badge 3 dịch vụ + radar pulse)
      + CTA "Xem ứng viên đề xuất" → /ung-vien/<job_id>/
    - Chip gợi ý KHÔNG còn nhắc dịch vụ đã ngừng (dọn dẹp)
    - parent_home.html: mô tả card AI đúng hành vi mới
    - tracking.html: chuông cảnh báo = còi hú thật (police_siren) lặp liên tục
      + phụ huynh acknowledge được alert từ web
    - _worker_chrome.html: include heartbeat trong ca cho CP làm trên web
    """

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    def test_chatbot_page_has_job_card_for_flow1(self):
        """chatbot.html có addJobCard + CTA vào trang ứng viên radar."""
        resp = self.client.get('/parent/chatbot/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'function addJobCard')
        self.assertContains(resp, 'Xem ứng viên đề xuất')
        self.assertContains(resp, '/ung-vien/')

    def test_chatbot_page_job_card_type_map_only_3_types(self):
        """Card mới map đúng 3 job_type — không còn map 8 danh mục cũ làm chính."""
        resp = self.client.get('/parent/chatbot/')
        self.assertContains(resp, 'tutoring:')
        self.assertContains(resp, 'childcare:')
        self.assertContains(resp, 'pickup:')

    def test_chatbot_suggestion_chip_no_locked_service(self):
        """Chip gợi ý không còn 'dọn dẹp' (dịch vụ đã ngừng nhận đăng)."""
        resp = self.client.get('/parent/chatbot/')
        self.assertNotContains(resp, 'Cần người dọn dẹp nhà cuối tuần')
        self.assertContains(resp, 'Cần người trông trẻ cuối tuần')

    def test_parent_home_ai_card_copy_matches_flow1(self):
        """Card 'Nhờ AI đăng việc hộ' ở trang chủ mô tả đúng hành vi mới."""
        resp = self.client.get('/parent/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'Nhờ AI đăng việc hộ')

    def test_tracking_page_alarm_uses_real_siren_file(self):
        """/parent/tracking/ dùng police_siren.mp3 (không còn chỉ oscillator 30s)."""
        resp = self.client.get('/parent/tracking/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'police_siren.mp3')
        self.assertContains(resp, 'function primeSiren')
        self.assertContains(resp, 'acknowledgeCurrentAlert')
        # Không còn auto-tắt 30s trong bản triggerAlarm mới
        self.assertNotContains(resp, 'Sau 30 giây tự dừng')

    def test_worker_chrome_includes_shift_heartbeat(self):
        """Worker chrome include heartbeat trong ca (chống báo động nhầm)."""
        resp = self.client.get('/worker/my-jobs/')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'js/worker_shift_heartbeat.js')
