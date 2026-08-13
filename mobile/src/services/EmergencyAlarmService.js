// ====================================================================
// EmergencyAlarmService — Chuông báo động khẩn cấp (Vibration + optional Audio)
// ====================================================================
// QA-FIX-1 / Spec 2.6: trước đây chỉ dùng Vibration + local notification
// khi offline alert foreground — không có audio alarm thực sự. Parent
// trong môi trường ồn (đường phố, quán café) có thể không nghe thấy
// vibration → bỏ lỡ cảnh báo quan trọng.
//
// Flow:
//   - playEmergencyAlarm(): Vibration pattern dài (loop liên tục) +
//     optional audio alarm nếu có asset emergency_alarm.wav.
//   - stopEmergencyAlarm(): dừng audio + vibration.
//   - unloadEmergencyAlarm(): giải phóng resource (gọi khi unmount).
//
// Tolerance:
//   - Nếu asset emergency_alarm.wav KHÔNG tồn tại (hiện tại chưa có —
//     xem mobile/assets/sounds/README.md) → chỉ dùng Vibration pattern.
//   - Nếu expo-av không available (web platform) → fallback Vibration.
//   - Nếu Vibration cũng không available → chỉ log warning (không crash).
//
// Khi project owner bổ sung file emergency_alarm.wav:
//   1. Đặt file tại mobile/assets/sounds/emergency_alarm.wav
//   2. Uncomment dòng `const ALARM_SOUND_FILE = require(...)` bên dưới
//   3. Audio sẽ tự động load khi playEmergencyAlarm() được gọi.
// ====================================================================

import { Vibration, Platform } from 'react-native';

// Audio import — lazy loaded để tránh crash bundle khi asset chưa tồn tại.
// Sử dụng dynamic import trong playEmergencyAlarm() nếu cần.
let Audio = null;
let ALARM_SOUND_FILE = null;

// Uncomment dòng dưới khi đã có file mobile/assets/sounds/emergency_alarm.wav
// const ALARM_SOUND_FILE = require('../../assets/sounds/emergency_alarm.wav');

let soundObject = null;
let isPlaying = false;

// Vibration pattern khẩn cấp: 2s rung, 0.5s nghỉ, lặp vô hạn
// (Vibration.vibrate với pattern tự loop nếu repeat=true)
const VIBRATION_PATTERN = [0, 2000, 500, 2000, 500, 2000, 500, 2000];
const VIBRATION_REPEAT = true;

/**
 * Lazy load expo-av Audio module (tránh crash bundle nếu expo-av chưa install).
 */
async function _loadAudioModule() {
  if (Audio) return Audio;
  try {
    const mod = await import('expo-av');
    Audio = mod.Audio || mod;
    return Audio;
  } catch (e) {
    console.warn('[EmergencyAlarm] expo-av không khả dụng:', e.message);
    return null;
  }
}

/**
 * Phát chuông báo động khẩn cấp (loop liên tục).
 * Idempotent: nếu đang play rồi thì skip.
 *
 * @param {object} options - tuỳ chọn (hiện chưa dùng, dành cho future)
 * @returns {Promise<boolean>} true nếu audio play thành công, false nếu fallback Vibration
 */
export async function playEmergencyAlarm(options = {}) {
  if (isPlaying) {
    console.log('[EmergencyAlarm] Already playing — skip');
    return true;
  }
  isPlaying = true;

  let audioPlayed = false;

  // === Thử phát audio qua expo-av (preferred) — chỉ khi có asset file ===
  if (Platform.OS !== 'web' && ALARM_SOUND_FILE) {
    try {
      const AudioModule = await _loadAudioModule();
      if (AudioModule) {
        await unloadEmergencyAlarm(); // cleanup instance cũ nếu có

        soundObject = new AudioModule.Sound();
        await soundObject.loadAsync(ALARM_SOUND_FILE, {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
        });
        await soundObject.playAsync();
        console.log('[EmergencyAlarm] Audio alarm started (looping)');
        audioPlayed = true;
      }
    } catch (e) {
      console.warn(
        '[EmergencyAlarm] Audio load failed — fallback to Vibration only:',
        e.message
      );
      soundObject = null;
    }
  } else if (Platform.OS === 'web') {
    console.log('[EmergencyAlarm] Web platform — skip audio, use Vibration only');
  }

  // === Vibration (luôn chạy, song song với audio nếu có) ===
  // Tăng cường cảnh báo kể cả khi audio đang play.
  try {
    Vibration.vibrate(VIBRATION_PATTERN, VIBRATION_REPEAT);
    if (!audioPlayed) {
      console.log('[EmergencyAlarm] Vibration alarm started (looping, no audio)');
    }
  } catch (e) {
    console.warn('[EmergencyAlarm] Vibration failed:', e.message);
  }

  return audioPlayed;
}

/**
 * Dừng chuông báo động + vibration.
 * Idempotent: nếu chưa play thì skip.
 */
export async function stopEmergencyAlarm() {
  if (!isPlaying) {
    return;
  }
  isPlaying = false;

  // Stop audio
  if (soundObject) {
    try {
      await soundObject.stopAsync();
      console.log('[EmergencyAlarm] Audio alarm stopped');
    } catch (e) {
      console.warn('[EmergencyAlarm] stopAsync failed:', e.message);
    }
  }

  // Stop vibration
  try {
    Vibration.cancel();
  } catch (e) {
    console.warn('[EmergencyAlarm] Vibration.cancel failed:', e.message);
  }
}

/**
 * Giải phóng resource (gọi khi unmount component).
 * Unload sound object khỏi memory — tránh leak.
 */
export async function unloadEmergencyAlarm() {
  if (soundObject) {
    try {
      await soundObject.unloadAsync();
    } catch (e) {
      console.warn('[EmergencyAlarm] unloadAsync failed:', e.message);
    }
    soundObject = null;
  }
}

/**
 * Check xem alarm đang play hay không (cho UI test/debug).
 */
export function isAlarmPlaying() {
  return isPlaying;
}
