"""
Django Management Command: seed_demo_data (BẢN RESET & SEED TOÀN BỘ HỆ THỐNG)
================================================================================
Thực hiện RESET dữ liệu và khởi tạo dữ liệu mẫu toàn diện cho tất cả các luồng:
  1. Xóa sạch mọi dữ liệu demo cũ (Matching, Chat, Tracking, Payments,
     Moderation, CareDiary, Core, Users không bảo vệ).
  2. Bảo vệ & chuẩn hóa 3 tài khoản cốt lõi:
     - admin: Quản trị viên hệ thống (admin / Demo@2026)
     - phuhuynh_test: Phụ huynh test chính (phuhuynh_test / Demo@2026)
     - sinhvien_test: CarePartner test chính (sinhvien_test / Demo@2026)
  3. Tạo dữ liệu mẫu đa dạng cho TẤT CẢ các trường hợp & phân hệ:
     - 8 Danh mục dịch vụ & Biểu giá chuẩn (PricingRule)
     - Cấu hình nghiệp vụ Flow 1 (EloBand, CancelPolicy, MatchingWeight, Templates, Config)
     - 4 Phụ huynh mẫu với địa chỉ, GPS thực tế & Ví Credit phong phú
     - 6 CarePartner mẫu thuộc nhiều trường ĐH, chứng chỉ, bậc ELO & lịch rảnh
     - Flow 1 Matching: JobPost cả 3 loại (Gia sư, Trông trẻ, Đón trẻ), JobSlot,
       CandidateProposal, Booking (đủ trạng thái: awaiting_commitment, in_progress,
       completed, cancelled có đền bù), Đơn kháng cáo ELO (Appeal)
     - Core Tasks: 12 công việc phủ khắp các trạng thái (open chưa có ai apply,
       open có nhiều ứng viên, in_progress, completed, cancelled)
     - Ứng tuyển (TaskApplication) & Đánh giá (Review) 4-5 sao chi tiết
     - Tracking & An toàn: Geofence, LocationConsent, LiveLocation TP. Huế,
       LocationHistory, DeviceHeartbeat, SOSAlert khẩn cấp (active/resolved)
     - Payments: MoMo Escrow (held / completed 80-20), Tiền mặt Cash (hoa hồng 20%),
       Quyết toán hoa hồng tháng (CommissionSettlement paid/pending), PaymentLog
     - Chat: Cửa sổ chat Conversation đang mở (kèm 5 tin nhắn đối thoại thực tế)
       và Cửa sổ chat đã đóng lưu lịch sử
     - Care Diary: Nhật ký chăm sóc đa dạng cảm xúc & timeline hoạt động
     - Moderation & Admin: AI kiểm duyệt Task, Khiếu nại Complaint (pending/investigating/resolved),
       Xác thực bằng cấp CredentialSubmission, Yêu cầu đổi hồ sơ ProfileChangeRequest
     - Thông báo hệ thống & thông báo cá nhân (Notification)

Chạy lệnh: python manage.py seed_demo_data
Idempotent: chạy nhiều lần vẫn luôn đưa hệ thống về trạng thái demo chuẩn mực.
"""

import datetime
from datetime import timedelta
from decimal import Decimal as D
import uuid

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core.models import (
    User, ServiceCategory, PricingRule, Task, TaskApplication, Review,
    CredentialSubmission, Notification, ProfileChangeRequest, WorkerAvailability,
)

PROTECTED_USERNAMES = {"admin", "phuhuynh_test", "sinhvien_test"}
TEST_PASSWORD = "Demo@2026"


