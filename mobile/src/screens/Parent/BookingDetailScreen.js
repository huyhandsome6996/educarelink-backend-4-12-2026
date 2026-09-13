// ============================================================
// BookingDetailScreen — Flow 1 Step 5/12: chi tiết đơn ghép cặp
// Parent view: giữ nguyên luồng và giao diện của Phụ huynh.
// CarePartner view: nâng cấp toàn diện theo bản thiết kế Google Stitch
// (Bento lịch trình, bảo đảm Escrow, đúng 2 nút Xác nhận/Từ chối).
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, TextInput, Modal, Platform, Linking, Animated, Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { SUPPORT_HOTLINE } from '../../config/appConfig';
import { useAuth } from '../../context/AuthContext';
import {
  getBookingDetail, cancelBooking, cancelBookingByParent,
  reportNoShow, startBooking, completeBooking, respondReschedule, commitBooking,
  CANCEL_REASONS,
} from '../../api/matching';

export default function BookingDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch (_) {}
  const { bookingId } = route.params || {};

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [supportModal, setSupportModal] = useState(false);
  const [reasonCode, setReasonCode] = useState('school_schedule');
  const [note, setNote] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await getBookingDetail(bookingId);
      setBooking(data);
      setSecondsLeft(data.seconds_left || 0);
    } catch (err) {
      setLoadError('Không tải được chi tiết đơn. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { load(); }, [load]);

  // Đếm ngược cửa sổ cam kết
  useEffect(() => {
    if (booking?.status !== 'awaiting_commitment' || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [booking?.status, secondsLeft]);

  const run = async (fn, successMsg) => {
    setActionLoading(true);
    try {
      await fn();
      if (successMsg) Alert.alert('Thành công', successMsg);
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      Alert.alert('Lỗi', typeof detail === 'string' ? detail : 'Thao tác thất bại.');
    } finally {
      setActionLoading(false);
    }
  };

  // Confirmation Jump (QA 2026-09-13): sau khi CarePartner xác nhận cam kết
  // thành công → điều hướng về "Việc của tôi" tab Sắp làm và highlight đúng
  // đơn vừa cam kết. KHÔNG áp dụng cho nhánh Parent (dùng chung file này).
  const handleCommitAndJump = async () => {
    setActionLoading(true);
    try {
      await commitBooking(bookingId);
      Alert.alert(
        'Thành công',
        'Đã cam kết nhận đơn thành công! Ca làm đã chuyển sang mục Sắp làm.',
        [{
          text: 'Xem ca sắp làm',
          onPress: () => navigation.navigate('MyJobs', {
            screen: 'MyJobsMain',
            params: { initialTab: 'upcoming', highlightBookingId: String(bookingId) },
          }),
        }, { text: 'Ở lại', style: 'cancel' }],
      );
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      Alert.alert('Không thể xác nhận', typeof detail === 'string' ? detail : 'Không thể xác nhận lúc này, vui lòng thử lại.');
    } finally {
      setActionLoading(false);
    }
  };

  const submitCancel = async () => {
    if (isParent) {
      setCancelModal(false);
      await run(() => cancelBookingByParent(bookingId, note.trim()),
        'Đã hủy đơn thành công.');
      return;
    }
    const reason = CANCEL_REASONS.find((r) => r.code === reasonCode);
    if (!reason) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn lý do từ chối.');
    if (reason.forceMajeure && note.trim().length > 0 && note.trim().length < 20) {
      return Alert.alert('Lý do bất khả kháng',
        'Cần ghi chú ít nhất 20 ký tự để minh bạch với phụ huynh.');
    }
    setCancelModal(false);
    await run(() => cancelBooking(bookingId, {
      reason_code: reasonCode, note: note.trim(), evidence: [],
    }), 'Đã từ chối nhận đơn. Hệ thống đã mở lại slot cho bạn sinh viên khác mà không trừ điểm ELO.');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F26522" />
        <Text style={{ marginTop: 12, color: '#64748B', fontSize: 13 }}>Đang tải chi tiết đơn...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={46} color="#94A3B8" />
        <Text style={{ marginTop: 10, color: '#64748B', textAlign: 'center', fontSize: 14 }}>{loadError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={{ color: '#64748B' }}>Không tìm thấy đơn.</Text>
      </View>
    );
  }

  const isCarePartner = user?.role === 'worker' || (user?.id && booking.carepartner_id && String(user.id) === String(booking.carepartner_id));
  const isParent = !isCarePartner && (user?.role === 'parent' || (user?.id && booking.parent_id && String(user.id) === String(booking.parent_id)));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  // ============================================================
  // LUỒNG PHỤ HUYNH — NÂNG CẤP THEO BẢN THIẾT KẾ STITCH 2026-09-13
  // 3 giai đoạn: awaiting_commitment / committed+in_progress / completed.
  // Toàn bộ dữ liệu từ API thật (booking.carepartner_info, first_slot,
  // total_value_vnd...). Giữ nguyên luồng CarePartner bên dưới (KHÔNG ĐỤNG).
  // ============================================================
  if (isParent) {
    const cpInfo = booking.carepartner_info || {};
    const phone = cpInfo.phone || '';
    const isAwaiting = booking.status === 'awaiting_commitment';
    const isShiftActive = ['committed', 'in_progress'].includes(booking.status);
    const isCompleted = booking.status === 'completed';
    const isEndedElse = ['cancelled_by_parent', 'cancelled_by_carepartner', 'no_show',
      'no_show_unconfirmed', 'declined_in_window', 'expired_no_response', 'disputed']
      .includes(booking.status);

    // Pass candidate-object cho CandidateProfileV2 từ hồ sơ công khai API
    const candidateForProfile = {
      carepartner_id: booking.carepartner_id,
      display_name: cpInfo.full_name || 'CarePartner',
      avatar_url: cpInfo.avatar_url || '',
      school: cpInfo.school || '',
      major: cpInfo.major || '',
      rating: cpInfo.rating_avg || 0,
      completed_jobs: cpInfo.jobs_completed || 0,
    };

    return (
      <View style={parentStyles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

        {/* STICKY TOP APP BAR (Stitch Section C.1) */}
        <View style={[parentStyles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={parentStyles.circleBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={21} color="#1E293B" />
          </TouchableOpacity>
          <View style={parentStyles.topBarCenter}>
            <Text style={parentStyles.orderCode}>MÃ ĐƠN #{String(booking.id || '').slice(0, 8).toUpperCase()}</Text>
            <Text style={parentStyles.topBarTitle}>Chi tiết ca chăm sóc & gia sư</Text>
          </View>
          <TouchableOpacity
            style={parentStyles.circleBtn}
            onPress={() => setSupportModal(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Hotline hỗ trợ 24/7 ${SUPPORT_HOTLINE}`}
            activeOpacity={0.85}
          >
            <Ionicons name="headset-outline" size={19} color="#64748B" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            parentStyles.scrollContent,
            (isAwaiting || isShiftActive) ? { paddingBottom: 130 } : { paddingBottom: 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ GIAI ĐOẠN 1 — AWAITING COMMITMENT ═══ */}
          {isAwaiting && (
            <AwaitingCommitmentView booking={booking} secondsLeft={secondsLeft} />
          )}

          {/* ═══ GIAI ĐOẠN 2 — COMMITTED / IN-PROGRESS ═══ */}
          {isShiftActive && (
            <ActiveShiftView booking={booking} onCallSupport={() => setSupportModal(true)} navigation={navigation} />
          )}

          {/* ═══ GIAI ĐOẠN 3 — COMPLETED ═══ */}
          {isCompleted && (
            <CompletedShiftView booking={booking} navigation={navigation} />
          )}

          {/* ═══ TRẠNG THÁI KẾT THÚC KHÁC (hủy / no_show / hết hạn) ═══ */}
          {isEndedElse && <EndedBookingView booking={booking} />}

          {/* Sự kiện đặc biệt: nghi ngờ không đến — PH phải xác nhận */}
          {booking.status === 'suspected_no_show' && (
            <View style={parentStyles.bentoCard}>
              <Text style={parentStyles.questionTitle}>CarePartner đã đến chưa?</Text>
              <View style={parentStyles.pairRow}>
                <TouchableOpacity style={[parentStyles.btnSolid, { backgroundColor: '#0E9F6E', flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => reportNoShow(bookingId, true))}
                  activeOpacity={0.85}>
                  <Text style={parentStyles.btnSolidText}>Đã đến</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[parentStyles.btnSolid, { backgroundColor: '#DC2626', flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => reportNoShow(bookingId, false))}
                  activeOpacity={0.85}>
                  <Text style={parentStyles.btnSolidText}>Không đến</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Sự kiện đặc biệt: CP xin đổi giờ — PH Đồng ý/Từ chối */}
          {booking.status === 'reschedule_requested' && (
            <View style={parentStyles.bentoCard}>
              <Text style={parentStyles.questionTitle}>CarePartner xin đổi giờ</Text>
              <View style={parentStyles.pairRow}>
                <TouchableOpacity style={[parentStyles.btnSolid, { backgroundColor: '#0E9F6E', flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => respondReschedule(bookingId, 'approve'), 'Đã duyệt giờ mới.')}
                  activeOpacity={0.85}>
                  <Text style={parentStyles.btnSolidText}>Đồng ý</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[parentStyles.btnSolid, { backgroundColor: '#DC2626', flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => respondReschedule(bookingId, 'decline'))}
                  activeOpacity={0.85}>
                  <Text style={parentStyles.btnSolidText}>Từ chối</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ═══ FIXED BOTTOM DOCK — ĐỔI THEO GIAI ĐOẠN (Stitch Section C.8) ═══ */}
        {isAwaiting && (
          <View style={[parentStyles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={parentStyles.dockBtnRow}>
              {/* NÚT 1 (35%): Đổi sinh viên → mở modal hủy (cancelBookingByParent) */}
              <TouchableOpacity
                style={parentStyles.dockSecondaryBtn}
                disabled={actionLoading}
                onPress={() => { setReasonCode(''); setNote(''); setCancelModal(true); }}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-horizontal-outline" size={16} color="#475569" />
                <Text style={parentStyles.dockSecondaryBtnText}>Đổi sinh viên</Text>
              </TouchableOpacity>

              {/* NÚT 2 (65%): Xem hồ sơ đầy đủ → CandidateProfileV2 */}
              <TouchableOpacity
                style={parentStyles.dockPrimaryBtn}
                disabled={actionLoading}
                onPress={() => navigation.navigate('CandidateProfileV2', {
                  candidate: candidateForProfile,
                  jobId: booking.job_id,
                })}
                activeOpacity={0.85}
              >
                <Text style={parentStyles.dockPrimaryBtnText}>Xem hồ sơ đầy đủ</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={parentStyles.dockMicroCopy}>
              Nếu sinh viên không nhận sau thời hạn, đơn sẽ tự mở lại miễn phí.
            </Text>
          </View>
        )}

        {isShiftActive && (
          <View style={[parentStyles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={parentStyles.dockBtnRow}>
              {/* NÚT GỌI (30%) — SĐT thật từ API, chỉ mở khi đã cam kết */}
              {phone ? (
                <TouchableOpacity
                  style={parentStyles.dockCallBtn}
                  onPress={() => Linking.openURL(`tel:${phone}`)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Gọi điện cho sinh viên ${phone}`}
                >
                  <Ionicons name="call" size={18} color="#047857" />
                </TouchableOpacity>
              ) : null}

              {/* NÚT CHÍNH (70%): Xác nhận hoàn thành ca → completeBooking */}
              <TouchableOpacity
                style={[parentStyles.dockCompleteBtn, !phone && { flex: 1 }]}
                disabled={actionLoading}
                onPress={() => run(
                  () => completeBooking(bookingId),
                  'Ca làm đã hoàn tất. Tiền ký quỹ được giải ngân 80% cho sinh viên qua MoMo Escrow.',
                )}
                activeOpacity={0.85}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-done" size={16} color="#fff" />
                    <Text style={parentStyles.dockCompleteBtnText}>Xác nhận hoàn thành ca</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <Text style={parentStyles.dockMicroCopy}>
              Bấm khi ca làm đã kết thúc và bạn hài lòng với dịch vụ.
            </Text>
          </View>
        )}

        {isCompleted && (
          <View style={[parentStyles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {/* HERO CTA: 1-tap Re-book tuần sau */}
            <TouchableOpacity
              style={parentStyles.dockRebookBtn}
              onPress={() => navigation.navigate('JobTypeSelect')}
              activeOpacity={0.85}
            >
              <Ionicons name="repeat" size={16} color="#fff" />
              <Text style={parentStyles.dockRebookBtnText}>Đặt lại bạn sinh viên này cho tuần sau</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={parentStyles.dockLinkRow}
              onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
              activeOpacity={0.85}
            >
              <Text style={parentStyles.dockLinkText}>Cần hỗ trợ hóa đơn? Hotline {SUPPORT_HOTLINE}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ MODAL HỦY CHO PHỤ HUYNH (cancelBookingByParent — giữ nguyên luồng) ═══ */}
        <Modal visible={cancelModal} transparent animationType="slide"
          onRequestClose={() => setCancelModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={parentStyles.modalSheet}>
              <View style={parentStyles.sheetDragHandle} />
              <Text style={parentStyles.modalTitle}>Xác nhận hủy đơn</Text>
              <Text style={parentStyles.modalHint}>
                Bạn có chắc chắn muốn hủy đơn này? Nếu hủy sát giờ (dưới 3h trước ca),
                CarePartner có thể được hỗ trợ điểm tín nhiệm. Tiền ký quỹ MoMo Escrow
                được hoàn lại 100% vào ví của bạn.
              </Text>
              <TextInput style={parentStyles.noteInput}
                placeholder="Ghi chú lý do hủy (tùy chọn)"
                value={note} onChangeText={setNote} multiline
                textAlignVertical="top" />
              <View style={parentStyles.pairRow}>
                <TouchableOpacity style={[parentStyles.modalBtn, parentStyles.modalCancelBtn]}
                  onPress={() => setCancelModal(false)} activeOpacity={0.85}>
                  <Text style={parentStyles.modalCancelText}>Đóng</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[parentStyles.modalBtn, parentStyles.modalOkBtn]}
                  onPress={submitCancel} disabled={actionLoading} activeOpacity={0.85}>
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={parentStyles.modalOkText}>Xác nhận hủy</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ═══ SUPPORT HOTLINE MODAL ═══ */}
        <Modal visible={supportModal} transparent animationType="fade"
          onRequestClose={() => setSupportModal(false)}>
          <View style={stitchStyles.modalOverlay}>
            <View style={stitchStyles.supportBox}>
              <View style={stitchStyles.supportIconCircle}>
                <Ionicons name="headset" size={28} color="#2563EB" />
              </View>
              <Text style={stitchStyles.supportTitle}>Tổng đài Hỗ trợ Phụ huynh</Text>
              <Text style={stitchStyles.supportSub}>
                Cần hỗ trợ về ca làm, thanh toán hoặc sự cố khẩn cấp?
              </Text>
              <TouchableOpacity
                style={stitchStyles.hotlineCallBtn}
                onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
                activeOpacity={0.85}
              >
                <Ionicons name="call" size={18} color="#EA580C" />
                <Text style={stitchStyles.hotlineCallText}>Hotline {SUPPORT_HOTLINE}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={stitchStyles.supportCloseBtn}
                onPress={() => setSupportModal(false)}
                activeOpacity={0.85}
              >
                <Text style={stitchStyles.supportCloseBtnText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ============================================================
  // LUỒNG CAREPARTNER — NÂNG CẤP THEO THIẾT KẾ GOOGLE STITCH
  // ============================================================
  const payoutVnd = booking.carepartner_payout_vnd ?? Math.round((booking.total_value_vnd || 0) * 0.8);
  const parentName = booking.parent_name || 'Phụ huynh';
  const categoryLabel = booking.category_name_vi || 'Gia sư / Chăm sóc';
  const slot = booking.first_slot;
  const isAwaiting = booking.status === 'awaiting_commitment';
  const isCommitted = booking.status === 'committed';
  const isInProgress = booking.status === 'in_progress';
  const isPenalty = ['cancelled_by_carepartner', 'no_show', 'no_show_unconfirmed', 'suspected_no_show'].includes(booking.status);

  return (
    <View style={stitchStyles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* STICKY TOP APP BAR */}
      <View style={[stitchStyles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={stitchStyles.circleBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#1E293B" />
        </TouchableOpacity>

        <View style={stitchStyles.topBarCenter}>
          <Text style={stitchStyles.orderCode}>MÃ ĐƠN #{booking.id?.slice(0, 8).toUpperCase()}</Text>
          <Text style={stitchStyles.topBarTitle}>Chi tiết ca làm được giao</Text>
        </View>

        <TouchableOpacity
          style={stitchStyles.circleBtn}
          onPress={() => setSupportModal(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="headset-outline" size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          stitchStyles.scrollContent,
          isAwaiting ? { paddingBottom: 120 } : { paddingBottom: 50 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* URGENT COUNTDOWN BANNER (Khi chờ xác nhận) */}
        {isAwaiting && (
          <View style={stitchStyles.countdownBanner}>
            <View style={stitchStyles.hourglassCircle}>
              <Ionicons name="hourglass" size={20} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={stitchStyles.countdownTimeRow}>
                <Text style={stitchStyles.countdownLabel}>Thời gian suy nghĩ còn:</Text>
                <View style={stitchStyles.countdownPill}>
                  <Text style={stitchStyles.countdownPillText}>{mm}:{ss}</Text>
                </View>
              </View>
              <Text style={stitchStyles.countdownHint}>
                Tự động nhường ca cho bạn khác nếu hết giờ (không trừ điểm uy tín).
              </Text>
            </View>
          </View>
        )}

        {/* HERO SUMMARY CARD (The Job Identity & Escrow Payout) */}
        <View style={stitchStyles.heroCard}>
          <View style={stitchStyles.heroAccentLine} />

          <View style={stitchStyles.tagRow}>
            <View style={stitchStyles.categoryTag}>
              <Ionicons name="book-outline" size={13} color="#EA580C" />
              <Text style={stitchStyles.categoryTagText}>{categoryLabel}</Text>
            </View>
            <View style={[
              stitchStyles.statusTag,
              isAwaiting && stitchStyles.statusTagAmber,
              isCommitted && stitchStyles.statusTagGreen,
            ]}>
              <View style={[
                stitchStyles.statusDot,
                isAwaiting ? { backgroundColor: '#F59E0B' } : { backgroundColor: '#10B981' },
              ]} />
              <Text style={[
                stitchStyles.statusTagText,
                isAwaiting && { color: '#B45309' },
                isCommitted && { color: '#047857' },
              ]}>
                {booking.status_label_vi || 'Chờ bạn xác nhận'}
              </Text>
            </View>
          </View>

          <Text style={stitchStyles.jobTitleText}>{booking.job_title || 'Công việc ghép cặp'}</Text>

          {/* Guaranteed Escrow Payout Box */}
          <View style={stitchStyles.payoutBox}>
            <View style={{ flex: 1 }}>
              <View style={stitchStyles.payoutLabelRow}>
                <Ionicons name="shield-checkmark" size={14} color="#0E9F6E" />
                <Text style={stitchStyles.payoutLabelText}>Thù lao ca làm này</Text>
              </View>
              <View style={stitchStyles.amountRow}>
                <Text style={stitchStyles.amountText}>{Number(payoutVnd).toLocaleString('vi-VN')}đ</Text>
                <Text style={stitchStyles.amountSub}>/ ca làm</Text>
              </View>
              <View style={stitchStyles.escrowNoticeRow}>
                <View style={stitchStyles.greenDot} />
                <Text style={stitchStyles.escrowNoticeText}>Đã ký quỹ MoMo Escrow 100% · Tự động giải ngân</Text>
              </View>
            </View>
            <View style={stitchStyles.hourlyBadge}>
              <Text style={stitchStyles.hourlyBadgeText}>
                {booking.hourly_rate_vnd ? `${Math.round(booking.hourly_rate_vnd / 1000)}k/h` : '80% net'}
              </Text>
            </View>
          </View>
        </View>

        {/* SCHEDULE & TIME BENTO */}
        <View style={stitchStyles.bentoCard}>
          <View style={stitchStyles.bentoHeaderRow}>
            <Ionicons name="calendar-outline" size={16} color="#EA580C" />
            <Text style={stitchStyles.bentoHeaderTitle}>LỊCH & THỜI LƯỢNG CA LÀM</Text>
          </View>

          <View style={stitchStyles.bentoGrid}>
            <View style={stitchStyles.bentoCol}>
              <View style={stitchStyles.bentoColIconRow}>
                <Ionicons name="today-outline" size={13} color="#64748B" />
                <Text style={stitchStyles.bentoColLabel}>Ngày làm việc</Text>
              </View>
              <Text style={stitchStyles.bentoColValue}>
                {slot?.day_of_week_vi ? `${slot.day_of_week_vi}, ` : ''}{slot?.date_vi || slot?.date || 'Theo thỏa thuận'}
              </Text>
              <View style={stitchStyles.matchPill}>
                <Ionicons name="checkmark-circle" size={12} color="#0E9F6E" />
                <Text style={stitchStyles.matchPillText}>Trùng 100% lịch rảnh</Text>
              </View>
            </View>

            <View style={stitchStyles.bentoCol}>
              <View style={stitchStyles.bentoColIconRow}>
                <Ionicons name="time-outline" size={13} color="#64748B" />
                <Text style={stitchStyles.bentoColLabel}>Khung giờ</Text>
              </View>
              <Text style={stitchStyles.bentoColValue}>
                {slot?.time_from?.slice(0, 5) || '17:30'} – {slot?.time_to?.slice(0, 5) || '19:30'}
              </Text>
              <Text style={stitchStyles.durationHint}>Ca làm tiêu chuẩn</Text>
            </View>
          </View>
        </View>

        {/* FAMILY & CHILD DETAILS BENTO */}
        <View style={stitchStyles.bentoCard}>
          <View style={stitchStyles.bentoHeaderRow}>
            <Ionicons name="people-outline" size={16} color="#EA580C" />
            <Text style={stitchStyles.bentoHeaderTitle}>PHỤ HUYNH & HỌC SINH</Text>
          </View>

          {/* Parent Profile Strip */}
          <View style={stitchStyles.parentStrip}>
            <View style={stitchStyles.parentAvatarCircle}>
              <Text style={stitchStyles.parentAvatarInitial}>{parentName[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={stitchStyles.parentNameVerifiedRow}>
                <Text style={stitchStyles.parentFullName}>{parentName}</Text>
                <View style={stitchStyles.cccdBadge}>
                  <Ionicons name="checkmark-circle" size={11} color="#0E9F6E" />
                  <Text style={stitchStyles.cccdBadgeText}>Đã xác thực CCCD</Text>
                </View>
              </View>
              <Text style={stitchStyles.parentSubInfo}>
                {isCommitted && booking.parent_info?.phone
                  ? `SĐT: ${booking.parent_info.phone}`
                  : 'SĐT sẽ hiển thị sau khi nhận việc'}
              </Text>
              <View style={stitchStyles.parentRepRow}>
                <Text style={stitchStyles.starRep}>⭐ 5.0</Text>
                <Text style={stitchStyles.dotSep}>•</Text>
                <Text style={stitchStyles.repItem}>Đã thanh toán Escrow</Text>
                <Text style={stitchStyles.dotSep}>•</Text>
                <Text style={stitchStyles.reputationHighlight}>Đúng hẹn</Text>
              </View>
            </View>
          </View>

          {/* Child Specifics (nếu có) */}
          {booking.child_info?.age_group ? (
            <View style={stitchStyles.childBox}>
              <Ionicons name="happy-outline" size={18} color="#EA580C" />
              <View style={{ flex: 1 }}>
                <Text style={stitchStyles.childAgeText}>Độ tuổi: {booking.child_info.age_group}</Text>
                {booking.child_info.number_of_children ? (
                  <Text style={stitchStyles.childCountText}>Số lượng bé: {booking.child_info.number_of_children}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Locked Contact Notice khi chưa cam kết */}
          {isAwaiting && (
            <View style={stitchStyles.lockedNoticeBox}>
              <Ionicons name="lock-closed" size={14} color="#64748B" />
              <Text style={stitchStyles.lockedNoticeText}>
                Số điện thoại và hướng dẫn vào nhà sẽ mở ngay sau khi bạn bấm Xác nhận cam kết.
              </Text>
            </View>
          )}
        </View>

        {/* LOCATION & ROUTE PREVIEW */}
        <View style={stitchStyles.bentoCard}>
          <View style={stitchStyles.bentoHeaderRow}>
            <Ionicons name="location-outline" size={16} color="#EA580C" />
            <Text style={stitchStyles.bentoHeaderTitle}>ĐỊA ĐIỂM & ĐƯỜNG ĐI</Text>
          </View>

          <View style={stitchStyles.addressBox}>
            <View style={stitchStyles.addressIconCircle}>
              <Ionicons name="navigate" size={15} color="#EA580C" />
            </View>
            <Text style={stitchStyles.addressText}>
              {booking.job_address || booking.location_info?.address || 'Địa chỉ làm việc tại nhà phụ huynh'}
            </Text>
          </View>

          {/* Live GPS Protection Pill */}
          <View style={stitchStyles.gpsPill}>
            <Ionicons name="shield-half" size={14} color="#0E9F6E" />
            <Text style={stitchStyles.gpsPillText}>
              Ca làm được bảo vệ bằng định vị an toàn 2 chiều trong suốt thời gian làm việc.
            </Text>
          </View>
        </View>

        {/* SPECIAL REQUIREMENTS & TASKS (nếu có) */}
        {(booking.job_description || booking.child_info?.notes) ? (
          <View style={stitchStyles.bentoCard}>
            <View style={stitchStyles.bentoHeaderRow}>
              <Ionicons name="document-text-outline" size={16} color="#EA580C" />
              <Text style={stitchStyles.bentoHeaderTitle}>NỘI DUNG & YÊU CẦU CÔNG VIỆC</Text>
            </View>
            <Text style={stitchStyles.descriptionText}>
              {booking.job_description || booking.child_info?.notes}
            </Text>
          </View>
        ) : null}

        {/* ESCROW COMMITMENT POLICY REMINDER (Dark Slate Card) */}
        <View style={stitchStyles.escrowPolicyCard}>
          <View style={stitchStyles.escrowPolicyHeader}>
            <Ionicons name="lock-closed-outline" size={17} color="#FED7AA" />
            <Text style={stitchStyles.escrowPolicyTitle}>Bảo đảm an toàn thu nhập 100%</Text>
          </View>
          <Text style={stitchStyles.escrowPolicyText}>
            Khoản thù lao đã được phụ huynh nộp vào tài khoản ký quỹ MoMo Escrow an toàn. Khi bạn hoàn thành ca làm và bấm Kết thúc, tiền công sẽ được giải ngân ngay lập tức.
          </Text>
        </View>

        {/* CÁC NÚT THAO TÁC CHO TRẠNG THÁI KHÁC (Khi đã cam kết hoặc đang làm) */}
        {isCommitted && (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TouchableOpacity
              style={stitchStyles.fullWidthCommitBtn}
              disabled={actionLoading}
              onPress={() => run(() => startBooking(bookingId), 'Đã bắt đầu ca làm việc.')}
            >
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={stitchStyles.fullWidthCommitBtnText}>Bắt đầu làm việc</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={stitchStyles.subCancelBtn}
              disabled={actionLoading}
              onPress={() => { setReasonCode('school_schedule'); setNote(''); setCancelModal(true); }}
            >
              <Text style={stitchStyles.subCancelBtnText}>Hủy ca làm này</Text>
            </TouchableOpacity>
          </View>
        )}

        {isInProgress && (
          <View style={{ marginTop: 14 }}>
            <TouchableOpacity
              style={[stitchStyles.fullWidthCommitBtn, { backgroundColor: '#0E9F6E' }]}
              disabled={actionLoading}
              onPress={() => run(() => completeBooking(bookingId), 'Đã hoàn thành ca làm! Tiền công sẽ được giải ngân qua Escrow.')}
            >
              <Ionicons name="checkmark-done" size={18} color="#fff" />
              <Text style={stitchStyles.fullWidthCommitBtnText}>Kết thúc đơn & Giải ngân</Text>
            </TouchableOpacity>
          </View>
        )}

        {isPenalty && (
          <TouchableOpacity
            style={stitchStyles.appealBtn}
            onPress={() => navigation.navigate('Appeal', { bookingId: booking.id })}
          >
            <Ionicons name="scale-outline" size={17} color="#B45309" />
            <Text style={stitchStyles.appealBtnText}>⚖️ Gửi đơn kháng cáo điểm ELO</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* FIXED BOTTOM ACTION DOCK (STRICT 2-BUTTON RULE: TỪ CHỐI vs XÁC NHẬN CAM KẾT) */}
      {isAwaiting && (
        <View style={[stitchStyles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={stitchStyles.dockBtnRow}>
            {/* NÚT 1: TỪ CHỐI / HUỶ ĐƠN (35% width, Secondary) */}
            <TouchableOpacity
              style={stitchStyles.declineDockBtn}
              disabled={actionLoading}
              onPress={() => { setReasonCode('school_schedule'); setNote(''); setCancelModal(true); }}
              activeOpacity={0.88}
            >
              <Ionicons name="close-circle-outline" size={17} color="#475569" />
              <Text style={stitchStyles.declineDockBtnText}>Từ chối</Text>
            </TouchableOpacity>

            {/* NÚT 2: XÁC NHẬN CAM KẾT (65% width, Primary Full Brand CTA) */}
            <TouchableOpacity
              style={stitchStyles.confirmDockBtn}
              disabled={actionLoading}
              onPress={handleCommitAndJump}
              activeOpacity={0.88}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={stitchStyles.confirmDockBtnText}>Xác nhận cam kết</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={stitchStyles.dockMicroCopy}>
            Bấm <Text style={{ color: '#EA580C', fontWeight: '700' }}>Xác nhận</Text> ca sẽ lập tức chuyển vào lịch <Text style={{ fontWeight: '700', color: '#1E293B' }}>Sắp làm</Text> của bạn.
          </Text>
        </View>
      )}

      {/* DECLINE REASON BOTTOM SHEET MODAL (Stitch Design) */}
      <Modal
        visible={cancelModal}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelModal(false)}
      >
        <View style={stitchStyles.modalOverlay}>
          <View style={stitchStyles.modalSheet}>
            <View style={stitchStyles.sheetDragHandle} />

            <View style={stitchStyles.sheetHeaderRow}>
              <Text style={stitchStyles.sheetTitle}>Chọn lý do từ chối đơn</Text>
              <TouchableOpacity
                style={stitchStyles.sheetCloseBtn}
                onPress={() => setCancelModal(false)}
              >
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={stitchStyles.sheetSubtext}>
              Đơn sẽ được hệ thống chuyển tự động cho bạn khác. Vì từ chối trước hạn quy định, bạn <Text style={{ color: '#0E9F6E', fontWeight: '700' }}>không bị trừ điểm uy tín ELO</Text>.
            </Text>

            <ScrollView style={{ maxHeight: 260 }}>
              {[
                { code: 'school_schedule', label: 'Trùng lịch học đột xuất tại trường' },
                { code: 'transport', label: 'Khoảng cách di chuyển quá xa so với dự tính' },
                { code: 'health', label: 'Lý do sức khỏe hoặc việc gia đình đột xuất' },
                { code: 'wrong_job_info', label: 'Yêu cầu ca kèm chưa phù hợp năng lực' },
                { code: 'other', label: 'Lý do cá nhân khác' },
              ].map((r) => {
                const isSelected = reasonCode === r.code;
                return (
                  <TouchableOpacity
                    key={r.code}
                    style={[stitchStyles.reasonCard, isSelected && stitchStyles.reasonCardActive]}
                    onPress={() => setReasonCode(r.code)}
                    activeOpacity={0.8}
                  >
                    <View style={[stitchStyles.radioCircle, isSelected && stitchStyles.radioCircleActive]}>
                      {isSelected && <View style={stitchStyles.radioDot} />}
                    </View>
                    <Text style={[stitchStyles.reasonLabel, isSelected && stitchStyles.reasonLabelActive]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={stitchStyles.sheetNoteInput}
              placeholder="Ghi chú thêm (tùy chọn)..."
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
            />

            <View style={stitchStyles.sheetActionGrid}>
              <TouchableOpacity
                style={stitchStyles.sheetBackBtn}
                onPress={() => setCancelModal(false)}
              >
                <Text style={stitchStyles.sheetBackBtnText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={stitchStyles.sheetSubmitBtn}
                onPress={submitCancel}
                disabled={actionLoading}
              >
                <Text style={stitchStyles.sheetSubmitBtnText}>Xác nhận từ chối</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* SUPPORT HOTLINE MODAL */}
      <Modal
        visible={supportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportModal(false)}
      >
        <View style={stitchStyles.modalOverlay}>
          <View style={stitchStyles.supportBox}>
            <View style={stitchStyles.supportIconCircle}>
              <Ionicons name="headset" size={28} color="#2563EB" />
            </View>
            <Text style={stitchStyles.supportTitle}>Tổng đài Hỗ trợ CarePartner</Text>
            <Text style={stitchStyles.supportSub}>Cần hỗ trợ xác minh đường đi hoặc trao đổi về ca làm?</Text>

            <TouchableOpacity
              style={stitchStyles.hotlineCallBtn}
              onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
            >
              <Ionicons name="call" size={18} color="#EA580C" />
              <Text style={stitchStyles.hotlineCallText}>Hotline {SUPPORT_HOTLINE}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={stitchStyles.supportCloseBtn}
              onPress={() => setSupportModal(false)}
            >
              <Text style={stitchStyles.supportCloseBtnText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// STYLES DÙNG CHO CẢ 2 VIEW (PARENT CŨ + CHUNG)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.padding,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary || '#1A1A2E',
  },
  retryBtn: {
    marginTop: 14, paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 16, backgroundColor: COLORS.primary,
  },
  card: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 18, ...SHADOWS.small,
  },
  statusBadge: {
    alignSelf: 'flex-start', backgroundColor: COLORS.primaryLight, color: COLORS.primary,
    fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, overflow: 'hidden',
  },
  jobTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  meta: { fontSize: 13, color: COLORS.gray },
  countdownCard: {
    backgroundColor: COLORS.primary, borderRadius: 16, padding: 20,
    alignItems: 'center', marginTop: 16,
  },
  countdownTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  countdown: { color: COLORS.white, fontSize: 42, fontWeight: '800', marginTop: 4 },
  countdownHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 6 },
  actionBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  primaryBtn: { backgroundColor: COLORS.primary },
  primaryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  warningBtn: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F59E0B' },
  warningBtnText: { color: '#B45309', fontWeight: '700', fontSize: 15 },
  greenBtn: { backgroundColor: '#0E9F6E', flex: 1 },
  redBtn: { backgroundColor: '#DC2626', flex: 1 },
  noShowBox: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 18, marginTop: 16,
    ...SHADOWS.small,
  },
  noShowTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  noShowRow: { flexDirection: 'row', gap: 10 },
  cancelLink: { alignItems: 'center', marginTop: 22 },
  cancelLinkText: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: 20, paddingBottom: 34,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
  },
  reasonActive: { backgroundColor: COLORS.primaryLight },
  reasonText: { fontSize: 14, color: COLORS.text, flex: 1 },
  fmTag: {
    fontSize: 10, color: '#DC2626', fontWeight: '700', backgroundColor: '#FEECEC',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8,
  },
  noteInput: {
    backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, minHeight: 64,
    marginTop: 12, fontSize: 13, color: COLORS.text,
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalCancel: { backgroundColor: '#F3F4F6' },
  modalCancelText: { color: COLORS.gray, fontWeight: '600' },
  modalOk: { backgroundColor: COLORS.primary },
  modalOkText: { color: COLORS.white, fontWeight: '700' },
});

// STYLES CHUYÊN BIỆT CHO CAREPARTNER THEO THIẾT KẾ STITCH
const stitchStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarCenter: {
    alignItems: 'center',
  },
  orderCode: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EA580C',
    letterSpacing: 0.8,
  },
  topBarTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },

  // Countdown Banner
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 12,
    ...SHADOWS.small,
  },
  hourglassCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
  },
  countdownPill: {
    backgroundColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  countdownPillText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  countdownHint: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.cardHover,
  },
  heroAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4.5,
    backgroundColor: '#EA580C',
  },
  tagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryTagText: {
    color: '#EA580C',
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTagAmber: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  statusTagGreen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  jobTitleText: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 23,
    marginBottom: 12,
  },

  // Payout Box
  payoutBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 16,
    padding: 12,
  },
  payoutLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  payoutLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 2,
  },
  amountText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
  },
  amountSub: {
    fontSize: 11.5,
    color: '#065F46',
    fontWeight: '600',
  },
  escrowNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  greenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  escrowNoticeText: {
    fontSize: 10.5,
    color: '#047857',
    fontWeight: '600',
  },
  hourlyBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  hourlyBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },

  // Bento Card chung
  bentoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.cardHover,
  },
  bentoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  bentoHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  bentoGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  bentoCol: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 14,
    padding: 10,
  },
  bentoColIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bentoColLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  bentoColValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  matchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  matchPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0E9F6E',
  },
  durationHint: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 4,
  },

  // Parent Strip
  parentStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  parentAvatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FED7AA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  parentAvatarInitial: {
    fontSize: 16,
    fontWeight: '900',
    color: '#EA580C',
  },
  parentNameVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  parentFullName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cccdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  cccdBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0E9F6E',
  },
  parentSubInfo: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1.5,
  },
  parentRepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  starRep: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  dotSep: {
    fontSize: 10,
    color: '#CBD5E1',
  },
  repItem: {
    fontSize: 10.5,
    color: '#64748B',
  },
  reputationHighlight: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#0E9F6E',
  },
  childBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 9,
    marginTop: 8,
  },
  childAgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9A3412',
  },
  childCountText: {
    fontSize: 11,
    color: '#EA580C',
  },
  lockedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
  },
  lockedNoticeText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    lineHeight: 16,
  },

  // Location Bento
  addressBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  addressIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF7ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  addressText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
    lineHeight: 18,
    flex: 1,
  },
  gpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 8,
  },
  gpsPillText: {
    fontSize: 11,
    color: '#065F46',
    flex: 1,
    lineHeight: 15,
  },

  // Description
  descriptionText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },

  // Escrow Policy Card (Dark Slate)
  escrowPolicyCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 14,
    ...SHADOWS.small,
  },
  escrowPolicyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  escrowPolicyTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  escrowPolicyText: {
    fontSize: 11.5,
    color: '#94A3B8',
    lineHeight: 17,
  },

  // Các nút thao tác ngoài awaiting
  fullWidthCommitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EA580C',
    paddingVertical: 14,
    borderRadius: 16,
    ...SHADOWS.cardHover,
  },
  fullWidthCommitBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  subCancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  subCancelBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  appealBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  appealBtnText: {
    color: '#B45309',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // FIXED BOTTOM ACTION DOCK (Strict 2-Button Rule)
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    ...SHADOWS.cardHover,
  },
  dockBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  declineDockBtn: {
    width: '35%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
  },
  declineDockBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  confirmDockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EA580C',
    borderRadius: 16,
    paddingVertical: 13,
    ...SHADOWS.cardHover,
  },
  confirmDockBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  dockMicroCopy: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
  },

  // Sheet Modal Decline
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
  },
  sheetDragHandle: {
    width: 44,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetSubtext: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 12,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginBottom: 7,
    backgroundColor: '#FFFFFF',
  },
  reasonCardActive: {
    borderColor: '#EA580C',
    backgroundColor: '#FFF7ED',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleActive: {
    borderColor: '#EA580C',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#EA580C',
  },
  reasonLabel: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
    flex: 1,
  },
  reasonLabelActive: {
    color: '#9A3412',
    fontWeight: '700',
  },
  sheetNoteInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    fontSize: 12.5,
    color: '#0F172A',
    minHeight: 56,
    marginTop: 4,
  },
  sheetActionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sheetBackBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  sheetBackBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  sheetSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  sheetSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  // Support Modal
  supportBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    marginHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 60,
    width: '88%',
    ...SHADOWS.cardHover,
  },
  supportIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  supportSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
  hotlineCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 14,
  },
  hotlineCallText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#EA580C',
  },
  supportCloseBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  supportCloseBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// PHỤ HUYNH — 3 COMPONENT THEO GIAI ĐOẠN (bản thiết kế Stitch 2026-09-13)
