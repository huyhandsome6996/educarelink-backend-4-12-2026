// ============================================================
// RegisterScreen — Warm Professionalism
// Fix: removed KeyboardAvoidingView + Animated.View transforms
// to prevent keyboard bounce/flicker on Android
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, Platform, Alert, ActivityIndicator, Animated
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, TYPO } from '../../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ROLES = [
  {
    id: 'parent',
    label: 'Tôi là Phụ huynh',
    icon: 'people',
    description: 'Tìm kiếm người đồng hành uy tín cho con.',
    iconBg: COLORS.primaryLight,
    iconBgActive: COLORS.primary,
    iconColor: COLORS.primaryDeep,
    iconColorActive: '#ffffff',
    borderColorActive: COLORS.primary,
  },
  {
    id: 'worker',
    label: 'Tôi là CarePartner',
    icon: 'school',
    description: 'Hỗ trợ học tập và đồng hành cùng trẻ.',
    iconBg: COLORS.secondaryLight,
    iconBgActive: COLORS.secondary,
    iconColor: COLORS.secondaryDark,
    iconColorActive: '#ffffff',
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

  const [idCardFront, setIdCardFront] = useState(null);
  const [idCardBack, setIdCardBack] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [certificatePhoto, setCertificatePhoto] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>

        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <View style={styles.brandRow}>
            <Ionicons name="school" size={32} color={COLORS.primary} />
            <Text style={styles.brandName}>EduCareLink</Text>
          </View>
          <Text style={styles.title}>Bắt đầu hành trình</Text>
          <Text style={styles.subtitle}>Chọn vai trò của bạn để chúng tôi cá nhân hóa trải nghiệm.</Text>
        </Animated.View>

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

                <View style={styles.roleContent}>
                  <Text style={[styles.roleLabel, isSelected && { color: role.borderColorActive }]}>
                    {role.label}
                  </Text>
                  <Text style={styles.roleDesc}>{role.description}</Text>
                </View>

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

        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Họ và tên</Text>
            <View style={styles.nameRow}>
              <View style={[styles.inputWrapper, { flex: 1 }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Họ"
                  placeholderTextColor={COLORS.outline}
                  value={lastName}
                  onChangeText={setLastName}
                />
              </View>
              <View style={[styles.inputWrapper, { flex: 1.5 }]}>
                <TextInput
                  style={styles.input}
                  placeholder="Tên *"
                  placeholderTextColor={COLORS.outline}
                  value={firstName}
                  onChangeText={setFirstName}
                />
              </View>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Tên tài khoản</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Chọn tên tài khoản"
                placeholderTextColor={COLORS.outline}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                placeholderTextColor={COLORS.outline}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Số điện thoại</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call-outline" size={20} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="09xx xxx xxx"
                placeholderTextColor={COLORS.outline}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Mật khẩu (tối thiểu 6 ký tự)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={COLORS.outline}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.outlineVariant} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Xác nhận mật khẩu</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={COLORS.outline}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPass}
              />
            </View>
          </View>

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

          {selectedRole === 'worker' && (
            <View style={styles.infoBox}>
              <View style={styles.infoAccentBar} />
              <Ionicons name="information-circle" size={18} color={COLORS.primary} />
              <Text style={styles.infoText}>
                Tài khoản Carepartner cần được Admin xét duyệt trước khi đăng nhập. Quá trình duyệt thường mất 1-2 ngày làm việc.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.registerBtn, isLoading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.8}
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

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Đã có tài khoản?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Text style={styles.loginLink}> Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
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
    color: COLORS.primaryDeep,
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
  roleGroup: {
    gap: 16,
    marginBottom: 24,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
    borderRadius: 20,
    padding: 16,
    ...SHADOWS.small,
  },
  roleIconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
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
    backgroundColor: COLORS.surface,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
    gap: 20,
  },
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
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
  photoSection: {
    backgroundColor: COLORS.surfaceContainerLow,
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
