// ====================================================================
// OfflineLocationQueue — Hàng đợi SQLite cho vị trí khi mất mạng
// ====================================================================
// - Dùng expo-sqlite (v15+ — async API)
// - Bảng: pending_location_queue (id, task_id, latitude, longitude,
//   accuracy, speed, heading, recorded_at, created_at, sync_attempts)
// - Khi apiClient.post('/tracking/location/') fail do mạng → lưu vào queue
// - Khi NetInfo báo có mạng lại → flush queue qua /tracking/location/batch/
// - Chunk 200 điểm/lần gọi để tránh payload quá lớn
//
// QA-FIX-1 / Bug 1.1:
// - Thêm cột sync_attempts (default 0) — đếm số lần attempt sync thất bại.
// - Khi flush chunk fail 4xx: KHÔNG xoá cả chunk — chỉ tăng sync_attempts
//   từng điểm, skip riêng điểm đã retry > MAX_SYNC_ATTEMPTS (5). Trước đây
//   xoá cả chunk → mất dữ liệu vị trí thật của CarePartner (1 điểm hỏng
//   kéo theo cả chunk 200 điểm bị drop).
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
        created_at INTEGER NOT NULL,  -- unix ms (để sắp xếp theo thứ tự insert)
        sync_attempts INTEGER NOT NULL DEFAULT 0  -- QA-FIX-1/Bug 1.1: số lần retry fail
      );
      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_task_id ON ${TABLE_NAME}(task_id);
      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_created_at ON ${TABLE_NAME}(created_at);
    `);

    // QA-FIX-1 / Bug 1.1: migration cho DB cũ thiếu cột sync_attempts.
    // ALTER TABLE không raise error nếu cột đã tồn tại trên SQLite mới, nhưng
    // bản cũ có thể raise → wrap try/catch để idempotent.
    try {
      await db.execAsync(`ALTER TABLE ${TABLE_NAME} ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0;`);
    } catch (_e) {
      // Cột đã tồn tại — bỏ qua.
    }

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

// QA-FIX-1 / Bug 1.1: số lần retry tối đa cho 1 điểm trước khi bỏ qua.
// Tránh 1 điểm hỏng (vd: timestamp sai format) làm spam mãi.
const MAX_SYNC_ATTEMPTS = 5;

/**
 * Tăng sync_attempts cho từng điểm (theo list of ids).
 * Trả về list of ids đã đạt MAX_SYNC_ATTEMPTS (cần drop hẳn để tránh spam).
 */
export async function incrementAttempts(ids) {
  if (!db || !ids || ids.length === 0) return [];
  try {
    const placeholders = ids.map(() => '?').join(',');
    // Tăng counter cho từng điểm.
    await db.runAsync(
      `UPDATE ${TABLE_NAME} SET sync_attempts = sync_attempts + 1 WHERE id IN (${placeholders})`,
      ids
    );
    // Lọc ra điểm đã đạt max → caller sẽ drop riêng.
    const maxedRows = await db.getAllAsync(
      `SELECT id FROM ${TABLE_NAME} WHERE id IN (${placeholders}) AND sync_attempts >= ?`,
      [...ids, MAX_SYNC_ATTEMPTS]
    );
    return maxedRows.map((r) => r.id);
  } catch (e) {
    console.error('[OfflineQueue] incrementAttempts failed:', e);
    return [];
  }
}

export const CHUNK_SIZE_EXPORT = CHUNK_SIZE;
export const MAX_SYNC_ATTEMPTS_EXPORT = MAX_SYNC_ATTEMPTS;
