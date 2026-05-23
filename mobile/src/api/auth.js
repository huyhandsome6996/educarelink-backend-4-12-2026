import apiClient from './client';

// Đăng nhập — trả về token + role
export const login = (username, password) =>
  apiClient.post('/auth/login/', { username, password });

// Đăng ký tài khoản mới
export const register = (username, password, role, firstName = '', lastName = '') =>
  apiClient.post('/auth/register/', {
    username,
    password,
    role,
    first_name: firstName,
    last_name: lastName,
  });

// Lấy thông tin hồ sơ người dùng hiện tại
export const getProfile = () => apiClient.get('/profile/');
