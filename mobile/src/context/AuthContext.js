import React, { createContext, useState, useContext, useEffect } from 'react';
import { storage } from '../utils/storage';
import { login as loginApi, register as registerApi, getProfile } from '../api/auth';
import { completeOnboarding as completeOnboardingApi } from '../api/onboarding';
import { registerForPushNotificationsAsync } from '../utils/notifications';
import apiClient from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // Thông tin user đang đăng nhập
  const [isLoading, setIsLoading] = useState(true); // Kiểm tra token lúc app khởi động

  // Khi app mở lại — kiểm tra xem đã có token chưa
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await storage.getItem('access_token');
        if (token) {
          // Lấy profile từ server để đảm bảo token còn hợp lệ
          const response = await getProfile();
          setUser(response.data);
        }
      } catch (error) {
        // Token hết hạn hoặc lỗi — xoá hết
        await storage.deleteItem('access_token');
        await storage.deleteItem('user_role');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);

  const login = async (username, password) => {
    const response = await loginApi(username, password);
    const { tokens, role, is_staff } = response.data;

    // Lưu token và role vào SecureStore hoặc localStorage
    await storage.setItem('access_token', tokens.access);
    await storage.setItem('refresh_token', tokens.refresh);
    await storage.setItem('user_role', role);
    if (is_staff) await storage.setItem('is_staff', 'true');

    // Lấy full profile
    const profileResp = await getProfile();
    setUser(profileResp.data);

    // Register push token
    try {
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await apiClient.patch('/profile/', { expo_push_token: pushToken });
        console.log('Push token sent to backend successfully');
      }
    } catch (e) {
      console.log('Failed to send push token to backend', e);
    }

    return profileResp.data;
  };

  const register = async (username, password, role, firstName, lastName, email, phone, idCardFront, idCardBack, selfiePhoto, certificatePhoto) => {
    const response = await registerApi(username, password, role, firstName, lastName, email, phone, idCardFront, idCardBack, selfiePhoto, certificatePhoto);

    // Carepartner không auto-login (chờ admin duyệt)
    if (role === 'worker') {
      return { status: 'pending_approval' };
    }

    // Phụ huynh: đăng ký xong auto đăng nhập luôn
    return await login(username, password);
  };

  // OAuth login — nhận access token từ Google/Facebook
  const loginWithOAuth = async (provider, accessToken, role = 'parent') => {
    const apiFn = provider === 'google'
      ? (await import('../api/auth')).loginWithGoogle
      : (await import('../api/auth')).loginWithFacebook;
    const response = await apiFn(accessToken, role);
    const { tokens, role: returnedRole, is_staff } = response.data;

    await storage.setItem('access_token', tokens.access);
    await storage.setItem('refresh_token', tokens.refresh);
    await storage.setItem('user_role', returnedRole);
    if (is_staff) await storage.setItem('is_staff', 'true');

    const profileResp = await getProfile();
    setUser(profileResp.data);

    try {
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await apiClient.patch('/profile/', { expo_push_token: pushToken });
      }
    } catch (e) {
      console.log('Failed to send push token', e);
    }

    return profileResp.data;
  };

  const logout = async () => {
    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    await storage.deleteItem('user_role');
    await storage.deleteItem('is_staff');
    setUser(null);
  };

  // Refresh user profile từ server (dùng sau khi update profile, complete onboarding, ...)
  const refreshUser = async () => {
    try {
      const response = await getProfile();
      setUser(response.data);
      return response.data;
    } catch (e) {
      console.warn('refreshUser failed:', e);
    }
  };

  // Đánh dấu đã hoàn thành onboarding — gọi API + cập nhật state
  const completeOnboardingInContext = async () => {
    try {
      await completeOnboardingApi();
      // Cập nhật user.first_login = false trong state (không cần fetch lại)
      setUser(prev => prev ? { ...prev, first_login: false } : prev);
    } catch (e) {
      console.warn('completeOnboardingInContext failed:', e);
      // Vẫn đánh dấu first_login = false trong state để user đi tiếp
      setUser(prev => prev ? { ...prev, first_login: false } : prev);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      login, register, logout,
      loginWithOAuth,
      refreshUser,
      completeOnboardingInContext,
    }}>
      {children}
    </AuthContext.Provider>
  );
}


// Hook tiện lợi để dùng trong mọi màn hình
export const useAuth = () => useContext(AuthContext);
