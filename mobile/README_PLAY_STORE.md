# EduCareLink — Google Play Store Submission Guide

This document walks you through publishing EduCareLink to Google Play Store (CH Play). All required configuration files have been set up — you just need to provide credentials and assets.

## ✅ What's Already Done

| Item | Status | Location |
|------|--------|----------|
| App package name | `com.educarelink.app` | `mobile/app.json:38` |
| App version | `1.2.0` | `mobile/app.json:5` |
| Android versionCode | `3` | `mobile/app.json:39` |
| minSdkVersion / targetSdkVersion / compileSdkVersion | 24 / 35 / 35 | `mobile/app.json:plugins` (expo-build-properties) |
| All required permissions | 11 permissions declared | `mobile/app.json:40-53` |
| Notification channels | 4 channels (default, SOS, geofence, critical) | `mobile/app.json:65-103` |
| App icons (legacy + adaptive) | `icon.png` (1024×1024), adaptive 512×512, monochrome 432×432 | `mobile/assets/` |
| Splash screen | `splash-icon.png` on `#F26522` background | `mobile/app.json:9-13` |
| Deep link scheme | `educarelink://open` | `mobile/app.json:56-64` |
| EAS build profiles | development / preview / production | `mobile/eas.json` |
| Production build type | AAB (`.aab`) for Play Store | `mobile/eas.json` |
| Store listing metadata | title, description, keywords, category | `mobile/play-store/listing.json` |
| Privacy policy | complete template | `mobile/play-store/PRIVACY_POLICY.md` |
| ErrorBoundary | wraps root navigator | `mobile/src/components/ErrorBoundary.js` |
| Console stripping | production build strips `console.log` | `mobile/babel.config.js` |

## 🔴 What You Need To Do (in order)

### Step 1 — Create Firebase Project (for push notifications)

Required because `expo-notifications` plugin needs `google-services.json`.

1. Go to https://console.firebase.google.com/
2. Create new project → name it `EduCareLink`
3. Add Android app → package name `com.educarelink.app` → register
4. Download `google-services.json` → save to `mobile/google-services.json`
5. (Optional) Enable Firebase Cloud Messaging

### Step 2 — Create Google Play Console Account

1. Go to https://play.google.com/console
2. Sign in with your Google account
3. Pay one-time **$25** registration fee
4. Complete identity verification (CCCD + selfie, 1-3 days)

### Step 3 — Create Service Account for EAS Submit

1. In Play Console → **Setup** → **API Access**
2. Create new service account → name `eas-submit`
3. Grant **Admin** permission (or at least "Create & publish releases")
4. Download JSON key → save to `mobile/google-service-account-key.json`

### Step 4 — Create App in Play Console

1. Play Console → **All apps** → **Create app**
2. App name: `EduCareLink`
3. Default language: `Vietnamese`
4. App type: `App`
5. Free / Paid: `Free`
6. Declarations: tick both → **Create app**

### Step 5 — Configure Store Listing

In Play Console → **Grow** → **Store presence** → **Main store listing**:

| Field | Value (from `mobile/play-store/listing.json`) |
|-------|---|
| App name | `EduCareLink — Kết nối Phụ huynh & Carepartner` |
| Short description | `Nền tảng kết nối phụ huynh với carepartner (sinh viên) đáng tin cậy.` |
| Full description | (copy from `listing.json:long_description`) |
| App icon | upload `mobile/assets/icon.png` (must be 512×512 PNG, 32-bit) |
| Feature graphic | upload `mobile/play-store/feature-graphic.png` (1024×500 PNG) — **you need to create this** |
| Phone screenshots | upload 2-8 screenshots from `mobile/play-store/screenshots/` — **you need to create these** |
| App category | `Education` |
| Tags | `Education`, `Lifestyle`, `Social` |
| Privacy Policy URL | `https://educarelink.github.io/privacy-policy` (publish `play-store/PRIVACY_POLICY.md` to GitHub Pages first) |

### Step 6 — Configure Content Rating

Play Console → **App content** → **Content rating**:

1. Fill questionnaire using values from `listing.json:content_rating`
2. Set: shares location = YES, users can interact = YES, no unrestricted web access
3. Result: `Everyone`

### Step 7 — Configure Data Safety

