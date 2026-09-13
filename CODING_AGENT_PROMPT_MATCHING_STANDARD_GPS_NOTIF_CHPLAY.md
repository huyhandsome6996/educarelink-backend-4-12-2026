# MISSION: Đưa thuật toán AI + matching đạt chuẩn sản phẩm, rồi build/deploy CH Play

> **Repo:** `https://github.com/huyhandsome6996/educarelink-backend-4-12-2026`  
> **Branch:** **`main` — làm việc trực tiếp trên main.** Không tạo feature branch. Không mở PR.  
> **Commit:** tiếng Việt (bắt buộc theo `AGENTS.md`).  
> **Deploy CH Play:** credentials / service account / EAS đã có sẵn. **KHÔNG hỏi lại** key, account, track. Build AAB production rồi `eas submit` non-interactive.  
> **SSO:** `AGENTS.md` đọc TRƯỚC khi sửa code.

Audit QA (2026-09-13, HEAD `b1dd5c8`) kết luận: **chưa đạt chuẩn**. Skill-gating Piano/Văn + GPS drift đã có một phần, nhưng 5/7 yêu cầu sản phẩm còn lỗ hổng. Sửa dứt điểm, viết test, rồi ship CH Play.

---

## 0. Bối cảnh sản phẩm (đọc để khỏi phá kiến trúc)

EduCareLink ghép **Phụ huynh** với **CarePartner (sinh viên)**. Flow 1 (canonical):

```
Parent đăng JobPost
  → Gemini parse required_skills
  → matching_service.find_candidates (7-factor, max 8)
  → Parent chọn 1 CP
  → Booking.awaiting_commitment (cửa sổ cam kết)
  → CP xác nhận / từ chối / hết hạn
  → committed | replacement
```

Hai stack song song (đừng để lệch):

| Stack | Models | Dùng cho |
|---|---|---|
| **Flow 1 (phải chuẩn)** | `matching.JobPost` / `Booking` | Form gia sư / trông trẻ / đón trẻ mới |
| **Legacy (vẫn sống)** | `core.Task` + `smart_match.py` | Feed việc cũ. Blackout / GPS / exclusive **KHÔNG** áp vào đây |

Mọi thay đổi matching **phải** đi vào `matching/`. Nếu UI còn gọi `/api/tasks/` cho luồng gia sư mới, chuyển sang `/api/matching/*`.

---

## 1. Kết quả audit — đạt / chưa đạt

| # | Yêu cầu sản phẩm | Hiện trạng | Việc phải làm |
|---|---|---|---|
| 1 | Trong lúc PH chờ SV xác nhận, **không đề xuất cùng job cho người khác** cho đến hết hạn hoặc SV từ chối | **Gần đạt** sau khi parent *đã chọn*. `select_carepartner` hard-lock + `not_selected` + `CandidatesAPIView` 409 khi `carepartner_selected`. Replacement chỉ sau expire/decline. | Chốt bằng test tích hợp. Worker feed / legacy Task **không** được lộ job đang `awaiting_commitment`. Soft-lock 5' khi PH đang xem danh sách (hàm có, **0 caller production**). |
| 2 | Ưu tiên ứng viên tốt hơn theo tiêu chí PH (skill, rating, khoảng cách, lịch, ELO) + AI | **Đạt phần rule.** 7-factor 25/20/15/15/10/10/5 + skill-gating. Gemini **chỉ parse job**, **không re-rank**. Spec 2.2.4 / 11.2 task 8 chưa làm. | Thêm Gemini semantic re-rank top 20 → top 8. Khoảng cách **không được là hard-kill quyết định**. |
| 3 | CarePartner mới đăng ký không bị bỏ quên, vẫn được đề xuất việc để kiếm tiền | **Chưa đạt.** `is_approved=False` chặn login + matching. Không có exploration quota. Skill rỗng + major lệch → bị loại. | Giữ KYC. Sau khi duyệt: luôn chèn ≥1 newbie vào top 8 nếu pass hard filter. Onboarding bắt buộc skill + lịch rảnh. |
| 4 | Đã khai lịch nghỉ (blackout) đúng ngày/giờ → không đề xuất | **Đạt Flow 1.** `available_slots` trừ blackout. **Legacy `smart_match` bỏ qua blackout.** Thiếu test `find_candidates`. | Test engine. Legacy matcher cũng phải tôn trọng blackout. |
| 5 | GPS 100% để tính khoảng cách (là **một** tiêu chí, **không** quyết định) | **Chưa đạt 100%.** GPS tươi <48h mới dùng; không consent → 403 không ghi; web **0 heartbeat**; `MAX_GPS_DRIFT_KM=50` **loại CP khỏi MỌI job** (kể cả job ngay chỗ GPS hiện tại). `km=None` → điểm distance 100 (thắng người gần). | Dùng GPS hiện tại cho distance. Bỏ loại toàn pool vì drift. Heartbeat định kỳ mobile + web. Distance chỉ 15% score. |
| 6 | Nhận đơn → **luôn** có chuông + popup trên máy SV | **Chưa luôn.** Push `job_assigned` critical + channel `educarelink_critical` + WAV foreground. **Không có modal in-app.** `DeviceToken` **không bao giờ được ghi** (chỉ fallback `User.expo_push_token`). | Upsert DeviceToken. Modal toàn màn hình + chuông. Data payload `class=critical`. |
| 7 | Web + mobile cùng API, cùng tài khoản, đổi bên này hiện bên kia | **Gần đạt.** JWT + `/api/matching/*` dùng chung. Còn dual Task/JobPost, dual Notification, GPS chỉ mobile. | Cùng endpoint. Heartbeat web. Inbox matching thống nhất. |

