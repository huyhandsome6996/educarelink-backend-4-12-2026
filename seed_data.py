"""
EDUCARELINK - SEED DATA SCRIPT (FULL DEMO)
============================================
Script nap du lieu mau day du de ban giam khao kiem tra san pham.
Chay lenh: python seed_data.py

Du lieu duoc tao bao gom:
  - 8 danh muc dich vu (ServiceCategory)
  - 1 tai khoan Admin
  - 4 tai khoan Phu huynh (Parent)
  - 5 tai khoan Carepartner (Worker): 4 da duyet, 1 cho duyet, 1 bi khoa
  - 10 cong viec (Task) o cac trang thai khac nhau
  - 7 ung tuyen (TaskApplication)
  - 3 danh gia (Review)
"""

import os
import sys
import django

# Cau hinh de chay script doc lap (khong dung manage.py)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

try:
    django.setup()
except Exception as e:
    print(f"[LOI] Loi khi khoi dong Django: {e}")
    print("   Hay dam bao ban dang chay script tu thu muc goc cua du an (noi co manage.py)")
    sys.exit(1)

from django.utils import timezone
from datetime import timedelta
from core.models import User, ServiceCategory, Task, TaskApplication, Review

TEST_PASSWORD = "Demo@2026"

# ============================================================
# PHAN 1: TAO DANH MUC DICH VU
# ============================================================
print("\n" + "=" * 60)
print("  EDUCARELINK - TAO DU LIEU MAU DAY DU CHO BAN GIAM KHAO")
print("=" * 60)
print(f"\n[1/6] Dang nap danh muc dich vu...")

categories_data = [
    {"name": "Gia sư", "icon_name": "BookOpen", "description": "Dạy kèm các môn học từ tiểu học đến đại học."},
    {"name": "Đón trẻ", "icon_name": "Baby", "description": "Đón con em từ trường về nhà an toàn. Yêu cầu có xe máy và bằng lái."},
    {"name": "Dọn dẹp nhà cửa", "icon_name": "Home", "description": "Vệ sinh, sắp xếp nhà cửa, văn phòng theo yêu cầu của gia đình."},
    {"name": "Trông trẻ", "icon_name": "Heart", "description": "Trông coi, chăm sóc trẻ nhỏ tại nhà. Yêu cầu kiên nhẫn và có kinh nghiệm."},
    {"name": "Mua sắm hộ", "icon_name": "ShoppingCart", "description": "Đi chợ, mua đồ theo danh sách và giao hàng tận nơi cho gia đình."},
    {"name": "Nấu ăn", "icon_name": "Restaurant", "description": "Nấu ăn cho gia đình, chuẩn bị bữa sáng, trưa, tối theo yêu cầu."},
    {"name": "Hỗ trợ AI", "icon_name": "SmartToy", "description": "Sử dụng công nghệ AI hỗ trợ học tập và phát triển cho bé."},
    {"name": "Khác", "icon_name": "MoreHoriz", "description": "Các dịch vụ khác như chuyển nhà, chăm sóc thú cưng, hỗ trợ kỹ năng sống."},
]

created_cats = 0
for cat_data in categories_data:
    obj, created = ServiceCategory.objects.get_or_create(
        name=cat_data["name"],
        defaults={
            "icon_name": cat_data["icon_name"],
            "description": cat_data["description"]
        }
    )
    status = "[TAO MOI]" if created else "[DA TON TAI]"
    print(f"   {status} {obj.name}")
    if created:
        created_cats += 1

print(f"   -> Hoan tat! Da tao {created_cats} danh muc moi.\n")


# ============================================================
# PHAN 2: TAO TAI KHOAN ADMIN
# ============================================================
print("[2/6] Dang tao tai khoan Admin...")

admin_user, created = User.objects.get_or_create(
    username="admin",
    defaults={
        "role": "parent",
        "first_name": "Admin",
        "last_name": "EduCareLink",
        "email": "admin@educarelink.com",
        "phone_number": "0900000000",
        "is_staff": True,
        "is_superuser": True,
        "is_verified": True,
        "is_approved": True,
    }
)
if created:
    admin_user.set_password(TEST_PASSWORD)
    admin_user.save()
    print(f"   [TAO MOI] Admin: username=admin / pass={TEST_PASSWORD}")
