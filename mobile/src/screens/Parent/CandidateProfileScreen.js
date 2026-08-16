// ============================================================
// CandidateProfileScreen — Redesign theo Warm Professionalism
// Thay đổi:
// - Top App Bar: trắng, back + 'Hồ sơ CarePartner' + more icon
// - Profile card: surfaceContainerLow bg, radius 24, gradient header
//   bar (primary-fixed-dim), avatar 128px (ring 4px surface), name h1,
//   'CarePartner Được Chứng Nhận' badge (verified icon secondary),
//   tier badge (Vàng/Bạc), stats row 3 cột (rating/hours/families)
// - Section 'Kinh nghiệm & Kỹ năng': cards với icon circle + chips
// - Section 'Bằng cấp & Chứng chỉ': card với ribbon icon
// - AI summary panel: giữ nguyên, restyle màu (primaryLight bg)
// - Section 'Đánh giá từ phụ huynh': card nhỏ với reviewer info
// - Sticky footer: 'Chấp nhận bạn này làm việc' button (pending only)
// Giữ nguyên: getWorkerProfile, approveCandidate, navigation
// ============================================================

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkerProfile, approveCandidate } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// QA-FIX-UI 2.1: Mock data lịch rảnh trong tuần.
// Backend chưa có field availability cho Worker → dùng mock cố định
// khớp với screen.png. Khi backend bổ sung field thật, thay bằng
// profile.availability (cấu trúc mong muốn: { morning: [7 bool], afternoon: [7 bool] }).
const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const AVAILABILITY_MOCK = {
  morning:   [true, true, false, true, false, true, true],
  afternoon: [false, true, true, false, true, true, false],
};

