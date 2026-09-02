// ============================================================
// GuestHomeScreen — Redesign khớp Stitch AI HTML mockup
// Layout (mobile-native):
// - Header: gradient cam (#a63b00 → #f26522), bo tròn dưới 32px
//   avatar trái + "Xin chào 👋" + nút support_agent phải
// - CTA Button: pill trắng chồng lên header, text cam, icon login
// - Banner Carousel: horizontal scroll, 85% width, 28px radius
// - Service Grid: 2×2 grid, icon tròn trên nền #FFF4ED
// - Rewards Section: horizontal scroll tier cards (Đồng, Bạc, Vàng)
// - Trust Section: 2×2 grid feature cards
// - Bottom Nav: 5 tabs, AI FAB nổi ở giữa
// Chức năng: navigate Login/Register khi nhấn CTA/tab Tài khoản
// ============================================================

import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Dimensions, Animated, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Service categories (2×2 grid — khớp HTML mockup)
const SERVICE_CATEGORIES = [
  { id: 1, icon: 'book', name: 'Gia sư' },
  { id: 2, icon: 'walk', name: 'Đón trẻ' },
  { id: 3, icon: 'heart', name: 'Trông trẻ' },
  { id: 4, icon: 'hardware-chip', name: 'Hỗ trợ AI' },
];

// Tier cards for rewards section
const TIER_CARDS = [
  { id: 1, symbol: 'Cu', name: 'Đồng (Copper)', desc: 'Bắt đầu hành trình', bg: '#fed7aa', color: '#ea580c' },
  { id: 2, symbol: 'Ag', name: 'Bạc (Silver)', desc: 'Mở khóa ưu đãi', bg: '#e5e7eb', color: '#6b7280' },
  { id: 3, symbol: 'Au', name: 'Vàng (Gold)', desc: 'Đặc quyền cao cấp', bg: '#fef3c7', color: '#d97706' },
];

// Trust & Safety features
const TRUST_FEATURES = [
  { id: 1, icon: 'book', name: 'Nhật ký Chăm sóc' },
  { id: 2, icon: 'camera', name: 'Xác thực bằng ảnh' },
  { id: 3, icon: 'location', name: 'Theo dõi GPS' },
  { id: 4, icon: 'people', name: 'Gợi ý ghép cặp' },
];

// Bottom nav items
const NAV_ITEMS = [
  { id: 1, icon: 'home', iconOutline: 'home-outline', label: 'Trang chủ', active: true },
  { id: 2, icon: 'receipt', iconOutline: 'receipt-outline', label: 'Hoạt động', active: false },
  { id: 3, icon: 'hardware-chip', iconOutline: 'hardware-chip-outline', label: 'AI', active: false, isFab: true },
  { id: 4, icon: 'people', iconOutline: 'people-outline', label: 'Cộng đồng', active: false },
  { id: 5, icon: 'person', iconOutline: 'person-outline', label: 'Tài khoản', active: false },
];