else:
    if not admin_user.is_staff or not admin_user.is_superuser:
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.save()
    print(f"   [DA TON TAI] admin")

print()


# ============================================================
# PHAN 3: TAO TAI KHOAN PHU HUYNH (4 tai khoan)
# ============================================================
print("[3/6] Dang tao tai khoan Phu huynh...")

parents_data = [
    {
        "username": "phuhuynh_test",
        "first_name": "Văn",
        "last_name": "Nguyễn",
        "email": "nguyenvan@email.com",
        "phone_number": "0901234567",
        "address": "123 Đường Lê Lợi, Quận 1, TP.HCM",
    },
    {
        "username": "phuhuynh_lan",
        "first_name": "Thị Lan",
        "last_name": "Trần",
        "email": "tranlan@email.com",
        "phone_number": "0912345678",
        "address": "45 Đường Nguyễn Huệ, Quận 1, TP.HCM",
    },
    {
        "username": "phuhuynh_minh",
        "first_name": "Hoàng Minh",
        "last_name": "Lê",
        "email": "leminh@email.com",
        "phone_number": "0923456789",
        "address": "78 Đường Cách Mạng Tháng 8, Quận 3, TP.HCM",
    },
    {
        "username": "phuhuynh_hoa",
        "first_name": "Thị Hoa",
        "last_name": "Phạm",
        "email": "phamhoa@email.com",
        "phone_number": "0934567890",
        "address": "200 Đường Võ Văn Tần, Quận 3, TP.HCM",
    },
]

parent_users = {}
for p_data in parents_data:
    user, created = User.objects.get_or_create(
        username=p_data["username"],
        defaults={
            "role": "parent",
            "first_name": p_data["first_name"],
            "last_name": p_data["last_name"],
            "email": p_data["email"],
            "phone_number": p_data["phone_number"],
            "address": p_data["address"],
            "is_verified": True,
            "is_approved": True,
        }
    )
    if created:
        user.set_password(TEST_PASSWORD)
        user.save()
        print(f"   [TAO MOI] {p_data['last_name']} {p_data['first_name']}: username={p_data['username']} / pass={TEST_PASSWORD}")
    else:
        if not user.is_approved:
            user.is_approved = True
            user.save()
        print(f"   [DA TON TAI] {p_data['username']}")
    parent_users[p_data["username"]] = user

print()


# ============================================================
# PHAN 4: TAO TAI KHOAN CAREPARTNER (5 tai khoan: 4 duyet, 1 cho, 1 bi khoa)
# ============================================================
print("[4/6] Dang tao tai khoan Carepartner...")

