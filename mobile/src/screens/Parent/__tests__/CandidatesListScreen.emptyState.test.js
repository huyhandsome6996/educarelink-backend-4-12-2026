// ============================================================
// CandidatesListScreen.emptyState.test.js — Defect 2 (2026-09-13)
//
// Đảm bảo khi API trả 0 candidate:
//   1. HIỂN THỊ empty state THẬT đúng theo spec (KHÔNG rơi vào
//      DEMO_CANDIDATES TP. Huế):
//      - Title: "Chưa tìm thấy CarePartner phù hợp trong khu vực"
//      - Subtitle: "Thử điều chỉnh khung giờ, giảm tiêu chí hoặc mở rộng
//        bán kính tìm kiếm quanh địa điểm đã chọn."
//      - Nút hành động: "Điều chỉnh yêu cầu / Đổi khung giờ" → goBack()
//   2. KHÔNG còn bất kỳ chuỗi '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế' nào trên màn hình.
//   3. Job capsule KHÔNG fallback 'TP. Huế' khi location_note rỗng.
//
// Ghi chú kỹ thuật: chạy trong MỘT test duy nhất — Animated.loop của radar
// + React 19 concurrent render khiến nhiều test nối tiếp dễ dính state chéo
// (root cũ chưa unmount). cleanup() sau mỗi test vẫn giữ để an toàn.
//
// Chạy: npx jest src/screens/Parent/__tests__/CandidatesListScreen.emptyState.test.js
// ============================================================

import React from 'react';
import { act, render, fireEvent, cleanup, waitFor } from '@testing-library/react-native';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) };
const mockParams = { jobId: 'job-123' };
// Giữ callback useFocusEffect — gọi trong act() để setState flush đúng (pattern flow1 smoke test)
let mockFocusCallbacks = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: (cb) => { mockFocusCallbacks.push(cb); },
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
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const MockMapView = React.forwardRef(() => null);
  MockMapView.Marker = React.forwardRef(() => null);
  return { __esModule: true, default: MockMapView, Marker: MockMapView.Marker };
}, { virtual: true });

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockWebView = React.forwardRef((props) => React.createElement(View, props));
  return { __esModule: true, default: MockWebView, WebView: MockWebView };
}, { virtual: true });

// API matching trả 0 candidate — kịch bản Defect 1 trước khi fix (Huế 0 gia sư Văn)
const mockGetMatchingCandidates = jest.fn(() =>
  Promise.resolve({ data: { total_matched: 0, candidates: [], job: { location_note: '' } } }));

jest.mock('../../../api/matching', () => {
  const actual = jest.requireActual('../../../api/matching');
  return {
    ...actual,
    getMatchingCandidates: (...args) => mockGetMatchingCandidates(...args),
    selectCarePartner: jest.fn(() => Promise.resolve({ data: {} })),
  };
});

import CandidatesListScreen from '../CandidatesListScreen';

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('0 candidate → empty state thật theo spec, không DEMO TP. Huế, không Cầu Giấy', async () => {
  const {
    getByText, queryByText,
  } = await render(<CandidatesListScreen />);

  // React 19 concurrent: flush để hook useFocusEffect kịp push callback
  await act(async () => {});
  const cbs = mockFocusCallbacks.splice(0);
  await act(async () => {
    cbs.forEach((cb) => cb());
  });
  await act(async () => {}); // flush promise load()

  // 1. Empty state thật đúng theo spec
  await waitFor(() => {
    expect(getByText('Chưa tìm thấy CarePartner phù hợp trong khu vực')).toBeTruthy();
  });
  expect(
    getByText(
      'Thử điều chỉnh khung giờ, giảm tiêu chí hoặc mở rộng bán kính tìm kiếm quanh địa điểm đã chọn.'
    )
  ).toBeTruthy();

  // 2. Không có thẻ candidate demo TP. Huế nào lọt vào
  expect(mockGetMatchingCandidates).toHaveBeenCalled();
  expect(queryByText(/GỢI Ý HÀNG ĐẦU/)).toBeNull();

  // 3. Không còn '48 Võ Thị Sáu, P. Vĩnh Ninh, TP. Huế' nào trên màn hình (match mọi Text node)
  expect(queryByText(/Cầu Giấy/)).toBeNull();

  // 4. Job capsule không fallback 'TP. Huế' khi location_note rỗng — dùng fallback trung tính
  expect(queryByText(/TP. Huế/)).toBeNull();
  expect(getByText('Vị trí đã chọn trên bản đồ')).toBeTruthy();

  // 5. Nút hành động → quay lại màn trước để điều chỉnh yêu cầu
  fireEvent.press(getByText('Điều chỉnh yêu cầu / Đổi khung giờ'));
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
});
