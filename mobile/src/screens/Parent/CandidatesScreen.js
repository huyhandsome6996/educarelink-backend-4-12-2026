import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCandidates, approveCandidate, getWorkerProfile } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

export default function CandidatesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, taskTitle } = route.params || {};
  const [candidates, setCandidates] = useState([]);
  const [workerRatings, setWorkerRatings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCandidates(taskId)
      .then(res => {
        setCandidates(res.data);
        // Fetch ratings cho từng worker
        res.data.forEach(c => {
          getWorkerProfile(c.worker)
            .then(profileRes => {
              setWorkerRatings(prev => ({
                ...prev,
                [c.worker]: {
                  avg: profileRes.data.avg_rating || 0,
                  count: profileRes.data.review_count || 0
                }
              }));
            })
            .catch(() => {}); // Bỏ qua lỗi rating
        });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  const handleApprove = async (appId, workerName) => {
    const startApprove = async () => {
      try {
        const res = await approveCandidate(appId);
        if (Platform.OS === 'web') {
          alert(`✅ Đã nhận! ${res.data.message}`);
          navigation.goBack();
        } else {
          Alert.alert('✅ Đã nhận!', res.data.message, [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        }
      } catch (e) {
        const msg = e.response?.data?.error || 'Thao tác thất bại.';
        if (Platform.OS === 'web') {
          alert(`Lỗi: ${msg}`);
        } else {
          Alert.alert('Lỗi', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Xác nhận: Chấp nhận ${workerName} làm việc này?\nCác ứng viên khác sẽ tự động bị từ chối.`)) {
        startApprove();
      }
    } else {
      Alert.alert('Xác nhận', `Chấp nhận ${workerName} làm việc này?\nCác ứng viên khác sẽ tự động bị từ chối.`, [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Chấp nhận', style: 'default', onPress: startApprove },
      ]);
    }
  };


  const renderCandidate = ({ item: c }) => (
    <TouchableOpacity 
      style={[styles.card, { borderLeftColor: c.status === 'accepted' ? COLORS.success : COLORS.warning }]}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('CandidateProfile', { 
        workerId: c.worker, 
        applicationId: c.id, 
        isPending: c.status === 'pending' 
      })}
    >
      <View style={styles.cardTop}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{c.worker_name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{c.worker_name}</Text>
          <View style={styles.stars}>
            {[1,2,3,4,5].map(i => <Ionicons key={i} name={workerRatings[c.worker]?.avg >= i ? 'star' : 'star-outline'} size={12} color={COLORS.warning} />)}
            <Text style={styles.starsText}> {workerRatings[c.worker]?.avg?.toFixed(1) || 'N/A'}</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={12} color={COLORS.success} />
            <Text style={styles.badgeText}>Đã xác thực</Text>
          </View>
        </View>
        <View style={[styles.statusPill, c.status === 'accepted' ? styles.accepted : styles.pending]}>
          <Text style={styles.statusPillText}>{c.status === 'accepted' ? 'Đã chọn' : 'Chờ'}</Text>
        </View>
      </View>
      {c.status === 'pending' && (
        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(c.id, c.worker_name)} activeOpacity={0.85}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.approveBtnText}>Chấp nhận bạn này</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Danh sách ứng viên</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{taskTitle}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={candidates} keyExtractor={i => i.id.toString()} renderItem={renderCandidate}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.countText}>{candidates.length} Carepartner đã ứng tuyển</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="people-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có ứng viên</Text>
              <Text style={styles.emptyText}>Các Carepartner sẽ sớm ứng tuyển</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12, ...SHADOWS.small },
  backBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1 },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  headerSub: { ...TYPO.bodySmall, color: COLORS.textSecondary },
  list: { padding: SIZES.md, gap: 12 },
  countText: { ...TYPO.h5, color: COLORS.textPrimary, marginBottom: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md, borderLeftWidth: 4, borderLeftColor: COLORS.primary, ...SHADOWS.cardHover, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', ...SHADOWS.small },
  avatarText: { color: '#fff', ...TYPO.h3, color: '#fff' },
  info: { flex: 1, gap: 4 },
  name: { ...TYPO.h4, color: COLORS.textPrimary },
  stars: { flexDirection: 'row', alignItems: 'center' },
  starsText: { ...TYPO.bodySmall, fontWeight: '700', color: COLORS.textPrimary },
  badge: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  badgeText: { ...TYPO.caption, color: COLORS.success, fontWeight: '600' },
  statusPill: { borderRadius: SIZES.radiusFull, paddingHorizontal: 12, paddingVertical: 5 },
  accepted: { backgroundColor: COLORS.successBg },
  pending: { backgroundColor: COLORS.warningBg },
  statusPillText: { ...TYPO.caption, color: COLORS.textPrimary },
  approveBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusSm, height: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SIZES.sm, ...SHADOWS.large },
  approveBtnText: { color: '#fff', ...TYPO.buttonSmall },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 4, ...SHADOWS.small },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },
});