workers_data = [
    {
        "username": "sinhvien_test",
        "first_name": "Minh",
        "last_name": "Trần",
        "email": "tranminh@email.com",
        "phone_number": "0981111111",
        "address": "Ký túc xá ĐH Quốc Gia, Thủ Đức, TP.HCM",
        "is_approved": True,
        "is_verified": True,
        "is_active": True,
        "qualifications": ["Sinh viên năm 3 ĐH Sư Phạm", "Chứng chỉ IELTS 6.5"],
        "ai_profile_summary": "Sinh viên năm 3 ngành Sư phạm Toán, có 2 năm kinh nghiệm dạy kèm. Đánh giá 4.8/5 sao từ 15 phụ huynh.",
    },
    {
        "username": "carepartner_anh",
        "first_name": "Minh Anh",
        "last_name": "Nguyễn",
        "email": "nguyenanh@email.com",
        "phone_number": "0982222222",
        "address": "256 Đường Lê Văn Việt, Quận 9, TP.HCM",
        "is_approved": True,
        "is_verified": True,
        "is_active": True,
        "qualifications": ["Cử nhân Sư Phạm Mầm Non", "Chứng chỉ sơ cấp cứu"],
        "ai_profile_summary": "Cử nhân Sư phạm Mầm Non, 3 năm kinh nghiệm trông trẻ và đón trẻ. Nhiệt tình, yêu trẻ, có chứng chỉ sơ cấp cứu.",
    },
    {
        "username": "carepartner_linh",
        "first_name": "Thị Linh",
        "last_name": "Võ",
        "email": "volinh@email.com",
        "phone_number": "0983333333",
        "address": "12 Đường Trần Não, Quận 2, TP.HCM",
        "is_approved": True,
        "is_verified": True,
        "is_active": True,
        "qualifications": ["Sinh viên năm cuối ĐH Kinh Tế", "Chứng chỉ nấu ăn Việt-Á"],
        "ai_profile_summary": "Sinh viên năm cuối ĐH Kinh Tế, phụ việc nhà và nấu ăn 2 năm. Nấu ăn ngon, gọn gàng, chu đáo.",
    },
    {
        "username": "carepartner_duc",
        "first_name": "Đức Thắng",
        "last_name": "Hoàng",
        "email": "hoangduc@email.com",
        "phone_number": "0984444444",
        "address": "88 Đường Phạm Văn Đồng, Thủ Đức, TP.HCM",
        "is_approved": True,
        "is_verified": True,
        "is_active": True,
        "qualifications": ["Sinh viên năm 2 ĐH Bách Khoa", "Chứng chỉ gia sư Toán-Lý"],
        "ai_profile_summary": "Sinh viên Bách Khoa, chuyên gia sư Toán-Lý cho học sinh cấp 2-3. Có phương pháp dạy dễ hiểu, kiên nhẫn.",
    },
    {
        # Carepartner chờ duyệt - để ban giám khảo test chức năng duyệt
        "username": "carepartner_mai",
        "first_name": "Thị Mai",
        "last_name": "Đỗ",
        "email": "domai@email.com",
        "phone_number": "0985555555",
        "address": "56 Đường Nguyễn Oanh, Gò Vấp, TP.HCM",
        "is_approved": False,  # CHỜ DUYỆT
        "is_verified": False,
        "is_active": True,
        "qualifications": [],
        "ai_profile_summary": "",
    },
]

worker_users = {}
for w_data in workers_data:
    user, created = User.objects.get_or_create(
        username=w_data["username"],
        defaults={
            "role": "worker",
            "first_name": w_data["first_name"],
            "last_name": w_data["last_name"],
            "email": w_data["email"],
            "phone_number": w_data["phone_number"],
            "address": w_data["address"],
            "is_approved": w_data["is_approved"],
            "is_verified": w_data["is_verified"],
            "is_active": w_data["is_active"],
            "qualifications": w_data["qualifications"],
            "ai_profile_summary": w_data["ai_profile_summary"],
        }
    )
    if created:
        user.set_password(TEST_PASSWORD)
        user.save()
        trang_thai = "CHỜ DUYỆT" if not w_data["is_approved"] else "Đã duyệt"
        print(f"   [TAO MOI] {w_data['last_name']} {w_data['first_name']}: username={w_data['username']} / pass={TEST_PASSWORD} ({trang_thai})")
    else:
        # Cập nhật trạng thái nếu cần
        updated = False
        if user.is_approved != w_data["is_approved"]:
            user.is_approved = w_data["is_approved"]
            updated = True
        if user.is_verified != w_data["is_verified"]:
            user.is_verified = w_data["is_verified"]
            updated = True
        if user.is_active != w_data["is_active"]:
            user.is_active = w_data["is_active"]
            updated = True
        if user.qualifications != w_data["qualifications"]:
            user.qualifications = w_data["qualifications"]
            updated = True
        if user.ai_profile_summary != w_data["ai_profile_summary"]:
            user.ai_profile_summary = w_data["ai_profile_summary"]
            updated = True
        if updated:
            user.save()
            print(f"   [CAP NHAT] {w_data['username']}")
        else:
            print(f"   [DA TON TAI] {w_data['username']}")
    worker_users[w_data["username"]] = user

