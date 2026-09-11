// ============================================================
// GuestHomeScreen — Thiết kế theo chuẩn Stitch AI & kết nối Backend EduCareLink
// - Sticky Header: Logo gradient, EduCareLink, Hotline 1900 6828, VN pill + live status
// - Hero Promo Carousel: 3 poster chuyển động (Gia sư, Đón trẻ, MoMo Escrow) autoplay 4s
// - Quick Stats: 50.000+ Phụ huynh, 4.9★ Đánh giá, 100% CCCD gắn chip
// - Service Ecosystem: 4 Bento Cards (Gia sư, Đón trẻ, Trông trẻ, AI Radar)
// - Safety & Trust: 3 lớp xác thực độc quyền
// - Parent Testimonial: Review chân thực & bảo chứng hài lòng
// - Student Partner Banner: Dành cho sinh viên đăng ký CarePartner (120k-200k/h)
// - Fixed Bottom Action Dock: "Bắt đầu kết nối ngay" + "Đăng nhập tại đây"
// - Bottom Navigation: 5 tabs với nút AI Trợ lý nổi bật ở giữa
// - Role Selection Modal: Chọn vai trò Phụ huynh / Sinh viên để chuyển tiếp chính xác
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Animated,
  Platform,
  Linking,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, TYPO } from '../../theme/colors';
import apiClient from '../../api/client';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_WIDTH = Math.min(SCREEN_WIDTH - 32, 398);

// 3 slides theo chuẩn Stitch Mockup
const HERO_SLIDES = [
  {
    id: 1,
    badgeText: 'Top 5% SV Sư Phạm & Ngoại Thương',
    badgeIcon: 'star',
    badgeColor: '#FDE047',
    headline: 'Gia sư kèm cặp tận tâm\nngay tại gia đình',
    subtext: 'An tâm gửi gắm, trọn vẹn yêu thương với sinh viên ưu tú.',
    promoBadge: 'GIẢM 50K CA ĐẦU',
    btnText: 'Đặt ngay',
    iconName: 'school',
    roleTarget: 'parent',
    bgMain: '#EA580C',
    bgBottom: '#C2410C',
    glowColor: 'rgba(234, 88, 12, 0.35)',
  },
  {
    id: 2,
    badgeText: 'GPS định vị 2 chiều trực tiếp',
    badgeIcon: 'navigate',
    badgeColor: '#6EE7B7',
    headline: 'Đón con tan trường\nchuẩn xác từng phút',
    subtext: 'Cập nhật ảnh điểm danh tại cổng trường và lộ trình về nhà.',
    promoBadge: 'Chỉ từ 90k/chuyến',
    btnText: 'Xem lộ trình',
    iconName: 'walk',
    roleTarget: 'parent',
    bgMain: '#0284C7',
    bgBottom: '#075985',
    glowColor: 'rgba(2, 132, 199, 0.3)',
  },
  {
    id: 3,
    badgeText: 'Bảo chứng 100% MoMo Escrow',
    badgeIcon: 'shield-checkmark',
    badgeColor: '#FDE047',
    headline: 'Minh bạch tuyệt đối\nan toàn tài chính',
    subtext: 'Chỉ giải ngân khi buổi dạy hoàn tất đúng tiến độ và cam kết.',
    promoBadge: 'An tâm 100%',
    btnText: 'Khám phá',
    iconName: 'shield-checkmark',
    roleTarget: 'parent',
    bgMain: '#059669',
    bgBottom: '#064E3B',
    glowColor: 'rgba(5, 150, 105, 0.3)',
  },
];

