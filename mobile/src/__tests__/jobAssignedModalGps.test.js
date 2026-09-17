// ============================================================
// JobAssignedModal + GPS consent — Task E/F (2026-09-14)
//
// Kiểm thử:
//   1. Poll thấy booking awaiting_commitment → modal "Bạn có đơn mới" hiện
//      với đủ 3 nút [Xác nhận cam kết] [Chi tiết] [Từ chối].
//   2. Bấm "Xác nhận cam kết" → gọi commitBooking đúng id → modal đóng.
//   3. Bấm "Từ chối" → gọi cancelBooking với reason_code trong cửa sổ cam kết.
//   4. Parent / chưa login → KHÔNG poll, KHÔNG modal.
//   5. syncGpsToBackend: heartbeat trả no_matching_consent → ghi backoff
//      24h vào storage (không spam), và updateMatchingGpsConsent(true) xóa backoff.
// ============================================================

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';

const receivedCallbacks = [];
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn((cb) => {
    receivedCallbacks.push(cb);
    return { remove: jest.fn() };
  }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  getDevicePushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExpoToken[test]' }),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));

// Fire một push job_assigned tới các listener đã đăng ký (không phụ thuộc timer)
function fireJobAssignedPush(bookingId) {
  receivedCallbacks.forEach((cb) => cb({
    request: { content: { data: { type: 'job_assigned', booking_id: bookingId } } },
  }));
}

jest.mock('expo-av', () => ({
  Audio: { Sound: { createAsync: jest.fn().mockResolvedValue({ sound: { replayAsync: jest.fn(), unloadAsync: jest.fn() } }) } },
}));

jest.mock('expo-haptics', () => ({
  vibrateAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return { Ionicons: () => null };
});

const mockGetBookings = jest.fn();
const mockCommitBooking = jest.fn();
const mockCancelBooking = jest.fn();
const mockGetBookingDetail = jest.fn();

jest.mock('../api/matching', () => ({
  getBookings: (...a) => mockGetBookings(...a),
  commitBooking: (...a) => mockCommitBooking(...a),
  cancelBooking: (...a) => mockCancelBooking(...a),
  getBookingDetail: (...a) => mockGetBookingDetail(...a),
}));

const mockItems = {
  getItem: jest.fn().mockResolvedValue('0'),
  setItem: jest.fn().mockResolvedValue(undefined),
  deleteItem: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../utils/storage', () => ({
  storage: {
    getItem: (...a) => mockItems.getItem(...a),
    setItem: (...a) => mockItems.setItem(...a),
    deleteItem: (...a) => mockItems.deleteItem(...a),
  },
}));

// AppState thật từ react-native preset — spy + ép currentState='active'
import { AppState as RNAppState } from 'react-native';

beforeEach(() => {
  try {
    jest.spyOn(RNAppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  } catch (e) { /* đã spy */ }
  try {
    RNAppState.currentState = 'active';
  } catch (e) {
    try {
      Object.defineProperty(RNAppState, 'currentState', {
        value: 'active', configurable: true,
      });
    } catch (e2) { /* bỏ qua */ }
  }
});

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 21.0285, longitude: 105.7945, accuracy: 12 },
  }),
}));

// ── AuthContext mock: user worker/parent + GPS sync thật để test backoff ──
const mockUser = { role: 'worker', id: 9, is_approved: true };
jest.mock('../context/AuthContext', () => {
  const actualAuth = jest.requireActual('../context/AuthContext');
  return {
    ...actualAuth,
    useAuth: () => ({ user: mockUser, logout: jest.fn() }),
    AuthProvider: ({ children }) => children,
  };
});

// sendGpsHeartbeat mock cho test backoff (định nghĩa SAU mock AuthContext
// nhưng requireActual nạp file thật → mock api/tracking trước khi import)
const mockSendGpsHeartbeat = jest.fn();
jest.mock('../api/tracking', () => ({
  sendGpsHeartbeat: (...a) => mockSendGpsHeartbeat(...a),
  setMatchingGpsConsent: jest.fn().mockResolvedValue({ data: { matching_gps_consent: true } }),
}));

import JobAssignedModal from '../components/JobAssignedModal';
import { syncGpsToBackend, updateMatchingGpsConsent } from '../context/AuthContext';

const AWAITING_BOOKING = {
  id: 'bk-001',
  job_title: 'Gia sư Toán lớp 5',
  parent_name: 'Nguyễn Văn A',
  job_address: '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế',
  total_value_vnd: 240000,
  first_slot: { date: '2026-09-21', time_from: '19:00:00', time_to: '21:00:00' },
  seconds_left: 300,
};

