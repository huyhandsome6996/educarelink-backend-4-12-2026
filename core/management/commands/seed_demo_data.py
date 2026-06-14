"""
Django Management Command: seed_demo_data
==========================================
Tạo toàn bộ dữ liệu mẫu cho ban giám khảo kiểm tra sản phẩm.

Chạy lệnh: python manage.py seed_demo_data

Dữ liệu được tạo:
  - 8 danh mục dịch vụ (ServiceCategory)
  - 1 tài khoản Admin
  - 4 tài khoản Phụ huynh (Parent)
  - 5 tài khoản Carepartner (Worker): 4 đã duyệt, 1 chờ duyệt
  - 1 tài khoản bị khoá (test chức năng mở khoá)
  - 10 công việc (Task) ở các trạng thái khác nhau
  - 15 ứng tuyển (TaskApplication)
  - 3 đánh giá (Review)

Mật khẩu chung cho tất cả: Demo@2026
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from core.models import User, ServiceCategory, Task, TaskApplication, Review


class Command(BaseCommand):
    help = 'Tạo toàn bộ dữ liệu mẫu cho ban giám khảo kiểm tra sản phẩm EduCareLink'

    def handle(self, *args, **options):
        TEST_PASSWORD = "Demo@2026"
        now = timezone.now()

        self.stdout.write("\n" + "=" * 60)
        self.stdout.write("  EDUCARELINK - TẠO DỮ LIỆU MẪU CHO BAN GIÁM KHẢO")
        self.stdout.write("=" * 60)

        # ===== 1. DANH MỤC DỊCH VỤ =====
        self.stdout.write("\n[1/6] Đang nạp danh mục dịch vụ...")

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
                defaults={"icon_name": cat_data["icon_name"], "description": cat_data["description"]}
            )
            if created:
                created_cats += 1
        self.stdout.write(f"   ✅ Đã tạo {created_cats} danh mục mới. Tổng: {ServiceCategory.objects.count()}")

        # ===== 2. ADMIN =====
        self.stdout.write("\n[2/6] Đang tạo tài khoản Admin...")

        admin_user, created = User.objects.get_or_create(
            username="admin",
            defaults={
                "role": "parent", "first_name": "Admin", "last_name": "EduCareLink",
                "email": "admin@educarelink.com", "phone_number": "0900000000",
                "is_staff": True, "is_superuser": True, "is_verified": True, "is_approved": True,
            }
        )
        if created:
            admin_user.set_password(TEST_PASSWORD)
            admin_user.save()
            self.stdout.write(f"   ✅ Tạo mới Admin: admin / {TEST_PASSWORD}")
        else:
            if not admin_user.is_staff or not admin_user.is_superuser:
                admin_user.is_staff = True
                admin_user.is_superuser = True
                admin_user.save()
            self.stdout.write(f"   ⏭️  Đã tồn tại admin")

        # ===== 3. PHỤ HUYNH =====
        self.stdout.write("\n[3/6] Đang tạo tài khoản Phụ huynh...")

        parents_data = [
            {"username": "phuhuynh_test", "first_name": "Văn", "last_name": "Nguyễn", "email": "nguyenvan@email.com", "phone_number": "0901234567", "address": "123 Đường Lê Lợi, Quận 1, TP.HCM"},
            {"username": "phuhuynh_lan", "first_name": "Thị Lan", "last_name": "Trần", "email": "tranlan@email.com", "phone_number": "0912345678", "address": "45 Đường Nguyễn Huệ, Quận 1, TP.HCM"},
            {"username": "phuhuynh_minh", "first_name": "Hoàng Minh", "last_name": "Lê", "email": "leminh@email.com", "phone_number": "0923456789", "address": "78 Đường Cách Mạng Tháng 8, Quận 3, TP.HCM"},
            {"username": "phuhuynh_hoa", "first_name": "Thị Hoa", "last_name": "Phạm", "email": "phamhoa@email.com", "phone_number": "0934567890", "address": "200 Đường Võ Văn Tần, Quận 3, TP.HCM"},
        ]

        parent_users = {}
        for p_data in parents_data:
            user, created = User.objects.get_or_create(
                username=p_data["username"],
                defaults={
                    "role": "parent", "first_name": p_data["first_name"], "last_name": p_data["last_name"],
                    "email": p_data["email"], "phone_number": p_data["phone_number"],
                    "address": p_data["address"], "is_verified": True, "is_approved": True,
                }
            )
            if created:
                user.set_password(TEST_PASSWORD)
                user.save()
                self.stdout.write(f"   ✅ {p_data['last_name']} {p_data['first_name']}: {p_data['username']}")
            else:
                if not user.is_approved:
                    user.is_approved = True
                    user.save()
                self.stdout.write(f"   ⏭️  Đã tồn tại {p_data['username']}")
            parent_users[p_data["username"]] = user

        # ===== 4. CAREPARTNER =====
        self.stdout.write("\n[4/6] Đang tạo tài khoản Carepartner...")

        workers_data = [
            {"username": "sinhvien_test", "first_name": "Minh", "last_name": "Trần", "email": "tranminh@email.com", "phone_number": "0981111111", "address": "Ký túc xá ĐH Quốc Gia, Thủ Đức, TP.HCM", "is_approved": True, "is_verified": True, "is_active": True, "qualifications": ["Sinh viên năm 3 ĐH Sư Phạm", "Chứng chỉ IELTS 6.5"], "ai_profile_summary": "Sinh viên năm 3 ngành Sư phạm Toán, có 2 năm kinh nghiệm dạy kèm. Đánh giá 4.8/5 sao từ 15 phụ huynh."},
            {"username": "carepartner_anh", "first_name": "Minh Anh", "last_name": "Nguyễn", "email": "nguyenanh@email.com", "phone_number": "0982222222", "address": "256 Đường Lê Văn Việt, Quận 9, TP.HCM", "is_approved": True, "is_verified": True, "is_active": True, "qualifications": ["Cử nhân Sư Phạm Mầm Non", "Chứng chỉ sơ cấp cứu"], "ai_profile_summary": "Cử nhân Sư phạm Mầm Non, 3 năm kinh nghiệm trông trẻ và đón trẻ. Nhiệt tình, yêu trẻ, có chứng chỉ sơ cấp cứu."},
            {"username": "carepartner_linh", "first_name": "Thị Linh", "last_name": "Võ", "email": "volinh@email.com", "phone_number": "0983333333", "address": "12 Đường Trần Não, Quận 2, TP.HCM", "is_approved": True, "is_verified": True, "is_active": True, "qualifications": ["Sinh viên năm cuối ĐH Kinh Tế", "Chứng chỉ nấu ăn Việt-Á"], "ai_profile_summary": "Sinh viên năm cuối ĐH Kinh Tế, phụ việc nhà và nấu ăn 2 năm. Nấu ăn ngon, gọn gàng, chu đáo."},
            {"username": "carepartner_duc", "first_name": "Đức Thắng", "last_name": "Hoàng", "email": "hoangduc@email.com", "phone_number": "0984444444", "address": "88 Đường Phạm Văn Đồng, Thủ Đức, TP.HCM", "is_approved": True, "is_verified": True, "is_active": True, "qualifications": ["Sinh viên năm 2 ĐH Bách Khoa", "Chứng chỉ gia sư Toán-Lý"], "ai_profile_summary": "Sinh viên Bách Khoa, chuyên gia sư Toán-Lý cho học sinh cấp 2-3. Có phương pháp dạy dễ hiểu, kiên nhẫn."},
            {"username": "carepartner_mai", "first_name": "Thị Mai", "last_name": "Đỗ", "email": "domai@email.com", "phone_number": "0985555555", "address": "56 Đường Nguyễn Oanh, Gò Vấp, TP.HCM", "is_approved": False, "is_verified": False, "is_active": True, "qualifications": [], "ai_profile_summary": ""},
        ]

        worker_users = {}
        for w_data in workers_data:
            user, created = User.objects.get_or_create(
                username=w_data["username"],
                defaults={
                    "role": "worker", "first_name": w_data["first_name"], "last_name": w_data["last_name"],
                    "email": w_data["email"], "phone_number": w_data["phone_number"],
                    "address": w_data["address"], "is_approved": w_data["is_approved"],
                    "is_verified": w_data["is_verified"], "is_active": w_data["is_active"],
                    "qualifications": w_data["qualifications"], "ai_profile_summary": w_data["ai_profile_summary"],
                }
            )
            if created:
                user.set_password(TEST_PASSWORD)
                user.save()
                trang_thai = "CHỜ DUYỆT" if not w_data["is_approved"] else "Đã duyệt"
                self.stdout.write(f"   ✅ {w_data['last_name']} {w_data['first_name']}: {w_data['username']} ({trang_thai})")
            else:
                updated = False
                for field in ["is_approved", "is_verified", "is_active", "qualifications", "ai_profile_summary"]:
                    if getattr(user, field) != w_data[field]:
                        setattr(user, field, w_data[field])
                        updated = True
                if updated:
                    user.save()
                self.stdout.write(f"   ⏭️  Đã tồn tại {w_data['username']}")
            worker_users[w_data["username"]] = user

        # Tài khoản bị khoá
        locked_user, created = User.objects.get_or_create(
            username="locked_vipham",
            defaults={
                "role": "parent", "first_name": "Vi Phạm", "last_name": "Lê",
                "email": "vipham@email.com", "phone_number": "0986666666",
                "address": "999 Đường Không Tồn Tại, Quận 10, TP.HCM",
                "is_verified": True, "is_approved": True, "is_active": False,
            }
        )
        if created:
            locked_user.set_password(TEST_PASSWORD)
            locked_user.save()
            self.stdout.write(f"   ✅ Lê Vi Phạm: locked_vipham (BỊ KHOÁ)")
        else:
            if locked_user.is_active:
                locked_user.is_active = False
                locked_user.save()
            self.stdout.write(f"   ⏭️  Đã tồn tại locked_vipham (BỊ KHOÁ)")

        # ===== 5. CÔNG VIỆC =====
        self.stdout.write("\n[5/6] Đang tạo công việc mẫu...")

        try:
            cat_giasu = ServiceCategory.objects.get(name="Gia sư")
            cat_dontre = ServiceCategory.objects.get(name="Đón trẻ")
            cat_dondep = ServiceCategory.objects.get(name="Dọn dẹp nhà cửa")
            cat_trongtre = ServiceCategory.objects.get(name="Trông trẻ")
            cat_muasam = ServiceCategory.objects.get(name="Mua sắm hộ")
            cat_nauan = ServiceCategory.objects.get(name="Nấu ăn")
            cat_hotroAI = ServiceCategory.objects.get(name="Hỗ trợ AI")
        except ServiceCategory.DoesNotExist:
            self.stdout.write("   ❌ Không tìm thấy danh mục!")
            return

        p1 = parent_users["phuhuynh_test"]
        p2 = parent_users["phuhuynh_lan"]
        p3 = parent_users["phuhuynh_minh"]
        p4 = parent_users["phuhuynh_hoa"]
        w1 = worker_users["sinhvien_test"]
        w2 = worker_users["carepartner_anh"]
        w3 = worker_users["carepartner_linh"]
        w4 = worker_users["carepartner_duc"]

        tasks_data = [
            {"title": "Cần gia sư dạy Toán lớp 8 - 2 buổi/tuần", "description": "Bé nhà tôi học yếu môn Toán, cần gia sư kiên nhẫn, phương pháp dạy tốt. Ưu tiên sinh viên năm 3-4 trở lên. Dạy tại nhà vào tối thứ 3 và thứ 5 mỗi tuần.", "price": 200000, "category": cat_giasu, "location": "123 Đường Nguyễn Văn Cừ, Quận 5, TP.HCM", "scheduled_time": now + timedelta(days=3), "status": "open", "parent": p1},
            {"title": "[GẤP] Đón bé lớp 1 từ trường Tiểu học Lê Văn Tám", "description": "Tôi cần người đón bé gái 6 tuổi từ trường về nhà lúc 11h trưa các ngày trong tuần. Nhà cách trường khoảng 2km.", "price": 150000, "category": cat_dontre, "location": "45 Đường Phan Đình Phùng, Phú Nhuận, TP.HCM", "scheduled_time": now + timedelta(days=1), "status": "open", "parent": p2},
            {"title": "Dọn dẹp căn hộ 60m2 cuối tuần", "description": "Căn hộ 2 phòng ngủ, cần lau dọn toàn bộ sàn nhà, vệ sinh nhà bếp và 1 phòng tắm. Dụng cụ vệ sinh tôi đã chuẩn bị sẵn.", "price": 250000, "category": cat_dondep, "location": "Chung cư Vinhomes Grand Park, Quận 9, TP.HCM", "scheduled_time": now + timedelta(days=5), "status": "open", "parent": p3},
            {"title": "Trông bé 3 tuổi buổi sáng thứ 7", "description": "Vợ chồng tôi có lịch họp vào sáng thứ 7, cần người trông bé từ 8h-12h. Bé ngoan, đã quen với người lạ.", "price": 180000, "category": cat_trongtre, "location": "78 Đường Hoàng Diệu 2, Thủ Đức, TP.HCM", "scheduled_time": now + timedelta(days=2), "status": "open", "parent": p4},
            {"title": "Gia sư Tiếng Anh lớp 6 - 3 buổi/tuần", "description": "Bé mới chuyển sang chương trình song ngữ, cần gia sư Tiếng Anh phụ đạo 3 buổi/tuần. Yêu cầu phát âm chuẩn, có chứng chỉ IELTS hoặc TOEFL.", "price": 250000, "category": cat_giasu, "location": "200 Đường Nam Kỳ Khởi Nghĩa, Quận 1, TP.HCM", "scheduled_time": now + timedelta(days=7), "status": "in_progress", "parent": p1},
            {"title": "Nấu ăn gia đình 5 người - 5 ngày/tuần", "description": "Cần người nấu bữa tối cho gia đình 5 người từ thứ 2 đến thứ 6 hàng tuần. Yêu cầu nấu ăn ngon, biết nấu cả món Việt và món Á.", "price": 350000, "category": cat_nauan, "location": "56 Đường Nguyễn Trãi, Quận 5, TP.HCM", "scheduled_time": now + timedelta(days=4), "status": "in_progress", "parent": p2},
            {"title": "Dọn dẹp văn phòng 100m2 cuối tháng", "description": "Văn phòng công ty cần lau dọn tổng vệ sinh cuối tháng. Bao gồm 4 phòng làm việc, 1 phòng họp, 1 nhà bếp và 2 nhà vệ sinh.", "price": 500000, "category": cat_dondep, "location": "Tòa nhà Viettel, Quận 10, TP.HCM", "scheduled_time": now - timedelta(days=5), "status": "completed", "parent": p3},
            {"title": "Mua sắm đồ tết cho gia đình", "description": "Cần người đi chợ Bến Thành mua sắm đồ tết theo danh sách: hoa mai, bánh tét, mứt, đồ thờ cúng. Giao hàng tận nhà.", "price": 200000, "category": cat_muasam, "location": "Chợ Bến Thành, Quận 1, TP.HCM", "scheduled_time": now - timedelta(days=10), "status": "completed", "parent": p4},
            {"title": "Trông trẻ tối cuối tuần - 5 tiếng", "description": "Vợ chồng tôi đi dự tiệc tối thứ 7, cần người trông 2 bé (4 tuổi và 7 tuổi) tại nhà.", "price": 300000, "category": cat_trongtre, "location": "300 Đường Nguyễn Đình Chiểu, Quận 3, TP.HCM", "scheduled_time": now - timedelta(days=8), "status": "completed", "parent": p1},
            {"title": "Hỗ trợ AI học tập cho bé lớp 3", "description": "Tìm người có kinh nghiệm sử dụng các công cụ AI giáo dục để hỗ trợ con tôi học tập.", "price": 220000, "category": cat_hotroAI, "location": "150 Đường Lý Thường Kiệt, Quận Tân Bình, TP.HCM", "scheduled_time": now - timedelta(days=3), "status": "cancelled", "parent": p2},
        ]

        created_tasks = 0
        task_objects = []
        for task_data in tasks_data:
            parent = task_data.pop("parent")
            obj, created = Task.objects.get_or_create(
                title=task_data["title"], parent=parent, defaults=task_data
            )
            if created:
                created_tasks += 1
            task_objects.append(obj)
        self.stdout.write(f"   ✅ Đã tạo {created_tasks} công việc mới. Tổng: {Task.objects.count()}")

        # ===== 6. ỨNG TUYỂN & ĐÁNH GIÁ =====
        self.stdout.write("\n[6/6] Đang tạo ứng tuyển và đánh giá...")

        TaskApplication.objects.all().delete()
        Review.objects.all().delete()

        open_tasks = [t for t in task_objects if t.status == "open"]
        in_progress_tasks = [t for t in task_objects if t.status == "in_progress"]
        completed_tasks = [t for t in task_objects if t.status == "completed"]

        applications_data = []
        reviews_data = []

        # OPEN: Nhiều người ứng tuyển
        if len(open_tasks) > 0:
            applications_data += [
                {"task": open_tasks[0], "worker": w1, "status": "pending"},
                {"task": open_tasks[0], "worker": w4, "status": "pending"},
                {"task": open_tasks[0], "worker": w2, "status": "pending"},
            ]
        if len(open_tasks) > 1:
            applications_data += [
                {"task": open_tasks[1], "worker": w2, "status": "pending"},
                {"task": open_tasks[1], "worker": w3, "status": "pending"},
            ]
        if len(open_tasks) > 2:
            applications_data += [
                {"task": open_tasks[2], "worker": w3, "status": "pending"},
            ]
        if len(open_tasks) > 3:
            applications_data += [
                {"task": open_tasks[3], "worker": w2, "status": "pending"},
                {"task": open_tasks[3], "worker": w3, "status": "pending"},
            ]

        # IN_PROGRESS: Đã chấp nhận
        if len(in_progress_tasks) > 0:
            applications_data += [
                {"task": in_progress_tasks[0], "worker": w1, "status": "accepted"},
                {"task": in_progress_tasks[0], "worker": w4, "status": "rejected"},
            ]
        if len(in_progress_tasks) > 1:
            applications_data += [
                {"task": in_progress_tasks[1], "worker": w3, "status": "accepted"},
                {"task": in_progress_tasks[1], "worker": w2, "status": "rejected"},
            ]

        # COMPLETED: Có đánh giá
        if len(completed_tasks) > 0:
            applications_data.append({"task": completed_tasks[0], "worker": w3, "status": "accepted"})
            reviews_data.append({"task": completed_tasks[0], "reviewer": p3, "reviewee": w3, "rating": 5, "comment": "Làm việc rất cẩn thận, sạch sẽ và đúng giờ. Rất hài lòng với chất lượng dịch vụ. Sẽ thuê lại!"})
        if len(completed_tasks) > 1:
            applications_data.append({"task": completed_tasks[1], "worker": w2, "status": "accepted"})
            reviews_data.append({"task": completed_tasks[1], "reviewer": p4, "reviewee": w2, "rating": 4, "comment": "Mua sắm đầy đủ, đúng theo danh sách. Giao hàng đúng hẹn. Tuy nhiên nên chọn trái cây tươi hơn chút."})
        if len(completed_tasks) > 2:
            applications_data.append({"task": completed_tasks[2], "worker": w2, "status": "accepted"})
            reviews_data.append({"task": completed_tasks[2], "reviewer": p1, "reviewee": w2, "rating": 5, "comment": "Rất yêu trẻ, biết cách chăm sóc và chơi với các bé. Bé nhỏ ngủ ngon, bé lớn rất thích chị. Tuyệt vời!"})

        created_apps = 0
        for app_data in applications_data:
            obj, created = TaskApplication.objects.get_or_create(
                task=app_data["task"], worker=app_data["worker"], defaults={"status": app_data["status"]}
            )
            if created:
                created_apps += 1

        created_reviews = 0
        for rev_data in reviews_data:
            obj, created = Review.objects.get_or_create(
                task=rev_data["task"],
                defaults={
                    "reviewer": rev_data["reviewer"], "reviewee": rev_data["reviewee"],
                    "rating": rev_data["rating"], "comment": rev_data["comment"],
                }
            )
            if created:
                created_reviews += 1

        self.stdout.write(f"   ✅ Đã tạo {created_apps} ứng tuyển và {created_reviews} đánh giá")

        # ===== TỔNG KẾT =====
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write("  SEED DATA HOÀN TẤT - SẴN SÀNG CHO BAN GIÁM KHẢO!")
        self.stdout.write("=" * 60)
        self.stdout.write(f"""
  Thống kê:
    - Danh mục dịch vụ: {ServiceCategory.objects.count()}
    - Tổng người dùng : {User.objects.count()}
    - Tổng công việc  : {Task.objects.count()}
    - Tổng ứng tuyển  : {TaskApplication.objects.count()}
    - Tổng đánh giá   : {Review.objects.count()}

  Tài khoản Demo (Mật khẩu chung: {TEST_PASSWORD}):

  ╔══════════════════════════════════════════════════════════╗
  ║ ADMIN (Truy cập /admin-dashboard/)                      ║
  ╠══════════════════════════════════════════════════════════╣
  ║ admin              | Admin EduCareLink                   ║
  ╠══════════════════════════════════════════════════════════╣
  ║ PHỤ HUYNH                                               ║
  ╠══════════════════════════════════════════════════════════╣
  ║ phuhuynh_test      | Nguyễn Văn                          ║
  ║ phuhuynh_lan       | Trần Thị Lan                        ║
  ║ phuhuynh_minh      | Lê Hoàng Minh                       ║
  ║ phuhuynh_hoa       | Phạm Thị Hoa                        ║
  ╠══════════════════════════════════════════════════════════╣
  ║ CAREPARTNER (Đã duyệt)                                  ║
  ╠══════════════════════════════════════════════════════════╣
  ║ sinhvien_test       | Trần Minh                          ║
  ║ carepartner_anh     | Nguyễn Minh Anh                    ║
  ║ carepartner_linh    | Võ Thị Linh                        ║
  ║ carepartner_duc     | Hoàng Đức Thắng                    ║
  ╠══════════════════════════════════════════════════════════╣
  ║ CAREPARTNER (Chờ duyệt) - Test duyệt                    ║
  ╠══════════════════════════════════════════════════════════╣
  ║ carepartner_mai     | Đỗ Thị Mai                         ║
  ╠══════════════════════════════════════════════════════════╣
  ║ TÀI KHOẢN BỊ KHOÁ - Test mở khoá                       ║
  ╠══════════════════════════════════════════════════════════╣
  ║ locked_vipham       | Lê Vi Phạm                         ║
  ╚══════════════════════════════════════════════════════════╝
""")

        # ===== RESET MẬT KHẨU CHO TẤT CẢ TÀI KHOẢN DEMO =====
        self.stdout.write("\n[BONUS] Đang đồng bộ mật khẩu cho tất cả tài khoản demo...")
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
        self.stdout.write(f"   ✅ Đã đặt lại mật khẩu cho {reset_count} tài khoản → {TEST_PASSWORD}")
