#!/usr/bin/env node
/**
 * QA-FIX-5 / H1 — Node test cho mobile: verify flushOfflineQueue tách đúng
 * theo task_id (không trộn điểm của 2 task vào cùng 1 batch request).
 *
 * Cách chạy:
 *   cd mobile
 *   npm install --no-save @babel/register@^7 @babel/preset-env@^7 --prefix /tmp/babel-test
 *   node scripts/test_qa5_mobile_flush_isolation.test.js
 *
 * Test này mock:
 *   - expo-sqlite: in-memory store thay cho SQLite.
 *   - apiClient: ghi lại mỗi lần POST /tracking/location/batch/ với task_id
 *     + points — để verify task_id KHÔNG bị trộn giữa các request.
 *   - expo-location, expo-task-manager, expo-battery, NetInfo, react-native:
 *     no-op stubs (chỉ cần module resolve được, không gọi).
 *
 * Test scenarios:
 *   1. Queue có 2 điểm task A + 2 điểm task B (cùng user) → flush tạo 2
 *      request riêng, mỗi request chỉ chứa points của 1 task.
 *   2. Queue có 250 điểm task A + 50 điểm task B → flush tạo 2 request cho
 *      task A (200 + 50) + 1 request cho task B (50). Tổng 3 request.
 *   3. Network 5xx trên task A → dừng cả flush, không thử task B (tránh
 *      spam API khi mạng yếu).
 */

const path = require('path');
const assert = require('assert');

// ═══════════════════════════════════════════════════════════════════
// MOCK MODULES — phải set trước khi require LocationService.js
// ═══════════════════════════════════════════════════════════════════

// In-memory SQLite mock
const _rows = []; // array of row objects
let _nextId = 1;

