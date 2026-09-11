import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
  }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const mockMakeIcon = () => React.forwardRef(() => null);
  const mockIcons = {};
  return new Proxy(mockIcons, {
    get: (_target, prop) => {
      if (prop === '__esModule') return false;
      return mockMakeIcon();
    },
  });
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('../../../api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { status: 'ok', database: 'connected' } }),
  },
}));

import GuestHomeScreen from '../GuestHomeScreen';

describe('GuestHomeScreen — Stitch Redesign Smoke & Functional Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all key sections without crashing', async () => {
    const tree = await render(<GuestHomeScreen />);

    expect(tree.getByText(/EduCare/)).toBeTruthy();
    expect(tree.getByText('1900 6828')).toBeTruthy();

    // Check Hero Carousel Slides
    expect(tree.getByText(/Gia sư kèm cặp tận tâm/)).toBeTruthy();
    expect(tree.getByText(/Đón con tan trường/)).toBeTruthy();
    expect(tree.getByText(/Minh bạch tuyệt đối/)).toBeTruthy();

    // Check Quick Stats
    expect(tree.getByText('50.000+')).toBeTruthy();
    expect(tree.getByText('4.9')).toBeTruthy();
    expect(tree.getByText('100%')).toBeTruthy();

    // Check Service Pillars
    expect(tree.getByText('Gia sư tại nhà')).toBeTruthy();
    expect(tree.getByText('Đón trẻ an toàn')).toBeTruthy();
    expect(tree.getByText('Trông trẻ tại nhà')).toBeTruthy();
    expect(tree.getByText('AI Trợ Lý Radar')).toBeTruthy();

    // Check Safety Commitment
    expect(tree.getByText('Cam Kết Xác Thực 3 Lớp Độc Quyền')).toBeTruthy();
    expect(tree.getByText('Xác minh CCCD chip & Thẻ sinh viên')).toBeTruthy();
    expect(tree.getByText('Giám sát lộ trình GPS 2 chiều')).toBeTruthy();
    expect(tree.getByText('Bảo lãnh ký quỹ MoMo Escrow 100%')).toBeTruthy();

    // Check Student Partner recruitment banner
    expect(tree.getByText('Trở thành CarePartner')).toBeTruthy();

    // Check Action Dock
    expect(tree.getByText('Bắt đầu kết nối ngay')).toBeTruthy();
    expect(tree.getByText('Đăng nhập tại đây')).toBeTruthy();
  });

  it('navigates to Login when tapping Login link', async () => {
    const tree = await render(<GuestHomeScreen />);

    const loginBtn = tree.getByText('Đăng nhập tại đây');
    fireEvent.press(loginBtn);
    expect(mockNavigate).toHaveBeenCalledWith('Login');
  });

  it('navigates to Register with worker role when tapping Student Banner CTA', async () => {
    const tree = await render(<GuestHomeScreen />);

    const registerWorkerBtn = tree.getByText('Đăng ký ngay');
    fireEvent.press(registerWorkerBtn);
    expect(mockNavigate).toHaveBeenCalledWith('Register', { role: 'worker' });
  });

  it('opens Role Selection Modal when tapping "Bắt đầu kết nối ngay"', async () => {
    const tree = await render(<GuestHomeScreen />);

    const startBtn = tree.getByText('Bắt đầu kết nối ngay');
    await act(async () => {
      fireEvent.press(startBtn);
    });

    // Modal should show role options
    expect(tree.getByText('Chọn vai trò của bạn')).toBeTruthy();
    expect(tree.getByText('Tôi là Phụ huynh')).toBeTruthy();
    expect(tree.getByText('Tôi là Sinh viên (CarePartner)')).toBeTruthy();

    // Select Parent role
    const parentRoleOption = tree.getByText('Tôi là Phụ huynh');
    await act(async () => {
      fireEvent.press(parentRoleOption);
    });
    expect(mockNavigate).toHaveBeenCalledWith('Register', { role: 'parent' });
  });
});
