# A1 — Category ID Verification Report

## Mục đích
Xác nhận `ServiceCategory.id` trên DB production khớp với hard-code ID trong web (`data-cat`) và mobile (`CATEGORIES` array).

## Cách chạy verify

```bash
# Local / Render shell
python manage.py verify_category_ids
```

## Kết quả verify (local DB — seed bằng `seed_demo_data`)

```
  ID  DB name               Expected name         Match   DB pricing_type  Expected PT
  --------------------------------------------------------------------------------------
   1  Gia sư                Gia sư                OK      hourly      hourly    
   2  Đón trẻ               Đón trẻ               OK      distance    distance  
   3  Dọn dẹp nhà cửa       Dọn dẹp nhà cửa       OK      hourly      hourly    
   4  Trông trẻ             Trông trẻ             OK      hourly      hourly    
   5  Mua sắm hộ            Mua sắm hộ            OK      fixed       fixed     
   6  Nấu ăn                Nấu ăn                OK      hourly      hourly    
   7  Hỗ trợ AI             Hỗ trợ AI             OK      fixed       fixed     
   8  Khác                  Khác                  OK      fixed       fixed     

  KẾT QUẢ: KHỚP HOÀN TOÀN
```

## Kết luận

- **8/8 category ID khớp hoàn toàn** giữa DB và UI hard-code.
- **8/8 pricing_type khớp** giữa DB (PricingRule) và UI.
- Việc 1 (pricing_type source of truth) đã được implement: cả web và mobile giờ đọc `pricing_type` từ API `/api/categories/` làm nguồn chính, hard-code chỉ còn là fallback khi mất mạng.
- **Trên production (Render)**: chạy `python manage.py verify_category_ids` để xác nhận lại trước mỗi lần deploy.

## Liệt kê files đã thay đổi (Việc 1 + Việc 2)

| File | Thay đổi |
|------|----------|
| `core/views.py` | `CategoryListAPIView` trả thêm `pricing_type` (select_related, fallback 'fixed') |
| `frontend/templates/frontend/task_create_1.html` | `HOURLY_CATEGORIES` → `FALLBACK_HOURLY_IDS`, fetch từ API, build `dbCategoriesMap` |
| `mobile/src/screens/Parent/CreateTaskScreen.js` | `cat` object ưu tiên `dbCat.pricing_type` từ API |
| `core/tests_price_suggestion.py` | Thêm 3 test: `CategoryListPricingTypeTestCase` (3 methods) |
| `core/management/commands/verify_category_ids.py` | Management command mới: so sánh DB vs expected |
| `A1_CATEGORY_ID_VERIFICATION.md` | File này — kết quả verify |