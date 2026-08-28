// ============================================================
// ParentHomeScreen — Redesign theo bTaskee (Warm Professionalism)
// Đảm bảo 100% chức năng hệ thống, API và state giữ nguyên:
// - Header cam gradient (#F26522 -> #FF7A38) bo cong góc dưới
// - Card nổi bCoin / bPoints đè lên Header (xem số dư & điểm thưởng)
// - Danh mục dịch vụ nổi bật (horizontal scroll) với badge NEW / bCare
// - Grid Dịch vụ chính 4 cột (Dọn dẹp ca lẻ, Gói tháng, Tổng vệ sinh, Vệ sinh máy lạnh...)
// - Banner khuyến mãi Carousel (Giảm 20% cuối tuần...)
// - bRewards (Voucher đổi điểm thưởng)
// - Cộng đồng bTaskee / EduCareLink (Bài viết & Tích xu)
// - Hoạt động gần đây (vẫn kết nối API getMyTasksAsParent thật)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
  StatusBar, Alert, ActivityIndicator, RefreshControl, Platform, Dimensions, Image
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

// Services Nổi bật (Horizontal scroll top badges - bTaskee style)
const FEATURED_SERVICES = [
  { id: 1, name: 'Wellness\nOffice', badge: 'NEW', badgeBg: '#EF4444', icon: 'fitness', color: '#F97316' },
  { id: 2, name: 'bBeauty', badge: 'NEW', badgeBg: '#EF4444', icon: 'sparkles', color: '#EC4899' },
  { id: 3, name: 'Chăm sóc\nngười cao tuổi', badge: 'bCare', badgeBg: '#F26522', icon: 'heart', color: '#F26522' },
  { id: 4, name: 'Chăm sóc\nngười bệnh', badge: 'bCare', badgeBg: '#F26522', icon: 'medkit', color: '#0284C7' },
];

// Grid Dịch vụ 4 cột (bTaskee layout)
const SERVICE_GRID = [
  { id: 'clean_single', name: 'Dọn dẹp nhà', sub: 'ca lẻ', subColor: '#F26522', icon: 'home', iconBg: '#FFF4ED', color: '#F26522' },
  { id: 'clean_month', name: 'Dọn dẹp nhà', sub: 'gói tháng', subColor: '#F26522', icon: 'calendar', iconBg: '#FFF4ED', color: '#F26522' },
  { id: 'deep_clean', name: 'Tổng vệ sinh', sub: '', icon: 'sparkles', iconBg: '#FFF4ED', color: '#F26522' },
  { id: 'ac_clean', name: 'Vệ sinh máy lạnh', sub: '', icon: 'snow', iconBg: '#E0F2FE', color: '#0284C7' },
  { id: 'babysitting', name: 'Trông trẻ & Đón bé', sub: '', icon: 'body', iconBg: '#FFF4ED', color: '#F26522' },
  { id: 'tutor', name: 'Gia sư tại nhà', sub: '', icon: 'school', iconBg: '#FEF3C7', color: '#D97706' },
  { id: 'moving', name: 'Chuyển nhà & Dọn dẹp', sub: '', icon: 'bus', iconBg: '#ECFDF5', color: '#059669' },
  { id: 'explore', name: 'Khám phá', sub: '', icon: 'grid', iconBg: '#F3F4F6', color: '#6B7280' },
];

// Rewards Vouchers (bRewards section)
const BREWARDS_VOUCHERS = [
  {
    id: 1,
    title: 'Voucher 15% tại Cái Lò Nướng',
    pts: 30,
    bg: '#7C2D12',
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
  },
  {
    id: 2,
    title: 'Mua 1 Tặng 1 tại Chạm - Cafe & Cake',
    pts: 40,
    bg: '#064E3B',
    image: 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=400',
  },
  {
    id: 3,
    title: 'Voucher 100k tại LUG Luggage',
    pts: 50,
    bg: '#1E3A8A',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400',
  },
];

