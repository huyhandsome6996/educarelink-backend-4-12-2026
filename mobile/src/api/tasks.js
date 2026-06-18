import apiClient from './client';

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

// === CHATBOT (Parent) ===
// Gửi tin nhắn cho AI chatbot (kèm lịch sử hội thoại để AI hiểu ngữ cảnh)
export const sendChatMessage = (message, history = []) =>
  apiClient.post('/chatbot/', { message, history });

// === WORKER CHATBOT (riêng cho Carepartner) — đồng bộ với web (worker_chatbot.html) ===
export const sendWorkerChatMessage = (message, history = []) =>
  apiClient.post('/worker/chatbot/', { message, history });

// === HELP CENTER — đồng bộ với web (help_center.html) ===
export const sendHelpCenterMessage = (message, history = []) =>
  apiClient.post('/help-center/', { message, history });

// === WORKER: SUBMIT CREDENTIAL — đồng bộ với web (worker_profile.html) ===
// Carepartner gửi ảnh bằng cấp + mô tả cho Admin duyệt
// Body: FormData với certificate_photo, description
export const submitCredential = (formData) =>
  apiClient.post('/worker/submit-credential/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// === WORKER: PROFILE CHANGE REQUEST — đồng bộ với web (worker_profile.html) ===
// Carepartner yêu cầu sửa hồ sơ (email, phone, address, first/last name...)
// Body: { proposed_changes: { first_name?, last_name?, phone_number?, email?, address? } }
export const requestProfileChange = (proposedChanges) =>
  apiClient.post('/worker/profile-change-request/', { proposed_changes: proposedChanges });

// === DISTANCE CALCULATION — đồng bộ với web (worker_profile.html) ===
// Tính khoảng cách giữa phụ huynh và carepartner
// Body: { parent_lat, parent_lng, worker_lat, worker_lng }
export const calculateDistance = (payload) =>
  apiClient.post('/distance/', payload);
