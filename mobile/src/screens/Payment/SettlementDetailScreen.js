import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  ActivityIndicator, Alert, Platform, Linking, Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getSettlements, getSettlementDetail } from '../../api/payments';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const STATUS_STYLE = {
  pending:        { color: COLORS.warning,  bg: COLORS.warningBg,  label: 'Chờ sinh QR' },
  qr_generated:   { color: COLORS.info,     bg: COLORS.infoBg,     label: 'Đã có QR — chờ thanh toán' },
  paid:           { color: COLORS.success,  bg: COLORS.successBg,  label: 'Đã thanh toán' },
  overdue:        { color: COLORS.error,    bg: COLORS.errorBg,    label: 'Quá hạn' },
  cancelled:      { color: COLORS.textMuted, bg: '#f3f4f6',        label: 'Đã huỷ' },
};

export default function SettlementDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { settlementId } = route.params || {};
  const [settlement, setSettlement] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (settlementId) {
      getSettlementDetail(settlementId)
        .then(res => setSettlement(res.data))
        .catch(e => {
          console.error(e);
          Alert.alert('Lỗi', 'Không thể tải thông tin kỳ thanh toán.');
          navigation.goBack();
        })
        .finally(() => setIsLoading(false));
    } else {
      // No specific ID → list all settlements
      getSettlements()
        .then(res => {
          if (res.data && res.data.length > 0) {
            setSettlement(res.data[0]); // Show latest
          }
        })
        .catch(e => console.error(e))
        .finally(() => setIsLoading(false));
    }
  }, [settlementId]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (!settlement) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Kỳ thanh toán</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="receipt-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>Chưa có kỳ thanh toán</Text>
          <Text style={styles.emptyText}>
            Khi bạn hoàn thành công việc thanh toán tiền mặt, hoa hồng 20% sẽ được tổng hợp vào cuối tháng và gửi QR cho bạn tại đây.
          </Text>
        </View>
      </View>
    );
  }

  const st = STATUS_STYLE[settlement.status] || STATUS_STYLE.pending;
  const total = parseInt(settlement.total_amount) || 0;
  const dueAt = settlement.due_at ? new Date(settlement.due_at) : null;
  const isOverdue = settlement.status === 'overdue' || (dueAt && dueAt < new Date() && settlement.status === 'qr_generated');
  const canPay = settlement.status === 'qr_generated' || settlement.status === 'overdue';

  const openMoMo = async () => {
    if (settlement.momo_pay_url) {
      try {
        if (Platform.OS === 'web') {
          window.open(settlement.momo_pay_url, '_blank');
        } else {
          await Linking.openURL(settlement.momo_pay_url);
        }
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể mở MoMo. Vui lòng thử lại.');
      }
    } else {
      Alert.alert('Chưa có QR', 'Vui lòng liên hệ Admin để được tạo QR thanh toán.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kỳ thanh toán hoa hồng</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Period + Status */}
        <View style={styles.periodCard}>
          <View style={styles.periodHeader}>
            <View>
              <Text style={styles.periodLabel}>Kỳ thanh toán</Text>
              <Text style={styles.periodValue}>
                Tháng {String(settlement.period_month).padStart(2, '0')}/{settlement.period_year}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
              <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Tổng hoa hồng cần nộp</Text>
            <Text style={[styles.amountValue, isOverdue && { color: COLORS.error }]}>
              {total.toLocaleString('vi-VN')}đ
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="briefcase-outline" size={16} color={COLORS.primary} />
              <Text style={styles.statText}>{settlement.total_tasks} công việc</Text>
            </View>
            {dueAt && (
              <View style={styles.statItem}>
                <Ionicons name="calendar-outline" size={16} color={isOverdue ? COLORS.error : COLORS.warning} />
                <Text style={[styles.statText, isOverdue && { color: COLORS.error }]}>
                  Hạn: {dueAt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* QR Code */}
        {settlement.momo_qr_code_url && canPay && (
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Quét QR để thanh toán</Text>
            <Text style={styles.qrDesc}>
              Mở app MoMo → Quét mã → Quét mã QR bên dưới → Nhập số tiền {total.toLocaleString('vi-VN')}đ
            </Text>
            <View style={styles.qrImageWrap}>
              <Image
                source={{ uri: settlement.momo_qr_code_url }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            </View>
            <TouchableOpacity style={styles.openMoMoBtn} onPress={openMoMo} activeOpacity={0.85}>
              <Ionicons name="wallet" size={20} color="#fff" />
              <Text style={styles.openMoMoBtnText}>Mở MoMo app</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Overdue warning */}
        {isOverdue && (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={20} color={COLORS.error} />
            <Text style={styles.warningText}>
              Kỳ thanh toán đã quá hạn. Vui lòng thanh toán sớm để tránh khoá tài khoản.
            </Text>
          </View>
        )}

        {/* Paid info */}
        {settlement.status === 'paid' && settlement.paid_at && (
          <View style={styles.paidBox}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.paidText}>
              Đã thanh toán vào {new Date(settlement.paid_at).toLocaleString('vi-VN')}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Đây là tổng hợp hoa hồng 20% từ các công việc thanh toán tiền mặt trong tháng. Hệ thống tự động sinh QR vào ngày 1 hàng tháng.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  emptyContainer: { flex: 1, backgroundColor: COLORS.background },
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
  periodCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 16, gap: 14, ...SHADOWS.cardHover,
  },
  periodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  periodLabel: { ...TYPO.overline, color: COLORS.textMuted },
  periodValue: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  statusBadge: { borderRadius: SIZES.radiusXl, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { ...TYPO.caption, fontWeight: '700' },
  amountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm, padding: 14,
    borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  amountLabel: { ...TYPO.bodySmall, color: COLORS.primaryDark, fontWeight: '600' },
  amountValue: { ...TYPO.h3, color: COLORS.primary, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 16 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  qrCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 16, gap: 12, alignItems: 'center', ...SHADOWS.cardHover,
  },
  qrTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  qrDesc: { ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  qrImageWrap: {
    width: 240, height: 240, borderRadius: SIZES.radiusMd,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: COLORS.primarySoft,
    overflow: 'hidden',
  },
  qrImage: { width: 220, height: 220 },
  openMoMoBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    paddingHorizontal: 24, width: '100%',
    ...SHADOWS.large,
  },
  openMoMoBtnText: { color: '#fff', ...TYPO.button, fontSize: 15 },
  warningBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.errorBg, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#fecaca',
  },
  warningText: { flex: 1, ...TYPO.bodySmall, color: COLORS.error, lineHeight: 20 },
  paidBox: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    backgroundColor: COLORS.successBg, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0',
  },
  paidText: { flex: 1, ...TYPO.bodySmall, color: COLORS.success, fontWeight: '600' },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  infoText: { flex: 1, ...TYPO.bodySmall, color: COLORS.primaryDark, lineHeight: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24, gap: 12 },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h5, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
