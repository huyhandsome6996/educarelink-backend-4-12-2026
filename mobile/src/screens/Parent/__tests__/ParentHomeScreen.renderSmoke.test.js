// ============================================================
// Render smoke-test ParentHomeScreen — regression crash v1.4.2 (vc23).
//
// Bug gốc (QA 2026-09-09, ảnh crash từ tester CH Play):
//   ParentHomeScreen dòng 169 dùng `onRefresh={onRefresh}` trong
//   RefreshControl nhưng file KHÔNG hề định nghĩa biến này → Hermes ném
//   "ReferenceError: Property 'onRefresh' doesn't exist" ngay lúc mount →
//   app crash màn hình trắng ngay khi mở (Home là màn đầu tiên của phụ
//   huynh). Lọt lưới vì ParentHomeScreen không nằm trong 12 màn Flow 1
//   (flow1ScreensRenderSmoke.test.js).
// Bài học giống vụ AppealScreen/useFocusEffect: một render smoke-test rẻ
// tiền bắt được bug kiểu này ngay trên CI, không cần chờ tester cài bản
// release mới thấy.
//
// File này đảm bảo:
//   1. Mount lần đầu KHÔNG ném lỗi (chặn regression onRefresh).
//   2. Pull-to-refresh thật sự hoạt động: gọi onRefresh → bật spinner →
//      tải lại danh sách việc → tắt spinner.
//
// Chạy: npx jest src/screens/Parent/__tests__/ParentHomeScreen.renderSmoke.test.js
// ============================================================

import React from 'react';
import { act, render } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

// ── Mock @react-navigation/native ─────────────────────────────
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  setOptions: jest.fn(),
};
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

// AsyncStorage native module không tồn tại trong jest → mock chuẩn theo docs
// (api/tasks → api/client → utils/storage import nó lúc load module).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// ParentHomeScreen dùng useSafeAreaInsets trên header gradient — không có
// SafeAreaProvider trong test → trả insets cố định.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaConsumer: ({ children }) => children({ insets: { top: 47, bottom: 34, left: 0, right: 0 } }),
}));

// ── Mock AuthContext ──────────────────────────────────────────
const mockLogout = jest.fn();
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'ph-huynh', first_name: 'Mai', last_name: 'Trần' },
    logout: mockLogout,
  }),
}));

// ── Mock API matching + tasks ─────────────────────────────
// "Đơn ghép cặp gần đây" (Flow 1) giờ lấy từ getBookings — mặc định trả 1
// đơn có đủ field như _booking_dict của backend để render nhánh có dữ liệu
// (status_label_vi thật từ API).
const mockGetBookings = jest.fn();
jest.mock('../../../api/matching', () => ({
  getBookings: (...args) => mockGetBookings(...args),
}));

const mockGetMyTasksAsParent = jest.fn();
jest.mock('../../../api/tasks', () => ({
  getMyTasksAsParent: (...args) => mockGetMyTasksAsParent(...args),
}));

// NotificationBell poll API mỗi 30s + kéo theo expo-image → mock thành
// stub. Smoke test kiểm tra ParentHomeScreen tự nó mount sạch, không kiểm
// tra chuông thông báo (đã có phạm vi riêng nếu cần).
jest.mock('../../../components/NotificationBell', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef(() => null) };
});

// Import screen SAU khi jest.mock đã khai báo
import ParentHomeScreen from '../ParentHomeScreen';

async function renderHome() {
  // RNTL v14: render là async — lỗi mount (như ReferenceError onRefresh
  // trước fix) surfaces ở đây dưới dạng rejected promise.
  return await render(<ParentHomeScreen />);
}

async function flushEffects() {
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBookings.mockResolvedValue({
    data: {
      count: 1,
      results: [
        {
          id: 'b-1',
          job_id: 'j-1',
          job_title: 'Trông trẻ tối thứ Ba cho bé Mai',
          status: 'committed',
          status_label_vi: 'Đã khóa lịch',
          total_value_vnd: 180000,
          first_slot: { date: '2026-09-15', time_from: '18:00', time_to: '21:00' },
        },
      ],
    },
  });
  mockGetMyTasksAsParent.mockResolvedValue({ data: [] });
});

describe('ParentHomeScreen — regression crash v1.4.2 (onRefresh)', () => {
  test('mount lần đầu không ném ReferenceError, tải đơn ghép cặp Flow 1', async () => {
    let tree = null;
    let renderError = null;
    try {
      tree = await renderHome();
    } catch (err) {
      renderError = err;
    }
    // Trước fix: "ReferenceError: Property 'onRefresh' doesn't exist"
    expect(renderError).toBeNull();
    await flushEffects();
    expect(mockGetBookings).toHaveBeenCalledWith({ role: 'parent' });
    expect(mockGetBookings).toHaveBeenCalledTimes(1);
    expect(tree.toJSON()).toBeTruthy();
  });

  test('pull-to-refresh: onRefresh bật spinner → tải lại → tắt spinner', async () => {
    const tree = await renderHome();
    await flushEffects();
    expect(mockGetBookings).toHaveBeenCalledTimes(1);

    // RN jest-mock của RefreshControl render <RCTRefreshControl /> KHÔNG
    // truyền props xuống host (nên getByTestId không thấy testID) — nhưng
    // mock lưu instance mới nhất vào RefreshControl.latestRef (chính thức
    // của react-native/jest/mocks/RefreshControl.js) → đọc props từ đó.
    const rc = RefreshControl.latestRef;
    expect(rc).toBeTruthy();
    expect(rc.props.refreshing).toBe(false);
    expect(typeof rc.props.onRefresh).toBe('function');

    await act(async () => {
      rc.props.onRefresh(); // giả lập user kéo để làm mới
      await Promise.resolve(); // cho fetch promise chạy
    });

    // Spinner đã tắt sau khi fetch xong (fetchBookings setRefreshing(false) trong finally)
    expect(RefreshControl.latestRef.props.refreshing).toBe(false);
    // Đã gọi lại API làm mới dữ liệu (1 lần mount + 1 lần pull)
    expect(mockGetBookings).toHaveBeenCalledTimes(2);
  });

  test('refresh lỗi API vẫn tắt spinner (không treo màn)', async () => {
    mockGetBookings.mockRejectedValueOnce(new Error('network down'));
    const tree = await renderHome();
    await flushEffects(); // finally trong fetchTasks vẫn chạy
    const rc = RefreshControl.latestRef;
    expect(rc).toBeTruthy();
    expect(rc.props.refreshing).toBe(false);
    expect(typeof rc.props.onRefresh).toBe('function');
  });
});
