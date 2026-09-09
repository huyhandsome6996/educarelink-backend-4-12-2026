#!/usr/bin/env python
"""
QA verify 2026-09-10 (đợt 4) — ĐỒNG BỘ SIDEBAR/GIAO DIỆN MỌI TRANG PHỤ HUYNH THEO /parent/

Bối cảnh: /parent/ dùng Tailwind CDN v4 (đủ class), các trang khác dùng build CSS
v3 thiếu ~60 class mà sidebar Stitch dùng → sidebar "không đồng bộ".

Gate A — CSS build (tailwind-default.css + tailwind-radius-a.css) phải chứa ĐỦ
         mọi class của _parent_sidebar.html + _parent_chrome.html và bộ class
         sync mới (top-bar/bottom-nav chuẩn).
Gate B — Template: wrapper <aside> thống nhất lg:bg-surface lg:border-border,
         không còn lg:bg-white + border-gray-100; sidebar có .filled; bottom-nav
         chuẩn (nút Đăng việc tròn cam) ở mọi trang; tasks/chatbot/diary/profile
         đã đồng bộ; không còn icon 'school' + nav 768px cũ.
Gate C — Render Django Client từng URL user liệt kê (+ /parent/ tham chiếu):
         200, aside chuẩn, marker sidebar Stitch, active đúng 1 mục,
         bottom-nav chuẩn, node --check JS inline các trang vừa sửa JS.
"""

import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
os.chdir(BASE)

import django  # noqa: E402

django.setup()

from django.test import Client  # noqa: E402
from django.conf import settings  # noqa: E402

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" → {extra}" if extra and not cond else ""))


TPL_DIR = os.path.join(BASE, "frontend/templates/frontend")
STATIC_DIR = os.path.join(BASE, "frontend/static")

# =============================================================
# Gate A — CSS build chứa đủ class sidebar/chrome + class sync
# =============================================================
CLASS_RE = re.compile(r'class="([^"]+)"')
SELF_DEFINED = {"material-symbols-outlined", "fill-icon", "psb-scroll", "filled"}


def extract_classes(path):
    txt = open(path, encoding="utf-8").read()
    raw = []
    for m in CLASS_RE.finditer(txt):
        chunk = re.sub(r"\{%.*?%\}", " ", m.group(1))
        raw += chunk.split()
    return set(raw) - SELF_DEFINED


def css_escaped(cls):
    out = []
    for ch in cls:
        out.append(ch if (ch.isalnum() or ch in "-_") else "\\" + ch)
    return "".join(out)


def css_classes(css_text):
    return css_text


def css_has(css_text, cls):
    esc = re.escape(css_escaped(cls))
    return re.search(r"\." + esc + r"(?=[\[:,\s\)\{>])", css_text) is not None


# Class do đợt sync này đưa vào markup (top bar/bottom nav/mobile header tasks)
SYNC_CLASSES = [
    "px-3.5", "py-1.5", "w-7", "h-7", "mt-0.5", "text-[10px]",
    "bg-surface/95", "backdrop-blur-xl", "border-border", "shadow-lg",
    "text-textSecondary", "hover:text-textPrimary", "bg-orange-50",
    "text-primary", "bg-primary", "shadow-sm", "rounded-full", "rounded-xl",
    "hover:bg-orange-100", "border-orange-200", "border-gray-200/60",
    "border-gray-200/70", "hover:border-orange-200", "ring-surface", "ring-2",
    "bg-error", "bg-gray-50", "hover:bg-gray-100", "bg-primaryLight",
    "ring-primarySoft", "ring-1", "hover:bg-primaryDark",
]

for css_name in ["tailwind-default.css", "tailwind-radius-a.css"]:
    css_path = os.path.join(STATIC_DIR, "css", css_name)
    check(f"{css_name} tồn tại", os.path.exists(css_path))
    css_text = open(css_path, encoding="utf-8").read()
    check(f"{css_name} có marker SIDEBAR-SYNC-PATCH v1", "SIDEBAR-SYNC-PATCH v1" in css_text)

    missing = []
    for tpl in ["_parent_sidebar.html", "_parent_chrome.html"]:
        for cls in sorted(extract_classes(os.path.join(TPL_DIR, tpl))):
            if not css_has(css_text, cls):
                missing.append(f"{tpl}:{cls}")
    for cls in SYNC_CLASSES:
        if not css_has(css_text, cls):
            missing.append(f"sync:{cls}")
    check(f"{css_name} — 0 class thiếu cho sidebar/chrome/sync (tìm {len(missing)})",
          not missing, extra=", ".join(missing[:12]))

# =============================================================
# Gate B — Template source đồng bộ
# =============================================================
def read_tpl(name):
    return open(os.path.join(TPL_DIR, name), encoding="utf-8").read()


