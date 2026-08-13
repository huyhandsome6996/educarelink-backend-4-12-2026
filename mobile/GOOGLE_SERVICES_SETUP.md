# Firebase Google Services — Hướng dẫn cấu hình

QA-FIX-3 / C: `app.json` đã bỏ reference `googleServicesFile` để `expo prebuild`
không fail với ENOENT khi file `google-services.json` không tồn tại.

## Khi nào cần `google-services.json`?

Expo Push Notifications dùng **Expo Push Service** — không cần Firebase trực
tiếp. App vẫn nhận push được ngay cả khi không có file này.

File chỉ cần thiết khi:
- Muốn dùng Firebase Cloud Messaging trực tiếp (bypass Expo Push).
- Muốn dùng Firebase Analytics / Crashlytics / Remote Config.

## Cách cung cấp file (khi cần)

### Cách 1 — Đặt file thủ công (dev only)

1. Tạo Firebase project tại https://console.firebase.google.com/.
2. Add Android app với package name `com.educarelink.app`.
3. Download `google-services.json` từ Firebase console.
4. Đặt file tại `mobile/google-services.json` (đã trong `.gitignore` —
   không commit vào repo).
5. Uncomment dòng `googleServicesFile` trong `mobile/app.json`:
   ```json
   "android": {
     ...
     "googleServicesFile": "./google-services.json"
   }
   ```
6. Chạy `npx expo prebuild --platform android` để regenerate native code.

### Cách 2 — EAS Build credentials (production)

EAS Build hỗ trợ upload credential files qua dashboard:
1. Vào https://expo.dev/accounts/<your-account>/projects/educarelink/credentials.
2. Upload `google-services.json` vào Android credentials.
3. EAS Build sẽ tự inject file vào build — không cần commit file vào repo.

## Lưu ý

- **iOS**: file tương ứng là `GoogleService-Info.plist` (cũng đã trong
  `.gitignore`). Tương tự Android — không bắt buộc cho Expo Push.
- **Expo Go**: không cần file này — Expo Go đã có Firebase config riêng.
- **EAS Development Build**: cần file nếu muốn test FCM trực tiếp.
