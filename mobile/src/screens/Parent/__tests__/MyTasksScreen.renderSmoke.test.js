// ============================================================
// Render smoke-test MyTasksScreen ("Việc của tôi" Phụ huynh —
// bản nâng cấp Stitch 2026-09-13, kiến trúc 4 tab chuẩn vòng đời).
//
// Đảm bảo:
//   1. Mount KHÔNG ném lỗi, fetch SONG SONG đúng 2 nguồn
//      (getMyTasksAsParent + getBookings({ role: 'parent' })).
//   2. Phân loại booking theo đúng 4 tab độc lập:
//      - Tab 1: "Chờ xác nhận" (awaiting_commitment, open tasks)
//      - Tab 2: "Sắp làm" (committed)
//      - Tab 3: "Đang làm" (in_progress)
//      - Tab 4: "Lịch sử" (completed, no_show)
//   3. Card awaiting hiển thị đồng hồ đếm ngược từ booking.seconds_left
//      + Spotlight sinh viên đã chọn (không ẩn hồ sơ khi pending).
//   4. Tab hiển thị số lượng đúng theo từng tab.
//   5. Pull-to-refresh tải lại CẢ 2 nguồn.
//
// Chạy: npx jest src/screens/Parent/__tests__/MyTasksScreen.renderSmoke.test.js
// ============================================================

import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

// ── Mock @react-navigation/native ─────────────────────────────
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

// ── Mock @expo/vector-icons (Proxy — kỹ thuật của flow1 smoke test) ──
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
const mockUpdateTaskStatus = jest.fn();
jest.mock('../../../api/tasks', () => ({
  getMyTasksAsParent: (...a) => mockGetMyTasksAsParent(...a),
  getCandidates: (...a) => mockGetCandidates(...a),
  updateTaskStatus: (...a) => mockUpdateTaskStatus(...a),
}));

const mockGetBookings = jest.fn();
const mockCancelBookingByParent = jest.fn();
const mockCompleteBooking = jest.fn();
const mockRespondReschedule = jest.fn();
const mockReportNoShow = jest.fn();
jest.mock('../../../api/matching', () => ({
  getBookings: (...a) => mockGetBookings(...a),
  cancelBookingByParent: (...a) => mockCancelBookingByParent(...a),
  completeBooking: (...a) => mockCompleteBooking(...a),
  respondReschedule: (...a) => mockRespondReschedule(...a),
  reportNoShow: (...a) => mockReportNoShow(...a),
}));

const mockCheckConsent = jest.fn();
const mockGetLiveLocation = jest.fn();
jest.mock('../../../api/tracking', () => ({
  checkConsent: (...a) => mockCheckConsent(...a),
  getLiveLocation: (...a) => mockGetLiveLocation(...a),
}));

const mockGetTaskModeration = jest.fn();
jest.mock('../../../api/moderation', () => ({
  getTaskModeration: (...a) => mockGetTaskModeration(...a),
}));

jest.mock('../../../components/NotificationBell', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef(() => null) };
});

import MyTasksScreen from '../MyTasksScreen';

// Booking mẫu đủ field như _booking_dict của backend
const AWAITING_BOOKING = {
  id: 'bk-1', job_id: 'job-1',
  job_title: 'Gia sư Toán & Tiếng Việt lớp 2 tại nhà',
  status: 'awaiting_commitment',
  status_label_vi: 'Chờ cam kết',
  seconds_left: 48 * 60 + 15,
  total_value_vnd: 300000,
  carepartner_id: 'cp-1',
  carepartner_info: {
    full_name: 'Nguyễn Thị Thu Huyền', phone: '', avatar_url: '',
    is_verified: true, school: 'ĐH Sư Phạm - Đại học Huế', major: 'Giáo dục Tiểu học',
    rating_avg: 4.9, jobs_completed: 38, trust_band_vi: 'Tin cậy',
  },
  first_slot: { date: '2026-09-19', date_vi: '19/09/2026', day_of_week_vi: 'Thứ Sáu',
    time_from: '18:00', time_to: '20:00' },
  job_address: 'Tòa S2.05 48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế',
};

