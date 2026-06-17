import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Animated
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getOAuthConfig, loginWithGoogle, loginWithFacebook } from '../../api/auth';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';
import * as ImagePicker from 'expo-image-picker';

// === OAuth providers (lazy import để tránh crash trên web/Expo Go chưa cài) ===
let Google = null;
let Facebook = null;
let WebBrowser = null;
if (Platform.OS !== 'web') {
  try { Google = require('expo-auth-session/providers/google'); } catch (e) {}
  try { Facebook = require('expo-facebook'); } catch (e) {}
  try { WebBrowser = require('expo-web-browser'); } catch (e) {}
}

// Logo Google & Facebook
const GoogleLogo = ({ size = 20 }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#4285F4', fontWeight: '900', fontSize: size * 0.55 }}>G</Text>
  </View>
);
const FacebookLogo = ({ size = 20 }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#1877F2', fontWeight: '900', fontSize: size * 0.6 }}>f</Text>
  </View>
);

const ROLES = [
  {
    id: 'parent',
    label: 'Phụ Huynh',
    icon: 'people',
    description: 'Đăng việc, tìm người chăm sóc cho bé',
    color: COLORS.primary,
    bg: COLORS.primaryLight,
  },
  {
    id: 'worker',
    label: 'Sinh Viên',
    icon: 'school',
    description: 'Tìm việc, kiếm thêm thu nhập',
    color: COLORS.primary,
    bg: COLORS.primaryLight,
  },
];

