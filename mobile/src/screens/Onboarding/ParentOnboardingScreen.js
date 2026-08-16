// ============================================================
// ParentOnboardingScreen — Redesign theo Warm Professionalism
// Thay đổi:
// - Layout: chia 2 phần — top (illustration) + bottom (content + actions)
// - Top: surface-container-lowest bg, blurred decor circles (primary +
//   secondary), icon 56px trong circle lớn (radius 80, border 4px)
// - Bottom: surface bg, title on-surface, desc on-surface-variant
// - Progress: pill style (8x2 active cam, 2x2 inactive surface-variant)
// - Buttons: 'Tiếp theo' primary-container bg pill (radius full) +
//   shadow cam, 'Bỏ qua' ghost (transparent, primary-container text)
// - Background: surfaceWarm (#fff8f6) thay vì xám
// Giữ nguyên: 4 slides, scroll logic, completeOnboarding API
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Animated,
  ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { completeOnboarding } from '../../api/onboarding';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// 4 slides — giữ nguyên content, chỉ đổi icon sang Warm style
const SLIDES = [
  {
    iconName: 'create-outline',
    title: 'Đăng việc dễ dàng',
    desc: 'Chỉ cần vài bước — miêu tả nhu cầu, chọn danh mục, đặt giá. EduCareLink sẽ tìm Carepartner phù hợp cho bạn.',
    color: COLORS.primary,
  },
  {
    iconName: 'people-outline',
    title: 'Duyệt ứng viên',
    desc: 'Xem hồ sơ chi tiết, đánh giá từ phụ huynh khác, tóm tắt AI. Chọn người phù hợp nhất cho bé nhà bạn.',
    color: COLORS.secondary,
  },
  {
    iconName: 'star-outline',
    title: 'Đánh giá sau việc',
    desc: 'Sau khi hoàn thành, hãy để lại nhận xét để giúp cộng đồng phụ huynh chọn được Carepartner tốt.',
    color: COLORS.warning,
  },
  {
    iconName: 'shield-checkmark-outline',
    title: 'Thanh toán an toàn',
    desc: 'Hệ thống giữ tiền giúp bạn — chỉ chuyển cho Carepartner khi công việc đã hoàn thành. Hoa hồng 20% tự động trừ.',
    color: COLORS.info,
  },
];

export default function ParentOnboardingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, completeOnboardingInContext } = useAuth();
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeIndexRef = React.useRef(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / width);
    if (idx !== activeIndexRef.current) {
      activeIndexRef.current = idx;
      setActiveIndex(idx);
    }
  };

  const handleNext = async () => {
    if (activeIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
    } else {
      try {
        await completeOnboarding();
        if (completeOnboardingInContext) await completeOnboardingInContext();
      } catch (e) {
        console.warn('Onboarding complete failed:', e);
      }
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top half — illustration area */}
      <View style={styles.illustrationArea}>
        {/* Decorative blurred circles (RN không có blur sẵn → dùng opacity thấp) */}
        <View style={styles.decorCirclePrimary} />
        <View style={styles.decorCircleSecondary} />

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          onScrollEndDrag={handleScroll}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {SLIDES.map((slide, idx) => (
            <View key={idx} style={styles.slide}>
              <Animated.View
                style={[
                  styles.iconCircle,
                  {
                    opacity: fadeAnim,
                    transform: [{ scale: fadeAnim }, { translateY: slideAnim }],
                  },
                ]}
              >
                <View style={[styles.iconBg, { backgroundColor: slide.color + '15' }]}>
                  <Ionicons name={slide.iconName} size={64} color={slide.color} />
                </View>
              </Animated.View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Bottom half — content area */}
      <View style={[styles.contentArea, { paddingTop: insets.top + 32 }]}>
        {/* Active slide title + description */}
        <Animated.View
          style={[
            styles.textBlock,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.slideTitle}>{SLIDES[activeIndex].title}</Text>
          <Text style={styles.slideDesc}>{SLIDES[activeIndex].desc}</Text>
        </Animated.View>

        {/* Progress dots — pill style (8x2 active, 2x2 inactive) */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[styles.dot, activeIndex === idx && styles.dotActive]}
            />
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {activeIndex === SLIDES.length - 1 ? 'Bắt đầu ngay' : 'Tiếp theo'}
            </Text>
            <Ionicons
              name={activeIndex === SLIDES.length - 1 ? 'checkmark-circle' : 'arrow-forward'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Bỏ qua</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceWarm, // #fff8f6 — nền ấm
  },
  // Top half — illustration
  illustrationArea: {
    flex: 1,
    backgroundColor: COLORS.surface, // surface-container-lowest
    borderBottomLeftRadius: 28, // xl radius — bo góc dưới
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    ...SHADOWS.small,
    position: 'relative',
  },
  decorCirclePrimary: {
    position: 'absolute',
    top: -64,
    right: -64,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: COLORS.primaryLight, // primary-fixed
    opacity: 0.5,
  },
  decorCircleSecondary: {
    position: 'absolute',
    bottom: 0,
    left: -64,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: COLORS.secondaryLight, // secondary-fixed
    opacity: 0.4,
  },
  scroll: { flex: 1 },
  scrollContent: { alignItems: 'center', justifyContent: 'center' },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBg: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.surface,
    ...SHADOWS.large,
  },
  // Bottom half — content
  contentArea: {
    backgroundColor: COLORS.surfaceWarm,
    paddingHorizontal: 20, // margin-mobile
    paddingBottom: 48, // pb-xxl
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 32, // mb-xl
  },
  slideTitle: {
    ...TYPO.h1,
    color: COLORS.onSurface,
    textAlign: 'center',
    marginBottom: 16, // mb-md
  },
  slideDesc: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 360, // max-w-sm
    lineHeight: 24,
  },
  // Progress dots — pill style
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32, // mb-xl
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.outlineVariant, // surface-variant
  },
  dotActive: {
    width: 32, // wider pill (w-8)
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary, // primary-container
  },
  // Actions
  actions: {
    width: '100%',
    maxWidth: 360,
    gap: 8, // gap-sm
  },
  nextBtn: {
    backgroundColor: COLORS.primary, // primary-container
    borderRadius: 999, // rounded-full
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  nextBtnText: {
    ...TYPO.h4,
    color: '#ffffff',
  },
  skipBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    ...TYPO.h4,
    color: COLORS.primary, // primary-container
  },
});
