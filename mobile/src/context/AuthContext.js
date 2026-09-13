import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { storage } from '../utils/storage';
import { login as loginApi, register as registerApi, getProfile } from '../api/auth';
import { completeOnboarding as completeOnboardingApi } from '../api/onboarding';
import { registerForPushNotificationsAsync } from '../utils/notifications';
import { sendGpsHeartbeat, setMatchingGpsConsent } from '../api/tracking';
import apiClient from '../api/client';

// ====================================================================
// v1.1.4 FIX (main): Default context value an toàn (không null)
// Trước đây default là null → nếu useAuth() được gọi ngoài AuthProvider
// (lỗi architect), `const { user } = null` crash app.
// Giờ default là object có user: null, isLoading: true, các hàm no-op
// → component gọi useAuth() ngoài AuthProvider vẫn render được (không crash),
// chỉ không có auth functionality. Lớp phòng vệ 2 cho bug v1.1.4.
// ====================================================================
const NOOP_ASYNC = async () => {
  console.warn('[AuthContext] useAuth() called outside AuthProvider — returning no-op');
};
const AuthContext = createContext({
  user: null,
  isLoading: true,
  login: NOOP_ASYNC,
  register: NOOP_ASYNC,
  logout: NOOP_ASYNC,
  loginWithOAuth: NOOP_ASYNC,
  refreshUser: NOOP_ASYNC,
  completeOnboardingInContext: NOOP_ASYNC,
});

// ====================================================================
// v1.1.2 FIX (main): Push token registration chạy nền (fire-and-forget)
// Bug cũ: `await registerForPushNotificationsAsync()` block login flow
// 5+ phút nếu Expo Push service hang → user thấy spinner "Đăng nhập"
// treo vô hạn sau khi logout → login lại.
//
// Fix: Tách push registration thành helper async riêng, KHÔNG await trong
// login()/loginWithOAuth(). Gọi helper rồi tiếp tục ngay — user được navigate
// sang home screen ngay lập tức. Push token nếu lấy được sẽ tự sync lên backend
// trong nền.
//
// Lớp phòng vệ 2: bản thân `registerForPushNotificationsAsync` trong
// notifications.js cũng đã có timeout 8s, nên dù có race condition cũng
// không bao giờ hang vô hạn.
// ====================================================================
async function syncPushTokenToBackend() {
  try {
    const pushToken = await registerForPushNotificationsAsync();
    if (!pushToken) return;
    await apiClient.patch('/profile/', { expo_push_token: pushToken });
    // Task F (2026-09-14): upsert DeviceToken đa thiết bị — trước đây bảng này
    // KHÔNG bao giờ được ghi (chỉ fallback User.expo_push_token).
    try {
      await apiClient.post('/matching/device-token/', {
        platform: 'expo', token: pushToken,
      });
    } catch (e2) { /* non-fatal — PATCH profile đã ghi field cũ */ }
    console.log('[AuthContext] Push token synced to backend');
  } catch (e) {
    // Non-fatal — push notification là tính năng phụ, không block app
    console.warn('[AuthContext] Push token sync failed (non-fatal):', e?.message || e);
  }
}

// ====================================================================
// Defect 4 (2026-09-13): GPS real-time cho ghép cặp — chống "đăng ký Huế
// đang ở Hà Nội vẫn bị giao việc Huế".
//
// Task E (2026-09-14) — "GPS 100%": gửi khi LOGIN, khi app về FOREGROUND,
// và LẶP LẠI MỖI 5 PHÚT khi app active (AuthProvider useEffect bên dưới).
// Xin quyền vị trí foreground qua expo-location (CHỈ sync khi user đã cấp
// quyền thiết bị), rồi POST /tracking/gps-heartbeat/.
// Consent hệ thống: User.matching_gps_consent (toggle onboarding) HOẶC
// LocationConsent 'granted' cũ. Chưa consent → backend trả 200
// gps_sync='no_matching_consent' → dừng gửi 24h (không spam, không 403 im
// lặng) — matching tự fallback địa chỉ hồ sơ.
// FIRE AND FORGET — không block login, lỗi là non-fatal.
// ====================================================================
const GPS_NO_CONSENT_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24h

export async function syncGpsToBackend(user) {
  try {
    if (!user || user.role !== 'worker') return;
    // Đang backoff vì chưa consent matching-GPS → không gửi (trừ khi vừa bật consent)
    const blockedUntil = parseInt(await storage.getItem('gps_no_consent_until') || '0', 10);
    if (blockedUntil && Date.now() < blockedUntil) return;
    const Location = require('expo-location');
    if (!Location?.requestForegroundPermissionsAsync) return; // môi trường không có module (vd web/test)
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return; // chưa cấp quyền thiết bị → không xin xung
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy?.Balanced ?? 3,
    });
    const lat = pos?.coords?.latitude;
    const lng = pos?.coords?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;
    const res = await sendGpsHeartbeat({
      latitude: lat,
      longitude: lng,
      accuracy: pos.coords.accuracy ?? undefined,
    });
    if (res?.data?.gps_sync === 'no_matching_consent') {
      // Chưa consent hệ thống → backoff 24h; user bật toggle consent sẽ clear
      await storage.setItem('gps_no_consent_until', String(Date.now() + GPS_NO_CONSENT_BACKOFF_MS));
      return;
    }
    await storage.setItem('gps_no_consent_until', '0');
    console.log('[AuthContext] GPS heartbeat synced:', res?.data?.gps_sync);
  } catch (e) {
    // Lỗi mạng/định vị — non-fatal, chu kỳ 5 phút sau thử lại
    console.warn('[AuthContext] GPS sync failed (non-fatal):', e?.message || e);
  }
}

