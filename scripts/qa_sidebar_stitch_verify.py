#!/usr/bin/env python
"""
QA verify 2026-09-10 (đợt 3) — Sidebar Stitch + Onboarding theo bối cảnh mới:
1. Sidebar mới (Stitch UI) render đúng trên TẤT CẢ 20 trang phụ huynh:
   logo /static/images/logo.png trong ô cam bo tròn, badge "Phụ huynh",
   2 nhóm "Quản lý & Dịch vụ" / "Hỗ trợ & Hệ thống", đủ 8 mục,
   badge "MỚI" ở Đăng việc ghép cặp, footer capsule + "Đăng xuất tài khoản".
2. Trạng thái Active đúng từng trang: mục của trang có
   bg-orange-50/80 + border-l-4 border-[#F26522], các mục khác không.
   Riêng vi_credit phải highlight "Ví credit" (fix active_tab matching→credit).
3. Trang /onboarding/parent/ theo bối cảnh hiện tại: Đăng việc ghép cặp
   (3 loại Gia sư/Trông trẻ/Đón & trả trẻ), AI đề xuất độ khớp, auto-chốt,
   nhật ký chăm sóc, Ví credit, chat 24h — không còn "Nấu ăn"/"Dọn dẹp"/
   "+ Tạo việc mới" (luồng cũ).
4. Cú pháp JS inline sidebar (node --check) + regression render 200.
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

PASS, FAIL = [], []


def check(name, cond, extra=""):
    (PASS if cond else FAIL).append(name)
    print(f"[{'PASS' if cond else 'FAIL'}] {name}" + (f" → {extra}" if extra and not cond else ""))


c = Client()

# ---------- 1. Render 20 trang phụ huynh ----------
# (url, label, active_tab kỳ vọng: (href của mục active) hoặc None)
PARENT_PAGES = [
    ("/parent/", "Trang chủ", "/parent/"),
    ("/parent/tasks/", "Việc của tôi", "/parent/tasks/"),
    ("/parent/task-detail/?task_id=1", "Chi tiết công việc", "/parent/tasks/"),
    ("/parent/candidate-profile/?worker_id=1", "Hồ sơ CarePartner (parent)", "/parent/tasks/"),
    ("/parent/browse-candidates/", "Xem ứng viên", "/parent/tasks/"),
    ("/parent/review/", "Đánh giá", "/parent/tasks/"),
    ("/parent/care-diary-history/", "Nhật ký chăm sóc (lịch sử)", "/parent/care-diary-history/"),
    ("/parent/care-diary/?booking_id=1", "Nhật ký chăm sóc (chi tiết)", "/parent/care-diary-history/"),
    ("/dang-viec/", "Đăng việc — chọn loại", "/dang-viec/"),
    ("/dang-viec/gia-su/", "Đăng việc — gia sư", "/dang-viec/"),
    ("/dang-viec/trong-tre/", "Đăng việc — trông trẻ", "/dang-viec/"),
    ("/dang-viec/don-tre/", "Đăng việc — đón/trả trẻ", "/dang-viec/"),
    ("/parent/create-1/", "Tạo việc (luồng cũ) bước 1", "/dang-viec/"),
    ("/parent/create-2/", "Tạo việc (luồng cũ) bước 2", "/dang-viec/"),
    ("/vi-credit/", "Ví credit", "/vi-credit/"),
    ("/parent/chatbot/", "AI Trợ lý", "/parent/chatbot/"),
    ("/onboarding/parent/", "Hướng dẫn sử dụng (onboarding)", None),  # không có sidebar
    ("/parent/profile/", "Cài đặt / Hồ sơ", "/parent/profile/"),
]

MARKERS = {
    "logo": '<img src="/static/images/logo.png" alt="EduCareLink"',
    "logo_box": "bg-orange-50 border border-orange-200/80",
    "brand": 'Edu<span class="text-[#F26522]">Care</span>Link',
    "badge_role": "Phụ huynh",
    "group1": "Quản lý &amp; Dịch vụ",
    "group2": "Hỗ trợ &amp; Hệ thống",
    "new_badge": ">MỚI</span>",
    "credit_item": "Ví credit",
    "diary_item": "Nhật ký chăm sóc",
    "settings_item": ">Cài đặt</span>",
    "footer": "data-purpose=\"sidebar-user-footer\"",
    "logout": "Đăng xuất tài khoản",
}

ACTIVE_RE = re.compile(
    r'<a href="(?P<href>[^"]+)"[^>]*class="(?P<cls>[^"]*bg-orange-50/80[^"]*)"',
    re.S
)

contents = {}
for url, label, _exp in PARENT_PAGES:
    r = c.get(url)
    ok200 = r.status_code == 200
    contents[url] = r.content.decode("utf-8") if ok200 else ""
    check(f"GET {url} → 200 ({label})", ok200, f"status={r.status_code}")

# Trang có sidebar = mọi trang trừ onboarding
side_pages = [(u, l, e) for u, l, e in PARENT_PAGES if u != "/onboarding/parent/"]

# ---------- 2. Marker sidebar mới trên từng trang ----------
for url, label, _exp in side_pages:
    html = contents[url]
    for key, marker in MARKERS.items():
        check(f"{url} — sidebar marker '{key}'", marker in html,
              extra="không tìm thấy marker của sidebar Stitch")

# ---------- 3. Active đúng mục của từng trang ----------
for url, label, exp_href in side_pages:
    html = contents[url]
    actives = [m.groupdict() for m in ACTIVE_RE.finditer(html)]
    hrefs = [a["href"] for a in actives]
    if exp_href is None:
        check(f"{url} — không mục nào active (trang ngoài sidebar)", not hrefs, extra=str(hrefs))
    else:
        check(f"{url} — active đúng mục ({exp_href})", hrefs == [exp_href],
              extra=f"thấy {hrefs}")
    # Active bắt buộc có viền cam trái + chấm chỉ báo
    for a in actives:
        cls = a["cls"]
        check(f"{url} — active {a['href']} có border-l-4 cam",
              "border-l-4" in cls and "border-[#F26522]" in cls, extra=cls[:120])

# vi_credit: "Đăng việc ghép cặp" KHÔNG được active (fix regression tab cũ)
vi = contents["/vi-credit/"]
m_dangviec_active = re.search(
    r'<a href="/dang-viec/"[^>]*class="[^"]*bg-orange-50/80', vi)
check("/vi-credit/ — 'Đăng việc ghép cặp' KHÔNG active", m_dangviec_active is None)
m_credit_active = re.search(
    r'<a href="/vi-credit/"[^>]*class="[^"]*bg-orange-50/80[^"]*"', vi)
check("/vi-credit/ — 'Ví credit' active", m_credit_active is not None)

# ---------- 4. Onboarding theo bối cảnh hiện tại ----------
onb = contents["/onboarding/parent/"]
ONB_NEW = {
    "đăng việc ghép cặp": "1. Đăng việc ghép cặp",
    "3 loại dịch vụ — gia sư": ">Gia sư</span>",
    "3 loại dịch vụ — trông trẻ": ">Trông trẻ</span>",
    "3 loại dịch vụ — đón & trả trẻ": "Đón &amp; trả trẻ",
    "AI phân tích mô tả": "AI sẽ phân tích thành thông tin công việc",
    "duyệt ứng viên AI": "2. Duyệt ứng viên do AI đề xuất",
    "3 nhóm độ khớp": "Cần cân nhắc",
    "độ khớp mock": "Độ khớp cao — 92%",
    "auto-chốt đơn": "đơn được chốt tự động",
    "theo dõi + nhật ký": "nhật ký chăm sóc sau mỗi buổi",
    "chat 24h": "cửa sổ chat mở trong 24h",
    "ví credit đền bù": "Credit đền bù tự động vào Ví credit",
    "tóm tắt — đăng việc": ">Đăng việc ghép cặp</p>",
    "tóm tắt — việc của tôi": ">Việc của tôi</p>",
    "tóm tắt — ví credit": ">Ví credit</p>",
    "tóm tắt — AI trợ lý": ">AI Trợ lý</p>",
    "footer hướng dẫn lại": "Hướng dẫn sử dụng\" trên thanh điều hướng",
}
for key, marker in ONB_NEW.items():
    check(f"onboarding — có '{key}'", marker in onb, extra=marker)

ONB_OLD = {
    'chips "Nấu ăn" (danh mục cũ)': ">Nấu ăn</span>",
    'chips "Dọn dẹp" (danh mục cũ)': ">Dọn dẹp</span>",
    'chips "Đón trẻ" đơn lẻ (đã đổi "Đón & trả trẻ")': ">Đón trẻ</span>",
    'nút "+ Tạo việc mới" (đã bỏ)': "+ Tạo việc mới",
    'mục "Xem ứng viên" (đã đổi "Duyệt ứng viên...")': ">2. Xem ứng viên</h2>",
    '"AI Chatbot" nhãn cũ': ">AI Chatbot</p>",
    'mock "4.8 sao" cũ': "Gia sư Toán - 4.8 sao",
}
for key, marker in ONB_OLD.items():
    check(f"onboarding — ĐÃ XÓA {key}", marker not in onb, extra=marker)

# ---------- 5. node --check JS inline của sidebar render từ /parent/ ----------
try:
    m = re.search(r"<script>\s*\(function initParentSidebar.*?</script>", home_html := contents["/parent/"], re.S)
    check("sidebar — tìm thấy script initParentSidebar trong /parent/", bool(m))
    if m:
        js = m.group(0)[len("<script>"):-len("</script>")]
        with open(os.path.join(BASE, "scripts", "_tmp_sidebar_inline.js"), "w") as f:
            f.write(js)
        rr = subprocess.run(["node", "--check", os.path.join(BASE, "scripts", "_tmp_sidebar_inline.js")],
                            capture_output=True, text=True)
        check("sidebar — node --check JS inline", rr.returncode == 0, extra=rr.stderr.strip()[:300])
        os.remove(os.path.join(BASE, "scripts", "_tmp_sidebar_inline.js"))
except Exception as exc:  # noqa: BLE001
    check("sidebar — node --check JS inline", False, extra=str(exc))

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
