// ============================================================
// Acceptance test — WorkerChatbotScreen (chatbot-fix-3, §3 spec).
//
// Backend WorkerChatbotAPIView (agent backend triển khai song song) trả:
//   { response, type: 'blackout_created', blackouts: [ {date, time_from,
//      time_to, reason, reason_label_vi, note}, ... ] }  (max 5 item)
// Backend KHÔNG lưu — app gọi addBlackout từng item
// (POST /api/matching/carepartners/me/blackouts/) khi user bấm nút duyệt.
//
// Đảm bảo:
//   1. Mới mở → render welcome bubble (không gọi API).
//   2. type 'blackout_created' 2 item → card "Phát hiện 2 ngày bạn bận" +
//      chips ngày/giờ/reason + nút "Lưu vào Lịch Bận & Bảo vệ ELO".
//   3. Bấm lưu → addBlackout 2 lần đúng payload + Alert thành công +
//      card chuyển trạng thái đã lưu, nút disabled.
//   4. 409 (trùng lịch) → bỏ qua item đó, phần còn lại vẫn thành công.
//   5. "Mở Lịch bận" → navigate('MatchingAvailability', {screen:'Blackout'}).
//
// Chạy: npx jest src/screens/__tests__/WorkerChatbotScreen.acceptance.test.js
// ============================================================

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ── Mock @react-navigation/native ─────────────────────────────
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

// ── Mock @expo/vector-icons (Proxy — cùng kỹ thuật flow1 smoke test) ──
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

// ── Mock API — điều khiển được từ test ────────────────────────
const mockSendWorkerChatMessage = jest.fn();
const mockAddBlackout = jest.fn();
jest.mock('../../api/tasks', () => ({
  sendWorkerChatMessage: (...args) => mockSendWorkerChatMessage(...args),
}));
jest.mock('../../api/matching', () => ({
  addBlackout: (...args) => mockAddBlackout(...args),
}));

jest.mock('../../components/FormattedText', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ text }) => <Text>{text}</Text>;
});

import WorkerChatbotScreen from '../Worker/WorkerChatbotScreen';

// Hợp đồng blackout_created — item max 5, date 'YYYY-MM-DD',
// time_from/time_to null = bận cả ngày
const BLACKOUTS_2 = [
  {
    date: '2026-10-05',
    time_from: null,
    time_to: null,
    reason: 'exam',
    reason_label_vi: 'Bận thi học tập',
    note: 'Thi cuối kỳ',
  },
  {
    date: '2026-10-07',
    time_from: '08:00',
    time_to: '11:30',
    reason: 'health',
    reason_label_vi: 'Sức khỏe không tốt',
    note: '',
  },
];

const flushEffects = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 0)));

// Gửi 1 tin nhắn qua composer của worker chatbot
const sendViaComposer = async ({ getByPlaceholderText, getByTestId }) => {
  fireEvent.changeText(getByPlaceholderText('Nhắn tin cho AI...'), 'thứ 5 tới mình bận cả ngày');
  await waitFor(() => {
    expect(getByTestId('chatbot-send').props.disabled).toBeFalsy();
  });
  fireEvent.press(getByTestId('chatbot-send'));
};

// RNTL getByTestId có thể trả host element (TouchableOpacity forward testID
// xuống Pressable) — `disabled` khi đó nằm ở accessibilityState, không phải
// props.disabled. Gộp 2 nguồn để assert chắc chắn.
const isDisabled = (el) =>
  el.props.disabled === true || el.props.accessibilityState?.disabled === true;

let alertSpy;