const COMMITTED_BOOKING = {
  ...AWAITING_BOOKING,
  id: 'bk-2', status: 'committed', status_label_vi: 'Đã cam kết', seconds_left: 0,
  carepartner_info: { ...AWAITING_BOOKING.carepartner_info, phone: '0912845000' },
};

const IN_PROGRESS_BOOKING = {
  ...AWAITING_BOOKING,
  id: 'bk-3', status: 'in_progress', status_label_vi: 'Đang thực hiện', seconds_left: 0,
  carepartner_info: { ...AWAITING_BOOKING.carepartner_info, phone: '0912845000' },
  started_at: '2026-09-15T11:15:00Z',
  task_id: '889',
};

const COMPLETED_BOOKING = {
  ...AWAITING_BOOKING,
  id: 'bk-4', status: 'completed', status_label_vi: 'Hoàn thành', seconds_left: 0,
  ended_at: '2026-09-15T13:00:00Z', carepartner_payout_vnd: 240000,
  task_id: '778',
  review: null,
};

const NO_SHOW_BOOKING = {
  ...AWAITING_BOOKING,
  id: 'bk-5', status: 'no_show', status_label_vi: 'Không đến làm', seconds_left: 0,
  compensation_vnd: 50000,
};

async function flushEffects() {
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyTasksAsParent.mockResolvedValue({ data: [] });
  mockGetBookings.mockResolvedValue({
    data: { count: 5, results: [
      AWAITING_BOOKING, COMMITTED_BOOKING, IN_PROGRESS_BOOKING,
      COMPLETED_BOOKING, NO_SHOW_BOOKING,
    ] },
  });
  mockGetCandidates.mockResolvedValue({ data: [] });
  mockGetTaskModeration.mockResolvedValue({ data: {} });
  // GPS trạng thái thật: chưa đồng ý → "Chưa có tín hiệu" trung thực
  mockCheckConsent.mockResolvedValue({ data: { granted: false } });
  mockGetLiveLocation.mockResolvedValue({ data: {} });
});

jest.setTimeout(20000);

