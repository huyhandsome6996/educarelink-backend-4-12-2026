import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Animated, Image,
  ScrollView, TouchableOpacity, Dimensions, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { completeOnboarding } from '../../api/onboarding';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '📝',
    image: require('../../../assets/images/icon_tutoring.png'),
    title: 'Đăng việc dễ dàng',
    desc: 'Chỉ cần vài bước — miêu tả nhu cầu, chọn danh mục, đặt giá. EduCareLink sẽ tìm Carepartner phù hợp cho bạn.',
    color: COLORS.primary,
  },
  {
    icon: '👥',
    image: require('../../../assets/images/icon_babysitting.png'),
    title: 'Duyệt ứng viên',
    desc: 'Xem hồ sơ chi tiết, đánh giá từ phụ huynh khác, tóm tắt AI. Chọn người phù hợp nhất cho bé nhà bạn.',
    color: COLORS.secondary,
  },
  {
    icon: '⭐',
    image: require('../../../assets/images/icon_pickup.png'),
    title: 'Đánh giá sau việc',
    desc: 'Sau khi hoàn thành, hãy để lại nhận xét để giúp cộng đồng phụ huynh chọn được Carepartner tốt.',
    color: COLORS.warning,
  },
  {
    icon: '💳',
    image: require('../../../assets/images/icon_shopping.png'),
    title: 'Thanh toán an toàn',
    desc: 'MoMo giữ tiền giúp bạn — chỉ chuyển cho Carepartner khi công việc đã hoàn thành. Hoa hồng 20% tự động trừ.',
    color: COLORS.info,
  },
];

export default function ParentOnboardingScreen() {
  const navigation = useNavigation();
  const { user, completeOnboardingInContext } = useAuth();
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const handleScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / width);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  const handleNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
    } else {
      // Hoàn thành onboarding
      try {
        await completeOnboarding();
        if (completeOnboardingInContext) await completeOnboardingInContext();
      } catch (e) {
        console.warn('Onboarding complete failed:', e);
      }
      // Navigator sẽ tự chuyển khi first_login = false
    }
  };

  const handleSkip = async () => {
    try {
      await completeOnboarding();
      if (completeOnboardingInContext) await completeOnboardingInContext();
    } catch (e) {
      console.warn('Onboarding skip failed:', e);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chào mừng tới EduCareLink</Text>
        <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
          <Text style={styles.skipText}>Bỏ qua</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {SLIDES.map((slide, idx) => (
          <View key={idx} style={styles.slide}>
            <Animated.View style={[styles.iconCircle, { backgroundColor: slide.color + '20', opacity: fadeAnim }]}>
              <Image source={slide.image} style={styles.iconImage} resizeMode="contain" />
            </Animated.View>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideDesc}>{slide.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, idx) => (
          <View
            key={idx}
            style={[styles.dot, activeIndex === idx && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {activeIndex === SLIDES.length - 1 ? 'Bắt đầu ngay' : 'Tiếp theo'}
          </Text>
          <Ionicons
            name={activeIndex === SLIDES.length - 1 ? 'checkmark-circle' : 'arrow-forward'}
            size={20}
            color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '700' },
  skipBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  skipText: { color: 'rgba(255,255,255,0.85)', ...TYPO.buttonSmall },
  scroll: { flex: 1 },
  slide: {
    width, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 18,
  },
  iconCircle: {
    width: 160, height: 160, borderRadius: 80,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    ...SHADOWS.large,
  },
  iconImage: { width: 90, height: 90 },
  slideTitle: { ...TYPO.h1, fontSize: 26, color: COLORS.textPrimary, textAlign: 'center' },
  slideDesc: { ...TYPO.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24 },
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingVertical: 20,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 24, backgroundColor: COLORS.primary,
  },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusLg, height: 56,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    ...SHADOWS.large,
  },
  nextBtnText: { color: '#fff', ...TYPO.button, fontSize: 16 },
});
