import React, { createContext, useState, useContext, useEffect } from 'react';
import { storage } from '../utils/storage';
import { login as loginApi, register as registerApi, getProfile } from '../api/auth';
import { completeOnboarding as completeOnboardingApi } from '../api/onboarding';
import { registerForPushNotificationsAsync } from '../utils/notifications';
import apiClient from '../api/client';
import RealtimeService from '../services/RealtimeService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await storage.getItem('access_token');
        if (token) {
          const response = await getProfile();
          setUser(response.data);
          RealtimeService.connect();
        }
      } catch (error) {
        await storage.deleteItem('access_token');
        await storage.deleteItem('user_role');
        setUser(null);
        RealtimeService.disconnect();
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);

  const login = async (username, password) => {
    const response = await loginApi(username, password);
    const { tokens, role, is_staff } = response.data;

    await storage.setItem('access_token', tokens.access);
    await storage.setItem('refresh_token', tokens.refresh);
    await storage.setItem('user_role', role);
    if (is_staff) await storage.setItem('is_staff', 'true');

    const profileResp = await getProfile();
    setUser(profileResp.data);

    try {
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await apiClient.patch('/profile/', { expo_push_token: pushToken });
        console.log('Push token sent to backend successfully');
      }
    } catch (e) {
      console.log('Failed to send push token to backend', e);
    }

    RealtimeService.connect();
    return profileResp.data;
  };

  const register = async (username, password, role, firstName, lastName, email, phone, idCardFront, idCardBack, selfiePhoto, certificatePhoto) => {
    const response = await registerApi(username, password, role, firstName, lastName, email, phone, idCardFront, idCardBack, selfiePhoto, certificatePhoto);

    if (role === 'worker') {
      return { status: 'pending_approval' };
    }

    return await login(username, password);
  };

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

    RealtimeService.connect();
    return profileResp.data;
  };

  const logout = async () => {
    RealtimeService.disconnect();
    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    await storage.deleteItem('user_role');
    await storage.deleteItem('is_staff');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const response = await getProfile();
      setUser(response.data);
      return response.data;
    } catch (e) {
      console.warn('refreshUser failed:', e);
    }
  };

  const completeOnboardingInContext = async () => {
    try {
      await completeOnboardingApi();
      setUser(prev => prev ? { ...prev, first_login: false } : prev);
    } catch (e) {
      console.warn('completeOnboardingInContext failed:', e);
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

export const useAuth = () => useContext(AuthContext);
