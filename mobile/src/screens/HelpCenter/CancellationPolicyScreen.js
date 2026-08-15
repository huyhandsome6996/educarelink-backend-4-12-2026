// ============================================================
// CancellationPolicyScreen — MỚI (Nhóm B, mock data)
// Hiển thị chính sách huỷ lịch + hoàn tiền.
// Chưa có backend → dùng mock data tĩnh.
// Khi có API: thay MOCK_BOOKING bằng getBooking(taskId) trong useEffect.
//
// Layout theo design HTML cancellation_policy/code.html:
// - Top App Bar: surface bg, back + 'Huỷ Lịch' + spacer
// - Warning banner: errorContainer bg, 'Lưu ý giới hạn huỷ' (2/3 lần)
// - Refund policy section: surface card với progress timeline
//   (3 mốc: ≥24h 100%, 6-24h 80%, <6h 50%) + estimated refund
// - Booking detail section: surface card với task info + price
// - Reason input: text area
// - Sticky footer: 'Xác nhận huỷ lịch' button (errorDeep bg)
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, TextInput, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';

// === MOCK DATA — thay bằng API khi backend sẵn sàng ===
const MOCK_BOOKING = {
  taskTitle: 'Đưa đón bé Mai từ trường',
  carepartner: 'Nguyễn Thị Lan',
  scheduledTime: 'Hôm nay, 16:30',
  originalPrice: 300000,
  refundPercent: 50, // dựa trên thời gian hiện tại so với scheduled_time
  refundAmount: 150000,
  cancellationsUsed: 2,
  cancellationsLimit: 3,
};

// 3 mốc hoàn tiền
const REFUND_TIERS = [
  {
    hoursBefore: '≥ 24h',
    percent: 100,
    icon: 'checkmark',
    active: false,
  },
  {
    hoursBefore: '6h - 24h',
    percent: 80,
    icon: 'checkmark',
    active: false,
  },
  {
    hoursBefore: '< 6h',
    percent: 50,
    icon: 'time',
    active: true, // mốc hiện tại
  },
];

const CANCEL_REASONS = [
  { id: 'schedule', label: 'Trùng lịch đột xuất' },
  { id: 'sick', label: 'Bé bị ốm' },
  { id: 'family', label: 'Việc gia đình' },
  { id: 'weather', label: 'Thời tiết xấu' },
  { id: 'other', label: 'Lý do khác' },
];