---

## 2. Việc cấm phá

- **Không** bỏ `is_approved` / KYC CCCD. Sinh viên chưa duyệt **không** vào pool matching (an toàn trẻ em). Cold-start = *sau khi admin duyệt*, không bị thuật toán ghẻ lạnh.
- **Không** để Gemini tự ý trừ tiền / khóa tài khoản / đổi ELO. Re-rank chỉ **sắp lại** trong top 20 rule-based, không được drop người đã vào top 20.
- **Không** hardcode `'Cầu Giấy, Hà Nội'`.
- **Không** hỏi credential CH Play / EAS / service account.
- Tutoring **không** lọc giới tính (bất biến Step 11.4).

---

## 3. Task chi tiết

### TASK A — Exclusive lock khi đang chờ xác nhận (chốt chuẩn)

**Hành vi bắt buộc**

1. Parent chọn CP → `Booking.status=awaiting_commitment`, `JobPost.status=carepartner_selected`.
2. Trong cửa sổ `commit_deadline`:
   - Không `find_candidates` lại cho job này (API 409 — đã có).
   - Không notify / không hiện job trên feed của CP khác.
   - `select_carepartner` CP khác → `SlotConflictError` (đã có).
3. Mở khóa + đề xuất người khác **chỉ khi**:
   - hết `commit_deadline` → `EXPIRED_NO_RESPONSE` + `release_locks` + `trigger_replacement`
   - CP từ chối trong window → `DECLINED_IN_WINDOW` + `release_locks` + `trigger_replacement`
4. Wire `LockService.soft_lock` khi parent **đang xem** danh sách ứng viên (TTL `SOFT_LOCK_TTL_SECONDS`, mặc định 300s) để 2 phụ huynh không giữ cùng 1 CP trong 5 phút. Soft lock **không** thay exclusive job lock ở (1–3).

**File**

- `matching/services/booking_service.py`
- `matching/api/jobs.py` (`CandidatesAPIView`)
- `matching/services/lock_service.py` (gọi `soft_lock` từ API xem ứng viên)
- Worker feed: `mobile/src/screens/Worker/*`, `frontend/templates/frontend/worker_feed.html` — lọc job `carepartner_selected` / `awaiting_commitment` của người khác.
- `matching/services/booking_task_bridge.py` — legacy Task sinh từ booking **không** public cho worker khác.

**Test mới** (file `matching/tests/test_exclusive_offer.py`)

```
test_candidates_api_409_while_awaiting_commitment
test_second_parent_cannot_select_same_cp_slot
test_other_cp_not_notified_during_window
test_expire_then_replacement_proposes_next
test_decline_then_replacement_proposes_next
test_soft_lock_on_candidate_view
```

---

### TASK B — AI + ranking: ưu tiên ứng viên tốt, khoảng cách không quyết định

**Rule (giữ, chỉnh 2 chỗ)**

