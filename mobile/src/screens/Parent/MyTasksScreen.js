import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getMyTasksAsParent, getCandidates, updateTaskStatus } from '../../api/tasks';
import { checkConsent } from '../../api/tracking';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';

const TABS = [
  { key: 'open',        label: 'Đang tìm' },
  { key: 'in_progress', label: 'Đang làm' },
  { key: 'completed',   label: 'Lịch sử' },
];

const STATUS_COLOR = {
  open:        { text: COLORS.warning, bg: COLORS.warningBg, label: 'Đang tìm' },
  in_progress: { text: COLORS.primary, bg: COLORS.primaryLight, label: 'Đang làm' },
  completed:   { text: COLORS.success, bg: COLORS.successBg, label: 'Hoàn thành' },
  cancelled:   { text: COLORS.textMuted, bg: '#f3f4f6', label: 'Đã huỷ' },
};

export default function MyTasksScreen() {
  const navigation = useNavigation();
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('open');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchTasks = async () => {
    try {
      const res = await getMyTasksAsParent();
      setTasks(res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchTasks(); }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, []);

  const handleStatusChange = (taskId, newStatus, taskTitle) => {
    const confirm = () => {
      Alert.alert(
        newStatus === 'completed' ? 'Hoàn thành công việc' : 'Huỷ công việc',
        newStatus === 'completed'
          ? `Xác nhận "${taskTitle}" đã hoàn thành? Tiền sẽ được giải ngân cho Carepartner.`
          : `Xác nhận huỷ "${taskTitle}"? Nếu đã thanh toán MoMo, tiền sẽ được hoàn lại.`,
        [
          { text: 'Huỷ', style: 'cancel' },
          {
            text: newStatus === 'completed' ? 'Hoàn thành' : 'Huỷ việc',
            style: newStatus === 'completed' ? 'default' : 'destructive',
            onPress: async () => {
              setActionLoading(`${taskId}-${newStatus}`);
              try {
                await updateTaskStatus(taskId, newStatus);
                Alert.alert('✅ Thành công', newStatus === 'completed' ? 'Công việc đã hoàn thành.' : 'Công việc đã huỷ.');
                fetchTasks();
              } catch (e) {
                const msg = e.response?.data?.error || 'Thao tác thất bại.';
                Alert.alert('Lỗi', msg);
              } finally {
                setActionLoading(null);
              }
            }
          },
        ]
      );
    };
    confirm();
  };

  const handleSetupPayment = async (task) => {
    // Lấy worker được accept (nếu có)
    try {
      const candRes = await getCandidates(task.id);
      const accepted = candRes.data.find(c => c.status === 'accepted');
      navigation.navigate('PaymentSetup', {
        taskId: task.id,
        taskTitle: task.title,
        taskPrice: task.price,
      });
    } catch (e) {
      navigation.navigate('PaymentSetup', {
        taskId: task.id,
        taskTitle: task.title,
        taskPrice: task.price,
      });
    }
  };

  const filtered = tasks.filter(t => {
    if (activeTab === 'completed') return ['completed', 'cancelled'].includes(t.status);
    return t.status === activeTab;
  });

  const renderItem = ({ item: task }) => {
    const st = STATUS_COLOR[task.status] || STATUS_COLOR.open;
    const isCompleting = actionLoading === `${task.id}-completed`;
    const isCancelling = actionLoading === `${task.id}-cancelled`;

    return (
      <View style={[styles.card, { borderLeftColor: st.text }]}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
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

        {/* Action buttons theo trạng thái */}
        {task.status === 'open' && (
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]}
              onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
              activeOpacity={0.85}>
              <Ionicons name="people-outline" size={16} color="#fff" />
              <Text style={styles.btnTextPrimary}>Xem ứng viên</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnDangerOutline]}
              onPress={() => handleStatusChange(task.id, 'cancelled', task.title)}
              disabled={isCancelling}
              activeOpacity={0.85}>
              {isCancelling ? <ActivityIndicator size="small" color={COLORS.error} /> : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                  <Text style={styles.btnTextDanger}>Huỷ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {task.status === 'in_progress' && (
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]}
              onPress={() => navigation.navigate('Candidates', { taskId: task.id, taskTitle: task.title })}
              activeOpacity={0.85}>
              <Ionicons name="people-outline" size={16} color={COLORS.primary} />
              <Text style={styles.btnTextSecondary}>Xem người làm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSuccess]}
              onPress={() => handleStatusChange(task.id, 'completed', task.title)}
              disabled={isCompleting}
              activeOpacity={0.85}>
              {isCompleting ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.btnTextPrimary}>Hoàn thành</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Setup payment button — chỉ hiện cho in_progress chưa có payment */}
        {task.status === 'in_progress' && (
          <TouchableOpacity style={styles.paymentBtn} onPress={() => handleSetupPayment(task)} activeOpacity={0.85}>
            <Ionicons name="wallet-outline" size={14} color={COLORS.primary} />
            <Text style={styles.paymentBtnText}>Thiết lập thanh toán (MoMo/Tiền mặt)</Text>
          </TouchableOpacity>
        )}

        {/* Live tracking button — chỉ hiện cho in_progress */}
        {task.status === 'in_progress' && (
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={async () => {
              try {
                const res = await checkConsent(task.id);
                const consent = res.data?.consent?.consent || res.data?.consent;
                if (res.data?.has_consent && consent === 'granted') {
                  navigation.navigate('LiveTracking', {
                    taskId: task.id,
                    taskTitle: task.title,
                    taskLatitude: task.latitude,
                    taskLongitude: task.longitude,
                  });
                } else if (res.data?.has_consent && consent === 'revoked') {
                  Alert.alert('⚠️ Đã dừng', 'Carepartner đã dừng chia sẻ vị trí. Vui lòng liên hệ trực tiếp.');
                } else {
                  Alert.alert(
                    'Chưa có vị trí',
                    'Carepartner chưa đồng ý chia sẻ vị trí cho việc này.',
                  );
                }
              } catch (e) {
                Alert.alert('Lỗi', 'Không thể kiểm tra trạng thái theo dõi. Vui lòng thử lại.');
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="location" size={16} color="#fff" />
            <Text style={styles.trackBtnText}>Theo dõi vị trí Carepartner</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </TouchableOpacity>
        )}

        {task.status === 'completed' && (
          <TouchableOpacity style={[styles.btn, styles.btnSuccess]}
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
            }}
            activeOpacity={0.85}>
            <Ionicons name="star-outline" size={16} color="#fff" />
            <Text style={styles.btnTextPrimary}>Đánh giá Carepartner</Text>
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
        <View style={styles.headerRight}>
          <NotificationBell color={COLORS.textPrimary} />
          <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} style={styles.addBtn}>
            <Ionicons name="add" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
  headerRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
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
  badgeText: { ...TYPO.caption, fontWeight: '700' },
  price: { ...TYPO.h4, fontWeight: '900', color: COLORS.primary },
  title: { ...TYPO.h4, color: COLORS.textPrimary },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  metaText: { ...TYPO.bodySmall, color: COLORS.textSecondary, flex: 1 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: SIZES.xs },
  btn: {
    flex: 1, height: 44, borderRadius: SIZES.radiusSm,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    ...SHADOWS.small,
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnSecondary: { backgroundColor: COLORS.primaryLight },
  btnSuccess: { backgroundColor: COLORS.success },
  btnDangerOutline: { backgroundColor: COLORS.errorBg, borderWidth: 1, borderColor: '#fecaca' },
  btnTextPrimary: { color: '#fff', ...TYPO.buttonSmall },
  btnTextSecondary: { color: COLORS.primary, ...TYPO.buttonSmall, fontWeight: '700' },
  btnTextDanger: { color: COLORS.error, ...TYPO.buttonSmall, fontWeight: '700' },
  paymentBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: SIZES.radiusXs,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primarySoft,
    marginTop: 6,
  },
  paymentBtnText: { ...TYPO.caption, color: COLORS.primary, fontWeight: '600' },
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.primary,
    marginTop: 6,
    ...SHADOWS.large,
  },
  trackBtnText: { color: '#fff', ...TYPO.buttonSmall, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 4, ...SHADOWS.small },
  emptyTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  emptyText: { ...TYPO.bodySmall, color: COLORS.textMuted },
});
