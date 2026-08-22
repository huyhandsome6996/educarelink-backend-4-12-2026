// ============================================================
// CareDiaryHistoryScreen — Lịch sử nhật ký chăm sóc (B1)
// Hiển thị danh sách rút gọn các buổi đã có nhật ký,
// sắp xếp mới nhất trên đầu. Bấm vào xem chi tiết.
// ============================================================

import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {COLORS, SHADOWS, TYPO} from '../../theme/colors';
import { getCareDiaryHistory } from '../../api/careDiary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MOOD_ICONS = {
  happy: { name: 'happy', color: COLORS.success },
  sad: { name: 'sad', color: COLORS.error },
  'alert-circle': { name: 'alert-circle', color: COLORS.warning },
  'thumbs-up': { name: 'thumbs-up', color: COLORS.primary },
};

export default function CareDiaryHistoryScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await getCareDiaryHistory();
      setData(res.data || []);
    } catch (err) {
      if (!isRefresh) {
        setError(err.response?.data?.error || 'Không thể tải lịch sử nhật ký.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const renderItem = ({ item }) => {
    const mood = MOOD_ICONS[item.mood?.icon] || MOOD_ICONS.happy;
    const pct = item.completion_percent || 0;
    const pctColor = pct >= 80 ? COLORS.success : pct >= 50 ? COLORS.primary : COLORS.warning;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('CareDiaryDetail', { taskId: item.task_id, taskTitle: item.task_title })}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.task_title}</Text>
            <Text style={styles.cardDate}>{item.date}</Text>
          </View>
          <View style={[styles.pctBadge, { backgroundColor: pctColor + '18' }]}>
            <Text style={[styles.pctText, { color: pctColor }]}>{pct}%</Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.moodChip}>
            <Ionicons name={mood.name} size={14} color={mood.color} />
            <Text style={[styles.moodText, { color: mood.color }]}>{item.mood?.label || 'Bình thường'}</Text>
          </View>
          <View style={styles.workerInfo}>
            <Ionicons name="person-outline" size={13} color={COLORS.onSurfaceVariant} />
            <Text style={styles.workerName}>{item.worker_name}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // === LOADING ===
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLow} />
        <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.appBarBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button" accessibilityLabel="Quay lại">
            <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>Lịch sử nhật ký</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.centerSpinner}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surfaceContainerLow} />

      {/* App Bar */}
      <View style={[styles.appBar, { paddingTop: insets.top + 32 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.appBarBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel="Quay lại">
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Lịch sử nhật ký</Text>
        <View style={{ width: 44 }} />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.onSurfaceVariant} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData()} activeOpacity={0.85}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.task_id)}
          renderItem={renderItem}
          contentContainerStyle={data.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="book-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có nhật ký nào</Text>
              <Text style={styles.emptyText}>Khi CarePartner ghi nhật ký sau buổi chăm sóc, bạn sẽ thấy các buổi ở đây để theo dõi tiến bộ của bé.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  loadingContainer: { flex: 1, backgroundColor: COLORS.surfaceWarm },
  centerSpinner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // === APP BAR ===
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12, backgroundColor: COLORS.surfaceContainerLow,
  },
  appBarBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { ...TYPO.h2, color: COLORS.primary, flex: 1, textAlign: 'center', marginRight: 44 },
  // === LIST ===
  list: { padding: 20, gap: 12 },
  emptyList: { flexGrow: 1 },
  // === CARD ===
  card: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: COLORS.outlineVariant, gap: 12, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTopLeft: { flex: 1, marginRight: 12, gap: 4 },
  cardTitle: { ...TYPO.h4, color: COLORS.onSurface },
  cardDate: { ...TYPO.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pctText: { ...TYPO.caption, fontWeight: '800' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moodChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.surfaceContainerLow, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  moodText: { fontSize: 12, fontWeight: '600' },
  workerInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  workerName: { ...TYPO.caption, color: COLORS.onSurfaceVariant },
  // === ERROR ===
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  errorText: { ...TYPO.body, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, ...SHADOWS.large },
  retryBtnText: { ...TYPO.button, color: COLORS.textOnPrimary },
  // === EMPTY ===
  emptyBox: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center',
    marginBottom: 4, ...SHADOWS.small,
  },
  emptyTitle: { ...TYPO.h4, color: COLORS.onSurface },
  emptyText: { ...TYPO.bodySmall, color: COLORS.onSurfaceVariant, textAlign: 'center' },
});