# Tài khoản bị khoá - để ban giám khảo test chức năng mở khoá
locked_user, created = User.objects.get_or_create(
    username="locked_vipham",
    defaults={
        "role": "parent",
        "first_name": "Vi Phạm",
        "last_name": "Lê",
        "email": "vipham@email.com",
        "phone_number": "0986666666",
        "address": "999 Đường Không Tồn Tại, Quận 10, TP.HCM",
        "is_verified": True,
        "is_approved": True,
        "is_active": False,  # BỊ KHOÁ
    }
)
if created:
    locked_user.set_password(TEST_PASSWORD)
    locked_user.save()
    print(f"   [TAO MOI] Lê Vi Phạm: username=locked_vipham / pass={TEST_PASSWORD} (BI KHOA)")
else:
    if locked_user.is_active:
        locked_user.is_active = False
        locked_user.save()
    print(f"   [DA TON TAI] locked_vipham (BI KHOA)")

print()


# ============================================================
# PHAN 5: TAO CONG VIEC (10 viec - cac trang thai khac nhau)
# ============================================================
print("[5/6] Dang tao cong viec mau...")

try:
    cat_giasu = ServiceCategory.objects.get(name="Gia sư")
    cat_dontre = ServiceCategory.objects.get(name="Đón trẻ")
    cat_dondep = ServiceCategory.objects.get(name="Dọn dẹp nhà cửa")
    cat_trongtre = ServiceCategory.objects.get(name="Trông trẻ")
    cat_muasam = ServiceCategory.objects.get(name="Mua sắm hộ")
    cat_nauan = ServiceCategory.objects.get(name="Nấu ăn")
    cat_hotroAI = ServiceCategory.objects.get(name="Hỗ trợ AI")
except ServiceCategory.DoesNotExist:
    print("   [LOI] Khong tim thay danh muc. Vui long kiem tra lai Phan 1.")
    sys.exit(1)

p1 = parent_users["phuhuynh_test"]  # Nguyễn Văn
p2 = parent_users["phuhuynh_lan"]   # Trần Thị Lan
p3 = parent_users["phuhuynh_minh"]  # Lê Hoàng Minh
p4 = parent_users["phuhuynh_hoa"]   # Phạm Thị Hoa

w1 = worker_users["sinhvien_test"]   # Trần Minh
w2 = worker_users["carepartner_anh"] # Nguyễn Minh Anh
w3 = worker_users["carepartner_linh"]# Võ Thị Linh
w4 = worker_users["carepartner_duc"] # Hoàng Đức Thắng

now = timezone.now()

