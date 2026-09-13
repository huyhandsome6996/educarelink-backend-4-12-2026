// ============================================================
// AvailabilityScreen.acceptance.test.js
// Acceptance & Render smoke test cho màn hình Lịch rảnh CarePartner
// (Nâng cấp theo chuẩn Google Stitch UI 2026-09-13).
// ============================================================

import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: {} }),
  useFocusEffect: (cb) => {
    // Gọi ngay callback để fetch data
    const React = require('react');
    React.useEffect(() => {
      cb();
    }, [cb]);
  },
  useIsFocused: () => true,
}));

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
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'worker', full_name: 'Minh Anh', avatar_url: null },
  }),
}));

const mockGetAvailability = jest.fn();
const mockAddAvailability = jest.fn();
const mockDeleteAvailability = jest.fn();

jest.mock('../../../api/matching', () => ({
  getAvailability: (...a) => mockGetAvailability(...a),
  addAvailability: (...a) => mockAddAvailability(...a),
  deleteAvailability: (...a) => mockDeleteAvailability(...a),
}));

import AvailabilityScreen from '../AvailabilityScreen';

describe('AvailabilityScreen (Google Stitch UI)', () => {
  const flushEffects = async () => {
    await act(async () => {});
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAvailability.mockResolvedValue({
      data: {
        windows: [
          {
            id: 'w-1',
            weekday: 0, // Thứ 2
            time_from: '18:00:00',
            time_to: '21:00:00',
            is_locked: false,
          },
          {
            id: 'w-2',
            weekday: 0, // Thứ 2
            time_from: '09:00:00',
            time_to: '11:00:00',
            is_locked: true,
          },
          {
            id: 'w-3',
            weekday: 4, // Thứ 6
            time_from: '14:00:00',
            time_to: '17:30:00',
            is_locked: false,
          },
        ],
      },
    });
  });

  it('renders correctly with Header, AI Radar banner and Weekly Earning summary', async () => {
    const tree = await render(<AvailabilityScreen />);
    await flushEffects();

    expect(tree.getByText('CAREPARTNER RADAR ACTIVE')).toBeTruthy();
    expect(tree.getByText('Lịch Rảnh & Ghép Việc AI')).toBeTruthy();
    expect(tree.getByText('Radar AI Đang Tìm Kiếm Việc Làm Cho Bạn')).toBeTruthy();
    expect(tree.getByText('Chọn ngày trong tuần')).toBeTruthy();
    expect(tree.getByText('CHỌN NHANH KHUNG GIỜ PHỔ BIẾN')).toBeTruthy();
    expect(tree.getByText('LƯU KHUNG GIỜ NÀY')).toBeTruthy();
  });

  it('displays the slots for the selected day correctly', async () => {
    const tree = await render(<AvailabilityScreen />);
    await flushEffects();

    // Default is Thứ 2 (weekday 0)
    expect(tree.getByText('Lịch Thứ 2')).toBeTruthy();
    // 18:00 – 21:00 xuất hiện ở cả Preset và ca đã đăng ký
    expect(tree.getAllByText('18:00 – 21:00').length).toBeGreaterThanOrEqual(2);
    expect(tree.getByText('AI Đang Tìm Phụ Huynh Phù Hợp')).toBeTruthy();
    expect(tree.getByText('09:00 – 11:00')).toBeTruthy();
    expect(tree.getByText('AI Đã Ghép Đơn (Đã Khóa Lịch)')).toBeTruthy();
  });

  it('switches weekday when tapping on another day', async () => {
    const tree = await render(<AvailabilityScreen />);
    await flushEffects();

    // Tap on Thứ 6 (T6)
    const t6Btn = tree.getByText('T6');
    await act(async () => {
      fireEvent.press(t6Btn);
    });
    await flushEffects();

    expect(tree.getByText('Lịch Thứ 6')).toBeTruthy();
    // 14:00 – 17:30 xuất hiện ở cả Preset và ca đã đăng ký
    expect(tree.getAllByText('14:00 – 17:30').length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to BlackoutScreen when tapping "Báo bận / Thi"', async () => {
    const tree = await render(<AvailabilityScreen />);
    await flushEffects();

    const blackoutBtn = tree.getByText('Báo bận / Thi');
    await act(async () => {
      fireEvent.press(blackoutBtn);
    });

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Blackout');
  });

  it('calls addAvailability API when saving a slot', async () => {
    mockAddAvailability.mockResolvedValue({ data: { success: true } });
    const tree = await render(<AvailabilityScreen />);
    await flushEffects();

    const saveBtn = tree.getByText('LƯU KHUNG GIỜ NÀY');
    await act(async () => {
      fireEvent.press(saveBtn);
    });
    await flushEffects();

    expect(mockAddAvailability).toHaveBeenCalledWith({
      weekday: 0,
      time_from: '18:00',
      time_to: '21:00',
    });
  });
});
