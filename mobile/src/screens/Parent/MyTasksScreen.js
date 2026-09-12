// ============================================================
// MyTasksScreen — "Việc của tôi" (Phụ huynh) — bản thiết kế Stitch
// 2026-09-13. Kiến trúc 3 tab theo state machine 2 luồng:
//
//   TAB 1 "CHỜ XÁC NHẬN": Task (luồng cũ) status=open + Booking (Flow 1)
//        awaiting_commitment / reschedule_requested / suspected_no_show.
//   TAB 2 "SẮP LÀM":      Booking committed / in_progress + Task in_progress.
//   TAB 3 "LỊCH SỬ":      Booking completed + các trạng thái kết thúc
//                         (no_show, cancelled_by_*, expired, disputed)
//                         + Task completed / cancelled.
//
// Dữ liệu 100% từ API THẬT, fetch song song 2 nguồn (Promise.allSettled):
//   - Luồng cũ  : GET /api/parent/my-tasks/         (api/tasks.js)
//   - Luồng mới : GET /api/matching/bookings/?role=parent (api/matching.js)
// Thiết kế: canvas #F8FAFC, card trắng viền #E2E8F0, accent border-top 4px
// theo trạng thái (amber=chờ, emerald=đã cam kết, sky=đang tìm, blue=đang làm).
// Cấm jargon "ELO" → dùng "Điểm uy tín" / "Điểm tín nhiệm" (anti-pattern Stitch).
// ============================================================

import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Alert, Animated, Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent, getCandidates, updateTaskStatus } from '../../api/tasks';
import {
  getBookings, cancelBookingByParent, completeBooking, respondReschedule, reportNoShow,
} from '../../api/matching';
import { checkConsent } from '../../api/tracking';
import { getTaskModeration } from '../../api/moderation';
import {COLORS, SHADOWS, TYPO, ANIM} from '../../theme/colors';
import { SUPPORT_HOTLINE } from '../../config/appConfig';
import NotificationBell from '../../components/NotificationBell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// === DESIGN TOKENS (bản thiết kế Stitch — Section B) ===
const DESIGN = {
  canvas: '#F8FAFC',          // nền tổng thể
  cardSurface: '#FFFFFF',     // card
  cardBorder: '#E2E8F0',      // viền card
  brandOrange: '#F26522',     // tab active, CTA chính
  brandOrangeLight: '#FFF7ED',
  trustEmerald: '#0E9F6E',    // completed / verified / confirmed
  activeBlue: '#0284C7',      // live GPS / in-progress
  pendingAmber: '#F59E0B',    // awaiting_commitment / countdown
  alertCrimson: '#EF4444',    // hủy / SOS / lỗi
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accentAmber: '#FBBF24',     // border-top card awaiting
  accentEmerald: '#10B981',   // border-top card committed/in_progress
  accentSky: '#0EA5E9',       // border-top card đang tìm CP
  slate100: '#F1F5F9',
};

// === 3 TAB MỚI (thay 4 tab cũ open/in_progress/completed/cancelled) ===
const TABS = [
  { key: 'pending',  label: 'Chờ xác nhận', icon: 'hourglass-outline' },
  { key: 'upcoming', label: 'Sắp làm',      icon: 'event-available-outline' },
  { key: 'history',  label: 'Lịch sử',      icon: 'time-outline' },
];

// Nhãn lý do hủy booking (đồng bộ matching/constants CANCEL_REASONS)
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

// Booking thuộc tab nào theo trạng thái (Step 12 state machine)
const PENDING_BOOKING_STATUSES = ['awaiting_commitment', 'reschedule_requested', 'suspected_no_show'];
const UPCOMING_BOOKING_STATUSES = ['committed', 'in_progress'];
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

