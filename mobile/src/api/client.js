import axios from 'axios';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';

// ====================================================================
// ⚠️  CẬP NHẬT IP NÀY MỖI KHI ĐỔI MẠNG WI-FI (chỉ áp dụng khi chạy dev)!
//  Cách lấy IP: Mở PowerShell → gõ `ipconfig` → tìm "IPv4 Address"
//  Hoặc dùng: npx expo start --tunnel (không cần cập nhật IP)
// ====================================================================
const DEV_IP = '192.168.1.31'; // <-- ĐỔI IP CỦA MÁY TÍNH BẠN VÀO ĐÂY
const DEV_PORT = '8000';       // <-- Port Django dev server (manage.py runserver)
const DEV_URL = `http://${DEV_IP}:${DEV_PORT}/api`;

// Production URL cho Render deployment
const PROD_URL = 'https://educarelink-backend.onrender.com/api';

// ====================================================================
// Chọn backend theo môi trường (BUG-05: trước đây BASE_URL luôn = PROD_URL,
// DEV_IP là dead code — dev không thể trỏ app tới backend local dù có sửa IP).
//
// Cách bật dev backend (chọn 1):
//   1. Chạy Expo ở dev mode (default): `__DEV__` global = true → tự dùng DEV_URL.
//   2. Set env var EXPO_PUBLIC_USE_DEV_BACKEND=1 trong .env (env-cmd / expo-cli
//      đọc EXPO_PUBLIC_* tự động — không cần react-native-dotenv).
//      Dùng khi muốn ép dùng DEV_URL trên release build để QA local.
//
// Khi release build (production APK), `__DEV__` = false → tự dùng PROD_URL.
// ====================================================================
const useDevBackend =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_USE_DEV_BACKEND === '1');

const BASE_URL = useDevBackend ? DEV_URL : PROD_URL;

// Log 1 lần khi khởi động để dev biết app đang nói chuyện với backend nào
if (useDevBackend) {
  // eslint-disable-next-line no-console
  console.log(`[api/client] DEV mode → BASE_URL = ${BASE_URL}`);
}

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

// Interceptor: Tự động refresh token khi 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Nếu không phải 401 hoặc đã thử refresh rồi → từ chối
    if (error.response?.status !== 401 || originalRequest._retry) {
      // Xoá token nếu 401 và đã retry
      if (error.response?.status === 401) {
        await storage.deleteItem('access_token');
        await storage.deleteItem('refresh_token');
        await storage.deleteItem('user_role');
        await storage.deleteItem('is_staff');
      }
      return Promise.reject(error);
    }

    // Đánh dấu đã thử refresh
    originalRequest._retry = true;

    // Nếu đang refresh → xếp hàng đợi
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      }).catch(err => {
        return Promise.reject(err);
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = await storage.getItem('refresh_token');

      if (!refreshToken) {
        // Không có refresh token → đăng xuất
        await storage.deleteItem('access_token');
        await storage.deleteItem('refresh_token');
        await storage.deleteItem('user_role');
        await storage.deleteItem('is_staff');
        processQueue(error, null);
        return Promise.reject(error);
      }

      // Gọi API refresh token
      const response = await axios.post(`${BASE_URL}/auth/token/refresh/`, {
        refresh: refreshToken
      });

      const { access, refresh } = response.data;

      // Lưu token mới
      await storage.setItem('access_token', access);
      if (refresh) {
        await storage.setItem('refresh_token', refresh);
      }

      // Cập nhật header cho request gốc
      originalRequest.headers.Authorization = `Bearer ${access}`;

      // Xử lý hàng đợi
      processQueue(null, access);

      // Retry request gốc
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Refresh thất bại → đăng xuất
      await storage.deleteItem('access_token');
      await storage.deleteItem('refresh_token');
      await storage.deleteItem('user_role');
      await storage.deleteItem('is_staff');
      processQueue(refreshError, null);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default apiClient;
