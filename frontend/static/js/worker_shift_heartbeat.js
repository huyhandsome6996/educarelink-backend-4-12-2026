/* ============================================================
 * worker_shift_heartbeat.js — 2026-09-27: HEARTBEAT TRONG CA cho
 * CarePartner đang làm việc trên WEB (luồng ghép cặp Flow 1).
 *
 * VẤN ĐỀ: hệ thống cảnh báo "mất kết nối thiết bị" (tracking.DeviceHeartbeat
 * + offline scheduler 60s) trước đây chỉ có app mobile gửi heartbeat
 * (LocationService 30s). Carepartner làm ca trên web KHÔNG bao giờ gửi
 * → phụ huynh không có bảo vệ chống tắt máy, hoặc ngược lại dễ nhận
 * cảnh báo thiếu thông tin.
 *
 * GIẢI PHÁP:
 *   - Mỗi 3 phút: GET /api/matching/bookings/?role=worker&status=in_progress
 *     → lấy booking.task_id (Task mirror tự tạo khi ca start).
 *   - Mỗi 30s: POST /api/tracking/heartbeat/ {task_id} cho từng ca đang làm
 *     (đồng bộ nhịp mobile — TRACKING_HEARTBEAT_INTERVAL=30).
 *   - 403 (chưa cấp quyền chia sẻ vị trí cho task) → backoff 24h với task đó.
 *   - Dùng Web Worker nhúng (Blob) làm nhịp timer: timer trong Worker
 *     KHÔNG bị trình duyệt throttle xuống 1 lần/phút khi tab nền như
 *     setInterval thường → carepartner chuyển tab làm việc khác vẫn giữ
 *     nhịp 30s, KHÔNG gây báo động nhầm. Tab đóng/tắt máy thật → heartbeat
 *     dừng → sau ~60s + cron 60s phụ huynh nhận chuông cảnh báo ĐÚNG.
 *
 * Include trong _worker_chrome.html → chạy trên mọi trang worker đã đăng nhập.
 * ============================================================ */
(function () {
  'use strict';

  var HEARTBEAT_MS = 30000;            // 30s — khớp mobile + settings backend
  var REFRESH_TASKS_MS = 3 * 60 * 1000; // refresh danh sách ca 3 phút/lần
  var CONSENT_BACKOFF_MS = 24 * 60 * 60 * 1000; // 403 consent → nghỉ 24h

  var inProgressTaskIds = [];
  var consentBlocked = {}; // task_id → until (ms)
  var beatTimer = null;
  var tickWorker = null;

  function getToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
  }

  function isWorkerPage() {
    return !!document.getElementById('worker-bottom-nav') ||
           !!document.querySelector('aside#sidebar');
  }

  function apiGet(url) {
    return fetch(url, { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function refreshTasks() {
    if (!getToken() || !isWorkerPage()) return;
    // Chỉ refresh khi tab visible — tab nền dùng cache hiện tại đủ tốt
    if (document.visibilityState !== 'visible') return;
    apiGet('/api/matching/bookings/?role=worker&status=in_progress')
      .then(function (data) {
        var results = data && (data.results || data);
        if (!Array.isArray(results)) results = [];
        var now = Date.now();
        var ids = [];
        results.forEach(function (b) {
          if (b && b.task_id) {
            var until = consentBlocked[String(b.task_id)] || 0;
            if (now >= until) ids.push(b.task_id);
          }
        });
        inProgressTaskIds = ids;
      });
  }

  function sendHeartbeat(taskId) {
    fetch('/api/tracking/heartbeat/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken(),
      },
      body: JSON.stringify({ task_id: taskId }),
    }).then(function (r) {
      if (r.status === 403) {
        // Chưa cấp quyền chia sẻ vị trí cho task → backoff, không spam
        consentBlocked[String(taskId)] = Date.now() + CONSENT_BACKOFF_MS;
        inProgressTaskIds = inProgressTaskIds.filter(function (x) { return x !== taskId; });
      }
    }).catch(function () { /* mạng lỗi — nhịp sau thử lại */ });
  }

  function beat() {
    if (!getToken() || !isWorkerPage()) return;
    var ids = inProgressTaskIds.slice();
    for (var i = 0; i < ids.length; i++) sendHeartbeat(ids[i]);
  }

  function startBeating() {
    if (beatTimer) return;
    // Ưu tiên Web Worker nhúng — timer không bị throttle khi tab nền
    try {
      var blob = new Blob([
        'setInterval(function(){ postMessage(1); }, ' + HEARTBEAT_MS + ');'
      ], { type: 'application/javascript' });
      tickWorker = new Worker(URL.createObjectURL(blob));
      tickWorker.onmessage = function () { beat(); };
    } catch (e) {
      tickWorker = null;
    }
    if (!tickWorker) {
      beatTimer = setInterval(beat, HEARTBEAT_MS);
    }
    // Quay lại tab → gửi ngay 1 nhịp cho tươi last_seen
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        refreshTasks();
        beat();
      }
    });
  }

  function start() {
    if (!getToken()) return;          // trang public / chưa login
    if (!isWorkerPage()) return;      // chỉ trang worker
    refreshTasks();
    startBeating();
    setInterval(refreshTasks, REFRESH_TASKS_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
