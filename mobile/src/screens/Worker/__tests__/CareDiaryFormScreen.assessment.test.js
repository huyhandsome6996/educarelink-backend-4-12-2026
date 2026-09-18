// ============================================================
// CareDiaryFormScreen.assessment.test.js
// H2 — payload điều hành theo loại đánh giá:
//   - form tutoring/childcare: KHÔNG được gửi key 'activities'
//     (backend coi activities != null là lệnh "xóa hết rồi tạo lại" —
//      gửi mảng rỗng sẽ âm thầm xóa activities cũ của entry).
//   - form general: giữ nguyên key 'activities'.
// Pattern test theo chuẩn đang dùng trong repo
// (xem AvailabilityScreen.acceptance.test.js — không dùng waitFor).
// ============================================================

import React from 'react';
import { Alert } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn().mockReturnValue(true),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: { taskId: 5, taskTitle: 'Buổi học thử' } }),
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

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  MediaTypeOptions: { Images: 'Images' },
}));

const mockGetTaskDetail = jest.fn();
jest.mock('../../../api/tasks', () => ({
  getTaskDetail: (...a) => mockGetTaskDetail(...a),
}));

const mockGetCareDiaryEntry = jest.fn();
const mockCreateCareDiaryEntry = jest.fn();
const mockUpdateCareDiaryEntry = jest.fn();
jest.mock('../../../api/careDiary', () => ({
  getCareDiaryEntry: (...a) => mockGetCareDiaryEntry(...a),
  createCareDiaryEntry: (...a) => mockCreateCareDiaryEntry(...a),
  updateCareDiaryEntry: (...a) => mockUpdateCareDiaryEntry(...a),
  uploadCareDiaryAttachments: jest.fn(),
}));

// Mock 2 form chuyên sâu — test này chỉ quan tâm payload gửi lên, không
// render chi tiết form (validators trả null = hợp lệ để đi qua submit).
jest.mock('../components/TutoringAssessmentSection', () => {
  const React = require('react');
  const MockSection = () => React.createElement('View');
  return {
    __esModule: true,
    default: MockSection,
    validateTutoringAssessment: jest.fn(() => null),
  };
});
jest.mock('../components/ChildcareAssessmentSection', () => {
  const React = require('react');
  const MockSection = () => React.createElement('View');
  return {
    __esModule: true,
    default: MockSection,
    validateChildcareAssessment: jest.fn(() => null),
  };
});

import CareDiaryFormScreen from '../CareDiaryFormScreen';

describe('CareDiaryFormScreen — H2 payload theo loại đánh giá', () => {
  const flushEffects = async () => {
    await act(async () => {});
  };

  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    // Alert trong môi trường jest có thể không phải no-op — mock để chuỗi
    // async của handleSubmit chạy trọn vẹn (giống user bấm OK thật).
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // Mặc định: chưa có entry cũ → form trống, submit sẽ dùng create (POST)
    mockGetCareDiaryEntry.mockRejectedValue({
      response: { status: 404 },
    });
    mockCreateCareDiaryEntry.mockResolvedValue({ data: {} });
    mockUpdateCareDiaryEntry.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  const renderScreen = async () => {
    const utils = await render(<CareDiaryFormScreen />);
    await flushEffects();
    return utils;
  };

  const pressSubmit = async (utils) => {
    await act(async () => {
      fireEvent.press(utils.getByText('Lưu nhật ký'));
    });
    // Flush nốt chuỗi async của handleSubmit (create → Alert → setSubmitting)
    await flushEffects();
    await flushEffects();
  };

  it('tutoring (Gia sư): payload KHÔNG có key activities', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_name: 'Gia sư' },
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    expect(payload.assessment_type).toBe('tutoring');
    expect(payload).not.toHaveProperty('activities');
  });

  it('childcare (Trông trẻ): payload KHÔNG có key activities', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_name: 'Trông trẻ' },
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    expect(payload.assessment_type).toBe('childcare');
    expect(payload).not.toHaveProperty('activities');
  });

  it('general (không có category): payload VẪN có key activities', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_name: '' },
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    expect(payload.assessment_type).toBe('general');
    expect('activities' in payload).toBe(true);
    expect(Array.isArray(payload.activities)).toBe(true);
  });
});
