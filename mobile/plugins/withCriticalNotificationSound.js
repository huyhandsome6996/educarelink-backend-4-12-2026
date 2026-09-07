/**
 * Config plugin: copy critical_alert.wav vào android/app/src/main/res/raw/
 * + đăng ký Android channel 'educarelink_critical' importance MAX.
 *
 * Step 8.4 (BẮT BUỘC, không optional): mọi push class `critical` của luồng
 * ghép cặp PHẢI kêu to bằng sound 'critical_alert.wav'. Trên Android, custom
 * notification sound phải nằm trong res/raw/ (lowercase, không extension).
 *
 * Channel 'educarelink_critical' được mobile app tạo lúc khởi động qua
 * expo-notifications (Notifications.setNotificationChannelAsync — xem
 * src/components/NotificationListener.js). Plugin này đảm bảo FILE WAV
 * có sẵn trong APK/AAB để channel tham chiếu được.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function copySoundFile(androidProjectRoot) {
  const sourcePath = path.resolve(__dirname, '..', 'assets', 'sounds', 'critical_alert.wav');
  const rawDir = path.resolve(androidProjectRoot, 'app', 'src', 'main', 'res', 'raw');
  const destPath = path.resolve(rawDir, 'critical_alert.wav');

  if (!fs.existsSync(sourcePath)) {
    console.warn(
      `[withCriticalNotificationSound] Source file not found: ${sourcePath} — skip copy. ` +
      `Channel 'educarelink_critical' sẽ fallback về default sound.`
    );
    return;
  }

  fs.mkdirSync(rawDir, { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
  console.log(`[withCriticalNotificationSound] Copied: ${sourcePath} → ${destPath}`);
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
