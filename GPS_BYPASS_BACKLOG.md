# GPS Bypass Backlog — CarePartner Safety Module

> **Status**: OPEN — 2 lỗ hổng đã audit nhưng CHƯA fix trong PR
> `feature/module-an-toan-carepartner`.
>
> **Quyết định**: KHÔNG bắt buộc fix trong PR hiện tại. Ghi nhận rõ ràng để
> không bị quên. Mở issue riêng trên GitHub tracker sau khi merge.

## Tổng quan

Module an toàn CarePartner (geofence + offline detection + random PIN
verification) đã pass 151/151 test backend + 6/6 test mobile. Code review
không phát hiện lỗi logic/bảo mật nghiêm trọng. Tuy nhiên, có 2 lỗ hổng
**GPS bypass** mà backend không thể phát hiện dựa trên dữ liệu hiện tại.

Cả 2 lỗ hổng đều ở phía **mobile app + backend**, không phải chỉ 1 bên.

---

## Lỗ hổng 1 — CarePartner tắt quyền vị trí, heartbeat vẫn gửi

### Mô tả

CarePartner app có 2 luồng gửi dữ liệu lên backend khi đang làm việc:

1. **GPS update** (`POST /api/tracking/location/`): gửi `latitude` + `longitude`
   mỗi 10s (config `TRACKING_UPDATE_INTERVAL`). Yêu cầu location permission
   được cấp (Foreground/Background).
2. **Heartbeat** (`POST /api/tracking/heartbeat/`): gửi mỗi 30s (config
   `TRACKING_HEARTBEAT_INTERVAL`), chỉ cần internet, **KHÔNG cần location
   permission**. Payload gồm `task_id`, `worker_id`, `device_status`,
   optional `latitude`/`longitude`.

### Lỗ hổng

CarePartner có thể:

1. Mở app, accept task, bật tracking (lúc này location permission được cấp,
   GPS hoạt động).
2. Vào Settings → App → EduCareLink → Permissions → Location → **Deny**.
3. Quay lại app — app vẫn chạy nền, heartbeat vẫn gửi mỗi 30s (chỉ cần
   internet), nhưng `latitude`/`longitude` trong payload heartbeat = `null`
   vì location permission bị thu hồi.
4. Backend nhận heartbeat → coi là "online" (vì heartbeat còn đến đều) →
   **KHÔNG trigger `device_offline` alert**.
5. Phụ huynh xem LiveTracking → thấy vị trí "đứng im" ở điểm cuối cùng (stale),
   không biết CarePartner đã tắt chia sẻ vị trí thật.

### Tác động

- Phụ huynh tưởng CarePartner vẫn đang làm việc ở vị trí cuối cùng, thực ra
  CarePartner đã tắt GPS và có thể đã rời vùng an toàn.
- Alert `device_offline` không trigger (vì heartbeat vẫn đến) → không có
  cảnh báo khẩn cấp.
- Random PIN verification vẫn gửi (vì scheduler dựa trên `task.status` và
  `DeviceHeartbeat.last_seen`, không check location data) → có thể bị bỏ qua
  nếu CarePartner không mở app.

### Đề xuất fix

#### Backend side — `tracking/services.py::check_offline_devices`

Thêm logic detect "heartbeat đều nhưng location null quá lâu":

```python
# Pseudocode
def check_location_permission_bypass():
    """Detect CarePartner gửi heartbeat nhưng latitude/longitude=null
    liên tục quá N lần → suspicion location permission bị tắt."""
    recent_heartbeats = DeviceHeartbeat.objects.filter(
        task__status='in_progress',
        worker__role='worker',
        last_seen__gte=now - timedelta(seconds=N_TIMES * HEARTBEAT_INTERVAL),
    ).order_by('-last_seen')[:N_TIMES]

    for hb in recent_heartbeats:
        if hb.latitude is not None or hb.longitude is not None:
            return  # có ít nhất 1 heartbeat có GPS → bình thường

    # Nếu tất cả N heartbeat gần nhất đều null GPS → tạo alert riêng
    DeviceOfflineAlert.objects.get_or_create(
        task=task,
        worker=worker,
        status='active',
        defaults={
            'alert_type': 'location_permission_disabled',  # TYPE MỚI
            'reason': f'Heartbeat OK nhưng GPS null liên tục {N_TIMES} lần '
                      f'(~{N_TIMES * HEARTBEAT_INTERVAL}s)',
        }
    )
    # Gửi push type mới cho parent
    send_expo_push_notification(
        parent_user,
        title='⚠️ CarePartner đã tắt chia sẻ vị trí',
        body=f'{worker_name} vẫn online nhưng không gửi vị trí. Vui lòng '
             f'liên hệ để xác minh.',
        data={
            'type': 'location_permission_disabled',  # TYPE MỚI
            'task_id': task.id,
            'worker_id': worker.id,
            # KHÔNG set critical=True — đây là suspicion, không phải emergency
        }
    )
```

