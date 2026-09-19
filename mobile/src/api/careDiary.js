import apiClient from './client';

// === B1 — NHẬT KÝ CHĂM SÓC (CARE DIARY) ===
// CARE DIARY NÂNG CẤP: payload tạo/sửa có thêm
//   assessment_type: 'tutoring' | 'childcare' | 'general'
//   assessment_data: object schema theo loại (xem backend care_diary/services.py)
// — 2 nền tảng mobile + web gửi đúng contract này, backend validate như nhau.

// Worker: tạo nhật ký mới
// Body: { mood_icon, mood_label, mood_note, completion_percent, note,
//         activities, assessment_type, assessment_data }
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

// Parent: lịch sử nhật ký (danh sách rút gọn)
export const getCareDiaryHistory = () =>
  apiClient.get('/parent/care-diary-history/');
