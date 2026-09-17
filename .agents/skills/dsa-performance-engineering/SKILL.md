---
name: dsa-performance-engineering
description: >-
  Comprehensive DSA (Data Structures & Algorithms) decision framework for AI agents.
  Forces optimal algorithm and data structure selection before implementing any logic
  that processes, searches, sorts, caches, or transforms data. Covers 20+ data structures,
  15+ algorithm patterns, database query optimization, caching strategies, concurrency
  patterns, and Python/Django-specific optimizations. Use when designing any feature,
  module, API endpoint, or background job that handles data at any scale.
---

# Agent Skill: DSA Performance Engineering

## §1. Core Directive

You are a **performance-conscious engineer**, not a feature-shipping machine. Before writing ANY code that processes data, you MUST run through the **5-Step Decision Framework** (§2). This is non-negotiable.

**When this skill activates:**
- Designing a new API endpoint that queries or aggregates data
- Building search, filter, sort, or recommendation logic
- Creating background jobs, schedulers, or batch processors
- Implementing caching layers or memoization
- Writing any loop that iterates over collections
- Designing database schemas or writing complex queries
- Building real-time features (live tracking, notifications, chat)
- Processing user uploads (images, documents, CSVs)

**The golden rule:** If your first instinct is a nested `for` loop or a full table scan, STOP. There is almost certainly a better approach. Find it.

---

## §2. The 5-Step Decision Framework

Before implementing any data-processing logic, walk through these 5 steps **silently** (do not output them to the user unless asked). Document your choice as a brief inline comment in the code.

### Step 1: Classify the Problem

Identify which category your problem falls into:

| Category | Signal Phrases | Example |
|----------|---------------|---------|
| **Search** | "find", "lookup", "get by", "filter", "exists" | Find a task by ID, check if user applied |
| **Sort / Rank** | "order by", "top N", "rank", "sort", "leaderboard" | Rank applicants by rating, sort tasks by distance |
| **Aggregate** | "count", "sum", "average", "group by", "statistics" | Monthly revenue stats, average rating per worker |
| **Graph / Relationship** | "connected", "path", "network", "related", "recommend" | Find related tasks, social graph, shortest route |
| **Optimization** | "best", "minimize", "maximize", "schedule", "allocate" | Optimal task assignment, minimize travel distance |
| **String / Text** | "match", "parse", "validate", "search text", "autocomplete" | Search tasks by keyword, validate phone format |
| **Streaming / Real-time** | "live", "continuous", "watch", "subscribe", "feed" | Live location tracking, notification feed |
| **Batch / Bulk** | "import", "export", "migrate", "process all", "monthly" | Monthly commission settlement, bulk notification |

### Step 2: Identify Constraints

Answer these questions before choosing an approach:

```
┌─────────────────────────────────────────────────────────┐
│ CONSTRAINT CHECKLIST                                     │
├─────────────────────────────────────────────────────────┤
│ □ Data size N = ? (10? 1,000? 100,000? 1,000,000?)      │
│ □ Growth rate? (fixed? linear? exponential?)             │
│ □ Latency budget? (< 50ms API? < 5s background job?)    │
│ □ Memory budget? (256MB server? 64MB mobile?)            │
│ □ Read:Write ratio? (100:1? 1:1? 1:100?)                │
│ □ Frequency? (once? per request? per second?)            │
│ □ Concurrent users? (1? 100? 10,000?)                   │
│ □ Data mutability? (immutable? append-only? frequent?)   │
│ □ Ordering required? (sorted? insertion order? none?)    │
│ □ Uniqueness required? (unique keys? duplicates ok?)     │
└─────────────────────────────────────────────────────────┘
```

### Step 3: Select Optimal DSA

Cross-reference your problem category (Step 1) with constraints (Step 2) using the tables in §3 and §4. Pick the data structure and algorithm that best fits.

**Selection priority:**
1. **Database-level solution first** — Can the DB handle this with an index, query, or aggregation? If yes, don't process in Python.
2. **Built-in language primitives** — `dict`, `set`, `sorted()`, `heapq`, `collections.Counter` before custom implementations.
3. **Battle-tested library** — Django ORM features, `itertools`, `functools.lru_cache` before rolling your own.
4. **Custom implementation** — Only when none of the above fit.

### Step 4: Analyze Complexity

State the Big-O for both **time** and **space**:

```
Time:  O(?)  — worst case
Space: O(?)  — auxiliary space (excluding input)
```

**Acceptable thresholds for web APIs (per request):**

| Data Size N | Max Acceptable Time Complexity | Rationale |
|-------------|-------------------------------|-----------|
| N ≤ 100 | O(N²) acceptable | Small enough, readability wins |
| N ≤ 10,000 | O(N log N) maximum | O(N²) = 100M ops, too slow |
| N ≤ 100,000 | O(N log N) maximum | Must be efficient |
| N ≤ 1,000,000 | O(N) or O(log N) only | Linear or better required |
| N > 1,000,000 | O(log N) or O(1) only | Must use indexing/hashing |

