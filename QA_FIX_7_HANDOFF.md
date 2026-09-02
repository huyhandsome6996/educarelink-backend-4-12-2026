# QA-FIX-7 — Handoff document

Ngày: 14-08-2026
Branch: `feature/module-an-toan-carepartner`
Commit: `<TBD>` — QA-FIX-7: đảo lại field tương thích ngược push (fix QA-FIX-6 / N1)

## Mục lục

1. [Tóm tắt](#tóm-tắt)
2. [Vấn đề QA-FIX-6 / N1 bị sai](#vấn-đề-qa-fix-6--n1-bị-sai)
3. [Fix QA-FIX-7 — Đảo lại field](#fix-qa-fix-7)
4. [Lựa chọn thiết kế](#lựa-chọn-thiết-kế)
5. [Test kết quả](#test-kết-quả)
6. [Bước tiếp theo cho QA](#bước-tiếp-theo-cho-qa)

---

## Tóm tắt

QA vòng 3 phát hiện QA-FIX-6 / N1 (tương thích ngược push type) **không hoạt động
thật** — field `legacy_type` vô dụng vì app cũ không đọc nó. QA-FIX-7 đảo lại
vị trí 2 giá trị: giữ `data.type='device_offline'` (giá trị CŨ, app cũ match
được) + thêm flag `data.critical=True` (giá trị MỚI, app mới dùng để bật còi
to + channel emergency-alerts).

| # | Mức độ | Vấn đề | Fix |
|---|--------|--------|-----|
| N1 | SAU CÙNG | QA-FIX-6 / N1 field `legacy_type` vô dụng — app cũ chỉ check `data.type`, không biết `legacy_type` | Đảo lại: `data.type='device_offline'` (CŨ, app cũ match) + `data.critical=True` (MỚI, app mới check để bật còi to) |

---

<a name="vấn-đề-qa-fix-6--n1-bị-sai"></a>
## Vấn đề QA-FIX-6 / N1 bị sai

### Hiện trạng QA-FIX-6

`tracking/services.py` gửi payload push với:
- `data.type = 'device_offline_critical'` (giá trị MỚI)
- `data.legacy_type = 'device_offline'` (giá trị CŨ, thêm vào để "tương thích ngược")

### Vấn đề thật

App mobile CŨ (nhánh `main` hiện tại trên production) chỉ đọc field `data.type`,
so khớp đúng chuỗi `'device_offline'`:

```javascript
// mobile/src/screens/Parent/LiveTrackingScreen.js (nhánh main)
if (data.type === 'device_offline') { /* trigger alarm */ }
```

App cũ **KHÔNG biết** field `legacy_type` tồn tại — field này chỉ có trong code
app MỚI (cùng PR này). Vì `data.type` giờ là `'device_offline_critical'`, app
cũ sẽ **KHÔNG match** → mất hoàn toàn cảnh báo — y hệt như trước khi "sửa".

### Tại sao test QA-FIX-6 không phát hiện lỗi

`QAFix6N1LegacyPushTypeTestCase` chỉ assert 2 field có mặt trong dict
(`data.get('type') == 'device_offline_critical'` +
`data.get('legacy_type') == 'device_offline'`). Test **KHÔNG mô phỏng logic
if-check thật** của app cũ → test PASS nhưng chức năng không hoạt động.

---

<a name="fix-qa-fix-7"></a>
## Fix QA-FIX-7 — Đảo lại field

### 1. Backend `tracking/services.py` (2 chỗ)

Cả `check_offline_devices()` (initial alert) và `retry_offline_alert_pushes()`
(retry push) đều đổi:

**Trước (QA-FIX-6):**
```python
data={
    'type': 'device_offline_critical',
    'legacy_type': 'device_offline',
    ...
}
```

**Sau (QA-FIX-7):**
```python
data={
    'type': 'device_offline',     # GIỮ giá trị CŨ → app cũ match
    'critical': True,             # flag MỚI → app mới check để bật còi to
    ...
}
```

### 2. Backend `core/views.py::send_expo_push_notification`

Thêm helper `_resolve_alert_type()` để resolve type thực tế trước khi tra
`ALERT_CONFIG`:

```python
def _resolve_alert_type(raw_type, data_dict):
    """Nếu raw_type='device_offline' VÀ data_dict['critical']=True →
    trả 'device_offline_critical' (channel emergency-alerts, còi to).
    Ngược lại → trả raw_type nguyên thuỷ (giữ behaviour cũ cho
    backward compat với backend cũ không set critical)."""
    if raw_type == 'device_offline' and data_dict.get('critical') is True:
        return 'device_offline_critical'
    return raw_type

# ...
effective_alert_type = _resolve_alert_type(alert_type, data)
config = ALERT_CONFIG.get(effective_alert_type)
```

**Hành vi:**
- `type='device_offline'` + `critical=True` → channel `emergency-alerts` (còi
  to, sound `emergency_alarm.wav`, bypass DnD).
- `type='device_offline'` + `critical=False`/missing → channel `critical_alerts`
  (basic, sound default) — backward compat với backend cũ hơn nữa nếu có.

### 3. Mobile `LiveTrackingScreen.js` (app MỚI)

**Trước (QA-FIX-6):**
```javascript
if (data.type === 'device_offline' || data.type === 'device_offline_critical') {
    playEmergencyAlarm();  // luôn bật còi to
    ...
}
```

**Sau (QA-FIX-7):**
```javascript
if (data.type === 'device_offline') {  // ĐƠN GIẢN — y hệt app cũ
    const isCritical = data.critical === true;
    if (isCritical) {
        playEmergencyAlarm();  // chỉ bật còi to khi critical=True
    }
    Vibration.vibrate([1000, 500, ...], false);  // burst ban đầu (luôn)
    ...
}
```

Cũng cập nhật `triggerAlarmSound()` để nhận tham số `isCritical`, và cập nhật
`data` trong local notification cho đồng bộ.

### 4. Mobile `App.js`

Cập nhật comment mô tả channel `emergency-alerts` — giữ nguyên logic channel
setup (không đổi).

### 5. Tests `tracking/tests_qa_fix_6.py::QAFix6N1LegacyPushTypeTestCase`

Cập nhật 2 test cũ + thêm 4 test mới (tổng 6 tests cho N1):

| Test | Mô tả |
|------|-------|
| `test_n1_initial_alert_payload_qa_fix_7` | Initial alert: type='device_offline' + critical=True, KHÔNG còn legacy_type |
| `test_n1_retry_push_payload_qa_fix_7` | Retry push: type='device_offline' + critical=True + retry=1 |
| `test_n1_old_app_logic_matches_new_payload_initial_alert` | **MÔ PHỎNG logic app cũ** `if (data.type === 'device_offline')` cho initial alert → phải match |
| `test_n1_old_app_logic_matches_new_payload_retry_push` | Mô phỏng logic app cũ cho retry push → phải match |
| `test_n1_send_expo_push_notification_resolves_critical_to_emergency_channel` | End-to-end: type+critical → channel 'emergency-alerts' |
| `test_n1_send_expo_push_notification_without_critical_uses_basic_channel` | Backend cũ không set critical → channel 'critical_alerts' (backward compat) |

---

<a name="lựa-chọn-thiết-kế"></a>
## Lựa chọn thiết kế

### Tên field `critical` (thay vì `is_critical` / `severity` / `alarm_level`)

QA prompt đề xuất `data.critical=True` (hoặc "tên khác rõ nghĩa hơn"). Chọn
giữ `critical` vì:
- Ngắn gọn, dễ đọc trong payload push (Expo giới hạn payload size).
- Semantic rõ ràng: `True` = "đây là cảnh báo khẩn cấp cần xử lý đặc biệt".
- JS convention: flag boolean thường không có prefix `is` khi nằm trong dict
  data (Expo payload data là JSON object, không phải JS class property).

### Khi nào có thể xoá flag `critical`

**Target: 2-3 tháng sau release (~2026-11)** — cùng thời điểm với计划 xoá
`legacy_type` của QA-FIX-6 (giờ không còn áp dụng). Theo dõi analytics/version
distribution trước khi xoá. Khi xoá:
- Backend: luôn set `type='device_offline_critical'` (channel emergency-alerts).
- Mobile mới: chỉ check `type === 'device_offline_critical'`.
- Mobile cũ: đã hết hỗ trợ.

### Backward compat thêm 1 lớp

Ngoài tương thích với app cũ (match `type === 'device_offline'`), QA-FIX-7 còn
tương thích với **backend cũ hơn nữa** nếu có: backend cũ không set
`critical=True` → `send_expo_push_notification` resolve về channel
`critical_alerts` (basic, sound default) — không crash, không silent fail.

---

<a name="test-kết-quả"></a>
## Test kết quả

| Lệnh | Kết quả |
|---|---|
| `manage.py check` | ✅ PASS, 0 lỗi |
| `manage.py makemigrations --check --dry-run` | ✅ "No changes detected" (không đổi model) |
| `manage.py test tracking.tests_qa_fix_6` (24 test, gồm 6 test N1 mới) | ✅ PASS 100% |
| `manage.py test core payments moderation tracking` (151 test) | ✅ PASS 100% |

### Chi tiết 6 test N1 (mô phỏng app cũ)

```python
# Test 3+4: MÔ PHỎNG LOGIC APP CŨ — copy y hệt từ LiveTrackingScreen.js (main)
old_app_would_trigger_alarm = (data.get('type') == 'device_offline')
self.assertTrue(old_app_would_trigger_alarm, ...)
```

Đây là cách test có ý nghĩa thật — không chỉ check dict có field gì, mà verify
app cũ **THẬT SỰ** match payload mới bằng cách copy đúng điều kiện if-check.

---

<a name="bước-tiếp-theo-cho-qa"></a>
## Bước tiếp theo cho QA

### Trước khi merge

1. **Review code** 4 vùng fix QA-FIX-7:
   - `tracking/services.py:561-578` (initial alert payload).
   - `tracking/services.py:688-710` (retry push payload).
   - `core/views.py:107-202` (`_resolve_alert_type` + `ALERT_CONFIG` lookup).
   - `mobile/src/screens/Parent/LiveTrackingScreen.js:127-243` (notification
     listener + `triggerAlarmSound`).
2. **Run test suite**: `pip install -r requirements.txt`, `python manage.py test
   core payments moderation tracking` — phải pass 151 tests.
3. **Verify mobile syntax**: `cd mobile && npx expo-doctor` (nên pass 18/18).

### Sau khi merge — Quy trình deploy an toàn (5 bước)

Vẫn giữ nguyên quy trình deploy 5 bước từ QA-FIX-6 (rủi ro Render Cron Job
không đổi). Tóm tắt:

1. Merge PR nhưng CHƯA auto-deploy.
2. Xác nhận Render dùng Blueprint sync.
3. Vào Cron Job → Copy `SECRET_KEY` + `DATABASE_URL` từ web service.
4. `curl /api/tracking/scheduler-health/` → phải thấy `status=ok`.
5. Mới coi như deploy an toàn.

### E2E test trên thiết bị thật

Thêm test case mới cho QA-FIX-7:
- **App cũ (build từ main) + backend mới (QA-FIX-7)** → verify app cũ vẫn nhận
  cảnh báo offline (vì `data.type='device_offline'` match).
- **App mới (build từ branch) + backend cũ (main)** → verify app mới vẫn hoạt
  động (vì `data.critical` falsy → fallback Vibration, không crash).
- **App mới + backend mới** → verify còi to + channel emergency-alerts hoạt
  động đúng.
