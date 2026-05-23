import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent } from '../../api/tasks';

const TABS = [
  { key: 'open',        label: 'Đang tìm' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed',   label: 'Lịch sử' },
];

const STATUS_COLOR = {
  open:        { text: '#f59e0b', bg: '#fffbeb' },
  in_progress: { text: '#0051d5', bg: '#eff6ff' },
  completed:   { text: '#059669', bg: '#f0fdf4' },
  cancelled:   { text: '#6b7280', bg: '#f3f4f6' },
};

export default function MyTasksScreen() {
  const navigation = useNavigation();
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasksAsParent();
      setTasks(res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTasks(); }, []);

  const filtered = tasks.filter(t => {
    if (activeTab === 'completed') return ['completed', 'cancelled'].includes(t.status);
    return t.status === activeTab;
  });

  const renderItem = ({ item: task }) => {
    const st = STATUS_COLOR[task.status] || STATUS_COLOR.open;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.text }]}>{task.status.replace('_',' ')}</Text>
          </View>
          <Text style={styles.price}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={13} color="#6b7280" />
          <Text style={styles.metaText}>{task.location}</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="time-outline" size={13} color="#6b7280" />
          <Text style={styles.metaText}>
            {new Date(task.scheduled_time).toLocaleString('vi-VN')}
          </Text>
        </View>
        {task.status === 'open' && (
          <TouchableOpacity style={styles.actionBtn}
            onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}>
            <Text style={styles.actionBtnText}>Xem ứng viên</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </TouchableOpacity>
        )}
        {task.status === 'in_progress' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#059669' }]}
            onPress={() => navigation.navigate('Review', { taskId: task.id })}>
            <Ionicons name="star-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Đánh giá Carepartner</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Việc của tôi</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#0051d5" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}>
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#0051d5" style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>Không có việc nào trong mục này</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0051d5' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#0051d5', fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  price: { fontSize: 16, fontWeight: '800', color: '#0051d5' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { fontSize: 12, color: '#6b7280', flex: 1 },
  actionBtn: { backgroundColor: '#0051d5', borderRadius: 12, height: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
});