### Step 5: Justify (Code Comment)

Add a **one-line comment** at the decision point explaining your DSA choice:

```python
# DSA: dict lookup O(1) — avoid linear scan on N≈10K applications
accepted_worker_ids = {app.worker_id for app in applications}

# DSA: heap for top-K O(N log K) — faster than full sort O(N log N) for K<<N
top_workers = heapq.nlargest(5, workers, key=lambda w: w.rating)

# DSA: DB-level aggregation — avoid Python loop over N≈50K payments
monthly_stats = Payment.objects.filter(...).aggregate(total=Sum('amount'))
```

---

## §3. Data Structure Quick-Reference Table

### 3.1 Core Structures

| Structure | Access | Search | Insert | Delete | Space | Best For | Avoid When |
|-----------|--------|--------|--------|--------|-------|----------|------------|
| **Array / List** | O(1) | O(N) | O(N)* | O(N) | O(N) | Indexed access, iteration | Frequent insert/delete at front |
| **Dynamic Array** (`list`) | O(1) | O(N) | O(1)† | O(N) | O(N) | Append-heavy workloads | Frequent insert at arbitrary index |
| **Linked List** (`deque`) | O(N) | O(N) | O(1)‡ | O(1)‡ | O(N) | Queue/stack operations | Random access needed |
| **Hash Table** (`dict`) | — | O(1)§ | O(1)§ | O(1)§ | O(N) | Key-value lookup, counting, dedup | Ordered iteration required |
| **Hash Set** (`set`) | — | O(1)§ | O(1)§ | O(1)§ | O(N) | Membership test, dedup, intersect | Need ordered or indexed access |
| **Sorted Array** | O(1) | O(log N) | O(N) | O(N) | O(N) | Binary search on static data | Frequent mutations |
| **Stack** (`list`) | O(1) | O(N) | O(1) | O(1) | O(N) | LIFO: undo, parsing, DFS | FIFO access needed |
| **Queue** (`deque`) | O(1) | O(N) | O(1) | O(1) | O(N) | FIFO: BFS, task scheduling | Random access needed |

*\* amortized O(1) for append; † amortized; ‡ at ends; § average case, O(N) worst*

### 3.2 Advanced Structures

| Structure | Key Operations | Best For | Python Built-in |
|-----------|---------------|----------|-----------------|
| **Min/Max Heap** | push O(log N), pop O(log N), peek O(1) | Top-K, priority queue, scheduling | `heapq` (min-heap) |
| **Binary Search Tree** | search/insert/delete O(log N) avg | Ordered data with frequent mutations | `sortedcontainers.SortedList` |
| **Trie (Prefix Tree)** | insert/search O(L) where L=key length | Autocomplete, prefix matching, dictionary | Custom |
| **Graph (Adjacency List)** | add edge O(1), traverse O(V+E) | Relationships, networks, recommendations | `dict[node, list[node]]` |
| **Graph (Adjacency Matrix)** | add edge O(1), check edge O(1) | Dense graphs, quick edge lookup | `list[list[bool]]` |
| **Counter** | count O(N), top-K O(N log K) | Frequency counting, histogram, mode | `collections.Counter` |
| **OrderedDict** | all dict ops O(1), ordering maintained | LRU cache, insertion-order iteration | `collections.OrderedDict` |
| **DefaultDict** | all dict ops O(1), auto-init missing keys | Grouping, counting, adjacency lists | `collections.defaultdict` |
| **NamedTuple** | access O(1), immutable | Lightweight data objects, query results | `collections.namedtuple` |
| **Deque** | append/pop both ends O(1) | Sliding window, BFS queue, buffer | `collections.deque` |
| **Bisect Array** | insert O(N), search O(log N) | Maintaining sorted order on insertions | `bisect` module |
| **Disjoint Set (Union-Find)** | find/union nearly O(1)** | Connected components, grouping | Custom |
| **Bloom Filter** | add O(K), check O(K), K=hash funcs | Probabilistic membership (large sets) | `pybloom_live` |
| **LRU Cache** | get/put O(1) | Memoization, hot-path caching | `functools.lru_cache` |
| **Interval Tree** | query O(log N + K) | Time range overlaps, scheduling conflicts | Custom / `intervaltree` |

*\*\* with path compression + union by rank*

### 3.3 Decision Tree: "Which Structure Do I Use?"

```
Need key→value mapping?
├─ YES → Need ordering by key?
│         ├─ YES → SortedDict / BST
│         └─ NO  → dict (hash table)
└─ NO  → Need unique elements only?
          ├─ YES → set
          └─ NO  → Need ordering?
                    ├─ YES → Need fast insert at both ends?
                    │         ├─ YES → deque
                    │         └─ NO  → list (sorted if search-heavy)
                    └─ NO  → Need priority access (min/max)?
                              ├─ YES → heapq
                              └─ NO  → Need FIFO?
                                        ├─ YES → deque (as queue)
                                        └─ NO  → list (as stack)
```

