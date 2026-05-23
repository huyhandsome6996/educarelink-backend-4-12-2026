import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getAllTasks, applyTask } from '../../api/tasks';
import { Alert } from 'react-native';

const TAG_COLORS = {
  open:        { label: 'MỚI', color: '#7c3aed', bg: '#f5f3ff' },
};

export default function WorkerFeedScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchTasks = async () => {
    try {
      const res = await getAllTasks();
      // Chỉ hiện các việc đang 'open'
      setTasks(res.data.filter(t => t.status === 'open'));
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleApply = async (taskId) => {
    Alert.alert('Ứng tuyển', 'Bạn muốn ứng tuyển việc này?', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Ứng tuyển', onPress: async () => {
        try {
          const res = await applyTask(taskId);
          Alert.alert('✅', res.data.message || 'Đã ứng tuyển!');
        } catch (e) {
          Alert.alert('Thông báo', e.response?.data?.error || e.response?.data?.message || 'Thao tác thất bại.');
        }
      }},
    ]);
  };

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.location.toLowerCase().includes(search.toLowerCase())
  );

  const displayName = user?.first_name || user?.username || 'Bạn';

  const renderItem = ({ item: task }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.9}
      onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}>
      <View style={styles.cardTop}>
        <View style={styles.newTag}>
          <Ionicons name="flash" size={11} color="#7c3aed" />
          <Text style={styles.newTagText}>MỚI</Text>
        </View>
        <Text style={styles.cardPrice}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>
      <View style={styles.cardMeta}>
        <Ionicons name="time-outline" size={13} color="#6b7280" />
        <Text style={styles.cardMetaText}>{new Date(task.scheduled_time).toLocaleString('vi-VN')}</Text>
      </View>
      <View style={styles.cardMeta}>
        <Ionicons name="location-outline" size={13} color="#6b7280" />
        <Text style={styles.cardMetaText}>{task.location}</Text>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.parentLabel}>Phụ huynh: {task.parent_name}</Text>
        <TouchableOpacity style={styles.applyBtn} onPress={() => handleApply(task.id)}>
          <Text style={styles.applyBtnText}>Ứng tuyển</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0d9488" />
      {/* Header xanh */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerGreet}>Carepartner</Text>
            <Text style={styles.headerName}>Chào, {displayName}!</Text>
          </View>
          <View style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.9)" />
          </View>
        </View>
        {/* Search bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#6b7280" />
          <TextInput style={styles.searchInput} placeholder="Tìm kiếm công việc..."
            placeholderTextColor="#9ca3af" value={search} onChangeText={setSearch} />
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#0d9488" style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); }} />}
          ListHeaderComponent={<Text style={styles.listHeader}>{filtered.length} việc làm mới nhất</Text>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Không tìm thấy công việc nào</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#0d9488', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerGreet: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  headerName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, height: 46, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  list: { padding: 16, gap: 12 },
  listHeader: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  newTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f5f3ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  newTagText: { fontSize: 10, fontWeight: '800', color: '#7c3aed', letterSpacing: 1 },
  cardPrice: { fontSize: 18, fontWeight: '800', color: '#0d9488' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  cardMetaText: { fontSize: 12, color: '#6b7280', flex: 1 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  parentLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  applyBtn: { backgroundColor: '#0051d5', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
});
