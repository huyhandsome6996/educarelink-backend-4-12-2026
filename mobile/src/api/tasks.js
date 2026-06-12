import apiClient from './client';

// === CHUNG ===
// Lấy toàn bộ danh sách việc (dùng cho bảng tin sinh viên)
export const getAllTasks = () => apiClient.get('/tasks/');

// Lấy chi tiết 1 công việc theo ID (tránh fetch ALL rồi filter client-side)
export const getTaskDetail = (taskId) => apiClient.get(`/tasks/${taskId}/`);

// Tạo việc mới (phụ huynh)
export const createTask = (taskData) => apiClient.post('/tasks/', taskData);

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
export const applyTask = (taskId) =>
  apiClient.post(`/worker/tasks/${taskId}/apply/`);

// Lấy danh sách việc sinh viên đã ứng tuyển
export const getMyJobsAsWorker = () => apiClient.get('/worker/my-jobs/');

// Lấy chi tiết hồ sơ carepartner (phục vụ phụ huynh xem hồ sơ ứng viên)
export const getWorkerProfile = (workerId) => apiClient.get(`/worker/${workerId}/profile/`);

// === CHATBOT ===
// Gửi tin nhắn cho AI chatbot (kèm lịch sử hội thoại để AI hiểu ngữ cảnh)
export const sendChatMessage = (message, history = []) =>
  apiClient.post('/chatbot/', { message, history });
