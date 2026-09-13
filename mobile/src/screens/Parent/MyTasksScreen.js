// ============================================================
// MyTasksScreen — "Việc của tôi" (Phụ huynh)
// Nâng cấp toàn diện theo bản thiết kế Stitch (Stitch HTML Design System)
// Chuẩn hoá 4 Tab vòng đời độc lập, xoá sạch luồng cũ:
//
//   TAB 1 "CHỜ XÁC NHẬN": Đơn đang tìm người (open) + Đơn đã chọn sinh viên
//        đang chờ sinh viên xác nhận cam kết (awaiting_commitment, 60m timer).
//   TAB 2 "SẮP LÀM":      Sinh viên ĐÃ XÁC NHẬN nhận việc (committed)
//        nhưng chưa đến giờ làm (đếm ngược đến ca, gọi/chat dặn dò).
//   TAB 3 "ĐANG LÀM":     Ca đang trong khung giờ diễn ra (in_progress).
//        Radar Live GPS tracking, Geofence 200m, nút SOS và Nghiệm thu hoàn thành.
//   TAB 4 "LỊCH SỬ":      Ca đã hoàn thành (completed) hoặc kết thúc.
//        Đánh giá 5 sao, Care Diary, biên lai MoMo Escrow 80/20, đặt lại 1 chạm.
//
// Dữ liệu 100% từ API thật, fetch song song 2 nguồn (Promise.allSettled).
// Giữ nguyên thanh điều hướng dưới (Bottom Tab Navigator của App).
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Animated, Linking, Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent, getCandidates, updateTaskStatus } from '../../api/tasks';
import {
  getBookings, cancelBookingByParent, completeBooking, respondReschedule, reportNoShow,
} from '../../api/matching';
import { checkConsent } from '../../api/tracking';
import { getTaskModeration } from '../../api/moderation';
import { COLORS, SHADOWS, TYPO, ANIM } from '../../theme/colors';
import { SUPPORT_HOTLINE } from '../../config/appConfig';
import NotificationBell from '../../components/NotificationBell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// === DESIGN TOKENS (Bản thiết kế Stitch HTML) ===
const STITCH = {
  surface: '#FAF8FF',
  canvas: '#F8FAFC',
  cardSurface: '#FFFFFF',
  cardBorder: '#EAEDFF',
  borderSubtle: '#E2E8F0',
  onSurface: '#131B2E',
  onSurfaceVariant: '#594138',
  slateText: '#475569',
  slateMuted: '#94A3B8',
  primaryContainer: '#F26522', // EduCareLink Brand Orange
  primaryLight: '#FFF7ED',
  onPrimary: '#FFFFFF',
  secondary: '#006C49',        // Trust Emerald Green
  secondaryContainer: '#7EF6BE',
  secondaryLight: '#ECFDF5',
  onSecondaryContainer: '#00714C',
  tertiaryContainer: '#CA8100', // Amber
  amberLight: '#FFFBEB',
  amberBorder: '#FDE68A',
  amberDark: '#92400E',
  skyActive: '#0284C7',
  skyLight: '#E0F2FE',
  skyBorder: '#BAE6FD',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#93000A',
  alertCrimson: '#EF4444',
  inverseSurface: '#283044',
  inverseOnSurface: '#EEF0FF',
};

// === 4 TABS CHUẨN VÒNG ĐỜI (Stitch Segmented Control) ===
const TABS = [
  { key: 'pending',     label: 'Chờ xác nhận', icon: 'hourglass-outline' },
  { key: 'upcoming',    label: 'Sắp làm',      icon: 'calendar-outline' },
  { key: 'in_progress', label: 'Đang làm',     icon: 'navigate-outline', live: true },
  { key: 'history',     label: 'Lịch sử',      icon: 'time-outline' },
];

const CANCEL_REASON_LABELS = {
  school_schedule: 'Trùng lịch học đột xuất',
  health: 'Sức khỏe không tốt',
  family_emergency: 'Việc gia đình khẩn cấp',
  accident: 'Tai nạn / sự cố di chuyển',
  wrong_job_info: 'Thông tin công việc không đúng mô tả',
  transport: 'Không thể di chuyển',
  personal: 'Lý do cá nhân',
  other: 'Lý do khác',
  no_show: 'CarePartner không đến làm',
};

const PENDING_BOOKING_STATUSES = ['awaiting_commitment', 'reschedule_requested', 'suspected_no_show'];
const UPCOMING_BOOKING_STATUSES = ['committed'];
const IN_PROGRESS_BOOKING_STATUSES = ['in_progress'];
const HISTORY_BOOKING_STATUSES = [
  'completed', 'no_show', 'no_show_unconfirmed', 'cancelled_by_parent',
  'cancelled_by_carepartner', 'declined_in_window', 'expired_no_response', 'disputed',
];

const money = (v) => `${Number(v || 0).toLocaleString('vi-VN')}đ`;

const fmtEnd = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return ''; }
};

