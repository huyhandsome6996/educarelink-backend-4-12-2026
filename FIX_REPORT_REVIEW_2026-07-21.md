# Báo cáo fix lỗi chức năng Đánh giá (Review) — 2026-07-21

## 1. Triệu chứng

**Phụ huynh** báo lỗi khi đánh giá Carepartner:

- **URL**: `https://educarelink-backend.onrender.com/parent/review/?task_id=81`
- **Hành động**: nhập nhận xét `"làm ăn rất lồm còm"` (19/500 ký tự), bấm **Gửi đánh giá**
- **Lỗi hiển thị**:

  ```
  Lỗi: {"task":["review có task đã tồn tại."]}
  ```

- **Tài khoản reproduces**: `Công Vinh Trường` (vai trò Phụ huynh)
- **Ảnh chụp màn hình**: `pasted_image_1784639738423.png`, `pasted_image_1784639761271.png`

## 2. Nguyên nhân gốc rễ

| # | Vị trí | Vấn đề |
|---|---|---|
| 1 | `core/models.py:140` | `Review.task = OneToOneField(Task, related_name='review')` — mỗi task chỉ có tối đa 1 review (ràng buộc đúng). |
| 2 | `core/serializers.py:97-105` (trước fix) | `ReviewSerializer` dùng `fields = '__all__'` → DRF **tự sinh `UniqueValidator`** trên field `task` vì `OneToOneField` ngầm định `unique=True`. |
| 3 | `core/views.py:481-512` (trước fix) | `ReviewCreateAPIView.perform_create` có custom check `if hasattr(task, 'review'): raise ValidationError('Công việc này đã được đánh giá.')` với message tiếng Việt thân thiện — **NHƯNG không bao giờ chạy được** vì DRF chạy `serializer.is_valid()` (gồm UniqueValidator) **trước** `perform_create`. |
| 4 | Kết quả | Request bị chặn ở tầng validation với message auto-dịch khó hiểu `"review có task đã tồn tại."`. Phụ huynh không có cách nào sửa đánh giá đã gửi. |

## 3. Fix

### 3.1. `core/serializers.py`

Khai báo tường minh 2 field `task` và `rating` thay vì để DRF tự sinh:

- `task = PrimaryKeyRelatedField(queryset=Task.objects.all(), error_messages={...tiếng Việt...})` — không còn `UniqueValidator` auto.
- `rating = IntegerField(min_value=1, max_value=5, error_messages={...tiếng Việt...})` — validate khoảng 1-5 với message rõ ràng.
- `read_only_fields = ['reviewer', 'reviewee', 'created_at']` — thêm `created_at` để frontend không gửi được.

### 3.2. `core/views.py` — `ReviewCreateAPIView`

Override hẳn `create()` (thay vì `perform_create`) để implement **upsert**:

```python
def create(self, request, *args, **kwargs):
    # 1. Parse + validate task_id (message tiếng Việt thân thiện)
    # 2. Validate business rules: task phải 'completed', parent phải là owner,
    #    phải có worker được 'accepted'
    # 3. Validate rating + comment qua serializer (KHÔNG trigger UniqueValidator)
    # 4. UPSERT:
    #    - existing_review = Review.objects.filter(task=task).first()
    #    - if existing_review: update rating + comment → HTTP 200
    #    - else: create new → HTTP 201
```

### 3.3. `core/tests.py` — 9 test case

| # | Test | Mô tả |
|---|---|---|
| 1 | `test_create_new_review_returns_201` | Task chưa có review → 201 Created |
| 2 | `test_upsert_existing_review_returns_200_and_updates` | Task đã có review → 200 OK + update rating/comment (KHÔNG còn lỗi `review có task đã tồn tại.`) |
| 3 | `test_cannot_review_incomplete_task` | Task chưa completed → 400 |
| 4 | `test_cannot_review_other_parents_task` | Parent A không review task của Parent B → 400 |
| 5 | `test_cannot_review_task_without_accepted_worker` | Task không có worker accepted → 400 |
| 6 | `test_rating_must_be_between_1_and_5` | Rating = 0 hoặc 6 → 400 |
| 7 | `test_unauthenticated_request_returns_401` | Không JWT → 401 |
| 8 | `test_ai_recommendations_can_read_reviews` | `ai_recommendations.services._build_worker_profile` vẫn đọc Review bình thường (smoke test AI consumer) |
| 9 | `test_upsert_preserves_reviewer_and_reviewee` | Update không đổi `reviewer` / `reviewee` (chỉ đổi `rating` + `comment`) |

Kết quả: **9/9 pass**

```bash
$ DEBUG=True DATABASE_URL='' SECRET_KEY='test' python manage.py test core.tests.ReviewCreateAPIViewTests
...
Ran 9 tests in 4.013s

OK
```

## 4. Vì sao chọn UPSERT thay vì chỉ trả lỗi thân thiện?