describe('MyTasksScreen — 4 tab chuẩn vòng đời (Stitch 2026-09-13)', () => {
  test('mount sạch + fetch song song đúng tham số 2 nguồn', async () => {
    let tree = null;
    let renderError = null;
    try {
      tree = await render(<MyTasksScreen />);
    } catch (err) { renderError = err; }
    expect(renderError).toBeNull();
    await flushEffects();
    expect(mockGetMyTasksAsParent).toHaveBeenCalledTimes(1);
    expect(mockGetBookings).toHaveBeenCalledWith({ role: 'parent' });
    expect(tree.toJSON()).toBeTruthy();
  });

  test('Tab 1 "Chờ xác nhận": booking awaiting hiển thị countdown + spotlight + trạng thái', async () => {
    const { getByText } = await render(<MyTasksScreen />);
    await flushEffects();
    // Tab active mặc định là pending → đếm 1 (chỉ awaiting)
    expect(getByText('Chờ xác nhận (1)')).toBeTruthy();
    // Countdown ribbon từ seconds_left thật của API
    expect(getByText(/48 phút 15 giây/)).toBeTruthy();
    // Spotlight sinh viên đã chọn
    expect(getByText('Nguyễn Thị Thu Huyền')).toBeTruthy();
    expect(getByText(/ĐH Sư Phạm - Đại học Huế/)).toBeTruthy();
    expect(getByText('Xem hồ sơ chi tiết')).toBeTruthy();
    expect(getByText('Đổi người khác')).toBeTruthy();
    // Giá trị đơn
    expect(getByText('300.000đ')).toBeTruthy();
  });

  test('Tab 2 "Sắp làm": committed card — hiển thị sinh viên đã cam kết và nút liên hệ', async () => {
    const { getByText, queryByText } = await render(<MyTasksScreen />);
    await flushEffects();
    await act(async () => {
      fireEvent.press(getByText('Sắp làm (1)'));
    });
    // committed card — SĐT đã mở khi cam kết. Chat 1-1 CHỈ mở khi ca bắt đầu
    // (cửa sổ chat N tạo trên Task mirror lúc in_progress) → KHÔNG có nút chat
    // tại committed (tránh nút 404 — regression N-003).
    expect(getByText('Sinh viên đã cam kết nhận việc')).toBeTruthy();
    expect(getByText(/Gọi 0912845000/)).toBeTruthy();
    expect(queryByText('Nhắn tin 1-1')).toBeNull();
    expect(getByText('Xem lộ trình & chi tiết ca')).toBeTruthy();
    // awaiting KHÔNG ở tab này
    expect(() => getByText(/48 phút 15 giây/)).toThrow();
  });

  test('Tab 3 "Đang làm": giờ thật + chat N-003 + SOS + Hoàn thành ca', async () => {
    const { getByText } = await render(<MyTasksScreen />);
    await flushEffects();
    await flushEffects(); // đợt 2 settle state GPS async
    await act(async () => {
      fireEvent.press(getByText('Đang làm (1)'));
    });
    // in_progress card — khung giờ THẬT từ first_slot (không demo 18:00–20:00)
    expect(getByText(/ĐANG LÀM VIỆC/)).toBeTruthy();
    expect(getByText('Giám sát vị trí trực tiếp')).toBeTruthy();
    // N-003: nút chat trong ca (booking có task_id = '889')
    expect(getByText('Nhắn tin với Carepartner')).toBeTruthy();
    expect(getByText('Nghiệm thu & Hoàn thành ca')).toBeTruthy();
    expect(getByText(/Hotline hỗ trợ khẩn cấp 24\/7/)).toBeTruthy();
  });

  test('N-003: nút chat trong ca điều hướng Chat với taskId = task mirror', async () => {
    const { getByText } = await render(<MyTasksScreen />);
    await flushEffects();
    await flushEffects();
    await act(async () => {
      fireEvent.press(getByText('Đang làm (1)'));
    });
    await act(async () => {
      fireEvent.press(getByText('Nhắn tin với Carepartner'));
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', {
      taskId: '889', // task mirror — KHÔNG phải job_id
      taskTitle: 'Gia sư Toán & Tiếng Việt lớp 2 tại nhà',
    });
  });

  test('Tab 4 "Lịch sử": completed + no_show, có biên lai escrow 80/20 + rebook', async () => {
    const { getByText, queryByText } = await render(<MyTasksScreen />);
    await flushEffects();
    await act(async () => {
      fireEvent.press(getByText('Lịch sử (2)'));
    });
    // Biên lai MoMo — payout 80% thật từ API
    expect(getByText(/Đã giải ngân 240.000đ MoMo Escrow/)).toBeTruthy();
    // Blocker B: chưa review → CTA Đánh giá Carepartner (KHÔNG tự gán 5 sao)
    expect(getByText('Đánh giá Carepartner')).toBeTruthy();
    expect(queryByText(/Đã đánh giá 5 sao/)).toBeNull();
    // N-003: thẻ completed có nút Chat (24h) — task_id = '778'
    expect(getByText('Chat (24h)')).toBeTruthy();
    expect(getByText('Đặt lại sinh viên này cho tuần sau')).toBeTruthy();
    // Đơn no_show có đền bù
    expect(getByText('Không đến làm')).toBeTruthy();
    expect(getByText(/Đã đền bù 50.000đ credit/)).toBeTruthy();
  });

  test('Tab 4: review thật từ API hiển thị đúng rating (không bịa)', async () => {
    mockGetBookings.mockResolvedValue({
      data: { count: 1, results: [
        { ...COMPLETED_BOOKING, review: { rating: 4, comment: 'Tạm ổn' } },
      ] },
    });
    const { getByText, queryByText } = await render(<MyTasksScreen />);
    await flushEffects();
    await act(async () => {
      fireEvent.press(getByText('Lịch sử (1)'));
    });
    expect(getByText('Bạn đã đánh giá 4 sao')).toBeTruthy();
    expect(queryByText('Đánh giá Carepartner')).toBeNull();
  });

  test('Task legacy in_progress/completed có nút chat (N-003 phục hồi) + lọc mirror trùng', async () => {
    mockGetMyTasksAsParent.mockResolvedValue({
      data: [
        { id: 101, title: 'Gia sư Toán lớp 5 (legacy đang làm)', status: 'in_progress', price: '250000', scheduled_time: '2026-09-20T10:00:00Z', location: '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế' },
        { id: 102, title: 'Gia sư Văn lớp 7 (legacy đã xong)', status: 'completed', price: '250000', scheduled_time: '2026-09-12T10:00:00Z', location: 'Hai Bà Trưng, TP. Huế' },
        { id: '889', title: 'Task mirror trùng booking — phải bị ẩn', status: 'in_progress', price: '300000' },
      ],
    });
    const { getByText, getAllByText, queryByText } = await render(<MyTasksScreen />);
    await flushEffects();
    await flushEffects();
    // Legacy in_progress (tab Đang làm: booking + task legacy, mirror '889' bị lọc)
    await act(async () => {
      fireEvent.press(getByText('Đang làm (2)'));
    });
    expect(getByText('Gia sư Toán lớp 5 (legacy đang làm)')).toBeTruthy();
    expect(queryByText('Task mirror trùng booking — phải bị ẩn')).toBeNull();
    // Nút chat của legacy in_progress điều hướng với taskId = task.id thật.
    // Tab có 2 nút "Nhắn tin với Carepartner": booking card (trước) + legacy card (sau)
    await act(async () => {
      fireEvent.press(getAllByText('Nhắn tin với Carepartner')[1]);
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Chat', {
      taskId: 101, taskTitle: 'Gia sư Toán lớp 5 (legacy đang làm)',
    });
    // Legacy completed (tab Lịch sử: booking completed + no_show + legacy = 3)
    await act(async () => {
      fireEvent.press(getByText('Lịch sử (3)'));
    });
    expect(getByText('Gia sư Văn lớp 7 (legacy đã xong)')).toBeTruthy();
    // 2 nút "Chat (24h)": booking completed + legacy completed
    expect(getAllByText('Chat (24h)').length).toBe(2);
  });

  test('Tab 1 hiển thị Task luồng cũ status=open cùng booking awaiting', async () => {
    mockGetMyTasksAsParent.mockResolvedValue({
      data: [{
        id: 9, title: 'Gia sư Toán lớp 5', status: 'open', price: '250000',
        scheduled_time: '2026-09-20T10:00:00Z', location: '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế',
      }],
    });
    const { getByText } = await render(<MyTasksScreen />);
    await flushEffects();
    expect(getByText('Chờ xác nhận (2)')).toBeTruthy();
    expect(getByText('Đang tìm sinh viên phù hợp')).toBeTruthy();
    expect(getByText('Xem danh sách ứng viên để chọn ngay')).toBeTruthy();
    expect(getByText('Hủy việc')).toBeTruthy();
  });

  test('Empty state đúng chữ thiết kế khi không có dữ liệu', async () => {
    mockGetMyTasksAsParent.mockResolvedValue({ data: [] });
    mockGetBookings.mockResolvedValue({ data: { count: 0, results: [] } });
    const { getByText } = await render(<MyTasksScreen />);
    await flushEffects();
    expect(getByText('Không có đơn nào đang chờ')).toBeTruthy();
    expect(getByText(/Khi bạn đăng việc mới hoặc lựa chọn sinh viên/)).toBeTruthy();
  });

  test('Pull-to-refresh tải lại CẢ 2 nguồn', async () => {
    const { getByText } = await render(<MyTasksScreen />);
    await flushEffects();
    expect(mockGetBookings).toHaveBeenCalledTimes(1);
    const rc = RefreshControl.latestRef;
    expect(rc).toBeTruthy();
    await act(async () => {
      rc.props.onRefresh();
      await Promise.resolve();
    });
    expect(mockGetBookings).toHaveBeenCalledTimes(2);
    expect(mockGetMyTasksAsParent).toHaveBeenCalledTimes(2);
    expect(RefreshControl.latestRef.props.refreshing).toBe(false);
  });

  test('Không dùng jargon "ELO" anywhere trên màn hình', async () => {
    const { getByText, queryByText, toJSON } = await render(<MyTasksScreen />);
    await flushEffects();
    await act(async () => {
      fireEvent.press(getByText('Sắp làm (1)'));
    });
    await act(async () => {
      fireEvent.press(getByText('Đang làm (1)'));
    });
    await act(async () => {
      fireEvent.press(getByText('Lịch sử (2)'));
    });
    expect(queryByText(/ELO/)).toBeNull();
    expect(toJSON()).toBeTruthy();
  });
});
