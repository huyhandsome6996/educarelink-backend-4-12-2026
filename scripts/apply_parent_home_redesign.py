#!/usr/bin/env python
"""
Áp dụng parent_home redesign (spec Stitch) với 3 sửa bắt buộc so với mã spec:
  F1. Thêm guard đăng nhập (không có token → chuyển /login/) — tương đương trang cũ,
      tránh khách vãng lai thấy trang trống + dữ liệu demo.
  F2. BỎ fallbackTasks (dữ liệu giả TP.HCM, id "T-9041") — API lỗi → danh sách rỗng
      (empty state đã có sẵn), không bao giờ hiện việc giả.
  F3. Bỏ tên demo hardcode "Công Vinh Trương" → mặc định 'Phụ huynh' + avatar generic.
Mọi thay đổi fail-loud: anchor phải khớp đúng 1 lần.
"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# File trung gian nằm cùng thư mục scripts/ — suy động để tránh hardcode máy cá nhân
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_parent_home_redesign_extracted.html")
DST = os.path.join(BASE, "frontend", "templates", "frontend", "parent_home.html")

with open(SRC, encoding="utf-8") as f:
    code = f.read()


def replace_once(text, old, new, tag):
    n = text.count(old)
    assert n == 1, f"Anchor '{tag}' khớp {n} lần (cần đúng 1)"
    print(f"[OK] {tag}")
    return text.replace(old, new)


# ---------- F1. Guard đăng nhập (giống trang cũ) ----------
code = replace_once(
    code,
    """        // ---- Greeting based on time of day ----
        function getGreeting() {""",
    """        // Guard đăng nhập — giống trang cũ: không có token thì về /login/
        if (!localStorage.getItem('token')) {
            window.location.href = LOGIN_URL;
        }

        // ---- Greeting based on time of day ----
        function getGreeting() {""",
    "F1 guard login",
)

# ---------- F2a. Xóa khối fallbackTasks (dữ liệu giả) ----------
old_fb = code[code.index("        // ---- Dữ liệu mẫu Demo khi chạy standalone"):code.index("        // ---- Main Init ----")]
assert 'fallbackTasks' in old_fb and 'Vinhomes' in old_fb, "Anchor fallbackTasks không đúng vùng"
code = replace_once(
    code,
    old_fb,
    """        // (Đã bỏ dữ liệu demo của spec — API lỗi hiển thị empty state, không bao giờ
        // hiện công việc giả vì dữ liệu mẫu của dự án chỉ nằm tại Thừa Thiên Huế)

        """,
    "F2a xóa fallbackTasks",
)
# ---------- F2b. Hai nhánh lỗi API → mảng rỗng ----------
code = replace_once(
    code,
    """                if (taskResp && taskResp.ok) {
                    tasks = await taskResp.json();
                } else {
                    tasks = fallbackTasks;
                }
            } catch (e) {
                tasks = fallbackTasks;
            }""",
    """                if (taskResp && taskResp.ok) {
                    tasks = await taskResp.json();
                } else {
                    tasks = [];
                }
            } catch (e) {
                tasks = [];
            }""",
    "F2b fallback → []",
)
assert "fallbackTasks" not in code, "Vẫn còn fallbackTasks!"

# ---------- F3. Bỏ tên demo hardcode ----------
code = replace_once(
    code,
    """            let fullName = "Công Vinh Trương";
            let avatarUrl = "https://ui-avatars.com/api/?name=Cong+Vinh&background=F26522&color=fff";""",
    """            let fullName = 'Phụ huynh';
            let avatarUrl = "https://ui-avatars.com/api/?name=User&background=F26522&color=fff";""",
    "F3 bỏ tên demo",
)

# ---------- Nghiệm thu trước khi ghi ----------
final_checks = {
    "Không còn tên demo": "Công Vinh Trương" not in code,
    "Không còn fallbackTasks": "fallbackTasks" not in code,
    "Không còn dữ liệu HCM": "Vinhomes" not in code and "HaDo" not in code,
    "Có guard login": "if (!localStorage.getItem('token'))" in code,
    "Sidebar include home": "{% include 'frontend/_parent_sidebar.html' with active_tab='home' %}" in code,
    "Main offset không w-full": 'class="lg:ml-[260px] min-h-screen main-content pb-12"' in code,
    "Link task-detail": "/parent/task-detail/?task_id=" in code,
    "Link browse-candidates": "/parent/browse-candidates/?task_id=" in code,
    "Insight pill": "desktop-insight-pill" in code,
    "Stat ids": all(x in code for x in ["stat-total", "stat-open", "stat-inprogress"]),
    "task-list": 'id="task-list"' in code,
    "Không upgrade-modal": "upgrade-modal" not in code,
}
for k, v in final_checks.items():
    print(f"{'PASS' if v else 'FAIL'}: {k}")
assert all(final_checks.values()), "Nghiệm thu mã thất bại!"

with open(DST, "w", encoding="utf-8") as f:
    f.write(code)
print(f"\nĐã ghi: {DST} ({len(code.splitlines())} dòng)")