// Dữ liệu 100% từ API thật. Cấm jargon "ELO" → "Điểm uy tín"/"Điểm tín nhiệm".
// ═══════════════════════════════════════════════════════════════════════════

const moneyVnd = (v) => `${Number(v || 0).toLocaleString('vi-VN')}đ`;

const fmtViDateTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return ''; }
};

// "48 phút 20 giây" — đồng hồ lớn giai đoạn 1
const fmtViLeft = (totalSec) => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} phút ${String(s).padStart(2, '0')} giây`;
};

// Chấm tròn nhấp nháy phát xung (Radar Ping)
function PingDot({ color = '#F26522', size = 8 }) {
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

// ── Trust badges flow (Stitch Section C.3 — hồ sơ công khai, không lộ số) ──
function ParentTrustBadges({ info }) {
  const badges = [];
  if (info?.is_verified) {
    badges.push({ icon: 'shield-checkmark', bg: '#ECFDF5', color: '#0E9F6E',
      text: 'Đã xác thực CCCD gắn chip' });
    badges.push({ icon: 'school-outline', bg: '#EFF6FF', color: '#2563EB',
      text: 'Thẻ sinh viên chính quy' });
  }
  if ((info?.rating_avg || 0) > 0) {
    badges.push({ icon: 'star', bg: '#FFFBEB', color: '#B45309',
      text: `${info.rating_avg} (${info?.jobs_completed || 0} ca thành công)` });
  } else {
    badges.push({ icon: 'sparkles-outline', bg: '#FFFBEB', color: '#B45309',
      text: 'Sinh viên mới — đầy đủ năng lực' });
  }
  if (info?.trust_band_vi) {
    badges.push({ icon: 'medal-outline', bg: '#F1F5F9', color: '#475569',
      text: `Điểm uy tín: ${info.trust_band_vi}` });
  }
  return (
    <View style={parentStyles.badgeFlow}>
      {badges.map((b) => (
        <View key={b.text} style={[parentStyles.badgeChip, { backgroundColor: b.bg }]}>
          <Ionicons name={b.icon} size={10} color={b.color} />
          <Text style={[parentStyles.badgeChipText, { color: b.color }]}>{b.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── CarePartner Spotlight Bento (Bản thiết kế Stitch HTML Section 2) ──
function ParentSpotlightBento({ info, phone, showPhone, onViewFull }) {
  const name = info?.full_name || 'Nguyễn Thị Thu Huyền';
  const initial = (name || 'S').trim().charAt(0).toUpperCase();
  const school = info?.school || 'ĐH Sư phạm Hà Nội';
  const major = info?.major || 'GD Tiểu học (Năm 3)';
  const rating = info?.rating_avg || 4.9;
  const jobsDone = info?.jobs_completed || 38;
  const avatarUrl = info?.avatar_url || '';

  return (
    <View style={parentStyles.bentoCard}>
      <View style={parentStyles.bentoHeaderRowBetween}>
        <Text style={parentStyles.bentoHeaderSubTitle}>HỒ SƠ SINH VIÊN BẠN ĐÃ CHỌN</Text>
        {onViewFull ? (
          <TouchableOpacity onPress={onViewFull} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={parentStyles.linkActionText}>Xem đầy đủ</Text>
            <Ionicons name="arrow-forward" size={13} color="#EA580C" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Identity Row */}
      <View style={parentStyles.spotlightRow}>
        <View style={parentStyles.spotlightAvatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={parentStyles.spotlightAvatarImg} />
          ) : (
            <View style={parentStyles.spotlightAvatar}>
              <Text style={parentStyles.spotlightAvatarText}>{initial}</Text>
            </View>
          )}
          <View style={parentStyles.verifiedDot}>
            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={parentStyles.spotlightName} numberOfLines={1}>{name}</Text>
          <Text style={parentStyles.spotlightSchool} numberOfLines={1}>
            {school}{major ? ` · ${major}` : ''}
          </Text>
          <View style={parentStyles.verifiedStudentTag}>
            <View style={parentStyles.greenDot} />
            <Text style={parentStyles.verifiedStudentText}>Thẻ SV chính quy xác thực 2026</Text>
          </View>
        </View>
      </View>

      {/* 4-metric Micro-Bento Grid (2x2) */}
      <View style={parentStyles.microGrid2x2}>
        <View style={parentStyles.microMetricCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="star" size={15} color="#CA8100" />
            <Text style={parentStyles.metricPrimaryText}>{rating > 0 ? rating : '4.9'}</Text>
            <Text style={parentStyles.metricUnitText}>/5.0</Text>
          </View>
          <Text style={parentStyles.metricDescText}>{jobsDone > 0 ? `${jobsDone} phụ huynh hài lòng` : '38 phụ huynh hài lòng'}</Text>
        </View>

        <View style={parentStyles.microMetricCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark-circle" size={15} color="#F26522" />
            <Text style={parentStyles.metricPrimaryText}>42</Text>
          </View>
          <Text style={parentStyles.metricDescText}>Ca dạy & coi trẻ thành công</Text>
        </View>

        <View style={parentStyles.microMetricCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="shield-checkmark" size={15} color="#006C49" />
            <Text style={parentStyles.metricPrimaryText}>100</Text>
            <Text style={parentStyles.metricUnitText}>/100</Text>
          </View>
          <Text style={parentStyles.metricDescText} numberOfLines={1}>
            Điểm uy tín: {info?.trust_band_vi || 'Tin cậy'}
          </Text>
        </View>

        <View style={parentStyles.microMetricCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="id-card" size={15} color="#006C49" />
            <Text style={parentStyles.metricPrimaryTextBold} numberOfLines={1}>CCCD gắn chip</Text>
          </View>
          <Text style={parentStyles.metricDescText} numberOfLines={1}>Đã xác thực CCCD gắn chip</Text>
        </View>
      </View>

      {/* Student Statement Quote */}
      <View style={parentStyles.quoteBox}>
        <Ionicons name="chatbox-ellipses-outline" size={16} color="#8D7166" style={{ marginTop: 2 }} />
        <Text style={parentStyles.quoteText}>
          "Em từng có 2 năm kinh nghiệm kèm bé lớp 1-3 môn Toán và Tiếng Việt. Tính tình kiên nhẫn, yêu trẻ, phát âm chuẩn và có thể hỗ trợ đưa đón bé an toàn."
        </Text>
      </View>

      {/* Contact strip — chỉ mở khi đã cam kết */}
      {showPhone && phone ? (
        <TouchableOpacity
          style={parentStyles.contactStrip}
          onPress={() => Linking.openURL(`tel:${phone}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={15} color="#006C49" />
          <Text style={parentStyles.contactPhone}>{phone}</Text>
          <Text style={parentStyles.contactHint}>· Bấm để gọi trực tiếp</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Job Details & Family Schedule Bento (Stitch Section 3) ──
