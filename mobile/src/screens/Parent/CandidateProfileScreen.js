import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkerProfile, approveCandidate } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

export default function CandidateProfileScreen() {
  const navigation = useNavigation();
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
          alert(`✅ Đã nhận! ${res.data.message}`);
          navigation.navigate('MyTasks');
        } else {
          Alert.alert('✅ Đã nhận!', res.data.message, [
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ ứng viên</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Gradient-like header bar */}
          <View style={styles.profileHeaderBar} />
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{profile.username?.[0]?.toUpperCase() || '?'}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.roleLabel}>Carepartner (Sinh viên)</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.starRow}>
                <Ionicons name="star" size={16} color={COLORS.warning} />
                <Text style={styles.statValue}>{profile.avg_rating}</Text>
              </View>
              <Text style={styles.statLabel}>{profile.review_count} đánh giá</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={16} color={COLORS.success} />
                <Text style={[styles.statValue, { color: COLORS.success, fontSize: 13 }]}>Đã xác thực</Text>
              </View>
              <Text style={styles.statLabel}>CCCD & Thẻ sinh viên</Text>
            </View>
          </View>
        </View>

        {/* Qualifications / Degrees */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bằng cấp & Chứng chỉ</Text>
          <View style={styles.list}>
            {profile.qualifications?.map((q, idx) => (
              <View key={idx} style={styles.certRow}>
                <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} />
                <Text style={styles.certText}>{q}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Profile Summary */}
        <View style={styles.section}>
          <View style={styles.aiTitleRow}>
            <Ionicons name="sparkles" size={18} color="#7c3aed" />
            <Text style={[styles.sectionTitle, { color: '#7c3aed', marginLeft: 6 }]}>Tóm tắt hồ sơ (AI)</Text>
          </View>
          <View style={styles.aiBox}>
            <Text style={styles.aiText}>{profile.ai_profile_summary}</Text>
          </View>
        </View>

        {/* Reviews */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Đánh giá từ phụ huynh trước ({profile.reviews?.length || 0})</Text>
          {profile.reviews?.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có lượt đánh giá nào cho Carepartner này.</Text>
          ) : (
            <View style={styles.reviewList}>
              {profile.reviews?.map((r, idx) => (
                <View key={idx} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewerName}>{r.reviewer_name}</Text>
                    <Text style={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text>
                  </View>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <Ionicons key={i} name="star" size={12} color={i <= r.rating ? COLORS.warning : COLORS.border} />
                    ))}
                  </View>
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* CTA Footer */}
      {isPending && (
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.approveBtn, approving && { opacity: 0.7 }]}
            onPress={handleApprove} 
            disabled={approving}
            activeOpacity={0.85}
          >
            {approving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.approveBtnText}>CHẤP NHẬN BẠN NÀY LÀM VIỆC</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, ...SHADOWS.small },
  backBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1 },
  profileCard: { backgroundColor: COLORS.surface, padding: SIZES.lg, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border, overflow: 'hidden', position: 'relative' },
  profileHeaderBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 80, backgroundColor: COLORS.primaryLight },
  avatarWrap: { marginTop: 8, marginBottom: 4 },
  avatarRing: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center', ...SHADOWS.small },
  avatar: { width: 74, height: 74, borderRadius: 37, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { ...TYPO.h2, color: COLORS.textPrimary, marginTop: 8, marginBottom: 4 },
  roleLabel: { ...TYPO.bodySmall, color: COLORS.textSecondary, marginBottom: 20 },
  statsRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: SIZES.md, justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { ...TYPO.h4, color: COLORS.textPrimary },
  statLabel: { ...TYPO.caption, color: COLORS.textMuted, fontWeight: '600', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: COLORS.divider },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  section: { backgroundColor: COLORS.surface, marginVertical: SIZES.sm, padding: SIZES.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  sectionTitle: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '800', marginBottom: 12 },
  list: { gap: 10 },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  certText: { ...TYPO.body, color: COLORS.textPrimary },
  aiTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  aiBox: { backgroundColor: '#f5f3ff', borderRadius: SIZES.radiusSm, padding: 14, borderLeftWidth: 4, borderLeftColor: '#7c3aed', ...SHADOWS.small },
  aiText: { ...TYPO.body, color: '#5b21b6', lineHeight: 22, fontStyle: 'italic' },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted, fontStyle: 'italic' },
  reviewList: { gap: 12 },
  reviewCard: { borderLeftWidth: 3, borderLeftColor: COLORS.primarySoft, paddingLeft: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 12, gap: 6 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { ...TYPO.h5, color: COLORS.textPrimary },
  reviewDate: { ...TYPO.caption, color: COLORS.textMuted },
  stars: { flexDirection: 'row', gap: 2 },
  reviewComment: { ...TYPO.bodySmall, color: COLORS.textSecondary, lineHeight: 18 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  approveBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 56, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...SHADOWS.large },
  approveBtnText: { color: '#fff', ...TYPO.button, letterSpacing: 0.5 },
});
