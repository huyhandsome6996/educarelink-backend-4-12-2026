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
// Chọn backend theo môi trường.
//
// REGRESSION FIX (BUG-05 round 2): phiên bản trước đây bật DEV_URL tự động
// khi `__DEV__ === true` — nhưng `__DEV__` true cho MỌI người chạy `npx expo
// start`, không chỉ người đang ở LAN 192.168.1.31. App silent break cho mọi
// tester/dev khác vì họ không có backend local ở IP đó.
//
// Quy tắc mới: PROD_URL là default trong MỌI trường hợp (cả dev lẫn release).
// DEV_URL chỉ được dùng khi dev EXPLICITLY opt-in qua env var
// `EXPO_PUBLIC_USE_DEV_BACKEND=1` (set trong .env hoặc shell). Như vậy chỉ
// người thực sự muốn test local backend mới cần config, mặc định app luôn
// nói chuyện với Render production — đúng behavior cho tester/dev thông thường.
// ====================================================================
const useDevBackend =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_USE_DEV_BACKEND === '1');

const BASE_URL = useDevBackend ? DEV_URL : PROD_URL;

// Log 1 lần khi khởi động để dev biết app đang nói chuyện với backend nào
if (useDevBackend) {
  // eslint-disable-next-line no-console
  console.log(`[api/client] DEV backend opted-in → BASE_URL = ${BASE_URL}`);
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
