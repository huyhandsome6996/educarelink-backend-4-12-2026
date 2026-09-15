// ============================================================
// Test Care Diary trên BookingDetailScreen cho CAREPARTNER
// (2026-09-15 — Fix parity: worker luồng matching mới (Flow 1)
// trước đây KHÔNG có nút ghi nhật ký — chỉ việc legacy ở MyJobsScreen
// mới có. Backend chấm diary theo task (Task mirror của booking) nên
// worker Flow 1 hoàn toàn ghi được — thiếu chỉ là UI entry.)
//
// Đảm bảo:
//   1. Worker + booking in_progress CÓ task_id → nút "Ghi nhật ký chăm
//      sóc bé" → navigate('CareDiaryForm', { taskId, taskTitle }).
//   2. Worker + booking completed CÓ task_id → nút "Ghi / Sửa nhật ký
//      chăm sóc bé" → navigate('CareDiaryForm').
//   3. Phụ huynh + booking completed CÓ task_id → giữ nguyên nút
//      "Xem nhật ký chăm sóc bé" → navigate('CareDiaryDetail').
//   4. Không có task_id → không render nút diary (tránh navigate 404).
//
// Chạy: npx jest src/screens/Parent/__tests__/BookingDetailScreen.workerDiary.test.js
// ============================================================

import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: jest.fn(),
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
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

// Role đăng nhập — đổi giữa worker / parent qua helper setAuthUser
let mockAuthUser = { id: 'u-worker', role: 'worker' };
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

const mockGetBookingDetail = jest.fn();
jest.mock('../../../api/matching', () => ({
  getBookingDetail: (...a) => mockGetBookingDetail(...a),
  cancelBooking: jest.fn(),
  cancelBookingByParent: jest.fn(),
  reportNoShow: jest.fn(),
  startBooking: jest.fn(),
  completeBooking: jest.fn(),
  respondReschedule: jest.fn(),
  commitBooking: jest.fn(),
  CANCEL_REASONS: [
    { code: 'school_schedule', label: 'Trùng lịch học đột xuất', forceMajeure: true },
  ],
}));

let mockParams = { bookingId: 'bk-9' };

import BookingDetailScreen from '../BookingDetailScreen';

// Booking mẫu đủ field như _booking_dict của backend
const BASE_BOOKING = {
  id: 'bk-9-abc123', job_id: 'job-9', job_title: 'Gia sư Tiếng Anh giao tiếp lớp 3',
  status: 'awaiting_commitment', status_label_vi: 'Chờ cam kết',
  seconds_left: 48 * 60 + 20, total_value_vnd: 300000,
  carepartner_id: 'cp-9', carepartner_payout_vnd: 240000,
  task_id: '889',
  carepartner_info: {
    full_name: 'Nguyễn Thị Thu Huyền', phone: '0912845000', avatar_url: '',
    is_verified: true, school: 'ĐH Sư Phạm Hà Nội', major: 'Giáo dục Tiểu học',
    rating_avg: 4.9, jobs_completed: 38, trust_band_vi: 'Tin cậy',
  },
  first_slot: { date: '2026-09-19', date_vi: '19/09/2026', day_of_week_vi: 'Thứ Sáu',
    time_from: '18:00', time_to: '20:00' },
  job_address: 'Vinhomes Smart City, Nam Từ Liêm, Hà Nội',
  child_info: { age_group: '6-11', number_of_children: 1, notes: '' },
};

async function renderDetail(booking) {
  mockGetBookingDetail.mockResolvedValue({ data: booking });
  return await render(<BookingDetailScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { bookingId: 'bk-9' };
  mockAuthUser = { id: 'u-worker', role: 'worker' };
});

jest.setTimeout(20000);

describe('BookingDetailScreen — Care Diary phía CarePartner (Flow 1)', () => {
  test('Worker + in_progress có task_id → nút "Ghi nhật ký chăm sóc bé" → CareDiaryForm', async () => {
    const booking = { ...BASE_BOOKING, status: 'in_progress', status_label_vi: 'Đang thực hiện' };
    const { getByLabelText } = await renderDetail(booking);
    await act(async () => {});
    const btn = getByLabelText('Ghi / Sửa nhật ký chăm sóc bé');
    expect(btn).toBeTruthy();
    fireEvent.press(btn);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CareDiaryForm', {
      taskId: '889',
      taskTitle: 'Gia sư Tiếng Anh giao tiếp lớp 3',
    });
  });

  test('Worker + completed có task_id → nút "Ghi / Sửa nhật ký chăm sóc bé" → CareDiaryForm', async () => {
    const booking = { ...BASE_BOOKING, status: 'completed', status_label_vi: 'Hoàn thành' };
    const { getByLabelText } = await renderDetail(booking);
    await act(async () => {});
    const btn = getByLabelText('Ghi / Sửa nhật ký chăm sóc bé');
    expect(btn).toBeTruthy();
    fireEvent.press(btn);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CareDiaryForm', {
      taskId: '889',
      taskTitle: 'Gia sư Tiếng Anh giao tiếp lớp 3',
    });
  });

  test('Parent + completed có task_id → giữ nút "Xem nhật ký chăm sóc bé" → CareDiaryDetail', async () => {
    mockAuthUser = { id: 'u-parent', role: 'parent' };
    const booking = { ...BASE_BOOKING, status: 'completed', status_label_vi: 'Hoàn thành' };
    const { getByLabelText, queryByLabelText } = await renderDetail(booking);
    await act(async () => {});
    expect(queryByLabelText('Ghi / Sửa nhật ký chăm sóc bé')).toBeNull();
    const btn = getByLabelText('Xem nhật ký chăm sóc bé');
    fireEvent.press(btn);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('CareDiaryDetail', { taskId: '889' });
  });

  test('Booking KHÔNG task_id → không render nút diary (tránh navigate 404)', async () => {
    const booking = { ...BASE_BOOKING, status: 'in_progress', status_label_vi: 'Đang thực hiện', task_id: null };
    const { queryByLabelText } = await renderDetail(booking);
    await act(async () => {});
    expect(queryByLabelText('Ghi / Sửa nhật ký chăm sóc bé')).toBeNull();
  });
});
