// ============================================================
// SplashScreen — Redesign khớp mockup thiết kế (logo tròn + sóng cam)
// Layout:
// - Nền cam #F26522 full-screen
// - Decorative circles (bán kính lớn, opacity thấp) ở góc trên-phải & dưới-trái
// - Dot grid pattern 3×3 ở góc trên-phải & dưới-trái
// - Logo tròn (Image từ assets/logo.png) ở giữa màn hình
// - "EduCareLink" + tagline bên dưới logo
// - Wave shape ở đáy màn hình
// - Loader bar + caption "Đang tải dữ liệu..." phía trên wave
// Giữ nguyên: navigation logic (auto-chuyển Login sau 2.5s)
// ============================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  Dimensions,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SIZES, TYPO } from '../../theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function SplashScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;
  const decorAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo fade-in + scale-up
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Logo subtle pulse (loop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Decor circles fade-in
    Animated.timing(decorAnim, {
      toValue: 1,
      duration: 1200,
      delay: 200,
      useNativeDriver: true,
    }).start();

    // Dot grids fade-in
    Animated.timing(dotAnim, {
      toValue: 1,
      duration: 1000,
      delay: 600,
      useNativeDriver: true,
    }).start();

    // Loader bar sweep (loop)
    Animated.loop(
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [fadeAnim, logoScale, pulseAnim, barAnim, decorAnim, dotAnim]);

  useEffect(() => {
    // Tự động chuyển sang Login sau 2.5 giây nếu chưa đăng nhập
    if (!user) {
      const timer = setTimeout(() => navigation.replace('Login'), 2500);
      return () => clearTimeout(timer);
    }
  }, [user, navigation]);

  // Interpolate pulse: scale 0.98 ↔ 1.02
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.02],
  });

  // Interpolate loader bar: sweep across
  const barTranslateX = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, SCREEN_WIDTH * 0.6 + 40],
  });

  // Render dot grid pattern (3x3)
  const renderDotGrid = () => {
    const dots = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        dots.push(
          <View
            key={`dot-${row}-${col}`}
            style={[
              styles.dot,
              {
                top: row * 12,
                left: col * 12,
              },
            ]}
          />
        );
      }
    }
    return dots;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} translucent />

      {/* === Decorative background elements === */}

      {/* Large circle — top-right */}
      <Animated.View
        style={[
          styles.decorCircleTopRight,
          {
            opacity: decorAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.12],
            }),
          },
        ]}
      />

      {/* Medium circle — top-left, partially hidden */}
      <Animated.View
        style={[
          styles.decorCircleTopLeft,
          {
            opacity: decorAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.10],
            }),
          },
        ]}
      />

      {/* Large circle — bottom-left */}
      <Animated.View
        style={[
          styles.decorCircleBottomLeft,
          {
            opacity: decorAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.10],
            }),
          },
        ]}
      />

      {/* Dot grid — top-right corner */}
      <Animated.View style={[styles.dotGridTopRight, { opacity: dotAnim }]}>
        {renderDotGrid()}
      </Animated.View>

      {/* Dot grid — bottom-left corner */}
      <Animated.View style={[styles.dotGridBottomLeft, { opacity: dotAnim }]}>
        {renderDotGrid()}
      </Animated.View>

      {/* === Wave shape at bottom === */}
      <View style={styles.waveContainer}>
        <View style={styles.wave1} />
        <View style={styles.wave2} />
      </View>

      {/* === Main content === */}
      <View style={styles.contentWrapper}>
        {/* Top spacer */}
        <View style={{ flex: 1 }} />

        {/* Logo + Text */}
        <Animated.View
          style={[
            styles.mainContent,
            {
              opacity: fadeAnim,
              transform: [{ scale: logoScale }, { scale: pulseScale }],
            },
          ]}
        >
          {/* Logo — sử dụng logo.png thực tế thay vì Ionicons */}
          <View style={styles.logoShadow}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* App name */}
          <Text style={styles.appName}>EduCareLink</Text>

          {/* Tagline */}
          <Text style={styles.tagline}>
            An tâm gửi gắm, trọn vẹn yêu thương
          </Text>
        </Animated.View>

        {/* Bottom spacer */}
        <View style={{ flex: 1 }} />

        {/* Loader section */}
        <Animated.View
          style={[
            styles.loaderContainer,
            {
              opacity: fadeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.5, 1],
              }),
            },
          ]}
        >
          <View style={styles.loaderBar}>
            <Animated.View
              style={[
                styles.loaderProgress,
                { transform: [{ translateX: barTranslateX }] },
              ]}
            />
          </View>
          <Text style={styles.loaderCaption}>Đang tải dữ liệu...</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    overflow: 'hidden',
  },
  contentWrapper: {
    flex: 1,
    paddingTop: StatusBar.currentHeight || 44,
    paddingBottom: 40,
    zIndex: 10,
  },

  // === Decorative circles ===
  decorCircleTopRight: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#ffffff',
  },
  decorCircleTopLeft: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.15,
    left: -100,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#ffffff',
  },
  decorCircleBottomLeft: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.2,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#ffffff',
  },

  // === Dot grids (3×3) ===
  dotGridTopRight: {
    position: 'absolute',
    top: 80,
    right: 28,
    width: 36,
    height: 36,
    zIndex: 5,
  },
  dotGridBottomLeft: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.28,
    left: 28,
    width: 36,
    height: 36,
    zIndex: 5,
  },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },

  // === Wave at bottom ===
  waveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: 1,
  },
  wave1: {
    position: 'absolute',
    bottom: 0,
    left: -40,
    right: -40,
    height: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderTopLeftRadius: 200,
    borderTopRightRadius: 120,
  },
  wave2: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    right: -60,
    height: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderTopLeftRadius: 140,
    borderTopRightRadius: 250,
  },

  // === Main content ===
  mainContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.lg,
  },

  // Logo container — tạo shadow nhẹ quanh logo tròn
  logoShadow: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'transparent',
    marginBottom: SIZES.xl,
    // Shadow cho iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    // Shadow cho Android
    elevation: 12,
  },
  logoImage: {
    width: 160,
    height: 160,
    borderRadius: 80,
  },

  // Typography
  appName: {
    ...TYPO.h1,
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.textOnPrimary,
    textAlign: 'center',
    marginBottom: SIZES.sm,
    letterSpacing: -0.6,
  },
  tagline: {
    ...TYPO.body,
    fontSize: 16,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    maxWidth: 300,
  },

  // === Loader section ===
  loaderContainer: {
    width: '55%',
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: SIZES.xxl,
    zIndex: 10,
  },
  loaderBar: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
    position: 'relative',
  },
  loaderProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: '35%',
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radiusFull,
  },
  loaderCaption: {
    ...TYPO.caption,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginTop: SIZES.sm,
    fontSize: 13,
  },
});
