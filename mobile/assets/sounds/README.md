# Thư mục âm thanh cảnh báo khẩn cấp

Thư mục này chứa file âm thanh còi báo động dùng cho channel Android `emergency-alerts`
(Phần 2 — báo động khi CarePartner mất kết nối + Phần 3 — xác minh ngẫu nhiên).

## ⚠️ TODO — cần bổ sung file âm thanh thật

Hiện tại chưa có file `emergency_alarm.wav`. Agent đã tạo sẵn thư mục + cấu hình
channel, nhưng cần **bạn** (project owner) cung cấp file âm thanh còi thật vì:
- Agent không được tự sinh audio giả (chỉ tạo placeholder).
- File cần có chất lượng đủ to + rõ ràng để làm cảnh báo khẩn cấp.

## Yêu cầu kỹ thuật cho file `emergency_alarm.wav`

| Thông số | Giá trị khuyến nghị |
|----------|---------------------|
| Định dạng | WAV (PCM) — Expo/Android hỗ trợ native, không cần decode |
| Độ dài | 3–5 giây (loop được trên channel) |
| Sample rate | 44100 Hz |
| Bit depth | 16-bit |
| Channels | Mono (file nhỏ, đủ to) |
| Volume | Đã normalized ở mức -3dBFS (to nhưng không méo) |
| Nội dung | Còi báo động liên tục (ví dụ: tiếng còi xe cứu thương, còi báo cháy) |

## Cách đặt file

1. Đặt file tại: `mobile/assets/sounds/emergency_alarm.wav`
2. Cấu hình channel đã được set sẵn trong `mobile/App.js` (chỗ `sound: 'emergency_alarm.wav'`).
3. Expo build sẽ tự copy file này vào Android native resources khi build (EAS Build).

## Lưu ý quan trọng về Expo Go

- **Channel với sound custom KHÔNG hoạt động trên Expo Go** — Expo Go chỉ
  nhận sound `'default'`. Để test còi to thật, phải build:
  - **EAS Development Build** (nhanh, dùng cho dev): `eas build --profile development --platform android`
  - **Production Build**: `eas build --profile production --platform android`

- **`bypassDnd: true`** cũng không hoạt động trên Expo Go — cần EAS Build.

- **iOS Critical Alert** (push với `sound: 'critical'`): cần entitlement riêng
  từ Apple, phải build production và config entitlement trong `app.json` →
  `ios.usesCriticalAlertsEntitlement`. Hiện chưa config — nếu cần, bổ sung sau.

## Tạm thời (trước khi có file âm thanh thật)

Nếu chưa có file `emergency_alarm.wav`, channel vẫn hoạt động nhưng Expo sẽ
fallback về sound `'default'` của hệ thống — push vẫn tới, vẫn rung, vẫn có
notification, chỉ không có còi to riêng biệt.
