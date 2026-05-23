import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyJobsAsWorker } from '../../api/tasks';

const TABS = [
  { key: 'pending',  label: 'Chờ duyệt' },
  { key: 'accepted', label: 'Sắp làm' },
  { key: 'rejected', label: 'Lịch sử' },
];

const STATUS_STYLE = {
  pending:  { color: '#f59e0b', bg: '#fffbeb', label: 'Chờ duyệt' },
  accepted: { color: '#0051d5', bg: '#eff6ff', label: 'Đã nhận' },
  rejected: { color: '#6b7280', bg: '#f3f4f6', label: 'Bị từ chối' },
};

export default function MyJobsScreen() {
  const [applications, setApplications] = useState([]);
  const [activeTab, setActiveTab] = useState('accepted');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = async () => {
    try {
      const res = await getMyJobsAsWorker();
      setApplications(res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchJobs(); }, []);

  const filtered = applications.filter(a => {
    if (activeTab === 'rejected') return ['rejected', 'completed'].includes(a.status);
    return a.status === activeTab;
  });

  const totalEarned = applications
    .filter(a => a.status === 'accepted')
    .reduce((sum, a) => sum + parseFloat(a.task_price || 0), 0);

  const renderItem = ({ item: app }) => {
    const st = STATUS_STYLE[app.status] || STATUS_STYLE.rejected;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={styles.price}>
            {parseInt(app.task_price || 0).toLocaleString('vi-VN')}đ
          </Text>
        </View>
        <Text style={styles.title}>{app.task_title}</Text>
        <View style={styles.meta}>
          <Ionicons name="time-outline" size={13} color="#6b7280" />
          <Text style={styles.metaText}>
            {app.task_scheduled_time ? new Date(app.task_scheduled_time).toLocaleString('vi-VN') : 'Chưa có'}
          </Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={13} color="#6b7280" />
          <Text style={styles.metaText}>{app.task_location || 'Không có địa điểm'}</Text>
        </View>
        {/* Thông tin phụ huynh */}
        {app.parent_username && (
          <View style={styles.parentCard}>
            <View style={styles.parentAvatar}>
              <Text style={styles.parentAvatarText}>{app.parent_username?.[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <View>
              <Text style={styles.parentLabel}>Phụ huynh</Text>
              <Text style={styles.parentName}>{app.parent_username}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Việc của tôi</Text>
        {totalEarned > 0 && (
          <View style={styles.earningsBadge}>
            <Text style={styles.earningsText}>💰 {totalEarned.toLocaleString('vi-VN')}đ</Text>
          </View>
        )}
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
        <ActivityIndicator color="#0d9488" style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} />}
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
  earningsBadge: { backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  earningsText: { fontSize: 13, fontWeight: '700', color: '#059669' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0d9488' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#0d9488', fontWeight: '700' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  price: { fontSize: 16, fontWeight: '800', color: '#0d9488' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { fontSize: 12, color: '#6b7280', flex: 1 },
  parentCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#eff6ff', borderRadius: 12, padding: 10, marginTop: 4 },
  parentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0051d5', justifyContent: 'center', alignItems: 'center' },
  parentAvatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  parentLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' },
  parentName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
});
