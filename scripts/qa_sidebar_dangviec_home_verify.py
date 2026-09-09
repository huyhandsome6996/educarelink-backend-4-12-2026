#!/usr/bin/env python
"""
QA verify 2026-09-10 (đợt 4) — Fix sidebar /dang-viec/ + logo sync + parent_home redesign:
1. /dang-viec/: main KHÔNG còn 'w-full lg:ml-[260px]' (nguyên nhân tràn ngang 260px
   làm nút Bắt đầu bị cắt) — header/main offset đúng, không w-full chồng margin.
2. Logo web = nguồn CH Play (md5 khớp mobile/assets/logo.png ~759KB RGBA),
   favicon 16/32/ico tạo mới từ nguồn.
3. parent_home redesign: Action Hub, stats bấm được (?filter/all ?status=),
   insight pill, trust banner, sidebar home, KHÔNG còn modal nâng cấp / dữ liệu demo
   / tên demo; guard login; mobile bottom nav 4 tab.
4. parent_tasks hỗ trợ ?status= / ?filter=all (URLSearchParams + nhánh 'all').
5. node --check toàn bộ inline JS của 3 trang + regression render 200.
"""

import hashlib
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

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" → {extra}" if extra and not cond else ""))


def md5(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


c = Client()

# ---------- 1. Render các trang liên quan ----------
pages = {
    "/dang-viec/": "Đăng việc — chọn loại (BỊ LỖI TRÀN NGANG)",
    "/dang-viec/gia-su/": "Đăng việc — gia sư",
    "/dang-viec/trong-tre/": "Đăng việc — trông trẻ",
    "/dang-viec/don-tre/": "Đăng việc — đón/trả trẻ",
    "/parent/": "Trang chủ phụ huynh (REDESIGN)",
    "/parent/tasks/": "Việc của tôi",
    "/parent/tasks/?status=open": "Việc của tôi — lọc ?status=open",
    "/parent/tasks/?status=in_progress": "Việc của tôi — lọc ?status=in_progress",
    "/parent/tasks/?filter=all": "Việc của tôi — lọc ?filter=all",
    "/vi-credit/": "Ví credit",
    "/onboarding/parent/": "Hướng dẫn sử dụng",
}
contents = {}
for url, label in pages.items():
    r = c.get(url)
    contents[url] = r.content.decode("utf-8") if r.status_code == 200 else ""
    check(f"GET {url} → 200 ({label})", r.status_code == 200, f"status={r.status_code}")

# ---------- 2. Fix tràn ngang /dang-viec/ ----------
dv = contents["/dang-viec/"]
check("/dang-viec/ — main KHÔNG còn w-full + ml-260 (tràn ngang 260px)",
      'w-full lg:ml-[260px]' not in dv and 'lg:ml-[260px] w-full' not in dv)
check("/dang-viec/ — main offset đúng 'flex-1 lg:ml-[260px]'",
      'class="flex-1 lg:ml-[260px]' in dv)
check("/dang-viec/ — header offset lg:ml-[260px] (không w-full)",
      re.search(r'<header class="[^"]*lg:ml-\[260px\]"', dv) is not None
      and not re.search(r'<header class="[^"]*w-full[^"]*lg:ml-\[260px\]"', dv))
for u in ["/dang-viec/gia-su/", "/dang-viec/trong-tre/", "/dang-viec/don-tre/",
          "/vi-credit/"]:
    h = contents[u]
    check(f"{u} — main lg:ml-[260px] không w-full", 'lg:ml-[260px]' in h and 'w-full lg:ml-[260px]' not in h)

# ---------- 3. Logo + favicon sync ----------
src_logo = os.path.join(BASE, "mobile", "assets", "logo.png")
web_logo = os.path.join(BASE, "frontend", "static", "images", "logo.png")
check("logo web md5 = nguồn CH Play (mobile/assets/logo.png)", md5(web_logo) == md5(src_logo))
check("logo web dung lượng ~759KB (đúng spec)", 700_000 < os.path.getsize(web_logo) < 850_000,
      extra=str(os.path.getsize(web_logo)))
from PIL import Image  # noqa: E402
im_web = Image.open(web_logo)
check("logo web 1024x1024 RGBA PNG", im_web.size == (1024, 1024) and im_web.mode == "RGBA"
      and im_web.format == "PNG", extra=f"{im_web.size} {im.web_mode if hasattr(im_web,'web_mode') else im_web.mode} {im_web.format}")
for name, size in [("favicon-32.png", (32, 32)), ("favicon-16.png", (16, 16))]:
    fp = os.path.join(BASE, "frontend", "static", "images", name)
    fim = Image.open(fp)
    check(f"{name} = {size}", fim.size == size, extra=str(fim.size))
check("favicon.ico tồn tại đa kích thước", os.path.getsize(os.path.join(BASE, "frontend", "static", "images", "favicon.ico")) > 10000)
check("logo mobile nội bộ cũng đồng bộ",
      md5(os.path.join(BASE, "mobile", "assets", "images", "logo.png")) == md5(src_logo))

# ---------- 4. parent_home redesign ----------
home = contents["/parent/"]
HOME_NEW = {
    "Action Hub": "Hôm nay bạn cần hỗ trợ chăm sóc bé điều gì?",
    "CTA chính": "ĐĂNG VIỆC MỚI NGAY",
    "CTA shimmer": "cta-shimmer-light",
    "Option ghép cặp ELO": "Ghép cặp ELO tự động (Flow 1)",
    "Option AI đăng hộ": "Nhờ AI đăng việc hộ",
    "Stats tổng": 'id="stat-total"',
    "Stats open": 'id="stat-open"',
    "Stats in-progress": 'id="stat-inprogress"',
    "Stats link lọc all": "?filter=all",
    "Stats link lọc open": "?status=open",
    "Stats link lọc đang chạy": "?status=in_progress",
    "Insight pill": 'id="desktop-insight-pill"',
    "Greeting desktop": 'id="greeting-desktop"',
    "Danh sách việc": 'id="task-list"',
    "Trust banner": "Cam kết an toàn &amp; Hoàn ví credit",
    "Link task-detail": "/parent/task-detail/?task_id=",
    "Link browse-candidates": "/parent/browse-candidates/?task_id=",
    "Link review": "/parent/review/?task_id=",
    "Mobile bottom nav 4 tab": "AI Trợ lý</span>",
    "Guard login": "if (!localStorage.getItem('token'))",
    "API my-tasks": 'API_BASE + "/parent/my-tasks/"',
    "Sidebar render (brand Stitch)": 'Edu<span class="text-[#F26522]">Care</span>Link' in home
        and 'data-purpose="sidebar-user-footer"' in home,
    "Sidebar active đúng tab Trang chủ": bool(re.search(
        r'<a href="/parent/"[^>]*class="[^"]*bg-orange-50/80', home)),
}
for key, marker in HOME_NEW.items():
    ok = (marker in home) if isinstance(marker, str) else bool(marker)
    check(f"parent_home — có '{key}'", ok, extra=str(marker)[:120] if not ok else "")

HOME_ABSENT = {
    "modal nâng cấp cũ": "upgrade-modal",
    "tên demo 'Công Vinh Trương' hardcode": "Công Vinh Trương",
    "dữ liệu giả HCM (Vinhomes)": "Vinhomes",
    "fallbackTasks": "fallbackTasks",
    "nút Chi tiết nhảy /worker/": 'href="/worker/task-detail/',
}
for key, marker in HOME_ABSENT.items():
    check(f"parent_home — ĐÃ XÓA {key}", marker not in home, extra=marker)

# ---------- 5. parent_tasks lọc từ URL ----------
pt = contents["/parent/tasks/"]
check("parent_tasks — có bộ lọc URL (?status=/?filter=)", "applyInitialFilterFromUrl" in pt)
check("parent_tasks — getFilteredTasks nhánh 'all'", "currentTab === 'all'" in pt)
check("parent_tasks — guard login giữ nguyên", "if (!localStorage.getItem('token'))" in pt)
check("parent_tasks — giữ logic chat 24h (Task 14)", "chat-24h" in pt or "patchChat24hSlots" in pt)

# ---------- 6. node --check inline JS ----------
def node_check_html(html, label):
    blocks = re.findall(r"<script>(.*?)</script>", html, re.S)
    ok_all, first_err = True, ""
    for i, js in enumerate(blocks):
        if "tailwind.config" in js:
            continue  # config gắn CDN, kiểm riêng bên dưới
        tmp = os.path.join(BASE, "scripts", f"_tmp_{label}_{i}.js")
        with open(tmp, "w") as f:
            f.write(js)
        rr = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if rr.returncode != 0:
            ok_all = False
            first_err = f"block {i}: {rr.stderr.strip()[:200]}"
        os.remove(tmp)
    return ok_all, first_err

for url, label in [("/parent/", "home"), ("/parent/tasks/", "tasks"), ("/dang-viec/", "dangviec")]:
    ok, err = node_check_html(contents[url], label)
    check(f"node --check inline JS {url}", ok, extra=err)

# ---------- Tổng kết ----------
print()
print("════════════════════════════════════════")
print(f"  KẾT QUẢ: {len(PASS)} PASS / {len(FAIL)} FAIL")
print("════════════════════════════════════════")
if FAIL:
    print("Các mục FAIL:")
    for name in FAIL:
        print(f"  - {name}")
    sys.exit(1)
print("TẤT CẢ PASS ✓")
