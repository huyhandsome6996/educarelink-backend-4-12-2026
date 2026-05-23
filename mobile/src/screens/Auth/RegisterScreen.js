import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const ROLES = [
  {
    id: 'parent',
    label: 'Phụ Huynh',
    icon: 'people',
    description: 'Đăng việc, tìm người chăm sóc cho bé',
    color: '#0051d5',
    bg: '#eff6ff',
  },
  {
    id: 'worker',
    label: 'Sinh Viên',
    icon: 'school',
    description: 'Tìm việc, kiếm thêm thu nhập',
    color: '#0d9488',
    bg: '#f0fdfa',
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

  const handleRegister = async () => {
    if (!firstName || !username || !password || !confirmPassword) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ thông tin.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Lỗi', 'Mật khẩu phải có ít nhất 6 ký tự.');
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
      Alert.alert('Đăng ký thất bại', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back button */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
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
              >
                <Ionicons name={role.icon} size={28} color={isSelected ? role.color : '#9ca3af'} />
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
                placeholderTextColor="#9ca3af"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
            <View style={[styles.inputWrapper, { flex: 1.5 }]}>
              <TextInput
                style={styles.input}
                placeholder="Tên *"
                placeholderTextColor="#9ca3af"
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Tên tài khoản *"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mật khẩu * (tối thiểu 6 ký tự)"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)}>
              <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Xác nhận mật khẩu *"
              placeholderTextColor="#9ca3af"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPass}
            />
          </View>

          <TouchableOpacity
            style={[styles.registerBtn, isLoading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#6b7280', marginBottom: 24 },
  rolesRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleCard: {
    flex: 1, borderRadius: 16, borderWidth: 2, borderColor: '#e5e7eb',
    backgroundColor: '#fff', padding: 16, alignItems: 'center', gap: 6, position: 'relative',
  },
  roleLabel: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  roleDesc: { fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 16 },
  checkMark: {
    position: 'absolute', top: 8, right: 8, width: 20, height: 20,
    borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  form: { gap: 14 },
  nameRow: { flexDirection: 'row', gap: 12 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e5e7eb',
    paddingHorizontal: 16, height: 54,
    elevation: 1,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  registerBtn: {
    backgroundColor: '#0051d5', borderRadius: 14, height: 54,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
    shadowColor: '#0051d5', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  registerBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginText: { color: '#6b7280', fontSize: 14 },
  loginLink: { color: '#0051d5', fontWeight: '700', fontSize: 14 },
});