tasks_data = [
    # === CÔNG VIỆC ĐANG MỞ (open) - 4 việc ===
    {
        "title": "Cần gia sư dạy Toán lớp 8 - 2 buổi/tuần",
        "description": "Bé nhà tôi học yếu môn Toán, cần gia sư kiên nhẫn, phương pháp dạy tốt. Ưu tiên sinh viên năm 3-4 trở lên. Dạy tại nhà vào tối thứ 3 và thứ 5 mỗi tuần. Thời gian mỗi buổi 1.5 tiếng từ 18h-19h30.",
        "price": 200000,
        "category": cat_giasu,
        "location": "123 Đường Nguyễn Văn Cừ, Quận 5, TP.HCM",
        "scheduled_time": now + timedelta(days=3),
        "status": "open",
        "parent": p1,
    },
    {
        "title": "[GẤP] Đón bé lớp 1 từ trường Tiểu học Lê Văn Tám",
        "description": "Tôi cần người đón bé gái 6 tuổi từ trường về nhà lúc 11h trưa các ngày trong tuần. Nhà cách trường khoảng 2km. Yêu cầu có xe máy, bằng A1 và thái độ thân thiện với trẻ em.",
        "price": 150000,
        "category": cat_dontre,
        "location": "45 Đường Phan Đình Phùng, Phú Nhuận, TP.HCM",
        "scheduled_time": now + timedelta(days=1),
        "status": "open",
        "parent": p2,
    },
    {
        "title": "Dọn dẹp căn hộ 60m2 cuối tuần",
        "description": "Căn hộ 2 phòng ngủ, cần lau dọn toàn bộ sàn nhà, vệ sinh nhà bếp và 1 phòng tắm. Dụng cụ vệ sinh tôi đã chuẩn bị sẵn. Công việc khoảng 3 tiếng, làm vào sáng thứ 7.",
        "price": 250000,
        "category": cat_dondep,
        "location": "Chung cư Vinhomes Grand Park, Quận 9, TP.HCM",
        "scheduled_time": now + timedelta(days=5),
        "status": "open",
        "parent": p3,
    },
    {
        "title": "Trông bé 3 tuổi buổi sáng thứ 7",
        "description": "Vợ chồng tôi có lịch họp vào sáng thứ 7, cần người trông bé từ 8h-12h. Bé ngoan, đã quen với người lạ. Sẽ có đồ ăn sáng và đồ chơi chuẩn bị sẵn. Ưu tiên bạn nữ có kinh nghiệm.",
        "price": 180000,
        "category": cat_trongtre,
        "location": "78 Đường Hoàng Diệu 2, Thủ Đức, TP.HCM",
        "scheduled_time": now + timedelta(days=2),
        "status": "open",
        "parent": p4,
    },

    # === CÔNG VIỆC ĐANG THỰC HIỆN (in_progress) - 2 việc ===
    {
        "title": "Gia sư Tiếng Anh lớp 6 - 3 buổi/tuần",
        "description": "Bé mới chuyển sang chương trình song ngữ, cần gia sư Tiếng Anh phụ đạo 3 buổi/tuần vào thứ 2, 4, 6. Yêu cầu phát âm chuẩn, có chứng chỉ IELTS hoặc TOEFL. Dạy từ 17h-18h30.",
        "price": 250000,
        "category": cat_giasu,
        "location": "200 Đường Nam Kỳ Khởi Nghĩa, Quận 1, TP.HCM",
        "scheduled_time": now + timedelta(days=7),
        "status": "in_progress",
        "parent": p1,
    },
    {
        "title": "Nấu ăn gia đình 5 người - 5 ngày/tuần",
        "description": "Cần người nấu bữa tối cho gia đình 5 người (3 người lớn, 2 trẻ em) từ thứ 2 đến thứ 6 hàng tuần. Yêu cầu nấu ăn ngon, biết nấu cả món Việt và món Á. Nguyên liệu tôi sẽ chuẩn bị sẵn.",
        "price": 350000,
        "category": cat_nauan,
        "location": "56 Đường Nguyễn Trãi, Quận 5, TP.HCM",
        "scheduled_time": now + timedelta(days=4),
        "status": "in_progress",
        "parent": p2,
    },

    # === CÔNG VIỆC ĐÃ HOÀN THÀNH (completed) - 3 việc ===
    {
        "title": "Dọn dẹp văn phòng 100m2 cuối tháng",
        "description": "Văn phòng công ty cần lau dọn tổng vệ sinh cuối tháng. Bao gồm 4 phòng làm việc, 1 phòng họp, 1 nhà bếp và 2 nhà vệ sinh. Yêu cầu làm cẩn thận, sử dụng hóa chất vệ sinh văn phòng.",
        "price": 500000,
        "category": cat_dondep,
        "location": "Tòa nhà Viettel, Quận 10, TP.HCM",
        "scheduled_time": now - timedelta(days=5),
        "status": "completed",
        "parent": p3,
    },
    {
        "title": "Mua sắm đồ tết cho gia đình",
        "description": "Cần người đi chợ Bến Thành mua sắm đồ tết theo danh sách: hoa mai, bánh tét, mứt, đồ thờ cúng. Giao hàng tận nhà. Danh sách chi tiết sẽ gửi qua Zalo. Chi phí mua sắm tôi chuyển trước.",
        "price": 200000,
        "category": cat_muasam,
        "location": "Chợ Bến Thành, Quận 1, TP.HCM",
        "scheduled_time": now - timedelta(days=10),
        "status": "completed",
        "parent": p4,
    },
    {
        "title": "Trông trẻ tối cuối tuần - 5 tiếng",
        "description": "Vợ chồng tôi đi dự tiệc tối thứ 7 từ 17h-22h, cần người trông 2 bé (4 tuổi và 7 tuổi) tại nhà. Bé lớn đã biết tự chơi, bé nhỏ cần cho ăn tối và ru ngủ. Ưu tiên người có kinh nghiệm trông trẻ.",
        "price": 300000,
        "category": cat_trongtre,
        "location": "300 Đường Nguyễn Đình Chiểu, Quận 3, TP.HCM",
        "scheduled_time": now - timedelta(days=8),
        "status": "completed",
        "parent": p1,
    },

    # === CÔNG VIỆC ĐÃ HỦY (cancelled) - 1 việc ===
    {
        "title": "Hỗ trợ AI học tập cho bé lớp 3",
        "description": "Tìm người có kinh nghiệm sử dụng các công cụ AI giáo dục để hỗ trợ con tôi học tập. Cần biết sử dụng ChatGPT, các app học tập AI. Dạy bé cách sử dụng AI an toàn và hiệu quả.",
        "price": 220000,
        "category": cat_hotroAI,
        "location": "150 Đường Lý Thường Kiệt, Quận Tân Bình, TP.HCM",
        "scheduled_time": now - timedelta(days=3),
        "status": "cancelled",
        "parent": p2,
    },
]

