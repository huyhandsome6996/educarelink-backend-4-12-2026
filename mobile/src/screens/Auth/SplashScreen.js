import React, { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';

export default function SplashScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();

  useEffect(() => {
    // Tự động chuyển sang Login sau 2 giây nếu chưa đăng nhập
    if (!user) {
      const timer = setTimeout(() => navigation.replace('Login'), 2000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0051d5" />
      {/* Logo & Tên ứng dụng */}
      <View style={styles.logoContainer}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🤝</Text>
        </View>
        <Text style={styles.appName}>Educarelink</Text>
        <Text style={styles.tagline}>Trợ lý gia đình · Việc làm linh hoạt</Text>
      </View>

      {/* Dấu chấm loading */}
      <View style={styles.dotsContainer}>
        <View style={[styles.dot, { opacity: 1 }]} />
        <View style={[styles.dot, { opacity: 0.6 }]} />
        <View style={[styles.dot, { opacity: 0.3 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0051d5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoEmoji: {
    fontSize: 48,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
});
