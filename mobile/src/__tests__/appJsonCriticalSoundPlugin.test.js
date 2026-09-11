// ============================================================
// Regression test — BUG #1 (QA report 2026-09-07, HEAD 8e9baf7)
// app.json PHẢI đăng ký plugin './plugins/withCriticalNotificationSound'
// để `expo prebuild` copy critical_alert.wav vào res/raw/ — nếu không,
// Android channel 'educarelink_critical' sẽ rơi về sound mặc định.
// Kèm theo: version bump 1.4.2 / versionCode 23 (22 đã lên Google Play).
// ============================================================
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..', '..');
const appJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'app.json'), 'utf8')).expo;

describe('app.json — plugin âm thanh critical (BUG #1)', () => {
  test('expo.plugins chứa ./plugins/withCriticalNotificationSound', () => {
    expect(appJson.plugins).toContain('./plugins/withCriticalNotificationSound');
  });

  test('giữ nguyên plugin emergency alarm cũ', () => {
    expect(appJson.plugins).toContain('./plugins/withEmergencyAlarmSound');
  });

  test('file plugin tồn tại trên đĩa', () => {
    const p = path.join(appRoot, 'plugins', 'withCriticalNotificationSound.js');
    expect(fs.existsSync(p)).toBe(true);
  });

  test('file sound critical_alert.wav tồn tại', () => {
    const p = path.join(appRoot, 'assets', 'sounds', 'critical_alert.wav');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).size).toBeGreaterThan(100000); // ~258KB siren 3s
  });

  test('version = 1.4.4 và android.versionCode = 27 (26 đã lên internal — vc27 chặn treo đăng bài: timeout 45/60s + thông báo lỗi thân thiện)', () => {
    expect(appJson.version).toBe('1.4.4');
    expect(appJson.android.versionCode).toBe(27);
  });
});
