// ============================================================
// BookingDetailScreen — Flow 1 Step 5/12: chi tiết đơn ghép cặp
// Parent view: giữ nguyên luồng và giao diện của Phụ huynh.
// CarePartner view: nâng cấp toàn diện theo bản thiết kế Google Stitch
// (Bento lịch trình, bảo đảm Escrow, đúng 2 nút Xác nhận/Từ chối).
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, TextInput, Modal, Platform, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
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
  // LUỒNG PHỤ HUYNH — GIỮ NGUYÊN 100% THEO CHỈ ĐẠO CỦA USER
  // ============================================================
  if (isParent) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary || '#1A1A2E'} />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Chi tiết đơn</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 40 }}>
          <View style={styles.card}>
            <Text style={styles.statusBadge}>{booking.status_label_vi}</Text>
            <Text style={styles.jobTitle}>{booking.job_title || 'Công việc ghép cặp'}</Text>
            {booking.first_slot && (
              <View style={styles.metaRow}>
                <Ionicons name="calendar" size={15} color={COLORS.primary} />
                <Text style={styles.meta}>
                  {booking.first_slot.date} · {booking.first_slot.time_from?.slice(0, 5)}
                  -{booking.first_slot.time_to?.slice(0, 5)}
                </Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Ionicons name="cash" size={15} color="#0E9F6E" />
              <Text style={styles.meta}>Giá trị: {booking.total_value_vnd?.toLocaleString('vi-VN')}đ</Text>
            </View>
            {booking.compensation_vnd > 0 && (
              <View style={styles.metaRow}>
                <Ionicons name="gift" size={15} color="#F5A623" />
                <Text style={styles.meta}>
                  Đã đền bù: {booking.compensation_vnd.toLocaleString('vi-VN')}đ credit
                </Text>
              </View>
            )}
          </View>

          {booking.status === 'awaiting_commitment' && (
            <View style={styles.countdownCard}>
              <Text style={styles.countdownTitle}>Thời gian cam kết còn lại</Text>
              <Text style={styles.countdown}>{mm}:{ss}</Text>
              <Text style={styles.countdownHint}>
                Nếu bạn không xác nhận trước khi hết thời gian, đơn sẽ tự bị hủy
                khỏi dashboard và phụ huynh sẽ được thông báo để chọn người khác.
              </Text>
            </View>
          )}

          {booking.status === 'suspected_no_show' && (
            <View style={styles.noShowBox}>
              <Text style={styles.noShowTitle}>CarePartner đã đến chưa?</Text>
              <View style={styles.noShowRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.greenBtn, { flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => reportNoShow(bookingId, true))}>
                  <Text style={styles.primaryBtnText}>Đã đến</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.redBtn, { flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => reportNoShow(bookingId, false))}>
                  <Text style={styles.primaryBtnText}>Không đến</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {booking.status === 'reschedule_requested' && (
            <View style={styles.noShowBox}>
              <Text style={styles.noShowTitle}>CarePartner xin đổi giờ</Text>
              <View style={styles.noShowRow}>
                <TouchableOpacity style={[styles.actionBtn, styles.greenBtn, { flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => respondReschedule(bookingId, 'approve'),
                    'Đã duyệt giờ mới.')}>
                  <Text style={styles.primaryBtnText}>Đồng ý</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.redBtn, { flex: 1 }]}
                  disabled={actionLoading}
                  onPress={() => run(() => respondReschedule(bookingId, 'decline'))}>
                  <Text style={styles.primaryBtnText}>Từ chối</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(booking.status === 'awaiting_commitment' || booking.status === 'committed') && (
            <TouchableOpacity style={styles.cancelLink} disabled={actionLoading}
              onPress={() => { setReasonCode(''); setNote(''); setCancelModal(true); }}>
              <Text style={styles.cancelLinkText}>Hủy đơn</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* MODAL HỦY CHO PHỤ HUYNH */}
        <Modal visible={cancelModal} transparent animationType="slide"
          onRequestClose={() => setCancelModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Xác nhận hủy đơn</Text>
              <Text style={{ fontSize: 13, color: COLORS.gray, marginBottom: 8, lineHeight: 18 }}>
                Bạn có chắc chắn muốn hủy đơn này? Nếu hủy sát giờ (dưới 3h trước ca), CarePartner có thể được hỗ trợ điểm tín nhiệm.
              </Text>
              <TextInput style={styles.noteInput}
                placeholder="Ghi chú lý do hủy (tùy chọn)"
                value={note} onChangeText={setNote} multiline
                textAlignVertical="top" />
              <View style={styles.modalRow}>
                <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]}
                  onPress={() => setCancelModal(false)}>
                  <Text style={styles.modalCancelText}>Đóng</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.modalOk]} onPress={submitCancel}>
                  <Text style={styles.modalOkText}>Xác nhận hủy</Text>
                </TouchableOpacity>
              </View>
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
              onPress={() => run(
                () => commitBooking(bookingId),
                'Đã cam kết nhận đơn thành công! Ca làm đã chuyển sang mục Sắp làm.'
              )}
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
              onPress={() => Linking.openURL('tel:19006828')}
            >
              <Ionicons name="call" size={18} color="#EA580C" />
              <Text style={stitchStyles.hotlineCallText}>1900 6828 (Nhánh 2)</Text>
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
