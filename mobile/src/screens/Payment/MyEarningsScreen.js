import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyEarnings, getMyPayments } from '../../api/payments';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const STATUS_STYLE = {
  pending:       { color: COLORS.warning, bg: COLORS.warningBg, label: 'Chờ thanh toán' },
  held:          { color: COLORS.info,    bg: COLORS.infoBg,    label: 'Đang giữ tiền' },
  completed:     { color: COLORS.success, bg: COLORS.successBg, label: 'Đã hoàn tất' },
  cancelled:     { color: COLORS.textMuted, bg: '#f3f4f6',      label: 'Đã huỷ' },
  refunded:      { color: COLORS.info,    bg: COLORS.infoBg,    label: 'Đã hoàn tiền' },
  payout_failed: { color: COLORS.error,   bg: COLORS.errorBg,   label: 'Giải ngân thất bại' },
};

const METHOD_LABEL = {
  momo_escrow: 'MoMo',
  cash: 'Tiền mặt',
};

export default function MyEarningsScreen() {
  const navigation = useNavigation();
  const [earnings, setEarnings] = useState(null);
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [earnRes, payRes] = await Promise.all([
        getMyEarnings(),
        getMyPayments(),
      ]);
      setEarnings(earnRes.data);
      setPayments(payRes.data || []);
    } catch (e) {
      console.error('Lỗi tải thu nhập:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  const totalEarned = parseFloat(earnings?.total_earned || 0);
  const pendingPayout = parseFloat(earnings?.pending_payout || 0);
  const owed = parseFloat(earnings?.cash_commission_owed || 0);
  const recentPayments = earnings?.recent_payments || [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thu nhập của tôi</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: COLORS.successBg, borderColor: '#bbf7d0' }]}>
            <View style={[styles.statIconCircle, { backgroundColor: COLORS.success }]}>
              <Ionicons name="wallet" size={20} color="#fff" />
            </View>
            <Text style={styles.statLabel}>Đã nhận</Text>
            <Text style={[styles.statValue, { color: COLORS.success }]}>
              {totalEarned.toLocaleString('vi-VN')}đ
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: COLORS.infoBg, borderColor: '#bfdbfe' }]}>
            <View style={[styles.statIconCircle, { backgroundColor: COLORS.info }]}>
              <Ionicons name="time" size={20} color="#fff" />
            </View>
            <Text style={styles.statLabel}>Chờ giải ngân</Text>
            <Text style={[styles.statValue, { color: COLORS.info }]}>
              {pendingPayout.toLocaleString('vi-VN')}đ
            </Text>
          </View>
        </View>

        {/* Cash commission owed */}
        {owed > 0 && (
          <TouchableOpacity
            style={styles.owedCard}
            // Fix C2: screen 'SettlementList' không được đăng ký trong AppNavigator.
            // Tên đúng là 'SettlementDetail'. Khi không có settlementId cụ thể,
            // SettlementDetailScreen sẽ tự fetch & hiển thị kỳ gần nhất.
            // Trước đây bấm "Xem chi tiết" sẽ crash/silent fail vì navigate
            // tới screen không tồn tại.
            onPress={() => navigation.navigate('SettlementDetail')}
            activeOpacity={0.85}
          >
            <View style={styles.owedIconCircle}>
              <Ionicons name="receipt" size={22} color="#fff" />
            </View>
            <View style={styles.owedContent}>
              <Text style={styles.owedTitle}>Hoa hồng tiền mặt cần nộp</Text>
              <Text style={styles.owedValue}>{owed.toLocaleString('vi-VN')}đ</Text>
              <Text style={styles.owedHint}>Cuối tháng hệ thống sẽ gửi mã QR MoMo → Xem chi tiết</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.warning} />
          </TouchableOpacity>
        )}

        {/* Recent payments */}
        <Text style={styles.sectionTitle}>Giao dịch gần đây</Text>
        {recentPayments.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="receipt-outline" size={36} color={COLORS.primary} />
            </View>
            <Text style={styles.emptyTitle}>Chưa có giao dịch</Text>
            <Text style={styles.emptyText}>Hoàn thành công việc đầu tiên để nhận thanh toán</Text>
          </View>
        ) : (
          recentPayments.map((payment) => {
            const st = STATUS_STYLE[payment.status] || STATUS_STYLE.pending;
            return (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentTopRow}>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                  <Text style={styles.methodBadge}>{METHOD_LABEL[payment.method] || payment.method}</Text>
                </View>
                <Text style={styles.paymentTask} numberOfLines={1}>{payment.task_title}</Text>
                <View style={styles.paymentAmountsRow}>
                  <View>
                    <Text style={styles.amountLabel}>Tổng</Text>
                    <Text style={styles.amountValue}>{parseInt(payment.amount).toLocaleString('vi-VN')}đ</Text>
                  </View>
                  <View>
                    <Text style={styles.amountLabel}>Bạn nhận</Text>
                    <Text style={[styles.amountValue, { color: COLORS.success }]}>
                      {parseInt(payment.worker_payout_amount).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.amountLabel}>Hoa hồng</Text>
                    <Text style={[styles.amountValue, { color: COLORS.warning }]}>
                      {parseInt(payment.commission_amount).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800' },
  body: { flex: 1, padding: SIZES.md },
  statsGrid: {
    flexDirection: 'row', gap: 12, marginBottom: 16,
  },
  statCard: {
    flex: 1, borderRadius: SIZES.radiusMd, padding: 14, gap: 6,
    borderWidth: 1, ...SHADOWS.cardHover,
  },
  statIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  statLabel: { ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '600' },
  statValue: { ...TYPO.h4, fontWeight: '900' },
  owedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.warningBg, borderRadius: SIZES.radiusMd, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: '#fde68a',
    ...SHADOWS.cardHover,
  },
  owedIconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.warning,
    justifyContent: 'center', alignItems: 'center',
  },
  owedContent: { flex: 1, gap: 2 },
  owedTitle: { ...TYPO.bodySmall, color: COLORS.warning, fontWeight: '600' },
  owedValue: { ...TYPO.h4, color: COLORS.warning, fontWeight: '900' },
  owedHint: { ...TYPO.caption, color: COLORS.textSecondary },
  sectionTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h5, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center' },
  paymentCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 10, gap: 10, ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  paymentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { borderRadius: SIZES.radiusXs, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { ...TYPO.overline, fontWeight: '700' },
  methodBadge: {
    ...TYPO.caption, color: COLORS.textSecondary, fontWeight: '600',
    backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: SIZES.radiusXs,
  },
  paymentTask: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '600' },
  paymentAmountsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  amountLabel: { ...TYPO.overline, color: COLORS.textMuted },
  amountValue: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '700' },
});
