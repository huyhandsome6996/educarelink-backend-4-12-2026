"""URL routing cho tracking module."""

from django.urls import path
from .views import (
    GrantConsentAPIView, RevokeConsentAPIView, UpdateLocationAPIView,
    LiveLocationAPIView, LocationHistoryAPIView, CheckConsentAPIView,
    SOSCreateAPIView, SOSListAPIView, SOSResolveAPIView,
    AdminTrackingOverviewAPIView, TrackingHealthCheckAPIView,
)

urlpatterns = [
    # Health check
    path('tracking/health/', TrackingHealthCheckAPIView.as_view(), name='tracking-health'),

    # Carepartner
    path('tracking/consent/', GrantConsentAPIView.as_view(), name='tracking-grant-consent'),
    path('tracking/consent/<int:task_id>/revoke/', RevokeConsentAPIView.as_view(), name='tracking-revoke-consent'),
    path('tracking/location/', UpdateLocationAPIView.as_view(), name='tracking-update-location'),

    # Parent
    path('tracking/<int:task_id>/live/', LiveLocationAPIView.as_view(), name='tracking-live'),
    path('tracking/<int:task_id>/history/', LocationHistoryAPIView.as_view(), name='tracking-history'),
    path('tracking/<int:task_id>/consent/', CheckConsentAPIView.as_view(), name='tracking-check-consent'),

    # SOS (both)
    path('tracking/sos/', SOSCreateAPIView.as_view(), name='tracking-sos-create'),
    path('tracking/sos/<int:task_id>/', SOSListAPIView.as_view(), name='tracking-sos-list'),
    path('tracking/sos/<int:sos_id>/resolve/', SOSResolveAPIView.as_view(), name='tracking-sos-resolve'),

    # Admin
    path('tracking/admin/overview/', AdminTrackingOverviewAPIView.as_view(), name='tracking-admin-overview'),
]
