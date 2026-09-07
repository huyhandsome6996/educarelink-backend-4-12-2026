// ============================================================
// Regression test — BUG #3 (QA report 2026-09-07, HEAD 8e9baf7)
// App.js PHẢI: (1) import + mount <NotificationListener />, (2) đăng ký
// Android channel 'educarelink_critical' (importance MAX + sound
// critical_alert.wav). Nếu thiếu → backend gửi channelId mà device không
// có channel → rơi về sound mặc định, yêu cầu "kêu to" thất bại.
// Kèm theo: expo-av + expo-haptics phải có trong dependencies.
// ============================================================
const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..', '..');
const appJs = fs.readFileSync(path.join(mobileRoot, 'App.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));

describe('App.js — channel educarelink_critical (BUG #3)', () => {
  test('import NotificationListener từ src/components', () => {
    expect(appJs).toMatch(/import\s+NotificationListener\s+from\s+'\.\/src\/components\/NotificationListener'/);
  });

  test('mount <NotificationListener /> trong AppContent (bên trong AuthProvider)', () => {
    expect(appJs).toMatch(/<NotificationListener\s*\/>/);
    // AppContent render fragment chứa AppNavigator + NotificationListener
    const appContentIdx = appJs.indexOf('function AppContent()');
    const mountIdx = appJs.indexOf('<NotificationListener />');
    expect(appContentIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeGreaterThan(appContentIdx);
  });

  test("đăng ký channel 'educarelink_critical' với sound critical_alert.wav", () => {
    expect(appJs).toMatch(/setNotificationChannelAsync\(\s*'educarelink_critical'/);
    expect(appJs).toMatch(/sound:\s*'critical_alert\.wav'/);
  });

  test('channel dùng importance MAX', () => {
    const idx = appJs.indexOf("'educarelink_critical'");
    const chunk = appJs.slice(idx, idx + 800);
    expect(chunk).toMatch(/AndroidImportance\.MAX/);
  });
});

describe('package.json — deps cho NotificationListener (G7)', () => {
  test('expo-av có trong dependencies', () => {
    expect(pkg.dependencies).toHaveProperty('expo-av');
  });

  test('expo-haptics có trong dependencies', () => {
    expect(pkg.dependencies).toHaveProperty('expo-haptics');
  });
});

describe('NotificationListener component — tự thân đúng', () => {
  const listenerSrc = fs.readFileSync(
    path.join(mobileRoot, 'src', 'components', 'NotificationListener.js'), 'utf8');

  test("đăng ký channel 'educarelink_critical' khi app khởi động", () => {
    expect(listenerSrc).toMatch(/setNotificationChannelAsync\(\s*CRITICAL_CHANNEL_ID/);
    expect(listenerSrc).toContain("'educarelink_critical'");
  });

  test('phát sound + haptic cho push class critical khi foreground', () => {
    expect(listenerSrc).toMatch(/import\s+\*\s+as\s+AV\s+from\s+'expo-av'/);
    expect(listenerSrc).toMatch(/import\s+\*\s+as\s+Haptics\s+from\s+'expo-haptics'/);
    expect(listenerSrc).toMatch(/klass\s*===\s*'critical'/);
  });
});
