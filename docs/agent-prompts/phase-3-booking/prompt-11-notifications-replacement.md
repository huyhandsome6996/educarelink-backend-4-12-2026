# Prompt 11 — Notification System (critical + sound BẮT BUỘC) + Auto-Replacement

## Context
Yêu cầu CỨNG của owner (Step 8.1): notification chạy cả web + mobile; mobile **push class `critical` PHẢI kèm âm thanh LOA** — push critical im lặng là BUG. Hạ tầng có sẵn: `send_expo_push_notification()` (`core/views.py:74`) đã hỗ trợ channel/priority; `expo_push_token` trên User; mobile đã có `assets/sounds/` (kiểm tra file `critical_alert.wav` — nếu chưa có, Prompt 15 bổ sung). Prompt này dựng: model/template/inbox/retry/dedupe/quiet-hours + mobile channel registration + **auto-replacement flow**.

## Requirements (nguồn `flow1-step8-notifications-replacement.md`)
- §8.2 class: critical (priority max, loud custom 2-3s ≥70dB, vibrate 3 lần, push+inapp+webpush+badge), important (tone ngắn, push+inapp+webpush), info (không sound, inapp+badge). Critical events: job_assigned, declined/cancelled/no-show (cho parent), replacement_found, reschedule_requested, job_reminder_60m, suspension, appeal_decided.
- §8.3 16 template copy tiếng Việt CHUẨN (bảng spec) + placeholders; templates sống trong bảng `NotificationTemplate` — cấm hardcode string phía client.
- §8.4 sound: Android channel `educarelink_critical` (importance MAX, sound critical_alert.wav, vibrationPattern [0,500,300,500,300,500], lockscreen PUBLIC); Expo push payload đúng JSON spec (`channelId`, `priority: max`, `_displayInForeground`, data.type+booking_id); iOS sound+priority high+contentAvailable; foreground Android không kêu system → app tự play asset bằng expo-av + expo-haptics; Web: VAPID + Audio element, autoplay unlock bằng tương tác đầu + 1ms silent buffer, fallback banner + tab title blinking "(3) EduCareLink".
- Delivery guarantees: persist mọi notification `queued|sent|delivered|failed|read`; retry failed 3 lần backoff 10/60/300s; token invalid → deactivate + fallback inapp; inbox poll 15s + unread badge; enqueue trong transaction, gửi ở `transaction.on_commit`.
- §8.5 auto-replacement (trigger từ cancel event của Prompt 10, tier ≥ T1): unlock slots, job→needs_replacement, re-run matching EXCLUDE (CP bị hủy, band blocked, CP đã proposed 3 lần cho job này); top 8 → notify parent `replacement_found` {n}; auto-assign CHỈ khi parent bật `auto_replace=true` VÀ top candidate level ∈ {very_high, high} VÀ job start ≤6h (mặc định OFF — OPEN-QUESTIONS #3); pool rỗng → `no_replacement` + retry 30 phút × 6h → admin escalation; ghi `ReplacementAttempt` mỗi lần.
- §8.6 throttle/dedupe: 1 notification/event, retry không nhân bản; merge window 60s cho replacement_found; quiet hours 22:00-06:00 CHỈ chặn info; cap job_assigned 10/ngày/CP.

## Acceptance Criteria
1. Sender service `matching/services/notifier.py::send_pending()` — worker thread quét Notification queued: render template (placeholder fill), push qua Expo helper + lưu sent_at; Expo trả DeviceNotRegistered → DeviceToken.is_active=False + không retry token đó.
2. Retry: mock Expo 500 3 lần → status `failed` sau backoff 10/60/300s (test với time freeze/accelerate), notification VẪN nằm inbox (AC 8:8.4).
3. `POST /api/devices/tokens` (đăng ký/refresh, unique (user, token)), DELETE logout; migrate từ `User.expo_push_token` cũ: nếu DeviceToken trống mà user có expo_push_token → sender dùng fallback field đó (backward compatible).
4. Inbox: `GET /api/v2/notifications/` (phân trang, filter unread), `POST /{id}/read`, `POST /read-all`, `GET /unread-count` — badge đúng khi đọc 2/5 → 3 (spec test). Path dùng `/api/v2/` (deviation: giữ `/api/notifications/` cho hệ cũ — ghi chú trong README api).
5. Quiet hours: 23:00 info → suppressed (status=suppressed, không push); 23:00 critical → DELIVERED.
6. Dedupe/merge: cancel event bắn 2 lần → 1 notification (idempotency từ Prompt 10); 2 replacement cách 20s → 1 `replacement_found` count gộp (merge window test).
7. Cap: job_assigned thứ 11 trong ngày cho 1 CP → không gửi (status=throttled + log).
8. Template render thiếu placeholder `{amount}` → raise validation error bắt được → fallback generic copy + alert log (KHÔNG gửi string gãy).
9. Auto-replacement: cancel T1 → attempts ghi row, matching exclude đúng 3 nhóm, parent nhận `replacement_found` với n mới; auto_replace ON + very_high + start 3h → auto-select booking mới + notify 2 bên; ON + medium → KHÔNG; pool rỗng → `no_replacement` + retry job 30' ×6h → admin alert sau đó (test mock time).
10. Mobile channel: file cấu hình `mobile/src/services/notifications.js` đăng ký channel lúc app start ĐÚNG spec §8.4 (importance MAX, sound file, vibration pattern) — code review checklist; payload backend có `channelId=educarelink_critical` + `sound=critical_alert.wav` cho class critical (test assert payload dict).
11. Job reminder 60m: beat task gửi `job_reminder_60m` critical cho 2 bên đúng 60 phút trước mỗi slot committed (idempotent — gửi 1 lần/booking/slot).
12. Web push: service worker + VAPID config endpoint `GET /api/devices/vapid-public-key`; nếu env chưa có VAPID → web push skip an toàn (log), mobile vẫn hoạt động (khổ chính là mobile).

## Technical Approach
- Model đã có (Prompt 01): Notification, DeviceToken, NotificationTemplate, ReplacementAttempt. Bổ sung: `Notification.klass`, `status` thêm giá trị `suppressed|throttled`.
- `notifier.py`: render (python `str.format` an toàn theo template), channel map theo class, `send_pending()` chạy trong thread scheduler mỗi 10s + `transaction.on_commit(lambda: queue.enqueue(...))` đẩy ngay; backoff scheduler dùng `next_retry_at` field.
- Web push: dùng thư viện `pywebpush` (thêm vào requirements; nếu prod chưa cấu hình VAPID, feature dormant).
- Replacement service `matching/services/replacement_service.py`: `run_replacement(job)` — gọi MatchingService với exclusion set + tạo ReplacementAttempt + notify + auto-assign logic; retry loop quản bởi scheduler (bảng MatchingConfig key `REPLACEMENT_RETRY_MINUTES=30`, `REPLACEMENT_RETRY_HOURS=6`).
- Mobile file (Prompt 15 hoàn thiện UI inbox): chỉ phần channel registration + helper play local sound (`expo-av`) đặt ở đây để backend payload khớp.

## Code References
- Spec: `flow1-step8-notifications-replacement.md` toàn bộ; `flow1-step7-cancellation-compensation.md` §7.5.
- Tái sử dụng: `core/views.py:74 send_expo_push_notification` (MỞ RỘNG tham số channelId/sound — sửa cẩn thận giữ backward-compat với alert tracking hiện có: thêm param optional, KHÔNG đổi behavior mặc định).
- Tạo: `matching/services/{notifier,replacement_service}.py`, `matching/api/{notifications,devices}.py`, `matching/schedulers/notifier_worker.py`, `mobile/src/services/notifications.js`, tests `matching/tests/test_notifications.py`, `test_replacement.py`.
- Sửa: `matching/urls.py` (v2 paths), seed command (16 template), `backend/settings.py` (WEBPUSH_VAPID env optional).

## Testing Checklist (spec §Testing — 13 dòng, làm đủ)
- Real device killed app → critical sound (thủ công, ghi biên bản — auto test chỉ assert payload).
- Foreground Android/iOS → local asset path play (mobile test ở Prompt 15).
- Chrome background → push + sound sau interaction (manual).
- Tab mới chưa interact → banner fallback, không crash.
- Expo 500 mock → 3 retry → failed → vẫn trong inbox.
- Token invalid → inactive, không vòng lặp vô hạn.
- 2 replacement cách 20s → 1 notification gộp.
- auto_replace 4 case (ON+very_high+3h / ON+medium / OFF / pool rỗng).
- 23:00 info suppressed; 23:00 critical delivered.
- Read 2/5 → unread 3.
- Template thiếu placeholder → fallback + alert.
- Duplicate cancel → 1 notification/penalty/compensation (kết hợp Prompt 10).
- Exception sau enqueue → rollback → không push.

## Edge Cases
- User có nhiều device: push TẤT CẢ token active; 1 token fail → các token khác vẫn gửi.
- CP bị suspend nhận `account_suspended` critical (cho phép gửi dù không match được).
- Merge window khi process restart giữa chừng: merge dựa trên debounce row trong DB (MatchingConfig flag + last_sent_at trên ReplacementAttempt) không dựa memory.
- Thời gian quiet hours theo Asia/Ho_Chi_Minh.
- Notification cho user đã deactivate account → skip + log.

## Dependencies
- Prompt 01 (bảng + seed template), 02 (throttle band dùng chung), 07 (matching cho replacement), 09 (booking events), 10 (cancel events + suspend).
- Prompt 15 hoàn thiện UI inbox + real-device QA.
