import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

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
    color: COLORS.secondary,
    bg: COLORS.secondaryLight,
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
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
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
    setIsLoading(true);
    try {
      await register(username.trim(), password, selectedRole, firstName, lastName);
    } catch (error) {
      const data = error.response?.data;
      const msg = typeof data === 'object'
        ? Object.values(data).flat().join('\n')
        : 'Đăng ký thất bại. Tên tài khoản có thể đã tồn tại.';
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
