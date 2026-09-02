"""
N — Test gating entry point chat THEO TỪNG NHÁNH TRẠNG THÁI.

QA vòng 1 phát hiện bug N-001 chính vì cách test cũ dùng assertContains
toàn trang: chuỗi "Nhắn tin với Carepartner" xuất hiện ở nhánh in_progress
nên test pass dù nhánh completed thiếu nút. File này parse source JS,
TÁCH TỪNG NHÁNH ĐIỀU KIỆN (if/else if theo status) rồi kiểm tra riêng —
không thể "ăn may" qua nhánh khác.

Chạy: python manage.py test frontend.tests_n_chat_entry_points --verbosity=2
"""

import re

from django.test import TestCase

from .tests import GATE_SESSION_KEY


def _extract_status_branches(source: str) -> dict:
    """Parse các nhánh `if/else if (t.status === '...')` từ JS template.

    Trả về {status: code_block}. Dùng regex brace-matching đơn giản vì
    các template render function trong dự án viết theo pattern thống nhất
    (`} else if (t.status === 'xxx') { actionHTML = \`...\`; }`).
    """
    branches = {}
    # Match: (t.status === 'in_progress') hoặc (task.status === 'completed')...
    pattern = re.compile(
        r"(?:}?\s*else\s+)?if\s*\(\s*[a-zA-Z_.]*status\s*===\s*'(\w+)'\s*\)\s*\{"
    )
    for m in pattern.finditer(source):
        status = m.group(1)
        # Brace-matching: tìm dấu } đóng đúng cấp của khối if
        depth = 1
        i = m.end()
        while i < len(source) and depth > 0:
            ch = source[i]
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
            i += 1
        branches[status] = source[m.end():i - 1]
    return branches


