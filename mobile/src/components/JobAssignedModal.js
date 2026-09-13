// ============================================================
// JobAssignedModal — Task F (2026-09-14): popup TOÀN MÀN HÌNH "Bạn có đơn mới"
// cho CarePartner, luôn kêu + hiện khi có đơn awaiting_commitment.
//
// Nguồn tín hiệu (kép — phòng miss push):
//   1. Push notification type='job_assigned' (Expo) khi app foreground/background.
//   2. Poll GET /api/matching/bookings/?status=awaiting_commitment MỖI 15s
//      khi app mở (worker đã login) — polling bù khi push bị mất/chậm.
//
// Nút: [Xác nhận cam kết] [Chi tiết] [Từ chối]
//   - Xác nhận → POST /api/matching/bookings/<id>/commit/ → committed.
//   - Chi tiết → navigate('BookingDetail', { bookingId }).
//   - Từ chối  → POST .../cancel/ (reason_code personal — declined_in_window,
//     hệ thống tự mở khóa + đề xuất người khác cho phụ huynh).
//
// Chuông: phát critical_alert.wav local cho MỌI đơn mới (foreground Android
// không tự phát sound notification) — giữ hành vi của NotificationListener.
// Mount 1 lần trong App.js (AppContent — trong AuthProvider).
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as AV from 'expo-av';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { getBookings, commitBooking, cancelBooking } from '../api/matching';
import { getBookingDetail } from '../api/matching';
import { COLORS } from '../theme/colors';

const POLL_INTERVAL_MS = 15000; // 15s — phòng miss push
const CRITICAL_SOUND = require('../../assets/sounds/critical_alert.wav');

function formatMoney(v) {
  const n = parseInt(v, 10) || 0;
  try {
    return `${new Intl.NumberFormat('vi-VN').format(n)}đ`;
  } catch (e) {
    return `${n}đ`;
  }
}

function slotText(booking) {
  const fs = booking?.first_slot;
  if (!fs || !fs.date) return 'Theo thỏa thuận';
  const t = fs.time_from ? String(fs.time_from).slice(0, 5) : '';
  const t2 = fs.time_to ? ` – ${String(fs.time_to).slice(0, 5)}` : '';
  return `${fs.date}${t ? ` · ${t}${t2}` : ''}`;
}

