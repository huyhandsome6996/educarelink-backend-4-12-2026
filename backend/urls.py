from posixpath import normpath
from urllib.parse import unquote

from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from django.http import HttpResponseForbidden


# ═══════════════════════════════════════════════════════════════════
#  B5 SECURITY — ảnh xác minh (verification photos) là dữ liệu nhạy cảm
#  (ảnh CarePartner chụp tại chỗ trong ca làm — liên quan an toàn trẻ em).
#  Bảo vệ 3 lớp (không chỉ dựa vào việc API không trả link):
#    (1) Vật lý: field RandomVerificationCheck.photo dùng
#        PrivateVerificationPhotoStorage — file lưu trong PRIVATE_MEDIA_ROOT
#        (NGOÀI MEDIA_ROOT) nên không route media công khai nào chạm tới.
#    (2) Pattern chặn thẳng bên dưới — 403 cho ^media/verification_photos/,
#        đặt TRƯỚC mọi pattern serve media (cả nhánh DEBUG lẫn production).
#    (3) _serve_media_guarded — chuẩn hoá path trước khi chặn, chống bypass
#        bằng '//', './', '%2e%2f' (vd /media//verification_photos/x.jpg).
#  Xem ảnh duy nhất qua API có auth:
#    GET /api/tracking/verification-checks/<check_id>/photo/
# ═══════════════════════════════════════════════════════════════════

def _reject_verification_media(request, path=''):
    """403 cho mọi request trực tiếp vào ảnh xác minh qua /media/.

    Trả 403 kể cả khi file không tồn tại — không tiết lộ thông tin
    file nào đang có trên server.
    """
    return HttpResponseForbidden(
        'Ảnh xác minh không truy cập được trực tiếp. Vui lòng đăng nhập và '
        'dùng API /api/tracking/verification-checks/<id>/photo/.'
    )


def _serve_media_guarded(request, path):
    """Serve file từ MEDIA_ROOT — trừ thư mục verification_photos (B5).

    Chuẩn hoá path (unquote + normpath) TRƯỚC khi so khớp để chặn cả các
    biến thể bypass URL:
      /media//verification_photos/x.jpg        (slash đôi)
      /media/./verification_photos/x.jpg       (dot segment)
      /media/%2e%2fverification_photos/x.jpg   (URL-encoded './')
    Các đường dẫn media khác (id_cards/, selfies/, certificates/,
    care_diary_attachments/, complaint_evidence/...) vẫn serve như cũ.
    """
    normalized = normpath(unquote(str(path))).lstrip('./')
    if normalized == 'verification_photos' or normalized.startswith('verification_photos/'):
        return _reject_verification_media(request, path)
    return serve(request, path, document_root=settings.MEDIA_ROOT)


urlpatterns = [
    # B5 SECURITY (lớp 2) — PHẢI đứng TRƯỚC mọi pattern serve /media/
    # (2 nhánh DEBUG/production bên dưới đều append SAU list này).
    re_path(r'^media/verification_photos/(?P<path>.*)$', _reject_verification_media),

    path('admin/', admin.site.urls),
    # Đưa tất cả các API của app core vào nhánh /api/
    path('api/', include('core.urls')),
    # API thanh toán MoMo (escrow + cash settlement)
    path('api/', include('payments.urls')),
    # API định vị real-time (live tracking + SOS)
    path('api/', include('tracking.urls')),
    # API AI recommendations (Gemini)
    path('api/', include('ai_recommendations.urls')),
    # API kiểm duyệt + khiếu nại (AI moderation)
    path('api/', include('moderation.urls')),
    # ⚡ API performance monitoring + cache stats
    path('api/', include('performance.urls')),
    # B1 — Nhật ký chăm sóc (Care Diary)
    path('api/', include('care_diary.urls')),
    # Giao diện Prototype
    path('', include('frontend.urls')),
]

# Cho phép Django serve file media (ảnh CCCD, ảnh chân dung) trong môi trường dev
if settings.DEBUG:
    # B5: dùng _serve_media_guarded thay vì serve trực tiếp — chặn luôn
    # biến thể bypass '//', './' vào verification_photos/.
    urlpatterns += static(settings.MEDIA_URL, view=_serve_media_guarded)
else:
    # Production: Serve media files via Django (needed for demo on Render
    # where there's no Nginx/Apache to serve them).
    # WARNING: Not suitable for high-traffic production. Use S3/cloud storage instead.
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', _serve_media_guarded),
    ]
