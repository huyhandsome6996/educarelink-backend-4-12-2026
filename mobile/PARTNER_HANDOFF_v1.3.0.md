# EduCareLink Mobile v1.3.0 — Partner Demo Handoff

**Date**: 2026-08-16
**Version**: 1.3.0 (versionCode 8)
**Build ID**: `2e8460e6-64c0-4e8f-8605-d89199efbea7`
**Build duration**: 8 min 4 sec (11:07:35 → 11:15:39 UTC+8)
**Design source**: `stitch_educarelink_redesign_system` (Warm Professionalism)

---

## 📦 APK Location

- **Local APK**: `/home/z/my-project/download/educarelink-v1.3.0.apk` (86.7 MB / 90,908,715 bytes)
- **Expo dashboard**: https://expo.dev/accounts/huyhandsome/projects/educarelink/builds/2e8460e6-64c0-4e8f-8605-d89199efbea7
- **Direct APK download (EAS artifact URL)**: https://expo.dev/artifacts/eas/DyqCF9_r29CyKBnSOhSnpuslI8_H60lnvz0FK1HDuWA.apk

## 🔐 APK verification (all green)

| Check | Value | Pass |
|---|---|---|
| Package name | `com.educarelink.app` | ✅ |
| versionName | `1.3.0` | ✅ |
| versionCode | `8` (≥ v1.2.0's 7 → Android accepts as upgrade) | ✅ |
| Signing scheme | APK Signature Scheme v2 | ✅ |
| Signing cert SHA-256 | `b38ea394df9528a3d869b3c384b1d571035b6ab8ffb82da75f8dc6fdd1ddf7ac` | ✅ (matches v1.2.0 exactly) |
| Min SDK | 24 (Android 7.0+) | ✅ |
| Target SDK | 35 (Android 15) | ✅ |
| Compile SDK | 35 | ✅ |

→ Installing v1.3.0 over v1.2.0 (or any earlier version from v1.1.4 onward) will succeed as an in-place upgrade — no uninstall needed, no signing key mismatch.

## ✅ All test layers green (vét cạn / exhaustive)

| Layer | Result | Notes |
|---|---|---|
| **expo-doctor** | 18/18 checks passed | No issues detected. Run via `npx expo-doctor@latest` |
| **Mobile unit tests** | 6/6 passed | `scripts/test_qa5_mobile_flush_isolation.test.js` — verifies offline queue task-isolation (no cross-task point mixing) |
| **Metro bundler compile** | ✅ success | `npx expo export --platform android` produced `index-89bae276a8d2cf8ebd37b86e08c16e27.hbc` (2.55 MB HBC bytecode) — no syntax errors, no missing imports |
| **Backend Django tests** | 151/151 passed | `python manage.py test` — all tracking, moderation, payments, auth, QA-FIX-1..7 tests green |
| **Integration smoke test** | 10/10 passed | `scripts/smoke_test_v120.py` — walks the full demo flow: parent login → task create with map coords+geofence → worker apply with consent → heartbeat → PIN change → parent views → AI chatbot |

## 🎨 Redesign scope — Warm Professionalism design system

| Screen | Lines | Status | Notes |
|---|---|---|---|
| **SplashScreen** | 200 | ✅ | Orange bg, design tagline "An tâm gửi gắm, trọn vẹn yêu thương", brand "EduCareLink" |
| **LoginScreen** | 393 | ✅ | White form card, primaryText title, forgot password link, focus rings |
| **RegisterScreen** | 721 | ✅ | Brand header, role cards (parent=orange / carepartner=green), pill submit button |
| **ParentHomeScreen** | 509 | ✅ | Flat cream header, greeting, promo banner, bento grid, horizontal partner cards, recent activity, FAB |
| **CreateTaskScreen** | 885 | ✅ | Top app bar, 3-step stepper, chip selector, card inputs, sticky footer |
| **MyTasksScreen** | 807 | ✅ | Top bar, h1 header, tab underline style, task cards with 4px status bars |
| **AppNavigator (bottom tab)** | 294 | ✅ | Pill style (active=orange bg + white icon/label), top-rounded corners, warm shadow |
| **theme/colors.js** | 194 | ✅ | Full token set: primaryText, surfaceContainer hierarchy (Lowest/Low/Container/High/Highest), outline/outlineVariant, tertiary, secondaryContainer, successDeep/warningDeep/errorDeep, SHADOWS.large (orange glow), TYPO (h1-h5/body/caption/button), SIZES (radiusLg=20, radiusMd=14, radiusFull=999) |

## 🔒 Preserved verbatim (NO logic changes)

- ✅ All API calls (`getMyTasksAsParent`, `createTask`, `register`, `login`, `completeOnboarding`, `setVerificationPin`, `flushOfflineQueue`, etc.)
- ✅ All state management (19 useState in CreateTask, 13 in Register, etc.)
- ✅ All navigation logic
- ✅ All QA-FIX-1..7 tracking/verification logic (PIN setup, geofence, random verification, offline queue, schedulers)
- ✅ All notification channels (default, critical_alerts, emergency-alerts, sos_alerts, geofence_alerts, recovery_alerts)
- ✅ Background fetch + auto-resume tracking
- ✅ `mobile/src/api/client.js`: PROD_URL = `https://educarelink-backend.onrender.com/api` (unchanged — same backend as v1.1.0 → v1.2.0 → v1.3.0)

## ⚠️ Known limitations (visual ~90% match, not 100%)

Per user direction "Giữ logic + visual gần đúng":

1. **Manrope / Plus Jakarta Sans fonts NOT installed** — using system sans-serif with fontWeight + letterSpacing approximation. To enable true fonts: `npm install @expo-google-fonts/manrope @expo-google-fonts/plus-jakarta-sans` then load via `useFonts()` in App.js
2. **Material Symbols NOT used** — sticking with Ionicons (already installed). Visual equivalent icons chosen (e.g. `bus` for directions_bus, `people` for family_restroom)
3. **Bottom nav: 3 tabs (parent) / 4 tabs (worker)** — design shows 5 tabs but mobile doesn't have all those screens (no Diary, no Parent Profile). Pill visual style matches design.
4. **CreateTask: no child selector** — design shows "Bé nào cần hỗ trợ?" with avatars, but API doesn't accept `child_id`. Skipped to preserve logic.
5. **CreateTask: no location from/to split** — design shows pickup + dropoff, but API only accepts single `location` string. Kept as single input.
6. **ParentHome: CarePartner suggestions are mock data** — no backend API yet. Visual structure ready for when API is added.
7. **MyTasks: 3 tabs (not 4)** — kept existing filter logic (cancelled tasks appear in "Hoàn tất" tab). Adding 4th tab would require filter logic change.

## 🚀 How to install

### Option A: Direct download (recommended for partner demo)
1. On Android phone, open browser → navigate to the Expo artifact URL above (or scan QR)
2. Allow "Install from unknown sources" if prompted
3. Tap the downloaded APK → Install → Open

### Option B: Transfer from this machine
```bash
# APK is already at /home/z/my-project/download/educarelink-v1.3.0.apk
# Copy to phone via USB / cloud / Telegram / etc.
```

### Option C: Build from source (reproducible)
```bash
cd /home/z/my-project/repos/educarelink-backend-4-12-2026/mobile
eas login   # use huyhandsome account
eas build --platform android --profile preview --non-interactive --clear-cache
# Wait ~8 min, then `eas build:list` to find download URL
```

## 📋 Demo script suggestion (15-20 min)

1. **Splash** (2s auto) → **Login** — show warm cream bg, card form
2. Login as `phuhuynh_test / Demo@2026`
3. **ParentHome** — show greeting, promo banner, bento grid services, horizontal partner cards, FAB
4. Tap FAB → **CreateTask** — show stepper, chip selector, card inputs, sticky footer
5. Submit a test task → back to **ParentHome** → see it in Recent Activity
6. Tap bottom tab "Nhiệm vụ" → **MyTasks** — show tab underline style, task card with status bar
7. (If time) Tap "AI Trợ lý" tab → **Chatbot** — ask "Tôi cần gia sư Toán lớp 5"
8. Logout → show **Register** screen — role selection cards (parent/carepartner)

## 🔄 Git history

```
b3561e6 docs: PARTNER_HANDOFF_v1.3.0 — redesign handoff + build instructions
db045fc chore(mobile): bump version 1.2.0 → 1.3.0 (versionCode 7 → 8)
dfb786f feat(mobile): redesign v1.3.0 — Warm Professionalism design system
c8ce88c docs: PARTNER_HANDOFF_v1.2.0 — partner demo handoff doc
9e5f71e fix(eas): appVersionSource remote→local so app.json versionCode is respected
```

Commit at build time: `b3561e67541a14538e34f727380b99869a53f02e` (verified via EAS build:view).

## 📞 If something breaks during demo

- **App crash on launch**: check `eas build:list` for build errors
- **Login fails**: use DEV credentials `phuhuynh_test / Demo@2026` (visible in DEV mode)
- **Tracking not working**: confirm CarePartner account has `is_approved=true` in Django admin
- **White screen**: check Metro bundler logs — likely a missing import (but Metro compile passed ✅ so unlikely)
- **Cannot install over v1.2.0**: should NOT happen — signing cert SHA-256 verified identical. If it does, uninstall v1.2.0 first then install fresh.

## 🔁 Rollback plan

If v1.3.0 has critical issues during demo:
1. Uninstall v1.3.0 from phone
2. Install v1.2.0 from `/home/z/my-project/download/educarelink-v1.2.0.apk` (also has matching signing key)
3. v1.2.0 has all the same backend functionality (tracking, geofence, SOS, verification PIN, AI chatbot) — only UI is the old gray-bg design

---

**Build status**: ✅ Code complete, ✅ Syntax verified, ✅ Metro bundle OK (2.55 MB HBC), ✅ EAS build FINISHED, ✅ APK downloaded (86.7 MB), ✅ Manifest verified (versionCode=8, versionName=1.3.0), ✅ Signing key matches v1.2.0, ✅ All 4 test layers green (18 expo-doctor + 6 mobile + 151 backend + 10 integration smoke = 185 tests total)
