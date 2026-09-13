// ============================================================
// Render smoke-test cho 2 màn AI Chatbot Flow 1/2 (brief mục 5 — mobile).
//
// Mục tiêu: cả 2 màn ChatbotScreen (phụ huynh) và WorkerChatbotScreen
// (CarePartner) sau nâng cấp Flow 1/2 phải mount không ném lỗi — bắt sớm
// các lỗi kiểu import thiếu (useSafeAreaInsets/useNavigation), render card
// draft/blackout hỏng, v.v. (Bài học từ flow1ScreensRenderSmoke.test.js.)
//
// Kiểm thêm hợp đồng UI quan trọng của Flow 1/2:
//  - AI trả job_draft → hiện card "BẢN NHÁP — CHƯA ĐĂNG" + 2 nút (brief 2.2)
//  - Lượt chat thứ 2 gửi kèm draft_job_id (idempotent — không tạo trùng)
//  - AI trả blackout_action → card khai bận có nút "Xác nhận khai bận" (3.1)
//
// Chạy: npx jest src/__tests__/chatbotFlow12ScreensRenderSmoke.test.js
// ============================================================

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

// ── Mock @react-navigation/native ─────────────────────────────
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  setOptions: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: {} }),
  useNavigation: () => mockNavigation,
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

// react-native-safe-area-context: insets cố định (pattern try/catch vẫn chạy)
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 24, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
}));

// ── Mock @expo/vector-icons (cùng pattern flow1 smoke-test) ──
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

// WebView (ChatLocationPicker native → MapPickerModal) mock cho Jest
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockWebView = React.forwardRef((props, ref) => React.createElement(View, props));
  return { __esModule: true, default: MockWebView, WebView: MockWebView };
}, { virtual: true });

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// ── Mock API tasks + matching ────────────────────────────────
const mockSendChatMessage = jest.fn();
const mockSendWorkerChatMessage = jest.fn();
jest.mock('../api/tasks', () => ({
  sendChatMessage: (...args) => mockSendChatMessage(...args),
  sendWorkerChatMessage: (...args) => mockSendWorkerChatMessage(...args),
  sendHelpCenterMessage: jest.fn(),
}));

const mockPublishJob = jest.fn();
const mockAddBlackout = jest.fn();
jest.mock('../api/matching', () => ({
  publishJob: (...args) => mockPublishJob(...args),
  addBlackout: (...args) => mockAddBlackout(...args),
  getBookings: jest.fn(async () => ({ data: [] })),
  getMatchingCandidates: jest.fn(async () => ({ data: { total_matched: 0, candidates: [] } })),
}));

import ChatbotScreen from '../screens/ChatbotScreen';
import WorkerChatbotScreen from '../screens/Worker/WorkerChatbotScreen';

const DRAFT_RESPONSE = {
  data: {
    response: 'Mình đã lưu bản nháp nhé!',
    type: 'job_draft',
    job_draft: {
      id: 'job-draft-1',
      job_type: 'tutoring',
      title: 'Gia sư Toán lớp 5',
      description: 'Dạy kèm tối thứ 3',
      hourly_rate_vnd: 120000,
      schedule: '19:00 - 21:00 (1 ngày)',
      location_display: 'Quận 1, TP.HCM',
      status: 'draft',
      preview_matched: 3,
    },
  },
};

const LOCATION_CONFIRM_RESPONSE = {
  data: {
    response: 'Bạn xác nhận vị trí trên bản đồ nhé.',
    type: 'location_confirm',
    location_confirm_required: true,
    pending_job_payload: { job_type: 'tutoring', subject: 'Toán' },
  },
};

const BLACKOUT_RESPONSE = {
  data: {
    response: 'Hệ thống sẽ hiện thẻ xác nhận nhé.',
    type: 'blackout_action',
    blackout_action: {
      date: '2026-12-10',
      time_from: null,
      time_to: null,
      reason: 'exam',
      reason_label: 'Thi / kiểm tra',
      note: 'Thi giữa kỳ',
      conflicts_with_booking: false,
    },
  },
};

