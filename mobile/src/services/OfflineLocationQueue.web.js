// ====================================================================
// OfflineLocationQueue.web.js — Web fallback (no-op)
// SQLite offline queue chỉ dùng trên native Android/iOS.
// ====================================================================

export const CHUNK_SIZE_EXPORT = 200;

export async function initOfflineQueue() {
  return null;
}

export async function enqueueLocation(userId, taskId, point) {
  return false;
}

export async function getQueueSize(userId) {
  return 0;
}

export async function getChunk(userId, limit = 200) {
  return [];
}

export async function deleteByIds(ids) {
  return;
}

export async function incrementAttempts(ids) {
  return;
}

export async function clearByUser(userId) {
  return;
}

export async function getDistinctTaskIds(userId) {
  return [];
}

export async function getChunkByTask(userId, taskId, limit = 200) {
  return [];
}

export default {
  CHUNK_SIZE_EXPORT,
  initOfflineQueue,
  enqueueLocation,
  getQueueSize,
  getChunk,
  deleteByIds,
  incrementAttempts,
  clearByUser,
  getDistinctTaskIds,
  getChunkByTask,
};
