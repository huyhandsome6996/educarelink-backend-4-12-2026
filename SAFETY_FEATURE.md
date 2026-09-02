# SAFETY FEATURE — Status & Verification

**Date**: 2026-07-21
**Agent**: QA Agent (Super Z)

---

## Overview

Safety feature đã được implement đầy đủ trên cả backend + web + mobile. Đã verify trên production.

---

## Backend Safety Components

### 1. Geofence (Vùng an toàn)

| Component | File | Status |
|---|---|---|
| Task model geofence fields | `core/models.py` | ✅ `geofence_lat`, `geofence_lng`, `geofence_radius` |
| Geofence check logic | `tracking/services.py` | ✅ `haversine_distance()` + geofence exit/enter detection |
| Location update endpoint | `tracking/views.py` | ✅ `POST /api/tracking/location/` — checks geofence on every update |
| Geofence exit notification | `tracking/services.py` | ✅ Push "🚨 CẢNH BÁO: Carepartner rời vùng an toàn!" |
| Geofence enter notification | `tracking/services.py` | ✅ Push "✅ Carepartner đã quay lại vùng an toàn" |

**Verified**: Task 47 created with `geofence_lat=10.7338, geofence_lng=106.7197, geofence_radius=500` ✅

### 2. Device Heartbeat & Offline Detection

| Component | File | Status |
|---|---|---|
| DeviceHeartbeat model | `tracking/models.py` | ✅ `last_seen`, `device_status`, `battery_level` |
| DeviceOfflineAlert model | `tracking/models.py` | ✅ `status='active'/'recovered'` |
| Heartbeat endpoint | `tracking/views.py` | ✅ `POST /api/tracking/heartbeat/` |
| Offline check scheduler | `tracking/offline_scheduler.py` | ✅ Every 1 minute, threshold 60s |
| Offline alert push | `tracking/services.py` | ✅ Push "🚨 THIẾT BỊ MẤT KẾT NỐI!" + sound=critical |
| Recovery push | `tracking/services.py` | ✅ Push "✅ Online trở lại" |
| Admin notification | `tracking/services.py` | ✅ All is_staff users notified |

**Settings**:
- `TRACKING_HEARTBEAT_INTERVAL = 30` seconds
- `TRACKING_OFFLINE_THRESHOLD = 60` seconds (2 missed heartbeats)
- `TRACKING_OFFLINE_CHECK_INTERVAL = 1` minute

### 3. SOS (Khẩn cấp)

| Component | File | Status |
|---|---|---|
| SOSAlert model | `tracking/models.py` | ✅ `sender`, `message`, `latitude/longitude`, `status` |
| SOS trigger endpoint | `tracking/views.py` | ✅ `POST /api/tracking/sos/` — both parent + worker |
| SOS list endpoint | `tracking/views.py` | ✅ `GET /api/tracking/sos/:task_id/` |
| SOS resolve endpoint | `tracking/views.py` | ✅ `POST /api/tracking/sos/:sos_id>/resolve/` |
| SOS rate limit | `tracking/views.py` | ✅ 5/min throttle (ScopedRateThrottle) |

**Verified**: SOS sent for task 47 → SOSAlert id=5 created, status=active ✅

### 4. Consent System

| Component | File | Status |
|---|---|---|
| LocationConsent model | `tracking/models.py` | ✅ `consent='granted'/'denied'/'revoked'` |
| Consent endpoint | `tracking/views.py` | ✅ `POST /api/tracking/consent/` |
| Revoke consent | `tracking/views.py` | ✅ `POST /api/tracking/consent/:task_id/revoke/` |
| Consent check in location update | `tracking/views.py` | ✅ Verify consent before accepting location |
| Apply with consent_tracking | `core/views.py` | ✅ `ApplyTaskAPIView` — auto-creates LocationConsent |

### 5. AI Moderation (Bảo vệ nội dung)

| Component | File | Status |
|---|---|---|
| Keyword blacklist (200+ keywords) | `moderation/services.py` | ✅ Sync check < 1ms |
| AI moderation (Gemini) | `moderation/services.py` | ✅ Async, 2-18s |
| Category check (5 danh mục) | `moderation/services.py` | ✅ Reject if not in 5 categories |
| Auto-delete rejected tasks | `moderation/signals.py` | ✅ Signal post_save → delete |
| Notify parent on rejection | `moderation/services.py` | ✅ Push + in-app notification |

---

## Mobile Safety Components

### 6. Background Location Tracking

| Component | File | Status |
|---|---|---|
| LocationService | `mobile/src/services/LocationService.js` | ✅ 435 lines |
| Location update interval | LocationService.js | ✅ 10 seconds (`UPDATE_INTERVAL_MS = 10000`) |
| Heartbeat interval | LocationService.js | ✅ 30 seconds (`HEARTBEAT_INTERVAL_MS = 30000`) |
| Foreground service notification | LocationService.js | ✅ "EduCareLink đang theo dõi vị trí" |
| Auto-resume after kill | LocationService.js | ✅ `autoResumeTracking()` reads from storage |
| Stop on task complete | LocationService.js | ✅ AppState listener + fetchJobs check |

### 7. Push Notification Channels

