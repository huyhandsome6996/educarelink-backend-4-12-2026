// ====================================================================
// OfflineLocationQueue — Hàng đợi SQLite cho vị trí khi mất mạng
// ====================================================================
// - Dùng expo-sqlite (v16+ — async API)
// - Bảng: pending_location_queue (id, user_id, task_id, client_point_id,
//   latitude, longitude, accuracy, speed, heading, recorded_at,
//   created_at, sync_attempts)
// - Khi apiClient.post('/tracking/location/') fail do mạng → lưu vào queue
// - Khi NetInfo báo có mạng lại → flush queue qua /tracking/location/batch/
// - Chunk 200 điểm/lần gọi để tránh payload quá lớn
//
// QA-FIX-1 / Bug 1.1:
// - Thêm cột sync_attempts (default 0) — đếm số lần attempt sync thất bại.
// - Khi flush chunk fail 4xx: KHÔNG xoá cả chunk — chỉ tăng sync_attempts
//   từng điểm, skip riêng điểm đã retry > MAX_SYNC_ATTEMPTS (5).
//
// QA-FIX-2 / B1 + B2 (idempotent + user isolation):
// - Thêm cột user_id (chống user A flush queue của user B khi login khác).
// - Thêm cột client_point_id (UUID sinh mỗi điểm — cho idempotent retry).
// - Khi flush: gửi client_point_id kèm point. Backend trả inserted_ids /
//   already_exists_ids / rejected → mobile chỉ xoá row có client_point_id
//   thuộc inserted HOẶC already_exists (đã sync rồi, retry là do mobile
//   không nhận response trước).
// - Queue của user A không bao giờ được flush bằng token user B: hàm
//   flushOfflineQueue(userId) kiểm tra userId khớp với storage access_token.
// ====================================================================

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'educarelink_offline.db';
const TABLE_NAME = 'pending_location_queue';
const CHUNK_SIZE = 200; // điểm/lần gọi batch

let db = null;

/**
 * Mở DB + tạo table nếu chưa có. Idempotent.
 *
 * QA-FIX-2 / B2: schema mới thêm user_id + client_point_id.
 * - user_id: chống user A flush queue của user B (isolation).
 * - client_point_id: UUID cho idempotent retry (backend reject duplicate).
 */
