import axios from 'axios';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';

// Tự động cấu hình IP dựa trên nền tảng (Web dùng localhost, Mobile dùng IP máy chủ)
const BASE_URL = Platform.OS === 'web'
  ? 'http://localhost:8000/api'
  : 'http://192.168.1.31:8000/api';

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
    const token = await storage.getItem('access_token');
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
      await storage.deleteItem('access_token');
      await storage.deleteItem('user_role');
    }
    return Promise.reject(error);
  }
);

export default apiClient;

