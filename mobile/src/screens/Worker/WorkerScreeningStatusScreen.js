// ============================================================
// WorkerScreeningStatusScreen — MỚI (Nhóm B, mock data)
// Hiển thị trạng thái thẩm định hồ sơ CarePartner cho worker.
// Chưa có backend → dùng mock data tĩnh.
// Khi có API: thay MOCK_STATUS bằng getScreeningStatus() trong useEffect.
//
// Layout theo design HTML worker_screening_status/code.html:
// - Top App Bar: surface bg, back + 'Trạng thái thẩm định' + spacer
// - Hero card: surface-container-lowest bg, radius 14, shadow large
//   * Illustration circle 192px (primaryLight bg + icon hourglass)
//   * 'Hồ sơ đang được thẩm định' h3 primary
//   * Subtitle body on-surface-variant (24-48h làm việc)
//   * Stage badge: pill primaryLight bg, hourglass icon + uppercase
//     'Giai đoạn: Phỏng vấn trực tuyến'
// - Progress card: surface bg, 'Tiến độ hồ sơ' h4 + 5 step rows
//   (check circle green = done, pending circle = waiting)
// - 2 action buttons:
//   * 'Xem chi tiết phỏng vấn' (secondary bg, white text, shadow)
//   * 'Liên hệ hỗ trợ' (ghost, primary text)
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { useAuth } from '../../context/AuthContext';
import { MOCK_SCREENING_STATUS, APPROVED_SCREENING_STATUS } from '../../mocks/workerScreeningMock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// === Chọn status dựa trên user.is_verified từ API thật ===
// user.is_verified === true  → tất cả steps done, stage = 'Đã duyệt'
// user.is_verified === false → dùng mock pending (backend chưa có API tổng hợp screening)
export function getScreeningStatusForUser(user) {
  if (user?.is_verified) {
    return APPROVED_SCREENING_STATUS;
  }
  return MOCK_SCREENING_STATUS;
}

const STEP_STATUS_STYLE = {
  done: {
    iconBg: COLORS.secondaryLight,
    iconColor: COLORS.secondaryDark,
    icon: 'checkmark',
    label: 'Hoàn tất',
    labelColor: COLORS.secondaryDark,
    opacity: 1,
  },
  pending: {
    iconBg: COLORS.surfaceContainerHigh,
    iconColor: COLORS.onSurfaceVariant,
    icon: 'time',
    label: 'Đang chờ',
    labelColor: COLORS.onSurfaceVariant,
    opacity: 0.6,
  },
  rejected: {
    iconBg: COLORS.errorContainer,
    iconColor: COLORS.errorDeep,
    icon: 'close',
    label: 'Từ chối',
    labelColor: COLORS.errorDeep,
    opacity: 1,
  },
};