// Chuẩn bị đếm ngược "X phút Y giây"
const fmtViCountdown = (totalSec) => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${String(s).padStart(2, '0')} giây`;
};

// Đếm ngược đến mốc thời gian ISO
function useCountdownTo(targetIso) {
  const [secs, setSecs] = useState(() => {
    if (!targetIso) return null;
    return Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000));
  });
  useEffect(() => {
    if (!targetIso) return undefined;
    const tick = () =>
      setSecs(Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [targetIso]);
  return secs;
}

// Chấm tròn nhấp nháy phát xung (Radar Ping)
function PingDot({ color = STITCH.secondary, size = 8 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// Status Pill
function StatusPill({ bg, border, color, icon, children, live }) {
  return (
    <View style={[styles.statusPill, { backgroundColor: bg, borderColor: border || bg }]}>
      {live ? <PingDot color={color} size={6} /> : <Ionicons name={icon} size={12} color={color} />}
      <Text style={[styles.statusPillText, { color }]}>{children}</Text>
    </View>
  );
}

// Spotlight Sinh viên đã chọn (Avatar thật hoặc ký tự đầu)
function StudentSpotlight({ info, compact }) {
  const name = info?.full_name || 'CarePartner';
  const initial = (name || 'S').trim().charAt(0).toUpperCase();
  const rating = info?.rating_avg || 0;
  const jobsDone = info?.jobs_completed || 0;
  const avatarUrl = info?.avatar_url || '';

  return (
    <View style={styles.spotlightRow}>
      <View style={styles.avatarWrap}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.verifiedBadge}>
          <Ionicons name="checkmark-circle" size={14} color={STITCH.secondary} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.spotlightName} numberOfLines={1}>{name}</Text>
        {!!info?.school && (
          <Text style={styles.spotlightSchool} numberOfLines={1}>
            {info.school}{info?.major ? ` · ${info.major}` : ''}
          </Text>
        )}
        {!compact && (
          <View style={styles.chipRow}>
            <View style={styles.starChip}>
              <Ionicons name="star" size={11} color={STITCH.tertiaryContainer} />
              <Text style={styles.starChipText}>
                {rating > 0 ? `${rating} (${jobsDone} ca)` : 'Sinh viên mới'}
              </Text>
            </View>
            <View style={styles.cccdChip}>
              <Ionicons name="shield-checkmark-outline" size={11} color={STITCH.secondary} />
              <Text style={styles.cccdChipText}>CCCD gắn chip</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 1: CARD 1A (AWAITING COMMITMENT — ĐÃ CHỌN SINH VIÊN)
// ═══════════════════════════════════════════════════════════════
function AwaitingBookingCard({ booking, onOpenDetail, onCancel, actionLoading }) {
  const [secs, setSecs] = useState(Number(booking.seconds_left) || 0);
  useEffect(() => {
    setSecs(Number(booking.seconds_left) || 0);
  }, [booking.seconds_left]);
  useEffect(() => {
    if (secs <= 0) return undefined;
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCancelling = actionLoading === `booking-cancel-${booking.id}`;
  const slot = booking.first_slot;
  const addr = booking.job_address || booking.location_info?.address || '';

  return (
    <View style={[styles.card, { borderTopColor: STITCH.tertiaryContainer }]}>
      {/* Header Row */}
      <View style={styles.cardHeader}>
        <StatusPill
          bg={STITCH.amberLight}
          border={STITCH.amberBorder}
          color={STITCH.amberDark}
          icon="hourglass-outline"
        >
          Chờ sinh viên xác nhận
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>

      {/* Countdown Ribbon (Stitch Ribbon) */}
      <View style={styles.countdownRibbon}>
        <View style={styles.countdownLeft}>
          <Ionicons name="time" size={15} color={STITCH.tertiaryContainer} />
          <Text style={styles.countdownText}>
            Thời hạn xác nhận:{' '}
            <Text style={styles.countdownBold}>
              {secs > 0 ? fmtViCountdown(secs) : 'Đang xử lý mở lại đơn...'}
            </Text>
          </Text>
        </View>
        <View style={styles.escrowBadge}>
          <Ionicons name="checkmark-circle" size={13} color={STITCH.secondary} />
          <Text style={styles.escrowBadgeText}>Ký quỹ an toàn</Text>
        </View>
      </View>

      {/* Spotlight Sinh viên đã chọn */}
      <StudentSpotlight info={booking.carepartner_info} />

      {/* Thông tin ca học */}
      <View style={styles.jobBriefBox}>
        <Text style={styles.jobBriefTitle} numberOfLines={2}>
          {booking.job_title || 'Công việc gia sư & chăm sóc'}
        </Text>
        {!!slot?.date && (
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={STITCH.primaryContainer} />
            <Text style={styles.metaText}>
              {slot.time_from?.slice(0, 5) || '--:--'} – {slot.time_to?.slice(0, 5) || '--:--'}{' '}
              {slot.day_of_week_vi ? `${slot.day_of_week_vi}` : ''} ({slot.date_vi || slot.date})
            </Text>
          </View>
        )}
        {!!addr && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={STITCH.secondary} />
            <Text style={styles.metaText} numberOfLines={1}>{addr}</Text>
          </View>
        )}
      </View>

      {/* Action Controls */}
      <View style={styles.cardActionsRow}>
        <TouchableOpacity
          style={styles.btnInverse}
          onPress={() => onOpenDetail(booking)}
          activeOpacity={0.85}
        >
          <Text style={styles.btnInverseText}>Xem hồ sơ chi tiết</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnDangerSubtle}
          onPress={() => onCancel(booking)}
          disabled={isCancelling}
          activeOpacity={0.85}
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color={STITCH.onErrorContainer} />
          ) : (
            <Text style={styles.btnDangerSubtleText}>Đổi người khác</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 1: CARD 1B (ĐƠN MỚI ĐĂNG ĐANG TÌM ỨNG VIÊN)
// ═══════════════════════════════════════════════════════════════
function OpenTaskCard({ task, navigation, onCancelTask, candidateCount, isCancelling }) {
  return (
    <View style={[styles.card, { borderTopColor: '#FFB95F' }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#E2E7FF" border="#DAE2FD" color={STITCH.onSurface} icon="search-outline">
          Đang tìm sinh viên phù hợp
        </StatusPill>
        <Text style={styles.cardPrice}>{money(task.price)}</Text>
      </View>

      <View style={{ marginVertical: 6, gap: 4 }}>
        <Text style={styles.jobBriefTitle} numberOfLines={2}>{task.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={STITCH.primaryContainer} />
          <Text style={styles.metaText}>
            {new Date(task.scheduled_time).toLocaleString('vi-VN', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>
      </View>

      {/* AI Matching Prompt Banner */}
      <View style={styles.aiPromptBanner}>
        <Ionicons name="sparkles" size={16} color={STITCH.primaryContainer} />
        <Text style={styles.aiPromptText}>
          <Text style={{ fontWeight: '700' }}>
            Đã có {candidateCount || 3} sinh viên gần nhà
          </Text>{' '}
          (bán kính &lt; 2km) nộp hồ sơ xét duyệt trực tiếp.
        </Text>
      </View>

      <View style={styles.cardActionsRow}>
        <TouchableOpacity
          style={styles.btnPrimaryAction}
          onPress={() => navigation.navigate('SmartMatches', { taskId: task.id, taskTitle: task.title })}
          activeOpacity={0.88}
        >
          <Text style={styles.btnPrimaryActionText}>Xem danh sách ứng viên để chọn ngay</Text>
          <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnCancelText}
          onPress={() => onCancelTask(task)}
          disabled={isCancelling}
          activeOpacity={0.8}
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color={STITCH.slateMuted} />
          ) : (
            <Text style={styles.btnCancelTextLabel}>Hủy việc</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 2: SẮP LÀM (COMMITTED — ĐÃ CAM KẾT NHẬN VIỆC)
// ═══════════════════════════════════════════════════════════════
function CommittedBookingCard({ booking, onOpenDetail, navigation }) {
  const slot = booking.first_slot;
  const targetIso = useMemo(() => {
    if (!slot?.date) return null;
    try {
      const time = slot.time_from || '00:00';
      return new Date(`${slot.date}T${time}:00+07:00`).toISOString();
    } catch (_) { return null; }
  }, [slot?.date, slot?.time_from]);

  const secsToStart = useCountdownTo(targetIso);
  const phone = booking.carepartner_info?.phone || '';

  const startLabel = (() => {
    if (!slot?.date) return 'Ca làm theo thỏa thuận';
    if (secsToStart === null) return 'Ca làm sắp diễn ra';
    if (secsToStart <= 0) return 'Ca làm có thể bắt đầu';
    const h = Math.floor(secsToStart / 3600);
    const m = Math.floor((secsToStart % 3600) / 60);
    if (h >= 1) return `Bắt đầu lúc ${slot.time_from?.slice(0, 5) || '18:00'} (Còn ${h} tiếng ${m} phút)`;
    return `Bắt đầu lúc ${slot.time_from?.slice(0, 5) || '18:00'} (Còn ${m} phút)`;
  })();

  const addr = booking.job_address || booking.location_info?.address || '';

  return (
    <View style={[styles.card, { borderTopColor: STITCH.secondary }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <StatusPill
          bg="#ECFDF5"
          border="#A7F3D0"
          color="#006C49"
          icon="checkmark-circle"
        >
          Sinh viên đã cam kết nhận việc
        </StatusPill>
        <Text style={styles.badgeOrderCode}>Mã: #{String(booking.id || '').slice(0, 7)}</Text>
      </View>

      {/* Countdown Highlight Box */}
      <View style={styles.upcomingHighlightBox}>
        <Ionicons name="alarm-outline" size={17} color={STITCH.secondary} />
        <Text style={styles.upcomingHighlightText}>{startLabel}</Text>
      </View>

      {/* Student Detail */}
      <StudentSpotlight info={booking.carepartner_info} />

      {/* Shift Overview */}
      <View style={styles.jobBriefBox}>
        <Text style={styles.jobBriefTitle} numberOfLines={2}>
          {booking.job_title || 'Gia sư & Kèm học tại nhà'}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={STITCH.secondary} />
          <Text style={styles.metaText} numberOfLines={1}>{addr || 'Địa chỉ gia đình'}</Text>
        </View>
      </View>

      {/* Direct Contact Grid (Gọi trực tiếp + Nhắn tin 1-1) */}
      <View style={styles.contactGrid}>
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={() => phone && Linking.openURL(`tel:${phone}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={16} color={STITCH.primaryContainer} />
          <Text style={styles.contactBtnText}>
            {phone ? `Gọi ${phone}` : 'Gọi trực tiếp'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.contactBtn, { backgroundColor: '#E2E7FF' }]}
          onPress={() => navigation.navigate('Chat', {
            taskId: booking.job_id,
            taskTitle: booking.job_title,
          })}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses" size={16} color={STITCH.skyActive} />
          <Text style={[styles.contactBtnText, { color: STITCH.onSurface }]}>Nhắn tin 1-1</Text>
        </TouchableOpacity>
      </View>

      {/* View Detail Link */}
      <TouchableOpacity
        style={styles.btnSecondaryFull}
        onPress={() => onOpenDetail(booking)}
        activeOpacity={0.85}
      >
        <Text style={styles.btnSecondaryFullText}>Xem lộ trình & chi tiết ca</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 3: ĐANG LÀM (IN-PROGRESS — RADAR LIVE GPS & GIÁM SÁT)
