// ============================================================
// Test entry point "Lịch sử nhật ký chăm sóc" trên MyTasksScreen
// (2026-09-15 — CareDiaryHistoryScreen trước đây đã đăng ký trong
// 4 navigator stack nhưng KHÔNG nơi nào navigate tới → màn hình chết).
//
// Đảm bảo:
//   1. Header "Việc Của Tôi" có nút book-icon với accessibilityLabel
//      "Xem lịch sử nhật ký chăm sóc".
//   2. Bấm nút → navigation.navigate('CareDiaryHistory').
//
// Chạy: npx jest src/screens/Parent/__tests__/MyTasksScreen.diaryHistoryEntry.test.js
// ============================================================

import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';

// ── Mock @react-navigation/native ─────────────────────────────
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

// ── Mock @expo/vector-icons (Proxy — kỹ thuật của renderSmoke test) ──
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const mockMakeIcon = () => React.forwardRef(() => null);
  const mockIcons = {};
  return new Proxy(mockIcons, {
    get: (target, name) => {
      if (typeof name !== 'string') return undefined;
      if (!target[name]) target[name] = mockMakeIcon();
      return target[name];
    },
  });
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

// ── Mock API (đủ các named export MyTasksScreen dùng) ─────────
const mockGetMyTasksAsParent = jest.fn();
const mockGetCandidates = jest.fn();
jest.mock('../../../api/tasks', () => ({
  getMyTasksAsParent: (...a) => mockGetMyTasksAsParent(...a),
  getCandidates: (...a) => mockGetCandidates(...a),
  updateTaskStatus: jest.fn(),
}));

const mockGetBookings = jest.fn();
jest.mock('../../../api/matching', () => ({
  getBookings: (...a) => mockGetBookings(...a),
  cancelBookingByParent: jest.fn(),
  completeBooking: jest.fn(),
  respondReschedule: jest.fn(),
  reportNoShow: jest.fn(),
}));

jest.mock('../../../api/tracking', () => ({
  checkConsent: jest.fn(),
  getLiveLocation: jest.fn(),
}));

jest.mock('../../../api/moderation', () => ({
  getTaskModeration: jest.fn(),
}));

jest.mock('../../../components/NotificationBell', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef(() => null) };
});

import MyTasksScreen from '../MyTasksScreen';

jest.setTimeout(20000);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyTasksAsParent.mockResolvedValue({ data: { results: [] } });
  mockGetCandidates.mockResolvedValue({ data: { results: [] } });
  mockGetBookings.mockResolvedValue({ data: [] });
});

describe('MyTasksScreen — entry point Lịch sử nhật ký chăm sóc', () => {
  test('Header có nút "Xem lịch sử nhật ký chăm sóc"', async () => {
    const { getByLabelText } = await render(<MyTasksScreen />);
    await act(async () => {});
    expect(getByLabelText('Xem lịch sử nhật ký chăm sóc')).toBeTruthy();
  });

  test('Bấm nút → navigate tới CareDiaryHistory', async () => {
    const { getByLabelText } = await render(<MyTasksScreen />);
    await act(async () => {});
    fireEvent.press(getByLabelText('Xem lịch sử nhật ký chăm sóc'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CareDiaryHistory');
  });
});
