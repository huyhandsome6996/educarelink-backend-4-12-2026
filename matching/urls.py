"""
matching/urls.py — Toàn bộ endpoint Flow ghép cặp mới.

Include từ backend/urls.py: path('api/matching/', include('matching.urls'))
Deviation có chủ đích so với spec Step 9.4: dùng prefix /api/matching/ thay vì
rải nhiều prefix (/api/carepartners/me/... vẫn giữ ĐUÔI path bên trong) để
không đè URL cũ của core app. Ghi trong docs/agent-spec/ASSUMPTIONS.md.
"""

from django.urls import path

from .api.availability import (
    AvailabilityBulkAPIView,
    AvailabilityDetailAPIView,
    AvailabilityListCreateAPIView,
    BlackoutDetailAPIView,
    BlackoutListCreateAPIView,
)
from .api.credits import CreditBalanceAPIView
from .api.notifications import NotificationListAPIView, UnreadCountAPIView
from .api.trust import TrustAPIView

urlpatterns = [
    # ── Lịch rảnh (Step 4 + 9) ──
    path('carepartners/me/availability/',
         AvailabilityListCreateAPIView.as_view(), name='matching-availability'),
    path('carepartners/me/availability/bulk/',
         AvailabilityBulkAPIView.as_view(), name='matching-availability-bulk'),
    path('carepartners/me/availability/<uuid:pk>/',
         AvailabilityDetailAPIView.as_view(), name='matching-availability-detail'),

    # ── Ngày bận (Step 9.2) ──
    path('carepartners/me/blackouts/',
         BlackoutListCreateAPIView.as_view(), name='matching-blackouts'),
    path('carepartners/me/blackouts/<uuid:pk>/',
         BlackoutDetailAPIView.as_view(), name='matching-blackout-detail'),

    # Alias theo master prompt: POST /api/matching/availability/blackout/
    path('availability/blackout/',
         BlackoutListCreateAPIView.as_view()),

    # ── Ví credit (Step 7.3) ──
    path('credits/balance/', CreditBalanceAPIView.as_view(), name='matching-credit-balance'),

    # ── Tín nhiệm (Step 6.7) — không lộ số ELO ──
    path('carepartner/trust/', TrustAPIView.as_view(), name='matching-trust'),

    # ── Thông báo (Step 8.8) — /api/matching/notifications/ ──
    path('notifications/', NotificationListAPIView.as_view(), name='matching-notifications'),
    path('notifications/unread-count/', UnreadCountAPIView.as_view(),
         name='matching-notifications-unread'),
]
