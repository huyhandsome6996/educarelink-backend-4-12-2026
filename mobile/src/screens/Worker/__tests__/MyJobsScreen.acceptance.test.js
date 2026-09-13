// ============================================================
// MyJobsScreen.acceptance.test.js
// Acceptance test cho kiến trúc 4 TAB VÒNG ĐỜI của màn
// "Việc của tôi" CarePartner (Prompt v2 — QA 2026-09-13):
//   1. Mount không crash + gọi đúng API (getBookings + getMyJobsAsWorker)
//   2. Badge số đếm đúng 4 tab theo dữ liệu mock
//   3. Tab 1: countdown từ seconds_left + thông tin phụ huynh + thu nhập
//   4. "Xác nhận cam kết" → commitBooking → card chuyển Tab 2 (Sắp làm)
//   5. commitBooking thất bại → card GIỮ nguyên Tab 1 + Alert lỗi
//   6. route.params initialTab/highlightBookingId → mount đúng tab + highlight
// ============================================================

import React from 'react';
import { Alert } from 'react-native';
import { act, render, fireEvent, within } from '@testing-library/react-native';

// ── Route params cấu hình được cho từng test case ──
let mockRouteParams = {};

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
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

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  // Promise KHÔNG resolve → tránh setState sau khi act đóng (nguyên nhân
  // gây cảnh báo "overlapping act()" và nhiễm chéo giữa các test)
  requestForegroundPermissionsAsync: jest.fn().mockReturnValue(new Promise(() => {})),
  getCurrentPositionAsync: jest.fn().mockReturnValue(new Promise(() => {})),
}));

jest.mock('../../../components/NotificationBell', () => 'NotificationBell');
jest.mock('../../../components/TrackingConsentModal', () => 'TrackingConsentModal');
jest.mock('../../../components/ActiveTrackingBanner', () => 'ActiveTrackingBanner');

jest.mock('../../../services/LocationService', () => ({
  startTracking: jest.fn().mockResolvedValue(true),
  stopTracking: jest.fn().mockResolvedValue(true),
  getCurrentTaskId: jest.fn().mockReturnValue(null),
  hasPendingResumeTask: jest.fn().mockReturnValue(false),
  isTracking: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../api/tracking', () => ({
  checkConsent: jest.fn().mockResolvedValue({ data: { has_consent: false } }),
  grantConsent: jest.fn(),
  triggerSOS: jest.fn(),
  getSOSAlerts: jest.fn().mockResolvedValue({ data: [] }),
  resolveSOS: jest.fn(),
}));

// ── API mocks ──
const mockGetBookings = jest.fn();
const mockCommitBooking = jest.fn();
const mockCancelBooking = jest.fn();
const mockRequestReschedule = jest.fn();

jest.mock('../../../api/matching', () => ({
  getBookings: (...a) => mockGetBookings(...a),
  commitBooking: (...a) => mockCommitBooking(...a),
  cancelBooking: (...a) => mockCancelBooking(...a),
  requestReschedule: (...a) => mockRequestReschedule(...a),
  // Task C (2026-09-14): onboarding gate — mặc định "đã sẵn sàng" để không
  // ảnh hưởng assertion cũ; banner có test riêng phía dưới.
  getOnboardingStatus: jest.fn().mockResolvedValue({
    data: { has_skills: true, has_availability: true, ready_for_matching: true, message_vi: '' },
  }),
  CANCEL_REASONS: [
    { code: 'school_schedule', label: 'Trùng lịch học đột xuất', forceMajeure: true },
    { code: 'health', label: 'Sức khỏe không tốt', forceMajeure: true },
    { code: 'family_emergency', label: 'Việc gia đình khẩn cấp', forceMajeure: true },
    { code: 'accident', label: 'Tai nạn / sự cố di chuyển', forceMajeure: true },
    { code: 'wrong_job_info', label: 'Thông tin công việc không đúng mô tả', forceMajeure: true },
    { code: 'transport', label: 'Không thể di chuyển', forceMajeure: false },
    { code: 'personal', label: 'Lý do cá nhân', forceMajeure: false },
    { code: 'other', label: 'Khác (bắt buộc ghi chú)', forceMajeure: false },
  ],
}));