export default function CancellationPolicyScreen() {
  const navigation = useNavigation();
  const [booking] = useState(MOCK_BOOKING);
  const [selectedReason, setSelectedReason] = useState(null);
  const [note, setNote] = useState('');

  const handleConfirmCancel = () => {
    if (!selectedReason) {
      if (Platform.OS === 'web') {
        alert('Vui lòng chọn lý do huỷ lịch.');
      } else {
        Alert.alert('Thiếu thông tin', 'Vui lòng chọn lý do huỷ lịch.');
      }
      return;
    }
    showComingSoon('Xác nhận huỷ lịch (backend đang phát triển)');
  };

  const formatPrice = (price) => `${price.toLocaleString('vi-VN')}đ`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Huỷ Lịch</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Warning banner — errorContainer bg */}
        <View style={styles.warningBanner}>
          <View style={styles.warningIconBox}>
            <Ionicons name="warning" size={20} color={COLORS.errorDeep} />
          </View>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Lưu ý giới hạn huỷ</Text>
            <Text style={styles.warningText}>
              Bạn đã sử dụng <Text style={styles.warningStrong}>{booking.cancellationsUsed}/{booking.cancellationsLimit}</Text> lần huỷ lịch miễn phí trong tháng này. Nếu vượt quá, tài khoản có thể bị hạn chế.
            </Text>
          </View>
        </View>

        {/* Refund policy section */}
        <View style={styles.policyCard}>
          <Text style={styles.sectionTitle}>Chính sách hoàn tiền</Text>

          {/* Timeline 3 mốc */}
          <View style={styles.timelineRow}>
            {/* Background line */}
            <View style={styles.timelineBgLine} />
            {/* Active progress (1/3 = 33%) */}
            <View style={[styles.timelineActiveLine, { width: '33%' }]} />

            {REFUND_TIERS.map((tier, idx) => (
              <View key={idx} style={styles.tierItem}>
                {/* Tier dot */}
                <View style={[styles.tierDot, tier.active && styles.tierDotActive]}>
                  <Ionicons name={tier.icon} size={14} color={tier.active ? '#fff' : COLORS.onSurfaceVariant} />
                </View>
                {/* Active tooltip */}
                {tier.active && (
                  <View style={styles.tierTooltip}>
                    <Text style={styles.tierTooltipText}>Hiện tại</Text>
                  </View>
                )}
                {/* Tier label */}
                <Text style={[styles.tierHours, tier.active && styles.tierHoursActive]}>
                  {tier.hoursBefore}
                </Text>
                <Text style={[styles.tierPercent, tier.active && styles.tierPercentActive]}>
                  {tier.percent}%
                </Text>
              </View>
            ))}
          </View>

          {/* Estimated refund */}
          <View style={styles.refundBox}>
            <View>
              <Text style={styles.refundLabel}>
                Số tiền hoàn lại dự kiến ({booking.refundPercent}%)
              </Text>
              <Text style={styles.refundNote}>Hoàn về ví EduCareLink sau 24h</Text>
            </View>
            <View style={styles.refundAmountBlock}>
              <Text style={styles.refundAmount}>{formatPrice(booking.refundAmount)}</Text>
              <Text style={styles.refundOriginal}>{formatPrice(booking.originalPrice)}</Text>
            </View>
          </View>
        </View>

        {/* Booking detail */}
        <View style={styles.bookingCard}>
          <Text style={styles.sectionTitle}>Chi tiết buổi chăm sóc</Text>
          <View style={styles.bookingInfo}>
            <View style={styles.bookingIcon}>
              <Ionicons name="person" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.bookingText}>
              <Text style={styles.bookingTitle}>{booking.taskTitle}</Text>
              <Text style={styles.bookingSub}>CarePartner: {booking.carepartner}</Text>
              <Text style={styles.bookingSub}>Thời gian: {booking.scheduledTime}</Text>
            </View>
          </View>
        </View>

        {/* Reason selection */}
        <View style={styles.reasonSection}>
          <Text style={styles.sectionTitle}>Lý do huỷ lịch</Text>
          <View style={styles.reasonList}>
            {CANCEL_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.reasonChip,
                  selectedReason === reason.id && styles.reasonChipActive,
                ]}
                onPress={() => setSelectedReason(reason.id)}
                activeOpacity={0.85}
              >
                <Text style={[
                  styles.reasonChipText,
                  selectedReason === reason.id && styles.reasonChipTextActive,
                ]}>
                  {reason.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note input */}
          <View style={styles.noteField}>
            <Text style={styles.noteLabel}>Ghi chú thêm (tuỳ chọn)</Text>
            <View style={styles.noteInputBox}>
              <TextInput
                style={styles.noteInput}
                placeholder="VD: Bé bị sốt nên cần nghỉ..."
                placeholderTextColor={COLORS.outline}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer — 'Xác nhận huỷ lịch' button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={handleConfirmCancel}
          activeOpacity={0.85}
        >
          <Ionicons name="close-circle" size={20} color="#fff" />
          <Text style={styles.cancelBtnText}>Xác nhận huỷ lịch</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h1,
    color: COLORS.primary,
    fontSize: 22,
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 20 },
  // === WARNING BANNER ===
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.errorContainer,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.2)',
    ...SHADOWS.small,
  },
  warningIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  warningContent: { flex: 1 },
  warningTitle: {
    ...TYPO.h4,
    color: COLORS.errorDeep,
    marginBottom: 4,
  },
  warningText: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurface, // on-error-container
    lineHeight: 20,
  },
  warningStrong: {
    fontWeight: '800',
    color: COLORS.errorDeep,
  },
  // === POLICY CARD ===
  policyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  sectionTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    marginBottom: 16,
  },
  // === TIMELINE ===
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    paddingTop: 8,
    paddingBottom: 16,
    marginBottom: 16,
  },
  timelineBgLine: {
    position: 'absolute',
    top: 32,
    left: 32,
    right: 32,
    height: 4,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: 2,
  },
  timelineActiveLine: {
    position: 'absolute',
    top: 32,
    right: 32,
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    zIndex: 1,
  },
  tierItem: {
    alignItems: 'center',
    width: 80,
    gap: 4,
  },
  tierDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 2,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  tierDotActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.surface,
    ...SHADOWS.medium,
  },
  tierTooltip: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  tierTooltipText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  tierHours: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 4,
  },
  tierHoursActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  tierPercent: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  tierPercentActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  // === REFUND BOX ===
  refundBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: 14,
    padding: 16,
  },
  refundLabel: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
  },
  refundNote: {
    ...TYPO.caption,
    color: COLORS.outline,
    marginTop: 2,
  },
  refundAmountBlock: {
    alignItems: 'flex-end',
  },
  refundAmount: {
    ...TYPO.h2,
    color: COLORS.primary,
  },
  refundOriginal: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    textDecorationLine: 'line-through',
  },
  // === BOOKING CARD ===
  bookingCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  bookingInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  bookingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingText: { flex: 1 },
  bookingTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  bookingSub: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  // === REASON SECTION ===
  reasonSection: {
    gap: 12,
  },
  reasonList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  reasonChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...SHADOWS.small,
  },
  reasonChipText: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurface,
  },
  reasonChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  // === NOTE INPUT ===
  noteField: {
    gap: 8,
  },
  noteLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  noteInputBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
  },
  noteInput: {
    ...TYPO.body,
    color: COLORS.onSurface,
    padding: 0,
    minHeight: 56,
  },
  // === FOOTER ===
  footer: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  cancelBtn: {
    backgroundColor: COLORS.errorDeep,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  cancelBtnText: {
    ...TYPO.h4,
    color: '#ffffff',
  },
});
