// ============================================================
// Test "Nhờ AI đăng việc hộ" (luồng ghép cặp mới — 2026-09-27).
//
// ChatbotScreen được nâng cấp:
//   - Server trả data.job (matching.JobPost đã publish) → render Job Card
//     (badge 3 dịch vụ + giá/giờ + radar pulse + CTA "Xem ứng viên đề xuất")
//   - CTA navigate sang CandidatesList (stack ParentHome) với jobId
//
// Đảm bảo:
//   1. Phản hồi KHÔNG có job → chỉ bubble text, không card.
//   2. Phản hồi CÓ job → card hiện + nút CTA gọi đúng navigate
//      'ParentHome' { screen: 'CandidatesList', params: { jobId } }.
//
// Chạy: npx jest src/screens/ChatbotScreen.jobCard.test.js
// ============================================================

import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

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

// ── Mock API — trả dữ liệu điều khiển được từ test ────────────
const mockSendChatMessage = jest.fn();
jest.mock('../../api/tasks', () => ({
  sendChatMessage: (...args) => mockSendChatMessage(...args),
}));

jest.mock('../../components/FormattedText', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ text }) => <Text>{text}</Text>;
});

import ChatbotScreen from '../ChatbotScreen';

const FAKE_JOB = {
  id: '5d2f4a10-9a2b-4c5d-8e6f-1a2b3c4d5e6f',
  job_type: 'tutoring',
  title: 'Gia sư Toán lớp 5 tại Hà Nội',
  hourly_rate_vnd: 120000,
  location_note: '458 Minh Khai, Hai Bà Trưng, Hà Nội',
  schedule: '18:30 - 20:00 (1 buổi)',
  status: 'ai_parsed',
};

const flushEffects = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('ChatbotScreen — AI đăng việc hộ Flow 1', () => {
  beforeEach(() => {
    mockNavigation.navigate.mockClear();
    mockSendChatMessage.mockReset();
  });

  afterEach(() => {
    cleanup(); // RNTL v14 + jest-expo: dọn tree giữa các test — không nhầm element cũ
  });

  it('render welcome bubble khi mới mở', async () => {
    const { getByText } = await render(<ChatbotScreen />);
    await flushEffects();
    expect(getByText(/trợ lý AI của Educarelink/i)).toBeTruthy();
    expect(mockSendChatMessage).not.toHaveBeenCalled();
  });

  it('phản hồi có job → render Job Card + CTA navigate CandidatesList', async () => {
    mockSendChatMessage.mockResolvedValueOnce({
      data: {
        response: '✅ Đã tạo tin đăng thành công!',
        type: 'job_created',
        job: FAKE_JOB,
      },
    });

    const { getByPlaceholderText, getByText, getByTestId } = await render(<ChatbotScreen />);
    await flushEffects();

    fireEvent.changeText(getByPlaceholderText('Nhắn tin cho AI...'), 'Tôi cần gia sư Toán lớp 5');
    // Đợi state flush xong (nút gửi chuyển sang enabled) rồi mới bấm —
    // deterministic, không phụ thuộc tốc độ chạy suite
    await waitFor(() => {
      expect(getByTestId('chatbot-send').props.disabled).toBeFalsy();
    });
    fireEvent.press(getByTestId('chatbot-send'));

    // Chờ card render sau khi API trả về
    await waitFor(() => {
      expect(getByText(FAKE_JOB.title)).toBeTruthy();
    });
    expect(getByText(/GIA SƯ/)).toBeTruthy();
    expect(getByText(/AI đang quét Carepartner/)).toBeTruthy();

    // Bấm CTA → navigate đúng CandidatesList kèm jobId
    fireEvent.press(getByText('Xem ứng viên đề xuất'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ParentHome', {
      screen: 'CandidatesList',
      params: { jobId: FAKE_JOB.id },
    });
  });

});
