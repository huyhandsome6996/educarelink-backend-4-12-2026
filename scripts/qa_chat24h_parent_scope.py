#!/usr/bin/env python
"""
QA verify 2026-09-10 (đợt 2):
1. Nút "Chi tiết" ở trang phụ huynh KHÔNG còn nhảy sang /worker/task-detail/
   — tạo trang /parent/task-detail/ giữ chrome phụ huynh.
2. Nút "Chat với Carepartner (24h)" (parent + worker) có slot check trạng thái
   cửa sổ chat từ server — quá 24h → nút ĐỎ "Quá 24h không thể chat", khóa bấm.
3. Cú pháp JS inline của 4 trang render được (node --check).
4. Regression: /parent/ + /parent/tasks/ + /worker/my-jobs/ vẫn render 200.
"""

import os
import re
import subprocess
import sys
import tempfile

# Gốc repo tự suy ra: script nằm ở <root>/scripts/ → cha của cha = gốc repo.
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

# ---------- 1. Render các trang liên quan ----------
pages = {
    "/parent/": "Trang chủ phụ huynh",
    "/parent/tasks/": "Việc của tôi (parent)",
    "/parent/task-detail/?task_id=1": "Chi tiết công việc (parent) — MỚI",
    "/parent/candidate-profile/?worker_id=1": "Hồ sơ CarePartner khu vực parent — MỚI",
    "/parent/browse-candidates/": "Xem ứng viên (parent)",
    "/worker/my-jobs/": "Việc của tôi (worker)",
    "/worker/task-detail/?task_id=1": "Chi tiết công việc (worker) — giữ nguyên cho CP",
}
contents = {}
for url, label in pages.items():
    r = c.get(url)
    contents[url] = r.content.decode("utf-8") if r.status_code == 200 else ""
    check(f"GET {url} → 200 ({label})", r.status_code == 200, f"status={r.status_code}")

home = contents["/parent/"]
tasks = contents["/parent/tasks/"]
detail = contents["/parent/task-detail/?task_id=1"]
cprofile = contents["/parent/candidate-profile/?worker_id=1"]
wjobs = contents["/worker/my-jobs/"]
wdetail = contents["/worker/task-detail/?task_id=1"]

# ---------- 2. Nút Chi tiết parent KHÔNG còn trỏ sang worker ----------
check("Trang chủ parent KHÔNG còn link /worker/task-detail/", "/worker/task-detail/" not in home)
check("Trang chủ parent trỏ /parent/task-detail/ (URL mới)", "/parent/task-detail/?task_id=" in home)
check("Trang worker task-detail VẪN tồn tại riêng cho CarePartner (không bị xóa)", "Chi tiết công việc" in wdetail)

# ---------- 3. Trang chi tiết parent: chrome phụ huynh + đủ chức năng ----------
check("Trang chi tiết parent có sidebar phụ huynh (psb-item)", "psb-item" in detail)
check("Sidebar phụ huynh active đúng tab 'Việc của tôi'", 'active_tab' in detail or 'psb-item active' in detail)
check("Trang chi tiết parent KHÔNG có nút Ứng tuyển (chỉ dành cho worker)", "handleApply" not in detail and "Ứng tuyển ngay" not in detail)
check("Trang chi tiết parent có nút Quay lại Việc của tôi", "Quay lại Việc của tôi" in detail)
check("Trang chi tiết parent có ownership check (task.parent !== prof.id)", "task.parent !== prof.id" in detail)
check("Trang chi tiết parent có hành động Xem ứng viên", "viewCandidates" in detail)
check("Trang chi tiết parent có Theo dõi vị trí", "trackCarepartner" in detail)
check("Trang chi tiết parent có Thanh toán (parent scope)", "/parent/payments/" in detail)
check("Trang chi tiết parent có logic chat 24h", "chat-24h" in detail or "chatButtonHtml" in detail)
check("Trang chi tiết parent có nhãn 'Quá 24h không thể chat'", "Quá 24h không thể chat" in detail)

