// ============================================================
// LoginScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Background: surfaceWarm (#fff8f6) — nền ấm
// - Header: title màu primary-container (#F26522), bỏ logo box
// - Form bọc trong card trắng (radius 20, border surface-variant, shadow)
// - Field labels kiểu caption (Plus Jakarta Sans 700, on-surface-variant)
// - Input: icon trái + text, border #F0F0F0, focus ring primary-container
// - "Quên mật khẩu?" link → showComingSoon
// - Button: primary-container bg, text trắng, shadow cam, icon arrow_forward
// - Divider "Hoặc tiếp tục với" + 2 nút Google/Facebook (showComingSoon)
// - Link "Đăng ký ngay" màu primary-container
// Giữ nguyên: logic login qua AuthContext, alert lỗi 403 pending_approval
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function LoginScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Focus state tracking cho input wrapper
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48 }]} showsVerticalScrollIndicator={false}>

        {/* Header — centered, no logo box (theo design HTML) */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.title}>Chào mừng trở lại</Text>
          <Text style={styles.subtitle}>Đăng nhập để tiếp tục kết nối</Text>
        </Animated.View>

        {/* Form Card — bọc toàn bộ inputs + button trong card trắng */}
        <Animated.View
          style={[
            styles.card,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Username field — label + input với icon trái */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Số điện thoại / Tên tài khoản</Text>
            <View style={[styles.inputWrapper, usernameFocused && styles.inputWrapperFocused]}>
              <Ionicons
                name="phone-portrait-outline"
                size={20}
                color={usernameFocused ? COLORS.primary : COLORS.outlineVariant}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Nhập số điện thoại của bạn"
                placeholderTextColor={COLORS.outline}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setUsernameFocused(true)}
                onBlur={() => setUsernameFocused(false)}
              />
            </View>
          </View>

          {/* Password field — label + "Quên mật khẩu?" link */}
          <View style={styles.fieldGroup}>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.fieldLabel}>Mật khẩu</Text>
              <TouchableOpacity onPress={() => showComingSoon('Quên mật khẩu')}>
                <Text style={styles.forgotLink}>Quên mật khẩu?</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={passwordFocused ? COLORS.primary : COLORS.outlineVariant}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Nhập mật khẩu"
                placeholderTextColor={COLORS.outline}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPass(!showPass)}
                style={styles.eyeIcon}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name={showPass ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={COLORS.outlineVariant}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit button — primary-container bg, white text, arrow icon, orange shadow */}
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
        </Animated.View>

        {/* Divider "Hoặc tiếp tục với" */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Hoặc tiếp tục với</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social buttons — Google + Facebook (showComingSoon vì OAuth chưa bật) */}
        <View style={styles.socialRow}>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => showComingSoon('Đăng nhập bằng Google')}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-google" size={20} color="#4285F4" />
            <Text style={styles.socialBtnText}>Google</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={() => showComingSoon('Đăng nhập bằng Facebook')}
            activeOpacity={0.7}
          >
            <Ionicons name="logo-facebook" size={20} color="#1877F2" />
            <Text style={styles.socialBtnText}>Facebook</Text>
          </TouchableOpacity>
        </View>

        {/* Signup link */}
        <View style={styles.registerRow}>
          <Text style={styles.registerText}>Chưa có tài khoản?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={styles.registerLink}> Đăng ký ngay</Text>
          </TouchableOpacity>
        </View>

        {/* Tài khoản test — chỉ hiện trong môi trường development */}
        {__DEV__ && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.testAccountBox}>
              <View style={styles.testAccountIconRow}>
                <Ionicons name="flask-outline" size={16} color={COLORS.primary} />
                <Text style={styles.testAccountTitle}>Tài khoản thử nghiệm (DEV)</Text>
              </View>
              <Text style={styles.testAccountText}>Phụ huynh: phuhuynh_test / Demo@2026</Text>
              <Text style={styles.testAccountText}>Sinh viên: sinhvien_test / Demo@2026</Text>
            </View>
          </Animated.View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm }, // #fff8f6 — nền ấm
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20, // margin-mobile = 20px
    paddingBottom: 40,
  },
  // Header
  header: { alignItems: 'center', marginBottom: 32 }, // mb-xl
  title: {
    ...TYPO.h1,
    color: COLORS.primary, // primary-container #F26522
    textAlign: 'center',
    marginBottom: 8, // mb-sm
  },
  subtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant, // #594138
    textAlign: 'center',
  },
  // Card bọc form
  card: {
    backgroundColor: COLORS.surface, // surface-container-lowest #ffffff
    borderRadius: 20, // lg radius
    padding: 24, // p-lg
    marginBottom: 24, // mb-lg
    borderWidth: 1,
    borderColor: COLORS.outlineVariant, // surface-variant
    ...SHADOWS.small,
    gap: 20, // space-y-lg giữa các field
  },
  // Field group — label + input
  fieldGroup: {
    gap: 8, // mb-xs cho label
  },
  fieldLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant, // #594138
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: {
    ...TYPO.caption,
    color: COLORS.primary, // primary-container
  },
  // Input wrapper
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface, // surface-container-lowest
    borderWidth: 1,
    borderColor: COLORS.border, // #F0F0F0
    borderRadius: 14, // md radius
    paddingHorizontal: 12, // px-sm
    height: 48, // py-sm + input
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary, // primary-container
    borderWidth: 2,
    ...SHADOWS.inputFocus,
  },
  inputIcon: {
    marginRight: 12, // pl-sm + icon
  },
  input: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.onSurface, // #261813
    paddingVertical: 0, // tránh RN thêm padding mặc định
  },
  eyeIcon: {
    padding: 8,
  },
  // Submit button
  loginBtn: {
    backgroundColor: COLORS.primary, // primary-container
    borderRadius: 14, // md radius (theo DESIGN.md buttons dùng md=14px)
    height: 48, // min 44px touch target
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4, // gap-xs
    ...SHADOWS.large, // shadow cam
  },
  btnDisabled: { opacity: 0.7 },
  loginBtnText: {
    ...TYPO.h4,
    color: '#ffffff',
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24, // mb-lg
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.outlineVariant, // surface-variant
  },
  dividerText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    backgroundColor: COLORS.surfaceWarm,
    paddingHorizontal: 8,
  },
  // Social buttons
  socialRow: {
    flexDirection: 'row',
    gap: 16, // gap-md
    marginBottom: 32, // mb-xl
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.surface, // surface-container-lowest
    borderWidth: 1,
    borderColor: COLORS.outlineVariant, // surface-variant
    borderRadius: 14, // md radius
    height: 48, // min 44px touch target
  },
  socialBtnText: {
    ...TYPO.body,
    color: COLORS.onSurface,
  },
  // Register link
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  registerText: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
  },
  registerLink: {
    ...TYPO.h4,
    color: COLORS.primary, // primary-container
  },
  // DEV test account box
  testAccountBox: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: COLORS.primarySoft,
  },
  testAccountIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  testAccountTitle: {
    ...TYPO.h5,
    fontSize: 13,
    color: COLORS.primaryDark,
    marginBottom: 0,
  },
  testAccountText: {
    ...TYPO.bodySmall,
    color: COLORS.primary,
    lineHeight: 22,
  },
});
