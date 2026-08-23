// ============================================================
// RewardPointsScreen — B2 Tích điểm đổi quà (API thật)
// Nối: GET /rewards/summary/, GET /rewards/vouchers/,
//      POST /rewards/vouchers/:id/redeem/
// ============================================================

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, TYPO, ANIM } from '../../theme/colors';
import {
  getRewardsSummary,
  getVouchers,
  redeemVoucher,
} from '../../api/rewards';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString('vi-VN');
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatExpiry(dateStr) {
  if (!dateStr) return 'Không hạn';
  return `Hết hạn: ${formatDate(dateStr)}`;
}

function historyIcon(reason, points) {
  if (points < 0 || reason === 'voucher_redeem') return 'swap-vertical';
  if (reason === 'review_bonus') return 'star';
  if (reason === 'adjustment') return 'construct';
  return 'add-circle';
}

function historyTitle(tx) {
  if (tx.note) return tx.note;
  if (tx.task_title) return `Hoàn thành: ${tx.task_title}`;
  return tx.reason_display || 'Giao dịch điểm';
}

function voucherIcon(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('cà phê') || t.includes('cafe') || t.includes('highlands')) {
    return { icon: 'cafe', color: COLORS.primary, bg: COLORS.primaryLight };
  }
  if (t.includes('food') || t.includes('ăn') || t.includes('gojek')) {
    return { icon: 'fast-food', color: COLORS.secondary, bg: COLORS.secondaryLight };
  }
  if (t.includes('shopee') || t.includes('mua sắm') || t.includes('shopping')) {
    return { icon: 'cart', color: COLORS.primary, bg: COLORS.primaryLight };
  }
  return { icon: 'gift', color: COLORS.primary, bg: COLORS.primaryLight };
}

