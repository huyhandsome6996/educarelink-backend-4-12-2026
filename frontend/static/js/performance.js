// ====================================================================
// EduCareLink — Web Performance Utilities
// Áp dụng DSA: LRU Cache (Map), Debounce, Request Deduplication
// ====================================================================
// File này được load global qua <script src="/static/js/performance.js">
// Expose window.EduPerf cho tất cả templates dùng
// ====================================================================

(function () {
  'use strict';

  const _cache = new Map();
  const _inflight = new Map();
  const DEFAULT_TTL = 60 * 1000;
  const DEFAULT_STALE_TIME = 5 * 60 * 1000;

  async function cachedFetch(key, fetchFn, options) {
    options = options || {};
    const ttl = options.ttl || DEFAULT_TTL;
    const staleTime = options.staleTime || DEFAULT_STALE_TIME;
    const forceRefresh = options.forceRefresh || false;
    const now = Date.now();
    const cached = _cache.get(key);

    if (!forceRefresh && cached && now - cached.timestamp < ttl) {
      return cached.data;
    }

    if (cached && now - cached.timestamp < staleTime) {
      _backgroundRefresh(key, fetchFn);
      return cached.data;
    }

    if (_inflight.has(key)) {
      return _inflight.get(key);
    }

    const promise = fetchFn()
      .then(function (data) {
        _cache.set(key, { data: data, timestamp: Date.now() });
        if (_cache.size > 50) {
          const firstKey = _cache.keys().next().value;
          _cache.delete(firstKey);
        }
        return data;
      })
      .finally(function () {
        _inflight.delete(key);
      });

    _inflight.set(key, promise);
    return promise;
  }

  function _backgroundRefresh(key, fetchFn) {
    fetchFn()
      .then(function (data) {
        _cache.set(key, { data: data, timestamp: Date.now() });
      })
      .catch(function (e) {
        console.warn('[Cache] Background refresh failed for ' + key + ':', e.message);
      });
  }

  function invalidateCache(key) {
    _cache.delete(key);
  }

  function invalidateCachePrefix(prefix) {
    for (const k of _cache.keys()) {
      if (k.startsWith(prefix)) _cache.delete(k);
    }
  }

  function clearAllCache() {
    _cache.clear();
    _inflight.clear();
  }

  function debounce(fn, delay) {
    delay = delay || 300;
    let timeoutId;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(function () {
        fn.apply(ctx, args);
      }, delay);
    };
  }

  function throttle(fn, limit) {
    limit = limit || 200;
    let inThrottle = false;
    return function () {
      if (!inThrottle) {
        fn.apply(this, arguments);
        inThrottle = true;
        setTimeout(function () { inThrottle = false; }, limit);
      }
    };
  }

  function prefetch(key, fetchFn) {
    if (!_cache.has(key)) {
      cachedFetch(key, fetchFn).catch(function () {});
    }
  }

  function getStats() {
    return {
      cacheSize: _cache.size,
      inflight: _inflight.size,
      keys: Array.from(_cache.keys()),
    };
  }

  // Expose globally
  window.EduPerf = {
    cachedFetch: cachedFetch,
    invalidateCache: invalidateCache,
    invalidateCachePrefix: invalidateCachePrefix,
    clearAllCache: clearAllCache,
    debounce: debounce,
    throttle: throttle,
    prefetch: prefetch,
    getStats: getStats,
    TTL: {
      SHORT: 15 * 1000,
      MEDIUM: 30 * 1000,
      LONG: 60 * 1000,
      XLONG: 5 * 60 * 1000,
    },
  };

  console.log('[EduPerf] Performance utilities loaded');
})();