export default function CandidateProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const { workerId, applicationId, isPending } = route.params || {};
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    getWorkerProfile(workerId)
      .then(res => setProfile(res.data))
      .catch(err => {
        console.error(err);
        const msg = err.response?.data?.error || 'Không thể tải thông tin hồ sơ.';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Lỗi', msg);
        navigation.goBack();
      })
      .finally(() => setIsLoading(false));
  }, [workerId]);

  const handleApprove = () => {
    const startApprove = async () => {
      setApproving(true);
      try {
        const res = await approveCandidate(applicationId);
        if (Platform.OS === 'web') {
          alert(`Đã nhận! ${res.data.message}`);
          navigation.navigate('MyTasks');
        } else {
          Alert.alert('Đã nhận!', res.data.message, [
            { text: 'OK', onPress: () => navigation.navigate('MyTasks') }
          ]);
        }
      } catch (e) {
        const msg = e.response?.data?.error || 'Thao tác thất bại.';
        if (Platform.OS === 'web') alert(`Lỗi: ${msg}`);
        else Alert.alert('Lỗi', msg);
      } finally {
        setApproving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Xác nhận chấp nhận ${profile?.first_name || profile?.username} làm việc này?\nCác ứng viên khác sẽ tự động bị từ chối.`)) {
        startApprove();
      }
    } else {
      Alert.alert('Xác nhận', `Chấp nhận ${profile?.first_name || profile?.username} làm việc này?\nCác ứng viên khác sẽ tự động bị từ chối.`, [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Chấp nhận', style: 'default', onPress: startApprove },
      ]);
    }
  };

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ flex: 1, marginTop: 100 }} />;
  if (!profile) return null;

  const displayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username;
  const rating = profile.avg_rating || 0;
  const reviewCount = profile.review_count || 0;

  // Tier badge dựa trên review_count (mock logic — không có API thật)
  // QA-FIX-UI 3.1: dùng token tierGold/tierSilver (tông be/vàng ấm) thay
  // cho hex #B8860B/#6B7280 chói/lạnh không thuộc Warm Professionalism.
  const tier = reviewCount >= 50 ? { label: 'Hạng Vàng', color: COLORS.tierGold, bg: COLORS.tierGoldBg }
             : reviewCount >= 20 ? { label: 'Hạng Bạc', color: COLORS.tierSilver, bg: COLORS.tierSilverBg }
             : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />

      {/* Top App Bar — trắng */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
         accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Hồ sơ CarePartner</Text>
        <TouchableOpacity
          style={styles.appBarBtn}
          onPress={() => showComingSoon('Báo cáo/Blokir CarePartner')}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card — surfaceContainerLow bg, radius 24, gradient header */}
        <View style={styles.profileCard}>
          {/* Gradient header bar */}
          <View style={styles.profileGradientBar} />

          {/* Avatar 128px với ring 4px */}
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
            </View>
            {/* Verified badge overlay */}
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
            </View>
          </View>

          <Text style={styles.name}>{displayName}</Text>

          <View style={styles.verifiedRow}>
            <Ionicons name="shield-checkmark" size={16} color={COLORS.secondary} />
            <Text style={styles.verifiedText}>CarePartner Được Chứng Nhận</Text>
          </View>

          {tier && (
            <View style={[styles.tierBadge, { backgroundColor: tier.bg, borderColor: tier.color }]}>
              <Ionicons name="star" size={14} color={tier.color} />
              <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
            </View>
          )}

          {/* Stats row — 3 cột: rating, hours, families */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{rating > 0 ? rating.toFixed(1) : 'N/A'}</Text>
              <View style={styles.statSubRow}>
                <Ionicons name="star" size={12} color={COLORS.ratingStar} />
                <Text style={styles.statLabel}>Đánh giá</Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{reviewCount * 2}+</Text>
              <Text style={styles.statLabel}>Giờ chăm sóc</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{reviewCount}</Text>
              <Text style={styles.statLabel}>Gia đình</Text>
            </View>
          </View>
        </View>

        {/* Section: Kinh nghiệm & Kỹ năng */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kinh nghiệm & Kỹ năng</Text>

          {/* Experience card */}
          <View style={styles.expCard}>
            <View style={styles.expIconCircle}>
              <Ionicons name="people" size={22} color={COLORS.secondaryDark} />
            </View>
            <View style={styles.expContent}>
              <Text style={styles.expTitle}>
                {reviewCount > 0 ? `${reviewCount}+ việc đã hoàn thành` : 'Mới tham gia'}
              </Text>
              <Text style={styles.expDesc}>
                Chuyên chăm sóc trẻ, hỗ trợ bài tập, và đồng hành cùng gia đình. Đã được xác thực danh tính và được phụ huynh tin tưởng.
              </Text>
            </View>
          </View>

          {/* Skills chips */}
          <View style={styles.skillsRow}>
            {['Sơ cứu cơ bản', 'Hỗ trợ bài tập', 'Chăm sóc trẻ', 'Nấu ăn dinh dưỡng'].map((skill) => (
              <View key={skill} style={styles.skillChip}>
                <Text style={styles.skillChipText}>{skill}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Section: Bằng cấp & Chứng chỉ */}
        {profile.qualifications?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bằng cấp & Chứng chỉ</Text>
            <View style={styles.certList}>
              {profile.qualifications.map((q, idx) => (
                <View key={idx} style={styles.certCard}>
                  <View style={styles.certIconCircle}>
                    <Ionicons name="ribbon" size={18} color={COLORS.primary} />
                  </View>
                  <Text style={styles.certText}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* AI Profile Summary */}
        {profile.ai_profile_summary && (
          <View style={styles.section}>
            <View style={styles.aiTitleRow}>
              <View style={styles.aiIconCircle}>
                <Ionicons name="sparkles" size={16} color={COLORS.primary} />
              </View>
              <Text style={styles.aiTitle}>Tóm tắt hồ sơ (AI)</Text>
            </View>
            <View style={styles.aiBox}>
              <Text style={styles.aiText}>{profile.ai_profile_summary}</Text>
              <Text style={styles.aiDisclaimer}>* Tóm tắt được tạo bởi AI, chỉ tham khảo.</Text>
            </View>
          </View>
        )}

        {/* Section: Lịch rảnh trong tuần — MOCK (QA-FIX-UI 2.1)
            Backend chưa có field availability cho Worker (core/models.py
            chưa định nghĩa) → dùng mock data cố định. Khi backend thêm
            field thật, thay AVAILABILITY_MOCK bằng profile.availability. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lịch rảnh trong tuần</Text>
          <View style={styles.availabilityCard}>
            {/* Header row: 7 cột ngày T2–CN */}
            <View style={styles.availHeaderRow}>
              {DAYS.map((d) => (
                <View key={d} style={styles.availDayCell}>
                  <Text style={styles.availDayLabel}>{d}</Text>
                </View>
              ))}
            </View>
            {/* Morning row */}
            <View style={styles.availSlotBlock}>
              <Text style={styles.availSlotLabel}>Sáng (08:00 - 12:00)</Text>
              <View style={styles.availRow}>
                {AVAILABILITY_MOCK.morning.map((avail, idx) => (
                  <View
                    key={`m-${idx}`}
                    style={[
                      styles.availCell,
                      avail ? styles.availCellAvailable : styles.availCellBusy,
                    ]}
                  >
                    {avail && <Ionicons name="checkmark" size={14} color={COLORS.successDeep} />}
                  </View>
                ))}
              </View>
            </View>
            {/* Afternoon row */}
            <View style={styles.availSlotBlock}>
              <Text style={styles.availSlotLabel}>Chiều (13:00 - 17:00)</Text>
              <View style={styles.availRow}>
                {AVAILABILITY_MOCK.afternoon.map((avail, idx) => (
                  <View
                    key={`a-${idx}`}
                    style={[
                      styles.availCell,
                      avail ? styles.availCellAvailable : styles.availCellBusy,
                    ]}
                  >
                    {avail && <Ionicons name="checkmark" size={14} color={COLORS.successDeep} />}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Section: Đánh giá từ phụ huynh */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Đánh giá từ phụ huynh ({reviewCount})
          </Text>
          {profile.reviews?.length === 0 || !profile.reviews ? (
            <View style={styles.emptyReviews}>
              <Ionicons name="chatbubble-ellipses-outline" size={32} color={COLORS.outlineVariant} />
              <Text style={styles.emptyReviewsText}>Chưa có lượt đánh giá nào cho CarePartner này.</Text>
            </View>
          ) : (
            <View style={styles.reviewList}>
              {profile.reviews.map((r, idx) => (
                <View key={idx} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewerInfo}>
                      <View style={styles.reviewerAvatar}>
                        <Text style={styles.reviewerAvatarText}>
                          {r.reviewer_name?.[0]?.toUpperCase() || '?'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.reviewerName}>{r.reviewer_name}</Text>
                        <Text style={styles.reviewDate}>
                          {new Date(r.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.starsRow}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <Ionicons
                          key={i}
                          name={i <= r.rating ? 'star' : 'star-outline'}
                          size={12}
                          color={COLORS.ratingStar}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky footer — 'Chấp nhận' button (pending only) */}
      {isPending && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.approveBtn, approving && { opacity: 0.7 }]}
            onPress={handleApprove}
            disabled={approving}
            activeOpacity={0.85}
          >
            {approving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.approveBtnText}>Chấp nhận bạn này làm việc</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  },
  appBarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBarTitle: {
    ...TYPO.h3,
    color: COLORS.onSurface,
  },
  // === SCROLL ===
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  // === PROFILE CARD ===
  profileCard: {
    backgroundColor: COLORS.surfaceContainerLow, // surface-container-low
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
    ...SHADOWS.small,
    marginBottom: 24,
    position: 'relative',
  },
  profileGradientBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: COLORS.primaryFixedDim, // primary-fixed-dim
    opacity: 0.3,
  },
  avatarRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: COLORS.surface,
    borderWidth: 4,
    borderColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...SHADOWS.medium,
    zIndex: 1,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    ...TYPO.h1,
    fontSize: 42,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.surface,
  },
  name: {
    ...TYPO.h1,
    color: COLORS.onSurface,
    marginBottom: 8,
    textAlign: 'center',
    zIndex: 1,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  verifiedText: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  tierText: {
    ...TYPO.caption,
    fontWeight: '700',
  },
  // === STATS ROW ===
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    ...TYPO.h3,
    color: COLORS.primary,
    marginBottom: 4,
  },
  statSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.outlineVariant,
  },
  // === SECTIONS ===
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...TYPO.h2,
    color: COLORS.onSurface,
    marginBottom: 16,
  },
  // === EXPERIENCE CARD ===
  expCard: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    ...SHADOWS.small,
    marginBottom: 16,
  },
  expIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.secondaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expContent: { flex: 1 },
  expTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  expDesc: {
    ...TYPO.body,
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 20,
  },
  // === SKILLS ===
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    backgroundColor: COLORS.surfaceContainer,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  skillChipText: {
    ...TYPO.body,
    fontSize: 13,
    color: COLORS.onSurface,
  },
  // === CERTIFICATES ===
  certList: { gap: 8 },
  certCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  certIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  certText: {
    ...TYPO.body,
    color: COLORS.onSurface,
    flex: 1,
  },
  // === AI SUMMARY ===
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiTitle: {
    ...TYPO.h4,
    color: COLORS.primary,
    fontWeight: '700',
  },
  aiBox: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.small,
  },
  aiText: {
    ...TYPO.body,
    color: COLORS.onSurface,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  aiDisclaimer: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: 8,
  },
  // === REVIEWS ===
  emptyReviews: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  emptyReviewsText: {
    ...TYPO.bodySmall,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  reviewList: { gap: 12 },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewerAvatarText: {
    ...TYPO.h5,
    color: COLORS.primary,
    fontWeight: '800',
  },
  reviewerName: {
    ...TYPO.body,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  reviewDate: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewComment: {
    ...TYPO.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    lineHeight: 20,
  },
  // === FOOTER ===
  footer: {
    padding: 20,
    paddingBottom: 36,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  approveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...SHADOWS.large,
  },
  approveBtnText: {
    ...TYPO.h4,
    color: '#ffffff',
  },
  // === AVAILABILITY SECTION (QA-FIX-UI 2.1) ===
  availabilityCard: {
    backgroundColor: COLORS.primaryLight,  // #FFF4ED — primaryLight (khớp design HTML)
    borderRadius: 20,
    padding: 16,
  },
  availHeaderRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
  },
  availDayCell: {
    flex: 1,
    alignItems: 'center',
  },
  availDayLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '700',
  },
  availSlotBlock: {
    marginBottom: 8,
  },
  availSlotLabel: {
    ...TYPO.caption,
    color: COLORS.onSurfaceVariant,
    marginBottom: 6,
  },
  availRow: {
    flexDirection: 'row',
    gap: 4,
  },
  availCell: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  availCellAvailable: {
    backgroundColor: COLORS.successBg,  // #ECFDF5 — xanh nhạt (gần design #EAFBEF)
  },
  availCellBusy: {
    backgroundColor: COLORS.surfaceContainer,  // surface-variant (xám nhạt — ô bận)
  },
});
