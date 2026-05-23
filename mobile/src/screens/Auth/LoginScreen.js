import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập tên tài khoản và mật khẩu.');
      return;
    }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      // Navigator tự phân luồng theo role trong AuthContext
    } catch (error) {
      const msg = error.response?.data?.error || 'Sai tài khoản hoặc mật khẩu.';
      Alert.alert('Đăng nhập thất bại', msg);
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

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoMini}>
            <Text style={styles.logoMiniText}>🤝</Text>
          </View>
          <Text style={styles.title}>Chào mừng trở lại!</Text>
          <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Tên tài khoản"
              placeholderTextColor="#9ca3af"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mật khẩu"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
              <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Nút Đăng nhập */}
          <TouchableOpacity
            style={[styles.loginBtn, isLoading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
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

          {/* Chuyển đến Đăng ký */}
          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Chưa có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Đăng ký ngay</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tài khoản test */}
        <View style={styles.testAccountBox}>
          <Text style={styles.testAccountTitle}>🧪 Tài khoản thử nghiệm</Text>
          <Text style={styles.testAccountText}>Phụ huynh: phuhuynh_test / password123</Text>
          <Text style={styles.testAccountText}>Sinh viên: sinhvien_test / password123</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoMini: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  logoMiniText: { fontSize: 36 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  form: { gap: 16, marginBottom: 32 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#e5e7eb',
    paddingHorizontal: 16, height: 54,
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  eyeIcon: { padding: 4 },
  loginBtn: {
    backgroundColor: '#0051d5', borderRadius: 14, height: 54,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    shadowColor: '#0051d5', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  registerText: { color: '#6b7280', fontSize: 14 },
  registerLink: { color: '#0051d5', fontWeight: '700', fontSize: 14 },
  testAccountBox: {
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#fde68a',
  },
  testAccountTitle: { fontWeight: '700', color: '#92400e', marginBottom: 6, fontSize: 13 },
  testAccountText: { color: '#78350f', fontSize: 12, lineHeight: 20 },
});