| Channel | Config | Status |
|---|---|---|
| critical_alerts | HIGH importance, vibration `[0,1000,500,1000,500,1000,500,1000]` | ✅ |
| sos_alerts | HIGH importance, vibration `[0,800,400,800,400,800]` | ✅ |
| geofence_alerts | HIGH importance, vibration `[0,500,250,500,250,500]` | ✅ |
| recovery_alerts | DEFAULT importance, vibration `[0,200,100,200]` | ✅ |
| default | DEFAULT importance | ✅ |

**File**: `mobile/App.js` lines 37-100

### 8. LiveTrackingScreen (Parent)

| Component | File | Status |
|---|---|---|
| Map display (Leaflet WebView) | `LiveTrackingScreen.js` | ✅ Worker marker + parent marker + geofence circle |
| Polling (5s location, 10s device status) | `LiveTrackingScreen.js` | ✅ `POLL_INTERVAL_MS = 5000` |
| Geofence exit badge | `LiveTrackingScreen.js` | ✅ "⚠️ Rời vùng an toàn" |
| Device offline banner (red) | `LiveTrackingScreen.js` | ✅ "🚨 THIẾT BỊ MẤT KẾT NỐI!" + last location + last seen |
| SOS button + confirm | `LiveTrackingScreen.js` | ✅ `Alert.alert("🆘 Xác nhận SOS")` |
| Call 113 button | `LiveTrackingScreen.js` | ✅ `Linking.openURL('tel:113')` |
| Vibration patterns | `LiveTrackingScreen.js` | ✅ `[500,250,500,250,500,250,500]` for geofence, `[1000,500,...]` for offline |

### 9. TrackingConsentModal (Worker)

| Component | File | Status |
|---|---|---|
| Consent modal | `mobile/src/components/TrackingConsentModal.js` | ✅ 229 lines |
| 4 feature rows | TrackingConsentModal.js | ✅ "Chỉ chia sẻ khi đang làm việc", "Parent chỉ thấy vị trí hiện tại", "Có thể dừng bất cứ lúc nào", "Dữ liệu mã hóa" |
| Grant/Deny buttons | TrackingConsentModal.js | ✅ "Đồng ý & nhận việc" / "Không, cảm ơn" |

### 10. ActiveTrackingBanner (Worker)

| Component | File | Status |
|---|---|---|
| Banner display | `mobile/src/components/ActiveTrackingBanner.js` | ✅ 148 lines |
| "Đang chia sẻ vị trí" text | ActiveTrackingBanner.js | ✅ Pulse animation |
| Stop button + confirm | ActiveTrackingBanner.js | ✅ Alert confirm → revokeConsent + stopTracking |

---

## Web Safety Components

### 11. Live Tracking Page (Parent)

| Component | File | Status |
|---|---|---|
| Map (Leaflet OSM) | `frontend/templates/frontend/tracking.html` | ✅ 678 lines |
| Polling (5s location, 10s device) | `tracking.html` | ✅ `POLL_INTERVAL_MS = 5000` |
| Geofence circle | `tracking.html` | ✅ `L.circle` blue dashed |
| Geofence exit badge | `tracking.html` | ✅ "Carepartner đã rời vùng an toàn!" |
| Device offline banner | `tracking.html` | ✅ Red box + last location + "Gọi 113" |
| SOS button + confirm | `tracking.html` | ✅ `confirm('🆘 Gửi SOS khẩn cấp?')` |
| Call/Message buttons | `tracking.html` | ✅ `tel:` + messenger |
| Audio alarm | `tracking.html` | ✅ Web Audio API beep 880Hz/440Hz |

---

## 7 Safety Test Scenarios (from guide section 6.7)

| # | Scenario | Expected | Status |
|---|---|---|---|
| 1 | Parent bật safety → Carepartner app start background service → heartbeat OK | Foreground notification + location updates | ✅ Code verified |
| 2 | Carepartner tắt app → sau 2 phút Parent ring chuông → Admin nhận notification | Offline scheduler detects after 60s → push critical | ✅ Code verified |
| 3 | Carepartner đi ra khỏi vùng → Parent ring chuông ngay (< 30s) | Geofence check on every location update → push geofence_exit | ✅ Code verified |
| 4 | Carepartner tắt mạng → sau 2 phút Parent ring | Same as #2 — heartbeat stops → offline detected | ✅ Code verified |
| 5 | Carepartner kill app → sau 2 phút Parent ring | Same as #2 — auto-resume tries, but if killed, heartbeat stops | ✅ Code verified |
| 6 | Parent acknowledge alert trên app → Admin dashboard cập nhật | SOS resolve endpoint updates status | ✅ Code verified |
| 7 | Admin acknowledge alert trên web → Parent app cập nhật | Admin moderation resolve updates status | ✅ Code verified |

**Note**: Scenarios 2-5 require mobile device to fully test (can't simulate app kill/airplane mode via API). Code logic verified correct.

---

## Conclusion

Safety feature is **FULLY IMPLEMENTED** on both backend + web + mobile:

- ✅ Geofence (vùng an toàn 500m)
- ✅ Device heartbeat (30s interval)
- ✅ Offline detection (60s threshold, 1min scheduler)
- ✅ SOS (both parent + worker, 5/min rate limit)
- ✅ Consent system (grant/deny/revoke)
- ✅ Background tracking (foreground service + auto-resume)
- ✅ Push notification channels (4 channels: critical, sos, geofence, recovery)
- ✅ Web + Mobile parity (same backend API, same data flow)
- ✅ Audio alarm (web: Web Audio API, mobile: vibration patterns)