class ChatEntryPointGatingTests(TestCase):
    """Mỗi nhánh trạng thái task PHẢI có nút chat ở đúng nơi backend cho phép.

    Backend cho phép: in_progress (suốt ca) + completed (24h sau). Cancelled
    chat đóng ngay → KHÔNG cần nút.
    """

    def setUp(self):
        session = self.client.session
        session[GATE_SESSION_KEY] = True
        session.save()

    # ── WEB PARENT: parent_tasks.html ───────────────────────────────

    def test_web_parent_in_progress_branch_has_chat(self):
        """N-001 regression: nhánh in_progress có link /chat/."""
        resp = self.client.get('/parent/tasks/')
        branches = _extract_status_branches(resp.content.decode())
        self.assertIn('in_progress', branches, 'Template phải có nhánh in_progress')
        self.assertIn(
            '/chat/?task_id=', branches['in_progress'],
            'Nhánh in_progress parent_tasks phải có nút chat',
        )

    def test_web_parent_completed_branch_has_chat(self):
        """N-001: nhánh completed phải có nút chat (QA bắt được thiếu)."""
        resp = self.client.get('/parent/tasks/')
        branches = _extract_status_branches(resp.content.decode())
        self.assertIn('completed', branches, 'Template phải có nhánh completed')
        self.assertIn(
            '/chat/?task_id=', branches['completed'],
            'BUG N-001: nhánh completed parent_tasks thiếu nút chat (24h sau hoàn thành vẫn chat được)',
        )

    def test_web_parent_cancelled_branch_no_chat_required(self):
        """Cancelled: backend đóng chat ngay → không bắt buộc nút (và hiện
        tại không có — kiểm tra không có để khớp chính sách)."""
        resp = self.client.get('/parent/tasks/')
        branches = _extract_status_branches(resp.content.decode())
        if 'cancelled' in branches:
            self.assertNotIn('/chat/?task_id=', branches['cancelled'])

    # ── WEB WORKER: worker_jobs.html ────────────────────────────────

    def test_web_worker_accepted_branch_has_chat(self):
        """Worker web — task accepted (in_progress) có nút chat."""
        resp = self.client.get('/worker/my-jobs/')
        source = resp.content.decode()
        branches = _extract_status_branches(source)
        self.assertIn('accepted', branches)
        self.assertIn('/chat/?task_id=', branches['accepted'])

    def test_web_worker_completed_branch_has_chat(self):
        """Worker web — nhánh completed có nút chat (đã có sẵn, giữ regression)."""
        resp = self.client.get('/worker/my-jobs/')
        source = resp.content.decode()
        branches = _extract_status_branches(source)
        self.assertIn('completed', branches)
        self.assertIn('/chat/?task_id=', branches['completed'])

    # ── MOBILE: parse file JS trực tiếp (không có hạ tầng test JS runtime) ──

    MOBILE_FILES = {
        'parent_mobile': 'mobile/src/screens/Parent/MyTasksScreen.js',
        'worker_mobile': 'mobile/src/screens/Worker/MyJobsScreen.js',
    }

    def _read_mobile_source(self, key):
        import os
        from django.conf import settings
        path = os.path.join(str(settings.BASE_DIR), self.MOBILE_FILES[key])
        with open(path, encoding='utf-8') as f:
            return f.read()

    def _extract_jsx_condition_blocks(self, source: str) -> dict:
        """Parse các khối JSX điều kiện {cond && (...)} theo task status.

        MyTasksScreen: {task.status === 'in_progress' && (...)},
        MyJobsScreen: {app.status === 'accepted' && (app.task_status ===
        'completed') && (...)}. Dùng brace-matching trên khối điều kiện
        chứa chuỗi status quan tâm.
        """
        blocks = {}
        # Tìm mọi vị trí mở khối {<điều kiện> && ( — regex bắt TRỌN điều kiện
        # (có thể chứa && và ngoặc con như MyJobsScreen: {a === 'x' && (b === 'y') && (
        pattern = re.compile(r"\{([^{}]+)&&\s*\(")
        for m in pattern.finditer(source):
            cond = m.group(1)
            i = m.end() - 1  # vị trí dấu ( mở
            depth = 0
            start = i
            while i < len(source):
                if source[i] == '(':
                    depth += 1
                elif source[i] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            block = source[start:i + 1]
            # Phân loại theo điều kiện + trạng thái trong điều kiện
            for status in ('in_progress', 'completed', 'cancelled', 'open'):
                if f'status === \'{status}\'' in cond:
                    key = status
                    # MyJobsScreen: accepted + task_status completed → completed
                    if 'task_status' in cond and 'app.status' in cond:
                        key = 'worker_' + status
                    blocks.setdefault(key, []).append(block)
        return blocks

    def test_mobile_parent_in_progress_has_chat_button(self):
        """N-003: MyTasksScreen khối in_progress có navigate('Chat')."""
        source = self._read_mobile_source('parent_mobile')
        blocks = self._extract_jsx_condition_blocks(source)
        self.assertIn('in_progress', blocks, 'MyTasksScreen phải có khối in_progress')
        chat_found = any("navigate('Chat'" in b for b in blocks['in_progress'])
        self.assertTrue(
            chat_found,
            'BUG N-003: khối in_progress MyTasksScreen (parent mobile) thiếu nút chat',
        )

    def test_mobile_parent_completed_has_chat_button(self):
        """N-003: MyTasksScreen khối completed có navigate('Chat')."""
        source = self._read_mobile_source('parent_mobile')
        blocks = self._extract_jsx_condition_blocks(source)
        self.assertIn('completed', blocks, 'MyTasksScreen phải có khối completed')
        chat_found = any("navigate('Chat'" in b for b in blocks['completed'])
        self.assertTrue(
            chat_found,
            'BUG N-003: khối completed MyTasksScreen (parent mobile) thiếu nút chat (24h)',
        )

    def test_mobile_parent_chat_button_independent_of_tracking(self):
        """N-003 root cause: onPress của nút CHAT phải navigate('Chat')
        trực tiếp — không gọi checkConsent/đi qua LiveTracking.

        (Nút 'Theo dõi' cùng khối vẫn được phép dùng checkConsent — đó là
        nghiệp vụ tracking, không liên quan chat. Test chỉ soi onPress
        của từng nút chat riêng.)
        """
        source = self._read_mobile_source('parent_mobile')
        # Tìm onPress có navigate('Chat' — lấy ~90 ký tự từ onPress đến navigate
        chat_presses = re.findall(
            r"onPress=\{[^}]{0,90}?navigate\('Chat'",
            source, re.DOTALL,
        )
        self.assertGreaterEqual(
            len(chat_presses), 2,
            'MyTasksScreen phải có >= 2 nút chat (in_progress + completed)',
        )
        for press in chat_presses:
            self.assertNotIn(
                'checkConsent', press,
                'onPress nút chat không được phụ thuộc tracking consent',
            )

    def test_mobile_worker_completed_has_chat_button(self):
        """N-002: MyJobsScreen khối accepted+completed có navigate('Chat')."""
        source = self._read_mobile_source('worker_mobile')
        blocks = self._extract_jsx_condition_blocks(source)
        self.assertIn(
            'worker_completed', blocks,
            'MyJobsScreen phải có khối accepted + task_status completed',
        )
        chat_found = any("navigate('Chat'" in b for b in blocks['worker_completed'])
        self.assertTrue(
            chat_found,
            'BUG N-002: khối completed MyJobsScreen (worker mobile) thiếu nút chat (24h)',
        )

    def test_mobile_worker_in_progress_has_chat_button(self):
        """Worker mobile khối in_progress đã có nút chat (đầu N) — regression."""
        source = self._read_mobile_source('worker_mobile')
        # Nút chat in_progress nằm trong khối showTrackingUI && !== completed
        self.assertIn("navigate('Chat'", source)
        # Cụ thể: khối chatBtn đầu tiên (in_progress)
        chat_btn_blocks = [
            m for m in re.finditer(
                r"<TouchableOpacity\s+style=\{styles\.chatBtn\}[^>]*>.*?navigate\('Chat'",
                source, re.DOTALL,
            )
        ]
        self.assertGreaterEqual(
            len(chat_btn_blocks), 2,
            'MyJobsScreen phải có >= 2 nút chat (in_progress + completed)',
        )