---

## §4. Algorithm Pattern Recognition

When you encounter a problem, scan for these **signal phrases** to identify the right pattern. Patterns are ordered by frequency of use in web applications.

### Pattern 1: Hash Map / Lookup Table
- **Signal:** "check if exists", "find duplicate", "group by", "count occurrences", "two sum"
- **Approach:** Convert list to `dict` or `set` for O(1) lookup instead of O(N) linear scan
- **Complexity:** O(N) time, O(N) space
- **Example:**
  ```python
  # BAD: O(N²) — checking membership in list
  for task in tasks:
      if task.worker_id in [app.worker_id for app in applications]:  # O(N) each time
          ...

  # GOOD: O(N) — pre-build set
  applied_ids = {app.worker_id for app in applications}  # O(N) once
  for task in tasks:
      if task.worker_id in applied_ids:  # O(1) each time
          ...
  ```

### Pattern 2: Sorting + Binary Search
- **Signal:** "find in sorted", "closest to", "range query", "lower/upper bound"
- **Approach:** Sort once O(N log N), then binary search O(log N) per query
- **Complexity:** O(N log N) preprocessing + O(log N) per query
- **Example:**
  ```python
  import bisect

  # Find tasks with price closest to budget
  sorted_prices = sorted(tasks, key=lambda t: t.price)
  prices = [t.price for t in sorted_prices]
  idx = bisect.bisect_left(prices, budget)
  closest = sorted_prices[max(0, idx-1):idx+2]  # ±1 neighbors
  ```

### Pattern 3: Two Pointers
- **Signal:** "pair that sums to", "palindrome", "merge sorted", "remove duplicates from sorted"
- **Approach:** Two indices moving toward each other or in same direction
- **Complexity:** O(N) time, O(1) space
- **Use in web:** Merging two sorted querysets, deduplication of sorted results

### Pattern 4: Sliding Window
- **Signal:** "consecutive", "subarray of size K", "maximum in window", "running average", "rate limit window"
- **Approach:** Maintain a window [left, right] that slides across data
- **Complexity:** O(N) time, O(K) space
- **Example:**
  ```python
  from collections import deque

  # Rate limiter: max 10 requests per 60s window per user
  # DSA: sliding window with deque — O(1) per check
  def is_rate_limited(user_id, timestamps_by_user, max_requests=10, window_sec=60):
      now = time.time()
      window = timestamps_by_user.setdefault(user_id, deque())
      while window and window[0] < now - window_sec:
          window.popleft()  # O(1)
      if len(window) >= max_requests:
          return True
      window.append(now)  # O(1)
      return False
  ```

### Pattern 5: Top-K / Heap
- **Signal:** "top N", "K largest/smallest", "most frequent", "priority", "schedule next"
- **Approach:** Use min/max heap instead of full sort
- **Complexity:** O(N log K) vs O(N log N) for full sort — significant when K << N
- **Example:**
  ```python
  import heapq

  # Top 5 highest-rated workers — DON'T sort all 10K workers
  # DSA: heap top-K O(N log K) where K=5, N=10K → ~65K ops vs ~130K for full sort
  top_5 = heapq.nlargest(5, workers, key=lambda w: w.avg_rating)
  ```

### Pattern 6: BFS / DFS (Graph Traversal)
- **Signal:** "shortest path", "connected", "reachable", "level-by-level", "dependency order"
- **Approach:** BFS for shortest path / level-order; DFS for exhaustive search / topological sort
- **Complexity:** O(V + E) where V=vertices, E=edges
- **Use in web:** Notification chains, permission inheritance trees, category hierarchies

### Pattern 7: Dynamic Programming / Memoization
- **Signal:** "optimal", "minimum cost", "number of ways", "overlapping subproblems", "fibonacci-like"
- **Approach:** Cache subproblem results to avoid recomputation
- **Complexity:** Typically reduces exponential to polynomial
- **Example:**
  ```python
  from functools import lru_cache

  # DSA: memoized recursion — avoid recomputing matching scores
  @lru_cache(maxsize=256)
  def compute_match_score(worker_id, task_category_id):
      # expensive AI/DB computation
      ...
  ```

### Pattern 8: Greedy
- **Signal:** "assign tasks", "schedule without overlap", "minimize idle time", "maximum coverage"
- **Approach:** Make locally optimal choice at each step
- **Complexity:** Usually O(N log N) due to initial sort
- **Use in web:** Task scheduling, worker assignment, slot allocation

