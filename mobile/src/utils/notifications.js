import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ====================================================================
// v1.1.2 FIX: Timeout cho getExpoPushTokenAsync
// Bug: Trong Expo Go (SDK 53+) và một số device thật, lời gọi
// `Notifications.getExpoPushTokenAsync()` có thể HANG vô thời hạn —
// không resolve, không reject. Khi đó `await registerForPushNotificationsAsync()`
// trong AuthContext.login() block vô hạn → user thấy spinner "Đăng nhập"
// 5+ phút, app tưởng treo.
//
// Fix: race giữa lời gọi thật và một timeout promise 8s. Nếu timeout thắng
// trước → trả null, log cảnh báo, không block login flow.
// (Bổ sung: AuthContext cũng đã được refactor để fire-and-forget push
// registration, nhưng timeout này là lớp phòng vệ thứ 2.)
// ====================================================================
const PUSH_TOKEN_TIMEOUT_MS = 8000;

function _withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    try {
      await _withTimeout(
        Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        }),
        3000,
        'setNotificationChannelAsync'
      );
    } catch (e) {
      console.warn('[notifications] setNotificationChannelAsync failed/timed out:', e?.message || e);
    }
  }

  if (!Device.isDevice) {
    console.log('[notifications] Phải dùng thiết bị thật để nhận Push Notifications');
    return null;
  }

  // 1. Xin quyền thông báo (có timeout 4s — permission dialog thường nhanh)
  try {
    const { status: existingStatus } = await _withTimeout(
      Notifications.getPermissionsAsync(),
      4000,
      'getPermissionsAsync'
    );
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await _withTimeout(
        Notifications.requestPermissionsAsync(),
        4000,
        'requestPermissionsAsync'
      );
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[notifications] Không được cấp quyền thông báo');
      return null;
    }
  } catch (e) {
    console.warn('[notifications] Permission error (có thể do Expo Go SDK 53+):', e?.message || e);
    return null;
  }

  // 2. Lấy Expo push token (có timeout 8s — đây là bước hay hang)
  try {
    // Fix C1: projectId phải là EAS project ID (UUID), không phải slug.
    // Nếu dùng slug ('educarelink') → Expo Push API trả token invalid → push silent fail.
    const result = await _withTimeout(
      Notifications.getExpoPushTokenAsync({
        projectId: '3e841ddf-23c3-42ce-a2e1-8827c06311a2',
      }),
      PUSH_TOKEN_TIMEOUT_MS,
      'getExpoPushTokenAsync'
    );
    token = result?.data;
    if (token) {
      console.log('[notifications] Push token registered:', token.substring(0, 30) + '...');
    }
  } catch (e) {
    // Expo Go (SDK 53+) không hỗ trợ push token đầy đủ → log và trả null,
    // KHÔNG throw để caller không bị block.
    console.warn(
      '[notifications] getExpoPushTokenAsync failed/timed out (thường gặp trong Expo Go):',
      e?.message || e
    );
  }

  return token || null;
}