1. `matching/services/matching_service.py`
   - **XÓA** khối `MAX_GPS_DRIFT_KM` loại toàn pool (`matching_service.py` ~446–454).  
     Lý do: SV Huế đang ở Hà Nội phải được ghép **việc Hà Nội** (GPS hiện tại). Việc Huế tự rớt vì `haversine` lớn — không cần cấm hết.
   - Radius: nới thành **điểm phạt**, không hard-kill dưới 40 km.  
     `km > max_allowed_km`: **không `continue`**. Gán `subs['distance']=0` rồi vẫn chấm các factor khác.  
     Chỉ hard-drop khi `km > 80` (không khả thi đi làm). 80 đọc từ `MatchingConfig` key `HARD_DROP_DISTANCE_KM`.
   - `km is None`: **không** cho 100 điểm. Cho **50** (trung tính). Không bypass radius bằng điểm tuyệt đối.
   - Sort giữ: `(-match_score, -_skills, -_elo, _distance, -_completion)`.

2. **Gemini re-rank (spec 2.2.4 + 11.2 task 8)**  
   File mới hoặc mở rộng `matching/services/gemini_service.py`:
   - Input: JobRequirement + top 20 candidate dict (ẩn ELO; gồm name, school, major, skills, rating, reviews snippet, distance_km, availability_fit).
   - Output: thứ tự mới + `why_recommended_vi` (1 câu tiếng Việt) cho mỗi người.
   - Chỉ reorder trong top 20. Không drop. Timeout 2.5s. Lỗi / no key → giữ thứ tự rule.
   - Log `AiCallLog`. Matching **không** chết khi Gemini down.

**Test**

- `test_gps_in_hanoi_matches_hanoi_job` (đăng ký Huế, GPS Hà Nội, job Hà Nội → **VÀO** pool).
- `test_gps_in_hanoi_far_from_hue_job_low_distance_score` (job Huế → điểm distance thấp / có thể rớt vì 80km).
- `test_missing_coords_distance_is_neutral_50_not_100`.
- `test_gemini_rerank_preserves_top20_membership` (mock Gemini đảo thứ tự, không drop).
- Piano job vẫn **không** trả gia sư nấu ăn 99 điểm (`SpecializedSkillGatingTest` phải xanh).

---

### TASK C — Cold-start CarePartner mới (không bỏ quên sau khi duyệt)

KYC giữ nguyên. Bổ sung **sau `is_approved=True`**:

1. Signal / `EloService.get_profile` khi admin duyệt:
   - Tạo `CarePartnerProfile` (hidden_elo=1200, band `normal`) nếu chưa có.
   - Push in-app + Expo: “Hồ sơ đã duyệt — khai lịch rảnh và kỹ năng để nhận việc ngay”.
2. `find_candidates`: sau khi sort top N, **exploration slot**:
   - Nếu trong top N không có ai `jobs_completed==0` và review_count==0, **chèn 1 newbie** pass hard filter (skill/major + lịch + không blackout) vào vị trí cuối, đẩy người điểm thấp nhất ra.
   - Newbie không được vượt mặt ứng viên `match_level=very_high` ở #1. Slot là #N (thường #8).
3. Onboarding worker (mobile + web): chặn “xong” nếu `skills` rỗng **hoặc** chưa có 1 `CarePartnerAvailability`. Copy: “Chưa khai kỹ năng/lịch rảnh thì hệ thống không thể giới thiệu việc”.
4. Worker pending (`is_approved=False`) **được login hạn chế** (chỉ onboarding + upload CCCD), **không** vào matching. Hiện nay login 403 khiến họ không thể hoàn thiện profile → ngày duyệt vẫn bị skill-gate.  
   Sửa `LoginAPIView`: pending worker nhận JWT kèm `status=pending_approval` + `permissions=['onboarding']`. Matching / bookings / feed việc trả 403.

**Test**

- `test_unapproved_worker_not_in_find_candidates` (giữ).
- `test_approved_newbie_with_skills_and_availability_in_top_n`.
- `test_exploration_slot_inserts_one_zero_job_cp`.
- `test_pending_worker_can_login_onboarding_only`.

---

### TASK D — Lịch nghỉ đúng ngày/giờ

Đã trừ blackout trong `available_slots`. Còn thiếu:

