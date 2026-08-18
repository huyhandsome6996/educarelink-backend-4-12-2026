// ====================================================================
// LocationService — Background location tracking cho Carepartner
//   - Sử dụng expo-location + expo-task-manager
//   - Khi task in_progress + consent granted → start tracking
//   - Gửi vị trí mỗi 10s tới backend /api/tracking/location/
//   - Gửi heartbeat mỗi 30s tới backend /api/tracking/heartbeat/
//     (chống tắt máy — nếu backend không nhận heartbeat > threshold
//      sẽ tự push chuông cho phụ huynh)
//   - Khi task completed/cancelled → stop tracking
// ====================================================================
// PHẦN 1 — Offline cache (vị trí không mất khi mất mạng):
//   - Khi apiClient.post('/tracking/location/') fail do mạng
//     → lưu điểm vào SQLite queue (OfflineLocationQueue)
//   - NetInfo listener: khi mạng có lại → flush queue qua
//     /tracking/location/batch/ (chunk 200 điểm/lần)
//   - Cũng thử flush mỗi khi app start + mỗi lần heartbeat task chạy
//
// QA-FIX-2 / B1 + B2 + G:
//   - enqueueLocation(userId, taskId, point) — yêu cầu userId để isolate queue.
//   - Mỗi point sinh client_point_id (UUID) cho idempotent retry.
//   - flushOfflineQueue(userId) — chỉ flush queue của user hiện tại.
//   - Khi logout: stopTracking() + clearByUser(userId) để xóa queue cũ.
//   - Response backend: inserted_ids/already_exists_ids/rejected → mobile
//     chỉ xoá row có client_point_id thuộc inserted HOẶC already_exists.
// ====================================================================
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import { Platform, AppState } from 'react-native';
import { storage } from '../utils/storage';
import apiClient from '../api/client';
import {
  initOfflineQueue, enqueueLocation, getQueueSize, getChunk,
  deleteByIds, incrementAttempts, clearByUser,
  getDistinctTaskIds, getChunkByTask,
  CHUNK_SIZE_EXPORT,
} from './OfflineLocationQueue';

const LOCATION_TASK_NAME = 'educarelink-location-tracking';
const HEARTBEAT_TASK_NAME = 'educarelink-heartbeat';
const UPDATE_INTERVAL_MS = 10000;       // 10 giây — gửi vị trí
const HEARTBEAT_INTERVAL_MS = 30000;    // 30 giây — gửi heartbeat (chống tắt máy)

let isStarted = false;
let currentTaskId = null;
let currentUserId = null;  // QA-FIX-2 / B2: track user đang tracking để isolate queue
let lastKnownLocation = null;  // cache vị trí cuối để gửi kèm heartbeat
let appStateSubscription = null;
let netInfoSubscription = null;
let isFlushing = false;        // cờ chống flush chạy chồng lên nhau

