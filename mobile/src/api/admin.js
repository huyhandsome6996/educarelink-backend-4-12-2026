import apiClient from './client';

// ====================================================================
// ADMIN API — đồng bộ với web (admin_dashboard.html)
// ====================================================================

// Timeout dài cho AI Chatbot (60s) — Gemini cần thời gian xử lý
const AI_TIMEOUT = 60000;

// ── DUYỆT CAREPARTNER ─────────────────────────────────────────────
// List carepartner đang chờ Admin duyệt
export const getPendingWorkers = () => apiClient.get('/admin/pending-workers/');

// Tất cả carepartner
export const getAllWorkers = () => apiClient.get('/admin/all-workers/');

// Tất cả user (parent + worker + admin)
export const getAllUsers = () => apiClient.get('/admin/all-users/');

// Duyệt / từ chối / sửa bằng cấp cho carepartner
// Body: { action: 'approve' | 'reject' | 'edit_qualifications', qualifications?, admin_review? }
export const workerAction = (userId, payload) =>
  apiClient.post(`/admin/workers/${userId}/action/`, payload);

// Khoá / mở khoá user
export const toggleUserActive = (userId) =>
  apiClient.post(`/admin/users/${userId}/toggle-active/`);

// Tước quyền carepartner (đổi role về parent)
export const revokeCarepartner = (userId) =>
  apiClient.post(`/admin/users/${userId}/revoke-carepartner/`);

// ── BẰNG CẤP ──────────────────────────────────────────────────────
// List credential submissions chờ duyệt
export const getPendingCredentials = (status = 'pending') =>
  apiClient.get('/admin/credential-submissions/', { params: { status } });

// Duyệt / từ chối bằng cấp
export const reviewCredential = (submissionId, payload) =>
  apiClient.post(`/admin/credential-submissions/${submissionId}/review/`, payload);

// ── THÔNG BÁO ─────────────────────────────────────────────────────
// Admin gửi thông báo cho carepartner
// Body: { recipient_id, title, message }  hoặc  { send_to_all: true, title, message }
export const sendNotification = (payload) =>
  apiClient.post('/admin/send-notification/', payload);

// ── YÊU CẦU THAY ĐỔI HỒ SƠ ────────────────────────────────────────
export const getPendingProfileChanges = (status = 'pending') =>
  apiClient.get('/admin/profile-change-requests/', { params: { status } });

export const reviewProfileChange = (requestId, payload) =>
  apiClient.post(`/admin/profile-change-requests/${requestId}/review/`, payload);

// ── DEMO DATA ─────────────────────────────────────────────────────
export const seedDemoData = () => apiClient.post('/admin/seed-demo-data/');

// ── ADMIN AI CHATBOT (với vision — upload ảnh + message) ──────────
// Body: FormData { message, image? }
// Trả về: { response, actions?, image_analysis? }
export const sendAdminChatMessage = (formData) =>
  apiClient.post('/admin/chatbot/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: AI_TIMEOUT,
  });

// ── KEEPALIVE SCHEDULER STATS ─────────────────────────────────────
export const getKeepaliveStats = () => apiClient.get('/admin/keepalive-stats/');

// ── ADMIN KIỂM DUYỆT TẤT CẢ CÔNG VIỆC ─────────────────────────────
// List tất cả task đã đăng, filter theo moderation_status
export const getAllTasks = (moderationStatus = 'all') =>
  apiClient.get('/admin/all-tasks/', { params: { moderation_status: moderationStatus } });

// Admin duyệt hoặc xóa task
// Body: { action: 'approve_task' | 'reject_task', reason? }
export const moderateTask = (taskId, payload) =>
  apiClient.post(`/admin/all-tasks/${taskId}/moderate/`, payload);