// Chuẩn bị "X phút Y giây" cho đồng hồ đếm ngược
const fmtViCountdown = (totalSec) => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${String(s).padStart(2, '0')} giây`;
};

// Đếm ngược đến mốc thời gian (scheduled_time / first_slot) — component con
// tự quản interval + cleanup trong useEffect → không rò rỉ khi chuyển tab.
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

// Chấm tròn "ping" nhấp nháy (live badge) — Animated loop có cleanup
function PingDot({ color, size = 7 }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }} />;
}

// === STATUS PILL (đầu mỗi card) ===
function StatusPill({ bg, border, color, icon, children, live }) {
  return (
    <View style={[styles.statusPill, { backgroundColor: bg, borderColor: border }]}>
      {live ? <PingDot color={color} /> : <Ionicons name={icon} size={11} color={color} />}
      <Text style={[styles.statusPillText, { color }]}>{children}</Text>
    </View>
  );
}

// === STUDENT SPOTLIGHT BENTO (hồ sơ sinh viên đã chọn — dữ liệu thật từ
//     booking.carepartner_info do backend trả về, KHÔNG mock) ===
function StudentSpotlight({ info, compact }) {
  const name = info?.full_name || 'CarePartner';
  const initial = (name || 'S').trim().charAt(0).toUpperCase();
  const rating = info?.rating_avg || 0;
  const jobsDone = info?.jobs_completed || 0;
  const band = info?.trust_band_vi || '';
  return (
    <View style={styles.spotlight}>
      <View style={styles.spotlightAvatarWrap}>
        <View style={styles.spotlightAvatar}>
          <Text style={styles.spotlightAvatarText}>{initial}</Text>
        </View>
        {!!info?.is_verified && (
          <View style={styles.verifiedDot}>
            <Ionicons name="checkmark" size={9} color="#FFFFFF" />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.spotlightName} numberOfLines={1}>{name}</Text>
        {!!info?.school && (
          <Text style={styles.spotlightSchool} numberOfLines={1}>
            {info.school}{info?.major ? ` · ${info.major}` : ''}
          </Text>
        )}
        {!compact && (
          <View style={styles.trustRow}>
            <View style={styles.trustChip}>
              <Ionicons name="star" size={10} color="#D97706" />
              <Text style={styles.trustChipText}>
                {rating > 0 ? `${rating} (${jobsDone} ca thành công)` : 'Sinh viên mới'}
              </Text>
            </View>
            {!!band && (
              <View style={[styles.trustChip, { backgroundColor: DESIGN.slate100 }]}>
                <Ionicons name="shield-checkmark" size={10} color={DESIGN.trustEmerald} />
                <Text style={[styles.trustChipText, { color: DESIGN.textSecondary }]}>
                  Điểm uy tín: {band}
                </Text>
              </View>
            )}
            {!!info?.is_verified && (
              <View style={[styles.trustChip, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="id-card-outline" size={10} color={DESIGN.trustEmerald} />
                <Text style={[styles.trustChipText, { color: DESIGN.trustEmerald }]}>
                  Đã xác thực CCCD
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// === JOB META (tên ca + lịch + địa chỉ — từ booking.first_slot thật) ===
function JobMetaBrief({ booking }) {
  const slot = booking?.first_slot;
  const addr = booking?.job_address || booking?.location_info?.address || '';
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.jobTitle} numberOfLines={2}>{booking?.job_title || 'Công việc ghép cặp'}</Text>
      {!!slot?.date && (
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={DESIGN.textSecondary} />
          <Text style={styles.metaText}>
            {slot.day_of_week_vi ? `${slot.day_of_week_vi}, ` : ''}
            {slot.date_vi || slot.date} · {slot.time_from?.slice(0, 5) || '--:--'} – {slot.time_to?.slice(0, 5) || '--:--'}
          </Text>
        </View>
      )}
      {!!addr && (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={DESIGN.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>{addr}</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 1: Booking awaiting_commitment (QUAN TRỌNG NHẤT)
// Border-top amber, đồng hồ đếm ngược từ booking.seconds_left (API trả về),
// Spotlight sinh viên đã chọn + nút xem hồ sơ / đổi người hủy đơn.
// ═══════════════════════════════════════════════════════════════
function AwaitingBookingCard({ booking, onOpenDetail, onCancel, actionLoading }) {
  // seconds_left từ API là mốc ban đầu → đếm giảm cục bộ mỗi giây
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

  return (
    <View style={[styles.card, { borderTopColor: DESIGN.accentAmber }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#FFFBEB" border="#FDE68A" color="#92400E" icon="hourglass-outline">
          Chờ sinh viên xác nhận
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>

      {/* Đồng hồ đếm ngược — amber box (Stitch: Urgent Countdown Ribbon) */}
      <View style={styles.countdownBox}>
        <View style={styles.countdownHeadRow}>
          <Ionicons name="hourglass" size={14} color="#B45309" />
          <Text style={styles.countdownMain}>
            {secs > 0
              ? `Đang chờ sinh viên xác nhận cam kết: còn ${fmtViCountdown(secs)}`
              : 'Hết thời gian chờ — đang mở lại đơn để chọn người khác...'}
          </Text>
        </View>
        <Text style={styles.countdownMicro}>
          Nếu quá thời hạn sinh viên chưa nhận việc, đơn sẽ tự mở lại để bạn chọn người khác.
        </Text>
      </View>

      {/* Spotlight sinh viên đã chọn — KHÔNG được ẩn hồ sơ khi pending */}
      <StudentSpotlight info={booking.carepartner_info} />

      <JobMetaBrief booking={booking} />

      <View style={[styles.cardActions, { borderTopColor: DESIGN.cardBorder }]}>
        <TouchableOpacity
          style={[styles.btnOutline, { flex: 1 }]}
          onPress={() => onOpenDetail(booking)}
          activeOpacity={0.85}
        >
          <Ionicons name="person-outline" size={14} color={DESIGN.brandOrange} />
          <Text style={styles.btnOutlineText}>Xem chi tiết hồ sơ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSubtleDanger}
          onPress={() => onCancel(booking)}
          disabled={isCancelling}
          activeOpacity={0.85}
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color={DESIGN.alertCrimson} />
          ) : (
            <Text style={styles.btnSubtleDangerText}>Đổi người / Hủy đơn</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 1: Booking reschedule_requested (SV xin đổi giờ → PH Đồng ý/Từ chối)
// ═══════════════════════════════════════════════════════════════
function RescheduleBookingCard({ booking, onOpenDetail, onRespond, actionLoading }) {
  return (
    <View style={[styles.card, { borderTopColor: DESIGN.accentAmber }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#FFFBEB" border="#FDE68A" color="#92400E" icon="swap-horizontal-outline">
          Sinh viên xin đổi giờ
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>
      <JobMetaBrief booking={booking} />
      <Text style={styles.hintText}>
        CarePartner đã gửi yêu cầu đổi lịch ca làm. Bạn hãy xem lại và phản hồi trong tab này.
      </Text>
      <View style={styles.pairRow}>
        <TouchableOpacity
          style={[styles.btnSolid, { backgroundColor: DESIGN.trustEmerald, flex: 1 }]}
          disabled={actionLoading === `booking-reschedule-${booking.id}`}
          onPress={() => onRespond(booking, 'approve')}
          activeOpacity={0.85}
        >
          {actionLoading === `booking-reschedule-${booking.id}` ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
              <Text style={styles.btnSolidText}>Đồng ý</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSolid, { backgroundColor: '#DC2626', flex: 1 }]}
          disabled={actionLoading === `booking-reschedule-${booking.id}`}
          onPress={() => onRespond(booking, 'decline')}
          activeOpacity={0.85}
        >
          <Ionicons name="close-circle-outline" size={15} color="#fff" />
          <Text style={styles.btnSolidText}>Từ chối</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onOpenDetail(booking)} activeOpacity={0.85}>
          <Ionicons name="chevron-forward" size={18} color={DESIGN.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 1: Booking suspected_no_show (CP có mặt chưa? — quyết định PH)
// ═══════════════════════════════════════════════════════════════
function NoShowQuestionCard({ booking, onOpenDetail, onReport, actionLoading }) {
  return (
    <View style={[styles.card, { borderTopColor: DESIGN.alertCrimson }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#FEF2F2" border="#FECACA" color="#B91C1C" icon="warning-outline">
          Nghi ngờ không đến
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>
      <JobMetaBrief booking={booking} />
      <Text style={styles.hintText}>CarePartner đã đến nơi chưa?</Text>
      <View style={styles.pairRow}>
        <TouchableOpacity
          style={[styles.btnSolid, { backgroundColor: DESIGN.trustEmerald, flex: 1 }]}
          disabled={actionLoading === `booking-noshow-${booking.id}`}
          onPress={() => onReport(booking, true)}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark" size={15} color="#fff" />
          <Text style={styles.btnSolidText}>Đã đến</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnSolid, { backgroundColor: '#DC2626', flex: 1 }]}
          disabled={actionLoading === `booking-noshow-${booking.id}`}
          onPress={() => onReport(booking, false)}
          activeOpacity={0.85}
        >
          <Ionicons name="close" size={15} color="#fff" />
          <Text style={styles.btnSolidText}>Không đến</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onOpenDetail(booking)} activeOpacity={0.85}>
          <Ionicons name="chevron-forward" size={18} color={DESIGN.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 2: Booking committed (SV đã cam kết, chưa bắt đầu ca)
// ═══════════════════════════════════════════════════════════════
function CommittedBookingCard({ booking, onOpenDetail, actionLoading }) {
  const slot = booking.first_slot;
  const targetIso = useMemo(() => {
    if (!slot?.date) return null;
    try {
      const time = slot.time_from || '00:00';
      // Backend trả ngày/khung giờ theo giờ địa phương Việt Nam
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
    if (h >= 1) return `Bắt đầu sau ${h} giờ ${m} phút`;
    return `Bắt đầu sau ${m} phút`;
  })();

  return (
    <View style={[styles.card, { borderTopColor: DESIGN.accentEmerald }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#ECFDF5" border="#A7F3D0" color="#047857" icon="shield-checkmark-outline">
          Sinh viên đã cam kết nhận đơn
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>

      <JobMetaBrief booking={booking} />

      {/* Timing badge — đếm ngược đến giờ bắt đầu ca */}
      <View style={styles.timingBadge}>
        <Ionicons name="time-outline" size={13} color={DESIGN.trustEmerald} />
        <Text style={styles.timingBadgeText}>{startLabel}</Text>
      </View>

      {/* Mini-bar sinh viên + SĐT mở khi đã cam kết (API trả carepartner_info.phone) */}
      <StudentSpotlight info={booking.carepartner_info} compact />
      {!!phone && (
        <TouchableOpacity
          style={styles.phoneRow}
          onPress={() => Linking.openURL(`tel:${phone}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={13} color={DESIGN.trustEmerald} />
          <Text style={styles.phoneText}>SĐT: {phone} · Đã mở kênh kết nối</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.cardActions, { borderTopColor: DESIGN.cardBorder }]}>
        <TouchableOpacity
          style={[styles.btnOutline, { flex: 1 }]}
          onPress={() => onOpenDetail(booking)}
          activeOpacity={0.85}
        >
          <Ionicons name="eye-outline" size={14} color={DESIGN.brandOrange} />
          <Text style={styles.btnOutlineText}>Xem chi tiết ca làm</Text>
        </TouchableOpacity>
        {/* SOS khẩn cấp — hotline 24/7 */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
          accessibilityLabel={`Gọi hotline hỗ trợ khẩn cấp ${SUPPORT_HOTLINE}`}
          activeOpacity={0.85}
        >
          <Ionicons name="alert-circle-outline" size={18} color={DESIGN.alertCrimson} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 2: Booking in_progress (đang trong ca làm — CTA hoàn thành)
// ═══════════════════════════════════════════════════════════════
function InProgressBookingCard({ booking, onOpenDetail, onComplete, actionLoading }) {
  const phone = booking.carepartner_info?.phone || '';
  const isCompleting = actionLoading === `booking-complete-${booking.id}`;
  return (
    <View style={[styles.card, { borderTopColor: DESIGN.activeBlue }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#E0F2FE" border="#BAE6FD" color="#0369A1" icon="navigate-outline" live>
          Đang trong ca làm
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>

      <JobMetaBrief booking={booking} />

      {/* Live GPS strip — ca được bảo vệ định vị 2 chiều (bật khi PH checkConsent ở màn chi tiết) */}
      <View style={styles.gpsStrip}>
        <PingDot color={DESIGN.activeBlue} />
        <Text style={styles.gpsStripText} numberOfLines={1}>
          Định vị an toàn đang bật — theo dõi hành trình trong màn chi tiết
        </Text>
      </View>

      <StudentSpotlight info={booking.carepartner_info} compact />
      {!!phone && (
        <TouchableOpacity
          style={styles.phoneRow}
          onPress={() => Linking.openURL(`tel:${phone}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={13} color={DESIGN.activeBlue} />
          <Text style={styles.phoneText}>SĐT: {phone}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.pairRow}>
        <TouchableOpacity
          style={[styles.btnSolid, { backgroundColor: DESIGN.trustEmerald, flex: 1 }]}
          disabled={isCompleting}
          onPress={() => onComplete(booking)}
          activeOpacity={0.85}
        >
          {isCompleting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={15} color="#fff" />
              <Text style={styles.btnSolidText}>Xác nhận hoàn thành ca</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onOpenDetail(booking)} activeOpacity={0.85}>
          <Ionicons name="chevron-forward" size={18} color={DESIGN.textSecondary} />
        </TouchableOpacity>
      </View>
      {/* SOS 24/7 */}
      <TouchableOpacity
        style={styles.sosLink}
        onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
        activeOpacity={0.85}
      >
        <Ionicons name="alert-circle" size={13} color={DESIGN.alertCrimson} />
        <Text style={styles.sosLinkText}>Báo sự cố khẩn cấp / No-show — Hotline {SUPPORT_HOTLINE}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — TAB 3: Booking completed (đánh giá + nhật ký + biên lai + đặt lại)
// ═══════════════════════════════════════════════════════════════
function HistoryBookingCard({ booking, navigation, onOpenDetail }) {
  const isCompleted = booking.status === 'completed';
  const cpName = booking.carepartner_info?.full_name || 'sinh viên';
  const payout = booking.carepartner_payout_vnd
    ?? Math.round((booking.total_value_vnd || 0) * 0.8);

  if (!isCompleted) {
    // Các trạng thái kết thúc khác (hủy / no_show / hết hạn / tranh chấp)
    const reason = CANCEL_REASON_LABELS[booking.cancel_reason_code] || booking.cancel_reason_code;
    return (
      <View style={[styles.card, { borderTopColor: DESIGN.textMuted }]}>
        <View style={styles.cardHeader}>
          <StatusPill bg="#F1F5F9" border="#E2E8F0" color="#64748B" icon="close-circle-outline">
            {booking.status_label_vi || 'Đã kết thúc'}
          </StatusPill>
          <Text style={[styles.cardPrice, { color: DESIGN.textSecondary }]}>
            {money(booking.total_value_vnd)}
          </Text>
        </View>
        <JobMetaBrief booking={booking} />
        {!!booking.compensation_vnd && booking.compensation_vnd > 0 ? (
          <View style={styles.refundRow}>
            <Ionicons name="gift-outline" size={13} color="#B45309" />
            <Text style={styles.refundText}>
              Đã đền bù {money(booking.compensation_vnd)} credit vào ví của bạn.
            </Text>
          </View>
        ) : !!reason ? (
          <Text style={styles.hintText}>Lý do: {reason}</Text>
        ) : null}
        {!!fmtEnd(booking.cancelled_at || booking.ended_at) && (
          <Text style={styles.timestampText}>{fmtEnd(booking.cancelled_at || booking.ended_at)}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.card, { borderTopColor: DESIGN.accentEmerald }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg="#ECFDF5" border="#A7F3D0" color="#047857" icon="checkmark-circle">
          Đã hoàn thành ca làm
        </StatusPill>
        <Text style={styles.cardPrice}>{money(booking.total_value_vnd)}</Text>
      </View>

      <StudentSpotlight info={booking.carepartner_info} compact />

      {!!fmtEnd(booking.ended_at) && (
        <Text style={styles.timestampText}>Hoàn tất lúc {fmtEnd(booking.ended_at)}</Text>
      )}

      {/* Biên lai MoMo Escrow minh bạch 80/20 */}
      <View style={styles.receiptRow}>
        <Ionicons name="receipt-outline" size={13} color={DESIGN.trustEmerald} />
        <Text style={styles.receiptText}>
          Đã giải ngân {money(payout)} cho sinh viên qua MoMo Escrow (80% — phí nền tảng 20%).
        </Text>
      </View>

      {/* Prompt đánh giá 5 sao */}
      <View style={styles.reviewPrompt}>
        <Text style={styles.reviewPromptTitle}>
          ⭐ Bạn thấy {cpName} hỗ trợ bé như thế nào? Hãy đánh giá để tích điểm uy tín cho em ấy!
        </Text>
        <TouchableOpacity
          style={styles.reviewBtn}
          onPress={() => navigation.navigate('Review', {
            taskId: booking.job_id,
            revieweeId: booking.carepartner_id,
          })}
          activeOpacity={0.85}
        >
          <Ionicons name="star" size={13} color="#fff" />
          <Text style={styles.reviewBtnText}>Viết đánh giá ngay</Text>
        </TouchableOpacity>
      </View>

      {/* Quick praise chips — gợi ý nhanh khi đánh giá (Stitch Section C.5) */}
      <View style={styles.praiseRow}>
        {['Đúng giờ', 'Kiên nhẫn', 'Bé thích'].map((tag) => (
          <View key={tag} style={styles.praiseChip}>
            <Text style={styles.praiseChipText}>{tag}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pairRow}>
        {/* Nhật ký chăm sóc — chỉ khả dụng khi đơn gắn với Task luồng cũ có diary */}
        {booking.task_id ? (
          <TouchableOpacity
            style={[styles.btnGhostNeutral, { flex: 1 }]}
            onPress={() => navigation.navigate('CareDiaryDetail', { taskId: booking.task_id })}
            activeOpacity={0.85}
          >
            <Ionicons name="book-outline" size={14} color={DESIGN.textSecondary} />
            <Text style={styles.btnGhostNeutralText}>Xem nhật ký chăm sóc bé</Text>
          </TouchableOpacity>
        ) : null}
        {/* 1-tap Re-book */}
        <TouchableOpacity
          style={[styles.btnRebook, { flex: booking.task_id ? 1 : 2 }]}
          onPress={() => navigation.navigate('JobTypeSelect')}
          activeOpacity={0.85}
        >
          <Ionicons name="repeat" size={14} color={DESIGN.brandOrange} />
          <Text style={styles.btnRebookText}>Đặt lại sinh viên này</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// CARD — Task luồng CŨ (core.Task) — giữ nguyên toàn bộ action thật
// ═══════════════════════════════════════════════════════════════
function LegacyTaskCard({ task, navigation, handlers, moderationMap, actionLoading }) {
  const statusStyle = {
    open: { label: 'Đang tìm CarePartner', accent: DESIGN.accentSky,
            pillBg: '#E0F2FE', pillBorder: '#BAE6FD', pillColor: '#0369A1' },
    in_progress: { label: 'Đang diễn ra', accent: DESIGN.activeBlue,
                   pillBg: '#E0F2FE', pillBorder: '#BAE6FD', pillColor: '#0369A1' },
    completed: { label: 'Hoàn thành', accent: DESIGN.accentEmerald,
                 pillBg: '#ECFDF5', pillBorder: '#A7F3D0', pillColor: '#047857' },
    cancelled: { label: 'Đã huỷ', accent: DESIGN.textMuted,
                 pillBg: '#F1F5F9', pillBorder: '#E2E8F0', pillColor: '#64748B' },
  }[task.status] || { label: task.status, accent: DESIGN.textMuted,
                      pillBg: '#F1F5F9', pillBorder: '#E2E8F0', pillColor: '#64748B' };

  const candidateCount = handlers.candidateCounts[task.id];
  const isCancelling = actionLoading === `${task.id}-cancelled`;
  const isCompleting = actionLoading === `${task.id}-completed`;
  const moderation = task.moderation_status && task.moderation_status !== 'approved'
    ? moderationMap[task.id] : null;

  return (
    <View style={[styles.card, { borderTopColor: statusStyle.accent }]}>
      <View style={styles.cardHeader}>
        <StatusPill bg={statusStyle.pillBg} border={statusStyle.pillBorder} color={statusStyle.pillColor}
          icon={task.status === 'open' ? 'search-outline'
            : task.status === 'completed' ? 'checkmark-circle'
            : task.status === 'cancelled' ? 'close-circle' : 'construct-outline'}>
          {statusStyle.label}
        </StatusPill>
        <Text style={styles.cardPrice}>{money(task.price)}</Text>
      </View>

      {moderation ? (
        <View style={styles.moderationBanner}>
          <Ionicons name="shield-outline" size={14} color={COLORS.warning} />
          <Text style={styles.moderationText} numberOfLines={2}>
            {moderation.status === 'rejected'
              ? 'Việc này không vượt qua kiểm duyệt tự động. Lý do: ' + (moderation.ai_verdict || 'Nội dung không phù hợp')
              : 'Việc này đang chờ Admin xem xét lại.'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.jobTitle} numberOfLines={2}>{task.title}</Text>
      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={13} color={DESIGN.textSecondary} />
        <Text style={styles.metaText}>
          {new Date(task.scheduled_time).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </View>
      {!!task.location && (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={DESIGN.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>{task.location}</Text>
        </View>
      )}

      {/* Banner AI — đếm ứng viên thật từ getCandidates (luồng cũ) */}
      {task.status === 'open' && candidateCount !== undefined && (
        <View style={styles.aiBanner}>
          <Ionicons name="sparkles" size={13} color={DESIGN.brandOrange} />
          <Text style={styles.aiBannerText}>
            AI đã tìm thấy {candidateCount} ứng viên phù hợp quanh khu vực của bạn
          </Text>
        </View>
      )}

      {task.status === 'open' && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.btnSolid, { backgroundColor: DESIGN.brandOrange, flex: 1 }]}
            onPress={() => navigation.navigate('SmartMatches', { taskId: task.id, taskTitle: task.title })}
            activeOpacity={0.85}
          >
            <Ionicons name="sparkles-outline" size={14} color="#fff" />
            <Text style={styles.btnSolidText}>Xem ứng viên phù hợp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnGhostNeutral}
            onPress={() => handlers.onCancelTask(task)}
            disabled={isCancelling}
            activeOpacity={0.85}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color={DESIGN.textSecondary} />
            ) : (
              <Text style={styles.btnGhostNeutralText}>Hủy việc</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {task.status === 'in_progress' && (
        <View style={{ gap: 8 }}>
          <View style={styles.pairRow}>
            <TouchableOpacity
              style={[styles.btnSolid, { backgroundColor: DESIGN.trustEmerald, flex: 1 }]}
              onPress={() => handlers.onCompleteTask(task)}
              disabled={isCompleting}
              activeOpacity={0.85}
            >
              {isCompleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={15} color="#fff" />
                  <Text style={styles.btnSolidText}>Hoàn thành</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}
              onPress={() => navigation.navigate('Chat', { taskId: task.id, taskTitle: task.title })}
              accessibilityRole="button" accessibilityLabel="Nhắn tin với Carepartner"
              activeOpacity={0.85}>
              <Ionicons name="chatbubble-outline" size={17} color={DESIGN.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.secondaryWrap}>
            <TouchableOpacity style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
              activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Thanh toán</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn}
              onPress={handlers.onOpenTracking(task)}
              activeOpacity={0.85}>
              <Ionicons name="location" size={12} color={DESIGN.brandOrange} />
              <Text style={styles.secondaryBtnText}>Theo dõi GPS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn}
              onPress={() => navigation.navigate('CareDiaryDetail', { taskId: task.id, taskTitle: task.title })}
              activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Nhật ký</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {task.status === 'completed' && (
        <View style={{ gap: 8 }}>
          <View style={styles.pairRow}>
            <TouchableOpacity
              style={[styles.btnSolid, { backgroundColor: '#D97706', flex: 1 }]}
              onPress={() => handlers.onReviewTask(task)}
              activeOpacity={0.85}
            >
              <Ionicons name="star-outline" size={15} color="#fff" />
              <Text style={styles.btnSolidText}>Đánh giá Carepartner</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.secondaryWrap}>
            <TouchableOpacity style={styles.secondaryBtn}
              onPress={() => navigation.navigate('CareDiaryDetail', { taskId: task.id, taskTitle: task.title })}
              activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Xem nhật ký chăm sóc</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Chat', { taskId: task.id, taskTitle: task.title })}
              accessibilityRole="button"
              accessibilityLabel="Xem chat với Carepartner (còn 24 giờ sau khi hoàn thành)"
              activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>Chat (24h)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════
export default function MyTasksScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Fade-in animation khi mount
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
  const [moderationMap, setModerationMap] = useState({});
  const [candidateCounts, setCandidateCounts] = useState({});
  const [loadError, setLoadError] = useState('');

  // ── FETCH SONG SONG 2 NGUỒN (Promise.allSettled — không blocking nhau) ──
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

    // Task luồng cũ: đếm ứng viên AI cho các task đang open (banner Stitch)
    const openTasks = nextTasks.filter((t) => t.status === 'open');
    openTasks.forEach(async (t) => {
      try {
        const candRes = await getCandidates(t.id);
        const list = Array.isArray(candRes.data) ? candRes.data : [];
        setCandidateCounts((prev) => ({ ...prev, [t.id]: list.length }));
      } catch (_) { /* im lặng — banner ẩn khi không lấy được */ }
    });

    // Kiểm duyệt AI (giữ nguyên hành vi WIRING FIX 2026-08-21)
    const tasksToCheck = nextTasks.filter(
      (t) => t.moderation_status && t.moderation_status !== 'approved',
    );
    if (tasksToCheck.length > 0) {
      const newMap = {};
      await Promise.allSettled(
        tasksToCheck.map(async (t) => {
          try {
            const modRes = await getTaskModeration(t.id);
            newMap[t.id] = modRes.data;
          } catch (_) { /* ignore */ }
        }),
      );
      if (Object.keys(newMap).length > 0) {
        setModerationMap((prev) => ({ ...prev, ...newMap }));
      }
    }
  }, []);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);
  // Reload khi quay lại màn (chuyển tab bottom nav) — giữ dữ liệu hiển thị
  useFocusEffect(
    useCallback(() => {
      if (!isLoading) fetchAllData({ silent: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchAllData]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllData({ silent: true });
  }, [fetchAllData]);

  // ── PHÂN LOẠI THEO TAB (state machine 2 luồng) ──
  const itemsByTab = useMemo(() => {
    const pending = [];
    const upcoming = [];
    const history = [];
    bookings.forEach((b) => {
      if (PENDING_BOOKING_STATUSES.includes(b.status)) pending.push({ kind: 'booking', data: b });
      else if (UPCOMING_BOOKING_STATUSES.includes(b.status)) upcoming.push({ kind: 'booking', data: b });
      else if (HISTORY_BOOKING_STATUSES.includes(b.status)) history.push({ kind: 'booking', data: b });
    });
    tasks.forEach((t) => {
      if (t.status === 'open') pending.push({ kind: 'task', data: t });
      else if (t.status === 'in_progress') upcoming.push({ kind: 'task', data: t });
      else if (['completed', 'cancelled'].includes(t.status)) history.push({ kind: 'task', data: t });
    });
    return { pending, upcoming, history };
  }, [bookings, tasks]);

  const tabCounts = {
    pending: itemsByTab.pending.length,
    upcoming: itemsByTab.upcoming.length,
    history: itemsByTab.history.length,
  };
  const filtered = itemsByTab[activeTab] || [];

  // ── HANDLERS (toàn bộ gọi API thật) ──
  const openBookingDetail = useCallback((booking) => {
    navigation.navigate('BookingDetail', { bookingId: booking.id });
  }, [navigation]);

  const handleCancelBooking = useCallback((booking) => {
    Alert.alert(
      'Đổi người / Hủy đơn',
      `Hủy đơn "${booking.job_title || 'này'}"? Sinh viên đã chọn sẽ được thông báo, tiền ký quỹ MoMo Escrow được hoàn lại 100%.`,
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
              const msg = e?.response?.data?.detail || e?.response?.data?.error || 'Thao tác thất bại.';
              Alert.alert('Lỗi', typeof msg === 'string' ? msg : 'Thao tác thất bại.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  }, [fetchAllData]);

  const handleRescheduleRespond = useCallback(async (booking, decision) => {
    setActionLoading(`booking-reschedule-${booking.id}`);
    try {
      await respondReschedule(booking.id, decision);
      Alert.alert('Thành công', decision === 'approve' ? 'Đã duyệt giờ mới.' : 'Đã từ chối đổi giờ.');
      await fetchAllData({ silent: true });
    } catch (e) {
      Alert.alert('Lỗi', e?.response?.data?.detail || 'Thao tác thất bại.');
    } finally {
      setActionLoading(null);
    }
  }, [fetchAllData]);

  const handleNoShowReport = useCallback(async (booking, arrived) => {
    setActionLoading(`booking-noshow-${booking.id}`);
    try {
      await reportNoShow(booking.id, arrived);
      Alert.alert('Đã ghi nhận', arrived
        ? 'Ca làm tiếp tục diễn ra như kế hoạch.'
        : 'Hệ thống sẽ xử lý theo chính sách bảo đảm của EduCareLink.');
      await fetchAllData({ silent: true });
    } catch (e) {
      Alert.alert('Lỗi', e?.response?.data?.detail || 'Thao tác thất bại.');
    } finally {
      setActionLoading(null);
    }
  }, [fetchAllData]);

  const handleCompleteBooking = useCallback((booking) => {
    Alert.alert(
      'Xác nhận hoàn thành ca',
      'Bấm khi ca làm đã kết thúc và bạn hài lòng với dịch vụ. Tiền ký quỹ sẽ được giải ngân 80% cho sinh viên.',
      [
        { text: 'Đóng', style: 'cancel' },
        {
          text: 'Hoàn thành',
          onPress: async () => {
            setActionLoading(`booking-complete-${booking.id}`);
            try {
              await completeBooking(booking.id);
              Alert.alert('Thành công', 'Ca làm đã hoàn tất. Tiền được giải ngân qua MoMo Escrow.');
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

  const handleStatusChange = useCallback((taskId, newStatus, taskTitle) => {
    Alert.alert(
      newStatus === 'completed' ? 'Hoàn thành công việc' : 'Huỷ công việc',
      newStatus === 'completed'
        ? `Xác nhận "${taskTitle}" đã hoàn thành? Tiền sẽ được giải ngân cho Carepartner.`
        : `Xác nhận huỷ "${taskTitle}"? Nếu đã thanh toán MoMo, tiền sẽ được hoàn lại.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: newStatus === 'completed' ? 'Hoàn thành' : 'Huỷ việc',
          style: newStatus === 'completed' ? 'default' : 'destructive',
          onPress: async () => {
            setActionLoading(`${taskId}-${newStatus}`);
            try {
              await updateTaskStatus(taskId, newStatus);
              Alert.alert('Thành công', newStatus === 'completed' ? 'Công việc đã hoàn thành.' : 'Công việc đã huỷ.');
              await fetchAllData({ silent: true });
            } catch (e) {
              const msg = e.response?.data?.error || 'Thao tác thất bại.';
              Alert.alert('Lỗi', msg);
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  }, [fetchAllData]);

  // checkConsent TRƯỚC khi navigate LiveTracking (đúng acceptance criteria)
  const handleOpenTracking = useCallback((task) => async () => {
    try {
      const res = await checkConsent(task.id);
      const consent = res.data?.consent?.consent || res.data?.consent;
      if (res.data?.has_consent && consent === 'granted') {
        navigation.navigate('LiveTracking', {
          taskId: task.id,
          taskTitle: task.title,
          taskLatitude: task.latitude,
          taskLongitude: task.longitude,
        });
      } else if (res.data?.has_consent && consent === 'revoked') {
        Alert.alert('Đã dừng', 'Carepartner đã dừng chia sẻ vị trí. Vui lòng liên hệ trực tiếp.');
      } else {
        Alert.alert('Chưa có vị trí', 'Carepartner chưa đồng ý chia sẻ vị trí cho việc này.');
      }
    } catch (_) {
      Alert.alert('Lỗi', 'Không thể kiểm tra trạng thái theo dõi. Vui lòng thử lại.');
    }
  }, [navigation]);

  const handleReviewTask = useCallback(async (task) => {
    try {
      const candRes = await getCandidates(task.id);
      const accepted = candRes.data.find((c) => c.status === 'accepted');
      navigation.navigate('Review', {
        taskId: task.id,
        revieweeId: accepted ? accepted.worker : null,
      });
    } catch (_) {
      navigation.navigate('Review', { taskId: task.id });
    }
  }, [navigation]);

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
        case 'reschedule_requested':
          return (
            <RescheduleBookingCard
              booking={b}
              onOpenDetail={openBookingDetail}
              onRespond={handleRescheduleRespond}
              actionLoading={actionLoading}
            />
          );
        case 'suspected_no_show':
          return (
            <NoShowQuestionCard
              booking={b}
              onOpenDetail={openBookingDetail}
              onReport={handleNoShowReport}
              actionLoading={actionLoading}
            />
          );
        case 'committed':
          return <CommittedBookingCard booking={b} onOpenDetail={openBookingDetail} />;
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
          return <HistoryBookingCard booking={b} navigation={navigation} onOpenDetail={openBookingDetail} />;
      }
    }
    return (
      <LegacyTaskCard
        task={item.data}
        navigation={navigation}
        handlers={{
          candidateCounts,
          onCancelTask: (t) => handleStatusChange(t.id, 'cancelled', t.title),
          onCompleteTask: (t) => handleStatusChange(t.id, 'completed', t.title),
          onOpenTracking: handleOpenTracking,
          onReviewTask: handleReviewTask,
        }}
        moderationMap={moderationMap}
        actionLoading={actionLoading}
      />
    );
  }, [
    actionLoading, candidateCounts, moderationMap, navigation,
    openBookingDetail, handleCancelBooking, handleRescheduleRespond,
    handleNoShowReport, handleCompleteBooking, handleStatusChange,
    handleOpenTracking, handleReviewTask,
  ]);

  const emptyByTab = {
    pending: {
      icon: 'checkmark-circle-outline',
      title: 'Không có đơn nào đang chờ',
      text: 'Khi bạn đăng việc mới hoặc chỉ định sinh viên, đơn sẽ xuất hiện tại đây để bạn xem lại.',
    },
    upcoming: {
      icon: 'event-note-outline',
      title: 'Chưa có ca làm nào sắp tới',
      text: 'Khi sinh viên xác nhận cam kết nhận đơn, ca làm sẽ nhảy vào đây để bạn theo dõi.',
    },
    history: {
      icon: 'library-outline',
      title: 'Chưa có lịch sử hoàn thành',
      text: 'Các ca làm sau khi kết thúc sẽ được lưu trữ tại đây kèm đánh giá và hóa đơn MoMo.',
    },
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={DESIGN.canvas} />

      {/* STICKY TOP APP HEADER (Stitch Section C.1) */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Việc của tôi</Text>
          <Text style={styles.headerSubtitle}>Theo dõi tiến độ gia sư và dịch vụ chăm sóc bé</Text>
        </View>
        <View style={styles.headerRight}>
          <NotificationBell color={DESIGN.brandOrange} />
          <TouchableOpacity
            onPress={() => navigation.navigate('JobTypeSelect')}
            style={styles.newJobPill}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Đăng việc mới"
          >
            <Ionicons name="add" size={14} color={DESIGN.brandOrange} />
            <Text style={styles.newJobPillText}>Đăng việc mới</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3-TAB SEGMENTED CONTROLLER (Stitch Section C.2) */}
      <View style={styles.tabContainer}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabPill, active && styles.tabPillActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={13}
                color={active ? DESIGN.brandOrange : DESIGN.textMuted}
              />
              <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>
                {tab.label} ({tabCounts[tab.key]})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={DESIGN.brandOrange} style={{ marginTop: 60 }} />
      ) : loadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={40} color={DESIGN.textMuted} />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.errorRetryBtn} onPress={() => fetchAllData()} activeOpacity={0.85}>
            <Text style={styles.errorRetryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => `${i.kind}-${i.data.id}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DESIGN.brandOrange} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name={emptyByTab[activeTab].icon} size={38} color={DESIGN.brandOrange} />
              </View>
              <Text style={styles.emptyTitle}>{emptyByTab[activeTab].title}</Text>
              <Text style={styles.emptyText}>{emptyByTab[activeTab].text}</Text>
              {activeTab === 'pending' && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('JobTypeSelect')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>Đăng việc mới ngay</Text>
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
// STYLES — ánh xạ design tokens Stitch (Section B) vào RN StyleSheet
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DESIGN.canvas },

  // === HEADER ===
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: DESIGN.canvas,
  },
  headerLeft: { flex: 1, marginRight: 10 },
  headerTitle: { ...TYPO.h2, color: DESIGN.textPrimary, marginBottom: 3 },
  headerSubtitle: { ...TYPO.bodySmall, color: DESIGN.textSecondary },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  newJobPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: DESIGN.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  newJobPillText: { fontSize: 11, fontWeight: '800', color: DESIGN.brandOrange },

  // === 3-TAB SEGMENTED CONTROLLER ===
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DESIGN.slate100,
    borderRadius: 18,
    padding: 5,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 13,
  },
  tabPillActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  tabPillText: { ...TYPO.caption, color: DESIGN.textMuted, fontWeight: '600' },
  tabPillTextActive: { color: DESIGN.brandOrange, fontWeight: '800' },

  // === LIST ===
  list: { padding: 16, paddingBottom: 32, gap: 12 },

  // === CARD (border-top accent 4px theo trạng thái) ===
  card: {
    backgroundColor: DESIGN.cardSurface,
    borderTopWidth: 4,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: DESIGN.cardBorder,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...SHADOWS.small,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.1 },
  cardPrice: { ...TYPO.h3, color: DESIGN.textPrimary },

  // === COUNTDOWN (amber ribbon) ===
  countdownBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 13,
    padding: 10,
    gap: 3,
  },
  countdownHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdownMain: { flex: 1, fontSize: 12.5, fontWeight: '800', color: '#B45309', lineHeight: 17 },
  countdownMicro: { fontSize: 10.5, color: '#92400E', lineHeight: 15 },

  // === STUDENT SPOTLIGHT BENTO ===
  spotlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 13,
    padding: 10,
  },
  spotlightAvatarWrap: { width: 44, height: 44 },
  spotlightAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FED7AA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightAvatarText: { fontSize: 17, fontWeight: '900', color: '#EA580C' },
  verifiedDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: DESIGN.trustEmerald,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightName: { fontSize: 13.5, fontWeight: '800', color: DESIGN.textPrimary },
  spotlightSchool: { fontSize: 11, color: DESIGN.textSecondary, marginTop: 1 },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  trustChipText: { fontSize: 9.5, fontWeight: '700', color: '#92400E' },

  // === JOB META ===
  jobTitle: { ...TYPO.h4, color: DESIGN.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: 11.5, color: DESIGN.textSecondary, lineHeight: 16 },

  // === TIMING / GPS / PHONE ===
  timingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  timingBadgeText: { fontSize: 11.5, fontWeight: '800', color: '#047857' },
  gpsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  gpsStripText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#0369A1' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: DESIGN.textSecondary },

  // === ACTIONS ===
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
  },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnSolid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  btnSolidText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: DESIGN.brandOrange,
  },
  btnOutlineText: { color: DESIGN.brandOrange, fontSize: 12, fontWeight: '800' },
  btnSubtleDanger: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6 },
  btnSubtleDangerText: { color: DESIGN.alertCrimson, fontSize: 11.5, fontWeight: '700' },
  btnGhostNeutral: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnGhostNeutralText: { color: DESIGN.textSecondary, fontSize: 12, fontWeight: '700' },
  btnRebook: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: DESIGN.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  btnRebookText: { color: DESIGN.brandOrange, fontSize: 12, fontWeight: '800' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DESIGN.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // === SECONDARY / MISC ===
  secondaryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryBtnText: { fontSize: 11, fontWeight: '700', color: DESIGN.brandOrange },
  hintText: { fontSize: 11.5, color: DESIGN.textSecondary, lineHeight: 16 },
  timestampText: { fontSize: 10.5, color: DESIGN.textMuted },
  refundRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refundText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: '#B45309', lineHeight: 16 },
  receiptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  receiptText: { flex: 1, fontSize: 11, color: '#065F46', lineHeight: 16, fontWeight: '600' },
  sosLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  sosLinkText: { fontSize: 11, fontWeight: '700', color: DESIGN.alertCrimson },

  // === REVIEW (history card) ===
  reviewPrompt: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 13,
    padding: 10,
    gap: 8,
  },
  reviewPromptTitle: { fontSize: 11.5, color: '#92400E', fontWeight: '600', lineHeight: 16 },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F59E0B',
    borderRadius: 11,
    paddingVertical: 9,
  },
  reviewBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  praiseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  praiseChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  praiseChipText: { fontSize: 10, fontWeight: '700', color: DESIGN.textSecondary },

  // === MODERATION (task luồng cũ) ===
  moderationBanner: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningBg,
    padding: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  moderationText: { flex: 1, fontSize: 11, color: COLORS.warning, lineHeight: 15, fontWeight: '600' },

  // === AI BANNER (task open) ===
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: DESIGN.brandOrangeLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  aiBannerText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#C2410C', lineHeight: 15 },

  // === ERROR / EMPTY ===
  errorBox: { alignItems: 'center', paddingTop: 60, gap: 10, paddingHorizontal: 30 },
  errorText: { ...TYPO.bodySmall, color: DESIGN.textSecondary, textAlign: 'center' },
  errorRetryBtn: {
    backgroundColor: DESIGN.brandOrange,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  errorRetryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DESIGN.brandOrangeLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: DESIGN.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: DESIGN.textSecondary, textAlign: 'center', paddingHorizontal: 24 },
  emptyBtn: {
    backgroundColor: DESIGN.brandOrange,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
    marginTop: 8,
  },
  emptyBtnText: { ...TYPO.button, color: '#FFFFFF' },
});





