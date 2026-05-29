import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import * as ImagePicker from 'expo-image-picker';

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

  // Ảnh cho Carepartner
  const [idCardFront, setIdCardFront] = useState(null);
  const [idCardBack, setIdCardBack] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [certificatePhoto, setCertificatePhoto] = useState(null);

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

        <Text style={styles.title}>Tạo tài khoản mới</Text>
        <Text style={styles.subtitle}>Chọn vai trò của bạn để bắt đầu</Text>

        {/* Chọn vai trò */}
        <View style={styles.rolesRow}>
          {ROLES.map((role) => {
            const isSelected = selectedRole === role.id;
            return (
              <TouchableOpacity
                key={role.id}
                style={[styles.roleCard, isSelected && { borderColor: role.color, backgroundColor: role.bg }]}
                onPress={() => setSelectedRole(role.id)}
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
            );
          })}
        </View>

        {/* Form fields */}
        <View style={styles.form}>
          <View style={styles.nameRow}>
            <View style={[styles.inputWrapper, { flex: 1 }]}>
              <TextInput
                style={styles.input}
                placeholder="Họ"
                placeholderTextColor={COLORS.textMuted}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
            <View style={[styles.inputWrapper, { flex: 1.5 }]}>
              <TextInput
                style={styles.input}
                placeholder="Tên *"
                placeholderTextColor={COLORS.textMuted}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Tên tài khoản *"
              placeholderTextColor={COLORS.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Email & Phone - Phụ huynh bắt buộc, Worker tuỳ chọn */}
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={selectedRole === 'parent' ? 'Email *' : 'Email (tuỳ chọn)'}
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={selectedRole === 'parent' ? 'Số điện thoại *' : 'Số điện thoại (tuỳ chọn)'}
              placeholderTextColor={COLORS.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mật khẩu * (tối thiểu 6 ký tự)"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Xác nhận mật khẩu *"
              placeholderTextColor={COLORS.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPass}
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
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerBtnText}>Tạo tài khoản</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Đã có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface,
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    ...SHADOWS.small,
  },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 24 },
  rolesRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleCard: {
    flex: 1, borderRadius: SIZES.radiusMd, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, padding: 16, alignItems: 'center', gap: 8, position: 'relative',
    ...SHADOWS.small,
  },
  roleIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  roleLabel: { fontSize: 14, fontWeight: '800', color: COLORS.textSecondary },
  roleDesc: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 16 },
  checkMark: {
    position: 'absolute', top: 8, right: 8, width: 22, height: 22,
    borderRadius: 11, justifyContent: 'center', alignItems: 'center',
  },
  form: { gap: 14 },
  nameRow: { flexDirection: 'row', gap: 12 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: 16, height: 54,
    ...SHADOWS.small,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  // Photo upload section
  photoSection: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 16, gap: 12, borderWidth: 1.5, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoSectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  photoSectionDesc: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  imagePicker: { gap: 8 },
  imageLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  imageActions: { flexDirection: 'row', gap: 12 },
  imageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.background, borderRadius: 12, paddingVertical: 14,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
  },
  imageBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  imagePreview: {
    width: '100%', height: 140, borderRadius: 12, backgroundColor: COLORS.background,
  },
  imageOverlay: {
    position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  imageOverlayText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  // Info box
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.primary, lineHeight: 18 },
  // Buttons
  registerBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 56,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
    ...SHADOWS.large,
  },
  btnDisabled: { opacity: 0.7 },
  registerBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginText: { color: COLORS.textSecondary, fontSize: 14 },
  loginLink: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
});