// ====================================================================
// BACKGROUND TASK — location tracking (chạy khi app ở nền)
// ====================================================================
// Phần 1: nếu apiClient.post fail do mạng → enqueue vào SQLite queue
// thay vì chỉ log warning. Queue sẽ flush khi có mạng lại.
// Để phân biệt fail mạng (cần queue) vs fail 4xx/5xx (không queue):
//   - error.request tồn tại + không có response = network error
//   - error.message chứa 'Network' = network error
//   - status >= 500 = server error (vẫn queue để retry)
//   - 4xx = client error (không queue — sẽ fail mãi)
//
// QA-FIX-2 / B2: enqueueLocation yêu cầu userId — đọc từ storage
// 'user_id' (set bởi AuthContext.login). Nếu không có userId → skip enqueue
// (không cho phép queue vô danh).
//
// P0 FIX (v1.1.5): Bọc try/catch quanh TaskManager.defineTask ở top-level.
//
// Root cause: File này được import TĨNH (static import) qua chuỗi:
//   App.js → AppNavigator.js → MyJobsScreen.js → LocationService.js
//   MyJobsScreen.js → ActiveTrackingBanner.js → LocationService.js
// Khi Metro resolve dependency graph lúc app khởi động, code top-level chạy
// ngay — TRƯỚC KHI React render. Nếu defineTask throw (do native module
// linking lỗi trong release build), ErrorBoundary (component) KHÔNG bắt được
// → app crash-on-launch, màn đen.
//
// Fix v1.1.2 đã bọc try/catch cho BACKGROUND_FETCH_TASK trong App.js, nhưng
// bỏ sót 2 lệnh defineTask tương tự trong file này. Fix v1.1.5 bổ sung try/catch
// cho cả 2, theo đúng pattern App.js dòng 51-66.
try {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('[LocationService] Background task error:', error);
      return;
    }
    if (!data || !data.locations || data.locations.length === 0) return;

    const location = data.locations[data.locations.length - 1];
    const taskId = await storage.getItem('tracking_task_id');
    if (!taskId) {
      return;
    }
    // QA-FIX-2 / B2: đọc userId từ storage để isolate queue
    const userIdStr = await storage.getItem('user_id');
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;

    const point = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      // QA-FIX-2 / E: dùng ?? null thay vì || null — tọa độ 0 hợp lệ
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
      recorded_at: new Date().toISOString(),
    };

    try {
      await apiClient.post('/tracking/location/', {
        task_id: parseInt(taskId, 10),
        ...point,
      });
      lastKnownLocation = location.coords;
      console.log('[LocationService] Background location update sent');
    } catch (e) {
      const status = e?.response?.status;
      const isNetworkError = !e?.response && (
        e?.code === 'ERR_NETWORK' ||
        e?.message?.includes('Network') ||
        e?.message?.includes('timeout') ||
        e?.request
      );
      const isServerError = status && status >= 500;

      if (isNetworkError || isServerError) {
        // Phần 1 — Lưu vào queue để flush khi có mạng lại
        // QA-FIX-2 / B2: chỉ enqueue nếu có userId (isolate queue)
        if (userId) {
          const ok = await enqueueLocation(userId, parseInt(taskId, 10), point);
          if (ok) {
            const size = await getQueueSize(userId);
            console.log(`[LocationService] Queued point (offline). Queue size: ${size}`);
          }
        } else {
          console.warn('[LocationService] Cannot enqueue — no userId (skip offline cache)');
        }
      } else {
        // 4xx error — không queue (sẽ fail mãi)
        console.warn('[LocationService] Background location failed (4xx):', status, e?.response?.data);
      }
    }
  });
} catch (e) {
  console.warn('[LocationService] TaskManager.defineTask(LOCATION) failed (non-fatal):', e);
}

// ====================================================================
// BACKGROUND TASK — heartbeat (chống tắt máy)
// Gửi mỗi 30s — nếu backend không nhận > threshold sẽ báo chuông cho parent
// ====================================================================
// P0 FIX (v1.1.5): Bọc try/catch tương tự như LOCATION_TASK_NAME ở trên.
try {
  TaskManager.defineTask(HEARTBEAT_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.error('[HeartbeatService] Background task error:', error);
      return;
    }

    const taskId = await storage.getItem('tracking_task_id');
    if (!taskId) return;

    try {
      // Lấy battery level nếu có thể
      let batteryLevel = null;
      try {
        const battery = await Battery.getBatteryLevelAsync();
        if (battery >= 0) batteryLevel = Math.round(battery * 100);
      } catch (e) { /* Battery API có thể không available */ }

      await apiClient.post('/tracking/heartbeat/', {
        task_id: parseInt(taskId, 10),
        // QA-FIX-2 / E: dùng ?? null thay vì || null — tọa độ 0 hợp lệ
        latitude: lastKnownLocation?.latitude ?? null,
        longitude: lastKnownLocation?.longitude ?? null,
        battery_level: batteryLevel,
        app_state: AppState.currentState || 'background',
        network_type: '',  // không có API native trong Expo
      });
      console.log('[HeartbeatService] Heartbeat sent');
    } catch (e) {
      console.warn('[HeartbeatService] Heartbeat failed:', e?.response?.status || e.message);
    }
  });
} catch (e) {
  console.warn('[LocationService] TaskManager.defineTask(HEARTBEAT) failed (non-fatal):', e);
}

