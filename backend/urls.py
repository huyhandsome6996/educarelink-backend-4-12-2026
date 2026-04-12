from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    # Đưa tất cả các API của app core vào nhánh /api/
    path('api/', include('core.urls')), 
]