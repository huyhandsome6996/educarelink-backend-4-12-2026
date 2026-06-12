"""
EDUCARELINK - SEED DATA SCRIPT
================================
Script nap du lieu mau de test ung dung.
Chay lenh: python seed_data.py

Du lieu duoc tao bao gom:
  - 5 danh muc dich vu (ServiceCategory)
  - 2 tai khoan test: phuhuynh_test & sinhvien_test (pass: password123)
  - 4 cong viec mau do phu huynh dang
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
from core.models import User, ServiceCategory, Task

# ============================================================
# PHAN 1: TAO DANH MUC DICH VU
# ============================================================
print("\n[1/3] Dang nap danh muc dich vu...")

categories_data = [
    {
        "name": "Gia su",
        "icon_name": "BookOpen",
        "description": "Day kem cac mon hoc tu tieu hoc den dai hoc."
    },
    {
        "name": "Don tre",
        "icon_name": "Baby",
        "description": "Don con em tu truong ve nha an toan. Yeu cau co xe may va bang lai."
    },
    {
        "name": "Don dep nha cua",
        "icon_name": "Home",
        "description": "Ve sinh, sap xep nha cua, van phong theo yeu cau cua gia dinh."
    },
    {
        "name": "Trong tre",
        "icon_name": "Heart",
        "description": "Trong coi, cham soc tre nho tai nha. Yeu cau kien nhan va co kinh nghiem."
    },
    {
        "name": "Mua sam ho",
        "icon_name": "ShoppingCart",
        "description": "Di cho, mua do theo danh sach va giao hang tan noi cho gia dinh."
    },
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
# PHAN 2: TAO TAI KHOAN TEST
# ============================================================
print("[2/3] Dang tao tai khoan test...")

TEST_PASSWORD = "password123"

# Tai khoan Phu huynh
parent_user, created = User.objects.get_or_create(
    username="phuhuynh_test",
    defaults={
        "role": "parent",
        "first_name": "Nguyen",
        "last_name": "Phu Huynh",
        "email": "phuhuynh@test.com",
        "phone_number": "0901234567",
        "address": "123 Duong Le Loi, Quan 1, TP.HCM",
        "is_verified": True,
    }
)
if created:
    parent_user.set_password(TEST_PASSWORD)
    parent_user.save()
    print(f"   [TAO MOI] Tai khoan Phu huynh: username=phuhuynh_test / pass={TEST_PASSWORD}")
else:
    print(f"   [DA TON TAI] phuhuynh_test")

# Tai khoan Sinh vien (Worker) - DA DUOC ADMIN DUYET
worker_user, created = User.objects.get_or_create(
    username="sinhvien_test",
    defaults={
        "role": "worker",
        "first_name": "Tran",
        "last_name": "Sinh Vien",
        "email": "sinhvien@test.com",
        "phone_number": "0912345678",
        "address": "Ky tuc xa Dai hoc Quoc Gia, Thu Duc, TP.HCM",
        "is_verified": True,
        "is_approved": True,  # Tai khoan test da duoc admin duyet
        "ai_profile_summary": "Sinh vien nam 3 nganh Su pham Toan, co 2 nam kinh nghiem day kem. Danh gia 4.8/5 sao tu 15 phu huynh.",
    }
)
if created:
    worker_user.set_password(TEST_PASSWORD)
    worker_user.save()
    print(f"   [TAO MOI] Tai khoan Sinh vien: username=sinhvien_test / pass={TEST_PASSWORD}")
else:
    # Fix: Đảm bảo sinhvien_test đã được approve
    if not worker_user.is_approved:
        worker_user.is_approved = True
        worker_user.save()
        print(f"   [CAP NHAT] sinhvien_test: da cap nhat is_approved=True")
    print(f"   [DA TON TAI] sinhvien_test")

# Tai khoan Admin (dung de dang nhap trang Admin Dashboard)
admin_user, created = User.objects.get_or_create(
    username="admin",
    defaults={
        "role": "parent",  # Role cha, nhung co quyen admin
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
    print(f"   [TAO MOI] Tai khoan Admin: username=admin / pass={TEST_PASSWORD}")
else:
    print(f"   [DA TON TAI] admin")

print()


# ============================================================
# PHAN 3: TAO CONG VIEC MAU
# ============================================================
print("[3/3] Dang tao cong viec mau...")

try:
    cat_giasu = ServiceCategory.objects.get(name="Gia su")
    cat_dontre = ServiceCategory.objects.get(name="Don tre")
    cat_dondep = ServiceCategory.objects.get(name="Don dep nha cua")
    cat_trongtre = ServiceCategory.objects.get(name="Trong tre")
except ServiceCategory.DoesNotExist:
    print("   [LOI] Khong tim thay danh muc. Vui long kiem tra lai Phan 1.")
    sys.exit(1)

tasks_data = [
    {
        "title": "Can gia su day Toan lop 8 - 2 buoi/tuan",
        "description": "Be nha toi hoc yeu mon Toan, can gia su kien nhan, phuong phap day tot. Uu tien sinh vien nam 3-4 tro len. Day tai nha vao toi thu 3 va thu 5 moi tuan.",
        "price": 200000,
        "category": cat_giasu,
        "location": "123 Duong Nguyen Van Cu, Quan 5, TP.HCM",
        "scheduled_time": timezone.now() + timedelta(days=3),
        "status": "open",
    },
    {
        "title": "[GAP] Don be lop 1 tu truong Tieu hoc Le Van Tam",
        "description": "Toi can nguoi don be gai 6 tuoi tu truong ve nha luc 11h trua cac ngay trong tuan. Nha cach truong khoang 2km. Yeu cau co xe may, bang A1 va thai do than thien voi tre em.",
        "price": 150000,
        "category": cat_dontre,
        "location": "45 Duong Phan Dinh Phung, Phu Nhuan, TP.HCM",
        "scheduled_time": timezone.now() + timedelta(days=1),
        "status": "open",
    },
    {
        "title": "Don dep can ho 60m2 cuoi tuan",
        "description": "Can ho 2 phong ngu, can lau don toan bo san nha, ve sinh nha bep va 1 phong tam. Dung cu ve sinh toi da chuan bi san. Cong viec khoang 3 tieng.",
        "price": 250000,
        "category": cat_dondep,
        "location": "Chung cu Vinhomes Grand Park, Quan 9, TP.HCM",
        "scheduled_time": timezone.now() + timedelta(days=5),
        "status": "open",
    },
    {
        "title": "Trong be 3 tuoi buoi sang thu 7",
        "description": "Vo chong toi co lich hop vao sang thu 7, can nguoi trong be tu 8h-12h. Be ngoan, da quen voi nguoi la. Se co do an sang va do choi chuan bi san. Uu tien ban nu co kinh nghiem.",
        "price": 180000,
        "category": cat_trongtre,
        "location": "78 Duong Hoang Dieu 2, Thu Duc, TP.HCM",
        "scheduled_time": timezone.now() + timedelta(days=2),
        "status": "open",
    },
]

created_tasks = 0
for task_data in tasks_data:
    obj, created = Task.objects.get_or_create(
        title=task_data["title"],
        parent=parent_user,
        defaults={
            "description": task_data["description"],
            "price": task_data["price"],
            "category": task_data["category"],
            "location": task_data["location"],
            "scheduled_time": task_data["scheduled_time"],
            "status": task_data["status"],
        }
    )
    status = "[TAO MOI]" if created else "[DA TON TAI]"
    print(f"   {status} {obj.title[:55]}...")
    if created:
        created_tasks += 1

print(f"   -> Hoan tat! Da tao {created_tasks} cong viec moi.\n")


# ============================================================
# KET QUA TONG KET
# ============================================================
print("=" * 55)
print("SEED DATA HOAN TAT!")
print("=" * 55)
print(f"\nThong ke database hien tai:")
print(f"  - Danh muc dich vu : {ServiceCategory.objects.count()} muc")
print(f"  - Tong nguoi dung  : {User.objects.count()} tai khoan")
print(f"  - Tong cong viec   : {Task.objects.count()} viec")
print(f"\nTai khoan test:")
print(f"  Admin     : username=admin           | pass={TEST_PASSWORD} (truy cap /admin-dashboard/)")
print(f"  Phu huynh : username=phuhuynh_test   | pass={TEST_PASSWORD}")
print(f"  Sinh vien : username=sinhvien_test    | pass={TEST_PASSWORD}")
print(f"\nKhoi dong backend  : python manage.py runserver 0.0.0.0:8000")
print(f"Admin dashboard    : http://127.0.0.1:8000/admin-dashboard/")
print(f"Admin panel (Django): http://127.0.0.1:8000/admin/")
print("=" * 55)
