/* ============================================================
 * notification_sound.js — Âm thanh thông báo web (2026-09-20)
 *
 * Phát âm thanh khi user nhận thông báo MỚI (legacy /api/notifications/
 * — nguồn của thông báo ADMIN gửi, chat, SOS, tracking, xác minh...):
 *
 *   1. Thông báo thường (admin gửi, chat, xác minh, hoàn thành...)
 *      → "nhạc thông báo tin nhắn Messenger" (messenger_notification.mp3).
 *   2. Thông báo KHẨN CẤP phụ huynh (SOS / mất kết nối / rời vùng an toàn /
 *      cảnh báo) → còi hú CẢNH SÁT "Police Siren" (police_siren.mp3).
 *   3. Thông báo ngoài (giống Messenger/Zalo): hiện notification hệ điều
 *      hành qua Notification API để user kéo xuống / nhìn góc màn hình thấy,
 *      bấm vào là quay lại trang EduCareLink.
 *
 * Luồng hoạt động:
 *   - Poll GET /api/notifications/ mỗi 30s khi tab visible + có token.
 *   - Lần poll đầu CHỈ ghi nhớ trạng thái (không kêu cho thông báo cũ).
 *   - Thông báo mới (id chưa thấy) → kêu + hiện browser notification.
 *
 * Include trong _worker_chrome.html + _parent_chrome.html — chạy trên mọi
 * trang đã đăng nhập./job_assigned có chuông riêng trong job_assigned_alert.js
 * (không poll matching ở đây để tránh kêu trùng).
 * ============================================================ */
(function () {
  'use strict';

  var POLL_MS = 30000; // 30s
  var LAST_KEY = 'ela_last_notif_id';
  var seenIds = {};
  var firstPollDone = false;
  var lastPoliceAt = 0; // chống kêu còi liên tục quá nhiều lần trong 2 phút

  var SOUNDS = {
    messenger: '/static/sounds/messenger_notification.mp3',
    police: '/static/sounds/police_siren.mp3',
  };
  var loadedAudio = {};

  function getToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
  }

  function isEmergency(n) {
    var text = ((n.title || '') + ' ' + (n.message || '')).toLowerCase();
    return text.indexOf('sos') !== -1 ||
      text.indexOf('báo động') !== -1 ||
      text.indexOf('khẩn cấp') !== -1 ||
      text.indexOf('mất kết nối') !== -1 ||
      text.indexOf('offline') !== -1 ||
      text.indexOf('rời vùng') !== -1 ||
      text.indexOf('cảnh báo khẩn') !== -1;
  }

  /* ---------- Âm thanh ---------- */
  function getAudio(kind) {
    if (!loadedAudio[kind]) {
      try {
        var a = new Audio(SOUNDS[kind]);
        a.preload = 'auto';
        loadedAudio[kind] = a;
      } catch (e) { return null; }
    }
    return loadedAudio[kind];
  }

  function playSound(kind) {
    var a = getAudio(kind);
    if (!a) return;
    try {
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () {
          /* autoplay bị chặn (chưa từng tương tác trang) — bỏ qua,
             thông báo vẫn hiện trong trang + browser notification */
        });
      }
    } catch (e) { /* im lặng */ }
  }

  function playForNotification(n) {
    if (isEmergency(n)) {
      var now = Date.now();
      // Còi báo động tối đa 1 lần / 2 phút — tránh còi hú chồng chéo
      if (now - lastPoliceAt > 120000) {
        lastPoliceAt = now;
        playSound('police');
      }
    } else {
      playSound('messenger');
    }
  }

  /* ---------- Thông báo ngoài (Notification API — giống Messenger/Zalo) ---------- */
  function ensurePermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (e) { /* trình duyệt không hỗ trợ */ }
  }

  function showBrowserNotification(n) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (document.visibilityState === 'visible' && !document.hidden) {
        /* tab đang mở rõ ràng — chỉ kêu + badge trong trang, tránh spam OS */
        return;
      }
      var notif = new Notification(n.title || 'EduCareLink', {
        body: n.message || '',
        icon: '/static/images/logo.png',
        tag: 'educarelink-' + n.id,
      });
      notif.onclick = function () {
        try { window.focus(); } catch (e) {}
        notif.close();
      };
    } catch (e) { /* im lặng */ }
  }

  /* ---------- Poll thông báo legacy (admin/chat/tracking…) ---------- */
  function pollNotifications() {
    if (!getToken()) return;
    // 2026-09-27: BỎ gate `visibilityState !== 'visible'` — trước đây tab ẩn
    // thì ngưng poll hoàn toàn → phụ huynh để EduCareLink ở tab nền sẽ KHÔNG
    // nhận được thông báo ngoài (Notification API) lẫn chuông khẩn khi
    // Carepartner mất kết nối trong ca. Trình duyệt throttle timer nền về
    // ~60s/lần — vẫn đủ cho cảnh báo khẩn (threshold offline là 60s + cron 60s).
    // Sound vẫn phát được khi tab ẩn (audio không bị throttle như timer),
    // còn OS notification hiện nhờ showBrowserNotification bên dưới.
    fetch('/api/notifications/', {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (rows) {
      var items = Array.isArray(rows) ? rows : (rows.results || []);
      var fresh = [];
      for (var i = 0; i < items.length; i++) {
        var n = items[i];
        var key = String(n.id);
        if (seenIds[key]) continue;
        seenIds[key] = true;
        fresh.push(n);
      }
      // Lần poll đầu: ghi nhớ toàn bộ thông báo cũ, KHÔNG kêu
      if (firstPollDone && fresh.length > 0) {
        playForNotification(fresh[0]);
        for (var j = 0; j < Math.min(fresh.length, 3); j++) {
          showBrowserNotification(fresh[j]);
        }
      }
      try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) {}
      firstPollDone = true;
    }).catch(function () { /* mạng lỗi — poll sau */ });
  }

  /* Mở khoá autoplay: user bấm vào bất kỳ đâu → audio sẵn sàng kêu */
  function primeAudio() {
    for (var kind in SOUNDS) {
      var a = getAudio(kind);
      if (!a) continue;
      try {
        a.muted = true;
        var p = a.play();
        if (p && p.then) {
          p.then(function (el) {
            try { el.pause(); el.currentTime = 0; el.muted = false; } catch (e) {}
          }).catch(function () {});
        }
      } catch (e) {}
    }
  }

  function start() {
    if (!getToken()) return; // trang public/landing — không poll
    ensurePermission();
    primeAudio();
    pollNotifications();
    setInterval(pollNotifications, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
