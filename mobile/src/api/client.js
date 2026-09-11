import axios from 'axios';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';

// ====================================================================
// DEV BACKEND URL — ĐỌC TỪ ENV, KHÔNG HARDCODE IP MÁY CÁ NHÂN.
// Mỗi dev tự cấu hình trong mobile/.env (không commit):
//   EXPO_PUBLIC_USE_DEV_BACKEND=1
//   EXPO_PUBLIC_DEV_BACKEND_URL=http://<IP-LAN-của-bạn>:8000/api
// (Android emulator trỏ về host machine: http://10.0.2.2:8000/api)
// Mặc định khi thiếu env = localhost:8000 (chỉ dùng khi dev opt-in).
// ====================================================================
const DEV_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_DEV_BACKEND_URL) ||
  'http://localhost:8000/api';

// Production URL cho Render deployment (env override được, default = Render)
const PROD_URL =
  (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
  'https://educarelink-backend.onrender.com/api';

// ====================================================================
// Chọn backend theo môi trường.
//
// REGRESSION FIX (BUG-05 round 2): phiên bản trước đây bật DEV_URL tự động
// khi `__DEV__ === true` — nhưng `__DEV__` true cho MỌI người chạy `npx expo
// start`, kể cả những người không có backend local. App silent break cho mọi
// tester/dev khác.
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

// Xuất cho module khác (VD MapPickerModal) dựng URL endpoint phái sinh,
// đảm bảo toàn app dùng MỘT nguồn base URL duy nhất (env-driven).
export const API_BASE_URL = BASE_URL;

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
  timeout: 45000,
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

      // Fix H10: reset isRefreshing TRƯỚC khi processQueue để tránh race.
      // Trước đây isRefreshing được reset trong finally (sau processQueue) →
      // khi queued promises resolve và retry ngay, nếu retry 401 thì chúng
      // thấy isRefreshing vẫn true → bị queue lại nhưng không bao giờ được
      // process (vì processQueue đã chạy xong) → hang forever. Reset sớm
      // để retry mới có thể start fresh refresh attempt nếu cần.
      isRefreshing = false;

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
      // Fix H10: reset isRefreshing TRƯỚC khi processQueue (xem comment trên).
      isRefreshing = false;
      processQueue(refreshError, null);
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