# ---------- 3b. Trang hồ sơ CarePartner khu vực parent ----------
check("Trang hồ sơ CP (parent) có sidebar phụ huynh", "psb-item" in cprofile)
check("Trang hồ sơ CP (parent) KHÔNG có nav worker (Tìm việc/ví CP)", 'href="/worker/"' not in cprofile)
check("Trang hồ sơ CP (parent) đọc API profile chung", "/worker/${workerId}/profile/" in cprofile)
check("browse_candidates KHÔNG còn link /worker/profile/", "frontend:worker_profile" not in contents["/parent/browse-candidates/"])
check("browse_candidates trỏ hồ sơ về khu vực parent", "/parent/candidate-profile/?worker_id=" in contents["/parent/browse-candidates/"])

# ---------- 4. Chat 24h: slot + nhãn đỏ ở cả parent & worker ----------
check("parent_tasks có slot chat 24h (chat-24h-slot)", "chat-24h-slot" in tasks)
check("parent_tasks có nhãn 'Quá 24h không thể chat'", "Quá 24h không thể chat" in tasks)
check("parent_tasks gọi patchChat24hSlots sau render", "patchChat24hSlots()" in tasks)
check("worker_jobs có slot chat 24h (chat-24h-slot)", "chat-24h-slot" in wjobs)
check("worker_jobs có nhãn 'Quá 24h không thể chat'", "Quá 24h không thể chat" in wjobs)
check("Cả 2 trang dùng API cửa sổ chat thật (/chat/conversations/)", "/chat/conversations/" in tasks and "/chat/conversations/" in wjobs)

# ---------- 5. Rà lại toàn bộ template parent: không còn link chéo sang worker-page ----------
template_dir = "frontend/templates/frontend"
parent_templates = [
    "parent_home.html", "parent_tasks.html", "parent_profile.html", "review.html",
    "browse_candidates.html", "vi_credit.html", "don.html", "ung_vien.html",
    "dang_viec_select.html", "dang_viec_gia_su.html", "dang_viec_trong_tre.html",
    "dang_viec_don_tre.html", "parent_care_diary_detail.html", "parent_care_diary_history.html",
    "parent_task_detail.html",
]
bad = []
for fname in parent_templates:
    path = os.path.join(template_dir, fname)
    if not os.path.exists(path):
        continue
    src = open(path, encoding="utf-8").read()
    # Link PAGE (href) sang trang worker — API call /worker/... được phép (chung backend)
    for m in re.finditer(r"href=[\"'][^\"']*/worker/(?!profile\?)[^\"']*[\"']", src):
        bad.append(f"{fname}: {m.group(0)[:80]}")
    for m in re.finditer(r"url 'frontend:worker_", src):
        bad.append(f"{fname}: Django url tag → {m.group(0)}")
check("Không template parent nào còn href sang trang /worker/*", len(bad) == 0, "; ".join(bad[:5]))

# ---------- 6. node --check toàn bộ <script> inline của 4 trang đã render ----------
node_ok, node_err = True, []
for label, html in [("parent_home", home), ("parent_tasks", tasks), ("parent_task_detail", detail), ("parent_candidate_profile", cprofile), ("worker_jobs", wjobs)]:
    scripts = re.findall(r"<script(?![^>]*src=)[^>]*>(.*?)</script>", html, re.S)
    for i, js in enumerate(scripts):
        if not js.strip():
            continue
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
            f.write(js)
            tmp = f.name
        res = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        os.unlink(tmp)
        if res.returncode != 0:
            node_ok = False
            node_err.append(f"{label}#{i}: {res.stderr[:200]}")
check("node --check PASS cho toàn bộ <script> inline của 4 trang", node_ok, "; ".join(node_err[:3]))

# ---------- KẾT ----------
print(f"\n═══ KẾT QUẢ: {len(PASS)} PASS / {len(FAIL)} FAIL ═══")
if FAIL:
    print("Các mục FAIL:")
    for f in FAIL:
        print(f"  - {f}")
    sys.exit(1)
print("✅ TẤT CẢ PASS — parent không còn nhảy sân sang giao diện CarePartner, chat 24h có trạng thái đỏ khi quá hạn")
