# Flow 1 - Step 8: Notifications + Auto-Replacement

## 8.1 Hard requirement from the product owner
- Notifications must work on **web** AND on the **mobile app**.
- Web: sound is required wherever the browser allows it.
- Mobile: a **loud custom sound is MANDATORY** for every push in the `critical` class. A silent critical push is a BUG, not a preference.

## 8.2 Notification classes
| Class | Priority | Sound | Vibration | Channels |
|---|---|---|---|---|
| `critical` | max / high | loud custom, 2-3s, target >= 70dB | yes, 3 repeats | push + in-app + web push + badge |
| `important` | high | default short tone | yes | push + in-app + web push |
| `info` | normal | none | no | in-app + badge |

`critical` events: new job assigned to a CarePartner, CarePartner declined/cancelled/no-show (to the parent), replacement found, reschedule requested, job starts in 60 min, suspension, appeal decision.

## 8.3 Approved Vietnamese copy
| Code | Audience | Class | Title | Body |
|---|---|---|---|---|
| `job_assigned` | CarePartner | critical | Bạn có đơn mới | Bạn được giao đơn này vì bạn đã khai rảnh vào khung giờ đó. Xem chi tiết ngay. |
| `booking_committed` | CarePartner | important | Đơn đã được xác nhận | Bạn cần có mặt đúng giờ vào {time} ngày {date}. |
| `carepartner_declined` | Parent | critical | CarePartner vừa từ chối công việc | CarePartner {name} không thể nhận công việc này. Hệ thống đang đề xuất người thay thế. |
| `carepartner_cancelled` | Parent | critical | CarePartner vừa hủy lịch | CarePartner {name} vừa hủy lịch. Bạn có muốn xem danh sách CarePartner thay thế không? |
| `carepartner_no_show` | Parent | critical | CarePartner không đến | Chúng tôi rất tiếc. Hệ thống đã tìm người thay thế và gửi bù {amount}đ vào ví của bạn. |
| `replacement_found` | Parent | critical | Đã tìm được người thay thế | Chúng tôi tìm thấy {n} CarePartner khác phù hợp với công việc của bạn. |
| `no_replacement` | Parent | important | Chưa có CarePartner phù hợp | Hiện tại chưa có CarePartner phù hợp ngay. Hệ thống sẽ thông báo khi có người mới. |
| `compensation_issued` | Parent | important | Đã nhận đền bù | Bạn nhận được {amount}đ credit do đơn bị hủy. Xem ví của bạn. |
| `job_reminder_60m` | both | critical | Sắp đến giờ | Đơn bắt đầu lúc {time}. Vui lòng có mặt đúng giờ. |
| `reschedule_requested` | Parent | critical | Yêu cầu đổi giờ | CarePartner {name} đề xuất đổi từ {old} sang {new}. Bạn có đồng ý không? |
| `reschedule_answer_needed` | Parent | critical | Sắp hết hạn phản hồi | Bạn còn {minutes} phút để trả lời yêu cầu đổi giờ của CarePartner {name}. |
| `review_requested` | both | info | Đánh giá đơn | Hãy đánh giá để hệ thống ghép cặp tốt hơn. |
| `elo_band_changed` | CarePartner | important | Mức ưu tiên thay đổi | {label}. Hoàn thành thêm đơn đúng giờ để cải thiện. |
| `account_suspended` | CarePartner | critical | Tài khoản bị tạm khóa | {reason}. Bạn có thể gửi kháng cáo trong 7 ngày. |
| `appeal_decided` | CarePartner | critical | Kết quả kháng cáo | {result}. {admin_note} |
| `blackout_paused` | CarePartner | important | Tạm dừng đề xuất | Bạn đã đánh dấu không rảnh 14 ngày liên tiếp. Hệ thống tạm dừng đề xuất đơn. |

Placeholders: `{name}` `{time}` `{date}` `{n}` `{amount}` `{old}` `{new}` `{minutes}` `{label}` `{reason}` `{result}` `{admin_note}`.
All templates live in the DB table `NotificationTemplate` so copy can change without a release. Never hardcode strings in the client.