created_tasks = 0
task_objects = []
for task_data in tasks_data:
    parent = task_data.pop("parent")
    obj, created = Task.objects.get_or_create(
        title=task_data["title"],
        parent=parent,
        defaults=task_data
    )
    status_tag = "[TAO MOI]" if created else "[DA TON TAI]"
    print(f"   {status_tag} [{obj.status.upper()}] {obj.title[:60]}...")
    if created:
        created_tasks += 1
    task_objects.append(obj)

print(f"   -> Hoan tat! Da tao {created_tasks} cong viec moi.\n")


# ============================================================
# PHAN 6: TAO UNG TUYEN VA DANH GIA
# ============================================================
print("[6/6] Dang tao ung tuyen va danh gia...")

# Xóa các ứng tuyển và đánh giá cũ để tránh trùng lặp
TaskApplication.objects.all().delete()
Review.objects.all().delete()

# Lấy các task theo trạng thái
open_tasks = [t for t in task_objects if t.status == "open"]
in_progress_tasks = [t for t in task_objects if t.status == "in_progress"]
completed_tasks = [t for t in task_objects if t.status == "completed"]

applications_data = []
reviews_data = []

# --- OPEN TASKS: Nhiều người ứng tuyển ---
# Task 0: Gia sư Toán - 3 người ứng tuyển
if len(open_tasks) > 0:
    applications_data.append({"task": open_tasks[0], "worker": w1, "status": "pending"})  # Trần Minh
    applications_data.append({"task": open_tasks[0], "worker": w4, "status": "pending"})  # Hoàng Đức Thắng
    applications_data.append({"task": open_tasks[0], "worker": w2, "status": "pending"})  # Nguyễn Minh Anh

# Task 1: Đón trẻ - 2 người ứng tuyển
if len(open_tasks) > 1:
    applications_data.append({"task": open_tasks[1], "worker": w2, "status": "pending"})  # Nguyễn Minh Anh
    applications_data.append({"task": open_tasks[1], "worker": w3, "status": "pending"})  # Võ Thị Linh

# Task 2: Dọn dẹp - 1 người ứng tuyển
if len(open_tasks) > 2:
    applications_data.append({"task": open_tasks[2], "worker": w3, "status": "pending"})  # Võ Thị Linh