const sqliteMock = {
  openDatabaseAsync: async (_name) => ({
    execAsync: async (_sql) => { /* no-op for CREATE TABLE / ALTER TABLE */ },
    runAsync: async (sql, params) => {
      // INSERT INTO ... VALUES (?, ?, ...)
      if (/^INSERT INTO/i.test(sql)) {
        const row = {
          id: _nextId++,
          user_id: params[0],
          task_id: params[1],
          client_point_id: params[2],
          latitude: params[3],
          longitude: params[4],
          accuracy: params[5],
          speed: params[6],
          heading: params[7],
          recorded_at: params[8],
          created_at: params[9],
          sync_attempts: 0,
        };
        _rows.push(row);
        return { changes: 1 };
      }
      // DELETE FROM ... WHERE id IN (...)
      if (/^DELETE FROM/i.test(sql)) {
        // Parse placeholders + ids từ params
        const match = sql.match(/IN \(([^)]+)\)/);
        if (match) {
          const ids = params; // tất cả params là ids
          const before = _rows.length;
          for (let i = _rows.length - 1; i >= 0; i--) {
            if (ids.includes(_rows[i].id)) {
              _rows.splice(i, 1);
            }
          }
          return { changes: before - _rows.length };
        }
        // DELETE FROM ... WHERE user_id = ?
        if (/WHERE user_id = \?/i.test(sql)) {
          const userId = params[0];
          const before = _rows.length;
          for (let i = _rows.length - 1; i >= 0; i--) {
            if (_rows[i].user_id === userId) {
              _rows.splice(i, 1);
            }
          }
          return { changes: before - _rows.length };
        }
        // DELETE FROM (all)
        _rows.length = 0;
        return { changes: 0 };
      }
      // UPDATE ... SET sync_attempts = sync_attempts + 1 WHERE id IN (...)
      if (/^UPDATE.*sync_attempts/i.test(sql)) {
        const match = sql.match(/IN \(([^)]+)\)/);
        if (match) {
          const ids = params.slice(0, match[1].split(',').length);
          for (const row of _rows) {
            if (ids.includes(row.id)) {
              row.sync_attempts = (row.sync_attempts || 0) + 1;
            }
          }
          return { changes: ids.length };
        }
      }
      return { changes: 0 };
    },
    getAllAsync: async (sql, params) => {
      // SELECT * FROM ... WHERE user_id = ? AND task_id = ? ORDER BY ... LIMIT ?
      // (PHẢI kiểm tra mẫu cụ thể NÀY TRƯỚC mẫu user-only, vì cả 2 đều có
      // 'WHERE user_id = ?' — nếu kiểm tra user-only trước thì sẽ match nhầm.)
      if (/SELECT \* FROM/i.test(sql) && /user_id = \? AND task_id = \?/i.test(sql)) {
        const userId = params[0];
        const taskId = params[1];
        const limit = params[2];
        return _rows
          .filter((r) => r.user_id === userId && r.task_id === taskId)
          .sort((a, b) => a.created_at - b.created_at)
          .slice(0, limit);
      }
      // SELECT * FROM ... WHERE user_id = ? ORDER BY created_at ASC LIMIT ?
      // (mẫu user-only — KHÔNG có task_id)
      if (/SELECT \* FROM/i.test(sql) && /WHERE user_id = \?/i.test(sql) && /LIMIT \?/i.test(sql)) {
        const userId = params[0];
        const limit = params[1];
        return _rows
          .filter((r) => r.user_id === userId)
          .sort((a, b) => a.created_at - b.created_at)
          .slice(0, limit);
      }
      // SELECT task_id, COUNT(*) as count, MIN(created_at) as min_created_at ...
      if (/SELECT task_id, COUNT/i.test(sql)) {
        const userId = params[0];
        const byTask = new Map();
        for (const r of _rows) {
          if (r.user_id !== userId) continue;
          if (!byTask.has(r.task_id)) {
            byTask.set(r.task_id, { task_id: r.task_id, count: 0, min_created_at: r.created_at });
          }
          const entry = byTask.get(r.task_id);
          entry.count++;
          if (r.created_at < entry.min_created_at) entry.min_created_at = r.created_at;
        }
        return Array.from(byTask.values()).sort((a, b) => a.min_created_at - b.min_created_at);
      }
      // SELECT id FROM ... WHERE id IN (...) AND sync_attempts >= ?
      if (/SELECT id FROM/i.test(sql) && /sync_attempts >= \?/i.test(sql)) {
        const lastParam = params[params.length - 1];
        const ids = params.slice(0, -1);
        return _rows
          .filter((r) => ids.includes(r.id) && (r.sync_attempts || 0) >= lastParam)
          .map((r) => ({ id: r.id }));
      }
      // SELECT COUNT(*) as count FROM ... WHERE user_id = ?
      if (/SELECT COUNT\(\*\) as count/i.test(sql) && /WHERE user_id = \?/i.test(sql)) {
        const userId = params[0];
        return [{ count: _rows.filter((r) => r.user_id === userId).length }];
      }
      // SELECT COUNT(*) as count FROM ... (no WHERE)
      if (/SELECT COUNT\(\*\) as count/i.test(sql)) {
        return [{ count: _rows.length }];
      }
      return [];
    },
    getFirstAsync: async (sql, params) => {
      if (/SELECT COUNT\(\*\) as count/i.test(sql) && /WHERE user_id = \?/i.test(sql)) {
        const userId = params[0];
        return { count: _rows.filter((r) => r.user_id === userId).length };
      }
      if (/SELECT COUNT\(\*\) as count/i.test(sql)) {
        return { count: _rows.length };
      }
      return null;
    },
  }),
};

// Track API calls — mỗi entry = { taskId, points }
const _apiCalls = [];
let _apiFailMode = null; // '5xx' | '4xx' | null