export default function GuestHomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideUpAnim]);

  const goToLogin = () => navigation.navigate('Login');
  const goToRegister = () => navigation.navigate('Register');

  // Banner width = 85% of screen
  const bannerWidth = SCREEN_WIDTH * 0.85;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#a63b00" translucent />

      {/* === HEADER — Gradient cam, bo tròn dưới === */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerGradient}>
          {/* Top gradient overlay */}
          <View style={styles.gradientTop} />
          <View style={styles.gradientBottom} />
        </View>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatar}>
              <Ionicons name="person-circle" size={28} color="#fff" />
            </View>
            <Text style={styles.headerGreeting}>Xin chào 👋</Text>
          </View>
          <TouchableOpacity
            style={styles.headerSupportBtn}
            onPress={goToLogin}
            activeOpacity={0.7}
          >
            <Ionicons name="headset" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* === CTA Button — Pill trắng chồng lên header === */}
        <Animated.View style={[styles.ctaContainer, { opacity: fadeAnim, transform: [{ translateY: slideUpAnim }] }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={goToLogin}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in" size={22} color={COLORS.primary} />
            <Text style={styles.ctaText}>Đăng nhập / Tạo tài khoản</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* === Banner Carousel === */}
        <Animated.View style={[styles.bannerSection, { opacity: fadeAnim }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={bannerWidth + 16}
            decelerationRate="fast"
            contentContainerStyle={styles.bannerScroll}
          >
            {/* Banner 1 — Primary gradient */}
            <TouchableOpacity
              style={[styles.bannerCard, { width: bannerWidth }]}
              onPress={goToLogin}
              activeOpacity={0.9}
            >
              <View style={styles.banner1Bg}>
                <View style={styles.bannerDecorCircle1} />
                <View style={styles.bannerDecorCircle2} />
                <View style={styles.bannerTextWrap}>
                  <Text style={styles.bannerTitle}>Tìm CarePartner{'\n'}phù hợp ngay</Text>
                  <Text style={styles.bannerSubtitle}>An tâm gửi gắm, trọn vẹn yêu thương</Text>
                </View>
                <View style={styles.bannerIconWrap}>
                  <Ionicons name="school" size={48} color="rgba(255,255,255,0.3)" />
                </View>
              </View>
            </TouchableOpacity>

            {/* Banner 2 — Secondary gradient */}
            <TouchableOpacity
              style={[styles.bannerCard, { width: bannerWidth }]}
              onPress={goToLogin}
              activeOpacity={0.9}
            >
              <View style={styles.banner2Bg}>
                <View style={[styles.bannerDecorCircle1, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
                <View style={[styles.bannerDecorCircle2, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                <View style={styles.bannerTextWrap}>
                  <Text style={styles.bannerTitle}>Trở thành{'\n'}CarePartner</Text>
                  <Text style={styles.bannerSubtitle}>Kiếm thêm thu nhập, linh hoạt thời gian</Text>
                </View>
                <View style={styles.bannerIconWrap}>
                  <Ionicons name="people" size={48} color="rgba(255,255,255,0.3)" />
                </View>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>

        {/* === Service Grid — 2×2 === */}
        <Animated.View style={[styles.serviceSection, { opacity: fadeAnim, transform: [{ translateY: slideUpAnim }] }]}>
          {/* Row 1 */}
          <View style={styles.serviceRow}>
            {SERVICE_CATEGORIES.slice(0, 2).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.serviceItem}
                onPress={goToLogin}
                activeOpacity={0.7}
              >
                <View style={styles.serviceIconCircle}>
                  <Ionicons name={cat.icon} size={28} color={COLORS.primary} />
                </View>
                <Text style={styles.serviceLabel}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Row 2 */}
          <View style={styles.serviceRow}>
            {SERVICE_CATEGORIES.slice(2, 4).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.serviceItem}
                onPress={goToLogin}
                activeOpacity={0.7}
              >
                <View style={styles.serviceIconCircle}>
                  <Ionicons name={cat.icon} size={28} color={COLORS.primary} />
                </View>
                <Text style={styles.serviceLabel}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* === Rewards Section === */}
        <Animated.View style={[styles.rewardsSection, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>Điểm thưởng & Hạng CarePartner</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rewardsScroll}
          >
            {TIER_CARDS.map((tier) => (
              <TouchableOpacity
                key={tier.id}
                style={styles.tierCard}
                onPress={goToLogin}
                activeOpacity={0.85}
              >
                <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
                  <Text style={[styles.tierSymbol, { color: tier.color }]}>{tier.symbol}</Text>
                </View>
                <View style={styles.tierInfo}>
                  <Text style={styles.tierName}>{tier.name}</Text>
                  <Text style={styles.tierDesc}>{tier.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* === Trust & Safety Section === */}
        <Animated.View style={[styles.trustSection, { opacity: fadeAnim }]}>
          <Text style={styles.sectionTitle}>An toàn & Tin cậy</Text>
          {/* Row 1 */}
          <View style={styles.trustRow}>
            {TRUST_FEATURES.slice(0, 2).map((feat) => (
              <View key={feat.id} style={styles.trustCard}>
                <Ionicons name={feat.icon} size={24} color={COLORS.primary} />
                <Text style={styles.trustLabel}>{feat.name}</Text>
              </View>
            ))}
          </View>
          {/* Row 2 */}
          <View style={styles.trustRow}>
            {TRUST_FEATURES.slice(2, 4).map((feat) => (
              <View key={feat.id} style={styles.trustCard}>
                <Ionicons name={feat.icon} size={24} color={COLORS.primary} />
                <Text style={styles.trustLabel}>{feat.name}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Bottom spacer for nav bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* === Bottom Navigation Bar === */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {NAV_ITEMS.map((item) => {
          if (item.isFab) {
            // Center FAB — raised AI button
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.fabContainer}
                onPress={goToLogin}
                activeOpacity={0.85}
              >
                <View style={styles.fabButton}>
                  <Ionicons name={item.icon} size={28} color="#fff" />
                </View>
                <Text style={styles.fabLabel}>{item.label}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.navItem}
              onPress={item.id === 5 ? goToLogin : goToLogin}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.active ? item.icon : item.iconOutline}
                size={24}
                color={item.active ? COLORS.primaryDeep : COLORS.onSurfaceVariant}
              />
              <Text style={[
                styles.navLabel,
                item.active && styles.navLabelActive,
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceWarm || '#fff8f6',
  },

  // === HEADER ===
  headerWrapper: {
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 48, // extra space for CTA overlap
    overflow: 'hidden',
    zIndex: 20,
  },
  headerGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#a63b00',
  },
  gradientBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: COLORS.primary, // #F26522
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerGreeting: {
    ...TYPO.h3,
    color: '#fff',
    fontWeight: '700',
  },
  headerSupportBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // === SCROLL ===
  scrollView: {
    flex: 1,
    marginTop: -24, // overlap into header
    zIndex: 30,
  },
  scrollContent: {
    paddingTop: 0,
  },

  // === CTA BUTTON ===
  ctaContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  ctaButton: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  ctaText: {
    ...TYPO.h4,
    fontSize: 17,
    color: COLORS.primary,
    fontWeight: '700',
  },

  // === BANNER CAROUSEL ===
  bannerSection: {
    paddingTop: 16,
    marginBottom: 16,
  },
  bannerScroll: {
    paddingHorizontal: 20,
    gap: 16,
  },
  bannerCard: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  banner1Bg: {
    backgroundColor: COLORS.primary,
    width: '100%',
    height: 160,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    overflow: 'hidden',
  },
  banner2Bg: {
    backgroundColor: '#2DB84B',
    width: '100%',
    height: 160,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    overflow: 'hidden',
  },
  bannerDecorCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bannerDecorCircle2: {
    position: 'absolute',
    bottom: -40,
    right: 40,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bannerTextWrap: {
    flex: 1,
    justifyContent: 'center',
    zIndex: 2,
  },
  bannerTitle: {
    ...TYPO.h2,
    color: '#fff',
    marginBottom: 6,
    lineHeight: 28,
  },
  bannerSubtitle: {
    ...TYPO.bodySmall,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  bannerIconWrap: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    opacity: 0.6,
  },

  // === SERVICE GRID ===
  serviceSection: {
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  serviceItem: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingVertical: 8,
  },
  serviceIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF4ED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceLabel: {
    ...TYPO.caption,
    color: COLORS.onSurface,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
  },

  // === REWARDS SECTION ===
  rewardsSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
    marginBottom: 16,
  },
  rewardsScroll: {
    gap: 16,
    paddingRight: 20,
  },
  tierCard: {
    minWidth: SCREEN_WIDTH * 0.65,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  tierBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierSymbol: {
    fontSize: 20,
    fontWeight: '800',
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    ...TYPO.h5,
    color: COLORS.onSurface,
    marginBottom: 2,
  },
  tierDesc: {
    ...TYPO.caption,
    color: COLORS.outline,
    fontWeight: '500',
    fontSize: 12,
  },

  // === TRUST SECTION ===
  trustSection: {
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  trustRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  trustCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    gap: 8,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  trustLabel: {
    ...TYPO.body,
    color: COLORS.onSurface,
    fontWeight: '600',
    fontSize: 14,
  },

  // === BOTTOM NAV ===
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceContainerHigh || '#fde3da',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 8,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 12,
    zIndex: 50,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    paddingBottom: 2,
  },
  navLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  navLabelActive: {
    color: COLORS.primaryDeep,
    fontWeight: '700',
  },

  // === FAB (Center AI button) ===
  fabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    position: 'relative',
    top: -24,
  },
  fabButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 12,
  },
  fabLabel: {
    ...TYPO.caption,
    color: COLORS.primaryDeep,
    fontWeight: '700',
    marginTop: 4,
    fontSize: 12,
  },
});
