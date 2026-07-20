"""URL routing cho module payments."""

from django.urls import path
from .views import (
    SetupPaymentAPIView,
    PaymentDetailAPIView, MyPaymentsAPIView,
    MyEarningsAPIView,
    SettlementListAPIView, SettlementDetailAPIView,
    AdminPaymentOverviewAPIView, AdminAllPaymentsAPIView,
    AdminRetryPayoutAPIView, AdminRegenerateSettlementQRAPIView,
    AdminRunMonthlySettlementAPIView, AdminPaymentLogsAPIView,
    MomoIPNAPIView, MomoReturnAPIView, SettlementReturnAPIView,
    PaymentHealthCheckAPIView,
    # PayOS
    PayOSSetupAPIView, PayOSWebhookAPIView,
    PayOSReturnAPIView, PayOSCancelAPIView,
    PayOSConfirmWebhookAPIView,
)

urlpatterns = [
    # Health check (debug MoMo + PayOS config)
    path('payments/health/', PaymentHealthCheckAPIView.as_view(), name='payment-health'),

    # Parent
    path('payments/setup/', SetupPaymentAPIView.as_view(), name='payment-setup'),
    path('payments/<int:pk>/', PaymentDetailAPIView.as_view(), name='payment-detail'),
    path('payments/my/', MyPaymentsAPIView.as_view(), name='my-payments'),

    # Worker
    path('payments/my-earnings/', MyEarningsAPIView.as_view(), name='my-earnings'),
    path('payments/settlements/', SettlementListAPIView.as_view(), name='settlement-list'),
    path('payments/settlements/<int:pk>/', SettlementDetailAPIView.as_view(), name='settlement-detail'),

    # Admin
    path('payments/admin/overview/', AdminPaymentOverviewAPIView.as_view(), name='admin-payment-overview'),
    path('payments/admin/all/', AdminAllPaymentsAPIView.as_view(), name='admin-all-payments'),
    path('payments/admin/<int:pk>/retry-payout/', AdminRetryPayoutAPIView.as_view(), name='admin-retry-payout'),
    path('payments/admin/settlements/<int:pk>/regenerate-qr/', AdminRegenerateSettlementQRAPIView.as_view(), name='admin-regenerate-qr'),
    path('payments/admin/run-settlement/', AdminRunMonthlySettlementAPIView.as_view(), name='admin-run-settlement'),
    path('payments/admin/logs/', AdminPaymentLogsAPIView.as_view(), name='admin-payment-logs'),

    # MoMo Webhook (no auth)
    path('payments/momo-ipn/', MomoIPNAPIView.as_view(), name='momo-ipn'),
    path('payments/momo-return/', MomoReturnAPIView.as_view(), name='momo-return'),
    path('payments/settlement-return/', SettlementReturnAPIView.as_view(), name='settlement-return'),

    # PayOS (VietQR bank transfer — miễn phí 100%)
    path('payments/payos-setup/', PayOSSetupAPIView.as_view(), name='payos-setup'),
    path('payments/payos-webhook/', PayOSWebhookAPIView.as_view(), name='payos-webhook'),
    path('payments/payos-return/', PayOSReturnAPIView.as_view(), name='payos-return'),
    path('payments/payos-cancel/', PayOSCancelAPIView.as_view(), name='payos-cancel'),
    path('payments/payos-confirm-webhook/', PayOSConfirmWebhookAPIView.as_view(), name='payos-confirm-webhook'),
]
