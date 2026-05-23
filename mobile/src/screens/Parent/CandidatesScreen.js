import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getCandidates, approveCandidate } from '../../api/tasks';

export default function CandidatesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, taskTitle } = route.params;
  const [candidates, setCandidates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCandidates(taskId)
      .then(res => setCandidates(res.data))
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
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{c.worker_name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{c.worker_name}</Text>
          <View style={styles.stars}>
            {[1,2,3,4,5].map(i => <Ionicons key={i} name="star" size={12} color="#f59e0b" />)}
            <Text style={styles.starsText}> 5.0</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={12} color="#059669" />
            <Text style={styles.badgeText}>Đã xác thực</Text>
          </View>
        </View>
        <View style={[styles.statusPill, c.status === 'accepted' ? styles.accepted : styles.pending]}>
          <Text style={styles.statusPillText}>{c.status === 'accepted' ? 'Đã chọn' : 'Chờ'}</Text>
        </View>
      </View>
      {c.status === 'pending' && (
        <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(c.id, c.worker_name)}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.approveBtnText}>Chấp nhận bạn này</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Danh sách ứng viên</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{taskTitle}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#0051d5" style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={candidates} keyExtractor={i => i.id.toString()} renderItem={renderCandidate}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.countText}>{candidates.length} Carepartner đã ứng tuyển</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Chưa có ứng viên nào</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6b7280' },
  list: { padding: 16, gap: 12 },
  countText: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#0051d5', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#111827' },
  stars: { flexDirection: 'row', alignItems: 'center' },
  starsText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  badge: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  badgeText: { fontSize: 11, color: '#059669', fontWeight: '600' },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  accepted: { backgroundColor: '#f0fdf4' },
  pending: { backgroundColor: '#fffbeb' },
  statusPillText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  approveBtn: { backgroundColor: '#0051d5', borderRadius: 12, height: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
});
