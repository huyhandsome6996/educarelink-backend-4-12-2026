// ====================================================================
// LocationService — Background location tracking cho Carepartner
//   - Sử dụng expo-location + expo-task-manager
//   - Khi task in_progress + consent granted → start tracking
//   - Gửi vị trí mỗi 10s tới backend /api/tracking/location/
//   - Khi task completed/cancelled → stop tracking
// ====================================================================
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';
import apiClient from '../api/client';

const LOCATION_TASK_NAME = 'educarelink-location-tracking';
const UPDATE_INTERVAL_MS = 10000; // 10 giây

let isStarted = false;
let currentTaskId = null;

// ====================================================================
// BACKGROUND TASK — chạy khi app ở nền
// ====================================================================
// Define task manager handler (must be at module scope, not inside component)
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('[LocationService] Background task error:', error);
    return;
  }
  if (!data || !data.locations || data.locations.length === 0) return;

  const location = data.locations[data.locations.length - 1];
  const taskId = await storage.getItem('tracking_task_id');
  if (!taskId) {
    // Không có task đang track → stop
    return;
  }

  try {
    await apiClient.post('/tracking/location/', {
      task_id: parseInt(taskId, 10),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
    });
    console.log('[LocationService] Background update sent:', location.coords.latitude, location.coords.longitude);
  } catch (e) {
    console.warn('[LocationService] Background update failed:', e?.response?.status || e.message);
  }
});

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

    // Background permission (Android 11+, iOS)
    if (Platform.OS !== 'web') {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.warn('[LocationService] Background permission denied — tracking sẽ chỉ chạy khi app mở');
        // Vẫn return true vì foreground đã OK
      }
    }
    return true;
  } catch (e) {
    console.error('[LocationService] requestLocationPermissions error:', e);
    return false;
  }
}

/**
 * Bắt đầu tracking vị trí cho task.
 * - Lưu taskId vào storage (cho background task)
 * - Start background location task
 * - Start foreground interval (backup, gửi mỗi 10s)
 *
 * @param {number} taskId - ID của task đang in_progress
 */
export async function startTracking(taskId: number): Promise<boolean> {
  if (isStarted && currentTaskId === taskId) {
    console.log('[LocationService] Already tracking this task');
    return true;
  }

  // Nếu đang track task khác → stop trước
  if (isStarted) {
    await stopTracking();
  }

  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    return false;
  }

  try {
    // Lưu taskId cho background task
    await storage.setItem('tracking_task_id', String(taskId));
    currentTaskId = taskId;

    // Start background task (chạy khi app ở nền)
    if (Platform.OS !== 'web') {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: UPDATE_INTERVAL_MS,
        distanceInterval: 5, // 5 mét
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'EduCareLink đang theo dõi vị trí',
          notificationBody: 'Phụ huynh đang thấy vị trí của bạn trong lúc làm việc',
          notificationColor: '#F26522',
        },
      });
    }

    // Start foreground interval (khi app mở)
    startForegroundInterval(taskId);

    isStarted = true;
    console.log(`[LocationService] Started tracking for task #${taskId}`);
    return true;
  } catch (e) {
    console.error('[LocationService] startTracking error:', e);
    return false;
  }
}

/**
 * Dừng tracking (khi task completed/cancelled hoặc user bấm "Dừng").
 */
export async function stopTracking(): Promise<void> {
  if (!isStarted) return;

  try {
    // Stop foreground interval
    stopForegroundInterval();

    // Stop background task
    if (Platform.OS !== 'web') {
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    }

    // Clear storage
    await storage.deleteItem('tracking_task_id');
    currentTaskId = null;
    isStarted = false;
    console.log('[LocationService] Stopped tracking');
  } catch (e) {
    console.error('[LocationService] stopTracking error:', e);
  }
}

/**
 * Check xem có đang tracking không.
 */
export function isTracking(): boolean {
  return isStarted;
}

export function getCurrentTaskId(): number | null {
  return currentTaskId;
}

// ====================================================================
// FOREGROUND INTERVAL — backup khi app mở
// ====================================================================
let foregroundIntervalId: any = null;

function startForegroundInterval(taskId: number) {
  if (foregroundIntervalId) {
    clearInterval(foregroundIntervalId);
  }

  // Gửi ngay 1 lần đầu
  sendCurrentLocation(taskId);

  // Setup interval mỗi 10s
  foregroundIntervalId = setInterval(() => {
    sendCurrentLocation(taskId);
  }, UPDATE_INTERVAL_MS);
}

function stopForegroundInterval() {
  if (foregroundIntervalId) {
    clearInterval(foregroundIntervalId);
    foregroundIntervalId = null;
  }
}

async function sendCurrentLocation(taskId: number) {
  try {
    if (Platform.OS === 'web') return; // Web không có Location.getCurrentPositionAsync

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    await apiClient.post('/tracking/location/', {
      task_id: taskId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
    });
    // console.log('[LocationService] Foreground update sent');
  } catch (e) {
    console.warn('[LocationService] Foreground update failed:', e?.response?.status || e.message);
  }
}
