"""G17 — Regression guard chống đường dẫn cá nhân hardcode (Part 2.A4).

Lịch sử: scripts/g13_business_rules.py từng hardcode
'/home/z/my-project/repo-educarelink' → gate G13 chết trên mọi máy khác
máy dev gốc. Test này đảm bảo class bug đó không thể quay lại: nếu bất kỳ
file git-tracked nào chứa /home/<user>/ hay /Users/<user>/ thì test FAIL.

Logic quét dùng chung với scripts/check_no_hardcoded_paths.py
(chạy độc lập: python scripts/check_no_hardcoded_paths.py).
"""
import importlib.util
import os
import unittest

from django.test import SimpleTestCase

from matching.g13_checks import REPO_ROOT  # gốc repo, tự suy ra từ __file__

_GUARD_PATH = os.path.join(REPO_ROOT, 'scripts', 'check_no_hardcoded_paths.py')
_spec = importlib.util.spec_from_file_location('check_no_hardcoded_paths',
                                               _GUARD_PATH)
_guard = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_guard)


class NoHardcodedPathsTest(SimpleTestCase):
    """G17: không file git-tracked nào chứa đường dẫn máy cá nhân."""

    def test_guard_self_check(self):
        """Guard phải nhận diện được đúng pattern (sanity check)."""
        samples = ('/home/someuser/repo/x.py', '/Users/SomeOne/file.js')
        for sample in samples:
            self.assertTrue(
                any(pat.search(sample) for pat in _guard.PATTERNS),
                f'Guard phải khớp đường dẫn cá nhân: {sample}')
        # Không báo động oan cho đường dẫn tương đối/không phải home dir
        self.assertIsNone(_guard.PATTERNS[0].search('src/home/page.html'))
        self.assertIsNone(_guard.PATTERNS[1].search('docs/Users-guide.md'))

    def test_no_personal_paths_in_tracked_files(self):
        violations = _guard.find_violations(REPO_ROOT)
        self.assertEqual(
            violations, [],
            'G17 FAIL — phát hiện đường dẫn cá nhân hardcode '
            '(xem scripts/check_no_hardcoded_paths.py):\n' + '\n'.join(
                violations[:20]))


if __name__ == '__main__':
    unittest.main()
