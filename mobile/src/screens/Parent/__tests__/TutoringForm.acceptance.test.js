/**
 * TutoringForm.acceptance.test.js — Acceptance Test Suite for Mobile Tutoring Form.
 *
 * Covers:
 *  - AC-M1: Age stepper boundary clamp [6, 18] and disabled states.
 *  - AC-M2: Curriculum tier switching and subject incompatibility filtering.
 *  - AC-M3: Multi-select subject clamping at 3 with Alert warning on 4th attempt.
 *  - AC-M4: Time range < 30m validation, warning box, dock '-- đ', submit disabled.
 *  - AC-M5: Dynamic pricing calculation (duration * rate * dates.length).
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

jest.mock('../../../components/JobLocationPicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props, ref) => React.createElement(View, props));
});

jest.mock('../../../components/SearchingCarePartnerModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props, ref) => React.createElement(View, props));
});

import TutoringForm, {
  CURRICULUM_TIERS,
  SENIORITY_OPTIONS,
  getSchoolLevel,
  parseTimeToMinutes,
  calculateTutoringPricing,
} from '../TutoringForm';

// Helper to trigger press event synchronously on React Native Pressable/TouchableOpacity
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

describe('TutoringForm Acceptance Suite (AC-M1 to AC-M5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Alert.alert.mockRestore?.();
  });

  // ── AC-M1: Age Stepper [6, 18] Clamp & Disabled Buttons ────────────────
  describe('AC-M1: Age Stepper Boundary Clamp', () => {
    it('initializes at 8 years old and decreases down to 6, disabling decrement button', async () => {
      const tree = await render(<TutoringForm />);

      // Initial check
      const ageText = tree.getByTestId('child-age-text');
      expect(ageText.props.children).toEqual([8, ' tuổi']);

      const decBtn = tree.getByTestId('age-decrement-btn');
      const incBtn = tree.getByTestId('age-increment-btn');

      expect(decBtn.props.accessibilityState.disabled).toBeFalsy();
      expect(incBtn.props.accessibilityState.disabled).toBeFalsy();

      // Decrement from 8 -> 7
      await press(decBtn);
      expect(tree.getByTestId('child-age-text').props.children).toEqual([7, ' tuổi']);

      // Decrement from 7 -> 6
      await press(decBtn);
      expect(tree.getByTestId('child-age-text').props.children).toEqual([6, ' tuổi']);

      // At boundary 6, decrement button must be disabled
      const decBtnAt6 = tree.getByTestId('age-decrement-btn');
      expect(decBtnAt6.props.accessibilityState.disabled).toBe(true);

      // Further click should NOT decrement below 6
      await press(decBtnAt6);
      expect(tree.getByTestId('child-age-text').props.children).toEqual([6, ' tuổi']);
    });

    it('increments up to 18 years old and disables increment button at boundary', async () => {
      const tree = await render(<TutoringForm />);

      // Jump to 16 using quick tier pill
      await press(tree.getByTestId('tier-pill-16'));
      expect(tree.getByTestId('child-age-text').props.children).toEqual([16, ' tuổi']);

      const incBtn = tree.getByTestId('age-increment-btn');

      // 16 -> 17
      await press(incBtn);
      expect(tree.getByTestId('child-age-text').props.children).toEqual([17, ' tuổi']);

      // 17 -> 18
      await press(incBtn);
      expect(tree.getByTestId('child-age-text').props.children).toEqual([18, ' tuổi']);

      // At boundary 18, increment button must be disabled
      const incBtnAt18 = tree.getByTestId('age-increment-btn');
      expect(incBtnAt18.props.accessibilityState.disabled).toBe(true);

      // Further click should NOT increment above 18
      await press(incBtnAt18);
      expect(tree.getByTestId('child-age-text').props.children).toEqual([18, ' tuổi']);
    });
  });

  // ── AC-M2: Curriculum Tier Switching & Incompatible Subject Filtering ──
  describe('AC-M2: Curriculum Tier Switching', () => {
    it('correctly maps age to curriculum tiers via getSchoolLevel', () => {
      expect(getSchoolLevel(6)).toBe('cap_1');
      expect(getSchoolLevel(8)).toBe('cap_1');
      expect(getSchoolLevel(10)).toBe('cap_1');
      expect(getSchoolLevel(11)).toBe('cap_2');
      expect(getSchoolLevel(13)).toBe('cap_2');
      expect(getSchoolLevel(15)).toBe('cap_2');
      expect(getSchoolLevel(16)).toBe('cap_3');
      expect(getSchoolLevel(18)).toBe('cap_3');
    });

    it('filters out incompatible subjects when switching curriculum tier', async () => {
      const tree = await render(<TutoringForm />);

      // Cấp 1: select 'tu_nhien_xa_hoi' (only exists in cap_1) and 'toan' (exists in all)
      const toanItem = tree.getByTestId('subject-grid-item-toan');
      const tnxhItem = tree.getByTestId('subject-grid-item-tu_nhien_xa_hoi');

      await press(toanItem);
      await press(tnxhItem);

      // Verify helper hint says 2/3
      expect(tree.getByText('2/3 môn đã chọn')).toBeTruthy();

      // Switch to Cấp 2 (13 tuổi)
      await press(tree.getByTestId('tier-pill-13'));
      expect(tree.getByTestId('child-age-text').props.children).toEqual([13, ' tuổi']);

      // In Cấp 2, 'tu_nhien_xa_hoi' does NOT exist, so it must be dropped. 'toan' remains.
      expect(tree.getByText('1/3 môn đã chọn')).toBeTruthy();

      // In Cấp 2, Cấp 2 subjects are now rendered (e.g. 'van', 'khoa_hoc_tu_nhien')
      expect(tree.getByTestId('subject-grid-item-van')).toBeTruthy();
      expect(tree.getByTestId('subject-grid-item-khoa_hoc_tu_nhien')).toBeTruthy();
      expect(tree.queryByTestId('subject-grid-item-tu_nhien_xa_hoi')).toBeNull();
    });
  });

  // ── AC-M3: Multi-Select Subject Clamping at 3 & Alert ──────────────────
  describe('AC-M3: Multi-Subject Selection Limit (Max 3)', () => {
    it('allows up to 3 subjects and raises Alert when attempting to select a 4th', async () => {
      const tree = await render(<TutoringForm />);

      // Select 1st: Toán
      await press(tree.getByTestId('subject-grid-item-toan'));
      expect(tree.getByText('1/3 môn đã chọn')).toBeTruthy();

      // Select 2nd: Tiếng Việt
      await press(tree.getByTestId('subject-grid-item-tieng_viet'));
      expect(tree.getByText('2/3 môn đã chọn')).toBeTruthy();

      // Select 3rd: Tiếng Anh
      await press(tree.getByTestId('subject-grid-item-tieng_anh'));
      expect(tree.getByText('3/3 môn đã chọn')).toBeTruthy();

      // Attempt 4th: Âm nhạc
      await press(tree.getByTestId('subject-grid-item-am_nhac'));

      // Alert must be triggered with limit message
      expect(Alert.alert).toHaveBeenCalledWith(
        'Giới hạn môn học',
        'Chỉ được chọn tối đa 3 môn học cùng lúc.'
      );

      // Still capped at 3
      expect(tree.getByText('3/3 môn đã chọn')).toBeTruthy();

      // Deselecting 1 subject reduces count to 2/3
      await press(tree.getByTestId('subject-grid-item-toan'));
      expect(tree.getByText('2/3 môn đã chọn')).toBeTruthy();
    });
  });

  // ── AC-M4: Time Validation (< 30 mins) & Dock Pricing ──────────────────
  describe('AC-M4: Time Range Validation (< 30 mins)', () => {
    it('displays error warning, sets dock price to "-- đ", and disables submit when session < 30m', async () => {
      const tree = await render(<TutoringForm />);

      const timeToInput = tree.getByPlaceholderText('21:00');

      // Valid initially (19:00 - 21:00 = 2h)
      expect(tree.queryByTestId('time-warning-box')).toBeNull();
      expect(tree.getByTestId('dock-price-text').props.children).not.toContain('-- đ');
      expect(tree.getByTestId('submit-job-btn').props.accessibilityState.disabled).toBeFalsy();

      // Change timeTo to 19:15 (duration 15 mins < 30 mins)
      await act(async () => {
        fireEvent.changeText(timeToInput, '19:15');
      });

      // Warning box must be visible
      expect(tree.getByTestId('time-warning-box')).toBeTruthy();
      expect(tree.getByTestId('time-warning-text').props.children).toBe(
        'Giờ kết thúc phải sau giờ bắt đầu ít nhất 30 phút.'
      );

      // Dock price must show "-- đ"
      expect(tree.getByTestId('dock-price-text').props.children).toEqual('-- đ');

      // Submit button must be disabled
      expect(tree.getByTestId('submit-job-btn').props.accessibilityState.disabled).toBe(true);

      // Invalid negative time (19:00 to 18:30)
      await act(async () => {
        fireEvent.changeText(timeToInput, '18:30');
      });
      expect(tree.getByTestId('time-warning-box')).toBeTruthy();
      expect(tree.getByTestId('dock-price-text').props.children).toEqual('-- đ');
      expect(tree.getByTestId('submit-job-btn').props.accessibilityState.disabled).toBe(true);
    });
  });

  // ── AC-M5: Dynamic Reactive Pricing Calculation ────────────────────────
  describe('AC-M5: Dynamic Reactive Pricing', () => {
    it('correctly calculates pricing with calculateTutoringPricing helper', () => {
      // 2h session at 120,000 VND, 0 dates (single session estimate)
      const p1 = calculateTutoringPricing('19:00', '21:00', '120000', 0);
      expect(p1.isValidTime).toBe(true);
      expect(p1.sessionDurationHours).toBe(2);
      expect(p1.costPerSession).toBe(240000);
      expect(p1.totalEstimatedCost).toBe(0);

      // 1.5h session at 150,000 VND, 3 dates
      const p2 = calculateTutoringPricing('18:00', '19:30', '150000', 3);
      expect(p2.isValidTime).toBe(true);
      expect(p2.sessionDurationHours).toBe(1.5);
      expect(p2.costPerSession).toBe(225000);
      expect(p2.totalEstimatedCost).toBe(675000);

      // Under 30 minutes (20 min session)
      const p3 = calculateTutoringPricing('19:00', '19:20', '120000', 2);
      expect(p3.isValidTime).toBe(false);
      expect(p3.sessionDurationHours).toBe(0);
      expect(p3.costPerSession).toBe(0);
      expect(p3.totalEstimatedCost).toBe(0);
    });

    it('updates dock price reactively when rate or time changes in the component', async () => {
      const tree = await render(<TutoringForm />);

      // Initial: 19:00 - 21:00 (2h) @ 120,000đ = 240,000đ
      const dockPrice = tree.getByTestId('dock-price-text');
      // Format vi-VN displays 240.000
      expect(dockPrice.props.children[1]).toBe('240.000');

      // Change rate to 150,000đ (2h * 150,000 = 300,000đ)
      const rateInput = tree.getByPlaceholderText('120000');
      await act(async () => {
        fireEvent.changeText(rateInput, '150000');
      });

      expect(tree.getByTestId('dock-price-text').props.children[1]).toBe('300.000');
    });
  });
});
