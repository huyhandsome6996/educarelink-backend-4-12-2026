// ====================================================================
// OfflineLocationQueue — Hàng đợi SQLite cho vị trí khi mất mạng
// ====================================================================
// - Dùng expo-sqlite (v15+ — async API)
// - Bảng: pending_location_queue (id, task_id, latitude, longitude,
//   accuracy, speed, heading, recorded_at, created_at)
// - Khi apiClient.post('/tracking/location/') fail do mạng → lưu vào queue
// - Khi NetInfo báo có mạng lại → flush queue qua /tracking/location/batch/
// - Chunk 200 điểm/lần gọi để tránh payload quá lớn
// ====================================================================

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'educarelink_offline.db';
const TABLE_NAME = 'pending_location_queue';
const CHUNK_SIZE = 200; // điểm/lần gọi batch

let db = null;

/**
 * Mở DB + tạo table nếu chưa có. Idempotent.
 */
export async function initOfflineQueue() {
  if (db) return db;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        recorded_at TEXT NOT NULL,  -- ISO 8601 string
        created_at INTEGER NOT NULL  -- unix ms (để sắp xếp theo thứ tự insert)
      );
      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_task_id ON ${TABLE_NAME}(task_id);
      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_created_at ON ${TABLE_NAME}(created_at);
    `);
    console.log('[OfflineQueue] DB initialized');
    return db;
  } catch (e) {
    console.error('[OfflineQueue] init failed:', e);
    return null;
  }
}

/**
 * Thêm 1 điểm vào queue.
 */
export async function enqueueLocation(taskId, point) {
  if (!db) await initOfflineQueue();
  if (!db) return false;
  try {
    await db.runAsync(
      `INSERT INTO ${TABLE_NAME} (task_id, latitude, longitude, accuracy, speed, heading, recorded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskId,
        point.latitude,
        point.longitude,
        point.accuracy ?? null,
        point.speed ?? null,
        point.heading ?? null,
        point.recorded_at,
        Date.now(),
      ]
    );
    return true;
  } catch (e) {
    console.error('[OfflineQueue] enqueue failed:', e);
    return false;
  }
}

/**
 * Đếm số điểm đang chờ trong queue.
 */
export async function getQueueSize() {
  if (!db) await initOfflineQueue();
  if (!db) return 0;
  try {
    const row = await db.getFirstAsync(`SELECT COUNT(*) as count FROM ${TABLE_NAME}`);
    return row?.count || 0;
  } catch (e) {
    console.error('[OfflineQueue] count failed:', e);
    return 0;
  }
}

/**
 * Lấy 1 chunk (mặc định 200 điểm) theo thứ tự created_at tăng dần (FIFO).
 * Trả về list of rows + task_id dominant (giả định 1 queue chỉ cho 1 task
 * đang in_progress — đúng với logic tracking hiện tại).
 */
export async function getChunk(size = CHUNK_SIZE) {
  if (!db) await initOfflineQueue();
  if (!db) return [];
  try {
    return await db.getAllAsync(
      `SELECT * FROM ${TABLE_NAME} ORDER BY created_at ASC LIMIT ?`,
      [size]
    );
  } catch (e) {
    console.error('[OfflineQueue] getChunk failed:', e);
    return [];
  }
}

/**
 * Xoá các điểm đã gửi thành công khỏi queue (theo list of ids).
 */
export async function deleteByIds(ids) {
  if (!db || !ids || ids.length === 0) return;
  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM ${TABLE_NAME} WHERE id IN (${placeholders})`,
      ids
    );
  } catch (e) {
    console.error('[OfflineQueue] deleteByIds failed:', e);
  }
}

/**
 * Xoá toàn bộ queue (dùng khi logout / clear data).
 */
export async function clearAll() {
  if (!db) await initOfflineQueue();
  if (!db) return;
  try {
    await db.runAsync(`DELETE FROM ${TABLE_NAME}`);
    console.log('[OfflineQueue] cleared all');
  } catch (e) {
    console.error('[OfflineQueue] clearAll failed:', e);
  }
}

export const CHUNK_SIZE_EXPORT = CHUNK_SIZE;
