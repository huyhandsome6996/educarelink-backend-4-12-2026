// ====================================================================
// RandomVerificationModal — Modal full-screen bắt buộc nhập mã PIN
// ====================================================================
// - Hiện khi hệ thống bất ngờ yêu cầu xác minh (push type=random_verification)
// - Đếm ngược 90s (từ backend respond_deadline)
// - Lặp lại còi báo động (channel emergency-alerts đã setup ở App.js)
// - Gọi API respond/ khi user bấm xác nhận
// - Hiện được trên mọi screen (đặt ở App root qua useRandomVerificationCheck)
// ====================================================================
//
// ⚠️ LƯU Ý VỀ EXPO GO:
// - Channel 'emergency-alerts' với sound custom KHÔNG hoạt động trên Expo Go.
// - Modal này VẪN hoạt động trên Expo Go (vì nó là React Native UI, không
//   phụ thuộc native notification). Nhưng còi to sẽ KHÔNG kêu — chỉ có
//   vibration + Alert.alert.
// - Để test còi to thật + push khi app đóng, phải build EAS Development Build.
// ====================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Vibration, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import {
  getPendingVerificationCheck, respondVerificationCheck,
} from '../api/tracking';
import { COLORS } from '../theme/colors';

const POLL_INTERVAL_MS = 5000; // Poll pending check mỗi 5s
const VIBRATION_PATTERN = [1000, 500, 1000, 500, 1000, 500, 1000];

export default function RandomVerificationModal() {
  const [check, setCheck] = useState(null); // { check_id, task_id, respond_deadline, seconds_remaining }
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const pollRef = useRef(null);
  const countdownRef = useRef(null);
  const lastCheckIdRef = useRef(null);

  // Poll pending check từ backend
  const fetchPendingCheck = useCallback(async () => {
    try {
      const res = await getPendingVerificationCheck();
      if (res.data?.has_pending) {
        const newCheck = res.data;
        // Nếu là check mới (id khác) → rung + còi
        if (lastCheckIdRef.current !== newCheck.check_id) {
          lastCheckIdRef.current = newCheck.check_id;
          setCheck(newCheck);
          setSecondsRemaining(newCheck.seconds_remaining || 90);
          Vibration.vibrate(VIBRATION_PATTERN, true); // repeat = true
          // Schedule local notification (channel emergency-alerts)
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '🔐 Xác minh bảo mật',
                body: 'Vui lòng nhập mã cá nhân để xác nhận',
                sound: 'default',
                priority: Notifications.AndroidNotificationPriority.HIGH,
                data: {
                  type: 'random_verification',
                  task_id: newCheck.task_id,
                  check_id: newCheck.check_id,
                },
              },
              trigger: null,
            });
          } catch (e) { /* ignore */ }
        } else {
          // Cùng check → chỉ update seconds_remaining
          setSecondsRemaining(newCheck.seconds_remaining || 0);
        }
      } else {
        // Không có check pending → ẩn modal + dừng rung
        if (lastCheckIdRef.current !== null) {
          lastCheckIdRef.current = null;
          setCheck(null);
          setPin('');
          Vibration.cancel();
        }
      }
    } catch (e) {
      // Silent fail — không log (tránh spam khi offline)
    }
  }, []);

  // Poll pending check mỗi 5s
  useEffect(() => {
    fetchPendingCheck();
    pollRef.current = setInterval(fetchPendingCheck, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchPendingCheck]);

  // Countdown mỗi 1s
  useEffect(() => {
    if (!check) return;
    countdownRef.current = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          // Hết giờ → backend sẽ tự set 'timeout' khi poll tiếp
          Vibration.cancel();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [check?.check_id]);

  // Lấy vị trí hiện tại để gửi kèm khi respond
  const getCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
    } catch (e) {
      return null;
    }
  };

  const handleRespond = async () => {
    if (!check) return;
    if (!/^\d{4,6}$/.test(pin)) {
      Alert.alert('Lỗi', 'Mã phải là 4-6 chữ số.');
      return;
    }

    setSubmitting(true);
    try {
      const location = await getCurrentLocation();
      await respondVerificationCheck(check.check_id, {
        pin,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      });

      // Thành công → ẩn modal + dừng rung
      Vibration.cancel();
      Alert.alert('✅ Đã xác nhận', 'Cảm ơn bạn đã phản hồi kịp thời.');
      lastCheckIdRef.current = null;
      setCheck(null);
      setPin('');
    } catch (e) {
      const msg = e?.response?.data?.error || 'Không thể phản hồi. Vui lòng thử lại.';
      if (e?.response?.status === 400) {
        // Có thể là "sai mã — còn N lần" hoặc "đã hết thời gian"
        Alert.alert('Không thành công', msg);
        setPin('');
        // Nếu check đã kết thúc (timeout/wrong_code) → poll lại sẽ ẩn modal
        if (msg.includes('hết thời gian') || msg.includes('bị khoé')) {
          setTimeout(fetchPendingCheck, 1500);
        }
      } else {
        Alert.alert('Lỗi', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Không hiện modal nếu không có check pending
  if (!check) return null;

  const isUrgent = secondsRemaining <= 30;
  const isCritical = secondsRemaining <= 10;

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={false}
      onRequestClose={() => {
        // Chặn đóng modal bằng nút back (Android) — bắt buộc phải phản hồi
        Alert.alert(
          '⚠️ Không thể bỏ qua',
          'Bạn phải nhập mã xác minh để tiếp tục. Hệ thống đang đảm bảo an toàn cho phụ huynh và trẻ.',
        );
      }}
    >
      <View style={[styles.container, isCritical && styles.containerCritical]}>
        <View style={styles.iconRow}>
          <Ionicons name="shield-checkmark" size={64} color={COLORS?.primary || '#F26522'} />
        </View>

        <Text style={styles.title}>🔐 Xác minh bảo mật</Text>
        <Text style={styles.subtitle}>
          Hệ thống yêu cầu bạn nhập mã cá nhân để xác nhận vẫn đang cầm máy.
        </Text>

        <View style={[styles.countdownBox, isUrgent && styles.countdownUrgent]}>
          <Text style={[styles.countdownText, isUrgent && styles.countdownTextUrgent]}>
            ⏱ {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, '0')}
          </Text>
          <Text style={styles.countdownLabel}>giây còn lại</Text>
        </View>

        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={setPin}
          placeholder="Nhập mã cá nhân"
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          autoFocus
          editable={!submitting}
        />

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleRespond}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Xác nhận</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.warning}>
          ⚠️ Nếu không phản hồi trong thời hạn, hệ thống sẽ báo admin và có thể báo phụ huynh.
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  containerCritical: {
    backgroundColor: '#FFF0F0',
  },
  iconRow: { marginBottom: 16 },
  title: {
    fontSize: 24, fontWeight: '800',
    color: COLORS?.textPrimary || '#1A1A2E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS?.textSecondary || '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  countdownBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#F26522',
  },
  countdownUrgent: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  countdownText: {
    fontSize: 36, fontWeight: '900',
    color: '#F26522',
    fontVariant: ['tabular-nums'],
  },
  countdownTextUrgent: {
    color: '#EF4444',
  },
  countdownLabel: {
    fontSize: 12, color: '#6B7280',
    marginTop: 4,
  },
  pinInput: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    fontSize: 24, fontWeight: '700',
    color: COLORS?.textPrimary || '#1A1A2E',
    width: '100%',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 4,
  },
  submitBtn: {
    backgroundColor: COLORS?.primary || '#F26522',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    width: '100%',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  warning: {
    fontSize: 12, color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20, lineHeight: 16,
  },
});