## 8.4 Sound implementation (mandatory, not optional)
**Mobile (Expo / React Native)**
- Register an Android channel once at app start:
```ts
await Notifications.setNotificationChannelAsync('educarelink_critical', {
  name: 'EduCareLink - Quan trọng',
  importance: AndroidImportance.MAX,
  sound: 'critical_alert.wav',       // bundled in mobile/assets/sounds/
  vibrationPattern: [0, 500, 300, 500, 300, 500],
  lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
  bypassDnd: false,
  enableLights: true,
});
```
- Expo push payload for the critical class:
```json
{
  "to": "<expoPushToken>",
  "title": "CarePartner vừa hủy lịch",
  "body": "...",
  "sound": "critical_alert.wav",
  "channelId": "educarelink_critical",
  "priority": "max",
  "ttl": 3600,
  "_displayInForeground": true,
  "data": { "type": "carepartner_cancelled", "booking_id": "uuid" }
}
```
- iOS: `"sound": "critical_alert.wav"`, `"priority": "high"`, `"contentAvailable": true`.
- Foreground on Android often does NOT play the system sound: when a critical notification arrives while the app is foregrounded, ALSO play the local asset with `expo-av` and trigger `expo-haptics`.
- Known platform limit: on iOS a normal push sound respects the silent switch. Playing sound in silent mode requires Apple's **Critical Alerts entitlement** (separate application to Apple). See OPEN-QUESTIONS.md Q7.

**Web**
- Web Push with VAPID keys plus the `Notification` API.
- On receiving a critical event, play `/assets/sounds/critical_alert.mp3` through an `Audio` element.
- Browser autoplay policy: audio can only play after the user has interacted with the site once. Unlock by requesting notification permission AND playing a 1ms silent audio buffer on the first click.
- Fallback when sound is blocked: a sticky banner plus tab-title blinking, e.g. `(3) EduCareLink`.

**Delivery guarantees**
- Persist every notification in the `Notification` table with `status = queued | sent | delivered | failed | read`.
- Retry `failed` three times with exponential backoff: 10s, 60s, 300s.
- Invalid push token -> deactivate the device, fall back to in-app only.
- The in-app inbox polls every 15s while foregrounded and always shows an unread badge, so nothing is lost when push fails.
- Notifications are ENQUEUED inside the business transaction and SENT on `transaction.on_commit` - never announce a state that was rolled back.

## 8.5 Auto-replacement flow
Trigger: a booking is declined, cancelled or a no-show (tier >= T1).
1. Unlock the cancelled CarePartner's remaining slots.
2. Set `JobPost.status = needs_replacement`.
3. Re-run Step 2 matching, EXCLUDING:
   - the cancelled CarePartner for this job,
   - CarePartners in the `blocked` band,
   - anyone already proposed 3 times for this same job without being selected.
4. Re-rank and take the top 8.
5. Notify the parent with `replacement_found`, `{n}` = number of new candidates (display capped at 8).
6. **Auto-assign mode:** only if the parent enabled `auto_replace = true` in settings AND the top candidate has `match_level in (very_high, high)` AND the job starts within 6h -> the system selects the top candidate automatically and notifies both sides. Default is OFF.
7. If the pool is empty -> send `no_replacement`, keep the job open, retry every 30 min for 6h, then escalate to an admin.
8. Every attempt writes `ReplacementAttempt(job, attempt_no, candidate_count, auto_assigned, created_at)`.

## 8.6 Throttling and dedupe
- One notification per event; retries must never duplicate a push.
- Merge window: if replacements are found twice within 60s, send ONE `replacement_found` with the final count.
- Quiet hours 22:00-06:00 suppress ONLY the `info` class. `critical` and `important` always send - a cancelled job at 5am must still wake the parent.
- Per-CarePartner daily cap on `job_assigned`: 10/day to avoid spam.