// Bài viết cộng đồng
const COMMUNITY_POSTS = [
  {
    id: 1,
    title: 'TÍCH XU NGAY QUÀ VỀ TAY - CHƠI NGAY',
    likes: 73,
    comments: 5,
    tag: '#Giải trí #Tích Xu ngay',
    bg: '#FFF7ED',
  },
  {
    id: 2,
    title: 'TÍCH XU TRANH TOP - QUÀ NGAY VỀ TÚI',
    likes: 21,
    comments: 0,
    tag: '#Giải trí #Đường đua Ong Cam',
    bg: '#FEF3C7',
  },
];

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
      <StatusBar barStyle="light-content" backgroundColor="#F26522" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* === HEADER BANNER (Orange Gradient bTaskee style) === */}
        <View style={[styles.headerGradient, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.userInfoRow}
              onPress={() => navigation.navigate('ParentTabs', { screen: 'ParentProfile' })}
              onLongPress={handleAvatarLongPress}
              activeOpacity={0.8}
            >
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={20} color="#F26522" />
              </View>
              <Text style={styles.headerGreeting} numberOfLines={1}>
                Xin chào {displayName}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chatHeaderBtn}
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="#fff" />
              <View style={styles.unreadBadge} />
            </TouchableOpacity>
          </View>

          {/* Floating Balance & Points Card (bTaskee style overlapping header) */}
          <View style={styles.balanceCard}>
            <TouchableOpacity
              style={styles.balanceItem}
              onPress={() => navigation.navigate('RewardPointsScreen')}
              activeOpacity={0.7}
            >
              <View style={styles.bCoinBadge}>
                <Text style={styles.bCoinText}>b</Text>
              </View>
              <Text style={styles.balanceValue}>0 đ</Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </TouchableOpacity>

            <View style={styles.balanceDivider} />

            <TouchableOpacity
              style={styles.balanceItem}
              onPress={() => navigation.navigate('RewardPointsScreen')}
              activeOpacity={0.7}
            >
              <Ionicons name="star" size={20} color="#F26522" style={{ marginRight: 6 }} />
              <Text style={styles.balanceValue}>0 bPoints</Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer for floating balance card */}
        <View style={{ height: 28 }} />

        {/* === SECTION 1: Featured Top Services Carousel === */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Dịch vụ</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CreateTask')}>
              <Text style={styles.seeAllText}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredServicesScroll}
          >
            {FEATURED_SERVICES.map((serv) => (
              <TouchableOpacity
                key={serv.id}
                style={styles.featuredCard}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.8}
              >
                <View style={[styles.badgeTag, { backgroundColor: serv.badgeBg }]}>
                  <Text style={styles.badgeTagText}>{serv.badge}</Text>
                </View>
                <View style={styles.featuredIconCircle}>
                  <Ionicons name={serv.icon} size={24} color={serv.color} />
                </View>
                <Text style={styles.featuredName}>{serv.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* === SECTION 2: Main 4-Column Service Grid === */}
        <View style={styles.sectionContainer}>
          <View style={styles.serviceGridContainer}>
            {SERVICE_GRID.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.serviceGridItem}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.8}
              >
                <View style={[styles.serviceGridIconCircle, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={28} color={item.color} />
                </View>
                <Text style={styles.serviceGridLabel}>
                  {item.name}
                  {item.sub ? (
                    <Text style={{ color: item.subColor, fontWeight: '700' }}> {item.sub}</Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* === SECTION 3: Promotional Banner Carousel === */}
        <View style={styles.sectionContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promoCarouselContainer}
          >
            <TouchableOpacity
              style={styles.promoBannerCard}
              onPress={() => navigation.navigate('CreateTask')}
              activeOpacity={0.9}
            >
              <View style={styles.promoBannerContent}>
                <Text style={styles.promoTag}>Cuối tuần dọn nhà</Text>
                <Text style={styles.promoBigTitle}>Giảm 20%</Text>
                <Text style={styles.promoSubtitle}>Nhà sạch hơn, tiết kiệm hơn</Text>
              </View>
              <View style={styles.promoBannerIcon}>
                <Ionicons name="sparkles" size={48} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.promoBannerCard, { backgroundColor: '#059669' }]}
              onPress={() => navigation.navigate('Chatbot')}
              activeOpacity={0.9}
            >
              <View style={styles.promoBannerContent}>
                <Text style={styles.promoTag}>Trợ lý AI bCare</Text>
                <Text style={styles.promoBigTitle}>Tự Động Ghép Cặp</Text>
                <Text style={styles.promoSubtitle}>Tìm CarePartner trong 5 phút</Text>
              </View>
              <View style={styles.promoBannerIcon}>
                <Ionicons name="hardware-chip" size={48} color="#fff" />
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* === SECTION 4: bRewards Vouchers === */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity
            style={styles.sectionHeaderRow}
            onPress={() => navigation.navigate('RewardPointsScreen')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>bRewards</Text>
              <Ionicons name="chevron-forward" size={20} color="#059669" style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rewardsScrollContainer}
          >
            {BREWARDS_VOUCHERS.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={styles.rewardCard}
                onPress={() => navigation.navigate('RewardPointsScreen')}
                activeOpacity={0.85}
              >
                <View style={styles.rewardImagePlaceholder}>
                  <Ionicons name="gift" size={36} color="#F26522" />
                </View>
                <View style={styles.rewardCardBody}>
                  <Text style={styles.rewardTitle} numberOfLines={2}>{v.title}</Text>
                  <View style={styles.rewardPtsBadge}>
                    <Ionicons name="star" size={12} color="#fff" />
                    <Text style={styles.rewardPtsText}>{v.pts}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* === SECTION 5: Hoạt động gần đây (Active Task System) === */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Hoạt động gần đây</Text>
          {isLoading ? (
            <ActivityIndicator color="#F26522" style={{ marginTop: 16 }} />
          ) : recentTask && recentStatus ? (
            <TouchableOpacity
              style={styles.recentTaskCard}
              onPress={() => navigation.navigate('MyTasks')}
              activeOpacity={0.85}
            >
              <View style={styles.recentTaskIconBox}>
                <Ionicons name={recentStatus.icon} size={24} color="#F26522" />
              </View>
              <View style={styles.recentTaskInfo}>
                <Text style={styles.recentTaskTitle} numberOfLines={1}>{recentTask.title}</Text>
                <Text style={styles.recentTaskLocation} numberOfLines={1}>
                  {recentTask.location || 'Không có địa điểm'}
                </Text>
              </View>
              <View style={[styles.recentStatusBadge, { backgroundColor: recentStatus.bg }]}>
                <Text style={[styles.recentStatusText, { color: recentStatus.color }]}>
                  {recentStatus.label}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyTaskBox}>
              <Text style={styles.emptyTaskText}>Bạn chưa có công việc nào đang diễn ra</Text>
            </View>
          )}
        </View>

        {/* === SECTION 6: Cộng đồng bTaskee / EduCareLink === */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Cộng đồng</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CreateTask')}>
              <Text style={styles.seeAllText}>Xem tất cả > </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.communityGrid}>
            {COMMUNITY_POSTS.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={[styles.communityCard, { backgroundColor: post.bg }]}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.85}
              >
                <View style={styles.communityCardBanner}>
                  <Ionicons name="trophy" size={32} color="#F26522" />
                  <View style={styles.communityMetrics}>
                    <Text style={styles.communityMetricText}>❤️ {post.likes}</Text>
                    <Text style={styles.communityMetricText}>💬 {post.comments}</Text>
                  </View>
                </View>
                <Text style={styles.communityCardTitle} numberOfLines={2}>{post.title}</Text>
                <Text style={styles.communityTag}>{post.tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Mascot Button */}
      <TouchableOpacity
        style={styles.fabMascot}
        onPress={() => navigation.navigate('CreateTask')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header Gradient
  headerGradient: {
    backgroundColor: '#F26522',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    position: 'relative',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  headerGreeting: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    flex: 1,
  },
  chatHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  // Floating Balance Card
  balanceCard: {
    position: 'absolute',
    bottom: -24,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.medium,
    elevation: 4,
  },
  balanceItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bCoinBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  bCoinText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginRight: 6,
  },
  balanceDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
  },

  // Section Container
  sectionContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },

  // Featured Top Services
  featuredServicesScroll: {
    gap: 12,
  },
  featuredCard: {
    width: 120,
    backgroundColor: '#FFF4ED',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  badgeTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  featuredIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  featuredName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Service Grid 4 Columns
  serviceGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  serviceGridItem: {
    width: (SCREEN_WIDTH - 40 - 36) / 4,
    alignItems: 'center',
    marginVertical: 4,
  },
  serviceGridIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  serviceGridLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Promo Banner Carousel
  promoCarouselContainer: {
    gap: 16,
  },
  promoBannerCard: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: '#F26522',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  promoBannerContent: {
    flex: 1,
  },
  promoTag: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  promoBigTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  promoSubtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 13,
    fontWeight: '500',
  },
  promoBannerIcon: {
    marginLeft: 12,
  },

  // bRewards Vouchers
  rewardsScrollContainer: {
    gap: 12,
  },
  rewardCard: {
    width: 150,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...SHADOWS.small,
  },
  rewardImagePlaceholder: {
    height: 100,
    backgroundColor: '#FFF4ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardCardBody: {
    padding: 10,
  },
  rewardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
    height: 34,
    lineHeight: 16,
  },
  rewardPtsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
  },
  rewardPtsText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Recent Active Task
  recentTaskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...SHADOWS.small,
  },
  recentTaskIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF4ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recentTaskInfo: {
    flex: 1,
  },
  recentTaskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  recentTaskLocation: {
    fontSize: 12,
    color: '#6B7280',
  },
  recentStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recentStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyTaskBox: {
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    alignItems: 'center',
  },
  emptyTaskText: {
    fontSize: 13,
    color: '#6B7280',
  },

  // Community Posts
  communityGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  communityCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  communityCardBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  communityMetrics: {
    alignItems: 'flex-end',
  },
  communityMetricText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4B5563',
  },
  communityCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F2937',
    lineHeight: 18,
    marginBottom: 6,
  },
  communityTag: {
    fontSize: 11,
    color: '#F26522',
    fontWeight: '600',
  },

  // FAB Mascot
  fabMascot: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    elevation: 6,
  },
});