### Pattern 9: Prefix Sum / Cumulative
- **Signal:** "sum of range", "running total", "cumulative count", "subarray sum"
- **Approach:** Precompute prefix sums for O(1) range queries
- **Complexity:** O(N) preprocessing + O(1) per query
- **Example:**
  ```python
  # Monthly revenue by day — need sum for any date range
  # DSA: prefix sum — O(1) range query vs O(N) loop each time
  daily_revenue = [day.total for day in days]  # N days
  prefix = list(itertools.accumulate(daily_revenue, initial=0))
  # Sum from day i to day j (inclusive): prefix[j+1] - prefix[i]
  ```

### Pattern 10: Union-Find (Disjoint Set)
- **Signal:** "group", "cluster", "connected components", "same set", "merge groups"
- **Approach:** Efficiently merge and query groups
- **Complexity:** Nearly O(1) per operation with path compression
- **Use in web:** Fraud detection (group linked accounts), community detection

### Pattern 11: Interval Scheduling
- **Signal:** "overlapping time slots", "booking conflict", "available windows", "schedule collision"
- **Approach:** Sort by end time, greedy select non-overlapping; or use interval tree for queries
- **Complexity:** O(N log N) sort + O(N) scan
- **Example:**
  ```python
  # Check if new task overlaps with worker's existing schedule
  # DSA: sort by start time + linear scan — O(N log N)
  existing = sorted(worker_tasks, key=lambda t: t.scheduled_time)
  for task in existing:
      if new_start < task.end_time and new_end > task.scheduled_time:
          raise ValidationError("Lịch bị trùng")
  ```

### Pattern 12: Batch Processing
- **Signal:** "bulk insert", "process all", "monthly report", "migration", "import CSV"
- **Approach:** Chunk data into batches, process sequentially, avoid loading all into memory
- **Complexity:** O(N) total, O(B) memory where B=batch size
- **Example:**
  ```python
  # DSA: chunked batch — O(B) memory instead of O(N)
  BATCH_SIZE = 500
  for i in range(0, total_count, BATCH_SIZE):
      batch = queryset[i:i + BATCH_SIZE]
      Model.objects.bulk_create(batch)
  ```

### Pattern 13: Haversine / Spatial Indexing
- **Signal:** "distance", "nearby", "within radius", "geofence", "closest location"
- **Approach:** Haversine formula for distance; spatial index (R-tree/KD-tree) for range queries
- **Complexity:** Point-to-point O(1); range query O(log N + K) with spatial index vs O(N) brute force
- **Use in web:** EduCareLink's geofence checking, nearby task search, worker proximity ranking

### Pattern 14: String Matching / Trie
- **Signal:** "autocomplete", "prefix search", "fuzzy match", "contains keyword"
- **Approach:** Trie for prefix; suffix array/Aho-Corasick for multi-pattern; DB full-text for fuzzy
- **Complexity:** Trie: O(L) per query where L=word length
- **Practical:** For web apps, prefer **database full-text search** (PostgreSQL `SearchVector`) over custom string algorithms

### Pattern 15: Event-Driven / Observer
- **Signal:** "when X happens, do Y", "notify on change", "trigger", "webhook", "signal"
- **Approach:** Pub/sub pattern with Django signals, message queues, or WebSocket
- **Complexity:** O(S) where S=number of subscribers per event
- **Use in web:** Django `post_save` signals (already used in EduCareLink for payments, tracking, moderation)

---

## §5. Database & Query Optimization Rules

### 5.1 The Index Mandate

**Rule: Every `WHERE`, `ORDER BY`, and `JOIN` column MUST have an index evaluation.**

```
┌──────────────────────────────────────────────────────────────┐
│ INDEX DECISION MATRIX                                         │
├──────────────────────────────────────────────────────────────┤
│ Column used in WHERE with =          → B-tree index (default)│
│ Column used in WHERE with range (<>) → B-tree index          │
│ Column used in ORDER BY              → B-tree index          │
│ Column used in text LIKE 'prefix%'   → B-tree index          │
│ Column used in text LIKE '%middle%'  → GIN/trigram index     │
│ Column used in full-text search      → GIN index + SearchVector │
│ Column with low cardinality (bool)   → Partial index only    │
│ Column rarely queried                → NO index (wasted I/O) │
│ Composite filter (col_a + col_b)     → Composite index       │
│ JSON field queried by key            → GIN index on JSONField│
└──────────────────────────────────────────────────────────────┘
```

### 5.2 N+1 Query Detection & Prevention

**The #1 performance killer in Django.** If you see this pattern, it's an N+1:

```python
# BAD: N+1 — 1 query for tasks + N queries for parent (one per task)
tasks = Task.objects.filter(status='open')
for task in tasks:
    print(task.parent.first_name)  # ← triggers separate query each iteration

# GOOD: select_related for ForeignKey/OneToOne (SQL JOIN)
tasks = Task.objects.filter(status='open').select_related('parent', 'category')

# GOOD: prefetch_related for reverse FK / ManyToMany (2 queries total)
parent = User.objects.prefetch_related('posted_tasks').get(id=parent_id)
```

