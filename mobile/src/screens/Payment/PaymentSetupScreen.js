import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator,
  ScrollView, Platform, Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { setupPayment } from '../../api/payments';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

export default function PaymentSetupScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, taskTitle, taskPrice } = route.params || {};
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const price = parseInt(taskPrice) || 0;
  const commission = Math.round(price * 0.2);
  const workerGets = price - commission;

  const handleSubmit = async () => {
    if (!selectedMethod) {
      Alert.alert('Chưa chọn', 'Vui lòng chọn phương thức thanh toán.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await setupPayment(taskId, selectedMethod);
      const payment = res.data;

      if (selectedMethod === 'momo_escrow') {
        if (!payment.momo_configured) {
          Alert.alert(
            'MoMo chưa sẵn sàng',
            'Hệ thống chưa cấu hình MoMo. Vui lòng chọn "Tiền mặt" hoặc thử lại sau.',
            [{ text: 'OK' }]
          );
        } else if (payment.momo_pay_url) {
          // Mở MoMo app hoặc web MoMo
          if (Platform.OS === 'web') {
            window.open(payment.momo_pay_url, '_blank');
          } else {
            await Linking.openURL(payment.momo_pay_url);
          }
          Alert.alert(
            'Đã tạo giao dịch',
            'Đang chuyển bạn tới MoMo. Sau khi thanh toán, tiền sẽ được giữ đến khi Carepartner hoàn thành.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      } else {
        // cash
        Alert.alert(
          '✅ Đã ghi nhận',
          'Công việc sẽ thanh toán tiền mặt. Sau khi hoàn thành, hoa hồng 20% sẽ được tổng hợp và gửi QR cho bạn vào cuối tháng.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Không thể thiết lập thanh toán.';
      Alert.alert('Lỗi', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const METHODS = [
    {
      id: 'momo_escrow',
      icon: 'wallet',
      label: 'MoMo Escrow',
      desc: 'Phụ huynh trả qua MoMo — tiền được GIỮ. Carepartner xong việc → tự động chuyển 80% cho Carepartner, 20% hoa hồng cho nền tảng.',
      color: COLORS.primary,
      recommended: true,
    },
    {
      id: 'cash',
      icon: 'cash-outline',
      label: 'Tiền mặt',
      desc: 'Phụ huynh trả trực tiếp cho Carepartner sau khi xong việc. Cuối tháng, hệ thống gửi mã QR MoMo để Carepartner thanh toán 20% hoa hồng cho nền tảng.',
      color: COLORS.success,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thiết lập thanh toán</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Task summary */}
        <View style={styles.taskCard}>
          <Ionicons name="briefcase-outline" size={20} color={COLORS.primary} />
          <View style={styles.taskInfo}>
            <Text style={styles.taskTitle} numberOfLines={1}>{taskTitle || `Công việc #${taskId}`}</Text>
            <Text style={styles.taskPrice}>{price.toLocaleString('vi-VN')}đ</Text>
          </View>
        </View>

        {/* Breakdown */}
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Chi tiết thanh toán</Text>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Tổng tiền phụ huynh trả</Text>
            <Text style={styles.breakdownValue}>{price.toLocaleString('vi-VN')}đ</Text>
          </View>
          <View style={[styles.breakdownRow, { backgroundColor: COLORS.warningBg }]}>
            <View style={styles.breakdownLabelRow}>
              <Ionicons name="trending-down" size={14} color={COLORS.warning} />
              <Text style={[styles.breakdownLabel, { color: COLORS.warning }]}>Hoa hồng nền tảng (20%)</Text>
            </View>
            <Text style={[styles.breakdownValue, { color: COLORS.warning }]}>{commission.toLocaleString('vi-VN')}đ</Text>
          </View>
          <View style={[styles.breakdownRow, { backgroundColor: COLORS.successBg }]}>
            <View style={styles.breakdownLabelRow}>
              <Ionicons name="trending-up" size={14} color={COLORS.success} />
              <Text style={[styles.breakdownLabel, { color: COLORS.success }]}>Carepartner nhận</Text>
            </View>
            <Text style={[styles.breakdownValue, { color: COLORS.success, fontWeight: '900' }]}>{workerGets.toLocaleString('vi-VN')}đ</Text>
          </View>
        </View>

        {/* Method options */}
        <Text style={styles.sectionLabel}>Chọn phương thức thanh toán</Text>
        {METHODS.map((method) => {
          const isSelected = selectedMethod === method.id;
          return (
            <TouchableOpacity
              key={method.id}
              style={[styles.methodCard, isSelected && styles.methodCardActive]}
              onPress={() => setSelectedMethod(method.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.methodIconCircle, { backgroundColor: method.color + '15' }]}>
                <Ionicons name={method.icon} size={24} color={method.color} />
              </View>
              <View style={styles.methodContent}>
                <View style={styles.methodHeader}>
                  <Text style={styles.methodLabel}>{method.label}</Text>
                  {method.recommended && (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedText}>Khuyên dùng</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.methodDesc}>{method.desc}</Text>
              </View>
              <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                {isSelected && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Với MoMo Escrow: tiền được GIỮ an toàn. Chỉ chuyển cho Carepartner khi công việc hoàn thành.
            Nếu huỷ việc khi đang giữ tiền → hoàn 100% cho phụ huynh.
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, (!selectedMethod || isLoading) && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={!selectedMethod || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitText}>Xác nhận thiết lập</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    ...SHADOWS.small,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1, padding: SIZES.md },
  taskCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 12, ...SHADOWS.cardHover,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  taskInfo: { flex: 1 },
  taskTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '600' },
  taskPrice: { ...TYPO.h4, color: COLORS.primary, fontWeight: '900', marginTop: 2 },
  breakdownCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 20, gap: 8, ...SHADOWS.cardHover,
  },
  breakdownTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700', marginBottom: 4 },
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 12, borderRadius: SIZES.radiusSm, gap: 10,
  },
  breakdownLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  breakdownLabel: { ...TYPO.bodySmall, color: COLORS.textSecondary, flexShrink: 1 },
  breakdownValue: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  sectionLabel: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 10 },
  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md,
    marginBottom: 10, borderWidth: 2, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  methodCardActive: {
    borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight,
  },
  methodIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  methodContent: { flex: 1, gap: 4 },
  methodHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodLabel: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  recommendedBadge: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusXl,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  recommendedText: { color: '#fff', ...TYPO.overline, fontSize: 9, fontWeight: '700' },
  methodDesc: { ...TYPO.bodySmall, color: COLORS.textSecondary, lineHeight: 18 },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  radioOuterActive: { borderColor: COLORS.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 14,
    marginTop: 8, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  infoText: { flex: 1, ...TYPO.bodySmall, color: COLORS.primaryDark, lineHeight: 20 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 56,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    ...SHADOWS.large,
  },
  submitText: { color: '#fff', ...TYPO.button, fontSize: 16 },
});
