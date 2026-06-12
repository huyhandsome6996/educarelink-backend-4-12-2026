import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent, getCandidates } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';

const TABS = [
  { key: 'open',        label: 'Đang tìm' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed',   label: 'Lịch sử' },
];

const STATUS_COLOR = {
  open:        { text: COLORS.warning, bg: COLORS.warningBg },
  in_progress: { text: COLORS.primary, bg: COLORS.primaryLight },
  completed:   { text: COLORS.success, bg: COLORS.successBg },
  cancelled:   { text: COLORS.textMuted, bg: '#f3f4f6' },
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
      <View style={[styles.card, { borderLeftColor: st.text }]}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.text }]}>{task.status.replace('_',' ')}</Text>
          </View>
          <Text style={styles.price}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{task.location}</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="time-outline" size={13} color={COLORS.textSecondary} />
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
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
            onPress={async () => {
              try {
                const candRes = await getCandidates(task.id);
                const accepted = candRes.data.find(c => c.status === 'accepted');
                navigation.navigate('Review', {
                  taskId: task.id,
                  revieweeId: accepted ? accepted.worker : null
                });
              } catch (e) {
                navigation.navigate('Review', { taskId: task.id });
              }
            }}>
            <Ionicons name="star-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Đánh giá Carepartner</Text>
          </TouchableOpacity>
        )}
        {task.status === 'completed' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
            onPress={async () => {
              try {
                const candRes = await getCandidates(task.id);
                const accepted = candRes.data.find(c => c.status === 'accepted');
                navigation.navigate('Review', {
                  taskId: task.id,
                  revieweeId: accepted ? accepted.worker : null
                });
              } catch (e) {
                navigation.navigate('Review', { taskId: task.id });
              }
            }}>
            <Ionicons name="star-outline" size={16} color="#fff" />
            <Text style={styles.actionBtnText}>Đánh giá Carepartner</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Việc của tôi</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={COLORS.primary} />
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
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-outline" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không có việc nào</Text>
              <Text style={styles.emptyText}>Trong mục này chưa có việc nào</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface, ...SHADOWS.small },
  headerTitle: { ...TYPO.h2, color: COLORS.textPrimary },
  addBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', ...SHADOWS.small },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: SIZES.sm },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2.5, borderBottomColor: 'transparent', borderRadius: SIZES.radiusXs },
  tabActive: { borderBottomColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  tabText: { ...TYPO.bodySmall, color: COLORS.textSecondary, fontWeight: '600' },
  tabTextActive: { ...TYPO.buttonSmall, color: COLORS.primary },
  list: { padding: SIZES.md, gap: 12 },
  card: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: SIZES.md, borderLeftWidth: 4, borderLeftColor: COLORS.primary, ...SHADOWS.cardHover, gap: SIZES.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderRadius: SIZES.radiusXs, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { ...TYPO.caption },
  price: { ...TYPO.h4, fontWeight: '900', color: COLORS.primary },
  title: { ...TYPO.h4, color: COLORS.textPrimary },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { ...TYPO.bodySmall, color: COLORS.textSecondary, flex: 1 },
  actionBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusSm, height: 46, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: SIZES.sm, marginTop: SIZES.xs, ...SHADOWS.large },
  actionBtnText: { color: '#fff', ...TYPO.buttonSmall },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 4, ...SHADOWS.small },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },
});