describe('JobAssignedModal — Task F: popup nhận đơn + chuông + poll 15s', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    receivedCallbacks.length = 0;
    mockGetBookings.mockResolvedValue({ data: [AWAITING_BOOKING] });
    mockGetBookingDetail.mockResolvedValue({ data: AWAITING_BOOKING });
  });

  async function openViaPush() {
    const utils = render(<JobAssignedModal />);
    // Poll chạy ngay khi mount → mở modal cho đơn chưa xem (phòng miss push)
    await waitFor(() => {
      expect(screen.getByText('Bạn có đơn mới')).toBeTruthy();
    });
    return utils;
  }

  test('poll thấy awaiting_commitment → hiện modal "Bạn có đơn mới" đủ 3 nút', async () => {
    await openViaPush();
    expect(screen.getByText('Xác nhận cam kết')).toBeTruthy();
    expect(screen.getByText('Chi tiết')).toBeTruthy();
    expect(screen.getByText('Từ chối')).toBeTruthy();
    // Poll đúng endpoint + status
    expect(mockGetBookings).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker', status: 'awaiting_commitment' }));
    // Thông tin đơn: tiền + phụ huynh
    expect(screen.getByText(/240\.000đ/)).toBeTruthy();
    expect(screen.getByText(/Nguyễn Văn A/)).toBeTruthy();
  });

  test('push job_assigned + bấm "Xác nhận cam kết" → commitBooking đúng id → modal đóng', async () => {
    mockCommitBooking.mockResolvedValue({ data: {} });
    await openViaPush();
    fireEvent.press(screen.getByText('Xác nhận cam kết'));
    await waitFor(() => {
      expect(mockCommitBooking).toHaveBeenCalledWith('bk-001');
    });
    await waitFor(() => {
      expect(screen.queryByText('Bạn có đơn mới')).toBeNull();
    });
  });

  test('push job_assigned + bấm "Từ chối" → cancelBooking lý do trong cửa sổ cam kết', async () => {
    mockCancelBooking.mockResolvedValue({ data: {} });
    await openViaPush();
    fireEvent.press(screen.getByText('Từ chối'));
    await waitFor(() => {
      expect(mockCancelBooking).toHaveBeenCalledWith('bk-001', {
        reason_code: 'personal',
        note: 'Từ chối trong cửa sổ cam kết',
      });
    });
  });

  test('parent login → không poll, không modal', async () => {
    mockUser.role = 'parent';
    mockGetBookings.mockClear();
    render(<JobAssignedModal />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(mockGetBookings).not.toHaveBeenCalled();
    expect(screen.queryByText('Bạn có đơn mới')).toBeNull();
    mockUser.role = 'worker';
  });
});

describe('syncGpsToBackend — Task E: backoff khi chưa consent matching-GPS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockItems.getItem.mockResolvedValue('0');
  });

  test('heartbeat no_matching_consent → ghi backoff 24h, không throw', async () => {
    mockSendGpsHeartbeat.mockResolvedValue({ data: { gps_sync: 'no_matching_consent' } });
    await expect(syncGpsToBackend({ role: 'worker', id: 9 })).resolves.toBeUndefined();
    expect(mockItems.setItem).toHaveBeenCalledWith(
      'gps_no_consent_until', expect.any(String));
    const stored = parseInt(mockItems.setItem.mock.calls[0][1], 10);
    expect(stored).toBeGreaterThan(Date.now() + 20 * 60 * 60 * 1000); // > 20h
  });

  test('đang backoff → không gọi heartbeat', async () => {
    mockItems.getItem.mockResolvedValue(String(Date.now() + 60 * 60 * 1000));
    mockSendGpsHeartbeat.mockClear();
    await expect(syncGpsToBackend({ role: 'worker', id: 9 })).resolves.toBeUndefined();
    expect(mockSendGpsHeartbeat).not.toHaveBeenCalled();
  });

  test('updateMatchingGpsConsent(true) → xóa backoff + gọi API consent', async () => {
    const { setMatchingGpsConsent } = require('../api/tracking');
    await updateMatchingGpsConsent(true);
    expect(setMatchingGpsConsent).toHaveBeenCalledWith(true);
    expect(mockItems.setItem).toHaveBeenCalledWith('gps_no_consent_until', '0');
  });
});