// ====================================================================
// PUBLIC API
// ====================================================================

/**
 * Xin quyền location từ user.
 * Trả về true nếu đã được cấp.
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.warn('[LocationService] Foreground permission denied');
      return false;
    }

    if (Platform.OS !== 'web') {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.warn('[LocationService] Background permission denied — tracking sẽ chỉ chạy khi app mở');
      }
    }
    return true;
  } catch (e) {
    console.error('[LocationService] requestLocationPermissions error:', e);
    return false;
  }
}

/**
 * Bắt đầu tracking vị trí + heartbeat cho task.
 * - Lưu taskId vào storage
 * - Start background location task (mỗi 10s)
 * - Start background heartbeat task (mỗi 30s — chống tắt máy)
 * - Start foreground interval (backup)
 * - Phần 1: init offline queue + register NetInfo listener để flush
 *
 * QA-FIX-2 / B2: yêu cầu userId để isolate queue. Nếu không có userId
 * → không start tracking (tránh queue vô danh).
 */
export async function startTracking(taskId: number, userId: number | null = null): Promise<boolean> {
  if (isStarted && currentTaskId === taskId && currentUserId === userId) {
    console.log('[LocationService] Already tracking this task');
    return true;
  }

  if (isStarted) {
    await stopTracking();
  }

  // QA-FIX-2 / B2: resolve userId — ưu tiên param, fallback storage
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const userIdStr = await storage.getItem('user_id');
    resolvedUserId = userIdStr ? parseInt(userIdStr, 10) : null;
  }
  if (!resolvedUserId) {
    console.error('[LocationService] startTracking: không có userId — không thể track');
    return false;
  }

  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    return false;
  }

  try {
    // Phần 1 — Init offline queue (SQLite)
    await initOfflineQueue();

    await storage.setItem('tracking_task_id', String(taskId));
    currentTaskId = taskId;
    currentUserId = resolvedUserId;

    // Start background location task
    if (Platform.OS !== 'web') {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: UPDATE_INTERVAL_MS,
        distanceInterval: 5,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'EduCareLink đang theo dõi vị trí',
          notificationBody: 'Phụ huynh đang thấy vị trí của bạn trong lúc làm việc. Vui lòng không tắt máy.',
          notificationColor: '#F26522',
        },
      });

      // Start background heartbeat task (chống tắt máy)
      try {
        await Location.startLocationUpdatesAsync(HEARTBEAT_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: HEARTBEAT_INTERVAL_MS,
          distanceInterval: 0,  // không phụ thuộc di chuyển
          showsBackgroundLocationIndicator: false,
          foregroundService: {
            notificationTitle: 'EduCareLink an toàn',
            notificationBody: 'Đang gửi tín hiệu an toàn định kỳ',
            notificationColor: '#10B981',
          },
        });
        console.log('[LocationService] Heartbeat task started');
      } catch (e) {
        console.warn('[LocationService] Heartbeat task start failed (foreground only):', e.message);
      }
    }

    // Start foreground intervals
    startForegroundLocationInterval(taskId, resolvedUserId);
    startForegroundHeartbeatInterval(taskId);

    // Gửi heartbeat ngay lần đầu
    sendHeartbeatNow(taskId);

    // Phần 1 — Thử flush queue ngay (đề phòng có điểm chờ từ lần trước)
    // QA-FIX-2 / B2: chỉ flush queue của user hiện tại
    flushOfflineQueue(resolvedUserId);

    // Lắng nghe AppState change để gửi heartbeat khi app vào nền
    if (!appStateSubscription && Platform.OS !== 'web') {
      appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        console.log('[LocationService] AppState changed:', nextAppState);
        if (currentTaskId && (nextAppState === 'background' || nextAppState === 'inactive')) {
          // App vừa vào nền — gửi heartbeat ngay để báo vẫn online
          sendHeartbeatNow(currentTaskId);
        }
      });
    }

    // Phần 1 — Register NetInfo listener: khi mạng có lại → flush queue
    // QA-FIX-2 / B2: chỉ flush queue của user hiện tại (currentUserId)
    if (!netInfoSubscription && Platform.OS !== 'web') {
      netInfoSubscription = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable) {
          console.log('[LocationService] Network restored → flush offline queue');
          if (currentUserId) {
            flushOfflineQueue(currentUserId);
          }
        }
      });
    }

    isStarted = true;
    console.log(`[LocationService] Started tracking + heartbeat for task #${taskId} (user #${resolvedUserId})`);
    return true;
  } catch (e) {
    console.error('[LocationService] startTracking error:', e);
    return false;
  }
}