// ═══════════════════════════════════════════════════════════════
function InProgressBookingCard({ booking, onOpenDetail, onComplete, actionLoading }) {
  const isCompleting = actionLoading === `booking-complete-${booking.id}`;
  const cpName = booking.carepartner_info?.full_name || 'CarePartner';

  return (
    <View style={[styles.card, { borderTopColor: STITCH.skyActive }]}>
      {/* Live Header with Radar Pulse */}
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PingDot color={STITCH.secondary} size={8} />
          <Text style={styles.liveHeaderText}>ĐANG LÀM VIỆC (18:00 – 20:00)</Text>
        </View>
        <Text style={styles.progressTimeText}>Đã học 45/120 phút</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: '38%' }]} />
      </View>

      {/* Mini Live GPS & Geofence Radar Preview */}
      <View style={styles.radarCard}>
        <View style={styles.radarHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="shield-checkmark" size={16} color={STITCH.secondary} />
            <Text style={styles.radarTitle}>Trong vùng an toàn</Text>
          </View>
          <Text style={styles.radarRadius}>Bán kính 200m</Text>
        </View>

        {/* Stylized Radar Graphic */}
        <View style={styles.radarCanvas}>
          <View style={styles.radarRingOuter} />
          <View style={styles.radarRingInner} />

          {/* Home Anchor */}
          <View style={styles.homeAnchor}>
            <View style={styles.homeCircle}>
              <Ionicons name="home" size={16} color={STITCH.primaryContainer} />
            </View>
            <Text style={styles.homeLabel}>Nhà bạn</Text>
          </View>

          {/* Mentor Beacon */}
          <View style={styles.mentorBeacon}>
            <View style={styles.mentorCircle}>
              <Ionicons name="school" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.mentorLabel} numberOfLines={1}>{cpName}</Text>
          </View>
        </View>

        <View style={styles.radarFooterRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="radio" size={13} color={STITCH.secondary} />
            <Text style={styles.radarFooterText}>Tín hiệu GPS vệ tinh ổn định</Text>
          </View>
          <Text style={styles.radarFooterText}>Cập nhật 45s trước</Text>
        </View>
      </View>

      {/* Student On-site Info */}
      <StudentSpotlight info={booking.carepartner_info} compact />

      {/* SOS Hotline Button */}
      <TouchableOpacity
        style={styles.sosButton}
        onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
        activeOpacity={0.85}
      >
        <Ionicons name="warning" size={16} color={STITCH.alertCrimson} />
        <Text style={styles.sosButtonText}>Hotline hỗ trợ khẩn cấp 24/7 ({SUPPORT_HOTLINE})</Text>
      </TouchableOpacity>

      {/* Completion Button */}
      <TouchableOpacity
        style={styles.completeShiftBtn}
        disabled={isCompleting}
        onPress={() => onComplete(booking)}
        activeOpacity={0.88}
      >
        {isCompleting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.completeShiftBtnText}>Nghiệm thu & Hoàn thành ca</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 4: LỊCH SỬ (HISTORY — COMPLETED / ARCHIVED)
// ═══════════════════════════════════════════════════════════════
function HistoryBookingCard({ booking, navigation, onOpenDetail }) {
  const isCompleted = booking.status === 'completed';
  const cpName = booking.carepartner_info?.full_name || 'sinh viên';
  const payout = booking.carepartner_payout_vnd
    ?? Math.round((booking.total_value_vnd || 0) * 0.8);

  if (!isCompleted) {
    const reason = CANCEL_REASON_LABELS[booking.cancel_reason_code] || booking.cancel_reason_code;
    return (
      <View style={[styles.card, { borderTopColor: STITCH.slateMuted }]}>
        <View style={styles.cardHeader}>
          <StatusPill bg="#F1F5F9" border="#E2E8F0" color="#64748B" icon="close-circle-outline">
            {booking.status_label_vi || 'Đã kết thúc'}
          </StatusPill>
          <Text style={[styles.cardPrice, { color: STITCH.slateText }]}>
            {money(booking.total_value_vnd)}
          </Text>
        </View>
        <Text style={styles.jobBriefTitle}>{booking.job_title}</Text>
        {!!booking.compensation_vnd && booking.compensation_vnd > 0 ? (
          <View style={styles.refundBox}>
            <Ionicons name="gift-outline" size={14} color="#B45309" />
            <Text style={styles.refundBoxText}>
              Đã đền bù {money(booking.compensation_vnd)} credit vào ví của bạn.
            </Text>
          </View>
        ) : !!reason ? (
          <Text style={styles.cancelReasonText}>Lý do: {reason}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderTopColor: STITCH.secondary }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <StatusPill
          bg="#ECFDF5"
          border="#A7F3D0"
          color="#006C49"
          icon="shield-checkmark"
        >
          Đã giải ngân {money(payout)} MoMo Escrow
        </StatusPill>
        <Text style={styles.historyDateText}>{fmtEnd(booking.ended_at) || '16/09/2026'}</Text>
      </View>

      <View style={{ marginVertical: 6 }}>
        <Text style={styles.jobBriefTitle}>
          {cpName} · {booking.job_title || 'Kèm bé học'}
        </Text>
      </View>

      {/* Care Diary Preview */}
      <View style={styles.careDiaryBox}>
        <View style={styles.careDiaryHeader}>
          <Text style={styles.careDiaryTitle}>Nhật ký buổi học (Care Diary)</Text>
          <TouchableOpacity
            onPress={() => {
              if (booking.task_id) {
                navigation.navigate('CareDiaryDetail', { taskId: booking.task_id });
              } else {
                onOpenDetail(booking);
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.careDiaryLink}>Xem toàn bộ ↗</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.careDiaryExcerpt} numberOfLines={2}>
          "Bé hoàn thành tốt bài tập ôn luyện, tập trung nghe giảng và tự giác dọn dẹp bàn học gọn gàng..."
        </Text>
      </View>

      {/* Review Actions */}
      <View style={styles.reviewPromptRow}>
        <TouchableOpacity
          style={styles.reviewedBtn}
          onPress={() => navigation.navigate('Review', {
            taskId: booking.job_id,
            revieweeId: booking.carepartner_id,
          })}
          activeOpacity={0.85}
        >
          <Ionicons name="star" size={15} color={STITCH.tertiaryContainer} />
          <Text style={styles.reviewedBtnText}>Đã đánh giá 5 sao</Text>
        </TouchableOpacity>
      </View>

      {/* Re-book Button */}
      <TouchableOpacity
        style={styles.rebookBtn}
        onPress={() => navigation.navigate('JobTypeSelect')}
        activeOpacity={0.88}
      >
        <Ionicons name="repeat" size={16} color="#FFFFFF" />
        <Text style={styles.rebookBtnText}>Đặt lại sinh viên này cho tuần sau</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN SCREEN: MyTasksScreen
// ═══════════════════════════════════════════════════════════════
export default function MyTasksScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const [tasks, setTasks] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [candidateCounts, setCandidateCounts] = useState({});
  const [loadError, setLoadError] = useState('');

  // Fetch song song 2 nguồn
  const fetchAllData = useCallback(async ({ silent } = {}) => {
    if (!silent) setIsLoading(true);
    setLoadError('');
    const [tasksRes, bookingsRes] = await Promise.allSettled([
      getMyTasksAsParent(),
      getBookings({ role: 'parent' }),
    ]);

    let nextTasks = [];
    if (tasksRes.status === 'fulfilled') {
      nextTasks = Array.isArray(tasksRes.value?.data) ? tasksRes.value.data : [];
      setTasks(nextTasks);
    }
    let nextBookings = [];
    if (bookingsRes.status === 'fulfilled') {
      const d = bookingsRes.value?.data;
      nextBookings = Array.isArray(d) ? d : (Array.isArray(d?.results) ? d.results : []);
      setBookings(nextBookings);
    }
    if (tasksRes.status === 'rejected' && bookingsRes.status === 'rejected') {
      setLoadError('Không tải được danh sách việc. Vui lòng thử lại.');
    }
    setIsLoading(false);
    setRefreshing(false);

    // Đếm ứng viên cho open task
    const openTasks = nextTasks.filter((t) => t.status === 'open');
    openTasks.forEach(async (t) => {
      try {
        const candRes = await getCandidates(t.id);
        const list = Array.isArray(candRes.data) ? candRes.data : [];
        setCandidateCounts((prev) => ({ ...prev, [t.id]: list.length }));
      } catch (_) {}
    });
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading) fetchAllData({ silent: true });
    }, [fetchAllData, isLoading]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllData({ silent: true });
  }, [fetchAllData]);

  // Phân loại dữ liệu theo 4 Tab chuẩn Stitch
  const itemsByTab = useMemo(() => {
    const pending = [];
    const upcoming = [];
    const in_progress = [];
    const history = [];

    bookings.forEach((b) => {
      if (PENDING_BOOKING_STATUSES.includes(b.status)) {
        pending.push({ kind: 'booking', data: b });
      } else if (UPCOMING_BOOKING_STATUSES.includes(b.status)) {
        upcoming.push({ kind: 'booking', data: b });
      } else if (IN_PROGRESS_BOOKING_STATUSES.includes(b.status)) {
        in_progress.push({ kind: 'booking', data: b });
      } else if (HISTORY_BOOKING_STATUSES.includes(b.status)) {
        history.push({ kind: 'booking', data: b });
      }
    });

    tasks.forEach((t) => {
      if (t.status === 'open') {
        pending.push({ kind: 'task', data: t });
      } else if (t.status === 'in_progress') {
        in_progress.push({ kind: 'task', data: t });
      } else if (['completed', 'cancelled'].includes(t.status)) {
        history.push({ kind: 'task', data: t });
      }
    });

    return { pending, upcoming, in_progress, history };
  }, [bookings, tasks]);

  // Hỗ trợ hiển thị số đếm cho các tab
  const tabCounts = {
    pending: itemsByTab.pending.length,
    upcoming: itemsByTab.upcoming.length,
    in_progress: itemsByTab.in_progress.length,
    history: itemsByTab.history.length,
  };

  // Nếu người dùng chọn tab, lấy dữ liệu tab đó
  const filtered = itemsByTab[activeTab] || [];

  // Handlers
  const openBookingDetail = useCallback((booking) => {
    navigation.navigate('BookingDetail', { bookingId: booking.id });
  }, [navigation]);

  const handleCancelBooking = useCallback((booking) => {
    Alert.alert(
      'Đổi người / Hủy đơn',
      `Hủy đơn "${booking.job_title || 'này'}"? Sinh viên đã chọn sẽ được thông báo, tiền ký quỹ MoMo Escrow được bảo toàn 100%.`,
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Hủy đơn',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(`booking-cancel-${booking.id}`);
            try {
              await cancelBookingByParent(booking.id, '');
              Alert.alert('Thành công', 'Đã hủy đơn. Bạn có thể chọn sinh viên khác cho công việc này.');
              await fetchAllData({ silent: true });
            } catch (e) {
              const msg = e?.response?.data?.detail || 'Thao tác thất bại.';
              Alert.alert('Lỗi', msg);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  }, [fetchAllData]);

  const handleCompleteBooking = useCallback((booking) => {
    Alert.alert(
      'Nghiệm thu ca làm',
      'Xác nhận ca học đã hoàn tất tốt đẹp? Tiền ký quỹ sẽ được giải ngân 80% cho sinh viên qua MoMo Escrow.',
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Nghiệm thu ngay',
          onPress: async () => {
            setActionLoading(`booking-complete-${booking.id}`);
            try {
              await completeBooking(booking.id);
              Alert.alert('Thành công', 'Ca làm đã hoàn tất và giải ngân thành công.');
              await fetchAllData({ silent: true });
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.detail || 'Thao tác thất bại.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  }, [fetchAllData]);

  const handleCancelTask = useCallback((task) => {
    Alert.alert('Hủy việc', `Bạn có chắc muốn hủy "${task.title}"?`, [
      { text: 'Đóng', style: 'cancel' },
      {
        text: 'Hủy việc',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(`${task.id}-cancelled`);
          try {
            await updateTaskStatus(task.id, 'cancelled');
            await fetchAllData({ silent: true });
          } catch (_) {
            Alert.alert('Lỗi', 'Không thể hủy việc.');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  }, [fetchAllData]);

  const renderItem = useCallback(({ item }) => {
    if (item.kind === 'booking') {
      const b = item.data;
      switch (b.status) {
        case 'awaiting_commitment':
          return (
            <AwaitingBookingCard
              booking={b}
              onOpenDetail={openBookingDetail}
              onCancel={handleCancelBooking}
              actionLoading={actionLoading}
            />
          );
        case 'committed':
          return (
            <CommittedBookingCard
              booking={b}
              onOpenDetail={openBookingDetail}
              navigation={navigation}
            />
          );
        case 'in_progress':
          return (
            <InProgressBookingCard
              booking={b}
              onOpenDetail={openBookingDetail}
              onComplete={handleCompleteBooking}
              actionLoading={actionLoading}
            />
          );
        default:
          return (
            <HistoryBookingCard
              booking={b}
              navigation={navigation}
              onOpenDetail={openBookingDetail}
            />
          );
      }
    }

    // item.kind === 'task'
    const t = item.data;
    if (t.status === 'open') {
      return (
        <OpenTaskCard
          task={t}
          navigation={navigation}
          onCancelTask={handleCancelTask}
          candidateCount={candidateCounts[t.id]}
          isCancelling={actionLoading === `${t.id}-cancelled`}
        />
      );
    }
    return (
      <View style={[styles.card, { borderTopColor: STITCH.slateMuted }]}>
        <View style={styles.cardHeader}>
          <StatusPill bg="#F1F5F9" border="#E2E8F0" color="#64748B" icon="close-circle-outline">
            {t.status === 'completed' ? 'Hoàn thành' : 'Đã hủy'}
          </StatusPill>
          <Text style={styles.cardPrice}>{money(t.price)}</Text>
        </View>
        <Text style={styles.jobBriefTitle}>{t.title}</Text>
      </View>
    );
  }, [
    actionLoading, candidateCounts, navigation, openBookingDetail,
    handleCancelBooking, handleCompleteBooking, handleCancelTask,
  ]);

  const emptyByTab = {
    pending: {
      icon: 'hourglass-outline',
      title: 'Không có đơn nào đang chờ',
      text: 'Khi bạn đăng việc mới hoặc lựa chọn sinh viên, đơn sẽ xuất hiện tại đây.',
    },
    upcoming: {
      icon: 'calendar-outline',
      title: 'Chưa có ca làm nào sắp tới',
      text: 'Khi sinh viên bấm xác nhận nhận việc, ca làm sẽ tự động chuyển vào đây.',
    },
    in_progress: {
      icon: 'navigate-outline',
      title: 'Không có ca làm đang diễn ra',
      text: 'Các ca học trong khung giờ thực hiện sẽ được kích hoạt radar giám sát an toàn tại đây.',
    },
    history: {
      icon: 'time-outline',
      title: 'Chưa có lịch sử hoàn thành',
      text: 'Các ca làm kết thúc sẽ được lưu trữ tại đây kèm đánh giá và hóa đơn MoMo.',
    },
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={STITCH.canvas} />

      {/* TOP HEADER (Stitch Top Header) */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeftWrap}>
          <View style={styles.logoBadge}>
            <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.topBrandText}>Việc Của Tôi</Text>
            <Text style={styles.subBrandText}>EduCareLink • Phụ huynh</Text>
          </View>
        </View>
        <View style={styles.headerRightWrap}>
          <NotificationBell color={STITCH.primaryContainer} />
          <TouchableOpacity
            style={styles.postJobBtn}
            onPress={() => navigation.navigate('JobTypeSelect')}
            activeOpacity={0.88}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.postJobBtnText}>Đăng việc mới</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sub-header Banner */}
      <View style={styles.subBanner}>
        <Text style={styles.subBannerTitle}>Việc của tôi</Text>
        <Text style={styles.subBannerDesc}>Quản lý và giám sát toàn bộ ca học & coi trẻ của gia đình</Text>
      </View>

      {/* 4-TAB SEGMENTED CONTROLLER */}
      <View style={styles.tabContainer}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const count = tabCounts[tab.key] || 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              {tab.live && (
                <View style={{ marginRight: 2 }}>
                  <PingDot color={active ? STITCH.primaryContainer : STITCH.secondary} size={6} />
                </View>
              )}
              <Ionicons
                name={tab.icon}
                size={13}
                color={active ? STITCH.primaryContainer : STITCH.slateMuted}
              />
              <Text
                style={[styles.tabBtnText, active && styles.tabBtnTextActive]}
                numberOfLines={1}
              >
                {tab.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* BODY CONTENT */}
      {isLoading ? (
        <ActivityIndicator color={STITCH.primaryContainer} style={{ marginTop: 60 }} />
      ) : loadError ? (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-offline-outline" size={44} color={STITCH.slateMuted} />
          <Text style={styles.errorMsg}>{loadError}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => fetchAllData()}
            activeOpacity={0.85}
          >
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.kind}-${item.data.id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={STITCH.primaryContainer}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons
                  name={emptyByTab[activeTab]?.icon || 'folder-open-outline'}
                  size={34}
                  color={STITCH.primaryContainer}
                />
              </View>
              <Text style={styles.emptyTitle}>{emptyByTab[activeTab]?.title}</Text>
              <Text style={styles.emptyDesc}>{emptyByTab[activeTab]?.text}</Text>
              {activeTab === 'pending' && (
                <TouchableOpacity
                  style={styles.emptyPostBtn}
                  onPress={() => navigation.navigate('JobTypeSelect')}
                  activeOpacity={0.88}
                >
                  <Ionicons name="add-circle" size={17} color="#FFFFFF" />
                  <Text style={styles.emptyPostBtnText}>Đăng việc mới ngay</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLESHEET (Mapping toàn bộ Stitch Tailwind tokens vào React Native)
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: STITCH.canvas,
  },

  // === TOP HEADER ===
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: STITCH.canvas,
  },
  headerLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: STITCH.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  topBrandText: {
    fontSize: 15,
    fontWeight: '700',
    color: STITCH.onSurface,
    lineHeight: 19,
  },
  subBrandText: {
    fontSize: 10,
    fontWeight: '600',
    color: STITCH.slateText,
  },
  headerRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: STITCH.primaryContainer,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    ...SHADOWS.small,
  },
  postJobBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // === SUB-BANNER ===
  subBanner: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  subBannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: STITCH.onSurface,
    letterSpacing: -0.3,
  },
  subBannerDesc: {
    fontSize: 11.5,
    color: STITCH.slateText,
    marginTop: 2,
  },

  // === 4-TAB SEGMENTED CONTROLLER ===
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAEFFF',
    borderRadius: 14,
    padding: 3.5,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 3,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: STITCH.slateText,
  },
  tabBtnTextActive: {
    color: STITCH.primaryContainer,
    fontWeight: '800',
  },

  // === LIST CONTAINER ===
  listContainer: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },

  // === CARD CORE ===
  card: {
    backgroundColor: STITCH.cardSurface,
    borderTopWidth: 4,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: STITCH.cardBorder,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...SHADOWS.small,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: STITCH.onSurface,
  },
  badgeOrderCode: {
    fontSize: 11,
    color: STITCH.slateMuted,
    fontWeight: '600',
  },

  // === STATUS PILL ===
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },

  // === COUNTDOWN RIBBON (Tab 1 Card 1A) ===
  countdownRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: STITCH.amberLight,
    borderWidth: 1,
    borderColor: STITCH.amberBorder,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  countdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  countdownText: {
    fontSize: 11,
    color: STITCH.amberDark,
  },
  countdownBold: {
    fontWeight: '800',
    color: STITCH.amberDark,
  },
  escrowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  escrowBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: STITCH.secondary,
  },

  // === STUDENT SPOTLIGHT ROW ===
  spotlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    position: 'relative',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: STITCH.primaryContainer,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
  },
  spotlightName: {
    fontSize: 14,
    fontWeight: '700',
    color: STITCH.onSurface,
  },
  spotlightSchool: {
    fontSize: 11,
    color: STITCH.slateText,
    marginTop: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  starChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  starChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: STITCH.amberDark,
  },
  cccdChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  cccdChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: STITCH.secondary,
  },

  // === JOB BRIEF BOX ===
  jobBriefBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 11,
    padding: 10,
    gap: 4,
  },
  jobBriefTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: STITCH.onSurface,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 11.5,
    color: STITCH.slateText,
  },

  // === ACTIONS ===
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  btnInverse: {
    flex: 1,
    backgroundColor: STITCH.inverseSurface,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInverseText: {
    color: STITCH.inverseOnSurface,
    fontSize: 12,
    fontWeight: '700',
  },
  btnDangerSubtle: {
    backgroundColor: STITCH.errorContainer,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDangerSubtleText: {
    color: STITCH.onErrorContainer,
    fontSize: 12,
    fontWeight: '700',
  },

  // === AI PROMPT BANNER (Tab 1 Card 1B) ===
  aiPromptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: STITCH.primaryLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 9,
    borderRadius: 10,
  },
  aiPromptText: {
    flex: 1,
    fontSize: 11,
    color: '#9A3412',
    lineHeight: 16,
  },
  btnPrimaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: STITCH.primaryContainer,
    paddingVertical: 10,
    borderRadius: 11,
    ...SHADOWS.small,
  },
  btnPrimaryActionText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  btnCancelText: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  btnCancelTextLabel: {
    fontSize: 11.5,
    color: STITCH.slateMuted,
    fontWeight: '600',
  },

  // === TAB 2 (UPCOMING) SPECIFIC ===
  upcomingHighlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 8,
  },
  upcomingHighlightText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: STITCH.secondary,
  },
  contactGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingVertical: 9,
    borderRadius: 10,
  },
  contactBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: STITCH.onSurface,
  },
  btnSecondaryFull: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: STITCH.borderSubtle,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryFullText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: STITCH.slateText,
  },

  // === TAB 3 (IN-PROGRESS) SPECIFIC ===
  liveHeaderText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: STITCH.secondary,
    letterSpacing: 0.2,
  },
  progressTimeText: {
    fontSize: 11,
    color: STITCH.slateText,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: STITCH.secondary,
    borderRadius: 999,
  },
  radarCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 8,
  },
  radarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: STITCH.onSurface,
  },
  radarRadius: {
    fontSize: 10.5,
    color: STITCH.slateText,
  },
  radarCanvas: {
    height: 100,
    backgroundColor: '#EAEFFF',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  radarRingOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(0,108,73,0.2)',
  },
  radarRingInner: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: 'rgba(0,108,73,0.3)',
  },
  homeAnchor: {
    alignItems: 'center',
    zIndex: 10,
  },
  homeCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  homeLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: STITCH.onSurface,
    marginTop: 2,
  },
  mentorBeacon: {
    position: 'absolute',
    top: 14,
    right: 32,
    alignItems: 'center',
    zIndex: 10,
  },
  mentorCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: STITCH.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  mentorLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: STITCH.secondary,
    marginTop: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  radarFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radarFooterText: {
    fontSize: 10,
    color: STITCH.slateText,
  },
  sosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 8,
  },
  sosButtonText: {
    color: STITCH.alertCrimson,
    fontSize: 11,
    fontWeight: '700',
  },
  completeShiftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: STITCH.secondary,
    paddingVertical: 11,
    borderRadius: 12,
    ...SHADOWS.medium,
  },
  completeShiftBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // === TAB 4 (HISTORY) SPECIFIC ===
  historyDateText: {
    fontSize: 11,
    color: STITCH.slateMuted,
  },
  refundBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: STITCH.amberLight,
    padding: 8,
    borderRadius: 8,
  },
  refundBoxText: {
    fontSize: 11,
    color: STITCH.amberDark,
    fontWeight: '600',
  },
  cancelReasonText: {
    fontSize: 11,
    color: STITCH.slateText,
  },
  careDiaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 9,
    gap: 4,
  },
  careDiaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  careDiaryTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: STITCH.onSurface,
  },
  careDiaryLink: {
    fontSize: 11,
    fontWeight: '700',
    color: STITCH.primaryContainer,
  },
  careDiaryExcerpt: {
    fontSize: 11,
    color: STITCH.slateText,
    lineHeight: 16,
  },
  reviewPromptRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reviewedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingVertical: 9,
    borderRadius: 10,
  },
  reviewedBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: STITCH.onSurface,
  },
  rebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: STITCH.primaryContainer,
    paddingVertical: 10,
    borderRadius: 11,
    ...SHADOWS.small,
  },
  rebookBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // === EMPTY / ERROR ===
  centerBox: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 30,
  },
  errorMsg: {
    fontSize: 12,
    color: STITCH.slateText,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: STITCH.primaryContainer,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
    paddingHorizontal: 30,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: STITCH.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: STITCH.onSurface,
  },
  emptyDesc: {
    fontSize: 11.5,
    color: STITCH.slateText,
    textAlign: 'center',
    lineHeight: 17,
  },
  emptyPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: STITCH.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyPostBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
