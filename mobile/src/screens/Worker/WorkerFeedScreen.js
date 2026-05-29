import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, TextInput, Platform, Alert, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getAllTasks, applyTask, getMyJobsAsWorker } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

const CATEGORY_MAP = [
  { id: 1, icon: require('../../../assets/images/icon_tutoring.png'), name: 'Gia sư', color: COLORS.primary },
  { id: 2, icon: require('../../../assets/images/icon_pickup.png'), name: 'Đón trẻ', color: COLORS.primary },
  { id: 3, icon: require('../../../assets/images/icon_cleaning.png'), name: 'Dọn dẹp', color: COLORS.primary },
  { id: 4, icon: require('../../../assets/images/icon_babysitting.png'), name: 'Trông trẻ', color: COLORS.primary },
  { id: 5, icon: require('../../../assets/images/icon_shopping.png'), name: 'Mua sắm', color: COLORS.primary },
  { id: 6, icon: require('../../../assets/images/icon_cooking.png'), name: 'Nấu ăn', color: COLORS.primary },
  { id: 7, icon: require('../../../assets/images/icon_moving.png'), name: 'Chuyển đồ', color: COLORS.primary },
  { id: 8, icon: require('../../../assets/images/icon_other.png'), name: 'Khác', color: COLORS.primary },
];

export default function WorkerFeedScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedTaskIds, setAppliedTaskIds] = useState([]);

  const fetchTasks = async () => {
    try {
      const res = await getAllTasks();
      // Chỉ hiện các việc đang 'open'
      setTasks(res.data.filter(t => t.status === 'open'));

      // Lấy danh sách việc sinh viên đã ứng tuyển
      const jobsRes = await getMyJobsAsWorker();
      const ids = jobsRes.data.map(job => job.task);
      setAppliedTaskIds(ids);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleApply = (taskId) => {
    const startApply = async () => {
      try {
        const res = await applyTask(taskId);
        setAppliedTaskIds(prev => [...prev, taskId]);
        if (Platform.OS === 'web') {
          alert('✅ Thành công! Đã ứng tuyển!');
        } else {
          Alert.alert('✅', res.data.message || 'Đã ứng tuyển!');
        }
      } catch (e) {
        const msg = e.response?.data?.error || e.response?.data?.message || 'Thao tác thất bại.';
        if (Platform.OS === 'web') {
          alert(`Thông báo: ${msg}`);
        } else {
          Alert.alert('Thông báo', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Bạn muốn ứng tuyển việc này?')) {
        startApply();
      }
    } else {
      Alert.alert('Ứng tuyển', 'Bạn muốn ứng tuyển việc này?', [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Ứng tuyển', onPress: startApply },
      ]);
    }
  };


  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.location.toLowerCase().includes(search.toLowerCase())
  );

  const displayName = user?.first_name || user?.username || 'Bạn';

  const renderItem = ({ item: task }) => {
    const hasApplied = appliedTaskIds.includes(task.id);
    const cat = CATEGORY_MAP.find(c => c.id === task.category) || CATEGORY_MAP[7];
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.9}
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}>
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={[styles.categoryPill, { backgroundColor: cat.color + '15' }]}>
            <Image source={cat.icon} style={styles.catImage} resizeMode="contain" />
            <Text style={[styles.categoryPillText, { color: cat.color }]}>{cat.name}</Text>
          </View>
          <Text style={styles.cardPrice}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Title */}
        <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>

        {/* Meta info */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <View style={styles.metaIconBox}>
              <Ionicons name="time-outline" size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.metaText}>{new Date(task.scheduled_time).toLocaleString('vi-VN')}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaIconBox}>
              <Ionicons name="location-outline" size={14} color={COLORS.primary} />
            </View>
            <Text style={styles.metaText}>{task.location}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.parentInfo}>
            <View style={styles.parentAvatar}>
              <Text style={styles.parentAvatarText}>{task.parent_name?.[0]?.toUpperCase() || 'P'}</Text>
            </View>
            <Text style={styles.parentLabel}>{task.parent_name}</Text>
          </View>
          <TouchableOpacity
            style={[styles.applyBtn, hasApplied && styles.applyBtnDisabled]}
            onPress={() => handleApply(task.id)}
            disabled={hasApplied}
            activeOpacity={0.85}
          >
            <Ionicons name={hasApplied ? "checkmark" : "paper-plane"} size={14} color="#fff" />
            <Text style={styles.applyBtnText}>{hasApplied ? 'Đã ứng tuyển' : 'Ứng tuyển'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
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
          <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Tìm kiếm công việc..."
            placeholderTextColor={COLORS.textMuted} value={search} onChangeText={setSearch} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={i => i.id.toString()} renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTasks(); }} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <Text style={styles.listHeader}>{filtered.length} việc làm mới nhất</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="search-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Không tìm thấy công việc</Text>
              <Text style={styles.emptyText}>Kéo xuống để làm mới danh sách</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // === HEADER ===
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerGreet: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  headerName: { color: '#fff', fontSize: 22, fontWeight: '900' },
  notifBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: SIZES.radiusMd,
    paddingHorizontal: 14, height: 48, gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary },
  // === LIST ===
  list: { padding: 16, paddingBottom: 30 },
  listHeader: {
    fontSize: 12, fontWeight: '800', color: COLORS.textMuted,
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 16,
    marginBottom: 12,
    ...SHADOWS.small,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  categoryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  catImage: { width: 16, height: 16 },
  categoryPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  cardPrice: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 10, lineHeight: 22 },
  // === META ===
  metaSection: { gap: 6, marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  metaIconBox: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  metaText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  // === FOOTER ===
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  parentInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parentAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.primarySoft, justifyContent: 'center', alignItems: 'center',
  },
  parentAvatarText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  parentLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  applyBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  applyBtnDisabled: { backgroundColor: COLORS.textMuted, opacity: 0.8 },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  // === EMPTY ===
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
});
