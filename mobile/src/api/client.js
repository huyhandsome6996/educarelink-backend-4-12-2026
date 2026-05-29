import axios from 'axios';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';

// ====================================================================
// ⚠️  CẬP NHẬT IP NÀY MỖI KHI ĐỔI MẠNG WI-FI!
//  Cách lấy IP: Mở PowerShell → gõ `ipconfig` → tìm "IPv4 Address"
//  Hoặc dùng: npx expo start --tunnel (không cần cập nhật IP)
// ====================================================================
const DEV_IP = '192.168.1.31'; // <-- ĐỔI IP CỦA MÁY TÍNH BẠN VÀO ĐÂY

const BASE_URL = Platform.OS === 'web'
  ? 'http://localhost:8000/api'
  : `http://${DEV_IP}:8000/api`;

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

