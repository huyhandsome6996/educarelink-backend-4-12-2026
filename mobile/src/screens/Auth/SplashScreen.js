import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SIZES, TYPO } from '../../theme/colors';

export default function SplashScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const decorAnim1 = useRef(new Animated.Value(0)).current;
  const decorAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(decorAnim1, { toValue: 1, duration: 1200, delay: 200, useNativeDriver: true }),
      Animated.timing(decorAnim2, { toValue: 1, duration: 1200, delay: 400, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    // Tự động chuyển sang Login sau 2 giây nếu chưa đăng nhập
    if (!user) {
      const timer = setTimeout(() => navigation.replace('Login'), 2000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Subtle radial gradient overlay */}
      <View style={styles.gradientOverlay} />
      <View style={styles.gradientInner} />

      {/* Decorative circles */}
      <Animated.View style={[styles.decorCircle1, { opacity: decorAnim1 }]} />
      <Animated.View style={[styles.decorCircle2, { opacity: decorAnim2 }]} />
      <Animated.View style={[styles.decorCircle3, { opacity: decorAnim1 }]} />

      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.logoCircle}>
          <Image source={require('../../../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <Text style={styles.appName}>Educarelink</Text>
        <Text style={styles.tagline}>Trợ lý gia đình · Việc làm linh hoạt</Text>
      </Animated.View>

      {/* Loading dots */}
      <View style={styles.dotsContainer}>
        {[0, 1, 2].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: dotAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
                transform: [
                  {
                    scale: dotAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1.2],
                    }),
                  },
                  {
                    translateY: dotAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -6],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  gradientOverlay: {
    position: 'absolute',
    top: '-30%',
    left: '-20%',
    width: '140%',
    height: '80%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  gradientInner: {
    position: 'absolute',
    top: '-15%',
    left: '-10%',
    width: '120%',
    height: '60%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  decorCircle1: {
    position: 'absolute',
    top: 60,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: 140,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  decorCircle3: {
    position: 'absolute',
    bottom: 60,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
    // Soft glow shadow
    boxShadow: '0px 0px 20px rgba(255, 255, 255, 0.3)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    ...TYPO.h1,
    fontSize: 38,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 10,
    position: 'absolute',
    bottom: 70,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
});
