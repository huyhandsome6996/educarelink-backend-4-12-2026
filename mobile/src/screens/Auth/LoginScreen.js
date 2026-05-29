import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      const msg = error.response?.data?.error || 'Sai tài khoản hoặc mật khẩu.';
      showAlert('Đăng nhập thất bại', msg);
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
        <View style={styles.header}>
          <View style={styles.logoMini}>
            <Image source={require('../../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.title}>Chào mừng trở lại!</Text>
          <Text style={styles.subtitle}>Đăng nhập để tiếp tục sử dụng Educarelink</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Username */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputIconBox}>
              <Ionicons name="person-outline" size={18} color={COLORS.primary} />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Tên tài khoản"
              placeholderTextColor={COLORS.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.inputWrapper}>
            <View style={styles.inputIconBox}>
              <Ionicons name="lock-closed-outline" size={18} color={COLORS.primary} />
            </View>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Mật khẩu"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
              <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Nút Đăng nhập */}
          <TouchableOpacity
            style={[styles.loginBtn, isLoading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
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
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 40 },
  logoMini: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    borderWidth: 3, borderColor: COLORS.primarySoft,
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500', textAlign: 'center' },
  form: { gap: 16, marginBottom: 32 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingRight: 16, height: 56,
    ...SHADOWS.small,
  },
  inputIconBox: {
    width: 48, height: 56, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: COLORS.border,
    marginRight: 12,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.textPrimary, fontWeight: '500' },
  eyeIcon: { padding: 4 },
  loginBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 56,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    ...SHADOWS.large,
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.7 },
  loginBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  registerText: { color: COLORS.textSecondary, fontSize: 14 },
  registerLink: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  testAccountBox: {
    backgroundColor: COLORS.warningBg, borderRadius: SIZES.radiusMd, padding: 16,
    borderWidth: 1, borderColor: '#fde68a',
  },
  testAccountTitle: { fontWeight: '700', color: '#92400e', marginBottom: 6, fontSize: 13 },
  testAccountText: { color: '#78350f', fontSize: 12, lineHeight: 20 },
});
