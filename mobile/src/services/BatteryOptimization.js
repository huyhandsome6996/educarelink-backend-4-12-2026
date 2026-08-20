// ====================================================================
// BatteryOptimization — Helper mở cài đặt Android để giảm bị kill app
//
// Vấn đề: Android (đặc biệt Xiaomi/Oppo/Samsung/Vivo) tự động "tối ưu
// pin" → kill app đang chạy nền → LocationService ngừng gửi heartbeat
// → backend báo OFFLINE giả → phụ huynh nhận cảnh báo khẩn cấp nhầm.
//
// Giải pháp: hướng dẫn user mở đúng màn hình cài đặt của máy để tắt
// tối ưu pin / ghim app / bật auto-start. Dùng expo-intent-launcher
// để mở thẳng màn hình (không bắt user tự tìm đường trong Settings).
//
// Lưu ý:
//   - ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS yêu cầu permission
//     android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS — chưa khai
//     trong app.json → ta không dùng intent dialog đó, dùng danh sách
//     IGNORE_BATTERY_OPTIMIZATION_SETTINGS (hoạt động phổ biến nhất,
//     list mọi app, user chọn app cần bỏ tối ưu).
//   - "Ghim app" (pin) và "Auto-start" là tính năng riêng của từng OEM
//     (MIUI, ColorOS, OneUI,...) không có intent chuẩn — thay bằng cách
//     mở trang chi tiết app để user thấy "Battery"/"Battery saver"/"Auto
//     launch" nếu có (tên khác nhau tuỳ OEM).
// ====================================================================
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';

/**
 * Lấy package name của app (vd: com.educarelink.app).
 * dùng làm extra cho các intent battery optimization.
 */
export function getAppPackageName(): string {
  return Application.applicationId || '';
}

/**
 * Mở danh sách "Ignored battery optimizations" (Android Settings).
 * User chọn app EduCareLink → chọn "Không tối ưu hoá / Don't optimize".
 * Hoạt động trên mọi thiết bị Android 6+ (không cần permission đặc biệt).
 */
export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
    );
    return true;
  } catch (e) {
    console.warn('[BatteryOptimization] openBatteryOptimizationSettings failed:', e?.message || e);
    return false;
  }
}

/**
 * Mở trang chi tiết app (Application Details).
 * Nơi user có thể vào "Battery", "Battery saver", "Auto-start", "Pin lưu
 * ứng dụng" (tuỳ OEM: Xiaomi/Oppo/Samsung/Vivo đặt tên khác nhau).
 */
export async function openAppDetailsSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const pkg = getAppPackageName();
  if (!pkg) return false;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
      { data: `package:${pkg}` }
    );
    return true;
  } catch (e) {
    console.warn('[BatteryOptimization] openAppDetailsSettings failed:', e?.message || e);
    return false;
  }
}

/**
 * Mở màn hình cài đặt Battery Saver chung.
 */
export async function openBatterySaverSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.BATTERY_SAVER_SETTINGS
    );
    return true;
  } catch (e) {
    console.warn('[BatteryOptimization] openBatterySaverSettings failed:', e?.message || e);
    return false;
  }
}