1. Test engine: CP blackout `2026-09-18 19:00–21:00` → job đúng slot đó **không** có CP trong `find_candidates`; job khung khác cùng ngày **vẫn có**.
2. Full-day blackout (`time_from=time_to=null`) loại cả ngày.
3. `core/services/smart_match.py` (legacy): trừ `CarePartnerBlackout` giống Flow 1 — hoặc document + chặn UI legacy đăng gia sư mới (chỉ Flow 1).

Mobile `BlackoutScreen.js` + web lịch rảnh phải ghi đúng `date` + optional time. Timezone `Asia/Ho_Chi_Minh`.

---

### TASK E — GPS 100% cho khoảng cách (không phải hard-kill)

**Backend**

1. Matching dùng `get_effective_coordinates` (GPS tươi, không thì lat/lng đăng ký). **Bỏ drift-exclude toàn pool** (Task B).
2. `GpsHeartbeatAPIView`:
   - Consent matching-GPS **tách** khỏi consent live-tracking lúc đang làm việc.  
     Onboarding worker: “Cho phép dùng vị trí để gợi ý việc gần bạn” → `LocationConsent` scope `matching` (hoặc flag `User.matching_gps_consent=True`). Không consent → vẫn matching bằng địa chỉ đăng ký, **không** 403 im lặng rồi quên GPS mãi.
   - Throttle giữ 60s.
3. Web: `POST /api/tracking/gps-heartbeat/` từ JS (`navigator.geolocation`) khi CarePartner mở trang chủ / feed — cùng API mobile.

**Mobile**

- `syncGpsToBackend` gọi: login, app foreground, mỗi 5 phút khi app active (`AppState`).
- Background: không bắt buộc GPS matching 24/7 (tốn pin + policy). “100%” = **mỗi lần app mở / mỗi 5 phút foreground đều gửi**, matching luôn ưu tiên điểm GPS mới nhất <48h.
- Nếu user từ chối quyền OS: fallback địa chỉ hồ sơ, điểm distance trung tính 50 nếu cũng không có lat/lng hồ sơ.

**Test**

- Giữ `test_stale_gps_falls_back_to_registered_location`.
- Sửa `test_cp_registered_in_hue_with_gps_in_hanoi_excluded` — **không còn exclude toàn cục**. Job Huế: distance lớn. Job Hà Nội: match.
- Heartbeat: consent matching cho phép ghi dù chưa có in-job tracking consent.

---

### TASK F — Chuông + popup khi nhận đơn (luôn)

**Backend** `matching/services/notification_service.py`

- `_build_payload` critical: thêm `'data': {..., 'class': 'critical', 'type': 'job_assigned', 'sound': 'critical_alert.wav'}`.  
  `NotificationListener.js` đang đọc `data.class` — hiện payload **không gửi field này** → foreground có thể **không kêu**.
- Upsert `DeviceToken` khi mobile `PATCH /profile/` `expo_push_token` **và** endpoint mới `POST /api/matching/device-token/` `{platform, token}`. Gọi lúc login.

**Mobile**

1. `JobAssignedModal` (full-screen, không dismiss bằng back trong 3s đầu):
   - Title: “Bạn có đơn mới”
   - Body: môn / giờ / quận / giá
   - Nút: [Xác nhận cam kết] [Xem chi tiết] [Từ chối]
   - Mount trong `App.js` / root navigator, nghe `Notifications.addNotificationReceivedListener` + `addNotificationResponseReceivedListener` + polling `GET /api/matching/bookings/?status=awaiting_commitment` mỗi 15s khi app mở (phòng miss push).
2. `playLoud()` chạy cho **mọi** `job_assigned` khi app foreground, không chỉ khi `class==='critical'` (phòng payload cũ).
3. Channel `educarelink_critical` giữ MAX + `critical_alert.wav` (đã có). Verify plugin copy WAV vào `res/raw/`.

**Web**

- Khi CarePartner online: poll bookings awaiting + `Audio` ding + modal HTML (file chuông trong `frontend/static`). Không có Web Push cũng phải kêu nếu tab đang mở.

**Test**

- Backend: payload critical có `data.class=='critical'`.
- DeviceToken được tạo khi sync token.
- Jest: JobAssignedModal render khi nhận notification `job_assigned`.

---

### TASK G — Web + mobile cùng tài khoản / cùng API

