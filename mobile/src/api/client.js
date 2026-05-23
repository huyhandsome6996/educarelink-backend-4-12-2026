import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// ĐỔI IP NÀY thành IP máy tính của bạn khi chạy trên điện thoại thật
// Nếu dùng emulator Android: 10.0.2.2
// Nếu dùng Expo Go trên điện thoại: IP LAN của máy, VD: 192.168.1.x
const BASE_URL = 'http://10.0.2.2:8000/api';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Interceptor: Tự động gắn Bearer Token vào mọi request
apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor: Xử lý lỗi response tập trung
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token hết hạn — xoá token, điều hướng về login sẽ xử lý ở AuthContext
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('user_role');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
