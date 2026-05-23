import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getMyTasksAsParent } from '../../api/tasks';

const STATUS_MAP = {
  open:        { label: 'Đang tìm', color: '#f59e0b', bg: '#fffbeb' },
  in_progress: { label: 'Đang làm', color: '#0051d5', bg: '#eff6ff' },
  completed:   { label: 'Hoàn thành', color: '#059669', bg: '#f0fdf4' },
  cancelled:   { label: 'Đã huỷ',   color: '#6b7280', bg: '#f3f4f6' },
};

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
      <StatusBar barStyle="light-content" backgroundColor="#0051d5" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greetSmall}>Chào mừng 👋</Text>
            <Text style={styles.greetName}>{displayName}</Text>
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
            { text: 'Huỷ', style: 'cancel' },
            { text: 'Đăng xuất', style: 'destructive', onPress: logout },
          ])} style={styles.avatarBtn}>
            <Ionicons name="log-out-outline" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Nút đăng việc lớn */}
        <TouchableOpacity style={styles.postJobBtn} onPress={() => navigation.navigate('CreateTask')}>
          <View style={styles.postJobIcon}>
            <Ionicons name="add" size={28} color="#0051d5" />
          </View>
          <View style={styles.postJobTextGroup}>
            <Text style={styles.postJobTitle}>ĐĂNG VIỆC NGAY</Text>
            <Text style={styles.postJobSub}>Tìm Carepartner nhanh chóng & tin cậy</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Section: Việc gần đây */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Việc của bạn</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyTasks')}>
              <Text style={styles.seeAll}>Xem tất cả</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color="#0051d5" style={{ marginTop: 32 }} />
          ) : tasks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="briefcase-outline" size={40} color="#d1d5db" />
              <Text style={styles.emptyText}>Bạn chưa đăng việc nào.</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Đăng việc đầu tiên</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tasks.map((task) => {
              const st = STATUS_MAP[task.status] || STATUS_MAP.open;
              return (
                <TouchableOpacity key={task.id} style={styles.taskCard}
                  onPress={() => navigation.navigate('MyTasks')}>
                  <View style={styles.taskCardLeft}>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                    <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
                    <Text style={styles.taskMeta}>📍 {task.location}</Text>
                  </View>
                  <Text style={styles.taskPrice}>
                    {parseInt(task.price).toLocaleString('vi-VN')}đ
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Gợi ý danh mục */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danh mục phổ biến</Text>
          <View style={styles.categoriesGrid}>
            {[
              { icon: '📚', name: 'Gia sư' },
              { icon: '🚗', name: 'Đón trẻ' },
              { icon: '🧹', name: 'Dọn dẹp' },
              { icon: '👶', name: 'Trông trẻ' },
              { icon: '🛒', name: 'Mua sắm hộ' },
            ].map((cat) => (
              <TouchableOpacity key={cat.name} style={styles.catItem}
                onPress={() => navigation.navigate('CreateTask')}>
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text style={styles.catName}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#0051d5', paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greetSmall: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  greetName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  postJobBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  postJobIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  postJobTextGroup: { flex: 1 },
  postJobTitle: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  postJobSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  body: { flex: 1, paddingTop: 20 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  seeAll: { color: '#0051d5', fontWeight: '600', fontSize: 14 },
  taskCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  taskCardLeft: { flex: 1, marginRight: 12 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  taskTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  taskMeta: { fontSize: 12, color: '#6b7280' },
  taskPrice: { fontSize: 16, fontWeight: '800', color: '#0051d5' },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  emptyBtn: { backgroundColor: '#0051d5', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catItem: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center',
    width: '18%', minWidth: 60, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  catIcon: { fontSize: 24, marginBottom: 4 },
  catName: { fontSize: 10, fontWeight: '600', color: '#374151', textAlign: 'center' },
});
