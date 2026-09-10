// ============================================================
// ParentHomeScreen — Trang chủ Phụ huynh EduCareLink
// Thiết kế nâng cấp theo chuẩn Stitch UI:
// - Header cam nhận diện thương hiệu (#F26522 -> #EA580C)
// - Thanh tìm kiếm & AI Voice gợi ý việc thông minh
// - Dock nổi: Ví EduCare & CarePoints (Điểm thưởng)
// - 3 Trụ cột dịch vụ cốt lõi: Gia sư 1:1, Trông trẻ, Đón trẻ tan học
// - Banner AI: Đăng việc siêu tốc trong 5 giây
// - Thẻ Radar Live Tracking khi có ca đang thực hiện (Flow 1)
// - Hoạt động & Lịch ca gần đây (API getBookings thật)
// - Ưu đãi độc quyền & Cam kết an toàn 3 lớp
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getBookings } from '../../api/matching';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Style theo trạng thái ĐƠN GHÉP CẶP (Flow 1)
const BOOKING_STATUS_STYLE = {
  awaiting_commitment: { color: '#B45309', bg: '#FFFBEB', icon: 'hourglass-outline', label: 'Chờ cam kết' },
  committed: { color: '#C2410C', bg: '#FFF4ED', icon: 'time-outline', label: 'Đã khóa lịch' },
  in_progress: { color: '#2563EB', bg: '#EFF6FF', icon: 'navigate-outline', label: 'Đang thực hiện' },
  completed: { color: '#059669', bg: '#ECFDF5', icon: 'checkmark-circle-outline', label: 'Hoàn thành' },
  cancelled: { color: '#6B7280', bg: '#F3F4F6', icon: 'close-circle-outline', label: 'Đã huỷ' },
  expired: { color: '#6B7280', bg: '#F3F4F6', icon: 'close-circle-outline', label: 'Hết hạn' },
};

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {}

  const { user, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Hiệu ứng pulse cho chấm radar live tracking
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Tải danh sách đơn ghép cặp (Flow 1)
  const fetchBookings = async () => {
    try {
      const { data } = await getBookings({ role: 'parent' });
      setBookings((data?.results || data || []).slice(0, 5));
    } catch (e) {
      console.error('Lỗi tải danh sách đơn:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  // Mở đơn đang hoạt động mới nhất
  const openLatestBooking = async () => {
    try {
      const { data } = await getBookings({ role: 'parent' });
      const ACTIVE = ['awaiting_commitment', 'committed', 'in_progress'];
      const latest = (data?.results || []).find((b) => ACTIVE.includes(b.status))
        || (data?.results || [])[0];
      if (latest) {
        navigation.navigate('BookingDetail', { bookingId: latest.id });
      } else {
        Alert.alert('Chưa có đơn nào', 'Bạn chưa có đơn ghép cặp nào. Hãy đăng việc để tìm CarePartner nhé!');
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

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Phụ huynh';

  // Lấy đơn đang diễn ra hoặc đã khóa lịch để hiển thị radar
  const activeBooking = bookings.find((b) =>
    ['in_progress', 'committed', 'awaiting_commitment'].includes(b.status)
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#F26522" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={['#F26522']}
            testID="parent-home-refresh"
          />
        }
      >
        {/* ============================================================ */}
        {/* 1. HERO TOP BRAND HEADER (#F26522 SIGNATURE ORANGE GRADIENT) */}
        {/* ============================================================ */}
        <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
          {/* Top Row: User Profile Greeting & Notification */}
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.userInfoRow}
              onPress={() => navigation.navigate('ParentTabs', { screen: 'ParentProfile' })}
              onLongPress={handleLogout}
              activeOpacity={0.85}
            >
              <View style={styles.avatarWrapper}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="person" size={20} color="#F26522" />
                </View>
                <View style={styles.onlineBadge} />
              </View>

              <View style={styles.greetingTextContainer}>
                <Text style={styles.headerGreeting} numberOfLines={1}>
                  Chào buổi chiều, {displayName} 👋
                </Text>
                <View style={styles.locationSubtitleRow}>
                  <Ionicons name="location" size={12} color="#FED7AA" />
                  <Text style={styles.locationSubtitleText} numberOfLines={1}>
                    Cầu Giấy, Hà Nội · EduCare An Toàn
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActionRow}>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => navigation.navigate('Notifications')}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications-outline" size={21} color="#ffffff" />
                <View style={styles.notifBadge} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Integrated Smart Search & Voice AI Prompt Bar */}
          <TouchableOpacity
            style={styles.searchBarContainer}
            onPress={() => navigation.navigate('JobTypeSelect')}
            activeOpacity={0.9}
          >
            <View style={styles.searchLeftContent}>
              <View style={styles.aiSparkleIconBox}>
                <Ionicons name="sparkles" size={15} color="#ffffff" />
              </View>
              <Text style={styles.searchPlaceholder} numberOfLines={1}>
                Bạn cần gia sư, bảo mẫu hay đón bé?
              </Text>
            </View>

            <View style={styles.searchActionsRight}>
              <TouchableOpacity
                style={styles.micCircleBtn}
                onPress={() => navigation.navigate('Chatbot')}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={16} color="#F26522" />
              </TouchableOpacity>
              <View style={styles.searchButtonCircle}>
                <Ionicons name="search" size={14} color="#ffffff" />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* ============================================================ */}
        {/* 2. ELEVATED WALLET & CAREREWARDS DOCK                        */}
        {/* ============================================================ */}
        <View style={styles.elevatedDockWrapper}>
          <View style={styles.elevatedDockCard}>
            {/* Wallet Info */}
            <TouchableOpacity
              style={styles.dockItem}
              onPress={() => navigation.navigate('WalletCredits')}
              activeOpacity={0.7}
            >
              <View style={styles.dockIconOrange}>
                <Ionicons name="wallet-outline" size={18} color="#F26522" />
              </View>
              <View style={styles.dockTextWrap}>
                <Text style={styles.dockLabel}>VÍ EDUCARE</Text>
                <View style={styles.dockValueRow}>
                  <Text style={styles.dockValueText}>1.250.000đ</Text>
                  <View style={styles.dockPillOrange}>
                    <Text style={styles.dockPillOrangeText}>+ Nạp</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.dockDivider} />

            {/* CarePoints */}
            <TouchableOpacity
              style={styles.dockItem}
              onPress={() => navigation.navigate('RewardPointsScreen')}
              activeOpacity={0.7}
            >
              <View style={styles.dockIconAmber}>
                <Ionicons name="star" size={18} color="#D97706" />
              </View>
              <View style={styles.dockTextWrap}>
                <Text style={styles.dockLabel}>ĐIỂM THƯỞNG</Text>
                <View style={styles.dockValueRow}>
                  <Text style={styles.dockValueText}>340 pts</Text>
                  <View style={styles.dockPillAmber}>
                    <Text style={styles.dockPillAmberText}>Đổi quà ›</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================ */}
        {/* 3. CORE SERVICE PILLARS (Dịch vụ Chăm sóc & Đồng hành)      */}
        {/* ============================================================ */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithDot}>
              <View style={styles.orangeDot} />
              <Text style={styles.sectionMainTitle}>Dịch vụ Chăm sóc & Đồng hành</Text>
            </View>
            <View style={styles.verifiedTag}>
              <Text style={styles.verifiedTagText}>Chuẩn 3 Lớp Xác Thực</Text>
            </View>
          </View>

          {/* PILLAR 1: Gia sư & Kèm học 1:1 (Dominant Signature Orange) */}
          <TouchableOpacity
            style={styles.pillarPrimaryCard}
            onPress={() => navigation.navigate('TutoringForm')}
            activeOpacity={0.9}
          >
            <View style={styles.pillarPrimaryAccentStripe} />
            <View style={styles.pillarPrimaryBody}>
              <View style={styles.pillarPrimaryLeft}>
                <View style={styles.pillarPrimaryIconBox}>
                  <Ionicons name="school" size={24} color="#ffffff" />
                </View>
                <View style={styles.pillarPrimaryInfo}>
                  <View style={styles.pillarPrimaryTitleRow}>
                    <Text style={styles.pillarPrimaryTitle}>Gia sư & Kèm học 1:1</Text>
                    <View style={styles.hotBadge}>
                      <Text style={styles.hotBadgeText}>🔥 Đặt nhiều nhất</Text>
                    </View>
                  </View>
                  <Text style={styles.pillarPrimaryDesc}>
                    Toán, Tiếng Việt, Tiếng Anh, Đàn piano & Luyện chữ
                  </Text>
                  <View style={styles.univBadge}>
                    <Ionicons name="checkmark-circle" size={12} color="#059669" />
                    <Text style={styles.univBadgeText}>
                      100% SV giỏi ĐH Sư Phạm, Bách Khoa, Ngoại Thương
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.pillarPrimaryPriceCol}>
                <Text style={styles.priceLead}>Chỉ từ</Text>
                <Text style={styles.priceNumOrange}>70k<Text style={styles.priceUnit}>/h</Text></Text>
                <View style={styles.btnBookOrange}>
                  <Text style={styles.btnBookOrangeText}>Đặt ngay →</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* PILLARS 2 & 3: 2-Column Compact Row */}
          <View style={styles.twoColPillarsRow}>
            {/* PILLAR 2: Trông trẻ tại nhà (Emerald Accent) */}
            <TouchableOpacity
              style={styles.pillarSecondaryCardEmerald}
              onPress={() => navigation.navigate('ChildcareForm')}
              activeOpacity={0.9}
            >
              <View style={styles.pillarSecondaryStripeEmerald} />
              <View style={styles.pillarSecondaryTop}>
                <View style={styles.pillarSecondaryIconBoxEmerald}>
                  <Ionicons name="heart" size={20} color="#059669" />
                </View>
                <View style={styles.tagEmerald}>
                  <Text style={styles.tagEmeraldText}>❤️ Tận tâm</Text>
                </View>
              </View>

              <View style={styles.pillarSecondaryContent}>
                <Text style={styles.pillarSecondaryTitle}>Trông trẻ tại nhà</Text>
                <Text style={styles.pillarSecondaryDesc}>
                  Ăn uống, chơi & rèn thói quen tự lập
                </Text>
                <Text style={styles.featureEmeraldText}>✓ Sơ cấp cứu y tế</Text>
              </View>

              <View style={styles.pillarSecondaryBottom}>
                <Text style={styles.priceNumEmerald}>60k<Text style={styles.priceUnit}>/h</Text></Text>
                <View style={styles.btnBookEmerald}>
                  <Text style={styles.btnBookEmeraldText}>Đặt ca →</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* PILLAR 3: Đón trẻ tan học (Mobility Blue Accent) */}
            <TouchableOpacity
              style={styles.pillarSecondaryCardBlue}
              onPress={() => navigation.navigate('PickupForm')}
              activeOpacity={0.9}
            >
              <View style={styles.pillarSecondaryStripeBlue} />
              <View style={styles.pillarSecondaryTop}>
                <View style={styles.pillarSecondaryIconBoxBlue}>
                  <Ionicons name="navigate" size={20} color="#2563EB" />
                </View>
                <View style={styles.tagBlue}>
                  <Text style={styles.tagBlueText}>📍 Live GPS</Text>
                </View>
              </View>

              <View style={styles.pillarSecondaryContent}>
                <Text style={styles.pillarSecondaryTitle}>Đón trẻ tan học</Text>
                <Text style={styles.pillarSecondaryDesc}>
                  Từ cổng trường về tận cửa nhà
                </Text>
                <Text style={styles.featureBlueText}>✓ Check-in ảnh phụ huynh</Text>
              </View>

              <View style={styles.pillarSecondaryBottom}>
                <Text style={styles.priceNumBlue}>50k<Text style={styles.priceUnit}>/chuyến</Text></Text>
                <View style={styles.btnBookBlue}>
                  <Text style={styles.btnBookBlueText}>Đặt xe →</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* PILLAR 4: Đăng việc siêu tốc với AI Banner */}
          <TouchableOpacity
            style={styles.aiFastBookingBanner}
            onPress={() => navigation.navigate('Chatbot')}
            activeOpacity={0.9}
          >
            <View style={styles.aiBannerLeft}>
              <View style={styles.aiBannerTitleRow}>
                <Text style={styles.aiBannerEmoji}>⚡</Text>
                <Text style={styles.aiBannerTitle}>Đăng việc siêu tốc trong 5 giây</Text>
              </View>
              <Text style={styles.aiBannerSubtitle}>
                Nói hoặc gõ tự nhiên, AI tự động ghép CarePartner phù hợp nhất
              </Text>
            </View>
            <View style={styles.aiBannerButton}>
              <Text style={styles.aiBannerButtonText}>Thử ngay →</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ============================================================ */}
        {/* 4. ACTIVE LIVE TRACKING RADAR WIDGET (Nếu có ca đang chạy)   */}
        {/* ============================================================ */}
        {activeBooking && (
          <View style={styles.sectionContainer}>
            <View style={styles.radarCardContainer}>
              <View style={styles.radarHeaderRow}>
                <View style={styles.radarStatusGroup}>
                  <Animated.View style={[styles.radarPulseDot, { transform: [{ scale: pulseAnim }] }]} />
                  <Text style={styles.radarStatusTitle}>
                    {activeBooking.status === 'in_progress'
                      ? 'CA CHĂM SÓC ĐANG DIỄN RA'
                      : 'CA ĐÃ KHÓA LỊCH CHỜ THỰC HIỆN'}
                  </Text>
                </View>
                <View style={styles.radarEtaBadge}>
                  <Text style={styles.radarEtaText}>
                    {activeBooking.status_label_vi || 'Đang giám sát'}
                  </Text>
                </View>
              </View>

              <View style={styles.radarBodyRow}>
                <View style={styles.radarAvatarCircle}>
                  <Ionicons name="shield-checkmark" size={22} color="#2563EB" />
                </View>
                <View style={styles.radarInfoCol}>
                  <Text style={styles.radarJobTitle} numberOfLines={1}>
                    {activeBooking.job_title || 'Ca chăm sóc & đồng hành'}
                  </Text>
                  <Text style={styles.radarSlotTime} numberOfLines={1}>
                    {activeBooking.first_slot
                      ? `${activeBooking.first_slot.date} · ${activeBooking.first_slot.time_from} - ${activeBooking.first_slot.time_to}`
                      : 'Đang theo dõi lịch trình'}
                  </Text>
                  <View style={styles.radarRouteBadge}>
                    <Ionicons name="location" size={11} color="#1D4ED8" />
                    <Text style={styles.radarRouteText}>
                      Đã kết nối với CarePartner an toàn
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.radarActionsGroup}>
                <TouchableOpacity
                  style={styles.radarPrimaryActionBtn}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: activeBooking.id })}
                  activeOpacity={0.85}
                >
                  <Ionicons name="map-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.radarPrimaryActionText}>
                    Xem Live GPS & Nhật ký ca
                  </Text>
                </TouchableOpacity>

                <View style={styles.radarSecondaryRow}>
                  <TouchableOpacity
                    style={styles.radarSmallCallBtn}
                    onPress={() => navigation.navigate('BookingDetail', { bookingId: activeBooking.id })}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="call-outline" size={14} color="#374151" style={{ marginRight: 4 }} />
                    <Text style={styles.radarSmallCallText}>Chi tiết đơn</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.radarSmallSosBtn}
                    onPress={() => {
                      Alert.alert(
                        'Tổng đài Khẩn cấp SOS',
                        'Bạn cần hỗ trợ an toàn ngay lập tức? Hotline EduCareLink 24/7: 1900 6868',
                        [
                          { text: 'Đóng', style: 'cancel' },
                          { text: 'Gọi 1900 6868', style: 'destructive', onPress: () => {} },
                        ]
                      );
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="warning-outline" size={14} color="#DC2626" style={{ marginRight: 4 }} />
                    <Text style={styles.radarSmallSosText}>SOS Khẩn cấp</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ============================================================ */}
        {/* 5. RECENT ACTIVITY & CARE HISTORY (Lịch ca gần đây)         */}
        {/* ============================================================ */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionMainTitle}>Lịch ca chăm sóc gần đây</Text>
            {bookings.length > 0 && (
              <TouchableOpacity onPress={openLatestBooking}>
                <Text style={styles.seeAllText}>Xem tất cả ({bookings.length}) ›</Text>
              </TouchableOpacity>
            )}
          </View>

          {isLoading ? (
            <ActivityIndicator color="#F26522" style={{ marginTop: 20 }} />
          ) : bookings.length > 0 ? (
            <View style={styles.recentListContainer}>
              {bookings.slice(0, 3).map((b) => {
                const st = BOOKING_STATUS_STYLE[b.status] || BOOKING_STATUS_STYLE.in_progress;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.recentCardItem}
                    onPress={() => navigation.navigate('BookingDetail', { bookingId: b.id })}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.recentIconBox, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={20} color={st.color} />
                    </View>

                    <View style={styles.recentInfoCol}>
                      <View style={styles.recentTitleRow}>
                        <Text style={styles.recentTitleText} numberOfLines={1}>
                          {b.job_title || 'Đơn ghép cặp'}
                        </Text>
                        <View style={[styles.recentBadge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.recentBadgeText, { color: st.color }]}>
                            {b.status_label_vi || st.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.recentTimeText} numberOfLines={1}>
                        {b.first_slot
                          ? `${b.first_slot.date} · ${b.first_slot.time_from} - ${b.first_slot.time_to}`
                          : 'Đã tạo trên hệ thống'}
                      </Text>
                    </View>

                    <View style={styles.recentDetailBtnWrap}>
                      <Text style={styles.recentDetailBtnText}>Chi tiết</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.emptyBookingsCard}
              onPress={() => navigation.navigate('JobTypeSelect')}
              activeOpacity={0.85}
            >
              <View style={styles.emptyPlusCircle}>
                <Ionicons name="add" size={24} color="#F26522" />
              </View>
              <Text style={styles.emptyBookingsTitle}>Bạn chưa có đơn ghép cặp nào</Text>
              <Text style={styles.emptyBookingsSubtitle}>
                Chạm vào đây để đăng việc và nhận gợi ý CarePartner trong 5 phút
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ============================================================ */}
        {/* 6. PROMOTIONAL CAROUSEL & CAREREWARDS DEALS                  */}
        {/* ============================================================ */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionMainTitle}>Ưu đãi & Cam kết EduCare</Text>
            <Text style={styles.sectionSubhint}>Trượt xem thêm</Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promoScrollContainer}
          >
            {/* Promo 1: Voucher */}
            <TouchableOpacity
              style={styles.promoVoucherCard}
              onPress={() => navigation.navigate('RewardPointsScreen')}
              activeOpacity={0.9}
            >
              <View>
                <View style={styles.voucherCodePill}>
                  <Text style={styles.voucherCodeText}>MÃ: EDUCARE2026</Text>
                </View>
                <Text style={styles.voucherTitle}>
                  Giảm ngay 50.000đ cho ca Gia sư đầu tiên
                </Text>
                <Text style={styles.voucherDesc}>
                  Áp dụng cho mọi môn học và cấp lớp
                </Text>
              </View>

              <View style={styles.voucherBottomRow}>
                <Text style={styles.voucherExpiryText}>HSD: 30/09</Text>
                <View style={styles.voucherSaveBtn}>
                  <Text style={styles.voucherSaveText}>Lưu mã</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Promo 2: Guarantee */}
            <TouchableOpacity
              style={styles.promoGuaranteeCard}
              onPress={() => navigation.navigate('HelpCenter')}
              activeOpacity={0.9}
            >
              <View>
                <View style={styles.guaranteeTagPill}>
                  <Text style={styles.guaranteeTagText}>BẢO VỆ 3 LỚP</Text>
                </View>
                <Text style={styles.guaranteeTitle}>
                  Cam kết hoàn tiền 100% nếu không hài lòng
                </Text>
                <Text style={styles.guaranteeDesc}>
                  Chính sách minh bạch & an tâm tuyệt đối
                </Text>
              </View>

              <View style={styles.guaranteeBottomRow}>
                <Text style={styles.guaranteeSubText}>EduCare Guarantee</Text>
                <View style={styles.guaranteeActionBtn}>
                  <Text style={styles.guaranteeActionText}>Tìm hiểu</Text>
                </View>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ============================================================ */}
        {/* 7. 3-LAYER TRUST & SAFETY ASSURANCE FOOTER                   */}
        {/* ============================================================ */}
        <View style={styles.sectionContainer}>
          <View style={styles.trustFooterCard}>
            <View style={styles.trustFooterHeader}>
              <Ionicons name="shield-checkmark" size={16} color="#F26522" />
              <Text style={styles.trustFooterTitle}>Tiêu chuẩn An toàn EduCareLink</Text>
            </View>

            <View style={styles.trustItemRow}>
              <Ionicons name="checkmark-circle" size={15} color="#059669" style={{ marginTop: 2 }} />
              <Text style={styles.trustItemText}>
                <Text style={styles.trustItemBold}>100% CarePartner</Text> đối soát CCCD gắn chip & thẻ SV ĐH Top.
              </Text>
            </View>

            <View style={styles.trustItemRow}>
              <Ionicons name="checkmark-circle" size={15} color="#2563EB" style={{ marginTop: 2 }} />
              <Text style={styles.trustItemText}>
                <Text style={styles.trustItemBold}>Ký quỹ an tâm:</Text> Tiền được giữ qua MoMo Escrow, giải ngân khi hoàn thành.
              </Text>
            </View>

            <View style={styles.trustItemRow}>
              <Ionicons name="checkmark-circle" size={15} color="#D97706" style={{ marginTop: 2 }} />
              <Text style={styles.trustItemText}>
                <Text style={styles.trustItemBold}>Tổng đài 24/7</Text> & Bảo hiểm tai nạn chuyến đi lên đến 50 triệu đồng.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ============================================================
