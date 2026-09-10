// ============================================================
// ParentHomeScreen — Redesign layout bTaskee, nội dung EduCareLink
// Visual layout lấy cảm hứng bTaskee, nội dung 100% EduCareLink:
// - Header cam gradient bo cong + Card nổi Ví & Điểm thưởng
// - Danh mục nổi bật: Gia sư AI, Đón trẻ Pro, Trông trẻ, Nấu ăn
// - Grid 8 dịch vụ: Gia sư, Đón trẻ, Trông trẻ, Dọn dẹp, Nấu ăn,
//   Mua sắm, Chuyển đồ, Khám phá (đồng bộ categoryIcons.js)
// - Banner: Tìm CarePartner + AI Trợ lý (thay vì dọn nhà bTaskee)
// - CareRewards: Điểm thưởng EduCareLink (thay vì bRewards)
// - Mẹo hay: Bài viết an toàn & giáo dục (thay vì tích xu)
// - Hoạt động gần đây (API getMyTasksAsParent thật)
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
  StatusBar, Alert, ActivityIndicator, RefreshControl, Platform, Dimensions, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getBookings } from '../../api/matching';
import NotificationBell from '../../components/NotificationBell';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Style theo trạng thái ĐƠN GHÉP CẶP (Flow 1) — label VI lấy thẳng từ
// API (status_label_vi) để luôn khớp backend, không còn nhãn cứng phía client.
const BOOKING_STATUS_STYLE = {
  awaiting_commitment: { color: '#B45309', bg: '#FFFBEB', icon: 'hourglass' },
  committed: { color: '#C2410C', bg: '#FFF4ED', icon: 'time' },
  in_progress: { color: '#C2410C', bg: '#FFF4ED', icon: 'play-circle' },
  completed: { color: COLORS.successDeep, bg: COLORS.successBg, icon: 'checkmark-circle' },
  cancelled: { color: COLORS.textMuted, bg: '#F3F4F6', icon: 'close-circle' },
  expired: { color: COLORS.textMuted, bg: '#F3F4F6', icon: 'close-circle' },
};

// QA 2026-09-10 #1: Grid 3 dịch vụ chuẩn (Gia sư, Đón trẻ, Trông trẻ)
const SERVICE_GRID = [
  { id: 1, name: 'Gia sư', icon: 'book', iconBg: '#FFF4ED', color: '#F26522' },
  { id: 2, name: 'Đón trẻ', icon: 'happy', iconBg: '#ECFDF5', color: '#059669' },
  { id: 4, name: 'Trông trẻ', icon: 'people', iconBg: '#FFF4ED', color: '#F26522' },
];

// CareRewards — Ưu đãi điểm thưởng EduCareLink
const CARE_REWARDS = [
  { id: 1, title: 'Giảm 50k cho lần đặt Gia sư tiếp theo', pts: 100, icon: 'book' },
  { id: 2, title: 'Miễn phí 1 giờ Đón trẻ đầu tiên', pts: 150, icon: 'happy' },
  { id: 3, title: 'Ưu đãi 20% dịch vụ Trông trẻ cuối tuần', pts: 200, icon: 'people' },
];

