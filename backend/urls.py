from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    # Đưa tất cả các API của app core vào nhánh /api/
    path('api/', include('core.urls')), 
    # Giao diện Prototype
    path('', include('frontend.urls')),
]

# Cho phép Django serve file media (ảnh CCCD, ảnh chân dung) trong môi trường dev
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)