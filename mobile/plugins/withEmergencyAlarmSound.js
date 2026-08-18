/**
 * Config plugin: copy emergency_alarm.wav vào android/app/src/main/res/raw/
 *
 * QA-FIX-3 / D + Spec 2.6: channel 'emergency-alerts' của expo-notifications
 * tham chiếu đến file 'emergency_alarm.wav'. Trên Android, custom notification
 * sound phải nằm trong res/raw/ (lowercase, không extension khi reference).
 *
 * Expo prebuild mặc định KHÔNG copy asset từ mobile/assets/sounds/ vào
 * android/app/src/main/res/raw/ → cần plugin này để copy.
 *
 * Reference: https://docs.expo.dev/versions/latest/sdk/notifications/#custom-notification-sounds
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function copySoundFile(androidProjectRoot) {
  const sourcePath = path.resolve(__dirname, '..', 'assets', 'sounds', 'emergency_alarm.wav');
  const rawDir = path.resolve(androidProjectRoot, 'app', 'src', 'main', 'res', 'raw');
  const destPath = path.resolve(rawDir, 'emergency_alarm.wav');

  if (!fs.existsSync(sourcePath)) {
    console.warn(
      `[withEmergencyAlarmSound] Source file not found: ${sourcePath} — skip copy. ` +
      `Channel 'emergency-alerts' sẽ fallback về default sound.`
    );
    return;
  }

  fs.mkdirSync(rawDir, { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
  console.log(`[withEmergencyAlarmSound] Copied: ${sourcePath} → ${destPath}`);
}

module.exports = function withEmergencyAlarmSound(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const androidProjectRoot = path.resolve(config.modRequest.projectRoot, 'android');
      copySoundFile(androidProjectRoot);
      return config;
    },
  ]);
};
