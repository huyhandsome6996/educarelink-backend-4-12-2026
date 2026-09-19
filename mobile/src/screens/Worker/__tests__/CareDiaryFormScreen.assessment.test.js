// ============================================================
// CareDiaryFormScreen.assessment.test.js
// H2 — payload điều hành theo loại đánh giá:
//   - form tutoring/childcare: KHÔNG được gửi key 'activities'
//     (backend coi activities != null là lệnh "xóa hết rồi tạo lại" —
//      gửi mảng rỗng sẽ âm thầm xóa activities cũ của entry).
//   - form general: giữ nguyên key 'activities'.
// H1 (QA 2026-09-19) — chọn loại form theo category.code (slug ổn định),
//   KHÔNG so khớp category_name: admin đổi tên hiển thị vẫn giữ đúng form.
// L2 (QA 2026-09-19) — PATCH bị backend chặn hạ cấp (cần
//   confirm_clear_assessment) → hiện dialog xác nhận → gửi lại kèm cờ.
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

import CareDiaryFormScreen, {
  extractApiError,
  isDowngradeConfirmError,
} from '../CareDiaryFormScreen';

// L2 — lỗi chặn hạ cấp nguyên văn của backend (care_diary/services.py)
const DOWNGRADE_ERROR_BODY = {
  assessment_type: [
    'Đổi về form chung sẽ xóa dữ liệu đánh giá đã lưu. '
    + 'Gửi kèm confirm_clear_assessment=true nếu chắc chắn.',
  ],
};

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

  // L2 — nút submit đổi nhãn theo isExisting ('Cập nhật nhật ký' / 'Lưu nhật ký')
  const pressSubmit = async (utils) => {
    let btn;
    try {
      btn = utils.getByText('Cập nhật nhật ký');
    } catch (e) {
      btn = utils.getByText('Lưu nhật ký');
    }
    await act(async () => {
      fireEvent.press(btn);
    });
    // Flush nốt chuỗi async của handleSubmit (create/update → Alert → setSubmitting)
    await flushEffects();
    await flushEffects();
  };

  it('tutoring (code gia-su): payload KHÔNG có key activities', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_code: 'gia-su', category_name: 'Gia sư' },
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    expect(payload.assessment_type).toBe('tutoring');
    expect(payload).not.toHaveProperty('activities');
  });

  it('childcare (code trong-tre): payload KHÔNG có key activities', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_code: 'trong-tre', category_name: 'Trông trẻ' },
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
      data: { category_code: '', category_name: '' },
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    expect(payload.assessment_type).toBe('general');
    expect('activities' in payload).toBe(true);
    expect(Array.isArray(payload.activities)).toBe(true);
  });

  // ═══ H1 — chọn form theo category.code, không theo tên hiển thị ═══

  it('H1 — admin đổi tên danh mục (name mới, code giữ nguyên) vẫn chọn đúng form tutoring', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: {
        category_code: 'gia-su',
        category_name: 'Gia sư 1 kèm 1 (cao cấp)', // tên đã bị admin đổi
      },
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    expect(payload.assessment_type).toBe('tutoring');
    expect(payload).not.toHaveProperty('activities');
  });

  it('H1 — backend cũ chỉ có category_name (không có code) → rơi về general, KHÔNG so khớp tên', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_name: 'Gia sư' }, // không có category_code
    });
    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockCreateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const payload = mockCreateCareDiaryEntry.mock.calls[0][1];
    // Chủ đích thiết kế: bỏ hẳn so khớp tên — thiếu code thì dùng form chung
    // an toàn thay vì đoán từ tên hiển thị có thể bị admin đổi bất cứ lúc nào.
    expect(payload.assessment_type).toBe('general');
  });
});