const mockGetMyJobsAsWorker = jest.fn();
jest.mock('../../../api/tasks', () => ({
  getMyJobsAsWorker: (...a) => mockGetMyJobsAsWorker(...a),
}));

// ── Dữ liệu mock: 1 awaiting + 1 committed + 1 completed + 3 đơn đã kết thúc
//    → badges: 1 / 1 / 1 / 4 (Lịch sử = audit log gồm cả completed) ──
const parentInfo = { full_name: 'Trần Phụ Huynh', phone: '0908123456', is_verified: true, avatar_url: '' };

const bookingAwaiting = {
  id: 'b-await', status: 'awaiting_commitment', status_label_vi: 'Chờ cam kết',
  job_title: 'Gia sư Ngữ văn lớp 4', category_name_vi: 'Gia sư', job_type: 'tutoring',
  job_address: '27 Lê Lợi, TP. Huế',
  location_info: { address: '27 Lê Lợi, TP. Huế', latitude: 16.468, longitude: 107.589 },
  first_slot: { date: '2026-09-15', time_from: '17:00:00', time_to: '19:00:00', date_vi: '15/09/2026' },
  parent_name: 'Trần Phụ Huynh', parent_info: parentInfo,
  total_value_vnd: 300000, carepartner_payout_vnd: 240000, compensation_vnd: 0,
  seconds_left: 610,
};

const bookingCommitted = {
  ...bookingAwaiting,
  id: 'b-comm', status: 'committed', status_label_vi: 'Đã cam kết',
  job_title: 'Trông trẻ bé Bin tối thứ 3',
  seconds_left: 0,
};

const bookingCompleted = {
  ...bookingAwaiting,
  id: 'b-done', status: 'completed', status_label_vi: 'Hoàn thành',
  job_title: 'Gia sư Toán lớp 9 đã xong',
  ended_at: '2026-09-12T11:05:00Z', seconds_left: 0,
};

const bookingCancelledByParent = {
  ...bookingAwaiting,
  id: 'b-cancel', status: 'cancelled_by_parent', status_label_vi: 'Phụ huynh đã hủy',
  job_title: 'Đón trẻ buổi chiều đã hủy',
  cancelled_at: '2026-09-11T04:00:00Z', seconds_left: 0,
};

const bookingDeclined = {
  ...bookingAwaiting,
  id: 'b-decl', status: 'declined_in_window', status_label_vi: 'Bạn đã từ chối nhận ca',
  job_title: 'Trông trẻ cuối tuần (đã từ chối)',
  cancelled_at: '2026-09-10T09:00:00Z', seconds_left: 0,
};

const bookingNoShow = {
  ...bookingAwaiting,
  id: 'b-ns', status: 'no_show', status_label_vi: 'Không đến làm',
  job_title: 'Ca kèm buổi tối no-show',
  compensation_vnd: 50000,
  cancelled_at: '2026-09-09T12:00:00Z', seconds_left: 0,
};

const MOCK_BOOKINGS = [
  bookingAwaiting, bookingCommitted, bookingCompleted,
  bookingCancelledByParent, bookingDeclined, bookingNoShow,
];

import MyJobsScreen from '../MyJobsScreen';