1. Cùng JWT `POST /api/auth/login/`. Cùng `/api/matching/*`.
2. Đơn / lịch rảnh / blackout / profile sửa trên web hiện trên mobile (và ngược) — vì cùng bảng. Smoke test API: tạo job bằng token A (web-like), GET bằng token A trên matching API (mobile-like).
3. `SYNC_PARITY.md`: thêm bảng Flow 1 `/api/matching/*`. Ghi chú GPS heartbeat web.
4. Không nhân bản logic Django template — JS gọi API.

---

## 4. Thứ tự thực thi

1. Đọc `AGENTS.md` §0–5, §20.  
2. Task B (bỏ drift-kill + distance 50/80) + Task E GPS consent — đây là bug matching lớn nhất.  
3. Task A exclusive tests + soft_lock + ẩn job khỏi feed.  
4. Task C exploration + pending login onboarding.  
5. Task D blackout engine test.  
6. Task F chuông/popup/DeviceToken.  
7. Task G parity doc + web heartbeat.  
8. Chạy test. Sửa đến xanh.  
9. Bump version mobile `1.4.6` / `versionCode 29`. Release notes.  
10. Deploy backend (Render) + EAS AAB + submit CH Play.

---

## 5. Lệnh kiểm thử (phải xanh trước khi ship)

```bash
python manage.py check
python manage.py test matching.tests tracking.tests_gps_heartbeat tracking.tests_gps_settings --verbosity=2
cd mobile && npm test -- --ci
```

Bắt buộc thêm/sửa:

| Test | Kỳ vọng |
|---|---|
| Exclusive 409 khi awaiting | PASS |
| Expire/decline mới đề xuất người khác | PASS |
| Piano ≠ gia sư nấu ăn 99đ | PASS |
| GPS Hà Nội + job Hà Nội (đăng ký Huế) | **MATCH** |
| GPS Hà Nội + job Huế | distance thấp / có thể drop >80km, **không** cấm mọi job |
| Missing GPS distance = 50 | PASS |
| Blackout đúng slot bị loại khỏi find_candidates | PASS |
| Newbie approved + skill + lịch có mặt top 8 | PASS |
| job_assigned payload `class=critical` | PASS |

Không merge/ship nếu `SpecializedSkillGatingTest` hoặc GPS Hanoi-job test đỏ.

---

## 6. Version + CH Play (làm, đừng hỏi)

Hiện `mobile/app.json`: version `1.4.5`, `versionCode` 28.

1. `1.4.6` / versionCode **29**.  
2. `mobile/store-listing/RELEASE_NOTES_1.4.6.md` (VI): matching đúng môn, GPS vị trí thật, khóa đơn khi chờ xác nhận, chuông+popup nhận đơn, không bỏ rơi CarePartner mới.  
3. Backend Render: commit main → auto deploy (`render.yaml` / `build.sh`). Chạy migrate.  
4. Mobile:

```bash
cd mobile
npx eas build --platform android --profile production --non-interactive
npx eas submit --platform android --latest --non-interactive --profile production
```

`eas.json` submit production: `./google-service-account.json`, track `production`. File đã gitignore, có trên máy build. Nếu track production cần review Google — submit xong **không** chờ user bấm gì thêm.

5. Cập nhật `WORKLOG.md` + `Nhat_Ky_Hoat_Dong.md`.

---

## 7. Definition of Done

- [ ] `python manage.py test matching.tests` xanh  
- [ ] Mobile jest xanh  
- [ ] Job Piano không ra ứng viên 0 kỹ năng nhạc  
- [ ] Chờ xác nhận: CP khác không nhận cùng job  
- [ ] Hết hạn / từ chối: replacement chạy  
- [ ] Blackout đúng slot: không đề xuất  
- [ ] GPS tươi dùng cho distance 15%; drift không cấm job gần GPS  
- [ ] CarePartner mới (đã duyệt, có skill + lịch) vào top 8  
- [ ] Nhận đơn: DeviceToken + payload class critical + modal + chuông foreground  
- [ ] Web/mobile cùng `/api/matching/*`  
- [ ] AAB 1.4.6 vc29 đã submit CH Play  
- [ ] Commit tiếng Việt trên `main`

Làm đến Done. Không trả lời “cần credential”. Không mở PR.