describe('CareDiaryFormScreen — L2 dialog xác nhận xóa dữ liệu đánh giá', () => {
  const flushEffects = async () => {
    await act(async () => {});
  };

  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
    let btn;
    try {
      btn = utils.getByText('Cập nhật nhật ký');
    } catch (e) {
      btn = utils.getByText('Lưu nhật ký');
    }
    await act(async () => {
      fireEvent.press(btn);
    });
    await flushEffects();
    await flushEffects();
  };

  it('PATCH bị chặn hạ cấp → dialog xác nhận → gửi lại kèm confirm_clear_assessment=true', async () => {
    // Entry cũ (response kiểu cache cũ — không mang assessment_type → client
    // mặc định general) + task thuộc danh mục gia-su. Server chặn vì entry
    // thật đang tutoring có dữ liệu → client phải hỏi xác nhận rồi gửi lại.
    mockGetTaskDetail.mockResolvedValue({
      data: { category_code: 'gia-su' },
    });
    mockGetCareDiaryEntry.mockResolvedValue({
      data: {
        mood: { icon: 'happy', label: 'Vui vẻ & Hợp tác', note: '' },
        completion: { percent: 85 },
        note: 'Buổi học ổn',
        activities: [],
        // chủ đích: KHÔNG có assessment_type (stale response)
      },
    });
    mockUpdateCareDiaryEntry
      .mockRejectedValueOnce({
        response: { status: 400, data: DOWNGRADE_ERROR_BODY },
      })
      .mockResolvedValueOnce({ data: {} });

    const utils = await renderScreen();
    await pressSubmit(utils);

    // Lượt 1 bị chặn → hiện dialog xác nhận (không phải lỗi chung chung)
    expect(mockUpdateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const confirmCall = alertSpy.mock.calls.find(
      (c) => c[0] === 'Xác nhận xoá dữ liệu đánh giá',
    );
    expect(confirmCall).toBeDefined();
    const buttons = confirmCall[2];
    const confirmBtn = buttons.find((b) => b.text === 'Xoá & lưu');
    expect(confirmBtn).toBeDefined();

    // Bấm "Xoá & lưu" → gửi lại kèm cờ xác nhận
    await act(async () => {
      confirmBtn.onPress();
    });
    await flushEffects();
    await flushEffects();

    expect(mockUpdateCareDiaryEntry).toHaveBeenCalledTimes(2);
    const retryPayload = mockUpdateCareDiaryEntry.mock.calls[1][1];
    expect(retryPayload.confirm_clear_assessment).toBe(true);
  });

  it('Nút "Giữ nguyên" là cancel thuần (không có onPress) → đóng dialog không thể tự gửi lại', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_code: 'trong-tre' },
    });
    mockGetCareDiaryEntry.mockResolvedValue({
      data: {
        mood: { icon: 'happy', label: 'Vui vẻ & Hợp tác', note: '' },
        completion: { percent: 60 },
        note: '',
        activities: [],
      },
    });
    mockUpdateCareDiaryEntry
      .mockRejectedValueOnce({
        response: { status: 400, data: DOWNGRADE_ERROR_BODY },
      })
      .mockResolvedValue({ data: {} });

    const utils = await renderScreen();
    await pressSubmit(utils);

    const confirmCall = alertSpy.mock.calls.find(
      (c) => c[0] === 'Xác nhận xoá dữ liệu đánh giá',
    );
    const cancelBtn = confirmCall[2].find((b) => b.text === 'Giữ nguyên');
    // Contract: nút hủy KHÔNG mang onPress — bấm nó chỉ đóng dialog,
    // tuyệt đối không tự động gửi lại request (tránh xóa dữ liệu ngoài ý muốn).
    expect(cancelBtn.style).toBe('cancel');
    expect(cancelBtn.onPress).toBeUndefined();
    expect(mockUpdateCareDiaryEntry).toHaveBeenCalledTimes(1);
  });

  it('Lỗi field-level khác (assessment_data.meals) → Alert hiển thị thông điệp thật', async () => {
    mockGetTaskDetail.mockResolvedValue({
      data: { category_code: 'trong-tre' },
    });
    mockGetCareDiaryEntry.mockResolvedValue({
      data: {
        mood: { icon: 'happy', label: 'Vui vẻ & Hợp tác', note: '' },
        completion: { percent: 60 },
        note: '',
        activities: [],
      },
    });
    mockUpdateCareDiaryEntry.mockRejectedValue({
      response: {
        status: 400,
        data: { assessment_data: { meals: ['Cần ít nhất 1 bữa ăn với time và amount.'] } },
      },
    });

    const utils = await renderScreen();
    await pressSubmit(utils);

    expect(mockUpdateCareDiaryEntry).toHaveBeenCalledTimes(1);
    const errorCall = alertSpy.mock.calls.find((c) => c[0] === 'Lỗi');
    expect(errorCall).toBeDefined();
    expect(errorCall[1]).toContain('Cần ít nhất 1 bữa ăn');
    // Không hiện dialog xác nhận cho loại lỗi này
    expect(
      alertSpy.mock.calls.some((c) => c[0] === 'Xác nhận xoá dữ liệu đánh giá'),
    ).toBe(false);
  });
});

describe('extractApiError / isDowngradeConfirmError (helpers L2)', () => {
  it('extractApiError — gom thông điệp từ mọi shape lỗi DRF', () => {
    expect(extractApiError({ error: 'Lỗi chung.' })).toBe('Lỗi chung.');
    expect(
      extractApiError({ assessment_type: ['Lỗi A.', 'Lỗi B.'] }),
    ).toBe('Lỗi A.\nLỗi B.');
    expect(
      extractApiError({ assessment_data: { meals: ['Lỗi meals.'], nap: ['Lỗi nap.'] } }),
    ).toBe('Lỗi meals.\nLỗi nap.');
    expect(extractApiError(null)).toBeNull();
    expect(extractApiError({})).toBeNull();
  });

  it('isDowngradeConfirmError — chỉ đúng khi có assessment_type + nhắc confirm_clear_assessment', () => {
    expect(isDowngradeConfirmError(DOWNGRADE_ERROR_BODY)).toBe(true);
    expect(isDowngradeConfirmError({ error: 'Lỗi khác.' })).toBe(false);
    expect(isDowngradeConfirmError(null)).toBe(false);
  });
});
