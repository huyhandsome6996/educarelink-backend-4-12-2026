// ============================================================
// RegisterScreen — Redesign theo Warm Professionalism (Stitch AI)
// Thay đổi:
// - Background: surfaceWarm (#fff8f6) với subtle glow
// - Header: brand row (school icon + 'EduCareLink') + title 'Bắt đầu
//   hành trình' + subtitle 'Chọn vai trò của bạn để chúng tôi cá nhân
//   hóa trải nghiệm'
// - Role cards: stacked vertically (full-width), icon container 56px,
//   title + description + radio indicator (theo design HTML)
//   * Parent card: primary-fixed bg icon, primary-container border khi active
//   * CarePartner card: secondary-fixed bg icon, secondary border khi active
// - Form: bọc trong card trắng, field labels kiểu caption trên input
// - Input wrapper: border #F0F0F0, focus ring 2px primary-container
// - Button 'Tạo tài khoản': primary-container bg, shadow cam
// - Photo section (CarePartner): card trắng với primary tint header
// Giữ nguyên: logic register (validation, image upload, pending_approval)
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROLES = [
  {
    id: 'parent',
    label: 'Tôi là Phụ huynh',
    icon: 'people',
    description: 'Tìm kiếm người đồng hành uy tín cho con.',
    // Parent dùng primary palette (cam)
    iconBg: COLORS.primaryLight,       // primary-fixed
    iconBgActive: COLORS.primary,      // primary-container
    iconColor: COLORS.primaryDeep,     // on-primary-fixed
    iconColorActive: '#ffffff',        // on-primary
    borderColorActive: COLORS.primary, // primary-container
  },
  {
    id: 'worker',
    label: 'Tôi là CarePartner',
    icon: 'school',
    description: 'Hỗ trợ học tập và đồng hành cùng trẻ.',
    // Worker dùng secondary palette (xanh) — theo DESIGN.md
    iconBg: COLORS.secondaryLight,     // secondary-fixed
    iconBgActive: COLORS.secondary,    // secondary
    iconColor: COLORS.secondaryDark,   // on-secondary-fixed
    iconColorActive: '#ffffff',        // on-secondary
    borderColorActive: COLORS.secondary,
  },
];

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