const apiClientMock = {
  post: async (url, body) => {
    if (url !== '/tracking/location/batch/') {
      return { data: {} };
    }
    if (_apiFailMode === '5xx') {
      _apiFailMode = null; // reset để test có thể set lại
      const err = new Error('Server error');
      err.response = { status: 500 };
      throw err;
    }
    if (_apiFailMode === '4xx') {
      _apiFailMode = null;
      const err = new Error('Bad request');
      err.response = { status: 400 };
      throw err;
    }
    _apiCalls.push({ taskId: body.task_id, points: body.points });
    // Simulate backend response: tất cả points đều insert thành công
    return {
      data: {
        saved: body.points.length,
        inserted_ids: body.points.map((p) => p.client_point_id),
        already_exists_ids: [],
        rejected: [],
      },
    };
  },
  get: async () => ({ data: {} }),
};

// Storage mock — in-memory
const _storage = {};
const storageMock = {
  getItem: async (k) => _storage[k] ?? null,
  setItem: async (k, v) => { _storage[k] = v; },
  deleteItem: async (k) => { delete _storage[k]; },
};

// Register mocks trong Module cache
const Module = require('module');
const _originalResolve = Module._resolveFilename;
const _mocks = {
  'expo-sqlite': sqliteMock,
  'expo-location': { getCurrentPositionAsync: async () => ({}), startLocationUpdatesAsync: async () => {}, stopLocationUpdatesAsync: async () => {} },
  'expo-task-manager': { defineTask: () => {}, isTaskRegisteredAsync: async () => false, unregisterTaskAsync: async () => {} },
  'expo-battery': { getBatteryLevelAsync: async () => 1.0, addBatteryStateListener: () => ({ remove: () => {} }) },
  '@react-native-community/netinfo': { addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) },
  'react-native': { Platform: { OS: 'android' }, AppState: { addEventListener: () => () => {} }, Vibration: { vibrate: () => {}, cancel: () => {} } },
  'expo-secure-store': { isAvailableAsync: async () => false, getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} },
  '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
};

const _originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (_mocks[request]) {
    return _mocks[request];
  }
  // Mock storage + apiClient theo relative path
  if (parent && parent.filename) {
    const parentDir = path.dirname(parent.filename);
    const resolved = path.resolve(parentDir, request);
    if (resolved.endsWith('utils/storage.js') || resolved.endsWith('utils/storage')) {
      return { storage: storageMock };
    }
    if (resolved.endsWith('api/client.js') || resolved.endsWith('api/client')) {
      return apiClientMock;
    }
  }
  return _originalLoad.apply(this, arguments);
};

// Babel/ESM transform — cần register để import ES modules
const babelRegister = require('/tmp/babel-test/node_modules/@babel/register').default;
babelRegister({
  presets: [
    '/tmp/babel-test/node_modules/@babel/preset-env',
  ],
  extensions: ['.js', '.jsx'],
  cwd: __dirname + '/..',  // mobile/
  ignore: [/node_modules/],
  cache: false,
});

// ═══════════════════════════════════════════════════════════════════
// LOAD MODULES UNDER TEST
// ═══════════════════════════════════════════════════════════════════

const OfflineQueue = require(
  __dirname + '/../src/services/OfflineLocationQueue.js'
);
const LocationService = require(
  __dirname + '/../src/services/LocationService.js'
);

// ═══════════════════════════════════════════════════════════════════
// TEST SCENARIOS
// ═══════════════════════════════════════════════════════════════════

async function resetState() {
  _rows.length = 0;
  _nextId = 1;
  _apiCalls.length = 0;
  _apiFailMode = null;
  // Reset module-level state of OfflineQueue (db singleton)
  // We need to re-init by calling initOfflineQueue — but the db object is cached.
  // Force re-init by accessing internal db through init.
  await OfflineQueue.initOfflineQueue();
}

