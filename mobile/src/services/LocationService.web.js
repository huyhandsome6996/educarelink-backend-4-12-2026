// ====================================================================
// LocationService.web.js — Web fallback (no-op)
// Background location tracking, TaskManager và SQLite queue chỉ hỗ trợ native.
// ====================================================================

export const LOCATION_TASK_NAME = 'educarelink-location-tracking';
export const HEARTBEAT_TASK_NAME = 'educarelink-heartbeat';

export async function requestLocationPermissions() {
  return false;
}

export async function startTracking(taskId, userId = null) {
  return false;
}

export async function stopTracking() {
  return;
}

export function isTracking() {
  return false;
}

export function getCurrentTaskId() {
  return null;
}

export function getCurrentUserId() {
  return null;
}

export function getCurrentLocation() {
  return null;
}

export async function autoResumeTracking() {
  return null;
}

export async function hasPendingResumeTask() {
  return false;
}

export async function cleanupOnLogout(userId) {
  return;
}

export async function flushOfflineQueue(userId) {
  return 0;
}

export default {
  LOCATION_TASK_NAME,
  HEARTBEAT_TASK_NAME,
  requestLocationPermissions,
  startTracking,
  stopTracking,
  isTracking,
  getCurrentTaskId,
  getCurrentUserId,
  getCurrentLocation,
  autoResumeTracking,
  hasPendingResumeTask,
  cleanupOnLogout,
  flushOfflineQueue,
};