Play Console → **App content** → **Data safety**:

- **Location**: Approximate / Precise — shared with other users (parent sees carepartner's location during task)
- **Personal info**: Name, Email, Phone, Address — shared with other users (limited)
- **Photos and videos**: Identity documents — encrypted in transit
- **App activity**: App interactions — used for app functionality
- **App info and performance**: Crash logs, Diagnostics — used for app functionality
- All data is **encrypted in transit**
- User can request data deletion via support@educarelink.app

### Step 8 — Configure Target Audience

Play Console → **App content** → **Target audience**:
- Age range: 18-65
- Age-restricted content: NO

### Step 9 — Configure Government Apps / Data Practices

Play Console → **App content** → **Government apps**: NOT APPLICABLE (private app)

### Step 10 — Build & Submit via EAS

```bash
cd mobile

# Install dependencies (includes new babel-plugin-transform-remove-console)
npm install --legacy-peer-deps

# Login to Expo
eas login

# Build AAB (App Bundle) for Play Store
npm run build:production

# Submit to Play Console (internal track, draft release)
npm run submit:production

# Or do both in one command:
npm run build:submit:production
```

Build takes 15-30 minutes on EAS cloud. You'll get a download URL for the AAB.

### Step 11 — Review & Roll Out in Play Console

1. Play Console → **Production** (or **Internal testing** for first release)
2. **Create new release** → upload AAB from Step 10 (or use EAS-submit which uploads automatically)
3. Review the release notes from `listing.json:release_notes_v1_2_0`
4. **Review release** → **Start rollout to Production**

### Step 12 — Wait for Google Review

- First-time review: 1-3 days
- Subsequent reviews: 1-24 hours
- You'll get an email when approved

## 🔧 Build Profile Reference

| Profile | Build Type | Distribution | Use Case |
|---------|-----------|--------------|----------|
| `development` | APK (debug) | internal | Local dev testing |
| `preview` | APK (release) | internal | QA / review by demo reviewers |
| `production` | AAB (release) | Play Store | Public release |

## 🚨 Troubleshooting

### Build fails with "google-services.json is missing"
- Make sure `mobile/google-services.json` exists (Step 1 above)
- If you don't need push notifications yet, remove `expo-notifications` from `app.json:plugins` and remove `googleServicesFile` from `app.json:55`

### Submit fails with "Service account key file not found"
- Make sure `mobile/google-service-account-key.json` exists (Step 3 above)
- Verify the service account has `Admin` permission in Play Console

### Submit fails with "Package name not registered"
- Make sure you've created the app in Play Console (Step 4) with package `com.educarelink.app` BEFORE submitting

### Google rejects for "missing privacy policy"
- Publish `mobile/play-store/PRIVACY_POLICY.md` to GitHub Pages
- Make sure the URL `https://educarelink.github.io/privacy-policy` returns 200
- Paste URL in Play Console → App content → Privacy Policy

### Google rejects for "incorrect content rating"
- Re-fill content rating questionnaire per `listing.json:content_rating`
- Make sure "shares location" = YES

## 📋 Pre-Submission Checklist

Before running `npm run build:submit:production`, verify:

- [ ] `mobile/google-services.json` exists (Step 1)
- [ ] `mobile/google-service-account-key.json` exists (Step 3)
- [ ] Play Console app created with package `com.educarelink.app` (Step 4)
- [ ] Store listing filled (Step 5)
- [ ] Content rating completed (Step 6)
- [ ] Data safety completed (Step 7)
- [ ] Target audience set (Step 8)
- [ ] Privacy Policy published to GitHub Pages (Step 5)
- [ ] `mobile/play-store/feature-graphic.png` created (1024×500)
- [ ] At least 2 phone screenshots in `mobile/play-store/screenshots/`
- [ ] `npm install` ran successfully (so `babel-plugin-transform-remove-console` is installed)
- [ ] `eas login` successful (check with `eas whoami`)
- [ ] `app.json:versionCode` is incremented from any previous Play Console upload (currently `3` — if you've already uploaded v3, bump to `4`)

## 📦 Output Artifacts

After submission succeeds, you'll have:
- AAB file (downloadable from EAS dashboard or Play Console)
- Play Console release in `Internal` track
- After review: live on Play Store under package `com.educarelink.app`
