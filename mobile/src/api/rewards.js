import apiClient from './client';

// === B2 — TÍCH ĐIỂM ĐỔI QUÀ (PARENT REWARDS) ===

/** Số dư + hạng + lịch sử giao dịch */
export const getRewardsSummary = () =>
  apiClient.get('/rewards/summary/');

/** Danh sách voucher đang active */
export const getVouchers = () =>
  apiClient.get('/rewards/vouchers/');

/** Đổi voucher theo id */
export const redeemVoucher = (voucherId) =>
  apiClient.post(`/rewards/vouchers/${voucherId}/redeem/`);

/** Lịch sử voucher đã đổi */
export const getMyRedemptions = () =>
  apiClient.get('/rewards/redemptions/');
