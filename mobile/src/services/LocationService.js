// ====================================================================
// LocationService — Background location tracking cho Carepartner
//   - Sử dụng expo-location + expo-task-manager
//   - Khi task in_progress + consent granted → start tracking
//   - Gửi vị trí mỗi 10s tới backend /api/tracking/location/
//   - Gửi heartbeat mỗi 30s tới backend /api/tracking/heartbeat/
//     (chống tắt máy — nếu backend không nhận heartbeat > 90s
//      sẽ tự push chuông cho phụ huynh)
//   - Khi task completed/cancelled → stop tracking
// ====================================================================
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import { Platform, AppState } from 'react-native';
import { storage } from '../utils/storage';
import apiClient from '../api/client';

const LOCATION_TASK_NAME = 'educarelink-location-tracking';
const HEARTBEAT_TASK_NAME = 'educarelink-heartbeat';
const UPDATE_INTERVAL_MS = 10000;       // 10 giây — gửi vị trí
const HEARTBEAT_INTERVAL_MS = 30000;    // 30 giây — gửi heartbeat (chống tắt máy)

let isStarted = false;
let currentTaskId = null;
let lastKnownLocation = null;  // cache vị trí cuối để gửi kèm heartbeat
let appStateSubscription = null;

// ====================================================================
// BACKGROUND TASK — location tracking (chạy khi app ở nền)
// ====================================================================
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

  try {
    await apiClient.post('/tracking/location/', {
      task_id: parseInt(taskId, 10),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
    });
    lastKnownLocation = location.coords;
    console.log('[LocationService] Background location update sent');
  } catch (e) {
    console.warn('[LocationService] Background location failed:', e?.response?.status || e.message);
  }
});

// ====================================================================
// BACKGROUND TASK — heartbeat (chống tắt máy)
// Gửi mỗi 30s — nếu backend không nhận > 90s sẽ báo chuông cho parent
// ====================================================================
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
      latitude: lastKnownLocation?.latitude || null,
      longitude: lastKnownLocation?.longitude || null,
      battery_level: batteryLevel,
      app_state: AppState.currentState || 'background',
      network_type: '',  // không có API native trong Expo
    });
    console.log('[HeartbeatService] Heartbeat sent');
  } catch (e) {
    console.warn('[HeartbeatService] Heartbeat failed:', e?.response?.status || e.message);
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
 */
export async function startTracking(taskId: number): Promise<boolean> {
  if (isStarted && currentTaskId === taskId) {
    console.log('[LocationService] Already tracking this task');
    return true;
  }

  if (isStarted) {
    await stopTracking();
  }

  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    return false;
  }

  try {
    await storage.setItem('tracking_task_id', String(taskId));
    currentTaskId = taskId;

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
    startForegroundLocationInterval(taskId);
    startForegroundHeartbeatInterval(taskId);

    // Gửi heartbeat ngay lần đầu
    sendHeartbeatNow(taskId);

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

    isStarted = true;
    console.log(`[LocationService] Started tracking + heartbeat for task #${taskId}`);
    return true;
  } catch (e) {
    console.error('[LocationService] startTracking error:', e);
    return false;
  }
}

/**
 * Dừng tracking + heartbeat.
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

    await storage.deleteItem('tracking_task_id');
    currentTaskId = null;
    lastKnownLocation = null;
    isStarted = false;
    console.log('[LocationService] Stopped tracking + heartbeat');
  } catch (e) {
    console.error('[LocationService] stopTracking error:', e);
  }
}

export function isTracking(): boolean {
  return isStarted;
}

export function getCurrentTaskId(): number | null {
  return currentTaskId;
}

export function getCurrentLocation() {
  return lastKnownLocation;
}

// ====================================================================
// FOREGROUND INTERVALS — backup khi app mở
// ====================================================================
let locationIntervalId: any = null;
let heartbeatIntervalId: any = null;

function startForegroundLocationInterval(taskId: number) {
  if (locationIntervalId) clearInterval(locationIntervalId);
  sendCurrentLocation(taskId);
  locationIntervalId = setInterval(() => {
    sendCurrentLocation(taskId);
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

async function sendCurrentLocation(taskId: number) {
  try {
    if (Platform.OS === 'web') return;

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
    lastKnownLocation = location.coords;
  } catch (e) {
    console.warn('[LocationService] Foreground location failed:', e?.response?.status || e.message);
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
      latitude: lastKnownLocation?.latitude || null,
      longitude: lastKnownLocation?.longitude || null,
      battery_level: batteryLevel,
      app_state: AppState.currentState || 'active',
      network_type: '',
    });
  } catch (e) {
    console.warn('[HeartbeatService] Foreground heartbeat failed:', e?.response?.status || e.message);
  }
}
