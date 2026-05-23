import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as loginApi, register as registerApi, getProfile } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // Thông tin user đang đăng nhập
  const [isLoading, setIsLoading] = useState(true); // Kiểm tra token lúc app khởi động

  // Khi app mở lại — kiểm tra xem đã có token chưa
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await SecureStore.getItemAsync('access_token');
        if (token) {
          // Lấy profile từ server để đảm bảo token còn hợp lệ
          const response = await getProfile();
          setUser(response.data);
        }
      } catch (error) {
        // Token hết hạn hoặc lỗi — xoá hết
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('user_role');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);

  const login = async (username, password) => {
    const response = await loginApi(username, password);
    const { tokens, role, user_id, username: uname } = response.data;

    // Lưu token và role vào SecureStore (an toàn hơn localStorage)
    await SecureStore.setItemAsync('access_token', tokens.access);
    await SecureStore.setItemAsync('refresh_token', tokens.refresh);
    await SecureStore.setItemAsync('user_role', role);

    // Lấy full profile
    const profileResp = await getProfile();
    setUser(profileResp.data);
    return profileResp.data;
  };

  const register = async (username, password, role, firstName, lastName) => {
    await registerApi(username, password, role, firstName, lastName);
    // Sau khi đăng ký thành công thì tự đăng nhập luôn
    return await login(username, password);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    await SecureStore.deleteItemAsync('user_role');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook tiện lợi để dùng trong mọi màn hình
export const useAuth = () => useContext(AuthContext);