**Config đề xuất**:

- `LOCATION_NULL_THRESHOLD` = `3` (3 heartbeat liên tiếp = ~90s không GPS).
- Tách thành cron riêng hoặc chạy cùng `check_offline_devices` (thêm logic
  song song).

**Migration cần**:

- Thêm field `DeviceOfflineAlert.alert_type` (CharField, choices:
  `device_offline` / `location_permission_disabled`), default
  `device_offline` để backward compat.
- Migration an toàn (AddField nullable + default).

#### Mobile side — `LocationService.js`

Khi `Permissions.getAsync(LOCATION)` trả `status !== 'granted'`:

- Log warning + gửi 1 event riêng `location_permission_revoked` lên backend
  qua heartbeat (thêm field `permission_status` vào heartbeat payload).
- Show in-app banner "Vui lòng bật lại quyền vị trí để tiếp tục chia sẻ
  vị trí cho phụ huynh" — không block app nhưng cảnh báo user.
- Nếu quá 90s vẫn chưa bật lại → backend sẽ detect qua logic trên.

#### Test

Thêm `tracking/tests_location_permission_bypass.py`:

- `test_heartbeat_with_null_gps_3_times_triggers_alert`
- `test_heartbeat_with_gps_does_not_trigger_alert`
- `test_alert_type_location_permission_disabled_distinguished_from_device_offline`
- `test_push_payload_uses_correct_type_and_no_critical_flag`

### Ưu tiên

- **P1 trong sprint kế tiếp** — không phải emergency nhưng là lỗ hổng
  tránh được, phụ huynh có thể mất niềm tin nếu bị exploit.

---

## Lỗ hổng 2 — Không phát hiện fake/mock GPS

### Mô tả

Android cho phép user bật "Mock location" (Settings → Developer Options →
Select mock location app). CarePartner có thể cài app fake GPS (ví dụ
"Fake GPS Location") → gửi toạ độ giả lên backend → phụ huynh thấy vị trí
giả, không phải vị trí thật.

Backend hiện tại **không có cách nào biết** toạ độ nhận được là thật hay
giả, vì payload chỉ có `latitude`/`longitude`/`accuracy`/`recorded_at`.

### Tác động

- CarePartner có thể báo vị trí ở nhà phụ huynh (để không trigger geofence
  exit alert) trong khi thực ra đang ở nơi khác.
- Random PIN verification vẫn gửi, nhưng CarePartner có thể trả lời từ xa
  (không cần ở gần trẻ).
- Mất hoàn toàn ý nghĩa của module an toàn.

### Đề xuất fix

#### Mobile side — `LocationService.js`

`expo-location` (SDK 19, app.json hiện `~19.0.8`) có API trả về flag
`isMocked` trong `LocationObject`. Cần verify lại tài liệu Expo hiện tại:

```javascript
// Pseudocode — verify với tài liệu expo-location hiện tại
import * as Location from 'expo-location';

const location = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.High,
});

// location.isMocked là boolean (Android only, từ SDK 19+)
// Reference: https://docs.expo.dev/versions/latest/sdk/location/
const isMocked = location.isMocked || false;

// Gửi lên backend cùng với toạ độ
await apiClient.post('/tracking/location/', {
  task_id: taskId,
  latitude: location.coords.latitude,
  longitude: location.coords.longitude,
  accuracy: location.coords.accuracy,
  is_mocked: isMocked,  // FIELD MỚI
  recorded_at: new Date().toISOString(),
});
```