async function test1_two_tasks_separate_requests() {
  await resetState();
  console.log('Test 1: 2 task cùng user → 2 request riêng, mỗi request chỉ chứa points của 1 task');

  const userId = 100;
  const taskIdA = 1001;
  const taskIdB = 1002;

  // Enqueue 2 points cho task A + 2 points cho task B
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.0, longitude: 106.0, recorded_at: '2026-08-13T10:00:00Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.01, longitude: 106.01, recorded_at: '2026-08-13T10:00:10Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.0, longitude: 107.0, recorded_at: '2026-08-13T10:00:20Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.01, longitude: 107.01, recorded_at: '2026-08-13T10:00:30Z',
  });

  // Flush
  const flushed = await LocationService.flushOfflineQueue(userId);

  // Verify: 4 points flushed, 2 API calls (1 per task)
  assert.strictEqual(flushed, 4, `Expected 4 points flushed, got ${flushed}`);
  assert.strictEqual(_apiCalls.length, 2, `Expected 2 API calls (1 per task), got ${_apiCalls.length}`);

  // Verify: mỗi API call chỉ chứa points của 1 task
  const call1 = _apiCalls[0];
  const call2 = _apiCalls[1];
  assert.strictEqual(call1.taskId, taskIdA, `First call should be for task A, got ${call1.taskId}`);
  assert.strictEqual(call1.points.length, 2, `First call should have 2 points, got ${call1.points.length}`);
  assert.strictEqual(call2.taskId, taskIdB, `Second call should be for task B, got ${call2.taskId}`);
  assert.strictEqual(call2.points.length, 2, `Second call should have 2 points, got ${call2.points.length}`);

  // Verify: tất cả points trong call 1 có latitude 10.x, call 2 có 20.x
  for (const p of call1.points) {
    assert.ok(p.latitude < 11, `Task A point latitude should be ~10, got ${p.latitude}`);
  }
  for (const p of call2.points) {
    assert.ok(p.latitude > 19, `Task B point latitude should be ~20, got ${p.latitude}`);
  }

  // Verify: queue empty sau flush
  const remaining = await OfflineQueue.getQueueSize(userId);
  assert.strictEqual(remaining, 0, `Queue should be empty after flush, got ${remaining}`);

  console.log('  ✓ PASS');
}

async function test2_large_chunk_per_task() {
  await resetState();
  console.log('Test 2: 250 points task A + 50 points task B → 3 API calls (200+50 + 50)');

  const userId = 200;
  const taskIdA = 2001;
  const taskIdB = 2002;

  // Enqueue 250 points cho task A
  for (let i = 0; i < 250; i++) {
    await OfflineQueue.enqueueLocation(userId, taskIdA, {
      latitude: 10.0 + i * 0.001, longitude: 106.0, recorded_at: `2026-08-13T10:00:${i.toString().padStart(2, '0')}Z`,
    });
  }
  // Enqueue 50 points cho task B
  for (let i = 0; i < 50; i++) {
    await OfflineQueue.enqueueLocation(userId, taskIdB, {
      latitude: 20.0 + i * 0.001, longitude: 107.0, recorded_at: `2026-08-13T11:00:${i.toString().padStart(2, '0')}Z`,
    });
  }

  const flushed = await LocationService.flushOfflineQueue(userId);

  // Verify: 300 points flushed, 3 API calls (200 + 50 + 50)
  assert.strictEqual(flushed, 300, `Expected 300 points flushed, got ${flushed}`);
  assert.strictEqual(_apiCalls.length, 3, `Expected 3 API calls (200+50 for A, 50 for B), got ${_apiCalls.length}`);

  // First 2 calls = task A (200 + 50), third call = task B (50)
  assert.strictEqual(_apiCalls[0].taskId, taskIdA);
  assert.strictEqual(_apiCalls[0].points.length, 200);
  assert.strictEqual(_apiCalls[1].taskId, taskIdA);
  assert.strictEqual(_apiCalls[1].points.length, 50);
  assert.strictEqual(_apiCalls[2].taskId, taskIdB);
  assert.strictEqual(_apiCalls[2].points.length, 50);

  console.log('  ✓ PASS');
}

