// ============================================================
// matching.js — API client cho luồng Ghép cặp Flow 1 (app matching)
// Toàn bộ endpoint /api/matching/... — specs docs/agent-spec/
// Pattern: src/api/tasks.js (axios client dùng chung)
// ============================================================

import apiClient from './client';

const BASE = '/matching';

// === ĐĂNG VIỆC (Step 1) ===
// jobType: 'tutoring' | 'childcare' | 'pickup'
// payload: field riêng từng loại + latitude/longitude/hourly_rate_vnd
export const createJob = (payload) => apiClient.post(`${BASE}/jobs/`, payload);

// Đăng bài + chạy AI parse (Gemini, fallback rule-based) + tạo JobSlots
export const publishJob = (jobId) => apiClient.post(`${BASE}/jobs/${jobId}/publish/`);

// === ỨNG VIÊN (Step 2/3) ===
// body: { job_id } → { total_matched, candidates: [max 8] }
export const getMatchingCandidates = (jobId) =>
  apiClient.post(`${BASE}/candidates/`, { job_id: jobId });

// === BOOKING (Step 5 — auto-commit) ===
// Parent chọn CP → booking tạo NGAY (awaiting_commitment)
// Header Idempotency-Key chống double-submit khi bấm 2 lần
export const selectCarePartner = (jobId, carepartnerId, idempotencyKey) =>
  apiClient.post(
    `${BASE}/jobs/${jobId}/select-carepartner/`,
    { carepartner_id: carepartnerId },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );

export const getBookings = ({ role, status } = {}) =>
  apiClient.get(`${BASE}/bookings/`, { params: { role, status } });

export const getBookingDetail = (bookingId) =>
  apiClient.get(`${BASE}/bookings/${bookingId}/`);

// CP hủy: { reason_code, note, evidence[] } — force majeure cần note >= 20 ký tự
export const cancelBooking = (bookingId, payload) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/cancel/`, payload);

// Parent hủy (Step 7.7)
export const cancelBookingByParent = (bookingId, note = '') =>
  apiClient.post(`${BASE}/bookings/${bookingId}/cancel-parent/`, { note });

// Parent trả lời no-show: { arrived: true|false }
export const reportNoShow = (bookingId, arrived) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/report-no-show/`, { arrived });

// QA 2026-09-10 #2: CP xác nhận cam kết nhận đơn (Grab-style)
export const commitBooking = (bookingId) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/commit/`);

export const startBooking = (bookingId) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/start/`);

export const completeBooking = (bookingId) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/complete/`);

// === KHÁNG CÁO (Step 7.6) ===
export const createAppeal = (bookingId, payload) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/appeal/`, payload);

export const getAppeal = (bookingId) =>
  apiClient.get(`${BASE}/bookings/${bookingId}/appeal/`);

// === ĐỔI GIỜ (Step 9 Rule 3) ===
export const requestReschedule = (bookingId, payload) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/reschedule/`, payload);

export const respondReschedule = (bookingId, decision) =>
  apiClient.post(`${BASE}/bookings/${bookingId}/reschedule/respond/`, { decision });

// === LỊCH RẢNH (Step 4/9 — luồng MỚI time_from/time_to) ===
export const getAvailability = () =>
  apiClient.get(`${BASE}/carepartners/me/availability/`);

// Window cắt nửa đêm (22:00→01:00) backend tự tách 2 row
export const addAvailability = (payload) =>
  apiClient.post(`${BASE}/carepartners/me/availability/`, payload);

export const updateAvailability = (id, payload) =>
  apiClient.put(`${BASE}/carepartners/me/availability/${id}/`, payload);

export const deleteAvailability = (id) =>
  apiClient.delete(`${BASE}/carepartners/me/availability/${id}/`);

export const bulkReplaceAvailability = (windows) =>
  apiClient.put(`${BASE}/carepartners/me/availability/bulk/`, { windows });

// === NGÀY BẬN (Step 9.2) ===
export const getBlackouts = () =>
  apiClient.get(`${BASE}/carepartners/me/blackouts/`);

// time_from/time_to null = bận cả ngày; trùng booking → 409
export const addBlackout = (payload) =>
  apiClient.post(`${BASE}/carepartners/me/blackouts/`, payload);

export const deleteBlackout = (id) =>
  apiClient.delete(`${BASE}/carepartners/me/blackouts/${id}/`);

// === VÍ CREDIT (Step 7.3) ===
export const getCreditBalance = () =>
  apiClient.get(`${BASE}/credits/balance/`);

// === TÍN NHIỆM (Step 6.7 — KHÔNG có số, chỉ band + mô tả) ===
export const getTrustProfile = () =>
  apiClient.get(`${BASE}/carepartner/trust/`);

// === THÔNG BÁO (Step 8.8) ===
export const getMatchingNotifications = (unreadOnly = false) =>
  apiClient.get(`${BASE}/notifications/`, { params: unreadOnly ? { unread: 'true' } : {} });

export const getUnreadCount = () =>
  apiClient.get(`${BASE}/notifications/unread-count/`);

// Nhãn tiếng Việt cho match_level (đồng bộ backend constants)
export const MATCH_LEVEL_LABELS = {
  very_high: 'Rất phù hợp',
  high: 'Phù hợp cao',
  medium: 'Phù hợp',
  low: 'Có thể cân nhắc',
};

// 8 lý do hủy (Step 5.3) — force majeure cần note >= 20 ký tự
export const CANCEL_REASONS = [
  { code: 'school_schedule', label: 'Trùng lịch học đột xuất', forceMajeure: true },
  { code: 'health', label: 'Sức khỏe không tốt', forceMajeure: true },
  { code: 'family_emergency', label: 'Việc gia đình khẩn cấp', forceMajeure: true },
  { code: 'accident', label: 'Tai nạn / sự cố di chuyển', forceMajeure: true },
  { code: 'wrong_job_info', label: 'Thông tin công việc không đúng mô tả', forceMajeure: true },
  { code: 'transport', label: 'Không thể di chuyển', forceMajeure: false },
  { code: 'personal', label: 'Lý do cá nhân', forceMajeure: false },
  { code: 'other', label: 'Khác (bắt buộc ghi chú)', forceMajeure: false },
];
