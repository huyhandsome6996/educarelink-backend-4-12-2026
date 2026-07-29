// ====================================================================
// RealtimeService — WebSocket client đồng bộ với backend Channels
// Endpoint: wss://educarelink-backend.onrender.com/ws/realtime/?token=JWT
// ====================================================================
import { storage } from '../utils/storage';

const PROD_WS = 'wss://educarelink-backend.onrender.com/ws/realtime/';
const useDevBackend =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_USE_DEV_BACKEND === '1';
const DEV_WS = 'ws://192.168.1.31:8000/ws/realtime/';

const WS_URL = useDevBackend ? DEV_WS : PROD_WS;

const listeners = new Map(); // eventType -> Set<fn>
let socket = null;
let intentionalClose = false;
let reconnectTimer = null;
let pingTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

function emit(type, payload) {
  const set = listeners.get(type);
  if (set) {
    set.forEach((fn) => {
      try { fn(payload); } catch (e) { console.warn('[Realtime] listener error', e); }
    });
  }
  const all = listeners.get('*');
  if (all) {
    all.forEach((fn) => {
      try { fn({ type, payload }); } catch (e) {}
    });
  }
}

function scheduleReconnect() {
  if (intentionalClose) return;
  if (reconnectTimer) return;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  intentionalClose = false;
  const token = await storage.getItem('access_token');
  if (!token) {
    console.log('[Realtime] no token — skip connect');
    return;
  }

  const url = `${WS_URL}?token=${encodeURIComponent(token)}`;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    console.warn('[Realtime] WebSocket create failed', e);
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    console.log('[Realtime] connected');
    reconnectAttempts = 0;
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch (e) {}
      }
    }, 25000);
  };

  socket.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      const type = data.type || 'event';
      if (type === 'pong') return;
      emit(type, data.payload || data);
    } catch (e) {
      console.warn('[Realtime] bad message', e);
    }
  };

  socket.onerror = (e) => {
    console.warn('[Realtime] error', e?.message || e);
  };

  socket.onclose = () => {
    console.log('[Realtime] closed');
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    socket = null;
    scheduleReconnect();
  };
}

function disconnect() {
  intentionalClose = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  if (socket) {
    try { socket.close(); } catch (e) {}
    socket = null;
  }
}

function on(eventType, fn) {
  if (!listeners.has(eventType)) listeners.set(eventType, new Set());
  listeners.get(eventType).add(fn);
  return () => off(eventType, fn);
}

function off(eventType, fn) {
  const set = listeners.get(eventType);
  if (set) set.delete(fn);
}

function subscribeTask(taskId) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe_task', task_id: taskId }));
  }
}

function unsubscribeTask(taskId) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'unsubscribe_task', task_id: taskId }));
  }
}

function isConnected() {
  return socket?.readyState === WebSocket.OPEN;
}

export default {
  connect,
  disconnect,
  on,
  off,
  subscribeTask,
  unsubscribeTask,
  isConnected,
};
