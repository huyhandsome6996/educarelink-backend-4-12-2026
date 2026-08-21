// ============================================================
// PaymentDetailScreen — WIRING FIX (2026-08-21)
// Hiển thị chi tiết 1 khoản thanh toán.
// Dùng getPaymentDetail(paymentId) từ api/payments.js.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getPaymentDetail } from '../../api/payments';
import { COLORS, SHADOWS, TYPO, ANIM } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_STYLE = {
  pending:       { label: 'Chờ thanh toán', color: COLORS.warning, bg: COLORS.warningBg, icon: 'time' },
  held:          { label: 'Đang giữ tiền (Escrow)', color: COLORS.info, bg: COLORS.infoBg, icon: 'lock-closed' },
  completed:     { label: 'Đã hoàn tất', color: COLORS.success, bg: COLORS.successBg, icon: 'checkmark-circle' },
  cancelled:     { label: 'Đã huỷ', color: COLORS.textMuted, bg: '#f3f4f6', icon: 'close-circle' },
  refunded:      { label: 'Đã hoàn tiền', color: COLORS.info, bg: COLORS.infoBg, icon: 'return-down-back' },
  payout_failed: { label: 'Giải ngân thất bại', color: COLORS.error, bg: COLORS.errorBg, icon: 'alert-circle' },
};

const METHOD_LABEL = {
  momo_escrow: 'MoMo (Escrow)',
  cash: 'Tiền mặt',
  payos: 'PayOS (VietQR)',
};

function buildTimeline(payment) {
  const timeline = [];
  const s = payment.status;

  timeline.push({
    label: 'Tạo giao dịch',
    time: payment.created_at,
    status: 'done',
  });

  if (s === 'pending' && !payment.held_at) {
    timeline.push({ label: 'Chờ phụ huynh thanh toán', time: null, status: 'pending' });
  }

  if (payment.held_at) {
    timeline.push({ label: 'Tiền đã được giữ (Escrow)', time: payment.held_at, status: 'done' });
  }

  if (s === 'completed' && payment.completed_at) {
    timeline.push({ label: 'Giao dịch hoàn tất', time: payment.completed_at, status: 'done' });
  } else if (s === 'cancelled') {
    timeline.push({ label: 'Giao dịch đã huỷ', time: payment.updated_at, status: 'cancelled' });
  } else if (s === 'refunded') {
    timeline.push({ label: 'Đã hoàn tiền', time: payment.updated_at, status: 'refunded' });
  } else if (s === 'payout_failed') {
    timeline.push({ label: 'Giải ngân thất bại', time: payment.updated_at, status: 'rejected' });
  } else if (payment.held_at) {
    timeline.push({ label: 'Chờ hoàn thành việc để giải ngân', time: null, status: 'pending' });
  }

  return timeline;
}

