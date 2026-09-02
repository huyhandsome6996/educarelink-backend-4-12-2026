// ============================================================
// WorkerScreeningStatusScreen — WIRING FIX (2026-08-21)
// Trước: dùng mock data tĩnh (MOCK_SCREENING_STATUS / APPROVED_SCREENING_STATUS)
// Sau: gọi getMyCredentials() + getProfile() để lấy dữ liệu thật,
//        ánh xạ CredentialSubmission.status thành các bước thẩm định.
//        Mock chỉ dùng làm fallback khi API lỗi.
// ============================================================

import React, {useState, useRef, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Platform, Animated, ActivityIndicator} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {COLORS, SHADOWS, SIZES, TYPO, ANIM} from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { useAuth } from '../../context/AuthContext';
import { getMyCredentials } from '../../api/tasks';
import { getProfile } from '../../api/auth';
import { MOCK_SCREENING_STATUS, APPROVED_SCREENING_STATUS } from '../../mocks/workerScreeningMock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Ánh xạ dữ liệu thật từ API thành format steps cho UI.
 *
 * Logic:
 *  - user.is_approved === true → Tất cả steps = done, stage = 'Đã duyệt'
 *  - Có CredentialSubmission:
 *      + approved → steps 1-3 done, 4-5 done
 *      + pending  → steps 1-3 done (đã nộp), 4-5 pending
 *      + rejected → steps 1-3 done, step 4 rejected, 5 pending
 *  - Chưa có CredentialSubmission:
 *      + is_verified === true → Tất cả done (đã xác thực danh tính)
 *      + else → Tất cả pending (chưa bắt đầu)
 */
