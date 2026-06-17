"""URL routing cho module Payments (gắn vào /api/payments/)."""
from django.urls import path
from .views import (
    # MoMo
    CreateMoMoPaymentAPIView,
    MoMoReturnAPIView,
    MoMoIPNAPIView,
    # Wallet
    MyWalletAPIView,
    MyWalletTransactionsAPIView,
    WithdrawAPIView,
    # Task Payment Status
    TaskPaymentStatusAPIView,
    # Commission (Worker)
    MyCommissionDebtsAPIView,
    MyCommissionStatementsAPIView,
    CommissionStatementDetailAPIView,
    # Admin
    AdminTransactionsAPIView,
    AdminStatementsAPIView,
    AdminMarkStatementPaidAPIView,
    AdminGenerateStatementsAPIView,
    AdminRevenueAPIView,
    AdminSchedulerStatsAPIView,
)

urlpatterns = [
    # ── MoMo Payment Gateway ────────────────────────────────────
    path('momo/create/', CreateMoMoPaymentAPIView.as_view(), name='momo-create'),
    path('momo/return/', MoMoReturnAPIView.as_view(), name='momo-return'),
    path('momo/ipn/',    MoMoIPNAPIView.as_view(),    name='momo-ipn'),

    # ── Wallet ──────────────────────────────────────────────────
    path('wallet/',                       MyWalletAPIView.as_view(),               name='my-wallet'),
    path('wallet/transactions/',          MyWalletTransactionsAPIView.as_view(),   name='my-wallet-transactions'),
    path('wallet/withdraw/',              WithdrawAPIView.as_view(),               name='wallet-withdraw'),

    # ── Task Payment Status ─────────────────────────────────────
    path('task/<int:task_id>/',           TaskPaymentStatusAPIView.as_view(),      name='task-payment-status'),

    # ── Commission (Worker) ─────────────────────────────────────
    path('commission/my-debts/',          MyCommissionDebtsAPIView.as_view(),      name='my-commission-debts'),
    path('commission/my-statements/',     MyCommissionStatementsAPIView.as_view(), name='my-commission-statements'),
    path('commission/statements/<int:pk>/', CommissionStatementDetailAPIView.as_view(), name='commission-statement-detail'),

    # ── Admin ───────────────────────────────────────────────────
    path('admin/transactions/',           AdminTransactionsAPIView.as_view(),      name='admin-transactions'),
    path('admin/statements/',             AdminStatementsAPIView.as_view(),        name='admin-statements'),
    path('admin/statements/<int:pk>/mark-paid/', AdminMarkStatementPaidAPIView.as_view(), name='admin-statement-mark-paid'),
    path('admin/statements/generate/',    AdminGenerateStatementsAPIView.as_view(), name='admin-statements-generate'),
    path('admin/revenue/',                AdminRevenueAPIView.as_view(),           name='admin-revenue'),
    path('admin/scheduler-stats/',        AdminSchedulerStatsAPIView.as_view(),    name='admin-scheduler-stats'),
]
