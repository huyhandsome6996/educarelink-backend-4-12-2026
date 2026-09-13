import apiClient from './client';

// Timeout dài cho các endpoint gọi Gemini AI (chatbot / help-center).
// TEST_REPORT_2026_07_21.md đo được /chatbot/ ~9.58s, /worker/chatbot/ ~11.79s
// (Gemini latency) → timeout mặc định 10s của axios sẽ throw ECONNABORTED dù
// backend vẫn xử lý thành công. Override per-request thay vì tăng global timeout.
// (Cùng pattern với mobile/src/api/admin.js — AI_TIMEOUT = 60s cho /admin/chatbot/.)
// Brief AI-chatbot mục 4.3: timeout AI >= 45–60s — Flow 1/2 chatbot có thêm
// geocode + validate nên tổng thời gian phản hồi có thể lên gần 1 phút.
const AI_TIMEOUT = 60000; // 60s

// === CHUNG ===
// Lấy toàn bộ danh sách việc (dùng cho bảng tin sinh viên)
export const getAllTasks = () => apiClient.get('/tasks/');

// Lấy chi tiết 1 công việc theo ID (tránh fetch ALL rồi filter client-side)
export const getTaskDetail = (taskId) => apiClient.get(`/tasks/${taskId}/`);

// Tạo việc mới (phụ huynh)
export const createTask = (taskData) => apiClient.post('/tasks/', taskData);

// Cập nhật trạng thái công việc (phụ huynh hoàn thành / huỷ)
// Body: { status: 'completed' | 'cancelled' }
export const updateTaskStatus = (taskId, status) =>
  apiClient.patch(`/tasks/${taskId}/status/`, { status });

// === PHỤ HUYNH ===
// Lấy việc do phụ huynh đăng
export const getMyTasksAsParent = () => apiClient.get('/parent/my-tasks/');

// Lấy danh sách ứng viên của 1 việc
export const getCandidates = (taskId) =>
  apiClient.get(`/parent/tasks/${taskId}/candidates/`);

// Chấp nhận một ứng viên
export const approveCandidate = (applicationId) =>
  apiClient.post(`/parent/applications/${applicationId}/approve/`);

// Đánh giá carepartner sau khi xong việc
export const createReview = (reviewData) =>
  apiClient.post('/parent/review/', reviewData);

// === SINH VIÊN ===
// Ứng tuyển một việc
// consentTracking: true | false | null (null = không có geofence, apply bình thường)
export const applyTask = (taskId, consentTracking = null) => {
  const body = consentTracking !== null ? { consent_tracking: consentTracking } : {};
  return apiClient.post(`/worker/tasks/${taskId}/apply/`, body);
};

// Lấy danh sách việc sinh viên đã ứng tuyển
export const getMyJobsAsWorker = () => apiClient.get('/worker/my-jobs/');

// Lấy chi tiết hồ sơ carepartner (phục vụ phụ huynh xem hồ sơ ứng viên)
export const getWorkerProfile = (workerId) => apiClient.get(`/worker/${workerId}/profile/`);

// === CHATBOT (Parent) — Flow 1/2 ===
// Gửi tin nhắn cho AI chatbot (kèm lịch sử hội thoại để AI hiểu ngữ cảnh).
// Brief 2.2: gửi kèm draft_job_id + toạ độ bản đồ + pending payload để
// backend cập nhật ĐÚNG bản nháp trong phiên (idempotent, không tạo trùng).
// BUG-02: override timeout per-request — Gemini trả lời 9-12s trong production,
// vượt quá global 10s timeout của axios client.
// Brief 4.3: nhận thêm config (AbortSignal) để huỷ request khi unmount.
export const sendChatMessage = (message, history = [], extra = {}, config = {}) =>
  apiClient.post(
    '/chatbot/',
    {
      message,
      history,
      draft_job_id: extra.draftJobId || null,
      latitude: extra.latitude ?? null,
      longitude: extra.longitude ?? null,
      pending_job_payload: extra.pendingJobPayload ?? null,
    },
    { timeout: AI_TIMEOUT, ...config },
  );