**Rule: Every queryset that accesses related objects in a loop MUST use `select_related` or `prefetch_related`.** No exceptions.

### 5.3 Query Patterns

| Pattern | BAD | GOOD |
|---------|-----|------|
| **Count** | `len(queryset)` — loads all objects | `queryset.count()` — SQL COUNT |
| **Existence** | `queryset.count() > 0` | `queryset.exists()` — LIMIT 1 |
| **Aggregation** | Python loop to sum/avg | `.aggregate(Sum('price'))` — SQL level |
| **Distinct** | Python `set()` on results | `.distinct()` — SQL DISTINCT |
| **Slice** | `list(queryset)[0:10]` — loads ALL then slices | `queryset[:10]` — SQL LIMIT |
| **Bulk create** | Loop with `.save()` | `.bulk_create(objects, batch_size=500)` |
| **Bulk update** | Loop with `.save()` | `.bulk_update(objects, ['field'], batch_size=500)` |
| **Bulk delete** | Loop with `.delete()` | `queryset.delete()` — single SQL DELETE |
| **Values only** | Full model instances when you need 2 fields | `.values('id', 'name')` or `.values_list()` |
| **Subquery** | 2 separate queries + Python join | `Subquery` + `OuterRef` — single SQL |

### 5.4 Pagination Strategy

| Data Size | Strategy | Implementation |
|-----------|----------|----------------|
| N ≤ 1,000 | Offset pagination OK | `LIMIT X OFFSET Y` / DRF `PageNumberPagination` |
| N ≤ 100,000 | Cursor-based preferred | DRF `CursorPagination` on indexed `created_at` |
| N > 100,000 | Cursor-based required | **Never** use offset — O(N) per page on large offsets |

### 5.5 Denormalization Decisions

**Denormalize when:**
- A computed value is read 100x more than written (e.g., `avg_rating` on User)
- An aggregation requires JOINing 3+ tables on every read
- Real-time consistency is not critical (eventual consistency OK)

**Keep normalized when:**
- Write frequency is high
- Data integrity is critical (financial records)
- Storage is a concern

```python
# Example: avg_rating on User — denormalized field
# Updated via signal when new Review is created
# DSA justification: O(1) read vs O(N) aggregation on every profile view
class User(AbstractUser):
    avg_rating = models.DecimalField(default=0)  # denormalized cache
```

---

## §6. Caching Strategy Matrix

### 6.1 Cache Decision Framework

```
Is data read ≥ 10x more than written?
├─ NO  → Don't cache. Fresh queries are fine.
└─ YES → Is data user-specific?
          ├─ YES → Per-user cache key: f"user:{user_id}:{data_type}"
          │         TTL: 5-15 minutes
          └─ NO  → Shared/global cache key: f"global:{data_type}"
                    TTL: 15-60 minutes
                    Is data expensive to compute (> 100ms)?
                    ├─ YES → Cache aggressively, TTL 30-60 min
                    └─ NO  → Cache lightly, TTL 5-15 min
```

### 6.2 Cache Patterns

| Pattern | How It Works | Best For |
|---------|-------------|----------|
| **Cache-Aside (Lazy)** | Check cache → miss → query DB → store in cache | General purpose, most common |
| **Write-Through** | Write to cache AND DB simultaneously | Data that's read immediately after write |
| **Write-Behind** | Write to cache, async flush to DB | High write throughput, eventual consistency OK |
| **Read-Through** | Cache layer auto-fetches from DB on miss | Transparent to application code |

### 6.3 Cache Invalidation Rules

```python
# Pattern: Cache-aside with signal-based invalidation
# DSA: O(1) cache lookup, O(1) invalidation via signal

from django.core.cache import cache

def get_worker_stats(worker_id):
    cache_key = f"worker_stats:{worker_id}"
    stats = cache.get(cache_key)
    if stats is None:
        stats = compute_worker_stats(worker_id)  # expensive
        cache.set(cache_key, stats, timeout=900)  # 15 min TTL
    return stats

# Invalidate on review creation (signal)
@receiver(post_save, sender=Review)
def invalidate_worker_stats_cache(sender, instance, **kwargs):
    cache.delete(f"worker_stats:{instance.reviewee_id}")
```

### 6.4 Memoization (In-Process Cache)

```python
from functools import lru_cache

# GOOD: Pure function with limited input domain
# DSA: O(1) lookup after first call, maxsize prevents memory leak
@lru_cache(maxsize=128)
def get_service_category_names():
    return list(ServiceCategory.objects.values_list('name', flat=True))

# BAD: Don't memoize functions with mutable args or DB-dependent results
# that change frequently without cache invalidation
```

### 6.5 What NOT to Cache

- **User authentication state** — security risk if stale
- **Financial data** (payment amounts, balances) — consistency critical
- **Rapidly changing data** (live locations, real-time counts) — cache miss rate too high
- **Large blobs** (images, files) — use CDN instead
- **Data with complex invalidation** — if you can't determine when to invalidate, don't cache

