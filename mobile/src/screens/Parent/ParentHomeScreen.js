// ============================================================
// ParentHomeScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Header: trắng (surface), avatar trái + brand name giữa + bell phải
//   (thay vì header cam full-width)
// - Greeting: 'Chào buổi sáng/chiều, [name]!' + subtitle on-surface-variant
// - Promo banner: primary-container bg (cam), text trắng, icon circle
//   phải — clickable vào Chatbot AI
// - Service categories: bento grid (2 ô vuông + 1 ô wide) thay vì 8 ô
// - CarePartner gợi ý: horizontal scroll cards (avatar, tên, rating,
//   verified badge, chip danh mục, giá + nút 'Đặt lịch')
//   * Chưa có API → dùng mock data tĩnh + 'Đặt lịch' → CreateTask
// - Hoạt động gần đây: card nền primaryLight + chip trạng thái
// - FAB: tròn 56px primary-container, icon add, shadow cam đậm
// - Logout: long-press avatar (giữ chức năng, không phá design)
// Giữ nguyên: fetchTasks (getMyTasksAsParent), refresh control,
// navigation CreateTask/MyTasks/Chatbot
// B2: card Điểm thưởng & Voucher trên trang chủ
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
  StatusBar, Alert, ActivityIndicator, RefreshControl, Platform, Dimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyTasksAsParent } from '../../api/tasks';
import { getRewardsSummary } from '../../api/rewards';
import NotificationBell from '../../components/NotificationBell';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_MAPPING = {
  open: { label: 'Đang tìm', color: COLORS.warning, bg: COLORS.warningBg, icon: 'search' },
  in_progress: { label: 'Đang làm', color: COLORS.primary, bg: COLORS.primaryLight, icon: 'construct' },
  completed: { label: 'Hoàn thành', color: COLORS.success, bg: COLORS.successBg, icon: 'checkmark-circle' },
  cancelled: { label: 'Đã huỷ', color: COLORS.textMuted, bg: '#f3f4f6', icon: 'close-circle' },
};

const BENTO_CATEGORIES = [
  {
    id: 1,
    iconName: 'car',
    name: 'Đưa đón',
    desc: '',
    iconBg: '#cae6ff',
    iconColor: '#006492',
    span: 1,
  },
  {
    id: 2,
    iconName: 'people',
    name: 'Đồng hành',
    desc: '',
    iconBg: COLORS.secondaryLight,
    iconColor: COLORS.secondaryDark,
    span: 1,
  },
  {
    id: 3,
    iconName: 'school',
    name: 'Gia sư',
    desc: 'Hỗ trợ bài tập về nhà & ôn tập',
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    span: 2,
  },
];

const MOCK_CAREPARTNERS = [
  {
    id: 1,
    name: 'Nguyễn Mai',
    rating: 4.9,
    trips: 120,
    categories: ['Đưa đón', 'Gia sư'],
    pricePerHour: 60000,
    verified: true,
    avatarColor: COLORS.secondaryLight,
  },
  {
    id: 2,
    name: 'Cô Lan',
    rating: 5.0,
    trips: 85,
    categories: ['Đồng hành'],
    pricePerHour: 80000,
    verified: true,
    avatarColor: COLORS.primaryLight,
  },
];

