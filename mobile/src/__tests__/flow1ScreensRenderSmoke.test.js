// ============================================================
// Render smoke-test cho 12 màn hình Flow 1 (ITEM #2 — B9/B3).
//
// Bug gốc (QA 2026-09-08): AppealScreen dùng useFocusEffect ở dòng 34
// nhưng KHÔNG import — chỉ cần mở màn hình là ném
// "ReferenceError: useFocusEffect is not defined", người dùng không
// bao giờ thấy được form kháng cáo dù route đã nối đúng.
// Bài học: bug kiểu này một render smoke-test rẻ tiền bắt được ngay.
// → File này render TẤT CẢ 12 màn hình Flow 1, đảm bảo không màn
//   hình nào ném lỗi khi mount (loading/empty state là chấp nhận được).
//
// Chạy: npx jest src/__tests__/flow1ScreensRenderSmoke.test.js
// ============================================================

import React from 'react';
import { act, render } from '@testing-library/react-native';

// ── Mock @react-navigation/native ─────────────────────────────
// 12 màn Flow 1 chỉ dùng useRoute / useNavigation / useFocusEffect.
// mockParams/mocFocusCallbacks đọc tại thời điểm render (closure),
// mỗi test tự set lại trước khi render.
let mockParams = {};
let mockFocusCallbacks = [];
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  setOptions: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => mockNavigation,
  // Giữ callback lại để test chủ động "focus" màn hình (giả lập mount effect)
  useFocusEffect: (cb) => { mockFocusCallbacks.push(cb); },
  useIsFocused: () => true,
}));

// ── Mock @expo/vector-icons ───────────────────────────────────
// Ionicons kéo theo chuỗi expo-font → expo-asset (npm không hoist được
// expo-asset trong cây node_modules hiện tại) → trong môi trường jest,
// icon render-thành-null là đủ cho smoke-test (không kiểm tra hình icon).
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

// react-native-maps KHÔNG có trong package.json/node_modules (JobLocationPicker
// require vô điều kiện trên native — đã flag owner là follow-up, ngoài phạm vi PR).
// Với test: mock virtual đủ { default: MapView, Marker } để JobLocationPicker load được.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const MockMapView = React.forwardRef(() => null);
  MockMapView.Marker = React.forwardRef(() => null);
  return { __esModule: true, default: MockMapView, Marker: MockMapView.Marker };
}, { virtual: true });

// AsyncStorage native module không tồn tại trong jest → mock chuẩn theo docs
// (api/client → utils/storage import nó lúc load module).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// ── Mock ../../api/matching ───────────────────────────────────
// Giữ nguyên hằng dữ liệu thật (MATCH_LEVEL_LABELS, CANCEL_REASONS) để UI
// render nội dung thật; thay toàn bộ hàm API bằng promise trả shape tối
// thiểu đúng với điều màn hình trông đợi (array → list, object → detail).
jest.mock('../api/matching', () => {
  const actual = jest.requireActual('../api/matching');
  const mockOk = (data) => jest.fn(() => Promise.resolve({ data }));
  return {
    ...actual,
    createJob: mockOk({ id: 'job-1', status: 'draft' }),
    publishJob: mockOk({ id: 'job-1', status: 'ai_parsing' }),
    getMatchingCandidates: mockOk({ total_matched: 0, candidates: [] }),
    selectCarePartner: mockOk({ id: 'booking-1', status: 'awaiting_commitment' }),
    getBookings: mockOk([]),
    getBookingDetail: mockOk({
      id: 'booking-1', status: 'committed', status_label_vi: 'Đã cam kết',
      job_title: 'Trông trẻ tối thứ 3', carepartner_id: 'cp-1',
      total_value_vnd: 200000, compensation_vnd: 0,
    }),
    cancelBooking: mockOk({}),
    cancelBookingByParent: mockOk({}),
    reportNoShow: mockOk({}),
    startBooking: mockOk({}),
    completeBooking: mockOk({}),
    createAppeal: mockOk({ status: 'pending', status_label_vi: 'Chờ duyệt' }),
    getAppeal: mockOk(null), // chưa có đơn kháng cáo → ẩn card trạng thái
    requestReschedule: mockOk({}),
    respondReschedule: mockOk({}),
    getAvailability: mockOk([]),
    addAvailability: mockOk({}),
    updateAvailability: mockOk({}),
    deleteAvailability: mockOk({}),
    bulkReplaceAvailability: mockOk([]),
    getBlackouts: mockOk([]),
    addBlackout: mockOk({}),
    deleteBlackout: mockOk({}),
    getCreditBalance: mockOk({ credit_vnd: 60000, history: [] }),
    getTrustProfile: mockOk({}),
    getMatchingNotifications: mockOk([]),
    getUnreadCount: mockOk({ count: 0 }),
  };
});

// JobLocationPicker require('expo-location') — chặn an toàn trường hợp
// request quyền/định vị bị gọi trong môi trường test.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 21.0, longitude: 105.8 },
  })),
}));

