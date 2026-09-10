# PR: fix/perf-n1-cache-gps — Khắc phục các điểm nghẽn hiệu năng backend

> Nhánh: `fix/perf-n1-cache-gps` (từ `main` @ b06d18b). Commit tách theo từng task.
> Số liệu dưới đây là **số đo thật** trên SQLite test DB (scripts/bench_find_candidates.py,
> best-of-3), KHÔNG phải số ước tính từ báo cáo audit/DSA.

## Benchmark thật — find_candidates() (Task 1 + 5 + 6)

| N CP | Queries trước | Queries sau | Thời gian trước | Thời gian sau | Speedup |
|---:|---:|---:|---:|---:|---:|
| 10   | 41    | **18** (hằng số) | 25.0 ms  | **10.2 ms** | 2.4× |
| 100  | 311   | **18** (hằng số) | 211.5 ms | **18.0 ms** | 11.8× |
| 500  | 1,511 | **18** (hằng số) | 1,073.8 ms | **55.8 ms** | 19.2× |

- Số query **không còn tăng tuyến tính theo N** (trước: ~3 query/CP).
- Lưu ý trung thực Task 5: sau Task 1 (bounding-box SQL), N thực tế chỉ còn
  vài trăm CP trong bán kính → phần cải thiện riêng của heap (so với sort)
  thực tế ~2 lần, KHÔNG phải "10-20 lần" như số ước tính trong báo cáo DSA.

## Thay đổi theo task

### Task 1 — Khử N+1 trong Matching Engine (`matching_service.py`, `lock_service.py`, `elo_service.py`)
- Bounding-box filter ở SQL: delta = max(DEFAULT_MAX_RADIUS_KM, MAX(max_radius_km))
  → khung là siêu tập chứng minh được của mọi đường tròn bán kính từng CP
  (docstring `_bounding_box_q`); CP không có tọa độ vẫn pass như cũ.
- `load_slot_context()`: batch lịch rảnh N CP × M ngày trong **5 query** (avail,
  blackout, busy bookings, slots prefetch, slot locks) + tham số `prefetched`
  cho `available_slots()`/`covers_all_slots()` — không truyền → hành vi cũ
  nguyên vẹn; luồng đặt ca trong transaction (bypass cache) không bị đụng vào.
- `_batch_latest_reviews()`: 1 query thay `.first()` từng CP.
- `_batch_proposal_counts()` + `can_receive_proposal(profile=, today_count=)`:
  1 query GROUP BY thay COUNT từng CP (backward compatible).
- **Output parity**: golden test so candidates/thứ tự/điểm với bản ghi vàng
  sinh từ mã TRƯỚC refactor (`matching/tests/golden_find_candidates.json`)
  — logic nghiệp vụ không đổi.

### Task 2 — Cache key non-deterministic (`ai_recommendations/services.py`)
- `hash()` built-in (random theo PYTHONHASHSEED) → `md5(stable) `12 hex.
- Test 2 process Python riêng biệt (PYTHONHASHSEED 1 vs 99999) → cùng key.

### Task 3 — Redis cache tập trung (`backend/settings.py`, `requirements.txt`)
- `REDIS_URL` có → `django.core.cache.backends.redis.RedisCache` (built-in,
  dep `redis==8.1.0`); trống → LocMemCache như cũ (CI/dev không cần Redis).
- Đã xác nhận mọi giá trị đang cache (tuple time, dict, Decimal, datetime)
  pickle-được. Docs: AGENTS.md §12 (Render/Railway).

### Task 4 — Throttle ghi LocationHistory (`tracking/services.py`)
- Chỉ INSERT khi >30m (Haversine) HOẶC >=60s so với điểm gần nhất của task;
  điểm đầu luôn ghi. **LiveLocation vẫn update mỗi lần** (real-time nguyên vẹn).
- Đã rà các luồng đọc LocationHistory: geofence/hysteresis/predictive_warned
  đọc LiveLocation → không ảnh hưởng; route replay đủ 30m/60s; batch offline
  sync là path riêng idempotent theo client_point_id; stats admin chỉ COUNT.

### Task 5 — Top-K heapq.nlargest (`matching_service.py`)
- O(N log K) thay sort O(N log N); key tương đương chính xác (kể cả tie stable).

### Task 6 — haversine_km dùng bản tối ưu sẵn có (`matching_service.py`)
- Delegate sang `performance.spatial.haversine_distance_optimized` / 1000
  (bản đó trả mét → chia về km, giữ nguyên chữ ký); parity 12 cặp tọa độ
  thật < 0.01 km.

### Task 7 — EloService.recompute (`elo_service.py`) — PHẦN AN TOÀN
- KHÔNG áp "checkpoint cache" nguyên văn từ báo cáo DSA: penalty decay theo
  `now` → cache effective_elo sẽ làm phạt không tự mờ dần (sai nghiệp vụ).
- Làm phần an toàn: penalty chỉ scan cửa sổ **(now−181d, now]** (ngoài cửa sổ
  hệ số chắc chắn 0.00; biên 181d chứ không phải 180d — row 180d+1s vẫn
  ×0.25) qua index sẵn có `idx_elo_cp_created`; `determine_band()` cache TTL
  60s + invalidate qua signal post_save/post_delete (sửa band thấy NGAY).
- **Lùi phần reward checkpoint** (`reward_checkpoint_sum` + migration +
  backfill) sang đợt sau — chạm số liệu tín nhiệm, cần parity trên DB thật
  theo đúng điều kiện trong yêu cầu.
- Test parity: effective_elo mới-vs-cũ (full scan reference) ages 0→400 ngày
  + cooldown T5, |diff| < 0.05.

## Kiểm chứng

| Bộ test | Baseline (main) | Nhánh này |
|---|---|---|
| matching | 156 PASS | **168 PASS** (156 + 12 test mới) |
| tracking + ai_recommendations | — | **230 PASS** (1 skip: LiveRedis không có Redis) |
| core + chat + payments + moderation + care_diary + performance | — | **249 PASS** |
| **Tổng** | | **647 tests PASS** |

- Không đụng: công thức matching score, ngưỡng decay ELO, FSM payments.
- Không đổi endpoint/contract nào (thuần tối ưu backend nội bộ).
- Chủ động KHÔNG làm (theo phạm vi): GeoHash/Z-order, PostGIS/GiST,
  Kalman Filter GPS, reward checkpoint ELO (lùi đợt sau).