describe('MyJobsScreen — kiến trúc 4 tab vòng đời CarePartner', () => {
  // Fake timers: interval đếm giây không bắn trong test → countdown ổn định,
  // tránh act() chồng nhau do state update từ interval thật.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockRouteParams = {};
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetBookings.mockResolvedValue({ data: { count: MOCK_BOOKINGS.length, results: MOCK_BOOKINGS } });
    mockGetMyJobsAsWorker.mockResolvedValue({ data: [] });
    mockCommitBooking.mockResolvedValue({ data: { ...bookingAwaiting, status: 'committed' } });
    mockCancelBooking.mockResolvedValue({ data: { ...bookingAwaiting, status: 'cancelled_by_carepartner' } });
  });

  afterEach(() => {
    Alert.alert.mockRestore();
    jest.useRealTimers();
  });

  // Drain toàn bộ chuỗi async của fetchJobs trong MỘT act scope duy nhất
  // (render + flush chung scope → không rò rỉ act sang test kế tiếp)
  const setupScreen = async () => {
    let tree;
    await act(async () => {
      tree = render(<MyJobsScreen />);
      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
    });
    return tree;
  };

  const flushEffects = async () => {
    await act(async () => {
      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
    });
  };

  // ── CASE 1: Mount không crash + gọi đúng API ──
  it('mount không crash và gọi đúng getBookings({ role: carepartner }) + getMyJobsAsWorker', async () => {
    const tree = await setupScreen();
    await flushEffects();

    expect(mockGetBookings).toHaveBeenCalledWith({ role: 'carepartner' });
    expect(mockGetMyJobsAsWorker).toHaveBeenCalledTimes(1);
    // Header + 4 tab pill hiển thị đúng thứ tự vòng đời
    expect(tree.getByText('Việc của tôi')).toBeTruthy();
    expect(tree.getByText('Chờ xác nhận')).toBeTruthy();
    expect(tree.getByText('Sắp làm')).toBeTruthy();
    expect(tree.getByText('Đã hoàn thành')).toBeTruthy();
    expect(tree.getByText('Lịch sử')).toBeTruthy();
    tree.unmount();
  });

  // ── CASE 2: Badge số đếm 4 tab theo dữ liệu mock ──
  it('badge số đếm đúng: 1 chờ xác nhận, 1 sắp làm, 1 hoàn thành, 4 mục Lịch sử', async () => {
    const tree = await setupScreen();
    await flushEffects();

    expect(within(tree.getByTestId('tab-badge-awaiting')).getByText('1')).toBeTruthy();
    expect(within(tree.getByTestId('tab-badge-upcoming')).getByText('1')).toBeTruthy();
    expect(within(tree.getByTestId('tab-badge-completed')).getByText('1')).toBeTruthy();
    expect(within(tree.getByTestId('tab-badge-history')).getByText('4')).toBeTruthy();
    tree.unmount();
  });

  // ── CASE 3: Tab 1 countdown + phụ huynh + thu nhập ──
  it('Tab 1 hiển thị countdown từ seconds_left, thông tin phụ huynh và thu nhập ròng', async () => {
    const tree = await setupScreen();
    await flushEffects();

    // 610 giây → "Còn 10 phút 10 giây để xác nhận" (fake timers: Date.now không trôi)
    expect(tree.getByText('Còn 10 phút 10 giây để xác nhận')).toBeTruthy();
    // Thông tin phụ huynh + badge CCCD + escrow
    expect(tree.getByText('Trần Phụ Huynh')).toBeTruthy();
    expect(tree.getByText('CCCD đã xác minh')).toBeTruthy();
    expect(tree.getByText('MoMo Escrow bảo đảm')).toBeTruthy();
    // Thu nhập ròng dự kiến 240.000đ — hiện ở badge giá và dòng gợi ý
    expect(tree.getAllByText('240.000đ').length).toBeGreaterThanOrEqual(1);
    tree.unmount();
  });

  // ── CASE 4: Xác nhận cam kết → commitBooking + card chuyển Tab 2 ──
  it('bấm "Xác nhận cam kết" → gọi commitBooking đúng id, card chuyển sang tab Sắp làm', async () => {
    const tree = await setupScreen();
    await flushEffects();

    await act(async () => {
      fireEvent.press(tree.getByText('Xác nhận cam kết'));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });

    expect(mockCommitBooking).toHaveBeenCalledWith('b-await');
    // Tab active tự đổi sang "Sắp làm" → card vừa cam kết + card committed cũ cùng hiện
    expect(tree.getByText('Gia sư Ngữ văn lớp 4')).toBeTruthy();
    expect(tree.getByText('Trông trẻ bé Bin tối thứ 3')).toBeTruthy();
    // Badge tab Chờ xác nhận về 0 NGAY (cập nhật cục bộ, không đợi refetch)
    expect(within(tree.getByTestId('tab-badge-awaiting')).getByText('0')).toBeTruthy();
    // Không còn countdown xác nhận nào trên màn
    expect(tree.queryByText(/để xác nhận/)).toBeNull();
    tree.unmount();
  });

  // ── CASE 5: commitBooking thất bại → card giữ nguyên Tab 1 + Alert ──
  it('commitBooking reject → card giữ nguyên ở Tab 1, hiển thị thông báo lỗi, không optimistic-update sai', async () => {
    mockCommitBooking.mockRejectedValueOnce({
      response: { data: { detail: 'Đơn đã bị phụ huynh hủy.' } },
    });
    const tree = await setupScreen();
    await flushEffects();

    await act(async () => {
      fireEvent.press(tree.getByText('Xác nhận cam kết'));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });

    expect(mockCommitBooking).toHaveBeenCalledWith('b-await');
    // Alert lỗi tiếng Việt tự nhiên
    expect(Alert.alert).toHaveBeenCalledWith(
      'Không thể xác nhận',
      'Đơn đã bị phụ huynh hủy.',
    );
    // Vẫn đang ở Tab 1: card + countdown vẫn còn, badge không đổi
    expect(tree.getByText('Gia sư Ngữ văn lớp 4')).toBeTruthy();
    expect(tree.getByText('Còn 10 phút 10 giây để xác nhận')).toBeTruthy();
    expect(within(tree.getByTestId('tab-badge-awaiting')).getByText('1')).toBeTruthy();
    tree.unmount();
  });

  // ── CASE 6: Confirmation Jump — initialTab + highlightBookingId ──
  it('route.params initialTab=upcoming + highlightBookingId → mount đúng tab Sắp làm + card được highlight', async () => {
    mockRouteParams = { initialTab: 'upcoming', highlightBookingId: 'b-comm' };
    const tree = await setupScreen();
    await flushEffects();

    // Mount thẳng vào tab Sắp làm: card committed hiển thị kèm highlight
    expect(tree.getByTestId('highlight-card-b-comm')).toBeTruthy();
    expect(tree.getByText('Trông trẻ bé Bin tối thứ 3')).toBeTruthy();
    // Card awaiting KHÔNG hiển thị ở tab này
    expect(tree.queryByText('Gia sư Ngữ văn lớp 4')).toBeNull();
    tree.unmount();
  });

  // ── CASE 6b (bổ trợ): Tab 4 Lịch sử — audit log đầy đủ ──
  it('Tab 4 Lịch sử chứa toàn bộ audit log: hoàn thành, đã hủy, từ chối, no-show kèm bồi thường', async () => {
    const tree = await setupScreen();
    await flushEffects();

    await act(async () => {
      fireEvent.press(tree.getByTestId('tab-history'));
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });

    expect(tree.getByText('Gia sư Toán lớp 9 đã xong')).toBeTruthy();
    expect(tree.getByText('Đón trẻ buổi chiều đã hủy')).toBeTruthy();
    expect(tree.getByText('Trông trẻ cuối tuần (đã từ chối)')).toBeTruthy();
    expect(tree.getByText('Ca kèm buổi tối no-show')).toBeTruthy();
    // Bồi thường hiển thị với giá trị từ backend
    expect(tree.getByText('+50.000đ')).toBeTruthy();
    tree.unmount();
  });
});
