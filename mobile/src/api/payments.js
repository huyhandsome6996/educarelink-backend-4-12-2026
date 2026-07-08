import apiClient from './client';

// ====================================================================
// PAYMENTS API — đồng bộ với module payments (backend /api/payments/*)
// ====================================================================

// ── PARENT ────────────────────────────────────────────────────────
// Thiết lập thanh toán cho task
// Body: { task_id, method: 'momo_escrow' | 'cash' }
export const setupPayment = (taskId, method) =>
  apiClient.post('/payments/setup/', { task_id: taskId, method });

// Chi tiết 1 payment
export const getPaymentDetail = (paymentId) =>
  apiClient.get(`/payments/${paymentId}/`);

// List payments của user hiện tại (parent hoặc worker)
export const getMyPayments = () => apiClient.get('/payments/my/');

// ── WORKER ────────────────────────────────────────────────────────
// Tổng quan thu nhập của Carepartner
export const getMyEarnings = () => apiClient.get('/payments/my-earnings/');

// List kỳ thanh toán hoa hồng của worker
export const getSettlements = () => apiClient.get('/payments/settlements/');

// Chi tiết kỳ thanh toán + link QR
export const getSettlementDetail = (settlementId) =>
  apiClient.get(`/payments/settlements/${settlementId}/`);

// ── ADMIN ─────────────────────────────────────────────────────────
export const getPaymentOverview = () => apiClient.get('/payments/admin/overview/');
export const getAllPayments = (params = {}) =>
  apiClient.get('/payments/admin/all/', { params });
export const retryPayout = (paymentId) =>
  apiClient.post(`/payments/admin/${paymentId}/retry-payout/`);
export const regenerateSettlementQR = (settlementId) =>
  apiClient.post(`/payments/admin/settlements/${settlementId}/regenerate-qr/`);
export const runMonthlySettlement = (payload = {}) =>
  apiClient.post('/payments/admin/run-settlement/', payload);

// Audit logs — filter theo payment_id hoặc settlement_id
export const getPaymentLogs = (params = {}) =>
  apiClient.get('/payments/admin/logs/', { params });

// ── HEALTH CHECK ───────────────────────────────────────────────────
export const checkPaymentHealth = () => apiClient.get('/payments/health/');
