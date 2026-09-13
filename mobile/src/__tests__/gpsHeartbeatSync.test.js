// ============================================================
// gpsHeartbeatSync.test.js — Test GPS real-time sync (Defect 4 — 2026-09-13)
//
// Đảm bảo:
//   1. api/tracking.js export sendGpsHeartbeat → POST /tracking/gps-heartbeat/
//   2. syncGpsToBackend(user): CHỈ sync cho role='worker' khi đã cấp quyền
//      vị trí thiết bị (consent máy); parent → không gọi.
//   3. Gửi đúng { latitude, longitude, accuracy } từ expo-location.
//   4. Permission denied → không gọi API (mobile chỉ sync khi có consent máy).
//   5. 403 'no_location_consent' (chưa consent hệ thống) → im lặng, không crash.
//   6. Lỗi mạng khác → non-fatal, không ném exception.
//
// Chạy: npx jest src/__tests__/gpsHeartbeatSync.test.js
// ============================================================

jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(() => Promise.resolve({ data: { status: 'ok' } })),
    get: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  },
}));

jest.mock('../api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getProfile: jest.fn(),
}));

jest.mock('../api/onboarding', () => ({
  completeOnboarding: jest.fn(),
}));

jest.mock('../utils/notifications', () => ({
  registerForPushNotificationsAsync: jest.fn(),
}));

jest.mock('../utils/storage', () => ({
  storage: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    deleteItem: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../api/tracking', () => ({
  sendGpsHeartbeat: jest.fn(() => Promise.resolve({ data: { gps_sync: 'updated' } })),
}));

// expo-location mock — requestForegroundPermissionsAsync + getCurrentPositionAsync
const mockRequestPermission = jest.fn();
const mockGetCurrentPosition = jest.fn();
jest.mock('expo-location', () => ({
  __esModule: true,
  Accuracy: { Balanced: 3, High: 4 },
  requestForegroundPermissionsAsync: (...args) => mockRequestPermission(...args),
  getCurrentPositionAsync: (...args) => mockGetCurrentPosition(...args),
}));

import { syncGpsToBackend } from '../context/AuthContext';
import { sendGpsHeartbeat } from '../api/tracking';
import apiClient from '../api/client';

// Bản THẬT của api/tracking (chưa mock) — dùng để verify wiring thật:
// sendGpsHeartbeat phải gọi đúng apiClient.post('/tracking/gps-heartbeat/', ...)
const trackingActual = jest.requireActual('../api/tracking');

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestPermission.mockReset();
  mockGetCurrentPosition.mockReset();
});

describe('api/tracking.sendGpsHeartbeat', () => {
  test('POST tới /tracking/gps-heartbeat/ với payload tọa độ', async () => {
    await trackingActual.sendGpsHeartbeat({ latitude: 16.468, longitude: 107.589, accuracy: 12 });
    expect(apiClient.post).toHaveBeenCalledWith('/tracking/gps-heartbeat/', {
      latitude: 16.468,
      longitude: 107.589,
      accuracy: 12,
    });
  });
});

describe('AuthContext.syncGpsToBackend (Defect 4)', () => {
  test('worker + quyền granted → gọi sendGpsHeartbeat đúng tọa độ', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 16.468, longitude: 107.589, accuracy: 10 },
    });

    await syncGpsToBackend({ role: 'worker', id: 7 });

    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    expect(sendGpsHeartbeat).toHaveBeenCalledTimes(1);
    expect(sendGpsHeartbeat).toHaveBeenCalledWith({
      latitude: 16.468,
      longitude: 107.589,
      accuracy: 10,
    });
  });

  test('parent → KHÔNG xin quyền, KHÔNG gọi API', async () => {
    await syncGpsToBackend({ role: 'parent', id: 3 });
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(sendGpsHeartbeat).not.toHaveBeenCalled();
  });

  test('user null → no-op an toàn', async () => {
    await expect(syncGpsToBackend(null)).resolves.toBeUndefined();
    expect(sendGpsHeartbeat).not.toHaveBeenCalled();
  });

  test('permission denied → không gọi API (chỉ sync khi có consent máy)', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'denied' });
    await syncGpsToBackend({ role: 'worker', id: 7 });
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
    expect(sendGpsHeartbeat).not.toHaveBeenCalled();
  });

  test('403 no_location_consent (chưa consent hệ thống) → im lặng không crash', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 16.468, longitude: 107.589 },
    });
    const err = new Error('Request failed with status code 403');
    err.response = { status: 403, data: { code: 'no_location_consent' } };
    sendGpsHeartbeat.mockRejectedValueOnce(err);

    await expect(syncGpsToBackend({ role: 'worker', id: 7 })).resolves.toBeUndefined();
    expect(sendGpsHeartbeat).toHaveBeenCalledTimes(1);
  });

  test('lỗi mạng khác → non-fatal, không ném exception', async () => {
    mockRequestPermission.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 16.468, longitude: 107.589 },
    });
    sendGpsHeartbeat.mockRejectedValueOnce(new Error('Network Error'));

    await expect(syncGpsToBackend({ role: 'worker', id: 7 })).resolves.toBeUndefined();
  });
});