// Mẹo hay cho Phụ huynh
const TIPS_POSTS = [
  {
    id: 1,
    title: '5 tiêu chí chọn gia sư phù hợp cho con',
    icon: 'bulb',
    tag: '#Giáo dục #Gia sư',
    bg: '#FFF7ED',
  },
  {
    id: 2,
    title: 'An toàn khi sử dụng dịch vụ đón trẻ',
    icon: 'shield-checkmark',
    tag: '#An toàn #Đón trẻ',
    bg: '#ECFDF5',
  },
];

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const pulseAnimRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isLoading && bookings.length === 0) {
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
  }, [isLoading, bookings.length, pulseAnim]);

  // "Đơn ghép cặp gần đây" — dữ liệu từ HỆ GHÉP CẶP MỚI (Flow 1, /bookings/),
  // không còn dùng Task API cũ (đã loại bỏ hệ thống ghép nối kiểu cũ khỏi màn Home).
  const fetchBookings = async () => {
    try {
      const { data } = await getBookings({ role: 'parent' });
      setBookings((data?.results || data || []).slice(0, 3));
    } catch (e) {
      console.error('Lỗi tải danh sách đơn:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchBookings(); }, []);

  // Pull-to-refresh (hotfix crash vc23): dòng 169 từng tham chiếu `onRefresh`
  // chưa định nghĩa → Hermes ném "ReferenceError: Property 'onRefresh'
  // doesn't exist" → app crash ngay khi mở màn Home của phụ huynh.
  // fetchBookings tự tắt cờ refreshing trong finally nên không cần lặp logic.
  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  // Flow 1 — "Đơn đang thực hiện": mở booking mới nhất đang hoạt động
  const openLatestBooking = async () => {
    try {
      const { data } = await getBookings({ role: 'parent' });
      const ACTIVE = ['awaiting_commitment', 'committed', 'in_progress'];
      const latest = (data?.results || []).find((b) => ACTIVE.includes(b.status))
        || (data?.results || [])[0];
      if (latest) {
        navigation.navigate('BookingDetail', { bookingId: latest.id });
      } else {
        Alert.alert('Chưa có đơn nào', 'Bạn chưa có đơn ghép cặp nào. Hãy đăng việc trước nhé!');
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không tải được danh sách đơn. Vui lòng thử lại.');
    }
  };

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

  const recentBooking = bookings[0];
  const recentStatusStyle = recentBooking
    ? (BOOKING_STATUS_STYLE[recentBooking.status] || BOOKING_STATUS_STYLE.in_progress)
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#F26522" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" testID="parent-home-refresh" />}
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

          {/* Floating Balance & Points Card */}
          <View style={styles.balanceCard}>
            <TouchableOpacity
              style={styles.balanceItem}
              onPress={() => navigation.navigate('RewardPointsScreen')}
              activeOpacity={0.7}
            >
              <Ionicons name="wallet" size={20} color="#F26522" style={{ marginRight: 6 }} />
              <Text style={styles.balanceValue}>Ví EduCare</Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </TouchableOpacity>

            <View style={styles.balanceDivider} />

            <TouchableOpacity
              style={styles.balanceItem}
              onPress={() => navigation.navigate('RewardPointsScreen')}
              activeOpacity={0.7}
            >
              <Ionicons name="star" size={20} color="#F26522" style={{ marginRight: 6 }} />
              <Text style={styles.balanceValue}>Điểm thưởng</Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer for floating balance card */}
        <View style={{ height: 28 }} />

        {/* === Flow 1 — Truy cập nhanh ghép cặp mới === */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Ghép cặp thông minh</Text>
          </View>
          <TouchableOpacity
            style={[styles.flow1Card, { backgroundColor: '#F36A04' }]}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('JobTypeSelect')}
          >
            <View style={styles.flow1IconWrap}>
              <Ionicons name="add-circle" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.flow1Title, { color: '#fff' }]}>Đăng việc mới</Text>
              <Text style={[styles.flow1Desc, { color: 'rgba(255,255,255,0.9)' }]}>
                Gia sư · Trông trẻ · Đón trẻ — nhận ứng viên trong 5 phút
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.flow1Row}>
            <TouchableOpacity
              style={styles.flow1Small}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('CandidatesList')}
            >
              <Ionicons name="people" size={22} color="#F36A04" />
              <Text style={styles.flow1SmallText}>Ứng viên phù hợp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.flow1Small}
              activeOpacity={0.85}
              onPress={openLatestBooking}
            >
              <Ionicons name="document-text" size={22} color="#F36A04" />
              <Text style={styles.flow1SmallText}>Đơn đang thực hiện</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.flow1Small}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('WalletCredits')}
            >
              <Ionicons name="wallet" size={22} color="#F36A04" />
              <Text style={styles.flow1SmallText}>Ví credit của tôi</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* === Dịch vụ — Grid 2×2 === */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Dịch vụ</Text>
            <TouchableOpacity onPress={() => navigation.navigate('JobTypeSelect')}>
              <Text style={styles.seeAllText}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

          {/* Row 1 */}
          <View style={styles.serviceRow}>
            {SERVICE_GRID.slice(0, 2).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.serviceGridItem}
                onPress={() => {
                  if (item.id === 1) navigation.navigate('TutoringForm');
                  else if (item.id === 2) navigation.navigate('PickupForm');
                  else if (item.id === 4) navigation.navigate('ChildcareForm');
                  else if (item.id === 9) navigation.navigate('Chatbot');
                  else navigation.navigate('JobTypeSelect');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.serviceGridIconCircle, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={28} color={item.color} />
                </View>
                <Text style={styles.serviceGridLabel}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Row 2 */}
          <View style={styles.serviceRow}>
            {SERVICE_GRID.slice(2, 4).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.serviceGridItem}
                onPress={() => {
                  if (item.id === 1) navigation.navigate('TutoringForm');
                  else if (item.id === 2) navigation.navigate('PickupForm');
                  else if (item.id === 4) navigation.navigate('ChildcareForm');
                  else if (item.id === 9) navigation.navigate('Chatbot');
                  else navigation.navigate('JobTypeSelect');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.serviceGridIconCircle, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={28} color={item.color} />
                </View>
                <Text style={styles.serviceGridLabel}>{item.name}</Text>
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
              onPress={() => navigation.navigate('JobTypeSelect')}
              activeOpacity={0.9}
            >
              <View style={styles.promoBannerContent}>
                <Text style={styles.promoTag}>Tìm CarePartner</Text>
                <Text style={styles.promoBigTitle}>An tâm gửi gắm</Text>
                <Text style={styles.promoSubtitle}>Đăng việc ngay, nhận ứng viên trong 5 phút</Text>
              </View>
              <View style={styles.promoBannerIcon}>
                <Ionicons name="people" size={48} color="#fff" />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.promoBannerCard, { backgroundColor: '#059669' }]}
              onPress={() => navigation.navigate('Chatbot')}
              activeOpacity={0.9}
            >
              <View style={styles.promoBannerContent}>
                <Text style={styles.promoTag}>AI Trợ lý EduCare</Text>
                <Text style={styles.promoBigTitle}>Chat tạo việc</Text>
                <Text style={styles.promoSubtitle}>Mô tả bằng lời, AI tạo task giúp bạn</Text>
              </View>
              <View style={styles.promoBannerIcon}>
                <Ionicons name="hardware-chip" size={48} color="#fff" />
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* === SECTION 4: CareRewards === */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity
            style={styles.sectionHeaderRow}
            onPress={() => navigation.navigate('RewardPointsScreen')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>CareRewards</Text>
              <Ionicons name="chevron-forward" size={20} color="#059669" style={{ marginLeft: 4 }} />
            </View>
          </TouchableOpacity>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rewardsScrollContainer}
          >
            {CARE_REWARDS.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={styles.rewardCard}
                onPress={() => navigation.navigate('RewardPointsScreen')}
                activeOpacity={0.85}
              >
                <View style={styles.rewardImagePlaceholder}>
                  <Ionicons name={v.icon} size={36} color="#F26522" />
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

        {/* === SECTION 5: Đơn ghép cặp gần đây (Flow 1 — /bookings/) === */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Đơn ghép cặp gần đây</Text>
            {bookings.length > 0 && (
              <TouchableOpacity onPress={openLatestBooking}>
                <Text style={styles.seeAllText}>Xem tất cả</Text>
              </TouchableOpacity>
            )}
          </View>
          {isLoading ? (
            <ActivityIndicator color="#F26522" style={{ marginTop: 16 }} />
          ) : recentBooking && recentStatusStyle ? (
            bookings.map((b) => {
              const st = BOOKING_STATUS_STYLE[b.status] || BOOKING_STATUS_STYLE.in_progress;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={styles.recentTaskCard}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: b.id })}
                  activeOpacity={0.85}
                >
                  <View style={[styles.recentTaskIconBox, { backgroundColor: st.bg }]}>
                    <Ionicons name={st.icon} size={22} color={st.color} />
                  </View>
                  <View style={styles.recentTaskInfo}>
                    <Text style={styles.recentTaskTitle} numberOfLines={1}>
                      {b.job_title || 'Đơn ghép cặp'}
                    </Text>
                    <Text style={styles.recentTaskLocation} numberOfLines={1}>
                      {b.first_slot ? `${b.first_slot.date} · ${b.first_slot.time_from}-${b.first_slot.time_to}` : 'Chưa có lịch cụ thể'}
                    </Text>
                  </View>
                  <View style={[styles.recentStatusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.recentStatusText, { color: st.color }]}>
                      {b.status_label_vi || b.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <TouchableOpacity
              style={styles.emptyTaskBox}
              onPress={() => navigation.navigate('JobTypeSelect')}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={22} color="#F26522" />
              <Text style={styles.emptyTaskText}>Bạn chưa có đơn ghép cặp nào — đăng việc ngay</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* === SECTION 6: Mẹo hay cho Phụ huynh === */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Mẹo hay</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ParentTabs', { screen: 'Chatbot' })}>
              <Text style={styles.seeAllText}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.communityGrid}>
            {TIPS_POSTS.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={[styles.communityCard, { backgroundColor: post.bg }]}
                onPress={() => navigation.navigate('ParentTabs', { screen: 'Chatbot' })}
                activeOpacity={0.85}
              >
                <View style={styles.communityCardBanner}>
                  <Ionicons name={post.icon} size={28} color="#F26522" />
                </View>
                <Text style={styles.communityCardTitle} numberOfLines={2}>{post.title}</Text>
                <Text style={styles.communityTag}>{post.tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

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
  balanceValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
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

  // Service Grid 2×2
  serviceRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  serviceGridItem: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    ...SHADOWS.small,
  },
  serviceGridIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceGridLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
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
    color: '#111827',
    marginBottom: 2,
  },
  recentTaskLocation: {
    fontSize: 12,
    color: '#4B5563',
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
    backgroundColor: '#FFF9F5',
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#F26522',
    borderStyle: 'dashed',
  },
  emptyTaskText: {
    fontSize: 13,
    color: '#C2410C',
    fontWeight: '700',
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
    color: '#111827',
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
  // === Flow 1 — ghép cặp mới ===
  flow1Card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: SIZES.radiusMd,
    ...SHADOWS.medium,
    elevation: 4,
  },
  flow1IconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flow1Title: {
    ...TYPO.bodyBold,
    fontSize: 15,
  },
  flow1Desc: {
    ...TYPO.caption,
    marginTop: 2,
  },
  flow1Row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  flow1Small: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusMd,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(243,106,4,0.45)',
  },
  flow1SmallText: {
    ...TYPO.caption,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontSize: 11,
  },
});