const renderImagePicker = (label, image, setter) => (
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

export default function RegisterScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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

  // Ảnh cho Carepartner
  const [idCardFront, setIdCardFront] = useState(null);
  const [idCardBack, setIdCardBack] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [certificatePhoto, setCertificatePhoto] = useState(null);

  // Focus state tracking
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

  // Animations
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
          'Đăng ký thành công!',
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32 }]} showsVerticalScrollIndicator={false}>

        {/* Back button */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>

        {/* Header — brand row + title + subtitle */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.brandRow}>
            <Ionicons name="school" size={32} color={COLORS.primary} />
            <Text style={styles.brandName}>EduCareLink</Text>
          </View>
          <Text style={styles.title}>Bắt đầu hành trình</Text>
          <Text style={styles.subtitle}>Chọn vai trò của bạn để chúng tôi cá nhân hóa trải nghiệm.</Text>
        </Animated.View>

        {/* Role selection — stacked vertically (theo design HTML) */}
        <View style={styles.roleGroup}>
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.id;
            return (
              <TouchableOpacity
                key={role.id}
                style={[
                  styles.roleCard,
                  isSelected && {
                    borderColor: role.borderColorActive,
                    backgroundColor: role.id === 'parent' ? COLORS.primaryLight : COLORS.secondaryLight,
                    ...SHADOWS.cardHover,
                  },
                ]}
                onPress={() => setSelectedRole(role.id)}
                activeOpacity={0.85}
              >
                {/* Icon container */}
                <View
                  style={[
                    styles.roleIconBox,
                    {
                      backgroundColor: isSelected ? role.iconBgActive : role.iconBg,
                    },
                  ]}
                >
                  <Ionicons
                    name={role.icon}
                    size={28}
                    color={isSelected ? role.iconColorActive : role.iconColor}
                  />
                </View>

                {/* Content */}
                <View style={styles.roleContent}>
                  <Text style={[styles.roleLabel, isSelected && { color: role.borderColorActive }]}>
                    {role.label}
                  </Text>
                  <Text style={styles.roleDesc}>{role.description}</Text>
                </View>

                {/* Radio indicator */}
                <View
                  style={[
                    styles.radioOuter,
                    isSelected && {
                      borderColor: role.borderColorActive,
                      backgroundColor: role.borderColorActive,
                    },
                  ]}
                >
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Form Card — bọc toàn bộ inputs trong card trắng */}
        <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Name row — Họ + Tên */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Họ và tên</Text>
            <View style={styles.nameRow}>
              <View style={[styles.inputWrapper, { flex: 1 }, lastNameFocused && styles.inputWrapperFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="Họ"
                  placeholderTextColor={COLORS.outline}
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={() => setLastNameFocused(true)}
                  onBlur={() => setLastNameFocused(false)}
                />
              </View>
              <View style={[styles.inputWrapper, { flex: 1.5 }, firstNameFocused && styles.inputWrapperFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="Tên *"
                  placeholderTextColor={COLORS.outline}
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={() => setFirstNameFocused(true)}
                  onBlur={() => setFirstNameFocused(false)}
                />
              </View>
            </View>
          </View>

          {/* Username */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Tên tài khoản</Text>
            <View style={[styles.inputWrapper, usernameFocused && styles.inputWrapperFocused]}>
              <Ionicons name="person-outline" size={20} color={usernameFocused ? COLORS.primary : COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Chọn tên tài khoản"
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

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
              <Ionicons name="mail-outline" size={20} color={emailFocused ? COLORS.primary : COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                placeholderTextColor={COLORS.outline}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Số điện thoại</Text>
            <View style={[styles.inputWrapper, phoneFocused && styles.inputWrapperFocused]}>
              <Ionicons name="call-outline" size={20} color={phoneFocused ? COLORS.primary : COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="09xx xxx xxx"
                placeholderTextColor={COLORS.outline}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Mật khẩu (tối thiểu 6 ký tự)</Text>
            <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
              <Ionicons name="lock-closed-outline" size={20} color={passwordFocused ? COLORS.primary : COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={COLORS.outline}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.outlineVariant} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Xác nhận mật khẩu</Text>
            <View style={[styles.inputWrapper, confirmPasswordFocused && styles.inputWrapperFocused]}>
              <Ionicons name="lock-closed-outline" size={20} color={confirmPasswordFocused ? COLORS.primary : COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={COLORS.outline}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPass}
                onFocus={() => setConfirmPasswordFocused(true)}
                onBlur={() => setConfirmPasswordFocused(false)}
              />
            </View>
          </View>

          {/* Photo upload section — chỉ hiện khi chọn CarePartner */}
          {selectedRole === 'worker' && (
            <View style={styles.photoSection}>
              <View style={styles.photoSectionHeader}>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
                <Text style={styles.photoSectionTitle}>Xác minh danh tính</Text>
              </View>
              <Text style={styles.photoSectionDesc}>
                Vui lòng cung cấp ảnh CCCD và ảnh chân dung để Admin xét duyệt tài khoản.
              </Text>
              {renderImagePicker('Mặt trước CCCD *', idCardFront, setIdCardFront)}
              {renderImagePicker('Mặt sau CCCD *', idCardBack, setIdCardBack)}
              {renderImagePicker('Ảnh chân dung *', selfiePhoto, setSelfiePhoto)}
              {renderImagePicker('Bằng cấp/Chứng chỉ (tuỳ chọn)', certificatePhoto, setCertificatePhoto)}
            </View>
          )}

          {/* Info box cho carepartner */}
          {selectedRole === 'worker' && (
            <View style={styles.infoBox}>
              <View style={styles.infoAccentBar} />
              <Ionicons name="information-circle" size={18} color={COLORS.primary} />
              <Text style={styles.infoText}>
                Tài khoản Carepartner cần được Admin xét duyệt trước khi đăng nhập. Quá trình duyệt thường mất 1-2 ngày làm việc.
              </Text>
            </View>
          )}

          {/* Submit button */}
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
                <>
                  <Text style={styles.registerBtnText}>Tạo tài khoản</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Đã có tài khoản?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.loginLink}> Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20, // margin-mobile
    paddingBottom: 44,
  },
  // Back button
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...SHADOWS.small,
  },
  // Header
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  brandName: {
    ...TYPO.h2,
    color: COLORS.primaryDeep, // primary trong DESIGN.md (cam đất đậm)
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  title: {
    ...TYPO.h1,
    color: COLORS.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
  },
  // Role selection group
  roleGroup: {
    gap: 16,
    marginBottom: 24,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.surface, // surface-container-lowest
    borderWidth: 2,
    borderColor: COLORS.outlineVariant, // outline-variant
    borderRadius: 20, // lg radius
    padding: 16, // p-md
    ...SHADOWS.small,
  },
  roleIconBox: {
    width: 56,
    height: 56,
    borderRadius: 14, // xl radius
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleContent: {
    flex: 1,
    gap: 4,
  },
  roleLabel: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  roleDesc: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.surface, // surface-container-lowest
  },
  // Form card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
    gap: 20,
  },
  // Field group
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // Input wrapper — cùng style với Login
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border, // #F0F0F0
    borderRadius: 14, // md radius
    paddingHorizontal: 12,
    height: 48,
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    ...SHADOWS.inputFocus,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.onSurface,
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 8,
  },
  // Photo upload section
  photoSection: {
    backgroundColor: COLORS.surfaceContainerLow, // surface-container-low (ấm hơn)
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  photoSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoSectionTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  photoSectionDesc: {
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    lineHeight: 20,
  },
  imagePicker: { gap: 8 },
  imageLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  imageActions: { flexDirection: 'row', gap: 12 },
  imageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: COLORS.primarySoft,
    borderStyle: 'dashed',
  },
  imageBtnText: {
    ...TYPO.buttonSmall,
    color: COLORS.primary,
  },
  imagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 14,
    backgroundColor: COLORS.background,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  imageOverlayText: {
    ...TYPO.caption,
    color: COLORS.textOnPrimary,
  },
  // Info box
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    overflow: 'hidden',
  },
  infoAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  infoText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.primaryDeep,
    lineHeight: 20,
    marginLeft: 4,
  },
  // Submit button
  registerBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    ...SHADOWS.large,
  },
  btnDisabled: { opacity: 0.7 },
  registerBtnText: {
    ...TYPO.h4,
    color: COLORS.textOnPrimary,
  },
  // Login link
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
  },
  loginLink: {
    ...TYPO.h4,
    color: COLORS.primary,
  },
});