**Cần verify trước khi implement**:

- Đọc tài liệu Expo SDK 54 (current) cho `expo-location` ~19.x — field
  `isMocked` có thực sự available hay không.
- iOS không trả `isMocked` (Apple không expose) → field sẽ luôn `false`
  trên iOS. Acceptable vì module này target Android-first.

#### Backend side — `tracking/models.py::LocationHistory`

Thêm field `is_mocked`:

```python
class LocationHistory(models.Model):
    # ... existing fields ...
    is_mocked = models.BooleanField(
        default=False,
        db_index=True,
        help_text='True nếu mobile app detect mock GPS (Android only)'
    )
```

#### Backend side — `tracking/services.py::update_worker_location`

```python
def update_worker_location(task, worker, latitude, longitude, is_mocked=False, ...):
    # ... existing logic ...
    LocationHistory.objects.create(
        task=task,
        worker=worker,
        latitude=latitude,
        longitude=longitude,
        is_mocked=is_mocked,
        # ...
    )

    # Nếu is_mocked=True → tạo alert ngay lập tức
    if is_mocked:
        DeviceOfflineAlert.objects.get_or_create(
            task=task,
            worker=worker,
            status='active',
            alert_type='mock_gps_detected',  # TYPE MỚI
        )
        send_expo_push_notification(
            parent_user,
            title='🚨 Phát hiện GPS giả',
            body=f'{worker_name} đang dùng mock GPS. Vui lòng liên hệ '
                 f'ngay để xác minh.',
            data={
                'type': 'mock_gps_detected',  # TYPE MỚI
                'task_id': task.id,
                'critical': True,  # EMERGENCY — reuse alarm sound
            }
        )
```

#### Migration cần

- `tracking/migrations/0010_add_is_mocked_field.py`:
  - AddField `LocationHistory.is_mocked` (BooleanField, default=False).
  - AddField `DeviceOfflineAlert.alert_type` (CharField, default='device_offline')
    nếu chưa có từ lỗ hổng 1.

#### Test

Thêm `tracking/tests_mock_gps_detection.py`:

- `test_location_with_is_mocked_true_creates_alert`
- `test_location_with_is_mocked_false_does_not_create_alert`
- `test_mock_gps_alert_uses_critical_push_payload`
- `test_mock_gps_alert_distinguished_from_device_offline`
- `test_backward_compat_old_app_without_is_mocked_field` (app cũ không gửi
  field → backend default False, không crash).

### Ưu tiên

- **P2 trong sprint kế tiếp** — quan trọng nhưng cần verify tài liệu Expo
  trước khi implement. Nếu Expo SDK 54 không hỗ trợ `isMocked`, cần fallback
  sang native module hoặc library `react-native-mock-detector`.

### Hạn chế kỹ thuật

- `isMocked` chỉ available trên Android (iOS không expose).
- User có thể dùng root + Magisk module để bypass `isMocked` detection →
  không có cách detect 100%. Nhưng đập được đa số case (apps fake GPS thông
  thường).
- Backend nên log tần suất `is_mocked=True` để detect pattern abuse.

---

## Roadmap tổng hợp

| Lỗ hổng | Ưu tiên | Effort | Dependency |
|---|---|---|---|
| 1. Location permission bypass | P1 sprint kế | Backend 1-2 ngày, mobile 0.5 ngày | Cần migration `alert_type` field |
| 2. Mock GPS detection | P2 sprint kế | Backend 1 ngày, mobile 1 ngày (verify Expo SDK) | Cần verify `isMocked` API + migration `is_mocked` field |

Cả 2 lỗ hổng nên được fix **cùng 1 PR** vì chia sẻ logic alert type + migration.

## Cách theo dõi

- Mở 2 issue trên GitHub tracker:
  - `[Safety] Detect location permission bypass via heartbeat null GPS`
  - `[Safety] Detect mock GPS via expo-location isMocked flag`
- Tag với label `safety`, `enhancement`, `backend`, `mobile`.
- Link tới PR `feature/module-an-toan-carepartner` merge commit để có
  context.
- Assign cho dev kế tiếp phụ trách module safety.
