// ============================================================
// MyJobsScreen — "Việc của tôi" CarePartner — KIẾN TRÚC 4 TAB VÒNG ĐỜI
// (Prompt v2 2026-09-13, thiết kế Google Stitch)
//   Tab 1 "Chờ xác nhận"  — awaiting_commitment: countdown thời gian thực,
//                           xác nhận cam kết / từ chối, hết hạn tự đồng bộ.
//   Tab 2 "Sắp làm"       — committed + in_progress (in_progress luôn trên
//                           cùng): liên hệ phụ huynh, chỉ đường, đổi giờ.
//   Tab 3 "Đã hoàn thành" — completed (+ awaiting_review): thu nhập vào ví.
//   Tab 4 "Lịch sử"       — audit log đầy đủ + việc legacy (TaskApplication).
// Nguyên tắc:
//   * KHÔNG custom bottom nav — FlatList paddingBottom 110 cho tab bar gốc.
//   * Countdown dùng 1 interval duy nhất, clearInterval khi unmount.
//   * Lỗi mạng khi commit/cancel: card giữ nguyên trạng thái (không optimistic
//     kẹt), Alert tiếng Việt tự nhiên.
//   * useSafeAreaInsets bọc try/catch an toàn cho Jest (không SafeAreaProvider).
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyJobsAsWorker } from '../../api/tasks';
import {
  getBookings, commitBooking, cancelBooking, requestReschedule, CANCEL_REASONS,
} from '../../api/matching';
import { checkConsent, triggerSOS, getSOSAlerts, resolveSOS } from '../../api/tracking';
import { startTracking, stopTracking, getCurrentTaskId } from '../../services/LocationService';
import NotificationBell from '../../components/NotificationBell';
import { getOnboardingStatus } from '../../api/matching';
import TrackingConsentModal from '../../components/TrackingConsentModal';
import ActiveTrackingBanner from '../../components/ActiveTrackingBanner';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

// ── Định nghĩa 4 tab (thứ tự cố định, không gộp) ──
const TABS = [
  { key: 'awaiting',  label: 'Chờ xác nhận',  icon: 'hourglass-outline' },
  { key: 'upcoming',  label: 'Sắp làm',       icon: 'calendar-outline' },
  { key: 'completed', label: 'Đã hoàn thành', icon: 'checkmark-done-outline' },
  { key: 'history',   label: 'Lịch sử',       icon: 'time-outline' },
];

// Alias tham số điều hướng từ BookingDetailScreen (Confirmation Jump)
const TAB_KEY_ALIASES = {
  awaiting: 'awaiting', upcoming: 'upcoming',
  completed: 'completed', history: 'history',
};

// ── Nhóm trạng thái Booking theo tab ──
const BOOKING_AWAITING = ['awaiting_commitment'];
const BOOKING_UPCOMING = ['committed', 'in_progress', 'reschedule_requested', 'suspected_no_show'];
const BOOKING_COMPLETED = ['completed', 'awaiting_review'];
// Tab 4 = audit log: MỌI trạng thái đã kết thúc (gồm cả completed).
// Lưu ý: Booking KHÔNG có trạng thái 'rejected' — ứng tuyển bị từ chối chỉ
// tồn tại ở luồng legacy TaskApplication (kind='legacy', status='rejected').
const BOOKING_ENDED = ['completed', 'awaiting_review', 'cancelled_by_carepartner',
  'cancelled_by_parent', 'no_show', 'no_show_unconfirmed', 'declined_in_window',
  'expired_no_response', 'disputed'];