ASIDE_STANDARD = "lg:bg-surface lg:border-r lg:border-border lg:z-40"
ASIDE_OLD = "lg:bg-white lg:border-r lg:border-gray-100"
ASIDE_FILES = [
    "_parent_chrome.html", "parent_home.html", "parent_tasks.html",
    "chatbot.html", "help_center.html", "parent_candidate_profile.html",
    "parent_care_diary_detail.html", "parent_care_diary_history.html",
    "parent_task_detail.html", "parent_profile.html", "review.html",
    "browse_candidates.html", "task_create_1.html", "task_create_2.html",
]
all_tpl = "\n".join(read_tpl(f) for f in os.listdir(TPL_DIR) if f.endswith(".html"))

check("Không còn aside chuẩn cũ (lg:bg-white + border-gray-100)", ASIDE_OLD not in all_tpl)
for name in ASIDE_FILES:
    txt = read_tpl(name)
    check(f"{name} — aside chuẩn {ASIDE_STANDARD}", ASIDE_STANDARD in txt)

sb = read_tpl("_parent_sidebar.html")
check("_parent_sidebar.html — có định nghĩa .material-symbols-outlined.filled",
      ".material-symbols-outlined.filled" in sb)

BOTTOM_NAV_MARKER = 'w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center shadow-sm'
NAV_FILES = ["_parent_chrome.html", "parent_tasks.html", "chatbot.html",
             "parent_care_diary_history.html", "parent_care_diary_detail.html",
             "parent_profile.html"]
for name in NAV_FILES:
    check(f"{name} — bottom-nav chuẩn có nút 'Đăng việc' tròn cam", BOTTOM_NAV_MARKER in read_tpl(name))

pt = read_tpl("parent_tasks.html")
check("parent_tasks — mobile header brand (logo + EduCareLink)", 
      '<img src="/static/images/logo.png" alt="EduCareLink" class="h-8 w-8 rounded-lg object-contain">' in pt
      and 'Edu<span class="text-primary">Care</span>Link' in pt)
check("parent_tasks — mobile header có pill Ví credit + chuông",
      'title="Ví credit"' in pt and 'aria-label="Thông báo"' in pt)
check("parent_tasks — desktop top bar (Đăng việc nhanh + Lịch sử nhật ký + capsule tài khoản)",
      "Đăng việc nhanh" in pt and "Lịch sử nhật ký" in pt and 'id="header-avatar"' in pt)
check("parent_tasks — còn bộ lọc từ URL (applyInitialFilterFromUrl)", "applyInitialFilterFromUrl" in pt)
check("parent_tasks — không còn icon 'school' của header cũ", ">school<" not in pt)
check("parent_tasks — không còn h2 tiêu đề trùng top bar cũ",
      '<h2 class="font-headline font-bold text-2xl text-textPrimary">Việc của tôi</h2>' not in pt)

cb = read_tpl("chatbot.html")
check("chatbot — không còn nav mobile-nav-item tự chế", 'class="mobile-nav-item' not in cb)
d1 = read_tpl("parent_care_diary_history.html")
d2 = read_tpl("parent_care_diary_detail.html")
check("diary history/detail — không còn mobile-bottom-nav 768px cũ",
      "mobile-bottom-nav" not in d1 and "mobile-bottom-nav" not in d2
      and "767px" not in d1 and "767px" not in d2)

vc = read_tpl("vi_credit.html")
check("vi_credit — header bg-surface/border-border (đồng bộ token)",
      'class="bg-surface border-b border-border sticky top-0 z-40 backdrop-blur-md bg-surface/90 lg:ml-[260px]"' in vc)

# =============================================================
# Gate C — Render từng URL user liệt kê + tham chiếu
# =============================================================
c = Client()

# (url, label, active href kỳ vọng hoặc None, có bottom-nav chuẩn?)
PAGES = [
    ("/parent/", "Trang chủ (tham chiếu)", "/parent/", True),
    ("/parent/tasks/", "Việc của tôi", "/parent/tasks/", True),
    ("/parent/tasks/?filter=all", "Việc — filter=all", "/parent/tasks/", True),
    ("/parent/tasks/?status=open", "Việc — status=open", "/parent/tasks/", True),
    ("/parent/tasks/?status=in_progress", "Việc — status=in_progress", "/parent/tasks/", True),
    ("/parent/care-diary-history/", "Nhật ký chăm sóc (lịch sử)", "/parent/care-diary-history/", True),
    ("/vi-credit/", "Ví credit", "/vi-credit/", True),
    ("/parent/chatbot/", "AI Trợ lý", "/parent/chatbot/", True),
    ("/parent/profile/", "Cài đặt / Hồ sơ", "/parent/profile/", True),
    ("/dang-viec/", "Đăng việc — chọn loại", "/dang-viec/", True),
    ("/parent/create-1/", "Tạo việc bước 1 (radius-a)", "/dang-viec/", False),
    ("/parent/create-2/", "Tạo việc bước 2 (radius-a)", "/dang-viec/", False),
    ("/parent/task-detail/?task_id=1", "Chi tiết công việc", "/parent/tasks/", False),
    ("/parent/candidate-profile/?worker_id=1", "Hồ sơ CarePartner", "/parent/tasks/", False),
    ("/parent/browse-candidates/", "Xem ứng viên", "/parent/tasks/", False),
    ("/parent/review/", "Đánh giá", "/parent/tasks/", False),
    ("/parent/care-diary/?booking_id=1", "Nhật ký chi tiết", "/parent/care-diary-history/", False),
    ("/onboarding/parent/", "Hướng dẫn sử dụng", None, False),
]