// ====================================================================
// PHẦN 1 — Flush offline queue: gửi batch lên backend khi có mạng lại
// ====================================================================
/**
 * Lấy các điểm đang chờ trong queue, gửi batch lên backend, xoá khi thành công.
 * Chạy idempotent — nếu đang flush thì skip (chống chạy chồng).
 * Được gọi từ:
 *   - NetInfo listener (khi mạng có lại)
 *   - startTracking() (đề phòng có điểm chờ từ lần trước)
 *   - autoResumeTracking() (khi app mở lại)
 *
 * QA-FIX-2 / B1: gửi client_point_id kèm mỗi point → backend idempotent.
 * QA-FIX-2 / B2: chỉ flush queue của userId chỉ định (isolation).
 * QA-FIX-2 / B1: parse response inserted_ids/already_exists_ids/rejected
 * → mobile chỉ xoá row có client_point_id thuộc inserted HOẶC already_exists.
 *
 * QA-FIX-5 / H1 (FIX High bug QA phát hiện): flush THEO TỪNG TASK riêng biệt.
 * Trước đây getChunk(userId) lấy 200 điểm của *mọi task* → dùng chunk[0].task_id
 * làm task_id của cả request → điểm của task B bị gửi nhầm vào task A nếu
 * queue còn dữ liệu chưa sync từ task cũ. Trên server không có thông tin
 * task gốc của từng point để từ chối → sai lịch sử/tọa độ của cả 2 task.
 *
 * Sửa:
 *   1. Lấy danh sách task_id có điểm chờ (getDistinctTaskIds).
 *   2. Với mỗi task_id → getChunkByTask(userId, taskId) để lấy chunk chỉ
 *      thuộc task đó → gửi 1 request riêng. Mỗi batch chỉ chứa điểm của 1 task.
 *   3. Loop chunk cho từng task cho đến khi hết hoặc gặp lỗi network/5xx
 *      (khi đó dừng cả flush để retry lần sau — không thử task khác nữa).
 *
 * @param {number} userId - ID của user hiện tại (bắt buộc)
 * @returns {Promise<number>} số điểm flush thành công
 */