export default function WorkerScreeningStatusScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  // Nối thật field is_verified từ API /profile/ — nếu đã verified → hiện stage "Đã duyệt"
  const [status] = useState(() => getScreeningStatusForUser(user));

  const completedCount = status.steps.filter(s => s.status === 'done').length;
  const totalCount = status.steps.length;
  const progressPercent = (completedCount / totalCount) * 100;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Trạng thái thẩm định</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero card — illustration + title + stage badge */}
        <View style={styles.heroCard}>
          {/* Illustration circle 192px */}
          <View style={styles.illustrationCircle}>
            <Ionicons name="hourglass" size={64} color={COLORS.primary} />
          </View>

          <Text style={styles.heroTitle}>Hồ sơ đang được thẩm định</Text>
          <Text style={styles.heroSubtitle}>{status.description}</Text>

          {/* Stage badge */}
          <View style={styles.stageBadge}>
            <Ionicons name="hourglass" size={16} color={COLORS.primary} />
            <Text style={styles.stageBadgeText}>
              GIAI ĐOẠN: {status.stage.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Estimated time card */}
        <View style={styles.estimatedCard}>
          <View style={styles.estimatedItem}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
            <View>
              <Text style={styles.estimatedLabel}>Ngày nộp hồ sơ</Text>
              <Text style={styles.estimatedValue}>{status.submittedDate}</Text>
            </View>
          </View>
          <View style={styles.estimatedDivider} />
          <View style={styles.estimatedItem}>
            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
            <View>
              <Text style={styles.estimatedLabel}>Dự kiến có kết quả</Text>
              <Text style={styles.estimatedValue}>{status.expectedDate}</Text>
            </View>
          </View>
        </View>

        {/* Progress card */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Tiến độ hồ sơ</Text>
            <Text style={styles.progressCount}>
              {completedCount}/{totalCount}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>

          {/* Steps list */}
          <View style={styles.stepsList}>
            {status.steps.map((step, idx) => {
              const st = STEP_STATUS_STYLE[step.status];
              return (
                <View
                  key={step.id}
                  style={[styles.stepItem, { opacity: st.opacity }]}
                >
                  <View style={styles.stepLeft}>
                    <View style={[styles.stepIconCircle, { backgroundColor: st.iconBg }]}>
                      <Ionicons name={st.icon} size={14} color={st.iconColor} />
                    </View>
                    {idx < status.steps.length - 1 && <View style={styles.stepConnector} />}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepLabel}>{step.label}</Text>
                    <Text style={[styles.stepStatus, { color: st.labelColor }]}>
                      {st.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.interviewBtn}
            onPress={() => showComingSoon('Chi tiết phỏng vấn trực tuyến')}
            activeOpacity={0.85}
          >
            <Ionicons name="videocam" size={20} color="#fff" />
            <Text style={styles.interviewBtnText}>Xem chi tiết phỏng vấn</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.supportBtn}
            onPress={() => showComingSoon('Liên hệ hỗ trợ')}
            activeOpacity={0.7}
          >
            <Ionicons name="headset" size={20} color={COLORS.primary} />
            <Text style={styles.supportBtnText}>Liên hệ hỗ trợ</Text>
          </TouchableOpacity>
        </View>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle" size={16} color={COLORS.primary} />
          <Text style={styles.infoNoteText}>
            Trong thời gian chờ, bạn có thể cập nhật thông tin hồ sơ nếu cần.
            Hệ thống sẽ thông báo ngay khi có kết quả thẩm định.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 20 },
  // === HERO CARD ===
  heroCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.medium,
    gap: 16,
  },
  illustrationCircle: {
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  heroTitle: {
    ...TYPO.h3,
    color: COLORS.primary,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
    ...SHADOWS.small,
  },
  stageBadgeText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // === ESTIMATED CARD ===
  estimatedCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  estimatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  estimatedLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  estimatedValue: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginTop: 2,
  },
  estimatedDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginVertical: 12,
  },
  // === PROGRESS CARD ===
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    ...SHADOWS.small,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
  },
  progressCount: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.secondary,
    borderRadius: 4,
  },
  // === STEPS ===
  stepsList: {
    gap: 0,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  stepLeft: {
    alignItems: 'center',
    width: 28,
  },
  stepIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepConnector: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.outlineVariant,
    marginTop: 4,
    minHeight: 16,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 8,
  },
  stepLabel: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurface,
    fontWeight: '500',
  },
  stepStatus: {
    ...TYPO.caption,
    marginTop: 2,
    fontWeight: '700',
  },
  // === ACTIONS ===
  actions: {
    gap: 12,
  },
  interviewBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  interviewBtnText: {
    ...TYPO.h4,
    color: '#ffffff',
  },
  supportBtn: {
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
  supportBtnText: {
    ...TYPO.h4,
    color: COLORS.primary,
  },
  // === INFO NOTE ===
  infoNote: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  infoNoteText: {
    flex: 1,
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurface,
    lineHeight: 20,
  },
});
