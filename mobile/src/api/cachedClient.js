// ====================================================================
// Cached API Client — wrapper quanh apiClient với caching + dedup
//
// Sử dụng cho endpoints GET không thay đổi thường xuyên:
// - /tasks/ (cache 60s)
// - /worker/my-jobs/ (cache 30s)
// - /notifications/ (cache 15s)
// - /admin/all-workers/ (cache 60s)
//
// KHÔNG dùng cho:
// - POST/PUT/PATCH (mutations)
// - Realtime endpoints (live tracking, device status)
// ====================================================================

import apiClient from './client';
import { cachedFetch, invalidateCachePrefix } from '../utils/cache';

// Cache TTL constants (ms)
const TTL = {
  SHORT: 15 * 1000,      // 15s — notifications, unread count
  MEDIUM: 30 * 1000,     // 30s — my-jobs, my-tasks
  LONG: 60 * 1000,       // 1 phút — tasks list, workers list
  XLONG: 5 * 60 * 1000,  // 5 phút — static data (categories, profile)
};

// ====================================================================
// CACHED GET requests
// ====================================================================

export const cachedApi = {
  // === TASKS ===
  getAllTasks: () => cachedFetch(
    'tasks:all',
    () => apiClient.get('/tasks/').then(r => r.data),
    { ttl: TTL.LONG }
  ),

  getTaskDetail: (taskId) => cachedFetch(
    `tasks:${taskId}`,
    () => apiClient.get(`/tasks/${taskId}/`).then(r => r.data),
    { ttl: TTL.LONG }
  ),

  getMyTasksAsParent: () => cachedFetch(
    'parent:my-tasks',
    () => apiClient.get('/parent/my-tasks/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  getMyJobsAsWorker: () => cachedFetch(
    'worker:my-jobs',
    () => apiClient.get('/worker/my-jobs/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  getCandidates: (taskId) => cachedFetch(
    `task:${taskId}:candidates`,
    () => apiClient.get(`/parent/tasks/${taskId}/candidates/`).then(r => r.data),
    { ttl: TTL.SHORT }
  ),

  getWorkerProfile: (workerId) => cachedFetch(
    `worker:${workerId}:profile`,
    () => apiClient.get(`/worker/${workerId}/profile/`).then(r => r.data),
    { ttl: TTL.LONG }
  ),

  // === NOTIFICATIONS ===
  getNotifications: () => cachedFetch(
    'notifications:all',
    () => apiClient.get('/notifications/').then(r => r.data),
    { ttl: TTL.SHORT }
  ),

  getUnreadCount: () => cachedFetch(
    'notifications:unread',
    () => apiClient.get('/notifications/unread-count/').then(r => r.data),
    { ttl: TTL.SHORT }
  ),

  // === ADMIN ===
  getPendingWorkers: () => cachedFetch(
    'admin:pending-workers',
    () => apiClient.get('/admin/pending-workers/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  getAllWorkers: () => cachedFetch(
    'admin:all-workers',
    () => apiClient.get('/admin/all-workers/').then(r => r.data),
    { ttl: TTL.LONG }
  ),

  getAllUsers: () => cachedFetch(
    'admin:all-users',
    () => apiClient.get('/admin/all-users/').then(r => r.data),
    { ttl: TTL.LONG }
  ),

  getPaymentOverview: () => cachedFetch(
    'admin:payment-overview',
    () => apiClient.get('/payments/admin/overview/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  getTrackingOverview: () => cachedFetch(
    'admin:tracking-overview',
    () => apiClient.get('/tracking/admin/overview/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  // === PROFILE ===
  getProfile: () => cachedFetch(
    'user:profile',
    () => apiClient.get('/profile/').then(r => r.data),
    { ttl: TTL.XLONG }
  ),

  // === PAYMENTS ===
  getMyEarnings: () => cachedFetch(
    'worker:earnings',
    () => apiClient.get('/payments/my-earnings/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  getSettlements: () => cachedFetch(
    'worker:settlements',
    () => apiClient.get('/payments/settlements/').then(r => r.data),
    { ttl: TTL.MEDIUM }
  ),

  // ====================================================================
  // INVALIDATION — gọi sau khi mutation để refresh cache
  // ====================================================================

  invalidateTasks: () => {
    invalidateCachePrefix('tasks:');
    invalidateCachePrefix('parent:my-tasks');
    invalidateCachePrefix('worker:my-jobs');
  },

  invalidateNotifications: () => {
    invalidateCachePrefix('notifications:');
  },

  invalidateProfile: () => {
    invalidateCache('user:profile');
  },

  invalidateAdmin: () => {
    invalidateCachePrefix('admin:');
  },

  invalidateAll: () => {
    invalidateCachePrefix('');
  },
};

export { TTL as CACHE_TTL };
