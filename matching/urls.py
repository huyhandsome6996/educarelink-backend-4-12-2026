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
from .api.bookings import (
    AppealCreateAPIView,
    BookingCancelAPIView,
    BookingCancelByParentAPIView,
    BookingCompleteAPIView,
    BookingDetailAPIView,
    BookingListAPIView,
    BookingStartAPIView,
    ReportNoShowAPIView,
    RescheduleCreateAPIView,
    RescheduleRespondAPIView,
    SelectCarePartnerAPIView,
)
from .api.admin_manage import (
    AppealAdminAPIView,
    AppealDecideAPIView,
    BookingAdminAPIView,
    EloBandAdminAPIView,
    JobAdminAPIView,
    MatchingWeightAdminAPIView,
    StateLogAdminAPIView,
)
from .api.credits import CreditBalanceAPIView
from .api.jobs import CandidatesAPIView, JobPostCreateAPIView, JobPostPublishAPIView
from .api.notifications import NotificationListAPIView, UnreadCountAPIView
from .api.trust import TrustAPIView

urlpatterns = [
    # ── Đăng việc + ứng viên (Step 1/2/3) ──
    path('jobs/', JobPostCreateAPIView.as_view(), name='matching-job-create'),
    path('jobs/<uuid:job_id>/publish/', JobPostPublishAPIView.as_view(),
         name='matching-job-publish'),
    path('candidates/', CandidatesAPIView.as_view(), name='matching-candidates'),

    # ── Booking + auto-commit (Step 5) ──
    path('jobs/<uuid:job_id>/select-carepartner/', SelectCarePartnerAPIView.as_view(),
         name='matching-select-carepartner'),
    path('bookings/', BookingListAPIView.as_view(), name='matching-bookings'),
    path('bookings/<uuid:pk>/', BookingDetailAPIView.as_view(), name='matching-booking'),
    path('bookings/<uuid:pk>/cancel/', BookingCancelAPIView.as_view(),
         name='matching-booking-cancel'),
    path('bookings/<uuid:pk>/cancel-parent/', BookingCancelByParentAPIView.as_view(),
         name='matching-booking-cancel-parent'),
    path('bookings/<uuid:pk>/report-no-show/', ReportNoShowAPIView.as_view(),
         name='matching-booking-no-show'),
    path('bookings/<uuid:pk>/start/', BookingStartAPIView.as_view(),
         name='matching-booking-start'),
    path('bookings/<uuid:pk>/complete/', BookingCompleteAPIView.as_view(),
         name='matching-booking-complete'),
    path('bookings/<uuid:pk>/appeal/', AppealCreateAPIView.as_view(),
         name='matching-booking-appeal'),
    path('bookings/<uuid:pk>/reschedule/', RescheduleCreateAPIView.as_view(),
         name='matching-booking-reschedule'),
    path('bookings/<uuid:pk>/reschedule/respond/', RescheduleRespondAPIView.as_view(),
         name='matching-booking-reschedule-respond'),

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

    # ── Quản trị web admin (IsAdminUser) ──
    path('admin/elo-bands/', EloBandAdminAPIView.as_view(), name='matching-admin-elo-bands'),
    path('admin/matching-weights/', MatchingWeightAdminAPIView.as_view(),
         name='matching-admin-weights'),
    path('admin/appeals/', AppealAdminAPIView.as_view(), name='matching-admin-appeals'),
    path('admin/appeals/<uuid:pk>/decide/', AppealDecideAPIView.as_view(),
         name='matching-admin-appeal-decide'),
    path('admin/state-logs/', StateLogAdminAPIView.as_view(), name='matching-admin-state-logs'),
    path('admin/bookings/', BookingAdminAPIView.as_view(), name='matching-admin-bookings'),
    path('admin/jobs/', JobAdminAPIView.as_view(), name='matching-admin-jobs'),

    # ── Thông báo (Step 8.8) — /api/matching/notifications/ ──
    path('notifications/', NotificationListAPIView.as_view(), name='matching-notifications'),
    path('notifications/unread-count/', UnreadCountAPIView.as_view(),
         name='matching-notifications-unread'),
]