## 8.7 Data model
```python
class Notification(models.Model):
    id = UUIDField(primary_key=True)
    user = FK(User, related_name="notifications")
    code = CharField()                     # template code
    klass = CharField()                    # critical | important | info
    title_vi = CharField()
    body_vi = TextField()
    data = JSONField(default=dict)         # deep-link payload
    channels = JSONField(default=list)     # ["push","inapp","webpush"]
    status = CharField(default="queued")
    attempts = IntegerField(default=0)
    created_at = DateTimeField(auto_now_add=True)
    sent_at = DateTimeField(null=True)
    read_at = DateTimeField(null=True)
    class Meta:
        indexes = [Index(fields=["user", "created_at"]), Index(fields=["user", "status"])]

class DeviceToken(models.Model):
    user = FK(User, related_name="device_tokens")
    platform = CharField()                 # expo | web | ios | android
    token = CharField()
    is_active = BooleanField(default=True)
    last_success_at = DateTimeField(null=True)
    class Meta:
        constraints = [UniqueConstraint(fields=["user", "token"], name="uniq_user_device_token")]

class NotificationTemplate(models.Model):
    code = CharField(unique=True)
    klass = CharField()
    audience = CharField()                 # parent | carepartner | both
    title_vi = CharField()
    body_vi = TextField()
    sound = CharField(null=True)
    is_active = BooleanField(default=True)

class ReplacementAttempt(models.Model):
    job = FK(JobPost, related_name="replacement_attempts")
    attempt_no = IntegerField()
    candidate_count = IntegerField()
    auto_assigned = BooleanField(default=False)
    created_at = DateTimeField(auto_now_add=True)
```

## 8.8 API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/devices/tokens` | register or refresh a push token |
| DELETE | `/api/devices/tokens/{id}` | logout / unregister |
| GET | `/api/notifications` | inbox, query `unread=true`, paginated |
| POST | `/api/notifications/{id}/read` | mark one read |
| POST | `/api/notifications/read-all` | mark all read |
| GET | `/api/notifications/unread-count` | badge count |
| GET/PUT | `/api/settings/notifications` | sound on/off, `auto_replace` toggle, quiet-hours override |

## Acceptance Criteria
1. A critical event produces an audible push on a real Android device with the app in background AND killed.
2. A critical event produces an audible push on iOS in background; in foreground the local sound plays via expo-av.
3. Web receives a Web Push and plays sound after the user has interacted with the page at least once.
4. Every notification is persisted with a status and is visible in the in-app inbox even when push fails.
5. Failed pushes retry 3x with backoff; invalid tokens are deactivated without infinite retries.
6. The unread badge count is correct on both platforms.
7. All templates render with the exact Vietnamese copy and placeholders above; missing placeholders raise a validation error, not a broken string.
8. Auto-replacement excludes the cancelled CarePartner and never proposes the same person twice for one job.
9. Auto-assign fires only when the toggle is ON and the conditions in 8.5(6) all hold.
10. Quiet hours suppress only `info`; critical always delivers.
11. Duplicate cancel requests produce ONE notification, ONE penalty, ONE compensation.
12. No push is sent for a transaction that rolls back.

## Testing Checklist
- Real device, app killed, trigger `carepartner_cancelled` -> sound plays, notification on the lockscreen.
- Foreground on Android and iOS -> sound still plays (local asset path).
- Chrome with the tab in background -> push arrives, sound plays after a prior interaction.
- Fresh web tab with NO interaction -> the notification shows, sound is blocked, the banner fallback works, no crash.
- Mock an Expo 500 -> 3 retries with 10/60/300s -> status `failed` -> the item still appears in the inbox.
- Register an invalid token -> marked inactive, no infinite retry loop.
- Two replacements found 20s apart -> exactly one `replacement_found` with the merged count.
- `auto_replace` ON + very_high candidate + job in 3h -> auto-assigned, both sides notified.
- `auto_replace` ON + medium candidate -> NOT auto-assigned.
- Empty pool -> `no_replacement`, retries scheduled, admin escalation after 6h.
- 23:00 `info` event -> suppressed; 23:00 `critical` event -> delivered.
- Read 2 of 5 notifications -> unread-count returns 3.
- Template with a missing `{amount}` -> render error caught, fallback to generic copy, alert logged.
