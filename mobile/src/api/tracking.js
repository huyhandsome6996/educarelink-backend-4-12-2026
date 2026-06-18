import apiClient from './client';

// ====================================================================
// TRACKING API — đồng bộ với backend /api/tracking/*
// ====================================================================

// ── CAREPARTNER ────────────────────────────────────────────────────
// Đồng ý hoặc từ chối chia sẻ vị trí cho task
// Body: { task_id, granted: true|false }
export const grantConsent = (taskId, granted = true) =>
  apiClient.post('/tracking/consent/', { task_id: taskId, granted });

// Dừng chia sẻ vị trí khẩn cấp
export const revokeConsent = (taskId) =>
  apiClient.post(`/tracking/consent/${taskId}/revoke/`);

// Update vị trí hiện tại (gọi mỗi 10s khi task in_progress)
// Body: { task_id, latitude, longitude, accuracy?, speed?, heading? }
export const updateLocation = (payload) =>
  apiClient.post('/tracking/location/', payload);

// ── PARENT ─────────────────────────────────────────────────────────
// Lấy vị trí hiện tại của carepartner (poll mỗi 5s)
export const getLiveLocation = (taskId) =>
  apiClient.get(`/tracking/${taskId}/live/`);

// Lấy lịch sử toàn bộ vị trí (lưu vĩnh viễn)
export const getLocationHistory = (taskId, limit = 1000) =>
  apiClient.get(`/tracking/${taskId}/history/`, { params: { limit } });

// Check trạng thái consent của task
export const checkConsent = (taskId) =>
  apiClient.get(`/tracking/${taskId}/consent/`);

// ── SOS (cả 2 bên) ─────────────────────────────────────────────────
// Bấm SOS khẩn cấp
// Body: { task_id, latitude?, longitude?, message? }
export const triggerSOS = (payload) =>
  apiClient.post('/tracking/sos/', payload);

// List SOS alerts của task
export const getSOSAlerts = (taskId) =>
  apiClient.get(`/tracking/sos/${taskId}/`);

// Đánh dấu SOS đã giải quyết
export const resolveSOS = (sosId) =>
  apiClient.post(`/tracking/sos/${sosId}/resolve/`);

// ── HEALTH CHECK ───────────────────────────────────────────────────
export const checkTrackingHealth = () => apiClient.get('/tracking/health/');
