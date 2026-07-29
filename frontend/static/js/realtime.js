/**
 * EduCareLink WebSocket client (web).
 * Gọi Realtime.connect(accessToken) sau khi login.
 * Events: notification, task_update, task_created, connected
 */
(function (global) {
  var socket = null;
  var intentionalClose = false;
  var reconnectAttempts = 0;
  var listeners = {};
  var pingTimer = null;
  var reconnectTimer = null;

  function wsBase() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws/realtime/';
  }

  function emit(type, payload) {
    (listeners[type] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) {}
    });
    (listeners['*'] || []).forEach(function (fn) {
      try { fn({ type: type, payload: payload }); } catch (e) {}
    });
  }

  function scheduleReconnect(token) {
    if (intentionalClose) return;
    if (reconnectTimer) return;
    var delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect(token);
    }, delay);
  }

  function connect(token) {
    if (!token) return;
    if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
    intentionalClose = false;
    var url = wsBase() + '?token=' + encodeURIComponent(token);
    try {
      socket = new WebSocket(url);
    } catch (e) {
      scheduleReconnect(token);
      return;
    }
    socket.onopen = function () {
      reconnectAttempts = 0;
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(function () {
        if (socket && socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };
    socket.onmessage = function (evt) {
      try {
        var data = JSON.parse(evt.data);
        if (data.type === 'pong') return;
        emit(data.type || 'event', data.payload || data);
      } catch (e) {}
    };
    socket.onclose = function () {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      socket = null;
      scheduleReconnect(token);
    };
    socket.onerror = function () {};
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (socket) { try { socket.close(); } catch (e) {} socket = null; }
  }

  function on(type, fn) {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(fn);
    return function () { off(type, fn); };
  }

  function off(type, fn) {
    listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; });
  }

  global.EduCareRealtime = {
    connect: connect,
    disconnect: disconnect,
    on: on,
    off: off,
  };
})(window);
