import React, { useRef, useEffect } from 'react';
// ============================================================
// RewardPointsScreen — MỚI (Nhóm B, mock data)
// CHÚ Ý: Backend chưa có model RewardPoint/PointTransaction → toàn bộ data là MOCK.
// WIRING FIX (2026-08-21): Thêm banner "Sắp ra mắt" để người dùng thật
// không hiểu nhầm đây là dữ liệu thật.
// ============================================================

import {View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, FlatList, Animated} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { MOCK_REWARDS, MOCK_VOUCHERS, MOCK_HISTORY } from '../../mocks/rewardPointsMock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function RewardPointsScreen() {
  const navigation = useNavigation();

  // QA-FIX-UI 3.2: fade-in animation khi mount (opacity 0→1)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);
  const insets = useSafeAreaInsets();

  const progressPercent = (MOCK_REWARDS.currentPoints / MOCK_REWARDS.nextTierPoints) * 100;
  const pointsToNext = MOCK_REWARDS.nextTierPoints - MOCK_REWARDS.currentPoints;

  const handleRedeem = (voucher) => {
    if (MOCK_REWARDS.currentPoints < voucher.pointsRequired) {
      showComingSoon(`Bạn cần thêm ${voucher.pointsRequired - MOCK_REWARDS.currentPoints} điểm để đổi voucher này`);
    } else {
      showComingSoon(`Đổi "${voucher.title}" (${voucher.pointsRequired} pts)`);
    }
  };

  const renderVoucher = (voucher) => (
    <View key={voucher.id} style={styles.voucherCard}>
      {/* Image / icon placeholder */}
      <View style={[styles.voucherImageBox, { backgroundColor: voucher.iconBg }]}>
        <Ionicons name={voucher.icon} size={32} color={voucher.iconColor} />
      </View>

      <View style={styles.voucherInfo}>
        <Text style={styles.voucherTitle} numberOfLines={1}>{voucher.title}</Text>
        <Text style={styles.voucherExpiry}>Hết hạn: {voucher.expiry}</Text>
        <View style={styles.voucherPointsRow}>
          <Ionicons name="star" size={14} color={COLORS.primary} />
          <Text style={styles.voucherPointsText}>{voucher.pointsRequired} pts</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.redeemBtn,
          MOCK_REWARDS.currentPoints < voucher.pointsRequired && styles.redeemBtnDisabled,
        ]}
        onPress={() => handleRedeem(voucher)}
        activeOpacity={0.85}
      >
        <Text style={[
          styles.redeemBtnText,
          MOCK_REWARDS.currentPoints < voucher.pointsRequired && styles.redeemBtnTextDisabled,
        ]}>
          {MOCK_REWARDS.currentPoints >= voucher.pointsRequired ? 'Đổi ngay' : 'Thiếu điểm'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistoryItem = (item) => {
    const isPositive = item.points > 0;
    return (
      <View key={item.id} style={styles.historyItem}>
        <View style={[styles.historyIcon, { backgroundColor: isPositive ? COLORS.secondaryLight : COLORS.surfaceContainerHigh }]}>
          <Ionicons name={item.icon} size={16} color={isPositive ? COLORS.secondary : COLORS.onSurfaceVariant} />
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.historyDate}>{item.date}</Text>
        </View>
        <Text style={[styles.historyPoints, { color: isPositive ? COLORS.secondary : COLORS.errorDeep }]}>
          {isPositive ? '+' : ''}{item.points} pts
        </Text>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
         accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Điểm thưởng</Text>
        <TouchableOpacity
          style={styles.appBarBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* WIRING FIX (2026-08-21): Banner "Sắp ra mắt" — backend chưa có model RewardPoint */}
        <View style={styles.comingSoonBanner}>
          <Ionicons name="construct" size={18} color={COLORS.primary} />
          <Text style={styles.comingSoonText}>Tính năng đang được phát triển. Dữ liệu hiển thị dưới đây là minh họa, không phải dữ liệu thật.</Text>
        </View>

        {/* Title section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Điểm thưởng của bạn</Text>
          <Text style={styles.subtitle}>Tích lũy điểm để đổi những phần quà hấp dẫn.</Text>
        </View>

        {/* Hero card — primary-container bg, điểm hiện tại + progress */}
        <View style={styles.heroCard}>
          {/* Decorative blurred circles */}
          <View style={styles.heroDecorCircle1} />
          <View style={styles.heroDecorCircle2} />

          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>Số điểm hiện tại</Text>
            <View style={styles.heroPointsRow}>
              <Text style={styles.heroPoints}>{MOCK_REWARDS.currentPoints.toLocaleString('vi-VN')}</Text>
              <Text style={styles.heroUnit}>pts</Text>
            </View>
            <Text style={styles.heroTier}>Hạng {MOCK_REWARDS.currentTier}</Text>

            {/* Progress bar */}
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressText}>Hạng {MOCK_REWARDS.nextTier}</Text>
                <Text style={styles.progressText}>{MOCK_REWARDS.nextTierPoints.toLocaleString('vi-VN')} pts</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressNote}>
                Còn {pointsToNext} điểm nữa để thăng hạng
              </Text>
            </View>
          </View>
        </View>

        {/* Voucher section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="gift" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Ưu đãi của bạn</Text>
            </View>
            <TouchableOpacity onPress={() => showComingSoon('Xem tất cả voucher')}>
              <Text style={styles.seeAllLink}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.voucherList}>
            {MOCK_VOUCHERS.map(renderVoucher)}
          </View>
        </View>

        {/* History section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="time" size={20} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Lịch sử tích điểm</Text>
            </View>
          </View>
          <View style={styles.historyList}>
            {MOCK_HISTORY.map(renderHistoryItem)}
          </View>
        </View>

        {/* How to earn section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cách tích điểm</Text>
          <View style={styles.earnCard}>
            <View style={styles.earnItem}>
              <View style={[styles.earnIcon, { backgroundColor: COLORS.secondaryLight }]}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
              </View>
              <Text style={styles.earnText}>Hoàn thành việc: +50 pts</Text>
            </View>
            <View style={styles.earnItem}>
              <View style={[styles.earnIcon, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="star" size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.earnText}>Đánh giá 5 sao: +20 pts</Text>
            </View>
            <View style={styles.earnItem}>
              <View style={[styles.earnIcon, { backgroundColor: COLORS.secondaryLight }]}>
                <Ionicons name="people" size={18} color={COLORS.secondary} />
              </View>
              <Text style={styles.earnText}>Giới thiệu bạn bè: +200 pts</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </Animated.View>
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
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h2,
    color: COLORS.primary,
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 },
  // === TITLE SECTION ===
  titleSection: {
    gap: 4,
  },
  title: {
    ...TYPO.h2,
    color: COLORS.onSurface,
  },
  subtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
  },
  // === HERO CARD ===
  heroCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 24,
    overflow: 'hidden',
    ...SHADOWS.large,
    position: 'relative',
  },
  heroDecorCircle1: {
    position: 'absolute',
    top: -32,
    right: -32,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  heroDecorCircle2: {
    position: 'absolute',
    bottom: -48,
    left: -48,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  heroContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  heroLabel: {
    ...TYPO.h4,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },
  heroPointsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  heroPoints: {
    fontSize: 48,
    fontWeight: '900',
    color: COLORS.textOnPrimary,
    letterSpacing: -1.5,
    lineHeight: 50,
  },
  heroUnit: {
    ...TYPO.h3,
    color: 'rgba(255, 255, 255, 0.9)',
    paddingBottom: 8,
  },
  heroTier: {
    ...TYPO.body,
    color: COLORS.textOnPrimary,
    fontWeight: '700',
    marginTop: 4,
  },
  // === PROGRESS ===
  progressSection: {
    width: '100%',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    ...TYPO.caption,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  progressBarBg: {
    width: '100%',
    height: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 6,
  },
  progressNote: {
    ...TYPO.caption,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
    marginTop: 8,
  },
  // === SECTIONS ===
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  seeAllLink: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  // === VOUCHER LIST ===
  voucherList: {
    gap: 12,
  },
  voucherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  voucherImageBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voucherInfo: {
    flex: 1,
    gap: 4,
  },
  voucherTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    fontSize: 15,
  },
  voucherExpiry: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  voucherPointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  voucherPointsText: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },
  redeemBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    ...SHADOWS.small,
  },
  redeemBtnDisabled: {
    backgroundColor: COLORS.surfaceContainer,
    ...SHADOWS.small,
  },
  redeemBtnText: {
    ...TYPO.caption,
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  redeemBtnTextDisabled: {
    color: COLORS.onSurfaceVariant,
  },
  // === HISTORY ===
  historyList: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 4,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyInfo: { flex: 1 },
  historyTitle: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  historyDate: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  historyPoints: {
    ...TYPO.h4,
    fontSize: 14,
    fontWeight: '800',
  },
  // === EARN SECTION ===
  earnCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 12,
    ...SHADOWS.small,
  },
  earnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  earnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  earnText: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurface,
  },
  // === COMING SOON BANNER ===
  comingSoonBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    marginBottom: 16,
  },
  comingSoonText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.primary,
    lineHeight: 18,
    fontWeight: '600',
  },
});