export async function initOfflineQueue() {
  if (db) return db;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        client_point_id TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        speed REAL,
        heading REAL,
        recorded_at TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sync_attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_user_task ON ${TABLE_NAME}(user_id, task_id);
      CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_created_at ON ${TABLE_NAME}(created_at);
    `);

    // QA-FIX-2 / B2: migration cho DB cũ thiếu cột user_id, client_point_id.
    // ALTER TABLE không raise error nếu cột đã tồn tại trên SQLite mới, nhưng
    // bản cũ có thể raise → wrap try/catch để idempotent.
    try {
      await db.execAsync(`ALTER TABLE ${TABLE_NAME} ADD COLUMN user_id INTEGER;`);
    } catch (_e) { /* cột đã tồn tại */ }
    try {
      await db.execAsync(`ALTER TABLE ${TABLE_NAME} ADD COLUMN client_point_id TEXT;`);
    } catch (_e) { /* cột đã tồn tại */ }
    // Backfill user_id cho row cũ (giá trị 0 — sẽ bị skip khi flush vì
    // không khớp user hiện tại → an toàn, không gửi nhầm queue cũ).
    try {
      await db.execAsync(`UPDATE ${TABLE_NAME} SET user_id = 0 WHERE user_id IS NULL;`);
    } catch (_e) { /* ignore */ }

    console.log('[OfflineQueue] DB initialized (schema v2 với user_id + client_point_id)');
    return db;
  } catch (e) {
    console.error('[OfflineQueue] init failed:', e);
    return null;
  }
}

/**
 * Sinh UUID v4 cho client_point_id (idempotent retry).
 * Dùng Math.random — không cần crypto-grade, chỉ cần unique per-point.
 */
function _generateUuid() {
  // Polyfill crypto.randomUUID nếu không có
  if (typeof global !== 'undefined' && global.crypto && global.crypto.randomUUID) {
    return global.crypto.randomUUID();
  }
  // Fallback: UUID v4 đơn giản
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Thêm 1 điểm vào queue.
 *
 * QA-FIX-2 / B1: sinh client_point_id UUID cho mỗi điểm (idempotent).
 * QA-FIX-2 / B2: yêu cầu userId — không cho phép enqueue mà không biết
 * user nào (chống queue lẫn lẫn khi logout/login khác user).
 *
 * @param {number} userId - ID của user đang đăng nhập
 * @param {number} taskId - ID của task đang tracking
 * @param {object} point - {latitude, longitude, accuracy?, speed?, heading?, recorded_at}
 * @returns {Promise<boolean>} true nếu enqueue thành công
 */
export async function enqueueLocation(userId, taskId, point) {
  if (!db) await initOfflineQueue();
  if (!db) return false;
  if (!userId || !taskId) {
    console.warn('[OfflineQueue] enqueue: userId/taskId bắt buộc — skip');
    return false;
  }
  try {
    const clientPointId = point.client_point_id || _generateUuid();
    await db.runAsync(
      `INSERT INTO ${TABLE_NAME} (user_id, task_id, client_point_id, latitude, longitude, accuracy, speed, heading, recorded_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        taskId,
        clientPointId,
        point.latitude,
        point.longitude,
        // QA-FIX-2 / E: dùng ?? null thay vì || null — tọa độ 0 hợp lệ
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
 * Đếm số điểm đang chờ trong queue của user hiện tại.
 *
 * QA-FIX-2 / B2: chỉ đếm row có user_id khớp — không đếm queue của user khác.
 */
export async function getQueueSize(userId = null) {
  if (!db) await initOfflineQueue();
  if (!db) return 0;
  try {
    if (userId) {
      const row = await db.getFirstAsync(
        `SELECT COUNT(*) as count FROM ${TABLE_NAME} WHERE user_id = ?`,
        [userId]
      );
      return row?.count || 0;
    }
    const row = await db.getFirstAsync(`SELECT COUNT(*) as count FROM ${TABLE_NAME}`);
    return row?.count || 0;
  } catch (e) {
    console.error('[OfflineQueue] count failed:', e);
    return 0;
  }
}

/**
 * Lấy 1 chunk (mặc định 200 điểm) theo thứ tự created_at tăng dần (FIFO).
 *
 * QA-FIX-2 / B2: chỉ lấy row có user_id khớp — không flush queue của user khác.
 * Trả về list of rows + task_id dominant (giả định 1 queue chỉ cho 1 task
 * đang in_progress — đúng với logic tracking hiện tại).
 */
export async function getChunk(userId, size = CHUNK_SIZE) {
  if (!db) await initOfflineQueue();
  if (!db) return [];
  if (!userId) {
    console.warn('[OfflineQueue] getChunk: userId bắt buộc — return empty');
    return [];
  }
  try {
    return await db.getAllAsync(
      `SELECT * FROM ${TABLE_NAME} WHERE user_id = ? ORDER BY created_at ASC LIMIT ?`,
      [userId, size]
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
 * Xoá toàn bộ queue của 1 user (dùng khi logout).
 *
 * QA-FIX-2 / G: khi logout, xóa queue của user đó để không gửi nhầm vị trí
 * của user cũ khi user mới login trên cùng máy. Trước đây clearAll() xóa
 * hết → mất dữ liệu nếu có 2 user (hiếm nhưng có thể); giờ xóa theo user_id.
 *
 * @param {number} userId - ID của user đang logout
 */
export async function clearByUser(userId) {
  if (!db) await initOfflineQueue();
  if (!db || !userId) return;
  try {
    await db.runAsync(`DELETE FROM ${TABLE_NAME} WHERE user_id = ?`, [userId]);
    console.log(`[OfflineQueue] cleared queue for user #${userId}`);
  } catch (e) {
    console.error('[OfflineQueue] clearByUser failed:', e);
  }
}

/**
 * Xoá toàn bộ queue (tất cả user) — dùng khi reset app / clear data.
 * Deprecated: dùng clearByUser(userId) khi logout để tránh mất dữ liệu.
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
