// ============================================================
// BlackoutScreen.acceptance.test.js
// Acceptance & Render smoke test cho màn hình Báo bận / Thi CarePartner
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

const mockGetBlackouts = jest.fn();
const mockAddBlackout = jest.fn();
const mockDeleteBlackout = jest.fn();

jest.mock('../../../api/matching', () => ({
  getBlackouts: (...a) => mockGetBlackouts(...a),
  addBlackout: (...a) => mockAddBlackout(...a),
  deleteBlackout: (...a) => mockDeleteBlackout(...a),
}));

import BlackoutScreen from '../BlackoutScreen';

describe('BlackoutScreen (Google Stitch UI)', () => {
  const flushEffects = async () => {
    await act(async () => {});
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBlackouts.mockResolvedValue({
      data: [
        {
          id: 'bo-1',
          date: '2026-09-20',
          time_from: null,
          time_to: null,
          reason: 'exam',
          note: 'Thi cuối kỳ Giải Tích 2',
        },
        {
          id: 'bo-2',
          date: '2026-09-24',
          time_from: '07:00:00',
          time_to: '11:30:00',
          reason: 'health',
          note: 'Khám sức khỏe định kỳ',
        },
      ],
    });
  });

  it('renders correctly with Header, Hero Shield card and Form fields', async () => {
    const tree = await render(<BlackoutScreen />);
    await flushEffects();

    expect(tree.getByText('Khai Báo Lịch Bận & Thi')).toBeTruthy();
    expect(tree.getByText('AI tạm dừng ghép việc các ngày này')).toBeTruthy();
    expect(tree.getByText('Bảo Vệ Điểm Tín Nhiệm & ELO Đối Tác')).toBeTruthy();
    expect(tree.getByText('Thêm Ngày Bận Mới')).toBeTruthy();
    expect(tree.getByText('Bận cả ngày (24 giờ)')).toBeTruthy();
    expect(tree.getByText('Lưu Lịch Bận & Tạm Khóa Ghép Việc')).toBeTruthy();
    expect(tree.getByText('Lịch bận đã đăng ký')).toBeTruthy();
  });

  it('displays the registered blackout items from backend correctly', async () => {
    const tree = await render(<BlackoutScreen />);
    await flushEffects();

    expect(tree.getByText('2 ngày')).toBeTruthy();
    expect(tree.getByText('· Thi cuối kỳ Giải Tích 2')).toBeTruthy();
    expect(tree.getByText('· Khám sức khỏe định kỳ')).toBeTruthy();
    expect(tree.getByText('Cả ngày')).toBeTruthy();
    expect(tree.getByText('07:00 – 11:30')).toBeTruthy();
  });

  it('allows selecting a reason and typing a note', async () => {
    const tree = await render(<BlackoutScreen />);
    await flushEffects();

    const healthPill = tree.getByText('Sức khỏe / Ốm');
    await act(async () => {
      fireEvent.press(healthPill);
    });

    const noteInput = tree.getByPlaceholderText('Ví dụ: Thi cuối kỳ môn Giải Tích 2 (ĐH Khoa học Huế)...');
    await act(async () => {
      fireEvent.changeText(noteInput, 'Sốt xuất huyết');
    });

    expect(noteInput.props.value).toBe('Sốt xuất huyết');
  });

  it('calls addBlackout API when submitting new blackout date', async () => {
    mockAddBlackout.mockResolvedValue({ data: { success: true } });
    const tree = await render(<BlackoutScreen />);
    await flushEffects();

    const saveBtn = tree.getByText('Lưu Lịch Bận & Tạm Khóa Ghép Việc');
    await act(async () => {
      fireEvent.press(saveBtn);
    });
    await flushEffects();

    expect(mockAddBlackout).toHaveBeenCalled();
    const payload = mockAddBlackout.mock.calls[0][0];
    expect(payload.reason).toBe('exam');
    expect(payload.time_from).toBeNull();
    expect(payload.time_to).toBeNull();
  });

  it('opens and closes the rules modal', async () => {
    const tree = await render(<BlackoutScreen />);
    await flushEffects();

    const rulesBtn = tree.getByLabelText('Quy định báo bận');
    await act(async () => {
      fireEvent.press(rulesBtn);
    });

    expect(tree.getByText('Quy định báo bận CarePartner')).toBeTruthy();

    const closeBtn = tree.getByText('Đã hiểu quy định');
    await act(async () => {
      fireEvent.press(closeBtn);
    });
  });
});
