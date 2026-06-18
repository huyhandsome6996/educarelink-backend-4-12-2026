import apiClient from './client';

const AI_TIMEOUT = 60000;

// ====================================================================
// MODERATION API — Kiểm duyệt + Khiếu nại
// ====================================================================

// ── TASK MODERATION STATUS ────────────────────────────────────────
export const getTaskModeration = (taskId) =>
  apiClient.get(`/moderation/task/${taskId}/`);

// ── COMPLAINTS (Carepartner) ──────────────────────────────────────
export const createComplaint = (formData) =>
  apiClient.post('/moderation/complaints/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: AI_TIMEOUT,
  });

export const getMyComplaints = () =>
  apiClient.get('/moderation/complaints/mine/');

// ── ADMIN ─────────────────────────────────────────────────────────
export const getModerationQueue = (status = 'needs_review') =>
  apiClient.get('/moderation/admin/tasks/', { params: { status } });

export const overrideModeration = (moderationId, status, adminNote = '') =>
  apiClient.post(`/moderation/admin/tasks/${moderationId}/override/`, { status, admin_note: adminNote });

export const reModerateTask = (taskId) =>
  apiClient.post(`/moderation/admin/tasks/${taskId}/re-moderate/`, {}, { timeout: AI_TIMEOUT });

export const getComplaints = (status = '') =>
  apiClient.get('/moderation/admin/complaints/', { params: status ? { status } : {} });

export const resolveComplaint = (complaintId, data) =>
  apiClient.post(`/moderation/admin/complaints/${complaintId}/resolve/`, data);

export const aiAnalyzeComplaint = (complaintId) =>
  apiClient.post(`/moderation/admin/complaints/${complaintId}/ai-analyze/`, {}, { timeout: AI_TIMEOUT });

export const checkModerationHealth = () => apiClient.get('/moderation/health/');
