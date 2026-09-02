"""
B5 — Storage riêng cho ảnh xác minh CarePartner (dữ liệu nhạy cảm).

Vì sao cần storage riêng (không dùng default storage trong MEDIA_ROOT):
- Toàn bộ file trong MEDIA_ROOT được serve CÔNG KHAI qua /media/ (xem
  backend/urls.py — cả nhánh DEBUG lẫn production). Ảnh xác minh là ảnh
  CarePartner chụp tại chỗ trong ca làm (liên quan an toàn trẻ em) —
  nhạy cảm hơn ảnh danh mục, không được phép public theo URL.
- Bảo vệ phải là VẬT LÝ (file nằm ngoài MEDIA_ROOT) thay vì chỉ dựa vào
  việc tầng API không trả link — nếu sau này urls.py thêm route media mới
  hoặc ai đó quên danh sách loại trừ, file vẫn không thể bị lộ.

Cơ chế:
- File lưu trong settings.PRIVATE_MEDIA_ROOT (mặc định <repo>/private_media)
  — thư mục này KHÔNG nằm trong bất kỳ route static/media nào.
- url() bị ghi đè raise ValueError — nếu code nào vô tình gọi .url()
  (pattern quen thuộc với các ImageField khác trong dự án) sẽ fail to ngay
  trong dev thay vì âm thầm sinh URL công khai.
- Đọc nội dung chỉ qua API có auth: tracking.views.VerificationPhotoAPIView
  (dùng FieldFile.open() — hoạt động với storage backend bất kỳ, kể cả khi
  sau này chuyển sang S3).
"""

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateVerificationPhotoStorage(FileSystemStorage):
    """FileSystemStorage trỏ vào PRIVATE_MEDIA_ROOT — NGOÀI MEDIA_ROOT.

    - location luôn ép về settings.PRIVATE_MEDIA_ROOT (không nhận ghi đè
      từ caller — tránh cấu hình lệch làm ảnh rơi vào MEDIA_ROOT).
    - url() raise ValueError: storage này không có URL công khai.
    """

    def __init__(self, *args, **kwargs):
        # Ép location về PRIVATE_MEDIA_ROOT — an toàn ngay cả khi base_url
        # của FileSystemStorage fallback về MEDIA_URL (không dùng tới vì
        # url() đã bị override raise bên dưới).
        kwargs['location'] = getattr(
            settings, 'PRIVATE_MEDIA_ROOT', None
        ) or (settings.BASE_DIR / 'private_media')
        super().__init__(*args, **kwargs)

    def url(self, name):
        """Không bao giờ sinh URL công khai cho ảnh xác minh."""
        raise ValueError(
            "Ảnh xác minh không có URL công khai. Xem qua API có auth: "
            "/api/tracking/verification-checks/<check_id>/photo/"
        )
