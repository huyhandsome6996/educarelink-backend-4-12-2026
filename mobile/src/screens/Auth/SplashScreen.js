// ============================================================
// SplashScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Tagline: "An tâm gửi gắm, trọn vẹn yêu thương" (theo DESIGN.md)
// - Logo container: 128px circle, viền trắng 4px, pulse animation nhẹ
// - Loader bar (thanh tiến trình) thay cho 3 dots — khớp design HTML
// - Typography: TYPO.h1 (Manrope_800ExtraBold) cho tên app
// - Màu: giữ COLORS.primary (#F26522 = primary-container trong DESIGN.md)
// Giữ nguyên: navigation logic (auto-chuyển Login sau 2s)
// ============================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SIZES, TYPO } from '../../theme/colors';

export default function SplashScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current; // logo pulse
  const barAnim = useRef(new Animated.Value(0)).current;   // loader sweep
  const decorAnim = useRef(new Animated.Value(0)).current; // background circles fade

  useEffect(() => {
    // Logo fade-in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();

    // Logo subtle pulse (loop) — khớp "subtlePulse" trong design HTML
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2000,
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

    // Loader bar sweep (loop) — khớp "progressSweep" trong design HTML
    Animated.loop(
      Animated.timing(barAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    ).start();
  }, [fadeAnim, pulseAnim, barAnim, decorAnim]);

  useEffect(() => {
    // Tự động chuyển sang Login sau 2.5 giây nếu chưa đăng nhập
    if (!user) {
      const timer = setTimeout(() => navigation.replace('Login'), 2500);
      return () => clearTimeout(timer);
    }
  }, [user, navigation]);

  // Interpolate pulse: scale 0.98 ↔ 1.02, opacity 0.7 ↔ 1
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.02],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  // Interpolate loader bar: -30% → 100% (sweep across)
  const barTranslateX = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 320], // bar width 120px → translate from -120 to 320 (well past container)
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Background decorative circles — subtle white shapes */}
      <Animated.View
        style={[
          styles.decorCircle1,
          { opacity: decorAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }) },
        ]}
      />
      <Animated.View
        style={[
          styles.decorCircle2,
          { opacity: decorAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }) },
        ]}
      />
      <Animated.View
        style={[
          styles.decorWave,
          { opacity: decorAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }) },
        ]}
      />

      {/* Top spacer để đẩy content xuống giữa */}
      <View style={{ flex: 1 }} />

      {/* Main content — logo + tên app + tagline */}
      <Animated.View
        style={[
          styles.mainContent,
          {
            opacity: fadeAnim,
            transform: [{ scale: pulseScale }, { scale: pulseOpacity }],
          },
        ]}
      >
        {/* Logo container — circle 128px, viền trắng, pulse animation */}
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Ionicons name="heart" size={56} color={COLORS.primary} />
          </View>
        </View>

        <Text style={styles.appName}>EduCareLink</Text>
        <Text style={styles.tagline}>An tâm gửi gắm, trọn vẹn yêu thương</Text>
      </Animated.View>

      {/* Bottom spacer */}
      <View style={{ flex: 1 }} />

      {/* Loader section — thanh tiến trình + caption */}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary, // #F26522 = primary-container trong DESIGN.md
    paddingHorizontal: SIZES.lg,     // margin-mobile = 20px ≈ SIZES.lg (24) — gần đúng
    paddingVertical: SIZES.xxl,      // 48px top/bottom
    overflow: 'hidden',
  },
  // Decorative shapes — abstract warm shapes, opacity thấp
  decorCircle1: {
    position: 'absolute',
    top: 60,
    left: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#ffffff',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: 180,
    right: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#ffffff',
  },
  decorWave: {
    position: 'absolute',
    bottom: -40,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 100,
    borderTopRightRadius: 100,
  },
  mainContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Logo outer — 128px circle, viền trắng mỏng, backdrop blur (không có blur trên RN thuần → dùng opacity)
  logoOuter: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.lg,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  // Logo inner — 96px circle, viền trắng dày 4px, nền trắng
  logoInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ffffff',
    borderWidth: 4,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    ...TYPO.h1,
    fontSize: 32,           // phóng to hơn h1 mặc định (28) cho splash
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: SIZES.sm,
    letterSpacing: -0.6,
  },
  tagline: {
    ...TYPO.body,
    fontSize: 15,
    color: COLORS.primaryFixedDim, // #ffb599 — primary-fixed-dim trong DESIGN.md (trên nền cam sáng)
    textAlign: 'center',
    maxWidth: 280,
  },
  // Loader section
  loaderContainer: {
    width: '60%',
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: SIZES.xxl,
  },
  loaderBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 207, 179, 0.3)', // primarySoft với opacity 0.3
    borderRadius: SIZES.radiusFull,
    overflow: 'hidden',
    position: 'relative',
  },
  loaderProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: '30%',
    backgroundColor: '#ffffff',
    borderRadius: SIZES.radiusFull,
  },
  loaderCaption: {
    ...TYPO.caption,
    color: COLORS.primaryFixedDim,
    textAlign: 'center',
    marginTop: SIZES.sm,
    opacity: 0.8,
  },
});
