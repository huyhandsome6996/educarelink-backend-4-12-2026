"""G17 — Guard chống đường dẫn cá nhân hardcode (regression guard).

Bối cảnh: scripts/g13_business_rules.py từng hardcode BASE = đường dẫn
tuyệt đối máy dev cá nhân (xem commit history) → script chết ngay trên mọi
máy khác (CI, sandbox QA, máy owner, Render). Guard này đảm bảo class lỗi
đó KHÔNG BAO GIỜ quay lại repo. (Docstring cố tình không chứa literal path
để guard quét được chính nó.)

Chạy độc lập (KHÔNG phụ thuộc cwd — tự suy ra gốc repo từ vị trí file):
    python scripts/check_no_hardcoded_paths.py        # exit 0 = sạch

Chạy trong test suite (đã wire):
    python manage.py test matching.tests.test_no_hardcoded_paths

Quét MỌI file do git track (fallback: walk tree nếu không có git), tìm 2 nhóm
pattern đường dẫn máy cá nhân:
    /home/<user>/     (Linux/macOS home directory)
    /Users/<user>/    (macOS home directory)
File binary và build output (.next, node_modules, .venv, __pycache__) bị bỏ qua.
"""
import os
import re
import subprocess
import sys

# Gốc repo tự suy ra: file nằm ở <root>/scripts/ → cha của cha = gốc repo.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PATTERNS = (
    re.compile(r'/home/[A-Za-z0-9_.-]+/'),
    re.compile(r'/Users/[A-Za-z0-9_.-]+/'),
)

# Thư mục build/thư viện không bao giờ là "nguồn sự thật" — bỏ khi walk fallback.
SKIP_DIRS = {
    '.git', 'node_modules', '.venv', 'venv', '.next', '__pycache__',
    '.expo', 'dist', 'build', 'staticfiles', 'media', 'private_media',
}
BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.wav', '.mp3', '.aac',
    '.zip', '.jar', '.apk', '.aab', '.pdf', '.docx', '.ttf', '.otf',
    '.pyc', '.pack', '.so', '.dylib', '.dll', '.db',
}
MAX_FILE_BYTES = 5 * 1024 * 1024  # bỏ qua file > 5MB (không phải source)


def _list_tracked_files(repo_root):
    """Liệt kê file do git track; fallback os.walk nếu không có git."""
    try:
        out = subprocess.run(
            ['git', 'ls-files', '-z'], cwd=repo_root,
            capture_output=True, timeout=30, check=True).stdout
        files = [f for f in out.decode('utf-8', 'replace').split('\0') if f]
        if files:
            return files
    except (subprocess.SubprocessError, OSError, FileNotFoundError):
        pass
    # Fallback: walk toàn cây (bỏ thư mục build/thư viện)
    files = []
    for dirpath, dirnames, filenames in os.walk(repo_root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            rel = os.path.relpath(os.path.join(dirpath, name), repo_root)
            files.append(rel)
    return files


def _is_binary(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in BINARY_EXTENSIONS:
        return True
    try:
        with open(path, 'rb') as fh:
            return b'\x00' in fh.read(8192)
    except OSError:
        return True


def find_violations(repo_root=REPO_ROOT):
    """Trả về list chuỗi '<file>:<dòng>: <nội dung>' vi phạm pattern."""
    violations = []
    for rel in _list_tracked_files(repo_root):
        path = os.path.join(repo_root, rel)
        if not os.path.isfile(path) or _is_binary(path):
            continue
        try:
            size = os.path.getsize(path)
            if size > MAX_FILE_BYTES:
                continue
            with open(path, encoding='utf-8', errors='replace') as fh:
                for lineno, line in enumerate(fh, 1):
                    for pat in PATTERNS:
                        if pat.search(line):
                            violations.append(
                                f'{rel}:{lineno}: {line.strip()[:120]}')
                            break
        except OSError:
            continue
    return violations


def main():
    violations = find_violations()
    if violations:
        print('G17 FAIL — tìm thấy đường dẫn cá nhân hardcode trong file '
              'git-tracked:')
        for v in violations:
            print(f'  {v}')
        print()
        print('Sửa bằng cách tự suy ra đường dẫn (os.path/pathlib từ __file__),')
        print('dùng biến môi trường có default an toàn, hoặc dùng đường dẫn')
        print('tương đối trong tài liệu. KHÔNG hardcode /home/<user>/ hay '
              '/Users/<user>/.')
        return 1
    print('G17 PASS — không có đường dẫn cá nhân hardcode trong file '
          'git-tracked.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