export async function flushOfflineQueue(userId: number): Promise<number> {
  if (!userId) {
    console.warn('[LocationService] flushOfflineQueue: userId bắt buộc — skip');
    return 0;
  }
  if (isFlushing) {
    console.log('[LocationService] flushOfflineQueue already running — skip');
    return 0;
  }
  isFlushing = true;
  try {
    await initOfflineQueue();
    let totalFlushed = 0;

    // QA-FIX-5 / H1: lấy danh sách task_id có điểm chờ, sắp xếp theo
    // created_at tăng dần (FIFO — task cũ flush trước).
    const taskEntries = await getDistinctTaskIds(userId);
    if (!taskEntries || taskEntries.length === 0) {
      return 0;
    }
    console.log(`[LocationService] flushOfflineQueue: ${taskEntries.length} task(s) pending — ` +
                taskEntries.map((t) => `task#${t.task_id}(${t.count})`).join(', '));

    // Khi gặp lỗi network/5xx trên 1 task → dừng cả flush để retry lần sau
    // (tránh thử task khác khi mạng đang yếu — sẽ fail y hệt).
    let stopAll = false;

    for (const entry of taskEntries) {
      if (stopAll) break;
      const taskId = entry.task_id;
      let taskLoopCount = 0;
      const MAX_TASK_LOOPS = 50; // giới hạn 50 * 200 = 10.000 điểm/task/lần flush

      while (taskLoopCount < MAX_TASK_LOOPS && !stopAll) {
        taskLoopCount++;
        // QA-FIX-5 / H1: chỉ lấy row của (user, task) hiện tại
        const chunk = await getChunkByTask(userId, taskId, CHUNK_SIZE_EXPORT);
        if (!chunk || chunk.length === 0) break;

        // Format points cho API — gửi kèm client_point_id
        const points = chunk.map((row) => ({
          client_point_id: row.client_point_id,
          latitude: row.latitude,
          longitude: row.longitude,
          // QA-FIX-2 / E: dùng ?? null — tọa độ 0 hợp lệ
          accuracy: row.accuracy ?? null,
          speed: row.speed ?? null,
          heading: row.heading ?? null,
          recorded_at: row.recorded_at,
        }));

        try {
          const resp = await apiClient.post('/tracking/location/batch/', {
            task_id: taskId,
            points,
          });
          // QA-FIX-2 / B1: parse per-point result để xoá đúng row.
          const insertedIds = resp.data?.inserted_ids || [];
          const alreadyExistsIds = resp.data?.already_exists_ids || [];
          const rejectedList = resp.data?.rejected || [];
          const savedCount = resp.data?.saved || 0;

          // Tập hợp các client_point_id cần xoá (inserted + already_exists)
          const idsToDelete = new Set([...insertedIds, ...alreadyExistsIds]);
          const rowsToDelete = chunk.filter((r) =>
            r.client_point_id && idsToDelete.has(r.client_point_id)
          );
          const rowIdsToDelete = rowsToDelete.map((r) => r.id);

          if (rowIdsToDelete.length > 0) {
            await deleteByIds(rowIdsToDelete);
            totalFlushed += rowIdsToDelete.length;
            console.log(`[LocationService] Flushed ${rowIdsToDelete.length} points for task#${taskId} (loop ${taskLoopCount})`);
          }

          // Xử lý rejected: tăng sync_attempts, drop riêng nếu đạt max
          if (rejectedList.length > 0) {
            const rejectedClientIds = rejectedList
              .map((r) => r.client_point_id)
              .filter((c) => c);
            const rejectedRows = chunk.filter((r) =>
              r.client_point_id && rejectedClientIds.includes(r.client_point_id)
            );
            const rejectedRowIds = rejectedRows.map((r) => r.id);
            if (rejectedRowIds.length > 0) {
              const maxedIds = await incrementAttempts(rejectedRowIds);
              if (maxedIds.length > 0) {
                console.warn(`[LocationService] Bỏ qua ${maxedIds.length} điểm vị trí do lỗi liên tục (>= 5 attempts)`);
                await deleteByIds(maxedIds);
              }
              console.warn(`[LocationService] ${rejectedList.length} điểm bị reject — giữ ${rejectedRowIds.length - maxedIds.length} để retry`);
            }
          }

          // QA-FIX-3 / Bug A: nếu chunk toàn rejected-only → tăng retry 1 lần
          // rồi break lần flush cho task này (sẽ retry ở flush sau).
          const chunkHasRejectedOnly = (
            rejectedList.length > 0
            && rowIdsToDelete.length === 0
            && insertedIds.length === 0
            && alreadyExistsIds.length === 0
          );
          if (chunkHasRejectedOnly) {
            console.warn(
              `[LocationService] Task#${taskId} loop ${taskLoopCount}: ${rejectedList.length} điểm rejected-only ` +
              `— dừng flush task này (sẽ retry ở flush sau)`
            );
            break;
          }
          // Nếu backend trả 0 saved + 0 inserted + 0 already_exists + 0 rejected
          // → không có điểm nào hợp lệ → break để tránh loop vô hạn.
          if (
            savedCount === 0
            && insertedIds.length === 0
            && alreadyExistsIds.length === 0
            && rejectedList.length === 0
          ) {
            console.warn(`[LocationService] Task#${taskId}: flush returned 0 saved/inserted/already_exists/rejected — break`);
            break;
          }
        } catch (e) {
          const status = e?.response?.status;
          if (status && status < 500) {
            // QA-FIX-1 / Bug 1.1: 4xx — KHÔNG xoá cả chunk.
            const ids = chunk.map((r) => r.id);
            const maxedIds = await incrementAttempts(ids);
            if (maxedIds.length > 0) {
              console.warn(`[LocationService] Bỏ qua ${maxedIds.length} điểm vị trí do lỗi liên tục (>= 5 attempts)`);
              await deleteByIds(maxedIds);
            }
            console.warn(`[LocationService] Flush task#${taskId} failed (4xx ${status}) — kept ${ids.length - maxedIds.length} points for retry`);
            // Break vòng while của task này — thử task tiếp theo.
            break;
          } else {
            // Network / 5xx — dừng cả flush, thử lại sau
            console.warn(`[LocationService] Flush task#${taskId} failed (network/5xx) — will retry later, skip remaining tasks`);
            stopAll = true;
            break;
          }
        }
      }
    }

    const remaining = await getQueueSize(userId);
    if (totalFlushed > 0) {
      console.log(`[LocationService] ✅ Flushed total ${totalFlushed} points. Remaining in queue: ${remaining}`);
    }
    return totalFlushed;
  } catch (e) {
    console.error('[LocationService] flushOfflineQueue error:', e);
    return 0;
  } finally {
    isFlushing = false;
  }
}