ACTIVE_RE = re.compile(
    r'<a href="(?P<href>[^"]+)"[^>]*class="(?P<cls>[^"]*bg-orange-50/80[^"]*)"', re.S
)

contents = {}
for url, label, _exp, _nav in PAGES:
    r = c.get(url)
    contents[url] = r.content.decode("utf-8") if r.status_code == 200 else ""
    check(f"GET {url} → 200 ({label})", r.status_code == 200, f"status={r.status_code}")

MARKERS = {
    "brand": 'Edu<span class="text-[#F26522]">Care</span>Link',
    "logo": '<img src="/static/images/logo.png"',
    "badge_role": "Phụ huynh",
    "footer": 'data-purpose="sidebar-user-footer"',
    "logout": "Đăng xuất tài khoản",
}

for url, label, exp_href, nav in PAGES:
    html = contents[url]
    if not html:
        continue
    if url == "/onboarding/parent/":
        check("onboarding — không chứa sidebar (trang onboarding riêng)", 'data-purpose="sidebar-user-footer"' not in html)
        continue
    # aside chuẩn
    check(f"{url} — aside lg:bg-surface lg:border-border", ASIDE_STANDARD in html, extra="aside sai chuẩn")
    check(f"{url} — aside KHÔNG dùng bg-white cũ", "lg:bg-white lg:border-r lg:border-gray-100" not in html)
    # marker sidebar
    for key, marker in MARKERS.items():
        check(f"{url} — marker '{key}'", marker in html)
    # active đúng 1 mục
    actives = [m.groupdict() for m in ACTIVE_RE.finditer(html)]
    hrefs = [a["href"] for a in actives]
    check(f"{url} — active đúng mục {exp_href}", hrefs == [exp_href], extra=f"thấy {hrefs}")
    for a in actives:
        check(f"{url} — active có border-l-4 cam + chấm chỉ báo",
              "border-l-4" in a["cls"] and "border-[#F26522]" in a["cls"], extra=a["cls"][:120])
    # bottom nav chuẩn (nếu trang có)
    if nav:
        check(f"{url} — bottom-nav mobile chuẩn (nút Đăng việc tròn cam)", BOTTOM_NAV_MARKER in html)
        check(f"{url} — bottom-nav đúng 4 tab", 
              all(x in html for x in ['>Trang chủ</span>', '>Việc của tôi</span>', '>Đăng việc</span>', '>AI Trợ lý</span>']))

# vi_credit regression: Đăng việc KHÔNG active
vi = contents.get("/vi-credit/", "")
check("/vi-credit/ — 'Đăng việc ghép cặp' KHÔNG active",
      re.search(r'<a href="/dang-viec/"[^>]*class="[^"]*bg-orange-50/80', vi) is None)

# =============================================================
# Gate D — node --check JS inline các trang vừa sửa JS
# =============================================================
def node_check(html, label):
    scripts = re.findall(r"<script(?![^>]*src=)[^>]*>(.*?)</script>", html, re.S)
    ok = True
    errs = []
    for i, s in enumerate(scripts):
        if not s.strip():
            continue
        p = subprocess.run(["node", "--check", "-"], input=s.encode(), capture_output=True)
        if p.returncode != 0:
            ok = False
            errs.append(f"script#{i}: {p.stderr.decode()[:200]}")
    check(f"{label} — node --check toàn bộ JS inline ({len(scripts)} script)", ok, extra=" | ".join(errs))


for url in ["/parent/tasks/", "/parent/", "/parent/chatbot/", "/parent/care-diary-history/", "/vi-credit/", "/parent/profile/"]:
    if contents.get(url):
        node_check(contents[url], url)

# =============================================================
print("\n" + "=" * 60)
print(f"KẾT QUẢ: {len(PASS)} PASS / {len(FAIL)} FAIL")
print("=" * 60)
if FAIL:
    print("CÁC CHECK FAIL:")
    for f in FAIL:
        print("  -", f)
    sys.exit(1)
print("TOÀN BỘ PASS — sidebar/điều hướng đồng bộ 100% theo /parent/")
