import apiClient from './client';

// ====================================================================
// N — CHAT API (Cửa sổ chat còn hiệu lực)
// Backend: chat/views.py — /api/chat/conversations/...
// ====================================================================

// Danh sách hội thoại của user hiện tại (parent hoặc worker)
// Response: { count, conversations: [{task_id, task_title, other_party, status,
//   closes_at, last_message, unread_count, ...}] }
export const getConversations = (limit = 50) =>
  apiClient.get('/chat/conversations/', { params: { limit } });

// Chi tiết conversation theo task — kèm trạng thái cửa sổ open/closed
// + closes_at (để UI đếm ngược "còn X giờ")
export const getConversation = (taskId) =>
  apiClient.get(`/chat/conversations/${taskId}/`);

// Lấy tin nhắn. since = id tin nhắn cuối client đang có (polling chỉ lấy
// tin MỚI); bỏ since → trang cuối 100 tin (thứ tự cũ → mới)
export const getMessages = (taskId, since = null) =>
  apiClient.get(`/chat/conversations/${taskId}/messages/`, {
    params: since != null ? { since } : {},
  });

// Gửi tin nhắn — body { content }
// 201: trả message object; 403: cửa sổ đã đóng; 400: bị kiểm duyệt chặn
export const sendMessage = (taskId, content) =>
  apiClient.post(`/chat/conversations/${taskId}/messages/send/`, { content });

// Đánh dấu đã đọc mọi tin người kia gửi
export const markRead = (taskId) =>
  apiClient.post(`/chat/conversations/${taskId}/read/`);