async function test3_5xx_stops_all_tasks() {
  await resetState();
  console.log('Test 3: Network 5xx trên task A → dừng cả flush, không thử task B');

  const userId = 300;
  const taskIdA = 3001;
  const taskIdB = 3002;

  // Enqueue 2 points cho task A + 2 points cho task B
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.0, longitude: 106.0, recorded_at: '2026-08-13T10:00:00Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.01, longitude: 106.01, recorded_at: '2026-08-13T10:00:10Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.0, longitude: 107.0, recorded_at: '2026-08-13T10:00:20Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.01, longitude: 107.01, recorded_at: '2026-08-13T10:00:30Z',
  });

  // Set fail mode = 5xx → first API call fails
  _apiFailMode = '5xx';

  const flushed = await LocationService.flushOfflineQueue(userId);

  // Verify: 0 points flushed (5xx → không xoá gì), 1 API call (task A fail → stop)
  assert.strictEqual(flushed, 0, `Expected 0 points flushed on 5xx, got ${flushed}`);
  assert.strictEqual(_apiCalls.length, 0, `Expected 0 successful API calls on 5xx, got ${_apiCalls.length}`);

  // Verify: queue vẫn còn 4 points (không xoá gì)
  const remaining = await OfflineQueue.getQueueSize(userId);
  assert.strictEqual(remaining, 4, `Queue should still have 4 points after 5xx, got ${remaining}`);

  console.log('  ✓ PASS');
}

async function test4_4xx_skips_task_continues_next() {
  await resetState();
  console.log('Test 4: 4xx trên task A → break task A, thử task B (4xx là client error, không phải mạng)');

  const userId = 400;
  const taskIdA = 4001;
  const taskIdB = 4002;

  // Enqueue 2 points cho task A + 2 points cho task B
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.0, longitude: 106.0, recorded_at: '2026-08-13T10:00:00Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.01, longitude: 106.01, recorded_at: '2026-08-13T10:00:10Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.0, longitude: 107.0, recorded_at: '2026-08-13T10:00:20Z',
  });
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.01, longitude: 107.01, recorded_at: '2026-08-13T10:00:30Z',
  });

  // Set fail mode = 4xx → first API call fails with 400 (task A)
  _apiFailMode = '4xx';

  const flushed = await LocationService.flushOfflineQueue(userId);

  // Verify: 4xx chỉ break task A, không stopAll → task B tiếp tục và flush 2 points
  assert.strictEqual(flushed, 2, `Expected 2 points flushed (task B succeeded), got ${flushed}`);
  // Verify: 1 successful API call (task B)
  assert.strictEqual(_apiCalls.length, 1, `Expected 1 successful API call (task B), got ${_apiCalls.length}`);
  assert.strictEqual(_apiCalls[0].taskId, taskIdB, `Should be task B call, got ${_apiCalls[0].taskId}`);
  assert.strictEqual(_apiCalls[0].points.length, 2, `Task B should have 2 points, got ${_apiCalls[0].points.length}`);

  // Verify: queue còn 2 points của task A (4xx → tăng sync_attempts, giữ để retry)
  const remaining = await OfflineQueue.getQueueSize(userId);
  assert.strictEqual(remaining, 2, `Queue should still have 2 task A points, got ${remaining}`);

  console.log('  ✓ PASS (4xx break task A, task B tiếp tục thành công)');
}

