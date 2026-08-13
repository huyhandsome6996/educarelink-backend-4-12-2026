# Thư mục âm thanh cảnh báo khẩn cấp

Thư mục này chứa file âm thanh còi báo động dùng cho channel Android `emergency-alerts`
(Phần 2 — báo động khi CarePartner mất kết nối + Phần 3 — xác minh ngẫu nhiên).

## ✅ File `emergency_alarm.wav` — đã có

QA-FIX-3 / D: file `emergency_alarm.wav` đã được bổ sung bằng cách generate
procedurally (Python wave + struct). Thông số:

| Thông số | Giá trị |
|----------|---------|
| Định dạng | WAV (PCM) — Expo/Android hỗ trợ native, không cần decode |
| Độ dài | 3 giây (loop được trên channel) |
| Sample rate | 44100 Hz |
| Bit depth | 16-bit |
| Channels | Mono (file nhỏ, đủ to) |
| Nội dung | Siren 800Hz/1000Hz xen kẽ 0.5s mỗi tone |
| Volume | 0.85 amplitude (đã normalized) |
| License | Generated procedurally — không có vấn đề bản quyền |

## Cách file được dùng

1. **Channel Android `emergency-alerts`** (App.js): `sound: 'emergency_alarm.wav'`
   — Android native push sẽ play file này khi nhận alert.
2. **EmergencyAlarmService.js**: `require('../../assets/sounds/emergency_alarm.wav')`
   — app foreground sẽ play file này qua `expo-av` với `isLooping: true` khi
   nhận push `device_offline_critical` hoặc `random_verification`.

## Lưu ý quan trọng về nền tảng

- **Audio loop CHỈ chạy khi app ở FOREGROUND** (JS thread chạy).
- Khi app **background/killed**: JS không chạy → audio loop KHÔNG chạy. Remote
  push do OS xử lý (channel `emergency-alerts` + sound `emergency_alarm.wav`
  nếu có file + EAS build). Đây là giới hạn vật lý của React Native.
- **iOS critical alert**: cần entitlement Apple (Critical Alerts Entitlement) —
  chưa có → UNTESTABLE trên iOS cho đến khi được Apple approve.
- **Android full-screen intent + bypass DnD**: cần EAS Build (không hoạt động
  trên Expo Go). Channel config đã set `bypassDnd: true` +
  `USE_FULL_SCREEN_INTENT` permission trong app.json.

## Cách replace file (nếu muốn âm thanh khác)

1. Đặt file mới tại: `mobile/assets/sounds/emergency_alarm.wav` (giữ nguyên tên).
2. Đảm bảo format: WAV PCM 16-bit mono 44100Hz, độ dài 3-5s, volume normalized.
3. Không cần sửa code — `require()` đã trỏ tới đường dẫn này.
4. Chạy lại `eas build` để bundle asset mới vào native binary.

## Cách regenerate file (Python)

```python
import struct, wave, math
sample_rate = 44100
duration_sec = 3.0
n_samples = int(sample_rate * duration_sec)
samples = []
for i in range(n_samples):
    t = i / sample_rate
    cycle_pos = (t % 1.0)
    freq = 800 if cycle_pos < 0.5 else 1000
    env = 1.0
    fade = 0.01
    if t < fade:
        env = t / fade
    elif t > duration_sec - fade:
        env = (duration_sec - t) / fade
    val = 0.85 * env * math.sin(2 * math.pi * freq * t)
    samples.append(val)

pcm = b''
for s in samples:
    pcm += struct.pack('<h', int(s * 32767))

with open('emergency_alarm.wav', 'wb') as f:
    w = wave.open(f, 'wb')
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    w.writeframes(pcm)
    w.close()
```