export default function JobAssignedModal() {
  const { user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState('');
  const soundRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const seenIds = useRef({});

  const isWorker = user?.role === 'worker';

  const playLoud = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        await Haptics.vibrateAsync([0, 500, 300, 500, 300, 500]);
      }
      await soundRef.current?.replayAsync();
    } catch { /* im lặng — modal vẫn hiện */ }
  }, []);

  const openBooking = useCallback(async (bookingId) => {
    if (!bookingId) return;
    seenIds.current[bookingId] = true;
    try {
      const resp = await getBookingDetail(bookingId);
      setBooking(resp.data);
    } catch (e) {
      // Chi tiết lỗi — vẫn hiện modal tối thiểu với id
      setBooking({ id: bookingId });
    }
    playLoud();
  }, [playLoud]);

  // Poll danh sách đơn chờ cam kết mỗi 15s khi app mở (worker login)
  useEffect(() => {
    if (!isWorker) return undefined;
    let cancelled = false;
    const poll = async () => {
      const appStateNow = AppState?.currentState ?? 'active';
      if (cancelled || appStateNow !== 'active') return;
      try {
        const resp = await getBookings({ role: 'worker', status: 'awaiting_commitment' });
        const rows = Array.isArray(resp.data) ? resp.data : (resp.data?.results || []);
        // Task F: bẤT KỲ đơn awaiting chưa xem (kể cả lúc mở app — phòng
        // miss push) → popup + chuông. seenIds chống hiện lại sau commit/decline.
        const fresh = rows.find((b) => !seenIds.current[b.id]);
        if (fresh) {
          await openBooking(fresh.id);
          return;
        }
        rows.forEach((b) => { seenIds.current[b.id] = true; });
      } catch (e) { /* 403 pending / mạng lỗi — poll sau */ }
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isWorker, openBooking]);

  // Push notification job_assigned → mở modal ngay (kể cả vừa foreground)
  useEffect(() => {
    if (!isWorker) return undefined;
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request?.content?.data || {};
      if (data.type === 'job_assigned' && data.booking_id) {
        openBooking(data.booking_id);
      }
    });
    const response = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification?.request?.content?.data || {};
      if (data.type === 'job_assigned' && data.booking_id) {
        openBooking(data.booking_id);
      }
    });
    return () => {
      received?.remove?.();
      response?.remove?.();
    };
  }, [isWorker, openBooking]);

  // Sound preload + AppState tracking
  useEffect(() => {
    (async () => {
      try {
        const { sound } = await AV.Audio.Sound.createAsync(CRITICAL_SOUND, {
          shouldPlay: false, volume: 1.0, isLooping: false,
        });
        soundRef.current = sound;
      } catch { /* web/môi trường không có asset */ }
    })();
    const sub = AppState.addEventListener('change', (state) => {
      appState.current = state;
    });
    return () => {
      sub?.remove?.();
      soundRef.current?.unloadAsync?.();
    };
  }, []);

  const handleCommit = async () => {
    if (!booking || busy) return;
    setBusy('commit');
    try {
      await commitBooking(booking.id);
      seenIds.current[booking.id] = true;
      setBooking(null);
      // Popup xác nhận nhẹ — user thấy tab "Việc của tôi" đã committed
      // (thông báo push booking_committed cũng đã bay từ backend).
    } catch (e) {
      const detail = e?.response?.data?.detail;
      // Hết giờ / bị người khác giữ → đóng popup, danh sách poll sẽ tự cập nhật
      if (detail) console.warn('[JobAssignedModal] commit:', detail);
    } finally {
      setBusy('');
    }
  };

  const handleDecline = async () => {
    if (!booking || busy) return;
    setBusy('decline');
    try {
      await cancelBooking(booking.id, {
        reason_code: 'personal',
        note: 'Từ chối trong cửa sổ cam kết',
      });
    } catch (e) { /* idempotent — hết hạn thì backend tự xử */ }
    seenIds.current[booking.id] = true;
    setBooking(null);
    setBusy('');
  };

  const handleDetail = () => {
    const id = booking?.id;
    setBooking(null);
    if (!id) return;
    // Navigate qua root navigator (BookingDetail có trong mọi stack role)
    try {
      // eslint-disable-next-line global-require
      const { getRootNavigator } = require('../navigation/RootNavigation');
      getRootNavigator()?.navigate('BookingDetail', { bookingId: id });
    } catch (e) { /* navigator chưa sẵn sàng */ }
  };

  if (!isWorker || !booking) return null;

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={() => { /* không đóng bằng back trong lúc đang có đơn */ }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications" size={34} color="#fff" />
            </View>
            <Text style={styles.title}>Bạn có đơn mới</Text>
            <Text style={styles.subtitle}>Phụ huynh đã chọn bạn — xác nhận ngay!</Text>
          </View>

          <View style={styles.body}>
            {!!booking.job_title && <Text style={styles.lineTitle}>{booking.job_title}</Text>}
            {!!booking.parent_name && (
              <Text style={styles.line}>👤 Phụ huynh {booking.parent_name}</Text>
            )}
            <Text style={styles.line}>🕒 {slotText(booking)}</Text>
            {!!booking.job_address && (
              <Text style={styles.line} numberOfLines={2}>📍 {booking.job_address}</Text>
            )}
            {!!booking.total_value_vnd && (
              <Text style={styles.money}>💰 {formatMoney(booking.total_value_vnd)}</Text>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleCommit}
              disabled={!!busy}
              activeOpacity={0.85}
            >
              <Text style={styles.btnPrimaryText}>
                {busy === 'commit' ? 'Đang xác nhận...' : 'Xác nhận cam kết'}
              </Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={handleDetail}
                disabled={!!busy}
              >
                <Text style={styles.btnGhostText}>Chi tiết</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={handleDecline}
                disabled={!!busy}
              >
                <Text style={[styles.btnGhostText, { color: '#EF4444' }]}>
                  {busy === 'decline' ? 'Đang gửi...' : 'Từ chối'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 20,
    backgroundColor: '#F26522',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  lineTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.onSurface || '#0F172A',
    marginBottom: 6,
  },
  line: {
    fontSize: 14,
    color: '#334155',
    marginTop: 4,
  },
  money: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#F26522',
  },
  actions: {
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#F26522',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  btnGhost: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
  },
  btnGhostText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
});