/**
 * Dừng tracking + heartbeat.
 *
 * QA-FIX-2 / G: clear tất cả subscriptions + storage để logout sạch.
 * Không xóa queue SQLite ở đây — caller quyết định (logout mới xóa queue,
 * stop tracking do task completed thì giữ queue để flush sau nếu còn điểm).
 */
export async function stopTracking(): Promise<void> {
  if (!isStarted) return;

  try {
    stopForegroundLocationInterval();
    stopForegroundHeartbeatInterval();

    if (Platform.OS !== 'web') {
      // Stop location task
      const isLocationTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isLocationTracking) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }

      // Stop heartbeat task
      try {
        const isHeartbeatTracking = await Location.hasStartedLocationUpdatesAsync(HEARTBEAT_TASK_NAME);
        if (isHeartbeatTracking) {
          await Location.stopLocationUpdatesAsync(HEARTBEAT_TASK_NAME);
        }
      } catch (e) {
        console.warn('[LocationService] Heartbeat stop failed:', e.message);
      }
    }

    // Cleanup AppState subscription
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }

    // Phần 1 — Cleanup NetInfo subscription
    if (netInfoSubscription) {
      netInfoSubscription();
      netInfoSubscription = null;
    }

    await storage.deleteItem('tracking_task_id');
    currentTaskId = null;
    currentUserId = null;
    lastKnownLocation = null;
    isStarted = false;
    console.log('[LocationService] Stopped tracking + heartbeat');
  } catch (e) {
    console.error('[LocationService] stopTracking error:', e);
  }
}

/**
 * QA-FIX-2 / G: cleanup toàn bộ khi logout — stop tracking + xóa queue
 * của user hiện tại + clear storage. Tránh worker cũ tiếp tục gửi
 * heartbeat/location sau logout, tránh user mới auto-resume task của user cũ.
 *
 * @param {number} userId - ID của user đang logout
 */
