# 📱 Hướng dẫn Deploy EduCareLink lên CH Play & App Store

> Tài liệu này hướng dẫn bạn các bước cần làm để đưa app EduCareLink lên Google Play Store (Android) và Apple App Store (iOS).

---

## 1️⃣ CHI PHÍ TỔNG (NĂM ĐẦU)

| Khoản | Chi phí | Bắt buộc |
|---|---|---|
| **Google Play Console** (one-time, vĩnh viễn) | **$25** | ✅ Có |
| **Apple Developer Program** (hàng năm) | **$99/năm** | ✅ Có (cho iOS) |
| **EAS Build Production** (tuỳ chọn, build nhanh) | $59/tháng = $708/năm | ⚠️ Tuỳ chọn |
| **Domain + hosting backend** (đã có Render free) | $0 → $84/năm (upgrade) | Tuỳ traffic |
| **Apple Mac** (để build iOS qua Xcode) | ~$600+ (Mac Mini) hoặc mượn | ✅ Có (cho iOS) |
| **TỔNG TỐI THIỂU** (Android only) | **$25** | |
| **TỔI THIỂU** (cả 2 store) | **$124/năm** | |

---

## 2️⃣ TÀI KHOẢN CẦN TẠO

### A. Google Play Console (Android)
1. Truy cập: https://play.google.com/console
2. Đăng nhập bằng Google account (nên dùng account công ty nếu có)
3. Thanh toán $25 một lần
4. Verify danh tính (cần CMND/CCCD + ảnh chân dung, mất 1-3 ngày)
5. Tạo app mới: `EduCareLink` → package `com.educarelink.app`
6. Cài đặt **Service Account** cho EAS Submit:
   - Vào Setup → API Access → Create Service Account
   - Download JSON key → lưu thành `mobile/google-service-account-key.json`

### B. Apple Developer Program (iOS)
1. Truy cập: https://developer.apple.com/programs/
2. Đăng nhập bằng Apple ID (nên dùng Apple ID công ty)
3. Đăng ký Developer Program: $99/năm
4. Verify 2FA + thông tin thanh toán
5. Cài đặt app trên App Store Connect:
   - Vào https://appstoreconnect.apple.com
   - My Apps → New App → Name: `EduCareLink`, Bundle ID: `com.educarelink.app`
   - Lấy **Apple Team ID** + **App Store Connect App ID**

### C. Expo EAS (build service)
1. Truy cập: https://expo.dev
2. Tạo account (free)
3. Tạo project mới → lấy **EAS Project ID** (đã có: `3e841ddf-23c3-42ce-a2e1-8827c06311a2`)
4. Cài đặt EAS CLI: `npm install -g eas-cli`
5. Login: `eas login`
6. (Tuỳ chọn) Upgrade lên EAS Production $59/tháng để build nhanh

---

## 3️⃣ THÔNG TIN BẠN CẦN CUNG CẤP CHO TÔI

Để tôi có thể build + submit app cho bạn, cần các thông tin sau:

### Bắt buộc cho Android (CH Play):
- [ ] File `google-service-account-key.json` (từ Google Play Console → API Access)
- [ ] Tên gói package đã đăng ký: `com.educarelink.app` (đã có)
- [ ] Email liên hệ hỗ trợ (hiển thị trên CH Play)
- [ ] URL chính sách bảo mật (Privacy Policy) — có thể dùng GitHub Pages

### Bắt buộc cho iOS (App Store):
- [ ] **Apple ID** (email)
- [ ] **Apple Team ID** (10 ký tự, dạng `ABCDE12345`)
- [ ] **App Store Connect App ID** (dạng số, vd: `1234567890`)
- [ ] Apple Distribution Certificate (tôi sẽ hướng dẫn tạo qua EAS)
- [ ] Apple Provisioning Profile (EAS tự tạo)
- [ ] Email liên hệ hỗ trợ
- [ ] URL chính sách bảo mật