// === WORKER CHATBOT (riêng cho Carepartner) — đồng bộ với web (worker_chatbot.html) ===
export const sendWorkerChatMessage = (message, history = [], config = {}) =>
  apiClient.post('/worker/chatbot/', { message, history }, { timeout: AI_TIMEOUT, ...config });

// === HELP CENTER — đồng bộ với web (help_center.html) ===
// HelpCenterAPIView cũng gọi Gemini → cùng timeout override.
export const sendHelpCenterMessage = (message, history = []) =>
  apiClient.post('/help-center/', { message, history }, { timeout: AI_TIMEOUT });

// === WORKER: SUBMIT CREDENTIAL — đồng bộ với web (worker_profile.html) ===
// Carepartner gửi ảnh bằng cấp + mô tả cho Admin duyệt
// Body: FormData với certificate_photo, description
export const submitCredential = (formData) =>
  apiClient.post('/worker/submit-credential/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// LỊCH SỬ bằng cấp đã gửi (chờ duyệt / đã duyệt / bị từ chối)
// Endpoint backend hiện trả list qua POST cùng path → dùng GET an toàn,
// backend đã hỗ trợ GET trên /worker/submit-credential/ (xem core/views.py)
export const getMyCredentials = () => apiClient.get('/worker/submit-credential/');

// === WORKER: PROFILE CHANGE REQUEST — đồng bộ với web (worker_profile.html) ===
// Carepartner yêu cầu sửa hồ sơ (email, phone, address, first/last name...)
//
// BUG FIX (QA pass 2026-07-23): phiên bản trước đây gửi body dạng
//   { proposed_changes: { first_name?, ... } }
// nhưng backend (WorkerProfileChangeRequestAPIView) đọc FLAT fields:
//   { first_name?, last_name?, phone_number?, email?, address? }
// → mobile luôn nhận 400 "Không có thay đổi nào để gửi." kể cả khi user
// đã sửa thông tin. Web đã gửi flat đúng, mobile lệch format.
// Fix: spread proposedChanges thành top-level fields để match backend +
// đồng bộ với web (worker_profile.html:1685-1693).
export const requestProfileChange = (proposedChanges) =>
  apiClient.post('/worker/profile-change-request/', { ...(proposedChanges || {}) });

// LỊCH SỬ yêu cầu sửa hồ sơ đã gửi
export const getMyProfileChangeRequests = () =>
  apiClient.get('/worker/profile-change-request/');

// === PATCH trực tiếp /profile/ (cho lat/lng + expo_push_token + các field không cần admin duyệt) ===
// Web cho phép PATCH trực tiếp latitude/longitude, expo_push_token.
// Lưu ý: first_name, last_name, phone_number, email, address CẦN qua ProfileChangeRequest.
export const updateProfile = (payload) => apiClient.patch('/profile/', payload);

// === DISTANCE CALCULATION — đồng bộ với web (worker_profile.html) ===
// Tính khoảng cách giữa phụ huynh và carepartner
// Body: { parent_lat, parent_lng, worker_lat, worker_lng }
export const calculateDistance = (payload) =>
  apiClient.post('/distance/', payload);

// === A1 — GỢI Ý GIÁ TỰ ĐỘNG ===
// Body: { category_id, latitude?, longitude?, reference_latitude?, reference_longitude?, estimated_duration_hours? }
export const getPriceSuggestion = (payload) =>
  apiClient.post('/tasks/price-suggestion/', payload);

// === A1 — DANH MỤC DỊCH VỤ (từ DB thật) ===
export const getCategories = () => apiClient.get('/categories/');

// === A2 — SMART JOB MATCHING ===
// Worker availability CRUD
export const getWorkerAvailability = () => apiClient.get('/worker/availability/');
export const createWorkerAvailability = (data) => apiClient.post('/worker/availability/', data);
export const updateWorkerAvailability = (id, data) => apiClient.put(`/worker/availability/${id}/`, data);
export const deleteWorkerAvailability = (id) => apiClient.delete(`/worker/availability/${id}/`);

// Parent: smart matches cho 1 task
export const getSmartMatches = (taskId) => apiClient.get(`/parent/tasks/${taskId}/smart-matches/`);
