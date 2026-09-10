// ============================================================
// BookingDetailScreen — Flow 1 Step 5/12: chi tiết đơn ghép cặp
// Parent view: đếm ngược cam kết, hủy đơn, xác nhận no-show,
// duyệt đổi giờ. CP view: bắt đầu/kết thúc, hủy với lý do.
// Trạng thái luôn hiển thị NHÃN TIẾNG VIỆT (không lộ enum).
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, TextInput, Modal, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
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
  const { bookingId } = route.params || {};
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [reasonCode, setReasonCode] = useState('');
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
      // Lỗi mạng/server → thông báo tiếng Việt + nút thử lại (không crash)
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
  }, [booking?.status, secondsLeft > 0]);

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
    if (!reason) return Alert.alert('Thiếu thông tin', 'Chọn lý do hủy.');
    if (reason.forceMajeure && note.trim().length < 20)
      return Alert.alert('Lý do bất khả kháng',
        'Cần ghi chú ít nhất 20 ký tự để minh bạch với phụ huynh.');
    setCancelModal(false);
    await run(() => cancelBooking(bookingId, {
      reason_code: reasonCode, note: note.trim(), evidence: [],
    }), 'Đã gửi yêu cầu hủy. Hệ thống sẽ tìm người thay thế và đền bù cho phụ huynh.');
  };

  if (loading) {
    return <View style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>;
  }
  if (loadError) {
    return <View style={[styles.container, styles.center]}>
      <Ionicons name="cloud-offline-outline" size={44} color="#d1d5db" />
      <Text style={{ marginTop: 10, color: COLORS.gray, textAlign: 'center' }}>{loadError}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={load}>
        <Text style={{ color: COLORS.white, fontWeight: '600' }}>Thử lại</Text>
      </TouchableOpacity>
    </View>;
  }
  if (!booking) {
    return <View style={[styles.container, styles.center]}>
      <Text style={{ color: COLORS.gray }}>Không tìm thấy đơn.</Text>
    </View>;
  }

  const isCarePartner = user?.role === 'worker' || (user?.id && booking.carepartner_id && String(user.id) === String(booking.carepartner_id));
  const isParent = !isCarePartner && (user?.role === 'parent' || (user?.id && booking.parent_id && String(user.id) === String(booking.parent_id)));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 40 }}>
        <View style={styles.card}>
          <Text style={styles.statusBadge}>{booking.status_label_vi}</Text>
          <Text style={styles.jobTitle}>{booking.job_title || 'Công việc ghép cặp'}</Text>
          {booking.first_slot && (
            <View style={styles.metaRow}>
              <Ionicons name="calendar" size={15} color={COLORS.primary} />
              <Text style={styles.meta}>
                {booking.first_slot.date} · {booking.first_slot.time_from.slice(0, 5)}
                -{booking.first_slot.time_to.slice(0, 5)}
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

        {/* HÀNH ĐỘNG CP — XÁC NHẬN CAM KẾT (Grab-style, QA 2026-09-10 #2) */}
        {isCarePartner && booking.status === 'awaiting_commitment' && (
          <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]}
            disabled={actionLoading}
            onPress={() => run(() => commitBooking(bookingId), 'Đã cam kết nhận đơn. Nhớ có mặt đúng giờ nhé!')}>
            <Text style={styles.primaryBtnText}>Xác nhận cam kết</Text>
          </TouchableOpacity>
        )}
        {/* HÀNH ĐỘNG CP */}
        {isCarePartner && (booking.status === 'committed' || booking.status === 'suspected_no_show') && (
          <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]}
            disabled={actionLoading}
            onPress={() => run(() => startBooking(bookingId), 'Đã bắt đầu làm việc.')}>
            <Text style={styles.primaryBtnText}>Bắt đầu làm việc</Text>
          </TouchableOpacity>
        )}
        {isCarePartner && booking.status === 'in_progress' && (
          <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]}
            disabled={actionLoading}
            onPress={() => run(() => completeBooking(bookingId), 'Đã kết thúc. Đừng quên đánh giá!')}>
            <Text style={styles.primaryBtnText}>Kết thúc đơn</Text>
          </TouchableOpacity>
        )}

        {/* NÚT KHÁNG CÁO CHO CP KHI BỊ PHẠT */}
        {isCarePartner && ['cancelled_by_carepartner', 'no_show', 'no_show_unconfirmed', 'suspected_no_show'].includes(booking.status) && (
          <TouchableOpacity style={[styles.actionBtn, styles.warningBtn]}
            onPress={() => navigation.navigate('Appeal', { bookingId: booking.id })}>
            <Text style={styles.warningBtnText}>⚖️ Gửi đơn kháng cáo ELO</Text>
          </TouchableOpacity>
        )}

        {/* HÀNH ĐỘNG PARENT */}
        {isParent && booking.status === 'suspected_no_show' && (
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
        {isParent && (booking.status === 'reschedule_requested') && (
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

      {/* MODAL HỦY */}
      <Modal visible={cancelModal} transparent animationType="slide"
        onRequestClose={() => setCancelModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{isParent ? 'Xác nhận hủy đơn' : 'Lý do hủy đơn'}</Text>
            {isParent ? (
              <Text style={{ fontSize: 13, color: COLORS.gray, marginBottom: 8, lineHeight: 18 }}>
                Bạn có chắc chắn muốn hủy đơn này? Nếu hủy sát giờ (dưới 3h trước ca), CarePartner có thể được hỗ trợ điểm tín nhiệm.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {CANCEL_REASONS.map((r) => (
                  <TouchableOpacity key={r.code}
                    style={[styles.reasonRow, reasonCode === r.code && styles.reasonActive]}
                    onPress={() => setReasonCode(r.code)}>
                    <Text style={styles.reasonText}>{r.label}</Text>
                    {r.forceMajeure && <Text style={styles.fmTag}>Bất khả kháng</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TextInput style={styles.noteInput}
              placeholder={isParent ? 'Ghi chú lý do hủy (tùy chọn)' : 'Ghi chú (bắt buộc với lý do bất khả kháng, tối thiểu 20 ký tự)'}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', justifyContent: 'center' },
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
