import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkerProfile, approveCandidate } from '../../api/tasks';

export default function CandidateProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { workerId, applicationId, isPending } = route.params;
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

  if (isLoading) return <ActivityIndicator color="#0051d5" style={{ flex: 1, marginTop: 100 }} />;
  if (!profile) return null;

  const displayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ ứng viên</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.username?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.roleLabel}>Carepartner (Sinh viên)</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <View style={styles.starRow}>
                <Ionicons name="star" size={16} color="#f59e0b" />
                <Text style={styles.statValue}>{profile.avg_rating}</Text>
              </View>
              <Text style={styles.statLabel}>{profile.review_count} đánh giá</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.verifiedBadge}>
                <Ionicons name="shield-checkmark" size={16} color="#059669" />
                <Text style={[styles.statValue, { color: '#059669', fontSize: 13 }]}>Đã xác thực</Text>
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
                <Ionicons name="ribbon-outline" size={18} color="#0051d5" />
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
                    <Text style={styles.reviewDate}>{r.created_at}</Text>
                  </View>
                  <View style={styles.stars}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <Ionicons key={i} name="star" size={12} color={i <= r.rating ? "#f59e0b" : "#d1d5db"} />
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  body: { flex: 1 },
  profileCard: { backgroundColor: '#fff', padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#0051d5', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  name: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 4 },
  roleLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500', marginBottom: 20 },
  statsRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 16, justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#f3f4f6' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  section: { backgroundColor: '#fff', marginVertical: 8, padding: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  list: { gap: 10 },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  certText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  aiTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  aiBox: { backgroundColor: '#f5f3ff', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: '#7c3aed' },
  aiText: { fontSize: 14, color: '#5b21b6', lineHeight: 22, fontStyle: 'italic' },
  emptyText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  reviewList: { gap: 12 },
  reviewCard: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 12, gap: 6 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewerName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reviewDate: { fontSize: 11, color: '#9ca3af' },
  stars: { flexDirection: 'row', gap: 2 },
  reviewComment: { fontSize: 13, color: '#4b5563', lineHeight: 18 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  approveBtn: { backgroundColor: '#0051d5', borderRadius: 16, height: 56, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: '#0051d5', shadowOpacity: 0.4, shadowRadius: 16, elevation: 6 },
  approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
});
