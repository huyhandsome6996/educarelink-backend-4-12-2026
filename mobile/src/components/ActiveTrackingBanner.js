import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { revokeConsent } from '../api/tracking';
import { stopTracking } from '../services/LocationService';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

/**
 * ActiveTrackingBanner
 *
 * Hiển thị banner xanh "Đang chia sẻ vị trí" cho carepartner khi task in_progress
 * + có nút "Dừng" khẩn cấp.
 *
 * Props:
 *  - taskId: number
 *  - taskTitle: string
 *  - onStopped: () => void  — gọi sau khi user dừng chia sẻ
 */
export default function ActiveTrackingBanner({ taskId, taskTitle, onStopped }) {
  const [isStopping, setIsStopping] = useState(false);
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  // Pulse animation
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, []);

  const handleStop = () => {
    const confirm = () => {
      Alert.alert(
        'Dừng chia sẻ vị trí',
        'Phụ huynh sẽ không còn thấy vị trí của bạn. Tiếp tục?',
        [
          { text: 'Huỷ', style: 'cancel' },
          {
            text: 'Dừng chia sẻ', style: 'destructive', onPress: async () => {
              setIsStopping(true);
              try {
                await revokeConsent(taskId);
                await stopTracking();
                onStopped?.();
                Alert.alert('✅ Đã dừng', 'Đã dừng chia sẻ vị trí với phụ huynh.');
              } catch (e) {
                Alert.alert('Lỗi', 'Không thể dừng. Vui lòng thử lại.');
              } finally {
                setIsStopping(false);
              }
            }
          },
        ]
      );
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Dừng chia sẻ vị trí với phụ huynh?')) {
        setIsStopping(true);
        revokeConsent(taskId).then(() => stopTracking()).then(() => {
          onStopped?.();
        }).finally(() => setIsStopping(false));
      }
    } else {
      confirm();
    }
  };

  return (
    <Animated.View style={[
      styles.banner,
      { opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }
    ]}>
      <View style={styles.iconCircle}>
        <Ionicons name="location" size={20} color="#fff" />
        <Animated.View style={[
          styles.iconPulse,
          { opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }) }
        ]} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Đang chia sẻ vị trí</Text>
        <Text style={styles.sub} numberOfLines={1}>
          Phụ huynh đang thấy bạn · {taskTitle || `Task #${taskId}`}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.stopBtn, isStopping && { opacity: 0.6 }]}
        onPress={handleStop}
        disabled={isStopping}
        activeOpacity={0.85}
      >
        <Text style={styles.stopText}>{isStopping ? '...' : 'Dừng'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: 12,
    // Fix M12: xoá duplicate `backgroundColor: '#fff'` — dòng dưới (#ecfdf5)
    // là màu nền đúng cho banner tracking active (xanh nhạt).
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#a7f3d0',
    ...SHADOWS.cardHover,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center',
    position: 'relative',
    ...SHADOWS.small,
  },
  iconPulse: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 24,
    backgroundColor: COLORS.success,
  },
  content: { flex: 1 },
  title: {
    ...TYPO.bodySmall, fontWeight: '800', color: '#065f46',
  },
  sub: {
    ...TYPO.caption, color: '#047857', marginTop: 2,
  },
  stopBtn: {
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#fecaca',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  stopText: {
    ...TYPO.buttonSmall, color: COLORS.error, fontWeight: '700',
  },
});