| Tiêu chí | Chỉ sửa message | **Upsert (đã chọn)** |
|---|---|---|
| Fix lỗi thông báo xấu | ✅ | ✅ |
| Cho phụ huynh sửa đánh giá đã gửi | ❌ | ✅ |
| Phá structure (model/schema) | Không | Không |
| Ảnh hưởng AI consumers | Không | Không |
| Phá frontend (web/mobile) | Không | Không |
| UX hợp lý | Trung bình | Tốt |

**Lý do**: phụ huynh có thể vô tình gửi sớm (chưa suy nghĩ kỹ), hoặc muốn sửa nhận xét (sửa typo, đổi số sao sau khi suy nghĩ lại). Upsert cho phép sửa đánh giá mà không cần tạo API riêng cho update.

## 5. Tác động đến các tính năng khác

Đã kiểm tra các consumer của `Review` model — **tất cả vẫn hoạt động bình thường**:

| File | Cách dùng Review | Tác động |
|---|---|---|
| `ai_recommendations/services.py:258-266` | `Review.objects.filter(reviewee=worker).order_by('-created_at')[:5]` → tính sao TB + comment cho AI prompt gợi ý việc cho worker | Không (model không đổi) |
| `ai_recommendations/services.py:383-390` | Tương tự cho AI gợi ý ứng viên cho parent | Không |
| `core/anomaly_scheduler.py:192-198` | `Review.objects.filter(rating=1).count()` — đếm review 1 sao cho anomaly detection | Không |
| `frontend/templates/frontend/review.html` | POST `/api/parent/review/` với body `{task, rating, comment}` | Không (URL + body shape giữ nguyên) |
| `mobile/src/api/tasks.js:31-32` | `apiClient.post('/parent/review/', reviewData)` | Không |
| `mobile/src/screens/Parent/ReviewScreen.js:36` | `createReview({ task: taskId, rating, comment })` | Không |

## 6. Migration

**Không cần migration** — fix chỉ sửa `serializer` + `view`, không đổi model.

```bash
$ python manage.py makemigrations core --check --dry-run
No changes detected in app 'core'
```

## 7. Commit & PR

- **Branch**: `fix/review-bug-2026-07-21` (tạo từ `main`)
- **Commit**: `7c69e23` — `fix: sửa lỗi đánh giá bị chặn bởi UniqueValidator auto của DRF`
- **Author**: `HuyHandsome <huyhandsome6996@users.noreply.github.com>`
- **PR**: [#4 — fix: sửa lỗi đánh giá (review) bị chặn bởi UniqueValidator auto của DRF](https://github.com/huyhandsome6996/educarelink-backend-4-12-2026/pull/4)
- **Trạng thái**: ĐÃ MỞ, **chưa merge** (để user review)

## 8. Hướng dẫn verify sau khi merge

1. Đăng nhập tài khoản phụ huynh trên web (`https://educarelink-backend.onrender.com/`) hoặc mobile app.
2. Vào **Việc của tôi** → chọn task đã hoàn thành (status = `completed`).
3. Bấm **Đánh giá Carepartner** → nhập số sao + nhận xét → bấm **Gửi đánh giá**.
4. **Kết quả mong đợi**:
   - Lần 1: thông báo `"Cảm ơn bạn đã đánh giá! 🎉"` → redirect về Việc của tôi.
   - Lần 2 (submit lại cho cùng task): thông báo thành công giống lần 1 → DB chỉ có 1 record review cho task đó (rating + comment = lần gửi gần nhất).
   - **Không còn** thông báo `"Lỗi: {"task":["review có task đã tồn tại."]}"`.
5. Vào màn hình AI Recommendation của Carepartner → số sao TB phải cập nhật theo rating mới.
6. Vào Django Admin (`/admin/core/review/`) → kiểm tra record review của task đó.

## 9. Tóm tắt thay đổi

| File | LOC | Loại |
|---|---|---|
| `core/serializers.py` | +26 -3 | Sửa `ReviewSerializer` |
| `core/views.py` | +96 -28 | Sửa `ReviewCreateAPIView` (upsert) |
| `core/tests.py` | +285 -3 | Thêm 9 test case |
| **Tổng** | +407 -34 | 3 file |

## 10. Lưu ý cho agent tiếp theo

- **Không xóa logic upsert**: đây là fix cố ý cho phép phụ huynh sửa đánh giá. Nếu sau này yêu cầu đổi sang "một task chỉ được review 1 lần, không sửa" → cần thêm API `PUT /parent/review/<task_id>/` riêng + bỏ upsert, nhưng phải báo user trước.
- **Không thêm UniqueValidator trở lại `ReviewSerializer.task`**: sẽ tái sinh bug.
- **Nếu mở rộng Review** (thêm field `images`, `reply_from_worker`…): nên tách ra module riêng `reviews/` thay vì tiếp tục sửa `core/` (theo AGENTS.md §20.7).
