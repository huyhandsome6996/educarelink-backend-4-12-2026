// ====================================================================
// VerificationPinSetupModal — Modal cho CarePartner đặt/đổi mã PIN
// ====================================================================
// - PIN 4-6 số, hash trên backend (make_password)
// - Để đổi PIN, phải nhập lại mật khẩu tài khoản (bảo mật)
// - Phải đặt PIN trước khi được nhận task (check ở WorkerFeedScreen)
// ====================================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setVerificationPin } from '../api/tracking';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

export default function VerificationPinSetupModal({ visible, onClose, onSuccess, isChange = false }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setPin('');
    setConfirmPin('');
    setCurrentPassword('');
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const handleSubmit = async () => {
    // Validate client-side
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('Lỗi', 'Mã cá nhân phải là 4-6 chữ số.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('Lỗi', 'Mã xác nhận không khớp.');
      return;
    }
    if (!currentPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập mật khẩu tài khoản để xác nhận.');
      return;
    }

    setSubmitting(true);
    try {
      await setVerificationPin({
        pin,
        current_password: currentPassword,
      });
      Alert.alert('✅ Thành công', isChange ? 'Đã đổi mã cá nhân.' : 'Đã đặt mã cá nhân.');
      resetForm();
      onSuccess?.();
      onClose?.();
    } catch (e) {
      const msg = e?.response?.data?.error || 'Không thể đặt mã. Vui lòng thử lại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {isChange ? '🔐 Đổi mã cá nhân' : '🔐 Đặt mã cá nhân'}
          </Text>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.body}>
          <Text style={styles.description}>
            {isChange
              ? 'Đặt mã cá nhân mới. Mã này sẽ được hệ thống dùng để xác minh ngẫu nhiên trong ca làm, đảm bảo bạn vẫn đang cầm máy.'
              : 'Hệ thống sẽ thỉnh thoảng yêu cầu bạn nhập mã này trong ca làm để xác nhận bạn vẫn đang cầm máy (chống để máy lại rồi bỏ đi). Hãy chọn mã dễ nhớ nhưng khó đoán.'}
          </Text>

          <Text style={styles.label}>Mã cá nhân (4-6 chữ số)</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="VD: 1234"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            autoFocus
          />

          <Text style={styles.label}>Nhập lại mã</Text>
          <TextInput
            style={styles.input}
            value={confirmPin}
            onChangeText={setConfirmPin}
            placeholder="Nhập lại mã"
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
          />

          <Text style={styles.label}>Mật khẩu tài khoản (xác nhận)</Text>
          <TextInput
            style={styles.input}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Nhập mật khẩu tài khoản"
            secureTextEntry
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            ⚠️ Vì lý do bảo mật, phải nhập mật khẩu tài khoản để đổi PIN — tránh ai cầm máy đổi PIN tuỳ tiện.
          </Text>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isChange ? 'Đổi mã' : 'Đặt mã'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background || '#F7F7F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  closeBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary || '#1A1A2E' },
  body: { flex: 1, padding: 20 },
  description: {
    fontSize: 14, color: COLORS.textSecondary || '#6B7280',
    lineHeight: 20, marginBottom: 20,
  },
  label: {
    fontSize: 14, fontWeight: '600',
    color: COLORS.textPrimary || '#1A1A2E',
    marginBottom: 6, marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: COLORS.textPrimary || '#1A1A2E',
  },
  hint: {
    fontSize: 12, color: COLORS.textMuted || '#9CA3AF',
    marginTop: 8, lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: COLORS.primary || '#F26522',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
