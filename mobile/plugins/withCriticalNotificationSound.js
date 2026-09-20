/**
 * Config plugin: copy các file âm thanh thông báo vào android/app/src/main/res/raw/
 * + đăng ký Android channel 'educarelink_critical' importance MAX.
 *
 * Step 8.4 (BẮT BUỘC, không optional): mọi push class `critical` của luồng
 * ghép cặp PHẢI kêu to bằng sound. Trên Android, custom notification sound
 * phải nằm trong res/raw/ (lowercase, không extension khi tham chiếu).
 *
 * 2026-09-20 — bộ âm thanh mới theo yêu cầu:
 *   - critical_alert.wav          → channel educarelink_critical (critical khác)
 *   - chuong_carepartner.wav      → channel educarelink_job_offer ("Chuông
 *                                   CarePartner - Có Phụ Huynh Lựa Chọn" —
 *                                   phụ huynh chọn CarePartner; listener mobile
 *                                   lặp 60 giây khi foreground)
 *   - messenger_notification.mp3  → channel educarelink_admin (thông báo
 *                                   admin gửi → nhạc tin nhắn Messenger)
 *   - police_siren.mp3            → channel emergency-alerts (còi hú cảnh
 *                                   sát báo động gửi về phụ huynh — thay
 *                                   emergency_alarm.wav tự sinh cũ)
 *
 * Channel được mobile app tạo lúc khởi động qua expo-notifications
 * (Notifications.setNotificationChannelAsync — xem src/components/
 * NotificationListener.js + App.js). Plugin này đảm bảo CÁC FILE có sẵn
 * trong APK/AAB để channel tham chiếu được.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOUND_FILES = [
  'critical_alert.wav',
  'chuong_carepartner.wav',
  'messenger_notification.mp3',
  'police_siren.mp3',
];

function copySoundFile(androidProjectRoot) {
  const soundsDir = path.resolve(__dirname, '..', 'assets', 'sounds');
  const rawDir = path.resolve(androidProjectRoot, 'app', 'src', 'main', 'res', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  for (const fileName of SOUND_FILES) {
    const sourcePath = path.resolve(soundsDir, fileName);
    const destPath = path.resolve(rawDir, fileName);
    if (!fs.existsSync(sourcePath)) {
      console.warn(
        `[withCriticalNotificationSound] Source file not found: ${sourcePath} — skip copy. ` +
        `Channel liên quan sẽ fallback về default sound.`
      );
      continue;
    }
    fs.copyFileSync(sourcePath, destPath);
    console.log(`[withCriticalNotificationSound] Copied: ${sourcePath} → ${destPath}`);
  }
}

module.exports = function withCriticalNotificationSound(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const androidProjectRoot = path.resolve(config.modRequest.projectRoot, 'android');
      copySoundFile(androidProjectRoot);
      return config;
    },
  ]);
};
