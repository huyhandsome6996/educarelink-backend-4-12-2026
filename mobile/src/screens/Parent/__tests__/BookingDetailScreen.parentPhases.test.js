// ============================================================
// Render test BookingDetailScreen — LUỒNG PHỤ HUYNH (Stitch 2026-09-13).
// Đảm bảo 3 giai đoạn hiển thị đúng theo booking.status:
//   awaiting_commitment → banner amber + countdown + spotlight + escrow hold
//   committed / in_progress → banner emerald + GPS strip + CTA hoàn thành
//   completed → dark banner + prompt đánh giá + biên lai escrow 80/20
// CarePartner view KHÔNG nằm trong phạm vi file này (đã có flow1 smoke test).
//
// Chạy: npx jest src/screens/Parent/__tests__/BookingDetailScreen.parentPhases.test.js
// ============================================================

import React from 'react';
import { act, render } from '@testing-library/react-native';

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

// Phụ huynh đăng nhập (role parent) — quyết định nhánh render
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-parent', role: 'parent' } }),
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
});

jest.setTimeout(20000);

describe('BookingDetailScreen — luồng Phụ huynh 3 giai đoạn (Stitch)', () => {
  test('Giai đoạn 1 awaiting_commitment: banner amber + countdown + spotlight + escrow hold', async () => {
    const { getByText } = await renderDetail(BASE_BOOKING);
    await act(async () => {});
    expect(mockGetBookingDetail).toHaveBeenCalledWith('bk-9');
    // Hero banner amber + đồng hồ lớn
    expect(getByText('Đang chờ sinh viên xác nhận cam kết')).toBeTruthy();
    expect(getByText(/Còn lại: 48 phút 20 giây/)).toBeTruthy();
    // Spotlight bento — hồ sơ sinh viên đã chọn phải hiển thị đầy đủ
    expect(getByText('Nguyễn Thị Thu Huyền')).toBeTruthy();
    expect(getByText('ĐH Sư Phạm Hà Nội · Giáo dục Tiểu học')).toBeTruthy();
    expect(getByText('Đã xác thực CCCD gắn chip')).toBeTruthy();
    expect(getByText('Điểm uy tín: Tin cậy')).toBeTruthy();
    // MoMo Escrow — trạng thái tạm giữ
    expect(getByText('Ký quỹ MoMo Escrow được bảo vệ 100%')).toBeTruthy();
    expect(getByText('Đã tạm giữ an toàn')).toBeTruthy();
    // Bottom dock đúng 2 nút Phase 1
    expect(getByText('Đổi sinh viên')).toBeTruthy();
    expect(getByText('Xem hồ sơ đầy đủ')).toBeTruthy();
  });

  test('Giai đoạn 2 in_progress: banner emerald + GPS strip + SOS hotline + CTA hoàn thành', async () => {
    const booking = { ...BASE_BOOKING, status: 'in_progress', status_label_vi: 'Đang thực hiện' };
    const { getByText } = await renderDetail(booking);
    await act(async () => {});
    expect(getByText('Đang trong ca làm')).toBeTruthy();
    expect(getByText(/Vị trí trực tiếp: Đang bật định vị an toàn/)).toBeTruthy();
    // SOS với hotline 24/7 đúng số
    expect(getByText(/Hotline 24\/7: 0862427404/)).toBeTruthy();
    // Contact strip — SĐT mở khi đã cam kết
    expect(getByText('0912845000')).toBeTruthy();
    // Dock Phase 2: nút gọi + nút hoàn thành
    expect(getByText('Xác nhận hoàn thành ca')).toBeTruthy();
    expect(getByText(/Bấm khi ca làm đã kết thúc và bạn hài lòng/)).toBeTruthy();
  });

  test('Giai đoạn 3 completed: dark banner + nhật ký + prompt đánh giá + biên lai 80/20 + re-book', async () => {
    const booking = {
      ...BASE_BOOKING, status: 'completed', status_label_vi: 'Hoàn thành',
      ended_at: '2026-09-15T13:00:00Z',
    };
    const { getByText } = await renderDetail(booking);
    await act(async () => {});
    expect(getByText('Ca làm đã kết thúc an toàn!')).toBeTruthy();
    expect(getByText(/Đã giải ngân 240.000đ từ MoMo Escrow cho sinh viên/)).toBeTruthy();
    // Biên lai breakdown 80/20
    expect(getByText('Giải ngân cho sinh viên (80%)')).toBeTruthy();
    expect(getByText('Phí nền tảng (20%)')).toBeTruthy();
    expect(getByText('Đã hoàn tất thanh toán')).toBeTruthy();
    // Rating & Review prompt + praise chips
    expect(getByText(/Bạn thấy Nguyễn Thị Thu Huyền hỗ trợ bé như thế nào/)).toBeTruthy();
    expect(getByText('Đúng giờ')).toBeTruthy();
    expect(getByText('Viết đánh giá ngay')).toBeTruthy();
    // Dock Phase 3: re-book hero CTA
    expect(getByText('Đặt lại bạn sinh viên này cho tuần sau')).toBeTruthy();
    // Không dùng jargon ELO
    expect(getByText('Điểm uy tín: Tin cậy')).toBeTruthy();
  });

  test('Đơn hủy: hiển thị trạng thái kết thúc + đền bù (nếu có)', async () => {
    const booking = {
      ...BASE_BOOKING, status: 'no_show', status_label_vi: 'Không đến làm',
      compensation_vnd: 50000, cancelled_at: '2026-09-15T13:00:00Z',
    };
    const { getByText } = await renderDetail(booking);
    await act(async () => {});
    expect(getByText('Không đến làm')).toBeTruthy();
    expect(getByText(/Đã đền bù 50.000đ credit/)).toBeTruthy();
  });
});