class Command(BaseCommand):
    help = 'RESET va SEED toan bo du lieu mau cho tat ca cac phan he va kich ban cua EduCareLink.'

    def _log(self, msg, style_func=None):
        try:
            self.stdout.write(style_func(msg) if style_func else msg)
        except Exception:
            clean_msg = msg.encode('ascii', errors='replace').decode('ascii')
            try:
                self.stdout.write(style_func(clean_msg) if style_func else clean_msg)
            except Exception:
                pass

    @transaction.atomic
    def handle(self, *args, **options):
        now = timezone.now()
        today = now.date()

        self._log("\n" + "=" * 72)
        self._log("  EDUCARELINK -- RESET & SEED TOAN BO DU LIEU MAU MOI (TAT CA KICH BAN)")
        self._log("=" * 72)
        self._log(f"  Tai khoan BAO VE: {sorted(PROTECTED_USERNAMES)} | Mat khau: {TEST_PASSWORD}")

        # ===============================================================
        #  PHAN 0: XOA SACH TOAN BO DU LIEU CU
        # ===============================================================
        self._log("\n[0/12] Dang xoa sach toan bo du lieu demo cu...")

        def safe_delete(label, queryset):
            try:
                cnt = queryset.count()
                queryset.delete()
                self._log(f"   - Da xoa {cnt:>5} {label}")
            except Exception as e:
                self._log(f"   ! Bo qua {label}: {e}")

        # 1. Matching (Flow 1)
        try:
            from matching.models import (
                Appeal, CreditTransaction, CreditBalance, ParentTrustFlag,
                Booking, JobSlot, JobPost, CandidateProposal, EloLedger,
                CarePartnerAvailability, CarePartnerBlackout, CarePartnerProfile,
            )
            safe_delete("Appeal (Kháng cáo)", Appeal.objects.all())
            safe_delete("CreditTransaction (Giao dịch ví)", CreditTransaction.objects.all())
            safe_delete("CreditBalance (Ví credit)", CreditBalance.objects.all())
            safe_delete("ParentTrustFlag", ParentTrustFlag.objects.all())
            safe_delete("Booking (Flow 1)", Booking.objects.all())
            safe_delete("JobSlot", JobSlot.objects.all())
            safe_delete("JobPost (Flow 1)", JobPost.objects.all())
            safe_delete("CandidateProposal", CandidateProposal.objects.all())
            safe_delete("EloLedger", EloLedger.objects.all())
            safe_delete("CarePartnerAvailability", CarePartnerAvailability.objects.all())
            safe_delete("CarePartnerBlackout", CarePartnerBlackout.objects.all())
            safe_delete("CarePartnerProfile", CarePartnerProfile.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Matching module: {e}")

        # 2. Chat
        try:
            from chat.models import Conversation, Message
            safe_delete("Message (Tin nhắn chat)", Message.objects.all())
            safe_delete("Conversation (Cửa sổ chat)", Conversation.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Chat module: {e}")

        # 3. Moderation
        try:
            from moderation.models import TaskModeration, Complaint, ComplaintEvidence
            safe_delete("ComplaintEvidence", ComplaintEvidence.objects.all())
            safe_delete("Complaint", Complaint.objects.all())
            safe_delete("TaskModeration", TaskModeration.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Moderation module: {e}")

        # 4. Payments
        try:
            from payments.models import Payment, CommissionSettlement, PaymentLog
            safe_delete("PaymentLog", PaymentLog.objects.all())
            safe_delete("CommissionSettlement", CommissionSettlement.objects.all())
            safe_delete("Payment", Payment.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Payments module: {e}")

        # 5. Tracking
        try:
            from tracking.models import (
                LocationConsent, LiveLocation, LocationHistory, SOSAlert,
                DeviceHeartbeat, DeviceOfflineAlert, RandomVerificationCheck,
            )
            safe_delete("SOSAlert", SOSAlert.objects.all())
            safe_delete("RandomVerificationCheck", RandomVerificationCheck.objects.all())
            safe_delete("DeviceOfflineAlert", DeviceOfflineAlert.objects.all())
            safe_delete("DeviceHeartbeat", DeviceHeartbeat.objects.all())
            safe_delete("LocationHistory", LocationHistory.objects.all())
            safe_delete("LiveLocation", LiveLocation.objects.all())
            safe_delete("LocationConsent", LocationConsent.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! Tracking module: {e}")

        # 6. Care Diary
        try:
            from care_diary.models import CareDiaryActivity, CareDiaryAttachment, CareDiaryEntry
            safe_delete("CareDiaryActivity", CareDiaryActivity.objects.all())
            safe_delete("CareDiaryAttachment", CareDiaryAttachment.objects.all())
            safe_delete("CareDiaryEntry", CareDiaryEntry.objects.all())
        except Exception as e:
            self.stdout.write(f"   ! CareDiary module: {e}")

        # 7. Core
        safe_delete("Review", Review.objects.all())
        safe_delete("TaskApplication", TaskApplication.objects.all())
        safe_delete("Notification", Notification.objects.all())
        safe_delete("ProfileChangeRequest", ProfileChangeRequest.objects.all())
        safe_delete("CredentialSubmission", CredentialSubmission.objects.all())
        safe_delete("WorkerAvailability", WorkerAvailability.objects.all())
        safe_delete("Task", Task.objects.all())

        # 8. Users non-protected
        old_users = User.objects.exclude(username__in=PROTECTED_USERNAMES)
        old_count = old_users.count()
        old_users.delete()
        self.stdout.write(f"   - Đã xóa {old_count:>5} User phụ (non-protected)")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 1: CHUẨN HÓA 3 TÀI KHOẢN BẢO VỆ CỐT LÕI
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[1/12] Chuẩn hóa 3 tài khoản bảo vệ cốt lõi...")

        # 1. Admin
        admin_user, _ = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@educarelink.vn",
                "first_name": "Quản Trị Viên",
                "last_name": "Hệ Thống",
                "role": "parent",
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
                "is_verified": True,
                "is_approved": True,
            }
        )
        admin_user.set_password(TEST_PASSWORD)
        admin_user.is_staff = True
        admin_user.is_superuser = True
        admin_user.is_active = True
        admin_user.save()
        self.stdout.write(f"   + [ADMIN] {admin_user.username} (Superuser)")

        # 2. Phụ huynh test (phuhuynh_test)
        parent_test, _ = User.objects.get_or_create(
            username="phuhuynh_test",
            defaults={
                "email": "phuhuynh.test@educarelink.vn",
                "first_name": "Hồng Nhung",
                "last_name": "Lê",
                "role": "parent",
                "phone_number": "0912345678",
                "address": "Căn hộ The Manor Crown Huế, Đại lộ Tố Hữu, P. Xuân Phú, TP. Huế",
                "is_active": True,
                "is_verified": True,
                "is_approved": True,
                "first_login": False,
                "latitude": 16.4602,
                "longitude": 107.6008,
            }
        )
        parent_test.set_password(TEST_PASSWORD)
        parent_test.role = "parent"
        parent_test.first_name = "Hồng Nhung"
        parent_test.last_name = "Lê"
        parent_test.phone_number = "0912345678"
        parent_test.address = "Căn hộ The Manor Crown Huế, Đại lộ Tố Hữu, P. Xuân Phú, TP. Huế"
        parent_test.latitude = 16.4602
        parent_test.longitude = 107.6008
        parent_test.is_active = True
        parent_test.is_verified = True
        parent_test.is_approved = True
        parent_test.first_login = False
        parent_test.save()
        self.stdout.write(f"   + [PARENT TEST] {parent_test.username} ({parent_test.get_full_name()})")

        # 3. CarePartner test (sinhvien_test)
        worker_test, _ = User.objects.get_or_create(
            username="sinhvien_test",
            defaults={
                "email": "sinhvien.test@educarelink.vn",
                "first_name": "Minh Anh",
                "last_name": "Nguyễn",
                "role": "worker",
                "phone_number": "0987654321",
                "address": "Ký túc xá ĐH Sư Phạm Huế, 32 Lê Lợi, P. Vĩnh Ninh, TP. Huế",
                "is_active": True,
                "is_verified": True,
                "is_approved": True,
                "first_login": False,
                "latitude": 16.4682,
                "longitude": 107.5895,
                "qualifications": [
                    "Sinh viên năm 3 ĐH Sư Phạm - Đại học Huế",
                    "Chứng chỉ IELTS 7.5 (IDP)",
                    "Chứng chỉ Sơ cấp cứu Nhi khoa",
                    "Bằng lái xe máy hạng A1",
                ],
                "ai_profile_summary": "Sinh viên năm 3 khoa Sư phạm Toán - ĐH Sư Phạm Huế, 2 năm kinh nghiệm gia sư và trông trẻ. Đạt chứng chỉ IELTS 7.5, nhiệt tình, đúng giờ, tận tâm với trẻ nhỏ.",
            }
        )
        worker_test.set_password(TEST_PASSWORD)
        worker_test.role = "worker"
        worker_test.first_name = "Minh Anh"
        worker_test.last_name = "Nguyễn"
        worker_test.phone_number = "0987654321"
        worker_test.address = "Ký túc xá ĐH Sư Phạm Huế, 32 Lê Lợi, P. Vĩnh Ninh, TP. Huế"
        worker_test.latitude = 16.4682
        worker_test.longitude = 107.5895
        worker_test.is_active = True
        worker_test.is_verified = True
        worker_test.is_approved = True
        worker_test.first_login = False
        worker_test.qualifications = [
            "Sinh viên năm 3 ĐH Sư Phạm - Đại học Huế",
            "Chứng chỉ IELTS 7.5 (IDP)",
            "Chứng chỉ Sơ cấp cứu Nhi khoa",
            "Bằng lái xe máy hạng A1",
        ]
        worker_test.ai_profile_summary = "Sinh viên năm 3 khoa Sư phạm Toán - ĐH Sư Phạm Huế, 2 năm kinh nghiệm gia sư và trông trẻ. Đạt chứng chỉ IELTS 7.5, nhiệt tình, đúng giờ, tận tâm với trẻ nhỏ."
        worker_test.save()
        self.stdout.write(f"   + [WORKER TEST] {worker_test.username} ({worker_test.get_full_name()})")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 2: DANH MỤC DỊCH VỤ & BIỂU GIÁ (PRICING RULES)
        #  QA 2026-09-10 Vấn đề #1: CHỈ 3 DANH MỤC (Gia sư, Đón trẻ,
        #  Trông trẻ). Các danh mục cũ bị khóa mềm is_active=False —
        #  giữ FK dữ liệu lịch sử nhưng cấm đăng việc mới.
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[2/12] Nạp danh mục dịch vụ & quy tắc biểu giá...")

        categories_data = [
            {"name": "Gia sư", "icon_name": "BookOpen", "description": "Dạy kèm các môn văn hóa (Toán, Lý, Hóa, Anh...) và kỹ năng mềm từ tiểu học đến THPT."},
            {"name": "Trông trẻ", "icon_name": "Heart", "description": "Trông nom, vui chơi, cho ăn uống và chăm sóc trẻ an toàn tại nhà theo ca linh hoạt."},
            {"name": "Đón trẻ", "icon_name": "Baby", "description": "Đón bé đúng giờ từ trường học hoặc lớp năng khiếu về tận nhà an toàn tuyệt đối."},
        ]
        ALLOWED_CATEGORY_NAMES = [c["name"] for c in categories_data]

        cats = {}
        for c in categories_data:
            obj, _ = ServiceCategory.objects.update_or_create(
                name=c["name"],
                defaults={"icon_name": c["icon_name"], "description": c["description"], "is_active": True}
            )
            cats[c["name"]] = obj

        # Khóa mềm mọi danh mục ngoài 3 danh mục chuẩn (dọn dẹp, nấu ăn,
        # mua sắm hộ, hỗ trợ AI, khác...) — dữ liệu lịch sử giữ nguyên FK.
        locked_count = ServiceCategory.objects.exclude(
            name__in=ALLOWED_CATEGORY_NAMES).update(is_active=False)

        pricing_rules = [
            {"name": "Gia sư", "pricing_type": "hourly", "base_fee": 0, "unit_price": 90000, "min_price": 150000, "max_price": 350000},
            {"name": "Trông trẻ", "pricing_type": "hourly", "base_fee": 0, "unit_price": 70000, "min_price": 100000, "max_price": 250000},
            {"name": "Đón trẻ", "pricing_type": "distance", "base_fee": 30000, "unit_price": 15000, "min_price": 70000, "max_price": 180000},
        ]
        for pr in pricing_rules:
            PricingRule.objects.update_or_create(
                category=cats[pr["name"]],
                defaults={
                    "pricing_type": pr["pricing_type"],
                    "base_fee": pr["base_fee"],
                    "unit_price": pr["unit_price"],
                    "min_price": pr["min_price"],
                    "max_price": pr["max_price"],
                }
            )
        self.stdout.write(f"   + Đã thiết lập 3 ServiceCategory chuẩn và PricingRule tương ứng.")
        if locked_count:
            self.stdout.write(f"   + Đã khóa mềm {locked_count} danh mục cũ ngoài 3 danh mục chuẩn (is_active=False).")

        # ===============================================================
        #  PHAN 3: CAU HINH NGHIEP VU MATCHING FLOW 1
        # ===============================================================
        self._log("\n[3/12] Nap cau hinh nghiep vu Matching Flow 1...")

        from django.core.management import call_command
        from matching.models import EloBand
        call_command('seed_matching_config', verbosity=0)
        elo_bands = {b.name: b for b in EloBand.objects.all()}
        self._log(f"   + Da nap day du {len(elo_bands)} EloBand, CancelPolicy, MatchingWeight va MatchingConfig.")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 4: TẠO PHỤ HUYNH MẪU & VÍ CREDIT (CREDITBALANCE)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[4/12] Tạo tài khoản Phụ huynh thực tế & Ví Credit...")

        from matching.models import CreditBalance, CreditTransaction

        parents_profiles = [
            {
                "username": "phuhuynh_baolinh", "first_name": "Bảo Lĩnh", "last_name": "Phạm",
                "email": "baolinh.pham@gmail.com", "phone_number": "0903112233",
                "address": "Khu đô thị An Cựu City, Đường Hoàng Quốc Việt, P. An Đông, TP. Huế",
                "lat": 16.4525, "lng": 107.6045, "credit": 1800000,
            },
            {
                "username": "phuhuynh_minhkhoi", "first_name": "Minh Khôi", "last_name": "Đặng",
                "email": "minhkhoi.dang@gmail.com", "phone_number": "0903445566",
                "address": "Căn hộ Vincom Plaza Huế, 50A Hùng Vương, P. Phú Nhuận, TP. Huế",
                "lat": 16.4655, "lng": 107.5932, "credit": 3200000,
            },
            {
                "username": "phuhuynh_yenchi", "first_name": "Yến Chi", "last_name": "Hồ",
                "email": "yenchi.ho@benhvien.vn", "phone_number": "0903778899",
                "address": "15 Lê Lợi, P. Vĩnh Ninh, TP. Huế (gần Bệnh viện TW Huế)",
                "lat": 16.4678, "lng": 107.5855, "credit": 1500000,
            },
            {
                "username": "phuhuynh_congvinh", "first_name": "Công Vinh", "last_name": "Trương",
                "email": "congvinh.truong@hueuni.edu.vn", "phone_number": "0903224466",
                "address": "Chung cư Xuân Phú, Đường Hoàng Lanh, P. Xuân Phú, TP. Huế",
                "lat": 16.4589, "lng": 107.6023, "credit": 900000,
            },
        ]

        parent_dict = {"phuhuynh_test": parent_test}
        # Cấp ví credit cho phuhuynh_test
        w_test_credit, _ = CreditBalance.objects.update_or_create(
            parent=parent_test, defaults={"credit_vnd": 2500000}
        )
        CreditTransaction.objects.create(
            parent=parent_test, amount_vnd=2500000,
            kind="platform_credit", status="issued",
            note="Cấp credit ban đầu cho tài khoản thử nghiệm"
        )

        for p in parents_profiles:
            u, _ = User.objects.update_or_create(
                username=p["username"],
                defaults={
                    "password": TEST_PASSWORD,
                    "first_name": p["first_name"],
                    "last_name": p["last_name"],
                    "email": p["email"],
                    "phone_number": p["phone_number"],
                    "address": p["address"],
                    "role": "parent",
                    "latitude": p["lat"],
                    "longitude": p["lng"],
                    "is_active": True,
                    "is_verified": True,
                    "is_approved": True,
                    "first_login": False,
                }
            )
            u.set_password(TEST_PASSWORD)
            u.save()
            parent_dict[p["username"]] = u

            # Ví credit
            CreditBalance.objects.update_or_create(
                parent=u, defaults={"credit_vnd": p["credit"]}
            )
            CreditTransaction.objects.create(
                parent=u, amount_vnd=p["credit"],
                kind="platform_credit", status="issued",
                note="Nạp credit dùng thử dịch vụ ghép cặp"
            )
            self.stdout.write(f"   + Phụ huynh: {u.get_full_name()} ({u.username}) — Ví {p['credit']:,}đ")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 5: TẠO CAREPARTNER MẪU & HỒ SƠ TÍN NHIỆM ELO (FLOW 1)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[5/12] Tạo CarePartner mẫu, Hồ sơ ELO & Lịch rảnh...")

        from matching.models import (
            CarePartnerProfile, CarePartnerAvailability, CarePartnerBlackout
        )

        workers_profiles = [
            {
                "username": "carepartner_tuankiet", "first_name": "Tuấn Kiệt", "last_name": "Lương",
                "email": "tuankiet.luong@student.hueuni.edu.vn", "phone_number": "0987111222",
                "address": "KTX Đại học Khoa học Huế, 77 Nguyễn Huệ, P. Phú Nhuận, TP. Huế",
                "lat": 16.4598, "lng": 107.5882, "is_approved": True, "is_active": True,
                "school": "Đại học Khoa học - Đại học Huế", "major": "Công nghệ Thông tin & Toán ứng dụng",
                "elo": 1480, "band": "trusted", "has_vehicle": True, "gender": "male",
                "skills": ["toan", "vat_ly", "lap_trinh", "cap_2", "cap_3", "tieng_anh"],
                "qualifications": ["Sinh viên năm 3 ĐH Khoa học Huế", "Giải Ba Toán cấp Tỉnh Thừa Thiên Huế", "IELTS 7.0"],
                "summary": "Sinh viên ĐH Khoa học Huế đam mê giảng dạy, chuyên kèm môn Toán, Lý và Lập trình tư duy cho học sinh từ lớp 6-12.",
                "jobs_done": 14, "rating": 4.9,
            },
            {
                "username": "carepartner_hoango", "first_name": "Hoàng Ngân", "last_name": "Đỗ",
                "email": "hoango.do@gmail.com", "phone_number": "0987333444",
                "address": "45 Đống Đa, P. Phú Nhuận, TP. Huế",
                "lat": 16.4635, "lng": 107.5912, "is_approved": True, "is_active": True,
                "school": "Đại học Sư Phạm - Đại học Huế", "major": "Giáo dục Mầm non",
                "elo": 1580, "band": "trusted", "has_vehicle": True, "gender": "female",
                "skills": ["trong_tre", "mam_non", "montessori", "so_cap_cuu", "nau_an", "kien_nhan"],
                "qualifications": ["Cử nhân Giáo dục Mầm non - ĐH Sư phạm Huế", "Chứng chỉ Montessori Quốc tế", "Chứng nhận Sơ cấp cứu Red Cross"],
                "summary": "Cử nhân Sư phạm Mầm non ĐH Sư phạm Huế 4 năm kinh nghiệm, yêu trẻ, chu đáo, am hiểu tâm lý trẻ nhỏ và kỹ năng ăn dặm, sơ cứu.",
                "jobs_done": 26, "rating": 5.0,
            },
            {
                "username": "carepartner_mylinh", "first_name": "Mỹ Linh", "last_name": "Trần",
                "email": "mylinh.tran@gmail.com", "phone_number": "0987555666",
                "address": "88 Bến Nghé, P. Phú Hội, TP. Huế",
                "lat": 16.4660, "lng": 107.5945, "is_approved": True, "is_active": True,
                "school": "Đại học Kinh Tế - Đại học Huế", "major": "Quản trị Kinh doanh",
                "elo": 1360, "band": "good", "has_vehicle": False, "gender": "female",
                "skills": ["nau_an", "don_dep", "trong_tre", "choi_cung_be", "ve_tranh"],
                "qualifications": ["Sinh viên năm cuối ĐH Kinh tế Huế", "Kinh nghiệm 2 năm trông trẻ và giúp việc gia đình", "Chứng chỉ Sơ cấp cứu Nhi khoa"],
                "summary": "Nhanh nhẹn, sạch sẽ, nấu các món ăn Huế và cơm gia đình chuẩn vị, rất khéo léo khi chơi và tương tác với các bé độ tuổi mẫu giáo.",
                "jobs_done": 9, "rating": 4.8,
            },
            {
                "username": "carepartner_phuoc", "first_name": "Hữu Phước", "last_name": "Nguyễn",
                "email": "phuoc.nguyen@huemed-univ.edu.vn", "phone_number": "0987777888",
                "address": "KTX ĐH Y Dược Huế, 06 Ngô Quyền, P. Vĩnh Ninh, TP. Huế",
                "lat": 16.4668, "lng": 107.5835, "is_approved": True, "is_active": True,
                "school": "Đại học Y Dược - Đại học Huế", "major": "Bác sĩ Đa khoa (Năm 4)",
                "elo": 1440, "band": "good", "has_vehicle": True, "gender": "male",
                "skills": ["don_tre", "so_cap_cuu", "sinh_hoc", "dung_gio", "an_toan"],
                "qualifications": ["Sinh viên Y đa khoa năm 4 ĐH Y Dược Huế", "Bằng lái xe máy A1", "Chứng chỉ Kỹ thuật viên Sơ cấp cứu Y tế"],
                "summary": "Chuyên đón trẻ tan trường cẩn thận, phương tiện xe máy trang bị nón bảo hiểm an toàn, am hiểu sơ cứu nhi khoa và chăm sóc sức khỏe ban đầu.",
                "jobs_done": 12, "rating": 4.85,
            },
            {
                "username": "carepartner_pending_hai", "first_name": "Quang Hải", "last_name": "Bùi",
                "email": "hai.bui@student.hueuni.edu.vn", "phone_number": "0987999000",
                "address": "57 Nguyễn Khoa Chiêm, P. An Cựu, TP. Huế",
                "lat": 16.4475, "lng": 107.5955, "is_approved": False, "is_active": True,
                "school": "Đại học Ngoại Ngữ - Đại học Huế", "major": "Sư phạm Tiếng Anh",
                "elo": 1200, "band": "normal", "has_vehicle": True, "gender": "male",
                "skills": ["toan", "tin_hoc"],
                "qualifications": ["Sinh viên năm 2 ĐH Ngoại ngữ Huế", "CCCD 2 mặt + Thẻ SV (đang chờ duyệt)"],
                "summary": "Hồ sơ mới đăng ký, đang chờ Admin kiểm duyệt bằng cấp và CCCD.",
                "jobs_done": 0, "rating": 0.0,
            },
            {
                "username": "carepartner_locked_trung", "first_name": "Thành Trung", "last_name": "Vũ",
                "email": "trung.vu@gmail.com", "phone_number": "0987222333",
                "address": "Đường An Dương Vương, P. An Đông, TP. Huế",
                "lat": 16.4510, "lng": 107.6020, "is_approved": True, "is_active": False,
                "school": "Đại học Nghệ Thuật - Đại học Huế", "major": "Hội họa & Đồ họa",
                "elo": 750, "band": "blocked", "has_vehicle": True, "gender": "male",
                "skills": ["ve_tranh", "my_thuat"],
                "qualifications": ["Sinh viên ĐH Nghệ thuật Huế"],
                "summary": "Tài khoản bị tạm khóa do vi phạm hủy ca không báo trước. Dùng để demo tính năng Admin mở khóa.",
                "jobs_done": 3, "rating": 3.2,
            },
        ]

        worker_dict = {"sinhvien_test": worker_test}

        # Tạo Profile ELO cho sinhvien_test
        CarePartnerProfile.objects.update_or_create(
            user=worker_test,
            defaults={
                "hidden_elo": 1520,
                "effective_elo": 1520.0,
                "band": elo_bands["trusted"],
                "has_vehicle": True,
                "gender": "female",
                "school": "Đại học Sư Phạm - Đại học Huế",
                "major": "Sư phạm Toán học",
                "skills": ["toan", "tieng_anh", "tieu_hoc", "kien_nhan", "phu_dao"],
                "jobs_completed": 18,
                "rating_avg": 4.95,
                "review_count": 16,
            }
        )

        for wp in workers_profiles:
            u, _ = User.objects.update_or_create(
                username=wp["username"],
                defaults={
                    "password": TEST_PASSWORD,
                    "first_name": wp["first_name"],
                    "last_name": wp["last_name"],
                    "email": wp["email"],
                    "phone_number": wp["phone_number"],
                    "address": wp["address"],
                    "role": "worker",
                    "latitude": wp["lat"],
                    "longitude": wp["lng"],
                    "is_active": wp["is_active"],
                    "is_verified": wp["is_approved"],
                    "is_approved": wp["is_approved"],
                    "qualifications": wp["qualifications"],
                    "ai_profile_summary": wp["summary"],
                    "first_login": False,
                }
            )
            u.set_password(TEST_PASSWORD)
            u.save()
            worker_dict[wp["username"]] = u

            CarePartnerProfile.objects.update_or_create(
                user=u,
                defaults={
                    "hidden_elo": wp["elo"],
                    "effective_elo": float(wp["elo"]),
                    "band": elo_bands[wp["band"]],
                    "has_vehicle": wp["has_vehicle"],
                    "gender": wp["gender"],
                    "school": wp["school"],
                    "major": wp["major"],
                    "skills": wp["skills"],
                    "jobs_completed": wp["jobs_done"],
                    "rating_avg": wp["rating"],
                    "review_count": wp["jobs_done"],
                }
            )
            status_txt = "ĐÃ DUYỆT" if wp["is_approved"] else "CHỜ DUYỆT"
            if not wp["is_active"]:
                status_txt = "BỊ TẠM KHÓA"
            self.stdout.write(f"   + CarePartner: {u.get_full_name()} ({u.username}) — ELO {wp['elo']} ({status_txt})")

        # ── Lịch rảnh tuần (CarePartnerAvailability & WorkerAvailability) ──
        # weekday: 0=T2, 1=T3, 2=T4, 3=T5, 4=T6, 5=T7, 6=CN
        active_cps = [worker_test, worker_dict["carepartner_tuankiet"], worker_dict["carepartner_hoango"],
                      worker_dict["carepartner_mylinh"], worker_dict["carepartner_phuoc"]]

        for cp in active_cps:
            # Lịch sáng T2, T4, T6 (08:00 - 12:00)
            for wd in [0, 2, 4]:
                CarePartnerAvailability.objects.update_or_create(
                    carepartner=cp, weekday=wd, time_from=datetime.time(8, 0), time_to=datetime.time(12, 0)
                )
                WorkerAvailability.objects.update_or_create(
                    worker=cp, weekday=wd + 1, defaults={"start_time": "08:00", "end_time": "12:00"}
                )
            # Lịch chiều tối T3, T5, T7, CN (14:00 - 20:00)
            for wd in [1, 3, 5, 6]:
                CarePartnerAvailability.objects.update_or_create(
                    carepartner=cp, weekday=wd, time_from=datetime.time(14, 0), time_to=datetime.time(20, 0)
                )
                WorkerAvailability.objects.update_or_create(
                    worker=cp, weekday=wd + 1, defaults={"start_time": "14:00", "end_time": "20:00"}
                )

        # 1 Ngày bận đột xuất (Blackout) cho Tuấn Kiệt (lý do: thi cuối kỳ)
        CarePartnerBlackout.objects.update_or_create(
            carepartner=worker_dict["carepartner_tuankiet"],
            date=today + timedelta(days=4),
            defaults={"reason": "exam", "note": "Bận thi môn Giải tích 2 tại trường cả ngày"}
        )
        self.stdout.write("   + Đã thiết lập lịch rảnh lặp tuần cho các CarePartner & 1 Blackout ngày bận.")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 6: FLOW 1 — BÀI ĐĂNG VIỆC (JOBPOST) & GHÉP CẶP (BOOKING)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[6/12] Tạo bài đăng việc Flow 1, JobSlot & Booking các trường hợp...")

        from matching.models import (
            JobPost, JobSlot, Booking, CandidateProposal, EloLedger, Appeal
        )

        # ── JOB 1: Gia sư Toán & Tiếng Anh lớp 7 (Đang tìm ứng viên - Matching) ──
        job1 = JobPost.objects.create(
            parent=parent_test,
            job_type=JobPost.JobType.TUTORING,
            title="Gia sư Toán & Tiếng Anh lớp 7 — 3 buổi/tuần",
            description="Bé chuẩn bị thi giữa kỳ, cần sinh viên sư phạm kiên nhẫn củng cố ngữ pháp tiếng Anh và giải toán hình học.",
            hourly_rate_vnd=150000,
            status="matching",
            latitude=parent_test.latitude,
            longitude=parent_test.longitude,
            location_note="Tầng 8, Căn hộ The Manor Crown Huế, Đại lộ Tố Hữu",
            type_data={"subject": "Toán & Tiếng Anh", "grade": "Lớp 7", "sessions_per_week": 3},
            total_matched=3,
        )
        for d_offset in [1, 3, 5]:
            JobSlot.objects.create(
                job=job1, date=today + timedelta(days=d_offset),
                time_from=datetime.time(18, 30), time_to=datetime.time(20, 30),
                status=JobSlot.SlotStatus.FREE
            )
        # Đề xuất ứng viên thuật toán ELO
        CandidateProposal.objects.create(job=job1, carepartner=worker_test, match_score=96, match_level="very_high")
        CandidateProposal.objects.create(job=job1, carepartner=worker_dict["carepartner_tuankiet"], match_score=92, match_level="high")
        CandidateProposal.objects.create(job=job1, carepartner=worker_dict["carepartner_hoango"], match_score=88, match_level="high")
        self.stdout.write(f"   + [Flow 1 Job 1] Gia sư Toán & Anh (matching) — {job1.id}")

        # ── JOB 2: Trông trẻ tại nhà (Đã chọn, đang chờ cam kết - Awaiting Commitment) ──
        job2 = JobPost.objects.create(
            parent=parent_dict["phuhuynh_baolinh"],
            job_type=JobPost.JobType.CHILDCARE,
            title="Trông bé gái 4 tuổi chiều Chủ Nhật",
            description="Gia đình đi tiệc cưới, cần cô giáo mầm non trông bé từ 14h-18h. Bé ngoan, thích tô màu và nghe kể chuyện.",
            hourly_rate_vnd=120000,
            status="matching",
            latitude=parent_dict["phuhuynh_baolinh"].latitude,
            longitude=parent_dict["phuhuynh_baolinh"].longitude,
            location_note="Khu đô thị An Cựu City, Đường Hoàng Quốc Việt",
            type_data={"child_age": 4, "duties": ["cho_an", "to_mau", "ngu_trua"]},
            selected_carepartner=worker_dict["carepartner_hoango"],
        )
        JobSlot.objects.create(
            job=job2, date=today + timedelta(days=2),
            time_from=datetime.time(14, 0), time_to=datetime.time(18, 0),
            status=JobSlot.SlotStatus.LOCKED
        )
        booking2 = Booking.objects.create(
            job=job2,
            carepartner=worker_dict["carepartner_hoango"],
            parent=parent_dict["phuhuynh_baolinh"],
            status="awaiting_commitment",
            selected_at=now - timedelta(minutes=10),
            commit_deadline=now + timedelta(minutes=35), # Còn 35 phút để cam kết!
            total_value_vnd=480000,
        )
        self.stdout.write(f"   + [Flow 1 Job 2] Trông trẻ (awaiting_commitment đếm ngược) — Booking: {booking2.id}")

        # ── JOB 3: Đón trẻ tan trường (Đã cam kết, đang diễn ra - In Progress) ──
        job3 = JobPost.objects.create(
            parent=parent_dict["phuhuynh_minhkhoi"],
            job_type=JobPost.JobType.PICKUP,
            title="Đón bé trai lớp 3 trường Tiểu học Lê Lợi về nhà",
            description="Đón bé lúc 16h30 tại cổng trường Lê Lợi, đưa về căn hộ Vincom Plaza Huế an toàn, cho bé uống sữa và đợi ba mẹ về.",
            hourly_rate_vnd=100000,
            status="closed",
            latitude=parent_dict["phuhuynh_minhkhoi"].latitude,
            longitude=parent_dict["phuhuynh_minhkhoi"].longitude,
            location_note="Đón tại cổng trường Tiểu học Lê Lợi, đưa về căn hộ Vincom Hùng Vương",
            type_data={"pickup_point": "Trường Tiểu học Lê Lợi, TP. Huế", "dropoff_point": "Vincom Plaza, 50A Hùng Vương, TP. Huế"},
            selected_carepartner=worker_dict["carepartner_phuoc"],
        )
        JobSlot.objects.create(
            job=job3, date=today,
            time_from=datetime.time(16, 30), time_to=datetime.time(18, 0),
            status=JobSlot.SlotStatus.LOCKED
        )
        booking3 = Booking.objects.create(
            job=job3,
            carepartner=worker_dict["carepartner_phuoc"],
            parent=parent_dict["phuhuynh_minhkhoi"],
            status="in_progress",
            selected_at=now - timedelta(hours=3),
            commit_deadline=now - timedelta(hours=1),
            committed_at=now - timedelta(hours=2),
            started_at=now - timedelta(minutes=30),
            total_value_vnd=150000,
        )
        self.stdout.write(f"   + [Flow 1 Job 3] Đón trẻ (in_progress) — Booking: {booking3.id}")

        # ── JOB 4: Gia sư Tiếng Anh (Đã hoàn thành xuất sắc - Completed) ──
        job4 = JobPost.objects.create(
            parent=parent_dict["phuhuynh_yenchi"],
            job_type=JobPost.JobType.TUTORING,
            title="Gia sư Tiếng Anh giao tiếp cho bé 8 tuổi",
            description="Luyện phát âm chuẩn IPA và phản xạ giao tiếp tiếng Anh qua trò chơi tương tác.",
            hourly_rate_vnd=160000,
            status="closed",
            selected_carepartner=worker_test,
        )
        JobSlot.objects.create(
            job=job4, date=today - timedelta(days=2),
            time_from=datetime.time(19, 0), time_to=datetime.time(21, 0),
            status=JobSlot.SlotStatus.DONE
        )
        booking4 = Booking.objects.create(
            job=job4,
            carepartner=worker_test,
            parent=parent_dict["phuhuynh_yenchi"],
            status="completed",
            selected_at=now - timedelta(days=3),
            commit_deadline=now - timedelta(days=3, hours=-2),
            committed_at=now - timedelta(days=3, hours=-1),
            started_at=now - timedelta(days=2, hours=2),
            ended_at=now - timedelta(days=2),
            total_value_vnd=320000,
            elo_delta_applied=15,
        )
        EloLedger.objects.create(
            carepartner=worker_test, booking=booking4, delta=15,
            reason_code="job_completed", elo_before=1505, elo_after=1520,
            note="Hoàn thành xuất sắc buổi dạy Tiếng Anh"
        )
        self.stdout.write(f"   + [Flow 1 Job 4] Gia sư (completed +15 ELO) — Booking: {booking4.id}")

        # ── JOB 5: Trông trẻ (CarePartner hủy ca sát giờ & Kháng cáo ELO - Appeal) ──
        job5 = JobPost.objects.create(
            parent=parent_dict["phuhuynh_congvinh"],
            job_type=JobPost.JobType.CHILDCARE,
            title="Trông bé tối thứ 6",
            description="Trông bé 3 tuổi từ 18h-21h.",
            hourly_rate_vnd=100000,
            status="closed",
            selected_carepartner=worker_dict["carepartner_tuankiet"],
        )
        booking5 = Booking.objects.create(
            job=job5,
            carepartner=worker_dict["carepartner_tuankiet"],
            parent=parent_dict["phuhuynh_congvinh"],
            status="cancelled_by_carepartner",
            selected_at=now - timedelta(days=1, hours=6),
            commit_deadline=now - timedelta(days=1, hours=4),
            committed_at=now - timedelta(days=1, hours=5),
            cancelled_at=now - timedelta(days=1, hours=1),
            cancelled_by="carepartner",
            cancel_reason_code="broken_vehicle",
            cancel_class="normal_cancel",
            cancel_note="Bị thủng lốp và hỏng xe trên cầu Trường Tiền lúc 17h, không kịp đến điểm hẹn.",
            total_value_vnd=300000,
            compensation_vnd=120000, # Đền bù 40% (T3)
            elo_delta_applied=-60,
        )
        EloLedger.objects.create(
            carepartner=worker_dict["carepartner_tuankiet"], booking=booking5, delta=-60,
            reason_code="T3", elo_before=1540, elo_after=1480,
            note="Phạt T3 do hủy việc trước giờ làm 2 tiếng"
        )
        # Đơn kháng cáo ELO chờ Admin duyệt!
        Appeal.objects.create(
            booking=booking5,
            carepartner=worker_dict["carepartner_tuankiet"],
            reason_code="broken_vehicle",
            note="Kính gửi Admin, em bị tai nạn nhẹ hỏng xe trên cầu Trường Tiền khi đang tới nhà phụ huynh, có hóa đơn sửa xe của tiệm đường Phan Đăng Lưu kèm theo. Kính mong Admin xem xét giảm trừ mức phạt ELO vì lý do bất khả kháng ạ.",
            status="pending",
        )
        self._log(f"   + [Flow 1 Job 5] Trông trẻ (cancelled T3 & Appeal pending) — Booking: {booking5.id}")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 7: CORE TASKS (13 CÔNG VIỆC ĐỦ TẤT CẢ TRẠNG THÁI)
        # ═══════════════════════════════════════════════════════════════
        self._log("\n[7/12] Tạo 13 công việc Core Tasks (open, in_progress, completed, cancelled)...")

        tasks_configs = [
            # ── OPEN TASKS (5) ──
            {
                "key": "t0", "title": "[TEST DEMO] Dạy kèm Tiếng Anh giao tiếp và kể chuyện bé 6 tuổi",
                "description": "Cần tìm CarePartner kiên nhẫn, phát âm chuẩn hướng dẫn bé 6 tuổi học từ vựng và xem tranh tiếng Anh 2 buổi cuối tuần.",
                "price": 250000, "cat": cats["Gia sư"], "parent": parent_test,
                "loc": "Căn hộ The Manor Crown Huế, Đại lộ Tố Hữu, P. Xuân Phú, TP. Huế",
                "lat": 16.4602, "lng": 107.6008, "status": "open", "scheduled": now + timedelta(days=2),
                "applicants": ["carepartner_tuankiet", "carepartner_hoango", "carepartner_mylinh"],
            },
            {
                "key": "t1", "title": "Gia sư Vật Lý lớp 10 — 2 buổi/tuần (Thứ 3 & Thứ 5)",
                "description": "Bé bị hổng kiến thức phần Động lực học chất điểm, cần sinh viên Khoa học hoặc Sư Phạm kiên nhẫn giảng lại lý thuyết và hướng dẫn giải bài tập.",
                "price": 250000, "cat": cats["Gia sư"], "parent": parent_dict["phuhuynh_baolinh"],
                "loc": "Khu đô thị An Cựu City, Đường Hoàng Quốc Việt, TP. Huế",
                "lat": 16.4525, "lng": 107.6045, "status": "open", "scheduled": now + timedelta(days=2),
                "applicants": ["carepartner_tuankiet", "sinhvien_test", "carepartner_phuoc"],
            },
            {
                "key": "t2", "title": "[GẤP] Đón bé lớp 2 tan trường Vĩnh Ninh chiều Thứ 6",
                "description": "Cần bạn đón bé lúc 16h30 từ trường về căn hộ Vincom. Nhà cách trường 1.5km. Yêu cầu có xe máy an toàn, đội nón bảo hiểm cho bé.",
                "price": 120000, "cat": cats["Đón trẻ"], "parent": parent_dict["phuhuynh_minhkhoi"],
                "loc": "Trường Tiểu học Vĩnh Ninh, 09 Trương Định, P. Vĩnh Ninh, TP. Huế",
                "lat": 16.4665, "lng": 107.5862, "status": "open", "scheduled": now + timedelta(days=1),
                "applicants": ["carepartner_phuoc", "carepartner_hoango"],
            },
            {
                "key": "t3", "title": "Gia sư Toán lớp 9 ôn thi giữa kỳ 2 buổi",
                "description": "Bé yếu phần hằng đẳng thức và biến đổi biểu thức, cần gia sư kiên nhẫn giảng lại lý thuyết kèm bài tập luyện thêm 2 buổi cuối tuần.",
                "price": 300000, "cat": cats["Gia sư"], "parent": parent_dict["phuhuynh_yenchi"],
                "loc": "Chung cư Đống Đa, Đường Đống Đa, P. Phú Nhuận, TP. Huế",
                "lat": 16.4640, "lng": 107.5910, "status": "open", "scheduled": now + timedelta(days=4),
                "applicants": ["carepartner_mylinh", "carepartner_phuoc", "carepartner_hoango"],
            },
            {
                "key": "t4", "title": "Trông bé 3 tuổi buổi sáng Thứ Bảy (08:00 - 11:30)",
                "description": "Mẹ có cuộc họp online, cần người chơi cùng bé, cho bé uống sữa và hướng dẫn bé xếp hình gỗ. Bé rất ngoan và dễ gần.",
                "price": 220000, "cat": cats["Trông trẻ"], "parent": parent_dict["phuhuynh_congvinh"],
                "loc": "Chung cư Xuân Phú, Hoàng Lanh, P. Xuân Phú, TP. Huế",
                "lat": 16.4589, "lng": 107.6023, "status": "open", "scheduled": now + timedelta(days=3),
                "applicants": ["carepartner_hoango", "carepartner_tuankiet", "sinhvien_test"],
            },

            # ── IN_PROGRESS TASKS (3) ──
            {
                "key": "t5", "title": "[TEST DEMO] Trông bé 5 tuổi chiều Thứ 7 & Dạy vẽ màu nước",
                "description": "Công việc chính của tài khoản test: trông bé trai 5 tuổi, hướng dẫn vẽ tranh sáng tạo và cho bé ăn xế chiều. Nhà có camera an ninh.",
                "price": 280000, "cat": cats["Trông trẻ"], "parent": parent_test,
                "loc": "Căn hộ The Manor Crown Huế, Đại lộ Tố Hữu, P. Xuân Phú, TP. Huế",
                "lat": 16.4602, "lng": 107.6008, "status": "in_progress", "scheduled": now + timedelta(hours=2),
                "accepted_worker": "sinhvien_test",
                "geofence": {"lat": 16.4602, "lng": 107.6008, "radius": 400},
            },
            {
                "key": "t6", "title": "Trông bé 4 tuổi tối Thứ 6 (cho ăn + dỗ ngủ)",
                "description": "Ba mẹ đi sự kiện công ty, cần bạn trông bé 4 tuổi từ 18h-21h: cho bé ăn tối, đọc truyện và dỗ bé ngủ sớm. Nguyên liệu bữa tối chuẩn bị sẵn.",
                "price": 250000, "cat": cats["Trông trẻ"], "parent": parent_dict["phuhuynh_baolinh"],
                "loc": "Khu đô thị An Cựu City, Đường Hoàng Quốc Việt, TP. Huế",
                "lat": 16.4525, "lng": 107.6045, "status": "in_progress", "scheduled": now + timedelta(hours=1),
                "accepted_worker": "carepartner_mylinh",
                "geofence": {"lat": 16.4525, "lng": 107.6045, "radius": 400},
            },
            {
                "key": "t7", "title": "Đón bé trường Tiểu học Lê Lợi về nhà (có SOS)",
                "description": "Đón bé 7 tuổi từ trường Lê Lợi về nhà. CarePartner đang thực hiện nhiệm vụ đón bé trên đường.",
                "price": 100000, "cat": cats["Đón trẻ"], "parent": parent_dict["phuhuynh_yenchi"],
                "loc": "Trường Tiểu học Lê Lợi, Đường Lê Lợi, TP. Huế",
                "lat": 16.4670, "lng": 107.5870, "status": "in_progress", "scheduled": now - timedelta(minutes=20),
                "accepted_worker": "carepartner_phuoc",
                "geofence": {"lat": 16.4678, "lng": 107.5855, "radius": 500},
            },

            # ── COMPLETED TASKS (4) ──
            {
                "key": "t8", "title": "Gia sư Toán lớp 6 chữa bài tập cuối tuần",
                "description": "Dạy kèm 2 buổi chữa bài tập phân số - tỷ lệ phần trăm, rèn kỹ năng trình bày bài. Đã hoàn thành xuất sắc.",
                "price": 500000, "cat": cats["Gia sư"], "parent": parent_dict["phuhuynh_minhkhoi"],
                "loc": "Phố cổ Bao Vinh, P. Hương Vinh, TP. Huế",
                "lat": 16.4850, "lng": 107.5790, "status": "completed", "scheduled": now - timedelta(days=5),
                "accepted_worker": "carepartner_mylinh",
                "review": {"rating": 5, "comment": "Mỹ Linh dạy rất kiên nhẫn, bé từ chán Toán giờ chủ động làm bài. Giải thích dễ hiểu và rất đúng giờ. Rất hài lòng!"},
                "payment_method": "momo_escrow",
            },
            {
                "key": "t9", "title": "Đón bé mầm non về nhà cả tuần (Thứ 2 - Thứ 6)",
                "description": "Đón bé 5 tuổi lúc 16h15 tại trường mầm non, đưa về nhà kiểm soát an toàn, đối chiếu đón đúng người theo hóa đơn ghi nhận ca.",
                "price": 150000, "cat": cats["Đón trẻ"], "parent": parent_dict["phuhuynh_congvinh"],
                "loc": "Trường Mầm non Hoa Sen, Đường Bà Triệu, P. Phú Hội, TP. Huế",
                "lat": 16.4628, "lng": 107.5968, "status": "completed", "scheduled": now - timedelta(days=7),
                "accepted_worker": "carepartner_tuankiet",
                "review": {"rating": 5, "comment": "Tuấn Kiệt đón bé đúng giờ cả tuần, giao bé đúng người và thông báo kịp thời. Rất an tâm."},
                "payment_method": "cash",
            },
            {
                "key": "t10", "title": "[TEST DEMO] Trông 2 bé tối Thứ 7 tuần trước",
                "description": "Trông 2 bé (4 tuổi và 7 tuổi), cho ăn tối và dỗ bé ngủ. Minh Anh đã làm rất tốt. Đang chờ phụ huynh đánh giá chất lượng ca làm.",
                "price": 320000, "cat": cats["Trông trẻ"], "parent": parent_test,
                "loc": "Căn hộ The Manor Crown Huế, Đại lộ Tố Hữu, P. Xuân Phú, TP. Huế",
                "lat": 16.4602, "lng": 107.6008, "status": "completed", "scheduled": now - timedelta(days=4),
                "accepted_worker": "sinhvien_test",
                "payment_method": "momo_escrow",
            },
            {
                "key": "t11", "title": "Gia sư Hóa học lớp 11 nâng cao luyện thi học kỳ",
                "description": "Dạy kèm 2 buổi chuyên đề bài tập Axit Nitric và Hợp chất hữu cơ.",
                "price": 260000, "cat": cats["Gia sư"], "parent": parent_dict["phuhuynh_baolinh"],
                "loc": "Khu đô thị An Cựu City, Hoàng Quốc Việt, TP. Huế",
                "lat": 16.4525, "lng": 107.6045, "status": "completed", "scheduled": now - timedelta(days=8),
                "accepted_worker": "carepartner_tuankiet",
                "review": {"rating": 4, "comment": "Phương pháp dạy dễ hiểu, giải bài mẫu rõ ràng. Nhắc bé làm bài tập về nhà kỹ hơn một chút là hoàn hảo."},
                "payment_method": "cash",
            },

            # ── CANCELLED TASK (1) ──
            {
                "key": "t12", "title": "Gia sư Tiếng Anh giao tiếp cho bé lớp 3 (đã hủy)",
                "description": "Phụ huynh hủy vì bé bị ốm phải nhập viện điều trị.",
                "price": 200000, "cat": cats["Gia sư"], "parent": parent_dict["phuhuynh_yenchi"],
                "loc": "15 Lê Lợi, P. Vĩnh Ninh, TP. Huế",
                "lat": 16.4678, "lng": 107.5855, "status": "cancelled", "scheduled": now - timedelta(days=3),
            },
        ]

        task_dict = {}
        for tc in tasks_configs:
            gf = tc.get("geofence") or {}
            t_obj = Task.objects.create(
                title=tc["title"],
                description=tc["description"],
                price=tc["price"],
                category=tc["cat"],
                parent=tc["parent"],
                location=tc["loc"],
                latitude=tc["lat"],
                longitude=tc["lng"],
                status=tc["status"],
                scheduled_time=tc["scheduled"],
                geofence_lat=gf.get("lat"),
                geofence_lng=gf.get("lng"),
                geofence_radius=gf.get("radius"),
            )
            task_dict[tc["key"]] = t_obj

            # Tạo applications cho open tasks
            for ap_uname in tc.get("applicants", []):
                TaskApplication.objects.create(
                    task=t_obj, worker=worker_dict[ap_uname], status="pending"
                )

            # Tạo accepted application cho in_progress & completed
            if "accepted_worker" in tc:
                w_user = worker_dict[tc["accepted_worker"]]
                TaskApplication.objects.create(
                    task=t_obj, worker=w_user, status="accepted"
                )

            # Tạo review cho completed tasks
            if "review" in tc:
                rv = tc["review"]
                Review.objects.create(
                    task=t_obj, reviewer=t_obj.parent, reviewee=worker_dict[tc["accepted_worker"]],
                    rating=rv["rating"], comment=rv["comment"]
                )

        self.stdout.write(f"   + Đã tạo 12 Core Tasks với ứng tuyển và đánh giá tương ứng.")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 8: TRACKING, GEOFENCE, HEARTBEAT & SOS ALERTS
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[8/12] Tạo dữ liệu Định vị trực tiếp (Live Tracking), SOS & Thiết bị...")

        from tracking.models import (
            LocationConsent, LiveLocation, LocationHistory,
            DeviceHeartbeat, DeviceOfflineAlert, SOSAlert
        )

        # 1. Tracking cho Task 5 (phuhuynh_test ↔ sinhvien_test)
        t5 = task_dict["t5"]
        LocationConsent.objects.create(
            task=t5, worker=worker_test, consent="granted",
            granted_at=now - timedelta(hours=1)
        )
        LiveLocation.objects.create(
            task=t5, worker=worker_test,
            latitude=D("16.4602"), longitude=D("107.6008"),
            accuracy=4.5, speed=0.0, heading=90.0,
            is_outside_geofence=False,
        )
        for idx in range(5):
            LocationHistory.objects.create(
                task=t5, worker=worker_test,
                latitude=D(str(16.4580 + idx * 0.0005)),
                longitude=D(str(107.5990 + idx * 0.0004)),
                accuracy=5.0, speed=1.5,
                recorded_at=now - timedelta(minutes=30 - idx * 5)
            )
        DeviceHeartbeat.objects.create(
            task=t5, worker=worker_test,
            last_seen=now - timedelta(seconds=12),
            last_location_lat=D("16.4602"), last_location_lng=D("107.6008"),
            device_status="online", battery_level=88,
            app_state="foreground", network_type="wifi"
        )

        # 2. Tracking cho Task 7 (Có cảnh báo SOS ACTIVE để test nút SOS)
        t7 = task_dict["t7"]
        w_phuoc = worker_dict["carepartner_phuoc"]
        LocationConsent.objects.create(
            task=t7, worker=w_phuoc, consent="granted",
            granted_at=now - timedelta(minutes=30)
        )
        LiveLocation.objects.create(
            task=t7, worker=w_phuoc,
            latitude=D("16.4670"), longitude=D("107.5870"),
            accuracy=6.0, speed=2.0, heading=180.0,
            is_outside_geofence=False,
        )
        # ⚡ SOS ALERT ĐANG HOẠT ĐỘNG (ACTIVE)
        SOSAlert.objects.create(
            task=t7, sender="worker", sender_user=w_phuoc,
            latitude=D("16.4670"), longitude=D("107.5870"),
            message="Bé bị sốt cao 39 độ đột ngột tại cổng trường Lê Lợi, em đang chườm ấm và xin ý kiến phụ huynh gấp!",
            status="active",
        )
        # 1 SOS Alert đã giải quyết xong trong quá khứ
        SOSAlert.objects.create(
            task=task_dict["t10"], sender="parent", sender_user=parent_test,
            latitude=D("16.4602"), longitude=D("107.6008"),
            message="Kiểm tra nhầm nút SOS khẩn cấp, bé vẫn chơi bình thường.",
            status="resolved", resolved_at=now - timedelta(days=4), resolved_by=admin_user
        )

        # 1 Cảnh báo mất kết nối đã phục hồi (DeviceOfflineAlert recovered)
        DeviceOfflineAlert.objects.create(
            task=t5, worker=worker_test,
            last_seen=now - timedelta(minutes=15),
            last_location_lat=D("16.4602"), last_location_lng=D("107.6008"),
            status="recovered", push_sent=True, push_sent_at=now - timedelta(minutes=14),
            recovered_at=now - timedelta(minutes=12), recovery_duration_seconds=120,
        )
        self.stdout.write("   + Đã tạo LiveLocation, vệt hành trình GPS, Heartbeat online & SOS Alert (ACTIVE + RESOLVED).")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 9: PAYMENTS (MOMO ESCROW, TIỀN MẶT & QUYẾT TOÁN THÁNG)
        # ═══════════════════════════════════════════════════════════════
        self.stdout.write("\n[9/12] Tạo thanh toán MoMo Escrow, Tiền mặt & Quyết toán hoa hồng...")

        from payments.models import Payment, CommissionSettlement, PaymentLog

        # 1. MoMo Escrow HELD (Task 5 - in_progress)
        amt_t5 = D(str(t5.price))
        comm_t5 = (amt_t5 * D("0.20")).quantize(D("1"))
        p_held = Payment.objects.create(
            task=t5, parent=t5.parent, worker=worker_test,
            amount=amt_t5, commission_rate=D("0.2000"),
            commission_amount=comm_t5, worker_payout_amount=amt_t5 - comm_t5,
            method="momo_escrow", status="held",
            momo_order_id=f"EduCareLink_{t5.id}_held",
            momo_trans_id=f"405{t5.id:08d}",
            momo_pay_url="https://testing.momo.vn/v2/gateway/pay?t=TEST",
            held_at=now - timedelta(hours=1),
        )
        PaymentLog.objects.create(payment=p_held, event_type="payment_created", message="Tạo lệnh ký quỹ MoMo Escrow")
        PaymentLog.objects.create(payment=p_held, event_type="momo_ipn_held", message="MoMo IPN xác nhận giữ tiền thành công")

        # 2. MoMo Escrow COMPLETED (Task 8 & Task 10)
        for t_comp in [task_dict["t8"], task_dict["t10"]]:
            acc = TaskApplication.objects.filter(task=t_comp, status="accepted").first()
            amt = D(str(t_comp.price))
            comm = (amt * D("0.20")).quantize(D("1"))
            p_comp = Payment.objects.create(
                task=t_comp, parent=t_comp.parent, worker=acc.worker,
                amount=amt, commission_rate=D("0.2000"),
                commission_amount=comm, worker_payout_amount=amt - comm,
                method="momo_escrow", status="completed",
                momo_order_id=f"EduCareLink_{t_comp.id}_done",
                momo_trans_id=f"405{t_comp.id:08d}",
                held_at=t_comp.scheduled_time - timedelta(hours=2),
                completed_at=t_comp.scheduled_time + timedelta(hours=3),
            )
            PaymentLog.objects.create(payment=p_comp, event_type="payment_created", message="Tạo thanh toán MoMo")
            PaymentLog.objects.create(payment=p_comp, event_type="momo_ipn_held", message="MoMo giữ tiền thành công")
            PaymentLog.objects.create(payment=p_comp, event_type="escrow_released", message="Đã giải ngân 80% cho CarePartner")

        # 3. Cash COMPLETED (Task 9 & Task 11)
        for t_cash in [task_dict["t9"], task_dict["t11"]]:
            acc = TaskApplication.objects.filter(task=t_cash, status="accepted").first()
            amt = D(str(t_cash.price))
            comm = (amt * D("0.20")).quantize(D("1"))
            p_cash = Payment.objects.create(
                task=t_cash, parent=t_cash.parent, worker=acc.worker,
                amount=amt, commission_rate=D("0.2000"),
                commission_amount=comm, worker_payout_amount=amt - comm,
                method="cash", status="completed",
                completed_at=t_cash.scheduled_time + timedelta(hours=2),
            )
            PaymentLog.objects.create(payment=p_cash, event_type="cash_recorded", message="Ghi nhận thanh toán tiền mặt và hoa hồng nền tảng")

        # 4. Quyết toán hoa hồng tháng (CommissionSettlement)
        # Tháng trước: ĐÃ THANH TOÁN (paid)
        last_month = 12 if now.month == 1 else now.month - 1
        last_year = now.year - 1 if now.month == 1 else now.year
        CommissionSettlement.objects.create(
            worker=worker_test,
            period_year=last_year, period_month=last_month,
            total_tasks=3, total_amount=D("180000"),
            task_ids=[1, 2, 3], status="paid",
            momo_order_id=f"settle_{last_year}_{last_month}_{worker_test.id}",
            momo_trans_id="9988776655",
            generated_at=now - timedelta(days=12),
            paid_at=now - timedelta(days=8),
        )
        self.stdout.write("   + Đã tạo Payment MoMo Escrow (held + completed), Cash & Quyết toán hoa hồng tháng.")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 10: CỬA SỔ CHAT TRỰC TIẾP (CHAT CONVERSATION & MESSAGES)
        # ═══════════════════════════════════════════════════════════════
        self._log("\n[10/12] Tạo phiên Chat phụ huynh ↔ CarePartner và tin nhắn mẫu...")

        from chat.models import Conversation, Message

        # 1. Cửa sổ chat ĐANG MỞ cho Task 5 (phuhuynh_test ↔ sinhvien_test)
        conv_open, _ = Conversation.objects.update_or_create(
            task=t5,
            defaults={
                "parent": parent_test,
                "worker": worker_test,
                "status": "open",
                "opens_at": now - timedelta(hours=1),
                "closes_at": now + timedelta(hours=26),
            }
        )
        chat_messages_data = [
            (parent_test, "Chào em Minh Anh, chiều nay 14h em qua trông bé Bon giúp chị nhé. Chị có để sẵn sữa chua và hoa quả trên bàn bếp.", 45),
            (worker_test, "Dạ em chào chị Nhung ạ! Em đã nhận được dặn dò của chị. Tầm 13h50 em sẽ có mặt đúng giờ ạ.", 40),
            (parent_test, "Bé Bon hôm nay thích vẽ tranh lắm, em hướng dẫn bé tô màu nước giúp chị nha.", 35),
            (worker_test, "Dạ vâng chị an tâm, em có mang theo cả tập tranh tô màu con vật ngộ nghĩnh cho bé đây rồi ạ.", 30),
            (worker_test, "Chị ơi, em đã đến nhà an toàn và bé Bon đang hào hứng tô bức tranh chú gấu rồi chị nhé! 😊", 10),
        ]
        for sender, text, min_ago in chat_messages_data:
            Message.objects.create(
                conversation=conv_open,
                sender=sender,
                content=text,
                read_at=now - timedelta(minutes=min_ago - 1)
            )

        # 2. Cửa sổ chat ĐÃ ĐÓNG (read-only) cho Task 10 (ca đã xong)
        conv_closed, _ = Conversation.objects.update_or_create(
            task=task_dict["t10"],
            defaults={
                "parent": parent_test,
                "worker": worker_test,
                "status": "closed",
                "opens_at": now - timedelta(days=5),
                "closes_at": now - timedelta(days=3),
                "closed_at": now - timedelta(days=3),
            }
        )
        Message.objects.create(
            conversation=conv_closed, sender=worker_test,
            content="Em đã cho 2 bé đi ngủ ngon lành lúc 21h30 rồi chị nhé. Chúc gia đình buổi tối vui vẻ ạ!",
            read_at=now - timedelta(days=4)
        )
        Message.objects.create(
            conversation=conv_closed, sender=parent_test,
            content="Cảm ơn em nhiều nha Minh Anh, tiền chị đã xác nhận thanh toán rồi nhé!",
            read_at=now - timedelta(days=4)
        )
        self._log("   + Đã tạo 2 cuộc hội thoại Chat (1 ĐANG MỞ với 5 tin nhắn + 1 ĐÃ ĐÓNG lưu lịch sử).")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 11: NHẬT KÝ CHĂM SÓC (CARE DIARY) & HOẠT ĐỘNG
        # ═══════════════════════════════════════════════════════════════
        self._log("\n[11/12] Tạo Nhật ký chăm sóc (Care Diary) theo ca...")

        from care_diary.models import CareDiaryEntry, CareDiaryActivity

        # 1. Nhật ký ca Task 10 (Hoàn thành 100%)
        entry_t10 = CareDiaryEntry.objects.create(
            task=task_dict["t10"], worker=worker_test,
            mood_icon="😊", mood_label="Vui vẻ",
            completion_percent=100,
            note="Hai bé ngoan, ăn hết phần cháo thịt bằm và uống sữa đầy đủ. Bé lớn tự giác làm bài tập toán, bé nhỏ chơi lắp ghép Lego ngoan ngoãn.",
            created_at=now - timedelta(days=4)
        )
        activities_t10 = [
            ("18:00", "Đến nhà & Chào hỏi phụ huynh", "done", 0),
            ("18:30", "Cho 2 bé ăn tối & uống nước ấm", "done", 1),
            ("19:30", "Hướng dẫn bé lớn hoàn thành bài tập về nhà", "done", 2),
            ("20:30", "Chơi trò chơi thông minh cùng bé nhỏ", "done", 3),
            ("21:30", "Vệ sinh răng miệng & Đọc truyện dỗ bé ngủ", "done", 4),
        ]
        for a_time, a_title, a_status, a_order in activities_t10:
            CareDiaryActivity.objects.create(
                entry=entry_t10, time=a_time, title=a_title, status=a_status, order=a_order
            )

        # 2. Nhật ký ca Task 5 (Đang thực hiện 60%)
        entry_t5 = CareDiaryEntry.objects.create(
            task=t5, worker=worker_test,
            mood_icon="🎨", mood_label="Hào hứng",
            completion_percent=60,
            note="Bé Bon rất tập trung pha màu nước, đã tô xong bức tranh chú gấu và chuẩn bị ăn xế chiều.",
            created_at=now - timedelta(minutes=40)
        )
        CareDiaryActivity.objects.create(entry=entry_t5, time="14:00", title="Có mặt tại nhà bé & kiểm tra góc vẽ", status="done", order=0)
        CareDiaryActivity.objects.create(entry=entry_t5, time="14:30", title="Dạy kỹ năng phối màu nước cơ bản", status="done", order=1)
        CareDiaryActivity.objects.create(entry=entry_t5, time="16:00", title="Cho bé ăn bánh flan và uống sữa tươi", status="partial", order=2)
        CareDiaryActivity.objects.create(entry=entry_t5, time="17:30", title="Dọn dẹp dụng cụ vẽ & bàn giao cho mẹ", status="partial", order=3)
        self._log("   + Đã tạo Care Diary Entries (100% hoàn tất & 60% đang diễn ra).")

        # ═══════════════════════════════════════════════════════════════
        #  PHẦN 12: QUẢN TRỊ ADMIN — MODERATION, KHIẾU NẠI & BẰNG CẤP
        # ═══════════════════════════════════════════════════════════════
        self._log("\n[12/12] Tạo dữ liệu Quản trị: Khiếu nại, Bằng cấp, Kiểm duyệt & Thông báo...")

        from moderation.models import TaskModeration, Complaint

        # 1. AI TaskModeration cho các task
        for k, t in task_dict.items():
            verdict = "approved"
            if k == "t12":
                verdict = "flagged"
            TaskModeration.objects.update_or_create(
                task=t,
                defaults={
                    "status": "approved" if verdict == "approved" else "needs_review",
                    "ai_verdict": verdict,
                    "ai_confidence": 0.95,
                    "ai_suggestion": "Nội dung công việc rõ ràng, phù hợp quy chuẩn đạo đức và thuần phong mỹ tục.",
                }
            )

        # 2. Khiếu nại (Complaints) — 3 trường hợp (pending, investigating, resolved)
        # Case 1: PENDING — AI phân tích độ ưu tiên HIGH
        Complaint.objects.create(
            complainant=worker_dict["carepartner_tuankiet"],
            reported_user=parent_dict["phuhuynh_baolinh"],
            task=task_dict["t11"],
            complaint_type="non_payment",
            title="Phụ huynh chậm thanh toán tiền gia sư quá 5 ngày",
            description="Em đã hoàn thành 2 buổi dạy Hóa kèm cho bé, phụ huynh hẹn thanh toán qua chuyển khoản nhưng đến nay vẫn chưa gửi.",
            status="pending", priority="high",
            ai_analyzed=True,
            ai_analysis="Hệ thống kiểm tra: Buổi học đã hoàn thành ngày hôm trước nhưng bản ghi Payment chưa hoàn tất. Đề xuất ưu tiên HIGH, Admin gửi nhắc nhở phụ huynh.",
            ai_priority="high",
        )
        # Case 2: INVESTIGATING — Tranh chấp phát sinh ngoài hợp đồng (URGENT)
        Complaint.objects.create(
            complainant=worker_dict["carepartner_mylinh"],
            reported_user=parent_dict["phuhuynh_minhkhoi"],
            task=task_dict["t8"],
            complaint_type="exploitation",
            title="Yêu cầu làm thêm việc ngoài thỏa thuận ban đầu",
            description="Ban đầu thỏa thuận chỉ dọn căn hộ, nhưng khi đến nơi phụ huynh yêu cầu khiêng vác tủ gỗ nặng và dọn thêm sân thượng trời mưa.",
            status="investigating", priority="urgent",
            ai_analyzed=True,
            ai_analysis="Có dấu hiệu vi phạm an toàn lao động và sai phạm vi công việc. Đề xuất URGENT để bảo vệ CarePartner.",
            ai_priority="urgent",
        )
        # Case 3: RESOLVED — Đã giải quyết xong
        Complaint.objects.create(
            complainant=parent_dict["phuhuynh_yenchi"],
            reported_user=worker_dict["carepartner_tuankiet"],
            complaint_type="other",
            title="Đến trễ 15 phút không báo trước",
            description="Buổi học đầu tiên gia sư đến muộn 15 phút làm lỡ giờ cơm tối của bé.",
            status="resolved", priority="low",
            admin_response="Admin đã liên hệ nhắc nhở CarePartner Tuấn Kiệt nghiêm túc tuân thủ giờ giấc. CarePartner đã xin lỗi phụ huynh và bù thêm 30 phút vào buổi học sau.",
            resolved_by=admin_user, resolved_at=now - timedelta(days=2)
        )

        # 3. Minh chứng Bằng cấp (CredentialSubmission) — pending, approved, rejected
        CredentialSubmission.objects.create(
            worker=worker_dict["carepartner_pending_hai"],
            description="Chứng chỉ IELTS 7.0 Quốc Tế & Giấy khen Sinh viên Giỏi ĐH Ngoại ngữ Huế năm 2025",
            status="pending"
        )
        CredentialSubmission.objects.create(
            worker=worker_dict["carepartner_hoango"],
            description="Bằng Cử Nhân Sư Phạm Mầm Non chính quy loại Giỏi — ĐH Sư Phạm Huế (Đại học Huế)",
            status="approved",
            admin_review="Bằng cấp hợp lệ, đã đối chiếu với cơ sở dữ liệu sinh viên của nhà trường.",
            reviewed_at=now - timedelta(days=5)
        )
        CredentialSubmission.objects.create(
            worker=worker_dict["carepartner_tuankiet"],
            description="Ảnh chụp chứng chỉ tin học văn phòng (bị mờ, không thấy rõ số hiệu)",
            status="rejected",
            admin_review="Ảnh chứng chỉ bị mờ, không thấy rõ dấu giáp lai và số hiệu. Vui lòng chụp quét lại bản gốc rõ nét.",
            reviewed_at=now - timedelta(days=3)
        )

        # 4. Yêu cầu đổi thông tin hồ sơ (ProfileChangeRequest) — pending
        ProfileChangeRequest.objects.create(
            worker=worker_dict["carepartner_tuankiet"],
            proposed_changes={
                "phone_number": "0987111999",
                "address": "Ký túc xá Đại học Khoa học Huế, 77 Nguyễn Huệ, P. Phú Nhuận, TP. Huế"
            },
            status="pending",
        )

        # 5. Thông báo (Notification)
        Notification.objects.create(
            recipient=None, # Broadcast toàn hệ thống
            title="Chào mừng bạn đến với phiên bản EduCareLink 2026!",
            message="Nền tảng đã kích hoạt thuật toán ghép cặp thông minh ELO và hệ thống bảo vệ an toàn Live Tracking thời gian thực."
        )
        Notification.objects.create(
            recipient=parent_test,
            title="AI gợi ý: Có 3 CarePartner rất phù hợp với bé nhà bạn!",
            message="Thuật toán ELO đã tìm thấy 3 ứng viên xuất sắc trong bán kính 3km có lịch rảnh khớp với yêu cầu của bạn."
        )
        Notification.objects.create(
            recipient=worker_test,
            title="Nhắc nhở ca làm chiều nay lúc 14:00",
            message="Bạn có 1 ca làm trông bé chiều nay tại The Manor Crown Huế. Đừng quên bật chia sẻ vị trí (Live Tracking) khi bắt đầu di chuyển nhé!"
        )

        self._log("   + Đã tạo đầy đủ Kiểm duyệt, Khiếu nại AI, Bằng cấp, Yêu cầu đổi hồ sơ & Thông báo.")

        # ═══════════════════════════════════════════════════════════════
        #  TỔNG KẾT DỮ LIỆU
        # ═══════════════════════════════════════════════════════════════
        self._log("\n" + "=" * 72)
        self._log("  RESET & SEED DỮ LIỆU THÀNH CÔNG RỰC RỠ — SẴN SÀNG CHO MỌI BÀI KIỂM THỬ!")
        self._log("=" * 72)
        self._log(f"""
  📊 THỐNG KÊ DATABASE SAU KHI NẠP:
    • Danh mục dịch vụ : {ServiceCategory.objects.count()} danh mục
    • Tổng người dùng  : {User.objects.count()} tài khoản
    • Tổng Core Tasks  : {Task.objects.count()} công việc (open, in_progress, completed, cancelled)
    • Ứng tuyển & Review: {TaskApplication.objects.count()} ứng tuyển, {Review.objects.count()} đánh giá
    • Flow 1 Ghép cặp  : {JobPost.objects.count()} JobPost, {Booking.objects.count()} Booking, {Appeal.objects.count()} Kháng cáo
    • Ví Credit Phụ Huynh: {CreditBalance.objects.count()} ví credit hoạt động
    • Hồ sơ ELO & Lịch : {CarePartnerProfile.objects.count()} profile ELO, {CarePartnerAvailability.objects.count()} ca rảnh tuần
    • Live Tracking    : {LiveLocation.objects.count()} live GPS, {SOSAlert.objects.count()} SOS alerts
    • Thanh toán       : {Payment.objects.count()} payments (MoMo escrow + Cash), {CommissionSettlement.objects.count()} quyết toán
    • Chat trực tiếp   : {Conversation.objects.count()} cuộc hội thoại, {Message.objects.count()} tin nhắn trao đổi
    • Nhật ký chăm sóc : {CareDiaryEntry.objects.count()} ca nhật ký, {CareDiaryActivity.objects.count()} mốc hoạt động
    • Quản trị & AI    : {Complaint.objects.count()} khiếu nại, {CredentialSubmission.objects.count()} bằng cấp duyệt

  🔑 THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP THỬ NGHIỆM (MẬT KHẨU CHUNG: {TEST_PASSWORD}):
  ┌─────────────────────────┬──────────────────────────┬────────────────────────────────────────────────────────┐
  │ Tên đăng nhập (Username)│ Vai trò (Role)           │ Mô tả kịch bản kiểm thử                                │
  ├─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────────┤
  │ admin                   │ Quản trị viên (Staff/Su) │ Duyệt bằng cấp, xử lý khiếu nại, kháng cáo ELO, mở khóa│
  │ phuhuynh_test           │ Phụ huynh kiểm thử chính │ Đang có đơn open, in_progress, chat mở, ví 2.500.000đ │
  │ sinhvien_test           │ CarePartner kiểm thử     │ ĐH Sư Phạm Huế, ELO 1520, có ca đang làm, live GPS     │
  ├─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────────┤
  │ phuhuynh_baolinh        │ Phụ huynh mẫu (An Cựu)   │ Đơn trông trẻ đang đếm ngược cam kết (awaiting_commit) │
  │ phuhuynh_minhkhoi       │ Phụ huynh mẫu (Vincom)   │ Đơn đón trẻ tan trường (in_progress), ví 3.200.000đ    │
  │ phuhuynh_yenchi         │ Phụ huynh mẫu (Lê Lợi)   │ Đơn gia sư tiếng anh đã xong (completed +15 ELO)       │
  │ phuhuynh_congvinh       │ Phụ huynh mẫu (Xuân Phú) │ Đơn bị hủy sát giờ có đền bù credit & đơn kháng cáo    │
  ├─────────────────────────┼──────────────────────────┼────────────────────────────────────────────────────────┤
  │ carepartner_tuankiet    │ CarePartner (ĐH K.Học)   │ Gia sư Toán Lý, ELO 1480, có đơn kháng cáo hỏng xe     │
  │ carepartner_hoango      │ CarePartner (ĐH S.Phạm)  │ Mầm non Montessori, ELO 1580, nhận việc trông bé 4 tuổi│
  │ carepartner_mylinh      │ CarePartner (ĐH K.Tế)    │ Trông trẻ, ELO 1360, có khiếu nại ép làm thêm việc  │
  │ carepartner_phuoc       │ CarePartner (ĐH Y Dược)  │ Đón trẻ tan trường, có cảnh báo SOS bé sốt đang ACTIVE │
  │ carepartner_pending_hai │ CarePartner (Chờ duyệt)  │ Hồ sơ mới ĐH Ngoại Ngữ, bằng cấp chờ Admin duyệt       │
  │ carepartner_locked_trung│ CarePartner (Tạm khóa)   │ Tài khoản bị khóa, dùng để Admin kiểm thử mở khóa      │
  └─────────────────────────┴──────────────────────────┴────────────────────────────────────────────────────────┘
""")
