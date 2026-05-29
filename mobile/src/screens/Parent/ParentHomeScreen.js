import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, ActivityIndicator, RefreshControl, Platform, Dimensions, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyTasksAsParent } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CATEGORY_SIZE = (SCREEN_WIDTH - 48 - 36) / 4; // 4 columns with gaps

const STATUS_MAPPING = {
  open: { label: 'Đang tìm', color: COLORS.warning, bg: COLORS.warningBg, icon: 'search' },
  in_progress: { label: 'Đang làm', color: COLORS.primary, bg: COLORS.primaryLight, icon: 'construct' },
  completed: { label: 'Hoàn thành', color: COLORS.success, bg: COLORS.successBg, icon: 'checkmark-circle' },
  cancelled:   { label: 'Đã huỷ',   color: COLORS.textMuted, bg: '#f3f4f6', icon: 'close-circle' },
};

const CATEGORIES = [
  { icon: require('../../../assets/images/icon_tutoring.png'), name: 'Gia sư', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_pickup.png'), name: 'Đón trẻ', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_cleaning.png'), name: 'Dọn dẹp', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_babysitting.png'), name: 'Trông trẻ', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_shopping.png'), name: 'Mua sắm', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_cooking.png'), name: 'Nấu ăn', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_moving.png'), name: 'Chuyển đồ', color: COLORS.primary },
  { icon: require('../../../assets/images/icon_other.png'), name: 'Khác', color: COLORS.primary },
];

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasksAsParent();
      setTasks(res.data.slice(0, 3)); // Hiển thị 3 việc gần nhất trên trang chủ
    } catch (e) {
      console.error('Lỗi tải danh sách việc:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchTasks(); };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Phụ huynh';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header gradient cam */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greetSmall}>Xin chào 👋</Text>
            <Text style={styles.greetName}>{displayName}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn}>
              <Ionicons name="notifications-outline" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                  logout();
                }
              } else {
                Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
                  { text: 'Huỷ', style: 'cancel' },
                  { text: 'Đăng xuất', style: 'destructive', onPress: logout },
                ]);
              }
            }} style={styles.headerIconBtn}>
              <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh tìm kiếm / Nút đăng việc */}
        <TouchableOpacity style={styles.searchBar} onPress={() => navigation.navigate('CreateTask')} activeOpacity={0.9}>
          <View style={styles.searchIconCircle}>
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </View>
          <View style={styles.searchTextGroup}>
            <Text style={styles.searchTitle}>Bạn cần tìm dịch vụ gì?</Text>
            <Text style={styles.searchSub}>Đăng việc ngay để tìm Carepartner</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Section: Danh mục dịch vụ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dịch vụ</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CreateTask')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoriesGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity key={cat.name} style={styles.catItem}
                onPress={() => navigation.navigate('CreateTask')}
                activeOpacity={0.7}
              >
                <View style={[styles.catIconBg, { backgroundColor: cat.color + '15' }]}>
                  <Image source={cat.icon} style={styles.catImage} resizeMode="contain" />
                </View>
                <Text style={styles.catName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section: Việc gần đây */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Việc gần đây</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyTasks')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 32 }} />
          ) : tasks.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="document-text-outline" size={36} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có hoạt động nào</Text>
              <Text style={styles.emptyText}>Hãy đăng việc đầu tiên để tìm Carepartner phù hợp!</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} style={styles.emptyBtn} activeOpacity={0.85}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.emptyBtnText}>Đăng việc ngay</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tasks.map((task) => {
              const st = STATUS_MAPPING[task.status] || STATUS_MAPPING.open;
              return (
                <TouchableOpacity key={task.id} style={styles.taskCard}
                  onPress={() => navigation.navigate('MyTasks')}
                  activeOpacity={0.9}>
                  <View style={styles.taskCardRow}>
                    <View style={[styles.taskIconCircle, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={20} color={st.color} />
                    </View>
                    <View style={styles.taskCardContent}>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                      <View style={styles.taskMetaRow}>
                        <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
                        <Text style={styles.taskMeta} numberOfLines={1}>{task.location}</Text>
                      </View>
                    </View>
                    <Text style={styles.taskPrice}>
                      {parseInt(task.price).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
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
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greetSmall: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  greetName: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerIconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  searchBar: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: SIZES.radiusMd, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  searchIconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  searchTextGroup: { flex: 1 },
  searchTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  searchSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  // === BODY ===
  body: { flex: 1, marginTop: -4 },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.textPrimary },
  seeAll: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  // === CATEGORIES ===
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catItem: {
    width: CATEGORY_SIZE, alignItems: 'center', gap: 8,
  },
  catIconBg: {
    width: CATEGORY_SIZE - 8, height: CATEGORY_SIZE - 8,
    borderRadius: SIZES.radiusMd, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
    backgroundColor: COLORS.surface,
  },
  catImage: { width: 34, height: 34 },
  catName: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary, textAlign: 'center' },
  // === TASK CARDS ===
  taskCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 10,
    ...SHADOWS.small,
  },
  taskCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  taskIconCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  taskCardContent: { flex: 1, gap: 4 },
  statusBadge: {
    alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  taskMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskMeta: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  taskPrice: { fontSize: 15, fontWeight: '900', color: COLORS.primary },
  // === EMPTY STATE ===
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },
  emptyText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  emptyBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd,
    paddingHorizontal: 24, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    ...SHADOWS.large,
    marginTop: 4,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
