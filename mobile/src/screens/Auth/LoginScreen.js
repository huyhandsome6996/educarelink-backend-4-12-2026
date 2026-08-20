// ============================================================
// LoginScreen — Warm Professionalism
// Fix: removed KeyboardAvoidingView + Animated.View transforms
// on Android to prevent keyboard bounce/flicker
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, Platform, Alert, ActivityIndicator, Animated
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS, TYPO } from '../../theme/colors';
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

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showAlert('Lỗi', 'Vui lòng nhập tên tài khoản và mật khẩu.');
      return;
    }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
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

  const content = (
    <View style={[styles.scroll, { paddingTop: insets.top + 48 }]}>
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Chào mừng trở lại</Text>
        <Text style={styles.subtitle}>Đăng nhập để tiếp tục kết nối</Text>
      </Animated.View>

      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Số điện thoại / Tên tài khoản</Text>
          <View style={styles.inputWrapper}>
            <Ionicons
              name="phone-portrait-outline"
              size={20}
              color={COLORS.outlineVariant}
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
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <View style={styles.passwordLabelRow}>
            <Text style={styles.fieldLabel}>Mật khẩu</Text>
            <TouchableOpacity onPress={() => showComingSoon('Quên mật khẩu')}>
              <Text style={styles.forgotLink}>Quên mật khẩu?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputWrapper}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={COLORS.outlineVariant}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Nhập mật khẩu"
              placeholderTextColor={COLORS.outline}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
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

        <TouchableOpacity
          style={[styles.loginBtn, isLoading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.8}
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

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Hoặc tiếp tục với</Text>
        <View style={styles.dividerLine} />
      </View>

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

      <View style={styles.registerRow}>
        <Text style={styles.registerText}>Chưa có tài khoản?</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={styles.registerLink}> Đăng ký ngay</Text>
        </TouchableOpacity>
      </View>


    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {content}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceWarm,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: { alignItems: 'center', marginBottom: 32 },
  title: {
    ...TYPO.h1,
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
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
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: {
    ...TYPO.caption,
    color: COLORS.primary,
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
  loginBtn: {
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
  loginBtnText: {
    ...TYPO.h4,
    color: COLORS.textOnPrimary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.outlineVariant,
  },
  dividerText: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    backgroundColor: COLORS.surfaceWarm,
    paddingHorizontal: 8,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  socialBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 14,
    height: 48,
  },
  socialBtnText: {
    ...TYPO.body,
    color: COLORS.onSurface,
  },
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
    color: COLORS.primary,
  },
});
