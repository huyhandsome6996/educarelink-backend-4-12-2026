import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Animated
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Focus state tracking for input wrappers
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(btnScale, { toValue: 0.97, tension: 300, friction: 10, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(btnScale, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }).start();
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showAlert('Lỗi', 'Vui lòng nhập tên tài khoản và mật khẩu.');
      return;
    }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      // Navigator tự phân luồng theo role trong AuthContext
    } catch (error) {
      // Xử lý đặc biệt: Carepartner chưa được admin duyệt (403 Forbidden)
      const status = error.response?.status;
      const data = error.response?.data;
      if (status === 403 && data?.status === 'pending_approval') {
        showAlert(
          'Tài khoản đang chờ duyệt',
          'Tài khoản Carepartner của bạn đang chờ Admin xét duyệt. Vui lòng đợi thông báo qua email hoặc thử lại sau.'
        );
      } else {
        const msg = data?.error || 'Sai tài khoản hoặc mật khẩu.';
        showAlert('Đăng nhập thất bại', msg);
      }
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.logoMini}>
            <Image source={require('../../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.title}>Chào mừng trở lại!</Text>
          <Text style={styles.subtitle}>Đăng nhập để tiếp tục sử dụng Educarelink</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View style={[styles.form, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Username */}
          <View style={[
            styles.inputWrapper,
            usernameFocused && styles.inputWrapperFocused,
          ]}>
            <View style={[styles.inputIconBox, usernameFocused && styles.inputIconBoxFocused]}>
              <Ionicons name="person-outline" size={18} color={usernameFocused ? COLORS.primary : COLORS.textMuted} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Tên tài khoản"
              placeholderTextColor={COLORS.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
            />
          </View>

          {/* Password */}
          <View style={[
            styles.inputWrapper,
            passwordFocused && styles.inputWrapperFocused,
          ]}>
            <View style={[styles.inputIconBox, passwordFocused && styles.inputIconBoxFocused]}>
              <Ionicons name="lock-closed-outline" size={18} color={passwordFocused ? COLORS.primary : COLORS.textMuted} />
            </View>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mật khẩu"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
              <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Nút Đăng nhập */}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[styles.loginBtn, isLoading && styles.btnDisabled]}
              onPress={handleLogin}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.loginBtnText}>Đăng nhập</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Chuyển đến Đăng ký */}
          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Chưa có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Đăng ký ngay</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Tài khoản test */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.testAccountBox}>
            <View style={styles.testAccountIconRow}>
              <Ionicons name="flask-outline" size={16} color={COLORS.primary} />
              <Text style={styles.testAccountTitle}>Tài khoản thử nghiệm</Text>
            </View>
            <Text style={styles.testAccountText}>Phụ huynh: phuhuynh_test / password123</Text>
            <Text style={styles.testAccountText}>Sinh viên: sinhvien_test / password123</Text>
          </View>
        </Animated.View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 44 },
  header: { alignItems: 'center', marginBottom: 44 },
  logoMini: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    borderWidth: 3, borderColor: COLORS.primarySoft,
    overflow: 'hidden',
    ...SHADOWS.medium,
  },
  logoImage: { width: '100%', height: '100%' },
  title: { ...TYPO.h1, fontSize: 28, color: COLORS.textPrimary, marginBottom: 10 },
  subtitle: { ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },
  form: { gap: 18, marginBottom: 36 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingRight: 16, height: 58,
    ...SHADOWS.small,
  },
  inputWrapperFocused: {
    ...FRAGMENTS.inputFocus,
    ...SHADOWS.inputFocus,
  },
  inputIconBox: {
    width: 50, height: 42, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: SIZES.radiusSm,
    marginLeft: 8, marginRight: 12,
  },
  inputIconBoxFocused: {
    backgroundColor: COLORS.primaryLight,
  },
  input: { flex: 1, ...TYPO.body, color: COLORS.textPrimary },
  eyeIcon: { padding: 8 },
  loginBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusLg, height: 58,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    ...SHADOWS.large,
    marginTop: 6,
  },
  btnDisabled: { opacity: 0.7 },
  loginBtnText: { ...TYPO.button, fontSize: 17, color: '#fff' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  registerText: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  registerLink: { ...TYPO.buttonSmall, color: COLORS.primary },
  testAccountBox: {
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusLg, padding: 18,
    borderWidth: 1.5, borderColor: COLORS.primarySoft,
  },
  testAccountIconRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  testAccountTitle: { ...TYPO.h5, fontSize: 13, color: COLORS.primaryDark, marginBottom: 0 },
  testAccountText: { ...TYPO.bodySmall, color: COLORS.primary, lineHeight: 22 },
});