# Task 3: Trông trẻ - 2 người ứng tuyển
if len(open_tasks) > 3:
    applications_data.append({"task": open_tasks[3], "worker": w2, "status": "pending"})  # Nguyễn Minh Anh
    applications_data.append({"task": open_tasks[3], "worker": w3, "status": "pending"})  # Võ Thị Linh

# --- IN PROGRESS TASKS: Đã chấp nhận ứng viên ---
# Task 4: Gia sư Tiếng Anh - Trần Minh đã được nhận
if len(in_progress_tasks) > 0:
    applications_data.append({"task": in_progress_tasks[0], "worker": w1, "status": "accepted"})  # Trần Minh
    applications_data.append({"task": in_progress_tasks[0], "worker": w4, "status": "rejected"}) # Hoàng Đức Thắng bị từ chối

# Task 5: Nấu ăn - Võ Thị Linh đã được nhận
if len(in_progress_tasks) > 1:
    applications_data.append({"task": in_progress_tasks[1], "worker": w3, "status": "accepted"})  # Võ Thị Linh
    applications_data.append({"task": in_progress_tasks[1], "worker": w2, "status": "rejected"}) # Nguyễn Minh Anh bị từ chối

# --- COMPLETED TASKS: Có đánh giá ---
# Task 6: Dọn dẹp văn phòng - Võ Thị Linh hoàn thành
if len(completed_tasks) > 0:
    applications_data.append({"task": completed_tasks[0], "worker": w3, "status": "accepted"})
    reviews_data.append({
        "task": completed_tasks[0],
        "reviewer": p3,  # Lê Hoàng Minh
        "reviewee": w3,   # Võ Thị Linh
        "rating": 5,
        "comment": "Làm việc rất cẩn thận, sạch sẽ và đúng giờ. Rất hài lòng với chất lượng dịch vụ. Sẽ thuê lại!",
    })

# Task 7: Mua sắm đồ tết - Nguyễn Minh Anh hoàn thành
if len(completed_tasks) > 1:
    applications_data.append({"task": completed_tasks[1], "worker": w2, "status": "accepted"})
    reviews_data.append({
        "task": completed_tasks[1],
        "reviewer": p4,  # Phạm Thị Hoa
        "reviewee": w2,   # Nguyễn Minh Anh
        "rating": 4,
        "comment": "Mua sắm đầy đủ, đúng theo danh sách. Giao hàng đúng hẹn. Tuy nhiên nên chọn trái cây tươi hơn chút.",
    })

# Task 8: Trông trẻ - Nguyễn Minh Anh hoàn thành
if len(completed_tasks) > 2:
    applications_data.append({"task": completed_tasks[2], "worker": w2, "status": "accepted"})
    reviews_data.append({
        "task": completed_tasks[2],
        "reviewer": p1,  # Nguyễn Văn
        "reviewee": w2,   # Nguyễn Minh Anh
        "rating": 5,
        "comment": "Rất yêu trẻ, biết cách chăm sóc và chơi với các bé. Bé nhỏ ngủ ngon, bé lớn rất thích chị. Tuyệt vời!",
    })

# Tạo ứng tuyển
created_apps = 0
for app_data in applications_data:
    obj, created = TaskApplication.objects.get_or_create(
        task=app_data["task"],
        worker=app_data["worker"],
        defaults={"status": app_data["status"]}
    )
    if created:
        created_apps += 1

# Tạo đánh giá
created_reviews = 0
for rev_data in reviews_data:
    obj, created = Review.objects.get_or_create(
        task=rev_data["task"],
        defaults={
            "reviewer": rev_data["reviewer"],
            "reviewee": rev_data["reviewee"],
            "rating": rev_data["rating"],
            "comment": rev_data["comment"],
        }
    )
    if created:
        created_reviews += 1

print(f"   Da tao {created_apps} ung tuyen va {created_reviews} danh gia.")
print()


# ============================================================
# KET QUA TONG KET
# ============================================================
print("=" * 60)
print("  SEED DATA HOAN TAT - SAN SANG CHO BAN GIAM KHAO!")
print("=" * 60)

