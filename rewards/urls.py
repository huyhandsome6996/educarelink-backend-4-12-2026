from django.urls import path

from . import views

app_name = 'rewards'

urlpatterns = [
    path('rewards/summary/', views.RewardsSummaryAPIView.as_view(), name='summary'),
    path('rewards/vouchers/', views.VoucherListAPIView.as_view(), name='voucher-list'),
    path(
        'rewards/vouchers/<int:voucher_id>/redeem/',
        views.VoucherRedeemAPIView.as_view(),
        name='voucher-redeem',
    ),
    path(
        'rewards/redemptions/',
        views.MyRedemptionsAPIView.as_view(),
        name='my-redemptions',
    ),
    # Admin dashboard
    path(
        'admin/rewards/vouchers/',
        views.AdminVoucherListCreateAPIView.as_view(),
        name='admin-voucher-list',
    ),
    path(
        'admin/rewards/vouchers/<int:voucher_id>/',
        views.AdminVoucherDetailAPIView.as_view(),
        name='admin-voucher-detail',
    ),
    path(
        'admin/rewards/redemptions/',
        views.AdminRedemptionsListAPIView.as_view(),
        name='admin-redemptions',
    ),
    path(
        'admin/rewards/adjust-points/',
        views.AdminAdjustPointsAPIView.as_view(),
        name='admin-adjust-points',
    ),
]
