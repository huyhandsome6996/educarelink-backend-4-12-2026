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

// Bento grid — 3 dịch vụ chính (theo design HTML)
// 2 ô vuông (Đưa đón, Đồng hành) + 1 ô wide (Gia sư)
const BENTO_CATEGORIES = [
  {
    id: 1,
    iconName: 'car',
    name: 'Đưa đón',
    desc: '',
    // Tertiary palette (blue) — theo design HTML
    iconBg: '#cae6ff',  // tertiary-fixed
    iconColor: '#006492', // tertiary
    span: 1, // 1 ô
  },
  {
    id: 2,
    iconName: 'people',
    name: 'Đồng hành',
    desc: '',
    // Secondary palette (green) — CarePartner identity
    iconBg: COLORS.secondaryLight,
    iconColor: COLORS.secondaryDark,
    span: 1,
  },
  {
    id: 3,
    iconName: 'school',
    name: 'Gia sư',
    desc: 'Hỗ trợ bài tập về nhà & ôn tập',
    // Primary palette (orange)
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    span: 2, // wide — 2 ô
  },
];

// Mock CarePartner gợi ý — chưa có API thật
// TODO: thay bằng API getSuggestedCarepartners() khi backend sẵn sàng
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

  // Long-press avatar → logout (giữ chức năng, không phá design)
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

  // Lấy task gần nhất để hiển thị ở 'Hoạt động gần đây'
  const recentTask = tasks[0];
  const recentStatus = recentTask ? (STATUS_MAPPING[recentTask.status] || STATUS_MAPPING.open) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top App Bar — trắng, avatar + brand + bell */}
      <View style={[styles.appBar, { paddingTop: insets.top + 12, paddingBottom: 12 }]}>
        <TouchableOpacity
          style={styles.avatar}
          onLongPress={handleAvatarLongPress}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>EduCareLink</Text>
        <View style={styles.appBarRight}>
          <NotificationBell />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingTitle}>{getGreeting()}, {displayName}!</Text>
          <Text style={styles.greetingSubtitle}>Sẵn sàng cho một ngày tuyệt vời?</Text>
        </View>

        {/* Promo Banner — primary-container bg, thay thế AI banner */}
        <TouchableOpacity
          style={styles.promoBanner}
          onPress={() => navigation.navigate('Chatbot')}
          activeOpacity={0.9}
        >
          {/* Decorative blurred circle */}
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

        {/* Service Categories — Bento grid (2 small + 1 wide) */}
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

        {/* Suggested CarePartners — horizontal scroll */}
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
                {/* Top: avatar + name + rating + verified badge */}
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

                {/* Category chips */}
                <View style={styles.cpChipRow}>
                  {cp.categories.map((cat) => (
                    <View key={cat} style={styles.cpChip}>
                      <Text style={styles.cpChipText}>{cat}</Text>
                    </View>
                  ))}
                </View>

                {/* Bottom: price + Đặt lịch button */}
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

        {/* Recent Activity — card nền primaryLight + status chip */}
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

      {/* FAB — Đăng việc nhanh */}
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

// Helper — show coming soon cho 'Xem tất cả' CarePartner
function showComingSoonCarePartnerList() {
  Alert.alert('Thông báo', 'Tính năng "Xem tất cả CarePartner" đang được phát triển. Vui lòng quay lại sau!', [
    { text: 'Đã hiểu', style: 'default' },
  ]);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === APP BAR (white header) ===
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20, // margin-mobile
    paddingBottom: 12, // py-sm (paddingTop moved inline for safe area)
    backgroundColor: COLORS.surface, // surface (trắng)
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceContainer, // surface-variant
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  appBarTitle: {
    ...TYPO.h1,
    color: COLORS.primary, // primary-container (cam)
    letterSpacing: -0.5,
  },
  appBarRight: {
    minWidth: 40,
    alignItems: 'center',
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  // === GREETING ===
  greetingSection: {
    marginTop: 16, // mt-md
    marginBottom: 24, // mb-lg
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
  // === PROMO BANNER ===
  promoBanner: {
    backgroundColor: COLORS.primary, // primary-container
    borderRadius: 14, // xl radius
    padding: 16, // p-md
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
    color: '#ffffff',
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
  // === SECTIONS ===
  section: {
    marginBottom: 24, // mb-xl
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
  // === BENTO GRID ===
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16, // gap-md
  },
  bentoCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 14, // xl
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.small,
    // Mặc định 1 ô (calc 50% - gap/2)
    width: (SCREEN_WIDTH - 40 - 16) / 2,
    minHeight: 110,
  },
  bentoCardWide: {
    width: '100%', // full row
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
  // === CAREPARTNER SUGGESTIONS ===
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
    backgroundColor: COLORS.surfaceContainer, // surface-variant
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
    backgroundColor: COLORS.surfaceContainerHigh, // surface-container-high
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8, // lg
    ...SHADOWS.small,
  },
  cpBookBtnText: {
    ...TYPO.caption,
    color: COLORS.primary,
  },
  // === RECENT ACTIVITY ===
  recentCard: {
    backgroundColor: COLORS.primaryLight, // #FFF4ED
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
  // === EMPTY STATE ===
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
    color: '#fff',
    ...TYPO.button,
  },
  // === FAB ===
  fab: {
    position: 'absolute',
    bottom: 90, // room for bottom tab bar
    right: 20, // margin-mobile
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.large,
    elevation: 8, // Android shadow
  },
});