### Tuỳ chọn (để tối ưu):
- [ ] App icon 1024x1024 PNG (đã có `mobile/assets/logo.png` — nên nâng cấp lên 1024x1024)
- [ ] Screenshots điện thoại (5-7 screenshots mỗi kích thước: 6.7", 6.5", 5.5")
- [ ] Mô tả app ngắn (80 ký tự) + dài (4000 ký tự)
- [ ] Keywords (từ khóa tìm kiếm, max 100 ký tự)
- [ ] Category: Education / Lifestyle / Social

---

## 4️⃣ CÁC BƯỚC TÔI ĐÃ CHUẨN BỊ SẴN

✅ **EAS config** (`mobile/eas.json`) đã có 3 profile: development, preview, production
✅ **App config** (`mobile/app.json`) đã có:
   - iOS bundle ID: `com.educarelink.app`
   - Android package: `com.educarelink.app`
   - Permissions đầy đủ: location background, camera, notifications, vibration, wake lock
   - iOS Background modes: location, fetch, remote-notification
   - Android notification channels: default, critical_alerts, sos_alerts, geofence_alerts
✅ **Version**: 1.1.0 (Android versionCode: 2, iOS buildNumber: 1)
✅ **Background services**: LocationService gửi vị trí + heartbeat mỗi 30s
✅ **Critical alerts**: chuông kêu + vibration khi carepartner offline

---

## 5️⃣ LỆNH BUILD + SUBMIT (khi đã có credentials)

### Build Android APK (test internal):
```bash
cd mobile
eas build --profile preview --platform android
# → Tải file .apk về cài test
```

### Build Android App Bundle (CH Play):
```bash
cd mobile
eas build --profile production --platform android
# → File .aab sẽ có trên Expo dashboard
```

### Submit lên CH Play:
```bash
cd mobile
eas submit --profile production --platform android
# → App sẽ xuất hiện trên Google Play Console (track: internal, status: draft)
# → Vào Console → Review → Submit for review
```

### Build iOS (cần Mac):
```bash
cd mobile
eas build --profile production --platform ios
# → File .ipa sẽ có trên Expo dashboard
```

### Submit lên App Store:
```bash
cd mobile
eas submit --profile production --platform ios
# → App sẽ xuất hiện trên App Store Connect
# → Vào App Store Connect → Submit for review
```

### Build cả 2 platform:
```bash
cd mobile
eas build --profile production --platform all
eas submit --profile production --platform all
```

---

## 6️⃣ CHECKLIST TRƯỚC KHI SUBMIT

### Legal (BẮT BUỘC):
- [ ] **Privacy Policy URL**: viết 1 file `privacy-policy.html`, host trên GitHub Pages
- [ ] **Terms of Service URL**: tương tự
- [ ] **Data Safety** (CH Play): khai báo dữ liệu app thu thập (location, email, photos)
- [ ] **Content Rating**: điền questionnaire (IARC)
- [ ] **Target audience**: 18+ (vì có chức năng SOS, bảo mật trẻ em)

### App Store metadata:
- [ ] App name: `EduCareLink`
- [ ] Subtitle: `Kết nối Phụ huynh & Carepartner`
- [ ] Short description (80 ký tự)
- [ ] Full description (4000 ký tự)
- [ ] Keywords: `gia su, don tre, cham soc tre, sinh vien, viec lam`
- [ ] Promotional text (170 ký tự, có thể đổi bất cứ lúc nào)
- [ ] App category: `Education` + secondary `Lifestyle`

### Visual assets:
- [ ] App icon 1024x1024 PNG (no alpha, no rounded corners)
- [ ] 5-7 screenshots mỗi kích thước:
  - Android: phone 6.7", 7-inch tablet, 10-inch tablet
  - iOS: 6.7", 6.5", 5.5"
- [ ] Feature graphic (CH Play): 1024x500 PNG

### Bảo mật + compliance:
- [ ] **Data encryption**: app dùng HTTPS → kiểm tra `NSAppTransportSecurity`
- [ ] **Children's privacy**: app không nhắm đến trẻ em (COPPA compliant)
- [ ] **Location disclosure**: đã có `NSLocationWhenInUseUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription`
- [ ] **Background location**: đã có `UIBackgroundModes: location`
- [ ] **Push notifications**: đã có `expo-notifications`

---

## 7️⃣ QUY TRÌNH REVIEW

### Google Play:
- **Review time**: 1-3 ngày cho app mới, sau đó update nhanh hơn
- **Có thể bị reject** nếu:
  - Thiếu Privacy Policy
  - Yêu cầu quyền location nhưng không giải thích rõ
  - Content rating sai
  - Data Safety khai báo thiếu

### Apple App Store:
- **Review time**: 1-7 ngày
- **Thường bị reject** vì:
  - Thiếu `NSLocationAlwaysAndWhenInUseUsageDescription` rõ ràng (đã có)
  - Background location mà không có functionality rõ (cần giải thích "Live tracking để bảo vệ trẻ em")
  - Cần **Critical Alert Entitlement** từ Apple để chuông kêu khi thiết bị offline (nếu muốn full volume bypass Do Not Disturb)
  - App crash trên iOS 17+

---

## 8️⃣ CRITICAL ALERT ENTITLEMENT (Apple đặc biệt)

Tính năng chuông kêu khi thiết bị carepartner offline cần **Critical Alert** để bypass Do Not Disturb mode. Apple yêu cầu:

1. Nộp form: https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/
2. Giải thích use case: "EduCareLink protects children by alerting parents when a carepartner's device goes offline during babysitting — critical for child safety."
3. Apple duyệt trong 1-2 tuần
4. Sau khi được cấp, thêm entitlement vào app.json

**Trong lúc chờ**: app vẫn dùng `priority: high` + sound default — vẫn kêu chuông khi phone không bật Do Not Disturb.

---

## 9️⃣ POST-DEPLOY

### Monitoring:
- Đăng ký **Google Play Console** → Crashes & ANRs (free)
- Đăng ký **App Store Connect** → Metrics
- Sentry / Firebase Crashlytics (free tier) — khuyến nghị

### Updates:
- **Hot update**: hiện đang tắt (`updates.enabled: false`). Nếu muốn OTA update không qua store → bật `expo-updates`
- **Native update**: khi đổi code native (thêm permission, đổi app.json) → phải build lại + submit

### Backend scaling (Render):
- Free tier: 750h/tháng, sleep sau 15 phút không traffic
- Đã có keepalive scheduler ping mỗi 3 phút → OK cho demo
- Production: upgrade lên **Starter $7/tháng** để không sleep + 1GB RAM

---

## 🔟 HỖ TRỢ

Nếu cần help:
- **EAS docs**: https://docs.expo.dev/build/introduction/
- **CH Play docs**: https://developer.android.com/distribute
- **App Store docs**: https://developer.apple.com/app-store/
- **Tôi**: cung cấp thông tin theo §3, tôi sẽ build + submit giúp

**Demo accounts** (đã tạo sẵn để test):
- Admin: `admin` / `Demo@2026`
- Phụ huynh: `phuhuynh_test` / `Demo@2026`
- Carepartner: `sinhvien_test` / `Demo@2026`
