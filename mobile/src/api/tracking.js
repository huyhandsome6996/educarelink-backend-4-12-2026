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

// ── ADMIN ─────────────────────────────────────────────────────────
// Tổng quan tracking (số consent active, live locations, SOS active, ...)
export const getAdminTrackingOverview = () =>
  apiClient.get('/tracking/admin/overview/');

// Trigger manual offline check (admin debug)
export const runOfflineCheck = () =>
  apiClient.post('/tracking/admin/run-offline-check/');

// ── DEVICE HEARTBEAT & OFFLINE ALERT (chống tắt máy) ──────────────
// Carepartner gửi heartbeat mỗi 30s khi đang tracking
// Body: { task_id, latitude?, longitude?, battery_level?, app_state?, network_type? }
export const sendHeartbeat = (payload) =>
  apiClient.post('/tracking/heartbeat/', payload);

// Parent lấy trạng thái thiết bị carepartner (online/offline + alert active)
export const getDeviceStatus = (taskId) =>
  apiClient.get(`/tracking/${taskId}/device-status/`);

// Parent list offline alerts của task (lưu vĩnh viễn)
export const getOfflineAlerts = (taskId, limit = 50) =>
  apiClient.get(`/tracking/${taskId}/offline-alerts/`, { params: { limit } });

// === PHẦN 2 — Parent acknowledge offline alert (dừng retry push) ===
// Khi parent mở app và xem cảnh báo → gọi endpoint này để backend dừng
// retry push liên tục (mặc định backend retry 5 lần cách 30s nếu chưa ack).
export const acknowledgeOfflineAlert = (taskId, alertId) =>
  apiClient.post(`/tracking/${taskId}/offline-alerts/${alertId}/acknowledge/`);

// === PHẦN 3 — Verification PIN ===
// Carepartner đặt/đổi mã cá nhân (body: { pin, current_password })
export const setVerificationPin = (payload) =>
  apiClient.post('/tracking/verification-pin/set/', payload);

// Carepartner poll lấy check pending của mình (khi nhận push hoặc poll định kỳ)
// B5: response thêm verification_type ('pin' | 'photo') để UI render đúng
export const getPendingVerificationCheck = () =>
  apiClient.get('/tracking/verification-checks/pending/');

// Carepartner phản hồi check (body: { pin, latitude?, longitude? })
export const respondVerificationCheck = (checkId, payload) =>
  apiClient.post(`/tracking/verification-checks/${checkId}/respond/`, payload);

// === B5 — Xác thực bằng ảnh trong ca ===
// Carepartner nộp ảnh xác minh (multipart: photo + latitude?/longitude?)
// Backend: SubmitVerificationPhotoAPIView — POST /tracking/verification-checks/{check_id}/photo/
// photo: { uri, name, type } từ expo-image-picker
export const submitVerificationPhoto = (checkId, { photo, latitude, longitude }) => {
  const formData = new FormData();
  formData.append('photo', {
    uri: photo.uri,
    name: photo.name || `verification_${Date.now()}.jpg`,
    type: photo.type || 'image/jpeg',
  });
  // Tọa độ 0 là hợp lệ → chỉ append khi != null/undefined (QA-FIX-2 / E)
  if (latitude != null) formData.append('latitude', String(latitude));
  if (longitude != null) formData.append('longitude', String(longitude));
  return apiClient.post(`/tracking/verification-checks/${checkId}/photo/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Upload ảnh lớn hơn JSON — tăng timeout để 3G/4G không bị cắt giữa chừng
    timeout: 30000,
  });
};

// URL endpoint xem ảnh xác minh (CÓ AUTH — ảnh không public qua /media/).
// Dùng cho expo-image: source={{ uri, headers: { Authorization } }}
// (xem LiveTrackingScreen / ImagePreviewScreen — phải kèm Bearer token).
export const getVerificationPhotoUrl = (checkId) =>
  `${apiClient.defaults.baseURL}/tracking/verification-checks/${checkId}/photo/`;

// Admin xem lịch sử verification checks
export const getAdminVerificationChecks = (params = {}) =>
  apiClient.get('/tracking/admin/verification-checks/', { params });

// Admin trigger manual verification check (debug, chỉ hoạt động khi DEBUG=True)
export const triggerVerificationCheck = (payload) =>
  apiClient.post('/tracking/admin/trigger-verification-check/', payload);

// ── HEALTH CHECK ───────────────────────────────────────────────────
export const checkTrackingHealth = () => apiClient.get('/tracking/health/');

// === PHẦN 3 (Parent) — Verification PIN History & Cancel ===
// Parent xem lịch sử các lần xác minh PIN cho task (thành công/sai mã/timeout/đã huỷ)
// Backend: ParentVerificationHistoryAPIView — GET /tracking/{task_id}/verification-checks/history/
export const getVerificationHistory = (taskId, limit = 50) =>
  apiClient.get(`/tracking/${taskId}/verification-checks/history/`, { params: { limit } });

// Parent/admin huỷ 1 lần xác minh đang pending (tránh báo động sai)
// Backend: CancelVerificationCheckAPIView — POST /tracking/verification-checks/{check_id}/cancel/
// Body: { reason?: string }
export const cancelVerificationCheck = (checkId, reason = '') =>
  apiClient.post(`/tracking/verification-checks/${checkId}/cancel/`, { reason });

// === OFFLINE CACHE — Batch Location Upload ===
// Carepartner upload nhiều điểm vị trí cùng lúc (sync sau khi offline → online)
// Backend: BatchLocationAPIView — POST /tracking/location/batch/
// Body: { task_id, points: [{ latitude, longitude, accuracy?, speed?, heading?, recorded_at, client_point_id? }, ...] }
export const uploadBatchLocations = (payload) =>
  apiClient.post('/tracking/location/batch/', payload);