function buildScreeningFromAPI(user, credentials) {
  // Trường hợp đã được admin duyệt tài khoản
  if (user?.is_approved) {
    return {
      stage: 'Đã duyệt',
      description: 'Tài khoản Carepartner của bạn đã được Admin phê duyệt. Bạn có thể bắt đầu nhận việc ngay.',
      steps: [
        { id: 1, label: 'Xác minh danh tính (ID)', status: 'done' },
        { id: 2, label: 'Xác thực khuôn mặt', status: 'done' },
        { id: 3, label: 'Khám sức khỏe cơ bản', status: 'done' },
        { id: 4, label: 'Phỏng vấn chuyên môn', status: 'done' },
        { id: 5, label: 'Duyệt hồ sơ cuối', status: 'done' },
      ],
      submittedDate: credentials?.length > 0
        ? new Date(credentials[0].created_at).toLocaleDateString('vi-VN')
        : '—',
      expectedDate: '—',
    };
  }

  // Có credential submissions
  if (credentials && credentials.length > 0) {
    // Lấy submission mới nhất
    const latest = credentials[0]; // Backend trả theo created_at desc
    const status = latest.status; // pending | approved | rejected
    const submittedDate = new Date(latest.created_at).toLocaleDateString('vi-VN');

    // Nếu có admin_review (lý do từ chối)
    const adminReview = latest.admin_review || '';

    if (status === 'approved') {
      return {
        stage: 'Đã duyệt bằng cấp',
        description: 'Bằng cấp của bạn đã được duyệt. Đang chờ Admin phê duyệt tài khoản cuối cùng.',
        steps: [
          { id: 1, label: 'Xác minh danh tính (ID)', status: user?.is_verified ? 'done' : 'pending' },
          { id: 2, label: 'Xác thực khuôn mặt', status: user?.is_verified ? 'done' : 'pending' },
          { id: 3, label: 'Nộp bằng cấp/chứng chỉ', status: 'done' },
          { id: 4, label: 'Duyệt bằng cấp', status: 'done' },
          { id: 5, label: 'Duyệt tài khoản cuối', status: 'pending' },
        ],
        submittedDate,
        expectedDate: '—',
        adminReview: '',
      };
    }

    if (status === 'rejected') {
      return {
        stage: 'Bị từ chối',
        description: adminReview
          ? `Lý do: ${adminReview}`
          : 'Bằng cấp của bạn không được chấp nhận. Vui lòng nộp lại bằng cấp khác.',
        steps: [
          { id: 1, label: 'Xác minh danh tính (ID)', status: user?.is_verified ? 'done' : 'pending' },
          { id: 2, label: 'Xác thực khuôn mặt', status: user?.is_verified ? 'done' : 'pending' },
          { id: 3, label: 'Nộp bằng cấp/chứng chỉ', status: 'done' },
          { id: 4, label: 'Duyệt bằng cấp', status: 'rejected' },
          { id: 5, label: 'Duyệt tài khoản cuối', status: 'pending' },
        ],
        submittedDate,
        expectedDate: '—',
        adminReview,
      };
    }

    // pending
    return {
      stage: 'Đang thẩm định bằng cấp',
      description: 'Bằng cấp của bạn đang được Admin xem xét. Kết quả sẽ có sau 24-48h làm việc.',
      steps: [
        { id: 1, label: 'Xác minh danh tính (ID)', status: user?.is_verified ? 'done' : 'pending' },
        { id: 2, label: 'Xác thực khuôn mặt', status: user?.is_verified ? 'done' : 'pending' },
        { id: 3, label: 'Nộp bằng cấp/chứng chỉ', status: 'done' },
        { id: 4, label: 'Duyệt bằng cấp', status: 'pending' },
        { id: 5, label: 'Duyệt tài khoản cuối', status: 'pending' },
      ],
      submittedDate,
      expectedDate: '24-48h làm việc',
      adminReview: '',
    };
  }

  // Chưa có credential submission nào
  if (user?.is_verified) {
    return {
      stage: 'Chờ nộp bằng cấp',
      description: 'Đã xác minh danh tính. Bạn cần nộp bằng cấp/chứng chỉ để hoàn tất thẩm định.',
      steps: [
        { id: 1, label: 'Xác minh danh tính (ID)', status: 'done' },
        { id: 2, label: 'Xác thực khuôn mặt', status: 'done' },
        { id: 3, label: 'Nộp bằng cấp/chứng chỉ', status: 'pending' },
        { id: 4, label: 'Duyệt bằng cấp', status: 'pending' },
        { id: 5, label: 'Duyệt tài khoản cuối', status: 'pending' },
      ],
      submittedDate: '—',
      expectedDate: '—',
    };
  }

  // Chưa xác minh, chưa nộp bằng cấp
  return {
    stage: 'Chờ xác minh',
    description: 'Hồ sơ của bạn đang chờ xác minh danh tính. Vui lòng đảm bảo đã tải lên ảnh CCCD và ảnh chân dung.',
    steps: [
      { id: 1, label: 'Xác minh danh tính (ID)', status: 'pending' },
      { id: 2, label: 'Xác thực khuôn mặt', status: 'pending' },
      { id: 3, label: 'Nộp bằng cấp/chứng chỉ', status: 'pending' },
      { id: 4, label: 'Duyệt bằng cấp', status: 'pending' },
      { id: 5, label: 'Duyệt tài khoản cuối', status: 'pending' },
    ],
    submittedDate: '—',
    expectedDate: '—',
  };
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

  // QA-FIX-UI 3.2: fade-in animation khi mount (opacity 0→1)
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIM.timingNormal,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminReview, setIsAdminReview] = useState(false);

  // Gọi API thật: getProfile() + getMyCredentials()
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileRes, credRes] = await Promise.all([
          getProfile(),
          getMyCredentials().catch(() => ({ data: [] })),
        ]);
        const profile = profileRes.data;
        const credentials = credRes.data || [];
        const built = buildScreeningFromAPI(profile, credentials);
        setStatus(built);
        if (built.adminReview) {
          setIsAdminReview(true);
        }
      } catch (e) {
        console.warn('[WorkerScreeningStatus] API lỗi, dùng mock fallback:', e?.message || e);
        // Fallback: dùng mock data cũ dựa trên user.is_verified
        setStatus(user?.is_verified ? APPROVED_SCREENING_STATUS : MOCK_SCREENING_STATUS);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={{ ...TYPO.body, color: COLORS.onSurfaceVariant, marginTop: 12 }}>Đang tải trạng thái thẩm định...</Text>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ ...TYPO.body, color: COLORS.onSurfaceVariant }}>Không thể tải trạng thái.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ ...TYPO.h4, color: COLORS.primary }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const completedCount = status.steps.filter(s => s.status === 'done').length;
  const totalCount = status.steps.length;
  const progressPercent = (completedCount / totalCount) * 100;
  const isRejected = status.stage === 'Bị từ chối';

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Top App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
         accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Trạng thái thẩm định</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero card — illustration + title + stage badge */}
        <View style={styles.heroCard}>
          {/* Illustration circle */}
          <View style={[styles.illustrationCircle, isRejected && styles.illustrationCircleRejected]}>
            <Ionicons name={isRejected ? 'close-circle' : 'hourglass'} size={64} color={isRejected ? COLORS.error : COLORS.primary} />
          </View>

          <Text style={[styles.heroTitle, isRejected && { color: COLORS.error }]}>
            {isRejected ? 'Hồ sơ bị từ chối' : (status.stage === 'Đã duyệt' ? 'Hồ sơ đã được phê duyệt' : 'Hồ sơ đang được thẩm định')}
          </Text>
          <Text style={styles.heroSubtitle}>{status.description}</Text>

          {/* Stage badge */}
          <View style={[styles.stageBadge, isRejected && styles.stageBadgeRejected]}>
            <Ionicons name={isRejected ? 'alert-circle' : 'hourglass'} size={16} color={isRejected ? COLORS.error : COLORS.primary} />
            <Text style={[styles.stageBadgeText, isRejected && { color: COLORS.error }]}>
              GIAI ĐOẠN: {status.stage.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Admin review banner — chỉ hiện khi bị từ chối */}
        {isAdminReview && (
          <View style={styles.reviewBanner}>
            <Ionicons name="information-circle" size={18} color={COLORS.error} />
            <Text style={styles.reviewBannerText}>{status.description}</Text>
          </View>
        )}

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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  backBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
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
  illustrationCircleRejected: {
    backgroundColor: COLORS.errorContainer,
    borderColor: '#fca5a5',
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
  stageBadgeRejected: {
    backgroundColor: COLORS.errorContainer,
    borderColor: '#fca5a5',
  },
  stageBadgeText: {
    ...TYPO.caption,
    color: COLORS.primary,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // === ADMIN REVIEW BANNER ===
  reviewBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.errorContainer,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  reviewBannerText: {
    flex: 1,
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.errorDeep,
    lineHeight: 20,
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
    color: COLORS.textOnPrimary,
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
