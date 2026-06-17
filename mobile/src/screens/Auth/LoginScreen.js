import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Animated, View as RNView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-facebook';
import { useAuth } from '../../context/AuthContext';
import { getOAuthConfig } from '../../api/auth';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login, loginWithOAuth, user } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // 'google' | 'facebook'
  const [oauthConfig, setOauthConfig] = useState(null);

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

  // Lấy OAuth config từ backend (Client IDs)
  useEffect(() => {
    getOAuthConfig()
      .then(res => setOauthConfig(res.data))
      .catch(() => {});
  }, []);

  // Google auth request
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    clientId: oauthConfig?.google_client_id,
    redirectUri: 'https://auth.expo.io/@educarelink/educarelink',
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      handleGoogleLogin(googleResponse.authentication.accessToken);
    }
  }, [googleResponse]);

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

  const handleGoogleLogin = async (accessToken) => {
    setOauthLoading('google');
    try {
      await loginWithOAuth('google', accessToken);
      // Navigator tự chuyển
    } catch (e) {
      const msg = e.response?.data?.error || 'Đăng nhập Google thất bại.';
      showAlert('Lỗi', msg);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleGooglePress = async () => {
    if (!oauthConfig?.google_client_id) {
      showAlert('Chưa sẵn sàng', 'Đăng nhập Google chưa được cấu hình. Vui lòng dùng tài khoản/mật khẩu.');
      return;
    }
    await googlePromptAsync();
  };

  const handleFacebookLogin = async () => {
    if (!oauthConfig?.facebook_app_id) {
      showAlert('Chưa sẵn sàng', 'Đăng nhập Facebook chưa được cấu hình.');
      return;
    }
    setOauthLoading('facebook');
    try {
      await Facebook.initializeAsync({ appId: oauthConfig.facebook_app_id });
      const result = await Facebook.logInWithReadPermissionsAsync({
        permissions: ['public_profile', 'email'],
      });
      if (result.type === 'success' && result.token) {
        await loginWithOAuth('facebook', result.token);
      }
    } catch (e) {
      const msg = e.message || 'Đăng nhập Facebook thất bại.';
      showAlert('Lỗi', msg);
    } finally {
      setOauthLoading(null);
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
          <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
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

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>hoặc</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* OAuth buttons */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGooglePress}
            disabled={oauthLoading !== null}
            activeOpacity={0.85}
          >
            {oauthLoading === 'google' ? (
              <ActivityIndicator size="small" color={COLORS.textPrimary} />
            ) : (
              <>
                <View style={styles.googleLogo}>
                  <Text style={styles.googleLogoText}>G</Text>
                </View>
                <Text style={styles.oauthBtnText}>Đăng nhập với Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.facebookBtn}
            onPress={handleFacebookLogin}
            disabled={oauthLoading !== null}
            activeOpacity={0.85}
          >
            {oauthLoading === 'facebook' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-facebook" size={20} color="#fff" />
                <Text style={[styles.oauthBtnText, { color: '#fff' }]}>Đăng nhập với Facebook</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Chuyển đến Đăng ký */}
          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Chưa có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Đăng ký ngay</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Tài khoản test — chỉ hiện trong môi trường development */}
        {__DEV__ && (
          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={styles.testAccountBox}>
              <View style={styles.testAccountIconRow}>
                <Ionicons name="flask-outline" size={16} color={COLORS.primary} />
                <Text style={styles.testAccountTitle}>Tài khoản thử nghiệm (DEV)</Text>
              </View>
              <Text style={styles.testAccountText}>Phụ huynh: phuhuynh_test / password123</Text>
              <Text style={styles.testAccountText}>Sinh viên: sinhvien_test / password123</Text>
            </View>
          </Animated.View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 44 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 12,
  },
  title: { ...TYPO.h1, fontSize: 28, color: COLORS.textPrimary, marginBottom: 10 },
  subtitle: { ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },
  form: { gap: 14, marginBottom: 24 },
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
  dividerRow: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { ...TYPO.caption, color: COLORS.textMuted, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg, height: 54,
    borderWidth: 1.5, borderColor: COLORS.border,
    ...SHADOWS.small,
    marginBottom: 10,
  },
  googleLogo: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#4285F4',
    justifyContent: 'center', alignItems: 'center',
  },
  googleLogoText: {
    color: '#4285F4', fontWeight: '900', fontSize: 16,
  },
  facebookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#1877F2', borderRadius: SIZES.radiusLg, height: 54,
    ...SHADOWS.small,
  },
  oauthBtnText: { ...TYPO.body, color: COLORS.textPrimary, fontWeight: '600' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
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