async function test5_get_distinct_task_ids_orders_by_created_at() {
  await resetState();
  console.log('Test 5: getDistinctTaskIds trả task_ids theo thứ tự created_at tăng dần (FIFO)');

  const userId = 500;
  const taskIdA = 5001;
  const taskIdB = 5002;
  const taskIdC = 5003;

  // Enqueue theo thứ tự C → A → B (created_at đảo ngược)
  await OfflineQueue.enqueueLocation(userId, taskIdC, {
    latitude: 30.0, longitude: 108.0, recorded_at: '2026-08-13T10:00:00Z',
  });
  // Delay để created_at khác nhau
  await new Promise((r) => setTimeout(r, 10));
  await OfflineQueue.enqueueLocation(userId, taskIdA, {
    latitude: 10.0, longitude: 106.0, recorded_at: '2026-08-13T10:00:00Z',
  });
  await new Promise((r) => setTimeout(r, 10));
  await OfflineQueue.enqueueLocation(userId, taskIdB, {
    latitude: 20.0, longitude: 107.0, recorded_at: '2026-08-13T10:00:00Z',
  });

  const taskIds = await OfflineQueue.getDistinctTaskIds(userId);
  assert.strictEqual(taskIds.length, 3, `Expected 3 distinct task_ids, got ${taskIds.length}`);
  // Thứ tự: C (created trước) → A → B
  assert.strictEqual(taskIds[0].task_id, taskIdC, `First task should be C (oldest), got ${taskIds[0].task_id}`);
  assert.strictEqual(taskIds[1].task_id, taskIdA, `Second task should be A, got ${taskIds[1].task_id}`);
  assert.strictEqual(taskIds[2].task_id, taskIdB, `Third task should be B, got ${taskIds[2].task_id}`);

  console.log('  ✓ PASS');
}

async function test6_get_chunk_by_task_only_returns_matching_task() {
  await resetState();
  console.log('Test 6: getChunkByTask chỉ trả row của (user_id, task_id) cụ thể');

  const userId = 600;
  const taskIdA = 6001;
  const taskIdB = 6002;

  // Enqueue 3 points task A + 5 points task B
  for (let i = 0; i < 3; i++) {
    await OfflineQueue.enqueueLocation(userId, taskIdA, {
      latitude: 10.0, longitude: 106.0, recorded_at: `2026-08-13T10:00:0${i}Z`,
    });
  }
  for (let i = 0; i < 5; i++) {
    await OfflineQueue.enqueueLocation(userId, taskIdB, {
      latitude: 20.0, longitude: 107.0, recorded_at: `2026-08-13T10:00:1${i}Z`,
    });
  }

  // getChunkByTask cho task A → 3 rows, tất cả có task_id = A
  const chunkA = await OfflineQueue.getChunkByTask(userId, taskIdA, 200);
  assert.strictEqual(chunkA.length, 3, `Expected 3 rows for task A, got ${chunkA.length}`);
  for (const row of chunkA) {
    assert.strictEqual(row.task_id, taskIdA, `Row should have task_id = A, got ${row.task_id}`);
  }

  // getChunkByTask cho task B → 5 rows, tất cả có task_id = B
  const chunkB = await OfflineQueue.getChunkByTask(userId, taskIdB, 200);
  assert.strictEqual(chunkB.length, 5, `Expected 5 rows for task B, got ${chunkB.length}`);
  for (const row of chunkB) {
    assert.strictEqual(row.task_id, taskIdB, `Row should have task_id = B, got ${row.task_id}`);
  }

  // Verify: không bao giờ trộn row của 2 task
  const chunkA_taskB_rows = chunkA.filter((r) => r.task_id === taskIdB);
  assert.strictEqual(chunkA_taskB_rows.length, 0, 'chunkA should not contain any task B rows');

  console.log('  ✓ PASS');
}

// ═══════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════

(async () => {
  let passed = 0;
  let failed = 0;
  const tests = [
    test1_two_tasks_separate_requests,
    test2_large_chunk_per_task,
    test3_5xx_stops_all_tasks,
    test4_4xx_skips_task_continues_next,
    test5_get_distinct_task_ids_orders_by_created_at,
    test6_get_chunk_by_task_only_returns_matching_task,
  ];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (e) {
      failed++;
      console.log(`  ✗ FAIL: ${e.message}`);
      console.log(e.stack);
    }
  }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Results: ${passed} passed, ${failed} failed (total ${tests.length})`);
  if (failed > 0) {
    process.exit(1);
  }
})();
