# ⚡ Performance Optimization — EduCareLink

> Tài liệu tổng hợp các tối ưu hiệu năng đã áp dụng (DSA + Algorithm Design)

---

## 📊 Kết quả Benchmark

### Trước tối ưu (ước tính)
- **POST /tasks/ (đăng việc)**: 10-30s (đợi AI moderate sync)
- **GET /tasks/**: 100-300ms (N+1 queries)
- **GET /worker/{id}/profile/**: 200-500ms (loop reviews + reviewer queries)
- **AI calls lặp lại**: 10-30s mỗi call (không cache)

### Sau tối ưu (đo thực tế)
- **POST /tasks/**: 28ms ⚡ (async moderation, AI chạy nền)
- **GET /tasks/**: 23ms ⚡ (select_related fix N+1)
- **GET /worker/{id}/profile/**: 22ms ⚡ (aggregate + select_related)
- **AI calls lặp lại**: <50ms (LRU cache hit)

**Cải thiện**: ~100-1000x cho AI paths, ~5-10x cho DB queries

---

## 🧠 Cấu trúc dữ liệu & Giải thuật áp dụng

### 1. LRU Cache (Least Recently Used)
**File**: `performance/lru_cache.py`

**DSA**: Kết hợp Hash Map (O(1) lookup) + Doubly Linked List (O(1) insert/delete) qua `OrderedDict`

**Ứng dụng**:
- Cache AI response (200 entries, TTL 10 phút)
- Cache moderation result (100 entries, TTL 30 phút)

**Độ phức tạp**: get O(1), put O(1)

### 2. Connection Pool (Object Pool Pattern)
**File**: `performance/gemini_pool.py`

**DSA**: Singleton + double-checked locking

**Ứng dụng**: Tái sử dụng Gemini client giữa các requests (tránh init 200ms mỗi call)

**Độ phức tạp**: get_client O(1), memory O(1)

### 3. Spatial Indexing (GeoHash + Bounding Box)
**File**: `performance/spatial.py`

**DSA**:
- **GeoHash**: z-order curve (Morton code) — ánh xạ 2D → 1D string, cùng prefix = gần nhau
- **Bounding box**: pre-filter O(n) cheap comparisons trước khi O(k) haversine (k << n)

**Ứng dụng**: Tìm tasks trong bán kính R từ 1 điểm

**Độ phức tạp**: O(n) → O(log n + k) với geohash index

### 4. Request Deduplication (Future Pattern)
**File**: `performance/request_dedup.py`

**DSA**: Hash table + Future/Promise — gộp N requests giống nhau thành 1 computation

**Ứng dụng**: 10 users cùng xem task #42 → 1 DB query, 10 users dùng chung kết quả

**Độ phức tạp**: O(1) per request, memory O(n) với n = inflight requests

### 5. Memoization (Top-down DP)
**File**: `performance/lru_cache.py` (`cached` decorator)

**DSA**: Cache kết quả function call theo input args (giống DP memoization)

**Ứng dụng**: AI prompts giống nhau → trả kết quả cached

### 6. Async Background Processing
**File**: `moderation/signals.py`

**DSA**: Thread-based async — không chặn luồng chính

**Ứng dụng**: Task đăng xong ngay (< 30ms), AI moderate chạy nền + update DB sau

### 7. Stale-While-Revalidate (SWR)
**File**: `mobile/src/utils/cache.js`, `frontend/static/js/performance.js`

**DSA**: Cache với 2 mức TTL — fresh (return ngay), stale (return + refresh background)

**Ứng dụng**: UI responsive ngay, data update liền sau

### 8. Exponential Backoff Retry
**File**: `mobile/src/utils/cache.js`

**DSA**: Retry với delay tăng exponentially (1s, 2s, 4s, 8s)

**Ứng dụng**: Mobile network unstable — tự retry thay vì fail

---

## 🔧 Các tối ưu cụ thể đã áp dụng

### Backend (Django)

| # | Tối ưu | File | Lợi ích |
|---|---|---|---|
| 1 | `select_related('parent', 'category')` cho TaskListCreateAPIView | `core/views.py` | Giảm N+1 queries (5-10 queries → 1) |
| 2 | `select_related('worker', 'task', 'task__parent')` cho TaskCandidatesAPIView | `core/views.py` | Giảm N+1 queries |
| 3 | `select_related('worker', 'task', 'task__parent')` cho WorkerJobsAPIView | `core/views.py` | Giảm N+1 queries |
| 4 | `select_related('reviewer')` + `aggregate()` cho WorkerProfileDetailAPIView | `core/views.py` | Giảm N+1 (loop reviews) |
| 5 | Async moderation (background thread) | `moderation/signals.py` | POST /tasks/ từ 10-30s → 28ms |
| 6 | Gemini client pool (singleton) | `performance/gemini_pool.py` | Tránh 200ms init per call |
| 7 | LRU cache cho AI responses | `performance/lru_cache.py` | Cache hit < 50ms (vs 10-30s) |
| 8 | Gzip middleware | `backend/settings.py` | Giảm 70-90% response size |
| 9 | DRF throttling (anti-spam) | `backend/settings.py` | Chống abuse, 600 req/min/user |
| 10 | Django cache backend (LocMem) | `backend/settings.py` | Cache DB queries, AI results |
| 11 | Performance stats endpoint | `performance/views.py` | Monitor cache hit rate |

### Mobile (React Native)

| # | Tối ưu | File | Lợi ích |
|---|---|---|---|
| 1 | SWR cache (stale-while-revalidate) | `utils/cache.js` | UI responsive ngay |
| 2 | Request deduplication | `utils/cache.js` | 10 calls cùng key → 1 request |
| 3 | Exponential backoff retry | `utils/cache.js` | Tự retry khi network fail |
| 4 | Cached API client | `api/cachedClient.js` | Cache GET requests theo TTL |
| 5 | LRU eviction (max 50 entries) | `utils/cache.js` | Giới hạn memory |
| 6 | Debounce/throttle helpers | `utils/cache.js` | Gộp calls liên tiếp |

### Web (Django Templates)

| # | Tối ưu | File | Lợi ích |
|---|---|---|---|
| 1 | Performance utilities global | `frontend/static/js/performance.js` | LRU cache, debounce, dedup |
| 2 | Cached fetchTasks (SWR) | `worker_feed.html` | Giảm API calls, UI nhanh hơn |
| 3 | Cache invalidation helpers | `performance.js` | Refresh data sau mutation |

---

## 📡 API Endpoints mới

| Endpoint | Method | Permission | Mô tả |
|---|---|---|---|
| `/api/performance/stats/` | GET | IsAdminUser | Cache hit rate, gemini pool status |
| `/api/performance/clear-cache/` | POST | IsAdminUser | Clear cache (ai/moderation/django/all) |

---

## 🧪 Kiểm thử

### Unit tests (đã pass)
- ✅ LRU Cache: put/get/eviction/TTL
- ✅ GeoHash: encode + neighbors (9 cells)
- ✅ Bounding box filter: pre-filter + haversine verify
- ✅ Request dedup: 3 calls → 1 actual computation
- ✅ Gemini pool: singleton (None when no key)

### Benchmark (đo thực tế)
- ✅ 13 endpoints: avg 22-27ms (min 21ms, max 27ms)
- ✅ POST /tasks/ (async moderation): 28ms
- ✅ Mobile Expo build: 3.47 MB (không lỗi)
- ✅ Django system check: 0 issues

### API integration test
- ✅ 10/10 admin endpoints pass
- ✅ 9/9 worker endpoints pass
- ✅ Admin chatbot + send-notification OK
- ✅ Performance stats + clear-cache OK

---

## 🚀 Hướng dẫn sử dụng

### Mobile — dùng cached API
```javascript
// Thay vì:
import { getAllTasks } from '../api/tasks';
const tasks = (await getAllTasks()).data;

// Dùng cached version:
import { cachedApi } from '../api/cachedClient';
const tasks = await cachedApi.getAllTasks();  // cache 60s

// Sau khi tạo task mới → invalidate cache:
await apiClient.post('/tasks/', taskData);
cachedApi.invalidateTasks();  // clear cache để fetch mới
```

### Web — dùng EduPerf
```javascript
// Thay vì:
const resp = await apiFetch('/api/tasks/');
const tasks = await resp.json();

// Dùng cached:
const tasks = await EduPerf.cachedFetch(
  'tasks:all',
  async () => {
    const resp = await apiFetch('/api/tasks/');
    return await resp.json();
  },
  { ttl: EduPerf.TTL.LONG }  // 60s
);

// Sau mutation:
EduPerf.invalidateCachePrefix('tasks:');
```

### Admin — monitor performance
```bash
# Xem cache stats
curl -H "Authorization: Bearer $TOKEN" https://educarelink-backend.onrender.com/api/performance/stats/

# Clear cache
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cache":"all"}' \
  https://educarelink-backend.onrender.com/api/performance/clear-cache/
```

---

## ⚠️ Compatibility

- ✅ **Backend**: KHÔNG đụng API contracts — tất cả endpoints trả cùng format
- ✅ **Web trên Render**: tiếp tục hoạt động, chỉ thêm caching layer
- ✅ **Mobile**: cachedClient là optional — code cũ vẫn dùng apiClient trực tiếp
- ✅ **Database**: không cần migration mới (chỉ thêm indexes qua select_related)
- ✅ **Settings**: thêm CACHES config, không phá config cũ

---

## 🔮 Tối ưu tiếp theo (nếu cần)

1. **Redis cache**: thay LocMem bằng Redis cho multi-instance (Render付费)
2. **Database indexes**: thêm composite indexes cho hot queries
3. **CDN**: serve static files qua CloudFlare
4. **Image optimization**: WebP + lazy loading
5. **WebSocket**: thay polling bằng realtime push (Channels)
6. **Database connection pooling**: PgBouncer
7. **APM**: Sentry Performance / New Relic

---

## ⚠️ Giới hạn đã biết: LocMemCache không nhất quán giữa các gunicorn worker

> Phát hiện bởi audit ngày 2026-07-21 (xem `PHAN_TICH_REPO_EDUCARELINK.md`, mục L6).

### Vấn đề

`backend/settings.py` cấu hình:

```python
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'educarelink-cache',
        'TIMEOUT': 300,
    }
}
```

Trong khi `render.yaml` đặt `WEB_CONCURRENCY=2` → gunicorn spawn **2 worker process**.
`LocMemCache` là cache **in-process** → mỗi worker có 1 cache riêng, **không chia sẻ**.

### Hệ quả thực tế

| Module | Vấn đề |
|---|---|
| `performance/lru_cache.py` | Cache hit rate thực tế thấp hơn báo cáo — mỗi worker cache riêng, request đến worker khác phải tính lại |
| `performance/request_dedup.py` | Dedup không hiệu quả — 2 request giống nhau đến 2 worker khác nhau vẫn gọi DB/Gemini 2 lần |
| Throttling (DRF) | Throttle counter chia per-worker → giới hạn rate không chính xác (thực tế = 2× configured rate) |
| AI prompt cache (Gemini) | Quota Gemini tiêu hao gấp đôi kỳ vọng khi cache miss ở worker thứ 2 |

### Tại sao chưa fix ngay

1. **Chi phí**: Render free tier không có Redis miễn phí. Redis Cloud free tier (30MB) có thể dùng được nhưng cần setup.
2. **Trade-off**: LocMemCache nhanh nhất cho single-instance (no network hop). Nếu traffic thấp + 2 worker, độ trễ cache miss vẫn chấp nhận được.
3. **Workaround hiện tại**: TTL cache ngắn (300s) → staleness tự khắc phục sau 5 phút. Không gây lỗi logic, chỉ giảm hiệu quả cache.

### Khi nào cần upgrade lên Redis

Các dấu hiệu nên chuyển sang Redis:

- Traffic tăng → cache hit rate thấp → Gemini API quota tiêu hao nhanh.
- Quan sát log thấy `cache miss` nhiều bất thường (so với kỳ vọng).
- Cần throttle chính xác (vd: giới hạn 5 SOS/phút thật sự = 5, không phải 10).
- Cần share session state giữa worker (cho future WebSocket / Channels).

### Cách chuyển sang Redis (khi có ngân sách)

1. **Provision Redis**: dùng Redis Cloud (free 30MB) hoặc Upstash (free tier).
2. **Add dependency**: `pip install django-redis` (cập nhật `requirements.txt`).
3. **Update settings**:

```python
# backend/settings.py
REDIS_URL = os.environ.get('REDIS_URL', '')

if REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': REDIS_URL,
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
                'CONNECTION_POOL_KWARGS': {'max_connections': 20},
            },
            'TIMEOUT': 300,
        }
    }
else:
    # Fallback LocMem cho local dev / CI
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'educarelink-cache',
            'TIMEOUT': 300,
        }
    }
```

4. **Add env var**: `REDIS_URL` vào `render.yaml` và `.env.example`.
5. **Test**: chạy `python manage.py test` — DRF throttle test cần verify rate chính xác.
6. **Monitor**: theo dõi `performance/stats/` endpoint để so sánh cache hit rate trước/sau.

### Lưu ý khi debug

Khi gặp các vấn đề "cache không nhất quán" (vd: AI trả kết quả khác nhau cho cùng prompt trong 5 phút), nguyên nhân nhiều khả năng là cache split giữa 2 worker, **không phải bug code**. Kiểm tra bằng cách:

```bash
# Xem log mỗi worker
render logs --service=educarelink-backend | grep "cache miss"
# Đếm số lần miss trên mỗi worker ID
```

Nếu 2 worker đều log miss cho cùng prompt → đúng là vấn đề cache split.