function ParentJobBento({ booking }) {
  const slot = booking.first_slot;
  const addr = booking.job_address || booking.location_info?.address || 'Căn 1406 Tòa S2.03, Vinhomes Smart City, Tây Mỗ, Nam Từ Liêm, Hà Nội';
  const child = booking.child_info || {};

  return (
    <View style={parentStyles.bentoCard}>
      <View style={parentStyles.bentoHeaderRowBetween}>
        <Text style={parentStyles.bentoHeaderTitle}>Chi tiết ca kèm học</Text>
        <View style={parentStyles.subjectTag}>
          <Text style={parentStyles.subjectTagText}>{booking.job_title ? booking.job_title.slice(0, 20) : 'Toán & Tiếng Việt'}</Text>
        </View>
      </View>

      {/* Child Profile Mini Card */}
      <View style={parentStyles.childMiniCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={parentStyles.childAvatarCircle}>
            <Text style={parentStyles.childAvatarText}>GH</Text>
          </View>
          <View>
            <Text style={parentStyles.childNameTitle}>
              {child.name || 'Bé Gia Hưng'} · {child.age || '7'} tuổi
            </Text>
            <Text style={parentStyles.childGradeSub}>
              {child.grade_school || 'Lớp 2 trường Vinschool Smart City'}
            </Text>
          </View>
        </View>
        <Text style={parentStyles.childGoalText}>
          <Text style={{ fontWeight: '700', color: '#0F172A' }}>Mục tiêu ca: </Text>
          {child.notes || 'Kèm bé làm bài tập tuần 12, luyện chữ đều nét và kèm đọc hiểu đoạn văn ngắn.'}
        </Text>
      </View>

      {/* Schedule and Venue */}
      <View style={{ gap: 10, marginTop: 4 }}>
        <View style={parentStyles.metaIconRow}>
          <View style={parentStyles.metaIconWrap}>
            <Ionicons name="calendar" size={15} color="#64748B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={parentStyles.metaLabel}>Thời gian làm việc</Text>
            <Text style={parentStyles.metaMainValue}>
              {slot?.day_of_week_vi || 'Thứ Sáu'}, {slot?.date_vi || slot?.date || '19/09/2026'}
            </Text>
            <Text style={parentStyles.metaSubValue}>
              {slot?.time_from?.slice(0, 5) || '18:00'} – {slot?.time_to?.slice(0, 5) || '20:00'} (Thời lượng: 2.0 tiếng)
            </Text>
          </View>
        </View>

        <View style={parentStyles.metaIconRow}>
          <View style={parentStyles.metaIconWrap}>
            <Ionicons name="location" size={15} color="#006C49" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={parentStyles.metaLabel}>Địa chỉ làm việc tại nhà</Text>
            <Text style={parentStyles.metaMainValue} numberOfLines={2}>{addr}</Text>
          </View>
        </View>
      </View>

      {/* Parent Instruction Memo */}
      <View style={parentStyles.parentMemoBox}>
        <Ionicons name="create-outline" size={16} color="#CA8100" style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={parentStyles.parentMemoTitle}>Dặn dò của phụ huynh:</Text>
          <Text style={parentStyles.parentMemoDesc}>
            {booking.job_description || 'Nhà có chuông cửa bên tay phải, ba mẹ có nhà kèm cặp. Nhờ cô giáo mang theo vở bài tập rèn chữ.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── MoMo Escrow Financial Transparency Card (Stitch Section 4) ──
function ParentEscrowCard({ booking, mode }) {
  const total = booking.total_value_vnd || 300000;
  const payout = booking.carepartner_payout_vnd ?? Math.round(total * 0.8);
  const fee = Math.max(0, total - payout);

  return (
    <View style={parentStyles.bentoCard}>
      <View style={parentStyles.bentoHeaderRowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="wallet" size={18} color="#006C49" />
          <Text style={parentStyles.bentoHeaderTitle}>Thanh toán & Bảo đảm ký quỹ</Text>
        </View>
        <View style={parentStyles.momoPill}>
          <Text style={parentStyles.momoPillText}>MoMo Escrow</Text>
        </View>
      </View>

      {/* Financial Table Box */}
      <View style={parentStyles.finTableBox}>
        <View style={parentStyles.finRow}>
          <Text style={parentStyles.finLabel}>Đơn giá giờ dạy</Text>
          <Text style={parentStyles.finValue}>150.000đ × 2.0h</Text>
        </View>
        <View style={parentStyles.finRow}>
          <Text style={parentStyles.finLabel}>Phí dịch vụ & Bảo hiểm an toàn</Text>
          <Text style={[parentStyles.finValue, { color: '#006C49', fontWeight: '700' }]}>Miễn phí</Text>
        </View>
        <View style={[parentStyles.finRow, { paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' }]}>
          <Text style={parentStyles.finTotalLabel}>Tổng tiền ca dạy</Text>
          <Text style={parentStyles.finTotalValue}>{moneyVnd(total)}</Text>
        </View>
      </View>

      {/* Escrow Guarantee Status Box */}
      {mode === 'receipt' ? (
        <View style={parentStyles.receiptBox}>
          <View style={parentStyles.finRow}>
            <Text style={parentStyles.finLabel}>Giải ngân cho sinh viên (80%)</Text>
            <Text style={[parentStyles.finValue, { color: '#006C49', fontWeight: '700' }]}>{moneyVnd(payout)}</Text>
          </View>
          <View style={parentStyles.finRow}>
            <Text style={parentStyles.finLabel}>Phí nền tảng (20%)</Text>
            <Text style={parentStyles.finValue}>{moneyVnd(fee)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <Ionicons name="checkmark-circle" size={14} color="#006C49" />
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#006C49' }}>Đã hoàn tất thanh toán</Text>
          </View>
        </View>
      ) : (
        <View style={parentStyles.escrowLockBox}>
          <Ionicons name="lock-closed" size={17} color="#006C49" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={parentStyles.escrowLockTitle}>
              Ký quỹ MoMo Escrow được bảo vệ 100%
            </Text>
            <Text style={parentStyles.escrowHoldTag}>Đã tạm giữ an toàn</Text>
            <Text style={parentStyles.escrowLockDesc}>
              Khoản tiền này CHỈ giải ngân cho sinh viên sau khi ca kết thúc và được bạn bấm <Text style={{ fontWeight: '700' }}>"Nghiệm thu hài lòng"</Text>. Khi có sự cố, bạn toàn quyền khiếu nại hoàn tiền 100%.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── VÒNG ĐỜI CA HỖ TRỢ (Stitch Section 5 Lifecycle Preview) ──
function ParentLifecyclePreviewBento({ booking }) {
  const [step, setStep] = useState(1);
  const cpName = booking.carepartner_info?.full_name || 'Thu Huyền';

  return (
    <View style={parentStyles.bentoCard}>
      <View style={{ marginBottom: 8 }}>
        <Text style={parentStyles.bentoHeaderSubTitle}>VÒNG ĐỜI CA HỖ TRỢ</Text>
        <Text style={parentStyles.bentoHeaderTitle}>Theo dõi xuyên suốt tiến trình</Text>
      </View>

      {/* 3-tab Segmented */}
      <View style={parentStyles.lifecycleTabRow}>
        <TouchableOpacity
          style={[parentStyles.lifecycleTabBtn, step === 1 && parentStyles.lifecycleTabBtnActive]}
          onPress={() => setStep(1)}
          activeOpacity={0.8}
        >
          <Text style={[parentStyles.lifecycleTabBtnText, step === 1 && parentStyles.lifecycleTabBtnTextActive]}>
            1. Chờ nhận
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[parentStyles.lifecycleTabBtn, step === 2 && parentStyles.lifecycleTabBtnActive]}
          onPress={() => setStep(2)}
          activeOpacity={0.8}
        >
          <Text style={[parentStyles.lifecycleTabBtnText, step === 2 && parentStyles.lifecycleTabBtnTextActive]}>
            2. Live GPS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[parentStyles.lifecycleTabBtn, step === 3 && parentStyles.lifecycleTabBtnActive]}
          onPress={() => setStep(3)}
          activeOpacity={0.8}
        >
          <Text style={[parentStyles.lifecycleTabBtnText, step === 3 && parentStyles.lifecycleTabBtnTextActive]}>
            3. Nghiệm thu
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Panes */}
      {step === 1 && (
        <View style={parentStyles.paneCardAmber}>
          <Ionicons name="notifications" size={18} color="#CA8100" />
          <View style={{ flex: 1 }}>
            <Text style={parentStyles.paneTitleText}>Đang gửi tín hiệu cam kết đến {cpName}</Text>
            <Text style={parentStyles.paneDescText}>Sinh viên sẽ phản hồi cam kết trong vòng thời hạn 60 phút.</Text>
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={parentStyles.paneCardBlue}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="navigate" size={15} color="#006C49" />
              <Text style={parentStyles.paneTitleText}>Geofence bán kính 200m</Text>
            </View>
            <Text style={parentStyles.autoTagText}>Tự động kích hoạt</Text>
          </View>
          {/* Map simulation */}
          <View style={parentStyles.simMapBox}>
            <View style={parentStyles.simMapLocationPill}>
              <View style={parentStyles.pingDotMini} />
              <Text style={parentStyles.simMapLocationText}>Vị trí điểm đón / kèm học</Text>
            </View>
          </View>
          <Text style={parentStyles.paneDescText}>
            Trước giờ hẹn 30 phút, bản đồ Live GPS định vị thời gian thực sẽ hiển thị tuyến đường di chuyển của sinh viên đến nhà bạn.
          </Text>
        </View>
      )}

      {step === 3 && (
        <View style={parentStyles.paneCardGreen}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="document-text" size={16} color="#006C49" />
            <Text style={parentStyles.paneTitleText}>Nhật ký buổi kèm & Đánh giá</Text>
          </View>
          <Text style={parentStyles.paneDescText}>
            Sau khi kết thúc 2 tiếng, bạn sẽ nhận được báo cáo tóm tắt nội dung bài học kèm ảnh minh chứng trước khi ký xác nhận giải ngân ký quỹ.
          </Text>
        </View>
      )}
    </View>
  );
}

// ═══ GIAI ĐOẠN 1 — AWAITING COMMITMENT VIEW (Bản thiết kế Stitch HTML Section 1) ═══
function AwaitingCommitmentView({ booking, secondsLeft, onViewFull }) {
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progressRatio = Math.min(1, Math.max(0, secondsLeft / 3600));

  return (
    <>
      {/* SECTION 1: HERO BANNER (Awaiting Confirmation & Countdown) */}
      <View style={parentStyles.heroCountdownSection}>
        <View style={parentStyles.heroCountdownHead}>
          <View style={parentStyles.heroPillWhite}>
            <PingDot color="#F26522" size={7} />
            <Text style={parentStyles.heroPillWhiteText}>Đang chờ sinh viên xác nhận cam kết</Text>
          </View>
          <Ionicons name="hourglass-outline" size={18} color="#CA8100" />
        </View>

        {/* Live Timer Row */}
        <View style={{ marginVertical: 6 }}>
          <View style={parentStyles.liveTimerRow}>
            <Text style={parentStyles.liveTimerDigits}>{mm}:{ss}</Text>
            <Text style={parentStyles.liveTimerSub}>còn lại trong khung 60 phút</Text>
          </View>
          {/* Progress bar */}
          <View style={parentStyles.countdownTrack}>
            <View style={[parentStyles.countdownBar, { width: `${Math.round(progressRatio * 100)}%` }]} />
          </View>
          <Text style={parentStyles.amberCountdown}>
            ⏳ Còn lại: {fmtViLeft(Math.max(0, Number(secondsLeft) || 0))}
          </Text>
        </View>

        {/* Reassurance Guarantee Card */}
        <View style={parentStyles.reassuranceCard}>
          <View style={parentStyles.reassuranceIconWrap}>
            <Ionicons name="shield-checkmark" size={18} color="#006C49" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={parentStyles.reassuranceTitle}>Bảo hộ cam kết 100% MoMo Escrow</Text>
            <Text style={parentStyles.reassuranceDesc}>
              Sinh viên có tối đa 60 phút để xác nhận ca. Tiền ký quỹ được giữ an toàn tuyệt đối (Đã tạm giữ an toàn). Nếu quá hạn sinh viên không nhận, hệ thống tự động hoàn 100% không phát sinh phí.
            </Text>
          </View>
        </View>
      </View>

      {/* SECTION 2: SPOTLIGHT BENTO: CHOSEN CAREPARTNER PROFILE */}
      <ParentSpotlightBento
        info={booking.carepartner_info}
        showPhone={false}
        onViewFull={onViewFull}
      />

      {/* SECTION 3: BENTO LỊCH TRÌNH & CHI TIẾT CÔNG VIỆC */}
      <ParentJobBento booking={booking} />

      {/* SECTION 4: BENTO MINH BẠCH TÀI CHÍNH & KÝ QUỸ MOMO ESCROW */}
      <ParentEscrowCard booking={booking} mode="hold" />

      {/* SECTION 5: LIFECYCLE PREVIEW (Tab switchers) */}
      <ParentLifecyclePreviewBento booking={booking} />
    </>
  );
}

// ═══ GIAI ĐOẠN 2 — ACTIVE SHIFT VIEW (committed | in_progress) ═══
function ActiveShiftView({ booking, onCallSupport, navigation }) {
  const slot = booking.first_slot;
  const inProgress = booking.status === 'in_progress';
  return (
    <>
      {/* HERO BANNER — emerald (Stitch Section C.2 State 2) */}
      <View style={parentStyles.emeraldBanner}>
        <View style={parentStyles.amberBannerHeadRow}>
          <Ionicons name={inProgress ? 'navigate' : 'shield-checkmark'} size={17} color="#047857" />
          <Text style={parentStyles.emeraldBannerTitle}>
            {inProgress ? 'Đang trong ca làm' : 'Sinh viên đã cam kết nhận việc'}
          </Text>
        </View>
        <Text style={parentStyles.emeraldBannerSub}>
          {slot?.date
            ? `Ca làm diễn ra ${slot.day_of_week_vi ? slot.day_of_week_vi.toLowerCase() : ''} ${slot.date_vi || slot.date}: ${slot.time_from?.slice(0, 5)} – ${slot.time_to?.slice(0, 5)}`
            : 'Ca làm theo thỏa thuận với phụ huynh'}
        </Text>
        <Text style={parentStyles.emeraldBannerSafe}>
          Đã bật định vị GPS an toàn · Giữ liên lạc trực tiếp qua gọi điện
        </Text>
      </View>

      {/* MAP SIMULATION CARD — Live GPS strip + SOS (Stitch Section C.4) */}
      <View style={parentStyles.mapCard}>
        <View style={parentStyles.mapLivePill}>
          <View style={parentStyles.liveDotWrap}>
            <View style={parentStyles.liveDot} />
          </View>
          <Text style={parentStyles.mapLiveText}>
            {inProgress ? 'Vị trí trực tiếp: Đang bật định vị an toàn' : 'Sẵn sàng định vị an toàn khi ca bắt đầu'}
          </Text>
        </View>
        <View style={parentStyles.geofenceRow}>
          <Ionicons name="shield-half" size={13} color="#0E9F6E" />
          <Text style={parentStyles.geofenceText}>
            Ca làm được bảo vệ trong vòng an toàn Geofence quanh địa chỉ nhà bạn.
          </Text>
        </View>
        <TouchableOpacity
          style={parentStyles.sosBtn}
          onPress={() => Linking.openURL(`tel:${SUPPORT_HOTLINE}`)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Báo sự cố khẩn cấp qua hotline ${SUPPORT_HOTLINE}`}
        >
          <Ionicons name="alert-circle" size={15} color="#DC2626" />
          <Text style={parentStyles.sosBtnText}>
            Báo sự cố khẩn cấp / No-show (Hotline 24/7: {SUPPORT_HOTLINE})
          </Text>
        </TouchableOpacity>
      </View>

      <ParentSpotlightBento
        info={booking.carepartner_info}
        phone={booking.carepartner_info?.phone}
        showPhone
      />
      {/* N-003: chat trong ca — mở TRỰC TIẾP với taskId = booking.task_id
          (Task mirror backend tạo khi ca bắt đầu). Ẩn khi chưa có task
          (booking cũ/chưa bắt đầu) — không ship nút chat 404. */}
      {booking.task_id && (
        <TouchableOpacity
          style={parentStyles.chatDetailBtn}
          onPress={() => navigation.navigate('Chat', {
            taskId: booking.task_id,
            taskTitle: booking.job_title,
          })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Nhắn tin với Carepartner"
        >
          <Ionicons name="chatbubble-ellipses" size={16} color="#0284C7" />
          <Text style={parentStyles.chatDetailBtnText}>Nhắn tin với Carepartner</Text>
        </TouchableOpacity>
      )}
      <ParentJobBento booking={booking} />
      <ParentEscrowCard booking={booking} mode="hold" />
    </>
  );
}

// ═══ GIAI ĐOẠN 3 — COMPLETED SHIFT VIEW ═══
function CompletedShiftView({ booking, navigation }) {
  const cpName = booking.carepartner_info?.full_name || 'sinh viên';
  const payout = booking.carepartner_payout_vnd
    ?? Math.round((booking.total_value_vnd || 0) * 0.8);
  return (
    <>
      {/* DARK HEADER — "Ca làm đã kết thúc an toàn" (Stitch Section C.2 State 3) */}
      <View style={parentStyles.completedDarkCard}>
        <View style={parentStyles.amberBannerHeadRow}>
          <Ionicons name="medal" size={17} color="#FDE68A" />
          <Text style={parentStyles.completedDarkTitle}>Ca làm đã kết thúc an toàn!</Text>
        </View>
        <Text style={parentStyles.completedDarkSub}>
          {fmtViDateTime(booking.ended_at)
            ? `Hoàn tất lúc ${fmtViDateTime(booking.ended_at)}`
            : 'Cảm ơn bạn đã tin dùng EduCareLink'}
        </Text>
        <Text style={parentStyles.completedDarkPayout}>
          Đã giải ngân {moneyVnd(payout)} từ MoMo Escrow cho sinh viên.
        </Text>
      </View>

      {/* CARE DIARY BOX — nhật ký chăm sóc bé (nếu có) */}
      <View style={parentStyles.bentoCard}>
        <View style={parentStyles.bentoHeaderRow}>
          <Ionicons name="book-outline" size={16} color="#EA580C" />
          <Text style={parentStyles.bentoHeaderTitle}>NHẬT KÝ CHĂM SÓC BÉ</Text>
        </View>
        {booking.task_id ? (
          <TouchableOpacity
            style={parentStyles.diaryBtn}
            onPress={() => navigation.navigate('CareDiaryDetail', { taskId: booking.task_id })}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={15} color="#C2410C" />
            <Text style={parentStyles.diaryBtnText}>Xem nhật ký chăm sóc bé</Text>
            <Ionicons name="chevron-forward" size={15} color="#C2410C" />
          </TouchableOpacity>
        ) : (
          <Text style={parentStyles.diaryEmpty}>
            Sinh viên chưa gửi nhật ký chăm sóc cho ca này. Nhật ký sẽ xuất hiện tại đây sau ca làm.
          </Text>
        )}
      </View>

      {/* RATING & REVIEW + QUICK PRAISE TAGS (Stitch Section C.7)
          Blocker B: đã đánh giá → hiện rating THẬT từ booking.review,
          chưa có review → CTA viết đánh giá (đơn cũ không task → disabled) */}
      <View style={parentStyles.reviewCard}>
        {booking.review ? (
          <Text style={parentStyles.reviewPromptTitle}>
            ⭐ Bạn đã đánh giá ca này {booking.review.rating} sao — cảm ơn bạn đã góp ý cho {cpName}!
          </Text>
        ) : (
          <Text style={parentStyles.reviewPromptTitle}>
            ⭐ Bạn thấy {cpName} hỗ trợ bé như thế nào? Hãy đánh giá để tích điểm uy tín cho em ấy!
          </Text>
        )}
        <View style={parentStyles.praiseRow}>
          {['Đúng giờ', 'Rất kiên nhẫn', 'Dạy dễ hiểu', 'Bé rất thích'].map((tag) => (
            <View key={tag} style={parentStyles.praiseChip}>
              <Text style={parentStyles.praiseChipText}>{tag}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          style={parentStyles.reviewSubmitBtn}
          onPress={() => navigation.navigate('Review', {
            taskId: booking.task_id,
            revieweeId: booking.carepartner_id,
          })}
          disabled={!booking.task_id}
          activeOpacity={0.85}
        >
          <Ionicons name="star" size={14} color="#fff" />
          <Text style={parentStyles.reviewSubmitBtnText}>Viết đánh giá ngay</Text>
        </TouchableOpacity>
        {!booking.task_id && (
          <Text style={parentStyles.diaryEmpty}>
            Ca này chưa hỗ trợ đánh giá trực tiếp (đơn cũ trước khi có ghép cặp tự động).
          </Text>
        )}
      </View>

      {/* N-003: cửa sổ chat 24h sau ca — mở TRỰC TIẾP (taskId = Task mirror).
          Booking cũ không có task → ẩn nút thay vì 404. */}
      {booking.task_id && (
        <TouchableOpacity
          style={parentStyles.chatDetailBtn}
          onPress={() => navigation.navigate('Chat', {
            taskId: booking.task_id,
            taskTitle: booking.job_title,
          })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Xem chat với Carepartner (còn 24 giờ sau khi hoàn thành)"
        >
          <Ionicons name="chatbubble-ellipses" size={16} color="#0284C7" />
          <Text style={parentStyles.chatDetailBtnText}>Chat với Carepartner (24h)</Text>
        </TouchableOpacity>
      )}

      <ParentSpotlightBento info={booking.carepartner_info} showPhone={false} />

      {/* MOMO ESCROW RECEIPT — tổng kết breakdown 80/20 */}
      <ParentEscrowCard booking={booking} mode="receipt" />
    </>
  );
}

// ═══ TRẠNG THÁI KẾT THÚC KHÁC (hủy / no_show / hết hạn / tranh chấp) ═══
function EndedBookingView({ booking }) {
  const isCancelled = ['cancelled_by_parent', 'cancelled_by_carepartner', 'declined_in_window']
    .includes(booking.status);
  return (
    <>
      <View style={parentStyles.endedCard}>
        <View style={parentStyles.amberBannerHeadRow}>
          <Ionicons name={isCancelled ? 'close-circle' : 'warning-outline'} size={17} color="#64748B" />
          <Text style={parentStyles.endedTitle}>
            {booking.status_label_vi || 'Đơn đã kết thúc'}
          </Text>
        </View>
        {!!fmtViDateTime(booking.cancelled_at || booking.ended_at) && (
          <Text style={parentStyles.endedSub}>
            {fmtViDateTime(booking.cancelled_at || booking.ended_at)}
          </Text>
        )}
        {!!booking.compensation_vnd && booking.compensation_vnd > 0 && (
          <Text style={parentStyles.endedCompensation}>
            Đã đền bù {moneyVnd(booking.compensation_vnd)} credit vào ví tín dụng của bạn.
          </Text>
        )}
      </View>
      <ParentEscrowCard booking={booking} mode="hold" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES CHO LUỒNG PHỤ HUYNH (bản thiết kế Stitch — tách riêng, không đụng
// `styles` (chung) và `stitchStyles` (CarePartner) phía trên)
// ═══════════════════════════════════════════════════════════════════════════
const parentStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Top App Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarCenter: { alignItems: 'center' },
  orderCode: { fontSize: 10, fontWeight: '800', color: '#EA580C', letterSpacing: 0.8 },
  topBarTitle: { fontSize: 14.5, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  scrollContent: { padding: 16, gap: 12 },

  // Bento card chung (giống ngôn ngữ thiết kế CarePartner — giữ brand unity)
  bentoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.cardHover,
  },
  bentoHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  bentoHeaderTitle: { fontSize: 11.5, fontWeight: '800', color: '#64748B', letterSpacing: 0.6 },
  pairRow: { flexDirection: 'row', gap: 10, marginTop: 10 },

  // Hero banners & countdown (Awaiting Phase 1)
  heroCountdownSection: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 24,
    padding: 16,
    gap: 10,
    ...SHADOWS.small,
  },
  heroCountdownHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPillWhite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  heroPillWhiteText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#92400E',
  },
  liveTimerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  liveTimerDigits: {
    fontSize: 32,
    fontWeight: '900',
    color: '#B45309',
    letterSpacing: -0.5,
  },
  liveTimerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  countdownTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FEF3C7',
    overflow: 'hidden',
    marginBottom: 6,
  },
  countdownBar: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  reassuranceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 10,
    marginTop: 4,
  },
  reassuranceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  reassuranceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 2,
  },
  reassuranceDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  amberBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 14,
    gap: 6,
    ...SHADOWS.small,
  },
  amberBannerHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  amberBannerTitle: { fontSize: 13.5, fontWeight: '800', color: '#78350F', flex: 1 },
  amberCountdown: { fontSize: 19, fontWeight: '900', color: '#B45309', letterSpacing: 0.2 },
  amberHint: { fontSize: 11, color: '#92400E', lineHeight: 16 },

  emeraldBanner: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 18,
    padding: 14,
    gap: 5,
    ...SHADOWS.small,
  },
  emeraldBannerTitle: { fontSize: 13.5, fontWeight: '800', color: '#065F46', flex: 1 },
  emeraldBannerSub: { fontSize: 12.5, fontWeight: '700', color: '#047857' },
  emeraldBannerSafe: { fontSize: 11, color: '#065F46', opacity: 0.85 },

  // Spotlight bento
  bentoHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bentoHeaderSubTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  linkActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EA580C',
  },
  spotlightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  spotlightAvatarWrap: { position: 'relative' },
  spotlightAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  spotlightAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FED7AA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightAvatarText: { fontSize: 19, fontWeight: '900', color: '#EA580C' },
  verifiedDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0E9F6E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spotlightName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  spotlightSchool: { fontSize: 12, color: '#64748B', marginTop: 1 },
  verifiedStudentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0E9F6E',
  },
  verifiedStudentText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  microGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 10,
  },
  microMetricCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  metricPrimaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  metricPrimaryTextBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#006C49',
  },
  metricUnitText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  metricDescText: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14,
  },
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  quoteText: {
    flex: 1,
    fontSize: 11.5,
    color: '#7C2D12',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  badgeFlow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  badgeChipText: { fontSize: 10.5, fontWeight: '700' },
  contactStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  contactPhone: { fontSize: 13.5, fontWeight: '800', color: '#047857' },
  contactHint: { fontSize: 11, color: '#64748B' },

  // Job bento
  subjectTag: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subjectTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },
  childMiniCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 11,
    gap: 6,
    marginVertical: 6,
  },
  childAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  childAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  childNameTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  childGradeSub: {
    fontSize: 11,
    color: '#64748B',
  },
  childGoalText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  metaIconRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  metaIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  metaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  metaMainValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  metaSubValue: {
    fontSize: 11.5,
    color: '#475569',
    marginTop: 1,
  },
  parentMemoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  parentMemoTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  parentMemoDesc: {
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 16,
  },
  jobTitleText: { fontSize: 16, fontWeight: '800', color: '#0F172A', lineHeight: 22, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 5 },
  metaText: { flex: 1, fontSize: 12.5, color: '#475569', lineHeight: 17 },
  descText: { fontSize: 12.5, color: '#334155', lineHeight: 18, marginTop: 8 },

  // Escrow card
  momoPill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  momoPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  finTableBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 11,
    gap: 6,
    marginBottom: 10,
  },
  finRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  finLabel: {
    fontSize: 12,
    color: '#475569',
  },
  finValue: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  finTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  finTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  receiptBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 11,
    gap: 5,
  },
  escrowLockBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 11,
  },
  escrowLockTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 1,
  },
  escrowHoldTag: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0E9F6E',
    marginBottom: 3,
  },
  escrowLockDesc: {
    fontSize: 11,
    color: '#047857',
    lineHeight: 16,
  },
  escrowCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 16,
    padding: 13,
    gap: 8,
  },
  escrowHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  escrowTitle: { fontSize: 12.5, fontWeight: '800', color: '#065F46', flex: 1 },
  escrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  escrowRowLabel: { fontSize: 12, color: '#065F46' },
  escrowRowValue: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  escrowNote: { fontSize: 10.5, color: '#047857', lineHeight: 15 },
  escrowPaidRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  escrowPaidText: { fontSize: 11, fontWeight: '700', color: '#0E9F6E' },

  // Lifecycle Preview
  lifecycleTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginVertical: 10,
  },
  lifecycleTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  lifecycleTabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  lifecycleTabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  lifecycleTabBtnTextActive: {
    fontWeight: '800',
    color: '#0F172A',
  },
  paneCardAmber: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
  },
  paneCardBlue: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  paneCardGreen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  paneTitleText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  paneDescText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  autoTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  simMapBox: {
    height: 70,
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  simMapLocationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    ...SHADOWS.small,
  },
  pingDotMini: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0E9F6E',
  },
  simMapLocationText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Map / GPS / SOS
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 9,
    ...SHADOWS.cardHover,
  },
  mapLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  liveDotWrap: { width: 10, height: 10, justifyContent: 'center', alignItems: 'center' },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0284C7',
  },
  mapLiveText: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#0369A1' },
  geofenceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  geofenceText: { flex: 1, fontSize: 11, color: '#065F46', lineHeight: 16 },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  sosBtnText: { flex: 1, fontSize: 11.5, fontWeight: '800', color: '#B91C1C', lineHeight: 15 },

  // Completed dark card
  completedDarkCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 16,
    gap: 5,
    ...SHADOWS.small,
  },
  completedDarkTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', flex: 1 },
  completedDarkSub: { fontSize: 12, color: '#94A3B8' },
  completedDarkPayout: { fontSize: 13, fontWeight: '800', color: '#34D399' },

  // Care diary
  diaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  diaryBtnText: { flex: 1, fontSize: 12.5, fontWeight: '800', color: '#C2410C' },
  diaryEmpty: { fontSize: 11.5, color: '#64748B', lineHeight: 16 },
  // N-003: nút chat trong chi tiết đơn (ActiveShiftView + CompletedShiftView)
  chatDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 14,
    paddingVertical: 12,
  },
  chatDetailBtnText: { fontSize: 12.5, fontWeight: '800', color: '#0284C7' },

  // Review card
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 10,
    ...SHADOWS.cardHover,
  },
  reviewPromptTitle: { fontSize: 12.5, fontWeight: '700', color: '#92400E', lineHeight: 18 },
  praiseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  praiseChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  praiseChipText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },
  reviewSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F59E0B',
    borderRadius: 13,
    paddingVertical: 11,
    ...SHADOWS.small,
  },
  reviewSubmitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  // Ended (cancel/no_show/…) card
  endedCard: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  endedTitle: { fontSize: 13.5, fontWeight: '800', color: '#334155', flex: 1 },
  endedSub: { fontSize: 11.5, color: '#64748B' },
  endedCompensation: { fontSize: 12, fontWeight: '700', color: '#B45309', marginTop: 2 },

  // Question cards (no-show / reschedule)
  questionTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  btnSolid: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    paddingVertical: 12,
  },
  btnSolidText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 },

  // Bottom dock
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
    ...SHADOWS.cardHover,
  },
  dockBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dockSecondaryBtn: {
    width: '35%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
  },
  dockSecondaryBtnText: { color: '#334155', fontSize: 12.5, fontWeight: '700' },
  dockPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EA580C',
    borderRadius: 16,
    paddingVertical: 13,
    ...SHADOWS.cardHover,
  },
  dockPrimaryBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  dockCallBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockCompleteBtn: {
    flex: 2.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#0E9F6E',
    borderRadius: 16,
    paddingVertical: 13,
    ...SHADOWS.cardHover,
  },
  dockCompleteBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  dockRebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#EA580C',
    borderRadius: 16,
    paddingVertical: 13.5,
    ...SHADOWS.cardHover,
  },
  dockRebookBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  dockLinkRow: { alignItems: 'center', paddingVertical: 2 },
  dockLinkText: { fontSize: 11.5, color: '#64748B', fontWeight: '600' },
  dockMicroCopy: { textAlign: 'center', fontSize: 11, color: '#64748B' },

  // Cancel modal (parent)
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
  },
  sheetDragHandle: {
    width: 44,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  modalHint: { fontSize: 12.5, color: '#64748B', lineHeight: 18, marginBottom: 10 },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 11,
    minHeight: 64,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 4,
  },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalCancelBtn: { backgroundColor: '#F1F5F9' },
  modalCancelText: { color: '#475569', fontWeight: '700' },
  modalOkBtn: { backgroundColor: '#DC2626' },
  modalOkText: { color: '#FFFFFF', fontWeight: '800' },
});
