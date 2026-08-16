// ============================================================
// WorkerOnboardingScreen — Redesign theo Warm Professionalism
// (Cùng pattern với ParentOnboardingScreen để consistency)
// Design HTML worker_onboarding_id_verification là step ID verification
// (camera viewfinder) — khác flow với welcome carousel này. Welcome
// carousel này áp dụng cùng visual style với Parent onboarding.
// Thay đổi:
// - Layout 2 phần: top (illustration) + bottom (content + actions)
// - Top: surface bg + 2 decorative circles (primary + secondary)
// - Bottom: surfaceWarm bg, title + desc + pill progress dots
// - Buttons: 'Tiếp theo' pill primary-container + 'Bỏ qua' ghost
// Giữ nguyên: 4 slides, scroll logic, completeOnboarding API
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, StatusBar, Animated,
  ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { completeOnboarding } from '../../api/onboarding';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    iconName: 'search-outline',
    title: 'Tìm việc linh hoạt',
    desc: 'Xem hàng trăm việc làm phù hợp với lịch học của bạn. Lọc theo danh mục, địa điểm, mức lương.',
    color: COLORS.primary,
  },
  {
    iconName: 'flash-outline',
    title: 'Ứng tuyển 1 chạm',
    desc: 'Thấy việc hợp → bấm "Ứng tuyển". Phụ huynh sẽ duyệt hồ sơ của bạn trong vài giờ.',
    color: COLORS.secondary,
  },
  {
    iconName: 'checkmark-done-outline',
    title: 'Hoàn thành & đánh giá',
    desc: 'Làm việc xong — phụ huynh xác nhận hoàn thành. Nhận đánh giá 5 sao để tăng cơ hội được chọn.',
    color: COLORS.warning,
  },
  {
    iconName: 'wallet-outline',
    title: 'Nhận tiền MoMo',
    desc: '80% tiền tự động chuyển vào ví MoMo của bạn khi hoàn thành. 20% hoa hồng nền tảng.',
    color: COLORS.info,
  },
];

export default function WorkerOnboardingScreen() {
  const { completeOnboardingInContext } = useAuth();
  const insets = useSafeAreaInsets();
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

  const finish = async () => {
    try {
      await completeOnboarding();
      if (completeOnboardingInContext) await completeOnboardingInContext();
    } catch (e) {
      console.warn('Onboarding complete failed:', e);
    }
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (activeIndex + 1) * width, animated: true });
    } else {
      finish();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top half — illustration area */}
      <View style={styles.illustrationArea}>
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

        {/* Progress dots — pill style */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, idx) => (
            <View
              key={idx}
              style={[styles.dot, activeIndex === idx && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {activeIndex === SLIDES.length - 1 ? 'Bắt đầu kiếm việc' : 'Tiếp theo'}
            </Text>
            <Ionicons
              name={activeIndex === SLIDES.length - 1 ? 'checkmark-circle' : 'arrow-forward'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={finish}
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
    backgroundColor: COLORS.surfaceWarm,
  },
  illustrationArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 28,
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
    backgroundColor: COLORS.primaryLight,
    opacity: 0.5,
  },
  decorCircleSecondary: {
    position: 'absolute',
    bottom: 0,
    left: -64,
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: COLORS.secondaryLight,
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
  contentArea: {
    backgroundColor: COLORS.surfaceWarm,
    paddingHorizontal: 20,
    paddingBottom: 48,
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 32,
  },
  slideTitle: {
    ...TYPO.h1,
    color: COLORS.onSurface,
    textAlign: 'center',
    marginBottom: 16,
  },
  slideDesc: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.outlineVariant,
  },
  dotActive: {
    width: 32,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  actions: {
    width: '100%',
    maxWidth: 360,
    gap: 8,
  },
  nextBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  nextBtnText: {
    ...TYPO.h4,
    color: COLORS.textOnPrimary,
  },
  skipBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    ...TYPO.h4,
    color: COLORS.primary,
  },
});
