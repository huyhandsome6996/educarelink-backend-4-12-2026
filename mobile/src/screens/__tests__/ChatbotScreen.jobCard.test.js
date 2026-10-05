// ============================================================
// Test "Nhờ AI đăng việc hộ" (luồng ghép cặp mới — 2026-09-27).
//
// ChatbotScreen được nâng cấp:
//   - Server trả data.job (matching.JobPost đã publish) → render Job Card
//     (badge 3 dịch vụ + giá/giờ + radar pulse + CTA "Xem ứng viên đề xuất")
//   - CTA navigate sang CandidatesList (stack ParentHome) với jobId
//   - chatbot-fix-3: radar theo total_matched + candidates_preview (top 3);
//     publish-fail (ai_failed/needs_admin_review) → biến thể cảnh báo vàng,
//     CTA duy nhất "Việc của tôi"; catch đọc message lỗi thân thiện backend.
//
// Đảm bảo:
//   1. Phản hồi KHÔNG có job → chỉ bubble text, không card.
//   2. Phản hồi CÓ job → card hiện + nút CTA gọi đúng navigate
//      'ParentHome' { screen: 'CandidatesList', params: { jobId } }.
//   3. total_matched + candidates_preview → radar số + dòng preview.
//   4. job.status !== 'ai_parsed' → KHÔNG CTA ứng viên, có status_label_vi.
//   5. type 'clarification' → không card.
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

// Gửi 1 tin nhắn qua composer — dùng chung cho các case
const sendViaComposer = async ({ getByPlaceholderText, getByTestId }) => {
  fireEvent.changeText(getByPlaceholderText('Nhắn tin cho AI...'), 'Tôi cần gia sư Toán lớp 5');
  await waitFor(() => {
    expect(getByTestId('chatbot-send').props.disabled).toBeFalsy();
  });
  fireEvent.press(getByTestId('chatbot-send'));
};

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

    await sendViaComposer({ getByPlaceholderText, getByTestId });

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

  it('ai_parsed + total_matched 12 + preview 2 ứng viên → radar số + 2 dòng preview', async () => {
    mockSendChatMessage.mockResolvedValueOnce({
      data: {
        response: '✅ Đã tạo tin đăng!',
        type: 'job_created',
        job: {
          ...FAKE_JOB,
          total_matched: 12,
          candidates_preview: [
            { display_name: 'Nguyễn Thu Hà', school: 'ĐH Sư Phạm', rating: 4.9, distance_km: 2.1, match_score: 96 },
            { display_name: 'Trần Minh Anh', school: 'ĐH Ngoại Thương', rating: 4.7, distance_km: 5.4, match_score: 91 },
          ],
        },
      },
    });

    const { getByPlaceholderText, getByText, getByTestId, queryByText } = await render(<ChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });

    // Radar dùng total_matched thay vì text quét mù
    await waitFor(() => {
      expect(getByText('🎉 AI đã quét thấy 12 CarePartner phù hợp!')).toBeTruthy();
    });
    // 2 dòng preview đúng format "tên · trường · ★rating · khoảng cách"
    expect(getByText('• Nguyễn Thu Hà · ĐH Sư Phạm · ★4.9 · 2.1km')).toBeTruthy();
    expect(getByText('• Trần Minh Anh · ĐH Ngoại Thương · ★4.7 · 5.4km')).toBeTruthy();
    // ai_parsed vẫn giữ CTA ứng viên
    expect(queryByText('Xem ứng viên đề xuất')).toBeTruthy();
  });

  it("job.status 'ai_failed' → KHÔNG CTA ứng viên + có status_label_vi + CTA Việc của tôi", async () => {
    mockSendChatMessage.mockResolvedValueOnce({
      data: {
        response: 'Đã ghi nhận nhu cầu của bạn!',
        type: 'job_created',
        job: {
          ...FAKE_JOB,
          status: 'ai_failed',
          status_label_vi: 'AI chưa đọc được tin đăng',
        },
      },
    });

    const { getByPlaceholderText, getByText, getByTestId, queryByText } = await render(<ChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });

    await waitFor(() => {
      expect(getByText(FAKE_JOB.title)).toBeTruthy();
    });
    // Có nhãn trạng thái + hướng dẫn xử lý lại — KHÔNG radar/CTA ứng viên
    expect(getByText('AI chưa đọc được tin đăng')).toBeTruthy();
    expect(getByText(/Đang xử lý lại tin đăng — theo dõi trong mục Việc của tôi/)).toBeTruthy();
    expect(queryByText('Xem ứng viên đề xuất')).toBeNull();
    expect(queryByText(/AI đang quét Carepartner/)).toBeNull();

    // CTA duy nhất → điều hướng Việc của tôi (tab 'MyTasks' → 'MyTasksMain')
    fireEvent.press(getByText('Xem trong Việc của tôi'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MyTasks', { screen: 'MyTasksMain' });
  });

  it("response type 'clarification' → chỉ bubble text, KHÔNG card", async () => {
    mockSendChatMessage.mockResolvedValueOnce({
      data: {
        response: 'Bạn muốn gia sư môn gì và học buổi nào ạ?',
        type: 'clarification',
      },
    });

    const { getByPlaceholderText, getByText, getByTestId, queryByText } = await render(<ChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });

    await waitFor(() => {
      expect(getByText('Bạn muốn gia sư môn gì và học buổi nào ạ?')).toBeTruthy();
    });
    expect(queryByText(/GIA SƯ/)).toBeNull();
    expect(queryByText('Xem ứng viên đề xuất')).toBeNull();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  it('lỗi HTTP (503 quota) → hiện message thân thiện backend thay vì chuỗi mạng chung', async () => {
    mockSendChatMessage.mockRejectedValueOnce({
      response: { status: 503, data: { response: '🤖 AI đang quá tải, thử lại sau ít phút nhé!' } },
    });

    const { getByPlaceholderText, getByText, getByTestId, queryByText } = await render(<ChatbotScreen />);
    await flushEffects();

    await sendViaComposer({ getByPlaceholderText, getByTestId });

    await waitFor(() => {
      expect(getByText('🤖 AI đang quá tải, thử lại sau ít phút nhé!')).toBeTruthy();
    });
    expect(queryByText(/Lỗi kết nối/)).toBeNull();
  });

});