export async function cleanupOnLogout(userId: number): Promise<void> {
  console.log(`[LocationService] cleanupOnLogout for user #${userId}`);
  await stopTracking();
  if (userId) {
    // Xóa queue SQLite của user cũ — không để user mới flush nhầm
    await clearByUser(userId);
  }
  // Clear mọi storage tracking khác để user mới bắt đầu sạch
  await storage.deleteItem('tracking_task_id');
  // (Không xóa access_token/refresh_token — AuthContext.logout đã làm)
}

export function isTracking(): boolean {
  return isStarted;
}

export function getCurrentTaskId(): number | null {
  return currentTaskId;
}

export function getCurrentUserId(): number | null {
  return currentUserId;
}

export function getCurrentLocation() {
  return lastKnownLocation;
}

// ====================================================================
// AUTO-RESUME TRACKING — khi app mở lại sau khi kill/reboot
// ====================================================================

/**
 * Tự resume tracking nếu có task đang in_progress.
 * Gọi khi app khởi động (App.js useEffect).
 *
 * Flow:
 * 1. Đọc tracking_task_id từ storage
 * 2. Nếu có → check task còn in_progress không (gọi API)
 * 3. Nếu còn → startTracking(taskId, userId)
 * 4. Nếu task đã completed/cancelled → clear storage (không resume)
 *
 * QA-FIX-2 / B2: đọc user_id từ storage để truyền vào startTracking.
 * QA-FIX-2 / G: nếu user_id không khớp user hiện tại → không resume
 * (tránh user mới auto-resume task của user cũ).
 *
 * @returns {Promise<number|null>} taskId đang resume, hoặc null
 */
export async function autoResumeTracking(): Promise<number | null> {
  try {
    const savedTaskId = await storage.getItem('tracking_task_id');
    if (!savedTaskId) {
      console.log('[LocationService] autoResume: no saved task_id');
      return null;
    }

    const taskId = parseInt(savedTaskId, 10);
    if (isNaN(taskId)) {
      console.warn('[LocationService] autoResume: invalid task_id:', savedTaskId);
      await storage.deleteItem('tracking_task_id');
      return null;
    }

    // QA-FIX-2 / B2: đọc userId từ storage
    const userIdStr = await storage.getItem('user_id');
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;
    if (!userId) {
      console.warn('[LocationService] autoResume: no user_id — clear storage');
      await storage.deleteItem('tracking_task_id');
      return null;
    }

    // Check task còn in_progress không (gọi API)
    try {
      const resp = await apiClient.get(`/tasks/${taskId}/`);
      const task = resp.data;

      if (task.status === 'in_progress') {
        console.log(`[LocationService] autoResume: task #${taskId} còn in_progress → resume tracking`);

        // Check consent còn granted không
        try {
          const consentResp = await apiClient.get(`/tracking/${taskId}/consent/`);
          const consent = consentResp.data?.consent?.consent;
          if (consent !== 'granted') {
            console.log('[LocationService] autoResume: consent không còn granted → không resume');
            await storage.deleteItem('tracking_task_id');
            return null;
          }
        } catch (e) {
          console.warn('[LocationService] autoResume: check consent failed → vẫn resume:', e.message);
        }

        // Resume tracking
        const ok = await startTracking(taskId, userId);
        if (ok) {
          console.log(`[LocationService] autoResume: ✅ tracking resumed for task #${taskId}`);
          // Phần 1 — Flush queue ngay khi resume (đề phòng có điểm chờ từ
          // lần chạy trước khi app bị kill). NetInfo listener có thể đã miss
          // sự kiện mạng có lại trong lúc app đóng.
          try {
            await flushOfflineQueue(userId);
          } catch (e) {
            console.warn('[LocationService] autoResume: initial flush failed:', e.message);
          }
          return taskId;
        } else {
          console.warn('[LocationService] autoResume: startTracking failed');
          return null;
        }
      } else {
        // Task đã completed/cancelled → clear storage
        console.log(`[LocationService] autoResume: task #${taskId} status=${task.status} → clear storage`);
        await storage.deleteItem('tracking_task_id');
        return null;
      }
    } catch (e) {
      // API error (network/404) → thử resume anyway (có thể offline)
      console.warn('[LocationService] autoResume: check task failed → resume anyway:', e.message);
      const ok = await startTracking(taskId, userId);
      return ok ? taskId : null;
    }
  } catch (e) {
    console.error('[LocationService] autoResume error:', e);
    return null;
  }
}