// STYLESHEET
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // 1. HERO TOP BRAND HEADER
  headerContainer: {
    backgroundColor: '#F26522',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 16,
    paddingBottom: 28,
    position: 'relative',
    ...SHADOWS.medium,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FED7AA',
    ...SHADOWS.small,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  greetingTextContainer: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  locationSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  locationSubtitleText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FED7AA',
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  notifBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1,
    borderColor: '#ffffff',
  },

  // Smart Search & Voice AI Prompt Bar
  searchBarContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.medium,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  searchLeftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  aiSparkleIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchPlaceholder: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
  },
  searchActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  micCircleBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF4ED',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  searchButtonCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EA580C',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 2. ELEVATED WALLET & POINTS DOCK
  elevatedDockWrapper: {
    paddingHorizontal: 16,
    marginTop: -14,
    zIndex: 10,
  },
  elevatedDockCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.medium,
    elevation: 3,
  },
  dockItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dockIconOrange: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF4ED',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  dockIconAmber: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  dockTextWrap: {
    flex: 1,
  },
  dockLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  dockValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dockValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dockPillOrange: {
    backgroundColor: '#FFF4ED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dockPillOrangeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F26522',
  },
  dockPillAmber: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dockPillAmberText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  dockDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },

  // SECTIONS COMMON
  sectionContainer: {
    marginTop: 18,
    paddingHorizontal: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orangeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F26522',
  },
  sectionMainTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  verifiedTag: {
    backgroundColor: '#FFF4ED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F26522',
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F26522',
  },
  sectionSubhint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },

  // 3. PILLAR 1 (Gia sư 1:1)
  pillarPrimaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 10,
    ...SHADOWS.small,
  },
  pillarPrimaryAccentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#F26522',
  },
  pillarPrimaryBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 4,
  },
  pillarPrimaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  pillarPrimaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },
  pillarPrimaryInfo: {
    flex: 1,
  },
  pillarPrimaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  pillarPrimaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  hotBadge: {
    backgroundColor: '#FFF4ED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  hotBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#C2410C',
  },
  pillarPrimaryDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  univBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  univBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#065F46',
  },
  pillarPrimaryPriceCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  priceLead: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '600',
  },
  priceNumOrange: {
    fontSize: 14,
    fontWeight: '900',
    color: '#F26522',
  },
  priceUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  btnBookOrange: {
    backgroundColor: '#F26522',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  btnBookOrangeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },

  // 2-COL SECONDARY PILLARS
  twoColPillarsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  pillarSecondaryCardEmerald: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  pillarSecondaryStripeEmerald: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#059669',
  },
  pillarSecondaryCardBlue: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  pillarSecondaryStripeBlue: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#2563EB',
  },
  pillarSecondaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 2,
  },
  pillarSecondaryIconBoxEmerald: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillarSecondaryIconBoxBlue: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagEmerald: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagEmeraldText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },
  tagBlue: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBlueText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  pillarSecondaryContent: {
    marginTop: 8,
    paddingLeft: 2,
  },
  pillarSecondaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  pillarSecondaryDesc: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 13,
  },
  featureEmeraldText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#047857',
    marginTop: 4,
  },
  featureBlueText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
    marginTop: 4,
  },
  pillarSecondaryBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingLeft: 2,
  },
  priceNumEmerald: {
    fontSize: 12,
    fontWeight: '900',
    color: '#059669',
  },
  priceNumBlue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2563EB',
  },
  btnBookEmerald: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  btnBookEmeraldText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  btnBookBlue: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  btnBookBlueText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },

  // PILLAR 4: AI FAST BOOKING BANNER
  aiFastBookingBanner: {
    backgroundColor: '#F26522',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  aiBannerLeft: {
    flex: 1,
    marginRight: 10,
  },
  aiBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiBannerEmoji: {
    fontSize: 14,
  },
  aiBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  aiBannerSubtitle: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    lineHeight: 14,
  },
  aiBannerButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    ...SHADOWS.small,
  },
  aiBannerButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F26522',
  },

  // 4. RADAR ACTIVE LIVE TRACKING
  radarCardContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    padding: 14,
    ...SHADOWS.small,
  },
  radarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  radarStatusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radarPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  radarStatusTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1D4ED8',
    letterSpacing: 0.3,
  },
  radarEtaBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  radarEtaText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E40AF',
  },
  radarBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  radarAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  radarInfoCol: {
    flex: 1,
  },
  radarJobTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  radarSlotTime: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  radarRouteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  radarRouteText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  radarActionsGroup: {
    gap: 6,
    paddingTop: 4,
  },
  radarPrimaryActionBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarPrimaryActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  radarSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radarSmallCallBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarSmallCallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#374151',
  },
  radarSmallSosBtn: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  radarSmallSosText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },

  // 5. RECENT ACTIVITY
  recentListContainer: {
    gap: 8,
  },
  recentCardItem: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  recentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recentInfoCol: {
    flex: 1,
    marginRight: 6,
  },
  recentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  recentTitleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  recentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  recentTimeText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  recentDetailBtnWrap: {
    backgroundColor: '#FFF4ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recentDetailBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F26522',
  },
  emptyBookingsCard: {
    backgroundColor: '#FFF9F5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
  },
  emptyPlusCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF4ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyBookingsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C2410C',
  },
  emptyBookingsSubtitle: {
    fontSize: 11,
    color: '#9A3412',
    textAlign: 'center',
    marginTop: 2,
  },

  // 6. PROMOTIONAL CAROUSEL
  promoScrollContainer: {
    gap: 10,
  },
  promoVoucherCard: {
    width: 250,
    backgroundColor: '#F26522',
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  voucherCodePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  voucherCodeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
  },
  voucherTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 16,
  },
  voucherDesc: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  voucherBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  voucherExpiryText: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  voucherSaveBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  voucherSaveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#F26522',
  },
  promoGuaranteeCard: {
    width: 250,
    backgroundColor: '#047857',
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
    ...SHADOWS.small,
  },
  guaranteeTagPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  guaranteeTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
  },
  guaranteeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 16,
  },
  guaranteeDesc: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  guaranteeBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  guaranteeSubText: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  guaranteeActionBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  guaranteeActionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },

  // 7. TRUST & SAFETY FOOTER
  trustFooterCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    ...SHADOWS.small,
  },
  trustFooterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  trustFooterTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  trustItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  trustItemText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
    flex: 1,
  },
  trustItemBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
});