const formatPrice = (price) => {
  if (price >= 1000) {
    return `${(price / 1000).toFixed(0)}k`;
  }
  return `${price}đ`;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
};

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(null);
  const [tierLabel, setTierLabel] = useState('');

  const pulseAnimRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLoading && tasks.length === 0) {
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: ANIM.timingSlow, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: ANIM.timingSlow, useNativeDriver: true }),
        ])
      );
      pulseAnimRef.current.start();
      return () => {
        if (pulseAnimRef.current) {
          pulseAnimRef.current.stop();
          pulseAnimRef.current = null;
        }
      };
    }
  }, [isLoading, tasks.length, pulseAnim]);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasksAsParent();
      setTasks(res.data.slice(0, 3));
    } catch (e) {
      console.error('Lỗi tải danh sách việc:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
    // B2: load điểm thưởng (không chặn UI nếu lỗi)
    try {
      const r = await getRewardsSummary();
      setPointsBalance(r.data?.balance ?? 0);
      setTierLabel(r.data?.tier?.label || '');
    } catch (e) {
      setPointsBalance(null);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
        logout();
      }
    } else {
      Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: logout },
      ]);
    }
  };

  const handleAvatarLongPress = () => {
    if (Platform.OS === 'web') {
      handleLogout();
    } else {
      Alert.alert('Tài khoản', user?.username || 'Phụ huynh', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: logout },
      ]);
    }
  };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Phụ huynh';

  const recentTask = tasks[0];
  const recentStatus = recentTask ? (STATUS_MAPPING[recentTask.status] || STATUS_MAPPING.open) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      <View style={[styles.appBar, { paddingTop: insets.top + 12, paddingBottom: 12 }]}>
        <TouchableOpacity
          style={styles.avatar}
          onPress={() => navigation.navigate('ParentTabs', { screen: 'ParentProfile' })}
          onLongPress={handleAvatarLongPress}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>EduCareLink</Text>
        <View style={styles.appBarRight}>
          <TouchableOpacity
            style={styles.profileShortcut}
            onPress={() => navigation.navigate('ParentTabs', { screen: 'ParentProfile' })}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="person-circle-outline" size={26} color={COLORS.primary} />
          </TouchableOpacity>
          <NotificationBell />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>{getGreeting()}, {displayName}!</Text>
          <Text style={styles.greetingSubtitle}>Sẵn sàng cho một ngày tuyệt vời?</Text>
        </View>

        {/* B2 — Điểm thưởng shortcut */}
        <TouchableOpacity
          style={styles.rewardsCard}
          onPress={() => navigation.navigate('RewardPoints')}
          activeOpacity={0.85}
        >
          <View style={styles.rewardsIconBox}>
            <Ionicons name="gift" size={22} color={COLORS.primary} />
          </View>
          <View style={styles.rewardsTextBlock}>
            <Text style={styles.rewardsTitle}>Điểm thưởng & Voucher</Text>
            <Text style={styles.rewardsSubtitle}>
              {pointsBalance == null
                ? 'Xem điểm và đổi quà'
                : `${Number(pointsBalance).toLocaleString('vi-VN')} pts${tierLabel ? ` · Hạng ${tierLabel}` : ''}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.promoBanner}
          onPress={() => navigation.navigate('Chatbot')}
          activeOpacity={0.9}
        >
          <View style={styles.promoDecorCircle} />
          <View style={styles.promoContent}>
            <Text style={styles.promoTitle}>Giảm 20% tháng này!</Text>
            <Text style={styles.promoDesc}>
              Cho dịch vụ Đưa đón học sinh định kỳ.
            </Text>
          </View>
          <View style={styles.promoIconBox}>
            <Ionicons name="bus" size={28} color="#fff" />
          </View>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dịch vụ</Text>
          <View style={styles.bentoGrid}>
            {BENTO_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.bentoCard,
                  cat.span === 2 && styles.bentoCardWide,
                ]}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.85}
              >
                <View style={[styles.bentoIconCircle, { backgroundColor: cat.iconBg }]}>
                  <Ionicons name={cat.iconName} size={24} color={cat.iconColor} />
                </View>
                {cat.span === 2 ? (
                  <View style={styles.bentoTextBlock}>
                    <Text style={styles.bentoCardTitle} numberOfLines={1} ellipsizeMode="tail">{cat.name}</Text>
                    {cat.desc ? (
                      <Text style={styles.bentoCardDesc} numberOfLines={2} ellipsizeMode="tail">{cat.desc}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.bentoCardTitle} numberOfLines={1} ellipsizeMode="tail">{cat.name}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>CarePartner Gợi ý</Text>
            <TouchableOpacity onPress={() => showComingSoonCarePartnerList()}>
              <Text style={styles.seeAllLink}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carepartnerScroll}
          >
            {MOCK_CAREPARTNERS.map((cp) => (
              <View key={cp.id} style={styles.carepartnerCard}>
                <View style={styles.cpCardTop}>
                  <View style={styles.cpInfoRow}>
                    <View style={[styles.cpAvatar, { backgroundColor: cp.avatarColor }]}>
                      <Ionicons name="person" size={22} color={COLORS.onSurface} />
                    </View>
                    <View style={styles.cpNameBlock}>
                      <Text style={styles.cpName} numberOfLines={1} ellipsizeMode="tail">{cp.name}</Text>
                      <View style={styles.cpRatingRow}>
                        <Ionicons name="star" size={12} color={COLORS.ratingStar} />
                        <Text style={styles.cpRatingText}>{cp.rating}</Text>
                        <Text style={styles.cpTripsText}> ({cp.trips} chuyến)</Text>
                      </View>
                    </View>
                  </View>
                  {cp.verified && (
                    <Ionicons name="shield-checkmark" size={18} color={COLORS.secondary} />
                  )}
                </View>

                <View style={styles.cpChipRow}>
                  {cp.categories.map((cat) => (
                    <View key={cat} style={styles.cpChip}>
                      <Text style={styles.cpChipText}>{cat}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.cpCardFooter}>
                  <View style={styles.cpPriceBlock}>
                    <Text style={styles.cpPriceLabel}>Từ</Text>
                    <Text style={styles.cpPriceValue}>
                      {formatPrice(cp.pricePerHour)}
                      <Text style={styles.cpPriceUnit}>/giờ</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.cpBookBtn}
                    onPress={() => navigation.navigate('CreateTask')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.cpBookBtnText}>Đặt lịch</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hoạt động gần đây</Text>
          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : recentTask && recentStatus ? (
            <TouchableOpacity
              style={styles.recentCard}
              onPress={() => navigation.navigate('MyTasks')}
              activeOpacity={0.85}
            >
              <View style={styles.recentIconRow}>
                <View style={styles.recentIconCircle}>
                  <Ionicons name={recentStatus.icon} size={22} color={COLORS.primary} />
                </View>
                <View style={styles.recentTextBlock}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{recentTask.title}</Text>
                  <Text style={styles.recentSubtitle} numberOfLines={1}>
                    {recentTask.location || 'Không có địa điểm'}
                  </Text>
                </View>
              </View>
              <View style={[styles.recentStatusChip, { backgroundColor: recentStatus.bg }]}>
                <Text style={[styles.recentStatusText, { color: recentStatus.color }]}>
                  {recentStatus.label}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyBox}>
              <Animated.View style={[styles.emptyIconCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="document-text-outline" size={36} color={COLORS.primary} />
              </Animated.View>
              <Text style={styles.emptyTitle}>Chưa có hoạt động nào</Text>
              <Text style={styles.emptyText}>Hãy đăng việc đầu tiên để tìm Carepartner phù hợp!</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CreateTask')}
                style={styles.emptyBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.emptyBtnText}>Đăng việc ngay</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateTask')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function showComingSoonCarePartnerList() {
  Alert.alert('Thông báo', 'Tính năng "Xem tất cả CarePartner" đang được phát triển. Vui lòng quay lại sau!', [
    { text: 'Đã hiểu', style: 'default' },
  ]);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  appBarTitle: {
    ...TYPO.h1,
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 80,
  },
  profileShortcut: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  greetingSection: {
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  greetingTitle: {
    ...TYPO.h2,
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  greetingSubtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
  },
  rewardsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  rewardsIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardsTextBlock: { flex: 1 },
  rewardsTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginBottom: 2,
  },
  rewardsSubtitle: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  promoBanner: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...SHADOWS.medium,
    position: 'relative',
  },
  promoDecorCircle: {
    position: 'absolute',
    top: -16,
    right: -16,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  promoContent: {
    flex: 1,
    marginRight: 12,
  },
  promoTitle: {
    ...TYPO.h3,
    color: COLORS.textOnPrimary,
    marginBottom: 4,
    lineHeight: 22,
  },
  promoDesc: {
    ...TYPO.body,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    maxWidth: 200,
    lineHeight: 18,
  },
  promoIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    marginBottom: 16,
  },
  seeAllLink: {
    ...TYPO.caption,
    color: COLORS.primary,
    marginBottom: 16,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  bentoCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.small,
    width: (SCREEN_WIDTH - 40 - 16) / 2,
    minHeight: 110,
  },
  bentoCardWide: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 16,
  },
  bentoIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bentoCardTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  bentoTextBlock: {
    flex: 1,
  },
  bentoCardDesc: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
    marginTop: 2,
  },
  carepartnerScroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  carepartnerCard: {
    width: 260,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  cpCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cpInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cpAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cpNameBlock: {
    flex: 1,
  },
  cpName: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  cpRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cpRatingText: {
    ...TYPO.caption,
    color: COLORS.onSurface,
  },
  cpTripsText: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  cpChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 16,
  },
  cpChip: {
    backgroundColor: COLORS.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cpChipText: {
    fontSize: 10,
    color: COLORS.onSurface,
    fontWeight: '500',
  },
  cpCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    paddingTop: 12,
  },
  cpPriceBlock: {
    flexDirection: 'column',
  },
  cpPriceLabel: {
    fontSize: 10,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  cpPriceValue: {
    ...TYPO.body,
    fontWeight: '700',
    color: COLORS.primary,
    lineHeight: 18,
  },
  cpPriceUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.onSurfaceVariant,
  },
  cpBookBtn: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    ...SHADOWS.small,
  },
  cpBookBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
  },
  recentCard: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(242, 101, 34, 0.2)',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...SHADOWS.small,
  },
  recentIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  recentIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  recentTextBlock: {
    flex: 1,
  },
  recentTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginBottom: 4,
    lineHeight: 18,
  },
  recentSubtitle: {
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
  },
  recentStatusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    ...SHADOWS.small,
  },
  recentStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    ...SHADOWS.small,
  },
  emptyTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  emptyText: {
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  emptyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
    marginTop: 8,
  },
  emptyBtnText: {
    color: COLORS.textOnPrimary,
    ...TYPO.button,
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.large,
    elevation: 8,
  },
});
