import apiClient from './client';

// ====================================================================
// AI RECOMMENDATIONS API
// ====================================================================
// QUAN TRỌNG: AI requests gọi Gemini API nên cần timeout dài hơn (60s)
// thay vì timeout mặc định 10s của apiClient.

const AI_TIMEOUT = 60000; // 60 giây cho AI requests

// Gợi ý việc cho carepartner (đã được sắp xếp theo match_score giảm dần)
export const getWorkerRecommendations = (forceRefresh = false) => {
  const url = '/ai/recommendations/worker/' + (forceRefresh ? '?_t=' + Date.now() : '');
  return apiClient.get(url, { timeout: AI_TIMEOUT });
};

// Đánh giá ứng viên cho parent (theo task_id)
export const getCandidateRecommendations = (taskId, forceRefresh = false) => {
  const url = '/ai/recommendations/candidates/' + taskId + '/' + (forceRefresh ? '?_t=' + Date.now() : '');
  return apiClient.get(url, { timeout: AI_TIMEOUT });
};