// Task E: bật/tắt consent "Cho phép dùng vị trí để gợi ý việc gần bạn".
// Bật xong → clear backoff để heartbeat gửi ngay chu kỳ kế tiếp.
export async function updateMatchingGpsConsent(granted) {
  const res = await setMatchingGpsConsent(granted);
  if (granted) {
    await storage.setItem('gps_no_consent_until', '0');
  } else {
    await storage.setItem('gps_no_consent_until', String(Date.now() + GPS_NO_CONSENT_BACKOFF_MS));
  }
  return res?.data;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // Thông tin user đang đăng nhập
  const [isLoading, setIsLoading] = useState(true); // Kiểm tra token lúc app khởi động
  // Track mounted để tránh setState sau unmount (defensive)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Task E (2026-09-14): GPS 100% — app foreground + lặp mỗi 5 phút ──
  // Login + mở lại app đã sync ở checkToken()/login(). Hook này bảo đảm:
  // app về 'active' → sync ngay; app active kéo dài → sync mỗi 5 phút.
  useEffect(() => {
    if (!user || user.role !== 'worker') return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncGpsToBackend(user);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') syncGpsToBackend(user);
    }, 5 * 60 * 1000);
    return () => {
      sub?.remove?.();
      clearInterval(interval);
    };
  }, [user]);

  // Khi app mở lại — kiểm tra xem đã có token chưa
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await storage.getItem('access_token');
        if (token) {
          // Lấy profile từ server để đảm bảo token còn hợp lệ
          const response = await getProfile();
          setUser(response.data);
          // QA-FIX-2 / B2 (feature): đảm bảo user_id có trong storage (cho LocationService)
          if (response.data?.id) {
            await storage.setItem('user_id', String(response.data.id));
          }
          // Defect 4: GPS sync nền cho CarePartner khi mở lại app (fire-and-forget)
          syncGpsToBackend(response.data);
        }
      } catch (error) {
        // Token hết hạn hoặc lỗi — xoá hết
        await storage.deleteItem('access_token');
        await storage.deleteItem('user_role');
        await storage.deleteItem('user_id');
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

    // Lấy full profile — đây là bước cuối block login
    const profileResp = await getProfile();
    setUser(profileResp.data);

    // QA-FIX-2 / B2 (feature): lưu user_id vào storage để LocationService isolate queue.
    // Trước đây không lưu → LocationService không biết user nào đang login
    // → queue SQLite có thể bị flush nhầm giữa 2 user.
    if (profileResp.data?.id) {
      await storage.setItem('user_id', String(profileResp.data.id));
    }

    // v1.1.2 FIX (main): Push token registration — FIRE AND FORGET.
    // Không await — user được navigate sang home screen ngay lập tức.
    // Push token sẽ sync nền, không ảnh hưởng login UX.
    syncPushTokenToBackend();

    // Defect 4: GPS real-time sync nền cho CarePartner (fire-and-forget)
    syncGpsToBackend(profileResp.data);

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

    // QA-FIX-2 / B2 (feature): lưu user_id cho LocationService
    if (profileResp.data?.id) {
      await storage.setItem('user_id', String(profileResp.data.id));
    }

    // v1.1.2 FIX (main): Push token registration — FIRE AND FORGET (giống login)
    syncPushTokenToBackend();

    // Defect 4: GPS real-time sync nền cho CarePartner (fire-and-forget)
    syncGpsToBackend(profileResp.data);

    return profileResp.data;
  };

  // QA-FIX-2 / G (feature): logout cleanup — stop background tracking + xóa queue
  // SQLite của user hiện tại + clear storage. Tránh worker cũ tiếp tục
  // gửi heartbeat/location sau logout, tránh user mới auto-resume task
  // của user cũ.
  const logout = async () => {
    // Capture userId trước khi clear storage
    const userIdStr = await storage.getItem('user_id');
    const userId = userIdStr ? parseInt(userIdStr, 10) : null;

    // Stop background tracking + cleanup listeners + xóa queue của user
    try {
      const { cleanupOnLogout } = await import('../services/LocationService');
      if (userId) {
        await cleanupOnLogout(userId);
      }
    } catch (e) {
      console.warn('Logout: cleanup LocationService failed:', e);
    }

    await storage.deleteItem('access_token');
    await storage.deleteItem('refresh_token');
    await storage.deleteItem('user_role');
    await storage.deleteItem('is_staff');
    await storage.deleteItem('user_id');
    await storage.deleteItem('tracking_task_id');
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