async function sendText(screen, text) {
  const input = screen.getByPlaceholderText('Nhắn tin cho AI...');
  await act(async () => {
    input.props.onChangeText(text);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('chat-send-btn'));
  });
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSendChatMessage.mockResolvedValue({ data: { response: 'ok', type: 'message' } });
  mockSendWorkerChatMessage.mockResolvedValue({ data: { response: 'ok', type: 'message' } });
  mockPublishJob.mockResolvedValue({ data: { id: 'job-draft-1', status: 'ai_parsed' } });
  mockAddBlackout.mockResolvedValue({ data: { id: 'blk-1', merged: false } });
});

describe('Render smoke-test 2 màn AI Chatbot Flow 1/2 (brief mục 5)', () => {
  test('ChatbotScreen (phụ huynh) mount không ném lỗi + có header đúng', async () => {
    const { getByText, queryByText } = await render(<ChatbotScreen />);
    expect(getByText('AI Trợ lý Educarelink')).toBeTruthy();
    expect(queryByText('BẢN NHÁP — CHƯA ĐĂNG')).toBeNull(); // chưa có card nháp
  });

  test('WorkerChatbotScreen (CarePartner) mount không ném lỗi + có header đúng', async () => {
    const { getByText } = await render(<WorkerChatbotScreen />);
    expect(getByText('AI Trợ lý Carepartner')).toBeTruthy();
  });

  test('AI trả job_draft → hiện card BẢN NHÁP + 2 nút đúng brief 2.2', async () => {
    mockSendChatMessage.mockResolvedValueOnce(DRAFT_RESPONSE);
    const screen = await render(<ChatbotScreen />);
    await sendText(screen, 'đăng việc giúp mình');
    expect(screen.getByText('BẢN NHÁP — CHƯA ĐĂNG')).toBeTruthy();
    expect(screen.getByText('Xem & Chọn CarePartner Ngay')).toBeTruthy();
    expect(screen.getByText('Chỉnh sửa thông tin')).toBeTruthy();
    expect(screen.getByText(/Ước tính 3 CP phù hợp/)).toBeTruthy();
  });

  test('Lượt chat thứ 2 gửi kèm draft_job_id + toạ độ (idempotent — brief 2.2.3)', async () => {
    mockSendChatMessage.mockResolvedValueOnce(DRAFT_RESPONSE);
    const screen = await render(<ChatbotScreen />);
    await sendText(screen, 'đăng việc giúp mình');
    await sendText(screen, 'đổi giá 150k nhé');

    const calls = mockSendChatMessage.mock.calls;
    const firstExtra = calls[0][2];
    const secondExtra = calls[1][2];
    expect(firstExtra.draftJobId).toBeNull();
    expect(secondExtra.draftJobId).toBe('job-draft-1'); // CÙNG bản nháp
    expect(secondExtra.latitude).toBe(DRAFT_RESPONSE.data.job_draft.latitude);
  });

  test('AI trả location_confirm → có nút xác nhận vị trí trên bản đồ (brief 2.4)', async () => {
    mockSendChatMessage.mockResolvedValueOnce(LOCATION_CONFIRM_RESPONSE);
    const screen = await render(<ChatbotScreen />);
    await sendText(screen, 'đăng việc');
    expect(screen.getByText('Xác nhận vị trí trên bản đồ')).toBeTruthy();
  });

  test('AI trả blackout_action → card khai bận + nút xác nhận 1-tap (brief 3.1)', async () => {
    mockSendWorkerChatMessage.mockResolvedValueOnce(BLACKOUT_RESPONSE);
    const screen = await render(<WorkerChatbotScreen />);
    await sendText(screen, 'thứ 5 tới mình bận cả ngày');
    expect(screen.getByText('Xác nhận khai ngày bận')).toBeTruthy();
    expect(screen.getByText('Xác nhận khai bận')).toBeTruthy();
    // Bấm xác nhận → gọi addBlackout với payload đúng từ card
    await act(async () => {
      fireEvent.press(screen.getByText('Xác nhận khai bận'));
    });
    await act(async () => {});
    expect(mockAddBlackout).toHaveBeenCalledTimes(1);
    expect(mockAddBlackout).toHaveBeenCalledWith({
      date: '2026-12-10',
      time_from: null,
      time_to: null,
      reason: 'exam',
      note: 'Thi giữa kỳ',
    });
  });
});
