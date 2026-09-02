"""URL routing cho performance module — monitor cache stats."""
from django.urls import path
from .views import PerformanceStatsAPIView, ClearCacheAPIView

urlpatterns = [
    path('performance/stats/', PerformanceStatsAPIView.as_view(), name='performance-stats'),
    path('performance/clear-cache/', ClearCacheAPIView.as_view(), name='performance-clear-cache'),
]
