import apiClient from './client';

// === B1 — NHẬT KÝ CHĂM SÓC (CARE DIARY) ===

// Worker: tạo nhật ký mới
// Body: { mood_icon, mood_label, mood_note, completion_percent, note, activities }
// activities: [{ time, title, description, status, order }]
export const createCareDiaryEntry = (taskId, data) =>
  apiClient.post(`/worker/tasks/${taskId}/care-diary/`, data);

// Worker: sửa nhật ký đã tạo
// Body: same fields as create (partial update)
export const updateCareDiaryEntry = (taskId, data) =>
  apiClient.patch(`/worker/tasks/${taskId}/care-diary/`, data);

// Xem nhật ký (parent hoặc worker)
export const getCareDiaryEntry = (taskId) =>
  apiClient.get(`/tasks/${taskId}/care-diary/`);

// Worker: upload ảnh đính kèm
// FormData với field 'images' (multiple files)
export const uploadCareDiaryAttachments = (taskId, formData) =>
  apiClient.post(`/worker/tasks/${taskId}/care-diary/attachments/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
