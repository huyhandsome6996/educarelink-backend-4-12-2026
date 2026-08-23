"""URL routing cho tracking module."""

from django.urls import path
from .views import (
    GrantConsentAPIView, RevokeConsentAPIView, UpdateLocationAPIView,
    LiveLocationAPIView, LocationHistoryAPIView, CheckConsentAPIView,
    SOSCreateAPIView, SOSListAPIView, SOSResolveAPIView,
    AdminTrackingOverviewAPIView, TrackingHealthCheckAPIView,
    HeartbeatAPIView, DeviceStatusAPIView, OfflineAlertsListAPIView,
    AdminRunOfflineCheckAPIView, AcknowledgeOfflineAlertAPIView,
    AdminRunRetryPushAPIView,
    # Phan 3 — Random Verification Check
    SetVerificationPinAPIView, PendingVerificationCheckAPIView,
    RespondVerificationCheckAPIView, AdminListVerificationChecksAPIView,
    AdminTriggerVerificationCheckAPIView, AdminRunVerificationCheckAPIView,
    AdminVerificationSchedulerStatsAPIView,
    # QA-FIX-1 / Spec 2.4 — Parent verification history + Cancel check
    ParentVerificationHistoryAPIView, CancelVerificationCheckAPIView,
    # B5 — Xác thực bằng ảnh trong ca (nộp ảnh + xem ảnh có auth)
    SubmitVerificationPhotoAPIView, VerificationPhotoAPIView,
    # Phan 1 — Batch location (offline cache sync)
    BatchLocationAPIView,
    # QA-FIX-3 / C — Scheduler health monitoring endpoint
    SchedulerHealthAPIView,
)

urlpatterns = [
    # Health check
    path('tracking/health/', TrackingHealthCheckAPIView.as_view(), name='tracking-health'),
    # QA-FIX-3 / C — Scheduler health monitoring (public, no auth)
    path('tracking/scheduler-health/', SchedulerHealthAPIView.as_view(), name='tracking-scheduler-health'),

    # Carepartner
    path('tracking/consent/', GrantConsentAPIView.as_view(), name='tracking-grant-consent'),
    path('tracking/consent/<int:task_id>/revoke/', RevokeConsentAPIView.as_view(), name='tracking-revoke-consent'),
    path('tracking/location/', UpdateLocationAPIView.as_view(), name='tracking-update-location'),
    # Phan 1 — Batch location (cache offline + sync khi có mạng lại)
    path('tracking/location/batch/', BatchLocationAPIView.as_view(), name='tracking-batch-location'),

    # Parent
    path('tracking/<int:task_id>/live/', LiveLocationAPIView.as_view(), name='tracking-live'),
    path('tracking/<int:task_id>/history/', LocationHistoryAPIView.as_view(), name='tracking-history'),
    path('tracking/<int:task_id>/consent/', CheckConsentAPIView.as_view(), name='tracking-check-consent'),

    # SOS (both)
    path('tracking/sos/', SOSCreateAPIView.as_view(), name='tracking-sos-create'),
    path('tracking/sos/<int:task_id>/', SOSListAPIView.as_view(), name='tracking-sos-list'),
    path('tracking/sos/<int:sos_id>/resolve/', SOSResolveAPIView.as_view(), name='tracking-sos-resolve'),

    # Device Heartbeat & Offline Alert (chống tắt máy)
    path('tracking/heartbeat/', HeartbeatAPIView.as_view(), name='tracking-heartbeat'),
    path('tracking/<int:task_id>/device-status/', DeviceStatusAPIView.as_view(), name='tracking-device-status'),
    path('tracking/<int:task_id>/offline-alerts/', OfflineAlertsListAPIView.as_view(), name='tracking-offline-alerts'),
    # Phan 2 — Parent acknowledge offline alert (dừng retry push)
    path('tracking/<int:task_id>/offline-alerts/<int:alert_id>/acknowledge/',
         AcknowledgeOfflineAlertAPIView.as_view(), name='tracking-acknowledge-offline-alert'),

    # === Phan 3 — Random Verification Check ===
    # Carepartner đặt/đổi mã PIN
    path('tracking/verification-pin/set/', SetVerificationPinAPIView.as_view(), name='tracking-set-verification-pin'),
    # Carepartner poll lấy check pending của mình
    path('tracking/verification-checks/pending/', PendingVerificationCheckAPIView.as_view(), name='tracking-pending-verification-check'),
    # Carepartner phản hồi check
    path('tracking/verification-checks/<int:check_id>/respond/', RespondVerificationCheckAPIView.as_view(), name='tracking-respond-verification-check'),
    # === B5 — Xác thực bằng ảnh trong ca ===
    # 1 URL cho cả 2 method: POST = worker nộp ảnh (multipart),
    # GET = xem ảnh có auth (worker của check / parent của task / admin).
    # SubmitVerificationPhotoAPIView kế thừa get() từ VerificationPhotoAPIView.
    path('tracking/verification-checks/<int:check_id>/photo/', SubmitVerificationPhotoAPIView.as_view(), name='tracking-verification-photo'),
    # QA-FIX-1 / Spec 2.4 — Parent huỷ check pending (admin cũng được)
    path('tracking/verification-checks/<int:check_id>/cancel/', CancelVerificationCheckAPIView.as_view(), name='tracking-cancel-verification-check'),
    # QA-FIX-1 / Spec 2.4 — Parent xem lịch sử verification checks của task
    path('tracking/<int:task_id>/verification-checks/history/', ParentVerificationHistoryAPIView.as_view(), name='tracking-parent-verification-history'),
    # Admin — list all checks (filter worker/task/status)
    path('tracking/admin/verification-checks/', AdminListVerificationChecksAPIView.as_view(), name='tracking-admin-verification-checks'),
    # Admin — trigger check thủ công cho 1 task (debug, chỉ khi DEBUG=True)
    path('tracking/admin/trigger-verification-check/', AdminTriggerVerificationCheckAPIView.as_view(), name='tracking-admin-trigger-verification-check'),
    # Admin — chạy full verification job (debug)
    path('tracking/admin/run-verification-check/', AdminRunVerificationCheckAPIView.as_view(), name='tracking-admin-run-verification-check'),
    # Admin — scheduler stats
    path('tracking/admin/verification-scheduler/stats/', AdminVerificationSchedulerStatsAPIView.as_view(), name='tracking-admin-verification-scheduler-stats'),

    # Admin
    path('tracking/admin/overview/', AdminTrackingOverviewAPIView.as_view(), name='tracking-admin-overview'),
    path('tracking/admin/run-offline-check/', AdminRunOfflineCheckAPIView.as_view(), name='tracking-admin-run-offline-check'),
    # Phan 2 — Admin trigger retry push (debug)
    path('tracking/admin/run-retry-push/', AdminRunRetryPushAPIView.as_view(), name='tracking-admin-run-retry-push'),
]
