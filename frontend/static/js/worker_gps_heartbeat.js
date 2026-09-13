/* ============================================================
 * worker_gps_heartbeat.js — Task E (2026-09-14): GPS 100% cho khoảng cách
 *
 * Web CarePartner gửi GPS heartbeat cùng API mobile:
 *   POST /api/tracking/gps-heartbeat/ {latitude, longitude, accuracy}
 *
 * "100%" = mỗi lần mở trang worker / mỗi 5 phút khi tab đang mở đều gửi.
 * Matching ưu tiên GPS tươi <48h; không consent → backend trả
 * gps_sync='no_matching_consent' → trang chỉ dừng gửi (fallback địa chỉ hồ sơ),
 * KHÔNG retry vô hạn.
 *
 * Được include trong _worker_chrome.html → chạy trên mọi trang worker.
 * Auth: JWT trong localStorage ('token' / 'refresh_token') — cùng cơ chế
 * apiFetch của các trang (đồng bộ mobile dùng JWT /api/auth/login/).
 * ============================================================ */
(function () {
  'use strict';

  var HEARTBEAT_URL = '/api/tracking/gps-heartbeat/';
  var INTERVAL_MS = 5 * 60 * 1000; // 5 phút khi tab mở
  var STOP_AFTER_NO_CONSENT_MS = 24 * 60 * 60 * 1000; // 24h không retry khi từ chối

  var noConsentUntil = 0;
  var timerId = null;

  function getToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
  }

  function getRefreshToken() {
    try { return localStorage.getItem('refresh_token'); } catch (e) { return null; }
  }

  function setToken(t) {
    try { localStorage.setItem('token', t); } catch (e) { /* ignore */ }
  }

  function isWorkerPage() {
    // Trang worker đều có bottom-nav worker / sidebar worker
    return !!document.getElementById('worker-bottom-nav') ||
           !!document.querySelector('aside#sidebar');
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify(body || {}),
    });
  }

  function sendHeartbeat(lat, lng, accuracy) {
    if (!getToken()) return; // trang công khai / chưa login — bỏ qua im lặng
    postJSON(HEARTBEAT_URL, {
      latitude: lat, longitude: lng,
      accuracy: (typeof accuracy === 'number') ? accuracy : undefined,
    }).then(function (resp) {
      if (!resp.ok) return; // 4xx/5xx — thử lại chu kỳ sau
      return resp.json().then(function (data) {
        if (data && data.gps_sync === 'no_matching_consent') {
          // Không consent → dừng 24h (client nhớ, không spam, không 403 im lặng)
          noConsentUntil = Date.now() + STOP_AFTER_NO_CONSENT_MS;
        }
      });
    }).catch(function () { /* mạng lỗi — chu kỳ sau thử lại */ });
  }

  function syncNow() {
    if (Date.now() < noConsentUntil) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (pos) {
      var c = pos.coords || {};
      if (typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return;
      sendHeartbeat(c.latitude, c.longitude, c.accuracy);
    }, function () { /* user từ chối quyền OS → fallback địa chỉ hồ sơ */ },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  }

  function start() {
    if (!isWorkerPage()) return;
    syncNow(); // mỗi lần mở trang worker
    timerId = setInterval(function () {
      if (document.visibilityState === 'visible') syncNow();
    }, INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
