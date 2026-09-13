/* ============================================================
 * job_assigned_alert.js — Task F (2026-09-14): Chuông + popup khi nhận đơn
 * (LUÔN — không phụ thuộc Web Push)
 *
 * Web CarePartner:
 *   1. Poll GET /api/matching/bookings/?status=awaiting_commitment mỗi 15s
 *      khi tab đang mở (phòng miss push).
 *   2. Có đơn mới → chuông "ding" bằng WebAudio (không cần file) + modal
 *      toàn màn hình "Bạn có đơn mới" với [Xác nhận cam kết] [Chi tiết] [Từ chối].
 *   3. Xác nhận → POST /api/matching/bookings/<id>/commit/ — thành công reload.
 *      Từ chối → chọn 1 trong 8 lý do T0 (đồng bộ don.html/worker_feed).
 *      Chi tiết → sang trang "Việc của tôi".
 *
 * Include trong _worker_chrome.html — chạy trên mọi trang worker.
 * Auth: JWT localStorage (giống apiFetch của các trang worker).
 * ============================================================ */
(function () {
  'use strict';

  var POLL_MS = 15000; // 15s
  var seenBookingIds = {};
  var firstPollDone = false;
  var modalOpen = false;
  var activeBooking = null;
  var audioCtx = null;

  var CANCEL_REASONS = [
    { code: 'school_schedule', label: 'Trùng lịch học đột xuất' },
    { code: 'health', label: 'Sức khỏe không tốt' },
    { code: 'family_emergency', label: 'Việc gia đình khẩn cấp' },
    { code: 'accident', label: 'Tai nạn / sự cố di chuyển' },
    { code: 'wrong_job_info', label: 'Thông tin công việc không đúng mô tả' },
    { code: 'transport', label: 'Không thể di chuyển' },
    { code: 'personal', label: 'Lý do cá nhân' },
    { code: 'other', label: 'Khác' },
  ];

  function getToken() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
  }

  function isWorkerPage() {
    return !!document.getElementById('worker-bottom-nav') ||
           !!document.querySelector('aside#sidebar');
  }

  /* ---------- Chuông WebAudio (không cần asset) ---------- */
  function playDing() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      // 2 tiếng "ding" cách nhau 350ms — đủ to, dễ nghe
      [0, 350].forEach(function (delay) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = delay === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0.001, audioCtx.currentTime + delay / 1000);
        gain.gain.exponentialRampToValueAtTime(0.6, audioCtx.currentTime + delay / 1000 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay / 1000 + 0.6);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay / 1000);
        osc.stop(audioCtx.currentTime + delay / 1000 + 0.65);
      });
    } catch (e) { /* trình duyệt chặn autoplay — modal vẫn hiện */ }
  }

  /* ---------- Poll đơn mời ---------- */
  function pollBookings() {
    if (modalOpen) return;
    if (!getToken()) return;
    if (document.visibilityState !== 'visible') return;
    fetch('/api/matching/bookings/?status=awaiting_commitment', {
      headers: { 'Authorization': 'Bearer ' + getToken() },
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (data) {
      var rows = Array.isArray(data) ? data : (data.results || []);
      var fresh = rows.filter(function (b) { return !seenBookingIds[b.id]; });
      rows.forEach(function (b) { seenBookingIds[b.id] = true; });
      if (firstPollDone && fresh.length > 0) {
        showOfferModal(fresh[0]);
      }
      firstPollDone = true;
    }).catch(function () { /* mạng lỗi — poll sau */ });
  }

  /* ---------- Modal ---------- */
  function ensureModal() {
    if (document.getElementById('ela-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'ela-modal';
    wrap.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;' +
      'background:rgba(15,23,42,.72);align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML =
      '<div style="background:#fff;border-radius:20px;max-width:420px;width:100%;overflow:hidden;' +
      'box-shadow:0 25px 60px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">' +
        '<div style="background:linear-gradient(135deg,#f59e0b,#f26522);padding:18px 20px;color:#fff">' +
          '<div style="font-size:20px;font-weight:800" id="ela-title">Bạn có đơn mới</div>' +
          '<div style="font-size:13px;opacity:.92;margin-top:2px">Phụ huynh đã chọn bạn — xác nhận trong thời hạn!</div>' +
        '</div>' +
        '<div style="padding:18px 20px">' +
          '<div id="ela-body" style="font-size:14px;color:#334155;line-height:1.6"></div>' +
          '<div id="ela-decline-box" style="display:none;margin-top:12px">' +
            '<label style="font-size:12px;font-weight:700;color:#475569">Lý do từ chối</label>' +
            '<select id="ela-reason" style="width:100%;margin-top:4px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px">' +
              CANCEL_REASONS.map(function (r) {
                return '<option value="' + r.code + '">' + r.label + '</option>';
              }).join('') +
            '</select>' +
            '<input id="ela-note" placeholder="Ghi chú (nếu cần)" style="width:100%;margin-top:8px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px">' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">' +
            '<button id="ela-accept" style="padding:12px;border:0;border-radius:12px;background:#f26522;color:#fff;font-weight:800;font-size:14px;cursor:pointer">Xác nhận cam kết</button>' +
            '<div style="display:flex;gap:8px">' +
              '<button id="ela-detail" style="flex:1;padding:11px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#334155;font-weight:700;font-size:13px;cursor:pointer">Chi tiết</button>' +
              '<button id="ela-decline" style="flex:1;padding:11px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#ef4444;font-weight:700;font-size:13px;cursor:pointer">Từ chối</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    document.getElementById('ela-accept').addEventListener('click', commitOffer);
    document.getElementById('ela-detail').addEventListener('click', function () {
      window.location.href = '/worker/my-jobs/';
    });
    document.getElementById('ela-decline').addEventListener('click', toggleDecline);
  }

  function fmtMoney(v) {
    try { return new Intl.NumberFormat('vi-VN').format(parseInt(v) || 0) + 'đ'; }
    catch (e) { return String(v); }
  }

  function showOfferModal(booking) {
    ensureModal();
    activeBooking = booking;
    modalOpen = true;
    var slotText = '—';
    var fs = booking.first_slot || {};
    if (fs.date) {
      slotText = fs.date + (fs.time_from ? ' · ' + String(fs.time_from).slice(0, 5) : '') +
        (fs.time_to ? ' – ' + String(fs.time_to).slice(0, 5) : '');
    }
    document.getElementById('ela-body').innerHTML =
      '<b>' + escapeHtml(booking.job_title || 'Ca chăm sóc') + '</b><br>' +
      '<span>👤 ' + escapeHtml(booking.parent_name || 'Phụ huynh') + '</span><br>' +
      '<span>🕒 ' + escapeHtml(slotText) + '</span><br>' +
      (booking.job_address ? '<span>📍 ' + escapeHtml(booking.job_address) + '</span><br>' : '') +
      '<span style="font-weight:800;color:#f26522">💰 ' + fmtMoney(booking.total_value_vnd) + '</span>';
    document.getElementById('ela-decline-box').style.display = 'none';
    var wrap = document.getElementById('ela-modal');
    wrap.style.display = 'flex';
    playDing();
  }

  function hideModal() {
    modalOpen = false;
    var wrap = document.getElementById('ela-modal');
    if (wrap) wrap.style.display = 'none';
  }

  function toggleDecline() {
    var box = document.getElementById('ela-decline-box');
    var showing = box.style.display !== 'none';
    box.style.display = showing ? 'none' : 'block';
    document.getElementById('ela-decline').textContent = showing ? 'Từ chối' : 'Gửi từ chối';
    if (!showing) {
      document.getElementById('ela-decline').onclick = declineOffer;
    } else {
      document.getElementById('ela-decline').onclick = toggleDecline;
    }
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function authedPost(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify(body || {}),
    });
  }

  function commitOffer() {
    if (!activeBooking) return;
    var btn = document.getElementById('ela-accept');
    btn.disabled = true;
    btn.textContent = 'Đang xác nhận...';
    authedPost('/api/matching/bookings/' + activeBooking.id + '/commit/')
      .then(function (r) {
        if (r.ok) { hideModal(); window.location.href = '/worker/my-jobs/'; }
        else return r.json().then(function (d) {
          alert((d && d.detail) || 'Không xác nhận được đơn — có thể đã hết giờ.');
          hideModal(); window.location.reload();
        });
      })
      .catch(function () { btn.disabled = false; btn.textContent = 'Xác nhận cam kết'; });
  }

  function declineOffer() {
    if (!activeBooking) return;
    var reason = document.getElementById('ela-reason').value;
    var note = document.getElementById('ela-note').value || '';
    var btn = document.getElementById('ela-decline');
    btn.disabled = true;
    authedPost('/api/matching/bookings/' + activeBooking.id + '/cancel/', {
      reason_code: reason, note: note,
    }).then(function (r) {
      hideModal();
      if (r.ok) { window.location.reload(); }
      else return r.json().then(function (d) {
        alert((d && d.detail) || 'Không từ chối được đơn.');
        btn.disabled = false;
      });
    }).catch(function () { btn.disabled = false; });
  }

  function start() {
    if (!isWorkerPage()) return;
    pollBookings();
    setInterval(pollBookings, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