describe('WorkerChatbotScreen — khai ngày bận qua AI (§3 spec)', () => {
  beforeEach(() => {
    mockNavigation.navigate.mockClear();
    mockSendWorkerChatMessage.mockReset();
    mockAddBlackout.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    cleanup(); // RNTL v14 + jest-expo: dọn tree giữa các test
  });

  it('render welcome bubble khi mới mở — chưa gọi API', async () => {
    const { getByText } = await render(<WorkerChatbotScreen />);
    await flushEffects();
    expect(getByText(/Chào Carepartner!/)).toBeTruthy();
    expect(mockSendWorkerChatMessage).not.toHaveBeenCalled();
    expect(mockAddBlackout).not.toHaveBeenCalled();
  });

  it('type blackout_created 2 item → card phát hiện + chips ngày/giờ/reason + nút lưu', async () => {
    mockSendWorkerChatMessage.mockResolvedValueOnce({
      data: {
        response: 'Mình thấy bạn bận 2 ngày sắp tới nhé!',
        type: 'blackout_created',
        blackouts: BLACKOUTS_2,
      },
    });

    const { getByPlaceholderText, getByTestId, getByText } = await render(<WorkerChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });

    // Card + chips render đúng hợp đồng
    await waitFor(() => {
      expect(getByText('🗓️ Phát hiện 2 ngày bạn bận')).toBeTruthy();
    });
    expect(getByText('Mình thấy bạn bận 2 ngày sắp tới nhé!')).toBeTruthy();
    expect(getByText('Lưu vào Lịch Bận & Bảo vệ ELO')).toBeTruthy();
    expect(getByText('Cả ngày'));            // item 1: time_from/to null
    expect(getByText('08:00-11:30'));        // item 2: có khung giờ
    expect(getByText('05/10'));              // DD/MM từ '2026-10-05'
    expect(getByText('07/10'));              // DD/MM từ '2026-10-07'
    expect(getByText(/Bận thi học tập/));    // reason_label_vi item 1
    expect(getByText(/Sức khỏe không tốt/)); // reason_label_vi item 2

    // Chưa lưu — nút enabled, chưa Alert
    expect(isDisabled(getByTestId('blackout-save'))).toBe(false);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('bấm lưu → addBlackout 2 lần đúng payload + Alert thành công + nút disabled', async () => {
    mockSendWorkerChatMessage.mockResolvedValueOnce({
      data: {
        response: 'Mình thấy bạn bận 2 ngày sắp tới nhé!',
        type: 'blackout_created',
        blackouts: BLACKOUTS_2,
      },
    });
    mockAddBlackout
      .mockResolvedValueOnce({ data: { id: 'blk-1' } })
      .mockResolvedValueOnce({ data: { id: 'blk-2' } });

    const { getByPlaceholderText, getByTestId, getByText } = await render(<WorkerChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });
    await waitFor(() => {
      expect(getByText('🗓️ Phát hiện 2 ngày bạn bận')).toBeTruthy();
    });

    fireEvent.press(getByTestId('blackout-save'));

    // Tuần tự addBlackout từng item — body {date, time_from, time_to, reason, note}
    await waitFor(() => {
      expect(mockAddBlackout).toHaveBeenCalledTimes(2);
    });
    expect(mockAddBlackout).toHaveBeenNthCalledWith(1, {
      date: '2026-10-05',
      time_from: null,
      time_to: null,
      reason: 'exam',
      note: 'Thi cuối kỳ',
    });
    expect(mockAddBlackout).toHaveBeenNthCalledWith(2, {
      date: '2026-10-07',
      time_from: '08:00',
      time_to: '11:30',
      reason: 'health',
      note: '',
    });

    // Alert thành công (không Alert lỗi)
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Thành công',
        expect.stringContaining('Đã lưu 2 ngày bận')
      );
    });
    expect(alertSpy).not.toHaveBeenCalledWith('Chưa lưu được', expect.anything());

    // Card chuyển trạng thái đã lưu + nút bị disable
    await waitFor(() => {
      expect(getByText('✅ Đã lưu 2 ngày bận. ELO của bạn được bảo vệ khỏi đề xuất trong ngày bận.')).toBeTruthy();
    });
    expect(isDisabled(getByTestId('blackout-save'))).toBe(true);
  });

  it('409 trùng lịch → bỏ qua item đó, phần còn lại vẫn lưu thành công', async () => {
    mockSendWorkerChatMessage.mockResolvedValueOnce({
      data: {
        response: 'Mình thấy bạn bận 2 ngày sắp tới nhé!',
        type: 'blackout_created',
        blackouts: BLACKOUTS_2,
      },
    });
    // Item 1: 409 (trùng đơn đã xác nhận) — coi là đã bảo vệ, bỏ qua
    mockAddBlackout
      .mockRejectedValueOnce({ response: { status: 409, data: { detail: 'Trùng đơn đã xác nhận' } } })
      .mockResolvedValueOnce({ data: { id: 'blk-2' } });

    const { getByPlaceholderText, getByTestId, getByText } = await render(<WorkerChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });
    await waitFor(() => {
      expect(getByText('🗓️ Phát hiện 2 ngày bạn bận')).toBeTruthy();
    });

    fireEvent.press(getByTestId('blackout-save'));

    // Cả 2 item vẫn được xử lý — không dừng lại ở lỗi 409
    await waitFor(() => {
      expect(mockAddBlackout).toHaveBeenCalledTimes(2);
    });

    // Vẫn thành công: 1 lưu mới + 1 trùng bỏ qua = 2 ngày được bảo vệ
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Thành công',
        expect.stringContaining('Đã lưu 2 ngày bận')
      );
    });
    expect(alertSpy).toHaveBeenCalledWith(
      'Thành công',
      expect.stringContaining('1 ngày trùng lịch đã có sẵn')
    );
    expect(alertSpy).not.toHaveBeenCalledWith('Chưa lưu được', expect.anything());

    await waitFor(() => {
      expect(getByText('✅ Đã lưu 2 ngày bận. ELO của bạn được bảo vệ khỏi đề xuất trong ngày bận.')).toBeTruthy();
    });
    expect(isDisabled(getByTestId('blackout-save'))).toBe(true);
  });

  it('nút phụ "Mở Lịch bận" → navigate MatchingAvailability {screen: Blackout}', async () => {
    mockSendWorkerChatMessage.mockResolvedValueOnce({
      data: {
        response: 'Mình thấy bạn bận 1 ngày nhé!',
        type: 'blackout_created',
        blackouts: [BLACKOUTS_2[0]],
      },
    });

    const { getByPlaceholderText, getByTestId, getByText } = await render(<WorkerChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });
    await waitFor(() => {
      expect(getByText('🗓️ Phát hiện 1 ngày bạn bận')).toBeTruthy();
    });

    fireEvent.press(getByTestId('blackout-open'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MatchingAvailability', {
      screen: 'Blackout',
    });
  });
});
