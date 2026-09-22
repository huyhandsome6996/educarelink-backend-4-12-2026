# Thư mục âm thanh thông báo & cảnh báo

Thư mục chứa file âm thanh dùng cho các Android channel + expo-av trong app
(Web tương ứng nằm ở `frontend/static/sounds/`).

## 🎵 Bộ âm thanh hiện tại (cập nhật 2026-09-20)

| File | Dùng cho | Channel / Nơi phát | Nguồn |
|------|----------|--------------------|-------|
| `critical_alert.wav` | Push `critical` luồng ghép cặp (không phải job_assigned) | `educarelink_critical` + NotificationListener foreground | Generated procedurally (siren 800/1000Hz, 3s, 44100Hz mono) |
| `chuong_carepartner.wav` | **job_assigned — Phụ huynh lựa chọn CarePartner** | `educarelink_job_offer` + NotificationListener **LẶP 60 giây** khi foreground | "Chuông CarePartner - Có Phụ Huynh Lựa Chọn.wav" do chủ hệ thống cung cấp (16-bit mono 44100Hz) |
| `messenger_notification.mp3` | **admin_notification — Admin gửi thông báo** | `educarelink_admin` + NotificationListener foreground 1 lần | "Nhạc thông báo tin nhắn Messenger.mp3" do chủ hệ thống cung cấp (MP3 128kbps) |
| `police_siren.mp3` | **Báo động gửi về phụ huynh** (device_offline critical, random_verification, SOS) | `emergency-alerts` + EmergencyAlarmService.js loop | "Police Siren - Tiếng Còi Hú Xe Cảnh Sát, Công An.mp3" do chủ hệ thống cung cấp (MP3 128kbps) |
| `emergency_alarm.wav` | (legacy — còn trong repo để backward-compat với app cũ; code mới KHÔNG dùng) | — | Generated procedurally |

## Cách file được dùng

1. **Channel Android** (App.js + utils/notifications.js):
   `sound: 'chuong_carepartner.wav' | 'messenger_notification.mp3' | 'police_siren.mp3'`
   — Android native push sẽ play file trong `res/raw/` (copy bởi
   `plugins/withCriticalNotificationSound.js` khi prebuild).
2. **NotificationListener.js** (foreground): expo-av phát đúng file theo
   `data.type` — `job_assigned` → chuông lặp **1 PHÚT**; `admin_notification`
   → nhạc Messenger 1 lần; critical khác → `critical_alert.wav`.
3. **EmergencyAlarmService.js** (foreground, báo động phụ huynh):
   `require('../../assets/sounds/police_siren.mp3')` với `isLooping: true`.

## Lưu ý quan trọng về nền tảng

- **Audio loop CHỈ chạy khi app ở FOREGROUND** (JS thread chạy).
- Khi app **background/killed**: JS không chạy → audio loop KHÔNG chạy. Remote
  push do OS xử lý (channel tương ứng + sound trong res/raw + EAS build).
  Đây là giới hạn vật lý của React Native.
- **iOS critical alert**: cần entitlement Apple (Critical Alerts Entitlement) —
  chưa có → UNTESTABLE trên iOS cho đến khi được Apple approve.
- **Android full-screen intent + bypass DnD**: cần EAS Build (không hoạt động
  trên Expo Go). Channel `emergency-alerts` đã set `bypassDnd: true` +
  `USE_FULL_SCREEN_INTENT` permission trong app.json.

## Cách thay file (nếu muốn âm thanh khác)

1. Thay file tương ứng trong `mobile/assets/sounds/` (giữ nguyên tên file)
   VÀ trong `frontend/static/sounds/` (bản web cùng tên).
2. MP3/WAV đều được (Android hỗ trợ cả hai trong res/raw; iOS push sound
   khuyến nghị wav/caf/aiff — nếu cần iOS sound riêng hãy convert).
3. Không cần sửa code — `require()` và channel đã trỏ tới đường dẫn này.
4. Chạy lại `eas build` để bundle asset mới vào native binary.