---

## §7. Concurrency & Scheduling Patterns

### 7.1 Rate Limiting

```python
# DSA: Token Bucket algorithm — O(1) per check
# Better than sliding window for bursty traffic
class TokenBucket:
    def __init__(self, rate, capacity):
        self.rate = rate          # tokens per second
        self.capacity = capacity  # max burst
        self.tokens = capacity
        self.last_refill = time.time()

    def allow(self):
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last_refill = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
```

### 7.2 Job Queue Pattern

```
When to use background jobs vs synchronous processing:

Synchronous (in request):
  • Response time < 200ms
  • Result needed immediately by client
  • Failure must be reported to user

Background job (async):
  • Processing time > 200ms
  • Result not needed in response (e.g., email, push notification)
  • Can retry on failure
  • Batch operations
  • External API calls (MoMo, Gemini)
```

### 7.3 Batch Processing Strategy

| Data Volume | Strategy | Chunking |
|-------------|----------|----------|
| N ≤ 1,000 | Process in single request | Not needed |
| 1K < N ≤ 100K | Chunked in background job | 500-1000 per chunk |
| N > 100K | Streaming + chunked + progress tracking | 1000-5000 per chunk |

```python
# DSA: Iterator-based streaming — O(B) memory instead of O(N)
def process_large_dataset(queryset):
    BATCH = 1000
    total = queryset.count()
    for offset in range(0, total, BATCH):
        batch = queryset[offset:offset + BATCH]
        process_batch(batch)
        # Optional: yield progress for tracking
```

### 7.4 Debounce & Throttle

| Technique | Behavior | Use Case |
|-----------|----------|----------|
| **Debounce** | Wait until no input for X ms, then execute once | Search autocomplete, form validation |
| **Throttle** | Execute at most once per X ms | Scroll events, live location updates |
| **Coalesce** | Collect events, process as batch periodically | Notification aggregation, analytics |

---

## §8. Banned Anti-Patterns (Hard Failures)

If your generated code contains ANY of the following patterns, the implementation **instantly fails**. Fix before submitting.

### 8.1 Algorithmic Anti-Patterns

```python
# ❌ BANNED: Nested loop on large collections — O(N²)
for task in all_tasks:              # N tasks
    for worker in all_workers:      # M workers
        if matches(task, worker):   # N×M iterations
            ...
# ✅ FIX: Build index first
worker_index = {w.id: w for w in all_workers}  # O(M)
for task in all_tasks:                          # O(N)
    worker = worker_index.get(task.worker_id)   # O(1)

# ❌ BANNED: String concatenation in loop — O(N²) due to immutable strings
result = ""
for item in large_list:
    result += str(item) + ", "
# ✅ FIX: Use join — O(N)
result = ", ".join(str(item) for item in large_list)

# ❌ BANNED: Repeated list search — O(N) per search
if item in large_list:      # list.__contains__ is O(N)
    ...
# ✅ FIX: Convert to set — O(1) per search
large_set = set(large_list)
if item in large_set:       # set.__contains__ is O(1)
    ...

# ❌ BANNED: Sorting to find min/max — O(N log N) for O(N) problem
smallest = sorted(items)[0]
largest = sorted(items)[-1]
# ✅ FIX: Use min/max — O(N)
smallest = min(items)
largest = max(items)

# ❌ BANNED: Re-sorting already sorted data
data = queryset.order_by('created_at')  # DB sorts
sorted_data = sorted(data, key=lambda x: x.created_at)  # Python re-sorts — WASTE
# ✅ FIX: Trust the DB ordering
data = list(queryset.order_by('created_at'))

# ❌ BANNED: Loading all records to count
count = len(MyModel.objects.all())
# ✅ FIX: SQL COUNT
count = MyModel.objects.count()

# ❌ BANNED: Full table load to check existence
exists = len(MyModel.objects.filter(field=value)) > 0
# ✅ FIX: EXISTS query (stops at first match)
exists = MyModel.objects.filter(field=value).exists()
```

### 8.2 Django/ORM Anti-Patterns

