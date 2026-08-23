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
]