const STATUS_STYLE = {
  awaiting_commitment:      { color: '#B45309', bg: '#FEF3C7', label: 'Chờ bạn xác nhận', icon: 'hourglass' },
  committed:                { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Đã cam kết', icon: 'checkmark-circle' },
  reschedule_requested:     { color: '#7C3AED', bg: '#EDE9FE', label: 'Đang xin đổi giờ', icon: 'swap-horizontal' },
  in_progress:              { color: '#0284C7', bg: '#E0F2FE', label: 'Đang làm', icon: 'play-circle' },
  suspected_no_show:        { color: '#B45309', bg: '#FEF3C7', label: 'Nghi ngờ không đến', icon: 'warning' },
  completed:                { color: COLORS.success, bg: '#ECFDF5', label: 'Hoàn thành', icon: 'checkmark-done-circle' },
  awaiting_review:          { color: '#0E7490', bg: '#CFFAFE', label: 'Chờ phụ huynh đánh giá', icon: 'star-half' },
  cancelled_by_carepartner: { color: COLORS.textMuted, bg: '#F3F4F6', label: 'Bạn đã từ chối nhận ca', icon: 'close-circle' },
  cancelled_by_parent:      { color: COLORS.textMuted, bg: '#F3F4F6', label: 'Phụ huynh đã hủy', icon: 'close-circle' },
  no_show:                  { color: '#B91C1C', bg: '#FEE2E2', label: 'Không đến làm', icon: 'warning' },
  no_show_unconfirmed:      { color: '#B45309', bg: '#FEF3C7', label: 'Chưa xác nhận vắng mặt', icon: 'warning' },
  declined_in_window:       { color: COLORS.textMuted, bg: '#F3F4F6', label: 'Bạn đã từ chối nhận ca', icon: 'close-circle' },
  expired_no_response:      { color: COLORS.textMuted, bg: '#F3F4F6', label: 'Đã hết hạn xác nhận', icon: 'time' },
  disputed:                 { color: '#B91C1C', bg: '#FEE2E2', label: 'Có tranh chấp', icon: 'warning' },
  // Legacy TaskApplication
  accepted:                 { color: COLORS.primary, bg: COLORS.primaryLight, label: 'Sắp làm', icon: 'calendar' },
  rejected:                 { color: COLORS.textMuted, bg: '#F3F4F6', label: 'Đã bị từ chối (ứng tuyển cũ)', icon: 'close-circle' },
};

// Ngưỡng chuyển màu cảnh báo countdown (< 10 phút)
const URGENT_THRESHOLD_SEC = 600;

const fmtVnd = (v) => {
  const n = parseInt(v || 0, 10);
  return `${n.toLocaleString('vi-VN')}đ`;
};

// "Còn 10 phút 10 giây để xác nhận" / "Còn 1 giờ 5 phút"
const formatCountdown = (total) => {
  if (!total || total <= 0) return 'Đã hết hạn';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút ${s} giây`;
};

const fmtDateTime = (iso) => {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return ''; }
};

// Khoảng cách gần đúng (Haversine, km) từ vị trí thiết bị tới địa điểm job
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
};

export default function MyJobsScreen() {
  // Task C (2026-09-14): onboarding gate — skills/lịch rảnh thiếu → banner
  // "Chưa khai kỹ năng/lịch rảnh thì hệ thống không thể giới thiệu việc".
  const [onboardingReady, setOnboardingReady] = useState(true);
  const [onboardingMsg, setOnboardingMsg] = useState('');
  const navigation = useNavigation();
  const route = useRoute();

  // Pattern an toàn cho Jest (không SafeAreaProvider trong test tree)
  let insets = { top: 12, bottom: 24, left: 0, right: 0 };
  try {
    const { useSafeAreaInsets } = require('react-native-safe-area-context'); // eslint-disable-line global-require
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch (_) {}

  // Confirmation Jump: initialTab + highlightBookingId từ BookingDetailScreen
  const initialTabParam = route.params?.initialTab;
  const [activeTab, setActiveTab] = useState(() => TAB_KEY_ALIASES[initialTabParam] || 'awaiting');
  const [highlightId, setHighlightId] = useState(
    () => (route.params?.highlightBookingId ? String(route.params.highlightBookingId) : null),
  );

  const [items, setItems] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all'); // all | done | cancelled | compensation
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef(null);

  // ── Countdown thời gian thực: 1 interval duy nhất cho toàn màn ──
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t); // tránh memory leak / warning unmounted
  }, []);

  // Highlight card 2 giây khi được điều hướng từ BookingDetail
  useEffect(() => {
    if (!highlightId) return undefined;
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightId]);

  // ── Tracking state (legacy Task — TaskApplication) ──
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [consentTask, setConsentTask] = useState(null);
  const [consentMap, setConsentMap] = useState({}); // {task_id: 'granted'|'denied'|'revoked'|null}
  const [trackingTaskId, setTrackingTaskId] = useState(null);

  // ── SOS state (legacy Task) ──
  const [sosModal, setSosModal] = useState(null); // { taskId, taskTitle }
  const [sosMessage, setSosMessage] = useState('');
  const [sosAlertsMap, setSosAlertsMap] = useState({});
  const [sosLoading, setSosLoading] = useState(false);

  // ── Commit / Reject state (Booking Flow 1) ──
  const [committingId, setCommittingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // item booking awaiting
  const [rejectReason, setRejectReason] = useState('school_schedule');
  const [rejectNote, setRejectNote] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // ── Đổi giờ (Step 9 Rule 3) ──
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const tomorrowStr = () => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  };
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleFrom, setRescheduleFrom] = useState('');
  const [rescheduleTo, setRescheduleTo] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // ── Toạ độ thiết bị (tính khoảng cách gần đúng tới địa điểm job) ──
  const [deviceCoords, setDeviceCoords] = useState(null);
  useEffect(() => {
    let mounted = true;
    try {
      const Location = require('expo-location'); // eslint-disable-line global-require
      if (!Location?.requestForegroundPermissionsAsync) return undefined;
      Location.requestForegroundPermissionsAsync()
        .then(({ status }) => {
          if (status !== 'granted' || !mounted) return;
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Balanced ?? 3 })
            .then((pos) => {
              if (mounted && pos?.coords?.latitude != null) {
                setDeviceCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    } catch (_) { /* môi trường test/web không có expo-location */ }
    return () => { mounted = false; };
  }, []);

  // ── Fetch dữ liệu: 2 nguồn (Booking Flow 1 + legacy TaskApplication) ──
  const fetchJobs = useCallback(async () => {
    try {
      const fetchedAtSec = Math.floor(Date.now() / 1000);
      const combined = [];

      // 1. Booking hệ thống ghép cặp Flow 1 — GIỮ TẤT CẢ trạng thái
      //    (trước đây awaiting_commitment bị bỏ qua → defect "không có nơi xử lý")
      const bookingTaskIds = new Set(); // N-003: task mirror của booking — lọc legacy trùng
      try {
        const bRes = await getBookings({ role: 'carepartner' });
        const bookingsList = bRes.data?.results ?? bRes.data ?? [];
        bookingsList.forEach((b) => {
          if (b.task_id != null && b.task_id !== '') bookingTaskIds.add(String(b.task_id));
          combined.push({
            id: `booking_${b.id}`,
            kind: 'booking',
            bookingId: b.id,
            status: b.status,
            status_label_vi: b.status_label_vi || '',
            title: b.job_title || 'Công việc ghép cặp',
            category_name_vi: b.category_name_vi || '',
            job_type: b.job_type || '',
            address: b.job_address || b.location_info?.address || 'Địa điểm theo thỏa thuận',
            location_info: b.location_info || null,
            first_slot: b.first_slot || null,
            parent_name: b.parent_name || b.parent_info?.full_name || 'Phụ huynh',
            parent_info: b.parent_info || null,
            total_value_vnd: b.total_value_vnd || 0,
            payout_vnd: b.carepartner_payout_vnd != null
              ? b.carepartner_payout_vnd
              : Math.round((b.total_value_vnd || 0) * 0.8),
            compensation_vnd: b.compensation_vnd || 0,
            seconds_left: typeof b.seconds_left === 'number' ? b.seconds_left : 0,
            ended_at: b.ended_at || null,
            cancelled_at: b.cancelled_at || null,
            fetchedAtSec,
          });
        });
      } catch (e) { console.warn('Lỗi tải bookings:', e); }

      // 2. Việc legacy (Task/TaskApplication) — giữ tương thích ngược.
      //    Bỏ qua application của Task mirror đã hiển thị qua booking Flow 1
      //    (task_id trùng booking.task_id) để không hiện 2 thẻ cho cùng ca.
      try {
        const res = await getMyJobsAsWorker();
        const appsList = res.data ?? [];
        (Array.isArray(appsList) ? appsList : appsList?.results ?? []).forEach((a) => {
          if (a.status === 'pending') return; // theo yêu cầu: bỏ ứng tuyển chờ duyệt
          if (a.task_id != null && bookingTaskIds.has(String(a.task_id))) return; // trùng mirror Flow 1
          combined.push({
            ...a,
            id: `legacy_${a.task_id || a.task || a.id}`,
            kind: 'legacy',
            taskId: a.task_id || a.task,
            status: a.status,
            task_title: a.task_title || 'Công việc',
            task_price: a.task_price || 0,
            fetchedAtSec,
          });
        });
      } catch (e) { console.warn('Lỗi tải applications:', e); }

      setItems(combined);

      // ⚡ Auto-stop tracking nếu task legacy đã completed/cancelled
      const currentTrackingTaskId = getCurrentTaskId();
      if (currentTrackingTaskId) {
        const trackingItem = combined.find((a) => a.kind === 'legacy' && a.taskId === currentTrackingTaskId);
        if (trackingItem) {
          const st = trackingItem.task_status;
          if (st && st !== 'in_progress') {
            await stopTracking();
            setTrackingTaskId(null);
            Alert.alert(
              'ⓘ Theo dõi vị trí đã dừng',
              `Công việc "${trackingItem.task_title}" đã ${st === 'completed' ? 'hoàn thành' : 'bị hủy'}. Theo dõi vị trí đã tự động dừng.`,
              [{ text: 'OK' }],
            );
          }
        }
      }

      // Check consent cho task legacy được accept
      const acceptedLegacy = combined.filter((a) => a.kind === 'legacy' && a.status === 'accepted' && a.taskId);
      const consents = {};
      await Promise.all(acceptedLegacy.map(async (app) => {
        try {
          const r = await checkConsent(app.taskId);
          const c = r.data?.consent?.consent || (r.data?.has_consent ? null : 'pending');
          consents[app.taskId] = c;
        } catch (e) { consents[app.taskId] = null; }
      }));
      setConsentMap(consents);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Task C: kiểm tra worker đã khai skill + lịch rảnh chưa (onboarding gate)
  useEffect(() => {
    let mounted = true;
    getOnboardingStatus()
      .then((resp) => {
        if (!mounted) return;
        setOnboardingReady(!!resp.data?.ready_for_matching);
        setOnboardingMsg(resp.data?.message_vi || '');
      })
      .catch(() => { /* pending/mạng lỗi — ẩn banner */ });
    return () => { mounted = false; };
  }, []);

  // ═══════════ PHÂN TAB & SẮP XẾP ═══════════
  const tabOf = useCallback((item) => {
    if (item.kind === 'booking') {
      if (BOOKING_AWAITING.includes(item.status)) return 'awaiting';
      if (BOOKING_UPCOMING.includes(item.status)) return 'upcoming';
      if (BOOKING_COMPLETED.includes(item.status)) return 'completed';
      if (BOOKING_ENDED.includes(item.status)) return 'history';
      return 'history'; // trạng thái lạ → audit log cho an toàn
    }
    // legacy
    if (item.status === 'rejected') return 'history';
    if (item.task_status === 'completed') return 'completed';
    return 'upcoming';
  }, []);

  const startTs = (item) => {
    const fs = item.first_slot;
    if (fs?.date) {
      const t = new Date(`${fs.date}T${String(fs.time_from || '00:00').slice(0, 8)}`).getTime();
      if (!isNaN(t)) return t;
    }
    const st = item.task_scheduled_time ? new Date(item.task_scheduled_time).getTime() : NaN;
    return isNaN(st) ? 0 : st;
  };

  const endTs = (item) => {
    const src = item.ended_at || item.cancelled_at
      || (item.first_slot?.date
        ? `${item.first_slot.date}T${String(item.first_slot.time_from || '00:00').slice(0, 8)}`
        : null);
    const t = src ? new Date(src).getTime() : NaN;
    return isNaN(t) ? 0 : t;
  };

  // Thời gian còn lại của cửa sổ cam kết (giây) — suy từ snapshot khi fetch
  const remainingSec = (item) => {
    if (item.kind !== 'booking' || item.status !== 'awaiting_commitment') return 0;
    return Math.max(0, (item.seconds_left || 0) - (nowSec - (item.fetchedAtSec || nowSec)));
  };

  const buildTab2List = useCallback((arr) => {
    // in_progress luôn ở đầu danh sách (việc đang xảy ra cần chú ý trước)
    const rank = (i) => {
      if (i.kind === 'booking' && i.status === 'in_progress') return 0;
      if (i.kind === 'booking') return 1;
      return 2; // legacy
    };
    return [...arr].sort((a, b) => rank(a) - rank(b) || startTs(a) - startTs(b));
  }, []);

  const filtered = (() => {
    const match = (i) => {
      const t = tabOf(i);
      if (activeTab === 'history') {
        // Tab 4 = audit log: MỌI thứ đã kết thúc (gồm cả completed)
        if (t === 'history' || t === 'completed') {
          if (historyFilter === 'done') return t === 'completed' || ['completed', 'awaiting_review'].includes(i.status);
          if (historyFilter === 'cancelled') {
            return ['cancelled_by_carepartner', 'cancelled_by_parent', 'declined_in_window',
              'expired_no_response', 'no_show', 'no_show_unconfirmed'].includes(i.status)
              || i.status === 'rejected';
          }
          if (historyFilter === 'compensation') return (i.compensation_vnd || 0) > 0;
          return true;
        }
        return false;
      }
      return t === activeTab;
    };
    const out = items.filter(match);
    if (activeTab === 'upcoming') return buildTab2List(out);
    if (activeTab === 'history') return [...out].sort((a, b) => endTs(b) - endTs(a)); // mới kết thúc trước
    return out;
  })();

  // Badge số đếm 4 tab — cập nhật NGAY khi state items đổi (không đợi refetch)
  const badgeCounts = (() => {
    const c = { awaiting: 0, upcoming: 0, completed: 0, history: 0 };
    items.forEach((i) => {
      const t = tabOf(i);
      if (t === 'completed') { c.completed += 1; c.history += 1; }
      else if (t === 'history') c.history += 1;
      else c[t] += 1;
    });
    return c;
  })();

  const totalEarned = items
    .filter((i) => (i.kind === 'booking' ? i.status === 'completed' : i.task_status === 'completed'))
    .reduce((sum, i) => sum + parseFloat((i.kind === 'booking' ? i.payout_vnd : i.task_price) || 0), 0);

  // Tự scroll tới card được highlight (Confirmation Jump)
  useEffect(() => {
    if (!highlightId || isLoading || activeTab !== 'upcoming' || filtered.length === 0) return;
    const idx = filtered.findIndex((i) => i.kind === 'booking' && String(i.bookingId) === String(highlightId));
    if (idx >= 0 && listRef.current) {
      const t = setTimeout(() => {
        try { listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 }); }
        catch (_) { /* item biến mất giữa chừng — bỏ qua */ }
      }, 250);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [highlightId, isLoading, activeTab, filtered.length]);

  // ═══════════ HẾT HẠN CAM KẾT: vô hiệu hoá nút + tự đồng bộ 4s sau ═══════════
  const expiryTimersRef = useRef([]);
  const expiryRefetchedRef = useRef(new Set());
  useEffect(() => {
    items.filter((i) => i.kind === 'booking'
      && i.status === 'awaiting_commitment'
      && remainingSec(i) <= 0
      && !expiryRefetchedRef.current.has(i.bookingId))
      .forEach((i) => {
        expiryRefetchedRef.current.add(String(i.bookingId));
        const t = setTimeout(() => {
          // Backend đã tự huỷ đơn khi hết hạn (lazy_commit_check) — đồng bộ lại
          expiryRefetchedRef.current.delete(String(i.bookingId));
          fetchJobs();
        }, 4000);
        expiryTimersRef.current.push(t);
      });
  }, [items, nowSec, fetchJobs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    expiryTimersRef.current.forEach(clearTimeout);
    expiryTimersRef.current = [];
  }, []);

  // ═══════════ XÁC NHẬN CAM KẾT (Tab 1 → Tab 2) ═══════════
  const handleCommit = async (item) => {
    if (committingId) return;
    setCommittingId(item.bookingId);
    try {
      await commitBooking(item.bookingId);
      // Cập nhật cục bộ NGAY (không đợi refetch toàn bộ): card chuyển tab 2
      setItems((prev) => prev.map((i) => (i.kind === 'booking' && String(i.bookingId) === String(item.bookingId)
        ? { ...i, status: 'committed', status_label_vi: 'Đã cam kết', seconds_left: 0 }
        : i)));
      setActiveTab('upcoming'); // tab active tự đổi sang "Sắp làm"
      Alert.alert('Thành công', 'Đã cam kết nhận đơn! Ca làm đã chuyển sang mục Sắp làm.');
    } catch (e) {
      // Card giữ nguyên ở Tab 1 (không optimistic-update kẹt)
      Alert.alert('Không thể xác nhận',
        e?.response?.data?.detail || 'Không thể xác nhận lúc này, vui lòng thử lại.');
    } finally {
      setCommittingId(null);
    }
  };

  // ═══════════ TỪ CHỐI NHẬN ĐƠN (modal lý do) ═══════════
  const openRejectModal = (item) => {
    setRejectReason('school_schedule');
    setRejectNote('');
    setRejectTarget(item);
  };

  const submitReject = async () => {
    if (!rejectTarget || rejectLoading) return;
    const reason = CANCEL_REASONS.find((r) => r.code === rejectReason);
    if (reason?.forceMajeure && rejectNote.trim().length > 0 && rejectNote.trim().length < 20) {
      Alert.alert('Lý do bất khả kháng', 'Cần ghi chú ít nhất 20 ký tự để minh bạch với phụ huynh.');
      return;
    }
    setRejectLoading(true);
    try {
      await cancelBooking(rejectTarget.bookingId, {
        reason_code: rejectReason, note: rejectNote.trim(), evidence: [],
      });
      const rejectedId = String(rejectTarget.bookingId);
      setItems((prev) => prev.map((i) => (i.kind === 'booking' && String(i.bookingId) === rejectedId
        ? { ...i, status: 'cancelled_by_carepartner', status_label_vi: 'Bạn đã từ chối nhận ca' }
        : i)));
      setRejectTarget(null);
      setRejectNote('');
      Alert.alert('Đã từ chối nhận đơn',
        'Hệ thống đã mở lại ca cho sinh viên khác mà không trừ điểm ELO. Bạn có thể xem lại đơn trong tab Lịch sử.');
    } catch (e) {
      Alert.alert('Không thể từ chối',
        e?.response?.data?.detail || 'Không thể từ chối lúc này, vui lòng thử lại.');
    } finally {
      setRejectLoading(false);
    }
  };

  // ═══════════ ĐỔI GIỜ (Tab 2 — committed) ═══════════
  const openRescheduleModal = (item) => {
    setRescheduleDate(tomorrowStr());
    setRescheduleFrom('17:00');
    setRescheduleTo('19:00');
    setRescheduleReason('');
    setRescheduleTarget(item);
  };

  const submitReschedule = async () => {
    if (!rescheduleTarget || rescheduleLoading) return;
    if (!rescheduleDate || !rescheduleFrom || !rescheduleTo) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập ngày và giờ mới (ví dụ 2026-09-20, 17:00 - 19:00).');
      return;
    }
    setRescheduleLoading(true);
    try {
      await requestReschedule(rescheduleTarget.bookingId, {
        date: rescheduleDate,
        time_from: rescheduleFrom,
        time_to: rescheduleTo,
        reason: rescheduleReason.trim(),
      });
      setRescheduleTarget(null);
      Alert.alert('Đã gửi yêu cầu', 'Phụ huynh sẽ nhận được yêu cầu đổi giờ của bạn và phản hồi trong thời hạn quy định.');
      fetchJobs();
    } catch (e) {
      Alert.alert('Không gửi được yêu cầu',
        e?.response?.data?.detail || 'Không gửi được yêu cầu đổi giờ, vui lòng thử lại.');
    } finally {
      setRescheduleLoading(false);
    }
  };

  // ═══════════ KẾT THÚC CA (booking in_progress) ═══════════
  const [completingId, setCompletingId] = useState(null);
  const handleComplete = async (item) => {
    if (completingId) return;
    setCompletingId(item.bookingId);
    try {
      await completeBooking(item.bookingId);
      setItems((prev) => prev.map((i) => (i.kind === 'booking' && String(i.bookingId) === String(item.bookingId)
        ? { ...i, status: 'awaiting_review', status_label_vi: 'Chờ phụ huynh đánh giá' }
        : i)));
      setActiveTab('completed');
      Alert.alert('Đã hoàn thành ca làm', 'Tiền công sẽ được giải ngân qua Escrow sau khi ca được xác nhận.');
    } catch (e) {
      Alert.alert('Không hoàn thành được',
        e?.response?.data?.detail || 'Không kết thúc được ca lúc này, vui lòng thử lại.');
    } finally {
      setCompletingId(null);
    }
  };

  // ═══════════ TRACKING (legacy Task) ═══════════
  const handleOpenConsent = (app) => { setConsentTask(app); setConsentModalVisible(true); };

  const handleConsentChoice = async (granted) => {
    setConsentModalVisible(false);
    if (!consentTask) return;
    const taskId = consentTask.taskId;
    setConsentMap((prev) => ({ ...prev, [taskId]: granted ? 'granted' : 'denied' }));
    if (granted) {
      const ok = await startTracking(taskId);
      if (ok) {
        setTrackingTaskId(taskId);
        Alert.alert('✅ Đã bật chia sẻ vị trí', 'Phụ huynh sẽ thấy vị trí của bạn khi đang làm việc.');
      } else {
        Alert.alert('⚠️ Không thể bật', 'Không có quyền truy cập vị trí. Vui lòng cấp quyền trong Settings.');
      }
    }
    setConsentTask(null);
  };

  const fetchSOSAlerts = async (taskId) => {
    try {
      const r = await getSOSAlerts(taskId);
      setSosAlertsMap((prev) => ({ ...prev, [taskId]: r.data || [] }));
    } catch (e) { console.error('fetchSOSAlerts error:', e); }
  };

  const handleTriggerSOS = async () => {
    if (!sosModal?.taskId) return;
    setSosLoading(true);
    try {
      let lat = null; let lng = null;
      try {
        const LocationService = await import('../../services/LocationService');
        const loc = LocationService.getCurrentLocation?.();
        if (loc) { lat = loc.latitude; lng = loc.longitude; }
      } catch (e) { /* ignore */ }
      await triggerSOS({
        task_id: sosModal.taskId, latitude: lat, longitude: lng, message: sosMessage.trim(),
      });
      Alert.alert('🆘 Đã gửi SOS', 'Phụ huynh đã nhận được cảnh báo khẩn cấp.');
      setSosModal(null);
      setSosMessage('');
      fetchSOSAlerts(sosModal.taskId);
    } catch (e) {
      Alert.alert('Lỗi', e?.response?.data?.error || 'Gửi SOS thất bại.');
    } finally { setSosLoading(false); }
  };

  const handleResolveSOS = async (sosId, taskId) => {
    try {
      await resolveSOS(sosId);
      Alert.alert('✅ Đã giải quyết', 'SOS đã được đánh dấu đã xử lý.');
      fetchSOSAlerts(taskId);
    } catch (e) { Alert.alert('Lỗi', 'Không thể giải quyết SOS.'); }
  };

  // ═══════════ CARD RENDERER ═══════════
  const openMaps = (item) => {
    const loc = item.location_info || {};
    let url;
    if (loc.latitude != null && loc.longitude != null) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || '')}`;
    }
    Linking.openURL(url).catch(() => Alert.alert('Lỗi', 'Không mở được bản đồ.'));
  };

  const slotTimeText = (item) => {
    const fs = item.first_slot;
    if (!fs) return 'Chưa có lịch cụ thể';
    const parts = [];
    if (fs.date_vi) parts.push(fs.date_vi);
    else if (fs.date) parts.push(fs.date);
    if (fs.time_from || fs.time_to) parts.push(`${String(fs.time_from || '').slice(0, 5)} - ${String(fs.time_to || '').slice(0, 5)}`);
    if (fs.day_of_week_vi) parts.unshift(fs.day_of_week_vi);
    return parts.join(' · ') || 'Chưa có lịch cụ thể';
  };

  const distanceText = (item) => {
    const loc = item.location_info || {};
    if (!deviceCoords || loc.latitude == null || loc.longitude == null) return '';
    const km = haversineKm(deviceCoords.lat, deviceCoords.lng, loc.latitude, loc.longitude);
    return `· cách bạn ~${km.toFixed(1)} km`;
  };

  const renderItem = ({ item }) => {
    const st = STATUS_STYLE[item.status] || STATUS_STYLE.rejected;
    const isHighlighted = item.kind === 'booking' && highlightId
      && String(item.bookingId) === String(highlightId);
    const distance = distanceText(item);

    // ═══ TAB 1 — ĐƠN CHỜ XÁC NHẬN ═══
    if (item.kind === 'booking' && item.status === 'awaiting_commitment') {
      const remaining = remainingSec(item);
      const expired = remaining <= 0;
      const urgent = !expired && remaining < URGENT_THRESHOLD_SEC;
      const isCommitting = String(committingId) === String(item.bookingId);
      return (
        <TouchableOpacity
          testID={isHighlighted ? `highlight-card-${item.bookingId}` : `booking-card-${item.bookingId}`}
          style={[styles.card, styles.cardAwaiting, isHighlighted && styles.cardHighlighted]}
          activeOpacity={0.95}
          onPress={() => navigation.navigate('BookingDetail', { bookingId: item.bookingId })}
        >
          {/* Countdown */}
          <View style={[styles.countdownBar, { backgroundColor: expired ? COLORS.errorBg : (urgent ? COLORS.errorBg : COLORS.warningBg) }]}>
            <Ionicons name={expired ? 'alert-circle' : 'hourglass'} size={15} color={expired ? COLORS.error : (urgent ? COLORS.error : '#B45309')} />
            {expired ? (
              <Text style={[styles.countdownText, { color: COLORS.error }]}>Đã hết hạn xác nhận</Text>
            ) : (
              <Text style={[styles.countdownText, { color: urgent ? COLORS.error : '#B45309' }]}>
                Còn {formatCountdown(remaining)} để xác nhận
              </Text>
            )}
          </View>

          <View style={styles.cardRow}>
            <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
              <Ionicons name={st.icon} size={20} color={st.color} />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardTop}>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                  <Text style={[styles.badgeText, { color: st.color }]}>{item.status_label_vi || st.label}</Text>
                </View>
                <Text style={styles.price}>{fmtVnd(item.payout_vnd)}</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <View style={styles.meta}>
                <Ionicons name="book-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{item.category_name_vi || 'Dịch vụ chăm sóc'} · {slotTimeText(item)}</Text>
              </View>
              <View style={styles.meta}>
                <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{item.address} {distance}</Text>
              </View>
            </View>
          </View>

          {/* Phụ huynh + badge xác minh + escrow */}
          <View style={styles.parentCard}>
            <View style={styles.parentAvatar}>
              <Text style={styles.parentAvatarText}>{item.parent_name?.[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.parentLabel}>Phụ huynh</Text>
              <View style={styles.parentNameRow}>
                <Text style={styles.parentName}>{item.parent_name}</Text>
                {item.parent_info?.is_verified ? (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={10} color="#0E7490" />
                    <Text style={styles.verifiedText}>CCCD đã xác minh</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.escrowBadge}>
              <Ionicons name="lock-closed" size={11} color="#B45309" />
              <Text style={styles.escrowText}>MoMo Escrow bảo đảm</Text>
            </View>
          </View>

          <Text style={styles.payoutHint}>Thu nhập ròng dự kiến: <Text style={styles.payoutValue}>{fmtVnd(item.payout_vnd)}</Text></Text>

          {/* 2 nút hành động */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.rejectBtn, expired && { opacity: 0.5 }]}
              disabled={expired || isCommitting}
              onPress={() => openRejectModal(item)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Từ chối đơn ${item.title}`}
            >
              <Ionicons name="close-circle-outline" size={16} color="#475569" />
              <Text style={styles.rejectBtnText}>Từ chối</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.commitBtn, (expired || isCommitting) && { opacity: 0.55 }]}
              disabled={expired || isCommitting}
              onPress={() => handleCommit(item)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Xác nhận cam kết đơn ${item.title}`}
            >
              {isCommitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.commitBtnText}>Xác nhận cam kết</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }

    // ═══ TAB 2 — SẮP LÀM (committed | in_progress) ═══
    if (item.kind === 'booking' && ['committed', 'in_progress', 'reschedule_requested', 'suspected_no_show'].includes(item.status)) {
      const isInProgress = item.status === 'in_progress';
      const isCompleting = String(completingId) === String(item.bookingId);
      const phone = item.parent_info?.phone || '';
      return (
        <TouchableOpacity
          testID={isHighlighted ? `highlight-card-${item.bookingId}` : `booking-card-${item.bookingId}`}
          style={[styles.card, isInProgress && styles.cardInProgress, isHighlighted && styles.cardHighlighted]}
          activeOpacity={0.95}
          onPress={() => navigation.navigate('BookingDetail', { bookingId: item.bookingId })}
        >
          {isInProgress && (
            <View style={styles.liveBanner}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBannerText}>Ca đang diễn ra — chúc bạn làm việc thuận lợi!</Text>
            </View>
          )}
          <View style={styles.cardRow}>
            <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
              <Ionicons name={st.icon} size={20} color={st.color} />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardTop}>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                  <Text style={[styles.badgeText, { color: st.color }]}>{item.status_label_vi || st.label}</Text>
                </View>
                <Text style={styles.price}>{fmtVnd(item.payout_vnd)}</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{slotTimeText(item)}</Text>
              </View>
              <View style={styles.meta}>
                <Ionicons name="location-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{item.address} {distance}</Text>
              </View>
            </View>
          </View>

          {/* Liên hệ phụ huynh — số thật sau khi cam kết */}
          {item.parent_info && (
            <View style={styles.parentCard}>
              <View style={styles.parentAvatar}>
                <Text style={styles.parentAvatarText}>{item.parent_name?.[0]?.toUpperCase() || 'P'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.parentLabel}>Phụ huynh</Text>
                <Text style={styles.parentName}>{item.parent_name}</Text>
                {phone ? <Text style={styles.parentPhone}>{phone}</Text> : null}
              </View>
              {phone ? (
                <View style={styles.contactRow}>
                  <TouchableOpacity
                    style={[styles.contactBtn, { backgroundColor: '#ECFDF5' }]}
                    onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel={`Gọi điện cho phụ huynh`}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="call" size={16} color={COLORS.success} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.contactBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => Linking.openURL(`sms:${phone}`).catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel={`Nhắn tin cho phụ huynh`}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="chatbubble" size={16} color="#2563EB" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          <View style={styles.actionRow}>
            {!isInProgress && (
              <TouchableOpacity style={styles.subActionBtn} onPress={() => openRescheduleModal(item)} activeOpacity={0.85}>
                <Ionicons name="swap-horizontal" size={15} color="#475569" />
                <Text style={styles.subActionText}>Báo bận / Đổi giờ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.detailActionBtn} onPress={() => navigation.navigate('BookingDetail', { bookingId: item.bookingId })} activeOpacity={0.85}>
              <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
              <Text style={styles.detailActionText}>Xem chi tiết ca làm</Text>
            </TouchableOpacity>
          </View>
          {isInProgress && (
            <TouchableOpacity
              style={[styles.commitBtn, { backgroundColor: '#0E9F6E', marginTop: 8 }]}
              disabled={isCompleting}
              onPress={() => handleComplete(item)}
              activeOpacity={0.85}
            >
              {isCompleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={16} color="#fff" />
                  <Text style={styles.commitBtnText}>Kết thúc ca & nhận tiền</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    }

    // ═══ TAB 3 — ĐÃ HOÀN THÀNH (booking) ═══
    if (item.kind === 'booking' && ['completed', 'awaiting_review'].includes(item.status)) {
      return (
        <TouchableOpacity
          testID={`booking-card-${item.bookingId}`}
          style={styles.card}
          activeOpacity={0.95}
          onPress={() => navigation.navigate('BookingDetail', { bookingId: item.bookingId })}
        >
          <View style={styles.cardRow}>
            <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
              <Ionicons name={st.icon} size={20} color={st.color} />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardTop}>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                  <Text style={[styles.badgeText, { color: st.color }]}>{item.status_label_vi || st.label}</Text>
                </View>
                <Text style={[styles.price, { color: COLORS.success }]}>{fmtVnd(item.payout_vnd)}</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <View style={styles.meta}>
                <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText}>
                  {item.ended_at ? `Hoàn thành lúc ${fmtDateTime(item.ended_at)}` : slotTimeText(item)}
                </Text>
              </View>
              {/* Đánh giá: booking payload chưa có review → hiển thị rõ, không để trống */}
              <View style={styles.meta}>
                <Ionicons name="star-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText}>Phụ huynh chưa đánh giá</Text>
              </View>
            </View>
          </View>
          <View style={styles.walletBadge}>
            <Ionicons name="wallet" size={13} color={COLORS.successDeep || COLORS.success} />
            <Text style={styles.walletText}>Tiền đã vào ví CarePartner · {fmtVnd(item.payout_vnd)}</Text>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.detailActionBtn} onPress={() => navigation.navigate('BookingDetail', { bookingId: item.bookingId })} activeOpacity={0.85}>
              <Ionicons name="receipt-outline" size={15} color={COLORS.primary} />
              <Text style={styles.detailActionText}>Xem biên lai ca làm</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    }

    // ═══ TAB 4 / legacy — LỊCH SỬ (audit log) ═══
    const isLegacy = item.kind === 'legacy';
    return (
      <TouchableOpacity
        testID={isLegacy ? `legacy-card-${item.taskId}` : `booking-card-${item.bookingId}`}
        style={styles.card}
        activeOpacity={0.95}
        onPress={() => {
          if (!isLegacy) navigation.navigate('BookingDetail', { bookingId: item.bookingId });
          else if (item.taskId) navigation.navigate('TaskDetail', { taskId: item.taskId });
        }}
      >
        <View style={styles.cardRow}>
          <View style={[styles.statusIcon, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={20} color={st.color} />
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardTop}>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <View style={[styles.badgeDot, { backgroundColor: st.color }]} />
                <Text style={[styles.badgeText, { color: st.color }]}>{item.status_label_vi || st.label}</Text>
              </View>
              <Text style={styles.price}>
                {(item.compensation_vnd || 0) > 0 ? `+${fmtVnd(item.compensation_vnd)}` : fmtVnd(item.kind === 'booking' ? item.payout_vnd : item.task_price)}
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>{item.kind === 'booking' ? item.title : item.task_title}</Text>
            <View style={styles.meta}>
              <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
              <Text style={styles.metaText}>
                {item.kind === 'booking'
                  ? (item.cancelled_at ? `${item.status_label_vi || st.label} · ${fmtDateTime(item.cancelled_at)}` : slotTimeText(item))
                  : (item.task_scheduled_time ? new Date(item.task_scheduled_time).toLocaleString('vi-VN') : 'Chưa có')}
              </Text>
            </View>
            {item.kind === 'booking' && (item.ended_at || item.cancelled_at) ? (
              <View style={styles.meta}>
                <Ionicons name="flag-outline" size={13} color={COLORS.textMuted} />
                <Text style={styles.metaText}>
                  Kết thúc: {fmtDateTime(item.ended_at || item.cancelled_at)}
                </Text>
              </View>
            ) : null}
            {(item.compensation_vnd || 0) > 0 && (
              <View style={styles.compensationBadge}>
                <Ionicons name="cash" size={12} color="#B45309" />
                <Text style={styles.compensationText}>Bồi thường: +{fmtVnd(item.compensation_vnd)}</Text>
              </View>
            )}
          </View>
        </View>
        {/* Kháng cáo ELO cho các đơn bị hủy / no-show */}
        {item.kind === 'booking' && ['cancelled_by_carepartner', 'no_show', 'no_show_unconfirmed', 'suspected_no_show'].includes(item.status) && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.appealBtn}
              onPress={() => navigation.navigate('Appeal', { bookingId: item.bookingId })}
              activeOpacity={0.85}
            >
              <Ionicons name="megaphone-outline" size={14} color="#B45309" />
              <Text style={styles.appealBtnText}>Kháng cáo ELO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.detailActionBtn} onPress={() => navigation.navigate('BookingDetail', { bookingId: item.bookingId })} activeOpacity={0.85}>
              <Text style={styles.detailActionText}>Chi tiết</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Việc legacy ĐANG HOẠT ĐỘNG (Sắp làm): nhật ký + chat + tracking + SOS */}
        {isLegacy && item.status === 'accepted' && item.task_status !== 'completed' && (
          <>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.detailActionBtn}
                onPress={() => navigation.navigate('CareDiaryForm', { taskId: item.taskId, taskTitle: item.task_title })}
                activeOpacity={0.85}
              >
                <Ionicons name="book-outline" size={15} color={COLORS.primary} />
                <Text style={styles.detailActionText}>Ghi nhật ký chăm sóc</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() => navigation.navigate('Chat', { taskId: item.taskId, taskTitle: item.task_title })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Nhắn tin với phụ huynh"
              >
                <Ionicons name="chatbubble-outline" size={15} color="#fff" />
                <Text style={styles.chatBtnText}>Nhắn tin với phụ huynh</Text>
              </TouchableOpacity>
            </View>
            {trackingTaskId === item.taskId ? (
              <ActiveTrackingBanner
                taskId={item.taskId}
                taskTitle={item.task_title}
                onStopped={() => {
                  setTrackingTaskId(null);
                  setConsentMap((prev) => ({ ...prev, [item.taskId]: 'revoked' }));
                }}
              />
            ) : consentMap[item.taskId] === 'granted' ? (
              <TouchableOpacity
                style={styles.trackingStartBtn}
                onPress={async () => {
                  const ok = await startTracking(item.taskId);
                  if (ok) setTrackingTaskId(item.taskId);
                  else Alert.alert('⚠️ Không thể bật', 'Không có quyền truy cập vị trí.');
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="play-circle" size={16} color={COLORS.success} />
                <Text style={styles.trackingStartText}>Bắt đầu chia sẻ vị trí</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.trackingStartBtn} onPress={() => handleOpenConsent(item)} activeOpacity={0.85}>
                <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                <Text style={styles.trackingStartText}>Đồng ý chia sẻ vị trí</Text>
              </TouchableOpacity>
            )}
            <View style={styles.sosRow}>
              <TouchableOpacity
                style={styles.sosBtn}
                onPress={() => {
                  setSosModal({ taskId: item.taskId, taskTitle: item.task_title });
                  fetchSOSAlerts(item.taskId);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="warning" size={16} color="#fff" />
                <Text style={styles.sosBtnText}>SOS khẩn cấp</Text>
              </TouchableOpacity>
              {sosAlertsMap[item.taskId]?.filter((a) => a.status === 'active').length > 0 && (
                <View style={styles.sosActiveBadge}>
                  <Ionicons name="alert-circle" size={11} color={COLORS.error} />
                  <Text style={styles.sosActiveText}>
                    {sosAlertsMap[item.taskId].filter((a) => a.status === 'active').length} SOS active
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
        {/* Việc legacy hoàn thành: nhật ký + chat 24h */}
        {isLegacy && item.task_status === 'completed' && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.detailActionBtn}
              onPress={() => navigation.navigate('CareDiaryForm', { taskId: item.taskId, taskTitle: item.task_title })}
              activeOpacity={0.85}
            >
              <Ionicons name="book-outline" size={15} color={COLORS.primary} />
              <Text style={styles.detailActionText}>Ghi nhật ký chăm sóc</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => navigation.navigate('Chat', { taskId: item.taskId, taskTitle: item.task_title })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Xem chat với phụ huynh (còn 24 giờ sau khi hoàn thành)"
            >
              <Ionicons name="chatbubble-outline" size={15} color="#fff" />
              <Text style={styles.chatBtnText}>Chat (24h)</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const emptyStates = {
    awaiting: {
      icon: 'hourglass-outline',
      title: 'Không có đơn nào chờ xác nhận',
      text: 'Khi phụ huynh chọn bạn cho một ca làm mới, đơn sẽ xuất hiện tại đây kèm thời gian đếm ngược để bạn xác nhận.',
    },
    upcoming: {
      icon: 'briefcase-outline',
      title: 'Chưa có ca làm sắp tới',
      text: 'Khi bạn bấm Xác nhận các đơn ở tab Chờ xác nhận, ca làm sẽ xuất hiện tại đây.',
    },
    completed: {
      icon: 'checkmark-done-outline',
      title: 'Chưa có ca nào hoàn thành',
      text: 'Các ca đã hoàn thành cùng thu nhập thực nhận sẽ được lưu tại đây.',
    },
    history: {
      icon: 'time-outline',
      title: 'Chưa có lịch sử công việc',
      text: 'Toàn bộ các ca đã hoàn thành, đã hủy hoặc đã từ chối sẽ hiển thị tại đây.',
    },
  };

  const HISTORY_FILTERS = [
    { key: 'all', label: 'Tất cả' },
    { key: 'done', label: 'Hoàn thành' },
    { key: 'cancelled', label: 'Đã hủy' },
    { key: 'compensation', label: 'Bồi thường' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.headerTitle}>Việc của tôi</Text>
        <View style={styles.headerRight}>
          <NotificationBell dark />
          {totalEarned > 0 && (
            <View style={styles.earningsBadge}>
              <Ionicons name="wallet-outline" size={14} color={COLORS.success} />
              <Text style={styles.earningsText}>{Math.round(totalEarned).toLocaleString('vi-VN')}đ</Text>
            </View>
          )}
        </View>
      </View>

      {/* Task C — banner onboarding khi thiếu skill / lịch rảnh */}
      {!onboardingReady && !!onboardingMsg && (
        <View style={styles.onboardingBanner}>
          <Ionicons name="warning" size={18} color="#B45309" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.onboardingTitle}>Hoàn thiện hồ sơ để nhận việc</Text>
            <Text style={styles.onboardingText}>{onboardingMsg}</Text>
            <TouchableOpacity
              style={styles.onboardingCta}
              onPress={() => navigation.navigate('MatchingAvailability')}
              activeOpacity={0.8}
            >
              <Text style={styles.onboardingCtaText}>Khai ngay</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 4 pill tab vòng đời — active nền #F26522 chữ trắng (Stitch) */}
      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = badgeCounts[tab.key] || 0;
          return (
            <TouchableOpacity
              key={tab.key}
              testID={`tab-${tab.key}`}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
            >
              <Ionicons name={tab.icon} size={14} color={isActive ? '#fff' : COLORS.textMuted} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
                {tab.label}
              </Text>
              <View testID={`tab-badge-${tab.key}`} style={[styles.tabBadge, isActive ? styles.tabBadgeActiveOn : styles.tabBadgeActiveOff]}>
                <Text style={[styles.tabBadgeText, isActive ? styles.tabBadgeTextOn : styles.tabBadgeTextOff]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Chip lọc nhanh — chỉ tab Lịch sử */}
      {activeTab === 'history' && (
        <View style={styles.filterRow}>
          {HISTORY_FILTERS.map((f) => {
            const on = historyFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, on && styles.filterChipOn]}
                onPress={() => setHistoryFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={(e) => {
            try { listRef.current?.scrollToOffset({ offset: 220 * e.index, animated: true }); } catch (_) {}
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchJobs(); }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={emptyStates[activeTab].icon} size={40} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>{emptyStates[activeTab].title}</Text>
              <Text style={styles.emptyText}>{emptyStates[activeTab].text}</Text>
            </View>
          }
        />
      )}

      {/* Tracking Consent Modal (legacy Task) */}
      <TrackingConsentModal
        visible={consentModalVisible}
        taskId={consentTask?.taskId}
        parentName={consentTask?.parent_username}
        taskTitle={consentTask?.task_title}
        onConsent={handleConsentChoice}
        onClose={() => setConsentModalVisible(false)}
      />

      {/* SOS Modal (legacy Task — booking chưa tích hợp tracking backend) */}
      <Modal visible={!!sosModal} transparent animationType="fade" onRequestClose={() => setSosModal(null)}>
        <View style={styles.sosOverlay}>
          <View style={styles.sosModalContent}>
            <View style={styles.sosModalHeader}>
              <Ionicons name="warning" size={28} color={COLORS.error} />
              <Text style={styles.sosModalTitle}>SOS Khẩn cấp</Text>
            </View>
            <Text style={styles.sosModalHint}>
              Gửi SOS cho phụ huynh về tình huống khẩn cấp. Vị trí hiện tại của bạn sẽ được gửi kèm (nếu đang bật tracking).
            </Text>
            {sosModal?.taskTitle && <Text style={styles.sosModalTask}>📋 {sosModal.taskTitle}</Text>}
            <Text style={styles.sosInputLabel}>Tin nhắn (tuỳ chọn):</Text>
            <TextInput
              style={styles.sosInput}
              value={sosMessage}
              onChangeText={setSosMessage}
              placeholder="VD: Gặp sự cố an toàn, cần phụ huynh liên hệ ngay..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <View style={styles.sosModalActions}>
              <TouchableOpacity style={styles.sosCancelBtn} onPress={() => setSosModal(null)}>
                <Text style={styles.sosCancelText}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sosSendBtn, sosLoading && { opacity: 0.6 }]}
                onPress={handleTriggerSOS}
                disabled={sosLoading}
              >
                {sosLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={14} color="#fff" />
                    <Text style={styles.sosSendText}>Gửi SOS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal lý do từ chối (Tab 1) */}
      <Modal visible={!!rejectTarget} transparent animationType="slide" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Chọn lý do từ chối đơn</Text>
              <TouchableOpacity onPress={() => setRejectTarget(null)} accessibilityLabel="Đóng">
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtext}>
              Đơn sẽ được hệ thống chuyển tự động cho bạn khác. Vì từ chối trước hạn quy định, bạn{' '}
              <Text style={{ color: COLORS.success, fontWeight: '700' }}>không bị trừ điểm uy tín ELO</Text>.
            </Text>
            <ScrollViewTO maxHeight={230}>
              {CANCEL_REASONS.map((r) => {
                const on = rejectReason === r.code;
                return (
                  <TouchableOpacity
                    key={r.code}
                    style={[styles.reasonCard, on && styles.reasonCardOn]}
                    onPress={() => setRejectReason(r.code)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.radioCircle, on && styles.radioCircleOn]}>
                      {on && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.reasonLabel, on && { color: COLORS.primary, fontWeight: '700' }]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollViewTO>
            <TextInput
              style={styles.sheetNoteInput}
              placeholder="Ghi chú thêm (bắt buộc ≥ 20 ký tự với lý do bất khả kháng)..."
              value={rejectNote}
              onChangeText={setRejectNote}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetBackBtn} onPress={() => setRejectTarget(null)}>
                <Text style={styles.sheetBackText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetSubmitBtn, rejectLoading && { opacity: 0.6 }]} onPress={submitReject} disabled={rejectLoading}>
                {rejectLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={styles.sheetSubmitText}>Xác nhận từ chối</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal báo bận / đổi giờ (Tab 2) */}
      <Modal visible={!!rescheduleTarget} transparent animationType="slide" onRequestClose={() => setRescheduleTarget(null)}>
        <View style={styles.sheetOverlay}>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeaderRow}>
              <Text style={styles.sheetTitle}>Báo bận / Xin đổi giờ</Text>
              <TouchableOpacity onPress={() => setRescheduleTarget(null)} accessibilityLabel="Đóng">
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetSubtext}>
              Phụ huynh sẽ nhận được yêu cầu và phản hồi trong thời hạn quy định (tối đa 2 lần/đơn).
            </Text>
            <Text style={styles.fieldLabel}>Ngày mới (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.sheetInput}
              value={rescheduleDate}
              onChangeText={setRescheduleDate}
              placeholder="2026-09-20"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Từ (HH:MM)</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={rescheduleFrom}
                  onChangeText={setRescheduleFrom}
                  placeholder="17:00"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Đến (HH:MM)</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={rescheduleTo}
                  onChangeText={setRescheduleTo}
                  placeholder="19:00"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Lý do</Text>
            <TextInput
              style={[styles.sheetInput, { minHeight: 70 }]}
              value={rescheduleReason}
              onChangeText={setRescheduleReason}
              placeholder="VD: Trùng lịch học đột xuất, mong phụ huynh thông cảm..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetBackBtn} onPress={() => setRescheduleTarget(null)}>
                <Text style={styles.sheetBackText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetSubmitBtn, rescheduleLoading && { opacity: 0.6 }]} onPress={submitReschedule} disabled={rescheduleLoading}>
                {rescheduleLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={styles.sheetSubmitText}>Gửi yêu cầu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ScrollView bọc try/catch an toàn cho test (tránh cảnh báo nesting)
function ScrollViewTO({ children, maxHeight }) {
  const { ScrollView } = require('react-native'); // eslint-disable-line global-require
  return <ScrollView style={{ maxHeight }}>{children}</ScrollView>;
}

const styles = StyleSheet.create({
  onboardingBanner: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  onboardingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  onboardingText: {
    marginTop: 2,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  onboardingCta: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#F26522',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  onboardingCtaText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14, backgroundColor: COLORS.surface,
  },
  headerTitle: { ...TYPO.h1, fontSize: 24, color: COLORS.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SIZES.sm },
  earningsBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: COLORS.successBg, borderRadius: SIZES.radiusXl,
    paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#bbf7d0',
    ...SHADOWS.small,
  },
  earningsText: { ...TYPO.buttonSmall, color: COLORS.success },
  // ── 4 pill tab ──
  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    paddingHorizontal: 10, paddingBottom: 12, gap: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, flexDirection: 'row', gap: 4,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: 'transparent',
  },
  tabActive: { backgroundColor: COLORS.primary, ...SHADOWS.small },
  tabText: { ...TYPO.caption, color: COLORS.textMuted, fontSize: 11 },
  tabTextActive: { color: '#fff', fontWeight: '800' },
  tabBadge: {
    minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActiveOn: { backgroundColor: '#fff' },
  tabBadgeActiveOff: { backgroundColor: '#E2E8F0' },
  tabBadgeText: { fontSize: 9, fontWeight: '800' },
  tabBadgeTextOn: { color: COLORS.primary },
  tabBadgeTextOff: { color: '#64748B' },
  // ── Filter chips (Lịch sử) ──
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SIZES.md, paddingTop: 10 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipOn: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primarySoft },
  filterChipText: { ...TYPO.overline, color: COLORS.textSecondary },
  filterChipTextOn: { color: COLORS.primary },
  // ── List & card ──
  list: { padding: SIZES.md, gap: 12, paddingBottom: 110 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 10,
    ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardAwaiting: { borderLeftColor: '#F59E0B' },
  cardInProgress: { borderLeftColor: '#0284C7', borderWidth: 1.5, borderColor: '#7DD3FC' },
  cardHighlighted: { borderWidth: 2, borderColor: COLORS.primary, backgroundColor: '#FFF8F3' },
  countdownBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: SIZES.radiusSm,
  },
  countdownText: { ...TYPO.caption, fontWeight: '800', flex: 1 },
  cardRow: { flexDirection: 'row', gap: 12 },
  statusIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  cardContent: { flex: 1, gap: 5 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    borderRadius: SIZES.radiusXs, paddingHorizontal: 8, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { ...TYPO.overline },
  price: { ...TYPO.h4, fontWeight: '900', color: COLORS.primary },
  title: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { ...TYPO.bodySmall, color: COLORS.textSecondary, flex: 1 },
  parentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm,
    padding: 10, ...SHADOWS.small, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  parentAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  parentAvatarText: { color: '#fff', ...TYPO.buttonSmall },
  parentLabel: { ...TYPO.overline, color: COLORS.textMuted, fontWeight: '600' },
  parentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  parentName: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  parentPhone: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontWeight: '700' },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#CFFAFE', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedText: { fontSize: 9, fontWeight: '800', color: '#0E7490' },
  escrowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  escrowText: { fontSize: 9, fontWeight: '800', color: '#B45309' },
  payoutHint: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  payoutValue: { ...TYPO.caption, color: COLORS.primary, fontWeight: '800' },
  walletBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.successBg, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#bbf7d0',
  },
  walletText: { ...TYPO.caption, color: COLORS.successDeep || COLORS.success },
  compensationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#FDE68A',
  },
  compensationText: { fontSize: 10, fontWeight: '800', color: '#B45309' },
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderRadius: SIZES.radiusSm,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1.5, borderColor: '#6EE7B7',
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#10B981' },
  liveBannerText: { ...TYPO.caption, color: '#065F46', flex: 1 },
  // ── Nút hành động ──
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: SIZES.radiusSm,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  rejectBtnText: { ...TYPO.buttonSmall, color: '#475569' },
  commitBtn: {
    flex: 1.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primary, ...SHADOWS.small,
  },
  commitBtnText: { ...TYPO.buttonSmall, color: '#fff', fontWeight: '800' },
  subActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  subActionText: { ...TYPO.buttonSmall, color: '#475569', fontSize: 12 },
  detailActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  detailActionText: { ...TYPO.buttonSmall, color: COLORS.primary, fontSize: 12 },
  appealBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A',
  },
  appealBtnText: { ...TYPO.caption, color: '#B45309', fontWeight: '700' },
  chatBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: SIZES.radiusSm, backgroundColor: '#3B82F6',
  },
  chatBtnText: { ...TYPO.buttonSmall, color: '#fff', fontSize: 12 },
  contactRow: { flexDirection: 'row', gap: 8 },
  contactBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // ── Tracking / SOS (legacy) ──
  trackingStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  trackingStartText: { ...TYPO.buttonSmall, color: COLORS.primary, fontWeight: '700' },
  sosRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sosBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.error, borderRadius: SIZES.radiusSm, paddingVertical: 10,
    ...SHADOWS.small,
  },
  sosBtnText: { color: '#fff', ...TYPO.buttonSmall, fontWeight: '800' },
  sosActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.errorBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#fecaca',
  },
  sosActiveText: { ...TYPO.overline, color: COLORS.error, fontWeight: '800', fontSize: 9 },
  sosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sosModalContent: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg, padding: 20, ...SHADOWS.large },
  sosModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  sosModalTitle: { ...TYPO.h4, color: COLORS.error, fontWeight: '800' },
  sosModalHint: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 12 },
  sosModalTask: {
    ...TYPO.bodySmall, color: COLORS.textPrimary, fontWeight: '700',
    backgroundColor: COLORS.background, padding: 8, borderRadius: SIZES.radiusSm, marginBottom: 12,
  },
  sosInputLabel: { ...TYPO.buttonSmall, color: COLORS.textSecondary, marginBottom: 4 },
  sosInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, ...TYPO.body, color: COLORS.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
  },
  sosModalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  sosCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background },
  sosCancelText: { ...TYPO.button, color: COLORS.textSecondary },
  sosSendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.error, ...SHADOWS.small,
  },
  sosSendText: { ...TYPO.button, color: '#fff', fontWeight: '800' },
  // ── Bottom sheet (từ chối / đổi giờ) ──
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 30,
  },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sheetTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  sheetSubtext: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 12 },
  reasonCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8, backgroundColor: '#fff',
  },
  reasonCardOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleOn: { borderColor: COLORS.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  reasonLabel: { ...TYPO.bodySmall, color: COLORS.textPrimary, flex: 1 },
  sheetNoteInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, ...TYPO.body, color: COLORS.textPrimary,
    minHeight: 70, textAlignVertical: 'top', marginTop: 4,
  },
  sheetInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radiusSm,
    paddingHorizontal: 12, paddingVertical: 10, ...TYPO.body, color: COLORS.textPrimary,
  },
  fieldLabel: { ...TYPO.caption, color: COLORS.textSecondary, marginTop: 10, marginBottom: 4 },
  timeRow: { flexDirection: 'row', gap: 10 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetBackBtn: {
    flex: 1, paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background, alignItems: 'center',
  },
  sheetBackText: { ...TYPO.button, color: COLORS.textSecondary },
  sheetSubmitBtn: {
    flex: 1.4, paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primary, alignItems: 'center', ...SHADOWS.small,
  },
  sheetSubmitText: { ...TYPO.button, color: '#fff', fontWeight: '800' },
  // ── Empty state ──
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 30 },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary, textAlign: 'center' },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center' },
});