// ── Import screens SAU khi jest.mock đã khai báo ──────────────
import JobTypeSelectScreen from '../screens/Parent/JobTypeSelectScreen';
import TutoringFormScreen from '../screens/Parent/TutoringForm';
import ChildcareFormScreen from '../screens/Parent/ChildcareForm';
import PickupFormScreen from '../screens/Parent/PickupForm';
import CandidatesListScreen from '../screens/Parent/CandidatesListScreen';
import CandidateProfileV2Screen from '../screens/Parent/CandidateProfileV2Screen';
import BookingDetailScreen from '../screens/Parent/BookingDetailScreen';
import WalletScreen from '../screens/Parent/WalletScreen';
import AvailabilityScreen from '../screens/Worker/AvailabilityScreen';
import BlackoutScreen from '../screens/Worker/BlackoutScreen';
import MyBookingsScreen from '../screens/Worker/MyBookingsScreen';
import AppealScreen from '../screens/Worker/AppealScreen';
import * as matchingApi from '../api/matching';

const APPEAL_BOOKING_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const MOCK_CANDIDATE = {
  carepartner_id: 'cp-1',
  display_name: 'Nguyễn Thị B',
  school: 'ĐH Sư phạm',
  major: 'Giáo dục mầm non',
  match_level: 'high',
  match_level_vi: 'Rất phù hợp',
  match_score: 85,
  rating: 4.8,
  completed_jobs: 12,
  distance_km: 3.2,
  top_skills: ['tre_nho'],
  latest_review: 'Chị ấy rất tâm lý với trẻ.',
};

// (route, screen) — đủ 12 route Flow 1 đã nối trong AppNavigator
const FLOW1_SCREENS = [
  ['JobTypeSelect', JobTypeSelectScreen, {}],
  ['TutoringForm', TutoringFormScreen, {}],
  ['ChildcareForm', ChildcareFormScreen, {}],
  ['PickupForm', PickupFormScreen, {}],
  ['CandidatesList', CandidatesListScreen, { jobId: 'job-1' }],
  ['CandidateProfileV2', CandidateProfileV2Screen, { jobId: 'job-1', candidate: MOCK_CANDIDATE }],
  ['BookingDetail', BookingDetailScreen, { bookingId: 'booking-1' }],
  ['WalletCredits', WalletScreen, {}],
  ['MatchingAvailability', AvailabilityScreen, {}],
  ['Blackout', BlackoutScreen, {}],
  ['MyBookings', MyBookingsScreen, {}],
  ['Appeal', AppealScreen, { bookingId: APPEAL_BOOKING_ID }],
];

async function renderScreen(Screen, params) {
  mockParams = params;
  mockFocusCallbacks = [];
  // RNTL v14: render là async — lỗi mount (như ReferenceError của AppealScreen
  // trước fix) sẽ surfaces ở đây dưới dạng rejected promise.
  return await render(<Screen />);
}

async function fireFocusEffects() {
  const callbacks = [...mockFocusCallbacks];
  await act(async () => {
    callbacks.forEach((cb) => cb());
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Render smoke-test 12 màn hình Flow 1 (ITEM #2)', () => {
  test.each(FLOW1_SCREENS)(
    'route "%s" mount không ném lỗi (kể cả sau focus effect)',
    async (_route, Screen, params) => {
      let tree = null;
      let renderError = null;
      try {
        tree = await renderScreen(Screen, params);
      } catch (err) {
        renderError = err;
      }
      expect(renderError).toBeNull();
      await fireFocusEffects(); // flush promise + useFocusEffect callbacks
      expect(tree.toJSON()).toBeTruthy();
    },
  );

  test('API focus-loader được gọi đúng tham số route (không gọi ngoài mong đợi)', async () => {
    await renderScreen(AppealScreen, { bookingId: APPEAL_BOOKING_ID });
    await fireFocusEffects();
    expect(matchingApi.getAppeal).toHaveBeenCalledWith(APPEAL_BOOKING_ID);
  });
});

describe('AppealScreen — regression B9/B3 (useFocusEffect phải được import)', () => {
  test('render với route param { bookingId } — không ném lỗi, có ô mô tả chi tiết', async () => {
    const { getByPlaceholderText, getByText } = await renderScreen(
      AppealScreen, { bookingId: APPEAL_BOOKING_ID },
    );
    // Trước fix: ReferenceError: useFocusEffect is not defined → render chết
    expect(getByPlaceholderText('Kể lại tình huống cụ thể để admin xem xét...')).toBeTruthy();
    expect(getByText('Gửi kháng cáo')).toBeTruthy();
    await fireFocusEffects();
  });

  test('trên focus: tải đơn kháng cáo hiện có qua getAppeal(bookingId)', async () => {
    const { getByText } = await renderScreen(AppealScreen, { bookingId: APPEAL_BOOKING_ID });
    await fireFocusEffects();
    expect(matchingApi.getAppeal).toHaveBeenCalledTimes(1);
    expect(matchingApi.getAppeal).toHaveBeenCalledWith(APPEAL_BOOKING_ID);
    // Lý do kháng cáo từ CANCEL_REASONS thật phải hiển thị thành danh sách chọn
    expect(getByText('Gửi kháng cáo')).toBeTruthy();
  });
});