// 4 Trụ Cột Dịch Vụ Chủ Lực
const SERVICE_ECOSYSTEM = [
  {
    id: 'tutor',
    title: 'Gia sư tại nhà',
    desc: 'Toán, Tiếng Việt/Văn, Ngoại ngữ & luyện chữ chuẩn sư phạm.',
    price: 'Từ 120k/h',
    icon: 'book',
    iconBg: '#FFF7ED',
    iconBorder: '#FED7AA',
    iconColor: '#EA580C',
    priceColor: '#EA580C',
    role: 'parent',
  },
  {
    id: 'pickup',
    title: 'Đón trẻ an toàn',
    desc: 'Đón tận cổng trường về nhà, GPS định vị & bảo hiểm hành trình.',
    price: 'Từ 90k/lượt',
    icon: 'walk',
    iconBg: '#EFF6FF',
    iconBorder: '#BFDBFE',
    iconColor: '#0284C7',
    priceColor: '#0284C7',
    role: 'parent',
  },
  {
    id: 'childcare',
    title: 'Trông trẻ tại nhà',
    desc: 'Chăm sóc bé, hỗ trợ ăn uống, trò chuyện rèn kỹ năng cảm xúc.',
    price: 'Từ 100k/h',
    icon: 'heart',
    iconBg: '#FFF1F2',
    iconBorder: '#FECDD3',
    iconColor: '#E11D48',
    priceColor: '#E11D48',
    role: 'parent',
  },
  {
    id: 'ai_radar',
    title: 'AI Trợ Lý Radar',
    badge: 'MỚI',
    desc: 'Tìm kiếm & tự động ghép đôi CarePartner thích hợp trong 30s.',
    price: 'Miễn phí trải nghiệm',
    icon: 'hardware-chip',
    iconBg: '#FFF7ED',
    iconBorder: '#FDBA74',
    iconColor: '#F26522',
    priceColor: '#EA580C',
    isAi: true,
    role: 'parent',
  },
];

// 3 Lớp Cam Kết Xác Thực
const SAFETY_PILLARS = [
  {
    id: 1,
    title: 'Xác minh CCCD chip & Thẻ sinh viên',
    desc: 'Đối soát hồ sơ trực tiếp với danh sách sinh viên trường ĐH uy tín.',
  },
  {
    id: 2,
    title: 'Giám sát lộ trình GPS 2 chiều',
    desc: 'Phụ huynh theo dõi trực tiếp vị trí và nhận thông báo theo thời gian thực.',
  },
  {
    id: 3,
    title: 'Bảo lãnh ký quỹ MoMo Escrow 100%',
    desc: 'Học phí được giữ trung gian, chỉ chi trả khi phụ huynh xác nhận hài lòng.',
  },
];

