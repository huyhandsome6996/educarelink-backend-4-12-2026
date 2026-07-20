"""
Django Management Command: seed_demo_data  (BẢN RESET TOÀN BỘ)
=================================================================
Thực hiện RESET dữ liệu mẫu cho ban giám khảo:
  1. Xoá TOÀN BỘ dữ liệu demo (Tasks, Applications, Reviews, Notifications,
     Credentials, ProfileChangeRequests, Tracking, Payments, Moderation).
  2. Xoá MỌI user KHÔNG nằm trong danh sách bảo vệ.
  3. GIỮ NGUYÊN 3 tài khoản đã tạo: admin / phuhuynh_test / sinhvien_test
     (không đổi password, không đổi profile, không reset first_login).
  4. Tạo lại dữ liệu mẫu MỚI (tên user, task khác bản cũ) để giám khảo demo.

Chạy: python manage.py seed_demo_data
Idempotent: chạy nhiều lần vẫn an toàn (luôn reset về cùng 1 state).
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from core.models import (
    User, ServiceCategory, Task, TaskApplication, Review,
    CredentialSubmission, Notification, ProfileChangeRequest,
)

# ── 3 TÀI KHOẢN BẢO VỆ — TUYỆT ĐỐI KHÔNG ĐỤNG ──────────────────────
PROTECTED_USERNAMES = {"admin", "phuhuynh_test", "sinhvien_test"}

TEST_PASSWORD = "Demo@2026"


class Command(BaseCommand):
    help = 'RESET toàn bộ dữ liệu mẫu cho ban giám khảo. Giữ 3 tài khoản admin/phuhuynh_test/sinhvien_test.'

    def handle(self, *args, **options):
        now = timezone.now()

        self.stdout.write("\n" + "=" * 64)
        self.stdout.write("  EDUCARELINK — RESET DU LIEU MAU (BAN GIAM KHAO)")
        self.stdout.write("=" * 64)
        self.stdout.write(f"  Tai khoan BAO VE (khong duoc xoa): {sorted(PROTECTED_USERNAMES)}")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 0: XÓA TOÀN BỘ DỮ LIỆU DEMO
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[0/7] Dang xoa toan bo du lieu demo cu...")

        # Cross-app imports (có thể có app chưa cài khi chạy local)
        deleted_counts = {}

        def safe_delete(label, queryset):
            try:
                cnt = queryset.count()
                queryset.delete()
                deleted_counts[label] = cnt
                self.stdout.write(f"   - Xoa {cnt:>5} {label}")
            except Exception as e:
                self.stdout.write(f"   ! Bo qua {label}: {e}")

        # Moderation
        try:
            from moderation.models import TaskModeration, Complaint, ComplaintEvidence
            safe_delete("ComplaintEvidence", ComplaintEvidence.objects.all())
            safe_delete("Complaint", Complaint.objects.all())
            safe_delete("TaskModeration", TaskModeration.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Moderation module khong san sang: {e}")

        # Payments
        try:
            from payments.models import Payment, CommissionSettlement, PaymentLog
            safe_delete("PaymentLog", PaymentLog.objects.all())
            safe_delete("CommissionSettlement", CommissionSettlement.objects.all())
            safe_delete("Payment", Payment.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Payments module khong san sang: {e}")

        # Tracking
        try:
            from tracking.models import LocationConsent, LiveLocation, LocationHistory, SOSAlert
            safe_delete("SOSAlert", SOSAlert.objects.all())
            safe_delete("LocationHistory", LocationHistory.objects.all())
            safe_delete("LiveLocation", LiveLocation.objects.all())
            safe_delete("LocationConsent", LocationConsent.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Tracking module khong san sang: {e}")

        # Core
        safe_delete("Review", Review.objects.all())
        safe_delete("TaskApplication", TaskApplication.objects.all())
        safe_delete("Notification", Notification.objects.all())
        safe_delete("ProfileChangeRequest", ProfileChangeRequest.objects.all())
        safe_delete("CredentialSubmission", CredentialSubmission.objects.all())
        safe_delete("Task", Task.objects.all())

        # Xoá MỌI user không nằm trong danh sách bảo vệ
        old_users = User.objects.exclude(username__in=PROTECTED_USERNAMES)
        old_count = old_users.count()
        protected_kept = User.objects.filter(username__in=PROTECTED_USERNAMES).count()
        old_users.delete()
        self.stdout.write(f"   - Xoa {old_count:>5} User (non-protected)")
        self.stdout.write(f"   - GIU  {protected_kept:>5} User (protected: admin/phuhuynh_test/sinhvien_test)")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 1: DANH MỤC DỊCH VỤ (giữ nguyên nếu đã có)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[1/7] Dang nap danh muc dich vu...")

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
        self.stdout.write(f"   + Tao {created_cats} danh muc moi. Tong: {ServiceCategory.objects.count()}")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 2: KIỂM TRA 3 TÀI KHOẢN BẢO VỆ (không tạo mới, không sửa)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[2/7] Kiem tra 3 tai khoan bao ve...")

        for uname in sorted(PROTECTED_USERNAMES):
            try:
                u = User.objects.get(username=uname)
                role_vi = "Admin" if u.is_staff else ("Phu huynh" if u.role == "parent" else "Carepartner")
                self.stdout.write(f"   [DA TON TAI] {uname:18s} ({role_vi}) — KHONG THAY DOI")
            except User.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"   [THIEU] {uname} — tai khoan nay chua duoc tao, bo qua."))

        # Lấy reference tới các tài khoản bảo vệ (nếu có) để gán làm parent/worker cho task mẫu
        admin_ref = User.objects.filter(username="admin", is_staff=True).first()
        parent_ref = User.objects.filter(username="phuhuynh_test", role="parent").first()
        worker_ref = User.objects.filter(username="sinhvien_test", role="worker").first()

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 3: TẠO PHỤ HUYNH MỚI (4 tài khoản — tên khác bản cũ)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[3/7] Dang tao Phu huynh moi...")

        parents_data = [
            {"username": "phuhuynh_baolinh", "first_name": "Bảo Lĩnh", "last_name": "Phạm", "email": "baolinh.pham@email.com", "phone_number": "0901002003", "address": "22 Ung Văn Khiên, Bình Thạnh, TP.HCM"},
            {"username": "phuhuynh_minhkhoi", "first_name": "Minh Khôi", "last_name": "Đặng", "email": "minhkhoi.dang@email.com", "phone_number": "0901002004", "address": "8 Xa Lộ Hà Nội, Thủ Đức, TP.HCM"},
            {"username": "phuhuynh_yenchi", "first_name": "Yến Chi", "last_name": "Hồ", "email": "yenchi.ho@email.com", "phone_number": "0901002005", "address": "156 Nguyễn Đình Chiểu, Quận 3, TP.HCM"},
            {"username": "phuhuynh_congvinh", "first_name": "Công Vinh", "last_name": "Trương", "email": "congvinh.truong@email.com", "phone_number": "0901002006", "address": "40 Lý Thường Kiệt, Quận 10, TP.HCM"},
        ]

        parent_users = {}
        for p_data in parents_data:
            user = User.objects.create_user(
                username=p_data["username"],
                password=TEST_PASSWORD,
                role="parent",
                first_name=p_data["first_name"],
                last_name=p_data["last_name"],
                email=p_data["email"],
                phone_number=p_data["phone_number"],
                address=p_data["address"],
                is_verified=True,
                is_approved=True,
                first_login=False,
            )
            parent_users[p_data["username"]] = user
            self.stdout.write(f"   + {p_data['last_name']} {p_data['first_name']}: {p_data['username']}")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 4: TẠO CAREPARTNER MỚI (4 đã duyệt + 1 chờ duyệt)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[4/7] Dang tao Carepartner moi...")

        workers_data = [
            {"username": "carepartner_tuankiet", "first_name": "Tuấn Kiệt", "last_name": "Lương", "email": "tuankiet.luong@email.com", "phone_number": "0987001001", "address": "KTX Khu B ĐHQG, Thủ Đức, TP.HCM", "is_approved": True, "qualifications": ["Sinh viên năm 3 ĐH Sư Phạm Toán", "Chứng chỉ IELTS 7.0"], "ai_profile_summary": "Sinh viên Sư phạm Toán năm 3, 2 năm kinh nghiệm gia sư. Kiên nhẫn, có phương pháp dạy trực quan. Đánh giá 4.9/5 từ 18 phụ huynh."},
            {"username": "carepartner_hoango", "first_name": "Hoàng Ngân", "last_name": "Đỗ", "email": "hoango.do@email.com", "phone_number": "0987001002", "address": "Đường Lê Văn Sĩ, Tân Phú, TP.HCM", "is_approved": True, "qualifications": ["Cử nhân Sư Phạm Mầm Non", "Chứng chỉ Sơ cấp cứu", "Chứng chỉ Montessori cơ bản"], "ai_profile_summary": "Cử nhân Sư phạm Mầm Non, 4 năm kinh nghiệm trông trẻ. Có chứng chỉ sơ cấp cứu và Montessori. Yêu trẻ, nhiệt tình."},
            {"username": "carepartner_mylinh", "first_name": "Mỹ Linh", "last_name": "Trần", "email": "mylinh.tran@email.com", "phone_number": "0987001003", "address": "Đường Phan Xích Long, Phú Nhuận, TP.HCM", "is_approved": True, "qualifications": ["Sinh viên năm cuối ĐH Kinh Tế", "Chứng chỉ nấu ăn Việt–Á"], "ai_profile_summary": "Sinh viên năm cuối ĐH Kinh Tế, 2 năm phụ việc nhà + nấu ăn. Nấu ăn ngon, gọn gàng, chu đáo với trẻ nhỏ."},
            {"username": "carepartner_phuoc", "first_name": "Phước", "last_name": "Nguyễn", "email": "phuoc.nguyen@email.com", "phone_number": "0987001004", "address": "Đường Tô Ký, Quận 12, TP.HCM", "is_approved": True, "qualifications": ["Sinh viên năm 2 ĐH Bách Khoa", "Chứng chỉ gia sư Lý–Hóa"], "ai_profile_summary": "Sinh viên Bách Khoa, chuyên gia sư Lý–Hóa cấp 3. Dạy dễ hiểu, có bài tập thực hành."},
            {"username": "carepartner_pending_hai", "first_name": "Hải", "last_name": "Bùi", "email": "hai.bui@email.com", "phone_number": "0987001005", "address": "Đường Trường Chinh, Tân Phú, TP.HCM", "is_approved": False, "qualifications": [], "ai_profile_summary": ""},
        ]

        worker_users = {}
        for w_data in workers_data:
            user = User.objects.create_user(
                username=w_data["username"],
                password=TEST_PASSWORD,
                role="worker",
                first_name=w_data["first_name"],
                last_name=w_data["last_name"],
                email=w_data["email"],
                phone_number=w_data["phone_number"],
                address=w_data["address"],
                is_approved=w_data["is_approved"],
                is_verified=w_data["is_approved"],
                is_active=True,
                qualifications=w_data["qualifications"],
                ai_profile_summary=w_data["ai_profile_summary"],
                first_login=False,
            )
            worker_users[w_data["username"]] = user
            trang_thai = "CHO DUYET" if not w_data["is_approved"] else "Da duyet"
            self.stdout.write(f"   + {w_data['last_name']} {w_data['first_name']}: {w_data['username']} ({trang_thai})")

        # Tài khoản bị khoá (test mở khoá)
        locked_user = User.objects.create_user(
            username="locked_test_2",
            password=TEST_PASSWORD,
            role="parent",
            first_name="Thị Hà",
            last_name="Vũ",
            email="ha.vu@email.com",
            phone_number="0987001999",
            address="Đường Sư Vạn Hạnh, Quận 10, TP.HCM",
            is_verified=True,
            is_approved=True,
            is_active=False,
            first_login=False,
        )
        self.stdout.write(f"   + {locked_user.last_name} {locked_user.first_name}: locked_test_2 (BI KHOA — test mo khoa)")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 5: TẠO CÔNG VIỆC MỚI (10 việc — tiêu đề/mô tả khác bản cũ)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[5/7] Dang tao cong viec moi...")

        cat_giasu = ServiceCategory.objects.get(name="Gia sư")
        cat_dontre = ServiceCategory.objects.get(name="Đón trẻ")
        cat_dondep = ServiceCategory.objects.get(name="Dọn dẹp nhà cửa")
        cat_trongtre = ServiceCategory.objects.get(name="Trông trẻ")
        cat_muasam = ServiceCategory.objects.get(name="Mua sắm hộ")
        cat_nauan = ServiceCategory.objects.get(name="Nấu ăn")
        cat_hotroAI = ServiceCategory.objects.get(name="Hỗ trợ AI")

        p1 = parent_users["phuhuynh_baolinh"]
        p2 = parent_users["phuhuynh_minhkhoi"]
        p3 = parent_users["phuhuynh_yenchi"]
        p4 = parent_users["phuhuynh_congvinh"]
        # ⚡ p_test = phuhuynh_test (tài khoản bảo vệ — thêm tasks để demo)
        p_test = parent_ref  # Already fetched at line 144

        w1 = worker_users["carepartner_tuankiet"]
        w2 = worker_users["carepartner_hoango"]
        w3 = worker_users["carepartner_mylinh"]
        w4 = worker_users["carepartner_phuoc"]
        # ⚡ w_test = sinhvien_test (tài khoản bảo vệ — gán làm worker cho tasks của p_test)
        w_test = worker_ref  # Already fetched at line 145

        tasks_data = [
            # OPEN (4)
            {"title": "Gia su Vat Ly lop 10 - buoi toi thu 4 & thu 6", "description": "Be gai hoc yeu Vat Ly, can gia su kien nhan, co phuong phap day hieu qua. Day tai nha 1.5 tieng/buoi. Uu tien sinh vien Bach Khoa hoac Su Pham.", "price": 220000, "category": cat_giasu, "location": "Khu Can Ho Vinhomes Central Park, Binh Thanh, TP.HCM", "scheduled_time": now + timedelta(days=3), "status": "open", "parent": p1},
            {"title": "[GAP] Don be lop 2 chieu thu 7 tai truong Nguyen Du", "description": "Can nguoi don be trai 7 tuoi chieu thu 7 luc 11h30. Nha cach truong 1.5km. Yeu cau co xe may, bang lai A1, than thien voi tre em.", "price": 120000, "category": cat_dontre, "location": "Truong Tieu Hoc Nguyen Du, Quan 10, TP.HCM", "scheduled_time": now + timedelta(days=2), "status": "open", "parent": p2},
            {"title": "Don dep can ho 2 phong ngu cuoi tuan", "description": "Can ho 75m2, can lau san, ve sinh bep va 2 phong tam. Cong viec khoang 4 tieng sang thu 7. Dung cu ve sinh toi chuan bi san.", "price": 280000, "category": cat_dondep, "location": "Chung cu The Manor, Quan 1, TP.HCM", "scheduled_time": now + timedelta(days=5), "status": "open", "parent": p3},
            {"title": "Trong be 4 tuoi buoi chieu CN", "description": "Vc toi di du sinh nhat ban, can nguoi trong be 4 tuoi tai nha tu 13h-18h CN. Be ngoan, da quen nguoi la. Co do an va do choi san.", "price": 200000, "category": cat_trongtre, "location": "Hem 123 Le Van Sy, Phu Nhuan, TP.HCM", "scheduled_time": now + timedelta(days=4), "status": "open", "parent": p4},
            # IN_PROGRESS (2)
            {"title": "Gia su Hoa lop 11 - 2 buoi/tuan", "description": "Be chuyen sang khoi A, can phu dao Hoa nang cao. Day thu 3 & thu 5 toi, 19h-20h30. Yeu cau co phuong phap day de hieu, giai de mau.", "price": 250000, "category": cat_giasu, "location": "Duong Nguyen Thai Hoc, Quan 1, TP.HCM", "scheduled_time": now + timedelta(days=7), "status": "in_progress", "parent": p1},
            {"title": "Nau com toi cho gia dinh 4 nguoi", "description": "Can nguoi nau com toi thu 2-den-thu 6 hang tuan cho 4 nguoi (2 nguoi lon, 2 tre em). Biet nau mon Viet va mon chay. Nguyen lieu toi chuan bi.", "price": 320000, "category": cat_nauan, "location": "Duong Nguyen Van Troi, Phu Nhuan, TP.HCM", "scheduled_time": now + timedelta(days=4), "status": "in_progress", "parent": p3},
            # COMPLETED (3)
            {"title": "Don dep nha 4 tang cuoi thang", "description": "Nha pho 4 tang can tong ve sinh: lau san, ve sinh bep, 3 phong tam. Yeu cu lam can than.", "price": 600000, "category": cat_dondep, "location": "Duong Nguyen Dinh Chieu, Quan 3, TP.HCM", "scheduled_time": now - timedelta(days=6), "status": "completed", "parent": p2},
            {"title": "Di cho mua do dung sinh nhat be", "description": "Can nguoi den coopmart mua banh kem, baloon, do trang tri sinh nhat theo danh sach. Giao hang tan nha. Chi phi chuan bi truoc.", "price": 180000, "category": cat_muasam, "location": "Coopmart Nguyen Kiem, Phu Nhuan, TP.HCM", "scheduled_time": now - timedelta(days=11), "status": "completed", "parent": p4},
            {"title": "Trong 2 be toi thu 7 - 4 tieng", "description": "Vc di an toi sinh nhat, can nguoi trong 2 be (5 tuoi va 8 tuoi) tu 18h-22h. Be lon tu choi, be nho can cho an va ru ngu.", "price": 350000, "category": cat_trongtre, "location": "Duong Cach Mang Thang 8, Quan Tan Binh, TP.HCM", "scheduled_time": now - timedelta(days=9), "status": "completed", "parent": p1},
            # CANCELLED (1)
            {"title": "Ho tro AI hoc tap cho be lop 4", "description": "Tim nguoi biet dung ChatGPT/cac app AI de ho tro be hoc tap. Day be cach dung AI an toan, hieu qua.", "price": 240000, "category": cat_hotroAI, "location": "Duong Truong Chinh, Quan Tan Binh, TP.HCM", "scheduled_time": now - timedelta(days=2), "status": "cancelled", "parent": p4},
        ]

        # ⚡ THÊM 2026-07-21: Tasks cho phuhuynh_test (trước đây 0 tasks)
        # Giúp phụ huynh test có dữ liệu demo ngay khi đăng nhập
        if p_test:
            tasks_data.extend([
                # OPEN (2) — phuhuynh_test đăng 2 việc đang tìm người
                {"title": "Gia su Tieng Anh lop 6 - 3 buoi/tuan", "description": "Be trai lop 6 can phu dao Tieng Anh, phat am. Day thu 2, 4, 6 toi 19h-20h30. Yeu cau sinh vien CĐ Su Pham Ngoai Ngu hoac IELTS 6.5+.", "price": 250000, "category": cat_giasu, "location": "Duong Le Loi, Quan 1, TP.HCM", "scheduled_time": now + timedelta(days=2), "status": "open", "parent": p_test},
                {"title": "Don dep can ho cuoi tuan - 3 tieng", "description": "Can ho 60m2 can lau san, ve sinh bep, 1 phong tam. Lam sang thu 7 tu 8h-11h. Toi chuan bi dung cu ve sinh.", "price": 200000, "category": cat_dondep, "location": "Chung cu Sunview Town, Quan 9, TP.HCM", "scheduled_time": now + timedelta(days=5), "status": "open", "parent": p_test},
                # IN_PROGRESS (1) — phuhuynh_test có 1 việc đang làm (để test live tracking + geofence)
                {"title": "Trong be 5 tuoi chieu thu 7", "description": "Can nguoi trong be trai 5 tuoi tu 14h-18h thu 7. Be ngoan, thich choi xep hinh Lego. Co do an va nuoc uong san. Nha co camera an ninh.", "price": 240000, "category": cat_trongtre, "location": "Duong Nguyen Huu Tho, Quan 7, TP.HCM", "scheduled_time": now + timedelta(days=1), "status": "in_progress", "parent": p_test, "geofence_lat": 10.7338, "geofence_lng": 106.7197, "geofence_radius": 500},
                # COMPLETED (2) — phuhuynh_test có 2 việc đã xong (để test review + history)
                {"title": "Di cho mua do tuan - sieu thi Coopmart", "description": "Can nguoi den Coopmart Nguyen Kiem mua do tuan: gao, rau, thit, sua. Giao tan nha. Chi phi toi chuan bi truoc.", "price": 150000, "category": cat_muasam, "location": "Coopmart Nguyen Kiem, Phu Nhuan, TP.HCM", "scheduled_time": now - timedelta(days=7), "status": "completed", "parent": p_test},
                {"title": "Don be lop 3 ra khoi truong thu 5", "description": "Don be trai lop 3 ra khoi truong luc 16h30 thu 5. Nha cach truong 1km. Be tu di xe buyt ve nha voi carepartner.", "price": 100000, "category": cat_dontre, "location": "Truong Pho Thong Nguyen Du, Quan 1, TP.HCM", "scheduled_time": now - timedelta(days=14), "status": "completed", "parent": p_test},
            ])
            self.stdout.write(f"   + Them 5 cong viec cho phuhuynh_test (OPEN=2, IN_PROGRESS=1, COMPLETED=2)")

        task_objects = []
        for td in tasks_data:
            parent = td.pop("parent")
            obj = Task.objects.create(**td, parent=parent)
            task_objects.append(obj)
        self.stdout.write(f"   + Tao {len(task_objects)} cong viec moi. Tong: {Task.objects.count()}")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 6: ỨNG TUYỂN & ĐÁNH GIÁ
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[6/7] Dang tao ung tuyen va danh gia...")

        open_tasks = [t for t in task_objects if t.status == "open"]
        in_progress_tasks = [t for t in task_objects if t.status == "in_progress"]
        completed_tasks = [t for t in task_objects if t.status == "completed"]

        apps = []
        reviews = []

        # OPEN: nhiều ứng viên
        if len(open_tasks) > 0:
            apps += [
                {"task": open_tasks[0], "worker": w1, "status": "pending"},
                {"task": open_tasks[0], "worker": w4, "status": "pending"},
                {"task": open_tasks[0], "worker": w2, "status": "pending"},
            ]
        if len(open_tasks) > 1:
            apps += [
                {"task": open_tasks[1], "worker": w2, "status": "pending"},
                {"task": open_tasks[1], "worker": w3, "status": "pending"},
            ]
        if len(open_tasks) > 2:
            apps += [{"task": open_tasks[2], "worker": w3, "status": "pending"}]
        if len(open_tasks) > 3:
            apps += [
                {"task": open_tasks[3], "worker": w2, "status": "pending"},
                {"task": open_tasks[3], "worker": w3, "status": "pending"},
            ]

        # IN_PROGRESS: đã accept
        if len(in_progress_tasks) > 0:
            apps += [
                {"task": in_progress_tasks[0], "worker": w1, "status": "accepted"},
                {"task": in_progress_tasks[0], "worker": w4, "status": "rejected"},
            ]
        if len(in_progress_tasks) > 1:
            apps += [
                {"task": in_progress_tasks[1], "worker": w3, "status": "accepted"},
                {"task": in_progress_tasks[1], "worker": w2, "status": "rejected"},
            ]

        # COMPLETED: có đánh giá
        if len(completed_tasks) > 0:
            apps.append({"task": completed_tasks[0], "worker": w3, "status": "accepted"})
            reviews.append({"task": completed_tasks[0], "reviewer": p2, "reviewee": w3, "rating": 5, "comment": "Lam viec rat can than, sach se va dung gio. Hoi danh bep mot chut nhung tong quat rat hai long. Se thue lai!"})
        if len(completed_tasks) > 1:
            apps.append({"task": completed_tasks[1], "worker": w2, "status": "accepted"})
            reviews.append({"task": completed_tasks[1], "reviewer": p4, "reviewee": w2, "rating": 5, "comment": "Mua sam day du, dung danh sach, giao hang dung hen. Banh kem con nguyen ven. Tuyet voi!"})
        if len(completed_tasks) > 2:
            apps.append({"task": completed_tasks[2], "worker": w2, "status": "accepted"})
            reviews.append({"task": completed_tasks[2], "reviewer": p1, "reviewee": w2, "rating": 4, "comment": "Biet cham soc tre, ru be ngu ngon. Be lon rat thich chi. Nen chu y them ve gio ngu."})

        # ⚡ THÊM 2026-07-21: Gán sinhvien_test (w_test) làm worker cho tasks của phuhuynh_test
        # Mục đích: khi login bằng 2 tài khoản test, có thể demo live tracking + geofence + review
        if p_test and w_test:
            p_test_in_progress = [t for t in in_progress_tasks if t.parent_id == p_test.id]
            p_test_completed = [t for t in completed_tasks if t.parent_id == p_test.id]

            # IN_PROGRESS: sinhvien_test là worker đang làm (để test live tracking + geofence)
            for t in p_test_in_progress:
                apps.append({"task": t, "worker": w_test, "status": "accepted"})
                self.stdout.write(f"   + sinhvien_test → Task#{t.id} '{t.title}' (in_progress, geofence)")

            # COMPLETED: sinhvien_test đã làm xong (để test review + history)
            for idx, t in enumerate(p_test_completed):
                apps.append({"task": t, "worker": w_test, "status": "accepted"})
                rating = 5 if idx == 0 else 4
                comment = "Lam viec chu dao, be rat thich. Se lien lac lai tuan sau!" if idx == 0 else "Don be dung gio, giao tiep thich. Nen nac nhe them ve an toan giao thong."
                reviews.append({"task": t, "reviewer": p_test, "reviewee": w_test, "rating": rating, "comment": comment})

        created_apps = 0
        for a in apps:
            TaskApplication.objects.create(task=a["task"], worker=a["worker"], status=a["status"])
            created_apps += 1

        created_reviews = 0
        for r in reviews:
            Review.objects.create(task=r["task"], reviewer=r["reviewer"], reviewee=r["reviewee"], rating=r["rating"], comment=r["comment"])
            created_reviews += 1

        self.stdout.write(f"   + Tao {created_apps} ung tuyen & {created_reviews} danh gia")

        # ⚡ THÊM 2026-07-21: Tạo LocationConsent 'granted' cho task in_progress của phuhuynh_test
        # Mục đích: khi login 2 tài khoản test, parent có thể xem live tracking ngay
        # không cần worker phải đồng ý trên mobile trước.
        if p_test and w_test:
            try:
                from tracking.models import LocationConsent
                for t in [t for t in in_progress_tasks if t.parent_id == p_test.id]:
                    LocationConsent.objects.update_or_create(
                        task=t,
                        defaults={
                            'worker': w_test,
                            'consent': 'granted',
                            'granted_at': now - timedelta(hours=1),
                        }
                    )
                    self.stdout.write(f"   + LocationConsent GRANTED cho Task#{t.id} (sinhvien_test → phuhuynh_test)")
            except ImportError:
                self.stdout.write("   ⚠️  tracking module chưa sẵn sàng — skip LocationConsent")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 7: TẠO MỘT SỐ THÔNG BÁO MẪU
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[7/7] Dang tao thong bao mau...")

        notifs = []
        # Thông báo chung cho tất cả carepartner
        notifs.append(Notification.objects.create(
            recipient=None,
            title="Chao mung Carepartner moi den voi EduCareLink!",
            message="Dat the nen tang, ban se nhan duoc viec lam phu hop tu AI goi y. Hay cap nhat ho so day du de tang co hoi nhan viec.",
        ))
        # Thông báo cá nhân cho carepartner đang có việc in_progress
        if worker_ref:
            notifs.append(Notification.objects.create(
                recipient=worker_ref,
                title="Ban co 1 viec dang thuc hien",
                message="Nho bat chia se vi tri (Live Tracking) de phu huynh yeen tam va bat len geofence an toan cho be.",
            ))
        # Thông báo cho parent_ref
        if parent_ref:
            notifs.append(Notification.objects.create(
                recipient=parent_ref,
                title="AI goi y: Co 3 ung vien phu hop viec cua ban",
                message="AI da xep hang ung vien dua tren bang cap, danh gia va khoang cach. Bam vao 'Xem ung vien' de xem chi tiet.",
            ))
        self.stdout.write(f"   + Tao {len(notifs)} thong bao mau")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 8: TRACKING (LocationConsent + LiveLocation + History + Heartbeat + SOS + OfflineAlert)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[8/10] Dang tao du lieu Tracking (geofence, heartbeat, SOS)...")

        try:
            from tracking.models import (
                LocationConsent, LiveLocation, LocationHistory,
                DeviceHeartbeat, DeviceOfflineAlert, SOSAlert,
            )
            from decimal import Decimal

            tracking_count = 0
            # Gán geofence cho open + in_progress tasks (parent vẽ vùng an toàn khi đăng việc)
            geofence_tasks = [t for t in task_objects if t.status in ("open", "in_progress")]
            for i, t in enumerate(geofence_tasks):
                t.geofence_lat = 10.7897 + (i * 0.005)
                t.geofence_lng = 106.6883 + (i * 0.005)
                t.geofence_radius = 500
                t.save()
                tracking_count += 1
            self.stdout.write(f"   + Gan geofence cho {tracking_count} task (open + in_progress)")

            # LocationConsent + LiveLocation cho in_progress tasks (carepartner đang làm)
            for t in in_progress_tasks:
                # Tìm worker đã accept task này
                accepted_app = TaskApplication.objects.filter(task=t, status="accepted").first()
                if not accepted_app:
                    continue
                w = accepted_app.worker
                # Consent granted
                LocationConsent.objects.create(
                    task=t, worker=w, consent="granted",
                    granted_at=now - timedelta(hours=1),
                )
                # LiveLocation (đang ở trong vùng an toàn)
                LiveLocation.objects.create(
                    task=t, worker=w,
                    latitude=Decimal("10.7897"), longitude=Decimal("106.6883"),
                    accuracy=5.0, speed=0.0, heading=0.0,
                    is_outside_geofence=False,
                )
                # 5 điểm LocationHistory (route carepartner đã đi)
                for j in range(5):
                    LocationHistory.objects.create(
                        task=t, worker=w,
                        latitude=Decimal(str(10.7897 + j * 0.0002)),
                        longitude=Decimal(str(106.6883 + j * 0.0002)),
                        accuracy=5.0, speed=1.2,
                    )
                # Heartbeat online
                DeviceHeartbeat.objects.create(
                    task=t, worker=w, last_seen=now - timedelta(seconds=15),
                    last_location_lat=Decimal("10.7897"),
                    last_location_lng=Decimal("106.6883"),
                    device_status="online",
                    battery_level=85, app_state="foreground", network_type="wifi",
                )
            self.stdout.write(f"   + Tao consent + livelocation + history + heartbeat cho {len(in_progress_tasks)} in_progress task")

            # 1 SOS alert active (test nút SOS)
            if len(in_progress_tasks) > 0:
                t0 = in_progress_tasks[0]
                acc = TaskApplication.objects.filter(task=t0, status="accepted").first()
                if acc:
                    SOSAlert.objects.create(
                        task=t0, sender="worker", sender_user=acc.worker,
                        latitude=Decimal("10.7897"), longitude=Decimal("106.6883"),
                        message="Be bi ngã, can ho tro khẩn cap!",
                        status="active",
                    )
                    self.stdout.write("   + Tao 1 SOS alert ACTIVE (test nut SOS)")

            # 1 DeviceOfflineAlert đã recovered (test luồng offline)
            if len(in_progress_tasks) > 1:
                t1 = in_progress_tasks[1]
                acc = TaskApplication.objects.filter(task=t1, status="accepted").first()
                if acc:
                    DeviceOfflineAlert.objects.create(
                        task=t1, worker=acc.worker,
                        last_seen=now - timedelta(minutes=10),
                        last_location_lat=Decimal("10.7897"),
                        last_location_lng=Decimal("106.6883"),
                        status="recovered",
                        push_sent=True, push_sent_at=now - timedelta(minutes=9),
                        recovered_at=now - timedelta(minutes=8),
                        recovery_duration_seconds=120,
                    )
                    self.stdout.write("   + Tao 1 DeviceOfflineAlert RECOVERED (test luong offline)")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   ! Tracking seed loi: {e}"))

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 9: PAYMENTS (Escrow + Cash + Settlement + Log)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[9/10] Dang tao du lieu Payments (escrow, cash, settlement)...")

        try:
            from payments.models import Payment, CommissionSettlement, PaymentLog
            from decimal import Decimal as D

            payment_count = 0
            # COMPLETED tasks → đã thanh toán (cash + momo_escrow)
            for idx, t in enumerate(completed_tasks):
                acc = TaskApplication.objects.filter(task=t, status="accepted").first()
                if not acc:
                    continue
                method = "cash" if idx % 2 == 0 else "momo_escrow"
                amt = D(str(t.price))
                commission = (amt * D("0.20")).quantize(D("1"))
                payout = amt - commission
                p = Payment.objects.create(
                    task=t, parent=t.parent, worker=acc.worker,
                    amount=amt, commission_rate=D("0.2000"),
                    commission_amount=commission, worker_payout_amount=payout,
                    method=method, status="completed",
                    momo_order_id=f"EduCareLink_{t.id}_{int(now.timestamp())}" if method == "momo_escrow" else None,
                    momo_trans_id=f"405{t.id:08d}" if method == "momo_escrow" else None,
                    held_at=now - timedelta(days=5) if method == "momo_escrow" else None,
                    completed_at=now - timedelta(days=3),
                )
                PaymentLog.objects.create(
                    payment=p, event_type="payment_created",
                    message=f"Tao thanh toan {method}",
                )
                if method == "momo_escrow":
                    PaymentLog.objects.create(payment=p, event_type="momo_ipn_held", message="MoMo da giu tien")
                    PaymentLog.objects.create(payment=p, event_type="escrow_released", message="Giai ngan cho carepartner")
                else:
                    PaymentLog.objects.create(payment=p, event_type="cash_recorded", message="Ghi nhan hoa hong tien mat")
                payment_count += 1

            # 1 Payment held (escrow đang chờ)
            if len(in_progress_tasks) > 0:
                t0 = in_progress_tasks[0]
                acc = TaskApplication.objects.filter(task=t0, status="accepted").first()
                if acc:
                    amt = D(str(t0.price))
                    commission = (amt * D("0.20")).quantize(D("1"))
                    p = Payment.objects.create(
                        task=t0, parent=t0.parent, worker=acc.worker,
                        amount=amt, commission_rate=D("0.20"),
                        commission_amount=commission, worker_payout_amount=amt - commission,
                        method="momo_escrow", status="held",
                        momo_order_id=f"EduCareLink_{t0.id}_held",
                        momo_trans_id=f"405{t0.id:08d}",
                        momo_pay_url="https://testing.momo.vn/v2/gateway/pay?t=T",
                        held_at=now - timedelta(hours=2),
                    )
                    PaymentLog.objects.create(payment=p, event_type="momo_ipn_held", message="Tien dang giu, cho task hoan thanh")
                    payment_count += 1

            # CommissionSettlement: kỳ thanh toán tháng trước (đã paid)
            if worker_ref:
                CommissionSettlement.objects.create(
                    worker=worker_ref,
                    period_year=now.year, period_month=now.month - 1 if now.month > 1 else 12,
                    total_tasks=2, total_amount=D("96000"),
                    task_ids=[1, 2], status="paid",
                    momo_order_id="settle_demo_001",
                    momo_pay_url="https://testing.momo.vn/v2/gateway/pay?t=S",
                    generated_at=now - timedelta(days=10),
                    paid_at=now - timedelta(days=5),
                )
                payment_count += 1
            self.stdout.write(f"   + Tao {payment_count} ban ghi payment (escrow + cash + settlement)")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   ! Payments seed loi: {e}"))

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 10: CREDENTIALS + PROFILE CHANGE REQUESTS + COMPLAINTS
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[10/10] Dang tao Credentials + ProfileChange + Complaints...")

        # CredentialSubmission: 1 pending (chờ admin duyệt) + 1 approved
        try:
            if w3:
                CredentialSubmission.objects.create(
                    worker=w3, description="Chung chi nau an Viet - Asia cap 2",
                    status="pending",
                )
            if w1:
                CredentialSubmission.objects.create(
                    worker=w1,
                    description="Chung chi IELTS 7.0 + Bang tot nghiep Su Pham Toan",
                    status="approved", admin_review="Bằng cấp hợp lệ, đã xác thực.",
                    reviewed_at=now - timedelta(days=2),
                )
            self.stdout.write("   + Tao 2 CredentialSubmission (1 pending + 1 approved)")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   ! Credential seed loi: {e}"))

        # ProfileChangeRequest: 1 pending (worker yêu cầu sửa hồ sơ)
        try:
            if w2:
                ProfileChangeRequest.objects.create(
                    worker=w2,
                    proposed_changes={"phone_number": "0987001999", "address": "So 5 Duong Le Loi, Q1, TP.HCM"},
                    status="pending",
                )
            self.stdout.write("   + Tao 1 ProfileChangeRequest (pending)")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   ! ProfileChange seed loi: {e}"))

        # Complaints: 1 pending + 1 investigating (AI đã phân tích)
        try:
            from moderation.models import Complaint
            if len(completed_tasks) > 0 and w1:
                Complaint.objects.create(
                    complainant=w1, reported_user=completed_tasks[0].parent,
                    task=completed_tasks[0],
                    complaint_type="non_payment",
                    title="Tre hen thanh toan hon 7 ngay",
                    description="Toi da hoan thanh cong viec don dep nha nhung phu huynh chua thanh toan day du, hen nhieu lan ma khong giu loi hua.",
                    status="pending", priority="high",
                    ai_analyzed=True,
                    ai_analysis="AI phan tich: co ban co task completed nhung chua co ban ghi Payment completed. De xuat uu tien HIGH.",
                    ai_priority="high",
                )
            if len(completed_tasks) > 1 and w4:
                Complaint.objects.create(
                    complainant=w4, reported_user=completed_tasks[1].parent,
                    task=completed_tasks[1],
                    complaint_type="harassment",
                    title="Co bat dac di khi dang lam viec",
                    description="Phu huynh co nhung loi noi khong phu hop, bat toi lam ngoai thoa thuan.",
                    status="investigating", priority="urgent",
                    ai_analyzed=True,
                    ai_analysis="AI phan tich: co dau hieu quay roi, de xuat URGENT, can dieu tra ngay.",
                    ai_priority="urgent",
                )
            self.stdout.write("   + Tao 2 Complaint (1 pending + 1 investigating)")
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"   ! Complaint seed loi: {e}"))

        # ═══════════════════════════════════════════════════════════════
        #  TỔNG KẾT
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n" + "=" * 64)
        self.stdout.write("  RESET DU LIEU HOAN TAT - SAN SANG CHO BAN GIAM KHAO!")
        self.stdout.write("=" * 64)
        self.stdout.write(f"""
  Thong ke database hien tai:
    - Danh muc dich vu : {ServiceCategory.objects.count()} muc
    - Tong nguoi dung  : {User.objects.count()} tai khoan
    - Tong cong viec   : {Task.objects.count()} viec
    - Tong ung tuyen   : {TaskApplication.objects.count()} lan
    - Tong danh gia    : {Review.objects.count()} danh gia
    - Tong thong bao   : {Notification.objects.count()} thong bao

  ╔══════════════════════════════════════════════════════════════╗
  ║ 3 TAI KHOAN BAO VE (KHONG BI XOA / KHONG BI THAY DOI)        ║
  ╠══════════════════════════════════════════════════════════════╣
  ║ admin            | Admin EduCareLink  (admin / {TEST_PASSWORD})║
  ║ phuhuynh_test    | Phu huynh test     (phuhuynh_test / {TEST_PASSWORD})║
  ║ sinhvien_test    | Carepartner test   (sinhvien_test / {TEST_PASSWORD})║
  ╚══════════════════════════════════════════════════════════════╝

  ╔══════════════════════════════════════════════════════════════╗
  ║ DU LIEU MAU MOI (mat khau: {TEST_PASSWORD})                            ║
  ╠══════════════════════════════════════════════════════════════╣
  ║ PHU HUYNH: phuhuynh_baolinh / phuhuynh_minhkhoi /           ║
  ║            phuhuynh_yenchi / phuhuynh_congvinh               ║
  ║ CAREPARTNER (da duyet): carepartner_tuankiet / hoango /      ║
  ║                         mylinh / phuoc                       ║
  ║ CAREPARTNER (cho duyet): carepartner_pending_hai             ║
  ║ TAI KHOAN BI KHOA: locked_test_2 (test mo khoa)              ║
  ╚══════════════════════════════════════════════════════════════╝
""")
