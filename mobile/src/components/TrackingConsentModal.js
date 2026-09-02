import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator,
  Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { grantConsent } from '../api/tracking';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

/**
 * TrackingConsentModal
 *
 * Hiển thị modal hỏi carepartner đồng ý chia sẻ vị trí khi nhận việc.
 *
 * Props:
 *  - visible: boolean
 *  - taskId: number
 *  - parentName: string (tên phụ huynh để hiển thị)
 *  - taskTitle: string
 *  - onConsent: (granted: boolean) => void  — gọi sau khi user chọn
 *  - onClose: () => void
 */
export default function TrackingConsentModal({
  visible, taskId, parentName, taskTitle,
  onConsent, onClose,
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleChoice = async (granted: boolean) => {
    setSubmitting(true);
    try {
      await grantConsent(taskId, granted);
      onConsent?.(granted);
    } catch (e) {
      const msg = e?.response?.data?.error || 'Không thể lưu đồng ý. Vui lòng thử lại.';
      if (Platform.OS === 'web') alert(`Lỗi: ${msg}`);
      else Alert.alert('Lỗi', msg);
      // Vẫn gọi onConsent để tiếp tục flow
      onConsent?.(granted);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.iconCircle}>
            <Ionicons name="location" size={36} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>Cho phép theo dõi vị trí?</Text>
          <Text style={styles.desc}>
            Phụ huynh <Text style={styles.bold}>{parentName || 'này'}</Text> muốn xem vị trí của bạn
            trong lúc làm việc <Text style={styles.bold}>{taskTitle || ''}</Text> để an tâm.
          </Text>

          <View style={styles.featuresCard}>
            <View style={styles.featureRow}>
              <View style={styles.featureIcon}><Ionicons name="time-outline" size={14} color={COLORS.primary} /></View>
              <Text style={styles.featureText}>Chỉ chia sẻ <Text style={styles.bold}>khi đang làm việc</Text></Text>
            </View>
            <View style={styles.featureRow}>
              <View style={styles.featureIcon}><Ionicons name="eye-off-outline" size={14} color={COLORS.primary} /></View>
              <Text style={styles.featureText}>Phụ huynh chỉ thấy <Text style={styles.bold}>vị trí hiện tại</Text></Text>
            </View>
            <View style={styles.featureRow}>
              <View style={styles.featureIcon}><Ionicons name="stop-circle-outline" size={14} color={COLORS.primary} /></View>
              <Text style={styles.featureText}>Bạn có thể <Text style={styles.bold}>dừng bất cứ lúc nào</Text></Text>
            </View>
            <View style={styles.featureRow}>
              <View style={styles.featureIcon}><Ionicons name="lock-closed-outline" size={14} color={COLORS.primary} /></View>
              <Text style={styles.featureText}>Dữ liệu mã hóa, chỉ phụ huynh sở hữu việc mới xem</Text>
            </View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, submitting && { opacity: 0.6 }]}
              onPress={() => handleChoice(false)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <Text style={styles.btnSecondaryText}>Không, cảm ơn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, submitting && { opacity: 0.6 }]}
              onPress={() => handleChoice(true)}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="location" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>Đồng ý & nhận việc</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.noteText}>
            Bạn có thể rút lại đồng ý bất cứ lúc nào từ banner "Đang chia sẻ vị trí".
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
    ...SHADOWS.large,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.divider,
    alignSelf: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 2,
    borderColor: COLORS.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    ...TYPO.h3,
    fontSize: 20,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '700',
  },
  desc: {
    ...TYPO.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  bold: { fontWeight: '700', color: COLORS.textPrimary },
  featuresCard: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    ...TYPO.bodySmall,
    color: COLORS.textPrimary,
    flex: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.large,
  },
  btnSecondary: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  btnPrimaryText: {
    color: '#fff',
    ...TYPO.button,
    fontSize: 14,
  },
  btnSecondaryText: {
    color: COLORS.textSecondary,
    ...TYPO.button,
    fontSize: 14,
  },
  noteText: {
    ...TYPO.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