print(f"\nThong ke database hien tai:")
print(f"  - Danh muc dich vu : {ServiceCategory.objects.count()} muc")
print(f"  - Tong nguoi dung  : {User.objects.count()} tai khoan")
print(f"  - Tong cong viec   : {Task.objects.count()} viec")
print(f"  - Tong ung tuyen   : {TaskApplication.objects.count()} lan")
print(f"  - Tong danh gia    : {Review.objects.count()} danh gia")

print(f"\n{'='*60}")
print(f"  DANH SACH TAI KHOAN DEMO (Mat khau chung: {TEST_PASSWORD})")
print(f"{'='*60}")

print(f"""
  +--- ADMIN (Truy cap /admin-dashboard/) -------------------+
  | Username: admin           | Ho ten: Admin EduCareLink     |
  +----------------------------------------------------------+

  +--- PHU HUYNH (Parent) ----------------------------------+
  | Username: phuhuynh_test   | Ho ten: Nguyen Van            |
  | Username: phuhuynh_lan    | Ho ten: Tran Thi Lan           |
  | Username: phuhuynh_minh   | Ho ten: Le Hoang Minh          |
  | Username: phuhuynh_hoa    | Ho ten: Pham Thi Hoa           |
  +----------------------------------------------------------+

  +--- CAREPARTNER (Da duyet) ------------------------------+
  | Username: sinhvien_test     | Ho ten: Tran Minh            |
  | Username: carepartner_anh   | Ho ten: Nguyen Minh Anh      |
  | Username: carepartner_linh  | Ho ten: Vo Thi Linh          |
  | Username: carepartner_duc   | Ho ten: Hoang Duc Thang      |
  +----------------------------------------------------------+

  +--- CAREPARTNER (Cho duyet) - Test chuc nang duyet ------+
  | Username: carepartner_mai   | Ho ten: Do Thi Mai           |
  +----------------------------------------------------------+

  +--- TAI KHOAN BI KHOA - Test chuc nang mo khoa ----------+
  | Username: locked_vipham     | Ho ten: Le Vi Pham           |
  +----------------------------------------------------------+
""")

print(f"Luong kiem tra cho ban giam khao:")
print(f"  1. Dang nhap Admin   -> admin / {TEST_PASSWORD}")
print(f"  2. Duyet Carepartner -> Xem carepartner_mai cho duyet")
print(f"  3. Khoa/Mo tai khoan -> Thao tac locked_vipham")
print(f"  4. Tuoc quyen CP     -> Tuoc quyen bat ky Carepartner")
print(f"  5. Phu huynh dang viec -> Dang nhap phuhuynh_*")
print(f"  6. Carepartner ung tuyen -> Dang nhap carepartner_*")
print(f"  7. AI Chatbot        -> Dung tu bat ky trang nao")
print(f"  8. Xem danh gia      -> Vao cong viec da hoan thanh")

# ===== RESET MẬT KHẨU CHO TẤT CẢ TÀI KHOẢN DEMO =====
print(f"\n[BONUS] Dang dong bo mat khau cho tat ca tai khoan demo...")
demo_usernames = [
    "admin", "phuhuynh_test", "phuhuynh_lan", "phuhuynh_minh", "phuhuynh_hoa",
    "sinhvien_test", "carepartner_anh", "carepartner_linh", "carepartner_duc",
    "carepartner_mai", "locked_vipham",
]
reset_count = 0
for uname in demo_usernames:
    try:
        user = User.objects.get(username=uname)
        user.set_password(TEST_PASSWORD)
        user.first_login = False  # Tài khoản demo không cần xem hướng dẫn
        user.save()
        reset_count += 1
    except User.DoesNotExist:
        pass
print(f"   -> Da dat lai mat khau cho {reset_count} tai khoan -> {TEST_PASSWORD}")

print(f"\nKhoi dong backend  : python manage.py runserver 0.0.0.0:8000")
print(f"Admin dashboard    : http://127.0.0.1:8000/admin-dashboard/")
print(f"Trang chu          : http://127.0.0.1:8000/")
print(f"=" * 60)