export default function RegisterScreen() {
  const navigation = useNavigation();
  const { register } = useAuth();

  const [selectedRole, setSelectedRole] = useState('parent');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // 'google' | 'facebook' | null

  // OAuth config (client IDs)
  const [oauthConfig, setOauthConfig] = useState(null);

  // Load OAuth config khi mount
  useEffect(() => {
    getOAuthConfig()
      .then((res) => setOauthConfig(res.data))
      .catch(() => {});
  }, []);

  // Ảnh cho Carepartner
  const [idCardFront, setIdCardFront] = useState(null);
  const [idCardBack, setIdCardBack] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [certificatePhoto, setCertificatePhoto] = useState(null);

  // Focus state tracking for input wrappers
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

  // Entrance & button animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  // Role card scale animations
  const roleScaleParent = useRef(new Animated.Value(1)).current;
  const roleScaleWorker = useRef(new Animated.Value(1)).current;

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

  const handleRolePressIn = (roleId) => {
    const scaleRef = roleId === 'parent' ? roleScaleParent : roleScaleWorker;
    Animated.spring(scaleRef, { toValue: 0.96, tension: 300, friction: 10, useNativeDriver: true }).start();
  };
  const handleRolePressOut = (roleId) => {
    const scaleRef = roleId === 'parent' ? roleScaleParent : roleScaleWorker;
    Animated.spring(scaleRef, { toValue: 1, tension: 300, friction: 10, useNativeDriver: true }).start();
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const pickImage = async (setter) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Cần quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để chọn ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setter(result.assets[0]);
    }
  };

  const takePhoto = async (setter) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Cần quyền truy cập', 'Vui lòng cấp quyền sử dụng camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setter(result.assets[0]);
    }
  };

  const handleRegister = async () => {
    if (!firstName || !username || !password || !confirmPassword) {
      showAlert('Lỗi', 'Vui lòng điền đầy đủ thông tin.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('Lỗi', 'Mật khẩu xác nhận không khớp.');
      return;
    }
    if (password.length < 6) {
      showAlert('Lỗi', 'Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    // Validate phụ huynh
    if (selectedRole === 'parent') {
      if (!email.trim()) {
        showAlert('Lỗi', 'Phụ huynh phải cung cấp email.');
        return;
      }
      if (!phone.trim()) {
        showAlert('Lỗi', 'Phụ huynh phải cung cấp số điện thoại.');
        return;
      }
    }

    // Validate carepartner
    if (selectedRole === 'worker') {
      if (!email.trim()) {
        showAlert('Lỗi', 'Carepartner phải cung cấp email để liên hệ.');
        return;
      }
      if (!phone.trim()) {
        showAlert('Lỗi', 'Carepartner phải cung cấp số điện thoại để liên hệ.');
        return;
      }
      if (!idCardFront) {
        showAlert('Lỗi', 'Vui lòng chụp/chọn ảnh mặt trước CCCD.');
        return;
      }
      if (!idCardBack) {
        showAlert('Lỗi', 'Vui lòng chụp/chọn ảnh mặt sau CCCD.');
        return;
      }
      if (!selfiePhoto) {
        showAlert('Lỗi', 'Vui lòng chụp/chọn ảnh chân dung của bạn.');
        return;
      }
    }

    setIsLoading(true);
    try {
      const result = await register(
        username.trim(), password, selectedRole, firstName, lastName,
        email.trim(), phone.trim(),
        idCardFront, idCardBack, selfiePhoto, certificatePhoto
      );
      
      if (result?.status === 'pending_approval') {
        showAlert(
          '✅ Đăng ký thành công!', 
          'Tài khoản của bạn đang chờ Admin xét duyệt. Bạn sẽ được thông báo khi tài khoản được kích hoạt.'
        );
        navigation.navigate('Login');
      }
    } catch (error) {
      const data = error.response?.data;
      let msg;
      if (typeof data === 'object') {
        msg = Object.values(data).flat().join('\n');
      } else {
        msg = 'Đăng ký thất bại. Tên tài khoản có thể đã tồn tại.';
      }
      showAlert('Đăng ký thất bại', msg);
    } finally {
      setIsLoading(false);
    }
  };

  const renderImagePicker = (label, image, setter, icon) => (
    <View style={styles.imagePicker}>
      <Text style={styles.imageLabel}>{label}</Text>
      {image ? (
        <TouchableOpacity onPress={() => pickImage(setter)} activeOpacity={0.8}>
          <Image source={{ uri: image.uri }} style={styles.imagePreview} />
          <View style={styles.imageOverlay}>
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.imageOverlayText}>Đổi ảnh</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.imageActions}>
          <TouchableOpacity style={styles.imageBtn} onPress={() => pickImage(setter)}>
            <Ionicons name="images-outline" size={20} color={COLORS.primary} />
            <Text style={styles.imageBtnText}>Thư viện</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageBtn} onPress={() => takePhoto(setter)}>
            <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
            <Text style={styles.imageBtnText}>Camera</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // === OAuth handlers (đăng ký nhanh: dùng OAuth → tạo account với role đã chọn) ===
  const handleGoogleRegister = async () => {
    if (!oauthConfig?.google?.enabled) {
      showAlert('Chưa kích hoạt', 'Đăng nhập Google chưa được kích hoạt.');
      return;
    }
    if (!Google) {
      showAlert('Chưa cài đặt', 'Cần cài expo-auth-session. Chạy: npm install expo-auth-session expo-web-browser');
      return;
    }
    setOauthLoading('google');
    try {
      const redirectUri = WebBrowser?.makeRedirectUri?.({ scheme: 'educarelink', path: 'auth' }) || 'https://auth.expo.io';
      const request = new Google.AuthRequest({
        clientId: oauthConfig.google.client_id,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
      });
      const result = await request.promptAsync();
      if (result.type !== 'success') {
        setOauthLoading(null);
        return;
      }
      const accessToken = result.authentication?.accessToken;
      if (!accessToken) {
        showAlert('Lỗi', 'Không lấy được access token từ Google.');
        setOauthLoading(null);
        return;
      }
      // Gửi access token cho backend → tạo account với role đã chọn
      const resp = await loginWithGoogle(accessToken, selectedRole);
      await finishOAuth(resp);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Đăng ký Google thất bại.';
      showAlert('Lỗi Google', msg);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleFacebookRegister = async () => {
    if (!oauthConfig?.facebook?.enabled) {
      showAlert('Chưa kích hoạt', 'Đăng nhập Facebook chưa được kích hoạt.');
      return;
    }
    if (!Facebook) {
      showAlert('Chưa cài đặt', 'Cần cài expo-facebook. Chạy: npm install expo-facebook');
      return;
    }
    setOauthLoading('facebook');
    try {
      await Facebook.initializeAsync({
        appId: oauthConfig.facebook.app_id,
        appName: 'Educarelink',
      });
      const result = await Facebook.logInWithReadPermissionsAsync({
        permissions: ['public_profile', 'email'],
      });
      if (result.type !== 'success') {
        setOauthLoading(null);
        return;
      }
      const accessToken = result.token;
      const resp = await loginWithFacebook(accessToken, selectedRole);
      await finishOAuth(resp);
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Đăng ký Facebook thất bại.';
      showAlert('Lỗi Facebook', msg);
    } finally {
      setOauthLoading(null);
    }
  };

  // Lưu token sau OAuth thành công → reload app
  const finishOAuth = async (resp) => {
    const { tokens, role, is_staff } = resp.data;
    const { storage } = require('../../utils/storage');
    await storage.setItem('access_token', tokens.access);
    await storage.setItem('refresh_token', tokens.refresh);
    await storage.setItem('user_role', role);
    if (is_staff) await storage.setItem('is_staff', 'true');
    showAlert('✅ Thành công', 'Đã đăng ký và đăng nhập bằng OAuth.');
    setTimeout(() => {
      if (Platform.OS === 'web') {
        window.location.reload();
      } else {
        try {
          const Updates = require('expo-updates').default;
          Updates.reloadAsync();
        } catch (e) {
          showAlert('Thông báo', 'Vui lòng khởi động lại app để hoàn tất.');
        }
      }
    }, 500);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back button */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Tạo tài khoản mới</Text>
          <Text style={styles.subtitle}>Chọn vai trò của bạn để bắt đầu</Text>
        </Animated.View>

        {/* Chọn vai trò */}
        <View style={styles.rolesRow}>
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.id;
            const scaleRef = role.id === 'parent' ? roleScaleParent : roleScaleWorker;
            return (
              <Animated.View key={role.id} style={{ flex: 1, transform: [{ scale: scaleRef }] }}>
                <TouchableOpacity
                  style={[
                    styles.roleCard,
                    isSelected && {
                      borderColor: role.color,
                      backgroundColor: role.bg,
                      ...SHADOWS.cardHover,
                    },
                  ]}
                  onPress={() => setSelectedRole(role.id)}
                  onPressIn={() => handleRolePressIn(role.id)}
                  onPressOut={() => handleRolePressOut(role.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.roleIconCircle, { backgroundColor: isSelected ? role.color : '#E5E7EB' }]}>
                    <Ionicons name={role.icon} size={22} color={isSelected ? '#fff' : '#9ca3af'} />
                  </View>
                  <Text style={[styles.roleLabel, isSelected && { color: role.color }]}>{role.label}</Text>
                  <Text style={styles.roleDesc}>{role.description}</Text>
                  {isSelected && (
                    <View style={[styles.checkMark, { backgroundColor: role.color }]}>
                      <Ionicons name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* Form fields */}
        <Animated.View style={[styles.form, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.nameRow}>
            <View style={[
              styles.inputWrapper, { flex: 1 },
              lastNameFocused && styles.inputWrapperFocused,
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Họ"
                placeholderTextColor={COLORS.textMuted}
                value={lastName}
                onChangeText={setLastName}
                onFocus={() => setLastNameFocused(true)}
                onBlur={() => setLastNameFocused(false)}
              />
            </View>
            <View style={[
              styles.inputWrapper, { flex: 1.5 },
              firstNameFocused && styles.inputWrapperFocused,
            ]}>
              <TextInput
                style={styles.input}
                placeholder="Tên *"
                placeholderTextColor={COLORS.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                onFocus={() => setFirstNameFocused(true)}
                onBlur={() => setFirstNameFocused(false)}
              />
            </View>
          </View>

          <View style={[styles.inputWrapper, usernameFocused && styles.inputWrapperFocused]}>
            <Ionicons name="person-outline" size={20} color={usernameFocused ? COLORS.primary : COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Tên tài khoản *"
              placeholderTextColor={COLORS.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
            />
          </View>

          {/* Email & Phone - Phụ huynh bắt buộc, Worker tuỳ chọn */}
          <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
            <Ionicons name="mail-outline" size={20} color={emailFocused ? COLORS.primary : COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={selectedRole === 'parent' ? 'Email *' : 'Email *'}
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
          </View>

          <View style={[styles.inputWrapper, phoneFocused && styles.inputWrapperFocused]}>
            <Ionicons name="call-outline" size={20} color={phoneFocused ? COLORS.primary : COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={selectedRole === 'parent' ? 'Số điện thoại *' : 'Số điện thoại *'}
              placeholderTextColor={COLORS.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
            />
          </View>

          <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
            <Ionicons name="lock-closed-outline" size={20} color={passwordFocused ? COLORS.primary : COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mật khẩu * (tối thiểu 6 ký tự)"
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

          <View style={[styles.inputWrapper, confirmPasswordFocused && styles.inputWrapperFocused]}>
            <Ionicons name="lock-closed-outline" size={20} color={confirmPasswordFocused ? COLORS.primary : COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Xác nhận mật khẩu *"
              placeholderTextColor={COLORS.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPass}
              onFocus={() => setConfirmPasswordFocused(true)}
              onBlur={() => setConfirmPasswordFocused(false)}
            />
          </View>

          {/* Section upload ảnh cho Carepartner */}
          {selectedRole === 'worker' && (
            <View style={styles.photoSection}>
              <View style={styles.photoSectionHeader}>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
                <Text style={styles.photoSectionTitle}>Xác minh danh tính</Text>
              </View>
              <Text style={styles.photoSectionDesc}>
                Vui lòng cung cấp ảnh CCCD và ảnh chân dung để Admin xét duyệt tài khoản.
              </Text>
              {renderImagePicker('📋 Mặt trước CCCD *', idCardFront, setIdCardFront, 'card-outline')}
              {renderImagePicker('📋 Mặt sau CCCD *', idCardBack, setIdCardBack, 'card-outline')}
              {renderImagePicker('📸 Ảnh chân dung *', selfiePhoto, setSelfiePhoto, 'person-circle-outline')}
              {renderImagePicker('🎓 Bằng cấp/Chứng chỉ (tuỳ chọn)', certificatePhoto, setCertificatePhoto, 'ribbon-outline')}
            </View>
          )}

          {/* Thông báo cho carepartner */}
          {selectedRole === 'worker' && (
            <View style={styles.infoBox}>
              <View style={styles.infoAccentBar} />
              <Ionicons name="information-circle" size={18} color={COLORS.primary} />
              <Text style={styles.infoText}>
                Tài khoản Carepartner cần được Admin xét duyệt trước khi đăng nhập. Quá trình duyệt thường mất 1-2 ngày làm việc.
              </Text>
            </View>
          )}

          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[styles.registerBtn, isLoading && styles.btnDisabled]}
              onPress={handleRegister}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.registerBtnText}>Tạo tài khoản</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Đã có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>

          {/* === OAuth buttons === */}
          <View style={styles.oauthSection}>
            <View style={styles.oauthDivider}>
              <View style={styles.oauthDividerLine} />
              <Text style={styles.oauthDividerText}>hoặc đăng ký nhanh với</Text>
              <View style={styles.oauthDividerLine} />
            </View>
            <TouchableOpacity
              style={[styles.oauthBtn, styles.oauthBtnGoogle, oauthLoading === 'google' && { opacity: 0.7 }]}
              onPress={handleGoogleRegister}
              disabled={!!oauthLoading}
              activeOpacity={0.85}
            >
              {oauthLoading === 'google' ? (
                <ActivityIndicator color={COLORS.textPrimary} size="small" />
              ) : (
                <>
                  <GoogleLogo size={22} />
                  <Text style={styles.oauthBtnTextDark}>Google</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.oauthBtn, styles.oauthBtnFacebook, oauthLoading === 'facebook' && { opacity: 0.7 }]}
              onPress={handleFacebookRegister}
              disabled={!!oauthLoading}
              activeOpacity={0.85}
            >
              {oauthLoading === 'facebook' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FacebookLogo size={22} />
                  <Text style={styles.oauthBtnTextLight}>Facebook</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 56, paddingBottom: 44 },
  backBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.surface,
    justifyContent: 'center', alignItems: 'center', marginBottom: 28,
    ...SHADOWS.small,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 12,
  },
  title: { ...TYPO.h1, fontSize: 28, color: COLORS.textPrimary, marginBottom: 8 },
  subtitle: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 28 },
  rolesRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  roleCard: {
    flex: 1, borderRadius: SIZES.radiusLg, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, padding: 18, alignItems: 'center', gap: 10, position: 'relative',
    ...SHADOWS.small,
  },
  roleIconCircle: {
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
  },
  roleLabel: { ...TYPO.h5, color: COLORS.textSecondary },
  roleDesc: { ...TYPO.caption, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },
  checkMark: {
    position: 'absolute', top: 10, right: 10, width: 24, height: 24,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  form: { gap: 16 },
  nameRow: { flexDirection: 'row', gap: 12 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 16, height: 56,
    ...SHADOWS.small,
  },
  inputWrapperFocused: {
    ...FRAGMENTS.inputFocus,
    ...SHADOWS.inputFocus,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, ...TYPO.body, color: COLORS.textPrimary },
  eyeIcon: { padding: 8 },
  // Photo upload section
  photoSection: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: 18, gap: 14, borderWidth: 1.5, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoSectionTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  photoSectionDesc: { ...TYPO.bodySmall, color: COLORS.textMuted, lineHeight: 20 },
  imagePicker: { gap: 8 },
  imageLabel: { ...TYPO.h5, fontSize: 13, color: COLORS.textSecondary },
  imageActions: { flexDirection: 'row', gap: 12 },
  imageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, paddingVertical: 14,
    borderWidth: 1.5, borderColor: COLORS.primarySoft, borderStyle: 'dashed',
  },
  imageBtnText: { ...TYPO.buttonSmall, color: COLORS.primary },
  imagePreview: {
    width: '100%', height: 140, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.background,
  },
  imageOverlay: {
    position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  imageOverlayText: { ...TYPO.caption, color: '#fff' },
  // Info box with left accent border
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 16,
    borderWidth: 1, borderColor: COLORS.primarySoft,
    overflow: 'hidden',
  },
  infoAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  infoText: { flex: 1, ...TYPO.bodySmall, color: COLORS.primary, lineHeight: 20, marginLeft: 4 },
  // Buttons
  registerBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusLg, height: 58,
    justifyContent: 'center', alignItems: 'center', marginTop: 6,
    ...SHADOWS.large,
  },
  btnDisabled: { opacity: 0.7 },
  registerBtnText: { ...TYPO.button, fontSize: 17, color: '#fff' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  loginText: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  loginLink: { ...TYPO.buttonSmall, color: COLORS.primary },
  // === OAUTH ===
  oauthSection: { marginTop: 24, gap: 12 },
  oauthDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4,
  },
  oauthDividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  oauthDividerText: { ...TYPO.bodySmall, color: COLORS.textMuted, fontWeight: '600' },
  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 50, borderRadius: SIZES.radiusLg,
    ...SHADOWS.small,
  },
  oauthBtnGoogle: {
    backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  oauthBtnFacebook: {
    backgroundColor: '#1877F2',
  },
  oauthBtnTextDark: { ...TYPO.button, color: COLORS.textPrimary, fontSize: 15 },
  oauthBtnTextLight: { ...TYPO.button, color: '#fff', fontSize: 15 },
});
