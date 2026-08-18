// ====================================================================
// EmergencyAlarmService — Chuông báo động khẩn cấp (Vibration + Audio)
// ====================================================================
// QA-FIX-1 / Spec 2.6: trước đây chỉ dùng Vibration + local notification
// khi offline alert foreground — không có audio alarm thực sự. Parent
// trong môi trường ồn (đường phố, quán café) có thể không nghe thấy
// vibration → bỏ lỡ cảnh báo quan trọng.
//
// QA-FIX-3 / D: asset emergency_alarm.wav đã được bổ sung (3s, 44100Hz,
// 16-bit mono PCM, generated sine siren 800Hz/1000Hz xen kẽ). License:
// generated procedurally — không có vấn đề bản quyền.
//
// Flow:
//   - playEmergencyAlarm(): Vibration pattern dài (loop liên tục) +
//     audio alarm loop (3s asset, isLooping=true).
//   - stopEmergencyAlarm(): dừng audio + vibration.
//   - unloadEmergencyAlarm(): giải phóng resource (gọi khi unmount).
//
// Tolerance:
//   - Nếu expo-av không available (web platform) → fallback Vibration.
//   - Nếu Vibration cũng không available → chỉ log warning (không crash).
//
// Lưu ý quan trọng về nền tảng:
//   - Audio loop CHỈ chạy khi app ở foreground (JS thread chạy).
//   - Khi app background/killed: JS không chạy → audio loop dừng.
//     Remote push do OS xử lý (channel emergency-alerts, sound custom
//     nếu có file + EAS build).
//   - iOS critical alert cần entitlement Apple (đã thêm vào app.json —
//     nhưng cần MANUALLY request trên Apple Developer Portal, có thể bị reject).
// ====================================================================

import { Vibration, Platform } from 'react-native';

// QA-FIX-3 / D: bật static require cho asset âm thanh thực sự.
// File mobile/assets/sounds/emergency_alarm.wav đã được bổ sung.
const ALARM_SOUND_FILE = require('../../assets/sounds/emergency_alarm.wav');

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
  try {
    const mod = await import('expo-av');
    return mod.Audio || mod;
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

        // QA-FIX-3 / D: set Audio mode cho Android + iOS để audio play được
        // khi app foreground + silence switch (iOS) không chặn.
        try {
          await AudioModule.setAudioModeAsync({
            allowsRecordingIOS: false,
            staysActiveInBackground: false,
            interruptionModeIOS: AudioModule.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
            playsInSilentModeIOS: true,  // iOS: phát ngay cả khi switch im lặng
            shouldDuckAndroid: true,
            interruptionModeAndroid: AudioModule.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
            playThroughEarpieceAndroid: false,
          });
        } catch (modeErr) {
          console.warn('[EmergencyAlarm] setAudioModeAsync failed (non-fatal):', modeErr.message);
        }

        soundObject = new AudioModule.Sound();
        await soundObject.loadAsync(ALARM_SOUND_FILE, {
          shouldPlay: true,
          isLooping: true,
          volume: 1.0,
          progressUpdateIntervalMillis: 1000,
        });
        await soundObject.playAsync();
        console.log('[EmergencyAlarm] Audio alarm started (looping, asset=emergency_alarm.wav)');
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
 *
 * QA-FIX-3 / D: unload audio object sau khi stop để giải phóng memory
 * và tránh leak khi gọi play lại nhiều lần.
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
    // Unload để giải phóng resource — tránh leak khi component unmount
    // hoặc khi parent acknowledge alert.
    try {
      await soundObject.unloadAsync();
    } catch (e) {
      // unload fail không fatal — sound object sẽ được replace lần play sau.
      console.warn('[EmergencyAlarm] unloadAsync after stop failed:', e.message);
    }
    soundObject = null;
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
 *
 * QA-FIX-3 / D: nếu đang play thì cũng stop luôn (không để audio
 * tiếp tục loop sau khi component unmount).
 */
export async function unloadEmergencyAlarm() {
  if (soundObject) {
    try {
      // Nếu đang play thì stop trước khi unload.
      try {
        await soundObject.stopAsync();
      } catch (_e) { /* ignore stop error — có thể đã stopped */ }
      await soundObject.unloadAsync();
      console.log('[EmergencyAlarm] Audio alarm unloaded');
    } catch (e) {
      console.warn('[EmergencyAlarm] unloadAsync failed:', e.message);
    }
    soundObject = null;
  }
  // Reset isPlaying để lần sau play lại được
  isPlaying = false;
  // Cancel vibration nếu đang chạy
  try {
    Vibration.cancel();
  } catch (_e) { /* ignore */ }
}

/**
 * Check xem alarm đang play hay không (cho UI test/debug).
 */
export function isAlarmPlaying() {
  return isPlaying;
}
