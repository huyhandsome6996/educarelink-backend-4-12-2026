# EduCareLink Mobile v1.3.0 — Partner Demo Handoff

**Date**: 2026-08-16
**Version**: 1.3.0 (versionCode 8)
**Design source**: `stitch_educarelink_redesign_system` (Warm Professionalism)

---

## ✅ Redesign completed — 7 core screens + bottom nav

| Screen | Status | Notes |
|---|---|---|
| **SplashScreen** | ✅ | Orange bg, design tagline "An tâm gửi gắm, trọn vẹn yêu thương", brand "EduCareLink" |
| **LoginScreen** | ✅ | White form card, primaryText title, forgot password link, focus rings |
| **RegisterScreen** | ✅ | Brand header, role cards (parent=orange / carepartner=green), pill submit button |
| **ParentHomeScreen** | ✅ | Flat cream header, greeting, promo banner, bento grid, horizontal partner cards, recent activity, FAB |
| **CreateTaskScreen** | ✅ | Top app bar, 3-step stepper, chip selector, card inputs, sticky footer |
| **MyTasksScreen** | ✅ | Top bar, h1 header, tab underline style, task cards with 4px status bars |
| **AppNavigator (bottom tab)** | ✅ | Pill style (active=orange bg + white icon/label), top-rounded corners, warm shadow |

## 🎨 Design tokens added to theme/colors.js

- `primaryText: #A63B00` — dark warm orange for titles (different from `primary: #F26522`)
- `surfaceContainerLowest/Low/Container/High/Highest` — Material 3 surface hierarchy
- `outline: #8D7166`, `outlineVariant: #E1BFB3`
- `tertiary: #006492`, `tertiaryContainer: #009ADE` — info blue
- `secondaryContainer: #76FA84` — CarePartner light green
- `successDeep`, `warningDeep`, `errorDeep` — darker shades for text on light bg
- Background changed: `#F7F7F7` (gray) → `#FFF8F6` (warm cream)
- Aliases: `onSurface`, `surfaceWarm` (back-compat)

## 🔒 Preserved verbatim (NO logic changes)

- ✅ All API calls (`getMyTasksAsParent`, `createTask`, `register`, `login`, `completeOnboarding`, etc.)
- ✅ All state management (19 useState hooks in CreateTask, 13 in Register, etc.)
- ✅ All navigation logic
- ✅ All QA-FIX-1..7 tracking/verification logic (PIN setup, geofence, random verification, etc.)
- ✅ All notification channels (default, critical_alerts, emergency-alerts, sos_alerts, geofence_alerts, recovery_alerts)
- ✅ Background fetch + auto-resume tracking
- ✅ `expo-doctor`: 18/18 checks passed
- ✅ `metro bundler`: 1206 modules compiled successfully (3.92 MB bundle)

## 🚀 How to build APK

EAS cloud build is required (no local Android SDK). Run:

```bash
cd /home/z/my-project/repos/educarelink-backend-4-12-2026/mobile

# 1. Login to Expo (one-time)
eas login
# Use your Expo account credentials

# 2. Build APK (5-15 minutes on Expo cloud)
bash build-apk-eas.sh
# OR manually: eas build --platform android --profile preview --non-interactive

# 3. Download APK when build completes
eas build:list
# Click the build URL → download .apk file
```

## ⚠️ Known limitations (visual ~90% match, not 100%)

Per user direction "Giữ logic + visual gần đúng":

1. **Manrope / Plus Jakarta Sans fonts NOT installed** — using system sans-serif with fontWeight + letterSpacing approximation. To enable true fonts: `npm install @expo-google-fonts/manrope @expo-google-fonts/plus-jakarta-sans` then load via `useFonts()` in App.js
2. **Material Symbols NOT used** — sticking with Ionicons (already installed). Visual equivalent icons chosen (e.g. `bus` for directions_bus, `people` for family_restroom)
3. **Bottom nav: 3 tabs (parent) / 4 tabs (worker)** — design shows 5 tabs but mobile doesn't have all those screens (no Diary, no Parent Profile). Pill visual style matches design.
4. **CreateTask: no child selector** — design shows "Bé nào cần hỗ trợ?" with avatars, but API doesn't accept `child_id`. Skipped to preserve logic.
5. **CreateTask: no location from/to split** — design shows pickup + dropoff, but API only accepts single `location` string. Kept as single input.
6. **ParentHome: CarePartner suggestions are mock data** — no backend API yet. Visual structure ready for when API is added.
7. **MyTasks: 3 tabs (not 4)** — kept existing filter logic (cancelled tasks appear in "Hoàn tất" tab). Adding 4th tab would require filter logic change.

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
db045fc chore(mobile): bump version 1.2.0 → 1.3.0 (versionCode 7 → 8)
dfb786f feat(mobile): redesign v1.3.0 — Warm Professionalism design system
c8ce88c docs: PARTNER_HANDOFF_v1.2.0 — partner demo handoff doc
```

## 📞 If something breaks during demo

- **App crash on launch**: check `eas build:list` for build errors
- **Login fails**: use DEV credentials `phuhuynh_test / Demo@2026` (visible in DEV mode)
- **Tracking not working**: confirm CarePartner account has `is_approved=true` in Django admin
- **White screen**: check Metro bundler logs — likely a missing import

---

**Build status**: ✅ Code complete, ✅ Syntax verified, ✅ Metro bundle OK, ⏳ Awaiting EAS build
