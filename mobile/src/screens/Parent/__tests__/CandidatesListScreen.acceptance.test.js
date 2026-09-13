/**
 * CandidatesListScreen.acceptance.test.js — Acceptance Test Suite for Candidates List Screen.
 *
 * Covers:
 *  - AC-M6: Truthful zero-match empty state:
 *      - Renders testID="truthful-empty-container" when candidates list is empty.
 *      - Displays exact truthful text:
 *          "Chưa tìm thấy CarePartner phù hợp trong khu vực"
 *          "Thử điều chỉnh khung giờ, giảm tiêu chí hoặc mở rộng bán kính tìm kiếm quanh địa điểm đã chọn."
 *      - Action button "empty-adjust-btn" triggers navigation.goBack().
 *      - Verifies NO fallback to demo candidates (no "Cầu Giấy", no fake profiles).
 *      - Verifies that when candidates exist, truthful empty container is NOT rendered and candidate cards appear.
 */

import React from 'react';
import { render, act, fireEvent } from '@testing-library/react-native';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  setOptions: jest.fn(),
};

let mockRouteParams = {};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => mockNavigation,
    useRoute: () => ({ params: mockRouteParams }),
    useFocusEffect: (callback) => {
      React.useEffect(() => {
        callback();
      }, [callback]);
    },
    useIsFocused: () => true,
  };
});

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
  useSafeAreaInsets: () => ({ top: 12, bottom: 20, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
  SafeAreaConsumer: ({ children }) => children({ insets: { top: 12, bottom: 20, left: 0, right: 0 } }),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock matching API
const mockGetMatchingCandidates = jest.fn();
const mockSelectCarePartner = jest.fn();

jest.mock('../../../api/matching', () => ({
  getMatchingCandidates: (...args) => mockGetMatchingCandidates(...args),
  selectCarePartner: (...args) => mockSelectCarePartner(...args),
  MATCH_LEVEL_LABELS: {
    excellent: 'Phù hợp xuất sắc',
    good: 'Phù hợp tốt',
    fair: 'Tương đối phù hợp',
  },
}));

import CandidatesListScreen from '../CandidatesListScreen';

const press = async (element) => {
  await act(async () => {
    if (element.props.onClick) {
      element.props.onClick();
    } else if (element.props.onPress) {
      element.props.onPress();
    } else {
      fireEvent.press(element);
    }
  });
};

describe('CandidatesListScreen Acceptance Suite (AC-M6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
  });

  describe('AC-M6: Truthful Zero-Match Empty State', () => {
    it('renders truthful empty container with correct title, subtitle, and adjust button when candidates array is empty', async () => {
      // Mock API returning 0 candidates
      mockGetMatchingCandidates.mockResolvedValueOnce({
        data: {
          job: {
            title: 'Gia sư Ngữ văn lớp 9 tại TP. Huế',
            hourly_rate_vnd: 130000,
          },
          total_matched: 0,
          candidates: [],
        },
      });

      mockRouteParams = {
        jobId: 'job-tutoring-hue-001',
        candidates: [],
        totalMatched: 0,
      };

      let tree;
      await act(async () => {
        tree = await render(<CandidatesListScreen />);
      });

      // 1. Check truthful empty container is rendered
      const emptyContainer = tree.getByTestId('truthful-empty-container');
      expect(emptyContainer).toBeTruthy();

      // 2. Check exact title text
      expect(
        tree.getByText('Chưa tìm thấy CarePartner phù hợp trong khu vực')
      ).toBeTruthy();

      // 3. Check exact subtitle guidance text
      expect(
        tree.getByText(
          'Thử điều chỉnh khung giờ, giảm tiêu chí hoặc mở rộng bán kính tìm kiếm quanh địa điểm đã chọn.'
        )
      ).toBeTruthy();

      // 4. Action button empty-adjust-btn exists
      const adjustBtn = tree.getByTestId('empty-adjust-btn');
      expect(adjustBtn).toBeTruthy();

      // 5. Pressing adjust button calls navigation.goBack()
      await press(adjustBtn);
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);

      // 6. Verify NO demo fallback data from Hanoi is displayed
      expect(tree.queryByText('Cầu Giấy')).toBeNull();
      expect(tree.queryByText('Nguyễn Thu Hà')).toBeNull();
      expect(tree.queryByText('Trần Minh Đức')).toBeNull();
      expect(tree.queryByText('Lê Hoàng Nam')).toBeNull();
    });

    it('renders truthful empty container when fetched via API with total_matched: 0', async () => {
      mockGetMatchingCandidates.mockResolvedValueOnce({
        data: {
          job: {
            title: 'Tìm gia sư Toán lớp 5',
            hourly_rate_vnd: 120000,
          },
          total_matched: 0,
          candidates: [],
        },
      });

      mockRouteParams = {
        jobId: 'job-tutoring-no-candidates',
      };

      let tree;
      await act(async () => {
        tree = await render(<CandidatesListScreen />);
      });

      // API was called
      expect(mockGetMatchingCandidates).toHaveBeenCalledWith('job-tutoring-no-candidates');

      // Empty container is displayed
      expect(tree.getByTestId('truthful-empty-container')).toBeTruthy();
      expect(
        tree.getByText('Chưa tìm thấy CarePartner phù hợp trong khu vực')
      ).toBeTruthy();
    });

    it('does NOT render truthful empty container when candidates exist', async () => {
      const sampleCandidate = {
        carepartner_id: 'cp-hue-001',
        display_name: 'Lê Thị Phương',
        match_score: 95,
        school: 'ĐH Sư Phạm Huế',
        major: 'Sư phạm Ngữ văn',
        rating: 4.9,
        completed_jobs: 8,
        distance_km: 1.5,
        top_skills: ['Ngữ văn THCS', 'Kiên nhẫn'],
        response_tag: 'Phản hồi trong 5 phút',
      };

      mockGetMatchingCandidates.mockResolvedValueOnce({
        data: {
          job: {
            title: 'Gia sư Ngữ văn',
            hourly_rate_vnd: 130000,
          },
          total_matched: 1,
          candidates: [sampleCandidate],
        },
      });

      mockRouteParams = {
        jobId: 'job-tutoring-has-candidate',
        candidates: [sampleCandidate],
        totalMatched: 1,
      };

      let tree;
      await act(async () => {
        tree = await render(<CandidatesListScreen />);
      });

      // Empty container must NOT be in the tree
      expect(tree.queryByTestId('truthful-empty-container')).toBeNull();

      // Candidate card is displayed
      expect(tree.getByText('Lê Thị Phương')).toBeTruthy();
      expect(tree.getByText('GỢI Ý HÀNG ĐẦU · 95/100 ĐIỂM')).toBeTruthy();
    });
  });
});