/**
 * Check xem có task pending resume không (không start, chỉ check).
 */
export async function hasPendingResumeTask(): Promise<boolean> {
  try {
    const savedTaskId = await storage.getItem('tracking_task_id');
    return !!savedTaskId;
  } catch {
    return false;
  }
}

// ====================================================================
// FOREGROUND INTERVALS — backup khi app mở
// ====================================================================
let locationIntervalId: any = null;
let heartbeatIntervalId: any = null;

function startForegroundLocationInterval(taskId: number, userId: number | null) {
  if (locationIntervalId) clearInterval(locationIntervalId);
  sendCurrentLocation(taskId, userId);
  locationIntervalId = setInterval(() => {
    sendCurrentLocation(taskId, userId);
  }, UPDATE_INTERVAL_MS);
}

function stopForegroundLocationInterval() {
  if (locationIntervalId) {
    clearInterval(locationIntervalId);
    locationIntervalId = null;
  }
}

function startForegroundHeartbeatInterval(taskId: number) {
  if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
  // Heartbeat interval = 30s (foreground backup)
  heartbeatIntervalId = setInterval(() => {
    sendHeartbeatNow(taskId);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopForegroundHeartbeatInterval() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

async function sendCurrentLocation(taskId: number, userId: number | null) {
  try {
    if (Platform.OS === 'web') return;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const point = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      // QA-FIX-2 / E: dùng ?? null thay vì || null — tọa độ 0 hợp lệ
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
      recorded_at: new Date().toISOString(),
    };

    await apiClient.post('/tracking/location/', {
      task_id: taskId,
      ...point,
    });
    lastKnownLocation = location.coords;
  } catch (e) {
    const status = e?.response?.status;
    const isNetworkError = !e?.response && (
      e?.code === 'ERR_NETWORK' ||
      e?.message?.includes('Network') ||
      e?.message?.includes('timeout') ||
      e?.request
    );
    const isServerError = status && status >= 500;

    if (isNetworkError || isServerError) {
      // Phần 1 — Lưu vào queue để flush khi có mạng lại
      // QA-FIX-2 / B2: chỉ enqueue nếu có userId
      if (userId) {
        const ok = await enqueueLocation(userId, taskId, {
          latitude: location?.coords?.latitude ?? null,
          longitude: location?.coords?.longitude ?? null,
          accuracy: location?.coords?.accuracy ?? null,
          speed: location?.coords?.speed ?? null,
          heading: location?.coords?.heading ?? null,
          recorded_at: new Date().toISOString(),
        });
        if (ok) {
          const size = await getQueueSize(userId);
          console.log(`[LocationService] FG location queued (offline). Size: ${size}`);
        }
      }
    } else {
      console.warn('[LocationService] Foreground location failed (4xx):', status);
    }
  }
}

async function sendHeartbeatNow(taskId: number) {
  try {
    let batteryLevel = null;
    try {
      const battery = await Battery.getBatteryLevelAsync();
      if (battery >= 0) batteryLevel = Math.round(battery * 100);
    } catch (e) { /* ignore */ }

    await apiClient.post('/tracking/heartbeat/', {
      task_id: taskId,
      // QA-FIX-2 / E: dùng ?? null thay vì || null — tọa độ 0 hợp lệ
      latitude: lastKnownLocation?.latitude ?? null,
      longitude: lastKnownLocation?.longitude ?? null,
      battery_level: batteryLevel,
      app_state: AppState.currentState || 'active',
      network_type: '',
    });
  } catch (e) {
    console.warn('[HeartbeatService] Foreground heartbeat failed:', e?.response?.status || e.message);
  }
}