```python
# ❌ BANNED: N+1 queries in serializer
class TaskSerializer(serializers.ModelSerializer):
    parent_name = serializers.SerializerMethodField()
    def get_parent_name(self, obj):
        return obj.parent.first_name  # N+1 if no select_related!

# ❌ BANNED: SELECT * when you need 2 columns
all_users = User.objects.all()  # loads ALL fields
names = [u.first_name for u in all_users]
# ✅ FIX:
names = User.objects.values_list('first_name', flat=True)

# ❌ BANNED: Python-level filtering on queryset
all_tasks = Task.objects.all()
open_tasks = [t for t in all_tasks if t.status == 'open']
# ✅ FIX: Database-level filtering
open_tasks = Task.objects.filter(status='open')

# ❌ BANNED: Multiple DB calls for data that can be fetched in one
user = User.objects.get(id=user_id)
tasks = Task.objects.filter(parent=user)
reviews = Review.objects.filter(reviewer=user)
# ✅ FIX: Prefetch in one go or use select_related
user = User.objects.prefetch_related('posted_tasks', 'reviews_given').get(id=user_id)

# ❌ BANNED: .save() in a loop
for task in tasks:
    task.status = 'completed'
    task.save()  # N separate UPDATE queries
# ✅ FIX: bulk_update
for task in tasks:
    task.status = 'completed'
Task.objects.bulk_update(tasks, ['status'], batch_size=500)
# OR even better for uniform updates:
Task.objects.filter(id__in=task_ids).update(status='completed')  # 1 query
```

### 8.3 Memory Anti-Patterns

```python
# ❌ BANNED: Loading entire table into memory
all_records = list(MyModel.objects.all())  # could be millions of rows
# ✅ FIX: Use iterator for streaming
for record in MyModel.objects.all().iterator(chunk_size=2000):
    process(record)

# ❌ BANNED: Unbounded list growth without limit
results = []
while has_more_data():
    results.append(fetch_next())  # grows forever
# ✅ FIX: Process in chunks, or enforce maximum
results = []
MAX_RESULTS = 10000
while has_more_data() and len(results) < MAX_RESULTS:
    results.append(fetch_next())
```

---

## §9. Pre-Flight Checklist

Before submitting ANY code that processes data, answer these 10 questions. If you answer "NO" or "I don't know" to any question, **revisit your implementation**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PRE-FLIGHT CHECKLIST                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ □ 1. Did I identify the problem category? (§2 Step 1)                   │
│                                                                          │
│ □ 2. Do I know the data size N and growth trajectory?                   │
│                                                                          │
│ □ 3. Is my time complexity acceptable for the data size? (§2 Step 4)    │
│                                                                          │
│ □ 4. Am I doing work in Python that the database can do?                │
│      (filtering, sorting, aggregation, counting)                        │
│                                                                          │
│ □ 5. Are all related-object accesses covered by                          │
│      select_related / prefetch_related?                                  │
│                                                                          │
│ □ 6. Am I using set/dict for O(1) lookups instead of                    │
│      scanning lists?                                                     │
│                                                                          │
│ □ 7. Are there any nested loops on collections that could               │
│      be N > 100? If so, can I reduce to O(N) or O(N log N)?            │
│                                                                          │
│ □ 8. Am I loading more data into memory than I need?                    │
│      (using .values(), .only(), .defer(), .iterator() where appropriate)│
│                                                                          │
│ □ 9. For repeated expensive computations, have I considered             │
│      caching or memoization?                                             │
│                                                                          │
│ □ 10. Did I add a brief DSA justification comment at the                │
│       decision point?                                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## §10. Language-Specific Cheat Sheet: Python & Django

### 10.1 Python Built-in Performance

| Task | Slow Way | Fast Way | Speedup |
|------|----------|----------|---------|
| Membership test | `x in list` O(N) | `x in set` O(1) | N× |
| Count items | manual loop | `collections.Counter(items)` | 2-5× |
| Top K | `sorted(items)[:K]` O(N log N) | `heapq.nlargest(K, items)` O(N log K) | log(N/K)× |
| Flatten nested | nested loops | `itertools.chain.from_iterable` | 2-3× |
| Group by key | manual dict building | `itertools.groupby(sorted_data, key=...)` | cleaner |
| Cartesian product | nested loops | `itertools.product(a, b)` | cleaner |
| Deduplicate preserving order | manual loop | `dict.fromkeys(items)` (Py3.7+) | 2× |
| Dict merge | loop + update | `{**d1, **d2}` or `d1 \| d2` (Py3.9+) | cleaner |
| Conditional list | loop + if | list comprehension `[x for x in items if pred(x)]` | 1.5-2× |
| String formatting | `"..." + str(x) + "..."` | f-string `f"...{x}..."` | 2× |
| Multiple conditions | `if a == 1 or a == 2 or a == 3` | `if a in {1, 2, 3}` | cleaner + faster for large sets |

### 10.2 Django ORM Performance Toolkit

