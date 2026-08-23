// CandidateProfileScreen — B4: hiện hạng thật từ API (tier / tier_label)
import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, Animated} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkerProfile, approveCandidate } from '../../api/tasks';
import {COLORS, SHADOWS, TYPO, ANIM} from '../../theme/colors';
import { showComingSoon } from '../../utils/comingSoon';
import { resolveTier } from '../../utils/carePartnerTier';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CandidateProfileScreen() {
  const navigation = useNavigation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: ANIM.timingNormal, useNativeDriver: true }).start();
  }, [fadeAnim]);
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
    const name = profile?.first_name || profile?.username;
    if (Platform.OS === 'web') {
      if (window.confirm(`Chấp nhận ${name}?`)) startApprove();
    } else {
      Alert.alert('Xác nhận', `Chấp nhận ${name}?`, [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Chấp nhận', onPress: startApprove },
      ]);
    }
  };

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ flex: 1, marginTop: 100 }} />;
  if (!profile) return null;

  const displayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username;
  const rating = profile.avg_rating || 0;
  const reviewCount = profile.review_count || 0;
  const tier = resolveTier(profile);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceWarm} />
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.appBarBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Hồ sơ CarePartner</Text>
        <TouchableOpacity style={styles.appBarBtn} onPress={() => showComingSoon('Báo cáo')}>
          <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <View style={styles.verifiedRow}>
            <Ionicons name="shield-checkmark" size={16} color={COLORS.secondary} />
            <Text style={styles.verifiedText}>CarePartner Được Chứng Nhận</Text>
          </View>
          <View style={[styles.tierBadge, { backgroundColor: tier.bg, borderColor: tier.color }]}>
            <Ionicons name={tier.icon || 'star'} size={14} color={tier.color} />
            <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{rating > 0 ? rating.toFixed(1) : 'N/A'}</Text>
              <Text style={styles.statLabel}>Đánh giá</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{reviewCount}</Text>
              <Text style={styles.statLabel}>Review</Text>
            </View>
            {profile.tier_meta?.completed_jobs != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.tier_meta.completed_jobs}</Text>
                <Text style={styles.statLabel}>Buổi xong</Text>
              </View>
            )}
          </View>
        </View>

        {profile.qualifications?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bằng cấp & Chứng chỉ</Text>
            {profile.qualifications.map((q, idx) => (
              <View key={idx} style={styles.certCard}>
                <Ionicons name="ribbon" size={18} color={COLORS.primary} />
                <Text style={styles.certText}>{q}</Text>
              </View>
            ))}
          </View>
        )}

        {!!profile.ai_profile_summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tóm tắt (AI)</Text>
            <Text style={styles.aiText}>{profile.ai_profile_summary}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Đánh giá ({reviewCount})</Text>
          {!profile.reviews?.length ? (
            <Text style={styles.emptyText}>Chưa có đánh giá.</Text>
          ) : (
            profile.reviews.map((r, idx) => (
              <View key={idx} style={styles.reviewCard}>
                <Text style={styles.reviewerName}>{r.reviewer_name} · {r.rating}★</Text>
                <Text style={styles.reviewComment}>{r.comment}</Text>
              </View>
            ))
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {isPending && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.approveBtn, approving && { opacity: 0.7 }]} onPress={handleApprove} disabled={approving}>
            {approving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.approveBtnText}>Chấp nhận bạn này làm việc</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: COLORS.surface },
  appBarBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceContainer, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { ...TYPO.h3, color: COLORS.onSurface },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  profileCard: { backgroundColor: COLORS.surfaceContainerLow, borderRadius: 24, padding: 24, alignItems: 'center', ...SHADOWS.small, marginBottom: 24 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: COLORS.textOnPrimary, ...TYPO.h1, fontSize: 36 },
  name: { ...TYPO.h1, color: COLORS.onSurface, textAlign: 'center', marginBottom: 8 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  verifiedText: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginBottom: 16 },
  tierText: { ...TYPO.caption, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant },
  statItem: { alignItems: 'center', flex: 1 },
  statValue: { ...TYPO.h3, color: COLORS.primary },
  statLabel: { ...TYPO.caption, color: COLORS.onSurfaceVariant },
  section: { marginBottom: 24 },
  sectionTitle: { ...TYPO.h2, color: COLORS.onSurface, marginBottom: 12 },
  certCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.outlineVariant, marginBottom: 8 },
  certText: { ...TYPO.body, color: COLORS.onSurface, flex: 1 },
  aiText: { ...TYPO.body, color: COLORS.onSurface, fontStyle: 'italic' },
  emptyText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant },
  reviewCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.outlineVariant, marginBottom: 8 },
  reviewerName: { ...TYPO.body, fontWeight: '700', color: COLORS.onSurface, marginBottom: 4 },
  reviewComment: { ...TYPO.body, color: COLORS.onSurfaceVariant },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant },
  approveBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, ...SHADOWS.large },
  approveBtnText: { ...TYPO.h4, color: COLORS.textOnPrimary },
});