export default function RewardPointsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(0);
  const [tier, setTier] = useState({
    label: 'Đồng',
    next_tier_label: 'Bạc',
    next_tier_threshold: 500,
    points_to_next: 500,
  });
  const [lifetimePoints, setLifetimePoints] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [redeemingId, setRedeemingId] = useState(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [summaryRes, vouchersRes] = await Promise.all([
        getRewardsSummary(),
        getVouchers(),
      ]);
      const summary = summaryRes.data || {};
      const vouchersPayload = vouchersRes.data || {};

      setBalance(summary.balance ?? vouchersPayload.balance ?? 0);
      setLifetimePoints(summary.lifetime_points ?? 0);
      if (summary.tier) {
        setTier({
          label: summary.tier.label || 'Đồng',
          next_tier_label: summary.tier.next_tier_label,
          next_tier_threshold: summary.tier.next_tier_threshold,
          points_to_next: summary.tier.points_to_next,
        });
      }
      setTransactions(Array.isArray(summary.transactions) ? summary.transactions : []);
      setVouchers(Array.isArray(vouchersPayload.vouchers) ? vouchersPayload.vouchers : []);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        (err.response?.status === 403
          ? 'Chỉ phụ huynh mới dùng được tính năng tích điểm.'
          : 'Không thể tải dữ liệu điểm thưởng.');
      if (!isRefresh) setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const progressPercent = (() => {
    if (!tier.next_tier_threshold) return 100;
    const earned = lifetimePoints;
    const target = tier.next_tier_threshold;
    if (target <= 0) return 100;
    return Math.min(100, Math.max(0, (earned / target) * 100));
  })();

  const handleRedeem = (voucher) => {
    const required = voucher.points_required || 0;
    if (balance < required) {
      Alert.alert(
        'Không đủ điểm',
        `Bạn cần thêm ${required - balance} điểm để đổi voucher này.`
      );
      return;
    }

    Alert.alert(
      'Xác nhận đổi voucher',
      `Đổi "${voucher.title}" với ${required} điểm?\nSố dư sau khi đổi: ${balance - required} điểm.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đổi ngay',
          style: 'default',
          onPress: async () => {
            setRedeemingId(voucher.id);
            try {
              const res = await redeemVoucher(voucher.id);
              const data = res.data || {};
              const code = data.redemption?.code;
              if (typeof data.balance === 'number') setBalance(data.balance);
              Alert.alert(
                'Đổi thành công!',
                code
                  ? `Mã voucher của bạn:\n${code}\n\nHãy lưu mã này để sử dụng.`
                  : data.message || 'Đã đổi voucher thành công.'
              );
              await fetchData(true);
            } catch (err) {
              const msg =
                err.response?.data?.error ||
                err.response?.data?.detail ||
                'Không thể đổi voucher. Thử lại sau.';
              Alert.alert('Lỗi', msg);
            } finally {
              setRedeemingId(null);
            }
          },
        },
      ]
    );
  };

  const renderVoucher = (voucher) => {
    const canRedeem = balance >= (voucher.points_required || 0);
    const visual = voucherIcon(voucher.title);
    const isBusy = redeemingId === voucher.id;

    return (
      <View key={voucher.id} style={styles.voucherCard}>
        <View style={[styles.voucherImageBox, { backgroundColor: visual.bg }]}>
          <Ionicons name={visual.icon} size={32} color={visual.color} />
        </View>

        <View style={styles.voucherInfo}>
          <Text style={styles.voucherTitle} numberOfLines={1}>
            {voucher.title}
          </Text>
          <Text style={styles.voucherExpiry}>{formatExpiry(voucher.expiry_date)}</Text>
          {voucher.discount_value ? (
            <Text style={styles.voucherValue}>
              Trị giá {Number(voucher.discount_value).toLocaleString('vi-VN')}đ
            </Text>
          ) : null}
          <View style={styles.voucherPointsRow}>
            <Ionicons name="star" size={14} color={COLORS.primary} />
            <Text style={styles.voucherPointsText}>{voucher.points_required} pts</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.redeemBtn, !canRedeem && styles.redeemBtnDisabled]}
          onPress={() => handleRedeem(voucher)}
          activeOpacity={0.85}
          disabled={isBusy || !canRedeem}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color={COLORS.textOnPrimary} />
          ) : (
            <Text
              style={[
                styles.redeemBtnText,
                !canRedeem && styles.redeemBtnTextDisabled,
              ]}
            >
              {canRedeem ? 'Đổi ngay' : 'Thiếu điểm'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderHistoryItem = (item) => {
    const isPositive = item.points > 0;
    return (
      <View key={item.id} style={styles.historyItem}>
        <View
          style={[
            styles.historyIcon,
            {
              backgroundColor: isPositive
                ? COLORS.secondaryLight
                : COLORS.surfaceContainerHigh,
            },
          ]}
        >
          <Ionicons
            name={historyIcon(item.reason, item.points)}
            size={16}
            color={isPositive ? COLORS.secondary : COLORS.onSurfaceVariant}
          />
        </View>
        <View style={styles.historyInfo}>
          <Text style={styles.historyTitle} numberOfLines={1}>
            {historyTitle(item)}
          </Text>
          <Text style={styles.historyDate}>{formatDate(item.created_at)}</Text>
        </View>
        <Text
          style={[
            styles.historyPoints,
            { color: isPositive ? COLORS.secondary : COLORS.errorDeep },
          ]}
        >
          {isPositive ? '+' : ''}
          {item.points} pts
        </Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
        <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.appBarBtn}
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Điểm thưởng</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.centerSpinner}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
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

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.onSurfaceVariant} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => fetchData()}
            activeOpacity={0.85}
          >
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              tintColor={COLORS.primary}
            />
          }
        >
          <View style={styles.titleSection}>
            <Text style={styles.title}>Điểm thưởng của bạn</Text>
            <Text style={styles.subtitle}>
              Tích lũy điểm khi hoàn thành việc và đánh giá 5 sao.
            </Text>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroDecorCircle1} />
            <View style={styles.heroDecorCircle2} />

            <View style={styles.heroContent}>
              <Text style={styles.heroLabel}>Số điểm hiện tại</Text>
              <View style={styles.heroPointsRow}>
                <Text style={styles.heroPoints}>
                  {Number(balance).toLocaleString('vi-VN')}
                </Text>
                <Text style={styles.heroUnit}>pts</Text>
              </View>
              <Text style={styles.heroTier}>Hạng {tier.label}</Text>

              {tier.next_tier_threshold != null ? (
                <View style={styles.progressSection}>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressText}>
                      Hạng {tier.next_tier_label || 'tiếp theo'}
                    </Text>
                    <Text style={styles.progressText}>
                      {Number(tier.next_tier_threshold).toLocaleString('vi-VN')} pts
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
                    />
                  </View>
                  <Text style={styles.progressNote}>
                    {tier.points_to_next != null && tier.points_to_next > 0
                      ? `Còn ${tier.points_to_next} điểm nữa để thăng hạng`
                      : 'Bạn đã đạt hạng cao nhất'}
                  </Text>
                </View>
              ) : (
                <View style={styles.progressSection}>
                  <Text style={styles.progressNote}>Bạn đã đạt hạng cao nhất 🎉</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="gift" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Ưu đãi của bạn</Text>
              </View>
            </View>
            <View style={styles.voucherList}>
              {vouchers.length === 0 ? (
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyInlineText}>
                    Chưa có voucher nào. Admin sẽ thêm ưu đãi sớm.
                  </Text>
                </View>
              ) : (
                vouchers.map(renderVoucher)
              )}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="time" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Lịch sử tích điểm</Text>
              </View>
            </View>
            <View style={styles.historyList}>
              {transactions.length === 0 ? (
                <View style={styles.emptyInline}>
                  <Text style={styles.emptyInlineText}>
                    Chưa có giao dịch. Hoàn thành việc để nhận điểm.
                  </Text>
                </View>
              ) : (
                transactions.map(renderHistoryItem)
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cách tích điểm</Text>
            <View style={styles.earnCard}>
              <View style={styles.earnItem}>
                <View style={[styles.earnIcon, { backgroundColor: COLORS.secondaryLight }]}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.secondary} />
                </View>
                <Text style={styles.earnText}>
                  Hoàn thành việc: floor(giá / 5.000) pts
                </Text>
              </View>
              <View style={styles.earnItem}>
                <View style={[styles.earnIcon, { backgroundColor: COLORS.primaryLight }]}>
                  <Ionicons name="star" size={18} color={COLORS.primary} />
                </View>
                <Text style={styles.earnText}>Đánh giá CarePartner 5 sao: +5 pts</Text>
              </View>
            </View>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  centerSpinner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 },
  titleSection: { gap: 4 },
  title: { ...TYPO.h2, color: COLORS.onSurface },
  subtitle: { ...TYPO.body, color: COLORS.onSurfaceVariant },
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
  heroContent: { alignItems: 'center', zIndex: 1 },
  heroLabel: {
    ...TYPO.h4,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
  },
  heroPointsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
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
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { ...TYPO.h3, color: COLORS.onSurface },
  voucherList: { gap: 12 },
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
  voucherInfo: { flex: 1, gap: 4 },
  voucherTitle: { ...TYPO.h4, color: COLORS.onSurface, fontSize: 15 },
  voucherExpiry: { ...TYPO.caption, color: COLORS.onSurfaceVariant },
  voucherValue: {
    ...TYPO.caption,
    color: COLORS.secondary,
    fontWeight: '700',
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
    minWidth: 88,
    alignItems: 'center',
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
  redeemBtnTextDisabled: { color: COLORS.onSurfaceVariant },
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
  earnCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 12,
    ...SHADOWS.small,
  },
  earnItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  earnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  earnText: { ...TYPO.body, fontSize: 14, color: COLORS.onSurface, flex: 1 },
  errorBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  errorText: { ...TYPO.body, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  retryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
    ...SHADOWS.large,
  },
  retryBtnText: { ...TYPO.button, color: COLORS.textOnPrimary },
  emptyInline: { paddingVertical: 16, paddingHorizontal: 8 },
  emptyInlineText: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
});