export default function PaymentDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { paymentId } = route.params || {};
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [payment, setPayment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIM.timingNormal, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    if (!paymentId) { setIsLoading(false); return; }
    const fetchPayment = async () => {
      try {
        const res = await getPaymentDetail(paymentId);
        setPayment(res.data);
      } catch (e) {
        console.error('[PaymentDetail] Lỗi:', e?.message || e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPayment();
  }, [paymentId]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ ...TYPO.body, color: COLORS.onSurfaceVariant }}>Không tìm thấy giao dịch này.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          <Text style={{ ...TYPO.h4, color: COLORS.primary }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const st = STATUS_STYLE[payment.status] || STATUS_STYLE.pending;
  const timeline = buildTimeline(payment);
  const methodLabel = METHOD_LABEL[payment.method] || payment.method;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.appBarBtn} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Chi tiết thanh toán</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Ionicons name={st.icon} size={20} color={st.color} />
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={styles.amountBig}>{parseInt(payment.amount).toLocaleString('vi-VN')}đ</Text>
          <Text style={styles.taskTitle} numberOfLines={1}>{payment.task_title || 'Công việc'}</Text>
        </View>

        {/* Info Grid */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phương thức</Text>
            <Text style={styles.infoValue}>{methodLabel}</Text>
          </View>
          {payment.momo_transaction_id ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Mã giao dịch MoMo</Text>
              <Text style={[styles.infoValue, { fontSize: 12 }]} numberOfLines={1}>{payment.momo_transaction_id}</Text>
            </View>
          ) : null}
          {payment.payos_payment_link_id ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>PayOS Link ID</Text>
              <Text style={[styles.infoValue, { fontSize: 12 }]} numberOfLines={1}>{payment.payos_payment_link_id}</Text>
            </View>
          ) : null}
          {payment.commission_amount ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Hoa hồng ({payment.commission_percent || 10}%)</Text>
              <Text style={[styles.infoValue, { color: COLORS.warning }]}>{parseInt(payment.commission_amount).toLocaleString('vi-VN')}đ</Text>
            </View>
          ) : null}
          {payment.worker_payout_amount ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Carepartner nhận</Text>
              <Text style={[styles.infoValue, { color: COLORS.success }]}>{parseInt(payment.worker_payout_amount).toLocaleString('vi-VN')}đ</Text>
            </View>
          ) : null}
        </View>

        {/* Timeline */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>Trạng thái giao dịch</Text>
          {timeline.map((step, idx) => {
            const isLast = idx === timeline.length - 1;
            const isDone = step.status === 'done';
            const isPending = step.status === 'pending';
            const isRejected = step.status === 'rejected' || step.status === 'cancelled' || step.status === 'refunded';
            return (
              <View key={idx} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View style={[styles.timelineDot, isDone && styles.timelineDotDone, isPending && styles.timelineDotPending, isRejected && styles.timelineDotRejected]}>
                    <Ionicons name={isDone ? 'checkmark' : isRejected ? 'close' : 'time'} size={12} color={isDone ? '#fff' : isRejected ? COLORS.error : COLORS.onSurfaceVariant} />
                  </View>
                  {!isLast && <View style={[styles.timelineLine, isDone && styles.timelineLineDone]} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>{step.label}</Text>
                  {step.time ? (
                    <Text style={styles.timelineTime}>
                      {new Date(step.time).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  appBarBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { ...TYPO.h3, color: COLORS.onSurface },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16 },
  statusCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.outlineVariant,
    ...SHADOWS.medium, gap: 10,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  statusText: { ...TYPO.caption, fontWeight: '700' },
  amountBig: { ...TYPO.h1, color: COLORS.primary, fontWeight: '900' },
  taskTitle: { ...TYPO.body, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  infoCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant, ...SHADOWS.small,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
  },
  infoLabel: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  infoValue: { ...TYPO.body, color: COLORS.onSurface, fontWeight: '700' },
  timelineCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant, ...SHADOWS.small,
  },
  timelineTitle: { ...TYPO.h4, color: COLORS.onSurface, marginBottom: 14, fontWeight: '700' },
  timelineItem: { flexDirection: 'row', gap: 12, paddingBottom: 16 },
  timelineLeft: { alignItems: 'center', width: 24 },
  timelineDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center', alignItems: 'center',
  },
  timelineDotDone: { backgroundColor: COLORS.success },
  timelineDotPending: { backgroundColor: COLORS.warningBg, borderWidth: 2, borderColor: COLORS.warning },
  timelineDotRejected: { backgroundColor: COLORS.errorBg, borderWidth: 2, borderColor: COLORS.error },
  timelineLine: { width: 2, flex: 1, backgroundColor: COLORS.outlineVariant, marginTop: 4, minHeight: 20 },
  timelineLineDone: { backgroundColor: COLORS.success },
  timelineContent: { flex: 1, paddingTop: 2 },
  timelineLabel: { ...TYPO.body, color: COLORS.onSurface, fontWeight: '500' },
  timelineTime: { ...TYPO.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },
});