```python
# ── select_related: JOIN in SQL (ForeignKey, OneToOne) ──
Task.objects.select_related('parent', 'category').filter(status='open')

# ── prefetch_related: Separate query + Python join (reverse FK, M2M) ──
User.objects.prefetch_related('posted_tasks', 'task_applications').get(id=uid)

# ── Prefetch with custom queryset (filtered prefetch) ──
from django.db.models import Prefetch
User.objects.prefetch_related(
    Prefetch('posted_tasks', queryset=Task.objects.filter(status='open'))
)

# ── values / values_list: Skip model instantiation ──
Task.objects.filter(status='open').values('id', 'title', 'price')
ids = Task.objects.filter(status='open').values_list('id', flat=True)

# ── only / defer: Partial model loading ──
Task.objects.only('id', 'title', 'status')   # load only these fields
Task.objects.defer('description')             # load all EXCEPT this field

# ── annotate + aggregate: DB-level computation ──
from django.db.models import Avg, Count, Sum, F, Q
User.objects.annotate(
    task_count=Count('posted_tasks'),
    avg_rating=Avg('reviews_received__rating')
).filter(task_count__gt=5)

# ── Subquery: Avoid multiple round-trips ──
from django.db.models import Subquery, OuterRef
latest_review = Review.objects.filter(
    reviewee=OuterRef('pk')
).order_by('-created_at').values('rating')[:1]
User.objects.annotate(latest_rating=Subquery(latest_review))

# ── F() expressions: DB-level field references (avoid loading to Python) ──
Task.objects.filter(price__gt=F('min_budget') * 2)

# ── Q() objects: Complex OR/AND/NOT queries ──
Task.objects.filter(Q(status='open') | Q(status='in_progress'))

# ── bulk_create with ignore_conflicts ──
TaskApplication.objects.bulk_create(
    [TaskApplication(task=t, worker=w) for t, w in pairs],
    batch_size=500,
    ignore_conflicts=True  # skip duplicates silently
)

# ── iterator() for streaming large querysets ──
for task in Task.objects.all().iterator(chunk_size=2000):
    process(task)  # only chunk_size objects in memory at once

# ── explain() for query analysis (dev only) ──
print(Task.objects.filter(status='open').explain(analyze=True))
```

### 10.3 Django Index Declarations

```python
class Task(models.Model):
    # ... fields ...

    class Meta:
        indexes = [
            # Single-column indexes for common filters
            models.Index(fields=['status'], name='idx_task_status'),
            models.Index(fields=['created_at'], name='idx_task_created'),

            # Composite index for common query pattern
            models.Index(fields=['status', 'created_at'], name='idx_task_status_created'),

            # Partial index (PostgreSQL) — only index open tasks
            models.Index(
                fields=['created_at'],
                name='idx_task_open_created',
                condition=Q(status='open')
            ),

            # GIN index for JSONField
            models.Index(
                fields=['qualifications'],
                name='idx_user_qualifications',
                opclasses=['jsonb_path_ops']
            ),
        ]
```

### 10.4 Common Python stdlib for DSA

```python
# ── collections ──
from collections import (
    Counter,        # frequency counting: Counter(words).most_common(10)
    defaultdict,    # auto-init: graph = defaultdict(list)
    deque,          # O(1) append/pop both ends: BFS queue, sliding window
    OrderedDict,    # insertion-ordered dict (Py3.7+ dict is ordered, but explicit)
    namedtuple,     # lightweight immutable objects
)

# ── heapq ──
import heapq
heapq.nlargest(k, iterable, key=...)   # top-K
heapq.nsmallest(k, iterable, key=...)  # bottom-K
heapq.heappush(heap, item)             # push O(log N)
heapq.heappop(heap)                    # pop min O(log N)
heapq.merge(*sorted_iters)             # merge sorted iterables

# ── bisect ──
import bisect
bisect.bisect_left(sorted_list, x)     # binary search insert point
bisect.insort(sorted_list, x)          # insert maintaining sort

# ── itertools ──
import itertools
itertools.chain.from_iterable(nested)  # flatten
itertools.groupby(sorted_data, key)    # group consecutive
itertools.islice(iterable, stop)       # lazy slicing
itertools.accumulate(data)             # prefix sums
itertools.product(a, b)                # cartesian product
itertools.combinations(data, r)        # C(n,r)

# ── functools ──
from functools import lru_cache, reduce, partial

# ── math ──
from math import (
    radians, sin, cos, asin, sqrt,     # Haversine distance
    log2, ceil, floor, gcd, isqrt,     # common math
)
```

---

## Rules

1. **Database first, Python second.** If the DB can do it (filter, sort, count, aggregate, join), let the DB do it. Don't pull data into Python to process.
2. **Measure before optimizing.** Use `queryset.explain()`, Django Debug Toolbar, or `time.perf_counter()` to verify bottlenecks exist before adding complexity.
3. **Comment your DSA choices.** Every non-trivial data structure or algorithm selection must have a one-line `# DSA:` comment explaining the choice and its complexity.
4. **Don't over-engineer.** For N ≤ 100, readability beats cleverness. A simple loop is fine. Only optimize when N justifies it.
5. **Cache is not a substitute for good queries.** Fix the query first. Cache the result only if the query is inherently expensive AND data is read-heavy.
6. **Test with realistic data sizes.** If production will have 10K users, test with 10K users, not 5.
7. **Know your stdlib.** Python's `collections`, `heapq`, `bisect`, `itertools`, and `functools` solve 80% of DSA problems without external dependencies.
