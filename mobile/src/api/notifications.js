import apiClient from './client';

// ====================================================================
// NOTIFICATIONS API — đồng bộ với web (worker_profile.html)
// ====================================================================

// Lấy danh sách thông báo của user hiện tại
export const getNotifications = () => apiClient.get('/notifications/');

// Đếm số thông báo chưa đọc
export const getUnreadCount = () => apiClient.get('/notifications/unread-count/');

// Đánh dấu đã đọc (1 hoặc nhiều thông báo)
// Body: { notification_ids: [1, 2, 3] }  hoặc  { mark_all: true }
export const markNotificationsRead = (payload) =>
  apiClient.post('/notifications/mark-read/', payload);