// Bottom Nav
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

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(24)).current;
  const modalSlideAnim = useRef(new Animated.Value(300)).current;

  // States
  const [activeSlide, setActiveSlide] = useState(0);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [roleModalVisible, setRoleModalVisible] = useState(false);

  // Carousel ref
  const carouselScrollRef = useRef(null);

  // Health-check backend live
  useEffect(() => {
    let isMounted = true;
    apiClient
      .get('/health/')
      .then((res) => {
        if (isMounted && res?.data?.status === 'ok') {
          setIsBackendOnline(true);
        }
      })
      .catch(() => {
        if (isMounted) setIsBackendOnline(false);
      });

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      isMounted = false;
    };
  }, [fadeAnim, slideUpAnim]);

  // Autoplay Hero Carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => {
        const next = (prev + 1) % HERO_SLIDES.length;
        if (carouselScrollRef.current) {
          carouselScrollRef.current.scrollTo({
            x: next * (CAROUSEL_WIDTH + 12),
            animated: true,
          });
        }
        return next;
      });
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  // Modal Handler
  const openRoleModal = () => {
    setRoleModalVisible(true);
    Animated.spring(modalSlideAnim, {
      toValue: 0,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();
  };

  const closeRoleModal = () => {
    Animated.timing(modalSlideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setRoleModalVisible(false);
    });
  };

  const handleSelectRole = (role) => {
    closeRoleModal();
    navigation.navigate('Register', { role });
  };

  const handleCallHotline = () => {
    Linking.openURL('tel:19006828').catch(() => {
      Alert.alert('Hotline EduCareLink', 'Tổng đài hỗ trợ: 1900 6828 (Miễn phí)');
    });
  };

  const handleNavPress = (item) => {
    if (item.id === 1) {
      // Home
      return;
    }
    if (item.id === 5) {
      // Tài khoản
      navigation.navigate('Login');
      return;
    }
    if (item.isFab) {
      // AI button
      Alert.alert(
        'AI Trợ Lý EduCareLink',
        'Tính năng AI tự động ghép cặp và phân tích nhu cầu. Hãy tạo tài khoản hoặc đăng nhập để trải nghiệm!',
        [
          { text: 'Để sau', style: 'cancel' },
          { text: 'Đăng nhập', onPress: () => navigation.navigate('Login') },
          { text: 'Đăng ký', onPress: openRoleModal },
        ]
      );
      return;
    }
    // Hoạt động / Cộng đồng
    Alert.alert(
      'Yêu cầu đăng nhập',
      `Vui lòng đăng nhập để truy cập tính năng ${item.label}.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => navigation.navigate('Login') },
      ]
    );
  };

  return (
    <View style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* BEGIN: TopBrandBar */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <View style={styles.brandRow}>
          {/* Logo chính thức EduCareLink */}
          <View style={styles.logoBadge}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoBadgeImg}
              contentFit="contain"
              transition={0}
            />
          </View>
          {/* Brand Name & Tag */}
          <View>
            <Text style={styles.brandTitle}>
              EduCare<Text style={styles.brandHighlight}>Link</Text>
            </Text>
            <Text style={styles.brandSubtitle}>CARE WITH LOVE & TECH</Text>
          </View>
        </View>

        {/* Quick Actions (Hotline + Status/VN) */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.hotlineBtn}
            onPress={handleCallHotline}
            activeOpacity={0.75}
          >
            <Ionicons name="headset" size={14} color={COLORS.primary} />
            <Text style={styles.hotlineText}>1900 6828</Text>
          </TouchableOpacity>

          <View style={styles.countryPill}>
            <Text style={styles.flagEmoji}>🇻🇳</Text>
            <Text style={styles.countryText}>VN</Text>
            {isBackendOnline && <View style={styles.onlineDot} />}
          </View>
        </View>
      </View>
      {/* END: TopBrandBar */}

      {/* Main Content Stream */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideUpAnim }] }}>
          {/* BEGIN: HeroPromoCarousel */}
          <View style={styles.carouselSection}>
            <ScrollView
              ref={carouselScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CAROUSEL_WIDTH + 12}
              decelerationRate="fast"
              contentContainerStyle={styles.carouselScrollContent}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / (CAROUSEL_WIDTH + 12));
                setActiveSlide(idx);
              }}
            >
              {HERO_SLIDES.map((slide, idx) => (
                <View
                  key={slide.id}
                  style={[
                    styles.heroCard,
                    {
                      width: CAROUSEL_WIDTH,
                      backgroundColor: slide.bgMain,
                      shadowColor: slide.bgMain,
                    },
                  ]}
                >
                  {/* Decorative corner icon watermark */}
                  <View style={styles.cardWatermarkWrap}>
                    <Ionicons name={slide.iconName} size={110} color="rgba(255,255,255,0.12)" />
                  </View>

                  {/* Top content */}
                  <View>
                    <View style={styles.floatingPill}>
                      <Ionicons name={slide.badgeIcon} size={12} color={slide.badgeColor} />
                      <Text style={styles.floatingPillText}>{slide.badgeText}</Text>
                    </View>

                    <Text style={styles.heroHeadline}>{slide.headline}</Text>
                    <Text style={styles.heroSubtext}>{slide.subtext}</Text>
                  </View>

                  {/* Bottom action bar */}
                  <View style={styles.heroBottomBar}>
                    <View style={styles.promoBadgeWrap}>
                      <Text style={styles.promoBadgeText}>{slide.promoBadge}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.heroCtaBtn}
                      onPress={openRoleModal}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.heroCtaText}>{slide.btnText}</Text>
                      <Ionicons name="arrow-forward" size={15} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Carousel Indicators */}
            <View style={styles.indicatorRow}>
              {HERO_SLIDES.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.indicatorDot,
                    activeSlide === i && styles.indicatorActivePill,
                  ]}
                />
              ))}
            </View>
          </View>
          {/* END: HeroPromoCarousel */}

          {/* BEGIN: QuickStatsBanner */}
          <View style={styles.statsBanner}>
            <View style={styles.statCol}>
              <Text style={styles.statValue}>50.000+</Text>
              <Text style={styles.statLabel}>Phụ huynh tin chọn</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <View style={styles.statInlineValue}>
                <Text style={styles.statValue}>4.9</Text>
                <Text style={styles.starGold}>★</Text>
              </View>
              <Text style={styles.statLabel}>Đánh giá hài lòng</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <View style={styles.statInlineValue}>
                <Ionicons name="shield-checkmark" size={15} color="#0E9F6E" style={{ marginRight: 2 }} />
                <Text style={styles.statValue}>100%</Text>
              </View>
              <Text style={styles.statLabel}>CCCD gắn chip</Text>
            </View>
          </View>
          {/* END: QuickStatsBanner */}

          {/* BEGIN: ServiceEcosystemGrid */}
          <View style={styles.serviceSection}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Hệ Sinh Thái Dịch Vụ</Text>
                <Text style={styles.sectionSubtitle}>Tiêu chuẩn đồng hành toàn diện cho trẻ em</Text>
              </View>
              <TouchableOpacity
                style={styles.pillarCountLink}
                onPress={openRoleModal}
                activeOpacity={0.7}
              >
                <Text style={styles.pillarCountText}>4 Trụ cột</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.bentoGrid}>
              {SERVICE_ECOSYSTEM.map((svc) => (
                <TouchableOpacity
                  key={svc.id}
                  style={[
                    styles.bentoCard,
                    svc.isAi && styles.aiBentoCard,
                  ]}
                  onPress={openRoleModal}
                  activeOpacity={0.8}
                >
                  <View>
                    <View style={[styles.bentoIconBox, { backgroundColor: svc.iconBg, borderColor: svc.iconBorder }]}>
                      <Ionicons name={svc.icon} size={22} color={svc.iconColor} />
                    </View>
                    <View style={styles.bentoTitleRow}>
                      <Text style={styles.bentoTitle}>{svc.title}</Text>
                      {svc.badge && (
                        <View style={styles.bentoNewBadge}>
                          <Text style={styles.bentoNewBadgeText}>{svc.badge}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.bentoDesc} numberOfLines={2}>
                      {svc.desc}
                    </Text>
                  </View>

                  <View style={styles.bentoBottomRow}>
                    <Text style={[styles.bentoPrice, { color: svc.priceColor }]}>
                      {svc.price}
                    </Text>
                    <Ionicons
                      name={svc.isAi ? 'flash' : 'add-circle'}
                      size={18}
                      color={svc.isAi ? COLORS.primary : '#94A3B8'}
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* END: ServiceEcosystemGrid */}

          {/* BEGIN: SafetyCommitment */}
          <View style={styles.safetyCard}>
            <View style={styles.safetyHeaderRow}>
              <View style={styles.safetyIconBadge}>
                <Ionicons name="shield-checkmark" size={18} color="#0E9F6E" />
              </View>
              <Text style={styles.safetyMainTitle}>Cam Kết Xác Thực 3 Lớp Độc Quyền</Text>
            </View>

            <View style={styles.safetyList}>
              {SAFETY_PILLARS.map((item) => (
                <View key={item.id} style={styles.safetyItem}>
                  <Ionicons name="checkmark-circle" size={18} color="#0E9F6E" style={styles.safetyCheckIcon} />
                  <View style={styles.safetyItemTextWrap}>
                    <Text style={styles.safetyItemTitle}>{item.title}</Text>
                    <Text style={styles.safetyItemDesc}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          {/* END: SafetyCommitment */}

          {/* BEGIN: ParentTestimonialCard */}
          <View style={styles.testimonialCard}>
            <View style={styles.testimonialHeader}>
              <View style={styles.testimonialUserRow}>
                <View style={styles.testimonialAvatar}>
                  <Text style={styles.testimonialAvatarText}>TT</Text>
                </View>
                <View>
                  <View style={styles.testimonialNameRow}>
                    <Text style={styles.testimonialName}>Chị Thu Trang</Text>
                    <Text style={styles.verifiedTag}>● Đã xác thực</Text>
                  </View>
                  <Text style={styles.testimonialMeta}>Mẹ bé Hải Nam · Q. Cầu Giấy (18 ca hoàn thành)</Text>
                </View>
              </View>
              <Text style={styles.starRating}>★★★★★</Text>
            </View>
            <Text style={styles.testimonialQuote}>
              “Bạn gia sư Bách Khoa kèm con tôi môn Toán rất kiên nhẫn. Thích nhất là tính năng theo dõi GPS và giải ngân MoMo an toàn 100%!”
            </Text>
          </View>
          {/* END: ParentTestimonialCard */}

          {/* BEGIN: StudentPartnerBanner */}
          <View style={styles.studentBanner}>
            <View style={styles.studentBannerLeft}>
              <View style={styles.studentPill}>
                <Text style={styles.studentPillText}>DÀNH CHO SINH VIÊN</Text>
              </View>
              <Text style={styles.studentTitle}>Trở thành CarePartner</Text>
              <Text style={styles.studentDesc}>
                Thu nhập 120k - 200k/h · Tự do chủ động thời gian theo lịch học.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.studentCtaBtn}
              onPress={() => handleSelectRole('worker')}
              activeOpacity={0.85}
            >
              <Text style={styles.studentCtaText}>Đăng ký ngay</Text>
            </TouchableOpacity>
          </View>
          {/* END: StudentPartnerBanner */}

          {/* BEGIN: StickyBottomActionDock */}
          <View style={styles.inlineCtaSection}>
            <TouchableOpacity
              style={styles.primaryFullBtn}
              onPress={openRoleModal}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryFullBtnText}>Bắt đầu kết nối ngay</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.loginPromptRow}>
              <Text style={styles.loginPromptLabel}>Đã có tài khoản?</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginPromptLink}>Đăng nhập tại đây</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.securityRow}>
              <Ionicons name="lock-closed" size={12} color="#0E9F6E" />
              <Text style={styles.securityText}>Bảo mật thông tin theo tiêu chuẩn an toàn dữ liệu số</Text>
            </View>
          </View>
          {/* END: StickyBottomActionDock */}
        </Animated.View>
      </ScrollView>

      {/* BEGIN: FixedBottomNavBar */}
      <View style={[styles.bottomNavBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {NAV_ITEMS.map((item) => {
          if (item.isFab) {
            return (
              <View key={item.id} style={styles.fabCenterWrap}>
                <TouchableOpacity
                  style={styles.fabButton}
                  onPress={() => handleNavPress(item)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="hardware-chip" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <Text style={styles.fabLabel}>AI</Text>
              </View>
            );
          }
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.navTabItem}
              onPress={() => handleNavPress(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.active ? item.icon : item.iconOutline}
                size={22}
                color={item.active ? COLORS.primary : '#64748B'}
              />
              <Text
                style={[
                  styles.navTabLabel,
                  item.active && styles.navTabLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* END: FixedBottomNavBar */}

      {/* BEGIN: RoleSelectionModal */}
      <Modal
        visible={roleModalVisible}
        transparent
        animationType="none"
        onRequestClose={closeRoleModal}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={closeRoleModal}
        >
          <Animated.View
            style={[
              styles.modalSheet,
              {
                paddingBottom: Math.max(insets.bottom, 20) + 12,
                transform: [{ translateY: modalSlideAnim }],
              },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Chọn vai trò của bạn</Text>
                <Text style={styles.modalSubtitle}>EduCareLink tối ưu trải nghiệm theo nhu cầu riêng</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={closeRoleModal}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Role Options */}
            <View style={styles.roleOptionsList}>
              {/* Option 1: Phụ huynh */}
              <TouchableOpacity
                style={styles.roleCard}
                onPress={() => handleSelectRole('parent')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardLeft}>
                  <View style={[styles.roleIconWrap, { backgroundColor: '#FFEDD5' }]}>
                    <Ionicons name="people" size={26} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={styles.roleCardTitle}>Tôi là Phụ huynh</Text>
                    <Text style={styles.roleCardDesc}>
                      Cần tìm Gia sư, Đón trẻ hoặc Trông trẻ tại nhà
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Option 2: Sinh viên / CarePartner */}
              <TouchableOpacity
                style={styles.roleCard}
                onPress={() => handleSelectRole('worker')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardLeft}>
                  <View style={[styles.roleIconWrap, { backgroundColor: '#D1FAE5' }]}>
                    <Ionicons name="school" size={26} color="#047857" />
                  </View>
                  <View>
                    <Text style={styles.roleCardTitle}>Tôi là Sinh viên (CarePartner)</Text>
                    <Text style={styles.roleCardDesc}>
                      Nhận lịch dạy, đưa đón & tăng thêm thu nhập
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Disclaimer */}
            <Text style={styles.modalDisclaimer}>
              Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng & Chính sách bảo mật của EduCareLink.
            </Text>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
      {/* END: RoleSelectionModal */}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    backgroundColor: 'rgba(248, 250, 252, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  logoBadgeImg: {
    width: 28,
    height: 28,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    lineHeight: 20,
  },
  brandHighlight: {
    color: '#F26522',
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.2,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hotlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  hotlineText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  flagEmoji: {
    fontSize: 11,
  },
  countryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0E9F6E',
    marginLeft: 2,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  carouselSection: {
    marginBottom: 16,
  },
  carouselScrollContent: {
    gap: 12,
    paddingVertical: 4,
  },
  heroCard: {
    minHeight: 195,
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  cardWatermarkWrap: {
    position: 'absolute',
    right: -4,
    bottom: -6,
    pointerEvents: 'none',
  },
  floatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  floatingPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  heroHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    marginBottom: 6,
  },
  heroSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    lineHeight: 17,
    maxWidth: 240,
  },
  heroBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    paddingTop: 10,
    marginTop: 10,
  },
  promoBadgeWrap: {
    backgroundColor: '#FBBF24',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  promoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  heroCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  indicatorActivePill: {
    width: 22,
    backgroundColor: '#F26522',
    borderRadius: 3,
  },
  statsBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#F1F5F9',
  },
  statInlineValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  starGold: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '900',
    marginLeft: 2,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  serviceSection: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  pillarCountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pillarCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EA580C',
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bentoCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
    minHeight: 146,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  aiBentoCard: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFDF9',
  },
  bentoIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  bentoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  bentoTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  bentoNewBadge: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bentoNewBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#C2410C',
  },
  bentoDesc: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14.5,
  },
  bentoBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
  },
  bentoPrice: {
    fontSize: 11,
    fontWeight: '700',
  },
  safetyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  safetyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  safetyIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safetyMainTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  safetyList: {
    gap: 9,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  safetyCheckIcon: {
    marginTop: 1,
  },
  safetyItemTextWrap: {
    flex: 1,
  },
  safetyItemTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  safetyItemDesc: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14.5,
  },
  testimonialCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 18,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  testimonialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  testimonialUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  testimonialAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
    justifyContent: 'center',
    alignItems: 'center',
  },
  testimonialAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EA580C',
  },
  testimonialNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  testimonialName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  verifiedTag: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  testimonialMeta: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  starRating: {
    fontSize: 11,
    color: '#F59E0B',
    letterSpacing: 1,
  },
  testimonialQuote: {
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#334155',
    lineHeight: 17,
  },
  studentBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  studentBannerLeft: {
    flex: 1,
    paddingRight: 10,
  },
  studentPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    marginBottom: 6,
  },
  studentPillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#6EE7B7',
    letterSpacing: 0.4,
  },
  studentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  studentDesc: {
    fontSize: 10.5,
    color: '#CBD5E1',
    lineHeight: 14.5,
  },
  studentCtaBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  studentCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  inlineCtaSection: {
    gap: 9,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryFullBtn: {
    width: '100%',
    backgroundColor: '#F26522',
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryFullBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loginPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  loginPromptLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  loginPromptLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EA580C',
    textDecorationLine: 'underline',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  securityText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  bottomNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  navTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTabLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  navTabLabelActive: {
    color: '#EA580C',
    fontWeight: '700',
  },
  fabCenterWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: -20,
  },
  fabButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F26522',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  fabLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#EA580C',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleOptionsList: {
    gap: 12,
    marginBottom: 16,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  roleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  roleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  roleCardDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  modalDisclaimer: {
    fontSize: 10.5,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 10,
  },
});
